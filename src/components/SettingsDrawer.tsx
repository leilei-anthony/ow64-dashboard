import { useRef, useState } from 'preact/hooks';
import { SECTION_IDS, type SectionId, type Settings } from '../model/types';
import { blankChart, seedChart } from '../model/seed';
import { calendarSources, chart, freshData, quickLinks, replaceAll, settings, snapshot, today, updateSettings } from '../storage/store';
import { makeBackup, parseBackup, type ParsedBackup } from '../storage/backup';
import { daysBetween } from '../lib/dates';
import { resolveTop3Action } from '../lib/tasks';
import { actionIndex } from '../lib/stats';
import { STALE_CHOICES } from '../storage/normalize';
import { editMode, settingsOpen } from '../ui';
import { ActionOptionGroups } from './ActionOptions';
import { CalendarSettings } from './CalendarSettings';
import { PomodoroSettingsSection } from './PomodoroSettings';
import { Modal } from './Modal';

const hourLabel = (h: number) => (h === 0 ? '12 AM (midnight)' : h < 12 ? `${h} AM` : '12 PM (noon)');

function Toggle({ label, field }: { label: string; field: keyof Settings }) {
  return (
    <label class="toggle">
      <input
        type="checkbox"
        checked={!!settings.value[field]}
        onChange={(e) => updateSettings({ [field]: e.currentTarget.checked })}
      />
      {label}
    </label>
  );
}

