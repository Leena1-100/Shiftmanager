import { useMemo, useRef, useState } from 'react';
import type { Settings, Shift, Source, Workplace } from '../types';
import { parseShifts, type ParsedShift } from '../lib/parser';
import { mergeShifts, type MergeAction } from '../lib/merge';
import { imageToText } from '../lib/ocr';
import { WEEKDAY_SHORT, dayOfWeek, fmtDateShort, fmtTime, normalizeRange, parseHHMM } from '../lib/time';
import { ImageIcon } from './Icons';
import { SOURCE_LABEL } from './HomeTab';

interface Props {
  settings: Settings;
  workplaces: Workplace[];
  allShifts: Shift[];
  weekStart: string;
  onApply: (shifts: Shift[]) => void;
}

interface Row extends ParsedShift {
  key: number;
  include: boolean;
}

const PLACEHOLDER: Record<'tanda' | 'message', string> = {
  tanda: `Paste shifts from the Tanda app/email, or upload a screenshot
e.g.
Monday 27 Oct
9:00am - 3:00pm
Break 30m
Wed 29 Oct 4:30pm – 10:15pm`,
  message: `Paste the text/chat from your manager
e.g.
Mon 9-3
Thu 5-11pm
Sat 10:30am - 4pm`,
};

const ACTION_LABEL: Record<MergeAction, string> = {
  added: 'New',
  duplicate: 'Already there (same times)',
  replaced: 'Different times → new times applied',
  kept: 'Different times → existing kept',
};

