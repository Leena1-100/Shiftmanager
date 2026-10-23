import type { ActualWork, Source, TandaPay } from '../types';
import { addDays, dayOfWeek, diffDays, makeISO, normalizeRange } from './time';

export interface ParsedShift {
  date: string;
  start: number;
  end: number;
  unpaidBreak?: number;
  /** True when no date was found in the text and one had to be guessed */
  dateGuessed: boolean;
  raw: string;
  source: Source;
  /** Worked times and breaks (Tanda timesheet) */
  actual?: ActualWork;
  /** Hours and pay shown by Tanda for a worked shift */
  tandaPay?: TandaPay;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

const EN_WEEKDAYS: [RegExp, number][] = [
  [/^sun/, 0], [/^mon/, 1], [/^tue/, 2], [/^wed/, 3], [/^thu/, 4], [/^fri/, 5], [/^sat/, 6],
];
// Korean weekday / time words are kept so messages written in Korean can still be parsed
const KO_WEEKDAYS: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

const EN_WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b\.?/i;
const KO_WEEKDAY_RE = /([월화수목금토일])요일|[(\[]([월화수목금토일])[)\]]|^\s*([월화수목금토일])(?=[\s:,.]|$)/;

// One time: (Korean am/pm)? H(:MM)? (Korean hour marker (half | MM minutes)?)? (am|pm)?
const TIME = String.raw`(오전|오후)?\s*(\d{1,2})(?:\s*[:.]\s*(\d{2}))?\s*(?:(시)\s*(?:(반)|(\d{1,2})\s*분)?)?\s*(?:(a\.?m\.?|p\.?m\.?|a|p)(?![a-z]))?`;
const RANGE_RE = new RegExp(
  String.raw`(?<![\d$])${TIME}\s*(?:-|~|to|until|till|부터|에서)\s*${TIME}(?![\d%])`,
  'gi',
);

const BREAK_RES = [
  /(\d{1,3})\s*(?:m|mins?|minutes?|분)\s*(?:unpaid\s+)?(?:meal\s+)?(?:break|휴식|브레이크|밥|식사)/i,
  /(?:break|휴식|브레이크|meal|식사)\s*[:\-]?\s*(\d{1,3})\s*(?:m|mins?|minutes?|분)?\b/i,
  /(?:break|휴식|브레이크|meal|식사)\s*[:\-]?\s*(\d)\s*(?:h|hr|hrs|hours?|시간)/i,
];

interface TimeParts {
  mer: 'am' | 'pm' | null;
  hour: number;
  minute: number;
  zeroPadded: boolean;
}

function readTime(g: (string | undefined)[]): TimeParts | null {
  const [ko, h, mm, , half, koMin, en] = g;
  const hour = Number(h);
  const minute = half ? 30 : Number(mm ?? koMin ?? 0);
  if (hour > 24 || minute > 59) return null;
  let mer: TimeParts['mer'] = null;
  if (ko === '오전') mer = 'am';
  else if (ko === '오후') mer = 'pm';
  else if (en) mer = en.toLowerCase().startsWith('a') ? 'am' : 'pm';
  if (mer && (hour === 0 || hour > 12)) mer = null;
  return { mer, hour, minute, zeroPadded: /^0\d/.test(h ?? '') };
}

function to24(t: TimeParts): number {
  let h = t.hour % 24;
  if (t.mer === 'am' && h === 12) h = 0;
  if (t.mer === 'pm' && h < 12) h += 12;
  return h * 60 + t.minute;
}

/** Infer am/pm for two times and return [start, end] in minutes */
export function resolveRange(a: TimeParts, b: TimeParts): [number, number] {
  const is24h = (t: TimeParts) => t.zeroPadded || t.hour >= 13 || t.hour === 0;
  if (a.mer && b.mer) return normalizeRange(to24(a), to24(b));

  if (!a.mer && b.mer) {
    const end = to24(b);
    if (is24h(a)) return normalizeRange(to24(a), end);
    const am = to24({ ...a, mer: 'am' });
    const pm = to24({ ...a, mer: 'pm' });
    // "5-11pm" → 17:00, "9-3pm" → 09:00
    return normalizeRange(pm < end ? pm : am, end);
  }

  const start = to24(a);
  let end = to24({ ...b, mer: null });
  if (!a.mer && (is24h(a) || is24h(b))) return normalizeRange(start, end);
  // End has no am/pm and looks like 12-hour time: if it is before the start, treat it as pm
  if (end <= start && b.hour <= 12) {
    const pmEnd = end + 12 * 60;
    if (pmEnd > start) end = pmEnd;
  }
  return normalizeRange(start, end);
}

/** Month/day → ISO, picking the year closest to the reference date */
function nearestDate(month: number, day: number, ref: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = Number(ref.slice(0, 4));
  let best: string | null = null;
  for (const yy of [y - 1, y, y + 1]) {
    const iso = makeISO(yy, month, day);
    if (Number(iso.slice(5, 7)) !== month) continue; // e.g. 31st in a 30-day month
    if (!best || Math.abs(diffDays(iso, ref)) < Math.abs(diffDays(best, ref))) best = iso;
  }
  return best;
}

interface DateHit {
  date: string | null;
  weekday: number | null;
  stripped: string;
}

/** Find a date/weekday in a line and return the line with it blanked out so it can't be mistaken for a time */
export function extractDate(line: string, refDate: string): DateHit {
  let s = line;
  let date: string | null = null;
  let weekday: number | null = null;

  const take = (re: RegExp, fn: (m: RegExpExecArray) => string | null) => {
    if (date) return;
    const m = re.exec(s);
    if (!m) return;
    const d = fn(m);
    if (d) {
      date = d;
      s = s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length);
    }
  };

