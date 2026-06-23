/**
 * Indian payroll math — now DRIVEN BY a DB-backed StatutoryConfig instead of
 * hardcoded constants, so HR can tune the structure split and PF/ESI/PT/TDS
 * rates per company. `DEFAULT_STATUTORY` reproduces the previous behaviour and
 * is used when no config row exists yet.
 */

export interface StatutoryConfig {
  flatStructure: boolean;
  basicPercentOfCtc: number;
  hraPercentOfBasic: number;
  statutoryEnabled: boolean;
  pfEnabled: boolean;
  pfRate: number; // % of basic
  pfWageCap: number;
  esiEnabled: boolean;
  esiRate: number; // % of gross
  esiGrossThreshold: number;
  ptEnabled: boolean;
  ptAmount: number;
  ptGrossThreshold: number;
  tdsEnabled: boolean;
  tdsStandardDeduction: number;
  tdsRebateLimit: number;
  tdsCessRate: number; // %
  tdsSlabs: Array<[number, number, number]> | null; // [from, to, rate]
}

/** Built-in new-regime FY slabs used when config.tdsSlabs is null. */
const DEFAULT_TDS_SLABS: Array<[number, number, number]> = [
  [0, 4_00_000, 0],
  [4_00_000, 8_00_000, 0.05],
  [8_00_000, 12_00_000, 0.1],
  [12_00_000, 16_00_000, 0.15],
  [16_00_000, 20_00_000, 0.2],
  [20_00_000, 24_00_000, 0.25],
  [24_00_000, Infinity, 0.3],
];

export const DEFAULT_STATUTORY: StatutoryConfig = {
  flatStructure: true,
  basicPercentOfCtc: 50,
  hraPercentOfBasic: 50,
  statutoryEnabled: false,
  pfEnabled: true,
  pfRate: 12,
  pfWageCap: 15000,
  esiEnabled: true,
  esiRate: 0.75,
  esiGrossThreshold: 21000,
  ptEnabled: true,
  ptAmount: 200,
  ptGrossThreshold: 7500,
  tdsEnabled: true,
  tdsStandardDeduction: 75000,
  tdsRebateLimit: 12_00_000,
  tdsCessRate: 4,
  tdsSlabs: null,
};

export interface SalaryBreakup {
  basic: number;
  hra: number;
  specialAllowance: number;
  gross: number;
}

export function breakupFromCtc(annualCtc: number, cfg: StatutoryConfig = DEFAULT_STATUTORY): SalaryBreakup {
  const gross = round2(annualCtc / 12);
  if (cfg.flatStructure) {
    return { basic: gross, hra: 0, specialAllowance: 0, gross };
  }
  const basic = round2(gross * (cfg.basicPercentOfCtc / 100));
  const hra = round2(basic * (cfg.hraPercentOfBasic / 100));
  const specialAllowance = round2(gross - basic - hra);
  return { basic, hra, specialAllowance, gross };
}

export function pfEmployee(basic: number, cfg: StatutoryConfig = DEFAULT_STATUTORY): number {
  if (!cfg.pfEnabled) return 0;
  return round2(Math.min(basic, cfg.pfWageCap) * (cfg.pfRate / 100));
}

export function professionalTax(gross: number, cfg: StatutoryConfig = DEFAULT_STATUTORY): number {
  if (!cfg.ptEnabled) return 0;
  return gross > cfg.ptGrossThreshold ? cfg.ptAmount : 0;
}

export function esiEmployee(gross: number, cfg: StatutoryConfig = DEFAULT_STATUTORY): number {
  if (!cfg.esiEnabled) return 0;
  return gross <= cfg.esiGrossThreshold ? round2(gross * (cfg.esiRate / 100)) : 0;
}

/** Monthly TDS (simplified — no investments/other income). */
export function monthlyTds(annualGross: number, cfg: StatutoryConfig = DEFAULT_STATUTORY): number {
  if (!cfg.tdsEnabled) return 0;
  const taxable = Math.max(0, annualGross - cfg.tdsStandardDeduction);
  if (taxable <= cfg.tdsRebateLimit) return 0; // §87A-style rebate

  const slabs = cfg.tdsSlabs ?? DEFAULT_TDS_SLABS;
  let tax = 0;
  for (const [lo, hi, rate] of slabs) {
    if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate;
  }
  tax *= 1 + cfg.tdsCessRate / 100;
  return round2(tax / 12);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
