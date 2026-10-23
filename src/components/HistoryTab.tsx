import type { AppState, WeekMeta } from '../types';
import { summarize, taxableGross } from '../lib/pay';
import { TAX_FREE_THRESHOLD, weeklyWithholding } from '../lib/tax';
import { addDays, fmtDateShort, fmtDuration, fmtMoney, todayISO, weekStartOf } from '../lib/time';
import { CheckIcon } from './Icons';

interface Props {
  state: AppState;
  onUpdateWeek: (week: string, meta: WeekMeta) => void;
  onOpenWeek: (week: string) => void;
}

const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Start of the Australian financial year (1 July) */
function fyStart(iso: string): string {
  const y = Number(iso.slice(0, 4));
  return iso.slice(5) >= '07-01' ? `${y}-07-01` : `${y - 1}-07-01`;
}

export default function HistoryTab({ state, onUpdateWeek, onOpenWeek }: Props) {
  const { settings, shifts, weeks: metas } = state;
  const today = todayISO();

  const groups = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const w = weekStartOf(s.date, settings.weekStartDay);
    groups.set(w, [...(groups.get(w) ?? []), s]);
  }
  const weeks = [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([start, list]) => {
      const sum = summarize(list, state.workplaces, 'effective');
      const tax = weeklyWithholding(taxableGross(sum), settings.taxMode);
      return { start, sum, tax, net: sum.gross - tax, meta: metas[start] ?? {} };
    });

  const fy = fyStart(today);
  const fyWeeks = weeks.filter((w) => w.start >= fy && w.start <= today);
  const fyGross = fyWeeks.reduce((a, w) => a + w.sum.gross, 0);
  const fyTax = fyWeeks.reduce((a, w) => a + w.tax, 0);
  const monthKey = today.slice(0, 7);
  const monthName = MONTH_LONG[Number(monthKey.slice(5)) - 1];
  const monthShifts = shifts.filter((s) => s.date.startsWith(monthKey));
  const month = summarize(monthShifts, state.workplaces, 'effective');
  const received = weeks.filter((w) => w.meta.received).reduce((a, w) => a + (w.meta.receivedAmount ?? w.net), 0);

  const recent = weeks.slice(0, 8).reverse();
  const maxBar = Math.max(1, ...recent.map((w) => w.sum.gross));

  return (
    <div className="stack">
      <section className="hero compact">
        <div className="hero-label">This financial year (from {fmtDateShort(fy)}) before tax</div>
        <div className="hero-amount">{fmtMoney(fyGross)}</div>
        <div className="hero-rows">
          <div>
            <span>Est. tax withheld</span>
            <b>-{fmtMoney(fyTax)}</b>
          </div>
          <div>
            <span>Confirmed received</span>
            <b>{fmtMoney(received)}</b>
          </div>
        </div>
        {settings.taxMode === 'resident-tft' && (
          <>
            <div className="meter light" aria-hidden="true">
              <div style={{ width: `${Math.min(100, (fyGross / TAX_FREE_THRESHOLD) * 100)}%` }} />
            </div>
            <div className="hero-note">
              {Math.round((fyGross / TAX_FREE_THRESHOLD) * 100)}% of the {fmtMoney(TAX_FREE_THRESHOLD)} annual tax-free threshold — stay under it and
              you can get withheld tax back at tax time
            </div>
          </>
        )}
      </section>

      <section className="stats">
        <div className="stat">
          <span>{monthName} earnings</span>
          <b>{fmtMoney(month.gross)}</b>
        </div>
        <div className="stat">
          <span>{monthName} hours</span>
          <b>{fmtDuration(month.workedMinutes)}</b>
        </div>
      </section>

      {state.workplaces.length > 1 && month.gross > 0 && (
        <section className="card">
          <div className="card-title">{monthName} by workplace</div>
          <ul className="breakdown">
            {state.workplaces
              .filter((w) => month.byWorkplace[w.id])
              .map((w) => (
                <li key={w.id}>
                  <span className="inline">
                    <span className="wp-dot" style={{ background: w.color }} />
                    {w.name}
                  </span>
                  <span>{fmtDuration(month.byWorkplace[w.id].workedMinutes)}</span>
                  <b>{fmtMoney(month.byWorkplace[w.id].gross)}</b>
                </li>
              ))}
          </ul>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card">
          <div className="card-title">Recent weekly pay (before tax)</div>
          <div className="bars" role="img" aria-label="Weekly pay before tax for recent weeks">
            {recent.map((w) => (
              <div className="bar-col" key={w.start} title={`${fmtDateShort(w.start)} ${fmtMoney(w.sum.gross)}`}>
                <span className="bar-val">${Math.round(w.sum.gross)}</span>
                <div className="bar" style={{ height: `${(w.sum.gross / maxBar) * 100}%` }} />
                <span className="bar-label">{fmtDateShort(w.start)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="section-head">
        <h2>Weeks</h2>
      </div>
      {weeks.length === 0 && (
        <div className="empty">
          <p>Nothing recorded yet</p>
        </div>
      )}
      <div className="stack-sm">
        {weeks.map((w) => {
          const diff = w.meta.receivedAmount !== undefined ? w.meta.receivedAmount - w.net : null;
          return (
            <article className="week-card" key={w.start}>
              <button className="week-head" onClick={() => onOpenWeek(w.start)}>
                <span>
                  <b>
                    {fmtDateShort(w.start)} – {fmtDateShort(addDays(w.start, 6))}
                  </b>
                  <span className="muted small">
                    {' '}
                    · {w.sum.shifts} shift{w.sum.shifts === 1 ? '' : 's'} · {fmtDuration(w.sum.workedMinutes)}
                  </span>
                </span>
                <b>{fmtMoney(w.sum.gross)}</b>
              </button>
              <div className="week-body">
                <span className="small muted">
                  Est. take-home {fmtMoney(w.net)}
                  {w.sum.actualCount < w.sum.shifts && ` · actuals logged ${w.sum.actualCount}/${w.sum.shifts}`}
                </span>
                <div className="inline">
                  <button
                    className={w.meta.received ? 'chip on' : 'chip'}
                    onClick={() => onUpdateWeek(w.start, { received: !w.meta.received })}
                  >
                    {w.meta.received && <CheckIcon size={14} />} {w.meta.received ? 'Paid' : 'Awaiting pay'}
                  </button>
                  <input
                    className="num wide"
                    inputMode="decimal"
                    placeholder="Amount received"
                    value={w.meta.receivedAmount ?? ''}
                    onChange={(e) =>
                      onUpdateWeek(w.start, {
                        receivedAmount: e.target.value === '' ? undefined : Number(e.target.value) || 0,
                        received: e.target.value === '' ? w.meta.received : true,
                      })
                    }
                  />
                </div>
                {diff !== null && Math.abs(diff) >= 0.01 && (
                  <span className={`small ${diff > 0 ? 'up' : 'down'}`}>
                    {diff > 0 ? '+' : ''}
                    {fmtMoney(diff)} vs estimate — worth checking your payslip
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
