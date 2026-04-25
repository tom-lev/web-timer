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

// ── Tick sound for drum picker ─────────────────────────────────────────────
let _tickCtx = null;
function playTick() {
  try {
    if (!_tickCtx || _tickCtx.state === 'closed')
      _tickCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_tickCtx.state === 'suspended') _tickCtx.resume();
    const osc  = _tickCtx.createOscillator();
    const gain = _tickCtx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.08, _tickCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _tickCtx.currentTime + 0.045);
    osc.connect(gain);
    gain.connect(_tickCtx.destination);
    osc.start(_tickCtx.currentTime);
    osc.stop(_tickCtx.currentTime + 0.05);
  } catch (_) {}
}

// ── Drum Picker (3D cylinder, circular) ───────────────────────────────────
class DrumPicker {
  constructor(el, values, initial = 0) {
    this.el       = el;
    this.values   = values;
    this.ITEM_H   = 44;
    this.RADIUS   = 130;
    this.STEP_DEG = (this.ITEM_H / this.RADIUS) * (180 / Math.PI); // ≈ 19.4°
    this.scrollY  = initial * this.ITEM_H;
    this.selected = initial;
    this.dragging    = false;
    this.startY      = 0;
    this.startScroll = 0;
    this.lastY    = 0;
    this.velocity = 0;
    this.lastSel  = initial;
    this._build();
    this._bind();
    this._render();
  }

  _build() {
    this.items = this.values.map(v => {
      const item = document.createElement('div');
      item.className = 'drum-item';
      item.textContent = String(v).padStart(2, '0');
      this.el.appendChild(item);
      return item;
    });
  }

  // Wrap index into [0, n)
  _wrap(i) {
    const n = this.values.length;
    return ((i % n) + n) % n;
  }

  _render() {
    const n      = this.values.length;
    const selF   = this.scrollY / this.ITEM_H;
    const rawSel = Math.round(selF);
    const newSel = this._wrap(rawSel);
    if (newSel !== this.lastSel) { playTick(); this.lastSel = newSel; }
    this.selected = newSel;

    const STEP_RAD = this.ITEM_H / this.RADIUS;
    const VISIBLE  = 4; // items rendered each side of center

    for (const item of this.items) { item.style.opacity = '0'; item.classList.remove('selected'); }

    for (let offset = -VISIBLE; offset <= VISIBLE; offset++) {
      const posIdx = rawSel + offset;
      const valIdx = this._wrap(posIdx);
      const dist   = selF - posIdx;   // positive = item is above center
      const deg    = dist * this.STEP_DEG;
      if (Math.abs(deg) >= 88) continue;
      const cos = Math.cos(dist * STEP_RAD);
      const item = this.items[valIdx];
      item.style.opacity   = String(Math.max(0, cos * cos * cos).toFixed(3));
      item.style.transform = `rotateX(${deg.toFixed(2)}deg)`;
      item.classList.toggle('selected', valIdx === newSel);
    }
  }

  _snap() {
    const n       = this.values.length;
    const snapRaw = Math.round(this.scrollY / this.ITEM_H);
    const snapNorm = this._wrap(snapRaw);
    this.scrollY  = snapRaw * this.ITEM_H;
    this.selected = snapNorm;
    this.el.classList.add('snapping');
    this._render();
    setTimeout(() => {
      this.el.classList.remove('snapping');
      // Normalize scrollY so it stays close to 0 after many wraps
      this.scrollY = snapNorm * this.ITEM_H;
      this.lastSel = snapNorm;
    }, 300);
  }

