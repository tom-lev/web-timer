# MultiTimer

A dependency-free Progressive Web App for managing multiple simultaneous countdown timers — built with vanilla JavaScript, no frameworks, no build step.

![PWA](https://img.shields.io/badge/PWA-ready-6c63ff) ![Vanilla JS](https://img.shields.io/badge/JavaScript-vanilla-f7df1e) ![No dependencies](https://img.shields.io/badge/dependencies-none-brightgreen)

---

## Overview

MultiTimer lets you run as many countdown timers as you need, all at once, each with its own name, color, and alert sound. It works fully offline, installs as a native-like app on any device, and requires no account or connection after the first load.

---

## Features

### Multiple Simultaneous Timers
Create and run any number of timers in parallel. Each timer is independently named, colored, and configured — ideal for cooking multiple dishes, interval training, or Pomodoro workflows.

### 3D Drum Picker
Time input uses a custom-built cylindrical scroll picker — smooth, tactile, and designed to feel native on both desktop and mobile.

### Rich Sound Library
Each timer can play a different alert sound when it finishes. The library includes:

- **Procedural tones** — chimes, beeps, and bells synthesized in real time via the Web Audio API, with no audio files required.
- **Classic alerts** — familiar notification and clock sounds.
- **AI-generated contextual songs** — the standout feature of the sound library. Instead of a generic beep, your timer can finish with a short song that actually matches what you were timing:

| Sound | Context |
|---|---|
| *The Rice Is Ready* | Cooking rice |
| *The Fish Is Ready* | Baking or pan-frying fish |
| *The Fish in the Oven (A Cappella)* | Oven-roasted fish, a cappella style |
| *Hard Boiled Baby* | Boiling eggs |
| *Salt Roasted Chicken* | Roasting chicken |
| *Ten Minutes* | General-purpose countdown |

These tracks were generated with AI specifically for this app — each one is a short musical cue written around the moment the timer ends.

### Extensible Custom Sounds
Adding a new sound requires only two steps: drop an MP3 or WAV file into `custom-sounds/` and add one line to `sounds.json`. No code changes needed.

### Saved Timer Templates
Save frequently used timer configurations (name, duration, color, sound) to a persistent list. Re-launch any saved timer in one tap.

### Offline-First PWA
A service worker caches the entire app shell on first load. MultiTimer works without a network connection and can be installed to the home screen on Android and iOS.

### Browser Notifications
Timers fire a push notification when they finish, even if the browser tab is in the background.

### Haptic Feedback
On supported mobile devices, timer completion triggers a repeating vibration pattern so you feel the alert even with the sound off.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI & logic | Vanilla JavaScript (ES2020) |
| Off-thread timing | Web Worker (`setInterval` at 250 ms) |
| Sound synthesis | Web Audio API |
| Custom audio | `AudioBuffer` + `AudioBufferSourceNode` |
| Offline support | Service Worker (cache-first) |
| Persistence | `localStorage` |
| Install / manifest | Web App Manifest (PWA) |
| Styling | CSS custom properties, no preprocessor |
| Build tooling | None |

---

## Running Locally

```bash
# Any static file server works — for example:
python3 -m http.server 8080
# then open http://localhost:8080
```

There is no build step, no `npm install`, and no configuration required.

---

## Project Structure

```
├── index.html          # App shell
├── app.js              # Main thread: UI, state, rendering
├── timer-worker.js     # Web Worker: tick loop
├── sw.js               # Service Worker: caching + notifications
├── style.css           # All styling, CSS design tokens
├── manifest.json       # PWA manifest
└── custom-sounds/
    ├── sounds.json     # Sound registry (name → filename)
    └── *.mp3 / *.wav   # Audio files
```

---

## License

MIT
