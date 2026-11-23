import type { Payslip, TaxMode, WeekMeta } from '../types';
import { taxableGross, type WeekSummary } from './pay';
import { weeklyWithholding } from './tax';
import { makeISO } from './time';
import { isTemplatePayslip, parseTemplatePayslip } from './payslipTemplate';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Dollar amounts always have cents on a payslip, which keeps hours and dates out */
const MONEY_RE = /-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g;

const money = (s: string) => Number(s.replace(/[$,\s]/g, ''));

/** Earnings and allowance lines, which list their own amounts */
const ALLOWANCE_RE = /allowance|laundry|uniform|meal\s+money|ordinary|overtime|penalty|loading|reimburse/i;
/** A line holding only amounts (an OCR'd table column), e.g. "58.00" or "$662.94 $10,155.40" */
const NUMBERS_ONLY_RE = /^[\s$\d.,()-]+$/;

const LABELS: { key: 'gross' | 'tax' | 'net' | 'super'; re: RegExp; skip?: RegExp }[] = [
  { key: 'gross', re: /gross(?:\s+(?:pay|earnings|wages|income|amount))?|total\s+earnings|total\s+pay\b/i, skip: /ytd\s*gross/i },
  { key: 'tax', re: /payg|tax\s*(?:withheld|deducted)|withholding|income\s+tax|^\s*tax\b/i, skip: /taxable|pre-?tax|after\s+tax/i },
  { key: 'net', re: /net\s*(?:pay|amount|wages|income|payment)?|take[\s-]*home|amount\s+paid|paid\s+to\s+(?:bank|account)/i },
  { key: 'super', re: /super(?:annuation)?|\bsg\b|guarantee/i },
];

/** Dates in the forms payslips use: 17/11/2026, 17-11-2026, 2026-11-17, 17 Nov 2026 */
function datesIn(line: string): string[] {
  const out: { at: number; iso: string }[] = [];
  for (const m of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) out.push({ at: m.index!, iso: makeISO(+m[1], +m[2], +m[3]) });
  for (const m of line.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    out.push({ at: m.index!, iso: makeISO(y, +m[2], +m[1]) });
  }
  for (const m of line.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi)) {
    out.push({ at: m.index!, iso: makeISO(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) });
  }
  return out.sort((a, b) => a.at - b.at).map((d) => d.iso);
}

/**
 * Read the numbers off a payslip (pasted text or OCR of a screenshot). Each figure is the first
 * amount after its label on the same line, or on the next line when the payslip is laid out as a
 * table. With "This period" and "YTD" columns, the first amount is this period's.
 */
export function parsePayslip(text: string): Partial<Payslip> {
  const generic = parseAnyPayslip(text);
  if (!isTemplatePayslip(text)) return generic;
  // This employer's payslip layout: read each figure from its fixed place, fall back to the general reader
  const template = parseTemplatePayslip(text);
  const merged: Partial<Payslip> = { ...generic };
  for (const [k, v] of Object.entries(template) as [keyof Payslip, never][]) if (v !== undefined) merged[k] = v;
  return merged;
}

