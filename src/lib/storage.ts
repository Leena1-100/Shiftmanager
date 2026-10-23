import { useEffect, useState } from 'react';
import type { AppState } from '../types';
import { DEFAULT_SETTINGS } from './defaults';

const KEY = 'shiftmoney:v1';

export function emptyState(): AppState {
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), shifts: [], weeks: {} };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return reviveState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

/** Bring saved data / a backup file up to the current shape (missing settings get defaults) */
export function reviveState(data: unknown): AppState {
  const d = data as Partial<AppState>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.shifts)) throw new Error('Invalid data');
  const base = emptyState();
  return {
    version: 1,
    settings: {
      ...base.settings,
      ...d.settings,
      multipliers: { ...base.settings.multipliers, ...d.settings?.multipliers },
    },
    shifts: d.shifts.map((s) => ({ ...s, sources: s.sources ?? [s.source] })),
    weeks: d.weeks ?? {},
  };
}

export function usePersistentState(): [AppState, React.Dispatch<React.SetStateAction<AppState>>] {
  const [state, setState] = useState<AppState>(loadState);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* the app keeps working even if saving fails */
    }
  }, [state]);
  return [state, setState];
}
