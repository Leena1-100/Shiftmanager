import { useState } from 'react';
import type { AppState, Shift } from '../types';
import { calcShift, workplaceFor } from '../lib/pay';
import { addDays, fmtDateLong, fmtDuration, fmtMoney, fmtTime, makeISO, todayISO, weekStartOf, WEEKDAY_SHORT } from '../lib/time';
import { ChevronLeft, ChevronRight, ImportIcon, PlusIcon } from './Icons';
import { SOURCE_LABEL } from './HomeTab';

interface Props {
  state: AppState;
  onEdit: (s: Shift) => void;
  onAdd: (date: string) => void;
  onImportWeek: (weekStart: string) => void;
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DayTotal {
  pay: number;
  minutes: number;
  shifts: Shift[];
  /** Every shift that day has been worked (actual times logged or Tanda pay) */
  worked: boolean;
  colors: string[];
}

/** Whole dollars for the small calendar cells: $229 */
const shortMoney = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;

export default function CalendarTab({ state, onEdit, onAdd, onImportWeek }: Props) {
  const { settings, workplaces, shifts } = state;
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);

  const [y, m] = month.split('-').map(Number);
  const first = makeISO(y, m, 1);
  const last = addDays(makeISO(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);
  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
    setSelected(null);
  };

  const byDay = new Map<string, DayTotal>();
  for (const s of shifts) {
    const wp = workplaceFor(s, workplaces);
    if (!wp) continue;
    const c = calcShift(s, wp, 'effective');
    const d = byDay.get(s.date) ?? { pay: 0, minutes: 0, shifts: [], worked: true, colors: [] };
    d.pay += c.pay;
    d.minutes += c.workedMinutes;
    d.shifts.push(s);
    d.worked &&= c.usedActual;
    if (!d.colors.includes(wp.color)) d.colors.push(wp.color);
    byDay.set(s.date, d);
  }

  const weeks: string[] = [];
  for (let w = weekStartOf(first, settings.weekStartDay); w <= last; w = addDays(w, 7)) weeks.push(w);

  let monthEarned = 0;
  let monthExpected = 0;
  for (const [date, d] of byDay) {
    if (date < first || date > last) continue;
    monthExpected += d.pay;
    if (d.worked) monthEarned += d.pay;
  }

  const sel = selected ? byDay.get(selected) : undefined;

  return (
    <div className="stack">
      <div className="month-nav">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft />
        </button>
        <button className="month-label" onClick={() => setMonth(today.slice(0, 7))} title="Go to this month">
          {MONTH_LONG[m - 1]} {y}
        </button>
        <button className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight />
        </button>
      </div>

      <section className="stats">
        <div className="stat">
          <span>Earned (worked)</span>
          <b>{fmtMoney(monthEarned)}</b>
        </div>
        <div className="stat">
          <span>Incl. rostered</span>
          <b>{fmtMoney(monthExpected)}</b>
        </div>
      </section>

      <section className="calendar card">
        <div className="cal-head">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i}>{WEEKDAY_SHORT[(settings.weekStartDay + i) % 7]}</span>
          ))}
        </div>
        {weeks.map((w) => {
          const weekTotal = Array.from({ length: 7 }, (_, i) => byDay.get(addDays(w, i))?.pay ?? 0).reduce((a, b) => a + b, 0);
          return (
            <div className="cal-week" key={w}>
              <div className="cal-week-bar">
                <button className="roster-btn" onClick={() => onImportWeek(w)}>
                  <ImportIcon size={14} /> {weekTotal > 0 ? 'Update roster' : 'Add roster'}
                </button>
                {weekTotal > 0 && <span className="small muted">Week {fmtMoney(weekTotal)}</span>}
              </div>
              <div className="cal-days">
                {Array.from({ length: 7 }, (_, i) => {
                  const date = addDays(w, i);
                  const d = byDay.get(date);
                  const inMonth = date >= first && date <= last;
                  const cls = [
                    'cal-day',
                    inMonth ? '' : 'out',
                    date === today ? 'today' : '',
                    date === selected ? 'selected' : '',
                    d ? (d.worked ? 'worked' : 'planned') : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button key={date} className={cls} onClick={() => setSelected(date === selected ? null : date)} aria-label={fmtDateLong(date)}>
                      <span className="cal-num">{Number(date.slice(8))}</span>
                      {d && <span className="cal-pay">{shortMoney(d.pay)}</span>}
                      {d && workplaces.length > 1 && (
                        <span className="cal-dots">
                          {d.colors.map((c) => (
                            <i key={c} style={{ background: c }} />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="cal-legend small muted">
          <span>
            <i className="lg worked" /> Worked
          </span>
          <span>
            <i className="lg planned" /> Rostered (estimate)
          </span>
        </div>
      </section>

      {selected && (
        <section className="card">
          <div className="card-title">
            {fmtDateLong(selected)}
            {sel && <span className="muted">{fmtMoney(sel.pay)}</span>}
          </div>
          {sel ? (
            <div className="stack-sm">
              {sel.shifts.map((s) => {
                const wp = workplaceFor(s, workplaces)!;
                const c = calcShift(s, wp, 'effective');
                return (
                  <button key={s.id} className="day-shift" onClick={() => onEdit(s)}>
                    <span className="wp-dot" style={{ background: wp.color }} />
                    <span className="day-shift-info">
                      <b>
                        {fmtTime(c.start)}–{fmtTime(c.end)}
                      </b>
                      <span className="small muted">
                        {c.usedActual ? 'Worked' : 'Rostered'} · {fmtDuration(c.workedMinutes)} · {SOURCE_LABEL[s.source]}
                        {workplaces.length > 1 && ` · ${wp.name}`}
                      </span>
                    </span>
                    <b>{fmtMoney(c.pay)}</b>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="small muted">No shift on this day.</p>
          )}
          <button className="ghost-btn center" onClick={() => onAdd(selected)}>
            <PlusIcon size={16} /> Add shift
          </button>
        </section>
      )}
    </div>
  );
}
