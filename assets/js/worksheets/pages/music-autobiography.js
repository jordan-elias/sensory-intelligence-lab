/**
 * /assets/js/worksheets/pages/music-autobiography.js
 *
 * Data model (schema 2):
 *   {
 *     earliest_memory, your_song, patterns, music_does,
 *     chapters: [ { id, label, songsText, life, meaning, defining,
 *                   songs: [ { id, title, artist, videoId, note, variant } ] } ]
 *   }
 * Order is simply array order. Entries saved by the old single-page version
 * (flat auto_<uuid>_* keys) are converted on load; the original flat data is
 * kept under `_v1_backup` so nothing is lost if the conversion misses something.
 */
import { bySlug } from '../registry.js';
import { esc, uid } from '../core.js';
import { collectFields, restoreFields } from '../ui.js';
import { icons } from '../icons.js';
import { attachContextMenu, openMenuAt } from '../contextmenu.js';
import { searchSongs, findVideoId, playlistUrl } from '../songs.js';
import { createPlayer } from '../player.js';

const SORTABLE_URL = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';

// ── Module state ───────────────────────────────────────
let root = null;
let mark = () => {};
let player = null;
let Sortable = null;
let chapterSortable = null;
let state = { chapters: [], v1: null };
const collapsed = new Set();       // chapter ids (UI only, not saved)
const notesOpen = new Set();       // song ids with notes expanded
const hitsByChapter = {};          // chapter id -> last search results
let nowPlaying = null;

const $ = sel => root.querySelector(sel);

// ── Template ───────────────────────────────────────────
function render() {
  return `
    <div class="ws-callout">
      <strong>Your musical story</strong>
      Add a section for each chapter of your life: childhood, school years, a particular relationship, a difficult period, now. Name each section however feels right (an age, a place, a phrase). For each, note the songs that defined or marked that time, and what they meant to you.
    </div>

    <div class="ws-section">
      <div class="ws-section-title">Before we begin</div>
      <div class="ws-field">
        <label class="ws-label">What is your earliest memory of music?</label>
        <textarea class="ws-input md" data-field="earliest_memory" placeholder="A song, a sound, a feeling…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">Is there a song that feels like "your song", one you come back to again and again? What is it, and why?</label>
        <textarea class="ws-input md" data-field="your_song" placeholder=""></textarea>
      </div>
    </div>

    <div class="ma-tools" role="group" aria-label="Playlist tools">
      <div class="ma-tools__buttons">
        <button type="button" class="action-btn outline sm" id="maPlayAll">Play all in order</button>
        <button type="button" class="action-btn outline sm" id="maOpenYt">Open in YouTube</button>
        <button type="button" class="action-btn outline sm" id="maCopy">Copy song list</button>
        <span class="ma-tools__note" id="maToolsNote" role="status" aria-live="polite"></span>
      </div>
      <p class="ma-tools__hint">
        Tip: press and hold a song (or right-click it) to reorder it, move it to another chapter, or remove it. You can also drag the handle on the left.
        Phones usually pause the player in this page when the screen locks. To listen with the screen off, use "Open in YouTube".
      </p>
    </div>

    <div id="autoSections" class="dyn-sections"></div>
    <button type="button" class="add-section-btn" id="maAddChapter">+ Add a chapter</button>

    <div class="ws-section" style="margin-top:1.5rem;">
      <div class="ws-section-title">Reflection</div>
      <div class="ws-field">
        <label class="ws-label">Looking at your musical story as a whole, what patterns do you notice?</label>
        <textarea class="ws-input lg" data-field="patterns" placeholder="e.g. genres that reappear, themes in lyrics, how music connects to emotion or memory for you…"></textarea>
      </div>
      <div class="ws-field">
        <label class="ws-label">What does music do for you that other things can't?</label>
        <textarea class="ws-input md" data-field="music_does" placeholder=""></textarea>
      </div>
    </div>
  `;
}

