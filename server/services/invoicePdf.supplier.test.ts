/**
 * THE SUPPLIER'S LEGAL NAME IS NEVER INVENTED.
 *
 * `supplierFromEnv` used to fall back to a company name hardcoded from a
 * draft trade licence. An invoice names who is owed the money, so a name that
 * has not been issued must not appear on one, and an invoice missing it must
 * not be emailed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("puppeteer", () => ({ default: {} }));
const { supplierFromEnv, supplierDetailsMissing } = await import("./invoicePdf");

const KEYS = ["INVOICE_LEGAL_NAME", "INVOICE_LEGAL_NAME_AR", "INVOICE_ADDRESS", "INVOICE_ADDRESS_AR",
  "INVOICE_BANK_NAME", "INVOICE_BANK_ACCOUNT_NAME", "INVOICE_IBAN", "INVOICE_SWIFT"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const set = (o: Record<string, string | undefined>) => { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))); };
const FULL = { INVOICE_LEGAL_NAME: "Example Co LLC", INVOICE_LEGAL_NAME_AR: "شركة المثال", INVOICE_ADDRESS: "1 Street",
  INVOICE_ADDRESS_AR: "شارع ١", INVOICE_BANK_NAME: "Bank", INVOICE_BANK_ACCOUNT_NAME: "Example Co", INVOICE_IBAN: "AE00", INVOICE_SWIFT: "TESTAEAA" };

describe("supplierFromEnv", () => {
  it("has no legal name when none is set, in either language", () => {
    set({});
    expect(supplierFromEnv("en").legalName).toBeNull();
    expect(supplierFromEnv("ar").legalName).toBeNull();
  });
  it("treats a blank value as unset", () => {
    set({ INVOICE_LEGAL_NAME: "   " });
    expect(supplierFromEnv("en").legalName).toBeNull();
  });
  it("uses the name that was set, and does not lend the English one to Arabic", () => {
    set({ INVOICE_LEGAL_NAME: "Example Co LLC" });
    expect(supplierFromEnv("en").legalName).toBe("Example Co LLC");
    expect(supplierFromEnv("ar").legalName).toBeNull();
  });
});

describe("supplierDetailsMissing", () => {
  it("reports nothing when everything is set", () => {
    set(FULL);
    expect(supplierDetailsMissing(supplierFromEnv("en"))).toEqual([]);
    expect(supplierDetailsMissing(supplierFromEnv("ar"))).toEqual([]);
  });
  it("reports the legal name when it alone is missing -- the send route refuses on this", () => {
    set({ ...FULL, INVOICE_LEGAL_NAME: undefined });
    expect(supplierDetailsMissing(supplierFromEnv("en"))).toEqual(["legalName"]);
  });
  it("reports every missing payment detail", () => {
    set({});
    expect(supplierDetailsMissing(supplierFromEnv("en")).sort())
      .toEqual(["address", "bankAccountName", "bankName", "iban", "legalName", "swift"]);
  });
});
