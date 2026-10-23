import type { TaxMode } from '../types';

/**
 * 2026–27 호주 소득세율 기준 주급 원천징수(PAYG) 추정.
 * 실제 ATO 원천징수표(Schedule 1)와 몇 달러 차이가 날 수 있는 "추정치"이다.
 * - 거주자 세율: $18,200까지 0%, $45,000까지 15%, $135,000까지 30%, $190,000까지 37%, 초과 45%
 * - 워킹홀리데이: $45,000까지 15%, 이후 거주자 세율과 동일
 * - 비거주자: $135,000까지 30%, $190,000까지 37%, 초과 45%
 * - 메디케어 레비 2% (저소득 감면 구간 반영, 워홀/비거주자는 제외)
 */
type Bracket = [upTo: number, rate: number];

const RESIDENT: Bracket[] = [
  [18_200, 0],
  [45_000, 0.15],
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];
const WHM: Bracket[] = [
  [45_000, 0.15],
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];
const NON_RESIDENT: Bracket[] = [
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];

export const TAX_FREE_THRESHOLD = 18_200;
export const WEEKLY_TAX_FREE = TAX_FREE_THRESHOLD / 52;

const MEDICARE_LOW = 27_222;
const MEDICARE_HIGH = 34_027;

function bracketTax(income: number, brackets: Bracket[]): number {
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, upTo) - prev) * rate;
    prev = upTo;
  }
  return tax;
}

function medicare(income: number): number {
  if (income <= MEDICARE_LOW) return 0;
  if (income <= MEDICARE_HIGH) return (income - MEDICARE_LOW) * 0.1;
  return income * 0.02;
}

export function annualTax(income: number, mode: TaxMode): number {
  if (income <= 0) return 0;
  switch (mode) {
    case 'resident-tft':
      return bracketTax(income, RESIDENT) + medicare(income);
    case 'resident-no-tft':
      // 면세 한도를 다른 직장에서 쓰고 있는 경우: 첫 1달러부터 15% 구간이 적용되도록 계산
      return bracketTax(income + TAX_FREE_THRESHOLD, RESIDENT) + income * 0.02;
    case 'whm':
      return bracketTax(income, WHM);
    case 'non-resident':
      return bracketTax(income, NON_RESIDENT);
  }
}

/** 주급에 대한 원천징수 추정액 (ATO처럼 달러 단위 반올림) */
export function weeklyWithholding(weeklyGross: number, mode: TaxMode): number {
  if (weeklyGross <= 0) return 0;
  return Math.round(annualTax(weeklyGross * 52, mode) / 52);
}

/** 이번 주에 세금 0원으로 더 벌 수 있는 금액 (면세 한도 신청한 거주자만 해당) */
export function taxFreeRoom(weeklyGross: number, mode: TaxMode): number | null {
  if (mode !== 'resident-tft') return null;
  return Math.max(0, WEEKLY_TAX_FREE - weeklyGross);
}

export const TAX_MODE_LABEL: Record<TaxMode, string> = {
  'resident-tft': '거주자 · 면세 한도 신청 (Tax-free threshold O)',
  'resident-no-tft': '거주자 · 면세 한도 미신청 (투잡 등)',
  whm: '워킹홀리데이 (417/462 비자, 15%)',
  'non-resident': '비거주자 (30%)',
};
