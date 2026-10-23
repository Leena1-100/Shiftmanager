import type { AwardId, Band, BreakTier, Employment, Multipliers, Settings, Workplace } from '../types';
import { fmtClock12 } from './time';

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

export interface AwardPreset {
  id: AwardId;
  name: string;
  code?: string;
  levels: string[];
  multipliers: Record<Employment, Multipliers>;
  eveningStart: number;
  nightEnd: number;
  breakTiers: BreakTier[];
}

/**
 * Award presets. Rates and penalties change every year and stores may use an enterprise
 * agreement, so everything here is a starting point the user can edit.
 */
export const AWARDS: Record<AwardId, AwardPreset> = {
  // Fast Food Industry Award 2010: weekday 100%, Mon–Fri 10pm–midnight 110%, midnight–6am 115%,
  // Sat 125%, Sun 150%, public holiday 225%. Casual rates include the 25% loading.
  'fast-food': {
    id: 'fast-food',
    name: 'Fast Food Industry Award 2010',
    code: 'MA000003',
    levels: ['Level 1', 'Level 2', 'Level 3'],
    multipliers: {
      parttime: { weekday: 1, evening: 1.1, night: 1.15, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
      fulltime: { weekday: 1, evening: 1.1, night: 1.15, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
      casual: { weekday: 1.25, evening: 1.35, night: 1.4, saturday: 1.5, sunday: 1.75, publicHoliday: 2.5 },
    },
    eveningStart: 22 * 60,
    nightEnd: 6 * 60,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
  // General Retail Industry Award 2020: Mon–Fri after 6pm 125%, Sat 125%, Sun 150%, public holiday 225%.
  // No separate overnight band, so the night band is switched off (nightEnd 0).
  'general-retail': {
    id: 'general-retail',
    name: 'General Retail Industry Award 2020',
    code: 'MA000004',
    levels: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Level 7', 'Level 8'],
    multipliers: {
      parttime: { weekday: 1, evening: 1.25, night: 1.25, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
      fulltime: { weekday: 1, evening: 1.25, night: 1.25, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
      casual: { weekday: 1.25, evening: 1.5, night: 1.5, saturday: 1.5, sunday: 1.75, publicHoliday: 2.5 },
    },
    eveningStart: 18 * 60,
    nightEnd: 0,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
  custom: {
    id: 'custom',
    name: 'Other award / enterprise agreement',
    levels: [],
    multipliers: {
      parttime: { weekday: 1, evening: 1, night: 1, saturday: 1, sunday: 1, publicHoliday: 1 },
      fulltime: { weekday: 1, evening: 1, night: 1, saturday: 1, sunday: 1, publicHoliday: 1 },
      casual: { weekday: 1, evening: 1, night: 1, saturday: 1, sunday: 1, publicHoliday: 1 },
    },
    eveningStart: 22 * 60,
    nightEnd: 6 * 60,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
};

export const EMPLOYMENT_LABEL: Record<Employment, string> = {
  parttime: 'Part-time',
  casual: 'Casual',
  fulltime: 'Full-time',
};

export const WORKPLACE_COLORS = ['#1ec8a5', '#4c7cf0', '#f2994a', '#9b6cf0', '#e8618c', '#2fa3c9'];

export function newWorkplace(index: number, award: AwardId = 'fast-food'): Workplace {
  const preset = AWARDS[award];
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    color: WORKPLACE_COLORS[index % WORKPLACE_COLORS.length],
    award,
    level: preset.levels[0] ?? '',
    employment: 'parttime',
    baseRate: 0,
    multipliers: { ...preset.multipliers.parttime },
    eveningStart: preset.eveningStart,
    nightEnd: preset.nightEnd,
    breakTiers: preset.breakTiers.map((t) => ({ ...t })),
    minEngagementMinutes: 0,
  };
}

/** Re-apply an award's penalty rates, time bands and breaks to a workplace (name, rate, level kept where valid) */
export function applyAward(wp: Workplace, award: AwardId, employment: Employment = wp.employment): Workplace {
  const preset = AWARDS[award];
  return {
    ...wp,
    award,
    employment,
    level: award === 'custom' || preset.levels.includes(wp.level) ? wp.level : (preset.levels[0] ?? ''),
    multipliers: { ...preset.multipliers[employment] },
    eveningStart: preset.eveningStart,
    nightEnd: preset.nightEnd,
    breakTiers: preset.breakTiers.map((t) => ({ ...t })),
  };
}

export function awardLabel(wp: Workplace): string {
  return wp.award === 'custom' ? wp.awardName?.trim() || AWARDS.custom.name : AWARDS[wp.award].name;
}

export const DEFAULT_SETTINGS: Settings = {
  taxMode: 'resident-tft',
  superRate: 0.12,
  weekStartDay: 1,
  mergePriority: 'message',
};

export const BAND_LABEL: Record<keyof Multipliers, string> = {
  weekday: 'Weekday',
  evening: 'Weekday evening',
  night: 'Weekday overnight',
  saturday: 'Saturday',
  sunday: 'Sunday',
  publicHoliday: 'Public holiday',
};

/** Band label including this workplace's time window, e.g. "Weekday evening (10pm–12am)" */
export function bandLabel(band: Band, wp: Pick<Workplace, 'eveningStart' | 'nightEnd'>): string {
  if (band === 'evening') return `${BAND_LABEL.evening} (${fmtClock12(wp.eveningStart)}–12am)`;
  if (band === 'night') return `${BAND_LABEL.night} (12am–${fmtClock12(wp.nightEnd)})`;
  return BAND_LABEL[band];
}
