import { Resend } from "resend";
import { LOG_ONLY_MESSAGE_ID } from "@shared/emailDelivery";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Fallback sender. The previous default addressed futurepathways.com — a domain
// nobody owns — so an environment that forgot EMAIL_FROM sent every password
// reset and consent notice from an unownable address: no DKIM, no SPF alignment,
// bounced or spam-foldered, and silent either way. The fallback now addresses a
// domain we actually control, so a missing EMAIL_FROM degrades to a wrong
// display name rather than undeliverable mail.
//
// The display name is "Future Path" everywhere, including the consent
// attestation text that attestationTextHash pins. One name, no exceptions —
// a stored consent, the policy it cites and the sender address that delivered
// it should not name three different operators.
const FROM_EMAIL = process.env.EMAIL_FROM || "Future Path <noreply@futurepath.ae>";

// Reply-To. Nothing set one before, so a reply went to the From address — a
// noreply mailbox. Those replies currently reach a human only because the
// domain happens to carry a catch-all forwarding rule, which is a fact about
// DNS config rather than anything this code arranges, and would stop being
// true the moment someone tidied that rule away.
//
// Replies are a real path, not a hypothetical one: a guardian answering a
// consent notice and a student answering a password-reset mail are both
// people trying to reach a human about a minor's account. Naming the address
// here makes that behaviour intentional and independent of the catch-all.
const REPLY_TO_EMAIL = process.env.EMAIL_REPLY_TO || "support@futurepath.ae";

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Shared chrome for every outbound email, in the product's sticky-note style.
 *
 * Both HTML builders previously carried their own copy of the document head,
 * the masthead and the footer, which is why the Arabic brand name survived in
 * twelve places after a rename that reported itself finished. One layout, one
 * place to change.
 *
 * Values are taken from client/src/index.css rather than picked by eye:
 * --primary 260 65% 55% (#7342D7), --foreground 215 25% 18% (#222C39),
 * --muted-foreground 215 18% 35% (#495769) and the --sticky-* palette.
 *
 * Translated from client/src/components/StickyNote.tsx, which applies
 * `relative p-6 rounded-lg shadow-lg` plus a rotation and a --sticky-* colour,
 * and NO border. So: 24px padding, 8px radius, Tailwind's shadow-lg, and a
 * tilt — a flat bordered card with a large radius is a card, not a note, and
 * that is what a first attempt at this produced.
 *
 * The tilt is applied even though CSS transforms are unevenly supported
 * (Apple Mail and iOS render it; Gmail and the Word engine behind Outlook
 * drop it). Dropping it degrades to an upright note — which is exactly the
 * result of not attempting it — so refusing the tilt for everyone to spare
 * the clients that ignore it trades a better result for some readers against
 * no gain for anyone. The wrapper carries vertical padding so a rotated note
 * cannot clip against the cell above it.
 *
 * Layout is tables and inline styles because email clients require it.
 */
const PALETTE = {
  primary: "#7342D7",
  ink: "#222C39",
  muted: "#495769",
  page: "#F6F5FB",
  stickyYellow: "#FFF3C2",
  stickyBlue: "#E0F1FF",
  stickyPink: "#FFE5EE",
  // Tailwind shadow-lg, which is what lifts the note off the page.
  shadow: "0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)",
} as const;

type StickyColor = keyof Pick<typeof PALETTE, "stickyYellow" | "stickyBlue" | "stickyPink">;

function stickyLayout(opts: {
  language: string;
  title: string;
  heading: string;
  /** Inner HTML: paragraphs, a button, whatever the message needs. */
  body: string;
  color?: StickyColor;
}): string {
  const isAr = opts.language === "ar";
  const dir = isAr ? "rtl" : "ltr";
  const align = isAr ? "right" : "left";
  const font = isAr
    ? "'Cairo', 'Segoe UI', Arial, sans-serif"
    : "'Poppins', 'Segoe UI', Helvetica, Arial, sans-serif";
  const fontHref = isAr
    ? "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap"
    : "https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap";
  const note = PALETTE[opts.color ?? "stickyYellow"];
  const year = new Date().getFullYear();
  const brand = isAr ? "مسار المستقبل" : "Future Path";
  const rights = isAr ? "جميع الحقوق محفوظة." : "All rights reserved.";

  return `<!DOCTYPE html>
<html dir="${dir}" lang="${isAr ? "ar" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
  <link href="${fontHref}" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${PALETTE.page};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PALETTE.page};padding:32px 16px;">
    <tr>
      <td align="center" style="text-align:center;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width:560px;margin:0 auto;">
          <tr>
            <td align="${align}" style="padding:0 8px 20px;font-family:${font};font-size:20px;font-weight:700;color:${PALETTE.primary};" dir="${dir}">
              ${brand}
            </td>
          </tr>
          <tr>
            <td style="padding:10px 0 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="transform:rotate(-1.5deg);">
                <tr>
            <td style="background-color:${note};border-radius:8px;box-shadow:${PALETTE.shadow};padding:24px;" dir="${dir}">
              <h1 style="margin:0 0 16px;font-family:${font};font-size:22px;line-height:1.35;font-weight:700;color:${PALETTE.ink};text-align:${align};">
                ${opts.heading}
              </h1>
              <div style="font-family:${font};font-size:15px;line-height:1.7;color:${PALETTE.ink};text-align:${align};">
                ${opts.body}
              </div>
            </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="${align}" style="padding:4px 8px 0;font-family:${font};font-size:12px;line-height:1.6;color:${PALETTE.muted};" dir="${dir}">
              &copy; ${year} ${brand}. ${rights}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * The call to action, shaped as a small note rather than a pill.
 *
 * Landing.tsx uses StickyNote itself as an inline element for exactly this
 * kind of thing (`<StickyNote color="pink" rotation="1" className="inline-block
 * px-6 py-3">`), so a note-shaped action is the product's own vocabulary, not
 * an invention: 8px radius and shadow-lg, same as the card.
 *
 * It keeps the primary fill rather than taking a pastel --sticky-* colour. A
 * pale note with dark text reads as another piece of paper, and this is the
 * one element in the message that has to read as pressable.
 *
 * The tilt runs OPPOSITE to the card's (+2deg against its -1.5deg) so the two
 * are visibly separate notes rather than one shape with a misaligned child.
 * Where transforms are dropped, both land upright and the result is simply the
 * untilted version.
 */
/**
 * The school name is typed by the BUYER at checkout and interpolated into an
 * HTML email. Unescaped, a name containing markup would be rendered by the
 * recipient's mail client -- the organisation name is the one value in this
 * message that nobody on our side chose.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stickyButton(href: string, label: string, font: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;transform:rotate(2deg);">
    <tr><td style="background-color:${PALETTE.primary};border-radius:8px;box-shadow:${PALETTE.shadow};">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

function emailFont(language: string): string {
  return language === "ar"
    ? "'Cairo', 'Segoe UI', Arial, sans-serif"
    : "'Poppins', 'Segoe UI', Helvetica, Arial, sans-serif";
}

export function buildHtmlEmail(resetUrl: string, userName: string | undefined, language: string): string {
  const isAr = language === "ar";
  const font = emailFont(language);
  const greeting = userName
    ? (isAr ? `مرحباً ${userName}،` : `Hi ${userName},`)
    : (isAr ? "مرحباً،" : "Hi,");

  const body = isAr
    ? `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في مسار المستقبل. اضغط على الزر أدناه لإنشاء كلمة مرور جديدة:</p>
       ${stickyButton(resetUrl, "إعادة تعيين كلمة المرور", font)}
       <p style="margin:0 0 12px;">تنتهي صلاحية هذا الرابط خلال ساعة واحدة.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة؛ ولن تتغير كلمة المرور.</p>`
    : `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">We received a request to reset the password for your Future Path account. Use the button below to choose a new one:</p>
       ${stickyButton(resetUrl, "Reset my password", font)}
       <p style="margin:0 0 12px;">This link expires in one hour.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">If you didn't ask for this, you can ignore this email and your password stays as it is.</p>`;

  return stickyLayout({
    language,
    title: isAr ? "إعادة تعيين كلمة المرور" : "Reset Your Password",
    heading: isAr ? "إعادة تعيين كلمة المرور" : "Reset your password",
    body,
    color: "stickyBlue",
  });
}
function buildTextEmail(resetUrl: string, userName: string | undefined, language: string): string {
  const isAr = language === "ar";
  if (isAr) {
    const greeting = userName ? `مرحباً ${userName}،` : "مرحباً،";
    return `
إعادة تعيين كلمة المرور - مسار المستقبل

${greeting}

تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في مسار المستقبل.

انقر على هذا الرابط لإعادة تعيين كلمة مرورك:
${resetUrl}

ستنتهي صلاحية هذا الرابط خلال ساعة واحدة لأسباب أمنية.

إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني. ستظل كلمة مرورك دون تغيير.

© ${new Date().getFullYear()} مسار المستقبل. جميع الحقوق محفوظة.
    `.trim();
  }

  const greeting = userName ? `Hi ${userName},` : "Hi,";
  return `
Reset Your Password - Future Path

${greeting}

We received a request to reset your password for your Future Path account.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} Future Path. All rights reserved.
  `.trim();
}

/**
 * Spelled-out month, day-then-month order, in the reader's own language —
 * never a numeric slash format. This codebase has a specific, repeated
 * history of US month-first dates reaching students and parents by accident
 * (see the date-format fixes at the start of this repo's history); an email
 * about when a link stops working is exactly the kind of date a wrong
 * reading makes worse, not better.
 */
function formatRecoveryExpiry(expiresAt: Date, language: string): string {
  const locale = language === "ar" ? "ar" : "en-GB";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" }).format(expiresAt);
}

export function buildGuestRecoveryHtmlEmail(resultsUrl: string, expiresAt: Date, language: string): string {
  const isAr = language === "ar";
  const font = emailFont(language);
  const expiry = formatRecoveryExpiry(expiresAt, language);

  const body = isAr
    ? `<p style="margin:0 0 12px;">هذا هو رابط تقرير التقييم المهني الخاص بك:</p>
       ${stickyButton(resultsUrl, "افتح تقريري", font)}
       <p style="margin:0 0 12px;">يعمل هذا الرابط حتى ${expiry}. بعد ذلك لا يمكن استرجاع التقرير، لذا افتحه قريباً إذا رغبت في الاحتفاظ به.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p>`
    : `<p style="margin:0 0 12px;">Here's the link to your career assessment report:</p>
       ${stickyButton(resultsUrl, "Open my report", font)}
       <p style="margin:0 0 12px;">This link works until ${expiry}. After that the report can't be recovered, so open it again soon if you'd like to keep it.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">If you didn't request this, you can ignore this email.</p>`;

  return stickyLayout({
    language,
    title: isAr ? "رابط تقريرك" : "Your Report Link",
    heading: isAr ? "رابط تقريرك" : "Your report link",
    body,
    color: "stickyYellow",
  });
}
function buildGuestRecoveryTextEmail(resultsUrl: string, expiresAt: Date, language: string): string {
  const isAr = language === "ar";
  const expiry = formatRecoveryExpiry(expiresAt, language);

  if (isAr) {
    return `
رابط تقريرك - مسار المستقبل

هذا هو رابط تقرير التقييم المهني الذي أجريته:
${resultsUrl}

يعمل هذا الرابط حتى ${expiry}. بعد ذلك، لا يمكن استرجاع هذا التقرير، لذا افتحه مرة أخرى قريباً إذا كنت ترغب في الاحتفاظ به.

إذا لم تطلب هذا البريد، يمكنك تجاهله.

© ${new Date().getFullYear()} مسار المستقبل. جميع الحقوق محفوظة.
    `.trim();
  }

  return `
Your Report Link - Future Path

Here's the link to your career assessment report:
${resultsUrl}

This link works until ${expiry}. After that, this report can no longer be recovered, so open it again soon if you'd like to keep it.

If you didn't request this, you can ignore this email.

© ${new Date().getFullYear()} Future Path. All rights reserved.
  `.trim();
}

/**
 * Send a guest a link back to their own report — the whole point being that
 * NOTHING about the guest or their email is stored anywhere as a result of
 * this call. The link authorizes the read itself (a signed, assessment-
 * scoped token in the URL — mintGuestRecoveryToken, server/utils/printToken.ts),
 * not a cookie or a database row, so there is nothing here for this function
 * to persist and nothing to clean up later.
 *
 * @param to - the address the requester typed in, used once and not kept
 * @param resultsUrl - /results?assessmentId=...&recoveryToken=..., already built by the caller
 * @param expiresAt - the SAME instant the token itself expires
 *                     (shared/guestAssessmentExpiry.ts's guestAssessmentExpiresAt) —
 *                     stated in the email so the reader knows the link is not permanent,
 *                     not a separate promise this function could get out of sync with the token
 * @param language - "en" or "ar"
 */
export async function sendGuestReportRecoveryEmail(
  to: string,
  resultsUrl: string,
  expiresAt: Date,
  language = "en",
): Promise<EmailResult> {
  if (!resend) {
    if (!isLogOnlyMailEnvironment()) {
      console.error("[Email] RESEND_API_KEY is not configured. Guest report recovery email NOT sent to:", to);
      return { success: false, error: "Email service not configured. Please contact support." };
    }
    console.warn("[Email] Resend not configured. Recovery email would be sent to:", to);
    return { success: true, messageId: LOG_ONLY_MESSAGE_ID };
  }

  const isAr = language === "ar";
  const subject = isAr
    ? "رابط تقريرك - مسار المستقبل"
    : "Your Report Link - Future Path";

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      replyTo: REPLY_TO_EMAIL,
      subject,
      html: buildGuestRecoveryHtmlEmail(resultsUrl, expiresAt, language),
      text: buildGuestRecoveryTextEmail(resultsUrl, expiresAt, language),
    });

    if (error) {
      console.error("[Email] Failed to send guest report recovery email:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] Guest report recovery email sent successfully:", data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const error = err as Error;
    console.error("[Email] Error sending guest report recovery email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a password reset email with a secure reset link
 * @param to - recipient email address
 * @param resetToken - secure reset token
 * @param userName - optional display name for personalisation
 * @param language - "en" or "ar" — controls email direction and language
 */
/**
 * THE FIRST-SIGN-IN EMAIL for a school bought through group checkout.
 *
 * Carries the receipt as well as the link, because this is the only message
 * the buyer gets: before this existed, the generated credentials were rendered
 * once on the success screen and sent nowhere, so a closed tab left a paying
 * customer with an account they could not enter.
 *
 * Sticky YELLOW rather than the reset email's blue. Two different links to
 * futurepath.ae arriving in one inbox, both about passwords, is exactly the
 * pair a person mixes up — and the one that expires in an hour is not the one
 * they want a week after buying.
 */
export function buildSchoolSetupHtmlEmail(args: {
  setupUrl: string;
  userName?: string;
  username: string;
  organizationName: string;
  licenseCount: number;
  amountLabel: string | null;
  language: string;
}): string {
  const { setupUrl, userName, username, organizationName, licenseCount, amountLabel } = args;
  const isAr = args.language === "ar";
  const font = emailFont(args.language);
  const greeting = userName
    ? (isAr ? `مرحباً ${userName}،` : `Hello ${userName},`)
    : (isAr ? "مرحباً،" : "Hello,");

  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:6px 0;color:${PALETTE.muted};font-size:14px;">${label}</td>
       <td style="padding:6px 0;color:${PALETTE.ink};font-size:14px;font-weight:600;text-align:${isAr ? "left" : "right"};">${value}</td>
     </tr>`;

  const receipt = `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
      ${row(isAr ? "اسم المدرسة" : "School name", escapeHtml(organizationName))}
      ${row(isAr ? "تراخيص الطلاب" : "Student licences", String(licenseCount))}
      ${amountLabel ? row(isAr ? "المبلغ المدفوع" : "Paid", escapeHtml(amountLabel)) : ""}
      ${row(isAr ? "اسم الدخول" : "Your sign-in name", escapeHtml(username))}
    </table>`;

  const body = isAr
    ? `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">شكراً لشرائك. تم إنشاء <strong>${escapeHtml(organizationName)}</strong> وإضافة تراخيصك إليها. اختر كلمة مرور وأكمل عملية الإعداد.</p>
       ${receipt}
       ${stickyButton(setupUrl, "تعيين كلمة المرور", font)}
       <p style="margin:0 0 12px;">يعمل هذا الرابط مرة واحدة وتنتهي صلاحيته خلال سبعة أيام.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">إذا لم يعمل الزر، انسخ هذا العنوان في متصفحك:<br>${escapeHtml(setupUrl)}</p>`
    : `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">Thank you for your purchase. <strong>${escapeHtml(organizationName)}</strong> has been created and your licences are on it. Choose a password and complete the onboarding process.</p>
       ${receipt}
       ${stickyButton(setupUrl, "Set your password", font)}
       <p style="margin:0 0 12px;">This link works once and expires in seven days.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">If the button does not work, copy this address into your browser:<br>${escapeHtml(setupUrl)}</p>`;

  return stickyLayout({
    language: args.language,
    title: isAr ? "إعداد مدرستك" : "Set up your school",
    heading: isAr ? "مدرستك جاهزة" : "Your school is ready",
    body,
    color: "stickyYellow",
  });
}

function buildSchoolSetupTextEmail(args: {
  setupUrl: string;
  userName?: string;
  username: string;
  organizationName: string;
  licenseCount: number;
  amountLabel: string | null;
  language: string;
}): string {
  const { setupUrl, userName, username, organizationName, licenseCount, amountLabel } = args;
  if (args.language === "ar") {
    return [
      "مدرستك جاهزة - مسار المستقبل",
      "",
      userName ? `مرحباً ${userName}،` : "مرحباً،",
      "",
      `تم إنشاء ${organizationName} وإضافة تراخيصك إليها.`,
      "",
      `اسم المدرسة: ${organizationName}`,
      `تراخيص الطلاب: ${licenseCount}`,
      ...(amountLabel ? [`المبلغ المدفوع: ${amountLabel}`] : []),
      `اسم الدخول: ${username}`,
      "",
      "لتعيين كلمة المرور وإكمال الإعداد:",
      setupUrl,
      "",
      "يعمل هذا الرابط مرة واحدة وتنتهي صلاحيته خلال سبعة أيام.",
    ].join("\n");
  }
  return [
    "Your school is ready - Future Path",
    "",
    userName ? `Hello ${userName},` : "Hello,",
    "",
    `${organizationName} has been created and your licences are on it.`,
    "",
    `School name: ${organizationName}`,
    `Student licences: ${licenseCount}`,
    ...(amountLabel ? [`Paid: ${amountLabel}`] : []),
    `Your sign-in name: ${username}`,
    "",
    "To set your password and finish setup:",
    setupUrl,
    "",
    "This link works once and expires in seven days.",
  ].join("\n");
}

export async function sendSchoolSetupEmail(args: {
  to: string;
  token: string;
  userName?: string;
  username: string;
  organizationName: string;
  licenseCount: number;
  amountLabel?: string | null;
  language?: string;
}): Promise<EmailResult> {
  const language = args.language ?? "en";
  if (!resend) {
    if (!isLogOnlyMailEnvironment()) {
      // LOUD: the buyer has paid and cannot get in. Unlike a password reset,
      // nobody will request this again -- they do not know it was meant to
      // arrive.
      console.error(
        `[Email] RESEND_API_KEY is not configured. SCHOOL SETUP email NOT sent to ${args.to} ` +
        `for "${args.organizationName}" - this buyer has paid and has no way to sign in. Needs manual attention.`,
      );
      return { success: false, error: "Email service not configured." };
    }
    console.warn("[Email] Resend not configured. School setup email would be sent to:", args.to);
    return { success: true, messageId: LOG_ONLY_MESSAGE_ID };
  }

  const baseUrl = process.env.APP_URL || "https://futurepath.ae";
  // The token goes in the PATH, not a query string: a path segment is not
  // forwarded in a Referer header the way a query parameter is.
  const setupUrl = `${baseUrl}/school/setup/${args.token}`;

  const isAr = language === "ar";
  const subject = isAr
    ? `${args.organizationName} جاهزة - عيّن كلمة المرور`
    : `${args.organizationName} is ready - set your password`;

  const content = {
    setupUrl,
    userName: args.userName,
    username: args.username,
    organizationName: args.organizationName,
    licenseCount: args.licenseCount,
    amountLabel: args.amountLabel ?? null,
    language,
  };

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [args.to],
      replyTo: REPLY_TO_EMAIL,
      subject,
      html: buildSchoolSetupHtmlEmail(content),
      text: buildSchoolSetupTextEmail(content),
    });

    if (error) {
      console.error("[Email] Failed to send school setup email:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] School setup email sent:", data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const error = err as Error;
    console.error("[Email] Error sending school setup email:", error);
    return { success: false, error: error.message };
  }
}

export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string,
  language = "en"
): Promise<EmailResult> {
  if (!resend) {
    if (!isLogOnlyMailEnvironment()) {
      console.error("[Email] RESEND_API_KEY is not configured. Password reset email NOT sent to:", to);
      return { success: false, error: "Email service not configured. Please contact your administrator." };
    }
    console.warn("[Email] Resend not configured. Email would be sent to:", to);
    console.warn("[Email] Configure RESEND_API_KEY for actual email delivery");
    return { success: true, messageId: LOG_ONLY_MESSAGE_ID };
  }

  const baseUrl = process.env.APP_URL || "https://futurepath.ae";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  const isAr = language === "ar";
  const subject = isAr
    ? "إعادة تعيين كلمة المرور - مسار المستقبل"
    : "Reset Your Password - Future Path";

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      replyTo: REPLY_TO_EMAIL,
      subject,
      html: buildHtmlEmail(resetUrl, userName, language),
      text: buildTextEmail(resetUrl, userName, language),
    });

    if (error) {
      console.error("[Email] Failed to send password reset email:", error);
      return { success: false, error: error.message };
    }

    console.log("[Email] Password reset email sent successfully:", data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const error = err as Error;
    console.error("[Email] Error sending password reset email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * THE CONFIRMATION MAIL for an account a parent registered.
 *
 * Says what happens if the link is NOT used, with the figure: the account
 * and the child's details are deleted. A parent who never sees this mail
 * (a mistyped address) loses nothing they could have reached anyway; one who
 * sees it and ignores it has been told.
 */
export function buildEmailConfirmationHtml(confirmUrl: string, userName: string | undefined, language: string, hours: number): string {
  const isAr = language === "ar";
  const font = emailFont(language);
  const greeting = userName
    ? (isAr ? `مرحباً ${userName}،` : `Hi ${userName},`)
    : (isAr ? "مرحباً،" : "Hi,");
  const body = isAr
    ? `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">أُنشئ حساب طالب في مسار المستقبل باستخدام هذا البريد الإلكتروني. يُرجى تأكيد أن هذا العنوان لك:</p>
       ${stickyButton(confirmUrl, "تأكيد البريد الإلكتروني", font)}
       <p style="margin:0 0 12px;">إذا لم يُؤكَّد العنوان خلال <span dir="ltr">${hours}</span> ساعة، يُحذف الحساب وبيانات الطالب المسجّلة فيه.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">إذا لم تنشئ هذا الحساب، تجاهل هذه الرسالة وسيُحذف تلقائياً.</p>`
    : `<p style="margin:0 0 12px;">${greeting}</p>
       <p style="margin:0 0 12px;">A student account was created on Future Path with this email address. Please confirm the address is yours:</p>
       ${stickyButton(confirmUrl, "Confirm my email", font)}
       <p style="margin:0 0 12px;">If it is not confirmed within ${hours} hours, the account and the student details in it are deleted.</p>
       <p style="margin:0;color:${PALETTE.muted};font-size:13px;">If you did not create this account, ignore this email and it will be deleted automatically.</p>`;
  return stickyLayout({
    language,
    title: isAr ? "تأكيد البريد الإلكتروني" : "Confirm Your Email",
    heading: isAr ? "تأكيد البريد الإلكتروني" : "Confirm your email",
    body,
    color: "stickyBlue",
  });
}

export function buildEmailConfirmationText(confirmUrl: string, userName: string | undefined, language: string, hours: number): string {
  if (language === "ar") {
    return `
تأكيد البريد الإلكتروني - مسار المستقبل

${userName ? `مرحباً ${userName}،` : "مرحباً،"}

أُنشئ حساب طالب في مسار المستقبل باستخدام هذا البريد الإلكتروني. يُرجى تأكيد أن هذا العنوان لك:
${confirmUrl}

إذا لم يُؤكَّد العنوان خلال ${hours} ساعة، يُحذف الحساب وبيانات الطالب المسجّلة فيه.

إذا لم تنشئ هذا الحساب، تجاهل هذه الرسالة وسيُحذف تلقائياً.
    `.trim();
  }
  return `
Confirm Your Email - Future Path

${userName ? `Hi ${userName},` : "Hi,"}

A student account was created on Future Path with this email address. Please confirm the address is yours:
${confirmUrl}

If it is not confirmed within ${hours} hours, the account and the student details in it are deleted.

If you did not create this account, ignore this email and it will be deleted automatically.
  `.trim();
}

export async function sendEmailConfirmationEmail(
  to: string,
  token: string,
  userName: string | undefined,
  language: string,
  hours: number,
): Promise<EmailResult> {
  const baseUrl = process.env.APP_URL || "https://futurepath.ae";
  const confirmUrl = `${baseUrl}/confirm-email/${token}`;

  if (!resend) {
    if (!isLogOnlyMailEnvironment()) {
      console.error("[Email] RESEND_API_KEY is not configured. Confirmation email NOT sent.");
      return { success: false, error: "Email service not configured." };
    }
    console.warn("[Email] Resend not configured. Confirmation email would be sent.");
    return { success: true, messageId: LOG_ONLY_MESSAGE_ID };
  }

  const subject = language === "ar"
    ? "تأكيد البريد الإلكتروني - مسار المستقبل"
    : "Confirm Your Email - Future Path";
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      replyTo: REPLY_TO_EMAIL,
      subject,
      html: buildEmailConfirmationHtml(confirmUrl, userName, language, hours),
      text: buildEmailConfirmationText(confirmUrl, userName, language, hours),
    });
    if (error) {
      console.error("[Email] Failed to send confirmation email:", error);
      return { success: false, error: error.message };
    }
    console.log("[Email] Confirmation email sent:", data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const error = err as Error;
    console.error("[Email] Error sending confirmation email:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if email service is configured
 */
/**
 * Mask an address for the notice sent to the PREVIOUS one.
 *
 * The holder of the old address is usually the legitimate owner, but not
 * always — a hostile change is exactly the case this notice exists to surface,
 * and in that case the old mailbox may be the one the attacker still controls.
 * A masked hint is enough for a real owner to recognise where their account
 * went without handing a stranger the full address to go after next.
 */
function maskAddress(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  return `${local.length > 1 ? local[0] : ""}•••${domain}`;
}

/**
 * Tell both sides that an account's email moved.
 *
 * NOT a confirmation step: this is sent AFTER the change, and nothing waits on
 * it. Only a superadmin can make this change, and a superadmin can already
 * reset any account's password outright, so gating the edit behind a clicked
 * link would protect nothing that is not already granted — while leaving the
 * account in limbo exactly when the old address is the dead one that caused
 * the edit.
 *
 * What it does buy: a notice to the new address proves the address is real
 * and reachable, which is the failure that made an account unrecoverable in
 * the first place; and a notice to the old one means a change can never happen
 * in silence.
 *
 * Both sends are independent and neither is allowed to fail the operation —
 * the email has already been written to the database by the time this runs,
 * and a bounced courtesy notice must not be reported as a failed change.
 */
export async function sendEmailChangeNotifications(args: {
  newEmail: string;
  previousEmail: string | null;
  language?: string;
}): Promise<void> {
  const language = args.language === "ar" ? "ar" : "en";
  const isAr = language === "ar";

  const toNew = {
    subject: isAr ? "تم تحديث بريدك الإلكتروني - مسار المستقبل" : "Your email address was updated - Future Path",
    heading: isAr ? "تم تحديث بريدك الإلكتروني" : "Your email address was updated",
    body: isAr
      ? `<p style="margin:0 0 12px;">أصبح هذا العنوان هو البريد الإلكتروني المسجّل لحسابك في مسار المستقبل. ستصل إليه رسائل إعادة تعيين كلمة المرور من الآن فصاعداً.</p>
         <p style="margin:0;color:${"#495769"};font-size:13px;">إذا لم تكن تتوقع هذا التغيير، يرجى مراسلتنا على support@futurepath.ae.</p>`
      : `<p style="margin:0 0 12px;">This address is now the registered email for your Future Path account. Password reset messages will arrive here from now on.</p>
         <p style="margin:0;color:${"#495769"};font-size:13px;">If you weren't expecting this change, please contact support@futurepath.ae.</p>`,
    text: isAr
      ? "أصبح هذا العنوان هو البريد الإلكتروني المسجّل لحسابك في مسار المستقبل.\n\nإذا لم تكن تتوقع هذا التغيير، يرجى مراسلتنا على support@futurepath.ae."
      : "This address is now the registered email for your Future Path account.\n\nIf you weren't expecting this change, please contact support@futurepath.ae.",
  };

  const masked = maskAddress(args.newEmail);
  const toOld = {
    subject: isAr ? "تم تغيير البريد الإلكتروني لحسابك - مسار المستقبل" : "Your account email was changed - Future Path",
    heading: isAr ? "تم تغيير البريد الإلكتروني لحسابك" : "Your account email was changed",
    body: isAr
      ? `<p style="margin:0 0 12px;">تم تغيير البريد الإلكتروني لحسابك في مسار المستقبل إلى ${masked}. لن تصل الرسائل إلى هذا العنوان بعد الآن.</p>
         <p style="margin:0;color:${"#495769"};font-size:13px;">إذا لم تطلب هذا التغيير، يرجى مراسلتنا فوراً على support@futurepath.ae.</p>`
      : `<p style="margin:0 0 12px;">The email address on your Future Path account was changed to ${masked}. Messages will no longer be sent to this address.</p>
         <p style="margin:0;color:${"#495769"};font-size:13px;">If you didn't request this, please contact support@futurepath.ae straight away.</p>`,
    text: isAr
      ? `تم تغيير البريد الإلكتروني لحسابك في مسار المستقبل إلى ${masked}.\n\nإذا لم تطلب هذا التغيير، يرجى مراسلتنا فوراً على support@futurepath.ae.`
      : `The email address on your Future Path account was changed to ${masked}.\n\nIf you didn't request this, please contact support@futurepath.ae straight away.`,
  };

  const targets: Array<{ to: string; m: typeof toNew }> = [{ to: args.newEmail, m: toNew }];
  if (args.previousEmail && args.previousEmail.toLowerCase() !== args.newEmail.toLowerCase()) {
    targets.push({ to: args.previousEmail, m: toOld });
  }

  for (const { to, m } of targets) {
    if (!resend) {
      console.warn("[Email] Resend not configured. Email-change notice would be sent to:", to);
      continue;
    }
    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: [to],
        replyTo: REPLY_TO_EMAIL,
        subject: m.subject,
        html: stickyLayout({ language, title: m.subject, heading: m.heading, body: m.body, color: "stickyPink" }),
        text: m.text,
      });
      if (error) console.error("[Email] Failed to send email-change notice to", to, error);
    } catch (err) {
      console.error("[Email] Threw while sending email-change notice to", to, err);
    }
  }
}

export function isEmailConfigured(): boolean {
  return !!resend;
}

/**
 * Whether an unconfigured mail service may be treated as "logged, not sent"
 * rather than as a failure. True ONLY in local development.
 *
 * ASKS FOR AN EXPLICIT YES, which is the whole point. This was
 * `NODE_ENV === "production"` guarding the strict branch, so every value that
 * was not exactly "production" — unset, "staging", a start command changed from
 * `npm start` to `node dist/index.js` — took the lenient one and reported a
 * password reset as sent when nothing had been sent. An ambient variable that
 * has to SAY production to make the system safe is one deploy edit away from
 * silently unlocking it; this inverts that, so absence is strict and only
 * `NODE_ENV=development`, which `npm run dev` sets explicitly (package.json),
 * buys the log-only path.
 *
 * Extracted and exported so the decision is testable on its own, the same
 * reason resolveQuizTier is (quiz.routes.ts, quiz.tier.test.ts). Both callers
 * — this module's dev branch and the 503 gate on
 * POST /api/password-reset/request — must read the SAME predicate: they are one
 * decision expressed twice, and the bug they exist to prevent is exactly the
 * two of them disagreeing.
 */
export function isLogOnlyMailEnvironment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * THE INVOICE EMAIL.
 *
 * THE PDF IS ATTACHED, NOT LINKED. A finance officer forwards the attachment
 * to whoever releases the payment, and a link would send that person to a
 * login they do not have. The same document is still downloadable from the
 * school's Billing screen; the attachment is what makes the email usable on
 * its own.
 *
 * NO BUTTON TO PAY. Settlement is a bank transfer and the account details are
 * on the PDF. A call-to-action that cannot take money teaches a reader that
 * our buttons do nothing.
 *
 * The amount and the due date are in the BODY as well as the attachment: a
 * reader triaging an inbox on a phone decides from the preview text whether
 * this needs opening today.
 */
export function buildInvoiceHtmlEmail(args: {
  invoiceNumber: string;
  organizationName: string;
  amountLabel: string;
  dueLabel: string | null;
  licenseCount: number;
  isProforma: boolean;
  /** A paid invoice is a record, not a request: no transfer instructions. */
  isPaid?: boolean;
  language: string;
}): string {
  const isAr = args.language === "ar";
  const font = emailFont(args.language);
  const paid = args.isPaid === true;
  const docName = args.isProforma
    ? (isAr ? "فاتورة مبدئية" : "proforma invoice")
    : (isAr ? "فاتورة ضريبية" : "tax invoice");

  const body = isAr
    ? `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.8">
        مرفق ${docName} رقم <strong dir="ltr">${escapeHtml(args.invoiceNumber)}</strong>
        لـ ${escapeHtml(args.organizationName)}.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:15px">
        <tr><td style="padding:6px 0;color:#57534e">التراخيص</td><td style="padding:6px 0;text-align:left"><strong>${args.licenseCount}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#57534e">المبلغ</td><td style="padding:6px 0;text-align:left"><strong>${escapeHtml(args.amountLabel)}</strong></td></tr>
        ${args.dueLabel && !paid ? `<tr><td style="padding:6px 0;color:#57534e">تاريخ الاستحقاق</td><td style="padding:6px 0;text-align:left"><strong>${escapeHtml(args.dueLabel)}</strong></td></tr>` : ""}
      </table>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.8">
        ${paid
          ? "تم سداد هذه الفاتورة، ولا يوجد مبلغ مستحق. المرفق لسجلاتكم."
          : `تفاصيل التحويل البنكي مذكورة في المرفق. يُرجى ذكر رقم الفاتورة كمرجع للتحويل،
        وتُضاف التراخيص إلى حساب المدرسة فور استلام التحويل.`}
      </p>`
    : `
      <p style="margin:0 0 16px;font-size:16px;line-height:1.7">
        Attached is ${docName} <strong dir="ltr">${escapeHtml(args.invoiceNumber)}</strong>
        for ${escapeHtml(args.organizationName)}.
      </p>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:15px">
        <tr><td style="padding:6px 0;color:#57534e">Licences</td><td style="padding:6px 0;text-align:right"><strong>${args.licenseCount}</strong></td></tr>
        <tr><td style="padding:6px 0;color:#57534e">Amount</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(args.amountLabel)}</strong></td></tr>
        ${args.dueLabel && !paid ? `<tr><td style="padding:6px 0;color:#57534e">Payment due</td><td style="padding:6px 0;text-align:right"><strong>${escapeHtml(args.dueLabel)}</strong></td></tr>` : ""}
      </table>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7">
        ${paid
          ? "This invoice has been paid. No payment is due; the attachment is for your records."
          : `Bank transfer details are on the attachment. Please quote the invoice number
        as the transfer reference; licences are added to the school's account once
        the transfer is received.`}
      </p>`;

  return stickyLayout({
    language: args.language,
    title: args.invoiceNumber,
    heading: isAr ? `فاتورة ${args.invoiceNumber}` : `Invoice ${args.invoiceNumber}`,
    body,
    color: "stickyYellow",
  });
}

export function buildInvoiceTextEmail(args: {
  invoiceNumber: string;
  organizationName: string;
  amountLabel: string;
  dueLabel: string | null;
  licenseCount: number;
  isPaid?: boolean;
  language: string;
}): string {
  const isAr = args.language === "ar";
  const paid = args.isPaid === true;
  const lines = isAr
    ? [
      `فاتورة ${args.invoiceNumber} — ${args.organizationName}`,
      ``,
      `التراخيص: ${args.licenseCount}`,
      `المبلغ: ${args.amountLabel}`,
      ...(args.dueLabel && !paid ? [`تاريخ الاستحقاق: ${args.dueLabel}`] : []),
      ``,
      ...(paid
        ? [`تم سداد هذه الفاتورة، ولا يوجد مبلغ مستحق. الفاتورة مرفقة بصيغة PDF لسجلاتكم.`]
        : [`الفاتورة مرفقة بصيغة PDF وتتضمن تفاصيل التحويل البنكي.`,
           `يُرجى ذكر ${args.invoiceNumber} كمرجع للتحويل.`]),
    ]
    : [
      `Invoice ${args.invoiceNumber} — ${args.organizationName}`,
      ``,
      `Licences: ${args.licenseCount}`,
      `Amount: ${args.amountLabel}`,
      ...(args.dueLabel && !paid ? [`Payment due: ${args.dueLabel}`] : []),
      ``,
      ...(paid
        ? [`This invoice has been paid. No payment is due; the PDF is attached for your records.`]
        : [`The invoice is attached as a PDF and carries the bank transfer details.`,
           `Please quote ${args.invoiceNumber} as the transfer reference.`]),
    ];
  return lines.join("\n");
}

/**
 * Sends it, with the PDF attached.
 *
 * Returns the provider's message id on success, because that is what the
 * Resend delivery webhook joins back on. Without it every later bounce or
 * delivery event matches no row and the column stays null — indistinguishable
 * from an unconfigured webhook.
 */
export async function sendInvoiceEmail(args: {
  to: string;
  invoiceNumber: string;
  organizationName: string;
  amountLabel: string;
  dueLabel: string | null;
  licenseCount: number;
  isProforma: boolean;
  isPaid?: boolean;
  pdf: Buffer;
  language?: string;
}): Promise<EmailResult> {
  const language = args.language ?? "en";
  if (!resend) {
    if (!isLogOnlyMailEnvironment()) {
      // LOUD: a school is waiting for a bill it will never receive, and from
      // this end that is indistinguishable from a school declining to pay.
      console.error(
        `[Email] RESEND_API_KEY is not configured. INVOICE ${args.invoiceNumber} NOT sent to ` +
        `${args.to} for "${args.organizationName}". Needs manual attention.`,
      );
      return { success: false, error: "Email service not configured." };
    }
    console.warn("[Email] Resend not configured. Invoice email would be sent to:", args.to);
    return { success: true, messageId: LOG_ONLY_MESSAGE_ID };
  }

  const isAr = language === "ar";
  const subject = isAr
    ? `فاتورة ${args.invoiceNumber} — ${args.organizationName}`
    : `Invoice ${args.invoiceNumber} — ${args.organizationName}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [args.to],
      replyTo: REPLY_TO_EMAIL,
      subject,
      html: buildInvoiceHtmlEmail({ ...args, language }),
      text: buildInvoiceTextEmail({ ...args, language }),
      attachments: [{
        // The invoice NUMBER as the filename, not a uuid: this lands in a
        // finance folder beside a dozen others and has to be findable.
        filename: `${args.invoiceNumber}.pdf`,
        content: args.pdf,
      }],
    });

    if (error) {
      console.error(`[Email] Failed to send invoice ${args.invoiceNumber}:`, error);
      return { success: false, error: error.message };
    }
    console.log(`[Email] Invoice ${args.invoiceNumber} sent:`, data?.id);
    return { success: true, messageId: data?.id };
  } catch (err) {
    const error = err as Error;
    console.error(`[Email] Error sending invoice ${args.invoiceNumber}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * TO THE SUPERADMIN: A SCHOOL ASKED FOR MORE LICENCES.
 *
 * The draft invoice already exists when this is sent; the email only says
 * where to find it. English only, because the reader is staff. A failure is
 * logged and swallowed: the draft is the record, and it is visible in the
 * Invoices tab whether or not the mail arrives.
 */
export function buildLicenceRequestText(args: {
  schoolName: string;
  requestedBy: string;
  licences: number;
  amountLabel: string;
  invoiceNumber: string;
  purchaseOrderRef: string | null;
}): string {
  return [
    `${args.schoolName} has asked for ${args.licences} more licences.`,
    ``,
    `Requested by: ${args.requestedBy}`,
    `Quoted: ${args.amountLabel}`,
    `Draft invoice: ${args.invoiceNumber}`,
    args.purchaseOrderRef ? `Their PO reference: ${args.purchaseOrderRef}` : `No PO reference given.`,
    ``,
    `Nothing has been sent to the school. Review the draft in the superadmin Invoices tab, then issue and send it.`,
  ].join("\n");
}

export async function sendLicenceRequestToSuperadmins(args: {
  to: string[];
  schoolName: string;
  requestedBy: string;
  licences: number;
  amountLabel: string;
  invoiceNumber: string;
  purchaseOrderRef: string | null;
}): Promise<void> {
  if (args.to.length === 0) {
    console.error(`[Email] No superadmin address to tell about ${args.schoolName}'s licence request (${args.invoiceNumber}).`);
    return;
  }
  const subject = `Licence request: ${args.schoolName} — ${args.licences} licences`;
  const text = buildLicenceRequestText(args);
  if (!resend) {
    console.warn("[Email] Resend not configured. Licence request notice would be sent to:", args.to.join(", "));
    return;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: args.to,
      replyTo: REPLY_TO_EMAIL,
      subject,
      text,
      html: stickyLayout({
        language: "en",
        title: subject,
        heading: "A school asked for more licences",
        body: text.split("\n").map((l) => (l ? `<p style="margin:0 0 8px;">${escapeHtml(l)}</p>` : "")).join(""),
        color: "stickyPink",
      }),
    });
    if (error) console.error("[Email] Failed to send licence request notice:", error);
  } catch (err) {
    console.error("[Email] Threw while sending licence request notice:", err);
  }
}
