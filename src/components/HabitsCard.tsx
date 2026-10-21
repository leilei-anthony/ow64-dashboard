import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { DayKey, Habit, HabitTime } from '../model/types';
import { habitLog, habits, settings, today, viewDay } from '../storage/store';
import { STARTER_HABITS, addHabit, archiveHabit, reorderHabit, restoreHabit, stepHabit, toggleHabit } from '../storage/habits';
import { shortDate } from '../lib/dates';
import { HABIT_TIMES, daySummary, groupByTime, habitStreak, habitValue, isDoneOn, isDue, isMet, weekProgress } from '../lib/habits';
import { habitDialog, openMenu } from '../ui';
import { IconPlus } from './icons';

const TIME_LABEL: Record<HabitTime, string> = { morning: 'Morning', anytime: 'Anytime', evening: 'Evening' };

const edit = (h: Habit) => (habitDialog.value = { id: h.id });

function Streak({ h, day }: { h: Habit; day: DayKey }) {
  const n = habitStreak(h, habitLog.value, day, settings.value.weekStartsOn);
  if (!n) return null;
  const unit = h.schedule.kind === 'weekly' ? 'week' : h.kind === 'avoid' ? 'clean day' : 'day';
  return (
    <span class="habit-streak" title={`${n} ${unit}${n === 1 ? '' : 's'} in a row`}>
      🔥 {n}
    </span>
  );
}

function HabitRow({ h, day, drag }: { h: Habit; day: DayKey; drag?: JSX.HTMLAttributes<HTMLLIElement> }) {
  const log = habitLog.value;
  const ws = settings.value.weekStartsOn;
  const value = habitValue(log, day, h.id);
  const met = isMet(h, log, day);
  const done = isDoneOn(h, log, day, ws);
  const weekly = h.schedule.kind === 'weekly' ? weekProgress(h, log, day, ws) : null;
  const slipped = h.kind === 'avoid' && value > 0;
  const name = (
    <button type="button" class="habit-name" title="Edit habit" onClick={() => edit(h)}>
      {h.name}
    </button>
  );

  let lead: JSX.Element;
  let meta: JSX.Element | null = null;
  let action: JSX.Element | null = null;
  if (h.kind === 'count') {
    const target = h.target ?? 1;
    lead = (
      <button type="button" class={`habit-step${met ? ' is-met' : ''}`} aria-label={`One more: ${h.name}`} onClick={() => stepHabit(day, h.id, 1)}>
        <IconPlus width={12} height={12} />
      </button>
    );
    meta = (
      <span class="habit-meta">
        <span class="habit-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
        </span>
        {value}/{target}
        {h.unit ? ` ${h.unit}` : ''}
      </span>
    );
    action = value > 0 ? (
      <button type="button" class="habit-undo" aria-label={`One less: ${h.name}`} title="One less" onClick={() => stepHabit(day, h.id, -1)}>
        −
      </button>
    ) : null;
  } else if (h.kind === 'avoid') {
    lead = (
      <span class={`habit-avoid${slipped ? ' is-slipped' : ''}`} aria-hidden="true">
        {slipped ? '✕' : '✓'}
      </span>
    );
    meta = <span class="habit-meta">{slipped ? 'Slipped' : 'Clean so far'}</span>;
    action = (
      <button type="button" class="btn btn-small habit-slip" onClick={() => toggleHabit(day, h.id)}>
        {slipped ? 'Undo' : 'Slipped'}
      </button>
    );
  } else {
    lead = <input type="checkbox" checked={met} aria-label={`Done: ${h.name}`} onChange={() => toggleHabit(day, h.id)} />;
  }
  if (weekly) {
    meta = (
      <span class="habit-meta">
        {weekly.met ? 'Done for the week ✓' : `${weekly.count}/${weekly.target} this week`}
      </span>
    );
  }

  return (
    <li
      {...drag}
      class={['habit', `kind-${h.kind}`, done && 'is-done', slipped && 'is-slipped', drag?.class].filter(Boolean).join(' ')}
      onContextMenu={(e) =>
        openMenu(e, [
          { label: 'Edit…', onSelect: () => edit(h) },
          { label: 'Archive (keep history)', onSelect: () => archiveHabit(h.id) },
        ])
      }
    >
      {lead}
      <div class="habit-body">
        {name}
        {meta}
      </div>
      {action}
      <Streak h={h} day={day} />
    </li>
  );
}

