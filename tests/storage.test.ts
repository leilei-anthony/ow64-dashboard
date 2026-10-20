import { describe, expect, it } from 'vitest';
import { seedChart, seedQuickLinks } from '../src/model/seed';
import { DEFAULT_SETTINGS, SCHEMA_VERSION, type AppData } from '../src/model/types';
import { fromStorageItems, logsKey, tasksDoneKey, toStorageItems, TASKS_KEY } from '../src/storage/serialize';
import { makeBackup, parseBackup } from '../src/storage/backup';
import { normalizeSettings, safeUrl } from '../src/storage/normalize';
import { replaceAction } from '../src/model/chartOps';
import { actionIndex } from '../src/lib/stats';

function sample(): AppData {
  const chart = seedChart('2026-10-13');
  const id = chart.pillars[0].actions[1].id;
  return {
    schemaVersion: SCHEMA_VERSION,
    chart,
    logs: {
      '2025-12-31': { done: [id] },
      '2026-10-13': { done: [id], note: 'Good day', cellNotes: { [id]: '20 cards' } },
    },
    countdowns: [{ id: 'c1', label: 'JLPT', date: '2026-12-06' }],
    quickLinks: seedQuickLinks(),
    tasks: [
      {
        id: 'open1',
        text: 'Email advisor',
        createdAt: '2026-10-10',
        actionId: id,
        subtasks: [{ id: 's1', text: 'Draft', done: true }],
        recurrence: { kind: 'weekly', days: [1, 4] },
      },
      { id: 'up1', text: 'Book JLPT seat', createdAt: '2026-10-10', scheduledFor: '2026-11-01', countdown: true, subtasks: [] },
      { id: 'done25', text: 'Old thing', createdAt: '2025-12-01', completedAt: '2025-12-30', subtasks: [] },
      { id: 'drop26', text: 'Never mind', createdAt: '2026-10-01', droppedAt: '2026-10-12', top3: '2026-10-12', subtasks: [] },
    ],
    settings: { ...DEFAULT_SETTINGS, matrixHidden: true },
  };
}

describe('storage layout', () => {
  it('splits logs into one key per year and round-trips', () => {
    const data = sample();
    const items = toStorageItems(data);
    expect(Object.keys(items[logsKey(2025)] as object)).toEqual(['2025-12-31']);
    expect(Object.keys(items[logsKey(2026)] as object)).toEqual(['2026-10-13']);
    expect(fromStorageItems(JSON.parse(JSON.stringify(items)))).toEqual(data);
  });

  it('keeps open tasks in one key and finished ones per year', () => {
    const items = toStorageItems(sample());
    expect((items[TASKS_KEY] as { id: string }[]).map((t) => t.id)).toEqual(['open1', 'up1']);
    expect((items[tasksDoneKey(2025)] as { id: string }[]).map((t) => t.id)).toEqual(['done25']);
    expect((items[tasksDoneKey(2026)] as { id: string }[]).map((t) => t.id)).toEqual(['drop26']);
  });

  it('never shows a task twice if an open copy outlived its finished one', () => {
    const items = toStorageItems(sample());
    items[TASKS_KEY] = [...(items[TASKS_KEY] as object[]), { id: 'done25', text: 'Old thing', createdAt: '2025-12-01', subtasks: [] }];
    const tasks = fromStorageItems(items)!.tasks.filter((t) => t.id === 'done25');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].completedAt).toBe('2025-12-30');
  });

  it('drops malformed tasks and fields', () => {
    const items = toStorageItems(sample());
    items[TASKS_KEY] = [
      { id: 'ok', text: 'Fine', createdAt: '2026-10-10', recurrence: { kind: 'weekly', days: [] }, scheduledFor: 'soon' },
      { id: 'bad', text: 'No date' },
      'nonsense',
    ];
    expect(fromStorageItems(items)!.tasks.filter((t) => !t.completedAt && !t.droppedAt)).toEqual([
      { id: 'ok', text: 'Fine', createdAt: '2026-10-10', subtasks: [] },
    ]);
  });

  it('keeps auto-ticks only when they are also ticked', () => {
    const items = toStorageItems(sample());
    items[logsKey(2026)] = { '2026-10-13': { done: ['a', 'b'], auto: ['b', 'c', 'b'] } };
    expect(fromStorageItems(items)!.logs['2026-10-13']).toEqual({ done: ['a', 'b'], auto: ['b'] });
  });

  it('treats storage without a chart as a first run', () => {
    expect(fromStorageItems({})).toBeNull();
  });

  it('fills in settings added in later versions', () => {
    expect(normalizeSettings({ dayStartHour: 2 })).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    expect(normalizeSettings({ dayStartHour: 40, weekStartsOn: 5 })).toEqual(DEFAULT_SETTINGS);
  });

  it('drops malformed log entries but keeps good ones', () => {
    const items = toStorageItems(sample());
    items[logsKey(2026)] = {
      '2026-10-13': { done: ['x', 'x', 7] },
      'not-a-day': { done: ['x'] },
      '2026-10-14': { done: [] },
    };
    expect(fromStorageItems(items)!.logs['2026-10-13']).toEqual({ done: ['x'] });
    expect(Object.keys(fromStorageItems(items)!.logs)).toEqual(['2025-12-31', '2026-10-13']);
  });
});

describe('backup', () => {
  it('round-trips through export and import', () => {
    const data = sample();
    const parsed = parseBackup(makeBackup(data, new Date('2026-10-13T12:00:00Z')));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toEqual(data);
      expect(parsed.summary).toContain('2 days of progress');
      expect(parsed.summary).toContain('4 tasks');
    }
  });

  it('imports v1 backups (from before tasks) with an empty task list', () => {
    const json = JSON.parse(makeBackup(sample(), new Date()));
    json.schemaVersion = 1;
    delete json.tasks;
    const parsed = parseBackup(JSON.stringify(json));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.tasks).toEqual([]);
  });

  it('rejects files that are not backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'ow64-dashboard', schemaVersion: 99 })).ok).toBe(false);
  });

  it('rejects a chart without the 8×8 shape', () => {
    const data = sample();
    const json = JSON.parse(makeBackup(data, new Date()));
    json.chart.pillars = json.chart.pillars.slice(0, 7);
    const parsed = parseBackup(JSON.stringify(json));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/8 pillars/);
  });
});

describe('chart edits', () => {
  it('replacing an action archives the old one so history keeps its name', () => {
    const chart = seedChart('2026-10-13');
    const old = chart.pillars[0].actions[1];
    const next = replaceAction(chart, 0, 1, 'Kanji drills', { kind: 'daily' }, '2026-10-20');
    expect(next.pillars[0].actions[1].id).not.toBe(old.id);
    expect(next.archive).toEqual([{ ...old, pillarId: chart.pillars[0].id, retiredAt: '2026-10-20' }]);
    expect(actionIndex(next).get(old.id)).toEqual({ text: old.text, pillarId: chart.pillars[0].id, retired: true });
    expect(chart.archive).toEqual([]); // input untouched
  });
});

describe('safeUrl', () => {
  it('adds https and refuses non-web schemes', () => {
    expect(safeUrl('example.com')).toBe('https://example.com/');
    expect(safeUrl('http://localhost:3000/x')).toBe('http://localhost:3000/x');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
  });
});
