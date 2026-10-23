import { useEffect, useState } from 'react';
import type { AwardId, Band, BreakTier, Employment, JuniorAge, Workplace } from '../types';
import {
  AWARDS,
  EMPLOYMENT_LABEL,
  JUNIOR_AGE_LABEL,
  PAY_GUIDES_URL,
  WORKPLACE_COLORS,
  applyAward,
  awardMinimumRate,
  bandLabel,
} from '../lib/defaults';
import { fmtDuration, fmtMoney, fmtTime, parseHHMM } from '../lib/time';

interface Props {
  value: Workplace;
  onChange: (wp: Workplace) => void;
}

const numOr = (v: string, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function workplaceIsValid(wp: Workplace): boolean {
  return wp.name.trim().length > 0 && wp.baseRate > 0;
}

export default function WorkplaceForm({ value: wp, onChange }: Props) {
  const set = (patch: Partial<Workplace>) => onChange({ ...wp, ...patch });
  const preset = AWARDS[wp.award];
  const awardRate = awardMinimumRate(wp);
  const [rateText, setRateText] = useState(wp.baseRate ? String(wp.baseRate) : '');
  // Keep the text box in step when the rate is filled in from the award
  useEffect(() => {
    setRateText((t) => (Number(t) === wp.baseRate ? t : wp.baseRate ? String(wp.baseRate) : ''));
  }, [wp.baseRate]);
  const setTier = (i: number, patch: Partial<BreakTier>) =>
    set({ breakTiers: wp.breakTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div className="stack-sm">
      <label className="field">
        <span>Workplace name</span>
        <input value={wp.name} placeholder="e.g. McDonald's Bondi" onChange={(e) => set({ name: e.target.value })} />
      </label>

      <div className="field">
        <span>Colour</span>
        <div className="swatches">
          {WORKPLACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={wp.color === c ? 'swatch on' : 'swatch'}
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={wp.color === c}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>
      </div>

      <label className="field">
        <span>Award / agreement</span>
        <select value={wp.award} onChange={(e) => onChange(applyAward(wp, { award: e.target.value as AwardId }))}>
          {Object.values(AWARDS).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {wp.award === 'custom' && (
        <label className="field">
          <span>Award or agreement name</span>
          <input value={wp.awardName ?? ''} placeholder="e.g. Hospitality Award, store EA" onChange={(e) => set({ awardName: e.target.value })} />
        </label>
      )}

      <label className="field">
        <span>Classification level</span>
        {preset.levels.length > 0 ? (
          <select value={wp.level} onChange={(e) => onChange(applyAward(wp, { level: e.target.value }))}>
            {preset.levels.map((l) => (
              <option key={l.name} value={l.name}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <input value={wp.level} placeholder="e.g. Level 2, Grade 1" onChange={(e) => set({ level: e.target.value })} />
        )}
      </label>

      {preset.juniorPercent && (
        <label className="field">
          <span>Your age (junior rates apply under 21)</span>
          <select value={wp.age ?? 'adult'} onChange={(e) => onChange(applyAward(wp, { age: e.target.value as JuniorAge }))}>
            {(Object.keys(JUNIOR_AGE_LABEL) as JuniorAge[]).map((age) => (
              <option key={age} value={age}>
                {JUNIOR_AGE_LABEL[age]}
                {age !== 'adult' && ` (${preset.juniorPercent![age as Exclude<JuniorAge, 'adult'>]}% of adult rate)`}
              </option>
            ))}
          </select>
          {(wp.age === '18' || wp.age === '19' || wp.age === '20') && (
            <span className="small muted plain">
              Junior rates for ages 18–20 are being phased out in steps from 1 December 2026. Check your payslip.
            </span>
          )}
        </label>
      )}

      <div className="field">
        <span>Employment type</span>
        <div className="seg small">
          {(['parttime', 'casual', 'fulltime'] as Employment[]).map((e) => (
            <button key={e} type="button" className={wp.employment === e ? 'on' : ''} onClick={() => onChange(applyAward(wp, { employment: e }))}>
              {EMPLOYMENT_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Hourly pay rate (before tax)</span>
        <div className="money-input">
          <span>$</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={rateText}
            onChange={(e) => {
              setRateText(e.target.value);
              set({ baseRate: Math.max(0, numOr(e.target.value, 0)) });
            }}
          />
          <span className="muted">/ hour</span>
        </div>
      </label>
      {awardRate !== null ? (
        <div className="award-rate">
          <p className="small">
            Award minimum for {wp.level}
            {wp.age && wp.age !== 'adult' ? ` (age ${JUNIOR_AGE_LABEL[wp.age].toLowerCase()})` : ''}: <b>{fmtMoney(awardRate)}/h</b>
            {wp.employment === 'casual' && <> · with 25% casual loading {fmtMoney(awardRate * 1.25)}/h</>}
            <span className="muted"> · from {preset.ratesFrom}</span>
          </p>
          {Math.abs(wp.baseRate - awardRate) >= 0.005 ? (
            <p className="small">
              {wp.baseRate > awardRate ? 'Your rate is above the award minimum. ' : 'Your rate is below the award minimum. '}
              <button type="button" className="link" onClick={() => set({ baseRate: awardRate })}>
                Use award rate
              </button>
            </p>
          ) : (
            <p className="small muted">Filled in from the award. Change it if your payslip shows a higher rate.</p>
          )}
          <p className="small muted">
            Check against the official{' '}
            <a href={PAY_GUIDES_URL} target="_blank" rel="noreferrer">
              Fair Work pay guide
            </a>
            .
          </p>
        </div>
      ) : (
        <p className="small muted">Enter the ordinary hourly rate from your payslip or agreement.</p>
      )}
      {wp.employment === 'casual' && (
        <p className="small muted">For casuals the rate above excludes the 25% loading. The loading is built into the casual penalty rates.</p>
      )}

      <details className="advanced">
        <summary>Penalty rates &amp; breaks</summary>
        <div className="stack-sm">
          <ul className="mult-list">
            {(Object.keys(wp.multipliers) as Band[]).map((b) => (
              <li key={b}>
                <span>{bandLabel(b, wp)}</span>
                <input
                  className="num"
                  inputMode="decimal"
                  value={wp.multipliers[b]}
                  onChange={(e) => set({ multipliers: { ...wp.multipliers, [b]: numOr(e.target.value, wp.multipliers[b]) } })}
                />
                <span className="muted small">{Math.round(wp.multipliers[b] * 100)}%</span>
              </li>
            ))}
          </ul>
          <div className="row2">
            <label className="field">
              <span>Evening rate from</span>
              <input type="time" value={fmtTime(wp.eveningStart)} onChange={(e) => set({ eveningStart: parseHHMM(e.target.value) ?? wp.eveningStart })} />
            </label>
            <label className="field">
              <span>Overnight rate until</span>
              <input type="time" value={fmtTime(wp.nightEnd)} onChange={(e) => set({ nightEnd: parseHHMM(e.target.value) ?? wp.nightEnd })} />
            </label>
          </div>
          <p className="small muted">Evening and overnight rates apply Monday–Friday. Set "until" to 00:00 to turn the overnight rate off.</p>

          <label className="field">
            <span>Minimum paid time per shift (minutes, 0 = off)</span>
            <input
              inputMode="numeric"
              value={wp.minEngagementMinutes}
              onChange={(e) => set({ minEngagementMinutes: Math.max(0, Math.round(numOr(e.target.value, 0))) })}
            />
          </label>

          <div className="field">
            <span>Breaks by shift length (only unpaid breaks are deducted)</span>
            <ul className="tier-list">
              {wp.breakTiers.map((t, i) => (
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
                  <button type="button" className="link" onClick={() => set({ breakTiers: wp.breakTiers.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="inline">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => set({ breakTiers: [...wp.breakTiers, { minMinutes: 600, paidCount: 0, paidLength: 10, unpaidMinutes: 0 }] })}
              >
                Add tier
              </button>
              <button type="button" className="link" onClick={() => onChange({ ...applyAward({ ...wp, breakTiers: [] }), baseRate: wp.baseRate })}>
                Reset to award defaults
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