  _bind() {
    const onStart = y => {
      // Normalize before each drag starts
      this.scrollY = this.selected * this.ITEM_H;
      this.dragging    = true;
      this.startY      = y;
      this.startScroll = this.scrollY;
      this.lastY       = y;
      this.velocity    = 0;
    };
    const onMove = y => {
      if (!this.dragging) return;
      this.velocity = y - this.lastY;
      this.lastY    = y;
      // Drag UP → scrollY increases → higher index selected
      this.scrollY = this.startScroll - (y - this.startY);
      this._render();
    };
    const onEnd = () => {
      if (!this.dragging) return;
      this.dragging = false;
      if (Math.abs(this.velocity) > 3) {
        this.scrollY -= this.velocity * 5;
        this._render();
        setTimeout(() => this._snap(), 60);
      } else {
        this._snap();
      }
    };

    this.el.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
    this.el.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientY); }, { passive: false });
    this.el.addEventListener('touchend',   () => onEnd());
    this.el.addEventListener('mousedown',  e => { e.preventDefault(); onStart(e.clientY); });
    window.addEventListener('mousemove',   e => { if (this.dragging) onMove(e.clientY); });
    window.addEventListener('mouseup',     () => onEnd());
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      // Scroll up (deltaY < 0) → higher value
      this.scrollY = this.selected * this.ITEM_H - Math.sign(e.deltaY) * this.ITEM_H;
      this._snap();
    }, { passive: false });
  }

  getValue() { return this.values[this.selected]; }

  setValue(v) {
    const idx = this.values.indexOf(v);
    if (idx < 0) return;
    this.selected = idx;
    this.lastSel  = idx;
    this.scrollY  = idx * this.ITEM_H;
    this._render();
  }
}

