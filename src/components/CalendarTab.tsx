import { useState } from 'react';
import type { AppState, Shift } from '../types';
import { calcShift, isUntaxed, summarize, workplaceFor } from '../lib/pay';
import { weekMoney } from '../lib/payslip';
import { addDays, fmtDateLong, fmtDuration, fmtMoney, fmtTime, makeISO, todayISO, weekStartOf, WEEKDAY_SHORT } from '../lib/time';
import { ChevronLeft, ChevronRight, PlusIcon } from './Icons';
import { SOURCE_LABEL } from './HomeTab';

interface Props {
  state: AppState;
  onEdit: (s: Shift) => void;
  onAdd: (date: string) => void;
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface DayShift {
  shift: Shift;
  color: string;
  minutes: number;
  pay: number;
  cash: boolean;
}

/** Exact pay for the narrow calendar cells, dollars and cents without the $ sign: 229.32 */
function CellPay({ amount }: { amount: number }) {
  const [dollars, cents] = amount.toFixed(2).split('.');
  return (
    <span className="mc-pay" title={fmtMoney(amount)}>
      {Number(dollars).toLocaleString('en-AU')}
      <small>.{cents}</small>
    </span>
  );
}

/** Worked time for a pill: 8h 10m, 4h */
function pillTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function CalendarTab({ state, onEdit, onAdd }: Props) {
  const { settings, workplaces, shifts } = state;
  const today = todayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  // Workplace picked from the chips: show only its shifts
  const [filterWp, setFilterWp] = useState<string | null>(null);

  const [y, m] = month.split('-').map(Number);
  const first = makeISO(y, m, 1);
  const last = addDays(makeISO(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);
  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
    setSelected(null);
  };

  const byDay = new Map<string, DayShift[]>();
  const wpMonth = new Map<string, number>();
  for (const s of shifts) {
    const wp = workplaceFor(s, workplaces);
    if (!wp) continue;
    const c = calcShift(s, wp, 'effective');
    if (s.date >= first && s.date <= last) wpMonth.set(wp.id, (wpMonth.get(wp.id) ?? 0) + c.pay);
    if (filterWp && wp.id !== filterWp) continue;
    const list = byDay.get(s.date) ?? [];
    list.push({ shift: s, color: wp.color, minutes: c.workedMinutes, pay: c.pay, cash: isUntaxed(s) });
    byDay.set(s.date, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.shift.start - b.shift.start);

  const monthTotal = filterWp ? (wpMonth.get(filterWp) ?? 0) : [...wpMonth.values()].reduce((a, b) => a + b, 0);

  const weeks: string[] = [];
  for (let w = weekStartOf(first, settings.weekStartDay); w <= last; w = addDays(w, 7)) weeks.push(w);

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

      <div className="mc-head">
        <div className="mc-chips">
          {workplaces.map((w) => (
            <button
              key={w.id}
              className={filterWp && filterWp !== w.id ? 'mc-chip off' : 'mc-chip'}
              style={{ ['--c' as string]: w.color }}
              aria-pressed={filterWp === w.id}
              onClick={() => setFilterWp(filterWp === w.id ? null : w.id)}
            >
              {w.name || 'Workplace'} <span>›</span>
            </button>
          ))}
        </div>
        <div className="mc-total">{fmtMoney(monthTotal)}</div>
      </div>

      <section className="mc-cal">
        <div className="mc-dow">
          {Array.from({ length: 7 }, (_, i) => {
            const dow = (settings.weekStartDay + i) % 7;
            return (
              <span key={i} className={dow === 6 ? 'sat' : dow === 0 ? 'sun' : ''}>
                {WEEKDAY_SHORT[dow]}
              </span>
            );
          })}
        </div>
        {weeks.map((w) => {
          const wEnd = addDays(w, 6);
          const wShifts = shifts.filter((s) => s.date >= w && s.date <= wEnd);
          const meta = state.weeks[w];
          // Same figure as This week's "before tax"; for one workplace, its shifts added up
          let weekTotal = 0;
          if (filterWp) {
            for (let i = 0; i < 7; i++) weekTotal += (byDay.get(addDays(w, i)) ?? []).reduce((a, d) => a + d.pay, 0);
          } else if (wShifts.length > 0 || meta?.payslip) {
            weekTotal = weekMoney(summarize(wShifts, workplaces, 'effective'), meta, settings.taxMode).gross;
          }
          return (
            <div className="mc-week" key={w}>
              {weekTotal > 0 && (
                <div className="mc-wbar">
                  Week <b>{fmtMoney(weekTotal)}</b>
                </div>
              )}
              <div className="mc-days">
                {Array.from({ length: 7 }, (_, i) => {
                  const date = addDays(w, i);
                  const list = byDay.get(date);
                  const dow = (settings.weekStartDay + i) % 7;
                  const cls = ['mc-day', date >= first && date <= last ? '' : 'out', date === today ? 'today' : '', date === selected ? 'selected' : '']
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button key={date} className={cls} onClick={() => setSelected(date === selected ? null : date)} aria-label={fmtDateLong(date)}>
                      <span className={dow === 6 ? 'mc-num sat' : dow === 0 ? 'mc-num sun' : 'mc-num'}>{Number(date.slice(8))}</span>
                      {list?.map((d) => (
                        <span key={d.shift.id} className={d.cash ? 'mc-pill cash' : 'mc-pill'} style={{ ['--c' as string]: d.color }}>
                          {pillTime(d.minutes)}
                        </span>
                      ))}
                      {list && <CellPay amount={list.reduce((a, d) => a + d.pay, 0)} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <div className="mc-legend">
        {workplaces.map((w) => (
          <span key={w.id}>
            <i style={{ background: w.color }} />
            {w.name || 'Workplace'} {fmtMoney(wpMonth.get(w.id) ?? 0)}
          </span>
        ))}
        <span>
          <i className="cash" /> Light = cash shift
        </span>
      </div>

      {selected && (
        <section className="card">
          <div className="card-title">
            {fmtDateLong(selected)}
            {sel && <span className="muted">{fmtMoney(sel.reduce((a, d) => a + d.pay, 0))}</span>}
          </div>
          {sel ? (
            <div className="stack-sm">
              {sel.map(({ shift: s }) => {
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
                        {fmtDuration(c.workedMinutes)} · {SOURCE_LABEL[s.source]}
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
