/**
 * neural-synthesis/persistence.js
 *
 * Supabase persistence layer.
 *
 * Tables (SQL in comments below):
 *
 * neural_instruments:
 *   id              uuid primary key default gen_random_uuid()
 *   user_id         uuid references auth.users(id) not null
 *   species_id      text not null default 'lull'
 *   creature_name   text
 *   session_count   integer default 0
 *   total_runtime_s integer default 0
 *   last_session_at timestamptz
 *   biography       jsonb
 *   harmonic_vocab  jsonb
 *   created_at      timestamptz default now()
 *   updated_at      timestamptz default now()
 *   RLS: all operations require auth.uid() = user_id
 *
 * neural_history:
 *   id              uuid primary key default gen_random_uuid()
 *   user_id         uuid references auth.users(id) not null
 *   instrument_id   uuid references neural_instruments(id) on delete cascade
 *   session_start   timestamptz not null
 *   session_end     timestamptz
 *   runtime_s       integer default 0
 *   species_id      text
 *   events          jsonb
 *   snapshot        jsonb
 *   created_at      timestamptz default now()
 *   RLS: all operations require auth.uid() = user_id
 *
 * Sleep/wake model:
 *   Retention = exp(-k * sleepDays), k = ln(50)/14
 *   0 days → 1.0 (full memory)
 *   14 days → ~0.02 (nearly forgotten)
 *
 * Session picker:
 *   loadAllInstruments() returns all user instruments for display
 *   in the session picker gate on page load.
 */

import { getBiographySnapshot, applyBiography, NS, NetworkEvents } from './network.js';
import { getVocabularyWeights, applyHarmonicVocabulary } from './harmonic.js';

/* ═══════════════════════════════════════════════════════════════════
   SUPABASE CLIENT
   auth-guard.js exposes the client as window._supabase
   and fires 'authReady' when user is confirmed.
   ═══════════════════════════════════════════════════════════════════ */

function getClient() {
  return window._supabase || window.supabase || null;
}

async function waitForAuth() {
  if (window._currentUser?.id) return window._currentUser.id;
  return new Promise(resolve => {
    const handler = e => {
      window.removeEventListener('authReady', handler);
      resolve(e.detail?.user?.id ?? null);
    };
    window.addEventListener('authReady', handler);
    setTimeout(() => {
      window.removeEventListener('authReady', handler);
      resolve(null);
    }, 10000);
  });
}

async function getUserId() {
  if (window._currentUser?.id) return window._currentUser.id;
  return waitForAuth();
}

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */

const AUTO_SAVE_MS       = 3 * 60 * 1000;
const MAX_EVENTS         = 200;
const FORGET_DAYS        = 14;

/* ═══════════════════════════════════════════════════════════════════
   MODULE STATE
   ═══════════════════════════════════════════════════════════════════ */

const P = {
  instrumentId:  null,
  historyId:     null,
  userId:        null,
  sessionStart:  null,
  sessionEvents: [],
  lastAutoSave:  0,
  isRunning:     false,
  totalRuntime:  0,
  sessionCount:  0,
  creatureName:  null,
  speciesId:     null,
};

/* ═══════════════════════════════════════════════════════════════════
   SLEEP / RETENTION
   ═══════════════════════════════════════════════════════════════════ */

function computeRetention(lastSessionAt) {
  if (!lastSessionAt) return 0;
  const days = (Date.now() - new Date(lastSessionAt).getTime()) / 86400000;
  const k    = Math.log(50) / FORGET_DAYS;
  return Math.max(0, Math.min(1, Math.exp(-k * days)));
}

export function getSleepLabel(lastSessionAt) {
  if (!lastSessionAt) return 'first awakening';
  const mins = (Date.now() - new Date(lastSessionAt).getTime()) / 60000;
  if (mins <    5) return 'just woken';
  if (mins <   60) return 'well rested';
  if (mins < 1440) return 'rested';
  const days = mins / 1440;
  if (days <  3)   return 'light sleep';
  if (days <  7)   return 'long sleep';
  if (days < 14)   return 'deep sleep';
  return 'nearly forgotten';
}

/* ═══════════════════════════════════════════════════════════════════
   LOAD — single instrument for current user (most recent)
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Load a specific instrument by id, applying biography priors.
 * Returns session info object or null on failure.
 */
