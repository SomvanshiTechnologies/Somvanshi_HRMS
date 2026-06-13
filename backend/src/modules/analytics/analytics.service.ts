import { prisma } from "../../config/db.js";

const ACTIVE_STATUSES = ["ONBOARDING", "PROBATION", "ACTIVE"] as const;

function monthWindow(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  const label = start.toLocaleString("en", { month: "short", year: "2-digit" });
  return { start, end, label };
}

export const analyticsService = {
  /**
   * Executive overview — all KPI cards in one call.
   * Every figure is computed from live rows; nothing is precomputed or static.
   */
  async overview() {
    const { start: monthStart, end: monthEnd } = monthWindow(0);
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const today = new Date(new Date().toDateString());

    const [
      totalEmployees,
      activeEmployees,
      newJoinersThisMonth,
      exitsThisYear,
      headcountYearStart,
      openPositions,
      presentToday,
      onLeaveToday,
      pendingLeaveRequests,
      payrollAgg,
      leaveAgg,
    ] = await prisma.$transaction([
      prisma.employee.count({ where: { deletedAt: null, status: { not: "CANDIDATE" } } }),
      prisma.employee.count({ where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } } }),
      prisma.employee.count({
        where: { deletedAt: null, dateOfJoining: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.employee.count({
        where: { deletedAt: null, exitedAt: { gte: yearStart }, status: { in: ["RESIGNED", "TERMINATED", "ALUMNI"] } },
      }),
      prisma.employee.count({
        where: {
          deletedAt: null,
          OR: [{ dateOfJoining: { lt: yearStart } }, { dateOfJoining: null }],
          AND: [{ OR: [{ exitedAt: null }, { exitedAt: { gte: yearStart } }] }],
        },
      }),
      prisma.jobRequisition.count({ where: { status: "OPEN" } }),
      prisma.attendanceRecord.count({
        where: { date: today, status: { in: ["PRESENT", "WORK_FROM_HOME", "HALF_DAY"] } },
      }),
      prisma.attendanceRecord.count({ where: { date: today, status: "ON_LEAVE" } }),
      prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      prisma.payslip.aggregate({
        _sum: { netPay: true },
        where: { month: monthStart.getMonth() === 0 ? 12 : monthStart.getMonth(), year: monthStart.getMonth() === 0 ? monthStart.getFullYear() - 1 : monthStart.getFullYear() },
      }),
      prisma.leaveBalance.aggregate({
        _sum: { entitled: true, used: true },
        where: { year: new Date().getFullYear() },
      }),
    ]);

    const avgHeadcount = (headcountYearStart + activeEmployees) / 2 || 1;
    const attritionRate = Math.round((exitsThisYear / avgHeadcount) * 1000) / 10;
    const attendancePct = activeEmployees > 0 ? Math.round((presentToday / activeEmployees) * 1000) / 10 : 0;
    const entitled = Number(leaveAgg._sum.entitled ?? 0);
    const used = Number(leaveAgg._sum.used ?? 0);

    return {
      totalEmployees,
      activeEmployees,
      newJoinersThisMonth,
      attritionRate, // % YTD annualizable
      payrollCostLastMonth: Number(payrollAgg._sum.netPay ?? 0),
      openPositions,
      attendancePctToday: attendancePct,
      presentToday,
      onLeaveToday,
      pendingLeaveRequests,
      leaveUtilizationPct: entitled > 0 ? Math.round((used / entitled) * 1000) / 10 : 0,
    };
  },

  /** Month-end headcount for the trailing N months. */
  async headcountTrend(months = 12) {
    const points: { month: string; headcount: number; joiners: number; exits: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const { start, end, label } = monthWindow(i);
      const [headcount, joiners, exits] = await prisma.$transaction([
        prisma.employee.count({
          where: {
            deletedAt: null,
            OR: [{ dateOfJoining: { lt: end } }, { dateOfJoining: null }],
            AND: [{ OR: [{ exitedAt: null }, { exitedAt: { gte: end } }] }],
            status: { not: "CANDIDATE" },
          },
        }),
        prisma.employee.count({ where: { deletedAt: null, dateOfJoining: { gte: start, lt: end } } }),
        prisma.employee.count({ where: { deletedAt: null, exitedAt: { gte: start, lt: end } } }),
      ]);
      points.push({ month: label, headcount, joiners, exits });
    }
    return points;
  },

  /** Applications and joins per month → hiring funnel trend. */
  async hiringTrend(months = 12) {
    const points: { month: string; applications: number; offers: number; joined: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const { start, end, label } = monthWindow(i);
      const [applications, offers, joined] = await prisma.$transaction([
        prisma.application.count({ where: { createdAt: { gte: start, lt: end } } }),
        prisma.offer.count({ where: { createdAt: { gte: start, lt: end } } }),
        prisma.application.count({ where: { stage: "JOINED", stageUpdatedAt: { gte: start, lt: end } } }),
      ]);
      points.push({ month: label, applications, offers, joined });
    }
    return points;
  },

  /** Net payroll cost per month from published payslips. */
  async payrollTrend(months = 12) {
    const points: { month: string; gross: number; net: number; deductions: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const { start, label } = monthWindow(i);
      const agg = await prisma.payslip.aggregate({
        _sum: { grossEarnings: true, netPay: true, totalDeductions: true },
        where: { month: start.getMonth() + 1, year: start.getFullYear() },
      });
      points.push({
        month: label,
        gross: Number(agg._sum.grossEarnings ?? 0),
        net: Number(agg._sum.netPay ?? 0),
        deductions: Number(agg._sum.totalDeductions ?? 0),
      });
    }
    return points;
  },

  /** Monthly exits and rolling attrition %. */
  async attritionTrend(months = 12) {
    const points: { month: string; exits: number; attritionPct: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const { start, end, label } = monthWindow(i);
      const [exits, headcount] = await prisma.$transaction([
        prisma.employee.count({ where: { deletedAt: null, exitedAt: { gte: start, lt: end } } }),
        prisma.employee.count({
          where: {
            deletedAt: null,
            OR: [{ dateOfJoining: { lt: end } }, { dateOfJoining: null }],
            AND: [{ OR: [{ exitedAt: null }, { exitedAt: { gte: start } }] }],
            status: { not: "CANDIDATE" },
          },
        }),
      ]);
      points.push({ month: label, exits, attritionPct: headcount ? Math.round((exits / headcount) * 1000) / 10 : 0 });
    }
    return points;
  },

  /**
   * Birthdays + work anniversaries within the next `windowDays`, from live
   * dateOfBirth / dateOfJoining values. Powers dashboard widgets and badges.
   */
  async celebrations(windowDays = 14) {
    const employees = await prisma.employee.findMany({
      where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
      select: {
        id: true, firstName: true, lastName: true, photoUrl: true,
        dateOfBirth: true, dateOfJoining: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
      },
    });

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const nextOccurrence = (date: Date): Date => {
      const next = new Date(today.getFullYear(), date.getMonth(), date.getDate());
      if (next < startOfToday) next.setFullYear(next.getFullYear() + 1);
      return next;
    };
    const inWindow = (next: Date): boolean =>
      (next.getTime() - startOfToday.getTime()) / 86400000 < windowDays;
    const isToday = (next: Date): boolean => next.getTime() === startOfToday.getTime();

    const birthdays = employees
      .filter((e) => e.dateOfBirth)
      .map((e) => {
        const next = nextOccurrence(e.dateOfBirth!);
        return { employee: e, date: next, isToday: isToday(next) };
      })
      .filter((b) => inWindow(b.date))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(({ employee, date, isToday: t }) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        photoUrl: employee.photoUrl,
        department: employee.department?.name ?? null,
        designation: employee.designation?.title ?? null,
        date,
        isToday: t,
      }));

    const anniversaries = employees
      .filter((e) => e.dateOfJoining)
      .map((e) => {
        const next = nextOccurrence(e.dateOfJoining!);
        const years = next.getFullYear() - e.dateOfJoining!.getFullYear();
        return { employee: e, date: next, years, isToday: isToday(next) };
      })
      .filter((a) => inWindow(a.date) && a.years >= 1)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(({ employee, date, years, isToday: t }) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        photoUrl: employee.photoUrl,
        department: employee.department?.name ?? null,
        designation: employee.designation?.title ?? null,
        date,
        years,
        isToday: t,
        isMilestone: [1, 3, 5, 10, 15, 20].includes(years),
      }));

    return { birthdays, anniversaries };
  },

  /** Leave days taken per month, split by leave type — stacked trend. */
  async leaveTrends(months = 6) {
    const points: Array<Record<string, string | number>> = [];
    const types = await prisma.leaveType.findMany({ where: { isActive: true }, select: { code: true } });
    for (let i = months - 1; i >= 0; i--) {
      const { start, end, label } = monthWindow(i);
      const requests = await prisma.leaveRequest.findMany({
        where: { status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
        select: { days: true, leaveType: { select: { code: true } } },
      });
      const row: Record<string, string | number> = { month: label };
      for (const t of types) row[t.code] = 0;
      for (const r of requests) row[r.leaveType.code] = (Number(row[r.leaveType.code]) || 0) + r.days;
      points.push(row);
    }
    return { types: types.map((t) => t.code), points };
  },

  /** Current recruitment pipeline funnel (counts per stage). */
  async hiringFunnel() {
    const stages = ["APPLIED", "SCREENING", "TECHNICAL", "MANAGERIAL", "HR", "OFFER", "JOINED"] as const;
    const grouped = await prisma.application.groupBy({ by: ["stage"], _count: true });
    const map = Object.fromEntries(grouped.map((g) => [g.stage, g._count]));
    return stages.map((stage) => ({ stage, count: map[stage] ?? 0 }));
  },

  /** Org attendance composition per month (present/absent/leave/WFH). */
  async attendanceTrend(months = 6) {
    const points: Array<{ month: string; present: number; absent: number; onLeave: number; wfh: number; halfDay: number }> = [];
    for (let i = months - 1; i >= 0; i--) {
      const { start, end, label } = monthWindow(i);
      const grouped = await prisma.attendanceRecord.groupBy({
        by: ["status"],
        where: { date: { gte: start, lt: end } },
        _count: true,
      });
      const m = Object.fromEntries(grouped.map((g) => [g.status, g._count]));
      points.push({
        month: label,
        present: (m["PRESENT"] ?? 0) + (m["WORK_FROM_HOME"] ?? 0),
        absent: m["ABSENT"] ?? 0,
        onLeave: m["ON_LEAVE"] ?? 0,
        wfh: m["WORK_FROM_HOME"] ?? 0,
        halfDay: m["HALF_DAY"] ?? 0,
      });
    }
    return points;
  },

  /** Per-department composition for the analytics grid. */
  async departmentAnalytics() {
    const departments = await prisma.department.findMany({
      select: {
        id: true,
        name: true,
        head: { select: { firstName: true, lastName: true } },
        employees: {
          where: { deletedAt: null, status: { in: [...ACTIVE_STATUSES] } },
          select: { id: true, gender: true, employmentType: true, dateOfJoining: true },
        },
      },
      orderBy: { name: "asc" },
    });
    const { start: monthStart } = monthWindow(0);
    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      head: d.head ? `${d.head.firstName} ${d.head.lastName}` : null,
      headcount: d.employees.length,
      newThisMonth: d.employees.filter((e) => e.dateOfJoining && e.dateOfJoining >= monthStart).length,
      fullTime: d.employees.filter((e) => e.employmentType === "FULL_TIME").length,
      interns: d.employees.filter((e) => e.employmentType === "INTERN").length,
    }));
  },
};
