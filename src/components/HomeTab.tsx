import { useState } from 'react';
import type { Band, Settings, Shift, Source, Workplace } from '../types';
import { calcShift, summarize, workplaceFor } from '../lib/pay';
import { swapAlt } from '../lib/merge';
import { taxFreeRoom, weeklyWithholding, WEEKLY_TAX_FREE } from '../lib/tax';
import { bandLabel } from '../lib/defaults';
import { WEEKDAY_SHORT, dayOfWeek, fmtDateShort, fmtDuration, fmtMoney, fmtTime } from '../lib/time';
import { PlusIcon, SwapIcon, ClockIcon, CheckIcon } from './Icons';

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
  const tax = weeklyWithholding(sum.gross, settings.taxMode);
  const net = sum.gross - tax;
  const room = taxFreeRoom(sum.gross, settings.taxMode);
  const diff = effective.gross - planned.gross;
  const superAmt = sum.gross * settings.superRate;
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
            <div style={{ width: `${Math.min(100, (sum.gross / WEEKLY_TAX_FREE) * 100)}%` }} />
          </div>
          {room > 0 ? (
            <p className="small">
              No tax for another {fmtMoney(room)} · about{' '}
              <b>{fmtDuration((room / (mainWp.baseRate * mainWp.multipliers.weekday)) * 60)}</b> more at {multiWp ? `${mainWp.name}'s` : 'the'} weekday rate
            </p>
          ) : (
            <p className="small">
              You're {fmtMoney(sum.gross - WEEKLY_TAX_FREE)} over the tax-free zone. Tax applies to the amount above it.
            </p>
          )}
        </section>
      )}
      {settings.taxMode === 'whm' && (
        <p className="small muted pad">Working holiday makers have no tax-free threshold: 15% from the first dollar.</p>
      )}

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
          <div className="card-title">Pay by rate</div>
          {workplaces
            .filter((wp) => sum.byWorkplace[wp.id])
            .map((wp) => {
              const part = sum.byWorkplace[wp.id];
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
                    {(Object.entries(part.minutesByBand) as [Band, number][]).map(([band, mins]) => (
                      <li key={band}>
                        <span>
                          {bandLabel(band, wp)} <span className="muted">×{wp.multipliers[band]}</span>
                        </span>
                        <span>{fmtDuration(mins)}</span>
                        <b>{fmtMoney((mins * wp.baseRate * wp.multipliers[band]) / 60)}</b>
                      </li>
                    ))}
                  </ul>
                  <p className="small muted">
                    {multiWp ? '' : `${wp.name} · `}
                    {wp.level ? `${wp.level} · ` : ''}
                    {fmtMoney(wp.baseRate)}/h
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
            Paid break {plan.paidBreak}m · Unpaid {plan.unpaidBreak}m
          </span>
        </div>
        {shift.actual ? (
          <div className="shift-actual">
            <CheckIcon size={14} /> Actual {fmtTime(shift.actual.start)}–{fmtTime(shift.actual.end)} · Unpaid {shift.actual.unpaidBreak}m ·{' '}
            {fmtDuration(eff.workedMinutes)}
            {eff.workedMinutes !== plan.workedMinutes && (
              <span className={eff.workedMinutes > plan.workedMinutes ? 'up' : 'down'}>
                {' '}
                ({eff.workedMinutes > plan.workedMinutes ? '+' : ''}
                {eff.workedMinutes - plan.workedMinutes}m)
              </span>
            )}
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
      </div>
    </article>
  );
}
