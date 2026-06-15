import nodemailer, { type Transporter } from "nodemailer";
import type SESTransport from "nodemailer/lib/ses-transport/index.js";
import { env, isDev } from "../../config/env.js";
import { logger } from "../../core/logger.js";
import { brandingService } from "../branding/branding.service.js";

let transporter: Transporter | null = null;

/**
 * SMTP / SES transport (lazy, cached). Resend uses its HTTP API instead and is
 * handled directly in `send()`.
 *  - "smtp" → nodemailer SMTP (dev Mailpit, any relay, or Resend SMTP)
 *  - "ses"  → AWS SES via nodemailer's SES transport (instance role on EC2/ECS)
 */
async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;
  if (env.MAIL_DRIVER === "ses") {
    const { SESClient, SendRawEmailCommand } = await import("@aws-sdk/client-ses");
    const accessKeyId = env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
    const ses = new SESClient({
      region: env.SES_REGION || env.AWS_REGION || env.S3_REGION || "ap-south-1",
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    const sesOptions = { SES: { ses, aws: { SendRawEmailCommand } } } as unknown as SESTransport.Options;
    transporter = nodemailer.createTransport(sesOptions);
  } else {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
    });
  }
  return transporter;
}

// ── branded shell (DB-driven, cached) ────────────────────────────────────────
interface EmailBranding {
  logoUrl: string | null;
  headerColor: string;
  footerText: string;
  website: string;
}
let brandingCache: { at: number; data: EmailBranding } | null = null;
async function emailBranding(): Promise<EmailBranding> {
  if (brandingCache && Date.now() - brandingCache.at < 60_000) return brandingCache.data;
  const b = await brandingService.get();
  const data: EmailBranding = {
    logoUrl: b.email.logoUrl,
    headerColor: b.email.headerColor || "#0A3D62",
    footerText: b.email.footerText || "Somvanshi Technologies · This is an automated message from SomHR.",
    website: b.email.website || b.footer.website || "",
  };
  brandingCache = { at: Date.now(), data };
  return data;
}

const FONT = "Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/**
 * Table-based, inline-CSS email shell — renders on Gmail, Outlook, Apple Mail
 * and Yahoo. The logo is an <img> from a public URL; the text branding
 * ("SOMVANSHI TECHNOLOGIES" + tagline) is always rendered as real HTML so
 * branding stays visible even when the client blocks images.
 */