// ── Sound Engine ───────────────────────────────────────────────────────────
const SoundEngine = (() => {
  let ctx = null;
  let masterNode = null; // all sources connect here → compressor → destination

  function getCtx() {
    if (!ctx || ctx.state === 'closed') {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Loudness maximizer: boost gain then hard-limit to prevent clipping
      const gain = ctx.createGain();
      gain.gain.value = 3.0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -6;
      comp.knee.value      = 0;
      comp.ratio.value     = 20;
      comp.attack.value    = 0.001;
      comp.release.value   = 0.05;
      gain.connect(comp);
      comp.connect(ctx.destination);
      masterNode = gain;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function getDest() { getCtx(); return masterNode; }

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
    gain.connect(getDest());
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

  // ── Custom audio file support ─────────────────────────────────────────────
  const customBuffers = {};   // filename → decoded AudioBuffer
  const customSources = {};   // timerId  → AudioBufferSourceNode (looping)

  async function loadCustomBuffer(filename) {
    if (customBuffers[filename]) return customBuffers[filename];
    const url = `custom-sounds/${encodeURIComponent(filename)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const audioBuffer = await getCtx().decodeAudioData(arrayBuf);
    customBuffers[filename] = audioBuffer;
    return audioBuffer;
  }

  async function preview(soundKey) {
    if (sounds[soundKey]) { sounds[soundKey](); return; }
    try {
      const buffer = await loadCustomBuffer(soundKey);
      const c = getCtx();
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(getDest());
      src.start(0);
    } catch (e) { console.warn('Custom sound preview failed:', soundKey, e); }
  }

  async function startLoop(timerId, soundKey) {
    stopLoop(timerId);
    if (sounds[soundKey]) {
      const fn = sounds[soundKey];
      fn();
      loops[timerId] = setInterval(fn, cycleDuration[soundKey] || 2000);
      return;
    }
    try {
      const buffer = await loadCustomBuffer(soundKey);
      const c = getCtx();
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(getDest());
      src.start(0);
      customSources[timerId] = src;
    } catch (e) {
      // Fall back to chime if custom file is unavailable
      const fn = sounds.chime;
      fn();
      loops[timerId] = setInterval(fn, 2000);
    }
  }

  function stopLoop(timerId) {
    if (loops[timerId] != null) { clearInterval(loops[timerId]); delete loops[timerId]; }
    if (customSources[timerId]) {
      try { customSources[timerId].stop(); } catch (_) {}
      delete customSources[timerId];
    }
  }

  function isLooping(timerId) { return loops[timerId] != null || timerId in customSources; }

  return { preview, startLoop, stopLoop, isLooping };
})();

// ── Vibration Engine ───────────────────────────────────────────────────────
const VibrationEngine = (() => {
  const loops = {};
  const PATTERN  = [300, 120, 300, 120, 300, 700]; // three bursts + pause
  const CYCLE_MS = PATTERN.reduce((a, b) => a + b, 0) + 50;

  function start(timerId) {
    if (!navigator.vibrate) return;
    stop(timerId);
    navigator.vibrate(PATTERN);
    loops[timerId] = setInterval(() => navigator.vibrate(PATTERN), CYCLE_MS);
  }

  function stop(timerId) {
    if (loops[timerId] != null) { clearInterval(loops[timerId]); delete loops[timerId]; }
    try { navigator.vibrate(0); } catch (_) {}
  }

  return { start, stop };
})();

// ── Web Worker ────────────────────────────────────────────────────────────
const worker = new Worker('./timer-worker.js');

// ── App ────────────────────────────────────────────────────────────────────
const App = (() => {
  const RING_R = 54;
  const CIRC   = +(2 * Math.PI * RING_R).toFixed(2);

  let timers    = {};  // runtime: id → { id, name, color, sound, total, remaining, state, overtime }
  let editingId = null;
  let drums     = {};  // { h, m, s } — DrumPicker instances

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
    $('timer-name').value = saved.name;
    drums.h.setValue(saved.hours);
    drums.m.setValue(saved.minutes);
    drums.s.setValue(saved.seconds);
    $('t-sound').value    = saved.sound;
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
    const hours   = drums.h.getValue();
    const minutes = drums.m.getValue();
    const seconds = drums.s.getValue();
    const sound   = $('t-sound').value;
    const total   = hmsToMs(hours, minutes, seconds);
    if (total <= 0) { showToast('Set a duration > 0', 'error'); return; }

    if (editingId) {
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

    timers[id] = { id, name, color, sound, total, remaining: total, state: 'idle', overtime: 0 };
    renderCircle(id);
    renderSavedList();
    showToast(`"${name}" saved`);
    $('timer-name').value = '';
    switchPage('home');
  }

  // ── Run once (no save, auto-start, auto-delete on finish) ─────────────────
  function runOnceTimer() {
    const name    = $('timer-name').value.trim() || 'Timer';
    const hours   = drums.h.getValue();
    const minutes = drums.m.getValue();
    const seconds = drums.s.getValue();
    const sound   = $('t-sound').value;
    const total   = hmsToMs(hours, minutes, seconds);
    if (total <= 0) { showToast('Set a duration > 0', 'error'); return; }

    const id    = Date.now();
    const color = nextColor();
    timers[id] = { id, name, color, sound, total, remaining: total, state: 'idle', overtime: 0, once: true };
    renderCircle(id);
    $('timer-name').value = '';
    switchPage('home');
    // Auto-start immediately
    requestAnimationFrame(() => toggleTimer(id));
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
      ${!t.once ? `
      <button class="sheet-btn" id="_edit">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </button>` : ''}
      <button class="sheet-btn" id="_reset">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Reset
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
    if (!t.once) sheet.querySelector('#_edit').onclick = () => { close(); startEditing(id); };
    sheet.querySelector('#_reset').onclick  = () => { close(); resetTimer(id); };
    sheet.querySelector('#_delete').onclick = () => { close(); deleteTimer(id); };
    sheet.querySelector('#_cancel').onclick = close;
  }

  // ── Reset timer ───────────────────────────────────────────────────────────
  function resetTimer(id) {
    const t = timers[id];
    if (!t) return;
    worker.postMessage({ cmd: 'stop', id });
    SoundEngine.stopLoop(id);
    VibrationEngine.stop(id);
    t.remaining = t.total;
    t.overtime  = 0;
    t.state     = 'idle';
    renderCircleFace(id);
    msRefresh();
  }

  // ── Delete timer ──────────────────────────────────────────────────────────
  function deleteTimer(id) {
    worker.postMessage({ cmd: 'stop', id });
    SoundEngine.stopLoop(id);
    VibrationEngine.stop(id);
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
    VibrationEngine.stop(id);
    worker.postMessage({ cmd: 'stop', id });
    if (t.once) {
      delete timers[id];
      document.querySelector(`.timer-circle[data-id="${id}"]`)?.remove();
      checkEmpty();
      msRefresh();
      return;
    }
    t.remaining = t.total;
    t.overtime  = 0;
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
      t.overtime  = 0;
      t.state = 'done';
      renderCircleFace(data.id);
      SoundEngine.startLoop(data.id, t.sound);
      VibrationEngine.start(data.id);
      msRefresh();
      showToast(`"${t.name}" finished!`, 'success');
      showTimerNotification(data.id, t.name);
    } else if (data.type === 'overtime') {
      t.overtime = data.elapsed;
      renderCircleFace(data.id);
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
      <div class="circle-wrap">
        <svg class="circle-svg" width="130" height="130" viewBox="0 0 130 130">
          <circle class="ring-face" cx="65" cy="65" r="50"/>
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

    // Short tap → toggle; long press → options sheet
    let lpTimer = null, lpFired = false;
    const lpStart = e => {
      lpFired = false;
      lpTimer = setTimeout(() => {
        lpFired = true;
        showOptions(id, e);
      }, 480);
    };
    const lpCancel = () => clearTimeout(lpTimer);
    const lpMove   = () => { clearTimeout(lpTimer); lpFired = true; };
    card.addEventListener('touchstart',  lpStart,  { passive: true });
    card.addEventListener('touchend',    lpCancel, { passive: true });
    card.addEventListener('touchmove',   lpMove,   { passive: true });
    card.addEventListener('mousedown',   lpStart);
    card.addEventListener('mouseup',     lpCancel);
    card.addEventListener('contextmenu', e => e.preventDefault());
    card.addEventListener('click', () => { if (!lpFired) toggleTimer(id); });
    grid.appendChild(card);
  }

  function renderCircleFace(id) {
    const t = timers[id];
    if (!t) return;

    const ring    = $(`ring-${id}`);
    const display = $(`display-${id}`);
    const state   = $(`state-${id}`);
    const card    = document.querySelector(`.timer-circle[data-id="${id}"]`);

    if (display) {
      if (t.state === 'done' && t.overtime > 0) {
        display.textContent = '-' + formatTime(t.overtime);
      } else {
        display.textContent = formatTime(t.remaining);
      }
    }

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
                       total, remaining: total, state: 'idle', overtime: 0 };
    });

    if (saved.length > 0) {
      $('empty-home').style.display = 'none';
      saved.forEach(s => renderCircle(s.id));
    }

    // Drum pickers
    const hrs  = Array.from({ length: 24 }, (_, i) => i);
    const mins = Array.from({ length: 60 }, (_, i) => i);
    const secs = Array.from({ length: 60 }, (_, i) => i);
    drums.h = new DrumPicker($('drum-h'), hrs,  0);
    drums.m = new DrumPicker($('drum-m'), mins, 0);
    drums.s = new DrumPicker($('drum-s'), secs, 0);

    renderSavedList();
    setupMediaActions();

    $('timer-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveNewTimer(); });

    // Load custom audio files listed in custom-sounds/sounds.json
    fetch('custom-sounds/sounds.json')
      .then(r => r.json())
      .then(list => {
        if (!list || !list.length) return;
        const sel = $('t-sound');
        const group = document.createElement('optgroup');
        group.label = 'Custom';
        list.forEach(({ name, file }) => {
          const opt = document.createElement('option');
          opt.value = file;
          opt.textContent = name;
          group.appendChild(opt);
        });
        sel.appendChild(group);
        // Restore saved sound selection if it belongs to a custom sound
        if (editingId) {
          const saved = loadSaved().find(s => s.id === editingId);
          if (saved) sel.value = saved.sound;
        }
      })
      .catch(() => {});
  }

  init();
  return { saveNewTimer, runOnceTimer, deleteTimer, resetTimer, toggleTimer, switchPage, showOptions, cancelEdit, dismissAlarm };
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
