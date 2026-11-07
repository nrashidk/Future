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

  /**
   * THE BUNDLE MUST ACTUALLY START. The two assertions above inspect the
   * bundle's import list; this one runs it.
   *
   * That distinction is not academic. A JSON import inside a dependency --
   * `import en from "i18n-iso-countries/langs/en.json"` -- satisfies both
   * tests above: the package IS a declared production dependency, so nothing
   * about the import list is wrong. It still took production down, because
   * esbuild leaves it as a bare ESM import and Node refuses any ESM JSON
   * import without `with { type: "json" }`:
   *
   *   ERR_IMPORT_ATTRIBUTE_MISSING: Module ".../langs/en.json" needs an
   *   import attribute of "type: json"
   *
   * tsc passed, the build passed, every suite passed, and the server crashed
   * at boot on Render. The only thing that could have caught it is starting
   * the bundle, which nothing did.
   *
   * HOW IT PASSES WITHOUT A DATABASE: server/db.ts throws on a missing
   * DATABASE_URL, which is itself proof that module loading completed -- that
   * error comes from running code, not from resolving imports. So reaching it
   * is success here, and any module-resolution error is failure. Deliberately
   * not given a DATABASE_URL: this test is about whether the process can
   * start, not about what it does next.
   */
  it("starts far enough to reach its own config check", async () => {
    const { spawn } = await import("child_process");
    const dist = resolve(__dirname, "../dist/index.js");

    const output = await new Promise<string>((resolveOut) => {
      const proc = spawn(process.execPath, [dist], {
        env: { ...process.env, DATABASE_URL: "", NODE_ENV: "production", PORT: "0" },
      });
      let buf = "";
      proc.stdout.on("data", (d) => { buf += d; });
      proc.stderr.on("data", (d) => { buf += d; });
      const done = () => { try { proc.kill(); } catch {} resolveOut(buf); };
      proc.on("exit", done);
      setTimeout(done, 15_000);
    });

    // Anything the MODULE LOADER raises -- a missing attribute, an
    // unresolvable package -- means the server could never have served a
    // request.
    const loaderFailure = output.match(
      /ERR_IMPORT_ATTRIBUTE_MISSING|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|Cannot find package|Cannot find module/,
    );
    expect(
      loaderFailure?.[0],
      `dist/index.js fails during module loading:\n${output.slice(0, 1200)}`,
    ).toBeUndefined();
  }, 90_000);
});