function renderEmail(body: string, b: EmailBranding): string {
  const logo = b.logoUrl
    ? `<img src="${b.logoUrl}" alt="Somvanshi Technologies" width="auto" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;max-height:44px;margin:0 auto 10px" />`
    : "";
  const site = b.website
    ? ` · <a href="${b.website}" style="color:#0A3D62;text-decoration:none">${b.website.replace(/^https?:\/\//, "")}</a>`
    : "";
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;margin:0;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px">
        <tr>
          <td align="center" style="background:${b.headerColor};padding:22px 28px;border-radius:8px 8px 0 0">
            ${logo}
            <div style="font-family:${FONT};color:#ffffff;font-size:18px;font-weight:700;letter-spacing:1px">SOMVANSHI TECHNOLOGIES</div>
            <div style="font-family:${FONT};color:#9fc4e0;font-size:12px;margin-top:3px">Intelligent Digital Transformation</div>
          </td>
        </tr>
        <tr>
          <td style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px;padding:28px;color:#1E293B;font-family:${FONT};font-size:14px;line-height:1.6">
            ${body}
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px" />
            <p style="color:#64748b;font-size:12px;margin:0">${b.footerText}${site}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>`;
}

const btn = (href: string, label: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:6px;background:#0A3D62"><a href="${href}" style="display:inline-block;padding:10px 22px;font-family:${FONT};color:#ffffff;font-weight:600;text-decoration:none;border-radius:6px">${label}</a></td></tr></table>`;

const pill = (text: string, color: string): string =>
  `<span style="display:inline-block;background:${color}1a;color:${color};border:1px solid ${color}55;border-radius:999px;padding:2px 12px;font-size:12px;font-weight:600">${text}</span>`;

const GREEN = "#16a34a";
const RED = "#dc2626";
const AMBER = "#d97706";

interface Attachment {
  filename: string;
  content: Buffer;
}

async function sendViaResend(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<void> {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject,
      html,
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Low-level send: wraps the body in the branded shell and dispatches. */
async function send(to: string, subject: string, body: string, attachments?: Attachment[]): Promise<void> {
  const html = renderEmail(body, await emailBranding());
  try {
    if (env.MAIL_DRIVER === "resend") {
      await sendViaResend(to, subject, html, attachments);
    } else {
      const t = await getTransporter();
      await t.sendMail({ from: env.MAIL_FROM, to, subject, html, ...(attachments ? { attachments } : {}) });
    }
  } catch (err) {
    if (isDev && env.MAIL_DRIVER === "smtp") {
      logger.warn({ to, subject }, "Local SMTP unavailable in dev — email not sent (logged)");
      return;
    }
    // Email is best-effort — log the failure but NEVER throw, so a mail outage
    // (e.g. missing RESEND_API_KEY, SES misconfig) can't break the underlying
    // action: password reset, employee create, payroll publish, etc.
    logger.error({ to, subject, driver: env.MAIL_DRIVER, err: (err as Error).message }, "email send failed (non-fatal)");
  }
}

function dispatch(promise: Promise<void>, context: Record<string, unknown>): void {
  void promise.catch((err) => logger.warn({ ...context, err: (err as Error).message }, "notification email failed"));
}

// ── body builders (shared by senders + the preview/test feature) ─────────────
const bodyPasswordReset = (link: string): string => `
  <h2 style="margin:0 0 12px;color:#111827">Password reset requested</h2>
  <p>We received a request to reset your SomHR password. This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p>
  ${btn(link, "Reset Password")}
  <p style="color:#64748b;font-size:12px">If you didn't request this, you can safely ignore this email.</p>`;

const bodyWelcome = (to: string, name: string, tempPassword: string): string => `
  <h2 style="margin:0 0 12px;color:#111827">Welcome aboard, ${name}!</h2>
  <p>Your SomHR account has been created by HR. Sign in with:</p>
  <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
    <strong>Email:</strong> ${to}<br/>
    <strong>Temporary password:</strong> ${tempPassword}
  </p>
  <p>You'll be asked to change it on first login.</p>
  ${btn(`${env.APP_URL}/login`, "Sign in to SomHR")}`;

const bodyPayslip = (name: string, period: string): string => `
  <h2 style="margin:0 0 12px;color:#111827">Payslip for ${period}</h2>
  <p>Hi ${name}, your payslip for <strong>${period}</strong> is attached. You can also download it anytime from the Payroll module or by asking Sera.</p>`;

const bodyAnnouncement = (o: { title: string; body: string; author?: string | null }): string => `
  <h2 style="margin:0 0 12px;color:#111827">${o.title}</h2>
  <div style="color:#334155">${o.body}</div>
  ${o.author ? `<p style="color:#64748b;font-size:12px;margin:16px 0 0">Posted by ${o.author}</p>` : ""}
  ${btn(`${env.APP_URL}/engagement`, "Open SomHR")}`;

export const mailService = {
  // ───────────────────────── account / auth ─────────────────────────
  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    await send(to, "Reset your SomHR password", bodyPasswordReset(`${env.APP_URL}/reset-password?token=${rawToken}`));
  },

  async sendWelcome(to: string, name: string, tempPassword: string): Promise<void> {
    await send(to, "Welcome to SomHR — your account is ready", bodyWelcome(to, name, tempPassword));
  },

  async sendTempPassword(to: string, name: string, tempPassword: string): Promise<void> {
    await send(
      to,
      "Your SomHR password has been reset",
      `
        <h2 style="margin:0 0 12px;color:#111827">Password reset approved</h2>
        <p>Hi ${name}, an administrator approved your password reset request. Sign in with this temporary password:</p>
        <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
          <strong>Email:</strong> ${to}<br/>
          <strong>Temporary password:</strong> ${tempPassword}
        </p>
        <p>For your security you'll be asked to set a new password the moment you sign in. This temporary password works only once.</p>
        ${btn(`${env.APP_URL}/login`, "Sign in to SomHR")}
      `
    );
  },

  // ───────────────────────── payroll ─────────────────────────
  async sendPayslip(to: string, name: string, period: string, pdf: Buffer): Promise<void> {
    await send(to, `Your SomHR payslip — ${period}`, bodyPayslip(name, period), [
      { filename: `SomHR-Payslip-${period.replace(/\s+/g, "-")}.pdf`, content: pdf },
    ]);
  },

  // ───────────────────────── leave ─────────────────────────
  sendLeaveDecision(
    to: string,
    name: string,
    o: { leaveType: string; status: "APPROVED" | "REJECTED"; startDate: string; endDate: string; days: number; reviewer?: string | null; note?: string | null }
  ): void {
    const approved = o.status === "APPROVED";
    dispatch(
      send(
        to,
        `Leave ${approved ? "approved" : "rejected"} — ${o.leaveType} (${o.startDate}${o.startDate !== o.endDate ? ` to ${o.endDate}` : ""})`,
        `
          <h2 style="margin:0 0 6px;color:#111827">Leave request ${approved ? "approved" : "rejected"}</h2>
          <p style="margin:0 0 16px">${pill(o.status, approved ? GREEN : RED)}</p>
          <p>Hi ${name}, your <strong>${o.leaveType}</strong> request has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
          <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
            <strong>Dates:</strong> ${o.startDate}${o.startDate !== o.endDate ? ` &rarr; ${o.endDate}` : ""}<br/>
            <strong>Days:</strong> ${o.days}${o.reviewer ? `<br/><strong>Reviewed by:</strong> ${o.reviewer}` : ""}${o.note ? `<br/><strong>Note:</strong> ${o.note}` : ""}
          </p>
          ${btn(`${env.APP_URL}/leave`, "View in SomHR")}
        `
      ),
      { to, kind: "leave-decision" }
    );
  },

  // ───────────────────────── attendance ─────────────────────────
  sendAttendanceCorrection(
    to: string,
    name: string,
    o: { date: string; status: "APPROVED" | "REJECTED"; reviewer?: string | null; note?: string | null }
  ): void {
    const approved = o.status === "APPROVED";
    dispatch(
      send(
        to,
        `Attendance correction ${approved ? "approved" : "rejected"} — ${o.date}`,
        `
          <h2 style="margin:0 0 6px;color:#111827">Attendance correction ${approved ? "approved" : "rejected"}</h2>
          <p style="margin:0 0 16px">${pill(o.status, approved ? GREEN : RED)}</p>
          <p>Hi ${name}, your attendance correction request for <strong>${o.date}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.${o.reviewer ? ` Reviewed by ${o.reviewer}.` : ""}</p>
          ${o.note ? `<p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px"><strong>Note:</strong> ${o.note}</p>` : ""}
          ${btn(`${env.APP_URL}/attendance`, "View attendance")}
        `
      ),
      { to, kind: "attendance-correction" }
    );
  },

  // ───────────────────────── helpdesk ─────────────────────────
  sendTicketNotification(
    to: string,
    o: { event: "created" | "replied" | "resolved"; ticketRef: string; subject: string; actor?: string | null; message?: string | null }
  ): void {
    const verb = o.event === "created" ? "created" : o.event === "resolved" ? "resolved" : "updated";
    const color = o.event === "resolved" ? GREEN : o.event === "created" ? AMBER : "#0A3D62";
    dispatch(
      send(
        to,
        `[${o.ticketRef}] Ticket ${verb} — ${o.subject}`,
        `
          <h2 style="margin:0 0 6px;color:#111827">Ticket ${verb}</h2>
          <p style="margin:0 0 16px">${pill(o.ticketRef, color)}</p>
          <p><strong>${o.subject}</strong></p>
          ${o.actor ? `<p style="color:#64748b;font-size:13px;margin:0 0 8px">by ${o.actor}</p>` : ""}
          ${o.message ? `<p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">${o.message}</p>` : ""}
          ${btn(`${env.APP_URL}/helpdesk`, "Open ticket")}
        `
      ),
      { to, kind: "ticket", ref: o.ticketRef }
    );
  },

  // ───────────────────────── exit & separation ─────────────────────────
  async sendExitDocument(
    to: string,
    name: string,
    o: { title: string; refNo: string; pdf: Buffer; filename: string }
  ): Promise<void> {
    await send(
      to,
      `${o.title} — Somvanshi Technologies`,
      `
        <h2 style="margin:0 0 12px;color:#111827">${o.title}</h2>
        <p>Dear ${name},</p>
        <p>Please find attached your <strong>${o.title.toLowerCase()}</strong> (Ref: ${o.refNo}) from Somvanshi Technologies. Kindly retain this for your records.</p>
        <p>We wish you the very best for your future endeavours.</p>
      `,
      [{ filename: o.filename, content: o.pdf }]
    );
  },

  // ───────────────────────── announcements ─────────────────────────
  sendAnnouncement(to: string, o: { title: string; body: string; author?: string | null }): void {
    dispatch(send(to, `📣 ${o.title}`, bodyAnnouncement(o)), { to, kind: "announcement" });
  },

  /** Broadcast an announcement to many recipients without blocking the request. */
  broadcastAnnouncement(recipients: string[], o: { title: string; body: string; author?: string | null }): void {
    for (const to of recipients) this.sendAnnouncement(to, o);
  },

  // ───────────────────────── preview / test (Settings → Email Templates) ─────
  /** Full branded HTML for a sample of the given template — no email is sent. */
  async previewHtml(key: PreviewKey, sampleEmail = "employee@example.com"): Promise<string> {
    return renderEmail(sampleBody(key, sampleEmail), await emailBranding());
  },

  /** Send a real test email of the given template to `to` (HR/Admin tool). */
  async sendTest(key: PreviewKey, to: string): Promise<void> {
    const subject = `[TEST] ${PREVIEW_LABELS[key]} — SomHR`;
    if (key === "payslip") {
      const { samplePdf } = await import("./samplePdf.js");
      await send(to, subject, sampleBody(key, to), [{ filename: "SomHR-Payslip-Sample.pdf", content: await samplePdf() }]);
      return;
    }
    await send(to, subject, sampleBody(key, to));
  },
};

// ── preview registry ─────────────────────────────────────────────────────────
export type PreviewKey = "welcome" | "password-reset" | "payslip" | "announcement";
export const PREVIEW_LABELS: Record<PreviewKey, string> = {
  welcome: "Welcome Email",
  "password-reset": "Password Reset Email",
  payslip: "Payslip Email",
  announcement: "Announcement Email",
};

function sampleBody(key: PreviewKey, email: string): string {
  switch (key) {
    case "welcome":
      return bodyWelcome(email, "Aarav Sharma", "Temp@1234");
    case "password-reset":
      return bodyPasswordReset(`${env.APP_URL}/reset-password?token=SAMPLE-TOKEN-1234`);
    case "payslip":
      return bodyPayslip("Aarav Sharma", "June 2026");
    case "announcement":
      return bodyAnnouncement({
        title: "Diwali holiday schedule",
        body: "The office will remain closed on 9–11 Nov for Diwali. Wishing everyone a safe and joyful festival! 🪔",
        author: "Shraddha Nagrani, HR",
      });
  }
}
