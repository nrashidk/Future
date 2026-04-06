import { Resend } from "resend";

// Initialize Resend client (will be null if API key not configured)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Default from email (should be verified domain in production)
const FROM_EMAIL = process.env.EMAIL_FROM || "Future Pathways <noreply@futurepathways.com>";

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a password reset email with a secure reset link
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName?: string
): Promise<EmailResult> {
  if (!resend) {
    // SECURITY WARNING: Never log tokens or sensitive data
    // In development, tokens are stored in DB and can be retrieved via admin tools
    console.warn("[Email] Resend not configured. Email would be sent to:", to);
    console.warn("[Email] Configure RESEND_API_KEY for actual email delivery");
    return { success: true, messageId: "dev-mode-no-email" };
  }

  // Build reset URL
  const baseUrl = process.env.APP_URL || "https://futurepath.ae";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: "Reset Your Password - Future Pathways",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset Your Password</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Future Pathways</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="margin-top: 0; color: #1f2937;">Reset Your Password</h2>
            
            <p>Hi${userName ? ` ${userName}` : ''},</p>
            
            <p>We received a request to reset your password for your Future Pathways account. Click the button below to create a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Reset Password</a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour for security reasons.</p>
            
            <p style="color: #6b7280; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              If the button doesn't work, copy and paste this link into your browser:<br>
              <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
            </p>
          </div>
          
          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Future Pathways. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Reset Your Password - Future Pathways

Hi${userName ? ` ${userName}` : ''},

We received a request to reset your password for your Future Pathways account.

Click this link to reset your password:
${resetUrl}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.

© ${new Date().getFullYear()} Future Pathways. All rights reserved.
      `.trim(),
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
 * Check if email service is configured
 */
export function isEmailConfigured(): boolean {
  return !!resend;
}
