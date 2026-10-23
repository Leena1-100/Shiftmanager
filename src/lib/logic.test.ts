import { describe, expect, it } from 'vitest';
import { parseShifts } from './parser';
import { calcShift, breaksFor } from './pay';
import { mergeShifts, swapAlt } from './merge';
import { weeklyWithholding, annualTax } from './tax';
import { DEFAULT_SETTINGS, DEFAULT_BREAK_TIERS } from './defaults';
import type { Shift } from '../types';

const WEEK = '2026-10-26'; // 월요일
const hm = (h: number, m = 0) => h * 60 + m;
const pick = (r: { date: string; start: number; end: number; unpaidBreak?: number }) => ({
  date: r.date,
  start: r.start,
  end: r.end,
  unpaidBreak: r.unpaidBreak,
});

describe('parseShifts', () => {
  it('Tanda 형식 (날짜 줄 + 시간 줄 + 휴식 줄)', () => {
    const text = `Monday 27 Oct
9:00am - 3:00pm
Crew Member · Break 30m

Wed 29 Oct
4:30pm – 10:15pm`;
    expect(parseShifts(text, 'tanda', WEEK).map(pick)).toEqual([
      { date: '2026-10-27', start: hm(9), end: hm(15), unpaidBreak: 30 },
      { date: '2026-10-29', start: hm(16, 30), end: hm(22, 15), unpaidBreak: undefined },
    ]);
  });

  it('메시지: 요일만 + am/pm 생략', () => {
    const text = `Hi! shifts this week
Mon 9-3
Thu 5-11pm
Sat 10:30-4`;
    expect(parseShifts(text, 'message', WEEK).map(pick)).toEqual([
      { date: '2026-10-26', start: hm(9), end: hm(15), unpaidBreak: undefined },
      { date: '2026-10-29', start: hm(17), end: hm(23), unpaidBreak: undefined },
      { date: '2026-10-31', start: hm(10, 30), end: hm(16), unpaidBreak: undefined },
    ]);
  });

  it('한국어 메시지와 dd/mm', () => {
    const text = `화요일 오후 3시~9시 반
10월 30일 (금) 10:00~16:00 휴식 30분
1/11 17:00-01:00`;
    expect(parseShifts(text, 'message', WEEK).map(pick)).toEqual([
      { date: '2026-10-27', start: hm(15), end: hm(21, 30), unpaidBreak: undefined },
      { date: '2026-10-30', start: hm(10), end: hm(16), unpaidBreak: 30 },
      { date: '2026-11-01', start: hm(17), end: hm(25), unpaidBreak: undefined },
    ]);
  });

  it('유급 휴식 언급은 무급 휴식으로 잡지 않는다', () => {
    const r = parseShifts('Fri 9am-1pm 10 min paid break', 'tanda', WEEK);
    expect(r[0].unpaidBreak).toBeUndefined();
  });
});

describe('breaks & pay', () => {
  it('휴식 규칙 구간', () => {
    expect(breaksFor(hm(3, 59), DEFAULT_BREAK_TIERS)).toEqual({ paidCount: 0, paidMinutes: 0, unpaidMinutes: 0 });
    expect(breaksFor(hm(4), DEFAULT_BREAK_TIERS).paidMinutes).toBe(10);
    expect(breaksFor(hm(5), DEFAULT_BREAK_TIERS).unpaidMinutes).toBe(0);
    expect(breaksFor(hm(5, 1), DEFAULT_BREAK_TIERS).unpaidMinutes).toBe(30);
    expect(breaksFor(hm(8), DEFAULT_BREAK_TIERS).paidMinutes).toBe(20);
  });

  const base: Shift = { id: 'x', date: '2026-10-27', start: hm(9), end: hm(15), source: 'tanda', sources: ['tanda'] };
  const settings = { ...DEFAULT_SETTINGS, baseRate: 30 };

  it('평일 6시간 = 무급 30분 빼고 5.5시간', () => {
    const c = calcShift(base, settings);
    expect(c.workedMinutes).toBe(330);
    expect(c.pay).toBe(165);
  });

  it('토요일 125%', () => {
    const c = calcShift({ ...base, date: '2026-10-31' }, settings);
    expect(c.pay).toBe(206.25);
  });

  it('평일 밤 22시 이후 110%, 자정 넘어 토요일 125%', () => {
    // 금 20:00 ~ 토 01:00, 5시간 → 유급휴식만 (무급 없음)
    const c = calcShift({ ...base, date: '2026-10-30', start: hm(20), end: hm(25) }, settings);
    expect(c.minutesByBand).toEqual({ weekday: 120, evening: 120, saturday: 60 });
    expect(c.pay).toBe(round(2 * 30 + 2 * 33 + 37.5));
  });

  it('실제 근무 분 단위 반영', () => {
    const c = calcShift({ ...base, actual: { start: hm(8, 57), end: hm(15, 12), unpaidBreak: 32, paidBreak: 10 } }, settings);
    expect(c.usedActual).toBe(true);
    expect(c.workedMinutes).toBe(375 - 32);
    expect(c.pay).toBe(171.5);
    expect(calcShift({ ...base, actual: base.actual }, settings, 'planned').workedMinutes).toBe(330);
  });
});

describe('merge', () => {
  it('탄다 + 메시지 합치기: 중복, 추가, 우선순위 교체', () => {
    const tanda = parseShifts('Mon 27 Oct 9am-3pm\nTue 28 Oct 9am-3pm', 'tanda', WEEK);
    const first = mergeShifts([], tanda, 'message');
    expect(first.shifts).toHaveLength(2);

    const msg = parseShifts('Mon 27/10 9-3\nTue 28/10 10-3\nThu 5-10pm', 'message', WEEK);
    const { shifts, events } = mergeShifts(first.shifts, msg, 'message');
    expect(events.map((e) => e.action)).toEqual(['duplicate', 'replaced', 'added']);
    expect(shifts).toHaveLength(3);
    const tue = shifts.find((s) => s.date === '2026-10-28')!;
    expect(tue.start).toBe(hm(10));
    expect(tue.sources).toEqual(['tanda', 'message']);
    expect(tue.alt).toMatchObject({ source: 'tanda', start: hm(9) });
    expect(swapAlt(tue).start).toBe(hm(9));
  });

  it('탄다 우선이면 기존 탄다 시간을 유지', () => {
    const tanda = mergeShifts([], parseShifts('Tue 27 Oct 9am-3pm', 'tanda', WEEK), 'tanda').shifts;
    const { shifts, events } = mergeShifts(tanda, parseShifts('Tue 10-3', 'message', WEEK), 'tanda');
    expect(events[0].action).toBe('kept');
    expect(shifts[0].start).toBe(hm(9));
  });
});

describe('tax', () => {
  it('면세 한도 이하 주급은 세금 0', () => {
    expect(weeklyWithholding(340, 'resident-tft')).toBe(0);
  });
  it('워홀은 첫 달러부터 15%', () => {
    expect(weeklyWithholding(500, 'whm')).toBe(75);
  });
  it('거주자 연간 세금', () => {
    expect(annualTax(40_000, 'resident-tft')).toBeCloseTo((40_000 - 18_200) * 0.15 + 800, 2);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}
