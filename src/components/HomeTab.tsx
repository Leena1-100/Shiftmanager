import type { Settings, Shift, Source, WeekMeta, Workplace } from '../types';
import { payslipMismatch, weekMoney } from '../lib/payslip';
import { calcShift, isUntaxed, summarize, workplaceFor } from '../lib/pay';
import { swapAlt } from '../lib/merge';
import { WEEKDAY_SHORT, dayOfWeek, fmtDateShort, fmtDuration, fmtMoney, fmtTime } from '../lib/time';
import { PlusIcon, SwapIcon, ClockIcon } from './Icons';

type DayType = 'weekday' | 'saturday' | 'sunday' | 'publicHoliday' | 'message';
const DAY_TYPES: DayType[] = ['weekday', 'saturday', 'sunday', 'publicHoliday', 'message'];
const DAY_TYPE_LABEL: Record<DayType, string> = {
  weekday: 'Weekdays',
  saturday: 'Saturday',
  sunday: 'Sunday',
  publicHoliday: 'Public holiday',
  message: 'Message rosters',
};
function dayType(shift: Shift): DayType {
  if (shift.publicHoliday) return 'publicHoliday';
  const d = dayOfWeek(shift.date);
  return d === 6 ? 'saturday' : d === 0 ? 'sunday' : 'weekday';
}

export const SOURCE_LABEL: Record<Source, string> = { tanda: 'Tanda', message: 'Message', manual: 'Manual' };

interface Props {
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
  weekStart: string;
  weekMeta?: WeekMeta;
  onOpenPayslip: () => void;
  onEdit: (s: Shift) => void;
  onAdd: () => void;
  onSave: (s: Shift) => void;
  onGoImport: () => void;
}

export default function HomeTab({ settings, workplaces, shifts, weekMeta, onOpenPayslip, onEdit, onAdd, onSave, onGoImport }: Props) {
  const sum = summarize(shifts, workplaces, 'effective');
  // Before the payslip arrives: what's been entered, with estimated tax. After: the payslip's figures
  const money = weekMoney(sum, weekMeta, settings.taxMode);
  const fromPayslip = money.fromPayslip;
  const taxable = money.tandaGross;
  const superAmt = weekMeta?.payslip?.super ?? taxable * settings.superRate;
  const multiWp = workplaces.length > 1;
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
          {money.cash > 0 && (
            <div>
              <span>Cash shifts (no tax)</span>
              <b>{fmtMoney(money.cash)}</b>
            </div>
          )}
        </div>
        {sum.shifts > 0 && sum.workedShifts < sum.shifts && (
          <div className="hero-note">
            Includes {sum.shifts - sum.workedShifts} shift{sum.shifts - sum.workedShifts === 1 ? '' : 's'} still to come (
            {fmtMoney(sum.gross - sum.workedGross)} estimated)
          </div>
        )}
        {sum.shifts > 0 && (
          <button className="payslip-row" onClick={onOpenPayslip}>
            {fromPayslip ? (
              <>
                <span>
                  {weekMeta?.payslip && payslipMismatch(weekMeta.payslip) !== null ? (
                    <span className="mismatch">⚠ Check the payslip tax · </span>
                  ) : (
                    '✓ '
                  )}
                  Payslip added
                  {Math.abs(money.diff) < 0.01
                    ? ' · matches the app'
                    : ` · ${money.diff > 0 ? '+' : '−'}${fmtMoney(Math.abs(money.diff))} vs app`}
                </span>
                <span className="payslip-edit">Edit</span>
              </>
            ) : (
              <>
                <span>Got this week's payslip?</span>
                <span className="payslip-edit">Add payslip</span>
              </>
            )}
          </button>
        )}
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
        <button className="ghost-btn" onClick={onAdd}>
          <PlusIcon size={16} /> Add shift
        </button>
      </div>

      {shifts.length === 0 ? (
        <div className="empty">
          <p>No shifts this week yet</p>
          <button className="primary" onClick={onGoImport}>
            Import from Tanda / messages
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
          <div className="card-title">Pay by day</div>
          {workplaces
            .filter((wp) => sum.byWorkplace[wp.id])
            .map((wp) => {
              const part = sum.byWorkplace[wp.id];
              // Each shift's full pay (incl. laundry, missed breaks, Tanda's figure) goes under its day type,
              // so the weekday line can be compared with Tanda's weekday total directly
              const groups = new Map<DayType, { shifts: number; worked: number; minutes: number; pay: number }>();
              for (const sh of shifts) {
                if (workplaceFor(sh, workplaces)?.id !== wp.id) continue;
                const c = calcShift(sh, wp, 'effective');
                // Message rosters are paid flat, so they get their own line instead of a day type
                const key = c.flat ? 'message' : dayType(sh);
                const g = groups.get(key) ?? { shifts: 0, worked: 0, minutes: 0, pay: 0 };
                g.shifts++;
                if (c.usedActual) g.worked++;
                g.minutes += c.workedMinutes;
                g.pay += c.pay;
                groups.set(key, g);
              }
              return (
                <div key={wp.id} className="stack-sm">
                  {multiWp && (
                    <div className="wp-subhead">
                      <span className="wp-dot" style={{ background: wp.color }} />
                      <b>{wp.name}</b>
                      <span className="muted small">{fmtDuration(part.workedMinutes)}</span>
                      <b className="right">{fmtMoney(part.gross)}</b>
                    </div>
                  )}
                  <ul className="breakdown">
                    {DAY_TYPES.filter((d) => groups.has(d)).map((d) => {
                      const g = groups.get(d)!;
                      return (
                        <li key={d}>
                          <span>
                            {DAY_TYPE_LABEL[d]}{' '}
                            <span className="muted">
                              {d === 'message' ? 'flat rate, no tax' : `×${wp.multipliers[d]}`} · {g.shifts} shift{g.shifts === 1 ? '' : 's'}
                              {g.worked < g.shifts && ` (${g.shifts - g.worked} rostered)`}
                            </span>
                          </span>
                          <span>{+(g.minutes / 60).toFixed(2)} hrs</span>
                          <b>{fmtMoney(g.pay)}</b>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="small muted">
                    {multiWp ? '' : `${wp.name} · `}
                    {wp.level ? `${wp.level} · ` : ''}
                    {fmtMoney(wp.baseRate)}/h. Totals include laundry and missed breaks, and use Tanda's amount for Tanda shifts. Tap a shift
                    to see its full working.
                  </p>
                </div>
              );
            })}
          <p className="small muted">Super (paid separately by your employer) ≈ {fmtMoney(superAmt)}</p>
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
        {eff.usedActual ? (
          eff.missedBreakMinutes > 0 && <div className="shift-actual missed">Missed break +{eff.missedBreakMinutes}m paid</div>
        ) : (
          <div className="shift-todo">
            <ClockIcon size={14} /> Log actual times after your shift
          </div>
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
