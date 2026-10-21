# OW64 Dashboard

A new tab page for Brave and Chrome that turns your OW64 (Harada method) chart into an interactive daily tracker. Everything is stored locally in the browser: no account, no sync, and no network requests, apart from reading your Google Calendar if you connect one.

- **Track:** click an action to mark it done for the day.
- **Targets:** give each action a target (every day, N× a week, N× a month, a one-time milestone, or none).
- **Heatmap:** a year view of your progress, filterable by pillar or by a single action.
- **Habits:** small daily routines outside the chart (water, make bed, vitamins), grouped by morning, anytime and evening.
- **Tasks:** one-off to-dos. Anything you don't finish carries over to the next day, with an age badge.
- **Schedule:** your next 7 days from Google Calendar (optional, read-only), plus a "Next: …" line under the clock.
- **Focus view:** a full-screen pomodoro timer with today's tasks (timer button or `P`).
- **Extras:** streaks, weekly ring per pillar, countdowns, daily notes and notes on single cells.
- **New tab basics:** a clock, editable quick links and a search box (uses your default search engine).
- **Hide button (`H`):** hides the dashboard when you want a clean new tab.
- **Arrange the page:** Settings → **Dashboard sections** turns the chart, Habits, Tasks, Schedule, Countdowns, Stats, Heatmap and Notes on or off, and reorders them (drag, or ↑ / ↓).

## Install

```sh
npm install
npm run build
```

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the `dist/` folder.
4. Open a new tab. If the browser asks whether to keep the new tab page change, choose to keep it.

After pulling changes, run `npm run build` again and click the reload icon on the extension's card.

> Browsers don't let extensions add to their built-in new tab page, so this one replaces it. Brave's tracker and bandwidth stats, Brave News and its cards aren't available to extensions.

## Using it

| Action | How |
| --- | --- |
| Mark done / undo | Click an action cell |
| Note, streak, heatmap filter | Right-click an action cell |
| Filter the heatmap | Click a pillar's colored cell or ring, or use the heatmap's dropdown |
| Edit goal, pillars, actions | Pencil icon or `E`, then click a cell |
| Past days | `←` / `→`, or click a heatmap square; `T` for today |
| Day note | `N` |
| Add a task | `A`, type, Enter |
| Focus view (pomodoro) | Timer button or `P`; then `Space` start / pause, `S` skip, `Esc` back |
| Hide / show dashboard | Eye icon or `H` |
| Quick links | **Add site** tile; right-click to edit or remove; drag to reorder |

**Day start:** a new day begins at 4 AM by default, so late-night ticks count for the previous day. You can change the hour in Settings.

**Save vs. Replace:** when you edit an action, **Save** keeps its history (for rewording or a new target). **Replace** starts a new action; the old one stays in past heatmap days.

## Habits

A short checklist for routines that don't belong in the chart. Click **+** on the card to add one, or start from the suggestions (Drink water ×8, Make bed, Take vitamins).

- **Types:** **Yes / no** (tick it), **Count** (tap + toward a daily target, e.g. 8 glasses), and **Avoid** (press *Slipped* on days you slip; the streak counts clean days).
- **Schedule:** every day, on chosen weekdays (e.g. gym Mon / Wed / Fri), or N times a week. A habit only shows on its days.
- **Time of day:** Morning, Anytime and Evening sections. A section collapses to "✓" once everything in it is done.
- **Streaks:** 🔥 shows days (or weeks) in a row. Days off don't break a streak, and neither does today before you've done it.
- **Past days:** with `←` you can tick yesterday if you forgot.
- **Editing:** click a habit to edit it (with a 4-week history), right-click to archive it (stops tracking, keeps history), or drag to reorder.
- **Heatmap:** the dropdown has **All habits** and each habit on its own.

## Tasks

- **Three states:** click a task's box to cycle **[ ]** not done → **[/]** in progress → **[x]** done → back to [ ]. Right-click jumps straight to any state. A task with some steps ticked shows [/] on its own. Only [x] counts as done (chart ticks, Top 3); a [/] task carries over like any open task.

