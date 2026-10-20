# OW64 Dashboard

A new tab page for Brave and Chrome that turns your OW64 (Harada method) chart into an interactive daily tracker. Everything is stored locally in the browser: no account, no sync, no network requests.

- **Track:** click an action to mark it done for the day.
- **Targets:** give each action a target (every day, N× a week, N× a month, a one-time milestone, or none).
- **Heatmap:** a year view of your progress, filterable by pillar or by a single action.
- **Tasks:** one-off to-dos. Anything you don't finish carries over to the next day, with an age badge.
- **Extras:** streaks, weekly ring per pillar, countdowns, daily notes and notes on single cells.
- **New tab basics:** a clock, editable quick links and a search box (uses your default search engine).
- **Hide button (`H`):** hides the dashboard when you want a clean new tab.

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
| Hide / show dashboard | Eye icon or `H` |
| Quick links | **Add site** tile; right-click to edit or remove; drag to reorder |

**Day start:** a new day begins at 4 AM by default, so late-night ticks count for the previous day. You can change the hour in Settings.

**Save vs. Replace:** when you edit an action, **Save** keeps its history (for rewording or a new target). **Replace** starts a new action; the old one stays in past heatmap days.

## Tasks

- **Carry-over:** a task you don't finish stays on your list each day after, marked "↻ 3d" with its age. From 7 days (change this in Settings) it's flagged "⚠" and shows **Drop** and **Move** buttons.
- **Scheduled date:** a task with a date stays hidden until that day (see **Upcoming**). Tick **Show it in Countdowns** to count down to it.
- **Counts toward:** link a task to a chart action, and completing the task ticks that action for the day. Undoing the task unticks it, unless you had ticked the action yourself.
- **Top 3:** star up to 3 tasks a day. They sort first, and finishing all three ticks "Daily top 3" (change the action in Settings).
- **Steps:** a task can have subtasks. Ticking the last one completes the task.
- **Repeat:** weekly on chosen days, or monthly on a day of the month. When you finish or drop one, the next is scheduled. An unfinished one carries over instead of piling up copies.
- **Past days:** with `←` the card shows what you finished that day. Ticking an open task there counts it as done on that day.

Click a task to edit it, right-click for more options, and drag to reorder.

## Backups

Data lives in `chrome.storage.local`. Uninstalling the extension deletes it, so use **Settings → Export backup** now and then. **Import backup** shows a summary of what it will replace before it changes anything.

## Development

```sh
npm run dev     # page at http://localhost:5173/newtab.html (uses localStorage instead of chrome.storage)
npm test        # unit tests (dates, cadences, streaks, tasks, storage, backups)
npm run build   # type-check + build to dist/
npm run icons   # regenerate public/icons/*.png
```

Stack: Vite + TypeScript + Preact + `@preact/signals`. Code layout:

- `src/model/` — data types, your starting chart, pure chart edits
- `src/lib/` — date, cadence, streak, stats and task logic
- `src/storage/` — persistence and syncing between tabs
- `src/components/` — the UI
