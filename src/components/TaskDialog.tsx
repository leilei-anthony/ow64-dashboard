import { useEffect, useRef, useState } from 'preact/hooks';
import type { Recurrence, Subtask, Task } from '../model/types';
import { uid } from '../model/ids';
import { settings, tasks, today } from '../storage/store';
import { deleteTask, editTask } from '../storage/tasks';
import { addDays, dayOfWeek, isDayKey } from '../lib/dates';
import { taskStart } from '../lib/tasks';
import { taskDialog } from '../ui';
import { ActionOptionGroups } from './ActionOptions';
import { IconX } from './icons';
import { Modal } from './Modal';

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type RepeatKind = 'none' | Recurrence['kind'];

const close = () => (taskDialog.value = null);

function TaskForm({ task, focusDate }: { task: Task; focusDate: boolean }) {
  const start = taskStart(task);
  const [text, setText] = useState(task.text);
  const [date, setDate] = useState(task.scheduledFor ?? '');
  const [countdown, setCountdown] = useState(!!task.countdown);
  const [actionId, setActionId] = useState(task.actionId ?? '');
  const [repeat, setRepeat] = useState<RepeatKind>(task.recurrence?.kind ?? 'none');
  const [days, setDays] = useState<number[]>(task.recurrence?.kind === 'weekly' ? task.recurrence.days : [dayOfWeek(start)]);
  const [monthDay, setMonthDay] = useState(task.recurrence?.kind === 'monthly' ? task.recurrence.day : Number(start.slice(8)));
  const [steps, setSteps] = useState<Subtask[]>(task.subtasks);
  const [newStep, setNewStep] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dateRef = useRef<HTMLInputElement>(null);
  const tday = today.value;
  const ws = settings.value.weekStartsOn;
  const weekOrder = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);

  useEffect(() => {
    if (focusDate) dateRef.current?.focus();
  }, []);

  const addStep = () => {
    if (!newStep.trim()) return;
    setSteps([...steps, { id: uid(), text: newStep.trim(), done: false }]);
    setNewStep('');
  };

  const save = (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return setError('Give the task a name.');
    if (repeat === 'weekly' && !days.length) return setError('Pick at least one day to repeat on.');
    const pendingStep = newStep.trim() ? [{ id: uid(), text: newStep.trim(), done: false }] : [];
    const scheduled = isDayKey(date) ? date : undefined;
    editTask(task.id, {
      text: text.trim(),
      scheduledFor: scheduled,
      countdown: scheduled && countdown ? true : undefined,
      actionId: actionId || undefined,
      recurrence:
        repeat === 'weekly'
          ? { kind: 'weekly', days }
          : repeat === 'monthly'
            ? { kind: 'monthly', day: Math.min(31, Math.max(1, Math.round(monthDay) || 1)) }
            : undefined,
      subtasks: [...steps.filter((s) => s.text.trim()), ...pendingStep],
    });
    close();
  };

  return (
    <Modal title="Edit task" onClose={close}>
      <form class="form" onSubmit={save}>
        <label>
          Task
          <input value={text} autoFocus={!focusDate} onInput={(e) => setText(e.currentTarget.value)} />
        </label>

        <div class="field-group">
          <span class="field-label">Scheduled for</span>
          <div class="form-row form-row-wrap">
            <input
              ref={dateRef}
              type="date"
              value={date}
              aria-label="Scheduled date"
              onInput={(e) => setDate(e.currentTarget.value)}
            />
            <button type="button" class="btn btn-small" onClick={() => setDate(tday)}>
              Today
            </button>
            <button type="button" class="btn btn-small" onClick={() => setDate(addDays(tday, 1))}>
              Tomorrow
            </button>
            {date && (
              <button type="button" class="btn btn-small" onClick={() => setDate('')}>
                Clear
              </button>
            )}
          </div>
          <p class="form-hint">
            {date
              ? 'Hidden until then. If it isn’t done that day, it carries over.'
              : 'No date: it’s on your list from the day you added it.'}
          </p>
          <label class="toggle">
            <input type="checkbox" checked={countdown} disabled={!date} onChange={(e) => setCountdown(e.currentTarget.checked)} />
            Show it in Countdowns
          </label>
        </div>

        <label>
          Counts toward
          <select value={actionId} onChange={(e) => setActionId(e.currentTarget.value)}>
            <option value="">No chart action</option>
            <ActionOptionGroups alsoInclude={task.actionId} />
          </select>
        </label>

        <div class="field-group">
          <label>
            Repeat
            <select value={repeat} onChange={(e) => setRepeat(e.currentTarget.value as RepeatKind)}>
              <option value="none">Doesn’t repeat</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {repeat === 'weekly' && (
            <div class="weekdays" role="group" aria-label="Repeat on">
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
          {repeat === 'monthly' && (
            <label class="narrow">
              Day of the month
              <input
                type="number"
                min={1}
                max={31}
                value={monthDay}
                onInput={(e) => setMonthDay(Number(e.currentTarget.value))}
              />
            </label>
          )}
          {repeat !== 'none' && (
            <p class="form-hint">When you finish or drop it, the next one is scheduled. Unfinished ones carry over.</p>
          )}
        </div>

        <div class="field-group">
          <span class="field-label">Steps</span>
          {steps.length > 0 && (
            <ul class="step-list">
              {steps.map((s) => (
                <li key={s.id}>
                  <input
                    value={s.text}
                    aria-label="Step"
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setSteps(steps.map((x) => (x.id === s.id ? { ...x, text: value } : x)));
                    }}
                  />
                  <button
                    type="button"
                    class="icon-btn icon-btn-small"
                    aria-label={`Remove step ${s.text}`}
                    onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}
                  >
                    <IconX width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            value={newStep}
            placeholder="Add a step and press Enter"
            aria-label="New step"
            onInput={(e) => setNewStep(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addStep();
              }
            }}
          />
        </div>

        {error && <p class="form-error">{error}</p>}
        <div class="form-actions">
          <button
            type="button"
            class="btn btn-danger-quiet"
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              deleteTask(task.id);
              close();
            }}
          >
            {confirmDelete ? 'Click again to delete' : 'Delete'}
          </button>
          <span class="spacer" />
          <button type="button" class="btn" onClick={close}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TaskDialog() {
  const state = taskDialog.value;
  const task = state && tasks.value.find((t) => t.id === state.id);
  return task ? <TaskForm key={task.id} task={task} focusDate={state.focus === 'date'} /> : null;
}
