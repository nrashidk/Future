import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { pipeline } from "stream/promises";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { isAdmin, getSuperadminEmails } from "../middleware/auth.middleware";
import * as fileStorage from "../services/fileStorage";

// Every route in this module now reads and writes DigitalOcean Spaces. The old
// uploads/private directory is no longer referenced here at all — object keys
// are validated by the storage service, which replaces the previous
// resolve()/startsWith() path-traversal guards.

// Configure multer for file uploads. memoryStorage: the upload never touches
// local disk, it goes straight from the request buffer to object storage. Files
// are capped at 50MB below, which is also the per-upload memory ceiling.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow CSV, JSON, PDF, Excel files
    const allowedTypes = [
      'text/csv',
      'application/json',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'text/plain',
    ];
    
    // Additional file extension check to prevent bypassing MIME type validation
    const allowedExtensions = ['.csv', '.json', '.pdf', '.xls', '.xlsx', '.zip', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Allowed types: CSV, JSON, PDF, Excel, ZIP, TXT`));
    }
  },
});

/**
 * Check if user is superadmin
 */
const isSuperadmin = async (req: any): Promise<boolean> => {
  if (!req.user) return false;
  
  const userId = req.user.userId;
  const user = await storage.getUser(userId);
  
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (
    (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
    user.role === "superadmin"
  );
};

/**
 * Check if user is org admin
 */
const isOrgAdmin = async (req: any): Promise<boolean> => {
  if (!req.user) return false;
  
  const userId = req.user.userId;
  const user = await storage.getUser(userId);
  
  return user?.accountType === "org_admin";
};

export function registerFilesRoutes(app: Express) {
  // Upload a file (superadmin only - using centralized middleware)
  app.post("/api/files/upload", isAuthenticated, isAdmin, upload.single("file"), async (req: any, res: Response) => {
    try {
      const userId = req.user.userId;
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      const { fileType, category, description, organizationId } = req.body;

      if (!fileType) {
        // Nothing to clean up: the upload is still only an in-memory buffer and
        // nothing has been written to object storage yet.
        return res.status(400).json({ message: "File type is required" });
      }

      // Write the object BEFORE inserting the row, so a failed upload can never
      // leave a files row pointing at an object that was never stored.
      const key = fileStorage.generateKey("private", req.file.originalname);
      await fileStorage.put(key, req.file.buffer, {
        contentType: req.file.mimetype,
        size: req.file.size,
        public: false,
      });

      let file;
      try {
        // Create file record in database
        file = await storage.createFile({
          filename: path.posix.basename(key),
          originalFilename: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          // filePath now holds the OBJECT KEY (private/<uuid><ext>), not a disk path.
          filePath: key,
          fileType,
          category: category || null,
          description: description || null,
          uploadedBy: userId,
          organizationId: organizationId || null,
          isPublic: false,
        });
      } catch (dbError) {
        // The object is now unreferenced — no row will ever name this key, so
        // nothing could find or delete it again. Remove it rather than leave
        // minors' data in the bucket with no record that it exists.
        await fileStorage.remove(key).catch((cleanupError) => {
          console.error("Orphaned object left in Spaces after failed insert:", key, cleanupError);
        });
        throw dbError;
      }

      res.status(201).json(file);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });
  
  // List files (superadmin sees all, org_admin sees organization files only)
  app.get("/api/files", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.userId;
      const isSuperadminUser = await isSuperadmin(req);
      const isOrgAdminUser = await isOrgAdmin(req);
      
      let files;
      
      if (isSuperadminUser) {
        // Superadmin sees all files
        files = await storage.getAllFiles();
      } else if (isOrgAdminUser) {
        // Org admin sees only their organization's files
        const organization = await storage.getOrganizationByAdminUserId(userId);
        if (!organization) {
          return res.json([]);
        }
        files = await storage.getFilesByOrganization(organization.id);
      } else {
        // Regular users see only their own uploaded files
        files = await storage.getFilesByUploader(userId);
      }
      
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ message: "Failed to fetch files" });
    }
  });
  
  // Get file details
  app.get("/api/files/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.userId;
      const isSuperadminUser = await isSuperadmin(req);
      
      const file = await storage.getFileById(req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check access permissions
      if (!isSuperadminUser && file.uploadedBy !== userId) {
        // Check if user is in the same organization
        if (file.organizationId) {
          const member = await storage.getOrganizationMemberByUserId(userId);
          if (!member || member.organizationId !== file.organizationId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      res.json(file);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ message: "Failed to fetch file" });
    }
  });
  
  // Download file
  app.get("/api/files/:id/download", isAuthenticated, async (req: any, res: Response) => {
    let object: Awaited<ReturnType<typeof fileStorage.getStream>> | undefined;
    try {
      const userId = req.user.userId;
      const isSuperadminUser = await isSuperadmin(req);
      
      const file = await storage.getFileById(req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Check access permissions
      if (!isSuperadminUser && file.uploadedBy !== userId) {
        if (file.organizationId) {
          const member = await storage.getOrganizationMemberByUserId(userId);
          if (!member || member.organizationId !== file.organizationId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      
      // Defense in depth. fileStorage rejects absolute paths, traversal and any
      // unknown prefix on its own; this asserts the stronger property that an
      // authenticated private download can only ever read a private object.
      if (!file.filePath.startsWith("private/")) {
        console.error(`Refusing to serve file ${file.id}: filePath is not a private object key`);
        return res.status(403).json({ message: "Access denied" });
      }

      try {
        object = await fileStorage.getStream(file.filePath);
      } catch (err: any) {
        if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
          // Row survives but the object is gone — report it as missing rather
          // than as a server fault.
          return res.status(404).json({ message: "File not found" });
        }
        throw err;
      }

      // Counted only once the object is known to exist, so a failed download no
      // longer inflates the count.
      await storage.incrementDownloadCount(file.id);

      // res.attachment() builds the Content-Disposition header through Express's
      // content-disposition encoder, which escapes quotes and encodes non-ASCII
      // names — originalFilename is user-supplied and must never be interpolated
      // into a header by hand.
      res.attachment(file.originalFilename);
      res.setHeader("Content-Type", file.mimeType);
      if (object.contentLength !== undefined) {
        res.setHeader("Content-Length", String(object.contentLength));
      }

      await pipeline(object.stream, res);
    } catch (error) {
      // pipeline() rejects with ERR_STREAM_PREMATURE_CLOSE even when the entire
      // body reached the client. Serving an S3 body, the response emits 'close'
      // before 'finish', so end-of-stream calls it premature and then destroys
      // both streams — which is why, by the time this runs, none of the
      // response-side flags can tell success from failure: measured against
      // real Spaces on a verified-correct 200, writableFinished, writableEnded
      // were both false and destroyed was already true.
      //
      // The SOURCE stream is the honest signal. readableEnded is true only if
      // the S3 body emitted 'end' — every byte read and handed to the response.
      // A client disconnect or a mid-transfer storage failure leaves it false.
      if (object?.stream?.readableEnded) {
        return;
      }

      console.error("Error downloading file:", error);
      if (res.headersSent) {
        // Genuine mid-stream failure or client disconnect: the status line is
        // already on the wire, so the only honest signal left is to break the
        // connection.
        res.destroy();
        return;
      }
      res.status(500).json({ message: "Failed to download file" });
    }
  });
  
  // Download file via share token (no authentication required, one-time use)
  app.get("/api/files/shared/:token", async (req: Request, res: Response) => {
    let object: Awaited<ReturnType<typeof fileStorage.getStream>> | undefined;
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      
      if (!file) {
        return res.status(404).json({ message: "File not found or share link expired" });
      }
      
      // Defense in depth — this route is unauthenticated, so a share token must
      // never be able to reach anything but a private object.
      if (!file.filePath.startsWith("private/")) {
        console.error(`Refusing to serve shared file ${file.id}: filePath is not a private object key`);
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch the object BEFORE spending the token. The previous order counted
      // the download and invalidated the token first, so any failure to read
      // the file burned a valid one-time link and returned an error — the user
      // lost their single use and got nothing.
      try {
        object = await fileStorage.getStream(file.filePath);
      } catch (err: any) {
        if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
          return res.status(404).json({ message: "File not found or share link expired" });
        }
        // Transient storage failure: leave the token intact so the recipient
        // can retry.
        throw err;
      }

      // The object exists and is readable, so the use is now real. Spend the
      // token here rather than after the transfer completes: a token that stays
      // live until the last byte could be replayed concurrently, and one-time
      // use is a security control, not a convenience.
      await storage.incrementDownloadCount(file.id);

      // Invalidate share token after use (one-time download)
      // This prevents indefinite access via leaked URLs
      await storage.invalidateShareToken(file.id);

      res.attachment(file.originalFilename);
      res.setHeader("Content-Type", file.mimeType);
      if (object.contentLength !== undefined) {
        res.setHeader("Content-Length", String(object.contentLength));
      }

      await pipeline(object.stream, res);
    } catch (error) {
      // Same spurious ERR_STREAM_PREMATURE_CLOSE as the authenticated download
      // above — see the comment there for why the source stream, not the
      // response, is what tells success from failure. A body that reached the
      // client is a success: the recipient got the file, and the one-time token
      // spent above was spent correctly.
      if (object?.stream?.readableEnded) {
        return;
      }

      console.error("Error downloading shared file:", error);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.status(500).json({ message: "Failed to download file" });
    }
  });
  
  // Generate share link (superadmin or file owner)
  app.post("/api/files/:id/share", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.userId;
      const isSuperadminUser = await isSuperadmin(req);
      
      const file = await storage.getFileById(req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Only superadmin or file owner can generate share links
      if (!isSuperadminUser && file.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { expiryHours } = req.body;
      const { shareToken, expiry } = await storage.generateShareToken(
        file.id,
        expiryHours || 72
      );
      
      const shareUrl = `${req.protocol}://${req.get('host')}/api/files/shared/${shareToken}`;
      
      res.json({
        shareToken,
        shareUrl,
        expiry,
      });
    } catch (error) {
      console.error("Error generating share link:", error);
      res.status(500).json({ message: "Failed to generate share link" });
    }
  });
  
  // Delete file (superadmin or file owner)
  app.delete("/api/files/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.userId;
      const isSuperadminUser = await isSuperadmin(req);
      
      const file = await storage.getFileById(req.params.id);
      
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      
      // Only superadmin or file owner can delete
      if (!isSuperadminUser && file.uploadedBy !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Object first, then the row — the two failure modes are not symmetric.
      // A row with no object announces itself: the download 404s and an admin
      // can retry the delete. An object with no row is invisible — nothing in
      // the database names its key, so it can never be found or removed again,
      // and it holds minors' data. So the row is dropped only once the object
      // is confirmed gone. DeleteObject is idempotent, so deleting a key that
      // is already absent still succeeds.
      try {
        await fileStorage.remove(file.filePath);
      } catch (err) {
        console.error(
          "Failed to delete object from Spaces; keeping the database row so the delete can be retried:",
          file.filePath,
          err,
        );
        return res.status(500).json({ message: "Failed to delete file from storage" });
      }

      const deleted = await storage.deleteFile(file.id);

      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete file from database" });
      }

      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });
}

