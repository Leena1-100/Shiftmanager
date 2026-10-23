import { useState } from 'react';
import { CloudError, NEW_TOKEN_URL, gistUrl } from '../lib/cloud';
import type { CloudSync, ConnectResult } from '../lib/useCloudSync';
import { fmtDateLong, fmtTime } from '../lib/time';
import ConfirmButton from './ConfirmButton';

interface Props {
  cloud: CloudSync;
  /** "restore" is the welcome-screen version: it only loads an existing save */
  mode?: 'settings' | 'restore';
  onRestored?: () => void;
}

function fmtSavedAt(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${fmtDateLong(date)}, ${fmtTime(d.getHours() * 60 + d.getMinutes())}`;
}

export default function CloudSave({ cloud, mode = 'settings', onRestored }: Props) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<Extract<ConnectResult, { kind: 'choose' }> | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof CloudError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const result = await cloud.connect(token.trim(), { restoreOnly: mode === 'restore' });
      if (result.kind === 'choose') setChoice(result);
      else if (result.kind === 'restored') onRestored?.();
    });

  if (cloud.config && !choice) {
    return (
      <div className="stack-sm">
        <div className={`cloud-status ${cloud.status}`}>
          <span className="cloud-dot" />
          <span>
            {cloud.status === 'saving' && 'Saving…'}
            {cloud.status === 'checking' && 'Checking for newer data…'}
            {cloud.status === 'saved' && `Saved to GitHub · ${fmtSavedAt(cloud.lastSavedAt)}`}
            {cloud.status === 'error' && cloud.error}
          </span>
        </div>
        <p className="small muted">
          Every change is saved automatically to a secret Gist on your GitHub account. If this phone's data is cleared or you switch
          phones, choose <b>Restore from cloud save</b> on the welcome screen and paste the same token.
        </p>
        <div className="inline wrap">
          {cloud.status === 'error' && (
            <button className="ghost-btn" onClick={cloud.saveNow}>
              Try again
            </button>
          )}
          <a className="link" href={gistUrl(cloud.config.gistId)} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
          <ConfirmButton className="link danger-text" label="Disconnect" confirmLabel="Tap again to disconnect" onConfirm={cloud.disconnect} />
        </div>
      </div>
    );
  }

  if (choice) {
    const c = choice.cloud.state;
    return (
      <div className="confirm-box">
        <p className="small">
          <b>This GitHub account already has a ShiftMoney save</b> ({c.workplaces.length} workplace{c.workplaces.length === 1 ? '' : 's'},{' '}
          {c.shifts.length} shifts, saved {fmtSavedAt(choice.cloud.savedAt)}). Which data do you want to keep?
        </p>
        <div className="stack-sm">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await cloud.resolve(choice, 'cloud');
                setChoice(null);
                onRestored?.();
              })
            }
          >
            Use the cloud save
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await cloud.resolve(choice, 'device');
                setChoice(null);
              })
            }
          >
            Replace it with this phone's data
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="stack-sm">
      {mode === 'settings' ? (
        <p className="small muted">
          Keep your shifts safe even if this phone's browser data is cleared. Your data is saved to a secret Gist on your own GitHub
          account, and only someone with your token can read it.
        </p>
      ) : (
        <p className="small muted">Paste the GitHub token you used for cloud save to bring back your workplaces and shifts.</p>
      )}
      {mode === 'settings' && (
        <ol className="steps small">
          <li>
            <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
              Open GitHub's new token page
            </a>{' '}
            (sign in if asked). Only the <b>gist</b> box is ticked.
          </li>
          <li>
            Set <b>Expiration</b> to <b>No expiration</b>, then tap <b>Generate token</b> at the bottom.
          </li>
          <li>Copy the token (starts with ghp_) and paste it below. Keep a copy in your notes. You need it to restore.</li>
        </ol>
      )}
      <label className="field">
        <span>GitHub token</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="ghp_…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy || token.trim().length < 20} onClick={connect}>
        {busy ? 'Connecting…' : mode === 'settings' ? 'Turn on cloud save' : 'Restore my data'}
      </button>
    </div>
  );
}
