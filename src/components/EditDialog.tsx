import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Cadence, CadenceKind } from '../model/types';
import { PILLAR_COLORS } from '../model/seed';
import { editAction, replaceAction, setGoal, updatePillar } from '../model/chartOps';
import { chart, logs, setCellNote, setChart, today } from '../storage/store';
import { isDayKey, shortDate } from '../lib/dates';
import { actionIndex } from '../lib/stats';
import { cellNoteTarget, editTarget, type EditTarget } from '../ui';
import { Modal } from './Modal';

const close = () => (editTarget.value = null);

function Actions({ children }: { children: ComponentChildren }) {
  return (
    <div class="form-actions">
      {children}
      <button type="button" class="btn" onClick={close}>
        Cancel
      </button>
    </div>
  );
}

function GoalForm() {
  const goal = chart.value.goal;
  const [text, setText] = useState(goal.text);
  const [date, setDate] = useState(goal.targetDate ?? '');
  return (
    <Modal title="Edit goal" onClose={close}>
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault();
          setChart(setGoal(chart.value, { text: text.trim(), ...(isDayKey(date) ? { targetDate: date } : {}) }));
          close();
        }}
      >
        <label>
          Your main goal
          <textarea rows={2} value={text} autoFocus onInput={(e) => setText(e.currentTarget.value)} />
        </label>
        <label>
          Target date <span class="muted">(drives the countdown)</span>
          <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </label>
        <Actions>
          <span class="spacer" />
          <button type="submit" class="btn btn-primary">
            Save
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

function PillarForm({ pi }: { pi: number }) {
  const pillar = chart.value.pillars[pi];
  const [title, setTitle] = useState(pillar.title);
  const [color, setColor] = useState(pillar.color);
  const swatches = PILLAR_COLORS.includes(pillar.color) ? PILLAR_COLORS : [...PILLAR_COLORS, pillar.color];
  return (
    <Modal title="Edit pillar" onClose={close}>
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault();
          setChart(updatePillar(chart.value, pi, { title: title.trim(), color }));
          close();
        }}
      >
        <label>
          Pillar name
          <input value={title} autoFocus onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <fieldset class="swatches">
          <legend>Color</legend>
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              class={`swatch${c.toLowerCase() === color.toLowerCase() ? ' is-active' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
          <label class="swatch-custom" title="Custom color">
            <input type="color" value={color} onInput={(e) => setColor(e.currentTarget.value)} />
            Custom
          </label>
        </fieldset>
        <Actions>
          <span class="spacer" />
          <button type="submit" class="btn btn-primary">
            Save
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

const KINDS: { kind: CadenceKind; label: string }[] = [
  { kind: 'anytime', label: 'Anytime (no target)' },
  { kind: 'daily', label: 'Every day' },
  { kind: 'weekly', label: 'Times per week' },
  { kind: 'monthly', label: 'Times per month' },
  { kind: 'milestone', label: 'One-time milestone' },
];

function toCadence(kind: CadenceKind, times: number): Cadence {
  if (kind === 'weekly' || kind === 'monthly') return { kind, times: Math.min(31, Math.max(1, times || 1)) };
  return { kind };
}

function ActionForm({ pi, ai }: { pi: number; ai: number }) {
  const pillar = chart.value.pillars[pi];
  const action = pillar.actions[ai];
  const [text, setText] = useState(action.text);
  const [kind, setKind] = useState<CadenceKind>(action.cadence.kind);
  const [times, setTimes] = useState('times' in action.cadence ? action.cadence.times : 1);
  const hasHistory = Object.values(logs.value).some((e) => e.done.includes(action.id));
  const wasEmpty = !action.text.trim();

  const cadence = toCadence(kind, times);
  const saveInPlace = (e: Event) => {
    e.preventDefault();
    setChart(editAction(chart.value, pi, ai, text.trim(), cadence));
    close();
  };
  const replace = () => {
    setChart(replaceAction(chart.value, pi, ai, text.trim(), cadence, today.value));
    close();
  };

  return (
    <Modal title={wasEmpty ? `New action · ${pillar.title}` : `Edit action · ${pillar.title}`} onClose={close}>
      <form class="form" onSubmit={saveInPlace}>
        <label>
          Action
          <input value={text} autoFocus placeholder="e.g. Read 1 paper weekly" onInput={(e) => setText(e.currentTarget.value)} />
        </label>
        <div class="form-row">
          <label class="grow">
            Target
            <select value={kind} onChange={(e) => setKind(e.currentTarget.value as CadenceKind)}>
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          {(kind === 'weekly' || kind === 'monthly') && (
            <label class="narrow">
              Times
              <input
                type="number"
                min={1}
                max={31}
                value={times}
                onInput={(e) => setTimes(Number(e.currentTarget.value))}
              />
            </label>
          )}
        </div>
        {hasHistory && (
          <p class="form-hint">
            <strong>Save</strong> keeps this cell's history (use it for rewording or a new target).{' '}
            <strong>Replace</strong> starts a fresh action with an empty history; the old one stays in past days of the
            heatmap.
          </p>
        )}
        <Actions>
          {hasHistory && (
            <button type="button" class="btn" disabled={!text.trim()} onClick={replace}>
              Replace
            </button>
          )}
          <span class="spacer" />
          <button type="submit" class="btn btn-primary">
            Save
          </button>
        </Actions>
      </form>
    </Modal>
  );
}

function targetKey(t: EditTarget) {
  return t.kind === 'action' ? `a${t.pi}-${t.ai}` : t.kind === 'pillar' ? `p${t.pi}` : 'goal';
}

export function EditDialog() {
  const t = editTarget.value;
  if (!t) return null;
  if (t.kind === 'goal') return <GoalForm key={targetKey(t)} />;
  if (t.kind === 'pillar') return <PillarForm key={targetKey(t)} pi={t.pi} />;
  return <ActionForm key={targetKey(t)} pi={t.pi} ai={t.ai} />;
}

function CellNoteForm({ actionId, day }: { actionId: string; day: string }) {
  const existing = logs.value[day]?.cellNotes?.[actionId] ?? '';
  const [text, setText] = useState(existing);
  const name = actionIndex(chart.value).get(actionId)?.text ?? 'Action';
  const done = () => (cellNoteTarget.value = null);
  return (
    <Modal title={`Note · ${name} · ${shortDate(day)}`} onClose={done}>
      <form
        class="form"
        onSubmit={(e) => {
          e.preventDefault();
          setCellNote(day, actionId, text);
          done();
        }}
      >
        <textarea rows={4} value={text} autoFocus onInput={(e) => setText(e.currentTarget.value)} />
        <div class="form-actions">
          {existing && (
            <button
              type="button"
              class="btn btn-danger-quiet"
              onClick={() => {
                setCellNote(day, actionId, '');
                done();
              }}
            >
              Delete note
            </button>
          )}
          <span class="spacer" />
          <button type="button" class="btn" onClick={done}>
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

export function CellNoteDialog() {
  const t = cellNoteTarget.value;
  return t ? <CellNoteForm key={`${t.actionId}-${t.day}`} actionId={t.actionId} day={t.day} /> : null;
}
