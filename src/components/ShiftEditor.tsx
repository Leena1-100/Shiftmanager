import { useState } from 'react';
import type { Settings, Shift, Workplace } from '../types';
import { breaksFor, calcShift, isMessageOnly } from '../lib/pay';
import { newId } from '../lib/merge';
import ConfirmButton from './ConfirmButton';
import PayBreakdown from './PayBreakdown';
import { fmtDateLong, fmtDuration, fmtMoney, fmtTime, normalizeRange, parseHHMM } from '../lib/time';

interface Props {
  shift: Shift | null;
  defaultDate: string;
  workplaces: Workplace[];
  allShifts: Shift[];
  settings: Settings;
  onClose: () => void;
  onSave: (s: Shift) => void;
  onDelete: (id: string) => void;
}

const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

export default function ShiftEditor({ shift, defaultDate, workplaces, allShifts, settings, onClose, onSave, onDelete }: Props) {
  const [workplaceId, setWorkplaceId] = useState(
    workplaces.find((w) => w.id === shift?.workplaceId)?.id ?? workplaces[0].id,
  );
  const wp = workplaces.find((w) => w.id === workplaceId) ?? workplaces[0];
  const [date, setDate] = useState(shift?.date ?? defaultDate);
  const [start, setStart] = useState(fmtTime(shift?.start ?? 9 * 60));
  const [end, setEnd] = useState(fmtTime(shift?.end ?? 15 * 60));
  const [breakAuto, setBreakAuto] = useState(shift?.unpaidBreak === undefined);
  const [unpaid, setUnpaid] = useState(String(shift?.unpaidBreak ?? 30));
  const [ph, setPh] = useState(!!shift?.publicHoliday);
  const [note, setNote] = useState(shift?.note ?? '');

  const [hasActual, setHasActual] = useState(!!shift?.actual);
  const [aStart, setAStart] = useState(fmtTime(shift?.actual?.start ?? shift?.start ?? 9 * 60));
  const [aEnd, setAEnd] = useState(fmtTime(shift?.actual?.end ?? shift?.end ?? 15 * 60));
  const [aUnpaid, setAUnpaid] = useState(String(shift?.actual?.unpaidBreak ?? ''));
  const [aPaid, setAPaid] = useState(String(shift?.actual?.paidBreak ?? ''));
  const [useTanda, setUseTanda] = useState(!!shift?.tandaPay);
  const [applyTax, setApplyTax] = useState(!!shift?.applyTax);

  const ps = parseHHMM(start);
  const pe = parseHHMM(end);
  const valid = ps !== null && pe !== null && !!date;
  const [s0, e0] = valid ? normalizeRange(ps, pe) : [0, 0];
  const rule = breaksFor(e0 - s0, wp.breakTiers);

  const as = parseHHMM(aStart);
  const ae = parseHHMM(aEnd);
  const actualValid = !hasActual || (as !== null && ae !== null);

  const build = (): Shift | null => {
    if (!valid || !actualValid) return null;
    let actual: Shift['actual'];
    if (hasActual) {
      const [a1, a2] = normalizeRange(as!, ae!);
      const aRule = breaksFor(a2 - a1, wp.breakTiers);
      actual = {
        start: a1,
        end: a2,
        unpaidBreak: aUnpaid === '' ? aRule.unpaidMinutes : num(aUnpaid),
        paidBreak: aPaid === '' ? aRule.paidMinutes : num(aPaid),
      };
    }
    const sources = shift?.sources ?? ['manual'];
    return {
      id: shift?.id ?? newId(),
      date,
      start: s0,
      end: e0,
      source: shift?.source ?? 'manual',
      sources,
      workplaceId: wp.id,
      unpaidBreak: breakAuto ? undefined : num(unpaid),
      publicHoliday: ph || undefined,
      note: note.trim() || undefined,
      actual,
      tandaPay: hasActual && useTanda ? shift?.tandaPay : undefined,
      applyTax: applyTax || undefined,
      alt: shift?.alt,
    };
  };

  const draft = build();
  const planCalc = draft && calcShift(draft, wp, 'planned');
  const effCalc = draft && calcShift(draft, wp, 'effective');
  const aSpan = as !== null && ae !== null ? normalizeRange(as, ae) : null;
  const aRule = aSpan ? breaksFor(aSpan[1] - aSpan[0], wp.breakTiers) : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <h3>{shift ? fmtDateLong(shift.date) : 'Add shift'}</h3>

        {workplaces.length > 1 && (
          <div className="field">
            <span>Workplace</span>
            <div className="seg small">
              {workplaces.map((w) => (
                <button key={w.id} className={w.id === wp.id ? 'on' : ''} onClick={() => setWorkplaceId(w.id)}>
                  {w.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="group">
          <div className="group-title">Rostered shift</div>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="row2">
            <label className="field">
              <span>Start</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>End</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="field">
            <span>Unpaid break</span>
            <div className="inline">
              <label className="check">
                <input type="checkbox" checked={breakAuto} onChange={(e) => setBreakAuto(e.target.checked)} />
                Auto ({rule.unpaidMinutes}m)
              </label>
              {!breakAuto && (
                <input className="num" inputMode="numeric" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} aria-label="Unpaid break (minutes)" />
              )}
              {!breakAuto && <span className="muted">min</span>}
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={ph} onChange={(e) => setPh(e.target.checked)} />
            Public holiday
          </label>
          <label className="field">
            <span>Note</span>
            <input value={note} placeholder="e.g. covering for Sam" onChange={(e) => setNote(e.target.value)} />
          </label>
          {planCalc && (
            <p className="calc-line">
              {fmtDuration(planCalc.workedMinutes)} paid · paid break {planCalc.paidBreak}m · <b>{fmtMoney(planCalc.pay)}</b>
            </p>
          )}
        </div>

        <div className="group mint">
          <div className="group-title">
            Actual hours (to the minute)
            <label className="switch">
              <input type="checkbox" checked={hasActual} onChange={(e) => setHasActual(e.target.checked)} aria-label="Log actual hours" />
              <span />
            </label>
          </div>
          {hasActual ? (
            <>
              <div className="row2">
                <label className="field">
                  <span>Clock in</span>
                  <input type="time" value={aStart} onChange={(e) => setAStart(e.target.value)} />
                </label>
                <label className="field">
                  <span>Clock out</span>
                  <input type="time" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
                </label>
              </div>
              <div className="row2">
                <label className="field">
                  <span>Unpaid break (min)</span>
                  <input inputMode="numeric" placeholder={`Auto ${aRule?.unpaidMinutes ?? 0}`} value={aUnpaid} onChange={(e) => setAUnpaid(e.target.value)} />
                </label>
                <label className="field">
                  <span>Paid break (min)</span>
                  <input inputMode="numeric" placeholder={`Auto ${aRule?.paidMinutes ?? 0}`} value={aPaid} onChange={(e) => setAPaid(e.target.value)} />
                </label>
              </div>
              <div className="inline wrap">
                <p className="small muted grow">Missed a break? Set it to 0 and the missed time is paid on top, like Tanda: 10 min for a paid break, 30 min for a meal break.</p>
                {aPaid !== '0' && (
                  <button type="button" className="ghost-btn" onClick={() => setAPaid('0')}>
                    Missed paid break
                  </button>
                )}
              </div>
              {effCalc && planCalc && (
                <p className="calc-line">
                  Actual {fmtDuration(effCalc.workedMinutes)}
                  {effCalc.missedBreakMinutes > 0 && ` + ${effCalc.missedBreakMinutes}m missed break`} · <b>{fmtMoney(effCalc.pay)}</b>
                  {effCalc.pay !== planCalc.pay && (
                    <span className={effCalc.pay > planCalc.pay ? 'up' : 'down'}>
                      {' '}
                      ({effCalc.pay > planCalc.pay ? '+' : ''}
                      {fmtMoney(effCalc.pay - planCalc.pay)})
                    </span>
                  )}
                </p>
              )}
              {shift?.tandaPay && (
                <label className="check wrap-text">
                  <input type="checkbox" checked={useTanda} onChange={(e) => setUseTanda(e.target.checked)} />
                  Use Tanda's pay ({shift.tandaPay.hours} hrs | {fmtMoney(shift.tandaPay.pay)}) instead of calculating
                </label>
              )}
            </>
          ) : (
            <p className="small muted">
              After your shift, turn this on and adjust the clock-in/out and break minutes. Times start at the roster, so you only
              change what was different.
            </p>
          )}
        </div>

        {draft && <PayBreakdown shift={draft} wp={wp} workplaces={workplaces} allShifts={allShifts} settings={settings} />}

        {shift && isMessageOnly(shift) && (
          <div className="tax-toggle">
            <div>
              <b>{applyTax ? 'Tax and super applied' : 'No tax or super taken off'}</b>
              <p className="small muted">
                {applyTax
                  ? 'This shift counts towards your tax and super estimate.'
                  : 'Message rosters are counted at their full amount.'}
              </p>
            </div>
            <button type="button" className={applyTax ? 'secondary' : 'primary'} onClick={() => setApplyTax(!applyTax)}>
              {applyTax ? 'Remove tax & super' : 'Apply tax & super'}
            </button>
          </div>
        )}

        <div className="sheet-actions">
          {shift && (
            <ConfirmButton label="Delete" confirmLabel="Tap again to delete" onConfirm={() => onDelete(shift.id)} />
          )}
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!draft} onClick={() => draft && onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
