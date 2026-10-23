import type { BreakTier, Employment, Multipliers, Settings } from '../types';

/**
 * Default penalty multipliers based on the Fast Food Industry Award 2010 (MA000003).
 * Stores and agreements differ, so these are editable in Settings.
 * - Part-time: weekday 100%, Mon–Fri 10pm–midnight 110%, Mon–Fri midnight–6am 115%, Sat 125%, Sun 150%, public holiday 225%
 * - Casual (incl. 25% loading): weekday 125%, evening 135%, night 140%, Sat 150%, Sun 175%, public holiday 250%
 */
export const DEFAULT_MULTIPLIERS: Record<Employment, Multipliers> = {
  parttime: { weekday: 1, evening: 1.1, night: 1.15, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
  casual: { weekday: 1.25, evening: 1.35, night: 1.4, saturday: 1.5, sunday: 1.75, publicHoliday: 2.5 },
};

/**
 * Default Fast Food Award break entitlements
 * - 4h or more: one paid 10-min rest break
 * - Over 5h: one paid 10-min break + 30-min unpaid meal break
 * - Over 7h: two paid 10-min breaks + 30-min unpaid meal break
 * - Over 9h: two paid 10-min breaks + 60 min unpaid meal breaks
 */
export const DEFAULT_BREAK_TIERS: BreakTier[] = [
  { minMinutes: 240, paidCount: 1, paidLength: 10, unpaidMinutes: 0 },
  { minMinutes: 301, paidCount: 1, paidLength: 10, unpaidMinutes: 30 },
  { minMinutes: 421, paidCount: 2, paidLength: 10, unpaidMinutes: 30 },
  { minMinutes: 541, paidCount: 2, paidLength: 10, unpaidMinutes: 60 },
];

export const DEFAULT_SETTINGS: Settings = {
  baseRate: 26.5,
  employment: 'parttime',
  multipliers: { ...DEFAULT_MULTIPLIERS.parttime },
  breakTiers: DEFAULT_BREAK_TIERS.map((t) => ({ ...t })),
  minEngagementMinutes: 0,
  taxMode: 'resident-tft',
  superRate: 0.12,
  weekStartDay: 1,
  mergePriority: 'message',
};

export const BAND_LABEL: Record<keyof Multipliers, string> = {
  weekday: 'Weekday',
  evening: 'Weekday evening (10pm–12am)',
  night: 'Weekday night (12am–6am)',
  saturday: 'Saturday',
  sunday: 'Sunday',
  publicHoliday: 'Public holiday',
};
