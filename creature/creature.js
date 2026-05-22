/**
 * neural-synthesis/creature.js
 *
 * Pixel sprite renderer for the living creature.
 * Renders to #creature-canvas when creature view is active.
 *
 * Design principles:
 *   - PIXEL_SCALE: 5px per creature pixel
 *   - Creature size: 10% of canvas height at birth (3 nodes) → 30% at max (12 nodes)
 *   - All body parts are pixel arrays grown additively as network complexity increases
 *   - Movement is driven directly by audio state (energy, phase locks, events)
 *   - No shadow. No anchor indicator overlap.
 *   - Three environmental objects: water, light, wind
 *   - Each object produces an audible parameter shift and a creature reaction
 *   - Fray is a single bilateral creature — distinctive shape, not dual rendering
 *
 * Growth grammar:
 *   Body size        ← node count
 *   Limb length      ← average connection strength
 *   Eye size         ← predictive node activity
 *   Antlers/spines   ← inhibitory connection ratio
 *   Tail             ← delay node activity
 *   Surface texture  ← harmonic vocabulary richness (phase lock count)
 *   Wings/tendrils   ← phase lock count and duration
 *   Mouth state      ← current energy level
 *
 * Animation:
 *   Breathing  — procedural sine, rate = metabolism
 *   Rhythm     — limbs/tail animate at metabolic period from harmonic.js
 *   Events     — keyframed sequences triggered by NetworkEvents
 *   Idle       — occasional slow eye movement, blink
 */

import { NS, NODE_TYPES, NetworkEvents }            from './network.js';
import { getMetabolicPeriod, getDominantInterval,
         forceHarmonicEvent }                       from './harmonic.js';
import { setParam }                                 from './network.js';
import { injectNode }                               from './network.js';
import { setNodePan }                               from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PIXEL_SCALE  = 5;
const BIRTH_SCALE  = 0.10;
const MAX_SCALE    = 0.30;
const INIT_NODES   = 3;
const MAX_NODES    = 12;

/* ═══════════════════════════════════════════════════════════════════
   COLOR PALETTE
   ═══════════════════════════════════════════════════════════════════ */

const PAL = {
  bg:         '#07080b',
  lull:       '#8ab0c8',
  lull2:      '#c8dce8',
  lull3:      '#3a6080',
  weft:       '#98b888',
  weft2:      '#b8ccb0',
  weft3:      '#405030',
  brine:      '#8878a8',
  brine2:     '#6858a0',
  brine3:     '#382848',
  murk:       '#909090',
  murk2:      '#b0b0b0',
  murk3:      '#505050',
  fray:       '#c8a068',
  fray2:      '#e0b888',
  fray3:      '#604828',
  loam:       '#a87858',
  loam2:      '#c89870',
  loam3:      '#504030',
  accent:     '#7db5a0',
  accent2:    '#a6d0be',
  warn:       '#c07850',
  cold:       '#7898c0',
};

/* Per-species palettes: [null, primary, light, dark, accent] */
const SPECIES_PAL = {
  lull:  [null, PAL.lull,  PAL.lull2,  PAL.lull3,  PAL.accent2],
  weft:  [null, PAL.weft,  PAL.weft2,  PAL.weft3,  PAL.accent],
  brine: [null, PAL.brine, PAL.brine2, PAL.brine3, PAL.cold],
  murk:  [null, PAL.murk,  PAL.murk2,  PAL.murk3,  '#787878'],
  fray:  [null, PAL.fray,  PAL.fray2,  PAL.fray3,  PAL.accent],
  loam:  [null, PAL.loam,  PAL.loam2,  PAL.loam3,  PAL.accent2],
};

/* ═══════════════════════════════════════════════════════════════════
   SPRITE PIXEL ARRAYS
   0 = transparent, 1..4 = palette index
   ═══════════════════════════════════════════════════════════════════ */

