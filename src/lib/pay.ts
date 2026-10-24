import type { Band, BreakTier, Shift, Workplace } from '../types';
import { addDays, dayOfWeek } from './time';

export interface BreakAllowance {
  paidCount: number;
  paidMinutes: number;
  unpaidMinutes: number;
}

export function breaksFor(spanMinutes: number, tiers: BreakTier[]): BreakAllowance {
  const tier = [...tiers]
    .sort((a, b) => b.minMinutes - a.minMinutes)
    .find((t) => spanMinutes >= t.minMinutes);
  if (!tier) return { paidCount: 0, paidMinutes: 0, unpaidMinutes: 0 };
  return {
    paidCount: tier.paidCount,
    paidMinutes: tier.paidCount * tier.paidLength,
    unpaidMinutes: tier.unpaidMinutes,
  };
}

/** Penalty band for a minute offset from 00:00 on the shift date */
export function bandAt(
  date: string,
  minute: number,
  publicHoliday: boolean,
  bands: Pick<Workplace, 'eveningStart' | 'nightEnd'>,
): Band {
  const dayOffset = Math.floor(minute / 1440);
  const m = minute - dayOffset * 1440;
  if (publicHoliday && dayOffset === 0) return 'publicHoliday';
  const dow = dayOfWeek(dayOffset === 0 ? date : addDays(date, dayOffset));
  if (dow === 6) return 'saturday';
  if (dow === 0) return 'sunday';
  if (m >= bands.eveningStart) return 'evening';
  if (m < bands.nightEnd) return 'night';
  return 'weekday';
}

