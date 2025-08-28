// Reactor Rush — v19g (fix: no bare `h` locals; daily start & audio intact)
const LS_HS = 'reactorRushHighScore';
const LS_SETTINGS = 'reactorRushSettings';
const SHARE_URL = 'https://reactorush.com';

const canvas = document.getElementById('game');
const stageEl = document.getElementById('stage');
const ctx = canvas.getContext('2d');

// UI
const pauseModal = document.getElementById('pauseModal');
const optSound = document.getElementById('optSound');
const optReduce = document.getElementById('optReduce');
const optHint = document.getElementById('optHint');
const optCB = document.getElementById('optCB');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const sharePauseBtn = document.getElementById('sharePauseBtn');
const optResetHigh = document.getElementById('optResetHigh');

const practiceBtn = document.getElementById('practiceBtn');
const dailyBtn = document.getElementById('dailyBtn');
const normalBtn = document.getElementById('normalBtn');

const hintEl = document.querySelector('.hint');
const goOverlay = document.getElementById('goOverlay');
const goShareBtn = document.getElementById('goShareBtn');
const goRestartBtn = document.getElementById('goRestartBtn');
const goCopied = document.getElementById('goCopied');
const goTitle = document.getElementById('goTitle');
const goStats = document.getElementById('goStats');

// Touch zones
const zones = document.getElementById('zones');
const zoneL = document.getElementById('zoneL');
const zoneR = document.getElementById('zoneR');

// Layout
const LAYOUT = { scrollHeightRatio: 0.45, middleHeightRatio: 0.35, swipeHeightRatio: 0.20 };

// Palettes
const PAL = {
  bgTop: '#0e1626', bgMid: '#0a1322', bgBot: '#0a0f1a',
  column: 'rgba(100, 200, 255, 0.06)', columnCritical: 'rgba(255, 225, 120, 0.08)',
  barEdge: '#9aa7ff', barCore: '#4e5fff', barHash: 'rgba(255,255,255,0.25)', pivot: '#c6ceff',
  neutronGlow: 'rgba(118, 225, 255, 0.65)', neutronCore: '#b9f3ff',
  photonGlow: 'rgba(255, 215, 80, 0.6)', photonCore: '#ffd166',
  fuelGlow: 'rgba(100, 255, 180, 0.6)', fuelCore: '#6dffb6',
  healthOn: '#ff4d4d', healthOff: 'rgba(255,255,255,0.12)',
  uiText: '#e8ecff', overlay: 'rgba(0,0,0,0.55)'
};
const PAL_CB = {
  bgTop: '#0e1626', bgMid: '#0a1322', bgBot: '#0a0f1a',
  column: 'rgba(180, 180, 255, 0.08)', columnCritical: 'rgba(255, 255, 255, 0.10)',
  barEdge: '#b5d3ff', barCore: '#69a6ff', barHash: 'rgba(255,255,255,0.35)', pivot: '#e2e8ff',
  neutronGlow: 'rgba(120, 200, 255, 0.70)', neutronCore: '#d2f1ff',
  photonGlow: 'rgba(255, 140, 0, 0.70)', photonCore: '#ffb347',
  fuelGlow: 'rgba(180, 255, 120, 0.70)', fuelCore: '#b1ff7a',
  healthOn: '#ff6b6b', healthOff: 'rgba(255,255,255,0.18)',
  uiText: '#f1f4ff', overlay: 'rgba(0,0,0,0.55)'
};
const DEFAULT_PAL = { ...PAL };
function applyPalette(cb) { const src = cb ? PAL_CB : DEFAULT_PAL; for (const k in src) PAL[k] = src[k]; }

// Level thresholds
const PRESET_ENDS = [75, 170, 280, 395];
function computeNextLevelScore(level) {
  if (level <= PRESET_ENDS.length) return PRESET_ENDS[level - 1];
  let lastEnd = PRESET_ENDS[PRESET_ENDS.length - 1];
  let step = lastEnd - PRESET_ENDS[PRESET_ENDS.length - 2];
  for (let L = PRESET_ENDS.length + 1; L <= level; L++) { step += 15; lastEnd += step; }
  return lastEnd;
}

// Touch detection (used for mobile-specific UX)
const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Pause-menu mode buttons (new)
const normalBtnP   = document.getElementById('normalBtnP');
const practiceBtnP = document.getElementById('practiceBtnP');
const dailyBtnP    = document.getElementById('dailyBtnP');

// Resets High Score
optResetHigh?.addEventListener('click', () => {
  if (!confirm('Reset high score?')) return;
  try { localStorage.removeItem(LS_HS); } catch {}
  state.highScore = 0;
  state.newHigh = false;
  saveHigh();                // keep storage consistent
  flashToast('High score reset', pauseModal);
});

// --- Universal click delegation for overlay/pause buttons ---
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  switch (btn.id) {
    case 'goShareBtn':
      e.preventDefault();
      doShareClipboard(goCopied);         // copies + shows toast
      break;

    case 'goRestartBtn':
      e.preventDefault();
      if (!state.running) resetGame();    // new run
      break;

    case 'resumeBtn':
      e.preventDefault();
      togglePause(false);                 // close pause
      break;

    case 'restartBtn':
      e.preventDefault();
      togglePause(false);
      resetGame();
      break;

    case 'sharePauseBtn':
      e.preventDefault();
      doShareClipboard();
      break;
  }
});

goShareBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  doShareClipboard(goCopied);
});
goRestartBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!state.running) resetGame();
});
const pauseCopied = document.getElementById('pauseCopied');

sharePauseBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  doShareClipboard(pauseCopied);
});

