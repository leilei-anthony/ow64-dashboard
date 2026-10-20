import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { DayKey, Task } from '../model/types';
import { chart, settings, tasks, today } from '../storage/store';
import {
  deleteTask,
  dropTask,
  moveTask,
  restoreTask,
  toggleStar,
  toggleSubtask,
  toggleTask,
} from '../storage/tasks';
import { addDays, shortDate } from '../lib/dates';
import { carriedDays, isStale, nextOccurrence, recurrenceLabel, starredFor, taskStart } from '../lib/tasks';
import type { ActionInfo } from '../lib/stats';
import { openMenu, taskDialog, type MenuItem } from '../ui';
import { IconRepeat, IconStar } from './icons';

export type RowMode = 'open' | 'done' | 'dropped' | 'upcoming';

interface Props {
  task: Task;
  /** The day being viewed; completing from a past day counts for that day. */
  day: DayKey;
  mode: RowMode;
  index: Map<string, ActionInfo>;
  drag?: JSX.HTMLAttributes<HTMLLIElement>;
}

function moveItems(t: Task, tday: DayKey): MenuItem[] {
  return [
    { label: 'Tomorrow', onSelect: () => moveTask(t.id, addDays(tday, 1)) },
    { label: 'Next Monday', onSelect: () => moveTask(t.id, nextOccurrence({ kind: 'weekly', days: [1] }, tday)) },
    { label: 'Pick a date…', onSelect: () => (taskDialog.value = { id: t.id, focus: 'date' }) },
  ];
}

export function TaskRow({ task: t, day, mode, index, drag }: Props) {
  const [expanded, setExpanded] = useState(false);
  const tday = today.value;
  const isToday = day === tday;
  const info = t.actionId ? index.get(t.actionId) : undefined;
  const pillar = info ? chart.value.pillars.find((p) => p.id === info.pillarId) : undefined;
  const carried = mode === 'open' && isToday ? carriedDays(t, tday) : 0;
  const stale = carried > 0 && isStale(t, tday, settings.value.staleTaskDays);
  const starred = t.top3 === tday;
  const canStar = isToday && (mode === 'open' || mode === 'done');
  const starFull = !starred && starredFor(tasks.value, tday).length >= 3;
  const subDone = t.subtasks.filter((s) => s.done).length;
  // Upcoming tasks are done "today"; everything else counts for the viewed day.
  const doneDay = mode === 'upcoming' ? tday : day;

  const onContextMenu = (e: MouseEvent) => {
    const items: MenuItem[] = [];
    if (canStar && (starred || !starFull)) items.push({ label: starred ? 'Remove from Top 3' : 'Add to Top 3', onSelect: () => toggleStar(t.id) });
    items.push({ label: 'Edit…', onSelect: () => (taskDialog.value = { id: t.id }) });
    if (mode === 'open' || mode === 'upcoming') {
      items.push({ label: 'Move to tomorrow', onSelect: () => moveTask(t.id, addDays(tday, 1)) });
      items.push({ label: 'Drop', onSelect: () => dropTask(t.id) });
    } else {
      items.push({ label: mode === 'done' ? 'Mark not done' : 'Restore', onSelect: () => restoreTask(t.id) });
    }
    items.push({ label: 'Delete', onSelect: () => deleteTask(t.id) });
    openMenu(e, items);
  };

  const cls = ['task', `is-${mode}`, starred && 'is-starred', stale && 'is-stale', drag?.class].filter(Boolean).join(' ');

  return (
    <li {...drag} class={cls} onContextMenu={onContextMenu}>
      {mode === 'dropped' ? (
        <span class="task-dropped-mark" aria-label="Dropped">
          ✕
        </span>
      ) : (
        <input
          type="checkbox"
          checked={mode === 'done'}
          aria-label={`${mode === 'done' ? 'Mark not done' : 'Complete'}: ${t.text}`}
          onChange={() => toggleTask(t.id, doneDay)}
        />
      )}

      <div class="task-body">
        <button type="button" class="task-text" title="Edit task" onClick={() => (taskDialog.value = { id: t.id })}>
          {t.text}
        </button>
        {(pillar || t.recurrence || t.subtasks.length > 0 || mode === 'upcoming') && (
          <div class="task-meta">
            {mode === 'upcoming' && <span>{shortDate(taskStart(t))}</span>}
            {info && (
              <span class="task-link" title={info.retired ? 'This action was replaced; the task no longer ticks it' : 'Ticks this action when done'}>
                <span class="dot" style={{ background: pillar?.color ?? 'var(--muted)' }} />
                {info.text}
                {info.retired && ' (replaced)'}
              </span>
            )}
            {t.recurrence && (
              <span class="task-repeat">
                <IconRepeat width={11} height={11} /> {recurrenceLabel(t.recurrence, settings.value.weekStartsOn)}
              </span>
            )}
            {t.subtasks.length > 0 && (
              <button type="button" class="task-sub-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? '▾' : '▸'} {subDone}/{t.subtasks.length}
              </button>
            )}
          </div>
        )}
        {expanded && (
          <ul class="subtasks">
            {t.subtasks.map((s) => (
              <li key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={s.done}
                    disabled={mode === 'dropped'}
                    onChange={() => toggleSubtask(t.id, s.id, doneDay)}
                  />
                  <span class={s.done ? 'is-done' : ''}>{s.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {stale && (
          <div class="task-stale">
            <button type="button" class="btn btn-small" onClick={() => dropTask(t.id)}>
              Drop
            </button>
            <button type="button" class="btn btn-small" onClick={(e) => openMenu(e, moveItems(t, tday))}>
              Move ▾
            </button>
          </div>
        )}
      </div>

      <div class="task-side">
        {carried > 0 && (
          <span
            class={`badge${stale ? ' badge-stale' : ''}`}
            title={`Carried over for ${carried} day${carried === 1 ? '' : 's'}`}
          >
            {stale ? '⚠' : '↻'} {carried}d
          </span>
        )}
        {mode === 'dropped' && (
          <button type="button" class="btn btn-small" onClick={() => restoreTask(t.id)}>
            Restore
          </button>
        )}
        {canStar && (
          <button
            type="button"
            class={`star-btn${starred ? ' is-on' : ''}`}
            aria-pressed={starred}
            disabled={starFull}
            title={starred ? 'Remove from Top 3' : starFull ? 'Top 3 is full' : 'Add to Top 3'}
            aria-label={starred ? 'Remove from Top 3' : 'Add to Top 3'}
            onClick={() => toggleStar(t.id)}
          >
            <IconStar filled={starred} width={15} height={15} />
          </button>
        )}
      </div>
    </li>
  );
}
