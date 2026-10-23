import type { AppState, Band, BreakTier, Employment, Settings, TaxMode } from '../types';
import { BAND_LABEL, DEFAULT_BREAK_TIERS, DEFAULT_MULTIPLIERS } from '../lib/defaults';
import { TAX_MODE_LABEL } from '../lib/tax';
import { emptyState, reviveState } from '../lib/storage';
import { WEEKDAY_KO, fmtDuration, todayISO } from '../lib/time';
import { SOURCE_LABEL } from './HomeTab';

interface Props {
  state: AppState;
  onUpdate: (patch: Partial<Settings>) => void;
  onReplaceState: (s: AppState) => void;
}

const numOr = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export default function SettingsTab({ state, onUpdate, onReplaceState }: Props) {
  const { settings } = state;

  const setTier = (i: number, patch: Partial<BreakTier>) =>
    onUpdate({ breakTiers: settings.breakTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `shiftmoney-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = reviveState(JSON.parse(await file.text()));
      if (confirm(`시프트 ${next.shifts.length}개가 있는 백업으로 바꿀까요? 현재 데이터는 덮어써져요.`)) onReplaceState(next);
    } catch {
      alert('백업 파일을 읽지 못했어요.');
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title">급여</div>
        <label className="field">
          <span>기본 시급 (세전, $/시간)</span>
          <input
            inputMode="decimal"
            defaultValue={settings.baseRate}
            onChange={(e) => onUpdate({ baseRate: numOr(e.target.value, settings.baseRate) })}
          />
        </label>
        <p className="small muted">페이슬립의 Ordinary hours 시급을 넣으세요. 주니어 시급이면 그 금액 그대로 넣으면 돼요.</p>
        <div className="field">
          <span>고용 형태</span>
          <div className="seg small">
            {(['parttime', 'casual'] as Employment[]).map((e) => (
              <button
                key={e}
                className={settings.employment === e ? 'on' : ''}
                onClick={() => onUpdate({ employment: e, multipliers: { ...DEFAULT_MULTIPLIERS[e] } })}
              >
                {e === 'parttime' ? '파트타임' : '캐주얼'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>수당 배율 (Penalty rates)</span>
          <ul className="mult-list">
            {(Object.keys(BAND_LABEL) as Band[]).map((b) => (
              <li key={b}>
                <span>{BAND_LABEL[b]}</span>
                <input
                  className="num"
                  inputMode="decimal"
                  value={settings.multipliers[b]}
                  onChange={(e) =>
                    onUpdate({ multipliers: { ...settings.multipliers, [b]: numOr(e.target.value, settings.multipliers[b]) } })
                  }
                />
                <span className="muted small">{Math.round(settings.multipliers[b] * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="small muted">기본값: Fast Food Industry Award 2010. 매장 계약(EA)이 다르면 페이슬립에 맞게 바꿔주세요.</p>
        </div>
        <label className="field">
          <span>최소 근무시간 보장 (분, 0 = 사용 안 함)</span>
          <input
            inputMode="numeric"
            value={settings.minEngagementMinutes}
            onChange={(e) => onUpdate({ minEngagementMinutes: Math.max(0, Math.round(numOr(e.target.value, 0))) })}
          />
        </label>
      </section>

      <section className="card">
        <div className="card-title">휴식 규칙</div>
        <p className="small muted">시프트 길이에 따라 자동으로 유급/무급 휴식을 계산해요. 무급 휴식만 급여에서 빠져요.</p>
        <ul className="tier-list">
          {settings.breakTiers.map((t, i) => (
            <li key={i}>
              <label>
                <input className="num" inputMode="numeric" value={t.minMinutes} onChange={(e) => setTier(i, { minMinutes: Math.round(numOr(e.target.value, t.minMinutes)) })} />
                <span className="small muted">분({fmtDuration(t.minMinutes)}) 이상</span>
              </label>
              <label>
                유급
                <input className="num xs" inputMode="numeric" value={t.paidCount} onChange={(e) => setTier(i, { paidCount: Math.round(numOr(e.target.value, t.paidCount)) })} />
                ×
                <input className="num xs" inputMode="numeric" value={t.paidLength} onChange={(e) => setTier(i, { paidLength: Math.round(numOr(e.target.value, t.paidLength)) })} />분
              </label>
              <label>
                무급
                <input className="num xs" inputMode="numeric" value={t.unpaidMinutes} onChange={(e) => setTier(i, { unpaidMinutes: Math.round(numOr(e.target.value, t.unpaidMinutes)) })} />분
              </label>
              <button className="link" onClick={() => onUpdate({ breakTiers: settings.breakTiers.filter((_, j) => j !== i) })}>
                삭제
              </button>
            </li>
          ))}
        </ul>
        <div className="inline">
          <button
            className="ghost-btn"
            onClick={() => onUpdate({ breakTiers: [...settings.breakTiers, { minMinutes: 600, paidCount: 0, paidLength: 10, unpaidMinutes: 0 }] })}
          >
            구간 추가
          </button>
          <button className="link" onClick={() => onUpdate({ breakTiers: DEFAULT_BREAK_TIERS.map((t) => ({ ...t })) })}>
            기본값으로
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-title">세금</div>
        <div className="radio-list">
          {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => (
            <label key={m} className="check">
              <input type="radio" name="tax" checked={settings.taxMode === m} onChange={() => onUpdate({ taxMode: m })} />
              {TAX_MODE_LABEL[m]}
            </label>
          ))}
        </div>
        <label className="field">
          <span>슈퍼애뉴에이션 (%)</span>
          <input
            inputMode="decimal"
            defaultValue={settings.superRate * 100}
            onChange={(e) => onUpdate({ superRate: numOr(e.target.value, settings.superRate * 100) / 100 })}
          />
        </label>
        <p className="small muted">세금은 2026–27 세율로 계산한 추정치예요. 실제 원천징수와 몇 달러 차이 날 수 있어요.</p>
      </section>

      <section className="card">
        <div className="card-title">주 / 시프트 합치기</div>
        <div className="field">
          <span>급여 주 시작 요일</span>
          <div className="seg small">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} className={settings.weekStartDay === d ? 'on' : ''} onClick={() => onUpdate({ weekStartDay: d })}>
                {WEEKDAY_KO[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>같은 날 시간이 다를 때 우선</span>
          <div className="seg small">
            {(['message', 'tanda'] as const).map((p) => (
              <button key={p} className={settings.mergePriority === p ? 'on' : ''} onClick={() => onUpdate({ mergePriority: p })}>
                {SOURCE_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-title">데이터</div>
        <p className="small muted">데이터는 이 기기 브라우저에만 저장돼요. 폰을 바꾸기 전엔 백업하세요.</p>
        <div className="inline wrap">
          <button className="ghost-btn" onClick={exportData}>
            백업 파일 저장
          </button>
          <label className="ghost-btn file">
            백업 불러오기
            <input type="file" accept="application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          </label>
          <button className="link danger-text" onClick={() => confirm('모든 시프트와 설정을 지울까요?') && onReplaceState(emptyState())}>
            전체 초기화
          </button>
        </div>
      </section>
    </div>
  );
}
