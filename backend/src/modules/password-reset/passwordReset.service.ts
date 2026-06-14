import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { mailService } from "../notifications/mail.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";

/** Cryptographically strong, human-typable temp password (no ambiguous chars). */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "@#$%&*";
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join("");
  // 10 alnum + 2 symbols, shuffled — always mixed-class
  const raw = (pick(alphabet, 10) + pick(symbols, 2)).split("");
  for (let i = raw.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [raw[i], raw[j]] = [raw[j]!, raw[i]!];
  }
  return raw.join("");
}

async function notifyResetAdmins(input: { title: string; body: string }): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { status: "ACTIVE", roles: { some: { role: { name: { in: ["SUPER_ADMIN", "HR_ADMIN"] } } } } },
    select: { id: true },
  });
  await notifyMany(admins.map((a) => a.id), { ...input, type: "APPROVAL", link: "/password-resets" });
}

const userSelect = {
  id: true,
  email: true,
  status: true,
  employee: {
    select: {
      firstName: true, lastName: true, photoUrl: true, employeeCode: true,
      department: { select: { name: true } }, designation: { select: { title: true } },
    },
  },
} as const;

export const passwordResetService = {
  /** Employee asks an admin to reset their password. */
  async requestReset(userId: string, reason: string | undefined, req?: Request) {
    const existing = await prisma.passwordResetRequest.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new BadRequestError("You already have a pending reset request awaiting admin approval.");

    const user = await prisma.user.findUnique({ where: { id: userId }, include: { employee: { select: { firstName: true, lastName: true } } } });
    if (!user) throw new NotFoundError("User");

    const request = await prisma.passwordResetRequest.create({ data: { userId, reason: reason ?? null } });
    audit({ userId, action: "password_reset.requested", entity: "PasswordResetRequest", entityId: request.id, req });
    const who = user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : user.email;
    await notifyResetAdmins({ title: `Password reset request from ${who}`, body: reason || "No reason provided." });
    return request;
  },

  /** My own requests (employee self-service view). */
  async myRequests(userId: string) {
    return prisma.passwordResetRequest.findMany({ where: { userId }, orderBy: { requestedAt: "desc" }, take: 20 });
  },

  /** Admin queue. */
  async listRequests(status: "PENDING" | "APPROVED" | "REJECTED") {
    return prisma.passwordResetRequest.findMany({
      where: { status },
      orderBy: { requestedAt: status === "PENDING" ? "asc" : "desc" },
      include: { user: { select: userSelect } },
    });
  },

  /**
   * Admin approves → system generates a temp password (never typed by the admin),
   * stores ONLY its hash, forces a change on next login, revokes all sessions, and
   * emails the temp password to the employee. The admin never sees it.
   */
  async approveRequest(id: string, actorId: string, req?: Request) {
    const request = await prisma.passwordResetRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, employee: { select: { firstName: true } } } } },
    });
    if (!request || request.status !== "PENDING") throw new NotFoundError("Pending reset request");
    if (request.userId === actorId) throw new ForbiddenError("You cannot approve your own reset request");

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: request.userId },
        data: { passwordHash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null, status: "ACTIVE" },
      }),
      prisma.passwordResetRequest.update({
        where: { id }, data: { status: "APPROVED", reviewedBy: actorId, reviewedAt: new Date() },
      }),
      // force re-login everywhere
      prisma.session.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);

    // never log or return the password — only the hash is stored
    audit({ userId: actorId, action: "password_reset.approved", entity: "PasswordResetRequest", entityId: id, after: { userId: request.userId }, req });

    const name = request.user.employee?.firstName ?? "there";
    await mailService.sendTempPassword(request.user.email, name, tempPassword).catch(() => undefined);
    await notify({
      userId: request.userId, type: "SUCCESS",
      title: "Password reset approved",
      body: "A temporary password has been emailed to you. You'll set a new one when you sign in.",
      link: "/login",
    });
    return { ok: true };
  },

  async rejectRequest(id: string, actorId: string, remarks: string | undefined, req?: Request) {
    const request = await prisma.passwordResetRequest.findUnique({ where: { id } });
    if (!request || request.status !== "PENDING") throw new NotFoundError("Pending reset request");
    await prisma.passwordResetRequest.update({
      where: { id }, data: { status: "REJECTED", reviewedBy: actorId, reviewedAt: new Date(), reviewerRemarks: remarks ?? null },
    });
    audit({ userId: actorId, action: "password_reset.rejected", entity: "PasswordResetRequest", entityId: id, req });
    await notify({
      userId: request.userId, type: "WARNING",
      title: "Password reset request declined",
      body: remarks || "Contact HR/IT for assistance.",
      link: "/profile",
    });
    return { ok: true };
  },
};
