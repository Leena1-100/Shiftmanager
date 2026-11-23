import type { Payslip } from '../types';

/**
 * Reader for the payslip layout this employer's payroll sends every week (see docs/payslip-format.md).
 *
 *   Period Starting 16 Nov 2026          <- periodStart
 *   Period Ending   22 Nov 2026          <- periodEnd
 *   Payment Date    24 Nov 2026          <- payDate
 *   Gross Earning   $662.94              <- gross
 *   Net Pay         $604.94              <- net
 *   Superannuation  $79.55               <- super
 *   SALARY & WAGE   Units  Rate      This Pay  YTD
 *     Ordinary Hours 23.7  $27.81000 $659.10   $2,650.58   <- hours = This Pay / Rate
 *     Allowances subject to tax withholding and super     <- a heading, NOT the tax line
 *     Laundry        3     $1.28000  $3.84     $17.92
 *   TAX
 *     PAYG                           $58.00    $174.00     <- tax (This Pay column)
 *   PAYMENT DETAILS ... $604.94                            <- net, cross-check
 *
 * Every amount on this payslip is printed with a $ and cents. OCR sometimes drops the decimal point
 * ("$384" for $3.84, "$7955" for $79.55), so a $ amount without one is read as cents.
 */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "16 Nov 2026", "24Nov 2026", "16/11/2026" -> ISO date */
function dateOn(line: string): string | undefined {
  const m = /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4})/i.exec(line);
  if (m) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(line);
  return d ? `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}` : undefined;
}

/** $ amounts on a line, in order, with OCR's missing decimal points put back */
export function dollars(line: string): number[] {
  return [...line.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)/g)].map(([, raw]) => {
    const digits = raw.replace(/,/g, '');
    if (digits.includes('.')) return Number(digits);
    // No decimal point read: the last two digits are the cents
    return digits.length >= 3 ? Number(digits) / 100 : Number(digits);
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** True when the text looks like this payslip layout */
export function isTemplatePayslip(text: string): boolean {
  return /period\s+starting/i.test(text) && /period\s+ending/i.test(text) && /\bPAYG\b/.test(text) && /net\s+pay/i.test(text);
}

export function parseTemplatePayslip(text: string): Partial<Payslip> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Partial<Payslip> = {};
  const first = (re: RegExp) => lines.find((l) => re.test(l));

  const start = first(/period\s+starting/i);
  const end = first(/period\s+ending/i);
  const paid = first(/payment\s+date/i);
  if (start) out.periodStart = dateOn(start.slice(start.search(/period\s+starting/i)));
  if (end) out.periodEnd = dateOn(end.slice(end.search(/period\s+ending/i)));
  if (paid) out.payDate = dateOn(paid.slice(paid.search(/payment\s+date/i)));

  // Summary box. OCR may read "Earning" as "Eaming"; the label may share a line with the name/address column
  const grossLine = first(/gross\s+ea\w*ing/i);
  if (grossLine) out.gross = dollars(grossLine.slice(grossLine.search(/gross\s+ea/i)))[0];
  const netLine = first(/net\s+pay/i);
  if (netLine) out.net = dollars(netLine.slice(netLine.search(/net\s+pay/i)))[0];
  const superLine = first(/superannuation/i) ?? first(/super\s+guarantee/i);
  if (superLine) out.super = dollars(superLine.slice(superLine.search(/super/i)))[0];

  // Tax: the PAYG line under TAX; its first $ amount is This Pay (the second is YTD)
  const payg = lines.find((l) => /^PAYG\b/i.test(l) || /\bPAYG\s+\$/i.test(l));
  if (payg) out.tax = dollars(payg)[0];

  // Hours: every "... Hours <units> $rate $thisPay $ytd" line under SALARY & WAGE.
  // Units can lose their decimal point in OCR, so hours = This Pay / Rate
  let hours = 0;
  for (const l of lines) {
    if (!/hours/i.test(l) || /leave|accrued/i.test(l)) continue;
    const [rate, pay] = dollars(l);
    if (rate && pay) hours += pay / rate;
  }
  if (hours > 0) out.hours = round2(hours);

  // Net cross-check with PAYMENT DETAILS (the last $ amount after that heading)
  const payIdx = lines.findIndex((l) => /payment\s+details/i.test(l));
  if (payIdx >= 0) {
    const paidAmounts = lines.slice(payIdx + 1).flatMap(dollars);
    if (out.net === undefined && paidAmounts.length) out.net = paidAmounts[paidAmounts.length - 1];
  }

  // Gross = net + tax on this payslip (no other deductions); fill or repair whichever is missing or off
  if (out.gross !== undefined && out.net !== undefined) {
    const tax = round2(out.gross - out.net);
    if (out.tax === undefined || Math.abs(out.tax - tax) > 0.05) out.tax = tax;
  } else if (out.gross !== undefined && out.tax !== undefined && out.net === undefined) {
    out.net = round2(out.gross - out.tax);
  } else if (out.net !== undefined && out.tax !== undefined && out.gross === undefined) {
    out.gross = round2(out.net + out.tax);
  }
  return out;
}