function chapterHtml(ch, i) {
  const isCollapsed = collapsed.has(ch.id);
  return `
    <section class="dyn-section${isCollapsed ? ' collapsed' : ''}" data-chapter="${esc(ch.id)}">
      <div class="dyn-section-header">
        <button type="button" class="drag-handle drag-handle--chapter" data-action="chapter-handle" aria-label="Reorder chapter ${i + 1}. Use arrow keys, or drag." title="Drag to reorder">${icons.grip}</button>
        <button type="button" class="dyn-section-num" data-action="toggle-chapter" aria-expanded="${!isCollapsed}">${icons.chevronDown}<span class="dyn-section-num__text">Chapter ${i + 1}</span></button>
        <input type="text" class="dyn-section-label-input" data-ch-field="label" value="${esc(ch.label)}" aria-label="Name of chapter ${i + 1}" placeholder="Name this chapter (e.g. Age 8–12, High school, Berlin years…)">
        <button type="button" class="icon-btn" data-action="chapter-menu" aria-label="Chapter options" aria-haspopup="menu">${icons.more}</button>
      </div>
      <div class="dyn-section-body">
        <div class="ws-field">
          <label class="ws-label">Songs from this time. Search to add and listen.</label>
          <div class="chapter-song-search">
            <div class="song-search-bar">
              <input type="text" data-transient data-search-input aria-label="Search for a song from this chapter" placeholder="Search for a song from this chapter…">
              <button type="button" class="song-search-btn" data-action="search-song">Search</button>
            </div>
            <div class="search-results" data-results-for="${esc(ch.id)}"></div>
            <div class="chapter-players" data-songs-for="${esc(ch.id)}"></div>
            <button type="button" class="action-btn outline sm" data-action="play-chapter">Play this chapter</button>
          </div>
          <label class="ws-label" style="margin-top:.85rem;">Other songs from this time, typed by hand <em>(optional)</em></label>
          <textarea class="ws-input sm" data-ch-field="songsText" placeholder="Song and artist names…">${esc(ch.songsText)}</textarea>
        </div>
        <div class="ws-field">
          <label class="ws-label">What was happening in your life during this chapter?</label>
          <textarea class="ws-input md" data-ch-field="life" placeholder="Brief context. You don't have to share everything…">${esc(ch.life)}</textarea>
        </div>
        <div class="ws-field">
          <label class="ws-label">What did music mean to you during this time? What was it doing for you?</label>
          <textarea class="ws-input md" data-ch-field="meaning">${esc(ch.meaning)}</textarea>
        </div>
        <div class="ws-field">
          <label class="ws-label">Is there one song that captures this chapter most? What would you want someone to understand about why?</label>
          <textarea class="ws-input md" data-ch-field="defining">${esc(ch.defining)}</textarea>
        </div>
      </div>
    </section>`;
}

function songHtml(s) {
  const open = notesOpen.has(s.id) || !!s.note;
  const label = `${s.title} — ${s.artist}`;
  return `
    <div class="chapter-player${s.id === nowPlaying ? ' is-playing' : ''}" data-song="${esc(s.id)}">
      <div class="chapter-player-row">
        <button type="button" class="drag-handle drag-handle--song" data-action="song-handle" aria-label="Reorder ${esc(label)}. Use arrow keys, or drag." title="Drag to reorder">${icons.grip}</button>
        <div class="chapter-player-label" title="${esc(label)}">${esc(label)}</div>
        <button type="button" class="chapter-player-play" data-action="play-song" aria-label="Play ${esc(label)}">Play</button>
        <button type="button" class="chapter-player-notes-toggle" data-action="toggle-notes" aria-expanded="${open}">Notes</button>
        <button type="button" class="icon-btn" data-action="song-menu" aria-label="Options for ${esc(label)}" aria-haspopup="menu">${icons.more}</button>
      </div>
      <div class="chapter-player-hint" data-hint>${s.videoId ? '' : 'No video found yet. Open the options menu and choose "Try another version".'}</div>
      <div class="chapter-player-notes${open ? ' open' : ''}">
        <textarea data-song-note="${esc(s.id)}" placeholder="Notes about this song: what it means to you in this chapter, the memory it carries, why it belongs here…">${esc(s.note)}</textarea>
      </div>
    </div>`;
}