// RNG (daily challenge)
function hash32(str) { // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h >>> 0) + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24));
  }
  return (h >>> 0);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dailySeedString() {
  const d = new Date();
  const ny = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = ny.getFullYear();
  const m = String(ny.getMonth() + 1).padStart(2, '0');
  const day = String(ny.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // stable per day in America/New_York
}

// State
let W = 0, H = 0; let topH = 0, midH = 0, botH = 0;
const state = {
  started: false, paused: false, running: true,
  mode: 'normal',
  bar: { angle: 0, angVel: 0, angleMin: -Math.PI / 4, angleMax: +Math.PI / 4, length: 420, center: { x: 0, y: 0 } },
  ball: { pos: 0, vel: 0, radius: 14, friction: 0.998, x: 0, y: 0, trail: [], trailMax: 16 },
  collectibles: [], spawnTimer: 0,
  scrollBase: 90, spawnBase: 0.9,
  score: 0, missesRaw: 0, maxMissed: 10, warnedLow: false,
  streak: 0, multiplier: 1, comboWindow: 4.5, lastCatchTime: 0,
  input: { left: false, right: false },
  fx: { rings: [], particles: [], shake: { t: 0, mag: 0 }, flash: 0, critical: 0, level: { t: 0, dur: 1.2 } },
  audio: { ctx: null },
  highScore: 0, newHigh: false,
  level: 1, levelStartScore: 0, nextLevelScore: 75, levelPause: 0,
  cooldown: 0,
  challengeComplete: false,
  rng: Math.random,
  settings: { sound: true, reduceMotion: false, showHint: true, fpsCap: 60, cb: false }
};

// Tunables
const COLLECT_PAD = 9;
const MAX_ANG_VEL = 1.2, ANG_ACCEL_HOLD = 3.6, REV_BRAKE = 11.0, CENTER_ACCEL = 7.6, ANGULAR_DAMP = 1.45, DEADZONE = 0.015;
const G = 750, MAX_BALL_SPEED = 560, LEVEL_PAUSE = 1.25;
const LEVEL_SCROLL_INC = 12, LEVEL_SPAWN_DEC = 0.06, SPAWN_FLOOR = 0.55, COOLDOWN_DUR = 2.0;

const TYPES = { NEUTRON: { key: 'N', score: 1 }, PHOTON: { key: 'P', score: 3 }, FUEL: { key: 'F', score: 1 } };

// ---------- Settings / HS ----------
function setHint() {
  // Keep DOM hint (if present) in sync, but don't depend on it
  if (hintEl) hintEl.style.display = state.settings.showHint ? 'block' : 'none';
}

optHint?.addEventListener('change', () => {
  state.settings.showHint = !!optHint.checked;
  saveSettings();
  setHint(); // safe if hintEl is null
});

function updateModeButtons() {
  const map = {
    normal:  [normalBtn,  normalBtnP].filter(Boolean),
    practice:[practiceBtn,practiceBtnP].filter(Boolean),
    daily:   [dailyBtn,   dailyBtnP].filter(Boolean)
  };
  const all = [...map.normal, ...map.practice, ...map.daily];

  for (const b of all) {
    const isSel = (b === (map[state.mode][0] || b)) || b.textContent.toLowerCase().includes(state.mode);
    b.classList.toggle('selected',  b.textContent && b.textContent.toLowerCase().includes(state.mode));
    b.classList.toggle('secondary', !b.classList.contains('selected'));
    b.setAttribute('aria-pressed', b.classList.contains('selected') ? 'true' : 'false');
  }
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}');

    // Default: follow system ONLY when user has no saved choice
    let reduce = stored.hasOwnProperty('reduceMotion')
      ? !!stored.reduceMotion
      : window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    Object.assign(state.settings, stored, { reduceMotion: reduce });

    // Wire UI
    if (optSound)  optSound.checked  = !!state.settings.sound;
    if (optReduce) optReduce.checked = !!state.settings.reduceMotion;
    if (optHint)   optHint.checked   = !!state.settings.showHint;
    if (optCB)     optCB.checked     = !!state.settings.cb;

    applyPalette(state.settings.cb);
    setHint();
    applyReduceMotion();  // <-- ensure DOM/CSS reflects the choice
    updateModeButtons();
  } catch {}
}

function saveSettings() { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(state.settings)); } catch {} }
function loadHigh() { try { const v = localStorage.getItem(LS_HS); const n = v ? parseInt(v, 10) : 0; state.highScore = (Number.isFinite(n) && n > 0) ? n : 0; } catch { state.highScore = 0; } }
function saveHigh() { try { localStorage.setItem(LS_HS, String(state.highScore)); } catch {} }
loadHigh(); loadSettings();

// ---------- Resize ----------
function resize() {
  const rect = stageEl.getBoundingClientRect();
  let wd = Math.floor(rect.width);
  let hgt = Math.floor(rect.height || window.innerHeight);
  if (wd < 2) wd = Math.floor(window.innerWidth * 0.5);
  if (hgt < 2) hgt = Math.floor(window.innerHeight);
  canvas.width = Math.max(1, wd);
  canvas.height = Math.max(1, hgt);
  W = canvas.width; H = canvas.height;
  topH = H * LAYOUT.scrollHeightRatio; midH = H * LAYOUT.middleHeightRatio; botH = H * LAYOUT.swipeHeightRatio;
  state.bar.center.x = W / 2; state.bar.center.y = topH + midH / 2;
  const ux = Math.cos(state.bar.angle), uy = Math.sin(state.bar.angle);
  state.ball.x = state.bar.center.x + ux * state.ball.pos;
  state.ball.y = state.bar.center.y - uy * state.ball.pos;
  zones.style.height = botH + 'px';
}
new ResizeObserver(() => resize()).observe(stageEl);
addEventListener('resize', resize);
requestAnimationFrame(resize);

