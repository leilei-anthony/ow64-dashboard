import { pomodoroState } from '../storage/store';
import { timeLeft } from '../storage/pomodoro';
import { formatClock } from '../pomodoro/engine';
import { focusView } from '../ui';

/** "🍅 18:42" while a session is on and you're looking at the dashboard. Click to go back to focus. */
export function PomodoroPill() {
  const st = pomodoroState.value;
  if (st.status === 'idle' || focusView.value) return null;
  return (
    <button
      type="button"
      class={`pomo-pill phase-${st.phase}`}
      title="Back to the focus view (P)"
      onClick={() => (focusView.value = true)}
    >
      <span aria-hidden="true">{st.phase === 'focus' ? '🍅' : '☕'}</span>
      {formatClock(timeLeft(st))}
      {st.status === 'paused' && <span class="muted"> paused</span>}
    </button>
  );
}
