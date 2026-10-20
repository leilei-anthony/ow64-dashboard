import { useEffect } from 'preact/hooks';
import { ready, selectedDay, settings, updateSettings } from './storage/store';
import { editMode, menu, settingsOpen, shiftDay } from './ui';
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
import { IconEye, IconEyeOff, IconGear, IconPencil } from './components/icons';

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
      if (key === 'h') return toggleHidden();
      if (settings.value.matrixHidden) return;
      switch (key) {
        case 'e':
          editMode.value = !editMode.value;
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
          e.preventDefault();
          document.getElementById('day-note')?.focus();
          break;
        case 'a':
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
      {!hidden && (
        <>
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

function Dashboard() {
  return (
    <main class="dash">
      <div class="dash-nav">
        <DayNav />
      </div>
      <section class="dash-main">
        <Matrix />
        {editMode.value && (
          <p class="edit-hint">Edit mode: click any cell, pillar or the goal to change it. Press E or the pencil when you're done.</p>
        )}
      </section>
      <aside class="dash-side">
        <TasksPanel />
        <Countdowns />
        <StatsPanel />
        <Heatmap />
        <NotesPanel />
      </aside>
    </main>
  );
}

export function App() {
  useShortcuts();
  // Draw nothing until storage has loaded, so hidden mode never flashes the matrix.
  if (!ready.value) return null;
  const s = settings.value;
  const hidden = s.matrixHidden;
  return (
    <div class={`app${hidden ? ' is-hidden' : ''}`}>
      <Controls />
      {(!hidden || !s.hideLinksWhenHidden) && <TopBar />}
      {!hidden && <Dashboard />}
      <EditDialog />
      <CellNoteDialog />
      <TaskDialog />
      <LinkEditDialog />
      <SettingsDrawer />
      <ContextMenu />
    </div>
  );
}
