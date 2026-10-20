import type { Action, Pillar } from '../model/types';
import { chart, logs, settings, today, toggleDone, viewDay } from '../storage/store';
import { isDone, milestoneDoneOn, periodProgress } from '../lib/cadence';
import { currentStreak, streakLabel } from '../lib/streaks';
import { pillarWeekCompletion } from '../lib/stats';
import { daysBetween, shortDate } from '../lib/dates';
import { cellNoteTarget, editMode, editTarget, goToDay, heatFilter, openMenu } from '../ui';

// Grid positions 0–8 inside a 3×3 block; 4 is the center.
const ACTION_SLOTS = [0, 1, 2, 3, 5, 6, 7, 8];

function ActionCell({ pillar, pi, ai, action }: { pillar: Pillar; pi: number; ai: number; action: Action }) {
  const day = viewDay.value;
  const allLogs = logs.value;
  const editing = editMode.value;
  const empty = !action.text.trim();
  const done = isDone(allLogs, day, action.id);
  const progress = empty ? null : periodProgress(action, allLogs, day, settings.value.weekStartsOn);
  const isMilestone = action.cadence.kind === 'milestone';
  const milestoneOn = isMilestone ? milestoneDoneOn(allLogs, action.id) : undefined;
  const milestoneMet = !!milestoneOn && milestoneOn <= day;
  const note = allLogs[day]?.cellNotes?.[action.id];
  const filtered = heatFilter.value.kind === 'action' && heatFilter.value.actionId === action.id;

  const onClick = (e: MouseEvent) => {
    if (editing || empty) {
      editTarget.value = { kind: 'action', pi, ai };
      return;
    }
    // A milestone is done once; ticking it on another day offers to move it instead.
    if (isMilestone && milestoneOn && milestoneOn !== day) {
      openMenu(e, [
        { label: `Completed ${shortDate(milestoneOn)}`, info: true },
        { label: `Go to ${shortDate(milestoneOn)}`, onSelect: () => goToDay(milestoneOn) },
        {
          label: `Move completion to ${shortDate(day)}`,
          onSelect: () => {
            toggleDone(milestoneOn, action.id);
            toggleDone(day, action.id);
          },
        },
      ]);
      return;
    }
    toggleDone(day, action.id);
  };

  const onContextMenu = (e: MouseEvent) => {
    if (editing) return;
    if (empty) {
      e.preventDefault();
      return;
    }
    const streak = currentStreak(action, allLogs, today.value, settings.value.weekStartsOn);
    openMenu(e, [
      ...(streak?.value
        ? [{ label: `Streak: ${streak.value} ${streak.unit}${streak.value === 1 ? '' : 's'}`, info: true }]
        : []),
      { label: note ? 'Edit note…' : 'Add note…', onSelect: () => (cellNoteTarget.value = { actionId: action.id, day }) },
      {
        label: filtered ? 'Show all in heatmap' : 'Show in heatmap',
        onSelect: () => (heatFilter.value = filtered ? { kind: 'all' } : { kind: 'action', actionId: action.id }),
      },
      { label: 'Edit or replace action…', onSelect: () => (editTarget.value = { kind: 'action', pi, ai }) },
    ]);
  };

  const streak = !empty && done ? currentStreak(action, allLogs, day, settings.value.weekStartsOn) : null;
  const cls = [
    'cell',
    done && 'is-done',
    milestoneMet && 'is-milestone-done',
    !done && progress?.met && action.cadence.kind !== 'milestone' && 'is-met',
    empty && 'is-empty',
    filtered && 'is-filtered',
  ]
    .filter(Boolean)
    .join(' ');

  const title = empty
    ? 'Empty cell — click to add an action'
    : [action.text, progress && `${progress.count}/${progress.target} this period`, note && `Note: ${note}`]
        .filter(Boolean)
        .join('\n');

  return (
    <button
      type="button"
      class={cls}
      style={{ '--pc': pillar.color }}
      aria-pressed={empty ? undefined : done}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span class="cell-text">{empty ? (editing ? '+' : '') : action.text}</span>
      {progress && <span class="cell-meta">{progress.label}</span>}
      {!progress && streak && streak.value > 1 && <span class="cell-meta">{streakLabel(streak)}</span>}
      {(done || milestoneMet) && <span class="cell-check" aria-hidden="true">✓</span>}
      {note && <span class="cell-note-dot" aria-hidden="true" />}
    </button>
  );
}

function PillarCell({ pillar, pi }: { pillar: Pillar; pi: number }) {
  const active = heatFilter.value.kind === 'pillar' && heatFilter.value.pillarId === pillar.id;
  const week = pillarWeekCompletion(pillar, logs.value, viewDay.value, settings.value.weekStartsOn);
  const pct = Math.round(week.ratio * 100);
  return (
    <button
      type="button"
      class={`cell pillar${active ? ' is-active' : ''}`}
      style={{ '--pc': pillar.color }}
      aria-pressed={active}
      title={`${pillar.title}\n${week.met} of ${week.target} weekly targets met (${pct}%)\nClick to filter the heatmap`}
      onClick={() => {
        if (editMode.value) editTarget.value = { kind: 'pillar', pi };
        else heatFilter.value = active ? { kind: 'all' } : { kind: 'pillar', pillarId: pillar.id };
      }}
    >
      <span class="cell-text">{pillar.title}</span>
      <span class="pillar-bar" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

function GoalCell() {
  const goal = chart.value.goal;
  const days = goal.targetDate ? daysBetween(today.value, goal.targetDate) : null;
  return (
    <button
      type="button"
      class="goal"
      title={editMode.value ? 'Edit your goal' : 'Show all pillars in the heatmap'}
      onClick={() => {
        if (editMode.value) editTarget.value = { kind: 'goal' };
        else heatFilter.value = { kind: 'all' };
      }}
    >
      <span class="goal-text">{goal.text || 'Set your main goal'}</span>
      {days !== null && (
        <span class="goal-sub">
          {days > 0 ? `${days.toLocaleString()} days to go` : days === 0 ? 'Today' : `${-days} days ago`}
        </span>
      )}
    </button>
  );
}

function Block({ pillar, pi }: { pillar: Pillar; pi: number }) {
  return (
    <div class="block">
      {Array.from({ length: 9 }, (_, pos) => {
        if (pos === 4) return <PillarCell key="pillar" pillar={pillar} pi={pi} />;
        const ai = ACTION_SLOTS.indexOf(pos);
        const action = pillar.actions[ai];
        return <ActionCell key={action.id} pillar={pillar} pi={pi} ai={ai} action={action} />;
      })}
    </div>
  );
}

export function Matrix() {
  const pillars = chart.value.pillars;
  return (
    <div class="matrix-card">
      <div class={`matrix${editMode.value ? ' is-editing' : ''}`}>
        {Array.from({ length: 9 }, (_, b) => {
          if (b === 4) return <GoalCell key="goal" />;
          const pi = b < 4 ? b : b - 1;
          return <Block key={pillars[pi].id} pillar={pillars[pi]} pi={pi} />;
        })}
      </div>
    </div>
  );
}
