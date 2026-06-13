import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const LOGO_PATH = path.resolve(process.cwd(), "assets/logo_STech.jpg");

export interface PayslipPdfData {
  company: { name: string; address: string | null };
  employee: {
    name: string; code: string; designation: string; department: string;
    email: string; bankLast4: string | null; dateOfJoining: string | null;
  };
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
export function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 96;

    // header band
    const bandH = 104;
    doc.rect(0, 0, doc.page.width, bandH).fill(NAVY);

    // brand logo on a white chip (falls back to text-only if the asset is missing)
    let hasLogo = false;
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.roundedRect(48, 20, 48, 48, 6).fill("#ffffff");
        doc.image(LOGO_PATH, 53, 25, { fit: [38, 38], align: "center", valign: "center" });
        hasLogo = true;
      }
    } catch {
      hasLogo = false;
    }

    const textX = hasLogo ? 108 : 48;
    doc.fill("#ffffff").font("Helvetica-Bold").fontSize(hasLogo ? 14 : 20).text(data.company.name, textX, hasLogo ? 28 : 24, { width: 260 });
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff")
      .text(`PAYSLIP — ${data.period.toUpperCase()}`, 48, hasLogo ? 30 : 34, { width: W, align: "right" });
    // address on its own full-width line below the logo row, then tagline
    doc.font("Helvetica").fontSize(8).fillColor("#cbd5e1")
      .text(data.company.address ?? "", 48, 70, { width: W })
      .text("People. Performance. Growth.", 48, 86, { width: W });

    // employee block
    let y = bandH + 24;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("Employee Details", 48, y);
    y += 18;
    const left: Array<[string, string]> = [
      ["Name", data.employee.name],
      ["Employee Code", data.employee.code],
      ["Designation", data.employee.designation],
      ["Department", data.employee.department],
    ];
    const right: Array<[string, string]> = [
      ["Date of Joining", data.employee.dateOfJoining ?? "—"],
      ["Bank A/c", data.employee.bankLast4 ? `••••${data.employee.bankLast4}` : "—"],
      ["Paid Days", String(data.paidDays)],
      ["LOP Days", String(data.lopDays)],
    ];
    doc.fontSize(9);
    left.forEach(([k, v], i) => {
      doc.font("Helvetica").fillColor(SLATE).text(k, 48, y + i * 16, { width: 90 });
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(v, 140, y + i * 16, { width: 160 });
    });
    right.forEach(([k, v], i) => {
      doc.font("Helvetica").fillColor(SLATE).text(k, 320, y + i * 16, { width: 100 });
      doc.font("Helvetica-Bold").fillColor("#1e293b").text(v, 424, y + i * 16, { width: 120 });
    });
    y += left.length * 16 + 16;

    // earnings / deductions table
    const colW = W / 2 - 8;
    const tableTop = y;
    const drawTable = (x: number, title: string, rows: Array<{ label: string; amount: number }>, total: number) => {
      doc.rect(x, tableTop, colW, 22).fill(NAVY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#ffffff")
        .text(title, x + 10, tableTop + 7)
        .text("Amount (Rs.)", x + 10, tableTop + 7, { width: colW - 20, align: "right" });
      let ry = tableTop + 22;
      rows.forEach((row, i) => {
        if (i % 2 === 0) doc.rect(x, ry, colW, 18).fill("#f8fafc");
        doc.font("Helvetica").fontSize(9).fillColor("#1e293b")
          .text(row.label, x + 10, ry + 5, { width: colW - 120 })
          .text(inr(row.amount), x + 10, ry + 5, { width: colW - 20, align: "right" });
        ry += 18;
      });
      doc.rect(x, ry, colW, 20).fill("#eef4f9");
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY)
        .text(`Total ${title}`, x + 10, ry + 6)
        .text(inr(total), x + 10, ry + 6, { width: colW - 20, align: "right" });
      doc.rect(x, tableTop, colW, ry + 20 - tableTop).strokeColor(BORDER).lineWidth(0.5).stroke();
      return ry + 20;
    };
    const leftEnd = drawTable(48, "Earnings", data.earnings, data.gross);
    const rightEnd = drawTable(48 + colW + 16, "Deductions", data.deductions, data.totalDeductions);
    y = Math.max(leftEnd, rightEnd) + 24;

    // net pay band
    doc.rect(48, y, W, 44).fill("#eef4f9");
    doc.rect(48, y, W, 44).strokeColor(NAVY).lineWidth(1).stroke();
    doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text("NET PAY", 60, y + 9);
    doc.fontSize(15).text(`Rs. ${inr(data.net)}`, 48, y + 8, { width: W - 12, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor(SLATE)
      .text(`Rupees ${numberToWords(data.net)} Only`, 60, y + 28, { width: W - 24 });
    y += 64;

    doc.font("Helvetica").fontSize(7.5).fillColor(SLATE).text(
      "This is a system-generated payslip from Somvanshi HRMS and does not require a signature. " +
      "Figures are rounded to the nearest paisa. For queries contact HR.",
      48, y, { width: W }
    );

    doc.end();
  });
}
