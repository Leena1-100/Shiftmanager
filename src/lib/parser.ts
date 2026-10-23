import type { Source } from '../types';
import { addDays, dayOfWeek, diffDays, makeISO, normalizeRange } from './time';

export interface ParsedShift {
  date: string;
  start: number;
  end: number;
  unpaidBreak?: number;
  /** 날짜를 텍스트에서 못 찾아 추측했는지 */
  dateGuessed: boolean;
  raw: string;
  source: Source;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';

const EN_WEEKDAYS: [RegExp, number][] = [
  [/^sun/, 0], [/^mon/, 1], [/^tue/, 2], [/^wed/, 3], [/^thu/, 4], [/^fri/, 5], [/^sat/, 6],
];
const KO_WEEKDAYS: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

const EN_WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thur?s?|fri|sat|sun)\b\.?/i;
const KO_WEEKDAY_RE = /([월화수목금토일])요일|[(\[]([월화수목금토일])[)\]]|^\s*([월화수목금토일])(?=[\s:,.]|$)/;

// 시각 하나: (오전|오후)? H(:MM)? (시 (반|MM분)?)? (am|pm)?
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

/** 두 시각에서 am/pm 을 추론해 [start, end] (분) 반환 */
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
  // 끝 시각에 am/pm 이 없고 12시간제로 보이는 경우: 시작보다 이르면 오후로 본다
  if (end <= start && b.hour <= 12) {
    const pmEnd = end + 12 * 60;
    if (pmEnd > start) end = pmEnd;
  }
  return normalizeRange(start, end);
}

/** 기준 날짜와 가장 가까운 연도로 월/일 → ISO */
function nearestDate(month: number, day: number, ref: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = Number(ref.slice(0, 4));
  let best: string | null = null;
  for (const yy of [y - 1, y, y + 1]) {
    const iso = makeISO(yy, month, day);
    if (Number(iso.slice(5, 7)) !== month) continue; // 31일 없는 달 등
    if (!best || Math.abs(diffDays(iso, ref)) < Math.abs(diffDays(best, ref))) best = iso;
  }
  return best;
}

interface DateHit {
  date: string | null;
  weekday: number | null;
  stripped: string;
}

/** 한 줄에서 날짜/요일을 찾아내고, 시간 파싱에 방해되지 않도록 그 부분을 지운 문자열을 반환 */
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
  // 호주식 dd/mm(/yyyy)
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
 * 탄다/메시지 텍스트에서 시프트 목록 추출.
 * @param weekStart 이 주 기준으로 요일만 있는 경우 날짜를 정한다.
 */
export function parseShifts(text: string, source: Source, weekStart: string): ParsedShift[] {
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
    RANGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RANGE_RE.exec(hit.stripped))) {
      const a = readTime(m.slice(1, 8));
      const b = readTime(m.slice(8, 15));
      if (!a || !b) continue;
      const [start, end] = resolveRange(a, b);
      if (end - start > 16 * 60 || end - start < 15) continue;
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
      // "Break 30m" 처럼 시프트 다음 줄에 휴식이 적힌 경우
      out[out.length - 1].unpaidBreak = brk;
    }
  }
  return out;
}
