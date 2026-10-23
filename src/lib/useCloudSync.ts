import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { reviveState } from './storage';
import {
  CloudError,
  createSave,
  findSave,
  loadCloudConfig,
  pull,
  push,
  saveCloudConfig,
  type CloudConfig,
  type CloudData,
} from './cloud';

export type CloudStatus = 'off' | 'checking' | 'saving' | 'saved' | 'error';

export type ConnectResult =
  | { kind: 'created' }
  | { kind: 'restored' }
  /** Both this device and the cloud have data: the user picks which to keep */
  | { kind: 'choose'; token: string; gistId: string; cloud: CloudData };

const SAVE_DELAY = 1500;

const hasData = (s: AppState) => s.workplaces.length > 0 || s.shifts.length > 0;

export interface CloudSync {
  config: CloudConfig | null;
  status: CloudStatus;
  error: string;
  lastSavedAt?: string;
  /** restoreOnly: only load an existing save, never create one */
  connect: (token: string, opts?: { restoreOnly?: boolean }) => Promise<ConnectResult>;
  resolve: (choice: Extract<ConnectResult, { kind: 'choose' }>, keep: 'cloud' | 'device') => Promise<void>;
  saveNow: () => void;
  disconnect: () => void;
}

/**
 * Keeps the app data in the user's secret GitHub gist.
 * On open, a newer cloud copy (e.g. saved from another phone) replaces the local one;
 * after that every change is uploaded a moment later.
 */
export function useCloudSync(state: AppState, replaceState: (s: AppState) => void): CloudSync {
  const [config, setConfig] = useState<CloudConfig | null>(loadCloudConfig);
  const [status, setStatus] = useState<CloudStatus>(config ? 'checking' : 'off');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(!config);
  const lastUploaded = useRef<string>('');
  const stateRef = useRef(state);
  stateRef.current = state;

  const updateConfig = useCallback((cfg: CloudConfig | null) => {
    saveCloudConfig(cfg);
    setConfig(cfg);
  }, []);

  const fail = (e: unknown) => {
    setStatus('error');
    setError(e instanceof CloudError ? e.message : 'Cloud save failed. It will try again on your next change.');
  };

  // On open: pull a newer copy from the cloud before uploading anything
  useEffect(() => {
    if (!config || ready) return;
    let cancelled = false;
    pull(config)
      .then((cloud) => {
        if (cancelled) return;
        if (cloud && (!config.lastSyncedAt || cloud.savedAt > config.lastSyncedAt)) {
          const next = reviveState(cloud.state);
          lastUploaded.current = JSON.stringify(next);
          replaceState(next);
          updateConfig({ ...config, lastSyncedAt: cloud.savedAt });
        }
        setStatus('saved');
      })
      .catch(fail)
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upload = useCallback(async () => {
    const cfg = loadCloudConfig();
    if (!cfg) return;
    const json = JSON.stringify(stateRef.current);
    if (json === lastUploaded.current) return;
    setStatus('saving');
    try {
      const savedAt = await push(cfg, stateRef.current);
      lastUploaded.current = json;
      updateConfig({ ...cfg, lastSyncedAt: savedAt });
      setError('');
      setStatus('saved');
    } catch (e) {
      fail(e);
    }
  }, [updateConfig]);

  // Upload shortly after each change
  useEffect(() => {
    if (!config || !ready) return;
    const t = setTimeout(upload, SAVE_DELAY);
    return () => clearTimeout(t);
  }, [state, config, ready, upload]);

  // Don't lose the last edit when the app is closed or sent to the background
  useEffect(() => {
    if (!config || !ready) return;
    const onHide = () => document.visibilityState === 'hidden' && void upload();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [config, ready, upload]);

  const connect: CloudSync['connect'] = async (token, opts = {}) => {
    setError('');
    const found = await findSave(token);
    if (opts.restoreOnly && !(found?.data && hasData(found.data.state))) {
      throw new CloudError('No ShiftMoney save was found on this GitHub account.');
    }
    if (!found) {
      const { gistId, savedAt } = await createSave(token, stateRef.current);
      lastUploaded.current = JSON.stringify(stateRef.current);
      updateConfig({ token, gistId, lastSyncedAt: savedAt });
      setReady(true);
      setStatus('saved');
      return { kind: 'created' };
    }
    if (found.data && hasData(found.data.state) && hasData(stateRef.current)) {
      return { kind: 'choose', token, gistId: found.gistId, cloud: found.data };
    }
    if (found.data && hasData(found.data.state)) {
      const next = reviveState(found.data.state);
      lastUploaded.current = JSON.stringify(next);
      replaceState(next);
      updateConfig({ token, gistId: found.gistId, lastSyncedAt: found.data.savedAt });
      setReady(true);
      setStatus('saved');
      return { kind: 'restored' };
    }
    // An empty save exists: fill it with this device's data
    updateConfig({ token, gistId: found.gistId });
    setReady(true);
    await upload();
    return { kind: 'created' };
  };

  const resolve: CloudSync['resolve'] = async (choice, keep) => {
    if (keep === 'cloud') {
      const next = reviveState(choice.cloud.state);
      lastUploaded.current = JSON.stringify(next);
      replaceState(next);
      updateConfig({ token: choice.token, gistId: choice.gistId, lastSyncedAt: choice.cloud.savedAt });
      setStatus('saved');
    } else {
      updateConfig({ token: choice.token, gistId: choice.gistId });
      lastUploaded.current = '';
      await upload();
    }
    setReady(true);
  };

  const disconnect = () => {
    updateConfig(null);
    lastUploaded.current = '';
    setStatus('off');
    setError('');
  };

  return {
    config,
    status,
    error,
    lastSavedAt: config?.lastSyncedAt,
    connect,
    resolve,
    saveNow: () => void upload(),
    disconnect,
  };
}
