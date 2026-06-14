import { prisma } from "../src/config/db.js";
import { payrollService } from "../src/modules/payroll/payroll.service.js";
import { round2 } from "../src/modules/payroll/payroll.calc.js";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { status: "ACTIVE", roles: { some: { role: { name: "SUPER_ADMIN" } } } },
    select: { id: true, email: true, employee: { select: { id: true } } },
  });
  if (!admin) throw new Error("No SUPER_ADMIN user found");
  const req: any = { user: { id: admin.id, employeeId: admin.employee?.id }, headers: {}, ip: "127.0.0.1" };

  // 1) Flatten every current salary: entire gross as Basic, HRA & SA = 0
  //    (company is not yet running a Basic/HRA/SA split).
  const salaries = await prisma.employeeSalary.findMany({
    where: { isCurrent: true },
    include: { components: { include: { component: true } } },
  });
  for (const sal of salaries) {
    const gross = round2(Number(sal.monthlyGross));
    for (const c of sal.components) {
      const isBasic = c.component.code === "BASIC";
      await prisma.employeeSalaryComponent.update({
        where: { salaryId_componentId: { salaryId: c.salaryId, componentId: c.componentId } },
        data: { monthlyAmount: isBasic ? gross : 0, annualAmount: isBasic ? round2(gross * 12) : 0 },
      });
    }
  }
  console.log(`Flattened ${salaries.length} salary structure(s).`);

  // 2) Drop the existing (locked) June 2026 run so it can be re-processed cleanly
  const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month: 6, year: 2026 } } });
  if (existing) {
    await prisma.payslip.deleteMany({ where: { runId: existing.id } });
    await prisma.payrollRun.delete({ where: { id: existing.id } });
    console.log(`Removed existing June 2026 run ${existing.id}.`);
  }

  // 3) Re-process + approve June 2026
  const run = await payrollService.processRun(req, 6, 2026);
  console.log(`Run ${run.id} -> ${run.status}; employees=${run.employeeCount}; totalNet=${run.totalNet}`);
  await payrollService.approveRun(req, run.id);

  const slips = await prisma.payslip.findMany({
    where: { runId: run.id },
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
    orderBy: { employee: { employeeCode: "asc" } },
  });
  for (const s of slips) {
    console.log(
      `  ${s.employee.employeeCode} ${s.employee.firstName} ${s.employee.lastName}: ` +
      `status=${s.status} paidDays=${s.paidDays} lopDays=${s.lopDays} ` +
      `gross=${s.grossEarnings} ded=${s.totalDeductions} net=${s.netPay}`
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
