import { useState } from 'react';
import type { Band, Settings, Shift, Source } from '../types';
import { calcShift, summarize } from '../lib/pay';
import { swapAlt } from '../lib/merge';
import { taxFreeRoom, weeklyWithholding, WEEKLY_TAX_FREE } from '../lib/tax';
import { BAND_LABEL } from '../lib/defaults';
import { WEEKDAY_KO, dayOfWeek, fmtDateShort, fmtDuration, fmtMoney, fmtTime } from '../lib/time';
import { PlusIcon, SwapIcon, ClockIcon, CheckIcon } from './Icons';

export const SOURCE_LABEL: Record<Source, string> = { tanda: '탄다', message: '메시지', manual: '직접' };

interface Props {
  settings: Settings;
  shifts: Shift[];
  weekStart: string;
  onEdit: (s: Shift) => void;
  onAdd: () => void;
  onSave: (s: Shift) => void;
  onGoImport: () => void;
}

export default function HomeTab({ settings, shifts, onEdit, onAdd, onSave, onGoImport }: Props) {
  const [mode, setMode] = useState<'planned' | 'effective'>('effective');
  const planned = summarize(shifts, settings, 'planned');
  const effective = summarize(shifts, settings, 'effective');
  const sum = mode === 'planned' ? planned : effective;
  const tax = weeklyWithholding(sum.gross, settings.taxMode);
  const net = sum.gross - tax;
  const room = taxFreeRoom(sum.gross, settings.taxMode);
  const diff = effective.gross - planned.gross;
  const superAmt = sum.gross * settings.superRate;

  return (
    <div className="stack">
      <section className="hero">
        <div className="seg" role="tablist">
          <button className={mode === 'effective' ? 'on' : ''} onClick={() => setMode('effective')}>
            실제 반영
          </button>
          <button className={mode === 'planned' ? 'on' : ''} onClick={() => setMode('planned')}>
            시프트 예정
          </button>
        </div>
        <div className="hero-label">이번 주 받을 돈 (세전)</div>
        <div className="hero-amount">{fmtMoney(sum.gross)}</div>
        <div className="hero-rows">
          <div>
            <span>예상 세금 (PAYG)</span>
            <b>-{fmtMoney(tax)}</b>
          </div>
          <div>
            <span>예상 실수령</span>
            <b>{fmtMoney(net)}</b>
          </div>
        </div>
        {mode === 'effective' && effective.actualCount > 0 && diff !== 0 && (
          <div className="hero-note">
            예정보다 {diff > 0 ? '+' : ''}
            {fmtMoney(diff)} ({diff > 0 ? '+' : ''}
            {fmtDuration(effective.workedMinutes - planned.workedMinutes)})
          </div>
        )}
      </section>

      <section className="stats">
        <Stat label="유급 근무" value={fmtDuration(sum.workedMinutes)} />
        <Stat label="유급 휴식" value={`${sum.paidBreak}분`} />
        <Stat label="무급 휴식" value={`${sum.unpaidBreak}분`} />
        <Stat label="실제 기록" value={`${effective.actualCount}/${shifts.length}`} />
      </section>

      {room !== null && (
        <section className="card">
          <div className="card-title">
            세금 0원 구간 <span className="muted">주 {fmtMoney(WEEKLY_TAX_FREE)}까지</span>
          </div>
          <div className="meter" aria-hidden="true">
            <div style={{ width: `${Math.min(100, (sum.gross / WEEKLY_TAX_FREE) * 100)}%` }} />
          </div>
          {room > 0 ? (
            <p className="small">
              {fmtMoney(room)} 더 벌 때까지 세금 없음 · 평일 기준 약{' '}
              <b>{fmtDuration((room / (settings.baseRate * settings.multipliers.weekday)) * 60)}</b> 더 일할 수 있어요
            </p>
          ) : (
            <p className="small">
              면세 구간을 {fmtMoney(sum.gross - WEEKLY_TAX_FREE)} 넘었어요. 초과분부터 세금이 붙어요.
            </p>
          )}
        </section>
      )}
      {settings.taxMode === 'whm' && (
        <p className="small muted pad">워킹홀리데이는 면세 구간 없이 첫 달러부터 15%가 적용돼요.</p>
      )}

      <div className="section-head">
        <h2>시프트</h2>
        <button className="ghost-btn" onClick={onAdd}>
          <PlusIcon size={16} /> 직접 추가
        </button>
      </div>

      {shifts.length === 0 ? (
        <div className="empty">
          <p>이번 주 시프트가 아직 없어요</p>
          <button className="primary" onClick={onGoImport}>
            탄다 / 메시지에서 가져오기
          </button>
        </div>
      ) : (
        <div className="stack-sm">
          {shifts.map((s) => (
            <ShiftCard key={s.id} shift={s} settings={settings} onEdit={() => onEdit(s)} onSwap={() => onSave(swapAlt(s))} />
          ))}
        </div>
      )}

      {sum.gross > 0 && (
        <section className="card">
          <div className="card-title">수당 구간별</div>
          <ul className="breakdown">
            {(Object.entries(sum.minutesByBand) as [Band, number][]).map(([band, mins]) => (
              <li key={band}>
                <span>
                  {BAND_LABEL[band]} <span className="muted">×{settings.multipliers[band]}</span>
                </span>
                <span>{fmtDuration(mins)}</span>
                <b>{fmtMoney((mins * settings.baseRate * settings.multipliers[band]) / 60)}</b>
              </li>
            ))}
          </ul>
          <p className="small muted">
            시급 {fmtMoney(settings.baseRate)} 기준 · 슈퍼(회사 별도 적립) 약 {fmtMoney(superAmt)}
          </p>
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

function ShiftCard({ shift, settings, onEdit, onSwap }: { shift: Shift; settings: Settings; onEdit: () => void; onSwap: () => void }) {
  const plan = calcShift(shift, settings, 'planned');
  const eff = calcShift(shift, settings, 'effective');
  const dow = dayOfWeek(shift.date);
  const weekend = dow === 0 || dow === 6;

  return (
    <article className="shift" onClick={onEdit} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onEdit()}>
      <div className={`shift-day${weekend ? ' weekend' : ''}${shift.publicHoliday ? ' ph' : ''}`}>
        <b>{WEEKDAY_KO[dow]}</b>
        <span>{fmtDateShort(shift.date)}</span>
      </div>
      <div className="shift-body">
        <div className="shift-time">
          {fmtTime(shift.start)} – {fmtTime(shift.end)}
          {shift.end >= 1440 && <span className="muted small"> (+1일)</span>}
        </div>
        <div className="shift-meta">
          {shift.sources.map((src) => (
            <span key={src} className={`badge ${src}`}>
              {SOURCE_LABEL[src]}
            </span>
          ))}
          {shift.publicHoliday && <span className="badge ph">공휴일</span>}
          <span className="muted">
            유급휴식 {plan.paidBreak}분 · 무급 {plan.unpaidBreak}분
          </span>
        </div>
        {shift.actual ? (
          <div className="shift-actual">
            <CheckIcon size={14} /> 실제 {fmtTime(shift.actual.start)}–{fmtTime(shift.actual.end)} · 무급 {shift.actual.unpaidBreak}분 ·{' '}
            {fmtDuration(eff.workedMinutes)}
            {eff.workedMinutes !== plan.workedMinutes && (
              <span className={eff.workedMinutes > plan.workedMinutes ? 'up' : 'down'}>
                {' '}
                ({eff.workedMinutes > plan.workedMinutes ? '+' : ''}
                {eff.workedMinutes - plan.workedMinutes}분)
              </span>
            )}
          </div>
        ) : (
          <div className="shift-todo">
            <ClockIcon size={14} /> 일하고 와서 실제 시간 입력하기
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
            <SwapIcon size={14} /> {SOURCE_LABEL[shift.alt.source]} 버전 {fmtTime(shift.alt.start)}–{fmtTime(shift.alt.end)}으로 바꾸기
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
