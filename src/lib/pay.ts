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
  // Once a shift is worked, Tanda's own dollar figure is what gets paid
  const fromTanda = useActual && !!shift.tandaPay;
  if (fromTanda) pay = shift.tandaPay!.pay;

  return {
    start,
    end,
    span,
    unpaidBreak,
    paidBreak,
    paidCount: useActual ? (paidBreak > 0 ? Math.max(1, Math.round(paidBreak / 10)) : 0) : rule.paidCount,
    workedMinutes,
    topUpMinutes,
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
});

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
      if (c.usedActual) s.actualCount++;
      for (const [b, m] of Object.entries(c.minutesByBand) as [Band, number][]) {
        s.minutesByBand[b] = (s.minutesByBand[b] ?? 0) + m;
      }
    }
  }
  total.gross = round2(total.gross);
  for (const part of Object.values(total.byWorkplace)) part.gross = round2(part.gross);
  return total;
}
