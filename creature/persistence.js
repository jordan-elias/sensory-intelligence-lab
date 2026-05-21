/**
 * neural-synthesis/persistence.js
 *
 * Supabase persistence layer for Neural Synthesis.
 * Manages two tables:
 *
 * ── neural_instruments ──────────────────────────────────────────
 *   id              uuid primary key default gen_random_uuid()
 *   user_id         uuid references auth.users(id) not null
 *   species_id      text not null default 'lull'
 *   creature_name   text
 *   session_count   integer default 0
 *   total_runtime_s integer default 0
 *   last_session_at timestamptz
 *   biography       jsonb          -- character state (see getBiographySnapshot)
 *   harmonic_vocab  jsonb          -- interval weight array
 *   created_at      timestamptz default now()
 *   updated_at      timestamptz default now()
 *
 *   RLS:
 *     enable row level security
 *     policy "owner only" using (auth.uid() = user_id)
 *       for all using (auth.uid() = user_id)
 *       with check (auth.uid() = user_id)
 *
 * ── neural_history ──────────────────────────────────────────────
 *   id              uuid primary key default gen_random_uuid()
 *   user_id         uuid references auth.users(id) not null
 *   instrument_id   uuid references neural_instruments(id)
 *   session_start   timestamptz not null
 *   session_end     timestamptz
 *   runtime_s       integer default 0
 *   species_id      text
 *   events          jsonb          -- array of {t, text} annotation objects
 *   snapshot        jsonb          -- biography snapshot at session end
 *   created_at      timestamptz default now()
 *
 *   RLS:
 *     enable row level security
 *     policy "owner only" using (auth.uid() = user_id)
 *       for all using (auth.uid() = user_id)
 *       with check (auth.uid() = user_id)
 *
 * Sleep/wake model:
 *   On load: fetch instrument record → compute sleep duration →
 *   pass retention factor to network.js and harmonic.js.
 *   On session end: write updated biography + increment counters.
 *   Auto-save: every AUTO_SAVE_INTERVAL_MS while running.
 *
 * History log:
 *   Emergence events emitted by NetworkEvents are accumulated
 *   in a session buffer. On session end (or auto-save) they are
 *   written to neural_history. The History tab reads from this table.
 */

import { getBiographySnapshot, applyBiography, NS } from './network.js';
import { getVocabularyWeights, applyHarmonicVocabulary } from './harmonic.js';
import { NetworkEvents } from './network.js';

/* ═══════════════════════════════════════════════════════════════════
   SUPABASE CLIENT
   Assumes window.supabase is initialised by the app shell before
   this module loads. Falls back gracefully if unavailable.
   ═══════════════════════════════════════════════════════════════════ */

function getClient() {
  if (window.supabase) return window.supabase;
  console.warn('[Persistence] Supabase client not found on window.supabase');
  return null;
}

