import { describe, it, expect } from "vitest";
import { isChunkLoadError, shouldReloadForChunkError, CHUNK_RELOAD_WINDOW_MS } from "./lazyPage";

const gone = new TypeError("Failed to fetch dynamically imported module: https://futurepath.ae/assets/Results-Bnw-KRIP.js");

describe("a page file removed by a deploy", () => {
  it("recognises the error production actually threw", () => {
    expect(isChunkLoadError(gone)).toBe(true);
  });
  it("recognises Safari's wording for the same thing", () => {
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
  });
  it("does not mistake an ordinary crash for one", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });
  it("reloads the first time", () => {
    expect(shouldReloadForChunkError(gone, null, 1_000_000)).toBe(true);
  });
  it("does NOT reload again straight after a reload — that is a loop", () => {
    expect(shouldReloadForChunkError(gone, 1_000_000, 1_000_000 + 5_000)).toBe(false);
  });
  it("reloads again once the window has passed (a second deploy, later)", () => {
    expect(shouldReloadForChunkError(gone, 1_000_000, 1_000_000 + CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
  });
  it("never reloads for an ordinary crash", () => {
    expect(shouldReloadForChunkError(new Error("boom"), null, 1)).toBe(false);
  });
});
