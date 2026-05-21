/**
 * neural-synthesis/creature.js
 *
 * Pixel sprite renderer for the living creature.
 * Renders to #creature-canvas when creature view is active.
 *
 * Architecture:
 *   - PIXEL_SCALE: 5px per creature pixel
 *   - Working grid: ~canvas_w/5 x ~canvas_h/5 creature pixels
 *   - Creature centered, scaled by node count (10% canvas at birth → 30% at max)
 *   - All body parts defined as pixel arrays (2D integer grids)
 *   - Growth state derived entirely from NS and harmonic.js state
 *   - Habitat layer drawn behind creature (water, sky, ground per species)
 *   - Food/object items placed as habitat elements on drop
 *   - Fray: two bilateral halves, each driven by its cluster (nodes 0-N/2 vs N/2-N)
 *
 * Rendering order each frame:
 *   1. Black background
 *   2. Habitat layer (sky gradient pixels, ground, water, placed objects)
 *   3. Creature shadow (subtle)
 *   4. Creature body (species base + grown appendages)
 *   5. Animation overlays (event flashes, startle, phase lock glow)
 *   6. Name display (handled by CSS overlay)
 */

import { NS, NODE_TYPES, NetworkEvents } from './network.js';
import { getGlideState, getMetabolicPeriod, getDominantInterval } from './harmonic.js';
import { getEnergyLevel } from './audio-engine.js';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const PIXEL_SCALE   = 5;
const BIRTH_SCALE   = 0.10;   /* fraction of canvas height at 4 nodes */
const MAX_SCALE     = 0.30;   /* fraction of canvas height at 12 nodes */
const INIT_NODES    = 4;
const MAX_NODES     = 12;

/* Color palette — maps to CSS variables resolved at init */
const PAL = {
  accent:      '#7db5a0',
  accent2:     '#a6d0be',
  accentDark:  '#3a7560',
  warn:        '#c07850',
  cold:        '#7898c0',
  hot:         '#c07898',
  dim:         '#333649',
  muted:       '#636678',
  lull:        '#8ab0c8',
  weft:        '#98b888',
  brine:       '#8878a8',
  murk:        '#909090',
  fray:        '#c8a068',
  loam:        '#a87858',
  bg:          '#07080b',
  surface:     '#0d0f17',
};

/* ═══════════════════════════════════════════════════════════════════
   PIXEL ART PRIMITIVES
   ═══════════════════════════════════════════════════════════════════
   Each sprite is a 2D array. Values:
     0 = transparent
     1..N = palette index (see SPECIES_DEFS[id].palette)
   Drawn with fillRect at PIXEL_SCALE size.
   ═══════════════════════════════════════════════════════════════════ */

/* Shared appendage pixel arrays — species color them differently */

