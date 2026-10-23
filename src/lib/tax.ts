import type { TaxMode } from '../types';

/**
 * Weekly PAYG withholding estimate using 2026–27 Australian income tax rates.
 * This is an estimate and may differ from the ATO Schedule 1 tables by a few dollars.
 * - Resident: 0% to $18,200, 15% to $45,000, 30% to $135,000, 37% to $190,000, 45% above
 * - Working holiday maker: 15% to $45,000, then resident rates
 * - Non-resident: 30% to $135,000, 37% to $190,000, 45% above
 * - Medicare levy 2% with the low-income phase-in (not applied to WHM / non-residents)
 */
type Bracket = [upTo: number, rate: number];

const RESIDENT: Bracket[] = [
  [18_200, 0],
  [45_000, 0.15],
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];
const WHM: Bracket[] = [
  [45_000, 0.15],
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];
const NON_RESIDENT: Bracket[] = [
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];

export const TAX_FREE_THRESHOLD = 18_200;
export const WEEKLY_TAX_FREE = TAX_FREE_THRESHOLD / 52;

const MEDICARE_LOW = 27_222;
const MEDICARE_HIGH = 34_027;

function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}

function medicare(income: number): number {
  if (income <= MEDICARE_LOW) return 0;
  if (income <= MEDICARE_HIGH) return (income - MEDICARE_LOW) * 0.1;
  return income * 0.02;
}

export function annualTax(income: number, mode: TaxMode): number {
  if (income <= 0) return 0;
  switch (mode) {
    case 'resident-tft':
      return bracketTax(income, RESIDENT) + medicare(income);
    case 'resident-no-tft':
      // Tax-free threshold claimed elsewhere (e.g. second job): tax from the first dollar at 15%
      return bracketTax(income + TAX_FREE_THRESHOLD, RESIDENT) + income * 0.02;
    case 'whm':
      return bracketTax(income, WHM);
    case 'non-resident':
      return bracketTax(income, NON_RESIDENT);
  }
}

/** Estimated withholding for a weekly gross (rounded to whole dollars like the ATO tables) */
export function weeklyWithholding(weeklyGross: number, mode: TaxMode): number {
  if (weeklyGross <= 0) return 0;
  return Math.round(annualTax(weeklyGross * 52, mode) / 52);
}

/** How much more can be earned this week with zero tax (residents claiming the threshold only) */
export function taxFreeRoom(weeklyGross: number, mode: TaxMode): number | null {
  if (mode !== 'resident-tft') return null;
  return Math.max(0, WEEKLY_TAX_FREE - weeklyGross);
}

export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  'resident-tft': 'Resident · claiming the tax-free threshold',
  'resident-no-tft': 'Resident · not claiming the threshold (second job)',
  whm: 'Working holiday maker (417/462 visa, 15%)',
  'non-resident': 'Non-resident (30%)',
};
