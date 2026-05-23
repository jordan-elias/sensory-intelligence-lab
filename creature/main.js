/**
 * neural-synthesis/main.js
 *
 * Coordination layer.
 *
 * Page states:
 *   'gate'     — first screen shown on load. Two sub-states:
 *                  'picker'  — returning user sees saved sessions
 *                  'species' — new user (or fresh start) sees species selector
 *   'naming'   — creature naming modal visible
 *   'running'  — network active, controls visible, species selector hidden
 *   'stopped'  — network stopped, controls visible, species selector hidden
 *
 * On DOMContentLoaded:
 *   1. Show gate (blank canvas, no network)
 *   2. Auth resolves → check for existing instruments
 *   3a. Instruments found → show session picker in gate
 *   3b. No instruments → show species selector in gate
 *   4. User selects session → load and go to 'stopped' state
 *      User selects species → go to 'naming'
 *      User starts fresh from picker → go to species selector
 *   5. User names creature → go to 'stopped', build network, idle loop
 *   6. Start button → 'running'
 *   7. Stop (start toggle) → 'stopped'
 *
 * Species tab is removed from controls once a species is committed.
 * Environment node mic toggle lives in the node panel (not learning tab).
 */

import {
  initAudio,
  start         as audioStart,
  stop          as audioStop,
  setVolume,
  setParam      as audioSetParam,
  setEnvironmentActive,
  isMicActive,
  isRunning     as audioIsRunning,
} from './audio-engine.js';

import {
  NS,
  SPECIES,
  NODE_TYPES,
  TYPE_NAMES,
  TYPE_SYMBOLS,
  NetworkEvents,
  buildNetwork,
  instantiateAudio,
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
  exciteNodeHarmonic,
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
  ENV_ITEMS,
} from './creature.js';

import {
  loadInstrument,
  loadAllInstruments,
  createInstrument,
  beginSession,
  endSession,
  autoSave,
  saveCreatureName,
  renderHistoryTab,
  clearHistory,
  getSleepLabel,
  hasInstrument,
} from './persistence.js';

/* ═══════════════════════════════════════════════════════════════════
   CANVAS REFERENCES
   ═══════════════════════════════════════════════════════════════════ */

let _canvas, _ctx;
let _creatureCanvas;
let _timelineCanvas, _tlCtx;
let _matrixCanvas,   _matrixCtx;

let _animFrame  = null;
let _idleFrame  = null;

/* ═══════════════════════════════════════════════════════════════════
   INTERACTION STATE
   ═══════════════════════════════════════════════════════════════════ */

let _dragNode   = null;
let _shiftFrom  = null;
let _mouseX     = 0;
let _mouseY     = 0;
let _listenNodeId = null;
let _creatureMode = false;
let _tooltip;
let _ctxMenu;
let _ctxNodeId  = -1;

/* ═══════════════════════════════════════════════════════════════════
   PAGE STATE
   ═══════════════════════════════════════════════════════════════════ */

let _pageState  = 'gate';   /* 'gate' | 'naming' | 'stopped' | 'running' */
let _networkBuilt = false;

/* ═══════════════════════════════════════════════════════════════════
   TIMELINE
   ═══════════════════════════════════════════════════════════════════ */

let _tlHistory  = [];
const TL_MAX    = 600;

/* ═══════════════════════════════════════════════════════════════════
   NODE VISUAL CONFIG
   ═══════════════════════════════════════════════════════════════════ */

const NODE_R   = 20;
const TYPE_HUE = { 0:165, 1:195, 2:285, 3:35, 4:315, 5:120 };

/* ═══════════════════════════════════════════════════════════════════
   ELAPSED TIMER
   ═══════════════════════════════════════════════════════════════════ */

let _elapsedTimer = null;

function _startTimer() {
  NS.startTime  = Date.now();
  _elapsedTimer = setInterval(() => {
    const s   = Math.floor((Date.now() - NS.startTime) / 1000);
    const str = `${_pad(Math.floor(s/3600))}:${_pad(Math.floor((s%3600)/60))}:${_pad(s%60)}`;
    _setText('hdr-elapsed', str);
    const dot = document.getElementById('hdr-dot');
    if (dot) dot.className = 'header-time-dot live';
  }, 1000);
}

function _stopTimer() {
  clearInterval(_elapsedTimer);
  _elapsedTimer = null;
  _setText('hdr-elapsed', '00:00:00');
  const dot = document.getElementById('hdr-dot');
  if (dot) dot.className = 'header-time-dot';
}

function _pad(n) { return n < 10 ? '0' + n : String(n); }

/* ═══════════════════════════════════════════════════════════════════
   GATE — first screen
   ═══════════════════════════════════════════════════════════════════ */

function _showGate() {
  const gate = document.getElementById('gate-screen');
  if (gate) gate.style.display = 'flex';
  const card = document.getElementById('main-card');
  if (card) card.style.display = 'none';
}

function _hideGate() {
  const gate = document.getElementById('gate-screen');
  if (gate) gate.style.display = 'none';
  const card = document.getElementById('main-card');
  if (card) card.style.display = 'block';
}

async function _initGate() {
  _showGate();

  /* Wait for auth */
  const userId = await new Promise(resolve => {
    if (window._currentUser?.id) { resolve(window._currentUser.id); return; }
    window.addEventListener('authReady', e => resolve(e.detail?.user?.id ?? null), { once: true });
    setTimeout(() => resolve(null), 10000);
  });

  if (!userId) {
    _showSpeciesSelector();
    return;
  }

  /* Check for existing instruments */
  const instruments = await loadAllInstruments();

  if (instruments.length > 0) {
    _showSessionPicker(instruments);
  } else {
    _showSpeciesSelector();
  }
}

/* ── Session picker ─────────────────────────────────────────────── */