export default function ImportTab({ settings, workplaces, allShifts, weekStart, onApply }: Props) {
  const [workplaceId, setWorkplaceId] = useState(workplaces[0].id);
  const [texts, setTexts] = useState({ tanda: '', message: '' });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ocr, setOcr] = useState<{ source: Source; progress: number } | null>(null);
  const [withKorean, setWithKorean] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef(0);

  const analyze = () => {
    const parsed = [
      ...parseShifts(texts.tanda, 'tanda', weekStart),
      ...parseShifts(texts.message, 'message', weekStart),
    ];
    setRows(parsed.map((p) => ({ ...p, key: keyRef.current++, include: true })));
  };

  const runOcr = async (source: 'tanda' | 'message', files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    try {
      for (const file of Array.from(files)) {
        setOcr({ source, progress: 0 });
        const text = await imageToText(file, withKorean, (p) => setOcr({ source, progress: p }));
        setTexts((t) => ({ ...t, [source]: (t[source] ? t[source] + '\n' : '') + text.trim() }));
      }
    } catch (e) {
      setError("Couldn't read the image. Check your internet connection, or paste the text instead.");
      console.error(e);
    } finally {
      setOcr(null);
    }
  };

  const merged = useMemo(() => {
    if (!rows) return null;
    // Feed Tanda first, then messages, so the priority comparison reads naturally
    const incoming = rows
      .filter((r) => r.include)
      .sort((a, b) => (a.source === b.source ? 0 : a.source === 'tanda' ? -1 : 1))
      .map(({ date, start, end, unpaidBreak, source }) => ({ date, start, end, unpaidBreak, source, workplaceId }));
    return mergeShifts(allShifts, incoming, settings.mergePriority);
  }, [rows, allShifts, settings.mergePriority, workplaceId]);

  const counts = merged?.events.reduce<Partial<Record<MergeAction, number>>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="stack">
      <p className="small muted pad">
        Add your Tanda shifts and message shifts and they'll be merged into one roster. When the same day has different times,{' '}
        <b>{SOURCE_LABEL[settings.mergePriority]}</b> wins, and you can switch to the other version from the shift card any time.
      </p>

      {workplaces.length > 1 && (
        <section className="card">
          <div className="card-title">Which workplace are these shifts for?</div>
          <div className="seg small">
            {workplaces.map((w) => (
              <button key={w.id} className={w.id === workplaceId ? 'on' : ''} onClick={() => setWorkplaceId(w.id)}>
                {w.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {(['tanda', 'message'] as const).map((src) => (
        <section className="card" key={src}>
          <div className="card-title">
            <span className={`badge ${src}`}>{SOURCE_LABEL[src]}</span>
            {src === 'tanda' ? 'Tanda shifts' : 'Shifts from messages'}
          </div>
          <textarea
            rows={6}
            value={texts[src]}
            placeholder={PLACEHOLDER[src]}
            onChange={(e) => setTexts((t) => ({ ...t, [src]: e.target.value }))}
          />
          <div className="inline between">
            <label className="ghost-btn file">
              <ImageIcon /> Read from screenshot
              <input type="file" accept="image/*" multiple hidden onChange={(e) => runOcr(src, e.target.files)} />
            </label>
            {ocr?.source === src && <span className="small muted">Reading image… {Math.round(ocr.progress * 100)}%</span>}
            {texts[src] && !ocr && (
              <button className="link" onClick={() => setTexts((t) => ({ ...t, [src]: '' }))}>
                Clear
              </button>
            )}
          </div>
        </section>
      ))}

      <label className="check pad small">
        <input type="checkbox" checked={withKorean} onChange={(e) => setWithKorean(e.target.checked)} />
        Screenshots contain Korean text (downloads extra OCR data)
      </label>
      {error && <p className="error pad">{error}</p>}

      <button className="primary block" disabled={!texts.tanda.trim() && !texts.message.trim()} onClick={analyze}>
        Find shifts
      </button>

      {rows && (
        <section className="card">
          <div className="card-title">
            Found {rows.length} shift{rows.length === 1 ? '' : 's'}
          </div>
          {rows.length === 0 && (
            <p className="small muted">No time ranges found (e.g. 9am-3pm, 10:00-16:00). Please check the format.</p>
          )}
          <ul className="preview">
            {rows.map((r) => (
              <li key={r.key} className={r.include ? '' : 'off'}>
                <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.key, { include: e.target.checked })} aria-label="Include" />
                <span className={`badge ${r.source}`}>{SOURCE_LABEL[r.source]}</span>
                <input
                  type="date"
                  value={r.date}
                  className={r.dateGuessed ? 'warn' : ''}
                  onChange={(e) => e.target.value && updateRow(r.key, { date: e.target.value, dateGuessed: false })}
                />
                <span className="dow">{WEEKDAY_SHORT[dayOfWeek(r.date)]}</span>
                <TimeInput value={r.start} onChange={(v) => updateRow(r.key, { start: v, end: normalizeRange(v, r.end % 1440)[1] })} />
                <span>–</span>
                <TimeInput value={r.end} onChange={(v) => updateRow(r.key, { end: normalizeRange(r.start, v)[1] })} />
                {r.unpaidBreak !== undefined && <span className="small muted">Break {r.unpaidBreak}m</span>}
                <span className="raw" title={r.raw}>
                  {r.raw}
                </span>
              </li>
            ))}
          </ul>
          {rows.some((r) => r.dateGuessed) && (
            <p className="small warn-text">Dates highlighted in yellow weren't in the text and were guessed. Please check them.</p>
          )}

          {merged && merged.events.length > 0 && (
            <>
              <ul className="merge-summary">
                {(Object.keys(ACTION_LABEL) as MergeAction[])
                  .filter((a) => counts?.[a])
                  .map((a) => (
                    <li key={a}>
                      <span>{ACTION_LABEL[a]}</span>
                      <b>{counts![a]}</b>
                    </li>
                  ))}
              </ul>
              <ul className="merge-detail">
                {merged.events
                  .filter((e) => e.action === 'replaced' || e.action === 'kept')
                  .map((e, i) => (
                    <li key={i}>
                      {fmtDateShort(e.shift.date)} · using {fmtTime(e.shift.start)}–{fmtTime(e.shift.end)} ({SOURCE_LABEL[e.shift.source]}) / kept{' '}
                      {e.shift.alt && `${fmtTime(e.shift.alt.start)}–${fmtTime(e.shift.alt.end)} (${SOURCE_LABEL[e.shift.alt.source]})`}
                    </li>
                  ))}
              </ul>
              <button
                className="primary block"
                onClick={() => {
                  onApply(merged.shifts);
                  setRows(null);
                  setTexts({ tanda: '', message: '' });
                }}
              >
                Merge and save
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="time"
      value={fmtTime(value)}
      onChange={(e) => {
        const v = parseHHMM(e.target.value);
        if (v !== null) onChange(v);
      }}
    />
  );
}