const SPR = {
  /* Eyes */
  eye_tiny:   [[0,1,0],[1,2,1],[0,1,0]],
  eye_sm:     [[0,1,1,0],[1,2,2,1],[1,2,3,1],[0,1,1,0]],
  eye_lg:     [[0,0,1,1,0,0],[0,1,2,2,1,0],[1,2,2,3,2,1],[1,2,3,3,2,1],[0,1,2,2,1,0],[0,0,1,1,0,0]],
  eye_closed: [[0,0,0],[1,1,1],[0,0,0]],

  /* Mouth */
  mouth_shut: [[1,1,1,1]],
  mouth_open: [[1,0,0,1],[1,1,1,1]],
  mouth_wide: [[1,0,0,0,1],[1,4,4,4,1],[1,1,1,1,1]],

  /* Bodies — per species, three growth stages */
  body_lull: [
    /* birth */    [[0,1,1,0],[1,2,2,1],[1,2,2,1],[0,1,1,0]],
    /* mid */      [[0,0,1,1,1,0,0],[0,1,2,2,2,1,0],[1,1,2,3,2,1,1],[1,1,2,3,2,1,1],[0,1,2,2,2,1,0],[0,0,1,1,1,0,0]],
    /* mature */   [[0,0,0,1,1,1,0,0,0],[0,0,1,2,2,2,1,0,0],[0,1,2,2,3,2,2,1,0],[1,1,2,3,3,3,2,1,1],[1,1,2,3,3,3,2,1,1],[0,1,2,2,3,2,2,1,0],[0,0,1,2,2,2,1,0,0],[0,0,0,1,1,1,0,0,0]],
  ],
  body_weft: [
    [[0,1,1,0],[1,2,2,1],[1,2,2,1],[0,1,1,0]],
    [[0,0,1,1,1,0,0],[0,1,2,2,2,1,0],[1,1,2,3,2,1,1],[0,1,2,2,2,1,0],[0,0,1,1,1,0,0]],
    [[0,0,0,1,1,0,0,0],[0,0,1,2,2,1,0,0],[0,1,2,2,2,2,1,0],[1,1,2,3,3,2,1,1],[1,1,2,3,3,2,1,1],[0,1,2,2,2,2,1,0],[0,0,1,2,2,1,0,0],[0,0,0,1,1,0,0,0]],
  ],
  body_brine: [
    [[0,1,1,0],[1,3,3,1],[1,3,2,1],[0,1,1,0]],
    [[0,1,1,1,1,0],[1,1,3,3,1,1],[1,3,3,2,3,1],[1,3,2,2,3,1],[0,1,3,3,1,0],[0,0,1,1,0,0]],
    [[0,0,1,1,1,1,0,0],[0,1,1,3,3,1,1,0],[1,1,3,3,2,3,1,1],[1,3,3,2,2,3,3,1],[1,3,2,2,2,2,3,1],[0,1,3,3,3,3,1,0],[0,0,1,1,1,1,0,0]],
  ],
  body_murk: [
    [[1,1,0],[1,2,1],[0,1,1]],
    [[0,1,1,1,0],[1,1,2,1,0],[1,2,2,1,1],[0,1,1,2,1],[0,0,1,1,0]],
    [[0,0,1,1,1,0,0],[0,1,1,2,1,0,0],[1,1,2,2,1,1,0],[1,2,2,3,2,1,1],[0,1,1,2,2,1,1],[0,0,1,1,2,1,0],[0,0,0,1,1,0,0]],
  ],
  body_fray: [
    /* Fray: single body, bilateral — slightly asymmetric */
    [[0,1,1,1,0],[1,2,3,2,1],[1,2,3,2,1],[0,1,2,1,0]],
    [[0,0,1,1,1,1,0],[0,1,2,2,3,1,0],[1,1,2,3,3,2,1],[1,2,2,3,2,2,1],[0,1,2,2,2,1,0],[0,0,1,1,1,0,0]],
    [[0,0,0,1,1,1,1,0,0],[0,0,1,2,2,3,1,0,0],[0,1,2,2,3,3,2,1,0],[1,1,2,3,3,3,2,1,1],[1,2,2,3,3,2,2,2,1],[0,1,2,2,3,2,2,1,0],[0,0,1,2,2,2,1,0,0],[0,0,0,1,1,1,0,0,0]],
  ],
  body_loam: [
    [[0,1,0],[1,1,1],[1,2,1],[0,1,0]],
    [[0,1,1,1,0],[1,1,2,1,1],[1,2,2,2,1],[1,2,3,2,1],[0,1,2,1,0],[0,0,1,0,0]],
    [[0,0,1,1,1,0,0],[0,1,1,2,1,1,0],[1,1,2,2,2,1,1],[1,2,2,3,2,2,1],[1,2,3,3,3,2,1],[0,1,2,2,2,1,0],[0,0,1,2,1,0,0],[0,0,0,1,0,0,0]],
  ],

  /* Habitat elements */
  sun_sm:    [[0,0,2,0,0],[0,2,2,2,0],[2,2,3,2,2],[0,2,2,2,0],[0,0,2,0,0]],
  sun_lg:    [[0,0,0,2,0,0,0],[0,0,2,3,2,0,0],[0,2,3,3,3,2,0],[2,3,3,4,3,3,2],[0,2,3,3,3,2,0],[0,0,2,3,2,0,0],[0,0,0,2,0,0,0]],
  water_surf:[[0,1,0,0,1,0,0,1,0,0,1,0],[1,1,1,1,1,1,1,1,1,1,1,1]],
  water_body:[[1,1,1,1,1,1,1,1,1,1,1,1]],
  wind_line: [[1,1,0,0,0,0],[0,1,1,0,0,0],[0,0,1,1,0,0],[0,0,0,1,1,0],[0,0,0,0,1,1]],
};

/* ═══════════════════════════════════════════════════════════════════
   HABITAT DEFINITIONS
   ═══════════════════════════════════════════════════════════════════ */

const HABITATS = {
  lull:  { sky: '#050810', ground: '#0a1220', water: '#1a3450', hasSky: false },
  weft:  { sky: '#060c06', ground: '#0a1408', water: null,      hasSky: true  },
  brine: { sky: '#04040a', ground: '#080814', water: null,      hasSky: false },
  murk:  { sky: '#0a0a0c', ground: '#101012', water: null,      hasSky: false },
  fray:  { sky: '#100808', ground: '#180c08', water: null,      hasSky: true  },
  loam:  { sky: '#080a06', ground: '#100e08', water: null,      hasSky: true  },
};

/* ═══════════════════════════════════════════════════════════════════
   ENVIRONMENTAL OBJECTS — water, light, wind only
   ═══════════════════════════════════════════════════════════════════ */