// ---------- Audio ----------
function ensureAudio() {
  if (!state.audio.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) state.audio.ctx = new AC();
  }
  if (state.audio.ctx && state.audio.ctx.state === 'suspended') state.audio.ctx.resume();
}
function tone(freq = 440, dur = 0.08, type = 'sine', gain = 0.08) {
  if (!state.settings.sound) return;
  const a = state.audio.ctx; if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq; o.connect(g); g.connect(a.destination);
  const n = a.currentTime;
  g.gain.setValueAtTime(0.0001, n);
  g.gain.exponentialRampToValueAtTime(gain, n + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
  o.start(n); o.stop(n + dur + 0.02);
}
const sfx = {
  catch: (t) => { if (!t || !state.audio.ctx || !state.settings.sound) return;
    if (t.key === 'P') tone(880, 0.10, 'sine', 0.10);
    else if (t.key === 'F') { tone(400, 0.05, 'sine', 0.09); setTimeout(() => tone(520, 0.06, 'sine', 0.09), 50); setTimeout(() => tone(660, 0.08, 'sine', 0.09), 110); }
    else tone(660, 0.08, 'sine', 0.08);
    vib(8);
  },
  reverse: () => { tone(220, 0.05, 'square', 0.06); vib(6); },
  miss: () => { tone(140, 0.22, 'sawtooth', 0.06); vib(14); },
  critical: () => { tone(980, 0.10, 'square', 0.10); setTimeout(() => tone(1240, 0.12, 'square', 0.08), 70); vib(12); },
  klaxon: () => { if (!state.audio.ctx || !state.settings.sound) return; const a = state.audio.ctx; const n = a.currentTime; const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.0001, n); g.gain.linearRampToValueAtTime(0.12, n + 0.02); g.gain.linearRampToValueAtTime(0.0001, n + 0.35); o.frequency.setValueAtTime(540, n); o.frequency.exponentialRampToValueAtTime(360, n + 0.18); o.frequency.exponentialRampToValueAtTime(540, n + 0.35); o.start(n); o.stop(n + 0.36); vib(24); },
  gameover: () => { tone(220, 0.25, 'sawtooth', 0.09); setTimeout(() => tone(165, 0.35, 'sawtooth', 0.08), 200); setTimeout(() => tone(110, 0.45, 'sawtooth', 0.07), 420); vib(30); },
  levelup: () => { // C5–E5–G5 stinger
    tone(523.25, 0.09, 'sine', 0.11);
    setTimeout(() => tone(659.25, 0.10, 'sine', 0.11), 80);
    setTimeout(() => tone(783.99, 0.12, 'sine', 0.10), 160);
  }
};
function vib(ms) { if (navigator.vibrate && !state.settings.reduceMotion) try { navigator.vibrate(ms); } catch {} }

// ---------- Input ----------
function setKey(e, down) {
  if (!state.started) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { state.input.left = down; e.preventDefault(); }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { state.input.right = down; e.preventDefault(); }
  if (down && (k === 'p' || k === 'P' || k === 'Escape')) { togglePause(); e.preventDefault(); }
  if (down && (k === 'm' || k === 'M')) { state.settings.sound = !state.settings.sound; optSound.checked = state.settings.sound; saveSettings(); e.preventDefault(); }
  if (down && (k === 'r' || k === 'R')) { resetGame(); e.preventDefault(); }
  if (down && (k === 's' || k === 'S')) { doShareClipboard(goCopied); e.preventDefault(); }
}
addEventListener('keydown', e => setKey(e, true));
addEventListener('keyup', e => setKey(e, false));
addEventListener('blur', () => { if (state.started && state.running && !state.paused) togglePause(true); });

// Touch zones
function bindZone(zone, set) {
  let down = false;
  zone.addEventListener('pointerdown', e => { if (!state.started) return; down = true; set(true); zone.setPointerCapture(e.pointerId); });
  function up(e) { if (!down) return; down = false; set(false); try { zone.releasePointerCapture(e.pointerId); } catch {} }
  zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up); zone.addEventListener('pointerleave', up);
}
bindZone(zoneL, v => state.input.left = v);
bindZone(zoneR, v => state.input.right = v);

// Start gate
function startGame() { state.started = true; ensureAudio(); resetGame(); try { window.focus(); } catch {} }
canvas.addEventListener('pointerdown', (e) => {
  const y = e.offsetY;
  const inPlayfield = y < (topH + midH);

  // Start the first run by tapping/clicking the playfield
  if (!state.started && inPlayfield) { startGame(); return; }

  // Mobile-only: tap playfield to pause during play
  if (state.started && state.running && !state.paused && inPlayfield) {
    togglePause(true);
  }
});

// Mobile pause menu modes
normalBtnP?.addEventListener('click', (e) => { e.preventDefault(); startMode('normal'); });
practiceBtnP?.addEventListener('click', (e) => { e.preventDefault(); startMode('practice'); });
dailyBtnP?.addEventListener('click', (e) => { e.preventDefault(); startMode('daily'); });


// Modes
// ---------- Sidebar actions (modes) ----------
normalBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); startMode('normal'); });
practiceBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); startMode('practice'); });
dailyBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); startMode('daily'); });

function togglePause(force) { if (!state.started) return; const target = (typeof force === 'boolean') ? force : !state.paused; state.paused = target; pauseModal.classList.toggle('show', state.paused); }

function startMode(mode) {
  state.mode = mode;
  state.started = true;
  ensureAudio();

  // Daily uses a stable seed based on America/New_York date
if (mode === 'daily') {
  const seedStr = dailySeedString();
  const seed = hash32(seedStr);
  state.rng = mulberry32(seed);
} else {
  state.rng = Math.random;
}


  // Reset gameplay
  resetGame();

  // Make sure ALL overlays are gone and we're not paused
  state.paused = false;
  pauseModal?.classList.remove('show');
  goOverlay?.classList.remove('show');

  // Visually indicate selection
  updateModeButtons();

  // Nice-to-have: ensure keyboard focus goes back to the page for arrows
  try { window.focus(); } catch {}

  // Extra defensive: if CSS transitions cause a brief flash, remove again next tick
  setTimeout(() => {
    pauseModal?.classList.remove('show');
    goOverlay?.classList.remove('show');
  }, 0);
}


