import type { Request } from "express";
import { prisma } from "../../config/db.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../core/errors.js";
import { audit } from "../audit/audit.service.js";
import { notify, notifyMany } from "../notifications/notifications.service.js";
import { mailService } from "../notifications/mail.service.js";
import type { AttendanceStatus, Prisma } from "../../generated/prisma/client.js";
import type { CorrectionRequestInput, ManualMarkInput, PunchInput } from "./attendance.schema.js";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function requireEmployee(req: Request) {
  const employeeId = req.user?.employeeId;
  if (!employeeId) throw new ForbiddenError("No employee profile linked to this account");
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    include: { manager: { select: { id: true, userId: true } } },
  });
  if (!employee) throw new NotFoundError("Employee");
  return employee;
}

/** Local calendar date at midnight (attendance day key). */
function localDate(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The shift effective for an employee on a date (assignment, else General). */
async function effectiveShift(employeeId: string, date: Date) {
  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: { shift: true },
  });
  if (assignment) return assignment.shift;
  return prisma.shift.findFirst({ where: { name: "General", isActive: true } });
}

function shiftTime(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m ?? 0);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

async function recompute(recordId: string): Promise<void> {
  const record = await prisma.attendanceRecord.findUnique({ where: { id: recordId }, include: { breaks: true } });
  if (!record?.checkInAt) return;
  const breakMinutes = record.breaks.reduce(
    (sum, b) => sum + (b.endAt ? minutesBetween(b.startAt, b.endAt) : 0),
    0
  );
  let workMinutes = 0;
  let status: AttendanceStatus = record.status;
  let isEarlyOut = false;

  const shift = await effectiveShift(record.employeeId, record.date);
  const isLate = shift
    ? record.checkInAt > new Date(shiftTime(record.date, shift.startTime).getTime() + shift.graceMinutes * 60000)
    : false;

  if (record.checkOutAt) {
    workMinutes = Math.max(0, minutesBetween(record.checkInAt, record.checkOutAt) - breakMinutes);
    status = workMinutes < 270 ? "HALF_DAY" : "PRESENT"; // < 4.5h → half day
    if (shift) isEarlyOut = record.checkOutAt < shiftTime(record.date, shift.endTime);
  } else {
    status = "PRESENT";
  }

  await prisma.attendanceRecord.update({
    where: { id: recordId },
    data: { breakMinutes, workMinutes, status, isLate, isEarlyOut },
  });
}

/** Which Saturday of the month is this (1..5)? Same as the Nth-Saturday ordinal. */
function saturdayOrdinal(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/** A department's working Saturdays, normalised to a number[] (e.g. [2,4]). */
async function workingSaturdaysFor(employeeId: string): Promise<number[]> {
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { department: { select: { workingSaturdays: true } } } });
  const ws = e?.department?.workingSaturdays;
  return Array.isArray(ws) ? (ws as number[]) : [];
}

/** Effective status for a day with no punch record. Sundays are always off;
 *  Saturdays are off UNLESS the employee's department marks that Saturday working. */
async function backgroundStatus(employeeId: string, date: Date, holidays: Set<string>, workingSaturdays: number[] = []): Promise<AttendanceStatus | "FUTURE"> {
  const dow = date.getDay();
  if (holidays.has(dayKey(date))) return "HOLIDAY";
  if (dow === 0) return "WEEK_OFF"; // Sunday — always off
  if (dow === 6 && !workingSaturdays.includes(saturdayOrdinal(date))) return "WEEK_OFF"; // non-working Saturday
  const leave = await prisma.leaveRequest.findFirst({
    where: { employeeId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
    select: { id: true },
  });
  if (leave) return "ON_LEAVE"; // shows upcoming approved leave on the calendar too
  return date > localDate() ? "FUTURE" : "ABSENT";
}

async function holidaysFor(year: number): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) }, isOptional: false },
    select: { date: true },
  });
  return new Set(rows.map((h) => dayKey(h.date)));
}

/* ------------------------------------------------------------------ */
/* service                                                             */
/* ------------------------------------------------------------------ */

