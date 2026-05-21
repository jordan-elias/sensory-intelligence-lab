/**
 * neural-synthesis/main.js
 *
 * Coordination layer. Owns:
 *   - DOMContentLoaded initialisation sequence
 *   - requestAnimationFrame loop
 *   - Canvas rendering (network view)
 *   - Canvas event handling (click, drag, right-click, touch)
 *   - UI wiring (buttons, sliders, tabs, toggles)
 *   - Species selection and field guide rendering
 *   - Creature view toggle
 *   - Elapsed timer
 *   - Weight matrix display
 *   - Node tooltip and panel
 *   - Context menu
 *   - Keyboard shortcuts
 *   - Auto-save coordination
 *
 * Import graph (no circular dependencies):
 *   main.js
 *     ← audio-engine.js
 *     ← network.js
 *     ← harmonic.js
 *     ← creature.js
 *     ← persistence.js
 */

import {
  start         as audioStart,
  stop          as audioStop,
  setVolume,
  setParam      as audioSetParam,
  setEnvironmentActive,
  isRunning     as audioIsRunning,
  initBuffers,
} from './audio-engine.js';

import {
  NS,
  SPECIES,
  NODE_TYPES,
  TYPE_NAMES,
  TYPE_SYMBOLS,
  NetworkEvents,
  buildNetwork,
  reset         as networkReset,
  tick          as networkTick,
  applyForces,
  setParam      as networkSetParam,
  addEdge,
  removeEdge,
  severNode,
  injectNode,
  mutate,
  rewire,
  getNodeAt,
  getWeightMatrix,
  getSpecializationLabel,
  edgeExists,
  applyBiography,
  getBiographySnapshot,
  MAX_NODES,
  INIT_NODES,
} from './network.js';

import {
  initHarmonic,
  harmonicTick,
  syncNodes     as harmonicSyncNodes,
  exciteNode,
  getGlideState,
  getDominantInterval,
  getFieldRoot,
} from './harmonic.js';

import {
  initCreature,
  drawCreature,
  setCreatureName,
  setSpeciesId  as creatureSetSpecies,
  setVisible    as creatureSetVisible,
  triggerStartle,
  getCreatureName,
  FOOD_ITEMS,
} from './creature.js';

import {
  loadInstrument,
  createInstrument,
  beginSession,
  endSession,
  autoSave,
  saveCreatureName,
  renderHistoryTab,
  clearHistory,
  getSleepLabel,
  isFirstSession,
} from './persistence.js';

/* ═══════════════════════════════════════════════════════════════════
   CANVAS + RENDERING STATE
   ═══════════════════════════════════════════════════════════════════ */

let _canvas, _ctx;
let _creatureCanvas;
let _timelineCanvas, _tlCtx;
let _matrixCanvas,   _matrixCtx;

let _animFrame  = null;
let _idleFrame  = null;

/* Node interaction */
let _dragNode       = null;
let _shiftFrom      = null;   /* node id for shift+drag connect */
let _mouseX         = 0;
let _mouseY         = 0;
let _listenNodeId   = null;   /* node being auditioned in isolation */

/* Timeline ring buffer */
let _tlHistory      = [];
const TL_MAX        = 600;   /* samples (~60s at 10 fps) */

/* Fur noise seed — stable per frame */
let _furSeed        = 0;

/* Creature view state */
let _creatureMode   = false;

/* View ready flags */
let _speciesSelected = false;
let _networkBuilt    = false;

/* ═══════════════════════════════════════════════════════════════════
   NODE VISUAL CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const NODE_R        = 20;
const NODE_SYMBOLS  = TYPE_SYMBOLS;

const TYPE_HUE = {
  0: 165,   /* oscillator  — teal */
  1: 195,   /* filter      — blue-teal */
  2: 285,   /* nonlinear   — purple */
  3: 35,    /* delay       — amber */
  4: 315,   /* predictive  — magenta */
  5: 120,   /* environment — green */
};

/* ═══════════════════════════════════════════════════════════════════
   ELAPSED TIMER
   ═══════════════════════════════════════════════════════════════════ */

let _elapsedTimer = null;

