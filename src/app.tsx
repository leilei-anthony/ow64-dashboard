import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import type { SectionId } from './model/types';
import { calendarSources, ready, selectedDay, settings, updateSettings } from './storage/store';
import { editMode, focusView, menu, settingsOpen, shiftDay } from './ui';
import { sendCommand } from './storage/pomodoro';
import { PomodoroView, startOrPause } from './components/PomodoroView';
import { PomodoroPill } from './components/PomodoroPill';
import { TopBar } from './components/top/TopBar';
import { LinkEditDialog } from './components/top/LinkEditDialog';
import { DayNav } from './components/DayNav';
import { Matrix } from './components/Matrix';
import { Countdowns } from './components/Countdowns';
import { StatsPanel } from './components/StatsPanel';
import { Heatmap } from './components/Heatmap';
import { NotesPanel } from './components/NotesPanel';
import { CellNoteDialog, EditDialog } from './components/EditDialog';
import { ContextMenu } from './components/ContextMenu';
import { SettingsDrawer } from './components/SettingsDrawer';
import { TasksPanel } from './components/TasksPanel';
import { TaskDialog } from './components/TaskDialog';
import { ScheduleCard } from './components/ScheduleCard';
import { HabitsCard } from './components/HabitsCard';
import { HabitDialog } from './components/HabitDialog';
import { IconEye, IconEyeOff, IconGear, IconPencil, IconTimer } from './components/icons';

function toggleHidden() {
  const hidden = !settings.value.matrixHidden;
  updateSettings({ matrixHidden: hidden });
  if (hidden) editMode.value = false;
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('dialog[open]')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (focusView.value) {
        // In the focus view only the timer keys work.
        if (key === 'Escape' || key === 'p') {
          e.preventDefault();
          focusView.value = false;
        } else if (key === ' ' && !target?.closest('button, a')) {
          e.preventDefault(); // a focused button already handles Space itself
          startOrPause();
        } else if (key === 's') {
          void sendCommand({ cmd: 'skip' });
        }
        return;
      }
      if (key === 'p') {
        focusView.value = true;
        editMode.value = false;
        return;
      }
      if (key === 'h') return toggleHidden();
      if (settings.value.matrixHidden) return;
      const visible = settings.value.sections;
      switch (key) {
        case 'e':
          if (visible.chart) editMode.value = !editMode.value;
          break;
        case 't':
          selectedDay.value = null;
          break;
        case 'ArrowLeft':
          shiftDay(-1);
          break;
        case 'ArrowRight':
          shiftDay(1);
          break;
        case 'n':
          if (!visible.notes) return;
          e.preventDefault();
          document.getElementById('day-note')?.focus();
          break;
        case 'a':
          if (!visible.tasks) return;
          // The add field only shows on today's list.
          e.preventDefault();
          selectedDay.value = null;
          setTimeout(() => document.getElementById('task-add')?.focus());
          break;
        case 'Escape':
          editMode.value = false;
          menu.value = null;
          break;
        default:
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Controls() {
  const hidden = settings.value.matrixHidden;
  return (
    <div class="controls">
      <PomodoroPill />
      {!hidden && (
        <>
          <button
            type="button"
            class="icon-btn"
            title="Focus view: pomodoro timer (P)"
            aria-label="Focus view"
            onClick={() => {
              focusView.value = true;
              editMode.value = false;
            }}
          >
            <IconTimer />
          </button>
          {settings.value.sections.chart && (
            <button
              type="button"
              class={`icon-btn${editMode.value ? ' is-active' : ''}`}
              aria-pressed={editMode.value}
              title={editMode.value ? 'Done editing (E)' : 'Edit chart (E)'}
              aria-label="Edit chart"
              onClick={() => (editMode.value = !editMode.value)}
            >
              <IconPencil />
            </button>
          )}
          <button
            type="button"
            class="icon-btn"
            title="Settings"
            aria-label="Settings"
            onClick={() => (settingsOpen.value = true)}
          >
            <IconGear />
          </button>
        </>
      )}
      <button
        type="button"
        class="icon-btn"
        title={hidden ? 'Show dashboard (H)' : 'Hide dashboard (H)'}
        aria-label={hidden ? 'Show dashboard' : 'Hide dashboard'}
        onClick={toggleHidden}
      >
        {hidden ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

const CARDS: Record<Exclude<SectionId, 'chart'>, () => JSX.Element> = {
  habits: () => <HabitsCard />,
  tasks: () => <TasksPanel />,
  schedule: () => <ScheduleCard />,
  countdowns: () => <Countdowns />,
  week: () => <StatsPanel />,
  heatmap: () => <Heatmap />,
  notes: () => <NotesPanel />,
};

function Dashboard() {
  const v = settings.value.sections;
  // Schedule renders nothing until a calendar is connected, so it doesn't count toward the layout.
  const shown = (id: SectionId) => v[id] && (id !== 'schedule' || calendarSources.value.length > 0);
  const order = settings.value.sectionOrder.filter(shown);
  const cards = order.filter((id): id is Exclude<SectionId, 'chart'> => id !== 'chart');
  const side = cards.length > 0;
  const chartAt = order.indexOf('chart');
  // Two columns: the chart's column goes on the right only when it's last in the order.
  const chartRight = v.chart && side && chartAt === order.length - 1;
  // The date bar matters for anything that follows the viewed day.
  const nav = v.chart || v.habits || v.tasks || v.week || v.heatmap || v.notes;

  if (!v.chart && !side) {
    return (
      <main class="dash-empty">
        <p>All dashboard sections are hidden.</p>
        <button type="button" class="btn" onClick={() => (settingsOpen.value = true)}>
          Choose sections
        </button>
      </main>
    );
  }

  return (
    <main class={`dash${v.chart && side ? '' : ' is-single'}${v.chart ? '' : ' no-chart'}${chartRight ? ' chart-right' : ''}`}>
      {nav && (
        <div class="dash-nav">
          <DayNav showCount={v.chart} />
        </div>
      )}
      {v.chart && (
        <section class="dash-main" style={{ order: chartAt }}>
          <Matrix />
          {editMode.value && (
            <p class="edit-hint">Edit mode: click any cell, pillar or the goal to change it. Press E or the pencil when you're done.</p>
          )}
        </section>
      )}
      {side && (
        <aside class="dash-side">
          {cards.map((id) => (
            // `order` only matters in one column, where cards and the chart share a single flow.
            <div key={id} class="dash-card" style={{ order: order.indexOf(id) }}>
              {CARDS[id]()}
            </div>
          ))}
        </aside>
      )}
    </main>
  );
}

export function App() {
  useShortcuts();
  // Draw nothing until storage has loaded, so hidden mode never flashes the matrix.
  if (!ready.value) return null;
  const s = settings.value;
  const hidden = s.matrixHidden;
  if (focusView.value) {
    return (
      <div class="app is-focus">
        <PomodoroView />
        <TaskDialog />
        <ContextMenu />
      </div>
    );
  }
  return (
    <div class={`app${hidden ? ' is-hidden' : ''}`}>
      <Controls />
      {(!hidden || !s.hideLinksWhenHidden) && <TopBar />}
      {!hidden && <Dashboard />}
      <EditDialog />
      <CellNoteDialog />
      <TaskDialog />
      <HabitDialog />
      <LinkEditDialog />
      <SettingsDrawer />
      <ContextMenu />
    </div>
  );
}
