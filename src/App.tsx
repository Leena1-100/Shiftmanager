import { useMemo, useState } from 'react';
import type { Settings, Shift, WeekMeta } from './types';
import { usePersistentState } from './lib/storage';
import { addDays, fmtDateShort, todayISO, weekStartOf } from './lib/time';
import { HomeIcon, ImportIcon, WalletIcon, GearIcon, ChevronLeft, ChevronRight } from './components/Icons';
import HomeTab from './components/HomeTab';
import ImportTab from './components/ImportTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import ShiftEditor from './components/ShiftEditor';

type Tab = 'home' | 'import' | 'history' | 'settings';

export default function App() {
  const [state, setState] = usePersistentState();
  const { settings } = state;
  const [tab, setTab] = useState<Tab>('home');
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO(), settings.weekStartDay));
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);
  // Bumped after restoring/resetting so the settings inputs re-render with the new values
  const [resetKey, setResetKey] = useState(0);

  const weekEnd = addDays(weekStart, 6);
  const weekShifts = useMemo(
    () =>
      state.shifts
        .filter((s) => s.date >= weekStart && s.date <= weekEnd)
        .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start),
    [state.shifts, weekStart, weekEnd],
  );

  const saveShift = (shift: Shift) =>
    setState((st) => {
      const exists = st.shifts.some((s) => s.id === shift.id);
      return { ...st, shifts: exists ? st.shifts.map((s) => (s.id === shift.id ? shift : s)) : [...st.shifts, shift] };
    });
  const deleteShift = (id: string) => setState((st) => ({ ...st, shifts: st.shifts.filter((s) => s.id !== id) }));
  const setShifts = (shifts: Shift[]) => setState((st) => ({ ...st, shifts }));
  const updateSettings = (patch: Partial<Settings>) => {
    setState((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
    if (patch.weekStartDay !== undefined) setWeekStart((w) => weekStartOf(w, patch.weekStartDay!));
  };
  const updateWeek = (key: string, meta: WeekMeta) =>
    setState((st) => ({ ...st, weeks: { ...st.weeks, [key]: { ...st.weeks[key], ...meta } } }));

  const showWeekNav = tab === 'home' || tab === 'import';
  const isThisWeek = weekStart === weekStartOf(todayISO(), settings.weekStartDay);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          ShiftMoney
        </div>
        {showWeekNav && (
          <div className="weeknav">
            <button className="icon-btn" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft />
            </button>
            <button
              className={isThisWeek ? 'week-label current' : 'week-label'}
              onClick={() => setWeekStart(weekStartOf(todayISO(), settings.weekStartDay))}
              title={isThisWeek ? 'This week' : 'Go to this week'}
            >
              {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)}
            </button>
            <button className="icon-btn" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight />
            </button>
          </div>
        )}
      </header>

      <main className="content">
        {tab === 'home' && (
          <HomeTab
            settings={settings}
            shifts={weekShifts}
            weekStart={weekStart}
            onEdit={(s) => setEditing(s)}
            onAdd={() => setEditing('new')}
            onSave={saveShift}
            onGoImport={() => setTab('import')}
          />
        )}
        {tab === 'import' && (
          <ImportTab
            settings={settings}
            allShifts={state.shifts}
            weekStart={weekStart}
            onApply={(shifts) => {
              setShifts(shifts);
              setTab('home');
            }}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            state={state}
            onUpdateWeek={updateWeek}
            onOpenWeek={(w) => {
              setWeekStart(w);
              setTab('home');
            }}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            key={resetKey}
            state={state}
            onUpdate={updateSettings}
            onReplaceState={(next) => {
              setState(next);
              setResetKey((k) => k + 1);
            }}
          />
        )}
      </main>

      <nav className="tabbar">
        {(
          [
            ['home', 'This week', <HomeIcon key="h" />],
            ['import', 'Import', <ImportIcon key="i" />],
            ['history', 'Earnings', <WalletIcon key="w" />],
            ['settings', 'Settings', <GearIcon key="g" />],
          ] as const
        ).map(([key, label, icon]) => (
          <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {editing && (
        <ShiftEditor
          shift={editing === 'new' ? null : editing}
          defaultDate={weekStart}
          settings={settings}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            saveShift(s);
            setEditing(null);
          }}
          onDelete={(id) => {
            deleteShift(id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
