import { prisma } from "../../config/db.js";
import { NotFoundError, BadRequestError } from "../../core/errors.js";
import { brandingService } from "../branding/branding.service.js";
import { renderDocumentPdf, type DocumentPdfInput } from "../documents/document.pdf.js";
import { formatDate } from "../../shared/format.js";

export const EXIT_DOC_TYPES = ["acknowledgement", "relieving", "experience", "service", "no-dues", "fnf"] as const;
export type ExitDocType = (typeof EXIT_DOC_TYPES)[number];

const TITLES: Record<ExitDocType, string> = {
  acknowledgement: "Resignation Acceptance & Exit Acknowledgement",
  relieving: "Relieving Letter",
  experience: "Experience Letter",
  service: "Service Certificate",
  "no-dues": "No Dues Certificate",
  fnf: "Full & Final Settlement Statement",
};

const inr = (n: number) => new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Builds a branded exit PDF for a resignation. */
export async function buildExitDocument(resignationId: string, type: ExitDocType): Promise<{ buffer: Buffer; filename: string }> {
  const r = await prisma.resignation.findUnique({
    where: { id: resignationId },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
          designation: { select: { title: true } },
          company: { select: { name: true, address: true, email: true, phone: true, website: true } },
        },
      },
      clearanceItems: true,
      fnf: true,
    },
  });
  if (!r) throw new NotFoundError("Resignation");
  if (type === "fnf" && !r.fnf) throw new BadRequestError("Full & Final settlement has not been calculated yet");

  const branding = await brandingService.get();
  const e = r.employee;
  const co = e.company;
  const name = `${e.firstName} ${e.lastName}`;
  const designation = e.designation?.title ?? "Employee";
  const department = e.department?.name ?? "—";
  const doj = e.dateOfJoining ? formatDate(e.dateOfJoining) : "—";
  const lwd = formatDate(r.lastWorkingDay);
  const today = formatDate(new Date());
  const refNo = `ST/${new Date().getFullYear()}/${type.toUpperCase()}-${r.id.slice(-5).toUpperCase()}`;

  const recipient = { lines: [name, `Employee ID: ${e.employeeCode}`, `${designation}, ${department}`] };

  let body: string[];
  let closing: string | undefined;

  switch (type) {
    case "acknowledgement":
      body = [
        `This is to acknowledge that we have received and accepted your resignation from the position of ${designation}, ${department}.`,
        `Your last working day with ${co.name} will be ${lwd}, after serving the applicable notice period. You are requested to complete the off-boarding formalities, including knowledge transfer, asset return and clearances, before your last working day.`,
        `We thank you for your contributions and will process your relieving documents and full & final settlement upon completion of the exit clearances.`,
      ];
      break;
    case "relieving":
      body = [
        `This is to certify that ${name} (Employee ID: ${e.employeeCode}) was employed with ${co.name} as ${designation} in the ${department} department.`,
        `${name} has been relieved from the services of the company with effect from the close of business on ${lwd}, following the acceptance of resignation and completion of all exit formalities and clearances.`,
        `As on the date of relieving, there are no dues pending against the employee and the company holds no objection to their future employment.`,
      ];
      closing = "We wish them all the best in their future endeavours.";
      break;
    case "experience":
      body = [
        `This is to certify that ${name} (Employee ID: ${e.employeeCode}) was employed with ${co.name} from ${doj} to ${lwd}.`,
        `During this tenure, ${name} served as ${designation} in the ${department} department and was found to be sincere, hardworking and professional in conduct.`,
        `This certificate is issued on request for the purpose of records and future employment.`,
      ];
      closing = "We wish them continued success in their career.";
      break;
    case "service":
      body = [
        `This is to certify that ${name} (Employee ID: ${e.employeeCode}) rendered service to ${co.name} as ${designation}, ${department}, from ${doj} to ${lwd}.`,
        `Their association with the organisation was marked by professional conduct and commitment to assigned responsibilities.`,
        `This Service Certificate is issued upon completion of the employee's tenure with the company.`,
      ];
      break;
    case "no-dues": {
      const cleared = r.clearanceItems.filter((c) => c.status === "CLEARED");
      const byDept = [...new Set(cleared.map((c) => c.department))];
      body = [
        `This is to certify that all exit clearances for ${name} (Employee ID: ${e.employeeCode}), ${designation}, ${department}, have been duly completed.`,
        `The following departments have confirmed that there are no dues, pending assets or obligations outstanding against the employee:`,
        (byDept.length ? byDept.map((d) => `   •  ${d}`).join("\n") : "   •  HR    •  IT    •  Finance    •  Administration"),
        `Accordingly, a NO DUES status is confirmed as on ${today}, clearing the way for relieving and full & final settlement.`,
      ];
      break;
    }
    case "fnf": {
      const f = r.fnf!;
      const earnings = Number(f.earnings);
      const deductions = Number(f.deductions);
      const netPayable = Number(f.netPayable);
      const lines = Array.isArray(f.breakdown) ? (f.breakdown as Array<{ label?: string; amount?: number }>) : [];
      const detail = lines.length
        ? lines.map((l) => `${String(l.label ?? "Item").padEnd(28, " ")}  Rs. ${inr(Number(l.amount ?? 0))}`)
        : [
            `${"Total Earnings".padEnd(28, " ")}  Rs. ${inr(earnings)}`,
            `${"Total Deductions".padEnd(28, " ")}  Rs. ${inr(deductions)}`,
          ];
      body = [
        `This statement details the Full & Final settlement for ${name} (Employee ID: ${e.employeeCode}), ${designation}, ${department}, relieved on ${lwd}.`,
        ...detail,
        `${"NET PAYABLE".padEnd(28, " ")}  Rs. ${inr(netPayable)}`,
        `The above amount represents the final settlement and will be credited to the employee's registered bank account.`,
      ];
      break;
    }
  }

  const input: DocumentPdfInput = {
    company: { name: co.name, address: co.address, email: branding.footer.email || co.email, phone: branding.footer.phone || co.phone, website: branding.footer.website || co.website, tagline: branding.tagline },
    logoUrl: branding.logoUrl,
    signatureUrl: branding.signatures.hr,
    watermark: branding.watermark || (type === "fnf" ? "OFFICIAL DOCUMENT" : ""),
    refNo,
    date: today,
    title: TITLES[type],
    recipient,
    body,
    closing,
    signatory: branding.signatory,
  };

  const buffer = await renderDocumentPdf(input);
  const filename = `${type}-${e.employeeCode}.pdf`;
  return { buffer, filename };
}