function exportBackup() {
  const json = makeBackup(snapshot(), new Date());
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ow64-backup-${today.value}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  updateSettings({ lastBackupAt: today.value });
}

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const last = settings.value.lastBackupAt;
  const age = last ? daysBetween(last, today.value) : null;
  const stale = age === null || age > 14;

  return (
    <section class="settings-section">
      <h3>Backup</h3>
      <p class="muted small">
        Everything is stored only in this browser. Uninstalling the extension or clearing its data deletes it, so export
        a backup now and then. Calendar links aren't included; you'd paste them again.
      </p>
      <p class={`small ${stale ? 'warn' : 'muted'}`}>
        Last backup: {age === null ? 'never' : age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} ago`}
      </p>
      <div class="btn-row">
        <button type="button" class="btn btn-primary" onClick={exportBackup}>
          Export backup
        </button>
        <button type="button" class="btn" onClick={() => fileRef.current?.click()}>
          Import backup…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) setParsed(parseBackup(await file.text()));
          }}
        />
      </div>
      {parsed && !parsed.ok && <p class="form-error">{parsed.error}</p>}
      {parsed?.ok && (
        <div class="confirm-box">
          <p>{parsed.summary}</p>
          <div class="btn-row">
            <button
              type="button"
              class="btn btn-danger"
              onClick={async () => {
                await replaceAll(parsed.data);
                setParsed(null);
              }}
            >
              Replace my data
            </button>
            <button type="button" class="btn" onClick={() => setParsed(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ResetSection() {
  const [pending, setPending] = useState<'seed' | 'blank' | null>(null);
  const reset = async () => {
    const chartFor = pending === 'blank' ? blankChart : seedChart;
    await replaceAll(freshData(chartFor(today.value), { quickLinks: quickLinks.value, settings: settings.value }));
    setPending(null);
  };
  return (
    <section class="settings-section">
      <h3>Start over</h3>
      {pending ? (
        <div class="confirm-box">
          <p>
            This erases your chart, all progress, notes, tasks, habits and countdowns. Quick links and settings are kept.
            Export a backup first if you're unsure.
          </p>
          <div class="btn-row">
            <button type="button" class="btn btn-danger" onClick={reset}>
              Erase and {pending === 'blank' ? 'start blank' : 'reset'}
            </button>
            <button type="button" class="btn" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div class="btn-row">
          <button type="button" class="btn" onClick={() => setPending('seed')}>
            Reset to original chart
          </button>
          <button type="button" class="btn" onClick={() => setPending('blank')}>
            Start with a blank chart
          </button>
        </div>
      )}
    </section>
  );
}

const SECTION_LABELS: Record<SectionId, string> = {
  chart: 'OW64 chart',
  habits: 'Habits',
  tasks: 'Tasks',
  schedule: 'Schedule',
  countdowns: 'Countdowns',
  week: 'Stats',
  heatmap: 'Heatmap',
  notes: 'Notes',
};

function SectionsSection() {
  const { sections, sectionOrder: order } = settings.value;
  const [dragId, setDragId] = useState<SectionId | null>(null);
  const [overId, setOverId] = useState<SectionId | null>(null);
  const setSection = (id: SectionId, on: boolean) => {
    updateSettings({ sections: { ...sections, [id]: on } });
    if (id === 'chart' && !on) editMode.value = false;
  };
  const move = (id: SectionId, to: number) => {
    const next = order.filter((x) => x !== id);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
    updateSettings({ sectionOrder: next });
  };
  const isDefault = order.every((id, i) => id === SECTION_IDS[i]);

  return (
    <section class="settings-section">
      <h3>Dashboard sections</h3>
      <ol class="section-list">
        {order.map((id, i) => {
          const label = SECTION_LABELS[id];
          return (
            <li
              key={id}
              class={`section-row${dragId === id ? ' is-dragging' : ''}${overId === id && dragId !== id ? ' is-over' : ''}`}
              draggable
              onDragStart={(e) => {
                setDragId(id);
                e.dataTransfer!.effectAllowed = 'move';
                e.dataTransfer!.setData('text/plain', label);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverId(id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) move(dragId, i);
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
              <span class="drag-handle" aria-hidden="true">
                ⠿
              </span>
              <label class="toggle">
                <input type="checkbox" checked={sections[id]} onChange={(e) => setSection(id, e.currentTarget.checked)} />
                {label}
                {id === 'schedule' && !calendarSources.value.length && <span class="muted small">(needs a calendar)</span>}
              </label>
              <span class="section-move">
                <button type="button" class="icon-btn icon-btn-small" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(id, i - 1)}>
                  ↑
                </button>
                <button
                  type="button"
                  class="icon-btn icon-btn-small"
                  aria-label={`Move ${label} down`}
                  disabled={i === order.length - 1}
                  onClick={() => move(id, i + 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <p class="muted small">
        Drag to reorder, or use the arrows. On wide screens the chart keeps its own column: it's on the left unless it's
        last in this list, then it moves to the right.
      </p>
      {!isDefault && (
        <button type="button" class="link-btn" onClick={() => updateSettings({ sectionOrder: [...SECTION_IDS] })}>
          Reset order
        </button>
      )}
    </section>
  );
}

function TasksSection() {
  const s = settings.value;
  const autoId = resolveTop3Action(chart.value, 'auto');
  const autoName = autoId ? actionIndex(chart.value).get(autoId)?.text : undefined;
  return (
    <section class="settings-section">
      <h3>Tasks</h3>
      <label class="field">
        Flag carried-over tasks as stale after
        <select value={s.staleTaskDays} onChange={(e) => updateSettings({ staleTaskDays: Number(e.currentTarget.value) })}>
          {STALE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'Never' : `${n} days`}
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        Finishing all Top 3 tasks ticks
        <select value={s.top3ActionId} onChange={(e) => updateSettings({ top3ActionId: e.currentTarget.value })}>
          <option value="auto">{autoName ? `Automatic: “${autoName}”` : 'Automatic (no “top 3” action found)'}</option>
          <option value="none">Nothing</option>
          <ActionOptionGroups />
        </select>
      </label>
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ['H', 'Hide / show the dashboard'],
  ['E', 'Toggle edit mode'],
  ['← →', 'Previous / next day'],
  ['T', 'Back to today'],
  ['A', 'Add a task'],
  ['P', 'Focus view (pomodoro timer)'],
  ['Space / S', 'Focus view: start or pause / skip'],
  ['N', 'Write a note for the day'],
  ['Right-click', 'Cell menu: note, streak, heatmap filter'],
  ['Esc', 'Close dialogs and menus'],
];

export function SettingsDrawer() {
  if (!settingsOpen.value) return null;
  const s = settings.value;
  return (
    <Modal title="Settings" variant="drawer" onClose={() => (settingsOpen.value = false)}>
      <SectionsSection />
      <section class="settings-section">
        <h3>Tracking</h3>
        <label class="field">
          A new day starts at
          <select value={s.dayStartHour} onChange={(e) => updateSettings({ dayStartHour: Number(e.currentTarget.value) })}>
            {Array.from({ length: 13 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
        <p class="muted small">Ticks made before this hour count for the previous day.</p>
        <label class="field">
          Weeks start on
          <select
            value={s.weekStartsOn}
            onChange={(e) => updateSettings({ weekStartsOn: Number(e.currentTarget.value) === 0 ? 0 : 1 })}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </label>
      </section>

      <TasksSection />
      <PomodoroSettingsSection />
      <CalendarSettings />

      <section class="settings-section">
        <h3>New tab</h3>
        <Toggle label="Show clock" field="showClock" />
        <Toggle label="24-hour clock" field="clock24h" />
        <Toggle label="Show search box" field="showSearch" />
        <Toggle label="Also hide quick links when the dashboard is hidden" field="hideLinksWhenHidden" />
      </section>

      <BackupSection />
      <ResetSection />

      <section class="settings-section">
        <h3>Keyboard shortcuts</h3>
        <dl class="shortcuts">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Modal>
  );
}
