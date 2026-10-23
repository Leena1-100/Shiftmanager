import type { Settings, Shift, Source } from '../types';

export interface IncomingShift {
  date: string;
  start: number;
  end: number;
  unpaidBreak?: number;
  source: Source;
  workplaceId?: string;
  note?: string;
}

export type MergeAction = 'added' | 'duplicate' | 'replaced' | 'kept';

export interface MergeEvent {
  action: MergeAction;
  shift: Shift;
  other?: IncomingShift;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function rank(source: Source, priority: Settings['mergePriority']): number {
  if (source === 'manual') return 3;
  return source === priority ? 2 : 1;
}

type Slot = { date: string; start: number; end: number; workplaceId?: string };

function overlaps(a: Slot, b: Slot) {
  return a.workplaceId === b.workplaceId && a.date === b.date && a.start < b.end && b.start < a.end;
}

/**
 * Merge imported shifts into the existing ones.
 * - No overlapping shift at the same workplace on the same day → add it
 * - Same times → just record the extra source (duplicate)
 * - Different times → apply the higher-priority source and keep the other as `alt` (swappable any time)
 * - Recorded actual hours are always kept
 */
export function mergeShifts(
  existing: Shift[],
  incoming: IncomingShift[],
  priority: Settings['mergePriority'],
): { shifts: Shift[]; events: MergeEvent[] } {
  const shifts = existing.map((s) => ({ ...s, sources: [...s.sources] }));
  const events: MergeEvent[] = [];

  for (const inc of incoming) {
    const target = shifts.find((s) => overlaps(s, inc));
    if (!target) {
      const s: Shift = {
        id: newId(),
        date: inc.date,
        start: inc.start,
        end: inc.end,
        source: inc.source,
        sources: [inc.source],
        unpaidBreak: inc.unpaidBreak,
        workplaceId: inc.workplaceId,
        note: inc.note,
      };
      shifts.push(s);
      events.push({ action: 'added', shift: s });
      continue;
    }

    if (!target.sources.includes(inc.source)) target.sources.push(inc.source);

    if (target.start === inc.start && target.end === inc.end) {
      if (target.unpaidBreak === undefined && inc.unpaidBreak !== undefined) target.unpaidBreak = inc.unpaidBreak;
      events.push({ action: 'duplicate', shift: target, other: inc });
      continue;
    }

    if (rank(inc.source, priority) > rank(target.source, priority)) {
      target.alt = { source: target.source, start: target.start, end: target.end, unpaidBreak: target.unpaidBreak };
      target.start = inc.start;
      target.end = inc.end;
      target.source = inc.source;
      target.unpaidBreak = inc.unpaidBreak ?? target.unpaidBreak;
      events.push({ action: 'replaced', shift: target, other: inc });
    } else {
      target.alt = { source: inc.source, start: inc.start, end: inc.end, unpaidBreak: inc.unpaidBreak };
      events.push({ action: 'kept', shift: target, other: inc });
    }
  }

  shifts.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  return { shifts, events };
}

/** Swap the current times with the stored version from the other source */
export function swapAlt(shift: Shift): Shift {
  if (!shift.alt) return shift;
  const { alt } = shift;
  return {
    ...shift,
    start: alt.start,
    end: alt.end,
    source: alt.source,
    unpaidBreak: alt.unpaidBreak,
    alt: { source: shift.source, start: shift.start, end: shift.end, unpaidBreak: shift.unpaidBreak },
  };
}
