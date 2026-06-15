import PDFDocument from "pdfkit";
import path from "node:path";
import { assetBuffer, bundledAsset } from "../files/storage.js";

const LOGO_PATH = path.resolve(process.cwd(), "assets/logo_STech.jpg");

export interface PayslipPdfData {
  company: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    tagline?: string | null;
  };
  employee: {
    name: string; code: string; designation: string; department: string;
    email: string; bankLast4: string | null; bankName: string | null; dateOfJoining: string | null;
  };
  meta: { payslipNo: string; issueDate: string; currency: string };
  payment: { mode: string; refNo: string | null; paidOn: string | null };
  signatory: { name: string; title: string };
  /** branding overrides — resolved from Settings > Company Branding */
  branding?: { logoUrl?: string | null; signatureUrl?: string | null; stampUrl?: string | null; watermark?: string | null };
  period: string; // "June 2026"
  paidDays: number;
  lopDays: number;
  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
  gross: number;
  totalDeductions: number;
  net: number;
}

const NAVY = "#0a3d62";
const LIGHT = "#63b0cd";
const SLATE = "#64748b";
const BORDER = "#e2e8f0";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number): string => (n < 20 ? ones[n]! : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number): string => (n >= 100 ? `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? " " + two(n % 100) : ""}` : two(n));
  let n = Math.floor(num);
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 1_00_00_000); n %= 1_00_00_000;
  const lakh = Math.floor(n / 1_00_000); n %= 1_00_000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  return [
    crore ? `${two(crore)} Crore` : "",
    lakh ? `${two(lakh)} Lakh` : "",
    thousand ? `${two(thousand)} Thousand` : "",
    n ? three(n) : "",
  ].filter(Boolean).join(" ");
}