export const ENV_ITEMS = [
  {
    id:       'water',
    label:    'water',
    placement:'ground_left',
    duration: 60000,
    palFn:    () => [null, PAL.cold, PAL.lull2, PAL.lull3, '#6090b0'],
    effect(ns) {
      /* Increases phase coupling — oscillators pull toward each other */
      ns.phaseCoupling = Math.min(1, ns.phaseCoupling + 0.12);
      setParam('phaseCoupling', ns.phaseCoupling);
      /* Slightly calms instability */
      ns.instability = Math.max(0, ns.instability - 0.06);
      setParam('instability', ns.instability);
    },
    creatureAnim: 'sip',
  },
  {
    id:       'light',
    label:    'light',
    placement:'sky_right',
    duration: 15000,
    palFn:    () => [null, '#f0e050', '#fff8a0', '#c0b030', '#ffe060'],
    effect(ns) {
      /* Brief instability burst — energy injection into most active oscillator */
      ns.instability = Math.min(1, ns.instability + 0.10);
      setParam('instability', ns.instability);
      const oscs = ns.nodes.filter(n => n.type === NODE_TYPES.OSCILLATOR);
      if (oscs.length) {
        const target = oscs.reduce((best, n) =>
          n.smoothEnergy > best.smoothEnergy ? n : best, oscs[0]);
        injectNode(target.id, 0.7);
      }
      /* Instability decays back after duration */
    },
    creatureAnim: 'alert',
  },
  {
    id:       'wind',
    label:    'wind',
    placement:'sky_sweep',
    duration: 20000,
    palFn:    () => [null, '#c0d0e0', '#e0eef8', '#a0b8c8', '#d0e8f0'],
    effect(ns) {
      /* Randomize pan positions — audible spatial movement */
      ns.nodes.forEach((n, i) => {
        const newPan = (Math.random() * 2 - 1) * 0.9;
        setNodePan(n.id, newPan);
      });
      /* Excite delay nodes */
      ns.nodes
        .filter(n => n.type === NODE_TYPES.DELAY)
        .forEach(n => injectNode(n.id, 0.5));
      /* Trigger a harmonic event on a random oscillator */
      const oscs = ns.nodes.filter(n => n.type === NODE_TYPES.OSCILLATOR);
      if (oscs.length) {
        const osc = oscs[Math.floor(Math.random() * oscs.length)];
        forceHarmonicEvent(osc.id, 'fifth', Math.random() < 0.5 ? 'up' : 'down');
      }
    },
    creatureAnim: 'sway',
  },
];

/* ═══════════════════════════════════════════════════════════════════
   KEYFRAMED ANIMATION SEQUENCES
   dt: ms from sequence start
   bobY: vertical pixel offset
   scaleBoost: fractional scale addition
   eyeOpen: 1=normal, >1=wide, <1=squint/closed
   tilt: degrees of body tilt
   ═══════════════════════════════════════════════════════════════════ */

