export type Source = 'tanda' | 'message' | 'manual';

/** 실제 근무 기록 (분 단위). start/end 는 근무일 00:00 기준 분 (자정 넘기면 1440 이상). */
export interface ActualWork {
  start: number;
  end: number;
  unpaidBreak: number;
  paidBreak: number;
}

/** 다른 출처에서 들어온, 적용되지 않은 시프트 버전 */
export interface AltVersion {
  source: Source;
  start: number;
  end: number;
  unpaidBreak?: number;
}

export interface Shift {
  id: string;
  /** 시프트 시작일 YYYY-MM-DD */
  date: string;
  /** 00:00 기준 분 */
  start: number;
  /** 00:00 기준 분. 자정을 넘기면 1440 이상 */
  end: number;
  /** 예정 시간을 결정한 출처 */
  source: Source;
  /** 같은 시프트가 확인된 모든 출처 */
  sources: Source[];
  /** 로스터에 적힌 무급 휴식(분). 없으면 휴식 규칙으로 자동 계산 */
  unpaidBreak?: number;
  publicHoliday?: boolean;
  note?: string;
  actual?: ActualWork;
  alt?: AltVersion;
}

export type Band = 'weekday' | 'evening' | 'night' | 'saturday' | 'sunday' | 'publicHoliday';

export type Multipliers = Record<Band, number>;

export interface BreakTier {
  /** 시프트 길이(분)가 이 값 이상이면 적용 */
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
  /** 0=일 1=월 ... */
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
