/**
 * Seed sample Company Feed announcements (policies, updates, events).
 * Run once: npx tsx prisma/seed-feed.ts
 * Idempotent — skips titles that already exist.
 */
import { prisma } from "../src/config/db.js";

type Cat = "GENERAL" | "POLICY" | "EVENT" | "CELEBRATION" | "ACHIEVEMENT" | "URGENT";

const POSTS: Array<{ title: string; body: string; category: Cat; isPinned?: boolean }> = [
  {
    title: "Welcome to the Somvanshi HRMS Company Feed",
    category: "GENERAL",
    isPinned: true,
    body: "This is your single place for company-wide announcements, policy updates, holiday notices and celebrations. React and comment to stay engaged. HR and leadership will post important updates here — keep an eye on this space.",
  },
  {
    title: "Updated Leave Policy — Effective This Month",
    category: "POLICY",
    isPinned: true,
    body: "We have refreshed our leave framework. Casual Leave (12), Sick Leave (12), Earned Leave (18, carry-forward up to 30), plus Bereavement, Marriage, Maternity (182 days), Paternity (15 days), Optional Holidays (2) and Work From Home (max 4/month). View your balances and apply directly from the Leave module. Reach out to HR for any clarifications.",
  },
  {
    title: "Public Holiday Calendar 2026 Published",
    category: "POLICY",
    body: "The full list of gazetted and optional holidays for 2026 is now live in the Leave module under the Holiday Calendar. Please plan your time off accordingly. Optional holidays let you pick 2 days that matter most to you.",
  },
  {
    title: "New Joiner — Please Welcome Our Latest Team Members",
    category: "CELEBRATION",
    body: "We're excited to welcome new colleagues across Engineering, Design and Operations this month. Say hello when you see them around, and help them settle in. Onboarding buddies, please check in with your assignees.",
  },
  {
    title: "Quarterly All-Hands — Save the Date",
    category: "EVENT",
    body: "Our company all-hands is scheduled for the end of this quarter. Leadership will share business updates, product roadmap highlights and recognise standout contributions. Calendar invites will follow. Bring your questions for the open Q&A.",
  },
  {
    title: "Payroll Now Processed via the HRMS",
    category: "GENERAL",
    body: "Monthly payslips are now available in the Payroll module. You can view detailed earnings and deduction breakdowns, download PDFs, and check your year-to-date figures. Add your bank details under My Profile so salary credits map correctly.",
  },
];

async function main() {
  const author = await prisma.employee.findFirst({
    where: { deletedAt: null, userId: { not: null } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!author) {
    console.log("No employee with a login found — create employees first.");
    await prisma.$disconnect();
    return;
  }

  let created = 0;
  for (const p of POSTS) {
    const exists = await prisma.announcementPost.findFirst({ where: { title: p.title } });
    if (exists) continue;
    await prisma.announcementPost.create({
      data: {
        authorEmployeeId: author.id,
        title: p.title,
        body: p.body,
        category: p.category,
        isPinned: p.isPinned ?? false,
      },
    });
    created++;
  }
  console.log(`✓ Company Feed: ${created} announcement(s) created (author: ${author.firstName} ${author.lastName})`);
  await prisma.$disconnect();
}

main();