export const attendanceService = {
  /** Today's live state for the punch card UI. */
  async today(req: Request) {
    const employee = await requireEmployee(req);
    const date = localDate();
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
      include: { breaks: { orderBy: { startAt: "asc" } } },
    });
    const shift = await effectiveShift(employee.id, date);
    const activeBreak = record?.breaks.find((b) => !b.endAt) ?? null;
    return {
      date,
      shift: shift ? { name: shift.name, startTime: shift.startTime, endTime: shift.endTime } : null,
      record,
      activeBreak,
      onLeaveToday: !record
        ? (await backgroundStatus(employee.id, date, await holidaysFor(date.getFullYear()), await workingSaturdaysFor(employee.id))) === "ON_LEAVE"
        : false,
    };
  },

  async checkIn(req: Request, input: PunchInput) {
    const employee = await requireEmployee(req);
    const date = localDate();
    const existing = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
    });
    if (existing?.checkInAt) throw new BadRequestError("You have already checked in today");

    const now = new Date();
    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      create: {
        employeeId: employee.id,
        date,
        checkInAt: now,
        checkInSource: input.source,
        checkInLat: input.latitude ?? null,
        checkInLng: input.longitude ?? null,
        status: "PRESENT",
      },
      update: {
        checkInAt: now,
        checkInSource: input.source,
        checkInLat: input.latitude ?? null,
        checkInLng: input.longitude ?? null,
        status: "PRESENT",
      },
    });
    await recompute(record.id);
    audit({ action: "attendance.check_in", entity: "AttendanceRecord", entityId: record.id, after: { source: input.source }, req });
    return this.today(req);
  },

  async checkOut(req: Request, input: PunchInput) {
    const employee = await requireEmployee(req);
    const date = localDate();
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
      include: { breaks: true },
    });
    if (!record?.checkInAt) throw new BadRequestError("Check in first");
    if (record.checkOutAt) throw new BadRequestError("You have already checked out today");
    if (record.breaks.some((b) => !b.endAt)) throw new BadRequestError("End your active break before checking out");

    await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt: new Date(),
        checkOutSource: input.source,
        checkOutLat: input.latitude ?? null,
        checkOutLng: input.longitude ?? null,
      },
    });
    await recompute(record.id);
    audit({ action: "attendance.check_out", entity: "AttendanceRecord", entityId: record.id, req });
    return this.today(req);
  },

  async startBreak(req: Request) {
    const employee = await requireEmployee(req);
    const date = localDate();
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
      include: { breaks: true },
    });
    if (!record?.checkInAt) throw new BadRequestError("Check in first");
    if (record.checkOutAt) throw new BadRequestError("You have already checked out");
    if (record.breaks.some((b) => !b.endAt)) throw new BadRequestError("A break is already running");
    await prisma.breakLog.create({ data: { attendanceId: record.id, startAt: new Date() } });
    return this.today(req);
  },

  async endBreak(req: Request) {
    const employee = await requireEmployee(req);
    const date = localDate();
    const record = await prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: employee.id, date } },
      include: { breaks: true },
    });
    const active = record?.breaks.find((b) => !b.endAt);
    if (!record || !active) throw new BadRequestError("No active break");
    await prisma.breakLog.update({ where: { id: active.id }, data: { endAt: new Date() } });
    await recompute(record.id);
    return this.today(req);
  },

  /** Month calendar + summary for the caller. */
  async myMonth(req: Request, month: number, year: number) {
    const employee = await requireEmployee(req);
    return this.monthFor(employee.id, month, year);
  },

  async monthFor(employeeId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const holidays = await holidaysFor(year);
    const workingSats = await workingSaturdaysFor(employeeId);

    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: start, lte: end } },
    });
    const byDay = new Map(records.map((r) => [dayKey(r.date), r]));

    const days: Array<{
      date: string;
      status: AttendanceStatus | "FUTURE";
      checkInAt: Date | null;
      checkOutAt: Date | null;
      workMinutes: number;
      isLate: boolean;
    }> = [];
    const summary = { present: 0, absent: 0, halfDay: 0, onLeave: 0, wfh: 0, late: 0, workMinutes: 0, workingDays: 0 };

    for (let d = 1; d <= end.getDate(); d++) {
      const date = new Date(year, month - 1, d);
      const key = dayKey(date);
      const record = byDay.get(key);
      const status = record ? record.status : await backgroundStatus(employeeId, date, holidays, workingSats);

      days.push({
        date: key,
        status,
        checkInAt: record?.checkInAt ?? null,
        checkOutAt: record?.checkOutAt ?? null,
        workMinutes: record?.workMinutes ?? 0,
        isLate: record?.isLate ?? false,
      });

      if (status !== "FUTURE" && status !== "WEEK_OFF" && status !== "HOLIDAY") summary.workingDays += 1;
      if (status === "PRESENT" || status === "WORK_FROM_HOME") summary.present += 1;
      if (status === "WORK_FROM_HOME") summary.wfh += 1;
      if (status === "HALF_DAY") summary.halfDay += 1;
      if (status === "ABSENT") summary.absent += 1;
      if (status === "ON_LEAVE") summary.onLeave += 1;
      if (record?.isLate) summary.late += 1;
      summary.workMinutes += record?.workMinutes ?? 0;
    }
    return { days, summary };
  },

  /* ---------------- corrections ---------------- */

  async requestCorrection(req: Request, input: CorrectionRequestInput) {
    const employee = await requireEmployee(req);
    const date = localDate(input.date);
    if (date > localDate()) throw new BadRequestError("Cannot correct a future date");

    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      create: { employeeId: employee.id, date, status: "ABSENT" },
      update: {},
    });
    const open = await prisma.attendanceCorrection.findFirst({
      where: { attendanceId: record.id, status: "PENDING" },
    });
    if (open) throw new BadRequestError("A correction for this day is already pending");

    const correction = await prisma.attendanceCorrection.create({
      data: {
        attendanceId: record.id,
        requesterId: employee.id,
        requestedCheckIn: input.requestedCheckIn ?? null,
        requestedCheckOut: input.requestedCheckOut ?? null,
        reason: input.reason,
      },
    });
    audit({ action: "attendance.correction_request", entity: "AttendanceCorrection", entityId: correction.id, after: correction, req });

    // notify manager + HR admins
    const targets: string[] = [];
    if (employee.manager?.userId) targets.push(employee.manager.userId);
    const hr = await prisma.user.findMany({
      where: { status: "ACTIVE", roles: { some: { role: { name: "HR_ADMIN" } } } },
      select: { id: true },
    });
    targets.push(...hr.map((u) => u.id));
    await notifyMany([...new Set(targets)], {
      type: "APPROVAL",
      title: `Attendance correction from ${employee.firstName} ${employee.lastName}`,
      body: `${dayKey(date)} — ${input.reason.slice(0, 120)}`,
      link: "/attendance?tab=team",
    });
    return correction;
  },

  async myCorrections(req: Request) {
    const employee = await requireEmployee(req);
    return prisma.attendanceCorrection.findMany({
      where: { requesterId: employee.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { attendance: { select: { date: true } } },
    });
  },

  /** Corrections awaiting the caller (their reports, or all with attendance:manage scope). */
  async pendingCorrections(req: Request, orgWide: boolean) {
    const where: Prisma.AttendanceCorrectionWhereInput = { status: "PENDING" };
    if (!orgWide) {
      if (!req.user?.employeeId) return [];
      where.requester = { managerId: req.user.employeeId };
    }
    return prisma.attendanceCorrection.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        attendance: { select: { date: true, checkInAt: true, checkOutAt: true } },
        requester: {
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true,
            department: { select: { name: true } },
          },
        },
      },
    });
  },

  async decideCorrection(req: Request, id: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
    const correction = await prisma.attendanceCorrection.findUnique({
      where: { id },
      include: { attendance: true, requester: { select: { id: true, userId: true, managerId: true, firstName: true } } },
    });
    if (!correction || correction.status !== "PENDING") throw new NotFoundError("Pending correction");
    if (correction.requester.userId === req.user?.id) throw new BadRequestError("You cannot act on your own correction");

    // manager of requester OR org-wide approver (route already checks permission)
    const isManager = correction.requester.managerId === req.user?.employeeId;
    const orgWide = req.user!.roles.some((r) => ["SUPER_ADMIN", "HR_ADMIN", "HR_EXECUTIVE"].includes(r));
    if (!isManager && !orgWide) throw new ForbiddenError("This correction is not awaiting your approval");

    await prisma.$transaction(async (tx) => {
      await tx.attendanceCorrection.update({
        where: { id },
        data: { status: decision, approverId: req.user!.id, actedAt: new Date(), remarks: remarks ?? null },
      });
      if (decision === "APPROVED") {
        await tx.attendanceRecord.update({
          where: { id: correction.attendanceId },
          data: {
            ...(correction.requestedCheckIn ? { checkInAt: correction.requestedCheckIn, checkInSource: "MANUAL" } : {}),
            ...(correction.requestedCheckOut ? { checkOutAt: correction.requestedCheckOut, checkOutSource: "MANUAL" } : {}),
          },
        });
      }
    });
    if (decision === "APPROVED") await recompute(correction.attendanceId);

    audit({ action: `attendance.correction_${decision.toLowerCase()}`, entity: "AttendanceCorrection", entityId: id, after: { decision, remarks }, req });
    if (correction.requester.userId) {
      await notify({
        userId: correction.requester.userId,
        type: decision === "APPROVED" ? "SUCCESS" : "WARNING",
        title: `Attendance correction ${decision.toLowerCase()}`,
        body: remarks ?? `For ${dayKey(correction.attendance.date)}`,
        link: "/attendance",
      });
      const acct = await prisma.user.findUnique({ where: { id: correction.requester.userId }, select: { email: true } });
      if (acct?.email) {
        mailService.sendAttendanceCorrection(acct.email, correction.requester.firstName, {
          date: dayKey(correction.attendance.date),
          status: decision,
          note: remarks ?? null,
        });
      }
    }
    return prisma.attendanceCorrection.findUnique({ where: { id } });
  },

  /* ---------------- team / org views ---------------- */

  /** Day roster: every in-scope employee with their effective status for a date. */
  async dayView(req: Request, date: Date, departmentId: string | undefined, orgWide: boolean) {
    const day = localDate(date);
    const holidays = await holidaysFor(day.getFullYear());

    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      status: { in: ["ONBOARDING", "PROBATION", "ACTIVE"] },
      ...(departmentId ? { departmentId } : {}),
    };
    if (!orgWide) {
      if (!req.user?.employeeId) return { date: dayKey(day), rows: [], counts: null };
      where.managerId = req.user.employeeId;
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true,
        department: { select: { name: true, workingSaturdays: true } }, designation: { select: { title: true } },
      },
      orderBy: { firstName: "asc" },
      take: 500,
    });

    const records = await prisma.attendanceRecord.findMany({
      where: { date: day, employeeId: { in: employees.map((e) => e.id) } },
    });
    const recordByEmp = new Map(records.map((r) => [r.employeeId, r]));

    const rows = [];
    const counts = { present: 0, absent: 0, late: 0, onLeave: 0, halfDay: 0, wfh: 0, notMarked: 0 };
    for (const employee of employees) {
      const record = recordByEmp.get(employee.id);
      const empSats = Array.isArray(employee.department?.workingSaturdays) ? (employee.department!.workingSaturdays as number[]) : [];
      const status = record ? record.status : await backgroundStatus(employee.id, day, holidays, empSats);
      if (status === "PRESENT" || status === "WORK_FROM_HOME") counts.present += 1;
      if (status === "WORK_FROM_HOME") counts.wfh += 1;
      if (status === "ABSENT") counts.absent += 1;
      if (status === "ON_LEAVE") counts.onLeave += 1;
      if (status === "HALF_DAY") counts.halfDay += 1;
      if (record?.isLate) counts.late += 1;
      rows.push({
        employee,
        status,
        checkInAt: record?.checkInAt ?? null,
        checkOutAt: record?.checkOutAt ?? null,
        workMinutes: record?.workMinutes ?? 0,
        isLate: record?.isLate ?? false,
      });
    }
    return { date: dayKey(day), rows, counts };
  },

  /** HR manual marking. */
  async manualMark(req: Request, input: ManualMarkInput) {
    const date = localDate(input.date);
    const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } });
    if (!employee) throw new NotFoundError("Employee");

    const record = await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId: employee.id, date } },
      create: {
        employeeId: employee.id,
        date,
        status: input.status,
        checkInAt: input.checkInAt ?? null,
        checkOutAt: input.checkOutAt ?? null,
        checkInSource: input.checkInAt ? "MANUAL" : null,
        checkOutSource: input.checkOutAt ? "MANUAL" : null,
        remarks: input.remarks ?? null,
      },
      update: {
        status: input.status,
        ...(input.checkInAt !== undefined ? { checkInAt: input.checkInAt, checkInSource: "MANUAL" } : {}),
        ...(input.checkOutAt !== undefined ? { checkOutAt: input.checkOutAt, checkOutSource: "MANUAL" } : {}),
        remarks: input.remarks ?? null,
      },
    });
    if (record.checkInAt && record.checkOutAt) await recompute(record.id);
    audit({ action: "attendance.manual_mark", entity: "AttendanceRecord", entityId: record.id, after: input, req });
    return record;
  },

  /** CSV export of a month for the caller's scope. */
  async exportCsv(req: Request, month: number, year: number, orgWide: boolean): Promise<string> {
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      status: { in: ["ONBOARDING", "PROBATION", "ACTIVE"] },
    };
    if (!orgWide && req.user?.employeeId) where.managerId = req.user.employeeId;

    const employees = await prisma.employee.findMany({
      where,
      select: { id: true, employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: { employeeCode: "asc" },
      take: 1000,
    });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Code", "Name", "Department", "Working Days", "Present", "Half Days", "On Leave", "Absent", "Late", "Hours"].map(esc).join(","),
    ];
    for (const employee of employees) {
      const { summary } = await this.monthFor(employee.id, month, year);
      lines.push(
        [
          employee.employeeCode,
          `${employee.firstName} ${employee.lastName}`,
          employee.department?.name,
          summary.workingDays,
          summary.present,
          summary.halfDay,
          summary.onLeave,
          summary.absent,
          summary.late,
          Math.round((summary.workMinutes / 60) * 10) / 10,
        ].map(esc).join(",")
      );
    }
    return lines.join("\r\n");
  },

  /* ---------------- shifts ---------------- */

  async listShifts() {
    return prisma.shift.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { assignments: true } } },
    });
  },

  async createShift(req: Request, input: { name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; isNightShift: boolean }) {
    const shift = await prisma.shift.create({ data: input });
    audit({ action: "attendance.shift_create", entity: "Shift", entityId: shift.id, after: shift, req });
    return shift;
  },

  async assignShift(req: Request, input: { employeeId: string; shiftId: string; effectiveFrom: Date }) {
    const [employee, shift] = await Promise.all([
      prisma.employee.findFirst({ where: { id: input.employeeId, deletedAt: null } }),
      prisma.shift.findUnique({ where: { id: input.shiftId } }),
    ]);
    if (!employee) throw new NotFoundError("Employee");
    if (!shift) throw new NotFoundError("Shift");

    const assignment = await prisma.$transaction(async (tx) => {
      await tx.shiftAssignment.updateMany({
        where: { employeeId: input.employeeId, effectiveTo: null },
        data: { effectiveTo: input.effectiveFrom },
      });
      return tx.shiftAssignment.create({ data: { ...input } });
    });
    audit({ action: "attendance.shift_assign", entity: "ShiftAssignment", entityId: assignment.id, after: input, req });
    return assignment;
  },
};
