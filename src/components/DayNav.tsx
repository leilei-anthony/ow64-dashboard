import { chart, logs, selectedDay, today, viewDay } from '../storage/store';
import { longDate, shortDate } from '../lib/dates';
import { shiftDay } from '../ui';
import { IconChevron } from './icons';

/** `showCount` is off when the chart is hidden: "x / 64 done" counts chart ticks. */
export function DayNav({ showCount = true }: { showCount?: boolean }) {
  const day = viewDay.value;
  const isToday = day === today.value;
  const total = chart.value.pillars.reduce((n, p) => n + p.actions.filter((a) => a.text.trim()).length, 0);
  const done = logs.value[day]?.done.length ?? 0;

  return (
    <div class="daynav-wrap">
      <div class="daynav">
        <button type="button" class="icon-btn" aria-label="Previous day (←)" title="Previous day (←)" onClick={() => shiftDay(-1)}>
          <IconChevron side="left" />
        </button>
        <div class="daynav-date">
          {isToday && <span class="daynav-today">Today</span>}
          {longDate(day)}
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="Next day (→)"
          title="Next day (→)"
          disabled={isToday}
          onClick={() => shiftDay(1)}
        >
          <IconChevron side="right" />
        </button>
        {showCount && (
          <div class="daynav-count">
            <strong>{done}</strong> / {total} done
          </div>
        )}
      </div>
      {!isToday && (
        <div class="past-banner" role="status">
          <span>
            Editing <strong>{shortDate(day)}</strong>. Your ticks go to this day.
          </span>
          <button type="button" class="btn btn-small" onClick={() => (selectedDay.value = null)}>
            Back to today (T)
          </button>
        </div>
      )}
    </div>
  );
}
