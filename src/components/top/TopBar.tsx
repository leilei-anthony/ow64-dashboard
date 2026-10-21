import { useState } from 'preact/hooks';
import { calendarSources, now, settings } from '../../storage/store';
import { calendarEvents } from '../../storage/calendar';
import { dayLabel, formatTime, localDayKey, nextEvent, relativeTime } from '../../lib/agenda';
import { runSearch } from '../../lib/ext';
import { QuickLinks } from './QuickLinks';

function Clock() {
  const d = now.value;
  const h24 = settings.value.clock24h;
  const hours = h24 ? String(d.getHours()).padStart(2, '0') : String(d.getHours() % 12 || 12);
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return (
    <div class="clock">
      <div class="clock-time">
        {hours}:{minutes}
        {!h24 && <small>{d.getHours() < 12 ? 'AM' : 'PM'}</small>}
      </div>
      <div class="clock-date">
        {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
}

/** "Next: Advisor check-in · 3 PM (in 25 min)" / "Now: Lab meeting · until 9:30 AM". */
function NextEventLine() {
  const sources = calendarSources.value;
  if (!sources.length) return null;
  const t = now.value;
  const next = nextEvent(calendarEvents.value, t);
  if (!next) return null;
  const { event: e } = next;
  const h24 = settings.value.clock24h;
  const today = localDayKey(t);
  const startDay = localDayKey(new Date(e.start));
  const msUntil = Date.parse(e.start) - t.getTime();
  const text = next.now
    ? `Now: ${e.title} · until ${formatTime(e.end, h24)}`
    : startDay === today
      ? `Next: ${e.title} · ${formatTime(e.start, h24)} (${relativeTime(msUntil)})`
      : `${dayLabel(startDay, today)} ${formatTime(e.start, h24)} · ${e.title}`;
  const color = sources.find((s) => s.id === e.sourceId)?.color;
  // Offer Join while it's on, or within 10 minutes of starting.
  const joinable = e.joinUrl && (next.now || msUntil <= 10 * 60_000);
  return (
    <div class="next-event" title={e.location ? `${e.title} · ${e.location}` : e.title}>
      <span class="dot" style={{ background: color ?? 'var(--muted)' }} />
      <span class="next-event-text">{text}</span>
      {joinable && (
        <a class="next-event-join" href={e.joinUrl} target="_blank" rel="noopener noreferrer">
          Join ↗
        </a>
      )}
    </div>
  );
}

function SearchBox() {
  const [text, setText] = useState('');
  return (
    <form
      class="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) runSearch(text.trim(), false);
      }}
    >
      <input
        type="search"
        value={text}
        placeholder="Search the web"
        aria-label="Search the web"
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) {
            e.preventDefault();
            runSearch(text.trim(), true);
          }
        }}
      />
    </form>
  );
}

export function TopBar() {
  const s = settings.value;
  return (
    <header class="topbar">
      <div class="topbar-left">
        {s.showClock && <Clock />}
        <NextEventLine />
      </div>
      <div class="topbar-center">
        <QuickLinks />
        {s.showSearch && <SearchBox />}
      </div>
      <div class="topbar-right" />
    </header>
  );
}
