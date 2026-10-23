import type { AwardId, Band, BreakTier, Employment, JuniorAge, Multipliers, Settings, Workplace } from '../types';
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

export interface AwardLevel {
  name: string;
  /** Adult full-time/part-time minimum hourly rate (casuals get the 25% loading on top) */
  rate: number;
}

export interface AwardPreset {
  id: AwardId;
  name: string;
  code?: string;
  levels: AwardLevel[];
  /** When the level rates took effect */
  ratesFrom?: string;
  /** Junior rate as a percentage of the adult rate */
  juniorPercent?: Record<Exclude<JuniorAge, 'adult'>, number>;
  multipliers: (level: string, employment: Employment) => Multipliers;
  eveningStart: number;
  nightEnd: number;
  breakTiers: BreakTier[];
}

export const PAY_GUIDES_URL = 'https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides';

const flat = (n: number): Multipliers => ({ weekday: n, evening: n, night: n, saturday: n, sunday: n, publicHoliday: n });

/**
 * Award presets with minimum rates from the first full pay period on or after 1 July 2026
 * (Annual Wage Review 2026, +4.75%). Stores may pay more or use an enterprise agreement,
 * so every value is a starting point the user can edit.
 */
export const AWARDS: Record<AwardId, AwardPreset> = {
  // Fast Food Industry Award 2010: Mon–Fri 10pm–midnight +10%, midnight–6am +15%, Saturday 125%,
  // public holiday 225%. Sunday is 125% for Level 1 (cut in 2017) and 150% for Levels 2–3.
  // Casual rates include the 25% loading (Level 1 casual: Saturday and Sunday both 150%).
  'fast-food': {
    id: 'fast-food',
    name: 'Fast Food Industry Award 2010',
    code: 'MA000003',
    levels: [
      { name: 'Level 1', rate: 27.81 },
      { name: 'Level 2', rate: 29.45 },
      { name: 'Level 3 (in charge of 1 or no person)', rate: 29.91 },
      { name: 'Level 3 (in charge of 2 or more people)', rate: 30.27 },
    ],
    ratesFrom: '1 July 2026',
    juniorPercent: { under16: 40, '16': 50, '17': 60, '18': 70, '19': 80, '20': 90 },
    multipliers: (level, employment) => {
      const level1 = level === 'Level 1';
      return employment === 'casual'
        ? { weekday: 1.25, evening: 1.35, night: 1.4, saturday: 1.5, sunday: level1 ? 1.5 : 1.75, publicHoliday: 2.5 }
        : { weekday: 1, evening: 1.1, night: 1.15, saturday: 1.25, sunday: level1 ? 1.25 : 1.5, publicHoliday: 2.25 };
    },
    eveningStart: 22 * 60,
    nightEnd: 6 * 60,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
  // General Retail Industry Award 2020: Mon–Fri after 6pm 125%, Saturday 125%, Sunday 150%,
  // public holiday 225% (casual: 150%, 150%, 175%, 250%). No separate overnight band.
  'general-retail': {
    id: 'general-retail',
    name: 'General Retail Industry Award 2020',
    code: 'MA000004',
    levels: [
      { name: 'Level 1', rate: 27.81 },
      { name: 'Level 2', rate: 28.45 },
      { name: 'Level 3', rate: 28.89 },
      { name: 'Level 4', rate: 29.45 },
      { name: 'Level 5', rate: 30.66 },
      { name: 'Level 6', rate: 31.11 },
      { name: 'Level 7', rate: 32.67 },
      { name: 'Level 8', rate: 33.99 },
    ],
    ratesFrom: '1 July 2026',
    juniorPercent: { under16: 45, '16': 50, '17': 60, '18': 70, '19': 80, '20': 90 },
    multipliers: (_level, employment) =>
      employment === 'casual'
        ? { weekday: 1.25, evening: 1.5, night: 1.5, saturday: 1.5, sunday: 1.75, publicHoliday: 2.5 }
        : { weekday: 1, evening: 1.25, night: 1.25, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
    eveningStart: 18 * 60,
    nightEnd: 0,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
  custom: {
    id: 'custom',
    name: 'Other award / enterprise agreement',
    levels: [],
    multipliers: (_level, employment) => (employment === 'casual' ? { ...flat(1.25) } : flat(1)),
    eveningStart: 22 * 60,
    nightEnd: 6 * 60,
    breakTiers: DEFAULT_BREAK_TIERS,
  },
};

export const JUNIOR_AGE_LABEL: Record<JuniorAge, string> = {
  adult: '21 or older',
  under16: 'Under 16',
  '16': '16',
  '17': '17',
  '18': '18',
  '19': '19',
  '20': '20',
};

export const EMPLOYMENT_LABEL: Record<Employment, string> = {
  parttime: 'Part-time',
  casual: 'Casual',
  fulltime: 'Full-time',
};

export const WORKPLACE_COLORS = ['#1ec8a5', '#4c7cf0', '#f2994a', '#9b6cf0', '#e8618c', '#2fa3c9'];

/** Award minimum hourly rate (before casual loading) for this workplace's award, level and age, or null if unknown */
export function awardMinimumRate(wp: Pick<Workplace, 'award' | 'level' | 'age'>): number | null {
  const preset = AWARDS[wp.award];
  const level = preset.levels.find((l) => l.name === wp.level);
  if (!level) return null;
  const pct = wp.age && wp.age !== 'adult' ? (preset.juniorPercent?.[wp.age] ?? 100) : 100;
  return Math.round(level.rate * pct) / 100;
}

export function newWorkplace(index: number, award: AwardId = 'fast-food'): Workplace {
  const base: Workplace = {
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    color: WORKPLACE_COLORS[index % WORKPLACE_COLORS.length],
    award,
    level: '',
    age: 'adult',
    employment: 'parttime',
    baseRate: 0,
    multipliers: flat(1),
    eveningStart: 22 * 60,
    nightEnd: 6 * 60,
    breakTiers: [],
    minEngagementMinutes: 0,
  };
  return applyAward(base, { award });
}

/**
 * Fill in the award's minimum rate and penalty rates after the award, level, age or employment type changes.
 * Break rules and time bands are reset only when the award itself changes.
 */
export function applyAward(
  wp: Workplace,
  change: { award?: AwardId; level?: string; age?: JuniorAge; employment?: Employment } = {},
): Workplace {
  const award = change.award ?? wp.award;
  const preset = AWARDS[award];
  const awardChanged = award !== wp.award || wp.breakTiers.length === 0;
  const requested = change.level ?? wp.level;
  const level =
    preset.levels.length === 0 ? requested : preset.levels.some((l) => l.name === requested) ? requested : preset.levels[0].name;
  const next: Workplace = {
    ...wp,
    ...change,
    award,
    level,
    multipliers: preset.multipliers(level, change.employment ?? wp.employment),
  };
  if (awardChanged) {
    next.eveningStart = preset.eveningStart;
    next.nightEnd = preset.nightEnd;
    next.breakTiers = preset.breakTiers.map((t) => ({ ...t }));
  }
  const rate = awardMinimumRate(next);
  if (rate !== null) next.baseRate = rate;
  return next;
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
