// People Explorer — powers the modern org chart (department cards → team view →
// manager/employee detail). No tree rendering; pure aggregates over Employee.
import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../../config/db.js";
import { asyncHandler } from "../../shared/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/rbac.middleware.js";
import { PERMISSIONS } from "../../shared/permissions.js";
import { ok } from "../../core/http.js";
import { NotFoundError } from "../../core/errors.js";

const ACTIVE = ["ONBOARDING", "PROBATION", "ACTIVE"] as const;
const PERSON = { id: true, employeeCode: true, firstName: true, lastName: true, photoUrl: true, status: true, designation: { select: { title: true } }, department: { select: { id: true, name: true } }, location: { select: { name: true } } };

export const explorerRouter: Router = Router();
explorerRouter.use(requireAuth);
const canRead = requirePermission(PERMISSIONS.EMPLOYEES_READ, PERMISSIONS.EMPLOYEES_READ_ALL);

async function directReportCounts(employeeIds: string[]): Promise<Map<string, number>> {
  if (!employeeIds.length) return new Map();
  const grouped = await prisma.employee.groupBy({ by: ["managerId"], where: { managerId: { in: employeeIds }, deletedAt: null, status: { in: [...ACTIVE] } }, _count: true });
  return new Map(grouped.map((g) => [g.managerId as string, g._count]));
}

// ── overview: analytics + department cards ───────────────────────────────────
explorerRouter.get("/overview", canRead, asyncHandler(async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const [total, departments, managerGroups, newJoiners, deptRows] = await Promise.all([
    prisma.employee.count({ where: { deletedAt: null, status: { in: [...ACTIVE] } } }),
    prisma.department.findMany({ select: { id: true, name: true, code: true, headId: true } , orderBy: { name: "asc" } }),
    prisma.employee.groupBy({ by: ["managerId"], where: { managerId: { not: null }, deletedAt: null, status: { in: [...ACTIVE] } }, _count: true }),
    prisma.employee.count({ where: { deletedAt: null, status: { in: [...ACTIVE] }, dateOfJoining: { gte: since } } }),
    prisma.employee.groupBy({ by: ["departmentId"], where: { deletedAt: null, status: { in: [...ACTIVE] } }, _count: true }),
  ]);
  const managerCount = managerGroups.length; // distinct people who manage someone
  const countByDept = new Map(deptRows.map((d) => [d.departmentId, d._count]));
  const managersByDept = new Map<string, number>();

  // managers per department
  const managerIds = managerGroups.map((g) => g.managerId as string);
  const managerEmps = managerIds.length ? await prisma.employee.findMany({ where: { id: { in: managerIds } }, select: { id: true, departmentId: true } }) : [];
  for (const m of managerEmps) if (m.departmentId) managersByDept.set(m.departmentId, (managersByDept.get(m.departmentId) ?? 0) + 1);

  const heads = await prisma.employee.findMany({ where: { id: { in: departments.map((d) => d.headId).filter((x): x is string => Boolean(x)) } }, select: { id: true, firstName: true, lastName: true, photoUrl: true, designation: { select: { title: true } } } });
  const headById = new Map(heads.map((h) => [h.id, h]));

  const deptCards = departments.map((d) => ({
    id: d.id, name: d.name, code: d.code,
    headcount: countByDept.get(d.id) ?? 0,
    managerCount: managersByDept.get(d.id) ?? 0,
    head: d.headId ? headById.get(d.headId) ?? null : null,
  })).filter((d) => d.headcount > 0 || d.head);

  ok(res, {
    totals: { employees: total, departments: deptCards.length, managers: managerCount, individualContributors: Math.max(0, total - managerCount), newJoiners },
    departments: deptCards,
  });
}));

