export type Source = 'tanda' | 'message' | 'manual';

/** Actual hours worked (minute precision). start/end are minutes from 00:00 on the shift date (>= 1440 past midnight). */
export interface ActualWork {
  start: number;
  end: number;
  unpaidBreak: number;
  paidBreak: number;
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
  publicHoliday?: boolean;
  note?: string;
  actual?: ActualWork;
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

export type Employment = 'parttime' | 'casual';

export interface Settings {
  baseRate: number;
  employment: Employment;
  multipliers: Multipliers;
  breakTiers: BreakTier[];
  minEngagementMinutes: number;
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
  version: 1;
  settings: Settings;
  shifts: Shift[];
  weeks: Record<string, WeekMeta>;
}
