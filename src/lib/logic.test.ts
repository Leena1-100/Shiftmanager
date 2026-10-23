import { describe, expect, it } from 'vitest';
import { parseShifts } from './parser';
import { calcShift, breaksFor, summarize, taxableGross } from './pay';
import { mergeShifts, swapAlt } from './merge';
import { weeklyWithholding, annualTax } from './tax';
import { DEFAULT_BREAK_TIERS, applyAward, awardMinimumRate, newWorkplace } from './defaults';
import { reviveState } from './storage';
import type { Shift } from '../types';

const WEEK = '2026-10-26'; // Monday
const hm = (h: number, m = 0) => h * 60 + m;
const pick = (r: { date: string; start: number; end: number; unpaidBreak?: number }) => ({
  date: r.date,
  start: r.start,
  end: r.end,
  unpaidBreak: r.unpaidBreak,
});

describe('parseShifts', () => {
  it('Tanda format (date line + time line + break line)', () => {
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

  it('message: weekday only, am/pm omitted', () => {
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

  it('Korean-language message and dd/mm dates', () => {
    const text = `화요일 오후 3시~9시 반
10월 30일 (금) 10:00~16:00 휴식 30분
1/11 17:00-01:00`;
    expect(parseShifts(text, 'message', WEEK).map(pick)).toEqual([
      { date: '2026-10-27', start: hm(15), end: hm(21, 30), unpaidBreak: undefined },
      { date: '2026-10-30', start: hm(10), end: hm(16), unpaidBreak: 30 },
      { date: '2026-11-01', start: hm(17), end: hm(25), unpaidBreak: undefined },
    ]);
  });

  it('a paid break mention is not taken as an unpaid break', () => {
    const r = parseShifts('Fri 9am-1pm 10 min paid break', 'tanda', WEEK);
    expect(r[0].unpaidBreak).toBeUndefined();
  });
});

describe('breaks & pay', () => {
  it('break rule tiers', () => {
    expect(breaksFor(hm(3, 59), DEFAULT_BREAK_TIERS)).toEqual({ paidCount: 0, paidMinutes: 0, unpaidMinutes: 0 });
    expect(breaksFor(hm(4), DEFAULT_BREAK_TIERS).paidMinutes).toBe(10);
    expect(breaksFor(hm(5), DEFAULT_BREAK_TIERS).unpaidMinutes).toBe(0);
    expect(breaksFor(hm(5, 1), DEFAULT_BREAK_TIERS).unpaidMinutes).toBe(30);
    expect(breaksFor(hm(8), DEFAULT_BREAK_TIERS).paidMinutes).toBe(20);
  });

  const base: Shift = { id: 'x', date: '2026-10-27', start: hm(9), end: hm(15), source: 'tanda', sources: ['tanda'] };
  const settings = { ...newWorkplace(0, 'fast-food'), baseRate: 30 };

  it('6h weekday shift = 5.5h paid after 30m unpaid break', () => {
    const c = calcShift(base, settings);
    expect(c.workedMinutes).toBe(330);
    expect(c.pay).toBe(165);
  });

  it('Saturday 125%', () => {
    const c = calcShift({ ...base, date: '2026-10-31' }, settings);
    expect(c.pay).toBe(206.25);
  });

  it('weekday after 10pm 110%, past midnight into Saturday 125%', () => {
    // Fri 20:00 – Sat 01:00, 5h → paid break only (no unpaid break)
    const c = calcShift({ ...base, date: '2026-10-30', start: hm(20), end: hm(25) }, settings);
    expect(c.minutesByBand).toEqual({ weekday: 120, evening: 120, saturday: 60 });
    expect(c.pay).toBe(round(2 * 30 + 2 * 33 + 37.5));
  });

  it('actual hours applied to the minute', () => {
    const c = calcShift({ ...base, actual: { start: hm(8, 57), end: hm(15, 12), unpaidBreak: 32, paidBreak: 10 } }, settings);
    expect(c.usedActual).toBe(true);
    expect(c.workedMinutes).toBe(375 - 32);
    expect(c.pay).toBe(171.5);
    expect(calcShift({ ...base, actual: base.actual }, settings, 'planned').workedMinutes).toBe(330);
  });
});

describe('merge', () => {
  it('merging Tanda + message: duplicate, add, priority replace', () => {
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

  it('with Tanda priority the Tanda times are kept', () => {
    const tanda = mergeShifts([], parseShifts('Tue 27 Oct 9am-3pm', 'tanda', WEEK), 'tanda').shifts;
    const { shifts, events } = mergeShifts(tanda, parseShifts('Tue 10-3', 'message', WEEK), 'tanda');
    expect(events[0].action).toBe('kept');
    expect(shifts[0].start).toBe(hm(9));
  });
});

describe('tax', () => {
  it('no tax below the weekly tax-free threshold', () => {
    expect(weeklyWithholding(340, 'resident-tft')).toBe(0);
  });
  it('WHM pays 15% from the first dollar', () => {
    expect(weeklyWithholding(500, 'whm')).toBe(75);
  });
  it('resident annual tax', () => {
    expect(annualTax(40_000, 'resident-tft')).toBeCloseTo((40_000 - 18_200) * 0.15 + 800, 2);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}

describe('workplaces', () => {
  const ff = { ...newWorkplace(0, 'fast-food'), id: 'ff', baseRate: 30 };
  const retail = { ...applyAward(newWorkplace(1), { award: 'general-retail' }), id: 'rt', baseRate: 30 };
  const shift = (workplaceId: string): Shift => ({
    id: workplaceId,
    date: '2026-10-27',
    start: hm(16),
    end: hm(20),
    source: 'manual',
    sources: ['manual'],
    workplaceId,
  });

  it('each workplace uses its own award time bands', () => {
    // Tue 4pm–8pm: fast food = all weekday; retail = 2h after 6pm at 125%
    expect(calcShift(shift('ff'), ff).minutesByBand).toEqual({ weekday: 240 });
    expect(calcShift(shift('rt'), retail).minutesByBand).toEqual({ weekday: 120, evening: 120 });
    expect(calcShift(shift('rt'), retail).pay).toBe(135);
  });

  it('summarize totals per workplace', () => {
    const s = summarize([shift('ff'), shift('rt')], [ff, retail], 'effective');
    expect(s.gross).toBe(255);
    expect(s.byWorkplace.ff.gross).toBe(120);
    expect(s.byWorkplace.rt.gross).toBe(135);
  });

  it('shifts only merge with shifts at the same workplace', () => {
    const first = mergeShifts([], [{ date: '2026-10-27', start: hm(9), end: hm(15), source: 'tanda', workplaceId: 'ff' }], 'message');
    const { events } = mergeShifts(first.shifts, [{ date: '2026-10-27', start: hm(9), end: hm(15), source: 'message', workplaceId: 'rt' }], 'message');
    expect(events[0].action).toBe('added');
  });

  it('migrates version 1 data into a workplace', () => {
    const st = reviveState({
      version: 1,
      settings: { baseRate: 27, employment: 'casual', taxMode: 'whm', weekStartDay: 1, mergePriority: 'tanda' },
      shifts: [{ id: 'a', date: '2026-10-27', start: 540, end: 900, source: 'tanda', sources: ['tanda'] }],
      weeks: {},
    });
    expect(st.onboarded).toBe(true);
    expect(st.workplaces).toHaveLength(1);
    expect(st.workplaces[0]).toMatchObject({ baseRate: 27, employment: 'casual' });
    expect(st.shifts[0].workplaceId).toBe(st.workplaces[0].id);
    expect(st.settings).toEqual({ taxMode: 'whm', superRate: 0.12, weekStartDay: 1, mergePriority: 'tanda' });
  });
});

describe('award minimum rates and penalties', () => {
  it('a new fast food workplace starts at the Level 1 adult rate', () => {
    const wp = newWorkplace(0);
    expect(wp.level).toBe('Level 1');
    expect(wp.baseRate).toBe(27.81);
  });

  it('Level 1 Sunday is 125% part-time and 150% casual (same as Saturday)', () => {
    const pt = newWorkplace(0);
    expect(pt.multipliers.saturday).toBe(1.25);
    expect(pt.multipliers.sunday).toBe(1.25);
    const casual = applyAward(pt, { employment: 'casual' });
    expect(casual.multipliers.saturday).toBe(1.5);
    expect(casual.multipliers.sunday).toBe(1.5);
  });

  it('Levels 2–3 keep the higher Sunday rate', () => {
    const l2 = applyAward(newWorkplace(0), { level: 'Level 2' });
    expect(l2.baseRate).toBe(29.45);
    expect(l2.multipliers.sunday).toBe(1.5);
    expect(applyAward(l2, { employment: 'casual' }).multipliers.sunday).toBe(1.75);
  });

  it('junior rates are a percentage of the adult rate', () => {
    const wp = applyAward(newWorkplace(0), { age: '17' });
    expect(wp.baseRate).toBe(16.69); // 60% of $27.81
    expect(awardMinimumRate({ award: 'general-retail', level: 'Level 1', age: 'under16' })).toBe(12.51); // 45%
  });

  it('changing award resets level, rate and time bands', () => {
    const retail = applyAward(newWorkplace(0), { award: 'general-retail', level: 'Level 3' });
    expect(retail).toMatchObject({ level: 'Level 3', baseRate: 28.89, eveningStart: 18 * 60, nightEnd: 0 });
  });

  it('custom awards have no minimum and keep the entered rate', () => {
    const wp = applyAward({ ...newWorkplace(0), baseRate: 31 }, { award: 'custom' });
    expect(awardMinimumRate(wp)).toBeNull();
    expect(wp.baseRate).toBe(31);
  });
});

describe('Tanda screenshots', () => {
  // Real OCR output of a Tanda roster screenshot (status bar noise and misread words included)
  const OCR = "MOIRA DCT - SUN, 25 OCT 2130s B5ED2\nV HIDE PAST DATES (3)\nMon, 19 Oct \u00a9 8.2hrs| $229.32\n\u00ae 7:18 - 16:00\n! FOH @ Queens Plaza\nRostered / worked details A\nWorked: 7:18-16:00 +0.03 hrs\nRostered: 7:20- 16:00\nBreaks: 10m ZIG) 30m\nunpaid\nWed, 21 Oct \u00ae 5.55hrs| $169.53\n\u00ae 10:30- 16:03\n' FOH @ Queens Plaza\nRostered / worked details A\nWorked: 10:30- 16:03 +0.55 hrs\nRostered: 10:30 - 16:00\nBreaks: 10m paid\nThu, 22 Oct \u00a9 8.08 hrs| $226.08\n\u00ae 7:30- 16:06\n' FOH @ Queens Plaza\nRostered / worked details AN\nWorked: 7:30- 16:06 -0.08 hrs\nRostered: 7:20- 16:00\nBreaks: 10m Bel 31m\nunpaid\nL,] H x (mm)\nHOME ROSTER TIMESHEETS LEAVE CHATS\n\n";

  it('reads each day as one shift with roster, worked times, breaks and Tanda pay', () => {
    const shifts = parseShifts(OCR, 'tanda', '2026-10-19');
    expect(shifts.map(({ date, start, end, actual, tandaPay }) => ({ date, start, end, actual, tandaPay }))).toEqual([
      {
        date: '2026-10-19',
        start: hm(7, 20),
        end: hm(16),
        actual: { start: hm(7, 18), end: hm(16), unpaidBreak: 30, paidBreak: 10 },
        tandaPay: { hours: 8.2, pay: 229.32 },
      },
      {
        date: '2026-10-21',
        start: hm(10, 30),
        end: hm(16),
        actual: { start: hm(10, 30), end: hm(16, 3), unpaidBreak: 0, paidBreak: 10 },
        tandaPay: { hours: 5.55, pay: 169.53 },
      },
      {
        date: '2026-10-22',
        start: hm(7, 20),
        end: hm(16),
        actual: { start: hm(7, 30), end: hm(16, 6), unpaidBreak: 31, paidBreak: 10 },
        tandaPay: { hours: 8.08, pay: 226.08 },
      },
    ]);
  });

  it('worked minutes match Tanda hours', () => {
    const wp = newWorkplace(0);
    const [mon, wed, thu] = parseShifts(OCR, 'tanda', '2026-10-19').map((p, i) => ({
      ...p,
      id: String(i),
      sources: ['tanda' as const],
    }));
    expect(calcShift(mon, wp).workedMinutes).toBe(492); // 8.2h
    expect(calcShift(wed, wp).workedMinutes).toBe(333); // 5.55h
    expect(calcShift(thu, wp).workedMinutes).toBe(485); // 8.08h
  });

  it("uses Tanda's dollars for worked shifts, and the roster for the plan", () => {
    const wp = newWorkplace(0);
    const [mon] = parseShifts(OCR, 'tanda', '2026-10-19');
    const shift = { ...mon, id: 'm', sources: ['tanda' as const] };
    expect(calcShift(shift, wp).pay).toBe(229.32);
    expect(calcShift(shift, wp).fromTanda).toBe(true);
    expect(calcShift(shift, wp, 'planned').fromTanda).toBe(false);
  });

  it('a future Tanda shift with no hours is roster only', () => {
    const [s] = parseShifts('Sat, 24 Oct\n10:00 - 16:00\nFOH @ Queens Plaza\nBreaks: 10m paid, 30m unpaid', 'tanda', '2026-10-19');
    expect(s).toMatchObject({ date: '2026-10-24', start: hm(10), end: hm(16), unpaidBreak: 30 });
    expect(s.actual).toBeUndefined();
    expect(s.tandaPay).toBeUndefined();
  });
});

describe('pasted messages', () => {
  it('reads times from a message pasted as-is', () => {
    const msg = `Hi Leena! Here are your shifts for next week 😊
Monday 26/10 - 7:20am to 4pm
Wed 10.30-4
Thursday 7:20 - 16:00 (30 min break)
Sat 31st: 9-5:30
Thanks, see you then!`;
    expect(parseShifts(msg, 'message', '2026-10-26').map(pick)).toEqual([
      { date: '2026-10-26', start: hm(7, 20), end: hm(16), unpaidBreak: undefined },
      { date: '2026-10-28', start: hm(10, 30), end: hm(16), unpaidBreak: undefined },
      { date: '2026-10-29', start: hm(7, 20), end: hm(16), unpaidBreak: 30 },
      { date: '2026-10-31', start: hm(9), end: hm(17, 30), unpaidBreak: undefined },
    ]);
  });
});

describe('message rosters are not taxed', () => {
  it('pay from message-only shifts is kept out of the taxable amount', () => {
    const wp = { ...newWorkplace(0), id: 'w', baseRate: 30 };
    const base = { date: '2026-10-27', start: hm(9), end: hm(15), workplaceId: 'w' };
    const fromMessage: Shift = { ...base, id: 'a', source: 'message', sources: ['message'] };
    const fromTanda: Shift = { ...base, id: 'b', date: '2026-10-28', source: 'tanda', sources: ['tanda', 'message'] };
    const s = summarize([fromMessage, fromTanda], [wp], 'effective');
    expect(s.gross).toBe(330);
    expect(s.untaxedGross).toBe(165);
    expect(taxableGross(s)).toBe(165);
  });

  it('tax can be turned on for a message shift', () => {
    const wp = { ...newWorkplace(0), id: 'w', baseRate: 30 };
    const shift: Shift = { id: 'a', date: '2026-10-27', start: hm(9), end: hm(15), workplaceId: 'w', source: 'message', sources: ['message'], applyTax: true };
    const s = summarize([shift], [wp], 'effective');
    expect(s.untaxedGross).toBe(0);
    expect(taxableGross(s)).toBe(165);
  });
});