// ---------- Helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function rng() { return state.rng ? state.rng() : Math.random(); }
function spawnCollectible() {
  const cx = state.bar.center.x; const halfBar = state.bar.length / 2; const edgeMargin = Math.max(2.5 * (state.ball.radius * 2), 64);
  const roll = rng(); let kind = TYPES.NEUTRON; if (roll < 0.10) kind = TYPES.FUEL; else if (roll < 0.30) kind = TYPES.PHOTON;
  const r = (kind.key === 'N' ? 11 : 12);
  const xMin = cx - halfBar + edgeMargin + r; const xMax = cx + halfBar - edgeMargin - r;
  const x = clamp(xMin + rng() * Math.max(0, (xMax - xMin)), xMin, xMax);
  const y = -20; state.collectibles.push({ type: kind, x, y, r, score: kind.score });
}

function applyReduceMotion() {
  // Reflect in DOM for any CSS hooks
  document.documentElement.setAttribute(
    'data-reduce-motion',
    state.settings.reduceMotion ? '1' : '0'
  );

  // If we just turned RM on, stop shakes/particles immediately
  if (state.settings.reduceMotion) {
    state.fx.shake.t = 0;
    state.fx.particles.length = 0;
  }
}

optReduce?.addEventListener('change', () => {
  state.settings.reduceMotion = !!optReduce.checked;
  saveSettings();
  applyReduceMotion();
});


function addRing(x, y, color) { state.fx.rings.push({ x, y, r: 4, dr: 240, alpha: 0.8, color }); }
function burst(x, y, color, count = 16, spd = 180) {
  const c = state.settings.reduceMotion ? Math.ceil(count * 0.5) : count;
  for (let i = 0; i < c; i++) {
    const a = Math.random() * Math.PI * 2; const v = spd * (0.6 + Math.random() * 0.8);
    state.fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, maxLife: 0.5 + Math.random() * 0.4, color });
  }
}
function shake(mag = 6, time = 0.2) { if (state.settings.reduceMotion) return; state.fx.shake.t = Math.max(state.fx.shake.t, time); state.fx.shake.mag = Math.max(state.fx.shake.mag, mag); }

function flashToast(text, container = document.body) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.position = 'absolute';
  t.style.right = '16px';
  t.style.bottom = '16px';
  t.style.padding = '6px 10px';
  t.style.background = 'rgba(0,0,0,0.85)';
  t.style.color = '#fff';
  t.style.borderRadius = '8px';
  t.style.font = '12px system-ui, sans-serif';
  t.style.pointerEvents = 'none';
  t.style.zIndex = '10000';
  container.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .25s'; t.style.opacity = '0'; }, 900);
  setTimeout(() => { try { container.removeChild(t); } catch {} }, 1200);
}

// Draw-time shake only. Never reads/writes game state except state.fx.shake.
// Never affects timing/spawn/update.
function withShake(cb) {
  if (typeof cb !== 'function') return;

  const s = state.fx?.shake || { t: 0, mag: 0 };
  const reduce = !!state.settings?.reduceMotion;
  if (reduce || s.t <= 0) {
    cb();                      // no shake -> just draw
    return;
  }

  // short, bounded shake
  const DUR = 0.25;                           // visual decay window
  const f = Math.max(0, Math.min(1, s.t / DUR));
  const mag = s.mag * f * 0.6;

  const ox = (Math.random() * 2 - 1) * mag;
  const oy = (Math.random() * 2 - 1) * mag;

  ctx.save();
  try { ctx.translate(ox, oy); cb(); }
  finally { ctx.restore(); }                  // always restore!
}

function drawHexGrid(x, y, w, hgt, spacing = 36, color = 'rgba(120,170,255,0.06)') {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; const r = spacing / 2; const hstep = r * Math.sqrt(3);
  for (let row = -2; row < hgt / (1.5 * r) + 4; row++) {
    const y0 = y + row * (1.5 * r); const xoff = (row % 2 === 0) ? 0 : hstep / 2;
    for (let col = -2; col < w / hstep + 4; col++) {
      const x0 = x + col * hstep + xoff;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; const px = x0 + r * Math.cos(a); const py = y0 + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawGlowCircle(x, y, r, core, glow) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.8);
  g.addColorStop(0, core); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
}
function drawPhotonHex(x, y, r, core, glow) {
  const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.8);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; const px = x + r * Math.cos(a); const py = y + r * Math.sin(a); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fill();
}
function drawFuelPellet(x, y, r, core, glow) {
  const wRect = r * 1.6, hRect = r * 2.2, rx = r * 0.6; const left = x - wRect / 2, top = y - hRect / 2;
  const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.8);
  g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = core; ctx.beginPath();
  ctx.moveTo(left + rx, top); ctx.lineTo(left + wRect - rx, top); ctx.quadraticCurveTo(left + wRect, top, left + wRect, top + rx);
  ctx.lineTo(left + wRect, top + hRect - rx); ctx.quadraticCurveTo(left + wRect, top + hRect, left + wRect - rx, top + hRect);
  ctx.lineTo(left + rx, top + hRect); ctx.quadraticCurveTo(left, top + hRect, left, top + hRect - rx);
  ctx.lineTo(left, top + rx); ctx.quadraticCurveTo(left, top, left + rx, top);
  ctx.closePath(); ctx.fill();
}

// Easing
const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; const y = x - 1; return 1 + c3 * y * y * y + c1 * y * y; };