// ── Lookups ────────────────────────────────────────────
const chapterById = id => state.chapters.find(c => c.id === id);

function findSong(id) {
  for (const ch of state.chapters) {
    const i = ch.songs.findIndex(s => s.id === id);
    if (i !== -1) return { ch, i, s: ch.songs[i] };
  }
  return null;
}

const allSongs = () => state.chapters.flatMap(c => c.songs.map(s => ({ s, ch: c })));

function buildQueue(chapter = null) {
  const src = chapter ? chapter.songs.map(s => ({ s, ch: chapter })) : allSongs();
  return src.map(({ s, ch }) => ({
    id: s.id, title: s.title, artist: s.artist, videoId: s.videoId,
    context: ch.label || 'Music Autobiography',
  }));
}

// ── Rendering ──────────────────────────────────────────
function renderAll() {
  const box = $('#autoSections');
  box.innerHTML = state.chapters.length
    ? state.chapters.map(chapterHtml).join('')
    : '<div class="saved-empty">No chapters yet. Add your first one below.</div>';
  state.chapters.forEach(renderSongs);
  initChapterSortable();
  updateTools();
}

function renderSongs(ch) {
  const el = root.querySelector(`[data-songs-for="${CSS.escape(ch.id)}"]`);
  if (!el) return;
  el.innerHTML = ch.songs.map(songHtml).join('');
  initSongSortable(el);
}

function renumberChapters() {
  root.querySelectorAll('#autoSections .dyn-section').forEach((sec, i) => {
    const t = sec.querySelector('.dyn-section-num__text');
    if (t) t.textContent = `Chapter ${i + 1}`;
  });
}

function updateTools() {
  const n = allSongs().length;
  const hasVideo = allSongs().some(({ s }) => s.videoId);
  $('#maPlayAll').disabled = !hasVideo;
  $('#maOpenYt').disabled = !hasVideo;
  $('#maCopy').disabled = n === 0;
}

function afterStructureChange() {
  mark();
  player && player.updateQueue(buildQueue());
  updateTools();
}