async function getUserId() {
  const sb = getClient();
  if (!sb) return null;
  try {
    const { data: { user } } = await sb.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const AUTO_SAVE_INTERVAL_MS  = 3 * 60 * 1000;   /* 3 minutes */
const MAX_HISTORY_EVENTS      = 200;             /* cap per session */
const SLEEP_FULL_MEMORY_DAYS  = 0;              /* 0 days → full retention */
const SLEEP_NO_MEMORY_DAYS    = 14;             /* 14 days → near-zero retention */

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

const P = {
  instrumentId:   null,   /* uuid of current neural_instruments row */
  historyId:      null,   /* uuid of current neural_history row */
  userId:         null,
  sessionStart:   null,   /* Date object */
  sessionEvents:  [],     /* accumulated emergence events this session */
  lastAutoSave:   0,
  isRunning:      false,
  totalRuntime:   0,      /* seconds, loaded from DB */
  sessionCount:   0,      /* loaded from DB */
  creatureName:   null,
  speciesId:      null,
};

/* ═══════════════════════════════════════════════════════════════════
   SLEEP RETENTION CALCULATION
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compute retention factor 0..1 from time since last session.
 * 0 days → 1.0 (full memory)
 * 14 days → ~0.0 (nearly forgotten)
 * Uses a smooth exponential decay.
 */
function computeRetention(lastSessionAt) {
  if (!lastSessionAt) return 0;   /* never played — fresh start */
  const sleepMs   = Date.now() - new Date(lastSessionAt).getTime();
  const sleepDays = sleepMs / (1000 * 60 * 60 * 24);
  /* Exponential: retention = exp(-k * days), k chosen so 14 days ≈ 0.02 */
  const k = Math.log(50) / SLEEP_NO_MEMORY_DAYS;   /* ≈ 0.278 */
  return Math.max(0, Math.min(1, Math.exp(-k * sleepDays)));
}

/**
 * Returns a human-readable sleep state label for the status bar.
 */
export function getSleepLabel(lastSessionAt) {
  if (!lastSessionAt) return 'first awakening';
  const sleepMs   = Date.now() - new Date(lastSessionAt).getTime();
  const sleepMins = sleepMs / 60000;
  const sleepDays = sleepMins / 1440;

  if (sleepMins < 5)    return 'just woken';
  if (sleepMins < 60)   return 'well rested';
  if (sleepDays < 1)    return 'rested';
  if (sleepDays < 3)    return 'light sleep';
  if (sleepDays < 7)    return 'long sleep';
  if (sleepDays < 14)   return 'deep sleep';
  return 'nearly forgotten';
}

/* ═══════════════════════════════════════════════════════════════════
   LOAD — fetch instrument record for current user
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Load the instrument biography for the current user.
 * If no record exists, returns null (first session).
 * Applies biography priors to network and harmonic systems.
 *
 * Returns: { speciesId, creatureName, retention, sleepLabel, totalRuntime, sessionCount }
 * or null on first session.
 */
export async function loadInstrument() {
  const sb = getClient();
  if (!sb) return null;

  P.userId = await getUserId();
  if (!P.userId) return null;

  try {
    const { data, error } = await sb
      .from('neural_instruments')
      .select('*')
      .eq('user_id', P.userId)
      .maybeSingle();

    if (error) {
      console.warn('[Persistence] Load error:', error.message);
      return null;
    }

    if (!data) {
      /* First session — no record yet */
      return null;
    }

    /* Existing record */
    P.instrumentId = data.id;
    P.creatureName = data.creature_name;
    P.speciesId    = data.species_id;
    P.totalRuntime = data.total_runtime_s ?? 0;
    P.sessionCount = data.session_count   ?? 0;

    const retention  = computeRetention(data.last_session_at);
    const sleepLabel = getSleepLabel(data.last_session_at);

    /* Apply biography to network */
    if (data.biography) {
      const bio = typeof data.biography === 'string'
        ? JSON.parse(data.biography)
        : data.biography;
      bio.lastSessionAt = data.last_session_at;
      applyBiography(bio);
    }

    /* Apply harmonic vocabulary */
    if (data.harmonic_vocab) {
      const vocab = typeof data.harmonic_vocab === 'string'
        ? JSON.parse(data.harmonic_vocab)
        : data.harmonic_vocab;
      applyHarmonicVocabulary(vocab, retention);
    }

    return {
      speciesId:    data.species_id,
      creatureName: data.creature_name,
      retention,
      sleepLabel,
      totalRuntime: P.totalRuntime,
      sessionCount: P.sessionCount,
      lastSessionAt:data.last_session_at,
    };

  } catch (err) {
    console.warn('[Persistence] Load exception:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE — first-session record creation
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create a new instrument record for a first-time user.
 * Called after species selection and creature naming.
 */
export async function createInstrument(speciesId, creatureName) {
  const sb = getClient();
  if (!sb || !P.userId) return null;

  try {
    const { data, error } = await sb
      .from('neural_instruments')
      .insert({
        user_id:       P.userId,
        species_id:    speciesId,
        creature_name: creatureName,
        session_count: 0,
        total_runtime_s: 0,
        last_session_at: null,
        biography:     null,
        harmonic_vocab:null,
      })
      .select()
      .single();

    if (error) {
      console.warn('[Persistence] Create error:', error.message);
      return null;
    }

    P.instrumentId = data.id;
    P.creatureName = creatureName;
    P.speciesId    = speciesId;
    return data.id;

  } catch (err) {
    console.warn('[Persistence] Create exception:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SESSION LIFECYCLE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Begin a session — create a history row, start event accumulation.
 */
export async function beginSession() {
  P.sessionStart  = new Date();
  P.sessionEvents = [];
  P.isRunning     = true;
  P.lastAutoSave  = Date.now();

  /* Subscribe to emergence events */
  NetworkEvents.on('emergence', _onEmergence);

  /* Create history row */
  const sb = getClient();
  if (!sb || !P.userId || !P.instrumentId) return;

  try {
    const { data, error } = await sb
      .from('neural_history')
      .insert({
        user_id:       P.userId,
        instrument_id: P.instrumentId,
        session_start: P.sessionStart.toISOString(),
        species_id:    P.speciesId ?? NS.currentSpecies?.id ?? 'lull',
        events:        [],
        snapshot:      null,
      })
      .select('id')
      .single();

    if (!error && data) P.historyId = data.id;
  } catch (err) {
    console.warn('[Persistence] beginSession error:', err);
  }
}

/**
 * End session — write final biography snapshot, update instrument record.
 */
export async function endSession() {
  if (!P.isRunning) return;
  P.isRunning = false;
  NetworkEvents.off('emergence', _onEmergence);

  const runtimeS = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000)
    : 0;

  await _saveState(runtimeS, true);
}

/**
 * Auto-save — called periodically while running.
 */
export async function autoSave(nowMs) {
  if (!P.isRunning) return;
  if (nowMs - P.lastAutoSave < AUTO_SAVE_INTERVAL_MS) return;
  P.lastAutoSave = nowMs;

  const runtimeS = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000)
    : 0;

  await _saveState(runtimeS, false);
}

/* ─── Core save ──────────────────────────────────────────────────── */

async function _saveState(runtimeS, isFinal) {
  const sb = getClient();
  if (!sb || !P.userId || !P.instrumentId) return;

  const biography     = getBiographySnapshot();
  const harmonicVocab = getVocabularyWeights();
  const totalRuntime  = P.totalRuntime + runtimeS;
  const sessionCount  = isFinal ? P.sessionCount + 1 : P.sessionCount;

  /* Update instrument record */
  try {
    await sb
      .from('neural_instruments')
      .update({
        biography:       biography,
        harmonic_vocab:  harmonicVocab,
        last_session_at: new Date().toISOString(),
        total_runtime_s: totalRuntime,
        session_count:   sessionCount,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', P.instrumentId)
      .eq('user_id', P.userId);

    if (isFinal) {
      P.totalRuntime = totalRuntime;
      P.sessionCount = sessionCount;
    }
  } catch (err) {
    console.warn('[Persistence] Instrument update error:', err);
  }

  /* Update history row */
  if (!P.historyId) return;
  try {
    const updatePayload = {
      events:   _trimEvents(P.sessionEvents),
      runtime_s:runtimeS,
    };
    if (isFinal) {
      updatePayload.session_end = new Date().toISOString();
      updatePayload.snapshot    = biography;
    }
    await sb
      .from('neural_history')
      .update(updatePayload)
      .eq('id', P.historyId)
      .eq('user_id', P.userId);
  } catch (err) {
    console.warn('[Persistence] History update error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE NAME UPDATE
   ═══════════════════════════════════════════════════════════════════ */

export async function saveCreatureName(name) {
  P.creatureName = name;
  const sb = getClient();
  if (!sb || !P.instrumentId || !P.userId) return;
  try {
    await sb
      .from('neural_instruments')
      .update({ creature_name: name, updated_at: new Date().toISOString() })
      .eq('id', P.instrumentId)
      .eq('user_id', P.userId);
  } catch (err) {
    console.warn('[Persistence] Name save error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HISTORY LOG — read for History tab
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Load recent history entries for the current user's instrument.
 * Returns array of { sessionStart, runtimeS, speciesId, events, snapshot }
 * ordered newest first, limited to last 20 sessions.
 */
export async function loadHistory() {
  const sb = getClient();
  if (!sb || !P.userId || !P.instrumentId) return [];

  try {
    const { data, error } = await sb
      .from('neural_history')
      .select('session_start, session_end, runtime_s, species_id, events, snapshot')
      .eq('instrument_id', P.instrumentId)
      .eq('user_id', P.userId)
      .order('session_start', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[Persistence] History load error:', error.message);
      return [];
    }

    return data ?? [];

  } catch (err) {
    console.warn('[Persistence] History load exception:', err);
    return [];
  }
}

/**
 * Clear all history rows for this instrument.
 * Does not delete the instrument record itself.
 */
export async function clearHistory() {
  const sb = getClient();
  if (!sb || !P.userId || !P.instrumentId) return;
  try {
    await sb
      .from('neural_history')
      .delete()
      .eq('instrument_id', P.instrumentId)
      .eq('user_id', P.userId);
    P.sessionEvents = [];
  } catch (err) {
    console.warn('[Persistence] Clear history error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HISTORY TAB RENDERING
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Render history entries into the #history-log element.
 * Called by main.js when the History tab is opened.
 */
export async function renderHistoryTab() {
  const el = document.getElementById('history-log');
  if (!el) return;

  el.innerHTML = '<span style="color:var(--dim)">loading...</span>';

  const entries = await loadHistory();

  if (!entries.length) {
    el.innerHTML = '<span style="color:var(--dim)">No history yet. Start the network and let it run.</span>';
    return;
  }

  const lines = [];

  entries.forEach((entry, sessionIdx) => {
    const startDate = new Date(entry.session_start);
    const dateStr   = startDate.toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const timeStr   = startDate.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit',
    });
    const runtimeStr = _formatRuntime(entry.runtime_s ?? 0);
    const species    = entry.species_id ?? '—';

    lines.push(`<div style="
      padding: 0.6rem 0;
      border-bottom: 1px solid var(--border);
      ${sessionIdx === 0 ? 'padding-top:0' : ''}
    ">`);

    lines.push(`<div style="
      color: var(--text);
      margin-bottom: 0.3rem;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    ">
      <span>${dateStr} ${timeStr}</span>
      <span style="color:var(--muted)">${species} · ${runtimeStr}</span>
    </div>`);

    /* Render events from this session */
    const events = Array.isArray(entry.events) ? entry.events : [];
    if (events.length) {
      lines.push('<div style="display:flex;flex-direction:column;gap:2px;margin-top:0.3rem">');
      events.forEach(ev => {
        const ts  = ev.t ? _formatElapsed(ev.t) : '';
        const txt = ev.text ?? ev;
        lines.push(`<div style="color:var(--dim);font-size:0.6rem">
          <span style="color:var(--accent-dark);margin-right:0.5rem">${ts}</span>${_escapeHtml(txt)}
        </div>`);
      });
      lines.push('</div>');
    } else {
      lines.push('<div style="color:var(--dim);font-size:0.6rem">no events recorded</div>');
    }

    /* Snapshot summary */
    if (entry.snapshot) {
      const snap = typeof entry.snapshot === 'string'
        ? JSON.parse(entry.snapshot)
        : entry.snapshot;
      if (snap.dominantHarmonic || snap.totalPhaseLocks !== undefined) {
        lines.push(`<div style="
          color: var(--muted);
          font-size: 0.58rem;
          margin-top: 0.35rem;
          padding-top: 0.35rem;
          border-top: 1px solid var(--border);
          display: flex; gap: 1rem;
        ">`);
        if (snap.dominantHarmonic) {
          lines.push(`<span>root ${snap.dominantHarmonic}</span>`);
        }
        if (snap.totalPhaseLocks !== undefined) {
          lines.push(`<span>${snap.totalPhaseLocks} phase locks</span>`);
        }
        if (snap.nodeCount !== undefined) {
          lines.push(`<span>${snap.nodeCount} nodes at close</span>`);
        }
        lines.push('</div>');
      }
    }

    lines.push('</div>');
  });

  el.innerHTML = lines.join('');
}

/* ═══════════════════════════════════════════════════════════════════
   CURRENT SESSION EVENT ACCUMULATION
   ═══════════════════════════════════════════════════════════════════ */

function _onEmergence({ text }) {
  if (!P.isRunning) return;
  const elapsedS = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000)
    : 0;
  P.sessionEvents.push({ t: elapsedS, text });
  if (P.sessionEvents.length > MAX_HISTORY_EVENTS) {
    P.sessionEvents = P.sessionEvents.slice(-MAX_HISTORY_EVENTS);
  }
  _appendEventToTab(elapsedS, text);
}

/**
 * Append a single event line to the live history tab
 * without reloading all history from the database.
 */
function _appendEventToTab(elapsedS, text) {
  /* Only update if History tab is currently active */
  const histTab = document.querySelector('.mode-tab[data-tab="history"]');
  if (!histTab?.classList.contains('active')) return;
  const el = document.getElementById('history-log');
  if (!el) return;

  /* Remove placeholder */
  const placeholder = el.querySelector('span[style*="dim"]');
  if (placeholder) placeholder.remove();

  const line = document.createElement('div');
  line.style.cssText = 'color:var(--dim);font-size:0.6rem;padding:1px 0';
  line.innerHTML = `
    <span style="color:var(--accent-dark);margin-right:0.5rem">${_formatElapsed(elapsedS)}</span>
    ${_escapeHtml(text)}
  `;
  /* Prepend so newest is at top */
  el.insertBefore(line, el.firstChild);

  /* Keep display trim */
  while (el.children.length > 60) el.removeChild(el.lastChild);
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _trimEvents(events) {
  return events.slice(-MAX_HISTORY_EVENTS);
}

function _formatRuntime(seconds) {
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function _formatElapsed(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS
   ═══════════════════════════════════════════════════════════════════ */

export function getInstrumentId()  { return P.instrumentId; }
export function getCreatureName()  { return P.creatureName; }
export function getSpeciesId()     { return P.speciesId; }
export function getTotalRuntime()  { return P.totalRuntime; }
export function getSessionCount()  { return P.sessionCount; }
export function isFirstSession()   { return !P.instrumentId; }
export function getCurrentEvents() { return P.sessionEvents.slice(); }
