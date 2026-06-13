/**
 * Indian payroll math (simplified, documented assumptions):
 *  - monthly gross = annual CTC / 12
 *  - BASIC = 50% of gross · HRA = 50% of basic · Special Allowance = remainder
 *  - PF (employee) = 12% of basic, capped at ₹1,800 (₹15,000 wage ceiling)
 *  - PT = ₹200/month (Maharashtra flat; ₹300 in February is ignored for simplicity)
 *  - ESI (employee) = 0.75% of gross when gross ≤ ₹21,000, else nil
 *  - TDS = new-regime FY slabs with ₹75,000 standard deduction and §87A rebate
 *    (zero tax up to ₹12L taxable), annual tax / 12, +4% cess
 *  - LOP proration = paidDays / calendar days of the month
 */

export interface SalaryBreakup {
  basic: number;
  hra: number;
  specialAllowance: number;
  gross: number;
}

export function breakupFromCtc(annualCtc: number): SalaryBreakup {
  const gross = round2(annualCtc / 12);
  const basic = round2(gross * 0.5);
  const hra = round2(basic * 0.5);
  const specialAllowance = round2(gross - basic - hra);
  return { basic, hra, specialAllowance, gross };
}

export function pfEmployee(basic: number): number {
  return round2(Math.min(basic, 15000) * 0.12);
}

export function professionalTax(gross: number): number {
  return gross > 7500 ? 200 : 0;
}

export function esiEmployee(gross: number): number {
  return gross <= 21000 ? round2(gross * 0.0075) : 0;
}

/** Monthly TDS under the new regime (simplified — no investments/other income). */
export function monthlyTds(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75_000);
  if (taxable <= 12_00_000) return 0; // §87A rebate

  const slabs: Array<[number, number, number]> = [
    [0, 4_00_000, 0],
    [4_00_000, 8_00_000, 0.05],
    [8_00_000, 12_00_000, 0.1],
    [12_00_000, 16_00_000, 0.15],
    [16_00_000, 20_00_000, 0.2],
    [20_00_000, 24_00_000, 0.25],
    [24_00_000, Infinity, 0.3],
  ];
  let tax = 0;
  for (const [lo, hi, rate] of slabs) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
  }
  tax *= 1.04; // health & education cess
  return round2(tax / 12);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
