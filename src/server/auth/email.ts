import "server-only";
import { Resend } from "resend";

type AuthEmail = {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
};

export async function sendAuthEmail(email: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY and AUTH_EMAIL_FROM are required in production.");
    }

    console.info(`[VibeRent auth email] ${email.subject} -> ${email.to}: ${email.actionUrl}`);
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: email.to,
    subject: email.subject,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:auto;color:#19191f">
        <div style="font-size:24px;font-weight:800;margin-bottom:24px">Vibe<span style="color:#006fe6">Rent</span></div>
        <h1 style="font-size:22px;margin:0 0 12px">${email.heading}</h1>
        <p style="color:#475467;line-height:1.6">${email.message}</p>
        <a href="${email.actionUrl}" style="display:inline-block;margin-top:16px;background:#006fe6;color:white;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">${email.actionLabel}</a>
        <p style="margin-top:24px;color:#667085;font-size:12px">If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) throw new Error(`Authentication email could not be sent: ${error.message}`);
}
