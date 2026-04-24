// ── Utilities ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function pad(n) { return String(n).padStart(2, '0'); }
function msToHMS(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s };
}
function hmsToMs(h, m, s) { return ((h * 3600) + (m * 60) + s) * 1000; }
function formatTime(ms) {
  const { h, m, s } = msToHMS(ms);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Color palette ──────────────────────────────────────────────────────────
const COLORS = ['#6c63ff','#ff6584','#4ade80','#facc15','#38bdf8','#fb923c','#a78bfa','#34d399'];
let colorIndex = 0;
function nextColor() { return COLORS[colorIndex++ % COLORS.length]; }

// ── Sound Engine ───────────────────────────────────────────────────────────
const SoundEngine = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx || ctx.state === 'closed') ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, startAt, duration, type = 'sine', peakGain = 0.38) {
    const c = getCtx();
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, c.currentTime + startAt);
    gain.gain.linearRampToValueAtTime(peakGain, c.currentTime + startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startAt + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime + startAt);
    osc.stop(c.currentTime + startAt + duration + 0.05);
  }

  const sounds = {
    chime() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.2, 0.55, 'sine', 0.36)); },
    bell() {
      [[1, 0.5], [2.76, 0.25], [5.4, 0.12], [8.93, 0.07]].forEach(([ratio, amp]) => {
        tone(440 * ratio, 0, 3.0, 'sine', amp);
      });
    },
    alarm() {
      [0, 0.44].forEach(t => tone(960, t, 0.4, 'square', 0.18));
      [0.22, 0.66].forEach(t => tone(760, t, 0.4, 'square', 0.18));
    },
    beep() { [0, 0.22, 0.44].forEach(t => tone(880, t, 0.14, 'sine', 0.4)); },
    pulse() {
      for (let i = 0; i < 5; i++) {
        tone(1200 - i * 60, i * 0.12, 0.08, 'sawtooth', 0.3);
      }
    },
  };

  const cycleDuration = { chime: 2200, bell: 3500, alarm: 900, beep: 1100, pulse: 1000 };
  const loops = {};

  function preview(soundKey) { if (sounds[soundKey]) sounds[soundKey](); }
  function startLoop(timerId, soundKey) {
    stopLoop(timerId);
    const fn = sounds[soundKey] || sounds.chime;
    fn();
    const period = cycleDuration[soundKey] || 2000;
    loops[timerId] = setInterval(fn, period);
  }
  function stopLoop(timerId) {
    if (loops[timerId] != null) { clearInterval(loops[timerId]); delete loops[timerId]; }
  }
  function isLooping(timerId) { return loops[timerId] != null; }

  return { preview, startLoop, stopLoop, isLooping };
})();

const SOUND_LABEL = { chime:'🎵 Chime', bell:'🔔 Bell', alarm:'🚨 Alarm', beep:'📳 Beep', pulse:'💥 Pulse' };

// ── Web Worker ────────────────────────────────────────────────────────────
const worker = new Worker('./timer-worker.js');

