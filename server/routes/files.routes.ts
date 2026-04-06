import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { isAdmin } from "../middleware/auth.middleware";

// Create uploads directory if it doesn't exist
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext);
      cb(null, `${basename}-${uniqueSuffix}${ext}`);
    },
  }),
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
  
  const superadminEmails = (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);
  
  return (
    (!req.user.isLocal && user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: "File type is required" });
      }
      
      // Create file record in database
      const file = await storage.createFile({
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        filePath: req.file.path,
        fileType,
        category: category || null,
        description: description || null,
        uploadedBy: userId,
        organizationId: organizationId || null,
        isPublic: false,
      });
      
      res.status(201).json(file);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      // Clean up file if database operation failed
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
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
      
      // Increment download count
      await storage.incrementDownloadCount(file.id);
      
      // Path traversal protection — ensure resolved path stays within uploads directory
      const resolvedPath = path.resolve(file.filePath);
      const uploadsDir = path.resolve(UPLOADS_DIR);
      if (!resolvedPath.startsWith(uploadsDir + path.sep)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Send file
      res.download(resolvedPath, file.originalFilename);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file" });
    }
  });
  
  // Download file via share token (no authentication required, one-time use)
  app.get("/api/files/shared/:token", async (req: Request, res: Response) => {
    try {
      const file = await storage.getFileByShareToken(req.params.token);
      
      if (!file) {
        return res.status(404).json({ message: "File not found or share link expired" });
      }
      
      // Increment download count
      await storage.incrementDownloadCount(file.id);
      
      // Invalidate share token after use (one-time download)
      // This prevents indefinite access via leaked URLs
      await storage.invalidateShareToken(file.id);
      
      // Path traversal protection — ensure resolved path stays within uploads directory
      const resolvedPath = path.resolve(file.filePath);
      const uploadsDir = path.resolve(UPLOADS_DIR);
      if (!resolvedPath.startsWith(uploadsDir + path.sep)) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Send file
      res.download(resolvedPath, file.originalFilename);
    } catch (error) {
      console.error("Error downloading shared file:", error);
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
      
      // Delete from database first
      const deleted = await storage.deleteFile(file.id);
      
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete file from database" });
      }
      
      // Then delete file from filesystem
      try {
        await fs.unlink(file.filePath);
      } catch (err) {
        // Log error but don't fail the request - file already deleted from DB
        console.error("Error deleting file from filesystem:", err);
      }
      
      res.json({ success: true, message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file" });
    }
  });
}

