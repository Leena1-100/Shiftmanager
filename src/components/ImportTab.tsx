import { useMemo, useRef, useState } from 'react';
import type { Settings, Shift, Source } from '../types';
import { parseShifts, type ParsedShift } from '../lib/parser';
import { mergeShifts, type MergeAction } from '../lib/merge';
import { imageToText } from '../lib/ocr';
import { WEEKDAY_KO, dayOfWeek, fmtDateShort, fmtTime, normalizeRange, parseHHMM } from '../lib/time';
import { ImageIcon } from './Icons';
import { SOURCE_LABEL } from './HomeTab';

interface Props {
  settings: Settings;
  allShifts: Shift[];
  weekStart: string;
  onApply: (shifts: Shift[]) => void;
}

interface Row extends ParsedShift {
  key: number;
  include: boolean;
}

const PLACEHOLDER: Record<'tanda' | 'message', string> = {
  tanda: `탄다 앱/이메일의 시프트 내용을 붙여넣거나 스크린샷을 올리세요
예)
Monday 27 Oct
9:00am - 3:00pm
Break 30m
Wed 29 Oct 4:30pm – 10:15pm`,
  message: `매니저 문자/카톡 내용을 붙여넣으세요
예)
Mon 9-3
Thu 5-11pm
토요일 오전 10시~오후 4시`,
};

const ACTION_LABEL: Record<MergeAction, string> = {
  added: '새로 추가',
  duplicate: '이미 있음 (같은 시간)',
  replaced: '시간 다름 → 새 시간 적용',
  kept: '시간 다름 → 기존 유지',
};

export default function ImportTab({ settings, allShifts, weekStart, onApply }: Props) {
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
      setError('이미지 인식에 실패했어요. 인터넷 연결을 확인하거나 텍스트를 직접 붙여넣어 주세요.');
      console.error(e);
    } finally {
      setOcr(null);
    }
  };

  const merged = useMemo(() => {
    if (!rows) return null;
    // 탄다를 먼저 넣고 메시지로 덮어써야 우선순위 비교가 자연스럽다
    const incoming = rows
      .filter((r) => r.include)
      .sort((a, b) => (a.source === b.source ? 0 : a.source === 'tanda' ? -1 : 1))
      .map(({ date, start, end, unpaidBreak, source }) => ({ date, start, end, unpaidBreak, source }));
    return mergeShifts(allShifts, incoming, settings.mergePriority);
  }, [rows, allShifts, settings.mergePriority]);

  const counts = merged?.events.reduce<Partial<Record<MergeAction, number>>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="stack">
      <p className="small muted pad">
        탄다와 메시지를 각각 넣으면 하나로 합쳐요. 같은 날 시간이 다르면{' '}
        <b>{SOURCE_LABEL[settings.mergePriority]}</b> 쪽을 우선 적용하고, 다른 버전은 시프트 카드에서 언제든 바꿀 수 있어요.
      </p>

      {(['tanda', 'message'] as const).map((src) => (
        <section className="card" key={src}>
          <div className="card-title">
            <span className={`badge ${src}`}>{SOURCE_LABEL[src]}</span>
            {src === 'tanda' ? '탄다 시프트' : '메시지로 받은 시프트'}
          </div>
          <textarea
            rows={6}
            value={texts[src]}
            placeholder={PLACEHOLDER[src]}
            onChange={(e) => setTexts((t) => ({ ...t, [src]: e.target.value }))}
          />
          <div className="inline between">
            <label className="ghost-btn file">
              <ImageIcon /> 스크린샷에서 읽기
              <input type="file" accept="image/*" multiple hidden onChange={(e) => runOcr(src, e.target.files)} />
            </label>
            {ocr?.source === src && <span className="small muted">이미지 읽는 중… {Math.round(ocr.progress * 100)}%</span>}
            {texts[src] && !ocr && (
              <button className="link" onClick={() => setTexts((t) => ({ ...t, [src]: '' }))}>
                지우기
              </button>
            )}
          </div>
        </section>
      ))}

      <label className="check pad small">
        <input type="checkbox" checked={withKorean} onChange={(e) => setWithKorean(e.target.checked)} />
        스크린샷에 한국어가 있어요 (인식 데이터 추가 다운로드)
      </label>
      {error && <p className="error pad">{error}</p>}

      <button className="primary block" disabled={!texts.tanda.trim() && !texts.message.trim()} onClick={analyze}>
        시프트 분석하기
      </button>

      {rows && (
        <section className="card">
          <div className="card-title">찾은 시프트 {rows.length}개</div>
          {rows.length === 0 && <p className="small muted">시간 범위(예: 9am-3pm, 10:00~16:00)를 찾지 못했어요. 형식을 확인해 주세요.</p>}
          <ul className="preview">
            {rows.map((r) => (
              <li key={r.key} className={r.include ? '' : 'off'}>
                <input type="checkbox" checked={r.include} onChange={(e) => updateRow(r.key, { include: e.target.checked })} aria-label="포함" />
                <span className={`badge ${r.source}`}>{SOURCE_LABEL[r.source]}</span>
                <input
                  type="date"
                  value={r.date}
                  className={r.dateGuessed ? 'warn' : ''}
                  onChange={(e) => e.target.value && updateRow(r.key, { date: e.target.value, dateGuessed: false })}
                />
                <span className="dow">{WEEKDAY_KO[dayOfWeek(r.date)]}</span>
                <TimeInput value={r.start} onChange={(v) => updateRow(r.key, { start: v, end: normalizeRange(v, r.end % 1440)[1] })} />
                <span>–</span>
                <TimeInput value={r.end} onChange={(v) => updateRow(r.key, { end: normalizeRange(r.start, v)[1] })} />
                {r.unpaidBreak !== undefined && <span className="small muted">휴식 {r.unpaidBreak}분</span>}
                <span className="raw" title={r.raw}>
                  {r.raw}
                </span>
              </li>
            ))}
          </ul>
          {rows.some((r) => r.dateGuessed) && <p className="small warn-text">노란색 날짜는 텍스트에서 못 찾아 추측한 거예요. 확인해 주세요.</p>}

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
                      {fmtDateShort(e.shift.date)} · 적용 {fmtTime(e.shift.start)}–{fmtTime(e.shift.end)} ({SOURCE_LABEL[e.shift.source]}) / 보관{' '}
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
                합쳐서 저장하기
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
