import { useState } from 'react';
import type { Settings, Shift, Source, Workplace } from '../types';
import { calcShift, isUntaxed, summarize, taxableGross, workplaceFor } from '../lib/pay';
import { swapAlt } from '../lib/merge';
import { taxFreeRoom, weeklyWithholding, WEEKLY_TAX_FREE } from '../lib/tax';
import { WEEKDAY_SHORT, dayOfWeek, fmtDateShort, fmtDuration, fmtMoney, fmtTime } from '../lib/time';
import { PlusIcon, SwapIcon, ClockIcon, CheckIcon } from './Icons';

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
  onEdit: (s: Shift) => void;
  onAdd: () => void;
  onSave: (s: Shift) => void;
  onGoImport: () => void;
}

export default function HomeTab({ settings, workplaces, shifts, onEdit, onAdd, onSave, onGoImport }: Props) {
  const [mode, setMode] = useState<'planned' | 'effective'>('effective');
  const planned = summarize(shifts, workplaces, 'planned');
  const effective = summarize(shifts, workplaces, 'effective');
  const sum = mode === 'planned' ? planned : effective;
  const taxable = taxableGross(sum);
  const tax = weeklyWithholding(taxable, settings.taxMode);
  const net = sum.gross - tax;
  const room = taxFreeRoom(taxable, settings.taxMode);
  const diff = effective.gross - planned.gross;
  const superAmt = taxable * settings.superRate;
  // Estimate "hours until tax" at the rate of the workplace worked most this week
  const mainWp =
    workplaces.find((w) => w.id === Object.entries(sum.byWorkplace).sort((a, b) => b[1].workedMinutes - a[1].workedMinutes)[0]?.[0]) ??
    workplaces[0];
  const multiWp = workplaces.length > 1;

  return (
    <div className="stack">
      <section className="hero">
        <div className="seg" role="tablist">
          <button className={mode === 'effective' ? 'on' : ''} onClick={() => setMode('effective')}>
            With actuals
          </button>
          <button className={mode === 'planned' ? 'on' : ''} onClick={() => setMode('planned')}>
            Rostered
          </button>
        </div>
        <div className="hero-label">This week's pay (before tax)</div>
        <div className="hero-amount">{fmtMoney(sum.gross)}</div>
        <div className="hero-rows">
          <div>
            <span>Est. tax (PAYG)</span>
            <b>-{fmtMoney(tax)}</b>
          </div>
          <div>
            <span>Est. take-home</span>
            <b>{fmtMoney(net)}</b>
          </div>
        </div>
        {mode === 'effective' && sum.shifts > 0 && (
          <div className="hero-split">
            <div>
              <span>Worked so far</span>
              <b>{fmtMoney(sum.workedGross)}</b>
              <small>
                {sum.workedShifts} shift{sum.workedShifts === 1 ? '' : 's'} · {+(sum.workedPaidMinutes / 60).toFixed(2)} hrs
              </small>
            </div>
            <div>
              <span>Still rostered</span>
              <b>{fmtMoney(sum.gross - sum.workedGross)}</b>
              <small>
                {sum.shifts - sum.workedShifts} shift{sum.shifts - sum.workedShifts === 1 ? '' : 's'} · estimate
              </small>
            </div>
          </div>
        )}
        {sum.untaxedGross > 0 && (
          <div className="hero-note">
            Includes {fmtMoney(sum.untaxedGross)} from message rosters, counted with no tax or super taken off
          </div>
        )}
        {mode === 'effective' && effective.actualCount > 0 && diff !== 0 && (
          <div className="hero-note">
            {diff > 0 ? '+' : ''}
            {fmtMoney(diff)} vs roster ({diff > 0 ? '+' : ''}
            {fmtDuration(effective.workedMinutes - planned.workedMinutes)})
          </div>
        )}
      </section>

      <section className="stats">
        <Stat label="Paid time" value={fmtDuration(sum.workedMinutes)} />
        <Stat label="Paid breaks" value={`${sum.paidBreak}m`} />
        <Stat label="Unpaid breaks" value={`${sum.unpaidBreak}m`} />
        <Stat label="Actuals logged" value={`${effective.actualCount}/${shifts.length}`} />
      </section>

      {room !== null && (
        <section className="card">
          <div className="card-title">
            Tax-free zone <span className="muted">up to {fmtMoney(WEEKLY_TAX_FREE)}/week</span>
          </div>
          <div className="meter" aria-hidden="true">
            <div style={{ width: `${Math.min(100, (taxable / WEEKLY_TAX_FREE) * 100)}%` }} />
          </div>
          {room > 0 ? (
            <p className="small">
              No tax for another {fmtMoney(room)} · about{' '}
              <b>{fmtDuration((room / (mainWp.baseRate * mainWp.multipliers.weekday)) * 60)}</b> more at {multiWp ? `${mainWp.name}'s` : 'the'} weekday rate
            </p>
          ) : (
            <p className="small">
              You're {fmtMoney(taxable - WEEKLY_TAX_FREE)} over the tax-free zone. Tax applies to the amount above it.
            </p>
          )}
        </section>
      )}
      {settings.taxMode === 'whm' && (
        <p className="small muted pad">Working holiday makers have no tax-free threshold: 15% from the first dollar.</p>
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
                const c = calcShift(sh, wp, mode);
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
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
  const plan = calcShift(shift, wp, 'planned');
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
          {fmtTime(shift.start)} – {fmtTime(shift.end)}
          {shift.end >= 1440 && <span className="muted small"> (+1 day)</span>}
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
        {shift.actual ? (
          <div className="shift-actual">
            <CheckIcon size={14} /> Worked {fmtTime(shift.actual.start)}–{fmtTime(shift.actual.end)} · Unpaid {shift.actual.unpaidBreak}m ·{' '}
            {fmtDuration(eff.workedMinutes)}
            {eff.workedMinutes !== plan.workedMinutes && (
              <span className={eff.workedMinutes > plan.workedMinutes ? 'up' : 'down'}>
                {' '}
                ({eff.workedMinutes > plan.workedMinutes ? '+' : ''}
                {eff.workedMinutes - plan.workedMinutes}m)
              </span>
            )}
            {eff.missedBreakMinutes > 0 && <span className="missed"> · Missed break +{eff.missedBreakMinutes}m paid</span>}
          </div>
        ) : (
          <div className="shift-todo">
            <ClockIcon size={14} /> Log actual times after your shift
          </div>
        )}
        {shift.alt && (
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
