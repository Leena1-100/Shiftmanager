export type Source = 'tanda' | 'message' | 'manual';

/** Actual hours worked (minute precision). start/end are minutes from 00:00 on the shift date (>= 1440 past midnight). */
export interface ActualWork {
  start: number;
  end: number;
  unpaidBreak: number;
  paidBreak: number;
}

/** Hours and pay Tanda shows for a shift that has been worked (used as the shift's pay) */
export interface TandaPay {
  hours: number;
  pay: number;
}

/** A version of the shift from another source that is not currently applied */
export interface AltVersion {
  source: Source;
  start: number;
  end: number;
  unpaidBreak?: number;
}

export interface Shift {
  id: string;
  /** Shift start date, YYYY-MM-DD */
  date: string;
  /** Minutes from 00:00 */
  start: number;
  /** Minutes from 00:00; >= 1440 when the shift runs past midnight */
  end: number;
  /** Source that the rostered times came from */
  source: Source;
  /** Every source that listed this shift */
  sources: Source[];
  /** Unpaid break (minutes) written on the roster. When absent, the break rules decide. */
  unpaidBreak?: number;
  /** Workplace this shift belongs to */
  workplaceId?: string;
  publicHoliday?: boolean;
  note?: string;
  actual?: ActualWork;
  /** Pay confirmed by Tanda; when set it replaces the calculated pay for the worked shift */
  tandaPay?: TandaPay;
  alt?: AltVersion;
}

export type Band = 'weekday' | 'evening' | 'night' | 'saturday' | 'sunday' | 'publicHoliday';

export type Multipliers = Record<Band, number>;

export interface BreakTier {
  /** Applies when the shift length (minutes) is at least this */
  minMinutes: number;
  paidCount: number;
  paidLength: number;
  unpaidMinutes: number;
}

export type TaxMode = 'resident-tft' | 'resident-no-tft' | 'whm' | 'non-resident';

export type Employment = 'parttime' | 'casual' | 'fulltime';

export type AwardId = 'fast-food' | 'general-retail' | 'custom';

/** Age bracket for junior rates; 'adult' is 21 and over */
export type JuniorAge = 'adult' | 'under16' | '16' | '17' | '18' | '19' | '20';

export interface Workplace {
  id: string;
  name: string;
  color: string;
  award: AwardId;
  /** Free text for custom awards / enterprise agreements, e.g. "McDonald's EA 2026" */
  awardName?: string;
  level: string;
  /** Age bracket for junior rates (missing = adult) */
  age?: JuniorAge;
  employment: Employment;
  /** Ordinary hourly rate before tax */
  baseRate: number;
  multipliers: Multipliers;
  /** Weekday evening band starts at this minute of the day and runs to midnight */
  eveningStart: number;
  /** Weekday night band runs from midnight to this minute of the day */
  nightEnd: number;
  breakTiers: BreakTier[];
  minEngagementMinutes: number;
}

/** Personal settings shared by all workplaces */
export interface Settings {
  taxMode: TaxMode;
  superRate: number;
  /** 0 = Sunday, 1 = Monday, ... */
  weekStartDay: number;
  mergePriority: 'tanda' | 'message';
}

export interface WeekMeta {
  received?: boolean;
  receivedAmount?: number;
  note?: string;
}

export interface AppState {
  version: 2;
  /** False until the first-run setup is finished */
  onboarded: boolean;
  workplaces: Workplace[];
  settings: Settings;
  shifts: Shift[];
  weeks: Record<string, WeekMeta>;
}