export interface ShiftCalc {
  start: number;
  end: number;
  span: number;
  unpaidBreak: number;
  paidBreak: number;
  paidCount: number;
  /** Paid minutes (= span - unpaid break) */
  workedMinutes: number;
  /** Minutes added to meet the minimum engagement */
  topUpMinutes: number;
  /** Break minutes that were skipped and are paid as extra time on top of the hours worked */
  missedBreakMinutes: number;
  /** Flat per-shift allowance included in pay */
  allowance: number;
  minutesByBand: Partial<Record<Band, number>>;
  pay: number;
  usedActual: boolean;
  /** Pay taken from Tanda instead of calculated */
  fromTanda: boolean;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Pay for a single shift, calculated per minute.
 * mode 'planned' = rostered times; 'effective' = actual times when recorded, otherwise rostered.
 * The unpaid break is assumed to sit in the middle of the shift; every other minute gets its band multiplier.
 */
export function calcShift(shift: Shift, wp: Workplace, mode: 'planned' | 'effective' = 'effective'): ShiftCalc {
  const useActual = mode === 'effective' && !!shift.actual;
  const start = useActual ? shift.actual!.start : shift.start;
  const end = useActual ? shift.actual!.end : shift.end;
  const span = Math.max(0, end - start);
  const rule = breaksFor(span, wp.breakTiers);
  const unpaidBreak = Math.min(
    span,
    useActual ? shift.actual!.unpaidBreak : (shift.unpaidBreak ?? rule.unpaidMinutes),
  );
  const paidBreak = useActual ? shift.actual!.paidBreak : rule.paidMinutes;

  const breakStart = start + Math.floor((span - unpaidBreak) / 2);
  const breakEnd = breakStart + unpaidBreak;

  const minutesByBand: Partial<Record<Band, number>> = {};
  const ph = !!shift.publicHoliday;
  for (let t = start; t < end; t++) {
    if (t >= breakStart && t < breakEnd) continue;
    const b = bandAt(shift.date, t, ph, wp);
    minutesByBand[b] = (minutesByBand[b] ?? 0) + 1;
  }
  // Breaks that weren't taken are paid as extra time on top of the hours worked, as Tanda does:
  // a skipped paid rest break pays its minutes, a skipped meal break pays the meal break length.
  // For Tanda shifts the baseline is what Tanda had recorded (its pay already covers that);
  // otherwise it is the award entitlement for the shift length.
  let missedBreakMinutes = 0;
  if (useActual) {
    const a = shift.actual!;
    const paidBase = shift.tandaPay ? (shift.tandaPay.paidBreak ?? rule.paidMinutes) : rule.paidMinutes;
    const mealBase = shift.tandaPay ? (shift.tandaPay.unpaidBreak ?? 0) : rule.unpaidMinutes;
    missedBreakMinutes += Math.max(0, paidBase - a.paidBreak);
    if (mealBase > 0 && a.unpaidBreak === 0) missedBreakMinutes += mealBase;
  }
  const missedBand = bandAt(shift.date, Math.max(start, end - 1), ph, wp);
  // Tanda pays missed breaks in hours rounded to 2 decimals (10 min = 0.17 h)
  const missedPay = ((Math.round((missedBreakMinutes / 60) * 100) / 100) * wp.baseRate * wp.multipliers[missedBand]);
  if (missedBreakMinutes > 0) minutesByBand[missedBand] = (minutesByBand[missedBand] ?? 0) + missedBreakMinutes;
  const workedMinutes = span - unpaidBreak;

  let topUpMinutes = 0;
  if (wp.minEngagementMinutes > 0 && workedMinutes > 0 && workedMinutes < wp.minEngagementMinutes) {
    topUpMinutes = wp.minEngagementMinutes - workedMinutes;
    const b = bandAt(shift.date, start, ph, wp);
    minutesByBand[b] = (minutesByBand[b] ?? 0) + topUpMinutes;
  }

  let pay = 0;
  for (const [band, mins] of Object.entries(minutesByBand) as [Band, number][]) {
    pay += (mins * wp.baseRate * wp.multipliers[band]) / 60;
  }
  // Swap the exact-minute value of missed breaks for Tanda's rounded-hours value
  pay += missedPay - (missedBreakMinutes * wp.baseRate * wp.multipliers[missedBand]) / 60;
  const allowance = span > 0 ? (wp.shiftAllowance ?? 0) : 0;
  pay += allowance;
  // Once a shift is worked, Tanda's own dollar figure is what gets paid
  const fromTanda = useActual && !!shift.tandaPay;
  // Tanda's figure already includes allowances; only breaks missed since then are added
  if (fromTanda) pay = shift.tandaPay!.pay + missedPay;

  return {
    start,
    end,
    span,
    unpaidBreak,
    paidBreak,
    paidCount: useActual ? (paidBreak > 0 ? Math.max(1, Math.round(paidBreak / 10)) : 0) : rule.paidCount,
    workedMinutes,
    topUpMinutes,
    missedBreakMinutes,
    allowance: fromTanda ? 0 : allowance,
    minutesByBand,
    pay: round2(pay),
    usedActual: useActual,
    fromTanda,
  };
}

export interface PaySummary {
  shifts: number;
  workedMinutes: number;
  unpaidBreak: number;
  paidBreak: number;
  gross: number;
  minutesByBand: Partial<Record<Band, number>>;
  actualCount: number;
  /** Pay from shifts that came only from a pasted message roster: no tax or super is taken from it */
  untaxedGross: number;
}

export interface WeekSummary extends PaySummary {
  /** Per-workplace totals, keyed by workplace id */
  byWorkplace: Record<string, PaySummary>;
}

const emptySummary = (): PaySummary => ({
  shifts: 0,
  workedMinutes: 0,
  unpaidBreak: 0,
  paidBreak: 0,
  gross: 0,
  minutesByBand: {},
  actualCount: 0,
  untaxedGross: 0,
});

/** Shifts known only from a pasted message (never confirmed by Tanda) */
export function isMessageOnly(shift: Shift): boolean {
  return shift.sources.length > 0 && shift.sources.every((s) => s === 'message');
}

/** Message-roster shifts are counted without tax or super unless the user turns tax on for that shift */
export function isUntaxed(shift: Shift): boolean {
  return isMessageOnly(shift) && !shift.applyTax;
}

/** The part of a summary that tax and super are worked out on */
export function taxableGross(s: PaySummary): number {
  return round2(s.gross - s.untaxedGross);
}

/** The workplace a shift is paid under (falls back to the first workplace for unassigned shifts) */
export function workplaceFor(shift: Shift, workplaces: Workplace[]): Workplace | undefined {
  return workplaces.find((w) => w.id === shift.workplaceId) ?? workplaces[0];
}

export function summarize(shifts: Shift[], workplaces: Workplace[], mode: 'planned' | 'effective'): WeekSummary {
  const total: WeekSummary = { ...emptySummary(), byWorkplace: {} };
  for (const sh of shifts) {
    const wp = workplaceFor(sh, workplaces);
    if (!wp) continue;
    const c = calcShift(sh, wp, mode);
    const part = (total.byWorkplace[wp.id] ??= emptySummary());
    for (const s of [total, part]) {
      s.shifts++;
      s.workedMinutes += c.workedMinutes;
      s.unpaidBreak += c.unpaidBreak;
      s.paidBreak += c.paidBreak;
      s.gross += c.pay;
      if (isUntaxed(sh)) s.untaxedGross += c.pay;
      if (c.usedActual) s.actualCount++;
      for (const [b, m] of Object.entries(c.minutesByBand) as [Band, number][]) {
        s.minutesByBand[b] = (s.minutesByBand[b] ?? 0) + m;
      }
    }
  }
  for (const s of [total, ...Object.values(total.byWorkplace)]) {
    s.gross = round2(s.gross);
    s.untaxedGross = round2(s.untaxedGross);
  }
  return total;
}