function _showSessionPicker(instruments) {
  const gateContent = document.getElementById('gate-content');
  if (!gateContent) return;

  const html = `
    <div style="max-width:520px;width:100%;padding:0 1rem">
      <div style="
        font-family:var(--font-body);
        font-size:clamp(1.2rem,3vw,1.75rem);
        font-weight:300;font-style:italic;
        color:var(--text);margin-bottom:0.5rem;letter-spacing:-0.01em
      ">Welcome back.</div>
      <div style="
        font-family:var(--font-mono);font-size:0.68rem;
        color:var(--muted);margin-bottom:2rem;line-height:1.7
      ">Your instruments are waiting.</div>

      <div id="session-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:1.5rem">
        ${instruments.map(inst => `
          <div class="session-card" data-id="${inst.id}" data-species="${inst.speciesId}" style="
            background:var(--surface);
            border:1px solid var(--border);
            padding:0.85rem 1.1rem;
            cursor:pointer;
            transition:border-color 0.15s,background 0.15s;
            display:flex;align-items:center;justify-content:space-between;gap:1rem;
          ">
            <div>
              <div style="
                font-family:var(--font-ui);font-size:0.8rem;font-weight:600;
                color:var(--text);margin-bottom:3px;letter-spacing:0.04em
              ">${_esc(inst.creatureName)}</div>
              <div style="
                font-family:var(--font-mono);font-size:0.6rem;color:var(--muted)
              ">${inst.speciesId} · ${_fmtRuntime(inst.totalRuntimeS)} · ${inst.sessionCount} session${inst.sessionCount !== 1 ? 's' : ''}</div>
            </div>
            <div style="
              font-family:var(--font-mono);font-size:0.58rem;
              color:var(--muted);text-align:right;line-height:1.6
            ">${inst.sleepLabel}</div>
          </div>
        `).join('')}
      </div>

      <button id="btn-fresh-start" style="
        font-family:var(--font-mono);font-size:0.62rem;letter-spacing:0.08em;
        text-transform:uppercase;color:var(--dim);background:transparent;
        border:none;cursor:pointer;padding:4px 0;
        transition:color 0.15s;
      ">or start fresh with a new species</button>
    </div>
  `;

  gateContent.innerHTML = html;

  /* Wire session cards */
  gateContent.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--accent)';
      card.style.background  = 'var(--accent-glow)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border)';
      card.style.background  = 'var(--surface)';
    });
    card.addEventListener('click', async () => {
      const id      = card.dataset.id;
      const species = card.dataset.species;
      await _loadExistingSession(id, species);
    });
  });

  /* Fresh start */
  document.getElementById('btn-fresh-start')?.addEventListener('click', () => {
    _showSpeciesSelector();
  });
  document.getElementById('btn-fresh-start')?.addEventListener('mouseenter', function() {
    this.style.color = 'var(--accent)';
  });
  document.getElementById('btn-fresh-start')?.addEventListener('mouseleave', function() {
    this.style.color = 'var(--dim)';
  });
}

async function _loadExistingSession(instrumentId, speciesId) {
  const result = await loadInstrument(instrumentId);
  if (!result) return;

  /* Apply species */
  _commitSpecies(result.speciesId || speciesId);
  setCreatureName(result.creatureName || '');

  _setText('st-memory', result.sleepLabel);
  _hideGate();
  _transitionToStopped();
}

/* ── Species selector ───────────────────────────────────────────── */

function _showSpeciesSelector() {
  const gateContent = document.getElementById('gate-content');
  if (!gateContent) return;

  const cards = SPECIES.map(sp => `
    <div class="gate-species-card" data-id="${sp.id}" style="
      --species-color:${sp.color};
      background:var(--bg);
      border:1px solid var(--border);
      padding:0.85rem 1rem;
      cursor:pointer;
      transition:border-color 0.15s,background 0.15s;
      position:relative;overflow:hidden;
    ">
      <div style="
        position:absolute;top:0;left:0;width:2px;height:100%;
        background:var(--species-color);
        opacity:0;transition:opacity 0.15s;
      " class="species-bar"></div>
      <div style="
        font-family:var(--font-ui);font-size:0.78rem;font-weight:600;
        letter-spacing:0.06em;
        color:${sp.color};
        margin-bottom:0.28rem
      ">${sp.name}</div>
      <div style="
        font-family:var(--font-body);font-size:0.7rem;
        color:var(--muted);font-style:italic;
        line-height:1.45;margin-bottom:0.5rem
      ">${sp.tagline}</div>
      <div style="
        font-family:var(--font-mono);font-size:0.58rem;
        color:var(--dim);line-height:1.65;
        padding-top:0.5rem;border-top:1px solid var(--border)
      ">
        ${sp.guide.map(g => `<div style="display:flex;gap:6px">
          <span style="color:${sp.color};opacity:0.6">—</span>
          <span>${g}</span>
        </div>`).join('')}
      </div>
    </div>
  `).join('');

  gateContent.innerHTML = `
    <div style="max-width:760px;width:100%;padding:0 1rem">
      <div style="
        font-family:var(--font-body);
        font-size:clamp(1.2rem,3vw,1.75rem);
        font-weight:300;font-style:italic;
        color:var(--text);margin-bottom:0.5rem;letter-spacing:-0.01em
      ">Choose a species.</div>
      <div style="
        font-family:var(--font-mono);font-size:0.68rem;
        color:var(--muted);margin-bottom:2rem;line-height:1.7
      ">This determines your creature's character, sonic tendencies, and the kind of network it grows into. It cannot be changed once chosen.</div>
      <div style="
        display:grid;
        grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
        gap:8px;
      ">
        ${cards}
      </div>
    </div>
  `;

  gateContent.querySelectorAll('.gate-species-card').forEach(card => {
    const bar = card.querySelector('.species-bar');
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = `var(--species-color, var(--accent))`;
      card.style.background  = 'rgba(255,255,255,0.018)';
      if (bar) bar.style.opacity = '1';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--border)';
      card.style.background  = 'var(--bg)';
      if (bar) bar.style.opacity = '0';
    });
    card.addEventListener('click', async () => {
      const id = card.dataset.id;
      _commitSpecies(id);
      /* Create instrument record */
      await createInstrument(id, '');
      _showNamingModal();
    });
  });
}

/* ── Commit species — applies params, sets up creature ─────────── */

function _commitSpecies(speciesId) {
  const sp = SPECIES.find(s => s.id === speciesId);
  if (!sp) return;
  NS.currentSpecies = sp;
  creatureSetSpecies(speciesId);

  const params = {
    instability:    sp.instability,
    recurrence:     sp.recurrence,
    saturation:     sp.saturation,
    metabolism:     sp.metabolism,
    learningRate:   sp.lrate,
    phaseCoupling:  sp.coupling,
    harmonicGravity:sp.hgravity,
  };

  Object.entries(params).forEach(([key, val]) => {
    networkSetParam(key, val);
    _syncSlider(key, val);
  });
}

function _syncSlider(key, val) {
  const idMap = {
    instability:    ['s-instability','v-instability'],
    recurrence:     ['s-recurrence', 'v-recurrence'],
    saturation:     ['s-saturation', 'v-saturation'],
    metabolism:     ['s-metabolism', 'v-metabolism'],
    learningRate:   ['s-lrate',      'v-lrate'],
    phaseCoupling:  ['s-coupling',   'v-coupling'],
    harmonicGravity:['s-hgravity',   'v-hgravity'],
  };
  const [sliderId, valId] = idMap[key] || [];
  if (sliderId) {
    const el = document.getElementById(sliderId);
    if (el) el.value = val;
  }
  if (valId) _setText(valId, Math.round(val * 100) + '%');
}

