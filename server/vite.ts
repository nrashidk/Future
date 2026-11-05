/**
 * DEVELOPMENT ONLY. Everything this file imports -- vite, @vitejs/plugin-react
 * (through ../vite.config) -- is a devDependency, so this module must never be
 * reachable from a static import chain rooted at server/index.ts. It is loaded
 * with a dynamic import inside index.ts's development branch; see
 * server/serveStatic.ts for the history and why that matters.
 *
 * log() and serveStatic() moved to server/serveStatic.ts, which imports nothing
 * outside the production dependency set.
 */
import { type Express } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";

const viteLogger = createLogger();

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        // Was nanoid(), which was imported here but never declared in
        // package.json -- it resolved only as somebody else's transitive
        // dependency. This is a dev cache-buster, so Node's own crypto does
        // the job and the undeclared dependency goes away entirely.
        `src="/src/main.tsx?v=${crypto.randomUUID()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
