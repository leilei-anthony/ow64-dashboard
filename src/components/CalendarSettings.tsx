import { useState } from 'preact/hooks';
import { PILLAR_COLORS } from '../model/seed';
import { calendarCache, calendarSources, now } from '../storage/store';
import { addCalendar, refreshCalendars, refreshing, removeCalendar, updateCalendar, type AddResult } from '../storage/calendar';
import { agoText } from '../lib/agenda';

function SourceRow({ id }: { id: string }) {
  const s = calendarSources.value.find((x) => x.id === id)!;
  const c = calendarCache.value.sources[id];
  const [confirm, setConfirm] = useState(false);
  const fetched = Date.parse(c?.fetchedAt ?? '');
  const status = c?.error
    ? `⚠ ${c.error}`
    : Number.isFinite(fetched)
      ? `${c!.events.length} event${c!.events.length === 1 ? '' : 's'} · updated ${agoText(now.value.getTime() - fetched)}`
      : 'Not loaded yet';
  return (
    <li class="cal-row">
      <input
        type="color"
        value={s.color}
        aria-label={`Color for ${s.name}`}
        onInput={(e) => updateCalendar(id, { color: e.currentTarget.value })}
      />
      <label class="cal-name">
        <input type="checkbox" checked={s.enabled} onChange={(e) => updateCalendar(id, { enabled: e.currentTarget.checked })} />
        <span>
          {s.name}
          <span class={`cal-status${c?.error ? ' warn' : ''}`}>{status}</span>
        </span>
      </label>
      <button
        type="button"
        class="btn btn-small btn-danger-quiet"
        onClick={() => (confirm ? removeCalendar(id) : setConfirm(true))}
        onBlur={() => setConfirm(false)}
      >
        {confirm ? 'Remove?' : 'Remove'}
      </button>
    </li>
  );
}

export function CalendarSettings() {
  const sources = calendarSources.value;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState(PILLAR_COLORS[5]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    // addCalendar asks for the calendar.google.com permission first, while this click still counts.
    const r = await addCalendar(name, url, color);
    setBusy(false);
    setResult(r);
    if (r.ok) {
      setName('');
      setUrl('');
      setAdding(false);
    }
  };

  return (
    <section class="settings-section">
      <h3>Google Calendar</h3>
      <p class="muted small">
        Shows the next 7 days in a Schedule card. In Google Calendar, open <strong>Settings → your calendar → Integrate
        calendar</strong> and copy the <strong>Secret address in iCal format</strong>.
      </p>
      <p class="muted small">
        Treat that link like a password: it stays only in this browser and is never included in backups. Reading it is the
        only thing this extension does online.
      </p>

      {sources.length > 0 && (
        <ul class="cal-list">
          {sources.map((s) => (
            <SourceRow key={s.id} id={s.id} />
          ))}
        </ul>
      )}

      {adding ? (
        <form class="form cal-form" onSubmit={submit}>
          <label>
            Name
            <input value={name} placeholder="e.g. Personal" onInput={(e) => setName(e.currentTarget.value)} />
          </label>
          <label>
            Secret address in iCal format
            <input
              value={url}
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              autoComplete="off"
              spellcheck={false}
              onInput={(e) => {
                setUrl(e.currentTarget.value);
                setResult(null);
              }}
            />
          </label>
          <div class="swatches" role="group" aria-label="Color">
            {PILLAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                class={`swatch${c === color ? ' is-active' : ''}`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div class="btn-row">
            <button type="submit" class="btn btn-primary" disabled={busy || !url.trim()}>
              {busy ? 'Checking…' : 'Add calendar'}
            </button>
            <button type="button" class="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div class="btn-row">
          <button
            type="button"
            class="btn"
            onClick={() => {
              setAdding(true);
              setResult(null);
            }}
          >
            Add a calendar
          </button>
          {sources.length > 0 && (
            <button type="button" class="btn" disabled={refreshing.value} onClick={() => void refreshCalendars(true)}>
              {refreshing.value ? 'Refreshing…' : 'Refresh now'}
            </button>
          )}
        </div>
      )}
      {result &&
        (result.ok ? (
          <p class="small ok">
            Connected. Found {result.count} event{result.count === 1 ? '' : 's'} in the next 7 days.
          </p>
        ) : (
          <p class="form-error">{result.error}</p>
        ))}
    </section>
  );
}