/* ═══════════════════════════════════════════════════════════════════
   NAMING MODAL
   ═══════════════════════════════════════════════════════════════════ */

function _showNamingModal() {
  const modal = document.getElementById('name-modal');
  if (modal) modal.classList.add('visible');
  const input = document.getElementById('creature-name-input');
  if (input) setTimeout(() => input.focus(), 80);
}

function _hideNamingModal() {
  const modal = document.getElementById('name-modal');
  if (modal) modal.classList.remove('visible');
}

function _wireNamingModal() {
  const confirm = document.getElementById('btn-name-confirm');
  const input   = document.getElementById('creature-name-input');
  if (!confirm || !input) return;

  const doConfirm = async () => {
    const name = input.value.trim() || 'unnamed';
    _hideNamingModal();
    setCreatureName(name);
    await saveCreatureName(name);
    NetworkEvents.emit('emergence', { text: `${name} awakens` });
    _hideGate();
    _transitionToStopped();
  };

  confirm.addEventListener('click', doConfirm);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doConfirm(); });
}

/* ═══════════════════════════════════════════════════════════════════
   STATE TRANSITIONS
   ═══════════════════════════════════════════════════════════════════ */

function _transitionToStopped() {
  _pageState = 'stopped';

  /* Build network if not yet built */
  if (!_networkBuilt) {
    buildNetwork(NS.currentSpecies?.id || 'lull', _canvas.width, _canvas.height);
    initHarmonic();
    harmonicSyncNodes();
    _networkBuilt = true;
  }

  /* Initialise creature canvas */
  initCreature(
    _creatureCanvas,
    NS.currentSpecies?.id || 'lull',
    getCreatureName()
  );

  /* Remove species tab from controls — cannot change mid-instrument */
  const speciesTab = document.querySelector('.mode-tab[data-tab="species"]');
  if (speciesTab) speciesTab.style.display = 'none';
  const speciesContent = document.getElementById('tab-species');
  if (speciesContent) speciesContent.style.display = 'none';

  /* Enable view toggle and anchor */
  document.getElementById('btn-view-toggle')?.removeAttribute('disabled');
  document.getElementById('btn-anchor')?.removeAttribute('disabled');

  _updateStatusBar();
  _idleFrame = requestAnimationFrame(_idleLoop);
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN LOOP
   ═══════════════════════════════════════════════════════════════════ */

function _loop(ts) {
  if (!NS.isRunning) return;
  const now = Date.now();

  networkTick(now, _canvas.width);
  harmonicTick(now);
  applyForces(_canvas.width, _canvas.height, _dragNode);
  autoSave(now);

  if (_creatureMode) {
    drawCreature(now);
  } else {
    _drawNetwork(ts);
  }

  _drawTimeline();
  _updateStatusBar();
  _updateNodePanel();
  _updateMatrixIfVisible();

  if (NS.hoveredNode !== null) _positionTooltip(_mouseX, _mouseY);

  _animFrame = requestAnimationFrame(_loop);
}

function _idleLoop(ts) {
  applyForces(_canvas?.width || 700, _canvas?.height || 420, _dragNode);
  if (_creatureMode) {
    drawCreature(Date.now());
  } else {
    _drawNetwork(ts);
  }
  _idleFrame = requestAnimationFrame(_idleLoop);
}

function _stopIdleLoop() {
  if (_idleFrame) { cancelAnimationFrame(_idleFrame); _idleFrame = null; }
}

/* ═══════════════════════════════════════════════════════════════════
   NETWORK CANVAS RENDERING
   ═══════════════════════════════════════════════════════════════════ */

function _drawNetwork(ts) {
  if (!_ctx || !_canvas) return;
  const W = _canvas.width, H = _canvas.height;

  _ctx.clearRect(0, 0, W, H);
  _ctx.fillStyle = '#07080b';
  _ctx.fillRect(0, 0, W, H);

  /* Edges */
  NS.edges.forEach(e => _drawEdge(e));

  /* Shift-drag preview */
  if (_shiftFrom !== null) {
    const fn = NS.nodes.find(n => n.id === _shiftFrom);
    if (fn) {
      _ctx.beginPath();
      _ctx.setLineDash([4, 5]);
      _ctx.strokeStyle = 'rgba(125,181,160,0.33)';
      _ctx.lineWidth   = 1.5;
      _ctx.moveTo(fn.x, fn.y);
      _ctx.lineTo(_mouseX, _mouseY);
      _ctx.stroke();
      _ctx.setLineDash([]);
    }
  }

  /* Nodes */
  NS.nodes.forEach(n => _drawNode(n));

  /* Phase-lock arcs */
  NS.nodes.forEach(n => {
    if (!n.phaseLocked || n.lockPartner < 0) return;
    const p = NS.nodes.find(x => x.id === n.lockPartner);
    if (!p) return;
    const mx = (n.x + p.x) / 2, my = (n.y + p.y) / 2;
    const r  = Math.hypot(n.x - p.x, n.y - p.y) / 2;
    _ctx.beginPath();
    _ctx.arc(mx, my, r, 0, Math.PI * 2);
    _ctx.strokeStyle = 'rgba(125,181,160,0.11)';
    _ctx.lineWidth   = 1;
    _ctx.setLineDash([2, 7]);
    _ctx.stroke();
    _ctx.setLineDash([]);
  });

  /* Listen-mode overlay */
  if (_listenNodeId !== null) {
    _ctx.fillStyle = 'rgba(7,8,11,0.70)';
    _ctx.fillRect(0, 0, W, H);
    const ln = NS.nodes.find(n => n.id === _listenNodeId);
    if (ln) _drawNode(ln, true);
  }

  _ctx.textAlign = 'left'; _ctx.textBaseline = 'alphabetic';
}

function _drawEdge(e) {
  const a = NS.nodes.find(n => n.id === e.from);
  const b = NS.nodes.find(n => n.id === e.to);
  if (!a || !b) return;

  const sig    = Math.min(1, Math.abs(e.signalHistory) * 2.8);
  const wt     = Math.abs(e.weight);
  const excite = e.weight > 0;

  const alpha  = 0.06 + sig * 0.72;
  const r = excite ? ~~(80  + sig*55)  : ~~(180 + sig*55);
  const g = excite ? ~~(160 + sig*50)  : ~~(90  + sig*35);
  const bl= excite ? ~~(130 + sig*35)  : ~~(55  + sig*20);

  const mx = (a.x+b.x)/2 + (b.y-a.y)*0.16;
  const my = (a.y+b.y)/2 - (b.x-a.x)*0.16;

  _ctx.beginPath();
  _ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha.toFixed(2)})`;
  _ctx.lineWidth   = 0.5 + wt*1.6 + sig*1.4;
  _ctx.moveTo(a.x, a.y);
  _ctx.quadraticCurveTo(mx, my, b.x, b.y);
  _ctx.stroke();

  /* Arrow */
  const t   = 0.75;
  const ax  = (1-t)*(1-t)*a.x + 2*(1-t)*t*mx + t*t*b.x;
  const ay  = (1-t)*(1-t)*a.y + 2*(1-t)*t*my + t*t*b.y;
  const dtx = 2*(1-t)*(mx-a.x) + 2*t*(b.x-mx);
  const dty = 2*(1-t)*(my-a.y) + 2*t*(b.y-my);
  const ang = Math.atan2(dty, dtx);
  const as  = 4 + sig*2.5;

  _ctx.beginPath();
  _ctx.fillStyle = `rgba(${r},${g},${bl},${(alpha*0.8).toFixed(2)})`;
  _ctx.moveTo(ax+Math.cos(ang)*as,        ay+Math.sin(ang)*as);
  _ctx.lineTo(ax+Math.cos(ang+2.5)*as*.5, ay+Math.sin(ang+2.5)*as*.5);
  _ctx.lineTo(ax+Math.cos(ang-2.5)*as*.5, ay+Math.sin(ang-2.5)*as*.5);
  _ctx.closePath(); _ctx.fill();

  /* Pulse dot */
  if (sig > 0.14) {
    const pt = (Date.now() * 0.0008) % 1;
    const px = (1-pt)*(1-pt)*a.x + 2*(1-pt)*pt*mx + pt*pt*b.x;
    const py = (1-pt)*(1-pt)*a.y + 2*(1-pt)*pt*my + pt*pt*b.y;
    _ctx.beginPath();
    _ctx.arc(px, py, 1.8+sig*1.8, 0, Math.PI*2);
    _ctx.fillStyle = `rgba(${r},${g},${bl},${(0.35+sig*0.5).toFixed(2)})`;
    _ctx.fill();
  }

  /* Weight label when edge touches selected node */
  if (NS.selectedNode !== null && (e.from===NS.selectedNode||e.to===NS.selectedNode)) {
    _ctx.fillStyle  = 'rgba(99,102,120,0.7)';
    _ctx.font       = '9px DM Mono,monospace';
    _ctx.textAlign  = 'center';
    _ctx.fillText(e.weight.toFixed(2), mx, my);
    _ctx.textAlign  = 'left';
  }
}

function _drawNode(n, highlight = false) {
  const hue  = TYPE_HUE[n.type] ?? 165;
  const amp  = Math.min(1, n.smoothEnergy);
  const flash= n._flash || 0;
  const sel  = NS.selectedNode === n.id || highlight;
  const hov  = NS.hoveredNode  === n.id;
  const r    = NODE_R + amp*5 + flash*7;

  /* Phase-lock ring */
  if (n.phaseLocked) {
    _ctx.beginPath();
    _ctx.arc(n.x, n.y, r+7, 0, Math.PI*2);
    _ctx.strokeStyle = 'rgba(125,181,160,0.17)';
    _ctx.lineWidth   = 1;
    _ctx.stroke();
  }

  /* Glow */
  if (amp > 0.07 || flash > 0) {
    const grd = _ctx.createRadialGradient(n.x,n.y,r*0.25,n.x,n.y,r+13);
    grd.addColorStop(0,`hsla(${hue},45%,55%,${(amp*0.13+flash*0.26).toFixed(2)})`);
    grd.addColorStop(1,'transparent');
    _ctx.beginPath();
    _ctx.arc(n.x,n.y,r+13,0,Math.PI*2);
    _ctx.fillStyle = grd; _ctx.fill();
  }

  /* Clip for waveform */
  _ctx.save();
  _ctx.beginPath();
  _ctx.arc(n.x,n.y,r-1,0,Math.PI*2);
  _ctx.clip();

  _ctx.fillStyle = `hsl(${hue},${14+amp*24}%,${sel?28:20-amp*7}%)`;
  _ctx.fillRect(n.x-r,n.y-r,r*2,r*2);

  if (amp > 0.02) {
    _ctx.beginPath();
    _ctx.strokeStyle = `hsla(${hue},50%,60%,${(0.27+amp*0.5).toFixed(2)})`;
    _ctx.lineWidth   = 1;
    const len = n.history.length;
    for (let i=0;i<len;i++) {
      const hx  = n.x-r+(i/len)*r*2;
      const val = n.history[(n.histIdx+i)%len];
      const hy  = n.y + val*(r*0.52);
      i===0 ? _ctx.moveTo(hx,hy) : _ctx.lineTo(hx,hy);
    }
    _ctx.stroke();
  }
  _ctx.restore();

  /* Border */
  _ctx.beginPath();
  _ctx.arc(n.x,n.y,r,0,Math.PI*2);
  _ctx.strokeStyle = sel
    ? 'rgba(125,181,160,0.9)'
    : hov
    ? `hsla(${hue},40%,55%,0.6)`
    : `hsla(${hue},25%,${34+amp*18}%,${0.27+amp*0.42})`;
  _ctx.lineWidth = sel ? 2 : 1+amp;
  _ctx.stroke();

  /* Symbol */
  _ctx.fillStyle    = sel
    ? 'rgba(166,208,190,0.9)'
    : `hsla(${hue},35%,${58+amp*20}%,${0.6+amp*0.3})`;
  _ctx.font         = `bold ${9+amp*2}px Syne,sans-serif`;
  _ctx.textAlign    = 'center';
  _ctx.textBaseline = 'middle';
  _ctx.fillText(TYPE_SYMBOLS[n.type]||'○', n.x, n.y-2);

  /* ID */
  _ctx.fillStyle    = 'rgba(99,102,120,0.48)';
  _ctx.font         = '7px DM Mono,monospace';
  _ctx.fillText(String(n.id), n.x, n.y+9);

  _ctx.textAlign = 'left'; _ctx.textBaseline = 'alphabetic';
}

/* ═══════════════════════════════════════════════════════════════════
   TIMELINE
   ═══════════════════════════════════════════════════════════════════ */

function _drawTimeline() {
  if (!_tlCtx || !_timelineCanvas) return;
  const W = _timelineCanvas.width, H = _timelineCanvas.height;

  _tlHistory.push({ energy: NS.energyLevel, locks: NS.phaseLockCount });
  if (_tlHistory.length > TL_MAX) _tlHistory.shift();

  _tlCtx.clearRect(0,0,W,H);
  _tlCtx.fillStyle = '#0d0f17';
  _tlCtx.fillRect(0,0,W,H);

  if (_tlHistory.length < 2) return;

  /* Area fill */
  _tlCtx.beginPath();
  _tlHistory.forEach((pt,i) => {
    const x = (i/TL_MAX)*W, y = H - pt.energy*(H-3)-1;
    i===0 ? _tlCtx.moveTo(x,H) : void 0;
    _tlCtx.lineTo(x,y);
  });
  _tlCtx.lineTo((_tlHistory.length/TL_MAX)*W,H);
  _tlCtx.closePath();
  _tlCtx.fillStyle = 'rgba(58,117,96,0.15)';
  _tlCtx.fill();

  /* Line */
  _tlCtx.beginPath();
  _tlCtx.strokeStyle = 'rgba(125,181,160,0.46)';
  _tlCtx.lineWidth   = 1.5;
  _tlHistory.forEach((pt,i) => {
    const x = (i/TL_MAX)*W, y = H - pt.energy*(H-3)-1;
    i===0 ? _tlCtx.moveTo(x,y) : _tlCtx.lineTo(x,y);
  });
  _tlCtx.stroke();

  /* Phase-lock ticks */
  _tlHistory.forEach((pt,i) => {
    if (pt.locks > 0) {
      _tlCtx.fillStyle = 'rgba(125,181,160,0.26)';
      _tlCtx.fillRect((i/TL_MAX)*W,0,1.5,H);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════
   WEIGHT MATRIX
   ═══════════════════════════════════════════════════════════════════ */

function _updateMatrixIfVisible() {
  const tab = document.querySelector('.mode-tab[data-tab="matrix"]');
  if (!tab?.classList.contains('active')) return;
  if (!_matrixCtx) return;

  const {W,N} = getWeightMatrix();
  if (!N) return;

  const cell  = Math.max(2, Math.floor(240/N));
  const total = cell*N;
  _matrixCanvas.width  = total;
  _matrixCanvas.height = total;

  _matrixCtx.fillStyle = '#07080b';
  _matrixCtx.fillRect(0,0,total,total);

  for (let i=0;i<N;i++) for (let j=0;j<N;j++) {
    const w  = W[i*N+j];
    const ab = Math.min(1,Math.abs(w));
    let cr,cg,cb;
    if (w>0) { cr=75; cg=~~(75+ab*145); cb=95; }
    else if (w<0) { cr=~~(95+ab*145); cg=65; cb=55; }
    else { cr=18; cg=18; cb=24; }
    _matrixCtx.fillStyle = `rgb(${cr},${cg},${cb})`;
    _matrixCtx.fillRect(j*cell,i*cell,cell-1,cell-1);
    if (i===j) {
      _matrixCtx.strokeStyle = 'rgba(99,102,120,0.22)';
      _matrixCtx.lineWidth   = 0.5;
      _matrixCtx.strokeRect(j*cell,i*cell,cell-1,cell-1);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   STATUS BAR
   ═══════════════════════════════════════════════════════════════════ */

function _updateStatusBar() {
  _setText('st-state',    NS.isRunning ? 'running' : _pageState === 'gate' ? 'waiting' : 'idle');
  _setText('st-nodes',    String(NS.nodes.length));
  _setText('st-conns',    String(NS.edges.length));
  _setText('st-locks',    String(NS.totalPhaseLocks));
  _setText('st-harmonic', NS.dominantHarmonic ?? '—');

  if (NS.biography) {
    _setText('st-memory', getSleepLabel(NS.biography.lastSessionAt));
    const s = NS.isRunning ? Math.floor(NS.elapsedMs/1000) : 0;
    _setText('st-age', s>0 ? `${_pad(Math.floor(s/60))}:${_pad(s%60)}` : '—');
  } else {
    _setText('st-memory', 'first awakening');
    _setText('st-age',    '—');
  }

  const ef = document.getElementById('energy-fill');
  if (ef) ef.style.width = (NS.energyLevel*100).toFixed(1)+'%';
}

/* ═══════════════════════════════════════════════════════════════════
   NODE TOOLTIP
   ═══════════════════════════════════════════════════════════════════ */

function _showTooltip(n, mx, my) {
  if (!_tooltip) return;
  _setText('tt-name',   `node ${n.id}`);
  _setText('tt-type',   TYPE_NAMES[n.type] ?? '—');
  _setText('tt-freq',   n.type===NODE_TYPES.OSCILLATOR ? n.freq?.toFixed(1)+' Hz' : '—');
  _setText('tt-energy', n.smoothEnergy.toFixed(3));
  _setText('tt-phase',  n.phaseLocked ? `locked (n${n.lockPartner})` : (n.phase%(Math.PI*2)).toFixed(2)+' rad');
  const ins  = NS.edges.filter(e=>e.to===n.id).length;
  const outs = NS.edges.filter(e=>e.from===n.id).length;
  _setText('tt-conns',  `${ins} in · ${outs} out`);
  _setText('tt-desc',   _typeDesc(n.type));
  _tooltip.classList.add('visible');
  _positionTooltip(mx,my);
}

function _positionTooltip(mx,my) {
  if (!_tooltip?.classList.contains('visible')) return;
  const W=_canvas.width, H=_canvas.height;
  const tw=_tooltip.offsetWidth||210, th=_tooltip.offsetHeight||130;
  let tx=mx+16, ty=my-10;
  if (tx+tw>W-6) tx=mx-tw-16;
  if (ty+th>H-6) ty=H-th-6;
  if (ty<6) ty=6;
  _tooltip.style.left=tx+'px'; _tooltip.style.top=ty+'px';
}

function _hideTooltip() {
  if (_tooltip) _tooltip.classList.remove('visible');
  NS.hoveredNode = null;
}

function _typeDesc(type) {
  return [
    'Self-generating tone. Drifts toward harmonic partials.',
    'Shapes incoming signal. Cutoff driven by signal strength.',
    'Nonlinear waveshaper. Creates harmonics through transformation.',
    'Ring buffer. Delay time attracted to endogenous rhythm.',
    'Counter-voice. Outputs the inverse of its prediction.',
    'Listens to the room. Routes microphone into the network.',
  ][type] ?? '—';
}

/* ═══════════════════════════════════════════════════════════════════
   NODE PANEL
   ═══════════════════════════════════════════════════════════════════ */

function _updateNodePanel() {
  if (NS.selectedNode === null) return;
  const n = NS.nodes.find(nd => nd.id === NS.selectedNode);
  if (!n) { _hideNodePanel(); return; }

  _setText('np-type',   TYPE_NAMES[n.type]??'—');
  _setText('np-freq',   n.type===NODE_TYPES.OSCILLATOR ? n.freq?.toFixed(1)+' Hz':'—');
  _setText('np-phase',  (n.phase%(Math.PI*2)).toFixed(3)+' rad');
  _setText('np-energy', n.smoothEnergy.toFixed(4));
  _setText('np-output', n.output?.toFixed(4)??'—');
  _setText('np-act',    '—');
  _setText('np-spec',   getSpecializationLabel(n));
  _setText('np-locked', n.locked?'yes':'no');
  _setText('np-desc',   _typeDesc(n.type));

  /* Connection chips */
  const ins  = NS.edges.filter(e=>e.to===n.id);
  const outs = NS.edges.filter(e=>e.from===n.id);
  const inEl  = document.getElementById('np-ins');
  const outEl = document.getElementById('np-outs');
  if (inEl) inEl.innerHTML = ins.length
    ? ins.map(e=>`<span class="conn-chip ${e.weight>0?'excite':'inhibit'}"
        data-from="${e.from}" data-to="${e.to}">n${e.from} ${e.weight.toFixed(2)}</span>`).join('')
    : '<span style="font-size:.62rem;color:var(--dim)">none</span>';
  if (outEl) outEl.innerHTML = outs.length
    ? outs.map(e=>`<span class="conn-chip ${e.weight>0?'excite':'inhibit'}"
        data-from="${e.from}" data-to="${e.to}">→n${e.to} ${e.weight.toFixed(2)}</span>`).join('')
    : '<span style="font-size:.62rem;color:var(--dim)">none</span>';

  /* Show mic toggle only for environment node */
  const micRow = document.getElementById('np-mic-row');
  if (micRow) {
    micRow.style.display = n.type === NODE_TYPES.ENVIRONMENT ? 'flex' : 'none';
    const micBtn = document.getElementById('np-btn-mic');
    if (micBtn) {
      const active = isMicActive();
      micBtn.textContent = active ? 'mic on' : 'mic off';
      micBtn.classList.toggle('active', active);
    }
  }
}

function _showNodePanel(n) {
  const panel = document.getElementById('node-panel');
  if (panel) panel.classList.add('visible');
  _updateNodePanel();
  ['np-btn-listen','np-btn-isolate','np-btn-inject'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.disabled = !NS.isRunning;
  });
}

function _hideNodePanel() {
  document.getElementById('node-panel')?.classList.remove('visible');
  NS.selectedNode = null;
}

/* ── Node panel mic toggle row — injected into HTML ────────────── */
function _injectMicRow() {
  /* Insert a mic row into the node panel after the actions row */
  const panel = document.getElementById('node-panel');
  if (!panel) return;
  if (document.getElementById('np-mic-row')) return;

  const micRow = document.createElement('div');
  micRow.id = 'np-mic-row';
  micRow.style.cssText = 'display:none;align-items:center;gap:8px;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid var(--border)';
  micRow.innerHTML = `
    <span style="font-family:var(--font-mono);font-size:0.58rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)">microphone</span>
    <button class="btn sm" id="np-btn-mic">mic off</button>
    <span style="font-family:var(--font-mono);font-size:0.58rem;color:var(--dim)">ambient sound enters the network</span>
  `;
  panel.appendChild(micRow);

  document.getElementById('np-btn-mic')?.addEventListener('click', async () => {
    const active = isMicActive();
    await setEnvironmentActive(!active);
    const micBtn = document.getElementById('np-btn-mic');
    if (micBtn) {
      micBtn.textContent = !active ? 'mic on' : 'mic off';
      micBtn.classList.toggle('active', !active);
    }
    NetworkEvents.emit('emergence', {
      text: !active ? 'microphone active — listening to the room' : 'microphone off',
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════════ */

function _showCtxMenu(n, cx, cy) {
  _ctxNodeId = n.id;
  _setText('ctx-node-label', `node ${n.id} · ${TYPE_NAMES[n.type]}`);
  _ctxMenu.style.left = Math.min(cx, window.innerWidth-195)+'px';
  _ctxMenu.style.top  = Math.min(cy, window.innerHeight-270)+'px';
  _ctxMenu.classList.add('visible');
}
function _hideCtxMenu() { _ctxMenu?.classList.remove('visible'); }

function _wireCtxMenu() {
  _bind('ctx-inject', () => {
    if (_ctxNodeId>=0) { injectNode(_ctxNodeId); exciteNodeHarmonic(_ctxNodeId); }
    _hideCtxMenu();
  });
  _bind('ctx-listen', () => {
    if (_ctxNodeId>=0) {
      _listenNodeId = _listenNodeId===_ctxNodeId ? null : _ctxNodeId;
      document.getElementById('listen-overlay')?.classList.toggle('active', _listenNodeId!==null);
    }
    _hideCtxMenu();
  });
  _bind('ctx-isolate', () => {
    if (_ctxNodeId>=0) {
      const n = NS.nodes.find(x=>x.id===_ctxNodeId);
      if (n) n.isolated = !n.isolated;
    }
    _hideCtxMenu();
  });
  const typeMap = {
    'ctx-to-osc':       NODE_TYPES.OSCILLATOR,
    'ctx-to-filter':    NODE_TYPES.FILTER,
    'ctx-to-nl':        NODE_TYPES.NONLINEAR,
    'ctx-to-delay':     NODE_TYPES.DELAY,
    'ctx-to-predictive':NODE_TYPES.PREDICTIVE,
  };
  Object.entries(typeMap).forEach(([btnId, type]) => {
    _bind(btnId, () => {
      const n = NS.nodes.find(x=>x.id===_ctxNodeId);
      if (n) {
        n.type = type;
        import('./audio-engine.js').then(m => m.updateNodeType(_ctxNodeId, type));
        NetworkEvents.emit('emergence', { text:`node ${n.id} → ${TYPE_NAMES[type]}` });
      }
      _hideCtxMenu();
    });
  });
  _bind('ctx-lock', () => {
    const n = NS.nodes.find(x=>x.id===_ctxNodeId);
    if (n) n.locked = !n.locked;
    _hideCtxMenu();
  });
  _bind('ctx-sever', () => {
    if (_ctxNodeId>=0) severNode(_ctxNodeId);
    _hideCtxMenu();
  });
}

/* ═══════════════════════════════════════════════════════════════════
   CANVAS EVENTS
   ═══════════════════════════════════════════════════════════════════ */

function _initCanvasEvents() {
  function cXY(e) {
    const r = _canvas.getBoundingClientRect();
    return { x:e.clientX-r.left, y:e.clientY-r.top };
  }
  function tXY(e, changed=false) {
    const t = changed?e.changedTouches:e.touches;
    const r = _canvas.getBoundingClientRect();
    return { x:t[0].clientX-r.left, y:t[0].clientY-r.top };
  }

  _canvas.addEventListener('mousedown', e => {
    if (e.button===2) return;
    if (_creatureMode) return;
    const {x,y} = cXY(e);
    const n = getNodeAt(x,y);
    if (n) { e.shiftKey ? (_shiftFrom=n.id) : (_dragNode=n); }
  });

  _canvas.addEventListener('mousemove', e => {
    if (_creatureMode) return;
    const {x,y} = cXY(e);
    _mouseX=x; _mouseY=y;
    if (_dragNode) { _dragNode.x=x; _dragNode.y=y; _dragNode.vx=0; _dragNode.vy=0; _hideTooltip(); return; }
    if (_shiftFrom!==null) return;
    const n = getNodeAt(x,y);
    if (n) { NS.hoveredNode=n.id; _showTooltip(n,x,y); _canvas.style.cursor='pointer'; }
    else   { _hideTooltip(); _canvas.style.cursor=NS.anchorMode?'default':'crosshair'; }
  });

  _canvas.addEventListener('mouseup', e => {
    if (_creatureMode) return;
    if (_shiftFrom!==null) {
      const {x,y} = cXY(e);
      const n = getNodeAt(x,y);
      if (n && n.id!==_shiftFrom) {
        addEdge(_shiftFrom, n.id, 0.2+Math.random()*0.28);
        NetworkEvents.emit('emergence',{text:`connection drawn · ${_shiftFrom} → ${n.id}`});
      }
      _shiftFrom=null; return;
    }
    _dragNode=null;
  });

  _canvas.addEventListener('click', e => {
    if (_creatureMode) return;
    if (_shiftFrom!==null) return;
    const {x,y} = cXY(e);
    const n = getNodeAt(x,y);
    _hideCtxMenu();
    if (n) {
      NS.selectedNode=n.id; _showNodePanel(n);
      if (NS.isRunning) { injectNode(n.id); exciteNodeHarmonic(n.id); }
    } else { _hideNodePanel(); }
  });

  _canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (_creatureMode) return;
    const {x,y} = cXY(e);
    const n = getNodeAt(x,y);
    if (n) { NS.selectedNode=n.id; _showCtxMenu(n,e.clientX,e.clientY); }
  });

  _canvas.addEventListener('mouseleave', () => { _hideTooltip(); _dragNode=null; });

  /* Touch */
  _canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const {x,y} = tXY(e);
    _mouseX=x; _mouseY=y;
    if (!_creatureMode) { const n=getNodeAt(x,y); if(n) _dragNode=n; }
  },{passive:false});

  _canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const {x,y} = tXY(e);
    _mouseX=x; _mouseY=y;
    if (_dragNode) { _dragNode.x=x; _dragNode.y=y; _dragNode.vx=0; _dragNode.vy=0; }
  },{passive:false});

  _canvas.addEventListener('touchend', e => {
    e.preventDefault();
    const {x,y} = tXY(e,true);
    if (!_dragNode && !_creatureMode) {
      const n=getNodeAt(x,y);
      if (n) { NS.selectedNode=n.id; _showNodePanel(n); if(NS.isRunning){injectNode(n.id);exciteNodeHarmonic(n.id);} }
      else _hideNodePanel();
    }
    _dragNode=null;
  },{passive:false});

  document.addEventListener('click', e => { if(!e.target.closest('#ctx-menu')) _hideCtxMenu(); });
}

/* ═══════════════════════════════════════════════════════════════════
   RESIZE
   ═══════════════════════════════════════════════════════════════════ */

function _resize() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap||!_canvas) return;
  _canvas.width          = wrap.clientWidth;
  _canvas.height         = wrap.clientHeight;
  _creatureCanvas.width  = wrap.clientWidth;
  _creatureCanvas.height = wrap.clientHeight;
  const tlWrap = _timelineCanvas?.parentElement;
  if (tlWrap && _timelineCanvas) {
    _timelineCanvas.width  = tlWrap.clientWidth;
    _timelineCanvas.height = 48;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   EMERGENCE LOG
   ═══════════════════════════════════════════════════════════════════ */

function _initEmergenceLog() {
  const log = document.getElementById('emergence-log');
  if (!log) return;
  NetworkEvents.on('emergence', ({text}) => {
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
  NetworkEvents.on('harmonicEvent', ({nodeId}) => {
    const n = NS.nodes.find(x=>x.id===nodeId);
    if (n?.type===NODE_TYPES.PREDICTIVE) triggerStartle();
  });
  NetworkEvents.on('environmentNodeEmerged', () => {
    /* Reveal mic row in node panel when env node is next selected */
  });
}

/* ═══════════════════════════════════════════════════════════════════
   TRANSPORT
   ═══════════════════════════════════════════════════════════════════ */

async function _startNetwork() {
  if (NS.isRunning) { _stopNetwork(); return; }

  await audioStart(NS.volume ?? 0.7);
  instantiateAudio();

  NS.isRunning  = true;
  _pageState    = 'running';
  _stopIdleLoop();
  _startTimer();

  await beginSession();

  /* Initial energy */
  setTimeout(() => {
    injectNode(NS.nodes[0]?.id ?? 0, 0.85);
    if (NS.nodes.length > 1) setTimeout(() => injectNode(NS.nodes[1]?.id??1, 0.6), 600);
  }, 950);

  const btn = document.getElementById('btn-start');
  if (btn) { btn.textContent='stop'; btn.classList.add('active'); }

  document.getElementById('btn-mutate')?.removeAttribute('disabled');
  document.getElementById('btn-rewire')?.removeAttribute('disabled');

  _animFrame = requestAnimationFrame(_loop);
  NetworkEvents.emit('emergence',{text:'network started — listening'});
}

function _stopNetwork() {
  if (!NS.isRunning) return;
  NS.isRunning = false;
  _pageState   = 'stopped';

  if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame=null; }

  audioStop();
  _stopTimer();
  endSession().catch(e => console.warn('[Main] endSession:',e));

  const btn = document.getElementById('btn-start');
  if (btn) { btn.textContent='start'; btn.classList.remove('active'); }

  document.getElementById('btn-mutate')?.setAttribute('disabled','');
  document.getElementById('btn-rewire')?.setAttribute('disabled','');

  const ef = document.getElementById('energy-fill');
  if (ef) ef.style.width='0%';

  _updateStatusBar();
  _idleFrame = requestAnimationFrame(_idleLoop);
}

/* ═══════════════════════════════════════════════════════════════════
   GATE SCREEN HTML INJECTION
   We inject the gate screen element dynamically so index.html
   stays clean. It sits above .card.
   ═══════════════════════════════════════════════════════════════════ */

function _injectGateScreen() {
  if (document.getElementById('gate-screen')) return;

  const gate = document.createElement('div');
  gate.id = 'gate-screen';
  gate.style.cssText = `
    display: none;
    position: fixed;
    inset: 52px 0 0 0;
    background: var(--bg);
    z-index: 400;
    align-items: center;
    justify-content: center;
    overflow-y: auto;
  `;

  gate.innerHTML = `<div id="gate-content" style="
    width:100%;
    min-height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:3rem 1.5rem;
  "></div>`;

  /* Insert after header, before main */
  const header = document.querySelector('header');
  if (header?.nextSibling) {
    header.parentNode.insertBefore(gate, header.nextSibling);
  } else {
    document.body.appendChild(gate);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   INITIALISATION
   ═══════════════════════════════════════════════════════════════════ */

async function _init() {
  /* Canvas refs */
  _canvas         = document.getElementById('ns-canvas');
  _creatureCanvas = document.getElementById('creature-canvas');
  _timelineCanvas = document.getElementById('timeline-canvas');
  _matrixCanvas   = document.getElementById('weight-matrix');
  _tooltip        = document.getElementById('node-tooltip');
  _ctxMenu        = document.getElementById('ctx-menu');

  _ctx       = _canvas.getContext('2d');
  _tlCtx     = _timelineCanvas.getContext('2d');
  _matrixCtx = _matrixCanvas.getContext('2d');

  _resize();
  window.addEventListener('resize', () => { _resize(); });

  /* Inject gate screen */
  _injectGateScreen();

  /* Wire modals and menus */
  _wireNamingModal();
  _wireCtxMenu();
  _initCanvasEvents();
  _initEmergenceLog();
  _injectMicRow();

  /* ── Tabs ─── */
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.style.display='none');
      tab.classList.add('active');
      const c = document.getElementById('tab-'+tab.dataset.tab);
      if (c) c.style.display='block';
      if (tab.dataset.tab==='history') renderHistoryTab();
    });
  });

  /* ── Buttons ─── */
  _bind('btn-start', async () => {
    if (_pageState==='gate') return;   /* gate must be dismissed first */
    if (_pageState==='stopped') { await _startNetwork(); return; }
    if (_pageState==='running') { _stopNetwork(); return; }
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
      _tlHistory=[];
      _networkBuilt=true;
      _idleFrame = requestAnimationFrame(_idleLoop);
    }, 300);
  });

  _bind('btn-anchor', () => {
    NS.anchorMode = !NS.anchorMode;
    document.getElementById('btn-anchor')?.classList.toggle('on', NS.anchorMode);
    const hint = document.getElementById('canvas-hint');
    if (hint) hint.textContent = NS.anchorMode
      ? 'anchor mode — drag nodes — proximity affects coupling'
      : 'right-click node · shift+drag to connect · click to inject · drag to move';
  });

  _bind('btn-view-toggle', () => {
    _creatureMode = !_creatureMode;
    const wrap = document.getElementById('canvas-wrap');
    if (wrap) wrap.classList.toggle('creature-mode', _creatureMode);
    creatureSetVisible(_creatureMode);
    const btn = document.getElementById('btn-view-toggle');
    if (btn) { btn.textContent=_creatureMode?'network':'creature'; btn.classList.toggle('on',_creatureMode); }
    const hint = document.getElementById('canvas-hint');
    if (hint) hint.style.display=_creatureMode?'none':'';
  });

  /* Node panel actions */
  _bind('np-btn-listen', () => {
    if (NS.selectedNode===null) return;
    _listenNodeId = _listenNodeId===NS.selectedNode ? null : NS.selectedNode;
    document.getElementById('listen-overlay')?.classList.toggle('active', _listenNodeId!==null);
  });
  _bind('np-btn-isolate', () => {
    if (NS.selectedNode===null) return;
    const n = NS.nodes.find(x=>x.id===NS.selectedNode);
    if (n) n.isolated = !n.isolated;
  });
  _bind('np-btn-inject', () => {
    if (NS.selectedNode!==null && NS.isRunning) {
      injectNode(NS.selectedNode); exciteNodeHarmonic(NS.selectedNode);
    }
  });

  _bind('btn-clear-history', async () => {
    await clearHistory();
    const el = document.getElementById('history-log');
    if (el) el.innerHTML='<span style="color:var(--dim)">History cleared.</span>';
  });

  /* ── Sliders ─── */
  function _slider(id, valId, key, fmt, audioKey) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      networkSetParam(key, v);
      _setText(valId, fmt(v));
      if (audioKey) audioSetParam(audioKey, v);
    });
  }
  const pct = v => Math.round(v*100)+'%';

  _slider('s-instability','v-instability','instability',  pct,'instability');
  _slider('s-recurrence', 'v-recurrence', 'recurrence',   pct,'recurrence');
  _slider('s-saturation', 'v-saturation', 'saturation',   pct,'saturation');
  _slider('s-lrate',      'v-lrate',      'learningRate',  pct);
  _slider('s-coupling',   'v-coupling',   'phaseCoupling', pct);
  _slider('s-hgravity',   'v-hgravity',   'harmonicGravity',pct);
  _slider('s-metabolism', 'v-metabolism', 'metabolism',    pct,'metabolism');

  document.getElementById('s-volume')?.addEventListener('input', function() {
    const v = parseFloat(this.value);
    NS.volume = v; setVolume(v); _setText('v-volume',pct(v));
  });

  /* ── Learning toggles ─── */
  function _tog(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      NS[key] = !NS[key]; el.classList.toggle('on', NS[key]);
    });
  }
  _tog('tog-hebbian',    'hebbianOn');
  _tog('tog-drift',      'driftOn');
  _tog('tog-homeostasis','homeostasisOn');
  _tog('tog-depression', 'depressionOn');
  _tog('tog-pruning',    'pruningOn');
  _tog('tog-predictive', 'predictiveOn');
  _tog('tog-fast',       'fastOn');
  _tog('tog-medium',     'mediumOn');
  _tog('tog-slow',       'slowOn');

  /* Remove env toggle from learning tab — now in node panel */
  document.getElementById('tog-env')?.closest('.ctrl-row')?.remove();

  /* ── Keyboard shortcuts ─── */
  document.addEventListener('keydown', e => {
    if (e.code==='Space' && NS.isRunning && !e.repeat) {
      e.preventDefault();
      const n = NS.nodes[Math.floor(Math.random()*NS.nodes.length)];
      if (n) { injectNode(n.id); exciteNodeHarmonic(n.id); }
    }
    if (e.code==='KeyM' && NS.isRunning && !e.repeat) mutate();
    if (e.code==='KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey) {
      document.getElementById('btn-reset')?.click();
    }
    if (e.code==='Escape') {
      _hideCtxMenu();
      _listenNodeId=null;
      document.getElementById('listen-overlay')?.classList.remove('active');
    }
  });

  /* ── Show gate ─── */
  await _initGate();
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _bind(id, fn) {
  document.getElementById(id)?.addEventListener('click', fn);
}

function _esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _fmtRuntime(s) {
  if (!s) return '0s';
  if (s<60)   return `${s}s`;
  if (s<3600) return `${Math.floor(s/60)}m`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

/* ═══════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', _init);
