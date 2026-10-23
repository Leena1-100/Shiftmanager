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

/** 저장본/백업 파일을 현재 형식으로 맞춘다 (빠진 설정은 기본값) */
export function reviveState(data: unknown): AppState {
  const d = data as Partial<AppState>;
  if (!d || typeof d !== 'object' || !Array.isArray(d.shifts)) throw new Error('잘못된 데이터');
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
      /* 저장 실패해도 앱은 계속 동작 */
    }
  }, [state]);
  return [state, setState];
}
