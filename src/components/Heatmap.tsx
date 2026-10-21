import { useEffect, useMemo, useState } from 'preact/hooks';
import type { DayKey } from '../model/types';
import type { Habit, HabitLog } from '../model/types';
import { chart, habitLog, habits, logs, pomodoroLog, settings, today, viewDay } from '../storage/store';
import { habitsMetOn, isActive, isMet, isScheduled } from '../lib/habits';
import { dayOfWeek, dayRange, daysBetween, monthShort, shortDate, weekStart, yearOf } from '../lib/dates';
import { actionIndex, dayCount, type HeatFilter } from '../lib/stats';
import { goToDay, heatFilter, heatYear } from '../ui';
import { IconChevron } from './icons';
import { ActionOptionGroups } from './ActionOptions';

const CELL = 11;
const STEP = 13;
const LEFT = 30;
const TOP = 18;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Sequential ramp on a dark surface: empty is darkest, more is brighter.
// "All" uses a neutral ramp (no pillar identity); a filter uses that pillar's hue.
const EMPTY = '#2a2d34';
const POMODORO = '#F0694F';
const HABITS = '#A493F0';

/** One habit's day for the heatmap: done (or clean, for an avoid habit) on a day it was tracked. */
const habitHit = (h: Habit | undefined, log: HabitLog, day: string) =>
  h && isActive(h, day) && isScheduled(h, day) && isMet(h, log, day) && (h.kind === 'avoid' || (log[day]?.[h.id] ?? 0) > 0) ? 1 : 0;
const NEUTRAL = '#e9eaed';
const STEPS = [0.3, 0.52, 0.76, 1];

function mix(hex: string, base: string, p: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(base.slice(1), 16);
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * p + ((b >> shift) & 255) * (1 - p));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

const rampFor = (hue: string) => [EMPTY, ...STEPS.map((p) => mix(hue, EMPTY, p))];

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

