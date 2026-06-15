import nodemailer, { type Transporter } from "nodemailer";
import type SESTransport from "nodemailer/lib/ses-transport/index.js";
import { env, isDev } from "../../config/env.js";
import { logger } from "../../core/logger.js";

let transporter: Transporter | null = null;

/**
 * Build the mail transport once. Two drivers, selected by MAIL_DRIVER:
 *  - "smtp" → plain nodemailer SMTP (dev Mailpit, or any SMTP relay)
 *  - "ses"  → AWS SES via nodemailer's SES transport (uses the v3 SDK; the
 *             instance/task IAM role provides credentials on EC2/ECS, so no
 *             keys are needed in env there). Attachments work the same way.
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

const BRAND_HEADER = `
  <div style="background:#0A3D62;padding:20px 28px;border-radius:8px 8px 0 0">
    <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px">Somvanshi HRMS</span>
    <span style="color:#94a3b8;font-size:12px;margin-left:10px">People. Performance. Growth.</span>
  </div>`;

function shell(body: string): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;background:#F8FAFC;padding:24px">
    ${BRAND_HEADER}
    <div style="background:#ffffff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 8px 8px;padding:28px;color:#1E293B;font-size:14px;line-height:1.6">
      ${body}
      <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0 12px"/>
      <p style="color:#64748b;font-size:12px;margin:0">Somvanshi Technologies · This is an automated message from SomHR.</p>
    </div>
  </div>`;
}

const btn = (href: string, label: string): string =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#0A3D62;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">${label}</a></p>`;

const pill = (text: string, color: string): string =>
  `<span style="display:inline-block;background:${color}1a;color:${color};border:1px solid ${color}55;border-radius:999px;padding:2px 12px;font-size:12px;font-weight:600">${text}</span>`;

const GREEN = "#16a34a";
const RED = "#dc2626";
const AMBER = "#d97706";

interface Attachment {
  filename: string;
  content: Buffer;
}

/** Low-level send. Logs (not throws) in dev when no SMTP is available. */
async function send(to: string, subject: string, html: string, attachments?: Attachment[]): Promise<void> {
  try {
    const t = await getTransporter();
    await t.sendMail({ from: env.MAIL_FROM, to, subject, html, ...(attachments ? { attachments } : {}) });
  } catch (err) {
    if (isDev) {
      logger.warn(
        { to, subject, body: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) },
        "Mail transport unavailable in dev — email content logged, not sent"
      );
      return;
    }
    throw err;
  }
}

/**
 * Fire-and-forget wrapper for *notification* emails (leave, attendance, tickets,
 * announcements). A mail failure must never break the underlying HR action, so
 * these are dispatched in the background and only logged on error.
 */
function dispatch(promise: Promise<void>, context: Record<string, unknown>): void {
  void promise.catch((err) => logger.warn({ ...context, err: (err as Error).message }, "notification email failed"));
}