function _startTimer() {
  NS.startTime = Date.now();
  _elapsedTimer = setInterval(() => {
    const s   = Math.floor((Date.now() - NS.startTime) / 1000);
    const h   = Math.floor(s / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const str = `${_pad(h)}:${_pad(m)}:${_pad(sec)}`;
    _setText('hdr-elapsed', str);
    _dot(true);
  }, 1000);
}

function _stopTimer() {
  clearInterval(_elapsedTimer);
  _elapsedTimer = null;
  _setText('hdr-elapsed', '00:00:00');
  _dot(false);
}

function _pad(n) { return n < 10 ? '0' + n : String(n); }
function _dot(live) {
  const el = document.getElementById('hdr-dot');
  if (el) el.className = 'header-time-dot' + (live ? ' live' : '');
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN LOOP
   ═══════════════════════════════════════════════════════════════════ */

function _loop(ts) {
  if (!NS.isRunning) return;

  const now = Date.now();

  /* Network state tick (Hebbian, phase coupling, homeostasis) */
  networkTick(now, _canvas.width);

  /* Harmonic event system */
  harmonicTick(now);

  /* Force layout */
  applyForces(_canvas.width, _canvas.height, _dragNode);

  /* Auto-save */
  autoSave(now);

  /* Draw */
  if (_creatureMode) {
    _drawCreatureFrame(ts);
  } else {
    _drawNetworkFrame(ts);
  }

  _drawTimeline();
  _updateStatusBar();
  _updateNodePanel();
  _updateMatrixDisplay();

  if (NS.hoveredNode !== null) _positionTooltip(_mouseX, _mouseY);

  _animFrame = requestAnimationFrame(_loop);
}

function _idleLoop(ts) {
  applyForces(
    _canvas?.width  || 700,
    _canvas?.height || 420,
    _dragNode
  );
  if (_creatureMode) {
    _drawCreatureFrame(ts);
  } else {
    _drawNetworkFrame(ts);
  }
  _idleFrame = requestAnimationFrame(_idleLoop);
}

function _stopIdleLoop() {
  if (_idleFrame) { cancelAnimationFrame(_idleFrame); _idleFrame = null; }
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK CANVAS RENDERING
   ═══════════════════════════════════════════════════════════════════ */

function _drawNetworkFrame(ts) {
  if (!_ctx || !_canvas) return;
  const W = _canvas.width, H = _canvas.height;

  _ctx.clearRect(0, 0, W, H);
  _ctx.fillStyle = '#07080b';
  _ctx.fillRect(0, 0, W, H);

  /* Edges */
  NS.edges.forEach(e => _drawEdge(e));

  /* Shift+drag preview */
  if (_shiftFrom !== null) {
    const fromN = NS.nodes.find(n => n.id === _shiftFrom);
    if (fromN) {
      _ctx.beginPath();
      _ctx.setLineDash([4, 5]);
      _ctx.strokeStyle = 'rgba(125,181,160,0.35)';
      _ctx.lineWidth   = 1.5;
      _ctx.moveTo(fromN.x, fromN.y);
      _ctx.lineTo(_mouseX, _mouseY);
      _ctx.stroke();
      _ctx.setLineDash([]);
    }
  }

  /* Nodes */
  NS.nodes.forEach(n => _drawNode(n, ts));

  /* Phase lock arcs */
  NS.nodes.forEach(n => {
    if (!n.phaseLocked || n.lockPartner < 0) return;
    const partner = NS.nodes.find(p => p.id === n.lockPartner);
    if (!partner) return;
    const mx = (n.x + partner.x) / 2;
    const my = (n.y + partner.y) / 2;
    const r  = Math.hypot(n.x - partner.x, n.y - partner.y) / 2;
    _ctx.beginPath();
    _ctx.arc(mx, my, r, 0, Math.PI * 2);
    _ctx.strokeStyle = 'rgba(125,181,160,0.12)';
    _ctx.lineWidth   = 1;
    _ctx.setLineDash([2, 7]);
    _ctx.stroke();
    _ctx.setLineDash([]);
  });

  /* Listen mode overlay — dim everything except listened node */
  if (_listenNodeId !== null) {
    _ctx.fillStyle = 'rgba(7,8,11,0.68)';
    _ctx.fillRect(0, 0, W, H);
    const ln = NS.nodes.find(n => n.id === _listenNodeId);
    if (ln) _drawNode(ln, ts, true);
  }

  _ctx.textAlign     = 'left';
  _ctx.textBaseline  = 'alphabetic';
}

function _drawEdge(e) {
  const a = NS.nodes.find(n => n.id === e.from);
  const b = NS.nodes.find(n => n.id === e.to);
  if (!a || !b) return;

  const sig     = Math.min(1, Math.abs(e.signalHistory) * 2.8);
  const wt      = Math.abs(e.weight);
  const excite  = e.weight > 0;

  const alpha = 0.06 + sig * 0.72;
  const r = excite ? 80  + sig * 55  : 180 + sig * 55;
  const g = excite ? 160 + sig * 50  : 90  + sig * 35;
  const bl= excite ? 130 + sig * 35  : 55  + sig * 20;

  _ctx.beginPath();
  _ctx.strokeStyle = `rgba(${~~r},${~~g},${~~bl},${alpha.toFixed(2)})`;
  _ctx.lineWidth   = 0.5 + wt * 1.6 + sig * 1.4;

  /* Curved edge */
  const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.16;
  const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.16;
  _ctx.moveTo(a.x, a.y);
  _ctx.quadraticCurveTo(mx, my, b.x, b.y);
  _ctx.stroke();

  /* Arrowhead at ~75% along curve */
  const t  = 0.75;
  const ax = (1-t)*(1-t)*a.x + 2*(1-t)*t*mx + t*t*b.x;
  const ay = (1-t)*(1-t)*a.y + 2*(1-t)*t*my + t*t*b.y;
  const tx = 2*(1-t)*(mx-a.x) + 2*t*(b.x-mx);
  const ty = 2*(1-t)*(my-a.y) + 2*t*(b.y-my);
  const ang= Math.atan2(ty, tx);
  const as = 4 + sig * 2.5;

  _ctx.beginPath();
  _ctx.fillStyle = `rgba(${~~r},${~~g},${~~bl},${(alpha*0.8).toFixed(2)})`;
  _ctx.moveTo(ax + Math.cos(ang)*as,       ay + Math.sin(ang)*as);
  _ctx.lineTo(ax + Math.cos(ang+2.5)*as*.5,ay + Math.sin(ang+2.5)*as*.5);
  _ctx.lineTo(ax + Math.cos(ang-2.5)*as*.5,ay + Math.sin(ang-2.5)*as*.5);
  _ctx.closePath();
  _ctx.fill();

  /* Signal pulse dot */
  if (sig > 0.14) {
    const pt = ((Date.now() * 0.0008) % 1);
    const px = (1-pt)*(1-pt)*a.x + 2*(1-pt)*pt*mx + pt*pt*b.x;
    const py = (1-pt)*(1-pt)*a.y + 2*(1-pt)*pt*my + pt*pt*b.y;
    _ctx.beginPath();
    _ctx.arc(px, py, 1.8 + sig * 1.8, 0, Math.PI * 2);
    _ctx.fillStyle = `rgba(${~~r},${~~g},${~~bl},${(0.35 + sig*0.5).toFixed(2)})`;
    _ctx.fill();
  }

  /* Weight label if edge touches selected node */
  if (NS.selectedNode !== null &&
      (e.from === NS.selectedNode || e.to === NS.selectedNode)) {
    _ctx.fillStyle  = 'rgba(99,102,120,0.7)';
    _ctx.font       = '9px DM Mono, monospace';
    _ctx.textAlign  = 'center';
    _ctx.fillText(e.weight.toFixed(2), mx, my);
    _ctx.textAlign  = 'left';
  }
}

function _drawNode(n, ts, forceHighlight = false) {
  const hue  = TYPE_HUE[n.type] ?? 165;
  const amp  = Math.min(1, n.smoothEnergy);
  const flash= n._flash || 0;

  const selected = NS.selectedNode === n.id || forceHighlight;
  const hovered  = NS.hoveredNode  === n.id;
  const r        = NODE_R + amp * 5 + flash * 7;

  /* Phase lock ring */
  if (n.phaseLocked) {
    _ctx.beginPath();
    _ctx.arc(n.x, n.y, r + 7, 0, Math.PI * 2);
    _ctx.strokeStyle = 'rgba(125,181,160,0.18)';
    _ctx.lineWidth   = 1;
    _ctx.stroke();
  }

  /* Glow */
  if (amp > 0.08 || flash > 0) {
    const grd = _ctx.createRadialGradient(n.x, n.y, r * 0.25, n.x, n.y, r + 14);
    grd.addColorStop(0, `hsla(${hue},45%,55%,${(amp*0.14+flash*0.28).toFixed(2)})`);
    grd.addColorStop(1, 'transparent');
    _ctx.beginPath();
    _ctx.arc(n.x, n.y, r + 14, 0, Math.PI * 2);
    _ctx.fillStyle = grd;
    _ctx.fill();
  }

  /* Clip to node circle for waveform */
  _ctx.save();
  _ctx.beginPath();
  _ctx.arc(n.x, n.y, r - 1, 0, Math.PI * 2);
  _ctx.clip();

  /* Node fill */
  const sat  = 14 + amp * 24;
  const lgt  = selected ? 28 : 20 - amp * 7;
  _ctx.fillStyle = `hsl(${hue},${sat}%,${lgt}%)`;
  _ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);

  /* Waveform history */
  if (amp > 0.02) {
    _ctx.beginPath();
    _ctx.strokeStyle = `hsla(${hue},50%,60%,${(0.28+amp*0.5).toFixed(2)})`;
    _ctx.lineWidth   = 1;
    const len = n.history.length;
    for (let i = 0; i < len; i++) {
      const hx  = n.x - r + (i / len) * r * 2;
      const val = n.history[(n.histIdx + i) % len];
      const hy  = n.y + val * (r * 0.52);
      i === 0 ? _ctx.moveTo(hx, hy) : _ctx.lineTo(hx, hy);
    }
    _ctx.stroke();
  }

  _ctx.restore();

  /* Node border */
  _ctx.beginPath();
  _ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  if (selected) {
    _ctx.strokeStyle = 'rgba(125,181,160,0.9)';
    _ctx.lineWidth   = 2;
  } else if (hovered) {
    _ctx.strokeStyle = `hsla(${hue},40%,55%,0.6)`;
    _ctx.lineWidth   = 1.5;
  } else {
    const borderAlpha = 0.28 + amp * 0.42;
    _ctx.strokeStyle  = `hsla(${hue},25%,${34+amp*18}%,${borderAlpha})`;
    _ctx.lineWidth    = 1 + amp;
  }
  _ctx.stroke();

  /* Type symbol */
  const symAlpha = selected ? 0.9 : 0.6 + amp * 0.3;
  _ctx.fillStyle    = selected
    ? 'rgba(166,208,190,0.9)'
    : `hsla(${hue},35%,${58+amp*20}%,${symAlpha})`;
  _ctx.font         = `bold ${9 + amp * 2}px Syne, sans-serif`;
  _ctx.textAlign    = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.fillText(NODE_SYMBOLS[n.type] || '○', n.x, n.y - 2);

  /* Node id */
  _ctx.fillStyle    = 'rgba(99,102,120,0.5)';
  _ctx.font         = '7px DM Mono, monospace';
  _ctx.fillText(String(n.id), n.x, n.y + 9);

  _ctx.textAlign    = 'left';
  _ctx.textBaseline = 'alphabetic';
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE FRAME
   ═══════════════════════════════════════════════════════════════════ */

function _drawCreatureFrame(ts) {
  _furSeed = Math.floor(ts / 500);   /* stable fur seed, changes every 0.5s */
  drawCreature(Date.now());
}

/* ═══════════════════════════════════════════════════════════════════
   TIMELINE
   ═══════════════════════════════════════════════════════════════════ */

function _drawTimeline() {
  if (!_tlCtx || !_timelineCanvas) return;
  const W = _timelineCanvas.width;
  const H = _timelineCanvas.height;

  _tlHistory.push({
    energy: NS.energyLevel,
    locks:  NS.phaseLockCount,
  });
  if (_tlHistory.length > TL_MAX) _tlHistory.shift();

  _tlCtx.clearRect(0, 0, W, H);
  _tlCtx.fillStyle = '#0d0f17';
  _tlCtx.fillRect(0, 0, W, H);

  if (_tlHistory.length < 2) return;

  /* Energy fill */
  _tlCtx.beginPath();
  _tlHistory.forEach((pt, i) => {
    const x = (i / TL_MAX) * W;
    const y = H - pt.energy * (H - 3) - 1;
    i === 0 ? _tlCtx.moveTo(x, H) : void 0;
    _tlCtx.lineTo(x, y);
  });
  _tlCtx.lineTo((_tlHistory.length / TL_MAX) * W, H);
  _tlCtx.closePath();
  _tlCtx.fillStyle = 'rgba(58,117,96,0.16)';
  _tlCtx.fill();

  /* Energy line */
  _tlCtx.beginPath();
  _tlCtx.strokeStyle = 'rgba(125,181,160,0.48)';
  _tlCtx.lineWidth   = 1.5;
  _tlHistory.forEach((pt, i) => {
    const x = (i / TL_MAX) * W;
    const y = H - pt.energy * (H - 3) - 1;
    i === 0 ? _tlCtx.moveTo(x, y) : _tlCtx.lineTo(x, y);
  });
  _tlCtx.stroke();

  /* Phase lock markers */
  _tlHistory.forEach((pt, i) => {
    if (pt.locks > 0) {
      _tlCtx.fillStyle = 'rgba(125,181,160,0.28)';
      _tlCtx.fillRect((i / TL_MAX) * W, 0, 1.5, H);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   WEIGHT MATRIX DISPLAY
   ═══════════════════════════════════════════════════════════════════ */

function _updateMatrixDisplay() {
  if (!_matrixCtx) return;
  /* Only redraw if matrix tab is active — expensive */
  const matTab = document.querySelector('.mode-tab[data-tab="matrix"]');
  if (!matTab?.classList.contains('active')) return;

  const { W, N } = getWeightMatrix();
  if (N === 0) return;

  const cell  = Math.floor(240 / N);
  const total = cell * N;
  _matrixCanvas.width  = total;
  _matrixCanvas.height = total;

  _matrixCtx.fillStyle = '#07080b';
  _matrixCtx.fillRect(0, 0, total, total);

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const w   = W[i * N + j];
      const abs = Math.min(1, Math.abs(w));
      let r, g, b;
      if (w > 0) {
        r = 75;  g = ~~(75  + abs * 145); b = 95;
      } else if (w < 0) {
        r = ~~(95 + abs * 145); g = 65; b = 55;
      } else {
        r = 18; g = 18; b = 24;
      }
      _matrixCtx.fillStyle = `rgb(${r},${g},${b})`;
      _matrixCtx.fillRect(j * cell, i * cell, cell - 1, cell - 1);
      if (i === j) {
        _matrixCtx.strokeStyle = 'rgba(99,102,120,0.25)';
        _matrixCtx.lineWidth   = 0.5;
        _matrixCtx.strokeRect(j * cell, i * cell, cell - 1, cell - 1);
      }
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════════ */

function _updateStatusBar() {
  _setText('st-state',    NS.isRunning ? 'running' : 'idle');
  _setText('st-nodes',    String(NS.nodes.length));
  _setText('st-conns',    String(NS.edges.length));
  _setText('st-locks',    String(NS.totalPhaseLocks));
  _setText('st-harmonic', NS.dominantHarmonic ?? '—');

  /* Biography */
  const bio = NS.biography;
  if (bio) {
    const sleep = getSleepLabel(bio.lastSessionAt);
    _setText('st-memory', sleep);
    const ageSecs  = NS.elapsedMs ? Math.floor(NS.elapsedMs / 1000) : 0;
    _setText('st-age', ageSecs > 0 ? `${_pad(Math.floor(ageSecs/60))}:${_pad(ageSecs%60)}` : '—');
  } else {
    _setText('st-memory', 'first awakening');
    _setText('st-age',    '—');
  }

  /* Energy fill */
  const ef = document.getElementById('energy-fill');
  if (ef) ef.style.width = (NS.energyLevel * 100).toFixed(1) + '%';
}

/* ═══════════════════════════════════════════════════════════════════
   NODE TOOLTIP
   ═══════════════════════════════════════════════════════════════════ */

let _tooltip;

function _showTooltip(n, mx, my) {
  if (!_tooltip) return;
  _setText('tt-name',   `node ${n.id}`);
  _setText('tt-type',   TYPE_NAMES[n.type] ?? '—');
  _setText('tt-freq',   n.type === NODE_TYPES.OSCILLATOR
    ? (n.freq?.toFixed(1) + ' Hz') : '—');
  _setText('tt-energy', n.smoothEnergy.toFixed(3));
  _setText('tt-phase',  n.phaseLocked
    ? `locked (n${n.lockPartner})`
    : (n.phase % (Math.PI * 2)).toFixed(2) + ' rad');
  const ins  = NS.edges.filter(e => e.to   === n.id).length;
  const outs = NS.edges.filter(e => e.from === n.id).length;
  _setText('tt-conns',  `${ins} in · ${outs} out`);
  _setText('tt-desc',   _typeDesc(n.type));
  _tooltip.classList.add('visible');
  _positionTooltip(mx, my);
}

function _positionTooltip(mx, my) {
  if (!_tooltip?.classList.contains('visible')) return;
  const W  = _canvas.width, H = _canvas.height;
  const tw = _tooltip.offsetWidth  || 210;
  const th = _tooltip.offsetHeight || 130;
  let tx   = mx + 16, ty = my - 10;
  if (tx + tw > W - 6) tx = mx - tw - 16;
  if (ty + th > H - 6) ty = H - th - 6;
  if (ty < 6)          ty = 6;
  _tooltip.style.left = tx + 'px';
  _tooltip.style.top  = ty + 'px';
}

function _hideTooltip() {
  if (_tooltip) _tooltip.classList.remove('visible');
  NS.hoveredNode = null;
}

function _typeDesc(type) {
  const d = [
    'Self-generating tone. Drifts toward harmonic partials.',
    'Shapes incoming signal. Cutoff driven by signal strength.',
    'Nonlinear waveshaper. Creates harmonics through transformation.',
    'Ring buffer. Delay time attracted to endogenous rhythm.',
    'Counter-voice. Outputs the inverse of its prediction.',
    'Listens to the room. Routes microphone input into the network.',
  ];
  return d[type] ?? '—';
}

/* ═══════════════════════════════════════════════════════════════════
   NODE PANEL
   ═══════════════════════════════════════════════════════════════════ */

function _updateNodePanel() {
  if (NS.selectedNode === null) return;
  const n = NS.nodes.find(nd => nd.id === NS.selectedNode);
  if (!n) { _hideNodePanel(); return; }

  _setText('np-type',   TYPE_NAMES[n.type] ?? '—');
  _setText('np-freq',   n.type === NODE_TYPES.OSCILLATOR
    ? n.freq?.toFixed(1) + ' Hz' : '—');
  _setText('np-phase',  (n.phase % (Math.PI * 2)).toFixed(3) + ' rad');
  _setText('np-energy', n.smoothEnergy.toFixed(4));
  _setText('np-output', n.output.toFixed(4));
  _setText('np-act',    n.activation ?? '—');
  _setText('np-spec',   getSpecializationLabel(n));
  _setText('np-locked', n.locked ? 'yes' : 'no');
  _setText('np-desc',   _typeDesc(n.type));

  /* Connection chips */
  const ins  = NS.edges.filter(e => e.to   === n.id);
  const outs = NS.edges.filter(e => e.from === n.id);

  const inEl  = document.getElementById('np-ins');
  const outEl = document.getElementById('np-outs');

  if (inEl) inEl.innerHTML = ins.length
    ? ins.map(e => `<span class="conn-chip ${e.weight>0?'excite':'inhibit'}"
        data-from="${e.from}" data-to="${e.to}">n${e.from} ${e.weight.toFixed(2)}</span>`).join('')
    : '<span style="font-size:.62rem;color:var(--dim)">none</span>';

  if (outEl) outEl.innerHTML = outs.length
    ? outs.map(e => `<span class="conn-chip ${e.weight>0?'excite':'inhibit'}"
        data-from="${e.from}" data-to="${e.to}">n${e.to} ${e.weight.toFixed(2)}</span>`).join('')
    : '<span style="font-size:.62rem;color:var(--dim)">none</span>';
}

function _showNodePanel(n) {
  const panel = document.getElementById('node-panel');
  if (panel) panel.classList.add('visible');
  _updateNodePanel();

  /* Enable panel action buttons */
  ['np-btn-listen','np-btn-isolate','np-btn-inject'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !NS.isRunning;
  });
}

function _hideNodePanel() {
  const panel = document.getElementById('node-panel');
  if (panel) panel.classList.remove('visible');
  NS.selectedNode = null;
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════════ */

let _ctxMenu;
let _ctxNodeId = -1;

function _showCtxMenu(n, cx, cy) {
  _ctxNodeId = n.id;
  _setText('ctx-node-label', `node ${n.id} · ${TYPE_NAMES[n.type]}`);
  _ctxMenu.style.left = Math.min(cx, window.innerWidth  - 195) + 'px';
  _ctxMenu.style.top  = Math.min(cy, window.innerHeight - 270) + 'px';
  _ctxMenu.classList.add('visible');
}

function _hideCtxMenu() {
  if (_ctxMenu) _ctxMenu.classList.remove('visible');
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS EVENTS
   ═══════════════════════════════════════════════════════════════════ */

function _initCanvasEvents() {
  const wrap = document.getElementById('canvas-wrap');

  /* ── Mouse ──────────────────────────────────────────────────── */
  _canvas.addEventListener('mousedown', e => {
    if (e.button === 2) return;
    const { x, y } = _canvasXY(e);
    const n = getNodeAt(x, y);
    if (n) {
      e.shiftKey ? (_shiftFrom = n.id) : (_dragNode = n);
    }
  });

  _canvas.addEventListener('mousemove', e => {
    const { x, y } = _canvasXY(e);
    _mouseX = x; _mouseY = y;

    if (_dragNode) {
      _dragNode.x  = x;
      _dragNode.y  = y;
      _dragNode.vx = 0;
      _dragNode.vy = 0;
      _hideTooltip();
      return;
    }
    if (_shiftFrom !== null) return;

    const n = getNodeAt(x, y);
    if (n) {
      NS.hoveredNode = n.id;
      _showTooltip(n, x, y);
      _canvas.style.cursor = 'pointer';
    } else {
      _hideTooltip();
      _canvas.style.cursor = NS.anchorMode ? 'default' : 'crosshair';
    }
  });

  _canvas.addEventListener('mouseup', e => {
    if (_shiftFrom !== null) {
      const { x, y } = _canvasXY(e);
      const n = getNodeAt(x, y);
      if (n && n.id !== _shiftFrom) {
        addEdge(_shiftFrom, n.id, 0.22 + Math.random() * 0.28);
        NetworkEvents.emit('emergence', { text: `connection drawn · ${_shiftFrom} → ${n.id}` });
      }
      _shiftFrom = null;
      return;
    }
    _dragNode = null;
  });

  _canvas.addEventListener('click', e => {
    if (_shiftFrom !== null) return;
    const { x, y } = _canvasXY(e);
    const n = getNodeAt(x, y);
    _hideCtxMenu();

    if (n) {
      NS.selectedNode = n.id;
      _showNodePanel(n);
      if (NS.isRunning) {
        injectNode(n.id);
        exciteNode(n.id);
      }
    } else {
      _hideNodePanel();
    }
  });

  _canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const { x, y } = _canvasXY(e);
    const n = getNodeAt(x, y);
    if (n) {
      NS.selectedNode = n.id;
      _showCtxMenu(n, e.clientX, e.clientY);
    }
  });

  _canvas.addEventListener('mouseleave', () => {
    _hideTooltip();
    _dragNode = null;
  });

  /* ── Touch ──────────────────────────────────────────────────── */
  _canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const { x, y } = _touchXY(e);
    _mouseX = x; _mouseY = y;
    const n = getNodeAt(x, y);
    if (n) _dragNode = n;
  }, { passive: false });

  _canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const { x, y } = _touchXY(e);
    _mouseX = x; _mouseY = y;
    if (_dragNode) {
      _dragNode.x  = x;
      _dragNode.y  = y;
      _dragNode.vx = 0;
      _dragNode.vy = 0;
    }
  }, { passive: false });

  _canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const { x, y } = _touchXY(e, true);
    if (!_dragNode) {
      const n = getNodeAt(x, y);
      if (n) {
        NS.selectedNode = n.id;
        _showNodePanel(n);
        if (NS.isRunning) { injectNode(n.id); exciteNode(n.id); }
      } else {
        _hideNodePanel();
      }
    }
    _dragNode = null;
  }, { passive: false });

  /* Dismiss context menu on outside click */
  document.addEventListener('click', e => {
    if (!e.target.closest('#ctx-menu')) _hideCtxMenu();
  });
}

function _canvasXY(e) {
  const r = _canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function _touchXY(e, changed = false) {
  const touches = changed ? e.changedTouches : e.touches;
  const r = _canvas.getBoundingClientRect();
  return {
    x: touches[0].clientX - r.left,
    y: touches[0].clientY - r.top,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS RESIZE
   ═══════════════════════════════════════════════════════════════════ */

function _resizeCanvases() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap || !_canvas) return;
  _canvas.width          = wrap.clientWidth;
  _canvas.height         = wrap.clientHeight;
  _creatureCanvas.width  = wrap.clientWidth;
  _creatureCanvas.height = wrap.clientHeight;

  const tlWrap = document.getElementById('timeline-canvas')?.parentElement;
  if (tlWrap && _timelineCanvas) {
    _timelineCanvas.width  = tlWrap.clientWidth;
    _timelineCanvas.height = 48;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SPECIES GRID
   ═══════════════════════════════════════════════════════════════════ */

function _buildSpeciesGrid() {
  const grid = document.getElementById('species-grid');
  if (!grid) return;
  grid.innerHTML = '';

  SPECIES.forEach(sp => {
    const card = document.createElement('div');
    card.className = 'species-card';
    card.dataset.id = sp.id;
    card.style.setProperty('--species-color', sp.color);

    card.innerHTML = `
      <span class="species-name">${sp.name}</span>
      <div class="species-tagline">${sp.tagline}</div>
      <div class="species-guide">
        ${sp.guide.map(g => `<span>${g}</span>`).join('')}
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.species-card')
        .forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      _selectSpecies(sp.id);
    });

    grid.appendChild(card);
  });
}

function _selectSpecies(speciesId) {
  _speciesSelected = true;
  NS.currentSpecies = SPECIES.find(s => s.id === speciesId);
  creatureSetSpecies(speciesId);

  /* Apply species parameters */
  const sp = NS.currentSpecies;
  if (!sp) return;

  const paramMap = {
    instability:    sp.instability,
    recurrence:     sp.recurrence,
    saturation:     sp.saturation,
    metabolism:     sp.metabolism,
    learningRate:   sp.lrate,
    phaseCoupling:  sp.coupling,
    harmonicGravity:sp.hgravity,
  };

  Object.entries(paramMap).forEach(([key, val]) => {
    networkSetParam(key, val);
    const sliderKey = {
      instability:    's-instability',
      recurrence:     's-recurrence',
      saturation:     's-saturation',
      metabolism:     's-metabolism',
      learningRate:   's-lrate',
      phaseCoupling:  's-coupling',
      harmonicGravity:'s-hgravity',
    }[key];
    if (sliderKey) {
      const el = document.getElementById(sliderKey);
      if (el) el.value = val;
    }
    const valKey = {
      instability:    'v-instability',
      recurrence:     'v-recurrence',
      saturation:     'v-saturation',
      metabolism:     'v-metabolism',
      learningRate:   'v-lrate',
      phaseCoupling:  'v-coupling',
      harmonicGravity:'v-hgravity',
    }[key];
    if (valKey) _setText(valKey, Math.round(val * 100) + '%');
  });

  /* Rebuild network with new species if already built */
  if (_networkBuilt) {
    networkReset(speciesId, _canvas.width, _canvas.height);
    initHarmonic();
    harmonicSyncNodes();
    _tlHistory = [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT MENU WIRING
   ═══════════════════════════════════════════════════════════════════ */

function _wireCtxMenu() {
  _bind('ctx-inject', () => {
    if (_ctxNodeId >= 0) { injectNode(_ctxNodeId); exciteNode(_ctxNodeId); }
    _hideCtxMenu();
  });

  _bind('ctx-listen', () => {
    if (_ctxNodeId >= 0) {
      _listenNodeId = _listenNodeId === _ctxNodeId ? null : _ctxNodeId;
      const overlay = document.getElementById('listen-overlay');
      if (overlay) overlay.classList.toggle('active', _listenNodeId !== null);
    }
    _hideCtxMenu();
  });

  _bind('ctx-isolate', () => {
    if (_ctxNodeId >= 0) {
      const n = NS.nodes.find(nd => nd.id === _ctxNodeId);
      if (n) n.isolated = !n.isolated;
    }
    _hideCtxMenu();
  });

  /* Type change */
  const typeMap = {
    'ctx-to-osc':       NODE_TYPES.OSCILLATOR,
    'ctx-to-filter':    NODE_TYPES.FILTER,
    'ctx-to-nl':        NODE_TYPES.NONLINEAR,
    'ctx-to-delay':     NODE_TYPES.DELAY,
    'ctx-to-predictive':NODE_TYPES.PREDICTIVE,
  };
  Object.entries(typeMap).forEach(([btnId, type]) => {
    _bind(btnId, () => {
      const n = NS.nodes.find(nd => nd.id === _ctxNodeId);
      if (n) {
        n.type = type;
        import('./audio-engine.js').then(m => m.setNodeTypes(NS.nodes.map(nd => nd.type)));
        NetworkEvents.emit('emergence', { text: `node ${n.id} → ${TYPE_NAMES[type]}` });
      }
      _hideCtxMenu();
    });
  });

  _bind('ctx-lock', () => {
    const n = NS.nodes.find(nd => nd.id === _ctxNodeId);
    if (n) n.locked = !n.locked;
    _hideCtxMenu();
  });

  _bind('ctx-sever', () => {
    if (_ctxNodeId >= 0) severNode(_ctxNodeId);
    _hideCtxMenu();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   EMERGENCE LOG
   ═══════════════════════════════════════════════════════════════════ */

function _initEmergenceLog() {
  const log = document.getElementById('emergence-log');
  if (!log) return;

  NetworkEvents.on('emergence', ({ text }) => {
    const note = document.createElement('div');
    note.className   = 'emergence-note';
    note.textContent = text;
    log.appendChild(note);
    while (log.children.length > 4) log.removeChild(log.firstChild);
    setTimeout(() => {
      note.classList.add('fade');
      setTimeout(() => note.parentNode?.removeChild(note), 600);
    }, 4200);
  });

  /* Also trigger creature startle on predictive node surprise */
  NetworkEvents.on('harmonicEvent', ({ nodeId }) => {
    const n = NS.nodes.find(nd => nd.id === nodeId);
    if (n?.type === NODE_TYPES.PREDICTIVE) triggerStartle();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   TRANSPORT
   ═══════════════════════════════════════════════════════════════════ */

async function _startNetwork() {
  if (NS.isRunning) {
    /* Toggle off */
    _stopNetwork();
    return;
  }

  /* Build network if not yet built */
  if (!_networkBuilt) {
    const speciesId = NS.currentSpecies?.id || 'lull';
    buildNetwork(speciesId, _canvas.width, _canvas.height);
    initHarmonic();
    harmonicSyncNodes();
    _networkBuilt = true;
  }

  /* Start audio */
  initBuffers();
  await audioStart(NS.volume ?? 0.7);

  NS.isRunning = true;

  _stopIdleLoop();
  _startTimer();

  /* Initial energy injection */
  setTimeout(() => {
    injectNode(NS.nodes[0]?.id ?? 0);
    if (NS.nodes.length > 2) {
      setTimeout(() => injectNode(NS.nodes[2]?.id ?? 2), 700);
    }
  }, 900);

  /* Session in persistence */
  await beginSession();

  /* Update transport button */
  const btn = document.getElementById('btn-start');
  if (btn) { btn.textContent = 'stop'; btn.classList.add('active'); }

  document.getElementById('btn-mutate')?.removeAttribute('disabled');
  document.getElementById('btn-rewire')?.removeAttribute('disabled');
  document.getElementById('btn-anchor')?.removeAttribute('disabled');
  document.getElementById('btn-view-toggle')?.removeAttribute('disabled');
  document.getElementById('np-btn-listen')?.removeAttribute('disabled');
  document.getElementById('np-btn-isolate')?.removeAttribute('disabled');
  document.getElementById('np-btn-inject')?.removeAttribute('disabled');

  _animFrame = requestAnimationFrame(_loop);
  NetworkEvents.emit('emergence', { text: 'network started — listening' });
}

function _stopNetwork() {
  if (!NS.isRunning) return;
  NS.isRunning = false;

  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

  audioStop();
  _stopTimer();

  /* Persist session end asynchronously */
  endSession().catch(e => console.warn('[Main] endSession:', e));

  const btn = document.getElementById('btn-start');
  if (btn) { btn.textContent = 'start'; btn.classList.remove('active'); }

  document.getElementById('btn-mutate')?.setAttribute('disabled', '');
  document.getElementById('btn-rewire')?.setAttribute('disabled', '');

  const ef = document.getElementById('energy-fill');
  if (ef) ef.style.width = '0%';

  _updateStatusBar();
  _idleFrame = requestAnimationFrame(_idleLoop);
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE NAMING MODAL
   ═══════════════════════════════════════════════════════════════════ */

function _showNameModal() {
  const modal = document.getElementById('name-modal');
  if (modal) modal.classList.add('visible');
  const input = document.getElementById('creature-name-input');
  if (input) setTimeout(() => input.focus(), 100);
}

function _hideNameModal() {
  const modal = document.getElementById('name-modal');
  if (modal) modal.classList.remove('visible');
}

function _wireNameModal() {
  const confirm = document.getElementById('btn-name-confirm');
  const input   = document.getElementById('creature-name-input');
  if (!confirm || !input) return;

  const _doConfirm = async () => {
    const name = input.value.trim() || 'unnamed';
    _hideNameModal();
    setCreatureName(name);
    await saveCreatureName(name);
    NetworkEvents.emit('emergence', { text: `${name} awakens` });
    /* Now start the network proper */
    await _startNetwork();
  };

  confirm.addEventListener('click', _doConfirm);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') _doConfirm();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION SEQUENCE
   ═══════════════════════════════════════════════════════════════════ */

async function _init() {
  /* Grab canvas references */
  _canvas         = document.getElementById('ns-canvas');
  _creatureCanvas = document.getElementById('creature-canvas');
  _timelineCanvas = document.getElementById('timeline-canvas');
  _matrixCanvas   = document.getElementById('weight-matrix');
  _tooltip        = document.getElementById('node-tooltip');
  _ctxMenu        = document.getElementById('ctx-menu');

  _ctx       = _canvas.getContext('2d');
  _tlCtx     = _timelineCanvas.getContext('2d');
  _matrixCtx = _matrixCanvas.getContext('2d');

  _resizeCanvases();
  window.addEventListener('resize', () => {
    _resizeCanvases();
    if (!NS.isRunning) _drawNetworkFrame(0);
  });

  /* Load biography from Supabase */
  const loaded = await loadInstrument();

  if (loaded) {
    /* Returning user — apply priors and skip naming */
    NS.biography = {
      lastSessionAt: loaded.lastSessionAt,
    };
    setCreatureName(loaded.creatureName || '');
    creatureSetSpecies(loaded.speciesId || 'lull');

    /* Pre-select species card */
    const matchCard = document.querySelector(
      `.species-card[data-id="${loaded.speciesId}"]`
    );
    if (matchCard) {
      matchCard.classList.add('selected');
      _selectSpecies(loaded.speciesId);
    }

    /* Update memory label */
    _setText('st-memory', loaded.sleepLabel);
  }

  /* Init creature canvas */
  initCreature(
    _creatureCanvas,
    loaded?.speciesId || NS.currentSpecies?.id || 'lull',
    loaded?.creatureName || ''
  );

  /* Build species grid */
  _buildSpeciesGrid();

  /* Init emergence log listener */
  _initEmergenceLog();

  /* Canvas events */
  _initCanvasEvents();

  /* Context menu */
  _wireCtxMenu();

  /* Name modal */
  _wireNameModal();

  /* ── Buttons ──────────────────────────────────────────────────── */
  _bind('btn-start', async () => {
    if (isFirstSession() && !getCreatureName()) {
      /* First ever session — need species selected and naming */
      if (!_speciesSelected) {
        /* Navigate to species tab */
        document.querySelector('.mode-tab[data-tab="species"]')?.click();
        NetworkEvents.emit('emergence', { text: 'choose a species first' });
        return;
      }
      /* Create instrument record then show naming modal */
      await createInstrument(
        NS.currentSpecies?.id || 'lull',
        ''
      );
      _showNameModal();
    } else {
      await _startNetwork();
    }
  });

  _bind('btn-mutate', () => { if (NS.isRunning) mutate(); });
  _bind('btn-rewire', () => { if (NS.isRunning) rewire(); });

  _bind('btn-reset', () => {
    const sid = NS.currentSpecies?.id || 'lull';
    if (NS.isRunning) _stopNetwork();
    setTimeout(() => {
      networkReset(sid, _canvas.width, _canvas.height);
      initHarmonic();
      harmonicSyncNodes();
      _tlHistory = [];
      _networkBuilt = true;
      _idleFrame = requestAnimationFrame(_idleLoop);
    }, 300);
  });

  /* Anchor toggle */
  _bind('btn-anchor', () => {
    NS.anchorMode = !NS.anchorMode;
    document.getElementById('btn-anchor')?.classList.toggle('on', NS.anchorMode);
    const ind = document.getElementById('anchor-indicator');
    if (ind) ind.classList.toggle('visible', NS.anchorMode);
    const hint = document.getElementById('canvas-hint');
    if (hint) hint.textContent = NS.anchorMode
      ? 'anchor mode — drag nodes to position — proximity affects coupling'
      : 'right-click node · shift+drag to connect · click to inject · drag to move';
  });

  /* Creature view toggle */
  _bind('btn-view-toggle', () => {
    _creatureMode = !_creatureMode;
    const wrap = document.getElementById('canvas-wrap');
    if (wrap) wrap.classList.toggle('creature-mode', _creatureMode);
    creatureSetVisible(_creatureMode);
    const btn = document.getElementById('btn-view-toggle');
    if (btn) {
      btn.textContent = _creatureMode ? 'network' : 'creature';
      btn.classList.toggle('on', _creatureMode);
    }
    const hint = document.getElementById('canvas-hint');
    if (hint) hint.style.display = _creatureMode ? 'none' : '';
  });

  /* Node panel actions */
  _bind('np-btn-listen', () => {
    if (NS.selectedNode === null) return;
    _listenNodeId = _listenNodeId === NS.selectedNode ? null : NS.selectedNode;
    const overlay = document.getElementById('listen-overlay');
    if (overlay) overlay.classList.toggle('active', _listenNodeId !== null);
  });

  _bind('np-btn-isolate', () => {
    if (NS.selectedNode === null) return;
    const n = NS.nodes.find(nd => nd.id === NS.selectedNode);
    if (n) n.isolated = !n.isolated;
  });

  _bind('np-btn-inject', () => {
    if (NS.selectedNode !== null && NS.isRunning) {
      injectNode(NS.selectedNode);
      exciteNode(NS.selectedNode);
    }
  });

  /* History clear */
  _bind('btn-clear-history', async () => {
    await clearHistory();
    const el = document.getElementById('history-log');
    if (el) el.innerHTML = '<span style="color:var(--dim)">History cleared.</span>';
  });

  /* ── Tabs ─────────────────────────────────────────────────────── */
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab')
        .forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content')
        .forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      const content = document.getElementById('tab-' + tab.dataset.tab);
      if (content) content.style.display = 'block';
      /* Load history on demand */
      if (tab.dataset.tab === 'history') renderHistoryTab();
    });
  });

  /* ── Sliders ──────────────────────────────────────────────────── */
  function _slider(id, valId, key, fmt, onchange) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      networkSetParam(key, v);
      _setText(valId, fmt(v));
      if (onchange) onchange(v);
    });
  }

  const pct = v => Math.round(v * 100) + '%';

  _slider('s-instability', 'v-instability', 'instability', pct,
    v => audioSetParam('instability', v));
  _slider('s-recurrence',  'v-recurrence',  'recurrence',  pct,
    v => audioSetParam('recurrence',  v));
  _slider('s-saturation',  'v-saturation',  'saturation',  pct,
    v => audioSetParam('saturation',  v));
  _slider('s-lrate',       'v-lrate',       'learningRate',pct);
  _slider('s-coupling',    'v-coupling',    'phaseCoupling',pct);
  _slider('s-hgravity',    'v-hgravity',    'harmonicGravity',pct);
  _slider('s-metabolism',  'v-metabolism',  'metabolism',  pct,
    v => audioSetParam('metabolism',  v));

  document.getElementById('s-volume')?.addEventListener('input', function () {
    const v = parseFloat(this.value);
    NS.volume = v;
    setVolume(v);
    _setText('v-volume', pct(v));
  });

  /* ── Learning toggles ─────────────────────────────────────────── */
  function _toggle(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      NS[key] = !NS[key];
      el.classList.toggle('on', NS[key]);
    });
  }

  _toggle('tog-hebbian',    'hebbianOn');
  _toggle('tog-drift',      'driftOn');
  _toggle('tog-homeostasis','homeostasisOn');
  _toggle('tog-depression', 'depressionOn');
  _toggle('tog-pruning',    'pruningOn');
  _toggle('tog-predictive', 'predictiveOn');
  _toggle('tog-fast',       'fastOn');
  _toggle('tog-medium',     'mediumOn');
  _toggle('tog-slow',       'slowOn');

  /* Environment node toggle */
  const envToggle = document.getElementById('tog-env');
  if (envToggle) {
    envToggle.addEventListener('click', async () => {
      NS.envOn = !NS.envOn;
      envToggle.classList.toggle('on', NS.envOn);
      await setEnvironmentActive(NS.envOn);
      NetworkEvents.emit('emergence', {
        text: NS.envOn ? 'environment node active — listening' : 'environment node off',
      });
    });
  }

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && NS.isRunning && !e.repeat) {
      e.preventDefault();
      const idx = Math.floor(Math.random() * NS.nodes.length);
      const n   = NS.nodes[idx];
      if (n) { injectNode(n.id); exciteNode(n.id); }
    }
    if (e.code === 'KeyM' && NS.isRunning && !e.repeat) mutate();
    if (e.code === 'KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey) {
      document.getElementById('btn-reset')?.click();
    }
    if (e.code === 'Escape') {
      _hideCtxMenu();
      _listenNodeId = null;
      const overlay = document.getElementById('listen-overlay');
      if (overlay) overlay.classList.remove('active');
    }
  });

  /* ── Initial idle render ──────────────────────────────────────── */
  /* Build default network (lull) for visual */
  if (!_networkBuilt) {
    buildNetwork('lull', _canvas.width, _canvas.height);
    initHarmonic();
    harmonicSyncNodes();
    _networkBuilt = true;
  }

  _updateStatusBar();
  _idleFrame = requestAnimationFrame(_idleLoop);
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _bind(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', _init);
