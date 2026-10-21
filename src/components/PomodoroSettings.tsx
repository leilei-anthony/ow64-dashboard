import { useEffect, useState } from 'preact/hooks';
import type { PomodoroSettings } from '../model/types';
import { settings, updateSettings } from '../storage/store';
import { chromeApi, isExtension } from '../lib/ext';

function MinutesField({ label, field, max }: { label: string; field: 'focusMin' | 'shortMin' | 'longMin' | 'longEvery'; max: number }) {
  const value = settings.value.pomodoro[field];
  return (
    <label class="field pomo-field">
      {label}
      <input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Math.round(Number(e.currentTarget.value));
          const next = Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : value;
          e.currentTarget.value = String(next);
          updateSettings({ pomodoro: { ...settings.value.pomodoro, [field]: next } });
        }}
      />
    </label>
  );
}

function Toggle({ label, field }: { label: string; field: keyof PomodoroSettings }) {
  const ps = settings.value.pomodoro;
  return (
    <label class="toggle">
      <input type="checkbox" checked={!!ps[field]} onChange={(e) => updateSettings({ pomodoro: { ...ps, [field]: e.currentTarget.checked } })} />
      {label}
    </label>
  );
}

export function PomodoroSettingsSection() {
  const [notify, setNotify] = useState<boolean | null>(null);
  useEffect(() => {
    chromeApi?.permissions?.contains({ permissions: ['notifications'] }).then(setNotify, () => setNotify(false));
  }, []);

  return (
    <section class="settings-section">
      <h3>Pomodoro</h3>
      <div class="pomo-fields">
        <MinutesField label="Focus (min)" field="focusMin" max={180} />
        <MinutesField label="Short break (min)" field="shortMin" max={60} />
        <MinutesField label="Long break (min)" field="longMin" max={120} />
        <MinutesField label="Long break after" field="longEvery" max={12} />
      </div>
      <p class="muted small">Changes apply from the next session.</p>
      <Toggle label="Start breaks automatically" field="autoStartBreaks" />
      <Toggle label="Start the next focus automatically" field="autoStartFocus" />
      <Toggle label="Chime when a session ends" field="chime" />
      <Toggle label="Open new tabs in the focus view while a session runs" field="openFocusOnNewTab" />
      {isExtension && notify !== null && (
        <p class="small">
          {notify ? (
            <span class="muted">Desktop notifications are on, so you're told even with the tab closed.</span>
          ) : (
            <>
              <span class="muted">Desktop notifications are off. </span>
              <button
                type="button"
                class="link-btn"
                onClick={() =>
                  chromeApi?.permissions
                    ?.request({ permissions: ['notifications'] })
                    .then(setNotify, () => setNotify(false))
                }
              >
                Turn on
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
