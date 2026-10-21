import { useState } from 'preact/hooks';
import type { Habit, HabitKind, HabitSchedule, HabitTime } from '../model/types';
import { habitLog, habits, settings, today } from '../storage/store';
import { addHabit, archiveHabit, deleteHabit, editHabit, type HabitDraft } from '../storage/habits';
import { addDays, shortDate } from '../lib/dates';
import { habitValue, isActive, isMet, isScheduled } from '../lib/habits';
import { habitDialog } from '../ui';
import { Modal } from './Modal';

const KINDS: { kind: HabitKind; label: string; hint: string }[] = [
  { kind: 'check', label: 'Yes / no', hint: 'Tick it when it’s done.' },
  { kind: 'count', label: 'Count', hint: 'Tap + toward a daily target, like 8 glasses.' },
  { kind: 'avoid', label: 'Avoid', hint: 'Mark the days you slip. The streak counts clean days.' },
];
const TIMES: { time: HabitTime; label: string }[] = [
  { time: 'morning', label: 'Morning' },
  { time: 'anytime', label: 'Anytime' },
  { time: 'evening', label: 'Evening' },
];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type ScheduleKind = HabitSchedule['kind'];

const close = () => (habitDialog.value = null);

/** The last 28 days: done, missed, slipped, or not tracked that day. */
function HistoryStrip({ habit }: { habit: Habit }) {
  const log = habitLog.value;
  const days = Array.from({ length: 28 }, (_, i) => addDays(today.value, i - 27));
  return (
    <div class="field-group">
      <span class="field-label">Last 4 weeks</span>
      <div class="habit-history" role="img" aria-label="Last 4 weeks of this habit">
        {days.map((d) => {
          const tracked = isActive(habit, d) && isScheduled(habit, d);
          const slipped = habit.kind === 'avoid' && habitValue(log, d, habit.id) > 0;
          const state = !tracked ? 'off' : slipped ? 'slipped' : isMet(habit, log, d) ? 'met' : d === today.value ? 'today' : 'missed';
          return <span key={d} class={`hist-${state}`} title={`${shortDate(d)}: ${state === 'off' ? 'not tracked' : state}`} />;
        })}
      </div>
    </div>
  );
}

function HabitForm({ habit }: { habit: Habit | null }) {
  const [name, setName] = useState(habit?.name ?? '');
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? 'check');
  const [target, setTarget] = useState(habit?.target ?? 8);
  const [unit, setUnit] = useState(habit?.unit ?? '');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>(habit?.schedule.kind ?? 'daily');
  const [days, setDays] = useState<number[]>(habit?.schedule.kind === 'days' ? habit.schedule.days : [1, 3, 5]);
  const [times, setTimes] = useState(habit?.schedule.kind === 'weekly' ? habit.schedule.times : 3);
  const [time, setTime] = useState<HabitTime>(habit?.time ?? 'anytime');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const ws = settings.value.weekStartsOn;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);

  const save = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the habit a name.');
    if (scheduleKind === 'days' && !days.length) return setError('Pick at least one day.');
    const schedule: HabitSchedule =
      scheduleKind === 'days'
        ? { kind: 'days', days: [...days].sort() }
        : scheduleKind === 'weekly'
          ? { kind: 'weekly', times: Math.min(7, Math.max(1, Math.round(times) || 1)) }
          : { kind: 'daily' };
    const draft: HabitDraft = {
      name: name.trim(),
      kind,
      ...(kind === 'count' ? { target: Math.min(999, Math.max(1, Math.round(target) || 1)) } : {}),
      ...(kind === 'count' && unit.trim() ? { unit: unit.trim() } : {}),
      schedule,
      time,
    };
    if (habit) editHabit(habit.id, draft);
    else addHabit(draft);
    close();
  };

  return (
    <Modal title={habit ? 'Edit habit' : 'New habit'} onClose={close}>
      <form class="form" onSubmit={save}>
        <label>
          Habit
          <input value={name} autoFocus placeholder="e.g. Take vitamins" onInput={(e) => setName(e.currentTarget.value)} />
        </label>

        <div class="field-group">
          <span class="field-label">Type</span>
          <div class="segmented" role="radiogroup" aria-label="Type">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} class={kind === k.kind ? 'is-on' : ''} onClick={() => setKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
          <p class="form-hint">{KINDS.find((k) => k.kind === kind)!.hint}</p>
          {kind === 'count' && (
            <div class="form-row">
              <label class="narrow">
                Daily target
                <input type="number" min={1} max={999} value={target} onInput={(e) => setTarget(Number(e.currentTarget.value))} />
              </label>
              <label class="grow">
                Unit
                <input value={unit} placeholder="glasses" onInput={(e) => setUnit(e.currentTarget.value)} />
              </label>
            </div>
          )}
        </div>

        <div class="field-group">
          <label>
            How often
            <select value={scheduleKind} onChange={(e) => setScheduleKind(e.currentTarget.value as ScheduleKind)}>
              <option value="daily">Every day</option>
              <option value="days">On these days</option>
              <option value="weekly">Times a week</option>
            </select>
          </label>
          {scheduleKind === 'days' && (
            <div class="weekdays" role="group" aria-label="Days">
              {weekOrder.map((d) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    class={`weekday${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[d]}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  >
                    {WEEKDAY_LETTERS[d]}
                  </button>
                );
              })}
            </div>
          )}
          {scheduleKind === 'weekly' && (
            <label class="narrow">
              Times a week
              <input type="number" min={1} max={7} value={times} onInput={(e) => setTimes(Number(e.currentTarget.value))} />
            </label>
          )}
        </div>

        <div class="field-group">
          <span class="field-label">Time of day</span>
          <div class="segmented" role="radiogroup" aria-label="Time of day">
            {TIMES.map((t) => (
              <button key={t.time} type="button" role="radio" aria-checked={time === t.time} class={time === t.time ? 'is-on' : ''} onClick={() => setTime(t.time)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {habit && <HistoryStrip habit={habit} />}

        {error && <p class="form-error">{error}</p>}
        <div class="form-actions">
          {habit && (
            <>
              <button
                type="button"
                class="btn btn-danger-quiet"
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  deleteHabit(habit.id);
                  close();
                }}
              >
                {confirmDelete ? 'Delete with its history?' : 'Delete'}
              </button>
              {!habit.archivedAt && (
                <button
                  type="button"
                  class="btn"
                  title="Stop tracking from today; keeps the history"
                  onClick={() => {
                    archiveHabit(habit.id);
                    close();
                  }}
                >
                  Archive
                </button>
              )}
            </>
          )}
          <span class="spacer" />
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            {habit ? 'Save' : 'Add habit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function HabitDialog() {
  const state = habitDialog.value;
  if (!state) return null;
  const habit = state.id ? habits.value.find((h) => h.id === state.id) ?? null : null;
  if (state.id && !habit) return null;
  return <HabitForm key={state.id ?? 'new'} habit={habit} />;
}
