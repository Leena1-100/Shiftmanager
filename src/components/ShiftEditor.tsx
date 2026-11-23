import { useState } from 'react';
import SheetBackdrop from './SheetBackdrop';
import type { Settings, Shift, Workplace } from '../types';
import { breaksFor, calcShift } from '../lib/pay';
import { newId } from '../lib/merge';
import ConfirmButton from './ConfirmButton';
import PayBreakdown from './PayBreakdown';
import { fmtDateLong, fmtDuration, fmtMoney, fmtTime, normalizeRange, parseHHMM, todayISO } from '../lib/time';

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

/**
 * One set of times for a shift. Up to today they are the hours actually worked; for a future
 * date they are the roster. The fields start from what was worked, or the roster if nothing was logged.
 */
export default function ShiftEditor({ shift, defaultDate, workplaces, allShifts, settings, onClose, onSave, onDelete }: Props) {
  const [workplaceId, setWorkplaceId] = useState(
    workplaces.find((w) => w.id === shift?.workplaceId)?.id ?? workplaces[0].id,
  );
  const wp = workplaces.find((w) => w.id === workplaceId) ?? workplaces[0];
  const a = shift?.actual;
  const init = {
    date: shift?.date ?? defaultDate,
    start: fmtTime(a?.start ?? shift?.start ?? 9 * 60),
    end: fmtTime(a?.end ?? shift?.end ?? 15 * 60),
    unpaid: a ? String(a.unpaidBreak) : shift?.unpaidBreak !== undefined ? String(shift.unpaidBreak) : '',
    paid: a ? String(a.paidBreak) : shift?.paidBreak !== undefined ? String(shift.paidBreak) : '',
  };
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [unpaid, setUnpaid] = useState(init.unpaid);
  const [paid, setPaid] = useState(init.paid);
  const [ph, setPh] = useState(!!shift?.publicHoliday);
  const [note, setNote] = useState(shift?.note ?? '');
  const applyTax = !!shift?.applyTax;

  const future = date > todayISO();
  const ps = parseHHMM(start);
  const pe = parseHHMM(end);
  const valid = ps !== null && pe !== null && !!date;
  const [s0, e0] = valid ? normalizeRange(ps, pe) : [0, 0];
  const rule = breaksFor(e0 - s0, wp.breakTiers);
  // Tanda's pay stays only while the worked times are the ones it was read with
  const timesUnchanged =
    date === init.date && start === init.start && end === init.end && unpaid === init.unpaid && paid === init.paid;

  const build = (): Shift | null => {
    if (!valid) return null;
    const unpaidMin = unpaid.trim() === '' ? rule.unpaidMinutes : num(unpaid);
    const paidMin = paid.trim() === '' ? rule.paidMinutes : num(paid);
    const base = {
      id: shift?.id ?? newId(),
      date,
      source: shift?.source ?? ('manual' as const),
      sources: shift?.sources ?? ['manual' as const],
      workplaceId: wp.id,
      publicHoliday: ph || undefined,
      note: note.trim() || undefined,
      applyTax: applyTax || undefined,
      alt: shift?.alt,
    };
    if (future) {
      // Upcoming: the times are the roster
      return {
        ...base,
        start: s0,
        end: e0,
        unpaidBreak: unpaid.trim() === '' ? undefined : unpaidMin,
        paidBreak: paid.trim() === '' ? undefined : paidMin,
      };
    }
    // Worked: keep the original roster for reference, the times entered are what was worked
    return {
      ...base,
      start: shift?.start ?? s0,
      end: shift?.end ?? e0,
      unpaidBreak: shift ? shift.unpaidBreak : unpaid.trim() === '' ? undefined : unpaidMin,
      paidBreak: shift?.paidBreak,
      actual: { start: s0, end: e0, unpaidBreak: unpaidMin, paidBreak: paidMin },
      tandaPay: timesUnchanged ? shift?.tandaPay : undefined,
    };
  };

  const draft = build();
  const calc = draft && calcShift(draft, wp, 'effective');

  return (
    <SheetBackdrop onClose={onClose}>
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
          <div className="row2">
            <label className="field">
              <span>Unpaid break (min)</span>
              <input inputMode="numeric" placeholder={`Auto ${rule.unpaidMinutes}`} value={unpaid} onChange={(e) => setUnpaid(e.target.value)} />
            </label>
            <label className="field">
              <span>Paid break (min)</span>
              <input inputMode="numeric" placeholder={`Auto ${rule.paidMinutes}`} value={paid} onChange={(e) => setPaid(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={ph} onChange={(e) => setPh(e.target.checked)} />
            Public holiday
          </label>
          <label className="field">
            <span>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {calc && (
            <p className="calc-line">
              {fmtDuration(calc.workedMinutes)} paid · <b>{fmtMoney(calc.pay)}</b>
            </p>
          )}
        </div>

        {draft && <PayBreakdown shift={draft} wp={wp} workplaces={workplaces} allShifts={allShifts} settings={settings} />}

        <div className="sheet-actions">
          {shift && <ConfirmButton label="Delete" confirmLabel="Tap again to delete" onConfirm={() => onDelete(shift.id)} />}
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!draft} onClick={() => draft && onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </SheetBackdrop>
  );
}
