import type { Settings, Shift, Source, WeekMeta, Workplace } from '../types';
import { weekMoney } from '../lib/payslip';
import { calcShift, isUntaxed, summarize, workplaceFor } from '../lib/pay';
import { swapAlt } from '../lib/merge';
import { WEEKDAY_SHORT, dayOfWeek, fmtCash, fmtDateShort, fmtDuration, fmtMoney, fmtTime } from '../lib/time';
import { ImportIcon, PlusIcon, SwapIcon } from './Icons';

export const SOURCE_LABEL: Record<Source, string> = { tanda: 'Tanda', message: 'Cash', manual: 'Manual' };

interface Props {
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
  weekStart: string;
  weekMeta?: WeekMeta;
  onEdit: (s: Shift) => void;
  onAdd: () => void;
  onSave: (s: Shift) => void;
  onGoImport: () => void;
}

export default function HomeTab({ settings, workplaces, shifts, weekMeta, onEdit, onAdd, onSave, onGoImport }: Props) {
  const sum = summarize(shifts, workplaces, 'effective');
  // Before the payslip arrives: what's been entered, with estimated tax. After: the payslip's figures
  const money = weekMoney(sum, weekMeta, settings.taxMode);
  const fromPayslip = money.fromPayslip;
  const multiWp = workplaces.length > 1;
  // Paid hours for the Tanda part (payslip hours once it's added) and for cash shifts
  let appTandaMinutes = 0;
  let cashMinutes = 0;
  for (const sh of shifts) {
    const wp = workplaceFor(sh, workplaces);
    if (!wp) continue;
    const c = calcShift(sh, wp, 'effective');
    if (isUntaxed(sh)) cashMinutes += c.workedMinutes;
    else appTandaMinutes += c.workedMinutes;
  }
  const tandaHours = weekMeta?.payslip?.hours ?? appTandaMinutes / 60;
  const cashHours = cashMinutes / 60;
  // Time at work, clock-in to clock-out with breaks included: worked shifts, and what's still rostered
  let workedSpan = 0;
  let workedCount = 0;
  let rosteredSpan = 0;
  for (const sh of shifts) {
    const wp = workplaceFor(sh, workplaces);
    if (!wp) continue;
    const c = calcShift(sh, wp, 'effective');
    if (c.usedActual) {
      workedSpan += c.span;
      workedCount++;
    } else rosteredSpan += c.span;
  }

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-label">
          This week's pay <span className="hero-tag">{fromPayslip ? 'From payslip' : 'Estimate'}</span>
        </div>
        <div className="hero-pair">
          <div>
            <span>Before tax</span>
            <b>{fmtMoney(money.gross)}</b>
          </div>
          <div>
            <span>After tax</span>
            <b>{fmtMoney(money.net)}</b>
          </div>
        </div>
        <div className="hero-lines">
          <div>
            <span>Tanda pay{fromPayslip ? ' (payslip gross)' : ''}</span>
            <b>{fmtMoney(money.tandaGross)}</b>
          </div>
          <div>
            <span>{fromPayslip ? 'Tax withheld (payslip)' : 'Estimated tax'}</span>
            <b>−{fmtMoney(money.tax)}</b>
          </div>
          <div className="hero-sub">
            <span>Tanda pay after tax</span>
            <b>{fmtMoney(money.net - money.cash)}</b>
          </div>
          {money.cash > 0 && (
            <div>
              <span>Cash shifts (no tax)</span>
              <b>{fmtCash(money.cash)}</b>
            </div>
          )}
          {money.cashDiff !== 0 && (
            <div className="cash-diff">
              <span>Cash received vs expected {fmtCash(money.cashExpected)}</span>
              <b>
                {money.cashDiff > 0 ? '+' : '−'}
                {fmtCash(Math.abs(money.cashDiff))}
              </b>
            </div>
          )}
        </div>
      </section>

      {shifts.length > 0 && (
        <section className="worked-card">
          <span>Hours worked (breaks included)</span>
          <b>{fmtDuration(workedSpan)}</b>
          <small>
            {workedCount} shift{workedCount === 1 ? '' : 's'} worked
            {rosteredSpan > 0 && ` · ${fmtDuration(rosteredSpan)} still rostered`}
          </small>
        </section>
      )}

      {(() => {
        // Overlapping shifts at the same workplace are almost always a duplicate from an earlier import
        const dupDays = new Set<string>();
        for (const x of shifts)
          for (const y of shifts)
            if (x.id < y.id && x.date === y.date && x.workplaceId === y.workplaceId) {
              const a = calcShift(x, workplaceFor(x, workplaces)!, 'effective');
              const b = calcShift(y, workplaceFor(y, workplaces)!, 'effective');
              if (a.start < b.end && b.start < a.end) dupDays.add(x.date);
            }
        return dupDays.size ? (
          <p className="dup-warning">
            Overlapping shifts on {[...dupDays].sort().map(fmtDateShort).join(', ')}. One is probably a duplicate from an earlier import and is
            being counted twice. Open it and tap Delete.
          </p>
        ) : null;
      })()}

      <div className="section-head">
        <h2>Shifts</h2>
        <div className="inline">
          <button className="ghost-btn" onClick={onGoImport}>
            <ImportIcon size={16} /> Roster
          </button>
          <button className="ghost-btn" onClick={onAdd}>
            <PlusIcon size={16} /> Add shift
          </button>
        </div>
      </div>

      {shifts.length === 0 ? (
        <div className="empty">
          <p>No shifts this week yet</p>
          <button className="primary" onClick={onGoImport}>
            Import Tanda / cash shifts
          </button>
        </div>
      ) : (
        <div className="stack-sm">
          {shifts.map((s) => (
            <ShiftCard key={s.id} shift={s} wp={workplaceFor(s, workplaces)!} showWorkplace={multiWp} onEdit={() => onEdit(s)} onSwap={() => onSave(swapAlt(s))} />
          ))}
        </div>
      )}

      {sum.gross > 0 && (
        <section className="card">
          <div className="card-title">This week before tax</div>
          <ul className="breakdown pay-split">
            <li>
              <span>Tanda pay</span>
              <span>{+tandaHours.toFixed(2)} hrs</span>
              <b>{fmtMoney(money.tandaGross)}</b>
            </li>
            {(cashHours > 0 || money.cash > 0) && (
              <li>
                <span>Cash shifts</span>
                <span>{+cashHours.toFixed(2)} hrs</span>
                <b>{fmtCash(money.cash)}</b>
              </li>
            )}
            {money.cashDiff !== 0 && (
              <li className={money.cashDiff > 0 ? 'up' : 'down'}>
                <span>{money.cashDiff > 0 ? 'Got more cash than expected' : 'Got less cash than expected'}</span>
                <span />
                <b>
                  {money.cashDiff > 0 ? '+' : '−'}
                  {fmtCash(Math.abs(money.cashDiff))}
                </b>
              </li>
            )}
            <li className="total">
              <span>Total</span>
              <span />
              <b>{fmtMoney(money.gross)}</b>
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}


function ShiftCard({
  shift,
  wp,
  showWorkplace,
  onEdit,
  onSwap,
}: {
  shift: Shift;
  wp: Workplace;
  showWorkplace: boolean;
  onEdit: () => void;
  onSwap: () => void;
}) {
  // Once actual times are entered, the card shows only those: times and breaks as entered
  const eff = calcShift(shift, wp, 'effective');
  const dow = dayOfWeek(shift.date);
  const weekend = dow === 0 || dow === 6;

  return (
    <article className="shift" onClick={onEdit} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      <div className={`shift-day${weekend ? ' weekend' : ''}${shift.publicHoliday ? ' ph' : ''}`}>
        <b>{WEEKDAY_SHORT[dow]}</b>
        <span>{fmtDateShort(shift.date)}</span>
      </div>
      <div className="shift-body">
        <div className="shift-time">
          {fmtTime(eff.start)} – {fmtTime(eff.end)}
          {eff.end >= 1440 && <span className="muted small"> (+1 day)</span>}
        </div>
        {showWorkplace && (
          <div className="wp-tag">
            <span className="wp-dot" style={{ background: wp.color }} />
            {wp.name}
          </div>
        )}
        <div className="shift-meta">
          {shift.sources.map((src) => (
            <span key={src} className={`badge ${src}`}>
              {SOURCE_LABEL[src]}
            </span>
          ))}
          {shift.publicHoliday && <span className="badge ph">Public holiday</span>}
          <span className="muted">
            Paid break {eff.paidBreak}m · Unpaid {eff.unpaidBreak}m
          </span>
        </div>
        {eff.usedActual && eff.missedBreakMinutes > 0 && (
          <div className="shift-actual missed">Missed break +{eff.missedBreakMinutes}m paid</div>
        )}
        {!eff.usedActual && shift.alt && shift.alt.source !== shift.source && (
          <button
            className="alt-chip"
            onClick={(e) => {
              e.stopPropagation();
              onSwap();
            }}
          >
            <SwapIcon size={14} /> Use {SOURCE_LABEL[shift.alt.source]} version {fmtTime(shift.alt.start)}–{fmtTime(shift.alt.end)}
          </button>
        )}
      </div>
      <div className="shift-pay">
        <b>{fmtMoney(eff.pay)}</b>
        <span className="muted small">{fmtDuration(eff.workedMinutes)}</span>
        {eff.fromTanda && <span className="badge tanda">Tanda pay</span>}
        {isUntaxed(shift) && <span className="untaxed">Flat rate · no tax</span>}
      </div>
    </article>
  );
}
