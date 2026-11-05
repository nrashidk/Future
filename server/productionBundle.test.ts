import { describe, it, expect } from "vitest";
import { build } from "esbuild";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Guards the production bundle against importing anything that is not a
 * production dependency.
 *
 * The bug this exists for: server/index.ts statically imported ./vite, which
 * imports `vite`, `@vitejs/plugin-react` (through ../vite.config) and `nanoid`
 * at its top level. The build bundles with --packages=external, so all four
 * survived into dist/index.js as top-level ESM imports -- resolved by Node at
 * BOOT, not when setupVite was finally called in the development branch.
 *
 * Three of them are devDependencies and nanoid was never declared at all. The
 * server started only because the deploy installed devDependencies; a normal
 * `npm ci --omit=dev` would have thrown ERR_MODULE_NOT_FOUND before serving a
 * single request. Nothing in dev, in tsc, or in the test suite could see it:
 * dev never runs the bundle, and the bundle builds perfectly either way.
 *
 * The fix is easy to undo by accident -- someone "tidying" the opaque
 * specifier in index.ts back into a plain `await import("./vite")` is enough,
 * because esbuild follows an analyzable dynamic import and inlines it. So the
 * assertion is made against the built artifact, not the source.
 */
describe("production bundle", () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../package.json"), "utf-8"));
  const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}));
  const devDeps = new Set(Object.keys(pkg.devDependencies ?? {}));

  async function bundleImports(): Promise<string[]> {
    const result = await build({
      entryPoints: [resolve(__dirname, "index.ts")],
      platform: "node",
      packages: "external",
      bundle: true,
      format: "esm",
      write: false,
      logLevel: "silent",
    });
    const code = result.outputFiles[0].text;
    // Top-level bare imports only: relative paths are inlined by the bundler,
    // and `import(...)` expressions are not resolved at boot.
    const specifiers = new Set<string>();
    for (const m of code.matchAll(/^import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["'];?$/gm)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      // node:fs and fs are both built-ins; scoped packages keep two segments.
      const pkgName = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      specifiers.add(pkgName);
    }
    return [...specifiers];
  }

  it("imports no devDependency at the top level", async () => {
    const offenders = (await bundleImports()).filter((s) => devDeps.has(s));
    expect(offenders, `dist/index.js imports devDependencies at boot: ${offenders.join(", ")}`).toEqual([]);
  }, 60_000);

  it("imports nothing that package.json does not declare", async () => {
    const builtins = new Set([
      ...require("module").builtinModules as string[],
    ]);
    const undeclared = (await bundleImports()).filter(
      (s) => !prodDeps.has(s) && !devDeps.has(s) && !builtins.has(s) && !s.startsWith("node:"),
    );
    expect(undeclared, `dist/index.js imports undeclared packages: ${undeclared.join(", ")}`).toEqual([]);
  }, 60_000);
});