function Starters() {
  const names = new Set(habits.value.map((h) => h.name));
  const left = STARTER_HABITS.filter((s) => !names.has(s.name));
  return (
    <div class="habit-starters">
      <p class="muted small">Start with a few small routines:</p>
      <div class="btn-row">
        {left.map((s) => (
          <button key={s.name} type="button" class="chip-btn" onClick={() => addHabit(s)}>
            {s.name}
            {s.kind === 'count' ? ` ×${s.target}` : ''}
          </button>
        ))}
        <button type="button" class="chip-btn" onClick={() => (habitDialog.value = { id: null })}>
          + Add your own
        </button>
      </div>
    </div>
  );
}

export function HabitsCard() {
  const day = viewDay.value;
  const isToday = day === today.value;
  const ws = settings.value.weekStartsOn;
  const all = habits.value;
  const log = habitLog.value;
  const tracked = all.filter((h) => !h.archivedAt);
  const archived = all.filter((h) => h.archivedAt);
  const groups = groupByTime(all.filter((h) => isDue(h, day)));
  const { done, total } = daySummary(all, log, day, ws);
  const [expanded, setExpanded] = useState<Partial<Record<HabitTime, boolean>>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const dragProps = (h: Habit): JSX.HTMLAttributes<HTMLLIElement> => ({
    draggable: true,
    class: [dragId === h.id && 'is-dragging', overId === h.id && dragId !== h.id && 'is-over'].filter(Boolean).join(' '),
    onDragStart: (e) => {
      setDragId(h.id);
      e.dataTransfer!.effectAllowed = 'move';
      e.dataTransfer!.setData('text/plain', h.name);
    },
    onDragOver: (e) => {
      if (!dragId) return;
      e.preventDefault();
      setOverId(h.id);
    },
    onDrop: (e) => {
      e.preventDefault();
      if (dragId) reorderHabit(dragId, h.id);
      setDragId(null);
      setOverId(null);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverId(null);
    },
  });

  return (
    <section class="panel habits">
      <div class="habits-head">
        <h2>Habits · {isToday ? 'Today' : shortDate(day)}</h2>
        {total > 0 && (
          <span class="tasks-count">
            <strong>{done}</strong>/{total}
          </span>
        )}
        <button type="button" class="icon-btn icon-btn-small" aria-label="Add a habit" title="Add a habit" onClick={() => (habitDialog.value = { id: null })}>
          <IconPlus width={15} height={15} />
        </button>
      </div>

      {tracked.length < 3 && <Starters />}

      {HABIT_TIMES.map((time) => {
        const list = groups[time];
        if (!list.length) return null;
        // Avoid habits are never "finished" during the day, so they don't decide collapsing
        // and stay visible (with their Slipped button) even when the section is collapsed.
        const doable = list.filter((h) => h.kind !== 'avoid');
        const allDone = doable.length > 0 && doable.every((h) => isDoneOn(h, log, day, ws));
        const open = !allDone || expanded[time];
        const rows = open ? list : list.filter((h) => h.kind === 'avoid');
        return (
          <div key={time} class="habit-group">
            {allDone ? (
              <button type="button" class="habit-group-head" aria-expanded={!!open} onClick={() => setExpanded({ ...expanded, [time]: !open })}>
                {open ? '▾' : '▸'} {TIME_LABEL[time]} <span class="habit-group-done">✓ {doable.length}</span>
              </button>
            ) : (
              <h3 class="habit-group-head">{TIME_LABEL[time]}</h3>
            )}
            {rows.length > 0 && (
              <ul class="habit-list">
                {rows.map((h) => (
                  <HabitRow key={h.id} h={h} day={day} drag={dragProps(h)} />
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {tracked.length > 0 && total === 0 && (
        <p class="muted small">No habits scheduled {isToday ? 'today' : 'that day'}.</p>
      )}

      {archived.length > 0 && (
        <div class="habit-archived">
          <button type="button" class="link-btn" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {showArchived && (
            <ul class="habit-list">
              {archived.map((h) => (
                <li key={h.id} class="habit is-archived">
                  <span class="habit-name">{h.name}</span>
                  <span class="muted small">since {shortDate(h.archivedAt!)}</span>
                  <button type="button" class="btn btn-small" onClick={() => restoreHabit(h.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
