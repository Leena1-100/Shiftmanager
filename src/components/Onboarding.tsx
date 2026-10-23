import { useState } from 'react';
import type { Settings, TaxMode, Workplace } from '../types';
import { EMPLOYMENT_LABEL, awardLabel, newWorkplace } from '../lib/defaults';
import { TAX_MODE_LABEL } from '../lib/tax';
import { WEEKDAY_SHORT, fmtMoney } from '../lib/time';
import WorkplaceForm, { workplaceIsValid } from './WorkplaceForm';
import { PlusIcon } from './Icons';

interface Props {
  settings: Settings;
  onFinish: (workplaces: Workplace[], settings: Partial<Settings>) => void;
}

type Step = 'welcome' | 'workplace' | 'list' | 'personal';

export default function Onboarding({ settings, onFinish }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [draft, setDraft] = useState<Workplace>(() => newWorkplace(0));
  const [taxMode, setTaxMode] = useState<TaxMode>(settings.taxMode);
  const [weekStartDay, setWeekStartDay] = useState(settings.weekStartDay);

  const stepIndex = { welcome: 0, workplace: 1, list: 1, personal: 2 }[step];

  const saveDraft = () => {
    setWorkplaces((ws) => (ws.some((w) => w.id === draft.id) ? ws.map((w) => (w.id === draft.id ? draft : w)) : [...ws, draft]));
    setStep('list');
  };

  return (
    <div className="onboarding">
      {step !== 'welcome' && (
        <div className="progress" aria-label={`Step ${stepIndex} of 2`}>
          {[1, 2].map((i) => (
            <span key={i} className={i <= stepIndex ? 'on' : ''} />
          ))}
        </div>
      )}

      {step === 'welcome' && (
        <div className="welcome">
          <div className="welcome-logo">
            <span className="brand-dot big" />
          </div>
          <h1>ShiftMoney</h1>
          <p className="muted">Track your shifts, breaks and pay — to the minute.</p>
          <ul className="welcome-list">
            <li>Merge shifts from Tanda and your manager's messages</li>
            <li>Paid and unpaid breaks worked out for you</li>
            <li>See your pay before and after tax every week</li>
          </ul>
          <button className="primary block" onClick={() => setStep('workplace')}>
            Set up my workplace
          </button>
        </div>
      )}

      {step === 'workplace' && (
        <div className="stack">
          <div>
            <h2 className="ob-title">{workplaces.length === 0 ? 'Where do you work?' : 'Add a workplace'}</h2>
            <p className="small muted">Pick the award that covers your job, your level and your hourly rate. You can change all of this later in Settings.</p>
          </div>
          <section className="card">
            <WorkplaceForm key={draft.id} value={draft} onChange={setDraft} />
          </section>
          {!workplaceIsValid(draft) && <p className="small muted pad">Enter a name and your hourly rate to continue.</p>}
          <div className="inline">
            {workplaces.length > 0 && (
              <button className="secondary" onClick={() => setStep('list')}>
                Cancel
              </button>
            )}
            <button className="primary block" disabled={!workplaceIsValid(draft)} onClick={saveDraft}>
              Save workplace
            </button>
          </div>
        </div>
      )}

      {step === 'list' && (
        <div className="stack">
          <div>
            <h2 className="ob-title">Your workplaces</h2>
            <p className="small muted">Work more than one job? Add each one so shifts are paid at the right rate.</p>
          </div>
          <div className="stack-sm">
            {workplaces.map((w) => (
              <WorkplaceCard
                key={w.id}
                wp={w}
                onClick={() => {
                  setDraft(w);
                  setStep('workplace');
                }}
              />
            ))}
          </div>
          <button
            className="ghost-btn center"
            onClick={() => {
              setDraft(newWorkplace(workplaces.length));
              setStep('workplace');
            }}
          >
            <PlusIcon size={16} /> Add another workplace
          </button>
          <button className="primary block" onClick={() => setStep('personal')}>
            Continue
          </button>
        </div>
      )}

      {step === 'personal' && (
        <div className="stack">
          <div>
            <h2 className="ob-title">Tax &amp; pay week</h2>
            <p className="small muted">Used to estimate the tax taken from your pay.</p>
          </div>
          <section className="card">
            <div className="card-title">Your tax situation</div>
            <div className="radio-list">
              {(Object.keys(TAX_MODE_LABEL) as TaxMode[]).map((m) => (
                <label key={m} className="check">
                  <input type="radio" name="ob-tax" checked={taxMode === m} onChange={() => setTaxMode(m)} />
                  {TAX_MODE_LABEL[m]}
                </label>
              ))}
            </div>
            {workplaces.length > 1 && taxMode === 'resident-tft' && (
              <p className="small muted">With more than one job you usually claim the tax-free threshold at only one of them.</p>
            )}
          </section>
          <section className="card">
            <div className="card-title">Pay week starts on</div>
            <div className="seg small">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button key={d} className={weekStartDay === d ? 'on' : ''} onClick={() => setWeekStartDay(d)}>
                  {WEEKDAY_SHORT[d]}
                </button>
              ))}
            </div>
          </section>
          <div className="inline">
            <button className="secondary" onClick={() => setStep('list')}>
              Back
            </button>
            <button className="primary block" onClick={() => onFinish(workplaces, { taxMode, weekStartDay })}>
              Start using ShiftMoney
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkplaceCard({ wp, onClick }: { wp: Workplace; onClick: () => void }) {
  return (
    <button className="wp-card" onClick={onClick}>
      <span className="wp-dot" style={{ background: wp.color }} />
      <span className="wp-info">
        <b>{wp.name}</b>
        <span className="small muted">
          {awardLabel(wp)}
          {wp.level && ` · ${wp.level}`} · {EMPLOYMENT_LABEL[wp.employment]}
        </span>
      </span>
      <span className="wp-rate">
        <b>{fmtMoney(wp.baseRate)}</b>
        <span className="small muted">/hour</span>
      </span>
    </button>
  );
}
