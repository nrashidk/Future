import { describe, it, expect } from "vitest";
import { buildInvoiceHtmlEmail, buildInvoiceTextEmail } from "./email";

/**
 * A PAID invoice's email must not ask for a transfer.
 *
 * Found on production 2026-11-14: FP-2026-0003, already paid, was emailed
 * saying "licences are added to the school's account once the transfer is
 * received" — to a finance inbox, that is a request to pay again.
 */
const args = {
  invoiceNumber: "FP-2026-0003",
  organizationName: "Test High School",
  amountLabel: "AED 40.00",
  dueLabel: "2026-11-20",
  licenseCount: 1,
  isProforma: true,
};

describe("the invoice email for a paid invoice", () => {
  it("says it is paid and gives no transfer instructions (English)", () => {
    const html = buildInvoiceHtmlEmail({ ...args, isPaid: true, language: "en" });
    const text = buildInvoiceTextEmail({ ...args, isPaid: true, language: "en" });
    for (const out of [html, text]) {
      expect(out).toContain("has been paid");
      expect(out).not.toContain("transfer reference");
      expect(out).not.toContain("Payment due");
    }
  });

  it("does the same in Arabic", () => {
    const html = buildInvoiceHtmlEmail({ ...args, isPaid: true, language: "ar" });
    const text = buildInvoiceTextEmail({ ...args, isPaid: true, language: "ar" });
    for (const out of [html, text]) {
      expect(out).toContain("تم سداد هذه الفاتورة");
      expect(out).not.toContain("كمرجع للتحويل");
      expect(out).not.toContain("تاريخ الاستحقاق");
    }
  });

  // THE CONTROL: an unpaid invoice must still tell the school how to pay.
  it("an unpaid invoice still carries the transfer instructions and due date", () => {
    for (const isPaid of [false, undefined]) {
      const html = buildInvoiceHtmlEmail({ ...args, isPaid, language: "en" });
      const text = buildInvoiceTextEmail({ ...args, isPaid, language: "en" });
      for (const out of [html, text]) {
        expect(out).not.toContain("has been paid");
        expect(out).toContain("transfer reference");
        expect(out).toContain("Payment due");
      }
    }
  });
});
