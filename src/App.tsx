import { useMemo, useState } from 'react';
import type { Settings, Shift, WeekMeta, Workplace } from './types';
import { usePersistentState } from './lib/storage';
import { useCloudSync } from './lib/useCloudSync';
import { useUpdateCheck } from './lib/useUpdateCheck';
import { addDays, fmtDateShort, todayISO, weekStartOf } from './lib/time';
import { HomeIcon, CalendarIcon, WalletIcon, GearIcon, ChevronLeft, ChevronRight, CloseIcon } from './components/Icons';
import HomeTab from './components/HomeTab';
import ImportTab from './components/ImportTab';
import PayslipSheet from './components/PayslipSheet';
import CalendarTab from './components/CalendarTab';
import HistoryTab from './components/HistoryTab';
import SettingsTab from './components/SettingsTab';
import ShiftEditor from './components/ShiftEditor';
import Onboarding from './components/Onboarding';

type Tab = 'home' | 'calendar' | 'history' | 'settings';

export default function App() {
  const [state, setState] = usePersistentState();
  const { settings } = state;
  const [tab, setTab] = useState<Tab>('home');
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO(), settings.weekStartDay));
  // Shift being edited, or a new shift on `date`
  const [editing, setEditing] = useState<{ shift: Shift | null; date: string } | null>(null);
  // Week whose roster is being imported (opens the import sheet)
  const [importWeek, setImportWeek] = useState<string | null>(null);
  // Week whose payslip is being added (opens the payslip sheet)
  const [payslipWeek, setPayslipWeek] = useState<string | null>(null);
  // Bumped after restoring/resetting so the settings inputs re-render with the new values
  const [resetKey, setResetKey] = useState(0);
  const replaceState = (next: typeof state) => {
    setState(next);
    setResetKey((k) => k + 1);
  };
  const cloud = useCloudSync(state, replaceState);
  const update = useUpdateCheck();

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
  const saveWorkplace = (wp: Workplace) =>
    setState((st) => {
      const exists = st.workplaces.some((w) => w.id === wp.id);
      return { ...st, workplaces: exists ? st.workplaces.map((w) => (w.id === wp.id ? wp : w)) : [...st.workplaces, wp] };
    });
  const deleteWorkplace = (id: string) =>
    setState((st) => ({
      ...st,
      workplaces: st.workplaces.filter((w) => w.id !== id),
      shifts: st.shifts.filter((s) => s.workplaceId !== id),
    }));

  const updateBanner = update.updateReady && (
    <div className="update-banner">
      <span>A new version of ShiftMoney is ready.</span>
      <button className="primary" onClick={update.reload}>
        Update now
      </button>
    </div>
  );

  if (!state.onboarded || state.workplaces.length === 0) {
    return (
      <div className="app">
        {updateBanner}
        <Onboarding
          settings={settings}
          cloud={cloud}
          onFinish={(workplaces, patch) => {
            setState((st) => ({ ...st, onboarded: true, workplaces, settings: { ...st.settings, ...patch } }));
            if (patch.weekStartDay !== undefined) setWeekStart(weekStartOf(todayISO(), patch.weekStartDay));
            setTab('home');
          }}
        />
      </div>
    );
  }

  const showWeekNav = tab === 'home';
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

      {updateBanner}

      <main className="content">
        {tab === 'home' && (
          <HomeTab
            settings={settings}
            workplaces={state.workplaces}
            shifts={weekShifts}
            weekStart={weekStart}
            weekMeta={state.weeks[weekStart]}
            onEdit={(s) => setEditing({ shift: s, date: s.date })}
            onAdd={() => setEditing({ shift: null, date: weekStart })}
            onSave={saveShift}
            onGoImport={() => setImportWeek(weekStart)}
          />
        )}
        {tab === 'calendar' && (
          <CalendarTab
            state={state}
            onEdit={(s) => setEditing({ shift: s, date: s.date })}
            onAdd={(date) => setEditing({ shift: null, date })}
            onImportWeek={setImportWeek}
          />
        )}
        {tab === 'history' && (
          <HistoryTab
            state={state}
            onUpdateWeek={updateWeek}
            onOpenPayslip={setPayslipWeek}
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
            onSaveWorkplace={saveWorkplace}
            onDeleteWorkplace={deleteWorkplace}
            onReplaceState={replaceState}
            cloud={cloud}
          />
        )}
      </main>

      <nav className="tabbar">
        {(
          [
            ['home', 'This week', <HomeIcon key="h" />],
            ['calendar', 'Calendar', <CalendarIcon key="c" />],
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

      {payslipWeek && (
        <PayslipSheet
          key={payslipWeek}
          weekStart={payslipWeek}
          existing={state.weeks[payslipWeek]?.payslip}
          existingCash={state.weeks[payslipWeek]?.cashReceived}
          shifts={state.shifts}
          workplaces={state.workplaces}
          settings={settings}
          onSave={(week, payslip, cashReceived) => {
            // Saving to another week (the payslip's own period) moves it there
            setState((st) => {
              const weeks = { ...st.weeks };
              if (payslip && week !== payslipWeek && weeks[payslipWeek]?.payslip) {
                weeks[payslipWeek] = { ...weeks[payslipWeek], payslip: undefined };
              }
              weeks[week] = {
                ...weeks[week],
                ...(payslip ? { payslip } : {}),
                ...(cashReceived !== undefined ? { cashReceived: cashReceived ?? undefined } : {}),
              };
              return { ...st, weeks };
            });
            setPayslipWeek(null);
          }}
          onDelete={(week) => {
            updateWeek(week, { payslip: undefined });
            setPayslipWeek(null);
          }}
          onClose={() => setPayslipWeek(null)}
        />
      )}

      {importWeek && (
        <div className="sheet-backdrop" onClick={() => setImportWeek(null)}>
          <div className="sheet tall" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <h3>
                Roster for {fmtDateShort(importWeek)} – {fmtDateShort(addDays(importWeek, 6))}
              </h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setImportWeek(null)}>
                <CloseIcon />
              </button>
            </div>
            <ImportTab
              settings={settings}
              workplaces={state.workplaces}
              allShifts={state.shifts}
              weekStart={importWeek}
              onApply={(shifts) => {
                setShifts(shifts);
                setImportWeek(null);
              }}
            />
          </div>
        </div>
      )}

      {editing && (
        <ShiftEditor
          key={editing.shift?.id ?? `new-${editing.date}`}
          shift={editing.shift}
          defaultDate={editing.date}
          workplaces={state.workplaces}
          allShifts={state.shifts}
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
