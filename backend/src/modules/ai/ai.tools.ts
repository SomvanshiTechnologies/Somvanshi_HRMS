import type { Request } from "express";
import type OpenAI from "openai";
import { prisma } from "../../config/db.js";
import { resolvePermissions } from "../../middleware/rbac.middleware.js";
import { leaveService } from "../leave/leave.service.js";
import { attendanceService } from "../attendance/attendance.service.js";
import { analyticsService } from "../analytics/analytics.service.js";

/**
 * Sera tools. Each runs through the SAME service layer + permission checks as
 * the REST API, so the assistant can never surface or mutate data the caller
 * could not access in the UI. `req` carries the authenticated user.
 */
type ToolFn = (req: Request, args: Record<string, unknown>) => Promise<unknown>;

interface Tool {
  def: OpenAI.Chat.Completions.ChatCompletionTool;
  run: ToolFn;
  /** permission codes — at least one required (empty = any authenticated user) */
  permissions: string[];
}

async function has(req: Request, codes: string[]): Promise<boolean> {
  if (codes.length === 0) return true;
  const perms = await resolvePermissions(req.user!.id);
  return codes.some((c) => perms.has(c));
}

const tools: Record<string, Tool> = {
  get_leave_balance: {
    permissions: ["leave:read"],
    def: {
      type: "function",
      function: {
        name: "get_leave_balance",
        description: "Get the current user's leave balances (available, used, pending) for each leave type.",
        parameters: { type: "object", properties: {} },
      },
    },
    run: async (req) => {
      const balances = await leaveService.myBalances(req);
      return balances.map((b) => ({ type: b.leaveType.name, code: b.leaveType.code, available: b.available, used: b.used, pending: b.pending }));
    },
  },

  apply_leave: {
    permissions: ["leave:create"],
    def: {
      type: "function",
      function: {
        name: "apply_leave",
        description: "Apply for leave for the current user. Dates must be YYYY-MM-DD. Confirm details with the user before calling.",
        parameters: {
          type: "object",
          required: ["leaveCode", "startDate", "endDate", "reason"],
          properties: {
            leaveCode: { type: "string", description: "Leave type code: CL, SL, EL, ML, PL, CO or LOP" },
            startDate: { type: "string", description: "Start date YYYY-MM-DD" },
            endDate: { type: "string", description: "End date YYYY-MM-DD" },
            reason: { type: "string" },
          },
        },
      },
    },
    run: async (req, args) => {
      const type = await prisma.leaveType.findUnique({ where: { code: String(args["leaveCode"]).toUpperCase() } });
      if (!type) return { error: "Unknown leave type code" };
      const result = await leaveService.apply(req, {
        leaveTypeId: type.id,
        startDate: new Date(String(args["startDate"])),
        endDate: new Date(String(args["endDate"])),
        startUnit: "FULL_DAY",
        endUnit: "FULL_DAY",
        reason: String(args["reason"]),
      });
      return { applied: true, status: result.status, days: result.days, requestId: result.id };
    },
  },

  get_attendance_summary: {
    permissions: ["attendance:read"],
    def: {
      type: "function",
      function: {
        name: "get_attendance_summary",
        description: "Get the current user's attendance summary for a given month (defaults to current month).",
        parameters: {
          type: "object",
          properties: {
            month: { type: "number", description: "1-12" },
            year: { type: "number" },
          },
        },
      },
    },
    run: async (req, args) => {
      const now = new Date();
      const { summary } = await attendanceService.myMonth(req, Number(args["month"] ?? now.getMonth() + 1), Number(args["year"] ?? now.getFullYear()));
      return summary;
    },
  },

  list_my_payslips: {
    permissions: ["payroll:read"],
    def: {
      type: "function",
      function: {
        name: "list_my_payslips",
        description: "List the current user's published payslips with net pay and a download link.",
        parameters: { type: "object", properties: {} },
      },
    },
    run: async (req) => {
      if (!req.user?.employeeId) return { error: "No employee profile" };
      const slips = await prisma.payslip.findMany({
        where: { employeeId: req.user.employeeId, status: "PUBLISHED" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 12,
        select: { id: true, month: true, year: true, netPay: true },
      });
      const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return slips.map((s) => ({ period: `${months[s.month]} ${s.year}`, netPay: Number(s.netPay), downloadUrl: `/api/v1/payroll/payslips/${s.id}/pdf` }));
    },
  },

  search_employees: {
    permissions: ["employees:read_all"],
    def: {
      type: "function",
      function: {
        name: "search_employees",
        description: "Search the employee directory by name, code, department or designation.",
        parameters: {
          type: "object",
          required: ["query"],
          properties: { query: { type: "string" } },
        },
      },
    },
    run: async (_req, args) => {
      const q = String(args["query"]);
      const rows = await prisma.employee.findMany({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: q } }, { lastName: { contains: q } },
            { employeeCode: { contains: q } }, { email: { contains: q } },
            { designation: { title: { contains: q } } }, { department: { name: { contains: q } } },
          ],
        },
        take: 8,
        select: { firstName: true, lastName: true, employeeCode: true, designation: { select: { title: true } }, department: { select: { name: true } }, manager: { select: { firstName: true, lastName: true } } },
      });
      return rows.map((r) => ({ name: `${r.firstName} ${r.lastName}`, code: r.employeeCode, designation: r.designation?.title, department: r.department?.name, manager: r.manager ? `${r.manager.firstName} ${r.manager.lastName}` : null }));
    },
  },

  create_ticket: {
    permissions: ["helpdesk:create"],
    def: {
      type: "function",
      function: {
        name: "create_ticket",
        description: "Raise a helpdesk ticket for the current user. List categories first if unsure. Confirm before creating.",
        parameters: {
          type: "object",
          required: ["department", "subject", "description"],
          properties: {
            department: { type: "string", description: "HR, IT, FINANCE or ADMIN" },
            subject: { type: "string" },
            description: { type: "string" },
            priority: { type: "string", description: "LOW, MEDIUM, HIGH or CRITICAL" },
          },
        },
      },
    },
    run: async (req, args) => {
      if (!req.user?.employeeId) return { error: "No employee profile" };
      const category = await prisma.ticketCategory.findFirst({ where: { department: String(args["department"]).toUpperCase() as never, isActive: true } });
      if (!category) return { error: "No category found for that department" };
      const last = await prisma.ticket.findFirst({ orderBy: { ticketNumber: "desc" }, select: { ticketNumber: true } });
      const n = last ? parseInt(last.ticketNumber.replace(/\D/g, ""), 10) : 0;
      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: `SOM-TKT-${String(n + 1).padStart(5, "0")}`,
          categoryId: category.id, department: category.department, requesterId: req.user.employeeId,
          subject: String(args["subject"]), description: String(args["description"]),
          priority: (String(args["priority"] ?? "MEDIUM").toUpperCase() as never),
        },
      });
      return { created: true, ticketNumber: ticket.ticketNumber };
    },
  },

  get_pending_approvals: {
    permissions: ["leave:approve"],
    def: {
      type: "function",
      function: {
        name: "get_pending_approvals",
        description: "List leave requests awaiting the current user's approval.",
        parameters: { type: "object", properties: {} },
      },
    },
    run: async (req) => {
      const pending = await leaveService.pendingForApprover(req);
      return pending.map((p) => ({ employee: `${p.employee.firstName} ${p.employee.lastName}`, type: p.leaveType.name, days: p.days, from: p.startDate, to: p.endDate, requestId: p.id }));
    },
  },

  create_employee: {
    permissions: ["employees:create"],
    def: {
      type: "function",
      function: {
        name: "create_employee",
        description: "Add a new employee to the HRMS. Ask the user for all required details before calling. Confirm the details before creating.",
        parameters: {
          type: "object",
          required: ["firstName", "lastName", "email", "departmentName", "designationTitle"],
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", description: "Work email" },
            phone: { type: "string" },
            gender: { type: "string", description: "MALE, FEMALE or OTHER" },
            dateOfJoining: { type: "string", description: "YYYY-MM-DD" },
            departmentName: { type: "string", description: "Department name (e.g. Engineering, HR)" },
            designationTitle: { type: "string", description: "Job title (e.g. Software Engineer)" },
            employmentType: { type: "string", description: "FULL_TIME, PART_TIME, CONTRACT, INTERN or CONSULTANT" },
          },
        },
      },
    },
    run: async (req, args) => {
      const dept = await prisma.department.findFirst({ where: { name: { contains: String(args["departmentName"]) } } });
      if (!dept) return { error: `Department "${args["departmentName"]}" not found` };
      const desig = await prisma.designation.findFirst({ where: { title: { contains: String(args["designationTitle"]) } } });
      if (!desig) return { error: `Designation "${args["designationTitle"]}" not found` };
      const company = await prisma.company.findFirst();
      if (!company) return { error: "No company configured" };
      const count = await prisma.employee.count({ where: { departmentId: dept.id } });
      const prefix = dept.name.slice(0, 3).toUpperCase();
      const loc = await prisma.location.findFirst();
      const employee = await prisma.employee.create({
        data: {
          firstName: String(args["firstName"]),
          lastName: String(args["lastName"]),
          email: String(args["email"]),
          phone: args["phone"] ? String(args["phone"]) : null,
          gender: (String(args["gender"] ?? "UNDISCLOSED").toUpperCase()) as "MALE" | "FEMALE" | "OTHER" | "UNDISCLOSED",
          dateOfJoining: args["dateOfJoining"] ? new Date(String(args["dateOfJoining"])) : new Date(),
          departmentId: dept.id,
          designationId: desig.id,
          companyId: company.id,
          locationId: loc?.id ?? null,
          employeeCode: `${prefix}-${String(count + 1).padStart(3, "0")}`,
          employmentType: (String(args["employmentType"] ?? "FULL_TIME").toUpperCase()) as "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "CONSULTANT",
          status: "ACTIVE",
        },
      });
      return { created: true, employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName}`, id: employee.id };
    },
  },

  get_employee_payslips: {
    permissions: ["payroll:read_all"],
    def: {
      type: "function",
      function: {
        name: "get_employee_payslips",
        description: "Get payslips for any employee by name or employee code. Admin/HR only.",
        parameters: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string", description: "Employee name or code" },
            year: { type: "number", description: "Filter by year (optional)" },
          },
        },
      },
    },
    run: async (_req, args) => {
      const q = String(args["query"]);
      const emp = await prisma.employee.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: q } }, { lastName: { contains: q } },
            { employeeCode: { contains: q } }, { email: { contains: q } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
      });
      if (!emp) return { error: `No employee found matching "${q}"` };
      const where: Record<string, unknown> = { employeeId: emp.id };
      if (args["year"]) where.year = Number(args["year"]);
      const slips = await prisma.payslip.findMany({
        where,
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 24,
        select: { id: true, month: true, year: true, netPay: true, grossEarnings: true, totalDeductions: true, status: true, source: true },
      });
      const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return {
        employee: `${emp.firstName} ${emp.lastName} (${emp.employeeCode})`,
        payslips: slips.map((s) => ({ period: `${months[s.month]} ${s.year}`, gross: Number(s.grossEarnings), deductions: Number(s.totalDeductions), net: Number(s.netPay), status: s.status, source: s.source })),
      };
    },
  },

  get_org_analytics: {
    permissions: ["analytics:read_all"],
    def: {
      type: "function",
      function: {
        name: "get_org_analytics",
        description: "Get organization-wide HR analytics: headcount, active employees, new joiners, attrition rate, payroll cost, attendance, open positions.",
        parameters: { type: "object", properties: {} },
      },
    },
    run: async () => analyticsService.overview(),
  },
};

export function toolDefsFor(allowed: Set<string>): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return Object.entries(tools)
    .filter(([name]) => allowed.has(name))
    .map(([, t]) => t.def);
}

/** Which tools the caller is allowed to use, by permission. */
export async function allowedToolNames(req: Request): Promise<Set<string>> {
  const names = new Set<string>();
  for (const [name, tool] of Object.entries(tools)) {
    if (await has(req, tool.permissions)) names.add(name);
  }
  return names;
}

export async function runTool(req: Request, name: string, args: Record<string, unknown>): Promise<unknown> {
  const tool = tools[name];
  if (!tool) return { error: `Unknown tool ${name}` };
  if (!(await has(req, tool.permissions))) return { error: "You do not have permission for this action" };
  try {
    return await tool.run(req, args);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool failed" };
  }
}
