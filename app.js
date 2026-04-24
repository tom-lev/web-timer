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
  setTimeout(() => el.remove(), 3200);
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
      for (let i = 0; i < 5; i++) tone(1200 - i * 60, i * 0.12, 0.08, 'sawtooth', 0.3);
    },
  };

  const cycleDuration = { chime: 2200, bell: 3500, alarm: 900, beep: 1100, pulse: 1000 };
  const loops = {};

  function preview(soundKey) { if (sounds[soundKey]) sounds[soundKey](); }
  function startLoop(timerId, soundKey) {
    stopLoop(timerId);
    const fn = sounds[soundKey] || sounds.chime;
    fn();
    loops[timerId] = setInterval(fn, cycleDuration[soundKey] || 2000);
  }
  function stopLoop(timerId) {
    if (loops[timerId] != null) { clearInterval(loops[timerId]); delete loops[timerId]; }
  }
  function isLooping(timerId) { return loops[timerId] != null; }

  return { preview, startLoop, stopLoop, isLooping };
})();

// ── Web Worker ────────────────────────────────────────────────────────────
const worker = new Worker('./timer-worker.js');

// ── App ────────────────────────────────────────────────────────────────────
const App = (() => {
  const RING_R = 54;
  const CIRC   = +(2 * Math.PI * RING_R).toFixed(2);

  let timers    = {};  // runtime: id → { id, name, color, sound, total, remaining, state }
  let editingId = null;

  // ── Audio unlock ──────────────────────────────────────────────────────────
  let silentEl = null, audioUnlocked = false;

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

  // ── Navigation ────────────────────────────────────────────────────────────
  function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $(`page-${page}`).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${page}`));
  }

  // ── Persistence ──────────────────────────────────────────────────────────
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem('mt-saved')) || []; } catch { return []; }
  }
  function writeSaved(arr) { localStorage.setItem('mt-saved', JSON.stringify(arr)); }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  function startEditing(id) {
    const saved = loadSaved().find(s => s.id === id);
    if (!saved) return;
    editingId = id;
    $('timer-name').value  = saved.name;
    $('t-hours').value     = saved.hours;
    $('t-minutes').value   = saved.minutes;
    $('t-seconds').value   = saved.seconds;
    $('t-sound').value     = saved.sound;
    $('btn-save').textContent = '✓ Update Timer';
    $('edit-banner').style.display  = 'flex';
    $('edit-banner-name').textContent = saved.name;
    switchPage('new');
  }

  function cancelEdit() {
    editingId = null;
    $('btn-save').textContent = 'Save Timer';
    $('edit-banner').style.display = 'none';
    $('timer-name').value = '';
  }

  // ── Add / Update timer ────────────────────────────────────────────────────
  function saveNewTimer() {
    const name    = $('timer-name').value.trim() || 'Timer';
    const hours   = parseInt($('t-hours').value)   || 0;
    const minutes = parseInt($('t-minutes').value) || 0;
    const seconds = parseInt($('t-seconds').value) || 0;
    const sound   = $('t-sound').value;
    const total   = hmsToMs(hours, minutes, seconds);
    if (total <= 0) { showToast('Set a duration > 0', 'error'); return; }

    if (editingId) {
      // Update existing
      const saved = loadSaved();
      const idx   = saved.findIndex(s => s.id === editingId);
      if (idx !== -1) {
        saved[idx] = { ...saved[idx], name, hours, minutes, seconds, sound };
        writeSaved(saved);
      }
      const t = timers[editingId];
      if (t) {
        t.name  = name;
        t.sound = sound;
        if (t.state === 'idle') { t.total = total; t.remaining = total; }
        const card = document.querySelector(`.timer-circle[data-id="${editingId}"]`);
        if (card) {
          card.querySelector('.circle-name').textContent = name;
          if (t.state === 'idle') renderCircleFace(editingId);
        }
      }
      showToast(`"${name}" updated`);
      cancelEdit();
      renderSavedList();
      switchPage('home');
      return;
    }

    const id    = Date.now();
    const color = nextColor();
    const saved = loadSaved();
    saved.push({ id, name, hours, minutes, seconds, sound, color });
    writeSaved(saved);

    timers[id] = { id, name, color, sound, total, remaining: total, state: 'idle' };
    renderCircle(id);
    renderSavedList();
    showToast(`"${name}" saved`);
    $('timer-name').value = '';
    switchPage('home');
  }

  // ── Action sheet (from ⋮ button) ─────────────────────────────────────────
  function showOptions(id, e) {
    e.stopPropagation();
    const t = timers[id];
    if (!t) return;

    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'action-sheet';
    sheet.innerHTML = `
      <div class="sheet-handle"></div>
      <div class="sheet-title">${t.name}</div>
      <button class="sheet-btn" id="_edit">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>
      <button class="sheet-btn sheet-btn-danger" id="_delete">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Delete
      </button>
      <button class="sheet-btn sheet-btn-cancel" id="_cancel">Cancel</button>
    `;
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const close = () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 250);
    };
    overlay.addEventListener('click', ev => { if (ev.target === overlay) close(); });
    sheet.querySelector('#_edit').onclick   = () => { close(); startEditing(id); };
    sheet.querySelector('#_delete').onclick = () => { close(); deleteTimer(id); };
    sheet.querySelector('#_cancel').onclick = close;
  }

  // ── Delete timer ──────────────────────────────────────────────────────────
  function deleteTimer(id) {
    worker.postMessage({ cmd: 'stop', id });
    SoundEngine.stopLoop(id);
    delete timers[id];
    document.querySelector(`.timer-circle[data-id="${id}"]`)?.remove();
    writeSaved(loadSaved().filter(t => t.id !== id));
    renderSavedList();
    checkEmpty();
    msRefresh();
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  async function requestNotificationPermission() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    await Notification.requestPermission();
  }

  async function showTimerNotification(id, name) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(`⏱ ${name} finished!`, {
        body: 'Tap "Stop" to dismiss the alarm',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: `timer-done-${id}`,
        requireInteraction: true,
        actions: [{ action: 'stop', title: '🔇 Stop Alarm' }],
        data: { id },
      });
    } catch (e) { /* notifications not supported */ }
  }

  function dismissAlarm(id) {
    const t = timers[id];
    if (!t || t.state !== 'done') return;
    SoundEngine.stopLoop(id);
    worker.postMessage({ cmd: 'stop', id });
    t.remaining = t.total;
    t.state = 'idle';
    renderCircleFace(id);
    msRefresh();
    // Close any open notification for this timer
    navigator.serviceWorker?.ready.then(reg =>
      reg.getNotifications({ tag: `timer-done-${id}` })
        .then(ns => ns.forEach(n => n.close()))
    );
  }

  // ── Toggle (tap on circle) ────────────────────────────────────────────────
  function toggleTimer(id) {
    const t = timers[id];
    if (!t) return;
    unlockAudio();

    if (t.state === 'done') {
      dismissAlarm(id);
    } else if (t.state === 'running') {
      worker.postMessage({ cmd: 'pause', id });
    } else {
      // idle or paused → start / resume
      requestNotificationPermission();
      if (t.state === 'idle') t.remaining = t.total;
      t.state = 'running';
      worker.postMessage({ cmd: 'start', id, remaining: t.remaining });
      renderCircleFace(id);
      msRefresh();
    }
  }

  // ── Media session ─────────────────────────────────────────────────────────
  function msRefresh() {
    if (!('mediaSession' in navigator)) return;
    const all     = Object.values(timers);
    const running = all.filter(t => t.state === 'running');
    const paused  = all.filter(t => t.state === 'paused');
    const done    = all.filter(t => t.state === 'done');
    const active  = [...running, ...paused, ...done];

    if (active.length === 0) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      stopSilent();
      return;
    }

    if (running.length > 0) { playSilent(); } else { stopSilent(); }

    const visible = running.length > 0 ? running : (paused.length > 0 ? paused : done);
    const title   = visible.map(t => `${t.name}  ${formatTime(t.remaining)}`).join('   ·   ');

    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'MultiTimer', album: '' });
    navigator.mediaSession.playbackState = running.length > 0 ? 'playing' : 'paused';
  }

  function setupMediaActions() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.setActionHandler('play', () => {
      Object.entries(timers)
        .filter(([, t]) => t.state === 'paused')
        .forEach(([id]) => toggleTimer(Number(id)));
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      Object.entries(timers)
        .filter(([, t]) => t.state === 'running')
        .forEach(([id]) => toggleTimer(Number(id)));
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      Object.entries(timers)
        .filter(([, t]) => t.state === 'done')
        .forEach(([id]) => toggleTimer(Number(id)));
    });
  }

  // ── Worker messages ───────────────────────────────────────────────────────
  worker.onmessage = ({ data }) => {
    const t = timers[data.id];
    if (!t) return;
    if (data.type === 'tick') {
      t.remaining = data.remaining;
      renderCircleFace(data.id);
      msRefresh();
    } else if (data.type === 'done') {
      t.remaining = 0;
      t.state = 'done';
      renderCircleFace(data.id);
      SoundEngine.startLoop(data.id, t.sound);
      msRefresh();
      showToast(`"${t.name}" finished!`, 'success');
      showTimerNotification(data.id, t.name);
    } else if (data.type === 'paused') {
      t.remaining = data.remaining;
      t.state = 'paused';
      renderCircleFace(data.id);
      msRefresh();
    }
  };

  // ── Rendering ─────────────────────────────────────────────────────────────
  function renderCircle(id) {
    const t    = $('empty-home');
    const grid = $('circles-grid');
    if (t) t.style.display = 'none';

    const timer = timers[id];
    const card  = document.createElement('div');
    card.className  = 'timer-circle';
    card.dataset.id = id;
    card.innerHTML  = `
      <button class="circle-options" onclick="App.showOptions(${id}, event)">⋮</button>
      <div class="circle-wrap">
        <svg class="circle-svg" width="130" height="130" viewBox="0 0 130 130">
          <circle class="ring-bg"   cx="65" cy="65" r="${RING_R}" stroke-width="9"/>
          <circle class="ring-fill" cx="65" cy="65" r="${RING_R}" stroke-width="9"
                  id="ring-${id}"
                  stroke-dasharray="${CIRC}"
                  stroke-dashoffset="0"
                  stroke="${timer.color}"/>
        </svg>
        <div class="circle-inner">
          <div class="circle-time"  id="display-${id}">${formatTime(timer.total)}</div>
          <div class="circle-state" id="state-${id}">▶</div>
        </div>
      </div>
      <div class="circle-name">${timer.name}</div>
    `;
    card.addEventListener('click', () => toggleTimer(id));
    grid.appendChild(card);
  }

  function renderCircleFace(id) {
    const t = timers[id];
    if (!t) return;

    const ring    = $(`ring-${id}`);
    const display = $(`display-${id}`);
    const state   = $(`state-${id}`);
    const card    = document.querySelector(`.timer-circle[data-id="${id}"]`);

    if (display) display.textContent = formatTime(t.remaining);

    if (ring) {
      const frac   = t.total > 0 ? t.remaining / t.total : 0;
      const offset = +(CIRC * (1 - frac)).toFixed(2);
      ring.style.strokeDashoffset = offset;
      ring.style.stroke = t.state === 'done' ? '#4ade80'
                        : frac > 0.5          ? t.color
                        : frac > 0.2          ? '#facc15'
                        :                       '#f87171';
    }

    if (state) {
      state.textContent = t.state === 'running' ? '⏸'
                        : t.state === 'done'    ? '🔔'
                        :                         '▶';
    }

    if (card) {
      card.className  = `timer-circle ${t.state}`;
      card.dataset.id = id;
    }
  }

  function renderSavedList() {
    const container = $('saved-items');
    if (!container) return;
    const saved = loadSaved();
    if (!saved.length) {
      container.innerHTML = '<p class="no-saved">No timers saved yet.</p>';
      return;
    }
    container.innerHTML = '';
    saved.forEach(s => {
      const item = document.createElement('div');
      item.className = 'saved-item';
      item.innerHTML = `
        <div class="saved-dot" style="background:${s.color}"></div>
        <div class="saved-info">
          <span class="saved-name">${s.name}</span>
          <span class="saved-dur">${formatTime(hmsToMs(s.hours, s.minutes, s.seconds))}</span>
        </div>
        <button class="btn-delete" onclick="App.deleteTimer(${s.id})" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      container.appendChild(item);
    });
  }

  function checkEmpty() {
    const hasCircles = !!document.querySelector('.timer-circle');
    const empty = $('empty-home');
    if (empty) empty.style.display = hasCircles ? 'none' : 'flex';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    const saved = loadSaved();
    colorIndex  = saved.length % COLORS.length;

    saved.forEach(s => {
      const total = hmsToMs(s.hours, s.minutes, s.seconds);
      timers[s.id] = { id: s.id, name: s.name, color: s.color, sound: s.sound,
                       total, remaining: total, state: 'idle' };
    });

    if (saved.length > 0) {
      $('empty-home').style.display = 'none';
      saved.forEach(s => renderCircle(s.id));
    }

    renderSavedList();
    setupMediaActions();

    ['timer-name', 't-hours', 't-minutes', 't-seconds'].forEach(id => {
      $(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') saveNewTimer(); });
    });
  }

  init();
  return { saveNewTimer, deleteTimer, toggleTimer, switchPage, showOptions, cancelEdit, dismissAlarm };
})();

// ── SW message listener (for notification Stop action) ─────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'STOP_ALARM') App.dismissAlarm(event.data.id);
  });
}

// ── Service Worker ─────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => {})
      .catch(err => console.warn('SW Fail', err));
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
