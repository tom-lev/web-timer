# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MultiTimer is a dependency-free PWA for managing multiple simultaneous countdown timers. It uses vanilla JavaScript with no build tools, frameworks, or npm — files are served directly as static assets.

## Development

**No build step.** Serve the files from any static HTTP server:

```bash
python3 -m http.server 8080
# or
npx serve .
```

There are no lint, test, or compile commands.

## Architecture

The app is split across three execution contexts that communicate via message passing:

### Main Thread (`app.js`)
Handles all UI rendering and user interactions. Organized around a single `App` object containing:
- Timer state management (idle/running/paused/done)
- `localStorage` persistence under key `mt-saved` (array of saved timer templates)
- Rendering of circle cards and the saved-timers list
- Coordination with the worker and service worker

### Web Worker (`timer-worker.js`)
Runs a `setInterval` at 250ms to tick timers accurately off the main thread. Receives `{cmd: 'start'|'pause'|'stop', id, remaining}` and emits `{type: 'tick'|'done'|'paused', id, remaining}`.

### Service Worker (`sw.js`)
Cache-first strategy for the app shell (offline support). Also handles notification clicks, forwarding `STOP_ALARM` messages to the main thread.

### Key Components in `app.js`

| Component | Lines | Purpose |
|-----------|-------|---------|
| `DrumPicker` class | ~50–183 | Custom 3D cylindrical scroll picker for hours/minutes/seconds |
| `SoundEngine` | ~186–310 | Web Audio API: 5 procedural sounds + custom MP3/WAV loading |
| `VibrationEngine` | ~313–331 | Repeating haptic pattern via Vibration API |
| `App` object | ~337–861 | Everything else: state, rendering, persistence, notifications |

### Custom Sounds

`custom-sounds/sounds.json` maps display names to audio filenames. Adding a new custom sound requires adding an entry here and placing the file in `custom-sounds/`.

## Data Model

Saved timers in `localStorage` (`mt-saved`):
```js
{ id, name, hours, minutes, seconds, sound, color }
```

Active (in-memory) timers add: `{ remaining, state, intervalId, workerRef }`.

## CSS Design Tokens

Color palette is defined via CSS custom properties on `:root` in `style.css`. Primary accent is `#6c63ff` (purple). Timer circle colors cycle through an 8-color palette via `nextColor()` in `app.js`.

## Token Efficiency

- Read only the specific lines needed (`offset`/`limit`) rather than entire files.
- Use `grep` or `find` to locate symbols before reading; avoid reading files speculatively.
- Prefer `Edit` over `Write` for changes — it sends only the diff.
- Batch independent tool calls in a single message to avoid round-trip overhead.
- Avoid re-reading files already in context; refer to previously seen content instead.
- Skip explanatory comments in code; keep commit messages and prose responses concise.
- Do not create intermediate planning documents; reason in the conversation and act.
- Use targeted `grep` patterns (`-n`, `-A`, `-B`) to pull just the relevant lines rather than reading whole sections.

## Development Roadmap (Priority Order)

1. **Timer repeat/loop mode** — Allow a timer to auto-restart when done. Critical for workouts, Pomodoro, and interval training. Add a `repeat` boolean to the saved-timer schema and handle the `done` event in `app.js` by re-triggering `start`.

2. **Countdown warning sounds** — Play a short alert at configurable thresholds before the timer ends (e.g., 1 min, 30 sec, 10 sec remaining). Hook into the `tick` handler in `app.js` and trigger a one-shot sound via `SoundEngine`.

3. **Volume control** — Global (or per-timer) volume slider. `SoundEngine` already uses a `GainNode`; expose its `.gain.value` through a settings UI.

4. **Accessibility pass** — Add `aria-label` attributes to circle cards and action buttons, enable keyboard navigation (Space to start/pause, Delete to remove), and ensure the drum picker is operable via arrow keys.

5. **Export / Import saved timers** — Let users download their `mt-saved` array as JSON and re-import it. Useful for backup and sharing presets between devices.

6. **Custom color picker per timer** — Currently `nextColor()` assigns colors automatically. Add a color swatch selector in the new-timer form so users can choose their own color, stored in the saved-timer schema.

7. **Fullscreen focus mode** — Single-timer expanded view (tap a circle to enter). Hides all other timers and shows a large countdown display. Useful when only one timer matters.

8. **Light theme** — Add a `data-theme="light"` variant with inverted CSS custom properties. Respect `prefers-color-scheme` by default with a manual toggle in settings.

9. **Timer groups / categories** — Allow saved timers to be tagged or grouped (e.g., "Cooking", "Workout"). Rendered as collapsible sections in the saved-timers list. Requires a `group` field in the saved-timer schema.

10. **Timer history log** — Record each timer completion (name, timestamp, duration) in `localStorage`. Show a simple history sheet accessible from the home screen.