// ---------- Update / Draw / Loop ----------
function update(dt) {
  if (!state.running || state.paused) return;
  if (W < 2 || H < 2) return;

  if (state.levelPause > 0) {
    state.levelPause -= dt;
    if (state.fx.level.t > 0) state.fx.level.t -= dt;
    return;
  } else if (state.fx.level.t > 0) state.fx.level.t -= dt;

  const levelFactor = (state.mode === 'normal') ? (state.level - 1) : 0;
  const spawnEveryEff = clamp(state.spawnBase - levelFactor * LEVEL_SPAWN_DEC, SPAWN_FLOOR, 2.0) * (state.cooldown > 0 ? 1.3 : 1.0);
  const scrollEff = (state.scrollBase + levelFactor * LEVEL_SCROLL_INC) * (state.cooldown > 0 ? 0.75 : 1.0);
  if (state.cooldown > 0) state.cooldown -= dt;

  // Bar physics
  const timeScale = state.fx.critical > 0 ? 0.7 : 1, dts = dt * timeScale;
  let target = 0; if (state.input.left && !state.input.right) target = -MAX_ANG_VEL; if (state.input.right && !state.input.left) target = MAX_ANG_VEL;
  const delta = target - state.bar.angVel, maxStep = ANG_ACCEL_HOLD * dts, prevVel = state.bar.angVel;
  const step = clamp(delta, -maxStep, maxStep); state.bar.angVel += step;
  if (target !== 0 && prevVel !== 0 && Math.sign(target) !== Math.sign(prevVel)) { const brake = clamp(-state.bar.angVel, -REV_BRAKE * dts, REV_BRAKE * dts); state.bar.angVel += brake; burst(state.ball.x, state.ball.y, 'rgba(155,175,255,0.7)', 10, 140); sfx.reverse(); }
  if (!state.input.left && !state.input.right) { const center = clamp(-state.bar.angle, -CENTER_ACCEL * dts, CENTER_ACCEL * dts); state.bar.angVel += center; }
  const damp = Math.exp(-ANGULAR_DAMP * dts); state.bar.angVel *= damp;
  state.bar.angVel = clamp(state.bar.angVel, -MAX_ANG_VEL, MAX_ANG_VEL);
  state.bar.angle += state.bar.angVel * dts;
  if (state.bar.angle < state.bar.angleMin) { state.bar.angle = state.bar.angleMin; state.bar.angVel = 0; }
  if (state.bar.angle > state.bar.angleMax) { state.bar.angle = state.bar.angleMax; state.bar.angVel = 0; }
  if (!state.input.left && !state.input.right && Math.abs(state.bar.angle) < DEADZONE) { state.bar.angle = 0; state.bar.angVel = 0; }

  // Ball along-rod
  const { x: cx, y: cy } = state.bar.center; const ux = Math.cos(state.bar.angle), uy = Math.sin(state.bar.angle);
  const alongAccel = G * Math.sin(state.bar.angle);
  state.ball.vel += alongAccel * dts;
  state.ball.vel *= state.ball.friction;
  state.ball.vel = clamp(state.ball.vel, -MAX_BALL_SPEED, MAX_BALL_SPEED);
  state.ball.pos += state.ball.vel * dts;
  const half = state.bar.length / 2 - state.ball.radius;
  if (state.ball.pos < -half) { state.ball.pos = -half; state.ball.vel = 0; }
  if (state.ball.pos > half) { state.ball.pos = half; state.ball.vel = 0; }
  state.ball.x = cx + ux * state.ball.pos; state.ball.y = cy - uy * state.ball.pos;
  state.ball.trail.push({ x: state.ball.x, y: state.ball.y });
  if (state.ball.trail.length > state.ball.trailMax) state.ball.trail.shift();

  // Spawning & movement
  state.spawnTimer += dts; if (state.spawnTimer >= spawnEveryEff) { state.spawnTimer = 0; spawnCollectible(); }

  const playBottom = topH + midH; const now = performance.now() / 1000; let queuedLevelUp = false;
  for (let i = state.collectibles.length - 1; i >= 0; i--) {
    const c = state.collectibles[i];
    c.y += scrollEff * dts * (c.type === TYPES.PHOTON ? 1.08 : 1);

    const dx = c.x - state.ball.x, dy = c.y - state.ball.y;
    const rad = c.r + state.ball.radius + COLLECT_PAD;
    if (dx * dx + dy * dy <= rad * rad) {
      state.collectibles.splice(i, 1);

      if (state.mode !== 'practice') {
        if (now - state.lastCatchTime <= state.comboWindow) { state.streak++; state.multiplier = clamp(1 + Math.floor(state.streak / 2), 1, 5); }
        else { state.streak = 0; state.multiplier = 1; }
        state.lastCatchTime = now;
        state.score += c.score * state.multiplier;
        if (state.mode === 'normal' && state.score > state.highScore) { state.highScore = state.score; state.newHigh = true; saveHigh(); state.fx.flash = Math.max(state.fx.flash, 0.12); }
      } else { state.streak = 0; state.multiplier = 1; state.lastCatchTime = now; }

      if (c.type === TYPES.FUEL) {
        state.missesRaw = Math.max(0, state.missesRaw - 2);
        const lostUnitsHeal = Math.floor(state.missesRaw / 2);
        const leftAfter = Math.max(0, state.maxMissed - lostUnitsHeal);
        if (leftAfter >= 2) state.warnedLow = false;
      }

      if (c.type === TYPES.FUEL) {
        addRing(state.ball.x, state.ball.y, PAL.fuelGlow);  // expanding ring
      }
      burst(state.ball.x, state.ball.y, PAL.neutronGlow, 14 + state.multiplier * 4, 160 + state.multiplier * 30);
      sfx.catch(c.type);
      if (state.mode !== 'practice' && state.multiplier >= 5 && state.fx.critical <= 0) { state.fx.critical = 0.8; state.fx.flash = 0.18; sfx.critical(); }

      if (state.mode === 'normal' && state.score >= state.nextLevelScore) queuedLevelUp = true;
      if (state.mode === 'daily' && state.score >= 100) { state.running = false; state.challengeComplete = true; }
      continue;
    }
    if (c.y - c.r > playBottom) {
      state.collectibles.splice(i, 1);
      if (state.mode !== 'practice') {
        state.missesRaw++; state.cooldown = COOLDOWN_DUR;
        state.streak = 0; state.multiplier = 1;
        const lostUnits = Math.floor(state.missesRaw / 2);
        const leftBlocks = Math.max(0, state.maxMissed - lostUnits);
        sfx.miss();
        if (leftBlocks === 1 && !state.warnedLow) { state.warnedLow = true; sfx.klaxon(); }
        if (lostUnits >= state.maxMissed) { state.running = false; sfx.gameover(); }
      }
    }
  }

  if (queuedLevelUp && state.levelPause <= 0) levelUp();

  // FX decay
  for (let i = state.fx.rings.length - 1; i >= 0; i--) { const r = state.fx.rings[i]; r.r += 240 * dts; r.alpha -= 1.2 * dts; if (r.alpha <= 0) state.fx.rings.splice(i, 1); }
  for (let i = state.fx.particles.length - 1; i >= 0; i--) { const p = state.fx.particles[i]; p.life += dts; if (p.life >= p.maxLife) { state.fx.particles.splice(i, 1); continue; } p.x += p.vx * dts; p.y += p.vy * dts; p.vx *= 0.98; p.vy *= 0.98; p.vy += 40 * dts; }
  if (state.fx.shake.t > 0) state.fx.shake.t -= dts; else state.fx.shake.t = 0;
  if (state.fx.flash > 0) state.fx.flash -= dt;
  if (state.fx.critical > 0) state.fx.critical -= dt;
}

