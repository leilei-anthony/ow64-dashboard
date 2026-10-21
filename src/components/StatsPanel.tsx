import { chart, logs, pomodoroLog, settings, today, viewDay } from '../storage/store';
import { addDays, monthEnd, monthStart, shortDate, weekStart } from '../lib/dates';
import { activeDays, pillarWeekCompletion, totalTicks } from '../lib/stats';
import { currentStreak, type Streak } from '../lib/streaks';
import { heatFilter } from '../ui';

function Ring({ ratio, color }: { ratio: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--ring-track)" stroke-width="4" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={color}
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray={`${c * ratio} ${c}`}
        transform="rotate(-90 20 20)"
        style={{ opacity: ratio > 0 ? 1 : 0 }}
      />
      <text x="20" y="24" text-anchor="middle" class="ring-text">
        {Math.round(ratio * 100)}
      </text>
    </svg>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const d = now - before;
  if (!d) return <span class="delta muted">same as before</span>;
  return (
    <span class={`delta ${d > 0 ? 'up' : 'down'}`}>
      {d > 0 ? '▲' : '▼'} {Math.abs(d)} vs last
    </span>
  );
}

const unitText = (s: Streak) => `${s.unit}${s.value === 1 ? '' : 's'}`;

export function StatsPanel() {
  const day = viewDay.value;
  const allLogs = logs.value;
  const ws = settings.value.weekStartsOn;
  const pillars = chart.value.pillars;
  const filter = heatFilter.value;

  const wFrom = weekStart(day, ws);
  const weekNow = totalTicks(allLogs, wFrom, day);
  const weekBefore = totalTicks(allLogs, addDays(wFrom, -7), addDays(day, -7));
  const mFrom = monthStart(day);
  const monthNow = totalTicks(allLogs, mFrom, day);
  const prevMonthStart = monthStart(addDays(mFrom, -1));
  // Same number of elapsed days last month, capped at its length.
  const elapsed = Number(day.slice(8)) - 1;
  const sameDayLastMonth = addDays(prevMonthStart, elapsed);
  const prevMonthTo = sameDayLastMonth > monthEnd(prevMonthStart) ? monthEnd(prevMonthStart) : sameDayLastMonth;
  const monthBefore = totalTicks(allLogs, prevMonthStart, prevMonthTo);
  const daysActive = activeDays(allLogs, mFrom, day);

  const streaks = pillars
    .flatMap((p) =>
      p.actions
        .filter((a) => a.text.trim())
        .map((a) => ({ action: a, pillar: p, streak: currentStreak(a, allLogs, today.value, ws) })),
    )
    .filter((s): s is typeof s & { streak: Streak } => !!s.streak && s.streak.value >= 2)
    .sort((a, b) => b.streak.value - a.streak.value)
    .slice(0, 5);

  const pomo = pomodoroLog.value;
  const pomoDay = pomo[day];
  const pomoWeek = Array.from({ length: 7 }, (_, i) => pomo[addDays(wFrom, i)]?.count ?? 0).reduce((a, b) => a + b, 0);

  return (
    <section class="panel">
      <h2>Stats · Week of {shortDate(wFrom)}</h2>
      {(pomoDay || pomoWeek > 0) && (
        <p class="pomo-stat">
          <span aria-hidden="true">🍅</span> <strong>{pomoDay?.count ?? 0}</strong> {day === today.value ? 'today' : `on ${shortDate(day)}`}
          {' · '}
          {pomoDay?.minutes ?? 0} min focus · {pomoWeek} this week
        </p>
      )}
      <div class="stat-row">
        <div class="stat">
          <div class="stat-num">{weekNow}</div>
          <div class="stat-label">
            ticks this week <Delta now={weekNow} before={weekBefore} />
          </div>
        </div>
        <div class="stat">
          <div class="stat-num">{monthNow}</div>
          <div class="stat-label">
            ticks this month <Delta now={monthNow} before={monthBefore} />
          </div>
        </div>
        <div class="stat">
          <div class="stat-num">
            {daysActive}
            <small>/{elapsed + 1}</small>
          </div>
          <div class="stat-label">active days this month</div>
        </div>
      </div>

      <div class="rings" role="list" aria-label="Weekly targets met per pillar">
        {pillars.map((p) => {
          const c = pillarWeekCompletion(p, allLogs, day, ws);
          const isActive = filter.kind === 'pillar' && filter.pillarId === p.id;
          return (
            <button
              type="button"
              role="listitem"
              class={`ring${isActive ? ' is-active' : ''}`}
              title={`${p.title}: ${c.met} of ${c.target} weekly targets met`}
              onClick={() => (heatFilter.value = isActive ? { kind: 'all' } : { kind: 'pillar', pillarId: p.id })}
            >
              <Ring ratio={c.ratio} color={p.color} />
              <span class="ring-label">{p.title}</span>
            </button>
          );
        })}
      </div>

      <h3>Current streaks</h3>
      {streaks.length ? (
        <ul class="streaks">
          {streaks.map(({ action, pillar, streak }) => (
            <li key={action.id}>
              <span class="dot" style={{ background: pillar.color }} />
              <span class="streak-name">{action.text}</span>
              <span class="streak-val">
                {streak.value} {unitText(streak)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p class="muted small">Streaks of 2 or more show up here.</p>
      )}
    </section>
  );
}