- **Carry-over:** a task you don't finish stays on your list each day after, marked "↻ 3d" with its age. From 7 days (change this in Settings) it's flagged "⚠" and shows **Drop** and **Move** buttons.
- **Scheduled date:** a task with a date stays hidden until that day (see **Upcoming**). Tick **Show it in Countdowns** to count down to it.
- **Counts toward:** link a task to a chart action, and completing the task ticks that action for the day. Undoing the task unticks it, unless you had ticked the action yourself.
- **Top 3:** star up to 3 tasks a day. They sort first, and finishing all three ticks "Daily top 3" (change the action in Settings).
- **Steps:** a task can have subtasks. Ticking the last one completes the task.
- **Repeat:** weekly on chosen days, or monthly on a day of the month. When you finish or drop one, the next is scheduled. An unfinished one carries over instead of piling up copies.
- **Past days:** with `←` the card shows what you finished that day. Ticking an open task there counts it as done on that day.

Click a task to edit it, right-click for more options, and drag to reorder.

## Focus view (pomodoro)

Press the timer button (top right) or `P`. The page turns into a pomodoro timer: **Pomodoro / Short break / Long break**, a big countdown, **Start / Pause**, **Reset**, **Skip →**, a checkmark per finished pomodoro, and today's tasks.

- **Lengths:** 25 / 5 / 15 minutes, with a long break after every 4. Change them in Settings → **Pomodoro**, along with auto-start and the chime.
- **Focus on a task:** click a task to work on it. Each finished pomodoro is counted on it (🍅 3).
- **End of a session:** a chime plays in an open tab, and a desktop notification appears even if every tab is closed. Brave asks once, the first time you press Start.
- **While a session runs:** new tabs open in the focus view, the tab title shows the countdown, and `Esc` shows the dashboard with a "🍅 18:42" pill to get back.
- **Stats:** the **Stats** card shows today's and this week's pomodoros, and the **Heatmap** dropdown has a **Pomodoros** view.

A small background script keeps the timer, so it stays the same in every tab and keeps running when tabs close. It uses no network.

## Google Calendar (optional)

1. In Google Calendar, open **Settings → your calendar → Integrate calendar** and copy the **Secret address in iCal format**.
2. In the dashboard, open **Settings → Google Calendar → Add a calendar** and paste it. Brave asks once for access to calendar.google.com.

You can add several calendars, each with a color, and turn them on or off.

- **Schedule card:** shows today, with the rest of the week under **Coming up**. Meetings with a Meet, Zoom or Teams link get a **Join** button.
- **Right-click an event** to make a task from it, pin it to Countdowns, or open that day in Google Calendar.
- **Refreshing:** every 15 minutes, when you open a new tab, or with ↻.
- **Privacy:**
  - The secret link works like a password. It's stored only in this browser and never included in backups.
  - Reading it is the only network access the extension has.
  - Removing your last calendar gives the calendar.google.com permission back.

## Backups

Data lives in `chrome.storage.local`. Uninstalling the extension deletes it, so use **Settings → Export backup** now and then. **Import backup** shows a summary of what it will replace before it changes anything.

## Development

```sh
npm run dev     # page at http://localhost:5173/newtab.html (uses localStorage instead of chrome.storage)
npm test        # unit tests (dates, cadences, streaks, tasks, habits, calendar, pomodoro, storage, backups)
npm run build   # type-check + build to dist/
npm run icons   # regenerate public/icons/*.png
```

Stack: Vite + TypeScript + Preact + `@preact/signals`. Code layout:

- `src/model/` — data types, your starting chart, pure chart edits
- `src/lib/` — date, cadence, streak, stats, task, habit, calendar (iCal) and agenda logic
- `src/storage/` — persistence and syncing between tabs
- `src/pomodoro/`, `src/background.ts` — the timer engine and the background worker that runs it
- `src/components/` — the UI