function refocus(selector) {
  const el = root.querySelector(selector);
  if (el) { el.focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest' }); }
}

// ── Mutations ──────────────────────────────────────────
function addChapter() {
  const ch = { id: uid(), label: '', songsText: '', life: '', meaning: '', defining: '', songs: [] };
  state.chapters.push(ch);
  renderAll();
  mark();
  refocus(`[data-chapter="${CSS.escape(ch.id)}"] .dyn-section-label-input`);
}

function removeChapter(id) {
  const ch = chapterById(id);
  if (!ch) return;
  const hasContent = ch.songs.length || ch.label || ch.life || ch.meaning || ch.defining || ch.songsText;
  if (hasContent && !confirm(`Remove "${ch.label || 'this chapter'}" and everything in it?`)) return;
  if (ch.songs.some(s => s.id === player?.currentId)) player.stop();
  state.chapters = state.chapters.filter(c => c.id !== id);
  renderAll();
  afterStructureChange();
}

function moveChapter(id, dir) {
  const i = state.chapters.findIndex(c => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.chapters.length) return;
  [state.chapters[i], state.chapters[j]] = [state.chapters[j], state.chapters[i]];
  renderAll();
  afterStructureChange();
}

function moveSong(id, dir) {
  const f = findSong(id);
  if (!f) return;
  const j = f.i + dir;
  if (j < 0 || j >= f.ch.songs.length) return;
  [f.ch.songs[f.i], f.ch.songs[j]] = [f.ch.songs[j], f.ch.songs[f.i]];
  renderSongs(f.ch);
  afterStructureChange();
}

function moveSongToChapter(id, chapterId) {
  const f = findSong(id);
  const target = chapterById(chapterId);
  if (!f || !target || target === f.ch) return;
  f.ch.songs.splice(f.i, 1);
  target.songs.push(f.s);
  renderSongs(f.ch);
  renderSongs(target);
  afterStructureChange();
  refocus(`[data-song="${CSS.escape(id)}"] .drag-handle`);
}

function removeSong(id) {
  const f = findSong(id);
  if (!f) return;
  if (player?.currentId === id) player.stop();
  f.ch.songs.splice(f.i, 1);
  renderSongs(f.ch);
  afterStructureChange();
}

async function addSongFromHit(chapterId, hit) {
  const ch = chapterById(chapterId);
  if (!ch) return;
  const song = { id: uid(), title: hit.title, artist: hit.artist, videoId: '', note: '', variant: 0 };
  ch.songs.push(song);
  renderSongs(ch);
  afterStructureChange();
  await resolveVideo(song);
}

async function resolveVideo(song) {
  const id = await findVideoId(song.title, song.artist, song.variant);
  song.videoId = id || '';
  const row = root.querySelector(`[data-song="${CSS.escape(song.id)}"]`);
  if (row) row.querySelector('[data-hint]').textContent = id ? '' : 'No video found yet. Open the options menu and choose "Try another version".';
  afterStructureChange();
}

async function tryAnotherVersion(id) {
  const f = findSong(id);
  if (!f) return;
  f.s.variant = (f.s.variant || 0) + 1;
  const row = root.querySelector(`[data-song="${CSS.escape(id)}"] [data-hint]`);
  if (row) row.textContent = 'Looking for another version…';
  await resolveVideo(f.s);
}

// ── Playback ───────────────────────────────────────────
function playSong(id) {
  const q = buildQueue();
  const i = q.findIndex(t => t.id === id);
  if (i !== -1) player.play(q, i);
}

function playChapter(chId) {
  const ch = chapterById(chId);
  if (!ch) return;
  const q = buildQueue(ch);
  if (q.length) player.play(q, 0);
}

function setNote(msg) {
  const el = $('#maToolsNote');
  el.textContent = msg;
  clearTimeout(setNote.t);
  setNote.t = setTimeout(() => { el.textContent = ''; }, 3500);
}

function listText() {
  const lines = [];
  state.chapters.forEach((ch, i) => {
    if (!ch.songs.length) return;
    lines.push(ch.label || `Chapter ${i + 1}`);
    ch.songs.forEach((s, k) => lines.push(`  ${k + 1}. ${s.title} — ${s.artist}`));
    lines.push('');
  });
  return lines.join('\n').trim();
}

async function copyList() {
  const text = listText();
  try { await navigator.clipboard.writeText(text); setNote('Song list copied.'); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); setNote('Song list copied.'); } catch { setNote('Could not copy.'); }
    ta.remove();
  }
}

function openInYouTube() {
  const ids = allSongs().map(({ s }) => s.videoId).filter(Boolean).slice(0, 50);
  if (!ids.length) return;
  window.open(playlistUrl(ids), '_blank', 'noopener');
}

// ── Menus ──────────────────────────────────────────────
function songMenuItems(id) {
  const f = findSong(id);
  if (!f) return [];
  const others = state.chapters.filter(c => c !== f.ch);
  return [
    { label: 'Play', onSelect: () => playSong(id) },
    { label: 'Move up', disabled: f.i === 0, onSelect: () => { moveSong(id, -1); refocus(`[data-song="${CSS.escape(id)}"] .drag-handle`); } },
    { label: 'Move down', disabled: f.i === f.ch.songs.length - 1, onSelect: () => { moveSong(id, 1); refocus(`[data-song="${CSS.escape(id)}"] .drag-handle`); } },
    ...(others.length ? [{ separator: true }] : []),
    ...others.map(c => ({
      label: `Move to ${c.label || 'Chapter ' + (state.chapters.indexOf(c) + 1)}`,
      onSelect: () => moveSongToChapter(id, c.id),
    })),
    { separator: true },
    { label: 'Try another version', onSelect: () => tryAnotherVersion(id) },
    { label: 'Remove song', danger: true, onSelect: () => removeSong(id) },
  ];
}

