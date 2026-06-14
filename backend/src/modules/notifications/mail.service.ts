import nodemailer, { type Transporter } from "nodemailer";
import { env, isDev } from "../../config/env.js";
import { logger } from "../../core/logger.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
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

async function send(to: string, subject: string, html: string): Promise<void> {
  try {
    await getTransporter().sendMail({ from: env.MAIL_FROM, to, subject, html });
  } catch (err) {
    // In dev without an SMTP server, log the content instead of failing the
    // request — temp passwords and reset links remain visible to the developer.
    if (isDev) {
      logger.warn(
        { to, subject, body: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() },
        "SMTP unavailable in dev — email content logged, not sent"
      );
      return;
    }
    throw err;
  }
}

export const mailService = {
  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    const link = `${env.APP_URL}/reset-password?token=${rawToken}`;
    await send(
      to,
      "Reset your SomHR password",
      shell(`
        <h2 style="margin:0 0 12px;color:#111827">Password reset requested</h2>
        <p>We received a request to reset your SomHR password. This link expires in ${env.PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p style="margin:20px 0">
          <a href="${link}" style="background:#0A3D62;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
        </p>
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
        <p style="margin:20px 0">
          <a href="${env.APP_URL}/login" style="background:#0A3D62;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to SomHR</a>
        </p>
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
        <p style="margin:20px 0">
          <a href="${env.APP_URL}/login" style="background:#0A3D62;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to SomHR</a>
        </p>
      `)
    );
  },

  async sendPayslip(to: string, name: string, period: string, pdf: Buffer): Promise<void> {
    try {
      await getTransporter().sendMail({
        from: env.MAIL_FROM,
        to,
        subject: `Your SomHR payslip — ${period}`,
        html: shell(`
          <h2 style="margin:0 0 12px;color:#111827">Payslip for ${period}</h2>
          <p>Hi ${name}, your payslip for <strong>${period}</strong> is attached. You can also download it anytime from the Payroll module or by asking Sera.</p>
        `),
        attachments: [{ filename: `SomHR-Payslip-${period.replace(/\s+/g, "-")}.pdf`, content: pdf }],
      });
    } catch (err) {
      if (isDev) {
        logger.warn({ to, period }, "SMTP unavailable in dev — payslip email logged, not sent");
        return;
      }
      throw err;
    }
  },
};