const SPRITES = {

  /* ── Eyes ─────────────────────────────────────────────────── */
  eye_small: [
    [0,1,0],
    [1,2,1],
    [0,1,0],
  ],
  eye_medium: [
    [0,1,1,0],
    [1,2,2,1],
    [1,2,3,1],
    [0,1,1,0],
  ],
  eye_large: [
    [0,0,1,1,0,0],
    [0,1,2,2,1,0],
    [1,2,2,3,2,1],
    [1,2,3,3,2,1],
    [0,1,2,2,1,0],
    [0,0,1,1,0,0],
  ],
  eye_closed: [
    [0,0,0],
    [1,1,1],
    [0,0,0],
  ],

  /* ── Mouth states ─────────────────────────────────────────── */
  mouth_closed: [
    [1,1,1,1],
  ],
  mouth_open_sm: [
    [1,0,0,1],
    [1,1,1,1],
  ],
  mouth_open_lg: [
    [1,0,0,0,1],
    [1,4,4,4,1],
    [1,1,1,1,1],
  ],

  /* ── Limb segments — used to build variable-length limbs ──── */
  limb_stub: [
    [1],
    [1],
  ],
  limb_mid: [
    [1,1],
    [1,1],
    [1,1],
    [1,1],
  ],
  limb_tip: [
    [1],
    [2],
  ],
  tendril_seg: [
    [0,1,0],
    [1,1,0],
    [0,1,1],
    [1,1,0],
  ],
  spine_seg: [
    [0,1],
    [1,1],
    [0,1],
  ],

  /* ── Antlers — built from two mirrored arms ───────────────── */
  antler_base: [
    [0,1,0],
    [1,1,1],
  ],
  antler_branch: [
    [1,0,1],
    [0,1,0],
    [0,1,0],
  ],
  antler_tine: [
    [1,0],
    [1,0],
  ],

  /* ── Tail segments ────────────────────────────────────────── */
  tail_seg: [
    [1,1],
    [1,0],
  ],
  tail_tip: [
    [1],
    [2],
    [1],
  ],

  /* ── Wings / antennae ─────────────────────────────────────── */
  wing_sm: [
    [0,1,1,0],
    [1,1,1,0],
    [0,1,0,0],
  ],
  wing_lg: [
    [0,0,1,1,1,0],
    [0,1,1,1,1,0],
    [1,1,1,1,0,0],
    [0,1,1,0,0,0],
  ],
  antenna: [
    [0,1],
    [1,1],
    [0,1],
    [0,1],
    [0,2],
  ],

  /* ── Fur / texture overlays (1 pixel dots) ────────────────── */
  fur_patch: [
    [2,0,2],
    [0,2,0],
    [2,0,2],
  ],

  /* ── Habitat elements ─────────────────────────────────────── */
  sun: [
    [0,0,2,0,0],
    [0,2,2,2,0],
    [2,2,3,2,2],
    [0,2,2,2,0],
    [0,0,2,0,0],
  ],
  moon: [
    [0,1,1,0],
    [0,1,1,1],
    [0,1,1,1],
    [0,1,1,0],
  ],
  water_surface: [
    [0,1,0,0,1,0,0,1,0,0,1,0],
    [1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  water_body: [
    [1,1,1,1,1,1,1,1,1,1,1,1],
  ],
  ground_tuft: [
    [0,1,0],
    [1,1,1],
  ],
  stone_sm: [
    [0,1,1,0],
    [1,1,1,1],
    [1,1,1,1],
    [0,1,1,0],
  ],
  spark_px: [
    [0,1,0],
    [1,2,1],
    [0,1,0],
  ],
  moss_patch: [
    [1,0,1,0,1],
    [1,1,1,1,1],
  ],
  void_cloud: [
    [0,1,1,0],
    [1,1,1,1],
    [1,1,1,1],
    [0,1,1,0],
  ],
  wind_line: [
    [1,1,0,0,0],
    [0,1,1,0,0],
    [0,0,1,1,0],
    [0,0,0,1,1],
  ],
};

/* ═══════════════════════════════════════════════════════════════════
   SPECIES DEFINITIONS
   Each species defines:
     palette  — array of colors indexed by sprite values (0=transparent, 1..4)
     bodyFn   — function(growthStage 0..1) → pixel grid for base body
     appendages — ordered list of what grows and when (growthStage threshold)
     habitat  — background character: 'deep_water'|'forest'|'void'|'fog'|'dusk'|'earth'
     movement — base animation character
   ═══════════════════════════════════════════════════════════════════ */

const SPECIES_DEFS = {

  /* ── LULL — soft, hanging, luminous, jellyfish-like ─────────── */
  lull: {
    palette: [null, PAL.lull, PAL.accent2, '#c8dce8', PAL.accentDark],
    habitat: 'deep_water',
    movement: 'float',
    bodyStages: [
      /* stage 0 — birth: tiny oval */
      [
        [0,1,1,0],
        [1,1,1,1],
        [1,2,2,1],
        [0,1,1,0],
      ],
      /* stage 1 — growing */
      [
        [0,0,1,1,1,0,0],
        [0,1,1,1,1,1,0],
        [1,1,2,2,2,1,1],
        [1,1,2,3,2,1,1],
        [0,1,1,2,1,1,0],
        [0,0,1,1,1,0,0],
      ],
      /* stage 2 — mature */
      [
        [0,0,0,1,1,1,0,0,0],
        [0,0,1,1,1,1,1,0,0],
        [0,1,1,2,2,2,1,1,0],
        [1,1,2,2,3,2,2,1,1],
        [1,1,2,3,3,3,2,1,1],
        [0,1,1,2,2,2,1,1,0],
        [0,0,1,1,1,1,1,0,0],
        [0,0,0,1,1,1,0,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'tendrils',  threshold: 0.15 },
      { type: 'eye_pair',  threshold: 0.25 },
      { type: 'tendrils2', threshold: 0.55 },
      { type: 'glow',      threshold: 0.75 },
    ],
  },

  /* ── WEFT — segmented, bilateral, geometric ──────────────────── */
  weft: {
    palette: [null, PAL.weft, PAL.accent, '#b8ccb0', PAL.accentDark],
    habitat: 'forest',
    movement: 'precise',
    bodyStages: [
      [
        [0,1,1,0],
        [1,2,2,1],
        [1,2,2,1],
        [0,1,1,0],
      ],
      [
        [0,0,1,1,1,0,0],
        [0,1,2,2,2,1,0],
        [1,1,2,3,2,1,1],
        [1,1,2,3,2,1,1],
        [0,1,2,2,2,1,0],
        [0,0,1,1,1,0,0],
      ],
      [
        [0,0,0,1,1,0,0,0],
        [0,0,1,2,2,1,0,0],
        [0,1,2,2,2,2,1,0],
        [1,1,2,3,3,2,1,1],
        [1,1,2,3,3,2,1,1],
        [0,1,2,2,2,2,1,0],
        [0,0,1,2,2,1,0,0],
        [0,0,0,1,1,0,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'antennae',  threshold: 0.15 },
      { type: 'eye_pair',  threshold: 0.20 },
      { type: 'limb_pair', threshold: 0.40 },
      { type: 'limb_pair2',threshold: 0.65 },
      { type: 'wing_pair', threshold: 0.80 },
    ],
  },

  /* ── BRINE — dense, spined, watchful, pressurized ────────────── */
  brine: {
    palette: [null, PAL.brine, '#6858a0', '#382848', PAL.cold],
    habitat: 'void',
    movement: 'still_burst',
    bodyStages: [
      [
        [0,1,1,0],
        [1,3,3,1],
        [1,3,2,1],
        [0,1,1,0],
      ],
      [
        [0,1,1,1,1,0],
        [1,1,3,3,1,1],
        [1,3,3,2,3,1],
        [1,3,2,2,3,1],
        [0,1,3,3,1,0],
        [0,0,1,1,0,0],
      ],
      [
        [0,0,1,1,1,1,0,0],
        [0,1,1,3,3,1,1,0],
        [1,1,3,3,2,3,1,1],
        [1,3,3,2,2,3,3,1],
        [1,3,2,2,2,2,3,1],
        [0,1,3,3,3,3,1,0],
        [0,0,1,1,1,1,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'eye_pair',   threshold: 0.10 },
      { type: 'spines_top', threshold: 0.20 },
      { type: 'spines_side',threshold: 0.45 },
      { type: 'eye_large',  threshold: 0.60 },
      { type: 'spines_bot', threshold: 0.75 },
    ],
  },

  /* ── MURK — asymmetric, wandering, muted ─────────────────────── */
  murk: {
    palette: [null, PAL.murk, '#b0b0b0', '#505050', '#787878'],
    habitat: 'fog',
    movement: 'wander',
    bodyStages: [
      [
        [1,1,0],
        [1,2,1],
        [0,1,1],
      ],
      [
        [0,1,1,1,0],
        [1,1,2,1,0],
        [1,2,2,1,1],
        [0,1,1,2,1],
        [0,0,1,1,0],
      ],
      [
        [0,0,1,1,1,0,0],
        [0,1,1,2,1,0,0],
        [1,1,2,2,1,1,0],
        [1,2,2,3,2,1,1],
        [0,1,1,2,2,1,1],
        [0,0,1,1,2,1,0],
        [0,0,0,1,1,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'eye_offset', threshold: 0.15 },
      { type: 'limb_odd',   threshold: 0.30 },
      { type: 'tail_short', threshold: 0.50 },
      { type: 'limb_odd2',  threshold: 0.70 },
    ],
  },

  /* ── FRAY — bilateral two-half, merging, reactive ────────────── */
  fray: {
    palette: [null, PAL.fray, '#e0b888', '#a08050', PAL.accent],
    habitat: 'dusk',
    movement: 'call_response',
    bodyStages: [
      /* Two minimal forms side by side */
      [
        [1,0,1],
        [2,0,2],
        [1,0,1],
      ],
      [
        [1,1,0,1,1],
        [1,2,0,2,1],
        [1,2,1,2,1],
        [0,1,1,1,0],
      ],
      [
        [0,1,1,0,1,1,0],
        [1,1,2,1,2,1,1],
        [1,2,2,1,2,2,1],
        [1,2,2,2,2,2,1],
        [0,1,2,2,2,1,0],
        [0,0,1,1,1,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'eye_pair_split', threshold: 0.15 },
      { type: 'ear_pair',       threshold: 0.30 },
      { type: 'tail_dual',      threshold: 0.50 },
      { type: 'merge_bridge',   threshold: 0.70 },
    ],
  },

  /* ── LOAM — massive, furred, patient, antlered ───────────────── */
  loam: {
    palette: [null, PAL.loam, '#c89870', '#785838', PAL.accent],
    habitat: 'earth',
    movement: 'slow_weight',
    bodyStages: [
      [
        [0,1,0],
        [1,1,1],
        [1,2,1],
        [0,1,0],
      ],
      [
        [0,1,1,1,0],
        [1,1,2,1,1],
        [1,2,2,2,1],
        [1,2,3,2,1],
        [0,1,2,1,0],
        [0,0,1,0,0],
      ],
      [
        [0,0,1,1,1,0,0],
        [0,1,1,2,1,1,0],
        [1,1,2,2,2,1,1],
        [1,2,2,3,2,2,1],
        [1,2,3,3,3,2,1],
        [0,1,2,2,2,1,0],
        [0,0,1,2,1,0,0],
        [0,0,0,1,0,0,0],
      ],
    ],
    appendageOrder: [
      { type: 'eye_pair',    threshold: 0.15 },
      { type: 'antler_sm',   threshold: 0.25 },
      { type: 'fur_overlay', threshold: 0.40 },
      { type: 'limb_pair',   threshold: 0.55 },
      { type: 'antler_lg',   threshold: 0.70 },
      { type: 'fur_dense',   threshold: 0.85 },
    ],
  },
};

/* ═══════════════════════════════════════════════════════════════════
   HABITAT DEFINITIONS
   Each habitat: sky color rows, ground elements, object palette
   ═══════════════════════════════════════════════════════════════════ */

const HABITATS = {
  deep_water: {
    skyColor:    '#050810',
    groundColor: '#0a1220',
    waterColor:  '#1a3450',
    waterPal:    [null, PAL.lull, PAL.cold, '#3a6080'],
    skyObjects:  [],     /* no sky objects underwater */
    groundItems: [],
  },
  forest: {
    skyColor:    '#0a120a',
    groundColor: '#0d1a08',
    waterColor:  null,
    groundPal:   [null, PAL.weft, '#507840', '#304820'],
    skyObjects:  ['moon'],
    groundItems: ['ground_tuft'],
  },
  void: {
    skyColor:    '#04040a',
    groundColor: '#080814',
    waterColor:  null,
    groundPal:   [null, PAL.brine, '#2a2040', '#181428'],
    skyObjects:  [],
    groundItems: ['void_cloud'],
  },
  fog: {
    skyColor:    '#0c0c0e',
    groundColor: '#101012',
    waterColor:  null,
    groundPal:   [null, PAL.murk, '#707070', '#404040'],
    skyObjects:  [],
    groundItems: [],
  },
  dusk: {
    skyColor:    '#100808',
    groundColor: '#180c08',
    waterColor:  null,
    groundPal:   [null, PAL.fray, '#a06840', '#604828'],
    skyObjects:  ['sun'],
    groundItems: ['ground_tuft'],
  },
  earth: {
    skyColor:    '#080a06',
    groundColor: '#100e08',
    waterColor:  null,
    groundPal:   [null, PAL.loam, '#907050', '#504030'],
    skyObjects:  ['moon'],
    groundItems: ['ground_tuft', 'stone_sm'],
  },
};

/* ═══════════════════════════════════════════════════════════════════
   FOOD / OBJECT VOCABULARY
   ═══════════════════════════════════════════════════════════════════ */

export const FOOD_ITEMS = [
  {
    id: 'light',
    label: 'light',
    sprite: 'sun',
    palette: [null, '#f0e080', '#fff8a0', '#c0b040'],
    habitatPlacement: 'sky_right',
    effect(ns) {
      ns.instability = Math.min(1, ns.instability + 0.08);
      const oscs = ns.nodes.filter(n => n.type === NODE_TYPES.OSCILLATOR);
      if (oscs.length) {
        const target = oscs[Math.floor(Math.random() * oscs.length)];
        import('./network.js').then(m => m.injectNode(target.id, 0.6));
      }
    },
    affinity: ['lull', 'weft'],
    duration: 30000,
  },
  {
    id: 'water',
    label: 'water',
    sprite: 'water_surface',
    palette: [null, PAL.cold, '#a0c8e0', '#6090b0'],
    habitatPlacement: 'ground_left',
    effect(ns) {
      ns.phaseCoupling = Math.min(1, ns.phaseCoupling + 0.1);
      ns.instability   = Math.max(0, ns.instability   - 0.05);
    },
    affinity: ['lull', 'murk'],
    duration: 45000,
  },
  {
    id: 'stone',
    label: 'stone',
    sprite: 'stone_sm',
    palette: [null, '#888898', '#a0a0b0', '#606070'],
    habitatPlacement: 'ground_center',
    effect(ns) {
      ns.metabolism    = Math.max(0, ns.metabolism    - 0.06);
      ns.harmonicGravity = Math.min(1, ns.harmonicGravity + 0.08);
    },
    affinity: ['loam', 'murk'],
    duration: 60000,
  },
  {
    id: 'spark',
    label: 'spark',
    sprite: 'spark_px',
    palette: [null, PAL.warn, '#f0c080', '#c08040'],
    habitatPlacement: 'sky_random',
    effect(ns) {
      const idx = Math.floor(Math.random() * ns.nodes.length);
      import('./network.js').then(m => m.injectNode(ns.nodes[idx]?.id, 0.9));
      ns.learningRate = Math.min(1, ns.learningRate + 0.12);
    },
    affinity: ['brine', 'fray'],
    duration: 8000,
  },
  {
    id: 'void',
    label: 'void',
    sprite: 'void_cloud',
    palette: [null, '#1a1430', '#0c0c20', '#080810'],
    habitatPlacement: 'sky_left',
    effect(ns) {
      ns.recurrence  = Math.min(1, ns.recurrence  + 0.1);
      ns.envOn = false;
    },
    affinity: ['brine'],
    duration: 25000,
  },
  {
    id: 'moss',
    label: 'moss',
    sprite: 'moss_patch',
    palette: [null, '#607850', '#809060', '#405040'],
    habitatPlacement: 'ground_right',
    effect(ns) {
      ns.learningRate  = Math.max(0, ns.learningRate  - 0.08);
      ns.homeostasisOn = true;
    },
    affinity: ['loam', 'lull'],
    duration: 60000,
  },
  {
    id: 'wind',
    label: 'wind',
    sprite: 'wind_line',
    palette: [null, '#c0d0e0', '#e0eef8', '#a0b8c8'],
    habitatPlacement: 'sky_sweep',
    effect(ns) {
      ns.nodes.forEach((n, i) => {
        import('./audio-engine.js').then(m =>
          m.setNodePan(i, (Math.random() * 2 - 1))
        );
      });
      const delays = ns.nodes.filter(n => n.type === NODE_TYPES.DELAY);
      delays.forEach(n => {
        import('./network.js').then(m => m.injectNode(n.id, 0.5));
      });
    },
    affinity: ['weft', 'fray'],
    duration: 12000,
  },
];

/* ═══════════════════════════════════════════════════════════════════
   ANIMATION KEYFRAMES
   ═══════════════════════════════════════════════════════════════════ */

const ANIM = {
  /* Keyframed event response sequences */
  sequences: {
    harmonic_event: [
      { dt: 0,    bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
      { dt: 80,   bobOffset: -2,   scaleBoost: 0.04, eyeOpen: 1.2 },
      { dt: 200,  bobOffset: -1,   scaleBoost: 0.02, eyeOpen: 1.1 },
      { dt: 400,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
    ],
    phase_lock: [
      { dt: 0,    bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
      { dt: 150,  bobOffset: 1,    scaleBoost: -0.02,eyeOpen: 0.7 },
      { dt: 350,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 0.9 },
      { dt: 600,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
    ],
    startle: [
      { dt: 0,    bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
      { dt: 60,   bobOffset: -3,   scaleBoost: 0.06, eyeOpen: 1.4 },
      { dt: 180,  bobOffset: 2,    scaleBoost: -0.03,eyeOpen: 1.2 },
      { dt: 350,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
    ],
    inject: [
      { dt: 0,    bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
      { dt: 50,   bobOffset: -1,   scaleBoost: 0.03, eyeOpen: 1.1 },
      { dt: 200,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
    ],
    node_born: [
      { dt: 0,    bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.2 },
      { dt: 120,  bobOffset: -2,   scaleBoost: 0.05, eyeOpen: 1.3 },
      { dt: 400,  bobOffset: 0,    scaleBoost: 0.02, eyeOpen: 1.1 },
      { dt: 700,  bobOffset: 0,    scaleBoost: 0,    eyeOpen: 1.0 },
    ],
  },

  /* Active animation state */
  current:     null,     /* sequence name */
  startTime:   0,
  frameIdx:    0,
  state: {
    bobOffset:  0,
    scaleBoost: 0,
    eyeOpen:    1.0,
    mouthOpen:  0,
    tilt:       0,
  },
};

/* ── Fray cluster animation (independent halves) ──────────────── */
const FRAY_STATE = {
  leftOffset:  { x: 0, y: 0 },
  rightOffset: { x: 0, y: 0 },
  leftPhase:   0,
  rightPhase:  Math.PI,
};

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

let _canvas      = null;
let _ctx         = null;
let _creatureName= '';
let _speciesId   = 'lull';
let _isVisible   = false;

/* Placed habitat objects */
let _habitatObjects = [];   /* [{ item, x, y, addedAt, palette }] */

/* Phase for procedural animations */
let _breathPhase = 0;
let _idlePhase   = 0;
let _wanderX     = 0;
let _wanderY     = 0;
let _wanderVX    = 0;
let _wanderVY    = 0;

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */

export function initCreature(canvas, speciesId, creatureName) {
  _canvas       = canvas;
  _ctx          = canvas.getContext('2d');
  _speciesId    = speciesId || 'lull';
  _creatureName = creatureName || '';
  _habitatObjects = [];

  /* Wire network events to animation triggers */
  NetworkEvents.on('harmonicEvent', _onHarmonicEvent);
  NetworkEvents.on('phaseLock',     _onPhaseLock);
  NetworkEvents.on('nodeAdded',     _onNodeAdded);

  /* Build food bar UI */
  _buildFoodBar();

  /* Update name display */
  const nameEl = document.getElementById('creature-name-display');
  if (nameEl) nameEl.textContent = _creatureName
    ? _creatureName
    : '';
}

export function setCreatureName(name) {
  _creatureName = name;
  const nameEl = document.getElementById('creature-name-display');
  if (nameEl) nameEl.textContent = name;
}

export function setVisible(visible) {
  _isVisible = visible;
}

/* ═══════════════════════════════════════════════════════════════════
   FOOD BAR
   ═══════════════════════════════════════════════════════════════════ */

function _buildFoodBar() {
  const bar = document.getElementById('food-bar');
  if (!bar) return;
  bar.innerHTML = '';

  FOOD_ITEMS.forEach(item => {
    const btn = document.createElement('button');
    btn.className   = 'food-item';
    btn.title       = item.label;
    btn.textContent = item.label[0].toUpperCase();   /* single letter, no emoji */
    btn.style.cssText = `
      font-family: var(--font-mono);
      font-size: 0.6rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(7,8,11,0.7);
      border: 1px solid var(--border2);
      padding: 3px 7px;
      cursor: pointer;
      transition: all 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.color       = 'var(--accent)';
      btn.style.borderColor = 'var(--accent)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.color       = 'var(--muted)';
      btn.style.borderColor = 'var(--border2)';
    });
    btn.addEventListener('click', () => _placeItem(item));
    bar.appendChild(btn);
  });
}

function _placeItem(item) {
  /* Determine habitat placement position */
  const cw = _canvas?.width  || 700;
  const ch = _canvas?.height || 400;
  let px = cw / 2, py = ch / 2;

  switch (item.habitatPlacement) {
    case 'sky_right':   px = cw * 0.78; py = ch * 0.12; break;
    case 'sky_left':    px = cw * 0.15; py = ch * 0.10; break;
    case 'sky_random':  px = cw * (0.2 + Math.random() * 0.6); py = ch * (0.05 + Math.random() * 0.2); break;
    case 'sky_sweep':   px = cw * 0.1;  py = ch * 0.2;  break;
    case 'ground_left': px = cw * 0.12; py = ch * 0.82; break;
    case 'ground_right':px = cw * 0.82; py = ch * 0.85; break;
    case 'ground_center':px= cw * 0.5;  py = ch * 0.88; break;
  }

  /* Remove existing instance of same item */
  _habitatObjects = _habitatObjects.filter(o => o.item.id !== item.id);

  /* Add new placement */
  _habitatObjects.push({
    item,
    x: px, y: py,
    addedAt: Date.now(),
    palette: item.palette,
  });

  /* Apply network effect */
  try { item.effect(NS); } catch (e) { console.warn('[Creature] food effect:', e); }

  /* Trigger creature response */
  _triggerAnimation('inject');
}

/* Expire old habitat objects */
function _expireObjects(nowMs) {
  _habitatObjects = _habitatObjects.filter(o =>
    nowMs - o.addedAt < o.item.duration
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN DRAW — called from main.js RAF loop
   ═══════════════════════════════════════════════════════════════════ */

export function drawCreature(nowMs) {
  if (!_isVisible || !_ctx || !_canvas) return;

  const cw = _canvas.width;
  const ch = _canvas.height;

  _expireObjects(nowMs);
  _updateAnimation(nowMs);
  _updateProcedural(nowMs);

  const N       = NS.nodes.length;
  const growth  = (N - INIT_NODES) / (MAX_NODES - INIT_NODES);   /* 0..1 */
  const species = SPECIES_DEFS[_speciesId] || SPECIES_DEFS.lull;
  const habitat = HABITATS[species.habitat] || HABITATS.deep_water;

  /* ── 1. Background ────────────────────────────────────────────── */
  _drawBackground(cw, ch, habitat);

  /* ── 2. Habitat objects ───────────────────────────────────────── */
  _drawHabitatObjects(nowMs);

  /* ── 3. Creature ──────────────────────────────────────────────── */
  _drawCreatureBody(cw, ch, growth, species);
}

/* ═══════════════════════════════════════════════════════════════════
   BACKGROUND + HABITAT
   ═══════════════════════════════════════════════════════════════════ */

function _drawBackground(cw, ch, habitat) {
  const ctx = _ctx;
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, cw, ch);

  /* Sky gradient — top 65% */
  const skyH  = Math.floor(ch * 0.65);
  const skyPx = Math.ceil(cw  / PIXEL_SCALE);

  ctx.fillStyle = habitat.skyColor;
  ctx.fillRect(0, 0, cw, skyH);

  /* Ground band — bottom 35% */
  ctx.fillStyle = habitat.groundColor;
  ctx.fillRect(0, skyH, cw, ch - skyH);

  /* Water layer (habitat-specific) */
  if (habitat.waterColor) {
    /* Full water — deep_water habitat */
    ctx.fillStyle = habitat.waterColor;
    ctx.fillRect(0, 0, cw, ch);

    /* Water column depth gradient — pixel rows */
    for (let row = 0; row < Math.floor(ch / PIXEL_SCALE); row++) {
      const alpha = Math.min(0.6, row / (ch / PIXEL_SCALE) * 0.8);
      ctx.fillStyle = `rgba(10,20,40,${alpha.toFixed(2)})`;
      ctx.fillRect(0, row * PIXEL_SCALE, cw, PIXEL_SCALE);
    }
  }

  /* Default sky objects from habitat definition */
  const habitatDef = HABITATS[Object.keys(HABITATS).find(k =>
    HABITATS[k] === habitat
  )];
  if (habitat.skyObjects) {
    habitat.skyObjects.forEach(objName => {
      const sprite = SPRITES[objName];
      if (!sprite) return;
      const pal = objName === 'sun'
        ? [null, '#f0e050', '#fff8a0', '#e0c030', '#ffd060']
        : [null, '#c0c8d8', '#e0e8f0', '#9090a8'];
      const sx = cw - sprite[0].length * PIXEL_SCALE - PIXEL_SCALE * 3;
      const sy = PIXEL_SCALE * 2;
      _drawSprite(sprite, pal, sx, sy, 1, 0);
    });
  }
}

function _drawHabitatObjects(nowMs) {
  _habitatObjects.forEach(obj => {
    const sprite = SPRITES[obj.item.sprite];
    if (!sprite) return;
    const age    = nowMs - obj.addedAt;
    const fade   = Math.min(1, age / 500);
    _drawSprite(sprite, obj.palette, obj.x, obj.y, fade, 0);
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE BODY RENDERING
   ═══════════════════════════════════════════════════════════════════ */

function _drawCreatureBody(cw, ch, growth, species) {
  const energy    = getEnergyLevel();
  const animState = ANIM.state;

  /* ── Compute creature scale ──────────────────────────────────── */
  const targetScale = BIRTH_SCALE + (MAX_SCALE - BIRTH_SCALE) * growth;
  const baseH       = ch * targetScale;
  const bodySprite  = _getBodySprite(species, growth);
  const spriteH     = bodySprite.length;
  const spriteW     = bodySprite[0]?.length || 1;
  const pixelSz     = Math.max(2, Math.floor(baseH / spriteH));
  const totalScale  = pixelSz * (1 + animState.scaleBoost);

  /* ── Base position — centered, with bob and wander ───────────── */
  const isFray    = _speciesId === 'fray';
  const isMurk    = _speciesId === 'murk';

  let cx = cw / 2 + (isMurk ? _wanderX : 0);
  let cy = ch * 0.52 + animState.bobOffset * pixelSz + (isMurk ? _wanderY : 0);

  /* ── Shadow ──────────────────────────────────────────────────── */
  const shadowW = spriteW * totalScale * 0.8;
  const shadowH = pixelSz * 0.4;
  const shadowY = ch * 0.78;
  const ctx = _ctx;
  ctx.save();
  ctx.globalAlpha = 0.12 * (1 + energy * 0.3);
  ctx.fillStyle   = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, shadowY, shadowW, shadowH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (isFray) {
    _drawFrayCreature(cx, cy, growth, species, totalScale, pixelSz);
    return;
  }

  /* ── Body sprite ─────────────────────────────────────────────── */
  const bx = cx - (spriteW * totalScale) / 2;
  const by = cy - (spriteH * totalScale) / 2;
  _drawSprite(bodySprite, species.palette, bx, by, 1.0, 0, totalScale / PIXEL_SCALE);

  /* ── Appendages ──────────────────────────────────────────────── */
  _drawAppendages(species, growth, cx, cy, spriteW, spriteH, totalScale, animState);

  /* ── Energy glow ─────────────────────────────────────────────── */
  if (energy > 0.2) {
    ctx.save();
    ctx.globalAlpha = energy * 0.08;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, spriteW * totalScale * 0.9);
    grd.addColorStop(0, species.palette[2] || PAL.accent2);
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(
      cx - spriteW * totalScale,
      cy - spriteH * totalScale,
      spriteW * totalScale * 2,
      spriteH * totalScale * 2
    );
    ctx.restore();
  }
}

/* ── Fray: two bilateral halves ───────────────────────────────── */
function _drawFrayCreature(cx, cy, growth, species, totalScale, pixelSz) {
  const bodySprite  = _getBodySprite(species, growth);
  const spriteW     = bodySprite[0]?.length || 1;
  const spriteH     = bodySprite.length;

  /* Left cluster energy — nodes 0..N/2 */
  const N = NS.nodes.length;
  const half = Math.floor(N / 2);
  const leftEnergy = NS.nodes.slice(0, half).reduce((s, n) => s + n.smoothEnergy, 0) / Math.max(1, half);
  const rightEnergy= NS.nodes.slice(half).reduce((s, n) => s + n.smoothEnergy, 0) / Math.max(1, N - half);

  /* Update fray offsets */
  FRAY_STATE.leftPhase  += 0.018 * (0.5 + leftEnergy);
  FRAY_STATE.rightPhase += 0.018 * (0.5 + rightEnergy);
  const sep = pixelSz * (2 - growth * 1.5);   /* halves merge as growth increases */
  const lox = -sep + Math.sin(FRAY_STATE.leftPhase)  * pixelSz * 0.5;
  const rox =  sep + Math.sin(FRAY_STATE.rightPhase) * pixelSz * 0.5;
  const loy = Math.cos(FRAY_STATE.leftPhase)  * pixelSz * 0.3;
  const roy = Math.cos(FRAY_STATE.rightPhase) * pixelSz * 0.3;

  FRAY_STATE.leftOffset  = { x: lox, y: loy };
  FRAY_STATE.rightOffset = { x: rox, y: roy };

  /* Draw left half (slightly tinted) */
  _ctx.save();
  _ctx.globalAlpha = 0.85 + leftEnergy * 0.15;
  const lbx = cx + lox - (spriteW * totalScale) / 2;
  const lby = cy + loy - (spriteH * totalScale) / 2;
  _drawSprite(bodySprite, species.palette, lbx, lby, 1.0, 0, totalScale / PIXEL_SCALE);
  _ctx.restore();

  /* Draw right half (mirrored) */
  _ctx.save();
  _ctx.globalAlpha = 0.85 + rightEnergy * 0.15;
  const rbx = cx + rox - (spriteW * totalScale) / 2;
  const rby = cy + roy - (spriteH * totalScale) / 2;
  _drawSpriteMirrored(bodySprite, species.palette, rbx, rby, 1.0, 0, totalScale / PIXEL_SCALE);
  _ctx.restore();
}

/* ── Get body sprite for current growth stage ─────────────────── */
function _getBodySprite(species, growth) {
  const stages = species.bodyStages;
  if (!stages || stages.length === 0) return [[1]];
  const idx = growth < 0.4 ? 0 : growth < 0.75 ? 1 : 2;
  return stages[Math.min(idx, stages.length - 1)];
}

/* ── Appendage drawing ────────────────────────────────────────── */
function _drawAppendages(species, growth, cx, cy, spriteW, spriteH, totalScale, animState) {
  const order = species.appendageOrder || [];
  const ctx   = _ctx;

  /* Derived network metrics for appendage visibility */
  const inhibRatio  = _inhibitoryRatio();
  const predActivity= _predictiveActivity();
  const delayAct    = _delayActivity();
  const lockCount   = NS.phaseLockCount;
  const harmRichness= _harmonicRichness();
  const energy      = getEnergyLevel();

  order.forEach(({ type, threshold }) => {
    if (growth < threshold) return;
    const tGrowth = Math.min(1, (growth - threshold) / (1 - threshold + 0.01));

    const hw = spriteW  * totalScale / 2;
    const hh = spriteH  * totalScale / 2;
    const px  = PIXEL_SCALE;

    switch (type) {

      case 'tendrils':
      case 'tendrils2': {
        const count  = type === 'tendrils2' ? 4 : 3;
        const len    = Math.round(2 + delayAct * 4 + tGrowth * 3);
        const eyeOff = animState.eyeOpen * 0.5;
        for (let t = 0; t < count; t++) {
          const angle = (Math.PI * 0.3) + (t / (count - 1)) * (Math.PI * 0.4);
          const ox    = cx + Math.cos(angle + Math.PI) * hw;
          const oy    = cy + hh + Math.sin(Math.PI) * 2;
          _drawTendril(ox, oy, angle + Math.PI/2, len, totalScale, species.palette, eyeOff);
        }
        break;
      }

      case 'antennae': {
        const len = Math.round(2 + lockCount * 0.5 + tGrowth * 2);
        _drawSprite(SPRITES.antenna, species.palette,
          cx - hw - totalScale * 0.2, cy - hh - len * totalScale * 0.4,
          tGrowth, 0, totalScale / PIXEL_SCALE);
        _drawSpriteMirrored(SPRITES.antenna, species.palette,
          cx + hw - totalScale * 0.6, cy - hh - len * totalScale * 0.4,
          tGrowth, 0, totalScale / PIXEL_SCALE);
        break;
      }

      case 'eye_pair':
      case 'eye_pair_split': {
        const eyeSprite = predActivity > 0.4 ? SPRITES.eye_large
                        : predActivity > 0.2 ? SPRITES.eye_medium
                        : SPRITES.eye_small;
        const eyeScale  = (totalScale / PIXEL_SCALE) * animState.eyeOpen;
        const eyeOffset = type === 'eye_pair_split' ? hw * 0.3 : hw * 0.2;
        _drawSprite(eyeSprite, species.palette,
          cx - eyeOffset - eyeSprite[0].length * eyeScale / 2,
          cy - hh * 0.1,
          tGrowth, 0, eyeScale);
        _drawSprite(eyeSprite, species.palette,
          cx + eyeOffset - eyeSprite[0].length * eyeScale / 2,
          cy - hh * 0.1,
          tGrowth, 0, eyeScale);
        break;
      }

      case 'eye_offset': {
        const eyeSprite = SPRITES.eye_small;
        const eyeScale  = totalScale / PIXEL_SCALE;
        _drawSprite(eyeSprite, species.palette,
          cx - hw * 0.5, cy - hh * 0.3,
          tGrowth, 0, eyeScale * animState.eyeOpen);
        _drawSprite(eyeSprite, species.palette,
          cx + hw * 0.2, cy + hh * 0.1,
          tGrowth, 0, eyeScale * animState.eyeOpen * 0.8);
        break;
      }

      case 'eye_large': {
        const eyeScale = (totalScale / PIXEL_SCALE) * 1.2 * animState.eyeOpen;
        _drawSprite(SPRITES.eye_large, species.palette,
          cx - SPRITES.eye_large[0].length * eyeScale / 2,
          cy - hh * 0.15,
          tGrowth, 0, eyeScale);
        break;
      }

      case 'limb_pair':
      case 'limb_pair2': {
        const connStr  = _avgConnectionStrength();
        const limLen   = Math.round(1 + connStr * 3 + tGrowth * 2);
        const yOff     = type === 'limb_pair2' ? hh * 0.5 : hh * 0.0;
        _drawLimb(cx - hw, cy + yOff, -1, limLen, totalScale, species.palette);
        _drawLimb(cx + hw, cy + yOff,  1, limLen, totalScale, species.palette);
        break;
      }

      case 'limb_odd': {
        const limLen = Math.round(1 + tGrowth * 2);
        _drawLimb(cx - hw, cy - hh * 0.1, -1, limLen, totalScale, species.palette);
        _drawLimb(cx + hw * 0.3, cy + hh * 0.3, 1, limLen - 1, totalScale, species.palette);
        break;
      }

      case 'limb_odd2': {
        const limLen = Math.round(1 + tGrowth * 2);
        _drawLimb(cx + hw, cy - hh * 0.2, 1, limLen, totalScale, species.palette);
        break;
      }

      case 'spines_top': {
        const count = Math.round(2 + inhibRatio * 4 + tGrowth * 2);
        for (let s = 0; s < count; s++) {
          const sx = cx - hw * 0.7 + (s / (count - 1)) * hw * 1.4;
          const sh = Math.round(1 + inhibRatio * 2 + tGrowth) * totalScale;
          ctx.fillStyle = species.palette[2] || PAL.accent;
          ctx.fillRect(Math.round(sx), Math.round(cy - hh - sh), totalScale, sh);
        }
        break;
      }

      case 'spines_side': {
        const count = Math.round(2 + tGrowth * 3);
        [-1, 1].forEach(side => {
          for (let s = 0; s < count; s++) {
            const sy = cy - hh * 0.5 + (s / (count - 1)) * hh;
            const sl = Math.round(1 + inhibRatio * 3 + tGrowth) * totalScale;
            ctx.fillStyle = species.palette[3] || PAL.brine;
            ctx.fillRect(
              Math.round(cx + side * (hw + 1)),
              Math.round(sy),
              side * sl, totalScale
            );
          }
        });
        break;
      }

      case 'spines_bot': {
        const count = Math.round(2 + tGrowth * 3);
        for (let s = 0; s < count; s++) {
          const sx = cx - hw * 0.6 + (s / (count - 1)) * hw * 1.2;
          const sl = Math.round(1 + tGrowth * 2) * totalScale;
          ctx.fillStyle = species.palette[2] || PAL.warn;
          ctx.fillRect(Math.round(sx), Math.round(cy + hh), totalScale, sl);
        }
        break;
      }

      case 'tail_short':
      case 'tail_dual': {
        const len     = Math.round(2 + delayAct * 3 + tGrowth * 3);
        const tailOff = type === 'tail_dual' ? [-hw * 0.3, hw * 0.3] : [0];
        tailOff.forEach(xOff => {
          _drawTail(cx + xOff, cy + hh, len, totalScale, species.palette,
            _breathPhase + (xOff > 0 ? Math.PI : 0));
        });
        break;
      }

      case 'wing_pair': {
        const wingSprite = lockCount > 2 ? SPRITES.wing_lg : SPRITES.wing_sm;
        const ws         = (totalScale / PIXEL_SCALE) * (0.8 + lockCount * 0.1);
        _drawSprite(wingSprite, species.palette,
          cx - hw - wingSprite[0].length * ws * 0.6,
          cy - hh * 0.3,
          tGrowth, 0, ws);
        _drawSpriteMirrored(wingSprite, species.palette,
          cx + hw - wingSprite[0].length * ws * 0.4,
          cy - hh * 0.3,
          tGrowth, 0, ws);
        break;
      }

      case 'antler_sm':
      case 'antler_lg': {
        const branches = type === 'antler_lg'
          ? Math.round(1 + tGrowth * 3)
          : 1;
        _drawAntler(cx - hw * 0.3, cy - hh, -1, branches, totalScale, species.palette);
        _drawAntler(cx + hw * 0.3, cy - hh,  1, branches, totalScale, species.palette);
        break;
      }

      case 'fur_overlay':
      case 'fur_dense': {
        const density = type === 'fur_dense' ? 0.55 : 0.3;
        _drawFurOverlay(cx, cy, hw, hh, density, harmRichness, species.palette);
        break;
      }

      case 'ear_pair': {
        const ew = totalScale;
        const eh = totalScale * (1 + tGrowth * 1.5);
        ctx.fillStyle = species.palette[1] || PAL.fray;
        ctx.fillRect(Math.round(cx - hw - ew), Math.round(cy - hh), ew, eh);
        ctx.fillRect(Math.round(cx + hw),       Math.round(cy - hh), ew, eh);
        break;
      }

      case 'merge_bridge': {
        /* Visual bridge between Fray halves as they merge */
        const bridgeW = Math.round(tGrowth * spriteW * totalScale * 0.4);
        if (bridgeW > 0) {
          ctx.fillStyle = species.palette[3] || PAL.fray;
          ctx.fillRect(
            Math.round(cx - bridgeW / 2),
            Math.round(cy - totalScale * 0.5),
            bridgeW, totalScale
          );
        }
        break;
      }

      case 'glow': {
        /* Lull luminous glow ring */
        ctx.save();
        ctx.globalAlpha = 0.06 + energy * 0.1;
        const glowGrd = ctx.createRadialGradient(cx, cy, hw * 0.5, cx, cy, hw * 2);
        glowGrd.addColorStop(0, species.palette[3] || PAL.accent2);
        glowGrd.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGrd;
        ctx.fillRect(cx - hw * 2, cy - hw * 2, hw * 4, hw * 4);
        ctx.restore();
        break;
      }
    }
  });

  /* ── Mouth ── */
  const mouthSprite = energy > 0.5 ? SPRITES.mouth_open_lg
                    : ANIM.state.mouthOpen > 0.3 ? SPRITES.mouth_open_sm
                    : SPRITES.mouth_closed;
  const ms = totalScale / PIXEL_SCALE;
  _drawSprite(mouthSprite, species.palette,
    cx - mouthSprite[0].length * ms / 2,
    cy + hh * 0.35,
    1.0, 0, ms);
}

/* ═══════════════════════════════════════════════════════════════════
   APPENDAGE DRAW HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _drawTendril(x, y, angle, length, scale, palette, waveFactor) {
  const ctx = _ctx;
  let cx = x, cy = y;
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(_breathPhase + i * 0.8 + waveFactor) * scale * 0.5;
    const nx   = cx + Math.cos(angle + wave * 0.15) * scale;
    const ny   = cy + Math.sin(angle + wave * 0.15) * scale + wave;
    ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    ctx.fillRect(Math.round(nx), Math.round(ny), scale, scale);
    cx = nx; cy = ny;
  }
}

function _drawLimb(x, y, dir, length, scale, palette) {
  const ctx = _ctx;
  let lx = x, ly = y;
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(_breathPhase + i * 0.6) * scale * 0.3;
    ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    ctx.fillRect(Math.round(lx + wave), Math.round(ly), scale, scale);
    lx += dir * scale * 0.7;
    ly += scale * 0.8;
  }
}

function _drawTail(x, y, length, scale, palette, phase) {
  const ctx = _ctx;
  let tx = x, ty = y;
  for (let i = 0; i < length; i++) {
    const wave = Math.sin(phase + i * 0.7) * scale * (0.3 + i * 0.12);
    ctx.fillStyle = i === length - 1 ? (palette[2] || PAL.accent2) : (palette[1] || PAL.accent);
    ctx.fillRect(Math.round(tx + wave), Math.round(ty), scale, scale);
    ty += scale * 0.9;
  }
}

function _drawAntler(x, y, dir, branches, scale, palette) {
  const ctx = _ctx;
  /* Main stalk */
  let ax = x, ay = y;
  const stalkLen = 2 + branches;
  for (let i = 0; i < stalkLen; i++) {
    ctx.fillStyle = palette[1] || PAL.loam;
    ctx.fillRect(Math.round(ax), Math.round(ay - i * scale), scale, scale);
  }
  /* Branches */
  for (let b = 0; b < branches; b++) {
    const bx = ax + dir * scale * (b + 1);
    const by = ay - (b + 1) * scale;
    ctx.fillStyle = palette[2] || PAL.accent;
    ctx.fillRect(Math.round(bx), Math.round(by), scale, scale);
    ctx.fillRect(Math.round(bx), Math.round(by - scale), scale, scale);
  }
}

function _drawFurOverlay(cx, cy, hw, hh, density, richness, palette) {
  const ctx   = _ctx;
  const count = Math.round(density * 20 + richness * 10);
  ctx.fillStyle = palette[2] || PAL.accent2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * hw * 0.8;
    const fx    = cx + Math.cos(angle) * r;
    const fy    = cy + Math.sin(angle) * r * 0.7;
    ctx.fillRect(Math.round(fx), Math.round(fy), 2, 2);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   PIXEL SPRITE RENDERER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Draw a pixel sprite.
 * @param {Array} sprite  2D array of palette indices
 * @param {Array} palette Color array [null, color1, color2, ...]
 * @param {number} x      Top-left x in canvas pixels
 * @param {number} y      Top-left y in canvas pixels
 * @param {number} alpha  Global alpha 0..1
 * @param {number} _      Unused (future: rotation)
 * @param {number} scale  Pixels per sprite pixel (default PIXEL_SCALE)
 */
function _drawSprite(sprite, palette, x, y, alpha, _, scale) {
  if (!sprite || !_ctx) return;
  const ps  = scale ?? PIXEL_SCALE;
  const ctx = _ctx;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha ?? 1));
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const v = sprite[row][col];
      if (v === 0) continue;
      const color = palette[v] || PAL.accent;
      ctx.fillStyle = color;
      ctx.fillRect(
        Math.round(x + col * ps),
        Math.round(y + row * ps),
        Math.max(1, Math.floor(ps)),
        Math.max(1, Math.floor(ps))
      );
    }
  }
  ctx.restore();
}

function _drawSpriteMirrored(sprite, palette, x, y, alpha, _, scale) {
  if (!sprite || !_ctx) return;
  const mirrored = sprite.map(row => [...row].reverse());
  _drawSprite(mirrored, palette, x, y, alpha, _, scale);
}

/* ═══════════════════════════════════════════════════════════════════
   ANIMATION SYSTEM
   ═══════════════════════════════════════════════════════════════════ */

function _triggerAnimation(name) {
  const seq = ANIM.sequences[name];
  if (!seq) return;
  ANIM.current   = name;
  ANIM.startTime = Date.now();
  ANIM.frameIdx  = 0;
}

function _updateAnimation(nowMs) {
  if (!ANIM.current) {
    /* Procedural idle — reset toward defaults */
    ANIM.state.scaleBoost = ANIM.state.scaleBoost * 0.92;
    ANIM.state.eyeOpen    = ANIM.state.eyeOpen * 0.95 + 1.0 * 0.05;
    ANIM.state.mouthOpen  = ANIM.state.mouthOpen * 0.9;
    return;
  }

  const seq     = ANIM.sequences[ANIM.current];
  const elapsed = nowMs - ANIM.startTime;
  const last    = seq[seq.length - 1];

  if (elapsed >= last.dt) {
    /* Sequence complete */
    ANIM.current  = null;
    ANIM.frameIdx = 0;
    return;
  }

  /* Interpolate between frames */
  let frameA = seq[0], frameB = seq[1];
  for (let i = 0; i < seq.length - 1; i++) {
    if (elapsed >= seq[i].dt && elapsed < seq[i + 1].dt) {
      frameA = seq[i];
      frameB = seq[i + 1];
      break;
    }
  }

  const t = (elapsed - frameA.dt) / Math.max(1, frameB.dt - frameA.dt);
  ANIM.state.bobOffset  = frameA.bobOffset  + (frameB.bobOffset  - frameA.bobOffset)  * t;
  ANIM.state.scaleBoost = frameA.scaleBoost + (frameB.scaleBoost - frameA.scaleBoost) * t;
  ANIM.state.eyeOpen    = frameA.eyeOpen    + (frameB.eyeOpen    - frameA.eyeOpen)    * t;
}

function _updateProcedural(nowMs) {
  const metabolism = NS.metabolism ?? 0.4;
  const energy     = getEnergyLevel();

  /* Breathing */
  _breathPhase += 0.012 * (0.5 + metabolism * 1.5);

  /* Idle curiosity */
  _idlePhase += 0.005;
  if (Math.random() < 0.002 && !ANIM.current) {
    ANIM.state.eyeOpen = 0.6 + Math.random() * 0.4;   /* blink */
  }

  /* Mouth opens with energy */
  ANIM.state.mouthOpen = Math.max(ANIM.state.mouthOpen * 0.95, energy * 0.8);

  /* Bob offset from breathing (base) */
  if (!ANIM.current) {
    ANIM.state.bobOffset = Math.sin(_breathPhase) * (0.5 + energy * 0.5);
  }

  /* Wander (Murk only) */
  if (_speciesId === 'murk') {
    _wanderVX += (Math.random() - 0.5) * 0.4;
    _wanderVY += (Math.random() - 0.5) * 0.2;
    _wanderVX *= 0.96;
    _wanderVY *= 0.96;
    _wanderX  += _wanderVX;
    _wanderY  += _wanderVY;
    /* Soft boundary */
    const cw = _canvas?.width  || 700;
    const ch = _canvas?.height || 400;
    if (Math.abs(_wanderX) > cw * 0.2) _wanderVX *= -0.5;
    if (Math.abs(_wanderY) > ch * 0.12) _wanderVY *= -0.5;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK METRIC HELPERS
   ═══════════════════════════════════════════════════════════════════ */

function _inhibitoryRatio() {
  const total = NS.edges.length;
  if (!total) return 0;
  const inhib = NS.edges.filter(e => e.weight < 0).length;
  return inhib / total;
}

function _predictiveActivity() {
  const preds = NS.nodes.filter(n => n.type === NODE_TYPES.PREDICTIVE);
  if (!preds.length) return 0;
  return preds.reduce((s, n) => s + n.smoothEnergy, 0) / preds.length;
}

function _delayActivity() {
  const delays = NS.nodes.filter(n => n.type === NODE_TYPES.DELAY);
  if (!delays.length) return 0;
  return delays.reduce((s, n) => s + n.smoothEnergy, 0) / delays.length;
}

function _avgConnectionStrength() {
  if (!NS.edges.length) return 0;
  return NS.edges.reduce((s, e) => s + Math.abs(e.weight), 0) / NS.edges.length;
}

function _harmonicRichness() {
  /* Approximated by number of phase locks and distinct active freq bands */
  return Math.min(1, NS.totalPhaseLocks / 10 + _avgConnectionStrength() * 0.5);
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT HANDLERS
   ═══════════════════════════════════════════════════════════════════ */

function _onHarmonicEvent({ isBass }) {
  _triggerAnimation(isBass ? 'harmonic_event' : 'inject');
}

function _onPhaseLock() {
  _triggerAnimation('phase_lock');
}

function _onNodeAdded() {
  _triggerAnimation('node_born');
}

/* Public trigger for predictive node startle (called from main.js) */
export function triggerStartle() {
  _triggerAnimation('startle');
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS
   ═══════════════════════════════════════════════════════════════════ */

export function getCreatureName() { return _creatureName; }
export function getSpeciesId()    { return _speciesId; }
export function setSpeciesId(id)  { _speciesId = id; }