function chapterMenuItems(id) {
  const i = state.chapters.findIndex(c => c.id === id);
  if (i < 0) return [];
  const isCollapsed = collapsed.has(id);
  return [
    { label: 'Move up', disabled: i === 0, onSelect: () => { moveChapter(id, -1); refocus(`[data-chapter="${CSS.escape(id)}"] .drag-handle`); } },
    { label: 'Move down', disabled: i === state.chapters.length - 1, onSelect: () => { moveChapter(id, 1); refocus(`[data-chapter="${CSS.escape(id)}"] .drag-handle`); } },
    { label: isCollapsed ? 'Expand' : 'Collapse', onSelect: () => toggleChapter(id) },
    { label: 'Play this chapter', disabled: !state.chapters[i].songs.length, onSelect: () => playChapter(id) },
    { separator: true },
    { label: 'Remove chapter', danger: true, onSelect: () => removeChapter(id) },
  ];
}

function toggleChapter(id) {
  const sec = root.querySelector(`[data-chapter="${CSS.escape(id)}"]`);
  if (!sec) return;
  const isCollapsed = sec.classList.toggle('collapsed');
  isCollapsed ? collapsed.add(id) : collapsed.delete(id);
  sec.querySelector('[data-action="toggle-chapter"]').setAttribute('aria-expanded', String(!isCollapsed));
}

// ── Drag and drop (SortableJS, loaded on demand) ───────
function syncFromDom() {
  const byId = new Map(allSongs().map(({ s }) => [s.id, s]));
  root.querySelectorAll('[data-songs-for]').forEach(list => {
    const ch = chapterById(list.dataset.songsFor);
    if (ch) ch.songs = [...list.querySelectorAll('[data-song]')].map(el => byId.get(el.dataset.song)).filter(Boolean);
  });
  afterStructureChange();
}

function initSongSortable(el) {
  if (!Sortable || Sortable.get(el)) return; // re-rendering the list's contents keeps the same container
  Sortable.create(el, {
    group: 'songs', handle: '.drag-handle--song', draggable: '.chapter-player',
    animation: 150, ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
    onEnd: syncFromDom,
  });
}

function initChapterSortable() {
  if (!Sortable) return;
  chapterSortable && chapterSortable.destroy();
  chapterSortable = Sortable.create($('#autoSections'), {
    handle: '.drag-handle--chapter', draggable: '.dyn-section',
    animation: 150, ghostClass: 'drag-ghost',
    onEnd() {
      const order = [...root.querySelectorAll('#autoSections .dyn-section')].map(s => s.dataset.chapter);
      state.chapters = order.map(chapterById).filter(Boolean);
      renumberChapters();
      afterStructureChange();
    },
  });
}

async function loadSortable() {
  try {
    const mod = await import(SORTABLE_URL);
    Sortable = mod.default || mod.Sortable;
    if (root && root.isConnected) {
      initChapterSortable();
      root.querySelectorAll('[data-songs-for]').forEach(initSongSortable);
    }
  } catch (err) {
    console.warn('Drag and drop unavailable; the options menu and arrow keys still work.', err);
  }
}

// ── Search ─────────────────────────────────────────────
async function runChapterSearch(section) {
  const chId = section.dataset.chapter;
  const input = section.querySelector('[data-search-input]');
  const results = section.querySelector('[data-results-for]');
  const q = input.value.trim();
  if (!q) return;
  results.innerHTML = '<div class="search-loading">Searching…</div>';
  results.classList.add('visible');
  try {
    const hits = (await searchSongs(q)).slice(0, 5);
    hitsByChapter[chId] = hits;
    results.innerHTML = hits.length
      ? hits.map((h, i) => `<button type="button" class="search-result-item" data-action="pick-hit" data-i="${i}"><span><span class="search-result-title">${esc(h.title)}</span><span class="search-result-artist">${esc(h.artist)}</span></span></button>`).join('')
      : '<div class="search-loading">No results found.</div>';
  } catch (err) {
    results.innerHTML = `<div class="search-loading">Error: ${esc(err.message)}</div>`;
  }
}

// ── Legacy conversion ──────────────────────────────────
const slug = s => String(s || '').replace(/\W+/g, '_');

