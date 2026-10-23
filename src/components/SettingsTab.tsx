import type { AppState, Band, BreakTier, Employment, Settings, TaxMode } from '../types';
import { BAND_LABEL, DEFAULT_BREAK_TIERS, DEFAULT_MULTIPLIERS } from '../lib/defaults';
import { TAX_MODE_LABEL } from '../lib/tax';
import { emptyState, reviveState } from '../lib/storage';
import { WEEKDAY_SHORT, fmtDuration, todayISO } from '../lib/time';
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
      if (confirm(`Restore this backup with ${next.shifts.length} shifts? Your current data will be overwritten.`)) onReplaceState(next);
    } catch {
      alert("Couldn't read the backup file.");
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title">Pay</div>
        <label className="field">
          <span>Base hourly rate (before tax, $/h)</span>
          <input
            inputMode="decimal"
            defaultValue={settings.baseRate}
            onChange={(e) => onUpdate({ baseRate: numOr(e.target.value, settings.baseRate) })}
          />
        </label>
        <p className="small muted">Use the Ordinary hours rate from your payslip. If you're on a junior rate, enter that amount.</p>
        <div className="field">
          <span>Employment type</span>
          <div className="seg small">
            {(['parttime', 'casual'] as Employment[]).map((e) => (
              <button
                key={e}
                className={settings.employment === e ? 'on' : ''}
                onClick={() => onUpdate({ employment: e, multipliers: { ...DEFAULT_MULTIPLIERS[e] } })}
              >
                {e === 'parttime' ? 'Part-time' : 'Casual'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Penalty rates (multiplier)</span>
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
          <p className="small muted">Defaults follow the Fast Food Industry Award 2010. If your store uses a different agreement, match your payslip.</p>
        </div>
        <label className="field">
          <span>Minimum engagement (minutes, 0 = off)</span>
          <input
            inputMode="numeric"
            value={settings.minEngagementMinutes}
            onChange={(e) => onUpdate({ minEngagementMinutes: Math.max(0, Math.round(numOr(e.target.value, 0))) })}
          />
        </label>
      </section>

      <section className="card">
        <div className="card-title">Break rules</div>
        <p className="small muted">Paid and unpaid breaks are worked out from the shift length. Only unpaid breaks are deducted from pay.</p>
        <ul className="tier-list">
          {settings.breakTiers.map((t, i) => (
            <li key={i}>
              <label>
                <input className="num" inputMode="numeric" value={t.minMinutes} onChange={(e) => setTier(i, { minMinutes: Math.round(numOr(e.target.value, t.minMinutes)) })} />
                <span className="small muted">min ({fmtDuration(t.minMinutes)}) or longer</span>
              </label>
              <label>
                Paid
                <input className="num xs" inputMode="numeric" value={t.paidCount} onChange={(e) => setTier(i, { paidCount: Math.round(numOr(e.target.value, t.paidCount)) })} />
                ×
                <input className="num xs" inputMode="numeric" value={t.paidLength} onChange={(e) => setTier(i, { paidLength: Math.round(numOr(e.target.value, t.paidLength)) })} />m
              </label>
              <label>
                Unpaid
                <input className="num xs" inputMode="numeric" value={t.unpaidMinutes} onChange={(e) => setTier(i, { unpaidMinutes: Math.round(numOr(e.target.value, t.unpaidMinutes)) })} />m
              </label>
              <button className="link" onClick={() => onUpdate({ breakTiers: settings.breakTiers.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="inline">
          <button
            className="ghost-btn"
            onClick={() => onUpdate({ breakTiers: [...settings.breakTiers, { minMinutes: 600, paidCount: 0, paidLength: 10, unpaidMinutes: 0 }] })}
          >
            Add tier
          </button>
          <button className="link" onClick={() => onUpdate({ breakTiers: DEFAULT_BREAK_TIERS.map((t) => ({ ...t })) })}>
            Reset to defaults
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-title">Tax</div>
        <div className="radio-list">
          {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => (
            <label key={m} className="check">
              <input type="radio" name="tax" checked={settings.taxMode === m} onChange={() => onUpdate({ taxMode: m })} />
              {TAX_MODE_LABEL[m]}
            </label>
          ))}
        </div>
        <label className="field">
          <span>Superannuation (%)</span>
          <input
            inputMode="decimal"
            defaultValue={settings.superRate * 100}
            onChange={(e) => onUpdate({ superRate: numOr(e.target.value, settings.superRate * 100) / 100 })}
          />
        </label>
        <p className="small muted">Tax is an estimate using 2026–27 rates and may differ from actual withholding by a few dollars.</p>
      </section>

      <section className="card">
        <div className="card-title">Pay week &amp; merging</div>
        <div className="field">
          <span>Pay week starts on</span>
          <div className="seg small">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <button key={d} className={settings.weekStartDay === d ? 'on' : ''} onClick={() => onUpdate({ weekStartDay: d })}>
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>When times differ on the same day, prefer</span>
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
        <div className="card-title">Data</div>
        <p className="small muted">Data is stored only in this device's browser. Back it up before switching phones.</p>
        <div className="inline wrap">
          <button className="ghost-btn" onClick={exportData}>
            Save backup
          </button>
          <label className="ghost-btn file">
            Restore backup
            <input type="file" accept="application/json" hidden onChange={(e) => importData(e.target.files?.[0])} />
          </label>
          <button className="link danger-text" onClick={() => confirm('Delete all shifts and settings?') && onReplaceState(emptyState())}>
            Reset everything
          </button>
        </div>
      </section>
    </div>
  );
}
