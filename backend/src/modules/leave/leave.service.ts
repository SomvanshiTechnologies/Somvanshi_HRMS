import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";
import { mailService } from "../notifications/mail.service.js";
import type { ApplyLeaveInput, WorkflowStep } from "./leave.schema.js";
import type { LeaveUnit, Prisma } from "../../generated/prisma/client.js";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function requireEmployee(req: Request) {
  const employeeId = req.user?.employeeId;
  if (!employeeId) throw new ForbiddenError("No employee profile linked to this account");
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: { manager: { select: { id: true, userId: true, firstName: true } } },
  });
  if (!employee) throw new NotFoundError("Employee");
  return employee;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function holidaySet(year: number): Promise<Set<string>> {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year + 1}-01-31`) }, isOptional: false },
    select: { date: true },
  });
  return new Set(holidays.map((h) => dayKey(h.date)));
}

/** Working days between two dates inclusive — excludes weekends + holidays, honors half-day units. */
export async function computeLeaveDays(
  start: Date,
  end: Date,
  startUnit: LeaveUnit,
  endUnit: LeaveUnit
): Promise<number> {
  const holidays = await holidaySet(start.getFullYear());
  let days = 0;
  const cursor = new Date(start);
  const sameDay = dayKey(start) === dayKey(end);

  while (cursor <= end) {
    const dow = cursor.getDay();
    const isWorkday = dow !== 0 && dow !== 6 && !holidays.has(dayKey(cursor));
    if (isWorkday) {
      let value = 1;
      if (sameDay) {
        value = startUnit === "FULL_DAY" ? 1 : 0.5;
      } else if (dayKey(cursor) === dayKey(start) && startUnit !== "FULL_DAY") {
        value = 0.5;
      } else if (dayKey(cursor) === dayKey(end) && endUnit !== "FULL_DAY") {
        value = 0.5;
      }
      days += value;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/** Ensure the employee has a balance row for this type/year (initialized from policy). */
async function ensureBalance(employeeId: string, leaveTypeId: string, year: number) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
  if (existing) return existing;
  const policy = await prisma.leavePolicy.findFirst({ where: { leaveTypeId, isActive: true } });
  return prisma.leaveBalance.create({
    data: {
      employeeId,
      leaveTypeId,
      year,
      entitled: policy?.annualQuota ?? 0,
      accrued: policy?.annualQuota ?? 0, // simple model: full-year entitlement available
    },
  });
}

async function activeWorkflowSteps(): Promise<WorkflowStep[]> {
  const config = await prisma.workflowConfig.findUnique({ where: { key: "leave_approval" } });
  const steps = (config?.isActive ? (config.steps as WorkflowStep[]) : null) ?? [{ type: "MANAGER" }];
  return steps.length ? steps : [{ type: "MANAGER" }];
}

/** Users who can act on a given step. */
async function stepActorUserIds(step: { approverType: string; roleName: string | null; approverEmployeeId: string | null }): Promise<string[]> {
  if (step.approverType === "MANAGER" && step.approverEmployeeId) {
    const manager = await prisma.employee.findUnique({ where: { id: step.approverEmployeeId }, select: { userId: true } });
    return manager?.userId ? [manager.userId] : [];
  }
  if (step.approverType === "ROLE" && step.roleName) {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", roles: { some: { role: { name: step.roleName } } } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  return [];
}

async function notifyStepActors(requestId: string, sequence: number, title: string, body: string): Promise<void> {
  const step = await prisma.leaveApprovalStep.findUnique({ where: { requestId_sequence: { requestId, sequence } } });
  if (!step) return;
  const userIds = await stepActorUserIds(step);
  await notifyMany(userIds, { type: "APPROVAL", title, body, link: "/leave/approvals", entity: "LeaveRequest", entityId: requestId });
}

const REQUEST_INCLUDE = {
  leaveType: { select: { id: true, name: true, code: true, colorHex: true, isPaid: true } },
  employee: {
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, userId: true,
      department: { select: { name: true } }, designation: { select: { title: true } },
    },
  },
  steps: { orderBy: { sequence: "asc" as const } },
} satisfies Prisma.LeaveRequestInclude;

/* ------------------------------------------------------------------ */
/* service                                                             */
/* ------------------------------------------------------------------ */

export const leaveService = {
  async listTypes() {
    return prisma.leaveType.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { policies: { where: { isActive: true } } },
    });
  },

  async myBalances(req: Request, year = new Date().getFullYear()) {
    const employee = await requireEmployee(req);
    const types = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    const balances = [];
    for (const type of types) {
      // gender-restricted types are hidden when not applicable
      const policy = await prisma.leavePolicy.findFirst({ where: { leaveTypeId: type.id, isActive: true } });
      if (policy?.genderRestriction && policy.genderRestriction !== employee.gender) continue;
      const balance = await ensureBalance(employee.id, type.id, year);
      balances.push({
        leaveType: { id: type.id, name: type.name, code: type.code, colorHex: type.colorHex, isPaid: type.isPaid },
        year,
        entitled: balance.entitled,
        used: balance.used,
        pending: balance.pending,
        carriedOver: balance.carriedOver,
        available: balance.entitled + balance.carriedOver - balance.used - balance.pending,
      });
    }
    return balances;
  },

  async apply(req: Request, input: ApplyLeaveInput) {
    const employee = await requireEmployee(req);
    const year = input.startDate.getFullYear();

    const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
    if (!leaveType || !leaveType.isActive) throw new NotFoundError("Leave type");

    const policy = await prisma.leavePolicy.findFirst({ where: { leaveTypeId: leaveType.id, isActive: true } });
    if (policy?.genderRestriction && policy.genderRestriction !== employee.gender) {
      throw new BadRequestError(`${leaveType.name} is not applicable to your profile`);
    }
    if (policy?.requiresDocument && !input.documentUrl) {
      throw new BadRequestError(`${leaveType.name} requires a supporting document`);
    }
    if (policy?.noticeDays) {
      const noticeMs = policy.noticeDays * 86400000;
      if (input.startDate.getTime() - Date.now() < noticeMs) {
        throw new BadRequestError(`${leaveType.name} requires ${policy.noticeDays} days notice`);
      }
    }

    const days = await computeLeaveDays(input.startDate, input.endDate, input.startUnit, input.endUnit);
    if (days <= 0) throw new BadRequestError("Selected range contains no working days");
    if (policy?.maxConsecutiveDays && days > policy.maxConsecutiveDays) {
      throw new BadRequestError(`Maximum ${policy.maxConsecutiveDays} consecutive days for ${leaveType.name}`);
    }

    // overlap check
    const overlap = await prisma.leaveRequest.findFirst({
      where: {
        employeeId: employee.id,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: input.endDate },
        endDate: { gte: input.startDate },
      },
    });
    if (overlap) throw new BadRequestError("You already have a leave request overlapping these dates");

    // balance check (LOP is unlimited)
    if (leaveType.code !== "LOP") {
      const balance = await ensureBalance(employee.id, leaveType.id, year);
      const available = balance.entitled + balance.carriedOver - balance.used - balance.pending;
      if (days > available) {
        throw new BadRequestError(`Insufficient balance: ${available} day(s) of ${leaveType.name} available, ${days} requested`);
      }
    }

    // build approval chain from the active workflow config
    const workflowSteps = await activeWorkflowSteps();
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate: input.startDate,
          endDate: input.endDate,
          startUnit: input.startUnit,
          endUnit: input.endUnit,
          days,
          reason: input.reason,
          documentUrl: input.documentUrl ?? null,
        },
      });

      let sequence = 0;
      for (const step of workflowSteps) {
        // skip MANAGER step when employee has no manager
        if (step.type === "MANAGER" && !employee.managerId) continue;
        sequence += 1;
        await tx.leaveApprovalStep.create({
          data: {
            requestId: created.id,
            sequence,
            approverType: step.type,
            roleName: step.type === "ROLE" ? step.role : null,
            approverEmployeeId: step.type === "MANAGER" ? employee.managerId : null,
          },
        });
      }
      if (sequence === 0) {
        // nobody to approve (e.g. top of hierarchy + manager-only chain) → auto-approve
        await tx.leaveRequest.update({
          where: { id: created.id },
          data: { status: "APPROVED", actedAt: new Date() },
        });
        await tx.leaveBalance.update({
          where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year } },
          data: { used: { increment: days } },
        });
        return tx.leaveRequest.findUniqueOrThrow({ where: { id: created.id }, include: REQUEST_INCLUDE });
      }

      if (leaveType.code !== "LOP") {
        await tx.leaveBalance.update({
          where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year } },
          data: { pending: { increment: days } },
        });
      }
      return tx.leaveRequest.findUniqueOrThrow({ where: { id: created.id }, include: REQUEST_INCLUDE });
    });

    audit({ action: "leave.apply", entity: "LeaveRequest", entityId: request.id, after: { days, type: leaveType.code }, req });
    if (request.status === "PENDING") {
      await notifyStepActors(
        request.id, 1,
        `Leave request from ${employee.firstName} ${employee.lastName}`,
        `${leaveType.name} · ${days} day(s) · ${dayKey(input.startDate)} → ${dayKey(input.endDate)}`
      );
    }
    return request;
  },

  async myRequests(req: Request, year?: number) {
    const employee = await requireEmployee(req);
    return prisma.leaveRequest.findMany({
      where: {
        employeeId: employee.id,
        ...(year ? { startDate: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: REQUEST_INCLUDE,
      take: 100,
    });
  },

  async edit(req: Request, id: string, input: ApplyLeaveInput) {
    const employee = await requireEmployee(req);
    const existing = await prisma.leaveRequest.findFirst({
      where: { id, employeeId: employee.id },
      include: { leaveType: true },
    });
    if (!existing) throw new NotFoundError("Leave request");
    if (existing.status !== "PENDING") throw new BadRequestError("Only pending requests can be edited");

    // release pending balance, then re-apply as a fresh validation pass
    await this.cancel(req, id, true);
    const request = await this.apply(req, input);
    audit({ action: "leave.edit", entity: "LeaveRequest", entityId: request.id, before: { replaced: id }, req });
    return request;
  },

  async cancel(req: Request, id: string, silent = false) {
    const employee = await requireEmployee(req);
    const request = await prisma.leaveRequest.findFirst({
      where: { id, employeeId: employee.id },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundError("Leave request");
    if (!["PENDING", "APPROVED"].includes(request.status)) {
      throw new BadRequestError("This request can no longer be cancelled");
    }
    if (request.status === "APPROVED" && request.startDate <= new Date()) {
      throw new BadRequestError("Leave that has already started cannot be cancelled — contact HR");
    }

    const year = request.startDate.getFullYear();
    await prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
      if (request.leaveType.code !== "LOP") {
        await tx.leaveBalance.update({
          where: { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: request.leaveTypeId, year } },
          data:
            request.status === "PENDING"
              ? { pending: { decrement: request.days } }
              : { used: { decrement: request.days } },
        });
      }
    });

    if (!silent) {
      audit({ action: "leave.cancel", entity: "LeaveRequest", entityId: id, req });
      // tell pending approvers it's gone
      await notifyStepActors(id, request.currentStep, "Leave request cancelled", `${employee.firstName} ${employee.lastName} withdrew their request.`);
    }
  },

  /* ---------------- approvals ---------------- */

  /** Requests awaiting the CALLER's action (their manager step or their role step). */
  async pendingForApprover(req: Request) {
    const user = req.user!;
    const me = user.employeeId;
    const roles = user.roles;
    const steps = await prisma.leaveApprovalStep.findMany({
      where: {
        status: "PENDING",
        request: { status: "PENDING" },
        OR: [
          ...(me ? [{ approverType: "MANAGER", approverEmployeeId: me }] : []),
          { approverType: "ROLE", roleName: { in: roles } },
        ],
      },
      include: { request: { include: REQUEST_INCLUDE } },
      orderBy: { createdAt: "asc" },
    });
    // only steps whose turn it is
    return steps.filter((s) => s.sequence === s.request.currentStep).map((s) => ({ step: { id: s.id, sequence: s.sequence }, ...s.request }));
  },

  async decide(req: Request, requestId: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
    const user = req.user!;
    const request = await prisma.leaveRequest.findUnique({
      where: { id: requestId },
      include: { ...REQUEST_INCLUDE, leaveType: true },
    });
    if (!request || request.status !== "PENDING") throw new NotFoundError("Pending leave request");
    if (request.employee.userId === user.id) throw new BadRequestError("You cannot act on your own leave request");

    const step = request.steps.find((s) => s.sequence === request.currentStep && s.status === "PENDING");
    if (!step) throw new BadRequestError("No actionable step on this request");

    // authorization for this specific step
    const allowed =
      (step.approverType === "MANAGER" && step.approverEmployeeId === user.employeeId) ||
      (step.approverType === "ROLE" && step.roleName !== null && user.roles.includes(step.roleName)) ||
      user.roles.includes("SUPER_ADMIN");
    if (!allowed) throw new ForbiddenError("This request is not awaiting your approval");

    const year = request.startDate.getFullYear();
    const isLastStep = request.currentStep >= Math.max(...request.steps.map((s) => s.sequence));

    await prisma.$transaction(async (tx) => {
      await tx.leaveApprovalStep.update({
        where: { id: step.id },
        data: { status: decision, actedBy: user.id, actedAt: new Date(), remarks: remarks ?? null },
      });

      if (decision === "REJECTED") {
        await tx.leaveRequest.update({
          where: { id: requestId },
          data: { status: "REJECTED", actedAt: new Date(), approverRemarks: remarks ?? null, approverId: user.employeeId ?? null },
        });
        if (request.leaveType.code !== "LOP") {
          await tx.leaveBalance.update({
            where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
            data: { pending: { decrement: request.days } },
          });
        }
        return;
      }

      if (isLastStep) {
        await tx.leaveRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", actedAt: new Date(), approverRemarks: remarks ?? null, approverId: user.employeeId ?? null, moreInfoNote: null },
        });
        if (request.leaveType.code !== "LOP") {
          await tx.leaveBalance.update({
            where: { employeeId_leaveTypeId_year: { employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year } },
            data: { pending: { decrement: request.days }, used: { increment: request.days } },
          });
        }
      } else {
        await tx.leaveRequest.update({
          where: { id: requestId },
          data: { currentStep: request.currentStep + 1, moreInfoNote: null },
        });
      }
    });

    audit({
      action: decision === "APPROVED" ? "leave.approve" : "leave.reject",
      entity: "LeaveRequest", entityId: requestId,
      after: { step: step.sequence, decision, remarks }, req,
    });

    // notifications
    if (request.employee.userId) {
      const final = decision === "REJECTED" || isLastStep;
      await notify({
        userId: request.employee.userId,
        type: decision === "APPROVED" ? "SUCCESS" : "WARNING",
        title: final
          ? `Leave ${decision === "APPROVED" ? "approved" : "rejected"}`
          : "Leave approved — moving to next approver",
        body: `${request.leaveType.name} · ${request.days} day(s)${remarks ? ` · "${remarks}"` : ""}`,
        link: "/leave",
        entity: "LeaveRequest", entityId: requestId,
      });
      // email the employee only on the final outcome (not intermediate steps)
      if (final) {
        const acct = await prisma.user.findUnique({ where: { id: request.employee.userId }, select: { email: true } });
        if (acct?.email) {
          mailService.sendLeaveDecision(acct.email, request.employee.firstName, {
            leaveType: request.leaveType.name,
            status: decision,
            startDate: request.startDate.toISOString().slice(0, 10),
            endDate: request.endDate.toISOString().slice(0, 10),
            days: request.days,
            note: remarks ?? null,
          });
        }
      }
    }
    if (decision === "APPROVED" && !isLastStep) {
      await notifyStepActors(
        requestId, request.currentStep + 1,
        `Leave request from ${request.employee.firstName} ${request.employee.lastName}`,
        `${request.leaveType.name} · ${request.days} day(s) — awaiting your approval`
      );
    }

    return prisma.leaveRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
  },

  async requestMoreInfo(req: Request, requestId: string, note: string) {
    const request = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
    if (!request || request.status !== "PENDING") throw new NotFoundError("Pending leave request");
    await prisma.leaveRequest.update({ where: { id: requestId }, data: { moreInfoNote: note } });
    audit({ action: "leave.request_info", entity: "LeaveRequest", entityId: requestId, after: { note }, req });
    if (request.employee.userId) {
      await notify({
        userId: request.employee.userId,
        type: "INFO",
        title: "More information requested on your leave",
        body: note,
        link: "/leave",
        entity: "LeaveRequest", entityId: requestId,
      });
    }
    return prisma.leaveRequest.findUnique({ where: { id: requestId }, include: REQUEST_INCLUDE });
  },

  async bulkApprove(req: Request, requestIds: string[], remarks?: string) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of requestIds) {
      try {
        await this.decide(req, id, "APPROVED", remarks);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : "failed" });
      }
    }
    return results;
  },

  /* ---------------- calendars & holidays ---------------- */

  async calendar(req: Request, month: number, year: number, scope: "team" | "org") {
    const me = await requireEmployee(req);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    let employeeFilter: Prisma.LeaveRequestWhereInput = {};
    if (scope === "team") {
      // my manager's team (peers) + my reports + me
      const teamIds = new Set<string>([me.id]);
      if (me.managerId) {
        const peers = await prisma.employee.findMany({ where: { managerId: me.managerId, deletedAt: null }, select: { id: true } });
        peers.forEach((p) => teamIds.add(p.id));
        teamIds.add(me.managerId);
      }
      const reports = await prisma.employee.findMany({ where: { managerId: me.id, deletedAt: null }, select: { id: true } });
      reports.forEach((r) => teamIds.add(r.id));
      employeeFilter = { employeeId: { in: [...teamIds] } };
    }

    const [requests, holidays] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          ...employeeFilter,
          status: { in: ["APPROVED", "PENDING"] },
          startDate: { lte: end },
          endDate: { gte: start },
        },
        include: {
          leaveType: { select: { name: true, code: true, colorHex: true } },
          employee: { select: { id: true, firstName: true, lastName: true, photoUrl: true, department: { select: { name: true } } } },
        },
      }),
      prisma.holiday.findMany({ where: { date: { gte: start, lte: end } }, orderBy: { date: "asc" } }),
    ]);
    return { requests, holidays };
  },

  async listHolidays(year: number) {
    return prisma.holiday.findMany({
      where: { date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } },
      orderBy: { date: "asc" },
      include: { calendar: { select: { name: true } } },
    });
  },

  async addHoliday(req: Request, input: { name: string; date: Date; isOptional: boolean }) {
    const year = input.date.getFullYear();
    let calendar = await prisma.holidayCalendar.findFirst({ where: { year, isDefault: true } });
    calendar ??= await prisma.holidayCalendar.create({ data: { name: "Company Holidays", year, isDefault: true } });
    const holiday = await prisma.holiday.create({ data: { ...input, calendarId: calendar.id } });
    audit({ action: "leave.holiday_add", entity: "Holiday", entityId: holiday.id, after: holiday, req });
    return holiday;
  },

  async removeHoliday(req: Request, id: string) {
    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundError("Holiday");
    await prisma.holiday.delete({ where: { id } });
    audit({ action: "leave.holiday_remove", entity: "Holiday", entityId: id, before: holiday, req });
  },

  /* ---------------- workflow config ---------------- */

  async getWorkflow() {
    return prisma.workflowConfig.findUnique({ where: { key: "leave_approval" } });
  },

  async setWorkflow(req: Request, steps: WorkflowStep[]) {
    const config = await prisma.workflowConfig.upsert({
      where: { key: "leave_approval" },
      create: { key: "leave_approval", name: "Leave Approval Chain", steps, updatedBy: req.user!.id },
      update: { steps, updatedBy: req.user!.id },
    });
    audit({ action: "leave.workflow_update", entity: "WorkflowConfig", entityId: config.id, after: { steps }, req });
    return config;
  },
};