/** Renders a professional branded payslip; resolves to the PDF buffer. */
export async function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  // Pre-resolve image bytes (disk or S3) before the synchronous draw pass.
  const logoBuf = (await assetBuffer(data.branding?.logoUrl)) ?? bundledAsset(LOGO_PATH);
  const sigBuf = await assetBuffer(data.branding?.signatureUrl);
  return new Promise((resolve, reject) => {
    // bottom margin 0 so the absolutely-positioned footer never triggers
    // pdfkit's auto page-break (which was adding blank trailing pages)
    const doc = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 0, left: 48, right: 48 } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 96;
    const LX = 48;            // left margin
    const RX = doc.page.width - 48; // right edge

    // ---------------- header band ----------------
    const bandH = 116;
    doc.rect(0, 0, doc.page.width, bandH).fill(NAVY);
    doc.rect(0, bandH, doc.page.width, 4).fill(LIGHT); // accent rule

    // brand logo on a white chip (admin-uploaded branding logo wins, else bundled, else text-only)
    let hasLogo = false;
    try {
      if (logoBuf) {
        doc.roundedRect(LX, 22, 54, 54, 8).fill("#ffffff");
        doc.image(logoBuf, LX + 6, 28, { fit: [42, 42], align: "center", valign: "center" });
        hasLogo = true;
      }
    } catch {
      hasLogo = false;
    }

    const textX = hasLogo ? LX + 70 : LX;
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(17).text(data.company.name.toUpperCase(), textX, 26, { width: 320 });
    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#9fc4e0")
      .text(data.company.tagline ?? "Intelligent Digital Transformation", textX, 47, { width: 320 });
    // contact lines
    doc.font("Helvetica").fontSize(7.5).fillColor("#cbd5e1");
    let cy = 64;
    if (data.company.address) { doc.text(data.company.address, textX, cy, { width: 330 }); cy += 11; }
    const contact = [data.company.email, data.company.phone].filter(Boolean).join("   ·   ");
    if (contact) { doc.text(contact, textX, cy, { width: 330 }); cy += 11; }
    if (data.company.website) doc.text(data.company.website, textX, cy, { width: 330 });

    // PAYSLIP word on the right
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff").text("PAYSLIP", RX - 180, 30, { width: 180, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#9fc4e0").text(`For ${data.period}`, RX - 180, 54, { width: 180, align: "right" });

    // ---------------- meta strip ----------------
    let y = bandH + 16;
    doc.rect(LX, y, W, 26).fill("#f1f5f9");
    doc.rect(LX, y, W, 26).strokeColor(BORDER).lineWidth(0.5).stroke();
    const metaCells: Array<[string, string]> = [
      ["PAYSLIP NO", data.meta.payslipNo],
      ["MONTH", data.period],
      ["DATE OF ISSUE", data.meta.issueDate],
      ["CURRENCY", data.meta.currency],
    ];
    const mcw = W / metaCells.length;
    metaCells.forEach(([k, v], i) => {
      const mx = LX + i * mcw + 10;
      doc.font("Helvetica").fontSize(6.5).fillColor(SLATE).text(k, mx, y + 5, { width: mcw - 16 });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text(v, mx, y + 13, { width: mcw - 16 });
      if (i > 0) doc.moveTo(LX + i * mcw, y + 4).lineTo(LX + i * mcw, y + 22).strokeColor(BORDER).lineWidth(0.5).stroke();
    });
    y += 26 + 18;

    // ---------------- employee block ----------------
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("EMPLOYEE DETAILS", LX, y);
    doc.moveTo(LX, y + 14).lineTo(RX, y + 14).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 22;
    const left: Array<[string, string]> = [
      ["Full Name", data.employee.name],
      ["Employee ID", data.employee.code],
      ["Designation", data.employee.designation],
      ["Department", data.employee.department],
    ];
    const right: Array<[string, string]> = [
      ["Date of Joining", data.employee.dateOfJoining ?? "—"],
      ["Bank A/c", data.employee.bankLast4 ? `${data.employee.bankName ? data.employee.bankName + " " : ""}••••${data.employee.bankLast4}` : "—"],
      ["Paid Days", String(data.paidDays)],
      ["LOP Days", String(data.lopDays)],
    ];
    doc.fontSize(9);
    left.forEach(([k, v], i) => {
      doc.font("Helvetica").fillColor(SLATE).text(k, LX, y + i * 16, { width: 90 });
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(v, LX + 92, y + i * 16, { width: 180 });
    });
    right.forEach(([k, v], i) => {
      doc.font("Helvetica").fillColor(SLATE).text(k, 320, y + i * 16, { width: 100 });
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(v, 424, y + i * 16, { width: 120 });
    });
    y += left.length * 16 + 18;

    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("SALARY DETAILS", LX, y);
    doc.moveTo(LX, y + 14).lineTo(RX, y + 14).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 22;

    // earnings / deductions table
    const colW = W / 2 - 8;
    const tableTop = y;
    const drawTable = (x: number, w: number, title: string, rows: Array<{ label: string; amount: number }>, total: number) => {
      doc.rect(x, tableTop, w, 22).fill(NAVY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
        .text(title, x + 10, tableTop + 7)
        .text("Amount (Rs.)", x + 10, tableTop + 7, { width: w - 20, align: "right" });
      let ry = tableTop + 22;
      rows.forEach((row, i) => {
        if (i % 2 === 0) doc.rect(x, ry, w, 18).fill("#f8fafc");
        doc.font("Helvetica").fontSize(9).fillColor("#1e293b")
          .text(row.label, x + 10, ry + 5, { width: w - 120 })
          .text(inr(row.amount), x + 10, ry + 5, { width: w - 20, align: "right" });
        ry += 18;
      });
      doc.rect(x, ry, w, 20).fill("#eef4f9");
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY)
        .text(`Total ${title}`, x + 10, ry + 6)
        .text(inr(total), x + 10, ry + 6, { width: w - 20, align: "right" });
      doc.rect(x, tableTop, w, ry + 20 - tableTop).strokeColor(BORDER).lineWidth(0.5).stroke();
      return ry + 20;
    };
    // hide zero-value lines; drop the Deductions table entirely when there are none
    const earnRows = data.earnings.filter((r) => r.amount !== 0);
    const dedRows = data.deductions.filter((r) => r.amount !== 0);
    const leftEnd = drawTable(48, dedRows.length ? colW : W, "Earnings", earnRows, data.gross);
    const rightEnd = dedRows.length ? drawTable(48 + colW + 16, colW, "Deductions", dedRows, data.totalDeductions) : 0;
    y = Math.max(leftEnd, rightEnd) + 24;

    // ---------------- net pay band ----------------
    doc.rect(48, y, W, 46).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff").text("NET PAY (TAKE HOME)", 60, y + 10);
    doc.fontSize(16).text(`Rs. ${inr(data.net)}`, 48, y + 9, { width: W - 14, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#cbd5e1")
      .text(`Rupees ${numberToWords(data.net)} Only`, 60, y + 30, { width: W - 24 });
    y += 64;

    // ---------------- payment information ----------------
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("PAYMENT INFORMATION", 48, y);
    doc.moveTo(48, y + 14).lineTo(RX, y + 14).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 22;
    const pay: Array<[string, string]> = [
      ["Mode of Payment", data.payment.mode],
      ["Bank Name", data.employee.bankName ?? "—"],
      ["Transaction / Ref No", data.payment.refNo ?? "—"],
      ["Date of Payment", data.payment.paidOn ?? "—"],
    ];
    doc.fontSize(9);
    pay.forEach(([k, v], i) => {
      const px = i % 2 === 0 ? 48 : 320;
      const py = y + Math.floor(i / 2) * 16;
      doc.font("Helvetica").fillColor(SLATE).text(k, px, py, { width: 110 });
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(v, px + 112, py, { width: i % 2 === 0 ? 150 : 120 });
    });
    y += 2 * 16 + 22;

    // ---------------- signatory ----------------
    doc.font("Helvetica").fontSize(8.5).fillColor(SLATE).text("For " + data.company.name, RX - 200, y, { width: 200, align: "right" });
    // signature image (admin-uploaded), if available, sits above the line
    if (sigBuf) {
      try { doc.image(sigBuf, RX - 130, y + 12, { fit: [120, 30], align: "right", valign: "bottom" }); } catch { /* ignore */ }
    }
    y += 34; // space for signature
    doc.moveTo(RX - 200, y).lineTo(RX, y).strokeColor(BORDER).lineWidth(0.6).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e293b").text(data.signatory.name, RX - 200, y + 4, { width: 200, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor(SLATE).text(data.signatory.title, RX - 200, y + 16, { width: 200, align: "right" });
    doc.font("Helvetica").fontSize(7.5).fillColor(SLATE).text("Authorised Signatory", RX - 200, y + 27, { width: 200, align: "right" });

    // ---------------- footer ----------------
    const footY = doc.page.height - 54;
    doc.moveTo(48, footY).lineTo(RX, footY).strokeColor(BORDER).lineWidth(0.5).stroke();
    const footLine = [data.company.website, data.company.email, data.company.phone].filter(Boolean).join("   ·   ");
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(NAVY).text(data.company.name, 48, footY + 7, { width: W });
    doc.font("Helvetica").fontSize(7).fillColor(SLATE).text(footLine, 48, footY + 17, { width: W });
    doc.font("Helvetica").fontSize(7).fillColor(SLATE).text("Page 1 of 1", 48, footY + 17, { width: W, align: "right" });

    // ---------------- optional watermark (diagonal, behind-feeling overlay) ----------------
    if (data.branding?.watermark) {
      doc.save();
      doc.rotate(-32, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor(NAVY).opacity(0.06).font("Helvetica-Bold").fontSize(58)
        .text(data.branding.watermark, 0, doc.page.height / 2 - 40, { width: doc.page.width, align: "center" });
      doc.opacity(1).restore();
    }

    doc.end();
  });
}
