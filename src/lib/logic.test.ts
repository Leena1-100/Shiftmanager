import { describe, expect, it } from 'vitest';
import { fixHours, parseShifts } from './parser';
import { calcShift, breaksFor, summarize, taxableGross } from './pay';
import { mergeShifts, swapAlt } from './merge';
import { weeklyWithholding, annualTax } from './tax';
import { FAST_FOOD_BREAK_TIERS as DEFAULT_BREAK_TIERS, LEGACY_BREAK_TIERS, applyAward, awardMinimumRate, newWorkplace } from './defaults';
import { reviveState } from './storage';
import { cashPaid, parsePayslip, payslipMismatch, weekMoney } from './payslip';
import { dollars, isTemplatePayslip } from './payslipTemplate';
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
    expect(breaksFor(hm(8, 40), DEFAULT_BREAK_TIERS).paidMinutes).toBe(10);
    expect(breaksFor(hm(9, 1), DEFAULT_BREAK_TIERS).paidMinutes).toBe(20);
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
        tandaPay: { hours: 8.2, pay: 229.32, paidBreak: 10, unpaidBreak: 30 },
      },
      {
        date: '2026-10-21',
        start: hm(10, 30),
        end: hm(16),
        actual: { start: hm(10, 30), end: hm(16, 3), unpaidBreak: 0, paidBreak: 10 },
        tandaPay: { hours: 5.55, pay: 169.53, paidBreak: 10, unpaidBreak: 0 },
      },
      {
        date: '2026-10-22',
        start: hm(7, 20),
        end: hm(16),
        actual: { start: hm(7, 30), end: hm(16, 6), unpaidBreak: 31, paidBreak: 10 },
        tandaPay: { hours: 8.08, pay: 226.08, paidBreak: 10, unpaidBreak: 31 },
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
    const msg = `Hi Jane! Here are your shifts for next week 😊
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
    expect(s.gross).toBe(302.5); // message (Tue): 5.5h x $25 = 137.50 (flat) + Tanda-confirmed 165.00
    expect(s.untaxedGross).toBe(137.5);
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

describe('missed paid breaks', () => {
  const wp = { ...newWorkplace(0), id: 'w', baseRate: 30 };
  const tandaShift: Shift = {
    id: 't',
    date: '2026-10-19', // Monday
    start: hm(7, 20),
    end: hm(16),
    source: 'tanda',
    sources: ['tanda'],
    workplaceId: 'w',
    actual: { start: hm(7, 18), end: hm(16), unpaidBreak: 30, paidBreak: 10 },
    tandaPay: { hours: 8.2, pay: 229.32, paidBreak: 10, unpaidBreak: 30 },
  };

  it('a Tanda shift as recorded keeps Tanda pay', () => {
    expect(calcShift(tandaShift, wp)).toMatchObject({ pay: 229.32, missedBreakMinutes: 0, workedMinutes: 492 });
  });

  it('setting the paid break to 0 adds 0.17h on top of Tanda pay', () => {
    const missed = { ...tandaShift, actual: { ...tandaShift.actual!, paidBreak: 0 } };
    expect(calcShift(missed, wp)).toMatchObject({ pay: 234.42, missedBreakMinutes: 10, workedMinutes: 492 });
  });

  it('setting the meal break to 0 adds 30 minutes on top of Tanda pay', () => {
    const missed = { ...tandaShift, actual: { ...tandaShift.actual!, unpaidBreak: 0 } };
    // 30 more minutes worked are not double counted: Tanda pay stays the base, plus 0.5h
    expect(calcShift(missed, wp)).toMatchObject({ pay: 244.32, missedBreakMinutes: 30 });
  });

  it('after Tanda itself records the missed break, nothing is added twice', () => {
    const reimported = {
      ...tandaShift,
      actual: { ...tandaShift.actual!, paidBreak: 0 },
      tandaPay: { hours: 8.37, pay: 234.32, paidBreak: 0 },
    };
    expect(calcShift(reimported, wp)).toMatchObject({ pay: 234.32, missedBreakMinutes: 0 });
  });

  it('calculated shifts add missed paid break minutes too', () => {
    const msg: Shift = {
      ...tandaShift,
      source: 'manual',
      sources: ['manual'],
      tandaPay: undefined,
      actual: { start: hm(9), end: hm(15), unpaidBreak: 30, paidBreak: 0 },
    };
    // 5h30m worked + 0.17h missed paid break at $30
    expect(calcShift(msg, wp)).toMatchObject({ missedBreakMinutes: 10, workedMinutes: 330, pay: 170.1 });
  });
});

describe('matching Tanda pay from hours, missed breaks and allowance', () => {
  // Level 1 adult $27.81 with a $1.28 per-shift allowance, checked against four real Tanda shifts
  const wp = { ...newWorkplace(0), id: 'w', laundryAllowance: true };
  const worked = (date: string, start: number, end: number, paidBreak: number, unpaidBreak: number): Shift => ({
    id: date,
    date,
    start,
    end,
    source: 'manual',
    sources: ['manual'],
    workplaceId: 'w',
    actual: { start, end, paidBreak, unpaidBreak },
  });

  it.each([
    ['Mon', worked('2026-10-19', hm(7, 18), hm(16), 10, 30), 229.32],
    ['Wed (no meal break)', worked('2026-10-21', hm(10, 30), hm(16, 3), 10, 0), 169.53],
    ['Thu', worked('2026-10-22', hm(7, 30), hm(16, 6), 10, 31), 226.08],
    ['Fri (no paid break)', worked('2026-10-23', hm(10, 30), hm(16, 15), 0, 30), 152.01],
  ])('%s', (_day, shift, tandaPay) => {
    expect(calcShift(shift, wp).pay).toBe(tandaPay);
  });

  it('reads a "Not rostered" Tanda day', () => {
    const [s] = parseShifts(
      'Fri, 23 Oct 5.25 hrs | $152.01\n10:30 - 16:15\nFOH @ Queens Plaza\nRostered / worked details\nWorked: 10:30 - 16:15\nRostered: Not rostered\nBreaks: 30m unpaid',
      'tanda',
      '2026-10-19',
    );
    expect(s).toMatchObject({
      date: '2026-10-23',
      start: hm(10, 30),
      end: hm(16, 15),
      actual: { start: hm(10, 30), end: hm(16, 15), paidBreak: 0, unpaidBreak: 30 },
      tandaPay: { hours: 5.25, pay: 152.01 },
    });
    expect(calcShift({ ...s, id: 'f', sources: ['tanda'], workplaceId: 'w' }, wp).pay).toBe(152.01);
  });
});

describe('saved workplaces', () => {
  it('old break rules are upgraded to the award rules', () => {
    const wp = { ...newWorkplace(0), breakTiers: LEGACY_BREAK_TIERS.map((t) => ({ ...t })) };
    const st = reviveState({ version: 2, onboarded: true, workplaces: [wp], settings: {}, shifts: [], weeks: {} });
    expect(st.workplaces[0].breakTiers).toEqual(DEFAULT_BREAK_TIERS);
  });
});

describe('laundry allowance', () => {
  const shift: Shift = { id: 's', date: '2026-10-27', start: hm(9), end: hm(15), source: 'manual', sources: ['manual'] };
  it('part-time and casual get $1.28 per shift when switched on', () => {
    const wp = newWorkplace(0);
    expect(calcShift(shift, wp).allowance).toBe(0);
    expect(calcShift(shift, { ...wp, laundryAllowance: true }).allowance).toBe(1.28);
    expect(calcShift(shift, { ...applyAward(wp, { employment: 'casual' }), laundryAllowance: true }).allowance).toBe(1.28);
  });
  it('full-time weekly amount is spread over five shifts', () => {
    const wp = { ...applyAward(newWorkplace(0), { employment: 'fulltime' }), laundryAllowance: true };
    expect(calcShift(shift, wp).allowance).toBe(1.28); // $6.42 / 5
  });
  it('a typed-in allowance from the previous version becomes the switch', () => {
    const wp = { ...newWorkplace(0), shiftAllowance: 1.28 };
    const st = reviveState({ version: 2, onboarded: true, workplaces: [wp], settings: {}, shifts: [], weeks: {} });
    expect(st.workplaces[0]).toMatchObject({ laundryAllowance: true, shiftAllowance: undefined });
  });
});

describe('week totals comparable with Tanda', () => {
  it('worked shifts add up to Tanda\'s week total, rostered shifts are separate', () => {
    const wp = { ...newWorkplace(0), id: 'w' };
    const tanda = (date: string, pay: number, hours: number, start: number, end: number, paid: number, unpaid: number): Shift => ({
      id: date, date, start, end, source: 'tanda', sources: ['tanda'], workplaceId: 'w',
      actual: { start, end, paidBreak: paid, unpaidBreak: unpaid },
      tandaPay: { hours, pay, paidBreak: paid, unpaidBreak: unpaid },
    });
    const shifts: Shift[] = [
      tanda('2026-10-19', 229.32, 8.2, hm(7, 18), hm(16), 10, 30),
      tanda('2026-10-21', 169.53, 5.55, hm(10, 30), hm(16, 3), 10, 0),
      tanda('2026-10-22', 226.08, 8.08, hm(7, 30), hm(16, 6), 10, 31),
      tanda('2026-10-23', 152.01, 5.25, hm(10, 30), hm(16, 15), 0, 30),
      { id: 'sat', date: '2026-10-24', start: hm(10, 30), end: hm(16), source: 'message', sources: ['message'], workplaceId: 'w' },
    ];
    const s = summarize(shifts, [wp], 'effective');
    expect(s.workedGross).toBe(776.94);
    expect(+(s.workedPaidMinutes / 60).toFixed(2)).toBe(27.08);
    expect(s.workedShifts).toBe(4);
    expect(s.gross).toBeGreaterThan(776.94);
  });
});

describe('message roster shifts are paid flat', () => {
  const wp = { ...newWorkplace(0), id: 'w', laundryAllowance: true };
  const msg = (date: string, extra: Partial<Shift> = {}): Shift => ({
    id: date, date, start: hm(8, 30), end: hm(16), source: 'message', sources: ['message'], workplaceId: 'w', ...extra,
  });

  it('Saturday: paid hours x $27, no penalty or laundry', () => {
    // 7h30m - 30m meal = 7h x $27
    expect(calcShift(msg('2026-10-24'), wp)).toMatchObject({ pay: 189, flat: true, allowance: 0 });
  });

  it('weekdays are paid $25, whatever the award rate or employment', () => {
    const casual = { ...applyAward(wp, { employment: 'casual' }), id: 'w' };
    expect(calcShift(msg('2026-10-21'), casual).pay).toBe(175); // Wed 7h x $25
    expect(calcShift(msg('2026-10-25'), wp).pay).toBe(189); // Sun 7h x $27
    expect(calcShift(msg('2026-10-21', { publicHoliday: true }), wp).pay).toBe(189); // public holiday = weekend rate
  });

  it('uses the workplace rates when set', () => {
    const custom = { ...wp, messageRateWeekday: 24, messageRate: 30 };
    expect(calcShift(msg('2026-10-21'), custom).pay).toBe(168);
    expect(calcShift(msg('2026-10-24'), custom).pay).toBe(210);
  });

  it('logged actual times are still used, without missed-break extras', () => {
    const s = msg('2026-10-23', { actual: { start: hm(10, 30), end: hm(16, 15), paidBreak: 0, unpaidBreak: 30 } });
    expect(calcShift(s, wp)).toMatchObject({ pay: 131.25, missedBreakMinutes: 0 }); // Fri 5.25h x $25
  });

  it('switching tax on makes it a normal award shift again', () => {
    expect(calcShift(msg('2026-10-24', { applyTax: true }), wp)).toMatchObject({ pay: 244.62, flat: false });
  });
});

describe('upcoming Tanda days and misread hours', () => {
  const wp = { ...newWorkplace(0), id: 'w', laundryAllowance: true };
  const shift: Shift = {
    id: 'f', date: '2026-11-24', start: hm(7, 20), end: hm(16), source: 'tanda', sources: ['tanda'], workplaceId: 'w',
    actual: { start: hm(7, 20), end: hm(16), paidBreak: 0, unpaidBreak: 0 },
    tandaPay: { hours: 8.17, pay: 228.39, paidBreak: 0, unpaidBreak: 0 },
  };

  it('a shift dated after today counts as rostered, not worked', () => {
    const c = calcShift(shift, wp, 'effective', '2026-11-22');
    expect(c.usedActual).toBe(false);
    expect(c.pay).toBeCloseTo(228.39, 1); // 8h 10m x $27.81 + laundry, the estimate Tanda shows (within a cent)
    expect(calcShift(shift, wp, 'effective', '2026-11-24').usedActual).toBe(true);
  });

  it('Tanda estimates for upcoming days are not read as worked times', () => {
    const [s] = parseShifts('Thu, 31 Dec 8.17 hrs | $228.39\n7:20 - 16:00\nFOH @ Queens Plaza', 'tanda', '2026-12-28');
    expect(s).toMatchObject({ date: '2026-12-31', start: hm(7, 20), end: hm(16) });
    expect(s.actual).toBeUndefined();
    expect(s.tandaPay).toBeUndefined();
  });

  it('hours read without the decimal point are corrected', () => {
    expect(fixHours(45)).toBe(4.5);
    expect(fixHours(8.17)).toBe(8.17);
    const st = reviveState({ version: 2, onboarded: true, workplaces: [wp], settings: {}, weeks: {},
      shifts: [{ ...shift, date: '2026-11-05', tandaPay: { hours: 45, pay: 126.43 } }] });
    expect(st.shifts[0].tandaPay?.hours).toBe(4.5);
  });
});

describe('payslips', () => {
  it('reads a table payslip with this-period and YTD columns', () => {
    const text = `Soul Origin Queens Plaza
Payslip
Pay Period: 19/10/2026 - 25/10/2026
Payment Date: 26/10/2026
Description Hours Rate This Period YTD
Ordinary Hours 27.08 27.81 753.11 9,840.22
Laundry Allowance 4 1.28 5.12 66.56
Gross Pay $776.94 $10,155.40
PAYG Tax $80.00 $1,020.00
Net Pay $696.94 $9,135.40
Superannuation (SG 12%) $93.23 $1,218.65
Total Hours 27.08`;
    expect(parsePayslip(text)).toEqual({
      gross: 776.94,
      tax: 80,
      net: 696.94,
      super: 93.23,
      hours: 27.08,
      periodStart: '2026-10-19',
      periodEnd: '2026-10-25',
      payDate: '2026-10-26',
    });
  });

  it('reads amounts on the line after their labels (OCR of a screenshot)', () => {
    const text = `Period
17 Nov 2026 to 23 Nov 2026
Gross
662.94
Tax withheld
60.00
Net pay
602.94`;
    expect(parsePayslip(text)).toMatchObject({
      gross: 662.94, tax: 60, net: 602.94, periodStart: '2026-11-17', periodEnd: '2026-11-23',
    });
  });

  it('works out net pay when only gross and tax are shown', () => {
    expect(parsePayslip('Gross earnings 500.00\nPAYG withholding 31.00')).toMatchObject({ gross: 500, tax: 31, net: 469 });
  });

  it('a week with a payslip uses its actual tax and net, plus cash shifts', () => {
    const wp = { ...newWorkplace(0), id: 'w', laundryAllowance: true };
    const shifts: Shift[] = [
      { id: 'a', date: '2026-10-19', start: hm(7, 18), end: hm(16), source: 'tanda', sources: ['tanda'], workplaceId: 'w',
        actual: { start: hm(7, 18), end: hm(16), paidBreak: 10, unpaidBreak: 30 }, tandaPay: { hours: 8.2, pay: 229.32 } },
      { id: 'b', date: '2026-10-24', start: hm(8, 30), end: hm(16), source: 'message', sources: ['message'], workplaceId: 'w',
        actual: { start: hm(8, 30), end: hm(16), paidBreak: 10, unpaidBreak: 30 } },
    ];
    const sum = summarize(shifts, [wp], 'effective');
    const est = weekMoney(sum, undefined, 'resident-tft');
    expect(est).toMatchObject({ fromPayslip: false, tandaGross: 229.32, cash: 189 });

    const actual = weekMoney(sum, { payslip: { gross: 230, tax: 0, net: 230 } }, 'resident-tft');
    expect(actual).toMatchObject({ fromPayslip: true, gross: 419, tax: 0, net: 419, cash: 189, appTanda: 229.32, diff: 0.68 });
  });
});

describe('payslip tax is never read from an allowance line', () => {
  it('table where the tax amount sits on its own line below the label', () => {
    const text = `Pay period 16/11/2026 - 22/11/2026
Earnings Hours Rate Amount
Ordinary Hours 23.70 27.81 659.10
PAYG Tax
Laundry Allowance 3.00 1.28 3.84
Gross Pay 662.94
58.00
Net Pay 604.94`;
    expect(parsePayslip(text)).toMatchObject({ gross: 662.94, tax: 58, net: 604.94 });
  });

  it('tax label with the laundry line directly underneath', () => {
    const text = `Gross Pay $662.94
Tax
Laundry Allowance $3.84
Deductions PAYG $58.00
Net Pay $604.94`;
    expect(parsePayslip(text)).toMatchObject({ gross: 662.94, tax: 58, net: 604.94 });
  });

  it('flags a saved payslip whose tax does not fit gross - net', () => {
    expect(payslipMismatch({ gross: 662.94, tax: 3.84, net: 604.94 })).toBe(58);
    expect(payslipMismatch({ gross: 662.94, tax: 58, net: 604.94 })).toBeNull();
  });
});

describe('employer payslip layout (docs/payslip-format.md)', () => {
  // Real OCR output of a payslip screenshot, personal details replaced. OCR slips kept:
  // "Gross Eaming", "24Nov", "237" for 23.7 hours, "$384" for $3.84, "$7955" for $79.55
  const OCR = "\u201d The Trustee for EXAMPLE FAMILY TRUST\n| | ABN : 00000000000\n1 Mall Street\nDe Queens Plaza LG 04\n| Brisbane City\nsoul origin. | QLD 4000\nName: Jane Citizen Period Starting 16 Nov 2026\nJob Title: FOH Period Ending 22 Nov 2026\nAddress: 1 Example Street Payment Date 24Nov 2026\nBrisbane City Gross Eaming $662.94\naL 4000\nNet Pay $604.94\nSuperannuation $79.55\nUnits Rate This Pay vo\nSALARY & WAGE\nOrdinary Hours 237 $27.81000 $659.10 $2,650.58\nAllowances subject to tax withholding and super\nLaundry 3 $1.28000 $384 $17.92\n$662.94 $2,668.50\nTAX\nPAYG $58.00 $174.00\n$58.00 $174.00\nSUPER CONTRIBUTIONS\nSuper Guarantee $7955 $320.22\nAustrallanSuper - 0000000000 $7955 $32022\nLEAVE DETAILS Accrued (hrs) Taken (hrs) Remaining (hrs)\nAnnual Leave 1.82308 0 733154\nPAYMENT DETAILS Amount\n(000-000) **++*0000 Jane Citizen $604.94\n\u2014\u2014\n\n";

  it('is recognised as the employer layout', () => {
    expect(isTemplatePayslip(OCR)).toBe(true);
  });

  it('reads every figure from its fixed place', () => {
    expect(parsePayslip(OCR)).toMatchObject({
      periodStart: '2026-11-16',
      periodEnd: '2026-11-22',
      payDate: '2026-11-24',
      gross: 662.94,
      tax: 58,
      net: 604.94,
      super: 79.55,
      hours: 23.7,
    });
  });

  it('puts back decimal points OCR dropped from $ amounts', () => {
    expect(dollars('Laundry 3 $1.28000 $384 $17.92')).toEqual([1.28, 3.84, 17.92]);
    expect(dollars('Super Guarantee $7955 $320.22')).toEqual([79.55, 320.22]);
  });

  it('never takes tax from the allowance heading or the laundry line', () => {
    const noPayg = OCR.replace(/^PAYG .*$/m, 'PAYG');
    expect(parsePayslip(noPayg).tax).toBe(58); // from gross - net, not $3.84
  });
});

describe('weekly cash payout', () => {
  it('drops the second decimal place from the week\'s cash total', () => {
    expect(cashPaid(177.75)).toBe(177.7);
    expect(cashPaid(406.92)).toBe(406.9);
    expect(cashPaid(189)).toBe(189);
    expect(cashPaid(131.25 + 189)).toBe(320.2);
  });

  it('week totals use the cash actually handed over', () => {
    const wp = { ...newWorkplace(0), id: 'w' };
    const sun: Shift = { id: 's', date: '2026-11-22', start: hm(9), end: hm(16, 5), source: 'message', sources: ['message'], workplaceId: 'w',
      actual: { start: hm(9), end: hm(16, 5), paidBreak: 10, unpaidBreak: 30 } };
    const m = weekMoney(summarize([sun], [wp], 'effective'), undefined, 'resident-tft');
    expect(m).toMatchObject({ cashExact: 177.75, cash: 177.7, gross: 177.7, net: 177.7 });
  });
});
