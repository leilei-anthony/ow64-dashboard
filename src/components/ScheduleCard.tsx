import { useState } from 'preact/hooks';
import type { CalEvent, DayKey } from '../model/types';
import { uid } from '../model/ids';
import { calendarCache, calendarSources, countdowns, now, setCountdowns, settings } from '../storage/store';
import { addTask } from '../storage/tasks';
import { WINDOW_DAYS, calendarEvents, refreshCalendars, refreshing } from '../storage/calendar';
import { agoText, eventDay, googleCalendarDayUrl, groupByDay, isOngoing, timeRange } from '../lib/agenda';
import { openMenu } from '../ui';
import { IconRefresh } from './icons';

function pinToCountdowns(e: CalEvent) {
  const date = eventDay(e);
  if (countdowns.value.some((c) => c.label === e.title && c.date === date)) return;
  setCountdowns([...countdowns.value, { id: uid(), label: e.title, date }]);
}

function EventRow({ event: e, day, color }: { event: CalEvent; day: DayKey; color: string }) {
  const ongoing = isOngoing(e, now.value);
  // A meeting link pasted as the location is already the Join button.
  const location = e.location && !/^https?:\/\//i.test(e.location) ? e.location : undefined;
  return (
    <li
      class={`event${ongoing ? ' is-now' : ''}`}
      onContextMenu={(ev) =>
        openMenu(ev, [
          { label: 'Make a task', onSelect: () => addTask(e.title, day) },
          { label: 'Pin to Countdowns', onSelect: () => pinToCountdowns(e) },
          { label: 'Open in Google Calendar', onSelect: () => window.open(googleCalendarDayUrl(day), '_blank', 'noopener') },
        ])
      }
    >
      <span class="event-time">{timeRange(e, day, settings.value.clock24h)}</span>
      <span class="dot" style={{ background: color }} />
      <span class="event-main">
        <span class="event-title">{e.title}</span>
        {location && <span class="event-loc">{location}</span>}
      </span>
      {ongoing && <span class="badge badge-now">Now</span>}
      {e.joinUrl && (
        <a class="btn btn-small event-join" href={e.joinUrl} target="_blank" rel="noopener noreferrer">
          Join ↗
        </a>
      )}
    </li>
  );
}

export function ScheduleCard() {
  const sources = calendarSources.value;
  const [showLater, setShowLater] = useState(false);
  if (!sources.length) return null;

  const enabled = sources.filter((s) => s.enabled);
  const cache = calendarCache.value.sources;
  const t = now.value;
  const colorOf = (id: string) => sources.find((s) => s.id === id)?.color ?? 'var(--muted)';
  const [today, ...later] = groupByDay(calendarEvents.value, t, WINDOW_DAYS);
  const laterDays = later.filter((g) => g.events.length);
  const laterCount = new Set(laterDays.flatMap((g) => g.events.map((e) => e.id))).size;
  const fetched = enabled.map((s) => Date.parse(cache[s.id]?.fetchedAt ?? '')).filter(Number.isFinite);
  const oldest = fetched.length ? Math.min(...fetched) : undefined;
  const failing = enabled.filter((s) => cache[s.id]?.error);

  const rows = (events: CalEvent[], day: DayKey) =>
    events.map((e) => <EventRow key={`${e.id}@${day}`} event={e} day={day} color={colorOf(e.sourceId)} />);

  return (
    <section class="panel schedule">
      <div class="schedule-head">
        <h2>Schedule</h2>
        {oldest !== undefined && <span class="muted small">Updated {agoText(t.getTime() - oldest)}</span>}
        <button
          type="button"
          class="icon-btn icon-btn-small"
          aria-label="Refresh calendars"
          title="Refresh calendars"
          disabled={refreshing.value}
          onClick={() => void refreshCalendars(true)}
        >
          <IconRefresh width={14} height={14} class={refreshing.value ? 'spin' : undefined} />
        </button>
      </div>

      {failing.map((s) => {
        const at = Date.parse(cache[s.id]?.fetchedAt ?? '');
        return (
          <p key={s.id} class="schedule-error small" role="status">
            ⚠ {s.name}: {cache[s.id]!.error}
            {Number.isFinite(at) ? ` Showing events from ${agoText(t.getTime() - at)}.` : ''}
          </p>
        );
      })}

      {enabled.length === 0 ? (
        <p class="muted small">Your calendars are turned off in Settings.</p>
      ) : (
        <>
          {today.events.length > 0 ? (
            <ul class="events">{rows(today.events, today.day)}</ul>
          ) : (
            <p class="muted small schedule-empty">
              {laterCount ? 'Nothing else today.' : `No events in the next ${WINDOW_DAYS} days.`}
            </p>
          )}
          {laterCount > 0 && (
            <div class="schedule-later">
              <button type="button" class="link-btn" aria-expanded={showLater} onClick={() => setShowLater(!showLater)}>
                {showLater ? '▾' : '▸'} Coming up ({laterCount})
              </button>
              {showLater &&
                laterDays.map((g) => (
                  <div key={g.day} class="event-day">
                    <h3>{g.label}</h3>
                    <ul class="events">{rows(g.events, g.day)}</ul>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
