import { useState } from 'react';
import SheetBackdrop from './SheetBackdrop';
import type { AppState, Workplace } from '../types';
import { newWorkplace } from '../lib/defaults';
import { emptyState, reviveState } from '../lib/storage';
import { todayISO } from '../lib/time';
import { WorkplaceCard } from './Onboarding';
import WorkplaceForm, { workplaceIsValid } from './WorkplaceForm';
import { PlusIcon } from './Icons';
import ConfirmButton from './ConfirmButton';
import CloudSave from './CloudSave';
import type { CloudSync } from '../lib/useCloudSync';

interface Props {
  state: AppState;
  onSaveWorkplace: (wp: Workplace) => void;
  onDeleteWorkplace: (id: string) => void;
  onReplaceState: (s: AppState) => void;
  cloud: CloudSync;
}

export default function SettingsTab({ state, onSaveWorkplace, onDeleteWorkplace, onReplaceState, cloud }: Props) {
  const [editing, setEditing] = useState<Workplace | null>(null);
  const isExisting = !!editing && state.workplaces.some((w) => w.id === editing.id);

  const [pendingRestore, setPendingRestore] = useState<AppState | null>(null);
  const [backupError, setBackupError] = useState('');
  const shiftCount = (wp: Workplace) => state.shifts.filter((s) => s.workplaceId === wp.id).length;

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
      setBackupError('');
      setPendingRestore(reviveState(JSON.parse(await file.text())));
    } catch {
      setPendingRestore(null);
      setBackupError("Couldn't read that file. Choose a ShiftMoney backup (.json).");
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="card-title">Workplaces</div>
        <div className="stack-sm">
          {state.workplaces.map((w) => (
            <WorkplaceCard key={w.id} wp={w} onClick={() => setEditing(w)} />
          ))}
        </div>
        <button className="ghost-btn center" onClick={() => setEditing(newWorkplace(state.workplaces.length))}>
          <PlusIcon size={16} /> Add workplace
        </button>
      </section>

      <section className="card">
        <div className="card-title">Cloud save</div>
        <CloudSave cloud={cloud} />
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
          <ConfirmButton
            className="link danger-text"
            label="Reset everything"
            confirmLabel={cloud.config ? 'Tap again to clear this phone' : 'Tap again to delete all data'}
            onConfirm={() => {
              // Disconnect first so the empty app is never uploaded over the cloud save
              cloud.disconnect();
              onReplaceState(emptyState());
            }}
          />
        </div>
        {cloud.config && <p className="small muted">Reset clears this phone only. Your cloud save stays on GitHub.</p>}
        {backupError && <p className="error">{backupError}</p>}
        {pendingRestore && (
          <div className="confirm-box">
            <p className="small">
              Restore this backup ({pendingRestore.workplaces.length} workplace{pendingRestore.workplaces.length === 1 ? '' : 's'},{' '}
              {pendingRestore.shifts.length} shifts)? Your current data will be replaced.
            </p>
            <div className="inline">
              <button className="secondary" onClick={() => setPendingRestore(null)}>
                Cancel
              </button>
              <button
                className="primary"
                onClick={() => {
                  onReplaceState(pendingRestore);
                  setPendingRestore(null);
                }}
              >
                Restore
              </button>
            </div>
          </div>
        )}
      </section>

      <p className="small muted version">ShiftMoney version {__BUILD_ID__}</p>

      {editing && (
        <SheetBackdrop onClose={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <h3>{isExisting ? 'Edit workplace' : 'Add workplace'}</h3>
            <WorkplaceForm key={editing.id} value={editing} onChange={setEditing} />
            <div className="sheet-actions">
              {isExisting && state.workplaces.length > 1 && (
                <ConfirmButton
                  label="Delete"
                  confirmLabel={shiftCount(editing) ? `Delete with ${shiftCount(editing)} shifts?` : 'Tap again to delete'}
                  onConfirm={() => {
                    onDeleteWorkplace(editing.id);
                    setEditing(null);
                  }}
                />
              )}
              <button className="secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={!workplaceIsValid(editing)}
                onClick={() => {
                  onSaveWorkplace(editing);
                  setEditing(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </SheetBackdrop>
      )}
    </div>
  );
}
