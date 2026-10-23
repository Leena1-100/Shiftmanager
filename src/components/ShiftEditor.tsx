import { useState } from 'react';
import type { Settings, Shift } from '../types';
import { breaksFor, calcShift } from '../lib/pay';
import { newId } from '../lib/merge';
import { fmtDateKo, fmtDuration, fmtMoney, fmtTime, normalizeRange, parseHHMM } from '../lib/time';

interface Props {
  shift: Shift | null;
  defaultDate: string;
  settings: Settings;
  onClose: () => void;
  onSave: (s: Shift) => void;
  onDelete: (id: string) => void;
}

const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

export default function ShiftEditor({ shift, defaultDate, settings, onClose, onSave, onDelete }: Props) {
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

  const ps = parseHHMM(start);
  const pe = parseHHMM(end);
  const valid = ps !== null && pe !== null && !!date;
  const [s0, e0] = valid ? normalizeRange(ps, pe) : [0, 0];
  const rule = breaksFor(e0 - s0, settings.breakTiers);

  const as = parseHHMM(aStart);
  const ae = parseHHMM(aEnd);
  const actualValid = !hasActual || (as !== null && ae !== null);

  const build = (): Shift | null => {
    if (!valid || !actualValid) return null;
    let actual: Shift['actual'];
    if (hasActual) {
      const [a1, a2] = normalizeRange(as!, ae!);
      const aRule = breaksFor(a2 - a1, settings.breakTiers);
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
      unpaidBreak: breakAuto ? undefined : num(unpaid),
      publicHoliday: ph || undefined,
      note: note.trim() || undefined,
      actual,
      alt: shift?.alt,
    };
  };

  const draft = build();
  const planCalc = draft && calcShift(draft, settings, 'planned');
  const effCalc = draft && calcShift(draft, settings, 'effective');
  const aSpan = as !== null && ae !== null ? normalizeRange(as, ae) : null;
  const aRule = aSpan ? breaksFor(aSpan[1] - aSpan[0], settings.breakTiers) : null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-grip" />
        <h3>{shift ? fmtDateKo(shift.date) : '시프트 추가'}</h3>

        <div className="group">
          <div className="group-title">시프트 (예정)</div>
          <label className="field">
            <span>날짜</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="row2">
            <label className="field">
              <span>시작</span>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>종료</span>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <div className="field">
            <span>무급 휴식</span>
            <div className="inline">
              <label className="check">
                <input type="checkbox" checked={breakAuto} onChange={(e) => setBreakAuto(e.target.checked)} />
                자동 ({rule.unpaidMinutes}분)
              </label>
              {!breakAuto && (
                <input className="num" inputMode="numeric" value={unpaid} onChange={(e) => setUnpaid(e.target.value)} aria-label="무급 휴식(분)" />
              )}
              {!breakAuto && <span className="muted">분</span>}
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={ph} onChange={(e) => setPh(e.target.checked)} />
            공휴일 (Public holiday)
          </label>
          <label className="field">
            <span>메모</span>
            <input value={note} placeholder="예: 매니저 Sam 요청" onChange={(e) => setNote(e.target.value)} />
          </label>
          {planCalc && (
            <p className="calc-line">
              {fmtDuration(planCalc.workedMinutes)} 유급 · 유급휴식 {planCalc.paidBreak}분 · <b>{fmtMoney(planCalc.pay)}</b>
            </p>
          )}
        </div>

        <div className="group mint">
          <div className="group-title">
            실제 근무 (분 단위)
            <label className="switch">
              <input type="checkbox" checked={hasActual} onChange={(e) => setHasActual(e.target.checked)} />
              <span />
            </label>
          </div>
          {hasActual ? (
            <>
              <div className="row2">
                <label className="field">
                  <span>출근 (Clock in)</span>
                  <input type="time" value={aStart} onChange={(e) => setAStart(e.target.value)} />
                </label>
                <label className="field">
                  <span>퇴근 (Clock out)</span>
                  <input type="time" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
                </label>
              </div>
              <div className="row2">
                <label className="field">
                  <span>무급 휴식(분)</span>
                  <input inputMode="numeric" placeholder={`자동 ${aRule?.unpaidMinutes ?? 0}`} value={aUnpaid} onChange={(e) => setAUnpaid(e.target.value)} />
                </label>
                <label className="field">
                  <span>유급 휴식(분)</span>
                  <input inputMode="numeric" placeholder={`자동 ${aRule?.paidMinutes ?? 0}`} value={aPaid} onChange={(e) => setAPaid(e.target.value)} />
                </label>
              </div>
              {effCalc && planCalc && (
                <p className="calc-line">
                  실제 {fmtDuration(effCalc.workedMinutes)} · <b>{fmtMoney(effCalc.pay)}</b>
                  {effCalc.pay !== planCalc.pay && (
                    <span className={effCalc.pay > planCalc.pay ? 'up' : 'down'}>
                      {' '}
                      ({effCalc.pay > planCalc.pay ? '+' : ''}
                      {fmtMoney(effCalc.pay - planCalc.pay)})
                    </span>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="small muted">일 끝나고 탄다 타임시트의 출퇴근/휴식 시간을 분 단위로 입력하면 금액이 다시 계산돼요.</p>
          )}
        </div>

        <div className="sheet-actions">
          {shift && (
            <button className="danger" onClick={() => confirm('이 시프트를 삭제할까요?') && onDelete(shift.id)}>
              삭제
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            취소
          </button>
          <button className="primary" disabled={!draft} onClick={() => draft && onSave(draft)}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
