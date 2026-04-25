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