const SEQUENCES = {
  harmonic_event: [
    { dt:   0, bobY:  0, scaleBoost: 0,     eyeOpen: 1.0, tilt:  0 },
    { dt:  80, bobY: -2, scaleBoost: 0.04,  eyeOpen: 1.2, tilt:  2 },
    { dt: 220, bobY: -1, scaleBoost: 0.015, eyeOpen: 1.1, tilt:  1 },
    { dt: 420, bobY:  0, scaleBoost: 0,     eyeOpen: 1.0, tilt:  0 },
  ],
  phase_lock: [
    { dt:   0, bobY:  0, scaleBoost:  0,     eyeOpen: 1.0, tilt: 0 },
    { dt: 150, bobY:  1, scaleBoost: -0.02,  eyeOpen: 0.6, tilt: 0 },
    { dt: 380, bobY:  0, scaleBoost:  0,     eyeOpen: 0.9, tilt: 0 },
    { dt: 650, bobY:  0, scaleBoost:  0,     eyeOpen: 1.0, tilt: 0 },
  ],
  startle: [
    { dt:   0, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
    { dt:  55, bobY: -3, scaleBoost: 0.07, eyeOpen: 1.5, tilt: -3 },
    { dt: 170, bobY:  2, scaleBoost:-0.02, eyeOpen: 1.2, tilt:  2 },
    { dt: 360, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
  ],
  inject: [
    { dt:   0, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt: 0 },
    { dt:  50, bobY: -1, scaleBoost: 0.03, eyeOpen: 1.1, tilt: 1 },
    { dt: 220, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt: 0 },
  ],
  node_born: [
    { dt:   0, bobY:  0, scaleBoost: 0,    eyeOpen: 1.2, tilt: 0 },
    { dt: 120, bobY: -2, scaleBoost: 0.05, eyeOpen: 1.3, tilt: 0 },
    { dt: 420, bobY:  0, scaleBoost: 0.01, eyeOpen: 1.1, tilt: 0 },
    { dt: 750, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt: 0 },
  ],
  sip: [
    { dt:   0, bobY: 0, scaleBoost: 0,   eyeOpen: 1.0, tilt:  0 },
    { dt: 200, bobY: 2, scaleBoost: 0,   eyeOpen: 0.7, tilt:  3 },
    { dt: 500, bobY: 1, scaleBoost: 0,   eyeOpen: 0.9, tilt:  2 },
    { dt: 800, bobY: 0, scaleBoost: 0,   eyeOpen: 1.0, tilt:  0 },
  ],
  alert: [
    { dt:   0, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
    { dt:  80, bobY: -2, scaleBoost: 0.05, eyeOpen: 1.4, tilt: -2 },
    { dt: 350, bobY:  0, scaleBoost: 0,    eyeOpen: 1.2, tilt:  0 },
    { dt: 600, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
  ],
  sway: [
    { dt:   0, bobY: 0, scaleBoost: 0, eyeOpen: 1.0, tilt:  0 },
    { dt: 200, bobY: 0, scaleBoost: 0, eyeOpen: 0.9, tilt:  4 },
    { dt: 500, bobY: 0, scaleBoost: 0, eyeOpen: 0.9, tilt: -4 },
    { dt: 800, bobY: 0, scaleBoost: 0, eyeOpen: 1.0, tilt:  0 },
  ],
  env_emerge: [
    { dt:    0, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
    { dt:  200, bobY: -3, scaleBoost: 0.06, eyeOpen: 1.5, tilt: -3 },
    { dt:  600, bobY: -1, scaleBoost: 0.03, eyeOpen: 1.3, tilt:  0 },
    { dt: 1200, bobY:  0, scaleBoost: 0,    eyeOpen: 1.1, tilt:  0 },
    { dt: 2000, bobY:  0, scaleBoost: 0,    eyeOpen: 1.0, tilt:  0 },
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

let _canvas       = null;
let _ctx          = null;
let _speciesId    = 'lull';
let _creatureName = '';
let _isVisible    = false;

/* Animation state */
const _anim = {
  current:   null,
  startTime: 0,
  state: { bobY: 0, scaleBoost: 0, eyeOpen: 1.0, tilt: 0, mouthOpen: 0 },
};

/* Procedural animation phases */
let _breathPhase  = 0;
let _tailPhase    = 0;
let _idlePhase    = 0;
let _blinkTimer   = 0;
let _wanderX      = 0;
let _wanderY      = 0;
let _wanderVX     = 0;
let _wanderVY     = 0;

/* Placed environmental objects */
let _envObjects   = [];   /* [{ item, x, y, addedAt, pal }] */

/* Stable fur seed — updated slowly */
let _furSeed      = 0;
let _furDots      = [];   /* precomputed fur dot positions */

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */

export function initCreature(canvas, speciesId, name) {
  _canvas       = canvas;
  _ctx          = canvas.getContext('2d');
  _speciesId    = speciesId || 'lull';
  _creatureName = name || '';
  _envObjects   = [];
  _furDots      = [];
  _breathPhase  = 0;
  _tailPhase    = 0;
  _idlePhase    = 0;
  _blinkTimer   = Math.random() * 200;

  _buildEnvBar();
  _updateNameDisplay();

  /* Wire events */
  NetworkEvents.on('harmonicEvent',       _onHarmonicEvent);
  NetworkEvents.on('phaseLock',           _onPhaseLock);
  NetworkEvents.on('nodeAdded',           _onNodeAdded);
  NetworkEvents.on('environmentNodeEmerged', _onEnvNodeEmerged);
}

export function setCreatureName(name) {
  _creatureName = name;
  _updateNameDisplay();
}

export function setSpeciesId(id) {
  _speciesId = id;
  _envObjects = [];
  _furDots    = [];
}

export function setVisible(v) { _isVisible = v; }

function _updateNameDisplay() {
  const el = document.getElementById('creature-name-display');
  if (el) el.textContent = _creatureName || '';
}

/* ═══════════════════════════════════════════════════════════════════
   ENVIRONMENTAL OBJECT BAR
   ═══════════════════════════════════════════════════════════════════ */

function _buildEnvBar() {
  const bar = document.getElementById('food-bar');
  if (!bar) return;
  bar.innerHTML = '';

  ENV_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(7,8,11,0.75);
      border: 1px solid var(--border2);
      padding: 3px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s;
    `;
    btn.textContent = item.label;
    btn.title = item.label;

    btn.addEventListener('mouseenter', () => {
      btn.style.color       = 'var(--accent)';
      btn.style.borderColor = 'var(--accent)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color       = 'var(--muted)';
      btn.style.borderColor = 'var(--border2)';
    });
    btn.addEventListener('click', () => _placeEnvItem(item));
    bar.appendChild(btn);
  });
}

function _placeEnvItem(item) {
  if (!_canvas) return;
  const cw = _canvas.width, ch = _canvas.height;
  let px = cw / 2, py = ch / 2;

  switch (item.placement) {
    case 'sky_right': px = cw * 0.80; py = ch * 0.11; break;
    case 'sky_sweep': px = cw * 0.10; py = ch * 0.18; break;
    case 'ground_left': px = cw * 0.06; py = ch * 0.78; break;
  }

  /* Remove existing instance */
  _envObjects = _envObjects.filter(o => o.item.id !== item.id);

  _envObjects.push({
    item,
    x:       px,
    y:       py,
    addedAt: Date.now(),
    pal:     item.palFn(),
  });

  /* Apply network effect */
  try { item.effect(NS); } catch (e) { console.warn('[Creature] env effect:', e); }

  /* Creature reaction */
  _triggerAnim(item.creatureAnim || 'inject');
}

function _expireObjects(nowMs) {
  _envObjects = _envObjects.filter(o => nowMs - o.addedAt < o.item.duration);
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN DRAW
   ═══════════════════════════════════════════════════════════════════ */

export function drawCreature(nowMs) {
  if (!_isVisible || !_ctx || !_canvas) return;

  const cw = _canvas.width, ch = _canvas.height;

  _expireObjects(nowMs);
  _updateAnim(nowMs);
  _updateProcedural(nowMs);

  const N       = NS.nodes.length;
  const growth  = Math.max(0, Math.min(1,
    (N - INIT_NODES) / (MAX_NODES - INIT_NODES)
  ));

  const palette = SPECIES_PAL[_speciesId] || SPECIES_PAL.lull;
  const habitat = HABITATS[_speciesId]    || HABITATS.lull;

  /* 1. Background */
  _drawBackground(cw, ch, habitat);

  /* 2. Environmental objects (placed by user) */
  _drawEnvObjects(cw, ch, nowMs);

  /* 3. Creature */
  _drawBody(cw, ch, growth, palette);
}

/* ═══════════════════════════════════════════════════════════════════
   BACKGROUND
   ═══════════════════════════════════════════════════════════════════ */

function _drawBackground(cw, ch, habitat) {
  const ctx = _ctx;

  if (habitat.water) {
    /* Underwater habitat — full water fill with depth gradient */
    ctx.fillStyle = habitat.water;
    ctx.fillRect(0, 0, cw, ch);
    for (let row = 0; row < Math.floor(ch / PIXEL_SCALE); row++) {
      const alpha = Math.min(0.55, (row / (ch / PIXEL_SCALE)) * 0.75);
      ctx.fillStyle = `rgba(5,10,20,${alpha.toFixed(2)})`;
      ctx.fillRect(0, row * PIXEL_SCALE, cw, PIXEL_SCALE);
    }
  } else {
    /* Sky + ground */
    const skyH = Math.floor(ch * 0.62);
    ctx.fillStyle = habitat.sky;
    ctx.fillRect(0, 0, cw, skyH);
    ctx.fillStyle = habitat.ground;
    ctx.fillRect(0, skyH, cw, ch - skyH);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   ENVIRONMENTAL OBJECTS
   ═══════════════════════════════════════════════════════════════════ */

function _drawEnvObjects(cw, ch, nowMs) {
  _envObjects.forEach(obj => {
    const age   = nowMs - obj.addedAt;
    const alpha = Math.min(1, age / 400);
    /* Fade out in last 3s */
    const remaining = obj.item.duration - age;
    const fadeAlpha = remaining < 3000 ? remaining / 3000 : alpha;

    switch (obj.item.id) {

      case 'water': {
        /* Water body on left ground */
        const ww = Math.floor(cw * 0.22);
        const wy = Math.floor(ch * 0.72);
        const wh = ch - wy;

        /* Water body — tiled rows */
        _ctx.fillStyle = obj.pal[3] || PAL.cold;
        _ctx.globalAlpha = fadeAlpha * 0.7;
        _ctx.fillRect(0, wy + PIXEL_SCALE * 2, ww, wh - PIXEL_SCALE * 2);

        /* Water surface — pixel wave */
        _ctx.globalAlpha = fadeAlpha;
        _drawSprite(SPR.water_surf, obj.pal, 0, wy, fadeAlpha, 1);

        _ctx.globalAlpha = 1;
        break;
      }

      case 'light': {
        /* Sun in sky top-right */
        const timeInto = age / obj.item.duration;
        const pulse    = 1 + Math.sin(nowMs * 0.003) * 0.08;
        const spr      = timeInto < 0.5 ? SPR.sun_lg : SPR.sun_sm;
        _drawSprite(spr, obj.pal, obj.x - spr[0].length * PIXEL_SCALE / 2,
          obj.y - spr.length * PIXEL_SCALE / 2, fadeAlpha * pulse, 1);

        /* Light rays — simple pixel lines */
        _ctx.save();
        _ctx.globalAlpha = fadeAlpha * 0.18;
        _ctx.strokeStyle = obj.pal[1] || '#f0e050';
        _ctx.lineWidth   = 1;
        for (let r = 0; r < 6; r++) {
          const ang = (r / 6) * Math.PI * 2 + nowMs * 0.0003;
          const len = 20 + Math.sin(nowMs * 0.002 + r) * 8;
          _ctx.beginPath();
          _ctx.moveTo(obj.x, obj.y);
          _ctx.lineTo(obj.x + Math.cos(ang) * len * PIXEL_SCALE * 0.4,
                      obj.y + Math.sin(ang) * len * PIXEL_SCALE * 0.4);
          _ctx.stroke();
        }
        _ctx.restore();
        break;
      }

      case 'wind': {
        /* Diagonal wind lines sweeping across */
        const elapsed  = age / 1000;
        const sweep    = (elapsed * 0.15) % 1;
        for (let line = 0; line < 4; line++) {
          const ox   = (sweep + line * 0.25) % 1;
          const sx   = ox * cw * 1.2 - cw * 0.1;
          const sy   = ch * 0.1 + line * ch * 0.15;
          _drawSprite(SPR.wind_line, obj.pal,
            sx, sy, fadeAlpha * (0.5 + Math.sin(nowMs * 0.004 + line) * 0.2), 1);
        }
        break;
      }
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE BODY
   ═══════════════════════════════════════════════════════════════════ */

function _drawBody(cw, ch, growth, palette) {
  const energy    = NS.energyLevel;
  const anim      = _anim.state;

  /* Body sprite stage */
  const bodyKey  = `body_${_speciesId}`;
  const stages   = SPR[bodyKey] || SPR.body_lull;
  const stageIdx = growth < 0.38 ? 0 : growth < 0.72 ? 1 : 2;
  const body     = stages[Math.min(stageIdx, stages.length - 1)];

  /* Pixel size derived from target height */
  const targetH  = ch * (BIRTH_SCALE + (MAX_SCALE - BIRTH_SCALE) * growth);
  const pixelSz  = Math.max(2, Math.floor(targetH / body.length));
  const scale    = pixelSz * (1 + anim.scaleBoost);

  /* Center position with bob, wander, tilt */
  const isMurk   = _speciesId === 'murk';
  const cx       = cw / 2 + (isMurk ? _wanderX : 0);
  const cy       = ch * 0.50 + anim.bobY * pixelSz + (isMurk ? _wanderY : 0)
                 + Math.sin(_breathPhase) * pixelSz * 0.6;

  const sprW     = body[0].length;
  const sprH     = body.length;
  const hw       = (sprW * scale) / 2;
  const hh       = (sprH * scale) / 2;

  /* Tilt via canvas transform */
  _ctx.save();
  _ctx.translate(cx, cy);
  _ctx.rotate((anim.tilt * Math.PI) / 180);
  _ctx.translate(-cx, -cy);

  /* Body */
  _drawSprite(body, palette, cx - hw, cy - hh, 1.0, scale);

  /* Appendages */
  _drawAppendages(cx, cy, hw, hh, growth, scale, pixelSz, palette, energy, anim);

  /* Mouth */
  const mouthSpr = energy > 0.55 ? SPR.mouth_wide
                 : anim.mouthOpen > 0.25 ? SPR.mouth_open
                 : SPR.mouth_shut;
  const ms = scale;
  _drawSprite(mouthSpr, palette,
    cx - mouthSpr[0].length * ms / 2,
    cy + hh * 0.4,
    1.0, ms);

  _ctx.restore();

  /* Energy glow — drawn outside tilt transform */
  if (energy > 0.18) {
    _ctx.save();
    _ctx.globalAlpha = energy * 0.07;
    const grd = _ctx.createRadialGradient(cx, cy, 0, cx, cy, hw * 2.2);
    grd.addColorStop(0, palette[2] || PAL.accent2);
    grd.addColorStop(1, 'transparent');
    _ctx.fillStyle = grd;
    _ctx.fillRect(cx - hw * 2.2, cy - hh * 2.2, hw * 4.4, hh * 4.4);
    _ctx.restore();
  }
}

/* ═══════════════════════════════════════════════════════════════════
   APPENDAGES
   ═══════════════════════════════════════════════════════════════════ */

function _drawAppendages(cx, cy, hw, hh, growth, scale, pixelSz, palette, energy, anim) {
  /* Network metrics driving appendage state */
  const inhibRatio  = _inhibRatio();
  const predAct     = _predActivity();
  const delayAct    = _delayActivity();
  const connStr     = _avgConnStr();
  const lockCount   = NS.phaseLockCount;
  const harmRich    = Math.min(1, NS.totalPhaseLocks / 12 + connStr * 0.4);

  /* ── Eyes ── */
  if (growth >= 0) {
    const eyeSpr   = predAct > 0.38 ? SPR.eye_lg
                   : predAct > 0.18 ? SPR.eye_sm
                   : SPR.eye_tiny;
    const eyeScale = (scale / PIXEL_SCALE) * Math.max(0.3, anim.eyeOpen);
    /* Blink */
    const blink    = _blinkTimer < 3;
    const actualSpr= blink ? SPR.eye_closed : eyeSpr;
    const eyeOff   = hw * 0.22;

    _drawSprite(actualSpr, palette,
      cx - eyeOff - actualSpr[0].length * eyeScale / 2,
      cy - hh * 0.05,
      Math.min(1, growth * 4), eyeScale);
    _drawSprite(actualSpr, palette,
      cx + eyeOff - actualSpr[0].length * eyeScale / 2,
      cy - hh * 0.05,
      Math.min(1, growth * 4), eyeScale);
  }

  /* ── Limbs (grow with connection strength) ── */
  if (growth >= 0.15) {
    const limLen = Math.round(1 + connStr * 3.5 + growth * 2);
    const limAlpha = Math.min(1, (growth - 0.15) / 0.25);
    _drawLimb(cx - hw, cy + hh * 0.1, -1, limLen, pixelSz, palette, limAlpha);
    _drawLimb(cx + hw, cy + hh * 0.1,  1, limLen, pixelSz, palette, limAlpha);
  }

  /* ── Tail (delay activity) ── */
  if (growth >= 0.25 && delayAct > 0.05) {
    const tailLen = Math.round(1 + delayAct * 4 + growth * 2);
    const tAlpha  = Math.min(1, (growth - 0.25) / 0.2);
    _drawTail(cx, cy + hh, tailLen, pixelSz, palette, tAlpha);
  }

  /* ── Species-specific appendages ── */
  switch (_speciesId) {

    case 'lull': {
      /* Tendrils — grow downward, wave with breath */
      if (growth >= 0.3) {
        const count = 2 + Math.round(growth * 3);
        const tLen  = Math.round(2 + delayAct * 3 + growth * 3);
        const alpha = Math.min(1, (growth - 0.3) / 0.3);
        for (let t = 0; t < count; t++) {
          const ox = cx - hw * 0.7 + (t / (count - 1)) * hw * 1.4;
          _drawTendril(ox, cy + hh, tLen, pixelSz, palette, alpha,
            _breathPhase + t * 0.9);
        }
      }
      break;
    }

    case 'weft': {
      /* Antennae — bilateral, grow with phase locks */
      if (growth >= 0.2) {
        const aLen  = Math.round(2 + lockCount * 0.4 + growth * 2);
        const alpha = Math.min(1, (growth - 0.2) / 0.25);
        _drawAntenna(cx - hw * 0.25, cy - hh, -1, aLen, pixelSz, palette, alpha);
        _drawAntenna(cx + hw * 0.25, cy - hh,  1, aLen, pixelSz, palette, alpha);
      }
      /* Second limb pair */
      if (growth >= 0.55) {
        const limLen = Math.round(1 + connStr * 2 + growth);
        const alpha  = Math.min(1, (growth - 0.55) / 0.25);
        _drawLimb(cx - hw, cy + hh * 0.55, -1, limLen, pixelSz, palette, alpha);
        _drawLimb(cx + hw, cy + hh * 0.55,  1, limLen, pixelSz, palette, alpha);
      }
      break;
    }

    case 'brine': {
      /* Spines — driven by inhibitory ratio */
      if (growth >= 0.2 && inhibRatio > 0.1) {
        const count = Math.round(2 + inhibRatio * 5 + growth * 2);
        const sLen  = Math.round(1 + inhibRatio * 3) * pixelSz;
        const alpha = Math.min(1, (growth - 0.2) / 0.25);
        for (let s = 0; s < count; s++) {
          const sx = cx - hw * 0.8 + (s / (count - 1)) * hw * 1.6;
          _ctx.save();
          _ctx.globalAlpha = alpha;
          _ctx.fillStyle   = palette[2] || PAL.brine2;
          _ctx.fillRect(Math.round(sx), Math.round(cy - hh - sLen), pixelSz, sLen);
          _ctx.restore();
        }
      }
      /* Side spines */
      if (growth >= 0.45) {
        const count  = Math.round(2 + growth * 3);
        const alpha  = Math.min(1, (growth - 0.45) / 0.3);
        [-1, 1].forEach(side => {
          for (let s = 0; s < count; s++) {
            const sy  = cy - hh * 0.5 + (s / (count - 1)) * hh;
            const sLen= Math.round(1 + inhibRatio * 2 + growth) * pixelSz;
            _ctx.save();
            _ctx.globalAlpha = alpha;
            _ctx.fillStyle   = palette[3] || PAL.brine3;
            _ctx.fillRect(Math.round(cx + side * (hw + 1)),
              Math.round(sy), side * sLen, pixelSz);
            _ctx.restore();
          }
        });
      }
      break;
    }

    case 'murk': {
      /* Single asymmetric limb offset */
      if (growth >= 0.4) {
        const alpha = Math.min(1, (growth - 0.4) / 0.3);
        _drawLimb(cx + hw * 0.5, cy - hh * 0.2, 1,
          Math.round(1 + growth * 2), pixelSz, palette, alpha);
      }
      break;
    }

    case 'fray': {
      /* Bilateral asymmetric ears/horns — Fray has tension in its form */
      if (growth >= 0.2) {
        const alpha = Math.min(1, (growth - 0.2) / 0.25);
        _ctx.save();
        _ctx.globalAlpha = alpha;
        _ctx.fillStyle   = palette[1] || PAL.fray;
        /* Left ear */
        _ctx.fillRect(Math.round(cx - hw - pixelSz), Math.round(cy - hh),
          pixelSz, Math.round(pixelSz * (1.5 + growth * 1.5)));
        /* Right ear — slightly different height = tension */
        _ctx.fillRect(Math.round(cx + hw), Math.round(cy - hh - pixelSz),
          pixelSz, Math.round(pixelSz * (2 + growth)));
        _ctx.restore();
      }
      /* Bridge between halves grows with connection density */
      if (growth >= 0.65) {
        const bridgeW = Math.round((growth - 0.65) / 0.35 * hw * 0.5);
        if (bridgeW > 0) {
          _ctx.fillStyle = palette[3] || PAL.fray3;
          _ctx.fillRect(Math.round(cx - bridgeW / 2),
            Math.round(cy), bridgeW, pixelSz);
        }
      }
      break;
    }

    case 'loam': {
      /* Antlers — grow with node count, branch count with harmonic richness */
      if (growth >= 0.25) {
        const branches = Math.round(1 + harmRich * 3 + growth * 1.5);
        const alpha    = Math.min(1, (growth - 0.25) / 0.3);
        _drawAntler(cx - hw * 0.3, cy - hh, -1, branches, pixelSz, palette, alpha);
        _drawAntler(cx + hw * 0.3, cy - hh,  1, branches, pixelSz, palette, alpha);
      }
      /* Fur dots */
      if (growth >= 0.4 && harmRich > 0.1) {
        _drawFur(cx, cy, hw, hh, harmRich, growth, palette);
      }
      break;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   APPENDAGE DRAW HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _drawLimb(x, y, dir, length, pixelSz, palette, alpha) {
  _ctx.save();
  _ctx.globalAlpha = alpha;
  let lx = x, ly = y;
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(_breathPhase + i * 0.7) * pixelSz * 0.35;
    _ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    _ctx.fillRect(Math.round(lx + wave), Math.round(ly), pixelSz, pixelSz);
    lx += dir * pixelSz * 0.65;
    ly += pixelSz * 0.85;
  }
  _ctx.restore();
}

function _drawTail(x, y, length, pixelSz, palette, alpha) {
  _ctx.save();
  _ctx.globalAlpha = alpha;
  let tx = x, ty = y;
  const period = Math.max(200, getMetabolicPeriod());
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(_tailPhase + i * 0.65) * pixelSz * (0.35 + i * 0.1);
    _ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    _ctx.fillRect(Math.round(tx + wave), Math.round(ty), pixelSz, pixelSz);
    ty += pixelSz * 0.88;
  }
  _ctx.restore();
}

function _drawTendril(x, y, length, pixelSz, palette, alpha, phase) {
  _ctx.save();
  _ctx.globalAlpha = alpha;
  let tx = x, ty = y;
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(phase + i * 0.75) * pixelSz * 0.55;
    _ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    _ctx.fillRect(Math.round(tx + wave), Math.round(ty), pixelSz, pixelSz);
    ty += pixelSz * 0.9;
    tx += wave * 0.08;
  }
  _ctx.restore();
}

function _drawAntenna(x, y, dir, length, pixelSz, palette, alpha) {
  _ctx.save();
  _ctx.globalAlpha = alpha;
  let ax = x, ay = y;
  for (let i = 0; i < length; i++) {
    _ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    _ctx.fillRect(Math.round(ax), Math.round(ay - i * pixelSz), pixelSz, pixelSz);
  }
  /* Tip dot */
  _ctx.fillStyle = palette[4] || PAL.accent;
  _ctx.fillRect(Math.round(ax + dir * pixelSz), Math.round(ay - length * pixelSz), pixelSz, pixelSz);
  _ctx.restore();
}

function _drawAntler(x, y, dir, branches, pixelSz, palette, alpha) {
  _ctx.save();
  _ctx.globalAlpha = alpha;
  const stalkLen = 2 + Math.ceil(branches * 0.6);
  /* Main stalk */
  for (let i = 0; i < stalkLen; i++) {
    _ctx.fillStyle = palette[1] || PAL.loam;
    _ctx.fillRect(Math.round(x), Math.round(y - i * pixelSz), pixelSz, pixelSz);
  }
  /* Branches */
  for (let b = 0; b < branches; b++) {
    const bx = x + dir * pixelSz * (b + 1);
    const by = y - (b + 1) * pixelSz;
    _ctx.fillStyle = palette[2] || PAL.loam2;
    _ctx.fillRect(Math.round(bx), Math.round(by), pixelSz, pixelSz);
    _ctx.fillRect(Math.round(bx), Math.round(by - pixelSz), pixelSz, pixelSz);
  }
  _ctx.restore();
}

function _drawFur(cx, cy, hw, hh, richness, growth, palette) {
  /* Stable fur dots — regenerate when seed changes */
  const newSeed = Math.floor(Date.now() / 800);
  if (newSeed !== _furSeed || _furDots.length === 0) {
    _furSeed  = newSeed;
    const count = Math.round(richness * 18 + growth * 10);
    _furDots  = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r     = Math.random() * hw * 0.75;
      _furDots.push({
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r * 0.65,
      });
    }
  }
  _ctx.save();
  _ctx.fillStyle = palette[2] || PAL.loam2;
  _ctx.globalAlpha = 0.6;
  _furDots.forEach(d => {
    _ctx.fillRect(Math.round(cx + d.x), Math.round(cy + d.y), 2, 2);
  });
  _ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   SPRITE RENDERER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Draw a pixel sprite.
 * sprite: 2D array of palette indices (0 = transparent)
 * palette: color array [null, color1, color2, ...]
 * x, y: top-left position in canvas pixels
 * alpha: global alpha 0..1
 * scale: pixels per sprite pixel (default PIXEL_SCALE)
 */
function _drawSprite(sprite, palette, x, y, alpha, scale) {
  if (!sprite || !_ctx) return;
  const ps = scale ?? PIXEL_SCALE;
  _ctx.save();
  _ctx.globalAlpha = Math.max(0, Math.min(1, alpha ?? 1));
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const v = sprite[row][col];
      if (v === 0) continue;
      _ctx.fillStyle = palette[v] || PAL.accent;
      _ctx.fillRect(
        Math.round(x + col * ps),
        Math.round(y + row * ps),
        Math.max(1, Math.floor(ps)),
        Math.max(1, Math.floor(ps))
      );
    }
  }
  _ctx.restore();
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATION
   ═══════════════════════════════════════════════════════════════════ */

export function triggerStartle() { _triggerAnim('startle'); }

function _triggerAnim(name) {
  const seq = SEQUENCES[name];
  if (!seq) return;
  _anim.current   = name;
  _anim.startTime = Date.now();
}

function _updateAnim(nowMs) {
  const state = _anim.state;

  if (!_anim.current) {
    /* Settle toward defaults */
    state.scaleBoost = state.scaleBoost * 0.90;
    state.eyeOpen    = state.eyeOpen    * 0.94 + 1.0 * 0.06;
    state.tilt       = state.tilt       * 0.88;
    state.mouthOpen  = state.mouthOpen  * 0.88;
    return;
  }

  const seq     = SEQUENCES[_anim.current];
  const elapsed = nowMs - _anim.startTime;
  const last    = seq[seq.length - 1];

  if (elapsed >= last.dt) {
    _anim.current = null;
    return;
  }

  /* Interpolate between keyframes */
  let fA = seq[0], fB = seq[1];
  for (let i = 0; i < seq.length - 1; i++) {
    if (elapsed >= seq[i].dt && elapsed < seq[i + 1].dt) {
      fA = seq[i]; fB = seq[i + 1];
      break;
    }
  }

  const t = (elapsed - fA.dt) / Math.max(1, fB.dt - fA.dt);
  const lerp = (a, b) => a + (b - a) * t;

  state.bobY      = lerp(fA.bobY,      fB.bobY);
  state.scaleBoost= lerp(fA.scaleBoost,fB.scaleBoost);
  state.eyeOpen   = lerp(fA.eyeOpen,   fB.eyeOpen);
  state.tilt      = lerp(fA.tilt,      fB.tilt);
}

function _updateProcedural(nowMs) {
  const metabolism = NS.metabolism ?? 0.4;
  const energy     = NS.energyLevel;
  const period     = Math.max(300, getMetabolicPeriod());

  /* Breathing — rate tied to metabolism */
  _breathPhase += 0.010 * (0.4 + metabolism * 1.8);

  /* Tail rhythm — tied to metabolic period */
  _tailPhase += (2 * Math.PI / period) * 16;   /* ~1 frame at 60fps */

  /* Idle */
  _idlePhase += 0.004;

  /* Blink timer */
  _blinkTimer -= 1;
  if (_blinkTimer < 0) {
    _blinkTimer = 120 + Math.random() * 280;
  }

  /* Mouth driven by energy */
  _anim.state.mouthOpen = Math.max(_anim.state.mouthOpen * 0.92, energy * 0.9);

  /* Base bob from breathing (when no animation active) */
  if (!_anim.current) {
    _anim.state.bobY = Math.sin(_breathPhase) * (0.4 + energy * 0.5);
  }

  /* Murk wander */
  if (_speciesId === 'murk' && _canvas) {
    _wanderVX += (Math.random() - 0.5) * 0.5;
    _wanderVY += (Math.random() - 0.5) * 0.22;
    _wanderVX *= 0.95; _wanderVY *= 0.95;
    _wanderX  += _wanderVX; _wanderY  += _wanderVY;
    const cw = _canvas.width, ch = _canvas.height;
    if (Math.abs(_wanderX) > cw * 0.18) _wanderVX *= -0.6;
    if (Math.abs(_wanderY) > ch * 0.10) _wanderVY *= -0.6;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK METRIC HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _inhibRatio() {
  if (!NS.edges.length) return 0;
  return NS.edges.filter(e => e.weight < 0).length / NS.edges.length;
}

function _predActivity() {
  const preds = NS.nodes.filter(n => n.type === NODE_TYPES.PREDICTIVE);
  if (!preds.length) return 0;
  return preds.reduce((s, n) => s + n.smoothEnergy, 0) / preds.length;
}

function _delayActivity() {
  const delays = NS.nodes.filter(n => n.type === NODE_TYPES.DELAY);
  if (!delays.length) return 0;
  return delays.reduce((s, n) => s + n.smoothEnergy, 0) / delays.length;
}

function _avgConnStr() {
  if (!NS.edges.length) return 0;
  return NS.edges.reduce((s, e) => s + Math.abs(e.weight), 0) / NS.edges.length;
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

function _onHarmonicEvent({ isBass }) {
  _triggerAnim(isBass ? 'harmonic_event' : 'inject');
}
function _onPhaseLock()                  { _triggerAnim('phase_lock'); }
function _onNodeAdded()                  { _triggerAnim('node_born'); }
function _onEnvNodeEmerged()             { _triggerAnim('env_emerge'); }

/* ═══════════════════════════════════════════════════════════════════
   GETTERS
   ═══════════════════════════════════════════════════════════════════ */

export function getCreatureName() { return _creatureName; }
export function getSpeciesId()    { return _speciesId; }
