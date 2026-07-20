/**
 * Transactional email via the Resend REST API (no SDK — one fetch call).
 *
 * Contract mirrors the Google/APNs clients: when email isn't configured, or
 * the send fails, this returns a graceful `{ ok:false, reason }` and NEVER
 * throws — so a failed welcome/reset email can never crash a request or the
 * boots-with-zero-secrets invariant. Callers treat it as best-effort.
 */
import { config } from "./config.js";

export type EmailResult = { ok: true } | { ok: false; reason: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<EmailResult> {
  if (!config.resendApiKey || !config.emailFrom) {
    return { ok: false, reason: "email-not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] send failed:", res.status, detail.slice(0, 300));
      return { ok: false, reason: `email-http-${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send threw:", err);
    return { ok: false, reason: "email-error" };
  }
}

/** Minimal, inline-styled HTML for a password-reset link (email clients hate CSS). */
export function resetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;color:#2b1d15">
      <h2 style="color:#3b2016">Reset your Stampy password</h2>
      <p>Click the button below to set a new password. This link expires in 1 hour and can be used once.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#3b2016;color:#fffaf0;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Set a new password</a>
      </p>
      <p style="color:#9b8b7d;font-size:.85rem">If you didn't ask for this, you can ignore this email — your password stays the same.</p>
    </div>`;
}

/** Welcome email sent (best-effort) when a new owner signs up. */
export function welcomeEmailHtml(dashboardUrl: string): string {
  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;margin:0 auto;color:#2b1d15">
      <h2 style="color:#3b2016">Welcome to Stampy ☕️</h2>
      <p>Your account is ready. Head to your dashboard to design your loyalty card, print your sign-up QR, and start stamping.</p>
      <p style="margin:24px 0">
        <a href="${dashboardUrl}" style="background:#3b2016;color:#fffaf0;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open my dashboard</a>
      </p>
    </div>`;
}
