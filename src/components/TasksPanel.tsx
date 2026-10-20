import { useMemo, useState } from 'preact/hooks';
import type { Task } from '../model/types';
import { chart, tasks, today, viewDay } from '../storage/store';
import { addTask, reorderTask } from '../storage/tasks';
import { shortDate } from '../lib/dates';
import { isCurrent, isUpcoming, sortForDay, taskStart } from '../lib/tasks';
import { actionIndex } from '../lib/stats';
import { IconPlus } from './icons';
import { TaskRow } from './TaskRow';

/** Open tasks shown before "Show n more", so the card never pushes the column off screen. */
const LIMIT = 8;

function AddTask() {
  const [text, setText] = useState('');
  return (
    <form
      class="task-add"
      onSubmit={(e) => {
        e.preventDefault();
        addTask(text);
        setText('');
      }}
    >
      <IconPlus width={15} height={15} />
      <input
        id="task-add"
        value={text}
        placeholder="Add a task… (A)"
        aria-label="Add a task"
        autoComplete="off"
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
      />
    </form>
  );
}

export function TasksPanel() {
  const day = viewDay.value;
  const tday = today.value;
  const isToday = day === tday;
  const all = tasks.value;
  const index = useMemo(() => actionIndex(chart.value), [chart.value]);
  const [showAll, setShowAll] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const current = sortForDay(all.filter((t) => isCurrent(t, day)), tday);
  const done = all.filter((t) => t.completedAt === day);
  const dropped = all.filter((t) => t.droppedAt === day);
  const upcoming = isToday
    ? all.filter((t) => isUpcoming(t, tday)).sort((a, b) => taskStart(a).localeCompare(taskStart(b)))
    : [];
  const visible = showAll ? current : current.slice(0, LIMIT);
  const total = current.length + done.length;

  // Drag to reorder (today's open list only).
  const dragProps = (t: Task) =>
    isToday
      ? {
          draggable: true,
          class: [dragId === t.id && 'is-dragging', overId === t.id && 'is-over'].filter(Boolean).join(' '),
          onDragStart: (e: DragEvent) => {
            setDragId(t.id);
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', t.text);
          },
          onDragOver: (e: DragEvent) => {
            if (!dragId) return;
            e.preventDefault();
            setOverId(t.id);
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (dragId) reorderTask(dragId, t.id);
            setDragId(null);
            setOverId(null);
          },
          onDragEnd: () => {
            setDragId(null);
            setOverId(null);
          },
        }
      : undefined;

  return (
    <section class="panel tasks">
      <div class="tasks-head">
        <h2>Tasks · {isToday ? 'Today' : shortDate(day)}</h2>
        {total > 0 && (
          <span class="tasks-count">
            <strong>{done.length}</strong>/{total}
          </span>
        )}
      </div>

      {isToday && <AddTask />}
      {!isToday && current.length > 0 && (
        <p class="small muted tasks-hint">Still open. Ticking one counts it as done on {shortDate(day)}.</p>
      )}

      {visible.length > 0 && (
        <ul class="task-list">
          {visible.map((t) => (
            <TaskRow key={t.id} task={t} day={day} mode="open" index={index} drag={dragProps(t)} />
          ))}
        </ul>
      )}
      {current.length > LIMIT && (
        <button type="button" class="link-btn tasks-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show ${current.length - LIMIT} more`}
        </button>
      )}

      {done.length + dropped.length > 0 && (
        <ul class="task-list task-list-done">
          {done.map((t) => (
            <TaskRow key={t.id} task={t} day={day} mode="done" index={index} />
          ))}
          {dropped.map((t) => (
            <TaskRow key={t.id} task={t} day={day} mode="dropped" index={index} />
          ))}
        </ul>
      )}

      {total + dropped.length === 0 && (
        <p class="small muted tasks-hint">{isToday ? 'Nothing on your list yet.' : 'No tasks on this day.'}</p>
      )}

      {upcoming.length > 0 && (
        <div class="tasks-upcoming">
          <button type="button" class="link-btn" aria-expanded={showUpcoming} onClick={() => setShowUpcoming(!showUpcoming)}>
            {showUpcoming ? '▾' : '▸'} Upcoming ({upcoming.length})
          </button>
          {showUpcoming && (
            <ul class="task-list">
              {upcoming.map((t) => (
                <TaskRow key={t.id} task={t} day={day} mode="upcoming" index={index} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