function fromV1(d) {
  const out = {
    earliest_memory: d.earliest_memory || '', your_song: d.your_song || '',
    patterns: d.patterns || '', music_does: d.music_does || '',
    chapters: [], v1: d,
  };
  let keys = Array.isArray(d._chapterOrder) ? d._chapterOrder.slice() : [];
  if (!keys.length) {
    for (let n = 1; ['label', 'songs', 'life', 'meaning', 'defining'].some(k => d[`auto_${n}_${k}`] !== undefined); n++) keys.push(String(n));
  }
  const songRefs = Array.isArray(d._songOrder) ? d._songOrder : [];
  keys.forEach(k => {
    const songs = songRefs
      .filter(s => String(s.chapterUuid || s.chapter) === String(k))
      .map(s => ({
        id: uid(), title: s.title || '', artist: s.artist || '', videoId: s.videoId || '',
        note: d[`_songnote_${slug(s.title)}_${slug(s.artist)}`] || '', variant: 0,
      }));
    out.chapters.push({
      id: uid(), label: d[`auto_${k}_label`] || '', songsText: d[`auto_${k}_songs`] || '',
      life: d[`auto_${k}_life`] || '', meaning: d[`auto_${k}_meaning`] || '', defining: d[`auto_${k}_defining`] || '',
      songs,
    });
  });
  return out;
}

function normalise(d) {
  return {
    ...d,
    chapters: (d.chapters || []).map(c => ({
      id: c.id || uid(), label: c.label || '', songsText: c.songsText || '',
      life: c.life || '', meaning: c.meaning || '', defining: c.defining || '',
      songs: (c.songs || []).map(s => ({
        id: s.id || uid(), title: s.title || '', artist: s.artist || '',
        videoId: s.videoId || '', note: s.note || '', variant: s.variant || 0,
      })),
    })),
  };
}