// ── department detail ────────────────────────────────────────────────────────
explorerRouter.get("/department/:id", canRead, asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const department = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true, code: true, headId: true } });
  if (!department) throw new NotFoundError("Department");
  const members = await prisma.employee.findMany({ where: { departmentId: id, deletedAt: null, status: { in: [...ACTIVE] } }, select: PERSON, orderBy: { firstName: "asc" } });
  const reportCounts = await directReportCounts(members.map((m) => m.id));
  const head = department.headId ? members.find((m) => m.id === department.headId) ?? null : null;

  // designation breakdown
  const breakdownMap = new Map<string, number>();
  for (const m of members) { const t = m.designation?.title ?? "Unassigned"; breakdownMap.set(t, (breakdownMap.get(t) ?? 0) + 1); }
  const designationBreakdown = [...breakdownMap.entries()].map(([title, count]) => ({ title, count })).sort((a, b) => b.count - a.count);

  // managers (members who have at least one direct report)
  const managers = members.filter((m) => (reportCounts.get(m.id) ?? 0) > 0).map((m) => ({ ...m, directReports: reportCounts.get(m.id) ?? 0 }));

  ok(res, {
    department, head, headcount: members.length,
    managers,
    members: members.map((m) => ({ ...m, directReports: reportCounts.get(m.id) ?? 0 })),
    designationBreakdown,
  });
}));

// ── manager detail (team stats + attendance + performance) ───────────────────
async function teamSize(rootId: string): Promise<number> {
  let frontier = [rootId]; let total = 0; let guard = 0;
  while (frontier.length && guard++ < 20) {
    const reports = await prisma.employee.findMany({ where: { managerId: { in: frontier }, deletedAt: null, status: { in: [...ACTIVE] } }, select: { id: true } });
    total += reports.length;
    frontier = reports.map((r) => r.id);
  }
  return total;
}

explorerRouter.get("/manager/:id", canRead, asyncHandler(async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const manager = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { ...PERSON, manager: { select: { id: true, firstName: true, lastName: true, photoUrl: true } } } });
  if (!manager) throw new NotFoundError("Employee");
  const directReports = await prisma.employee.findMany({ where: { managerId: id, deletedAt: null, status: { in: [...ACTIVE] } }, select: PERSON, orderBy: { firstName: "asc" } });
  const reportIds = directReports.map((r) => r.id);
  const nestedCounts = await directReportCounts(reportIds);
  const [indirectTotal] = await Promise.all([teamSize(id)]);

  // attendance summary for direct reports today
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  let attendance = { present: 0, onLeave: 0, notMarked: 0, total: reportIds.length };
  if (reportIds.length) {
    const [records, leaves] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { employeeId: { in: reportIds }, date: { gte: today, lt: tomorrow } }, select: { employeeId: true, status: true } }),
      prisma.leaveRequest.findMany({ where: { employeeId: { in: reportIds }, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today } }, select: { employeeId: true } }),
    ]);
    const present = new Set(records.filter((r) => ["PRESENT", "HALF_DAY", "WORK_FROM_HOME"].includes(r.status)).map((r) => r.employeeId));
    const onLeave = new Set([...leaves.map((l) => l.employeeId), ...records.filter((r) => r.status === "ON_LEAVE").map((r) => r.employeeId)]);
    attendance = { present: present.size, onLeave: onLeave.size, notMarked: Math.max(0, reportIds.length - present.size - onLeave.size), total: reportIds.length };
  }

  // performance summary — avg manager-review rating for reports in the latest non-draft cycle
  let performance: { avgRating: number | null; reviewed: number; total: number } = { avgRating: null, reviewed: 0, total: reportIds.length };
  if (reportIds.length) {
    const cycle = await prisma.appraisalCycle.findFirst({ where: { status: { in: ["ACTIVE", "REVIEW", "CALIBRATION", "CLOSED"] } }, orderBy: { startDate: "desc" } });
    if (cycle) {
      const reviews = await prisma.managerReview.findMany({ where: { cycleId: cycle.id, employeeId: { in: reportIds }, rating: { not: null } }, select: { rating: true } });
      const ratings = reviews.map((r) => r.rating as number);
      performance = { avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null, reviewed: ratings.length, total: reportIds.length };
    }
  }

  ok(res, {
    manager,
    directReports: directReports.map((r) => ({ ...r, directReports: nestedCounts.get(r.id) ?? 0 })),
    teamSize: indirectTotal,
    attendance,
    performance,
  });
}));
