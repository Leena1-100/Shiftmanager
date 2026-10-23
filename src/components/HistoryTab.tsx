import type { AppState, WeekMeta } from '../types';
import { summarize } from '../lib/pay';
import { TAX_FREE_THRESHOLD, weeklyWithholding } from '../lib/tax';
import { addDays, fmtDateShort, fmtDuration, fmtMoney, todayISO, weekStartOf } from '../lib/time';
import { CheckIcon } from './Icons';

interface Props {
  state: AppState;
  onUpdateWeek: (week: string, meta: WeekMeta) => void;
  onOpenWeek: (week: string) => void;
}

/** 호주 회계연도 시작일 (7월 1일) */
function fyStart(iso: string): string {
  const y = Number(iso.slice(0, 4));
  return iso.slice(5) >= '07-01' ? `${y}-07-01` : `${y - 1}-07-01`;
}

export default function HistoryTab({ state, onUpdateWeek, onOpenWeek }: Props) {
  const { settings, shifts, weeks: metas } = state;
  const today = todayISO();

  const groups = new Map<string, typeof shifts>();
  for (const s of shifts) {
    const w = weekStartOf(s.date, settings.weekStartDay);
    groups.set(w, [...(groups.get(w) ?? []), s]);
  }
  const weeks = [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([start, list]) => {
      const sum = summarize(list, settings, 'effective');
      const tax = weeklyWithholding(sum.gross, settings.taxMode);
      return { start, sum, tax, net: sum.gross - tax, meta: metas[start] ?? {} };
    });

  const fy = fyStart(today);
  const fyWeeks = weeks.filter((w) => w.start >= fy && w.start <= today);
  const fyGross = fyWeeks.reduce((a, w) => a + w.sum.gross, 0);
  const fyTax = fyWeeks.reduce((a, w) => a + w.tax, 0);
  const monthKey = today.slice(0, 7);
  const monthShifts = shifts.filter((s) => s.date.startsWith(monthKey));
  const month = summarize(monthShifts, settings, 'effective');
  const received = weeks.filter((w) => w.meta.received).reduce((a, w) => a + (w.meta.receivedAmount ?? w.net), 0);

  const recent = weeks.slice(0, 8).reverse();
  const maxBar = Math.max(1, ...recent.map((w) => w.sum.gross));

  return (
    <div className="stack">
      <section className="hero compact">
        <div className="hero-label">이번 회계연도 누적 ({fmtDateShort(fy)}~) 세전</div>
        <div className="hero-amount">{fmtMoney(fyGross)}</div>
        <div className="hero-rows">
          <div>
            <span>예상 원천징수 합계</span>
            <b>-{fmtMoney(fyTax)}</b>
          </div>
          <div>
            <span>입금 확인된 금액</span>
            <b>{fmtMoney(received)}</b>
          </div>
        </div>
        {settings.taxMode === 'resident-tft' && (
          <>
            <div className="meter light" aria-hidden="true">
              <div style={{ width: `${Math.min(100, (fyGross / TAX_FREE_THRESHOLD) * 100)}%` }} />
            </div>
            <div className="hero-note">
              연 면세 한도 {fmtMoney(TAX_FREE_THRESHOLD)} 중 {Math.round((fyGross / TAX_FREE_THRESHOLD) * 100)}% — 한도 이하면 택스 리턴 때 낸 세금을 돌려받을 수 있어요
            </div>
          </>
        )}
      </section>

      <section className="stats">
        <div className="stat">
          <span>{Number(monthKey.slice(5))}월 수입</span>
          <b>{fmtMoney(month.gross)}</b>
        </div>
        <div className="stat">
          <span>{Number(monthKey.slice(5))}월 근무</span>
          <b>{fmtDuration(month.workedMinutes)}</b>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="card">
          <div className="card-title">최근 주급 (세전)</div>
          <div className="bars" role="img" aria-label="최근 주별 세전 수입">
            {recent.map((w) => (
              <div className="bar-col" key={w.start} title={`${fmtDateShort(w.start)} ${fmtMoney(w.sum.gross)}`}>
                <span className="bar-val">${Math.round(w.sum.gross)}</span>
                <div className="bar" style={{ height: `${(w.sum.gross / maxBar) * 100}%` }} />
                <span className="bar-label">{fmtDateShort(w.start)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="section-head">
        <h2>주별 기록</h2>
      </div>
      {weeks.length === 0 && <div className="empty"><p>아직 기록이 없어요</p></div>}
      <div className="stack-sm">
        {weeks.map((w) => {
          const diff = w.meta.receivedAmount !== undefined ? w.meta.receivedAmount - w.net : null;
          return (
            <article className="week-card" key={w.start}>
              <button className="week-head" onClick={() => onOpenWeek(w.start)}>
                <span>
                  <b>
                    {fmtDateShort(w.start)} – {fmtDateShort(addDays(w.start, 6))}
                  </b>
                  <span className="muted small">
                    {' '}
                    · {w.sum.shifts}시프트 · {fmtDuration(w.sum.workedMinutes)}
                  </span>
                </span>
                <b>{fmtMoney(w.sum.gross)}</b>
              </button>
              <div className="week-body">
                <span className="small muted">
                  예상 실수령 {fmtMoney(w.net)}
                  {w.sum.actualCount < w.sum.shifts && ` · 실제 기록 ${w.sum.actualCount}/${w.sum.shifts}`}
                </span>
                <div className="inline">
                  <button
                    className={w.meta.received ? 'chip on' : 'chip'}
                    onClick={() => onUpdateWeek(w.start, { received: !w.meta.received })}
                  >
                    {w.meta.received && <CheckIcon size={14} />} {w.meta.received ? '입금 완료' : '입금 대기'}
                  </button>
                  <input
                    className="num wide"
                    inputMode="decimal"
                    placeholder="실제 입금액"
                    value={w.meta.receivedAmount ?? ''}
                    onChange={(e) =>
                      onUpdateWeek(w.start, {
                        receivedAmount: e.target.value === '' ? undefined : Number(e.target.value) || 0,
                        received: e.target.value === '' ? w.meta.received : true,
                      })
                    }
                  />
                </div>
                {diff !== null && Math.abs(diff) >= 0.01 && (
                  <span className={`small ${diff > 0 ? 'up' : 'down'}`}>
                    예상보다 {diff > 0 ? '+' : ''}
                    {fmtMoney(diff)} — 페이슬립 확인해 보세요
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