// ── App ────────────────────────────────────────────────────────────────────
const App = (() => {
  const RING_R = 52;
  const CIRC   = 2 * Math.PI * RING_R;
  let timers   = {};
  let uid      = 1;

  let silentEl = null;
  let audioUnlocked = false;

  function ensureSilentAudio() {
    if (silentEl) return;
    const wav = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    silentEl = new window.Audio(wav);
    silentEl.loop   = true;
    silentEl.volume = 0.001;
  }

  function unlockAudio() {
    ensureSilentAudio();
    if (audioUnlocked) return;
    silentEl.play().then(() => { audioUnlocked = true; }).catch(() => {});
  }

  function playSilent() {
    ensureSilentAudio();
    if (silentEl.paused) silentEl.play().catch(() => {});
  }

  function stopSilent() {
    if (silentEl && !silentEl.paused) { silentEl.pause(); silentEl.currentTime = 0; }
  }

  function msRefresh() {
    if (!('mediaSession' in navigator)) return;
    const all = Object.values(timers);
    const best = all.find(t => t.state === 'running') || all.find(t => t.state === 'paused') || all.find(t => t.state === 'done');
    if (!best) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      stopSilent();
      return;
    }
    playSilent();
    const icon = best.state === 'running' ? ' ▶' : best.state === 'paused' ? ' ⏸' : ' ✅';
    navigator.mediaSession.metadata = new MediaMetadata({
      title: formatTime(best.remaining) + icon,
      artist: best.name,
      album: 'MultiTimer',
    });
    navigator.mediaSession.playbackState = best.state === 'running' ? 'playing' : 'paused';
  }

  function setupMediaActions() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      const entry = Object.entries(timers).find(([,t]) => t.state === 'paused');
      if (entry) startTimer(Number(entry[0]));
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const entry = Object.entries(timers).find(([,t]) => t.state === 'running');
      if (entry) pauseTimer(Number(entry[0]));
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      Object.entries(timers).forEach(([id, t]) => { if (t.state === 'done') stopAlarm(Number(id)); });
    });
  }

  worker.onmessage = ({ data }) => {
    const t = timers[data.id];
    if (!t) return;
    if (data.type === 'tick') {
      t.remaining = data.remaining;
      renderTimerFace(data.id);
      msRefresh();
    } else if (data.type === 'done') {
      t.remaining = 0;
      t.state = 'done';
      renderTimerFace(data.id);
      updateCardState(data.id);
      SoundEngine.startLoop(data.id, t.sound);
      msRefresh();
      showToast(`"${t.name}" finished!`, 'success');
    } else if (data.type === 'paused') {
      t.remaining = data.remaining;
      t.state = 'paused';
      renderTimerFace(data.id);
      updateCardState(data.id);
      msRefresh();
    }
  };

  function addTimer(preset = null) {
    const name = preset ? preset.name : ($('timer-name').value.trim() || 'Timer');
    const hours = preset ? preset.hours : parseInt($('t-hours').value) || 0;
    const minutes = preset ? preset.minutes : parseInt($('t-minutes').value) || 0;
    const seconds = preset ? preset.seconds : parseInt($('t-seconds').value) || 0;
    const sound = preset ? (preset.sound || 'chime') : $('t-sound').value;
    const total = hmsToMs(hours, minutes, seconds);
    if (total <= 0) { showToast('Set a duration > 0', 'error'); return; }
    const id = uid++;
    const color = nextColor();
    timers[id] = { name, color, sound, total, remaining: total, state: 'idle', hours, minutes, seconds };
    renderTimer(id);
    if (!preset) $('timer-name').value = '';
  }

  function startTimer(id) {
    const t = timers[id];
    if (!t || t.state === 'running') return;
    unlockAudio();
    SoundEngine.stopLoop(id);
    if (t.state === 'done') t.remaining = t.total;
    t.state = 'running';
    worker.postMessage({ cmd: 'start', id, remaining: t.remaining });
    updateCardState(id);
    renderTimerFace(id);
    msRefresh();
  }

  function pauseTimer(id) {
    const t = timers[id];
    if (!t || t.state !== 'running') return;
    worker.postMessage({ cmd: 'pause', id });
  }

  function resetTimer(id) {
    const t = timers[id];
    if (!t) return;
    worker.postMessage({ cmd: 'stop', id });
    SoundEngine.stopLoop(id);
    t.remaining = t.total;
    t.state = 'idle';
    renderTimerFace(id);
    updateCardState(id);
    msRefresh();
  }

  function stopAlarm(id) {
    SoundEngine.stopLoop(id);
    updateCardState(id);
    msRefresh();
  }

  function removeTimer(id) {
    worker.postMessage({ cmd: 'stop', id });
    SoundEngine.stopLoop(id);
    delete timers[id];
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) card.remove();
    checkEmpty();
    msRefresh();
  }

  function savePreset(id) {
    const t = timers[id];
    if (!t) return;
    const presets = loadPresets();
    presets.push({ name: t.name, hours: t.hours, minutes: t.minutes, seconds: t.seconds, sound: t.sound });
    localStorage.setItem('mt-presets', JSON.stringify(presets));
    renderPresets();
    showToast(`Preset "${t.name}" saved`);
  }

  function deletePreset(idx) {
    const presets = loadPresets();
    presets.splice(idx, 1);
    localStorage.setItem('mt-presets', JSON.stringify(presets));
    renderPresets();
  }

  function loadPresets() { try { return JSON.parse(localStorage.getItem('mt-presets')) || []; } catch { return []; } }

  function ringOffset(remaining, total) { const frac = total > 0 ? remaining / total : 0; return CIRC * (1 - frac); }
  function ringColor(remaining, total) {
    const pct = total > 0 ? remaining / total : 0;
    if (pct > 0.5) return '#6c63ff';
    if (pct > 0.2) return '#facc15';
    return '#f87171';
  }

  function renderTimer(id) {
    const t = timers[id];
    const grid = $('timers-grid');
    const empty = grid.querySelector('.empty-state');
    if (empty) empty.remove();
    const card = document.createElement('div');
    card.className = 'timer-card';
    card.dataset.id = id;
    card.innerHTML = `
      <div class="timer-header">
        <div class="timer-color-dot" style="background:${t.color}"></div>
        <span class="timer-name" title="${t.name}">${t.name}</span>
        <span class="sound-badge" id="sound-badge-${id}">${SOUND_LABEL[t.sound] || t.sound}</span>
        <button class="btn-icon" onclick="App.removeTimer(${id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="timer-visual">
        <svg class="progress-ring" width="130" height="130" viewBox="0 0 130 130">
          <circle class="ring-bg" cx="65" cy="65" r="${RING_R}" stroke-width="10"/>
          <circle class="ring-fill" id="ring-${id}" cx="65" cy="65" r="${RING_R}" stroke-width="10" stroke-dasharray="${CIRC}" stroke-dashoffset="0" stroke="${t.color}"/>
        </svg>
        <div class="timer-time-overlay">
          <div class="timer-display" id="display-${id}">${formatTime(t.total)}</div>
          <div class="timer-status status-idle" id="status-${id}">READY</div>
        </div>
      </div>
      <div class="alarm-banner" id="alarm-banner-${id}" style="display:none;">
        <span>🔔 Alarm!</span>
        <button class="btn btn-stop-alarm" onclick="App.stopAlarm(${id})">Stop</button>
      </div>
      <div class="timer-controls">
        <button class="btn btn-primary" id="btn-start-${id}" onclick="App.startTimer(${id})">▶ Start</button>
        <button class="btn btn-ghost" id="btn-pause-${id}" onclick="App.pauseTimer(${id})" disabled>⏸ Pause</button>
        <button class="btn btn-ghost btn-sm" onclick="App.resetTimer(${id})">↺</button>
      </div>
      <div class="save-preset-row">
        <button class="btn btn-ghost btn-sm" onclick="App.savePreset(${id})">Save Preset</button>
      </div>
    `;
    grid.appendChild(card);
  }

  function renderTimerFace(id) {
    const t = timers[id];
    if (!t) return;
    $(`display-${id}`).textContent = formatTime(t.remaining);
    $(`ring-${id}`).style.strokeDashoffset = ringOffset(t.remaining, t.total);
    $(`ring-${id}`).style.stroke = t.state === 'done' ? '#4ade80' : ringColor(t.remaining, t.total);
  }

  function updateCardState(id) {
    const t = timers[id];
    if (!t) return;
    const ringing = SoundEngine.isLooping(id);
    const statusEl = $(`status-${id}`);
    const btnStart = $(`btn-start-${id}`);
    const btnPause = $(`btn-pause-${id}`);
    const banner = $(`alarm-banner-${id}`);
    const stateMap = {
      idle: { label:'READY', cls:'status-idle', startTxt:'▶ Start', startDis:false, pauseDis:true },
      running: { label:'RUNNING', cls:'status-running', startTxt:'▶ Start', startDis:true, pauseDis:false },
      paused: { label:'PAUSED', cls:'status-paused', startTxt:'▶ Resume', startDis:false, pauseDis:true },
      done: { label:'DONE', cls:'status-done', startTxt:'↺ Restart', startDis:false, pauseDis:true },
    };
    const s = stateMap[t.state] || stateMap.idle;
    statusEl.textContent = s.label;
    statusEl.className = `timer-status ${s.cls}`;
    btnStart.textContent = s.startTxt;
    btnStart.disabled = s.startDis;
    btnPause.disabled = s.pauseDis;
    if (banner) banner.style.display = ringing ? 'flex' : 'none';
  }

  function renderPresets() {
    const list = $('presets-list');
    const presets = loadPresets();
    list.innerHTML = '';
    if (!presets.length) { list.innerHTML = '<span class="no-presets">No presets.</span>'; return; }
    presets.forEach((p, i) => {
      const chip = document.createElement('div');
      chip.className = 'preset-chip';
      chip.innerHTML = `<button onclick='App.addTimer(${JSON.stringify(p)})'>${p.name} · ${formatTime(hmsToMs(p.hours,p.minutes,p.seconds))}</button><button onclick="App.deletePreset(${i})">✕</button>`;
      list.appendChild(chip);
    });
  }

  function checkEmpty() { if (!$('timers-grid').querySelector('.timer-card')) $('timers-grid').innerHTML = '<div class="empty-state">⏳ No timers.</div>'; }

  function init() {
    renderPresets();
    setupMediaActions();
    ['timer-name','t-hours','t-minutes','t-seconds'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') addTimer(); }));
  }

  init();
  return { addTimer, startTimer, pauseTimer, resetTimer, stopAlarm, removeTimer, savePreset, deletePreset };
})();

