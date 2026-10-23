import type { BreakTier, Employment, Multipliers, Settings } from '../types';

/**
 * Fast Food Industry Award 2010 (MA000003) 기준 기본 배율.
 * 실제 매장/계약 조건에 따라 다를 수 있으니 설정에서 수정 가능.
 * - 파트타임: 평일 100%, 월~금 22시~자정 110%, 월~금 자정~06시 115%, 토 125%, 일 150%, 공휴일 225%
 * - 캐주얼(25% 로딩 포함): 평일 125%, 저녁 135%, 심야 140%, 토 150%, 일 175%, 공휴일 250%
 */
export const DEFAULT_MULTIPLIERS: Record<Employment, Multipliers> = {
  parttime: { weekday: 1, evening: 1.1, night: 1.15, saturday: 1.25, sunday: 1.5, publicHoliday: 2.25 },
  casual: { weekday: 1.25, evening: 1.35, night: 1.4, saturday: 1.5, sunday: 1.75, publicHoliday: 2.5 },
};

/**
 * Fast Food Award 휴식 규정 기본값
 * - 4시간 이상: 유급 10분 1회
 * - 5시간 초과: 유급 10분 1회 + 무급 식사 30분
 * - 7시간 초과: 유급 10분 2회 + 무급 식사 30분
 * - 9시간 초과: 유급 10분 2회 + 무급 식사 60분
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
  weekday: '평일',
  evening: '평일 저녁 (22–24시)',
  night: '평일 심야 (0–6시)',
  saturday: '토요일',
  sunday: '일요일',
  publicHoliday: '공휴일',
};
