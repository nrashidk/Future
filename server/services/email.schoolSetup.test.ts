/**
 * THE ONE EMAIL A GROUP BUYER EVER GETS.
 *
 * Before it existed, the generated credentials were rendered once on the
 * checkout success screen and sent nowhere, so a closed tab — or a webhook
 * completing the purchase while the browser never came back — left a paying
 * customer with an account they could not enter. That happened on 2026-11-09.
 *
 * These are pure builder tests. The SEND path needs Resend and a network, so
 * it cannot run here (the same limitation `llm-gate` records for the Anthropic
 * happy path); what is testable is what the message CONTAINS, which is where
 * the defects would be.
 */
import { describe, it, expect } from "vitest";
import { buildSchoolSetupHtmlEmail } from "./email";

const base = {
  setupUrl: "https://futurepath.ae/school/setup/abc123",
  userName: "Ali",
  username: "ali.mohammed.dae3",
  organizationName: "UAE Skool",
  licenseCount: 100,
  amountLabel: "AED 3,600.00",
  language: "en",
};

describe("buildSchoolSetupHtmlEmail", () => {
  it("carries the receipt, because this is the only message the buyer gets", () => {
    const html = buildSchoolSetupHtmlEmail(base);
    expect(html).toContain("UAE Skool");
    expect(html).toContain("100");
    expect(html).toContain("AED 3,600.00");
    expect(html).toContain("ali.mohammed.dae3");
    expect(html).toContain("https://futurepath.ae/school/setup/abc123");
  });

  it("ESCAPES the school name, which the buyer types at checkout", () => {
    // The organisation name is the one value in this message nobody on our
    // side chose. Unescaped, markup in it renders in the recipient's client.
    const html = buildSchoolSetupHtmlEmail({
      ...base,
      organizationName: '<img src=x onerror="alert(1)">School & Co',
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(html).toContain("School &amp; Co");
  });

  it("omits the amount row entirely when there is no amount", () => {
    // A school granted by a superadmin without a recorded amount must not show
    // a blank or zero "Paid" line — the licence model is explicit that a grant
    // with no amount is a comp, not a sale of nothing.
    const html = buildSchoolSetupHtmlEmail({ ...base, amountLabel: null });
    expect(html).not.toContain("Paid");
    expect(html).toContain("Student licences");
  });

  it("builds an Arabic message with no English body copy left in it", () => {
    const html = buildSchoolSetupHtmlEmail({ ...base, language: "ar" });
    expect(html).toContain("مدرستك جاهزة");
    expect(html).toContain("تعيين كلمة المرور");
    // The school name and sign-in name stay as typed — they are proper nouns,
    // not copy — but no English sentence should survive.
    expect(html).not.toContain("Thank you for your purchase");
    expect(html).not.toContain("Set your password");
  });

  it("states seven days, not one hour — it is not the reset email", () => {
    // Two links to futurepath.ae about passwords can arrive in one inbox. The
    // one that expires in an hour is not the one a buyer wants a week later,
    // and quoting the wrong lifetime is how a live link gets thrown away.
    const html = buildSchoolSetupHtmlEmail(base);
    expect(html).toContain("seven days");
    expect(html).not.toContain("one hour");
  });
});