// ── Module ─────────────────────────────────────────────
export default {
  ...bySlug('music-autobiography'),
  savedNoun: 'Saved music autobiographies',
  render,

  init(ctx) {
    root = ctx.root; mark = ctx.markDirty;
    state = { chapters: [], v1: null };
    player = createPlayer({
      onChange(id) {
        nowPlaying = id;
        root.querySelectorAll('.chapter-player').forEach(r => r.classList.toggle('is-playing', r.dataset.song === id));
      },
    });

    // Start a brand-new sheet with one empty chapter; restore() replaces this for saved entries.
    state.chapters.push({ id: uid(), label: '', songsText: '', life: '', meaning: '', defining: '', songs: [] });
    renderAll();
    loadSortable();

    $('#maAddChapter').addEventListener('click', addChapter);
    $('#maPlayAll').addEventListener('click', () => { const q = buildQueue(); if (q.length) player.play(q, 0); });
    $('#maOpenYt').addEventListener('click', openInYouTube);
    $('#maCopy').addEventListener('click', copyList);

    const sections = $('#autoSections');

    // Keep state in step with what the user types (page.js separately triggers autosave on these events)
    sections.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.chField !== undefined) {
        const ch = chapterById(t.closest('[data-chapter]')?.dataset.chapter);
        if (ch) ch[t.dataset.chField] = t.value;
      } else if (t.dataset.songNote !== undefined) {
        const f = findSong(t.dataset.songNote);
        if (f) f.s.note = t.value;
      }
    });

    sections.addEventListener('keydown', e => {
      const t = e.target;
      if (t.dataset.searchInput !== undefined && e.key === 'Enter') { e.preventDefault(); runChapterSearch(t.closest('[data-chapter]')); return; }
      const handle = t.closest?.('.drag-handle');
      const arrow = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (handle && arrow) {
        e.preventDefault();
        const song = handle.closest('[data-song]');
        if (song) { moveSong(song.dataset.song, arrow); refocus(`[data-song="${CSS.escape(song.dataset.song)}"] .drag-handle`); }
        else { const id = handle.closest('[data-chapter]').dataset.chapter; moveChapter(id, arrow); refocus(`[data-chapter="${CSS.escape(id)}"] .drag-handle`); }
        return;
      }
      // Alt+Up / Alt+Down anywhere on a song row
      if (e.altKey && arrow && t.closest('[data-song]') && !t.matches('textarea, input')) {
        e.preventDefault();
        const id = t.closest('[data-song]').dataset.song;
        moveSong(id, arrow); refocus(`[data-song="${CSS.escape(id)}"] .drag-handle`);
      }
    });

    sections.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const section = btn.closest('[data-chapter]');
      const song = btn.closest('[data-song]');
      switch (btn.dataset.action) {
        case 'toggle-chapter': toggleChapter(section.dataset.chapter); break;
        case 'chapter-menu': {
          const r = btn.getBoundingClientRect();
          openMenuAt(r.left, r.bottom + 4, chapterMenuItems(section.dataset.chapter), { returnFocus: btn });
          break;
        }
        case 'song-menu': {
          const r = btn.getBoundingClientRect();
          openMenuAt(r.left, r.bottom + 4, songMenuItems(song.dataset.song), { returnFocus: btn });
          break;
        }
        case 'play-song': playSong(song.dataset.song); break;
        case 'play-chapter': playChapter(section.dataset.chapter); break;
        case 'toggle-notes': {
          const notes = song.querySelector('.chapter-player-notes');
          const open = notes.classList.toggle('open');
          btn.setAttribute('aria-expanded', String(open));
          open ? notesOpen.add(song.dataset.song) : notesOpen.delete(song.dataset.song);
          if (open) notes.querySelector('textarea').focus();
          break;
        }
        case 'search-song': runChapterSearch(section); break;
        case 'pick-hit': {
          const hit = hitsByChapter[section.dataset.chapter]?.[Number(btn.dataset.i)];
          const results = section.querySelector('[data-results-for]');
          results.classList.remove('visible'); results.innerHTML = '';
          section.querySelector('[data-search-input]').value = '';
          if (hit) addSongFromHit(section.dataset.chapter, hit);
          break;
        }
      }
    });

    // Right-click / press-and-hold
    attachContextMenu(sections, '.chapter-player', row => songMenuItems(row.dataset.song));
    attachContextMenu(sections, '.dyn-section-header', head => chapterMenuItems(head.closest('[data-chapter]').dataset.chapter));
  },

  collect() {
    const data = collectFields(root, '#autoSections');
    data.chapters = state.chapters.map(c => ({
      id: c.id, label: c.label, songsText: c.songsText, life: c.life, meaning: c.meaning, defining: c.defining,
      songs: c.songs.map(s => ({ id: s.id, title: s.title, artist: s.artist, videoId: s.videoId, note: s.note, variant: s.variant })),
    }));
    if (state.v1) data._v1_backup = state.v1;
    return { schema: 2, data };
  },

  restore(payload) {
    const raw = payload.data || {};
    const d = (payload.schema === 2 || Array.isArray(raw.chapters))
      ? { ...raw, v1: raw._v1_backup || null }
      : fromV1(raw);
    const n = normalise(d);
    restoreFields(root, n, '#autoSections');
    state = { chapters: n.chapters, v1: n.v1 || null };
    collapsed.clear(); notesOpen.clear();
    renderAll();
  },

  exportText(title) {
    const d = this.collect().data;
    const out = [title, '─'.repeat(40), ''];
    const add = (label, v) => { if (v && v.trim()) out.push(label, v.trim(), ''); };
    add('Earliest memory of music', d.earliest_memory);
    add('My song', d.your_song);
    d.chapters.forEach((ch, i) => {
      out.push('', (ch.label || `Chapter ${i + 1}`).toUpperCase(), '');
      if (ch.songs.length) { out.push('Songs'); ch.songs.forEach(s => { out.push(`- ${s.title} — ${s.artist}`); if (s.note.trim()) out.push(`    ${s.note.trim().replace(/\n/g, '\n    ')}`); }); out.push(''); }
      add('Other songs', ch.songsText);
      add('What was happening in my life', ch.life);
      add('What music meant to me', ch.meaning);
      add('The song that captures this chapter', ch.defining);
    });
    out.push('', 'REFLECTION', '');
    add('Patterns I notice', d.patterns);
    add('What music does for me', d.music_does);
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  },
};