  take(/\b(\d{4})[-./](\d{1,2})[-./](\d{1,2})\b/, (m) => {
    const iso = makeISO(+m[1], +m[2], +m[3]);
    return Number(iso.slice(5, 7)) === +m[2] ? iso : null;
  });
  take(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/, (m) => nearestDate(+m[1], +m[2], refDate));
  take(new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH_RE}(?:,?\s+(\d{4}))?`, 'i'), (m) => {
    const mon = MONTHS[m[2].toLowerCase()];
    return m[3] ? makeISO(+m[3], mon, +m[1]) : nearestDate(mon, +m[1], refDate);
  });
  take(new RegExp(String.raw`\b${MONTH_RE}\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?`, 'i'), (m) => {
    const mon = MONTHS[m[1].toLowerCase()];
    return m[3] ? makeISO(+m[3], mon, +m[2]) : nearestDate(mon, +m[2], refDate);
  });
  // Australian dd/mm(/yyyy)
  take(/(?<![\d:])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d:])/, (m) => {
    if (m[3]) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const iso = makeISO(y, +m[2], +m[1]);
      return Number(iso.slice(5, 7)) === +m[2] ? iso : null;
    }
    return nearestDate(+m[2], +m[1], refDate);
  });

  const en = EN_WEEKDAY_RE.exec(s);
  if (en) {
    const w = en[1].toLowerCase();
    weekday = EN_WEEKDAYS.find(([re]) => re.test(w))?.[1] ?? null;
    s = s.slice(0, en.index) + ' '.repeat(en[0].length) + s.slice(en.index + en[0].length);
  } else {
    const ko = KO_WEEKDAY_RE.exec(s);
    if (ko) {
      weekday = KO_WEEKDAYS[ko[1] ?? ko[2] ?? ko[3]];
      s = s.slice(0, ko.index) + ' '.repeat(ko[0].length) + s.slice(ko.index + ko[0].length);
    }
  }
  return { date, weekday, stripped: s };
}

function findBreak(line: string): number | null {
  if (/\bpaid\b|유급/i.test(line) && !/unpaid|무급/i.test(line)) return null;
  for (const re of BREAK_RES) {
    const m = re.exec(line);
    if (m) {
      const n = Number(m[1]);
      return re === BREAK_RES[2] ? n * 60 : n;
    }
  }
  return null;
}

function normalize(text: string): string {
  return text
    .replace(/[‐-―−]/g, '-')
    .replace(/[～〜]/g, '~')
    .replace(/[   ]/g, ' ')
    .replace(/：/g, ':');
}

/**
 * Extract shifts from Tanda or message text.
 * @param weekStart lines that only name a weekday are placed in this week
 */
/** All plausible time ranges in a string, as [start, end] minutes */
function rangesIn(text: string): [number, number][] {
  const out: [number, number][] = [];
  RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RANGE_RE.exec(text))) {
    const a = readTime(m.slice(1, 8));
    const b = readTime(m.slice(8, 15));
    if (!a || !b) continue;
    const [start, end] = resolveRange(a, b);
    if (end - start > 16 * 60 || end - start < 15) continue;
    out.push([start, end]);
  }
  return out;
}

const TANDA_PAY_RE = /(\d{1,2}(?:\.\d{1,2})?)\s*hrs?\s*[|Il1!]?\s*\$\s*([\d,]+\.\d{2})/i;
const BREAK_PART_RE = /(\d{1,3})\s*m(?:ins?)?\b([^\d]*)/gi;

/** Range on the line that carries a label like "Worked:" (OCR may drop the colon) */
function labelledRange(lines: string[], label: RegExp): [number, number] | null {
  for (const line of lines) {
    const m = label.exec(line);
    if (m) {
      const r = rangesIn(line.slice(m.index + m[0].length));
      if (r.length) return r[0];
    }
  }
  return null;
}

/**
 * Tanda roster / timesheet screens: one block per day, e.g.
 *   Mon, 19 Oct        8.2 hrs | $229.32
 *   7:18 - 16:00
 *   Worked:   7:18 - 16:00   +0.03 hrs
 *   Rostered: 7:20 - 16:00
 *   Breaks:   10m paid, 30m unpaid
 * Each day becomes one shift: rostered times as the plan, worked times + breaks as the actual,
 * and Tanda's hours and dollars as the pay once the shift has been worked.
 */
export function parseTandaBlocks(text: string, weekStart: string): ParsedShift[] {
  const blocks: { date: string; header: string; lines: string[] }[] = [];
  for (const rawLine of normalize(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const hit = extractDate(line, weekStart);
    // "MON, 19 OCT - SUN, 25 OCT" is the week heading, not a day
    const weekdayCount = (line.match(new RegExp(EN_WEEKDAY_RE.source, 'gi')) ?? []).length;
    let date = hit.date;
    if (!date && hit.weekday !== null && rangesIn(hit.stripped).length === 0) {
      date = addDays(weekStart, (hit.weekday - dayOfWeek(weekStart) + 7) % 7);
    }
    if (date && weekdayCount < 2) {
      blocks.push({ date, header: line, lines: [hit.stripped] });
    } else if (blocks.length) {
      blocks[blocks.length - 1].lines.push(line);
    }
  }

  const out: ParsedShift[] = [];
  for (const b of blocks) {
    const flat = b.lines.join(' ').replace(/\s+/g, ' ');
    const worked = labelledRange(b.lines, /worked\s*:?/i);
    const rostered = labelledRange(b.lines, /roster(?:ed)?\s*:?/i);
    const headline = b.lines
      .filter((l) => !/worked|roster/i.test(l))
      .flatMap((l) => rangesIn(l))[0];
    const payMatch = TANDA_PAY_RE.exec(flat);
    const tandaPay = payMatch
      ? { hours: Number(payMatch[1]), pay: Number(payMatch[2].replace(/,/g, '')) }
      : undefined;

    // Tanda writes "10m paid, 30m unpaid". OCR often garbles "paid" (e.g. "10m ZIG) 30m unpaid"),
    // so minutes followed by "unpaid" or nothing (a plain "Break 30m" meal break) are unpaid,
    // and minutes followed by any other word are paid.
    let paid = 0;
    let unpaid = 0;
    const breakAt = flat.search(/breaks?\b/i);
    const breakText = breakAt >= 0 ? flat.slice(breakAt).replace(/^breaks?\s*:?/i, ' ') : '';
    const breakParts = [...breakText.matchAll(BREAK_PART_RE)];
    for (const m of breakParts) {
      if (/^\s*unpaid/i.test(m[2]) || !/[a-z]/i.test(m[2])) unpaid += Number(m[1]);
      else paid += Number(m[1]);
    }
    const hasBreaks = breakParts.length > 0;

    const planned = rostered ?? headline ?? worked;
    if (!planned) continue;
    // The big time at the top of a day is the worked time once Tanda shows hours and dollars
    const actualRange = worked ?? (tandaPay && headline ? headline : null);
    const shift: ParsedShift = {
      date: b.date,
      start: planned[0],
      end: planned[1],
      dateGuessed: false,
      raw: b.header,
      source: 'tanda',
    };
    if (actualRange) {
      shift.actual = { start: actualRange[0], end: actualRange[1], unpaidBreak: unpaid, paidBreak: paid };
      if (tandaPay) shift.tandaPay = tandaPay;
    } else if (hasBreaks) {
      shift.unpaidBreak = unpaid;
    }
    out.push(shift);
  }
  return out;
}

export function parseShifts(text: string, source: Source, weekStart: string): ParsedShift[] {
  if (source === 'tanda') {
    const blocks = parseTandaBlocks(text, weekStart);
    if (blocks.length) return blocks;
  }
  const out: ParsedShift[] = [];
  const lines = normalize(text).split(/\r?\n/);
  let ctxDate: string | null = null;
  let guessCursor = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const hit = extractDate(line, weekStart);
    let lineDate: string | null = hit.date;
    if (!lineDate && hit.weekday !== null) {
      lineDate = addDays(weekStart, (hit.weekday - dayOfWeek(weekStart) + 7) % 7);
    }
    if (lineDate) ctxDate = lineDate;

    const found: ParsedShift[] = [];
    for (const [start, end] of rangesIn(hit.stripped)) {
      let date = lineDate ?? ctxDate;
      let guessed = false;
      if (!date) {
        date = addDays(weekStart, guessCursor++ % 7);
        guessed = true;
      }
      found.push({ date, start, end, dateGuessed: guessed, raw: line, source });
    }

    const brk = findBreak(line);
    if (found.length) {
      if (brk !== null) found.forEach((f) => (f.unpaidBreak = brk));
      out.push(...found);
    } else if (brk !== null && out.length && out[out.length - 1].unpaidBreak === undefined) {
      // Break written on the line after the shift, e.g. "Break 30m"
      out[out.length - 1].unpaidBreak = brk;
    }
  }
  return out;
}
