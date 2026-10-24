import { useEffect, useState } from 'react';
import type { AppState, Workplace } from '../types';
import { AWARDS, DEFAULT_SETTINGS, LEGACY_BREAK_TIERS, newWorkplace } from './defaults';

const KEY = 'shiftmoney:v1';

export function emptyState(): AppState {
  return { version: 2, onboarded: false, workplaces: [], settings: structuredClone(DEFAULT_SETTINGS), shifts: [], weeks: {} };
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

/** Version 1 kept pay settings globally; turn them into a single workplace */
function migrateV1Workplace(settings: Record<string, unknown>): Workplace {
  const base = newWorkplace(0, 'fast-food');
  return {
    ...base,
    name: 'My workplace',
    employment: (settings.employment as Workplace['employment']) ?? base.employment,
    baseRate: Number(settings.baseRate) || 0,
    multipliers: { ...base.multipliers, ...(settings.multipliers as Workplace['multipliers']) },
    breakTiers: (settings.breakTiers as Workplace['breakTiers']) ?? base.breakTiers,
    minEngagementMinutes: Number(settings.minEngagementMinutes) || 0,
  };
}

/** Bring saved data / a backup file up to the current shape (missing settings get defaults) */
export function reviveState(data: unknown): AppState {
  const d = data as Partial<Omit<AppState, 'version'>> & { version?: number };
  if (!d || typeof d !== 'object' || !Array.isArray(d.shifts)) throw new Error('Invalid data');
  const base = emptyState();
  let workplaces = Array.isArray(d.workplaces) ? d.workplaces : [];
  if (d.version === 1 && d.settings) workplaces = [migrateV1Workplace(d.settings as unknown as Record<string, unknown>)];
  // Workplaces still on the old one-size-fits-all break rules get their award's rules
  const legacy = JSON.stringify(LEGACY_BREAK_TIERS);
  workplaces = workplaces.map((w) =>
    JSON.stringify(w.breakTiers) === legacy ? { ...w, breakTiers: AWARDS[w.award].breakTiers.map((t) => ({ ...t })) } : w,
  );
  // An allowance typed in by hand on a preset award becomes the laundry switch
  workplaces = workplaces.map((w) =>
    w.award !== 'custom' && w.shiftAllowance && w.laundryAllowance === undefined
      ? { ...w, laundryAllowance: true, shiftAllowance: undefined }
      : w,
  );
  const fallbackId = workplaces[0]?.id;
  return {
    version: 2,
    onboarded: d.version === 1 ? true : !!d.onboarded && workplaces.length > 0,
    workplaces,
    settings: {
      taxMode: d.settings?.taxMode ?? base.settings.taxMode,
      superRate: d.settings?.superRate ?? base.settings.superRate,
      weekStartDay: d.settings?.weekStartDay ?? base.settings.weekStartDay,
      mergePriority: d.settings?.mergePriority ?? base.settings.mergePriority,
    },
    shifts: d.shifts.map((s) => ({
      ...s,
      sources: s.sources ?? [s.source],
      workplaceId: workplaces.some((w) => w.id === s.workplaceId) ? s.workplaceId : fallbackId,
    })),
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