export function Heatmap() {
  const c = chart.value;
  const allLogs = logs.value;
  const filter = heatFilter.value;
  const ws = settings.value.weekStartsOn;
  const tday = today.value;
  const vday = viewDay.value;
  const year = heatYear.value ?? yearOf(vday);
  const index = useMemo(() => actionIndex(c), [c]);
  const [hover, setHover] = useState<Hover | null>(null);

  // The tooltip is fixed to the viewport, so drop it as soon as anything scrolls.
  useEffect(() => {
    if (!hover) return;
    const clear = () => setHover(null);
    window.addEventListener('scroll', clear, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', clear, { capture: true });
  }, [hover]);

  const pillarById = (id: string) => c.pillars.find((p) => p.id === id);
  const hue =
    filter.kind === 'pomodoro'
      ? POMODORO
      : filter.kind === 'habits' || filter.kind === 'habit'
        ? HABITS
      : filter.kind === 'pillar'
      ? pillarById(filter.pillarId)?.color
      : filter.kind === 'action'
        ? pillarById(index.get(filter.actionId)?.pillarId ?? '')?.color
        : undefined;
  const ramp = rampFor(hue ?? NEUTRAL);

  const jan1 = `${year}-01-01`;
  const dec31 = `${year}-12-31`;
  const gridStart = weekStart(jan1, ws);
  const weeks = Math.floor(daysBetween(gridStart, dec31) / 7) + 1;
  const days = dayRange(jan1, dec31);
  const pomodoros = pomodoroLog.value;
  const hLog = habitLog.value;
  const oneHabit = filter.kind === 'habit' ? habits.value.find((h) => h.id === filter.habitId) : undefined;
  const counts = days.map((d) =>
    filter.kind === 'pomodoro'
      ? pomodoros[d]?.count ?? 0
      : filter.kind === 'habits'
        ? habitsMetOn(habits.value, hLog, d).length
        : filter.kind === 'habit'
          ? habitHit(oneHabit, hLog, d)
          : dayCount(allLogs, d, filter, index),
  );
  const max = Math.max(1, ...counts);
  const binary = filter.kind === 'action' || filter.kind === 'habit';
  const level = (n: number) => (n === 0 ? 0 : binary ? 4 : Math.max(1, Math.ceil((n / max) * 4)));
  const total = counts.reduce((a, b) => a + b, 0);
  const active = counts.filter((n) => n > 0).length;

  const firstLogYear = Object.keys(allLogs).reduce((y, d) => Math.min(y, yearOf(d)), yearOf(tday));
  const width = LEFT + weeks * STEP;
  const height = TOP + 7 * STEP;

  const onEnter = (day: DayKey, e: PointerEvent) => {
    const r = (e.currentTarget as Element).getBoundingClientRect();
    setHover({ day, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  return (
    <section class="panel">
      <div class="heat-head">
        <h2>Heatmap · {year}</h2>
        <HeatFilterSelect filter={filter} hue={hue} />
        <div class="year-nav">
          <button
            type="button"
            class="icon-btn icon-btn-small"
            aria-label="Previous year"
            disabled={year <= firstLogYear}
            onClick={() => (heatYear.value = year - 1)}
          >
            <IconChevron side="left" width={14} height={14} />
          </button>
          <button
            type="button"
            class="icon-btn icon-btn-small"
            aria-label="Next year"
            disabled={year >= yearOf(tday)}
            onClick={() => (heatYear.value = year + 1)}
          >
            <IconChevron side="right" width={14} height={14} />
          </button>
        </div>
      </div>

      <div class="heat-wrap" onPointerLeave={() => setHover(null)}>
        <svg
          class="heat"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Heatmap for ${year}: ${plural(total, 'tick')} over ${plural(active, 'active day')}`}
        >
          {Array.from({ length: 12 }, (_, m) => {
            const first = `${year}-${String(m + 1).padStart(2, '0')}-01`;
            const col = Math.floor(daysBetween(gridStart, first) / 7);
            return (
              <text key={m} x={LEFT + col * STEP} y={11} class="heat-label">
                {monthShort(first)}
              </text>
            );
          })}
          {[1, 3, 5].map((row) => (
            <text key={row} x={0} y={TOP + row * STEP + CELL - 2} class="heat-label">
              {WEEKDAYS[(row + ws) % 7]}
            </text>
          ))}
          {days.map((day, i) => {
            const col = Math.floor(daysBetween(gridStart, day) / 7);
            const row = (dayOfWeek(day) - ws + 7) % 7;
            const x = LEFT + col * STEP;
            const y = TOP + row * STEP;
            if (day > tday) {
              return <rect key={day} x={x + 0.5} y={y + 0.5} width={CELL - 1} height={CELL - 1} rx={2} class="heat-future" />;
            }
            const lv = level(counts[i]);
            const hasNote = !!allLogs[day]?.note;
            return (
              <g
                key={day}
                class={`heat-day${day === vday ? ' is-selected' : ''}`}
                onPointerEnter={(e) => onEnter(day, e)}
                onClick={() => goToDay(day)}
              >
                <rect x={x} y={y} width={CELL} height={CELL} rx={2} style={{ fill: ramp[lv] }} />
                {hasNote && (
                  <circle cx={x + CELL / 2} cy={y + CELL / 2} r={1.6} class={lv >= 3 ? 'note-dot-dark' : 'note-dot'} />
                )}
              </g>
            );
          })}
        </svg>
        {hover && <HeatTooltip hover={hover} filter={filter} index={index} />}
      </div>

      <div class="heat-foot">
        <span class="muted small">
          {binary
            ? `${oneHabit?.kind === 'avoid' ? 'Clean' : 'Done'} on ${plural(active, 'day')}`
            : filter.kind === 'habits'
              ? `${plural(total, 'check-in')} · ${plural(active, 'day')}`
            : filter.kind === 'pomodoro'
              ? `${plural(total, 'pomodoro')} · ${plural(active, 'day')}`
              : `${plural(total, 'tick')} · ${plural(active, 'active day')}`}
        </span>
        <span class="legend" aria-hidden="true">
          Less
          {ramp.map((color, i) => (
            <i key={i} style={{ background: color }} />
          ))}
          More
        </span>
      </div>
    </section>
  );
}

const encode = (f: HeatFilter) =>
  f.kind === 'all'
    ? 'all'
    : f.kind === 'pomodoro'
      ? 'pomo'
      : f.kind === 'habits'
        ? 'habits'
        : f.kind === 'habit'
          ? `h:${f.habitId}`
          : f.kind === 'pillar'
            ? `p:${f.pillarId}`
            : `a:${f.actionId}`;

function decode(value: string): HeatFilter {
  if (value === 'pomo') return { kind: 'pomodoro' };
  if (value === 'habits') return { kind: 'habits' };
  if (value.startsWith('h:')) return { kind: 'habit', habitId: value.slice(2) };
  if (value.startsWith('p:')) return { kind: 'pillar', pillarId: value.slice(2) };
  if (value.startsWith('a:')) return { kind: 'action', actionId: value.slice(2) };
  return { kind: 'all' };
}

/** One menu for every filter; pillar cells and rings in the chart also set it with one click. */
function HeatFilterSelect({ filter, hue }: { filter: HeatFilter; hue?: string }) {
  const c = chart.value;
  return (
    <span class="heat-filter">
      <span class="dot" style={{ background: hue ?? 'var(--text-2)' }} aria-hidden="true" />
      <select
        aria-label="Filter heatmap"
        value={encode(filter)}
        onChange={(e) => (heatFilter.value = decode(e.currentTarget.value))}
      >
        <option value="all">All actions</option>
        <option value="pomo">Pomodoros</option>
        {habits.value.length > 0 && (
          <optgroup label="Habits">
            <option value="habits">All habits</option>
            {habits.value.map((h) => (
              <option key={h.id} value={`h:${h.id}`}>
                {h.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Pillars">
          {c.pillars.map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {p.title}
            </option>
          ))}
        </optgroup>
        <ActionOptionGroups value={(id) => `a:${id}`} includeRetired />
      </select>
    </span>
  );
}

interface Hover {
  day: DayKey;
  /** Viewport coordinates of the hovered cell. */
  x: number;
  top: number;
  bottom: number;
}

function HeatTooltip({
  hover,
  filter,
  index,
}: {
  hover: Hover;
  filter: HeatFilter;
  index: ReturnType<typeof actionIndex>;
}) {
  const c = chart.value;
  const entry = logs.value[hover.day];
  const pomo = pomodoroLog.value[hover.day];
  const metHabits = filter.kind === 'habits' ? habitsMetOn(habits.value, habitLog.value, hover.day) : [];
  const theHabit = filter.kind === 'habit' ? habits.value.find((h) => h.id === filter.habitId) : undefined;
  const n =
    filter.kind === 'pomodoro'
      ? pomo?.count ?? 0
      : filter.kind === 'habits'
        ? metHabits.length
        : filter.kind === 'habit'
          ? habitHit(theHabit, habitLog.value, hover.day)
          : dayCount(logs.value, hover.day, filter, index);
  const pillar = filter.kind === 'pillar' ? c.pillars.find((p) => p.id === filter.pillarId) : undefined;

  const headline =
    filter.kind === 'habits'
      ? `${n} habit${n === 1 ? '' : 's'}`
      : filter.kind === 'habit'
        ? theHabit?.kind === 'avoid'
          ? n ? 'Clean' : 'Slipped or not tracked'
          : n ? 'Done' : 'Not done'
      : filter.kind === 'pomodoro'
      ? `${n} pomodoro${n === 1 ? '' : 's'}${n ? ` · ${pomo!.minutes} min` : ''}`
      : filter.kind === 'action'
      ? n
        ? 'Done'
        : 'Not done'
      : filter.kind === 'pillar'
        ? `${n} ${pillar?.title ?? ''} action${n === 1 ? '' : 's'}`
        : `${n} action${n === 1 ? '' : 's'}`;

  // Group the day's ticks by pillar (only the ones matching the filter).
  const groups = filter.kind !== 'all' && filter.kind !== 'pillar' ? [] : c.pillars
    .filter((p) => filter.kind === 'all' || p.id === filter.pillarId)
    .map((p) => ({
      pillar: p,
      names: (entry?.done ?? []).filter((id) => index.get(id)?.pillarId === p.id).map((id) => index.get(id)!.text),
    }))
    .filter((g) => g.names.length);

  const note = entry?.note;
  const halfWidth = 138;
  const x = Math.max(halfWidth, Math.min(hover.x, window.innerWidth - halfWidth));
  // Flip below the cell when there's no room above it.
  const below = hover.top < 180;

  return (
    <div
      class={`tooltip${below ? ' is-below' : ''}`}
      style={{ left: x, top: below ? hover.bottom : hover.top }}
      role="tooltip"
    >
      <div class="tooltip-head">
        <strong>{headline}</strong>
        <span class="muted">{shortDate(hover.day)}</span>
      </div>
      {metHabits.length > 0 && (
        <div class="tooltip-group">
          <span>{metHabits.map((h) => h.name).join(', ')}</span>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.pillar.id} class="tooltip-group">
          <span class="dot" style={{ background: g.pillar.color }} />
          <span>{g.names.join(', ')}</span>
        </div>
      ))}
      {note && <div class="tooltip-note">“{note.length > 140 ? `${note.slice(0, 140)}…` : note}”</div>}
      <div class="tooltip-hint muted">Click to open this day</div>
    </div>
  );
}