export async function loadInstrument(instrumentId) {
  const sb = getClient();
  if (!sb) return null;
  P.userId = await getUserId();
  if (!P.userId) return null;

  try {
    const query = sb
      .from('neural_instruments')
      .select('*')
      .eq('user_id', P.userId);

    if (instrumentId) {
      query.eq('id', instrumentId);
    } else {
      query.order('last_session_at', { ascending: false }).limit(1);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;

    P.instrumentId = data.id;
    P.creatureName = data.creature_name;
    P.speciesId    = data.species_id;
    P.totalRuntime = data.total_runtime_s ?? 0;
    P.sessionCount = data.session_count   ?? 0;

    const retention  = computeRetention(data.last_session_at);
    const sleepLabel = getSleepLabel(data.last_session_at);

    if (data.biography) {
      const bio = typeof data.biography === 'string'
        ? JSON.parse(data.biography) : data.biography;
      bio.lastSessionAt = data.last_session_at;
      applyBiography(bio);
    }

    if (data.harmonic_vocab) {
      const vocab = typeof data.harmonic_vocab === 'string'
        ? JSON.parse(data.harmonic_vocab) : data.harmonic_vocab;
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
      instrumentId: data.id,
    };

  } catch (err) {
    console.warn('[Persistence] loadInstrument:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   LOAD ALL — session picker
   Returns all instruments for the current user, newest first.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Returns array of { id, speciesId, creatureName, lastSessionAt,
 *                    totalRuntimeS, sessionCount, sleepLabel }
 * for display in the session picker.
 */
export async function loadAllInstruments() {
  const sb = getClient();
  if (!sb) return [];
  const userId = await getUserId();
  if (!userId) return [];

  try {
    const { data, error } = await sb
      .from('neural_instruments')
      .select('id, species_id, creature_name, last_session_at, total_runtime_s, session_count')
      .eq('user_id', userId)
      .order('last_session_at', { ascending: false })
      .limit(10);

    if (error) return [];

    return (data || []).map(row => ({
      id:           row.id,
      speciesId:    row.species_id,
      creatureName: row.creature_name || 'unnamed',
      lastSessionAt:row.last_session_at,
      totalRuntimeS:row.total_runtime_s ?? 0,
      sessionCount: row.session_count   ?? 0,
      sleepLabel:   getSleepLabel(row.last_session_at),
    }));

  } catch (err) {
    console.warn('[Persistence] loadAllInstruments:', err);
    return [];
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CREATE — first session for a new instrument
   ═══════════════════════════════════════════════════════════════════ */

export async function createInstrument(speciesId, creatureName) {
  const sb = getClient();
  if (!sb) return null;
  P.userId = await getUserId();
  if (!P.userId) return null;

  try {
    const { data, error } = await sb
      .from('neural_instruments')
      .insert({
        user_id:         P.userId,
        species_id:      speciesId,
        creature_name:   creatureName,
        session_count:   0,
        total_runtime_s: 0,
      })
      .select()
      .single();

    if (error) { console.warn('[Persistence] createInstrument:', error.message); return null; }

    P.instrumentId = data.id;
    P.creatureName = creatureName;
    P.speciesId    = speciesId;
    return data.id;

  } catch (err) {
    console.warn('[Persistence] createInstrument exception:', err);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SESSION LIFECYCLE
   ═══════════════════════════════════════════════════════════════════ */

export async function beginSession() {
  P.sessionStart  = new Date();
  P.sessionEvents = [];
  P.isRunning     = true;
  P.lastAutoSave  = Date.now();

  NetworkEvents.on('emergence', _onEmergence);

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
      })
      .select('id')
      .single();

    if (!error && data) P.historyId = data.id;
  } catch (err) {
    console.warn('[Persistence] beginSession:', err);
  }
}

export async function endSession() {
  if (!P.isRunning) return;
  P.isRunning = false;
  NetworkEvents.off('emergence', _onEmergence);
  const runtimeS = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000) : 0;
  await _saveState(runtimeS, true);
}

export async function autoSave(nowMs) {
  if (!P.isRunning) return;
  if (nowMs - P.lastAutoSave < AUTO_SAVE_MS) return;
  P.lastAutoSave = nowMs;
  const runtimeS = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000) : 0;
  await _saveState(runtimeS, false);
}

async function _saveState(runtimeS, isFinal) {
  const sb = getClient();
  if (!sb || !P.userId || !P.instrumentId) return;

  const biography     = getBiographySnapshot();
  const harmonicVocab = getVocabularyWeights();
  const totalRuntime  = P.totalRuntime + runtimeS;
  const sessionCount  = isFinal ? P.sessionCount + 1 : P.sessionCount;

  try {
    await sb
      .from('neural_instruments')
      .update({
        biography,
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
    console.warn('[Persistence] instrument update:', err);
  }

  if (!P.historyId) return;
  try {
    const payload = {
      events:    P.sessionEvents.slice(-MAX_EVENTS),
      runtime_s: runtimeS,
    };
    if (isFinal) {
      payload.session_end = new Date().toISOString();
      payload.snapshot    = biography;
    }
    await sb
      .from('neural_history')
      .update(payload)
      .eq('id', P.historyId)
      .eq('user_id', P.userId);
  } catch (err) {
    console.warn('[Persistence] history update:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   CREATURE NAME
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
    console.warn('[Persistence] saveCreatureName:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   HISTORY TAB
   ═══════════════════════════════════════════════════════════════════ */

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
    if (error) return [];
    return data ?? [];
  } catch (err) {
    console.warn('[Persistence] loadHistory:', err);
    return [];
  }
}

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
    console.warn('[Persistence] clearHistory:', err);
  }
}

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
  entries.forEach((entry, si) => {
    const d    = new Date(entry.session_start);
    const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rt   = _fmtRuntime(entry.runtime_s ?? 0);

    lines.push(`<div style="padding:0.6rem 0;border-bottom:1px solid var(--border)">`);
    lines.push(`<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.3rem">
      <span style="color:var(--text)">${date} ${time}</span>
      <span style="color:var(--muted)">${entry.species_id ?? '—'} · ${rt}</span>
    </div>`);

    const events = Array.isArray(entry.events) ? entry.events : [];
    if (events.length) {
      events.forEach(ev => {
        const ts  = ev.t !== undefined ? _fmtElapsed(ev.t) : '';
        const txt = ev.text ?? String(ev);
        lines.push(`<div style="color:var(--dim);font-size:0.6rem;padding:1px 0">
          <span style="color:var(--accent-dark);margin-right:0.5rem">${ts}</span>${_esc(txt)}
        </div>`);
      });
    }

    if (entry.snapshot) {
      const sn = typeof entry.snapshot === 'string'
        ? JSON.parse(entry.snapshot) : entry.snapshot;
      const parts = [];
      if (sn.dominantHarmonic)          parts.push(`root ${sn.dominantHarmonic}`);
      if (sn.totalPhaseLocks != null)    parts.push(`${sn.totalPhaseLocks} phase locks`);
      if (sn.nodeCount != null)          parts.push(`${sn.nodeCount} nodes`);
      if (parts.length) {
        lines.push(`<div style="color:var(--muted);font-size:0.58rem;margin-top:0.35rem;
          padding-top:0.35rem;border-top:1px solid var(--border)">${parts.join(' · ')}</div>`);
      }
    }

    lines.push('</div>');
  });

  el.innerHTML = lines.join('');
}

/* ═══════════════════════════════════════════════════════════════════
   EVENT ACCUMULATION
   ═══════════════════════════════════════════════════════════════════ */

function _onEmergence({ text }) {
  if (!P.isRunning) return;
  const t = P.sessionStart
    ? Math.round((Date.now() - P.sessionStart.getTime()) / 1000) : 0;
  P.sessionEvents.push({ t, text });
  if (P.sessionEvents.length > MAX_EVENTS) {
    P.sessionEvents = P.sessionEvents.slice(-MAX_EVENTS);
  }
  /* Live append to history tab if open */
  const tab = document.querySelector('.mode-tab[data-tab="history"]');
  if (!tab?.classList.contains('active')) return;
  const el = document.getElementById('history-log');
  if (!el) return;
  const placeholder = el.querySelector('span');
  if (placeholder && placeholder.style.color === 'var(--dim)') placeholder.remove();
  const line = document.createElement('div');
  line.style.cssText = 'color:var(--dim);font-size:0.6rem;padding:1px 0';
  line.innerHTML = `<span style="color:var(--accent-dark);margin-right:.5rem">${_fmtElapsed(t)}</span>${_esc(text)}`;
  el.insertBefore(line, el.firstChild);
  while (el.children.length > 60) el.removeChild(el.lastChild);
}

/* ═══════════════════════════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════════════════════════ */

function _fmtRuntime(s) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m ${s%60}s`;
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;
}

function _fmtElapsed(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

function _esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════════════════════════════
   GETTERS
   ═══════════════════════════════════════════════════════════════════ */

export function getInstrumentId()  { return P.instrumentId; }
export function getCreatureName()  { return P.creatureName; }
export function getSpeciesId()     { return P.speciesId; }
export function getTotalRuntime()  { return P.totalRuntime; }
export function getSessionCount()  { return P.sessionCount; }
export function hasInstrument()    { return !!P.instrumentId; }
