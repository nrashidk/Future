import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * The production half of what used to live entirely in server/vite.ts.
 *
 * It was split out because server/index.ts imports this module eagerly, and
 * server/vite.ts imports `vite`, `@vitejs/plugin-react` (via ../vite.config)
 * and `nanoid` at its top level. esbuild bundles with --packages=external, so
 * those four imports survived into dist/index.js as top-level ESM imports and
 * were resolved by Node at production BOOT -- not when setupVite is called.
 *
 * Three of those packages are devDependencies and one (nanoid) was never
 * declared at all. Production therefore started only because the deploy
 * installed devDependencies; `npm ci --omit=dev`, the ordinary production
 * install, would have crashed the server on startup with ERR_MODULE_NOT_FOUND
 * before a single request was served.
 *
 * Nothing here may import a devDependency. setupVite stays in server/vite.ts
 * and is now loaded with a dynamic import inside the development branch, so
 * the dev-only dependency graph is reachable only in development.
 */

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