function parseAnyPayslip(text: string): Partial<Payslip> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const found: Partial<Payslip> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { key, re, skip } of LABELS) {
      if (found[key] !== undefined || skip?.test(line)) continue;
      const m = re.exec(line);
      if (!m) continue;
      // Allowance and earnings lines (e.g. "Laundry Allowance 3 1.28 3.84") never hold gross, tax or net
      if (key !== 'super' && ALLOWANCE_RE.test(line)) continue;
      const after = line.slice(m.index + m[0].length);
      // When the amount isn't on the label's line, only a line of bare numbers below it counts
      const next = lines[i + 1];
      const amounts = after.match(MONEY_RE) ?? (next && NUMBERS_ONLY_RE.test(next) ? next.match(MONEY_RE) : null);
      if (amounts) found[key] = Math.abs(money(amounts[0]));
    }
    if (/pay\s*date|payment\s+date|paid\s+on|date\s+paid/i.test(line) && !found.payDate) {
      const [d] = datesIn(line);
      if (d) found.payDate = d;
    }
    if (/period|week\s+(?:ending|starting)|from|to/i.test(line) && !found.periodStart) {
      const ds = datesIn(line);
      if (ds.length >= 2) [found.periodStart, found.periodEnd] = ds;
      else if (ds.length === 1 && /ending|end/i.test(line)) found.periodEnd = ds[0];
    }
  }

  // Hours: a "Total hours" line wins; otherwise the first "<n> hours" / "Hours <n>" on an earnings line
  const HOURS = '(\\d{1,3}(?:\\.\\d{1,2})?)(?![\\d.])';
  const total = lines.map((l) => new RegExp(`total\\s+(?:hours|hrs)(?:\\s+worked)?\\s*[:\\-]?\\s*${HOURS}`, 'i').exec(l)).find(Boolean);
  const anyHours = lines
    .map((l) => new RegExp(`(?:hours|hrs)(?:\\s+worked)?\\s*[:\\-]?\\s*${HOURS}|${HOURS}\\s*(?:hours|hrs)\\b`, 'i').exec(l))
    .find(Boolean);
  const h = total ?? anyHours;
  if (h) found.hours = Number(h[1] ?? h[2]);

  if (!found.periodStart && !found.periodEnd) {
    // No labelled period: the first two dates that aren't the pay date
    const ds = lines.flatMap(datesIn).filter((d) => d !== found.payDate);
    if (ds.length >= 2) [found.periodStart, found.periodEnd] = ds;
  }
  // Cross-check: gross - tax should equal net. If the tax read doesn't fit, use the amount on the
  // payslip that does (the real tax line), so a mis-read never sticks
  if (found.gross !== undefined && found.net !== undefined) {
    const target = Math.round((found.gross - found.net) * 100) / 100;
    if (found.tax === undefined || Math.abs(found.gross - found.tax - found.net) > 0.05) {
      const all = lines.flatMap((l) => l.match(MONEY_RE) ?? []).map((a) => Math.abs(money(a)));
      if (all.some((a) => Math.abs(a - target) < 0.01)) found.tax = target;
    }
  }
  if (found.net === undefined && found.gross !== undefined && found.tax !== undefined) {
    found.net = Math.round((found.gross - found.tax) * 100) / 100;
  }
  return found;
}

export interface WeekMoney {
  /** Week pay before tax: payslip gross (or the app's Tanda total) plus cash shifts */
  gross: number;
  /** Tanda (taxed) part of the week */
  tandaGross: number;
  tax: number;
  /** Take-home: payslip net (or Tanda minus estimated tax) plus cash shifts */
  net: number;
  /** Cash for the week: the amount received when entered, otherwise the expected payout */
  cash: number;
  /** Cash shifts added up to the cent, before the cents digit is dropped */
  cashExact: number;
  /** What the cash shifts should pay this week (cents digit dropped) */
  cashExpected: number;
  /** Cash received minus expected: + got more, − got less (0 when not entered) */
  cashDiff: number;
  fromPayslip: boolean;
  /** The app's own Tanda total, to compare with the payslip */
  appTanda: number;
  /** Payslip gross minus the app's Tanda total */
  diff: number;
}

/** Cash is paid as one weekly total with the second decimal place dropped: $177.75 -> $177.70 */
export function cashPaid(total: number): number {
  return Math.floor(Math.round(total * 100) / 10) / 10;
}

/** A week's money, using the payslip's actual figures for the Tanda part when there is one */
export function weekMoney(sum: WeekSummary, meta: WeekMeta | undefined, taxMode: TaxMode): WeekMoney {
  const appTanda = taxableGross(sum);
  const cashExact = Math.round((sum.gross - appTanda) * 100) / 100;
  const cashExpected = cashPaid(cashExact);
  // What was actually handed over, when it was entered for the week
  const cash = meta?.cashReceived ?? cashExpected;
  const cashDiff = Math.round((cash - cashExpected) * 100) / 100;
  const p = meta?.payslip;
  if (!p) {
    const tax = weeklyWithholding(appTanda, taxMode);
    const gross = Math.round((appTanda + cash) * 100) / 100;
    return {
      gross,
      tandaGross: appTanda,
      tax,
      net: Math.round((gross - tax) * 100) / 100,
      cash,
      cashExact,
      cashExpected,
      cashDiff,
      fromPayslip: false,
      appTanda,
      diff: 0,
    };
  }
  const net = p.net ?? p.gross - p.tax;
  return {
    gross: Math.round((p.gross + cash) * 100) / 100,
    tandaGross: p.gross,
    tax: p.tax,
    net: Math.round((net + cash) * 100) / 100,
    cash,
    cashExact,
    cashExpected,
    cashDiff,
    fromPayslip: true,
    appTanda,
    diff: Math.round((p.gross - appTanda) * 100) / 100,
  };
}

/** Gross minus tax doesn't match net: usually a mis-read tax (other deductions are rare) */
export function payslipMismatch(p: Payslip): number | null {
  if (p.net === undefined) return null;
  const expectedTax = Math.round((p.gross - p.net) * 100) / 100;
  return Math.abs(expectedTax - p.tax) > 0.05 ? expectedTax : null;
}
