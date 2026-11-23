import { useState } from 'react';
import type { Payslip, Settings, Shift, Workplace } from '../types';
import { summarize } from '../lib/pay';
import { parsePayslip, weekMoney } from '../lib/payslip';
import { imageToText } from '../lib/ocr';
import { addDays, fmtDateShort, fmtMoney, weekStartOf } from '../lib/time';
import { CloseIcon, ImageIcon } from './Icons';
import ConfirmButton from './ConfirmButton';

interface Props {
  weekStart: string;
  existing?: Payslip;
  shifts: Shift[];
  workplaces: Workplace[];
  settings: Settings;
  onSave: (weekStart: string, payslip: Payslip) => void;
  onDelete: (weekStart: string) => void;
  onClose: () => void;
}

type Field = 'gross' | 'tax' | 'net' | 'super' | 'hours';
const FIELDS: { key: Field; label: string; hint?: string }[] = [
  { key: 'gross', label: 'Gross pay', hint: 'before tax' },
  { key: 'tax', label: 'Tax withheld (PAYG)' },
  { key: 'net', label: 'Net pay', hint: 'paid to your bank' },
  { key: 'super', label: 'Super' },
  { key: 'hours', label: 'Hours' },
];

const asText = (n: number | undefined) => (n === undefined ? '' : String(n));

export default function PayslipSheet({ weekStart, existing, shifts, workplaces, settings, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState('');
  const [values, setValues] = useState<Record<Field, string>>({
    gross: asText(existing?.gross),
    tax: asText(existing?.tax),
    net: asText(existing?.net),
    super: asText(existing?.super),
    hours: asText(existing?.hours),
  });
  const [period, setPeriod] = useState({ start: existing?.periodStart ?? '', end: existing?.periodEnd ?? '' });
  const [payDate, setPayDate] = useState(existing?.payDate ?? '');
  const [ocr, setOcr] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  // A payslip period that falls in another week moves the payslip to that week
  const targetWeek = period.start
    ? weekStartOf(period.start, settings.weekStartDay)
    : period.end
      ? weekStartOf(period.end, settings.weekStartDay)
      : weekStart;
  const weekEnd = addDays(targetWeek, 6);
  const weekShifts = shifts.filter((s) => s.date >= targetWeek && s.date <= weekEnd);
  const app = weekMoney(summarize(weekShifts, workplaces, 'effective'), undefined, settings.taxMode);

  const num = (k: Field) => (values[k].trim() === '' ? undefined : Number(values[k]));
  const gross = num('gross');
  const tax = num('tax');
  const valid = gross !== undefined && !Number.isNaN(gross) && tax !== undefined && !Number.isNaN(tax);
  const diff = gross !== undefined ? Math.round((gross - app.appTanda) * 100) / 100 : 0;

  const fill = (raw: string) => {
    const p = parsePayslip(raw);
    const got = (Object.keys(p) as (keyof Payslip)[]).filter((k) => p[k] !== undefined);
    if (!got.length) {
      setMessage("Couldn't find payslip figures in that text. Type them in below.");
      return;
    }
    setValues((v) => ({
      gross: asText(p.gross) || v.gross,
      tax: asText(p.tax) || v.tax,
      net: asText(p.net) || v.net,
      super: asText(p.super) || v.super,
      hours: asText(p.hours) || v.hours,
    }));
    if (p.periodStart || p.periodEnd) setPeriod({ start: p.periodStart ?? '', end: p.periodEnd ?? '' });
    if (p.payDate) setPayDate(p.payDate);
    setMessage(
      p.gross !== undefined && p.tax !== undefined
        ? 'Filled in from the payslip. Check the numbers before saving.'
        : 'Some figures were found. Fill in the rest below.',
    );
  };

  const readImage = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setMessage('');
    try {
      setOcr(0);
      const t = await imageToText(file, false, setOcr);
      setText(t.trim());
      fill(t);
    } catch {
      setMessage("Couldn't read the image. Paste the payslip text or type the numbers in.");
    } finally {
      setOcr(null);
    }
  };

  const save = () => {
    if (!valid) return;
    const net = num('net');
    onSave(targetWeek, {
      gross: gross!,
      tax: tax!,
      net: net ?? Math.round((gross! - tax!) * 100) / 100,
      super: num('super'),
      hours: num('hours'),
      periodStart: period.start || undefined,
      periodEnd: period.end || undefined,
      payDate: payDate || undefined,
    });
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h3>
            Payslip · {fmtDateShort(targetWeek)} – {fmtDateShort(weekEnd)}
          </h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <section className="card">
          <p className="small muted">
            Add the payslip Tanda sends on Sunday. The week's tax and take-home will use its actual figures instead of estimates.
          </p>
          <textarea
            rows={4}
            value={text}
            placeholder={'Paste the payslip text, or read it from a screenshot\ne.g. Gross Pay $776.94 · PAYG Tax $80.00 · Net Pay $696.94'}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="inline wrap">
            <label className="ghost-btn file">
              <ImageIcon /> Read from screenshot
              <input type="file" accept="image/*" hidden onChange={(e) => readImage(e.target.files)} />
            </label>
            <button className="ghost-btn" disabled={!text.trim()} onClick={() => fill(text)}>
              Find numbers
            </button>
            {ocr !== null && <span className="small muted">Reading image… {Math.round(ocr * 100)}%</span>}
          </div>
          {message && <p className="small muted">{message}</p>}
        </section>

        <section className="card">
          <div className="payslip-fields">
            {FIELDS.map(({ key, label, hint }) => (
              <label className="field" key={key}>
                <span>
                  {label} {hint && <small className="muted">({hint})</small>}
                </span>
                <input
                  inputMode="decimal"
                  placeholder={key === 'net' && valid ? String(Math.round((gross! - tax!) * 100) / 100) : '0.00'}
                  value={values[key]}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="row2">
            <label className="field">
              <span>Pay period from</span>
              <input type="date" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} />
            </label>
            <label className="field">
              <span>to</span>
              <input type="date" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} />
            </label>
          </div>
          <label className="field">
            <span>Pay date</span>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          {targetWeek !== weekStart && (
            <p className="small warn-text">This pay period is in the week of {fmtDateShort(targetWeek)}, so it will be saved there.</p>
          )}
        </section>

        <section className="card">
          <div className="card-title">Check against the app</div>
          <div className="bd-row">
            <span>App's Tanda total for this week</span>
            <b>{fmtMoney(app.appTanda)}</b>
          </div>
          {gross !== undefined && !Number.isNaN(gross) && (
            <>
              <div className="bd-row">
                <span>Payslip gross</span>
                <b>{fmtMoney(gross)}</b>
              </div>
              <p className={Math.abs(diff) < 0.01 ? 'small match' : 'small mismatch'}>
                {Math.abs(diff) < 0.01
                  ? '✓ Matches the app to the cent'
                  : `Payslip is ${fmtMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the app. Check for a missing or extra shift, breaks or allowances.`}
              </p>
            </>
          )}
          {app.cash > 0 && <p className="small muted">Cash shifts this week ({fmtMoney(app.cash)}) aren't on the payslip and are added separately.</p>}
        </section>

        <div className="sheet-actions">
          {existing && <ConfirmButton label="Remove payslip" confirmLabel="Tap again to remove" onConfirm={() => onDelete(weekStart)} />}
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!valid} onClick={save}>
            Save payslip
          </button>
        </div>
      </div>
    </div>
  );
}
