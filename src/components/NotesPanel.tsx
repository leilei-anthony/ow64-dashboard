import { useEffect, useRef, useState } from 'preact/hooks';
import { chart, logs, setNote, viewDay } from '../storage/store';
import { shortDate } from '../lib/dates';
import { actionIndex } from '../lib/stats';
import { cellNoteTarget } from '../ui';

export function NotesPanel() {
  const day = viewDay.value;
  const entry = logs.value[day];
  const stored = entry?.note ?? '';
  const [text, setText] = useState(stored);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef<{ day: string; text: string } | null>(null);

  const save = () => {
    clearTimeout(timer.current);
    if (dirty.current) setNote(dirty.current.day, dirty.current.text);
    dirty.current = null;
  };

  // Switching days: save what was typed, then load the new day's note.
  useEffect(() => {
    save();
    setText(logs.value[day]?.note ?? '');
  }, [day]);

  // Pick up edits from another tab, but never while typing here.
  useEffect(() => {
    if (!focused.current && !dirty.current) setText(stored);
  }, [stored]);

  useEffect(() => save, []);

  const index = actionIndex(chart.value);
  const cellNotes = Object.entries(entry?.cellNotes ?? {});
  const pillarColor = (pillarId: string) => chart.value.pillars.find((p) => p.id === pillarId)?.color ?? '#888';

  return (
    <section class="panel">
      <h2>Notes · {shortDate(day)}</h2>
      <textarea
        id="day-note"
        class="note-input"
        value={text}
        rows={10}
        placeholder="How did today go? (N)"
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          save();
        }}
        onInput={(e) => {
          const value = e.currentTarget.value;
          setText(value);
          dirty.current = { day, text: value };
          clearTimeout(timer.current);
          timer.current = setTimeout(save, 400);
        }}
      />
      {cellNotes.length > 0 && (
        <ul class="cell-notes">
          {cellNotes.map(([actionId, note]) => {
            const info = index.get(actionId);
            return (
              <li key={actionId}>
                <button type="button" onClick={() => (cellNoteTarget.value = { actionId, day })}>
                  <span class="dot" style={{ background: pillarColor(info?.pillarId ?? '') }} />
                  <strong>{info?.text ?? 'Removed action'}</strong>
                  <span class="cell-note-text">{note}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
