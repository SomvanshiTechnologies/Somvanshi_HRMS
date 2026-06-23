/**
 * Somvanshi HRMS seed — bootstrap data ONLY, no dummy records.
 *
 * Seeds exactly what the platform needs to start:
 *  - permission catalog + 9 system roles with the default matrix
 *  - the company record with departments/designations/locations/bands
 *  - the Super Admin login
 *
 * All employees, attendance, leave and payroll data are created through
 * the application itself.
 *
 * Run: npm run seed   (idempotent — safe to re-run)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client.js";
import {
  ALL_PERMISSIONS,
  ROLE_DISPLAY,
  ROLE_PERMISSION_MATRIX,
  ROLES,
  type RoleName,
} from "../src/shared/permissions.js";

const adapter = new PrismaMariaDb(process.env["DATABASE_URL"] as string);
const prisma = new PrismaClient({ adapter });

const ADMIN_EMAIL = "admin@somvanshitech.com";
const ADMIN_PASSWORD = "SomHR@Admin2026"; // change after first login

async function seedPermissions(): Promise<void> {
  for (const code of ALL_PERMISSIONS) {
    const [module, action] = code.split(":") as [string, string];
    await prisma.permission.upsert({
      where: { code },
      create: { code, module, action, description: `${action.replace(/_/g, " ")} on ${module}` },
      update: {},
    });
  }
  console.log(`✓ permissions: ${ALL_PERMISSIONS.length}`);
}

async function seedRoles(): Promise<void> {
  const permissions = await prisma.permission.findMany();
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));

  for (const name of Object.values(ROLES) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, ...ROLE_DISPLAY[name], isSystem: true },
      update: { ...ROLE_DISPLAY[name], isSystem: true },
    });
    const codes = ROLE_PERMISSION_MATRIX[name];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: [...new Set(codes)].map((code) => ({ roleId: role.id, permissionId: byCode.get(code)! })),
    });
  }
  console.log(`✓ roles: ${Object.keys(ROLES).length} (matrix applied)`);
}

async function seedCompany() {
  let company = await prisma.company.findFirst();
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Somvanshi Technologies",
        legalName: "Somvanshi Technologies Private Limited",
        website: "https://somvanshitech.com",
        email: "hr@somvanshitech.com",
        address: "Pune, Maharashtra, India",
      },
    });
  }

  const locations = [
    { name: "Pune HQ", city: "Pune", state: "Maharashtra", country: "India" },
    { name: "Bengaluru Office", city: "Bengaluru", state: "Karnataka", country: "India" },
    { name: "Remote — India", city: null, state: null, country: "India" },
  ];
  for (const loc of locations) {
    const exists = await prisma.location.findFirst({ where: { name: loc.name, companyId: company.id } });
    if (!exists) await prisma.location.create({ data: { ...loc, companyId: company.id } });
  }

  const departments = [
    { name: "Engineering", code: "ENG" },
    { name: "Human Resources", code: "HR" },
    { name: "Finance", code: "FIN" },
    { name: "Sales & Marketing", code: "SAM" },
    { name: "Operations", code: "OPS" },
    { name: "Information Technology", code: "IT" },
  ];
  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      create: { ...dept, companyId: company.id },
      update: {},
    });
  }

  const bands = [
    { name: "B1", minCtc: 300000, maxCtc: 600000 },
    { name: "B2", minCtc: 600000, maxCtc: 1200000 },
    { name: "B3", minCtc: 1200000, maxCtc: 2400000 },
    { name: "B4", minCtc: 2400000, maxCtc: 4800000 },
  ];
  for (const band of bands) {
    const exists = await prisma.band.findFirst({ where: { name: band.name, companyId: company.id } });
    if (!exists) await prisma.band.create({ data: { ...band, companyId: company.id } });
  }

  const bandRows = await prisma.band.findMany({ where: { companyId: company.id } });
  const bandId = (n: string) => bandRows.find((b) => b.name === n)?.id ?? null;
  const designations: Array<{ title: string; level: number; band: string }> = [
    { title: "Software Engineer", level: 1, band: "B1" },
    { title: "Senior Software Engineer", level: 2, band: "B2" },
    { title: "Tech Lead", level: 3, band: "B3" },
    { title: "Engineering Manager", level: 4, band: "B3" },
    { title: "HR Executive", level: 1, band: "B1" },
    { title: "HR Manager", level: 3, band: "B2" },
    { title: "Accountant", level: 1, band: "B1" },
    { title: "Finance Manager", level: 3, band: "B3" },
    { title: "Sales Executive", level: 1, band: "B1" },
    { title: "Sales Manager", level: 3, band: "B2" },
    { title: "Operations Executive", level: 1, band: "B1" },
    { title: "IT Support Engineer", level: 1, band: "B1" },
    { title: "Director", level: 5, band: "B4" },
  ];
  for (const d of designations) {
    const exists = await prisma.designation.findFirst({ where: { title: d.title, companyId: company.id } });
    if (!exists) {
      await prisma.designation.create({
        data: { title: d.title, level: d.level, bandId: bandId(d.band), companyId: company.id },
      });
    }
  }

  console.log("✓ company, locations, departments, bands, designations");
  return company;
}

async function seedAdmin(companyId: string): Promise<void> {
  const superAdmin = await prisma.role.findUnique({ where: { name: "SUPER_ADMIN" } });
  const hrAdmin = await prisma.role.findUnique({ where: { name: "HR_ADMIN" } });
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log("✓ admin user exists");
    return;
  }

  const hrDept = await prisma.department.findUnique({ where: { code: "HR" } });
  const hrMgr = await prisma.designation.findFirst({ where: { title: "HR Manager" } });
  const pune = await prisma.location.findFirst({ where: { name: "Pune HQ" } });

  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      status: "ACTIVE",
      isEmailVerified: true,
      roles: { create: [{ roleId: superAdmin!.id }, { roleId: hrAdmin!.id }] },
    },
  });
  await prisma.employee.create({
    data: {
      companyId,
      userId: user.id,
      employeeCode: "SOM-0001",
      firstName: "System",
      lastName: "Administrator",
      displayName: "System Administrator",
      email: ADMIN_EMAIL,
      status: "ACTIVE",
      employmentType: "FULL_TIME",
      dateOfJoining: new Date("2023-01-02"),
      departmentId: hrDept?.id ?? null,
      designationId: hrMgr?.id ?? null,
      locationId: pune?.id ?? null,
    },
  });
  console.log(`✓ admin login → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

async function seedLeaveConfig(): Promise<void> {
  const types: Array<{
    name: string; code: string; isPaid: boolean; colorHex: string;
    quota: number; accrual: "MONTHLY" | "YEARLY" | "NONE";
    carryForward?: number; noticeDays?: number; requiresDocument?: boolean;
    genderRestriction?: "MALE" | "FEMALE"; maxConsecutiveDays?: number;
    description?: string;
  }> = [
    { name: "Casual Leave", code: "CL", isPaid: true, colorHex: "#2e86ab", quota: 12, accrual: "MONTHLY", description: "For personal/urgent matters" },
    { name: "Sick Leave", code: "SL", isPaid: true, colorHex: "#f59e0b", quota: 12, accrual: "MONTHLY", requiresDocument: true, description: "Medical leave; document required for 3+ days" },
    { name: "Earned Leave", code: "EL", isPaid: true, colorHex: "#22c55e", quota: 18, accrual: "MONTHLY", carryForward: 30, noticeDays: 7, description: "Privilege leave; earned monthly, carry-forward allowed" },
    { name: "Compensatory Off", code: "CO", isPaid: true, colorHex: "#0a3d62", quota: 0, accrual: "NONE", description: "Approval-based; awarded for working on holidays/weekends" },
    { name: "Bereavement Leave", code: "BL", isPaid: true, colorHex: "#64748b", quota: 3, accrual: "NONE", description: "In the event of a family member's passing" },
    { name: "Marriage Leave", code: "MAL", isPaid: true, colorHex: "#ec4899", quota: 5, accrual: "NONE", description: "One-time; for the employee's own marriage" },
    { name: "Maternity Leave", code: "ML", isPaid: true, colorHex: "#8b5cf6", quota: 182, accrual: "NONE", genderRestriction: "FEMALE", requiresDocument: true, description: "As per Maternity Benefit Act; document required" },
    { name: "Paternity Leave", code: "PL", isPaid: true, colorHex: "#63b0cd", quota: 15, accrual: "NONE", genderRestriction: "MALE", description: "For new fathers around childbirth" },
    { name: "Optional Holiday", code: "OH", isPaid: true, colorHex: "#a855f7", quota: 2, accrual: "NONE", description: "Choose 2 from the optional holiday list" },
    { name: "Work From Home", code: "WFH", isPaid: true, colorHex: "#06b6d4", quota: 48, accrual: "MONTHLY", maxConsecutiveDays: 4, description: "Max 4 days per month; tracked via monthly accrual" },
    { name: "Loss of Pay", code: "LOP", isPaid: false, colorHex: "#ef4444", quota: 0, accrual: "NONE", description: "Unpaid leave; deducted from salary" },
  ];

  for (const t of types) {
    const type = await prisma.leaveType.upsert({
      where: { code: t.code },
      create: { name: t.name, code: t.code, isPaid: t.isPaid, colorHex: t.colorHex, description: t.description ?? null },
      update: { name: t.name, isPaid: t.isPaid, colorHex: t.colorHex, description: t.description ?? null },
    });
    const policy = await prisma.leavePolicy.findFirst({ where: { leaveTypeId: type.id } });
    if (!policy) {
      await prisma.leavePolicy.create({
        data: {
          leaveTypeId: type.id,
          name: `${t.name} — Standard`,
          annualQuota: t.quota,
          accrualFrequency: t.accrual,
          maxCarryForward: t.carryForward ?? 0,
          noticeDays: t.noticeDays ?? 0,
          requiresDocument: t.requiresDocument ?? false,
          genderRestriction: t.genderRestriction ?? null,
          maxConsecutiveDays: t.maxConsecutiveDays ?? null,
        },
      });
    } else {
      await prisma.leavePolicy.update({
        where: { id: policy.id },
        data: {
          annualQuota: t.quota,
          accrualFrequency: t.accrual,
          maxCarryForward: t.carryForward ?? 0,
          requiresDocument: t.requiresDocument ?? false,
          genderRestriction: t.genderRestriction ?? null,
          maxConsecutiveDays: t.maxConsecutiveDays ?? null,
        },
      });
    }
  }
  console.log(`✓ leave types + policies: ${types.length}`);

  // default approval chain: Manager → HR (HR can re-configure at runtime)
  await prisma.workflowConfig.upsert({
    where: { key: "leave_approval" },
    create: {
      key: "leave_approval",
      name: "Leave Approval Chain",
      steps: [{ type: "MANAGER" }, { type: "ROLE", role: "HR_ADMIN" }],
    },
    update: {},
  });
  console.log("✓ leave approval workflow (Manager → HR)");

  // Indian gazetted / national holidays — seeded for current and next year
  const INDIA_HOLIDAYS: Array<{ name: string; month: number; day: number; optional?: boolean }> = [
    { name: "New Year's Day", month: 1, day: 1 },
    { name: "Republic Day", month: 1, day: 26 },
    { name: "Maha Shivaratri", month: 2, day: 26, optional: true },
    { name: "Holi", month: 3, day: 14 },
    { name: "Good Friday", month: 3, day: 29 },
    { name: "Id-ul-Fitr (Eid)", month: 3, day: 31 },
    { name: "Ram Navami", month: 4, day: 6, optional: true },
    { name: "Dr. Ambedkar Jayanti", month: 4, day: 14 },
    { name: "Mahavir Jayanti", month: 4, day: 10, optional: true },
    { name: "May Day", month: 5, day: 1 },
    { name: "Buddha Purnima", month: 5, day: 12, optional: true },
    { name: "Id-ul-Zuha (Bakrid)", month: 6, day: 7, optional: true },
    { name: "Muharram", month: 7, day: 6, optional: true },
    { name: "Independence Day", month: 8, day: 15 },
    { name: "Janmashtami", month: 8, day: 16, optional: true },
    { name: "Milad-un-Nabi", month: 9, day: 5, optional: true },
    { name: "Mahatma Gandhi Jayanti", month: 10, day: 2 },
    { name: "Dussehra", month: 10, day: 2 },
    { name: "Diwali", month: 10, day: 20 },
    { name: "Diwali (Day 2)", month: 10, day: 21 },
    { name: "Guru Nanak Jayanti", month: 11, day: 5, optional: true },
    { name: "Christmas", month: 12, day: 25 },
  ];

  for (const yr of [new Date().getFullYear(), new Date().getFullYear() + 1]) {
    const cal = await prisma.holidayCalendar.upsert({
      where: { name_year: { name: "Company Holidays", year: yr } },
      create: { name: "Company Holidays", year: yr, isDefault: true },
      update: {},
    });
    for (const h of INDIA_HOLIDAYS) {
      const date = new Date(yr, h.month - 1, h.day);
      await prisma.holiday.upsert({
        where: { calendarId_date_name: { calendarId: cal.id, date, name: h.name } },
        create: { calendarId: cal.id, name: h.name, date, isOptional: h.optional ?? false },
        update: {},
      });
    }
    console.log(`✓ ${INDIA_HOLIDAYS.length} holidays seeded for ${yr}`);
  }

  // default shift
  const shift = await prisma.shift.findFirst({ where: { name: "General" } });
  if (!shift) {
    await prisma.shift.create({
      data: { name: "General", startTime: "09:30", endTime: "18:30", breakMinutes: 60, graceMinutes: 15 },
    });
  }
  console.log("✓ default General shift (09:30–18:30)");
}

async function seedPayrollConfig(): Promise<void> {
  // Indian statutory salary components + a standard CTC structure (config, editable).
  const components: Array<{
    name: string; code: string; type: "EARNING" | "DEDUCTION";
    calc: "FLAT" | "PERCENT_OF_BASIC" | "PERCENT_OF_CTC" | "FORMULA";
    percent?: number; taxable?: boolean; statutory?: boolean; order: number;
  }> = [
    { name: "Basic Salary", code: "BASIC", type: "EARNING", calc: "PERCENT_OF_CTC", percent: 50, order: 1 },
    { name: "House Rent Allowance", code: "HRA", type: "EARNING", calc: "PERCENT_OF_BASIC", percent: 50, order: 2 },
    { name: "Special Allowance", code: "SA", type: "EARNING", calc: "FORMULA", order: 3 },
    { name: "Bonus", code: "BONUS", type: "EARNING", calc: "FLAT", order: 4 },
    { name: "Incentive", code: "INCENTIVE", type: "EARNING", calc: "FLAT", order: 5 },
    { name: "Provident Fund", code: "PF", type: "DEDUCTION", calc: "FORMULA", statutory: true, taxable: false, order: 10 },
    { name: "Professional Tax", code: "PT", type: "DEDUCTION", calc: "FLAT", statutory: true, taxable: false, order: 11 },
    { name: "Employee State Insurance", code: "ESI", type: "DEDUCTION", calc: "FORMULA", statutory: true, taxable: false, order: 12 },
    { name: "Tax Deducted at Source", code: "TDS", type: "DEDUCTION", calc: "FORMULA", statutory: true, taxable: false, order: 13 },
  ];
  for (const c of components) {
    await prisma.salaryComponent.upsert({
      where: { code: c.code },
      create: {
        name: c.name, code: c.code, type: c.type, calculationType: c.calc,
        percentValue: c.percent ?? null, isTaxable: c.taxable ?? true,
        isStatutory: c.statutory ?? false, displayOrder: c.order,
      },
      update: {},
    });
  }

  const structure = await prisma.salaryStructure.upsert({
    where: { name: "Standard India CTC" },
    create: { name: "Standard India CTC", description: "BASIC 50% of gross · HRA 50% of basic · balance as Special Allowance · statutory PF/PT/ESI/TDS" },
    update: {},
  });
  const structural = await prisma.salaryComponent.findMany({ where: { code: { in: ["BASIC", "HRA", "SA", "PF", "PT", "ESI", "TDS"] } } });
  for (const comp of structural) {
    await prisma.salaryStructureComponent.upsert({
      where: { structureId_componentId: { structureId: structure.id, componentId: comp.id } },
      create: { structureId: structure.id, componentId: comp.id },
      update: {},
    });
  }
  console.log(`✓ payroll: ${components.length} components + Standard India CTC structure`);
}

async function seedOnboardingTemplate(): Promise<void> {
  const existing = await prisma.onboardingTemplate.findFirst({ where: { isDefault: true } });
  if (existing) {
    console.log("✓ onboarding template exists");
    return;
  }
  await prisma.onboardingTemplate.create({
    data: {
      name: "Standard Onboarding",
      description: "Default joining checklist for all new hires",
      isDefault: true,
      tasks: {
        create: [
          { title: "Upload identity documents (Aadhaar, PAN)", category: "DOCUMENTS", assigneeRole: "EMPLOYEE", dueInDays: 3, sequence: 1 },
          { title: "Complete profile (photo, contacts, bank details)", category: "FORMS", assigneeRole: "EMPLOYEE", dueInDays: 3, sequence: 2 },
          { title: "Sign joining & policy acceptance form", category: "COMPLIANCE", assigneeRole: "EMPLOYEE", dueInDays: 2, sequence: 3 },
          { title: "Create email & system accounts", category: "IT_SETUP", assigneeRole: "HR_EXECUTIVE", dueInDays: 1, sequence: 4 },
          { title: "Allocate laptop & access card", category: "ASSETS", assigneeRole: "HR_EXECUTIVE", dueInDays: 2, sequence: 5 },
          { title: "Department induction with manager", category: "INDUCTION", assigneeRole: "MANAGER", dueInDays: 7, sequence: 6 },
          { title: "Assign shift & confirm payroll setup", category: "COMPLIANCE", assigneeRole: "HR_EXECUTIVE", dueInDays: 5, sequence: 7 },
        ],
      },
    },
  });
  console.log("✓ onboarding template (7 tasks)");
}

async function seedHelpdeskConfig(): Promise<void> {
  const sla = await prisma.slaPolicy.upsert({
    where: { name: "Standard SLA" },
    create: { name: "Standard SLA", firstResponseMins: 240, resolutionMins: 2880, escalationMins: 1440 },
    update: {},
  });
  const categories: Array<{ department: "HR" | "IT" | "FINANCE" | "ADMIN"; name: string }> = [
    { department: "IT", name: "Hardware Issue" },
    { department: "IT", name: "Software / Access" },
    { department: "IT", name: "Network / VPN" },
    { department: "HR", name: "Leave & Attendance" },
    { department: "HR", name: "Payroll Query" },
    { department: "HR", name: "Policy / General" },
    { department: "FINANCE", name: "Reimbursement" },
    { department: "ADMIN", name: "Facilities" },
  ];
  for (const c of categories) {
    const exists = await prisma.ticketCategory.findFirst({ where: { department: c.department, name: c.name } });
    if (!exists) await prisma.ticketCategory.create({ data: { ...c, slaPolicyId: sla.id } });
  }
  console.log(`✓ helpdesk: ${categories.length} categories + Standard SLA`);
}

async function seedExpenseConfig(): Promise<void> {
  // Standard reimbursement categories with per-claim caps (config, editable).
  const categories: Array<{ name: string; maxAmount?: number; requiresReceipt?: boolean }> = [
    { name: "Travel", maxAmount: 50000 },
    { name: "Meals & Entertainment", maxAmount: 5000 },
    { name: "Lodging", maxAmount: 15000 },
    { name: "Internet & Telephone", maxAmount: 3000 },
    { name: "Office Supplies", maxAmount: 10000 },
    { name: "Training & Certification", maxAmount: 50000 },
    { name: "Client Gifts", maxAmount: 5000 },
    { name: "Miscellaneous", requiresReceipt: false },
  ];
  for (const c of categories) {
    await prisma.expenseCategory.upsert({
      where: { name: c.name },
      create: { name: c.name, maxAmount: c.maxAmount ?? null, requiresReceipt: c.requiresReceipt ?? true },
      update: {},
    });
  }
  console.log(`✓ expense: ${categories.length} categories`);
}

async function main(): Promise<void> {
  console.log("— Somvanshi HRMS seed (bootstrap only, no dummy data) —");
  await seedPermissions();
  await seedRoles();
  const company = await seedCompany();
  await seedAdmin(company.id);
  await seedLeaveConfig();
  await seedPayrollConfig();
  await seedOnboardingTemplate();
  await seedHelpdeskConfig();
  await seedExpenseConfig();
  console.log("— done —");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
