const DAY_MS = 86_400_000;

export const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function makeISO(y: number, m: number, d: number): string {
  return toISO(new Date(Date.UTC(y, m - 1, d)));
}

export function addDays(iso: string, n: number): string {
  return toISO(new Date(parseISO(iso).getTime() + n * DAY_MS));
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / DAY_MS);
}

export function dayOfWeek(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function weekStartOf(iso: string, startDay: number): string {
  const diff = (dayOfWeek(iso) - startDay + 7) % 7;
  return addDays(iso, -diff);
}

export function todayISO(): string {
  const n = new Date();
  return makeISO(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 분 → "HH:MM" (24시간, 자정 넘김은 다음날 시각으로 표시) */
export function fmtTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "HH:MM" → 분 */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function fmtDuration(min: number): string {
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (h === 0) return `${sign}${m}분`;
  if (m === 0) return `${sign}${h}시간`;
  return `${sign}${h}시간 ${m}분`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDateShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function fmtDateKo(iso: string): string {
  const d = parseISO(iso);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAY_KO[d.getUTCDay()]})`;
}

/** 시작/종료 분을 정규화: 종료가 시작보다 같거나 이르면 다음날로 본다 */
export function normalizeRange(start: number, end: number): [number, number] {
  let e = end;
  while (e <= start) e += 1440;
  return [start, e];
}