// ── Media Session Handler ──────────────────────────────────────────────────
(function initMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const snd = new window.Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
  snd.loop = true;
  snd.volume = 0.001;

  document.addEventListener('click', function unlock() {
    snd.play().catch(() => {});
    document.removeEventListener('click', unlock, true);
  }, true);

  function updateNotification() {
    const cards = Array.from(document.querySelectorAll('.timer-card[data-id]')).map(card => {
      const id = Number(card.dataset.id);
      return { id, name: card.querySelector('.timer-name').textContent, timeStr: $(`display-${id}`).textContent, state: $(`status-${id}`).textContent.toLowerCase() };
    });
    const best = cards.find(t => t.state === 'running') || cards.find(t => t.state === 'paused') || cards.find(t => t.state === 'done');
    if (!best) { navigator.mediaSession.metadata = null; return; }
    if (best.state === 'running') snd.play().catch(() => {}); else snd.pause();
    navigator.mediaSession.metadata = new MediaMetadata({ title: best.timeStr, artist: best.name, album: 'MultiTimer' });
  }
  setInterval(updateNotification, 1000);
})();

// ── Service Worker ─────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => console.log('SW OK')).catch(err => console.warn('SW Fail'));
  });
}

// ── PWA Install ────────────────────────────────────────────────────────────
(function initInstallPrompt() {
  let deferredPrompt = null;
  const btn = $('pwa-install-btn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (btn) btn.style.display = 'inline-flex';
  });
  btn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt = null;
    btn.style.display = 'none';
  });
})();