export const mailService = {
  // ───────────────────────── account / auth ─────────────────────────
  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
    await send(
      to,
      "Reset your SomHR password",
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">Password reset requested</h2>
        <p>We received a request to reset your SomHR password. This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        ${btn(link, "Reset Password")}
        <p style="color:#64748b;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
      `)
    );
  },

  async sendWelcome(to: string, name: string, tempPassword: string): Promise<void> {
    await send(
      to,
      "Welcome to SomHR — your account is ready",
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">Welcome aboard, ${name}!</h2>
        <p>Your SomHR account has been created by HR. Sign in with:</p>
        <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
          <strong>Email:</strong> ${to}<br/>
          <strong>Temporary password:</strong> ${tempPassword}
        </p>
        <p>You'll be asked to change it on first login.</p>
        ${btn(`${env.APP_URL}/login`, "Sign in to SomHR")}
      `)
    );
  },

  async sendTempPassword(to: string, name: string, tempPassword: string): Promise<void> {
    await send(
      to,
      "Your SomHR password has been reset",
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">Password reset approved</h2>
        <p>Hi ${name}, an administrator approved your password reset request. Sign in with this temporary password:</p>
        <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
          <strong>Email:</strong> ${to}<br/>
          <strong>Temporary password:</strong> ${tempPassword}
        </p>
        <p>For your security you'll be asked to set a new password the moment you sign in. This temporary password works only once.</p>
        ${btn(`${env.APP_URL}/login`, "Sign in to SomHR")}
      `)
    );
  },

  // ───────────────────────── payroll ─────────────────────────
  async sendPayslip(to: string, name: string, period: string, pdf: Buffer): Promise<void> {
    await send(
      to,
      `Your SomHR payslip — ${period}`,
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">Payslip for ${period}</h2>
        <p>Hi ${name}, your payslip for <strong>${period}</strong> is attached. You can also download it anytime from the Payroll module or by asking Sera.</p>
      `),
      [{ filename: `SomHR-Payslip-${period.replace(/\s+/g, "-")}.pdf`, content: pdf }]
    );
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
        shell(`
          <h2 style="margin:0 0 6px;color:#111827">Leave request ${approved ? "approved" : "rejected"}</h2>
          <p style="margin:0 0 16px">${pill(o.status, approved ? GREEN : RED)}</p>
          <p>Hi ${name}, your <strong>${o.leaveType}</strong> request has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
          <p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">
            <strong>Dates:</strong> ${o.startDate}${o.startDate !== o.endDate ? ` → ${o.endDate}` : ""}<br/>
            <strong>Days:</strong> ${o.days}${o.reviewer ? `<br/><strong>Reviewed by:</strong> ${o.reviewer}` : ""}${o.note ? `<br/><strong>Note:</strong> ${o.note}` : ""}
          </p>
          ${btn(`${env.APP_URL}/leave`, "View in SomHR")}
        `)
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
        shell(`
          <h2 style="margin:0 0 6px;color:#111827">Attendance correction ${approved ? "approved" : "rejected"}</h2>
          <p style="margin:0 0 16px">${pill(o.status, approved ? GREEN : RED)}</p>
          <p>Hi ${name}, your attendance correction request for <strong>${o.date}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.${o.reviewer ? ` Reviewed by ${o.reviewer}.` : ""}</p>
          ${o.note ? `<p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px"><strong>Note:</strong> ${o.note}</p>` : ""}
          ${btn(`${env.APP_URL}/attendance`, "View attendance")}
        `)
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
        shell(`
          <h2 style="margin:0 0 6px;color:#111827">Ticket ${verb}</h2>
          <p style="margin:0 0 16px">${pill(o.ticketRef, color)}</p>
          <p><strong>${o.subject}</strong></p>
          ${o.actor ? `<p style="color:#64748b;font-size:13px;margin:0 0 8px">by ${o.actor}</p>` : ""}
          ${o.message ? `<p style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px 16px">${o.message}</p>` : ""}
          ${btn(`${env.APP_URL}/helpdesk`, "Open ticket")}
        `)
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
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">${o.title}</h2>
        <p>Dear ${name},</p>
        <p>Please find attached your <strong>${o.title.toLowerCase()}</strong> (Ref: ${o.refNo}) from Somvanshi Technologies. Kindly retain this for your records.</p>
        <p>We wish you the very best for your future endeavours.</p>
      `),
      [{ filename: o.filename, content: o.pdf }]
    );
  },

  // ───────────────────────── announcements ─────────────────────────
  sendAnnouncement(to: string, o: { title: string; body: string; author?: string | null }): void {
    dispatch(
      send(
        to,
        `📣 ${o.title}`,
        shell(`
          <h2 style="margin:0 0 12px;color:#111827">${o.title}</h2>
          <div style="color:#334155">${o.body}</div>
          ${o.author ? `<p style="color:#64748b;font-size:12px;margin:16px 0 0">Posted by ${o.author}</p>` : ""}
          ${btn(`${env.APP_URL}/engagement`, "Open SomHR")}
        `)
      ),
      { to, kind: "announcement" }
    );
  },

  /** Broadcast an announcement to many recipients without blocking the request. */
  broadcastAnnouncement(recipients: string[], o: { title: string; body: string; author?: string | null }): void {
    for (const to of recipients) this.sendAnnouncement(to, o);
  },
};