function levelUp() {
  state.level += 1;
  state.levelStartScore = state.nextLevelScore;
  state.nextLevelScore = computeNextLevelScore(state.level);
  state.levelPause = LEVEL_PAUSE;

  state.collectibles = []; state.fx.rings = []; state.fx.particles = [];
  state.missesRaw = 0; state.warnedLow = false;
  state.fx.flash = Math.max(state.fx.flash, 0.14);
  shake(10, 0.28);

  state.fx.level.t = state.fx.level.dur = 1.2;
  sfx.levelup();

  const { x: cx, y: cy } = state.bar.center;
  addRing(cx, cy, 'rgba(255,235,150,0.65)');
  addRing(cx, cy, 'rgba(185,220,255,0.6)');
  burst(cx, cy, 'rgba(255,220,120,0.85)', 28, 240);
  burst(cx, cy, 'rgba(155,185,255,0.85)', 20, 210);
}

// ---------- Controls hint (canvas + optional DOM fallback) ----------
function drawControlsHint() {
  const show = !!state.settings.showHint;
  // If you still have a <div class="hint"> in your HTML, keep it in sync:
  if (hintEl) hintEl.style.display = show ? 'block' : 'none';
  if (!show) return;

  // Text lines
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const lines = !state.started
    ? [isTouch ? 'Tap to start/open menu' : 'Click to start/open menu',
       isTouch ? 'Tap left/right zones below to tilt' : '← → to tilt']
    : [isTouch ? 'Tap left/right zones below to tilt' : '← → to tilt'];

  // Draw onto the canvas
  const yBase = topH + midH - 16; // bottom of the middle (bar) area
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '12px system-ui, sans-serif';
  for (let i = 0; i < lines.length; i++) {
    const y = yBase - (lines.length - 1 - i) * 16;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';     // soft shadow
    ctx.fillText(lines[i], W / 2 + 1, y + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; // main text
    ctx.fillText(lines[i], W / 2, y);
  }
  ctx.restore();

  // Optional DOM fallback text content (if you kept <div class="hint">)
  if (hintEl) {
    hintEl.textContent = lines.join(' · ');
  }
}

function draw() {
  if (W < 2 || H < 2) return;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = PAL.bgTop; ctx.fillRect(0, 0, W, topH);
  ctx.fillStyle = PAL.bgMid; ctx.fillRect(0, topH, W, midH);
  ctx.fillStyle = PAL.bgBot; ctx.fillRect(0, topH + midH, W, botH);

  const cx = state.bar.center.x; const edgeMargin = Math.max(2.5 * (state.ball.radius * 2), 64);
  const columnWidth = Math.max(0, state.bar.length - 2 * edgeMargin);
  const colColor = state.fx.critical > 0 ? PAL.columnCritical : PAL.column;
  withShake(() => {
    ctx.fillStyle = colColor;
    ctx.fillRect(cx - columnWidth / 2, 0, columnWidth, topH + midH);
    drawHexGrid(cx - columnWidth / 2, 0, columnWidth, topH + midH, 34,
                state.fx.critical > 0 ? 'rgba(255,220,120,0.08)' : 'rgba(120,170,255,0.06)');
  });

  withShake(() => {
  for (const c of state.collectibles) {
    if (c.type === TYPES.NEUTRON) drawGlowCircle(c.x, c.y, c.r, PAL.neutronCore, PAL.neutronGlow);
    else if (c.type === TYPES.PHOTON) drawPhotonHex(c.x, c.y, c.r, PAL.photonCore, PAL.photonGlow);
    else drawFuelPellet(c.x, c.y, c.r, PAL.fuelCore, PAL.fuelGlow);
  }
});

  const tintSteps = Math.min(Math.max(state.level - 1, 0), 5);
  if (state.mode === 'normal' && tintSteps > 0) { ctx.fillStyle = `rgba(255,60,60,${(0.03 * tintSteps).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

  // --- FX: particles + rings (glowy, lightweight) ---
  withShake(() => {
    // rings (expanding circles)
    if (state.fx.rings.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const r of state.fx.rings) {
        ctx.globalAlpha = Math.max(0, r.alpha);
        ctx.strokeStyle = r.color || 'rgba(185,220,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

  // particles (tiny glow dots)
  if (state.fx.particles.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of state.fx.particles) {
      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      const a = 1 - t;                           // fade out
      const rad = 1.6 + 1.2 * (1 - t);           // slight size falloff
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color || 'rgba(185,243,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
});


  const { x: bx, y: by } = state.bar.center; const half = state.bar.length / 2; const ux = Math.cos(state.bar.angle), uy = Math.sin(state.bar.angle);
  const x1 = bx - ux * half, y1 = by + uy * half; const x2 = bx + ux * half, y2 = by - uy * half; const rodW = 12;
  withShake(() => {
    ctx.strokeStyle = PAL.barEdge; ctx.lineWidth = rodW + 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = PAL.barCore; ctx.lineWidth = rodW; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = PAL.barHash; ctx.lineWidth = 2; const marks = 8; const step = state.bar.length / (marks + 1);
    for (let i = 1; i <= marks; i++) { const s = -half + i * step; const mx = bx + ux * s, my = by - uy * s; const nx = -uy, ny = ux; ctx.beginPath(); ctx.moveTo(mx - nx * 6, my - ny * 6); ctx.lineTo(mx + nx * 6, my + ny * 6); ctx.stroke(); }
    ctx.fillStyle = PAL.pivot; ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill();
  });

  withShake(() => {
    for (let i = 0; i < state.ball.trail.length; i++) {
      const t = i / state.ball.trail.length; const p = state.ball.trail[i]; const a = 0.35 * t;
      ctx.fillStyle = `rgba(185,243,255,${a})`; ctx.beginPath(); ctx.arc(p.x, p.y, 10 * t, 0, Math.PI * 2); ctx.fill();
    }
    drawGlowCircle(state.ball.x, state.ball.y, state.ball.radius, PAL.neutronCore, PAL.neutronGlow);
  });

  // HUD
  const total = state.maxMissed; const lostUnits = Math.floor(state.missesRaw / 2); const leftBlocks = Math.max(0, total - lostUnits);
  const bw = 16, bh = 10, gap = 4; const totalW = total * bw + (total - 1) * gap; const healthX0 = W / 2 - totalW / 2; const healthY = 10;
  for (let i = 0; i < total; i++) {
    const x = healthX0 + i * (bw + gap);
    ctx.fillStyle = i < leftBlocks ? PAL.healthOn : PAL.healthOff;
    ctx.fillRect(x, healthY, bw, bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, healthY + 0.5, bw - 1, bh - 1);
  }
  const tags = []; if (state.mode === 'practice') tags.push('Practice'); if (state.mode === 'daily') tags.push('Daily');
  const tagStr = tags.length ? ` [${tags.join(' · ')}]` : '';
  const scoreText = `Score: ${state.score}${tagStr}   Best: ${state.highScore}   Lvl: ${state.mode === 'normal' ? state.level : '—'}`;
  ctx.fillStyle = PAL.uiText; ctx.font = 'bold 18px system-ui, sans-serif'; const scoreW = ctx.measureText(scoreText).width; const scoreY = healthY + bh + 18; ctx.fillText(scoreText, W / 2 - scoreW / 2, scoreY);

  // Level progress
  if (state.mode === 'normal') {
    const rngSpan = Math.max(1, state.nextLevelScore - state.levelStartScore);
    const prog = clamp((state.score - state.levelStartScore) / rngSpan, 0, 1);
    const pW = 220, pH = 8, pX = W / 2 - pW / 2, pY = scoreY + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(pX, pY, pW, pH);
    ctx.fillStyle = 'rgba(255,215,80,0.9)'; ctx.fillRect(pX, pY, pW * prog, pH);
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; const nxtText = `Next: ${state.nextLevelScore}`; const ntw = ctx.measureText(nxtText).width; ctx.fillText(nxtText, W / 2 - ntw / 2, pY + pH + 12);
  }

  // Combo bar (not in Practice)
  if (state.mode !== 'practice' && state.multiplier > 1) {
    const nowT = performance.now() / 1000; const remain = Math.max(0, state.comboWindow - (nowT - state.lastCatchTime));
    const f = remain / state.comboWindow; const barW = 180, barH = 6; const bx0 = W / 2 - barW / 2, by0 = scoreY + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx0, by0, barW, barH);
    ctx.fillStyle = 'rgba(255,215,80,0.85)'; ctx.fillRect(bx0, by0, barW * f, barH);
    ctx.fillStyle = 'rgba(255,215,80,0.95)'; ctx.font = 'bold 14px system-ui, sans-serif'; const mText = `x${state.multiplier}`; const mW = ctx.measureText(mText).width; ctx.fillText(mText, W / 2 - mW / 2, by0 - 4);
  }

  // Dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, topH); ctx.lineTo(W, topH); ctx.moveTo(0, topH + midH); ctx.lineTo(W, topH + midH); ctx.stroke();

  // LEVEL banner (title only)
  if (state.levelPause > 0 || state.fx.level.t > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, W, topH + midH);
    const t = clamp(1 - (state.fx.level.t / state.fx.level.dur), 0, 1);
    const scale = 0.85 + 0.25 * easeOutBack(t);
    const alpha = 0.15 + 0.85 * easeOutCubic(t);
    const cxMid = W / 2, cyMid = (topH + midH) / 2;

    const g = ctx.createRadialGradient(cxMid, cyMid, 10, cxMid, cyMid, Math.max(W, H) * 0.35);
    g.addColorStop(0, `rgba(255, 230, 140, ${0.25 * alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cxMid, cyMid, Math.max(W, H) * 0.35, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(cxMid, cyMid);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText(`LEVEL ${state.level}`, 0, 0);
    ctx.restore();
  }

  drawControlsHint();

  // End overlay
  if (state.started && !state.running) {
    const title = state.challengeComplete ? 'Daily Challenge Complete!' : 'Game Over';
    goTitle.textContent = title;
    if (state.mode === 'daily') goStats.textContent = `Score: ${state.score} / 100`;
    else {
      const hsNote = state.newHigh ? ' (NEW!)' : '';
      goStats.textContent = `Score: ${state.score} • High Score: ${state.highScore}${hsNote}`;
    }
    goOverlay.classList.add('show');
  } else { goOverlay.classList.remove('show'); }

  pauseModal.classList.toggle('show', state.paused);
}

// Reset / Loop
function resetGame() {
  state.collectibles = []; state.score = 0; state.missesRaw = 0; state.warnedLow = false; state.streak = 0; state.multiplier = 1; state.lastCatchTime = 0;
  state.running = true; state.paused = false; state.challengeComplete = false; state.ball.pos = 0; state.ball.vel = 0; state.ball.trail = []; state.bar.angle = 0; state.bar.angVel = 0; state.spawnTimer = 0; state.cooldown = 0;
  state.fx.rings = []; state.fx.particles = []; state.fx.shake = { t: 0, mag: 0 }; state.fx.flash = 0; state.fx.critical = 0; state.newHigh = false;
  state.fx.level.t = 0;
  state.level = 1; state.levelStartScore = 0; state.nextLevelScore = state.mode === 'normal' ? computeNextLevelScore(1) : Infinity;
  const { x: cx, y: cy } = state.bar.center; state.ball.x = cx; state.ball.y = cy;
}

let last = performance.now(); let lastDraw = performance.now();
function loop(t) {
  const interval = 1000 / 60;     // fixed 60 FPS
  const dt = (t - last) / 1000;
  if (dt > 0.25) { last = t; requestAnimationFrame(loop); return; }
  if (t - lastDraw >= interval) {
    const dtc = Math.min(0.033, (t - last) / 1000);
    if (state.started) update(dtc);
    draw();
    last = t; lastDraw = t;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Share helpers
// ---------- Share helpers (robust) ----------
function shareText() {
  if (state.mode === 'daily') {
    const n = dailyNumberToday();
    return state.challengeComplete
      ? `I just completed Daily Challenge #${n} on Reactor Rush! Play it here: ${SHARE_URL}`
      : `I'm attempting today's Reactor Rush Daily #${n}! Play it here: ${SHARE_URL}`;
  }
  return `I just scored ${state.score} on Reactor Rush! Play it here: ${SHARE_URL}`;
}

function showCopied(el) { if (!el) return; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1200); }

async function doShareClipboard(tipEl) {
  const text = shareText();
  let copied = false;

  // Preferred path (secure contexts)
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
  }

  // Fallback path (works on http/file:)
  if (!copied) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-10000px';
    document.body.appendChild(ta);
    ta.select();
    try { copied = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    if (!copied) window.prompt('Copy to clipboard:', text);
  }

  if (tipEl) showCopied(tipEl);
}

// After-end quick restart
canvas.addEventListener('pointerdown', () => { if (state.started && !state.running) { resetGame(); } });

// Initial hint
setHint();

// ---------- Daily countdown (America/New_York) + feedback links ----------
const FEEDBACK_URL = 'https://docs.google.com/forms/d/15tmfye6Ra7GBAoHCVuTCNYh9vV35ZxziT97EgejOPkI';
// Daily numbering base (NY time) — Daily #1
const DAILY_BASE = '2025-08-28'; // <— set to TODAY when you deploy

function nyNow() {
  const d = new Date();
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}
function daysUTC(y, m, d) { return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
function ymdOfNY(dateNY) { return { y: dateNY.getFullYear(), m: dateNY.getMonth() + 1, d: dateNY.getDate() }; }
function parseYMD(str) { const [y, m, d] = str.split('-').map(Number); return { y, m, d }; }

function dailyNumberToday() {
  const today = ymdOfNY(nyNow());
  const base = parseYMD(DAILY_BASE);
  return Math.max(1, daysUTC(today.y, today.m, today.d) - daysUTC(base.y, base.m, base.d) + 1);
}


function getNYNow() {
  const d = new Date();
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
}
function secondsUntilNextNYMidnight() {
  const ny = getNYNow();
  const next = new Date(ny);
  next.setDate(ny.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((next - ny) / 1000));
}
function formatHMS(s) {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}
function updateDailyCountdownUI() {
  const secs = secondsUntilNextNYMidnight();
  const txt = formatHMS(secs);
  // countdowns
  const leftEl = document.getElementById('dailyCountdown');
  const mobEl  = document.getElementById('dailyCountdownMobile');
  if (leftEl) leftEl.textContent = txt;
  if (mobEl)  mobEl.textContent = txt;

  // daily number
  const num = dailyNumberToday();
  const n1 = document.getElementById('dailyNumber');
  const n2 = document.getElementById('dailyNumberMobile');
  if (n1) n1.textContent = String(num);
  if (n2) n2.textContent = String(num);

  // Optional: reseed at rollover if currently in Daily mode
  if (secs === 0 && state?.mode === 'daily') startMode('daily');
}

function initDailyCountdownAndFeedback() {
  // Wire feedback links (desktop + mobile)
  const f1 = document.getElementById('feedbackLink');
  const f2 = document.getElementById('feedbackLinkMobile');
  if (f1) f1.href = FEEDBACK_URL;
  if (f2) f2.href = FEEDBACK_URL;

  // Start ticking countdown once per second
  updateDailyCountdownUI();
  setInterval(updateDailyCountdownUI, 1000);
}

initDailyCountdownAndFeedback();
