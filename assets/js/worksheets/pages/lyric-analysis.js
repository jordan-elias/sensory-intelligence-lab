/** /assets/js/worksheets/pages/lyric-analysis.js */
import { bySlug } from '../registry.js';
import { esc, formatDate } from '../core.js';
import { collectFields, restoreFields } from '../ui.js';
import { searchSongs, findVideoId, fetchLyrics, embedUrl } from '../songs.js';

function render() {
  return `
    <div class="ws-callout">
      <strong>How to use this worksheet</strong>
      Search for a song below. The lyrics will load automatically and you can listen while you work. Choose up to three lines or passages that catch your attention, then work through the questions for each one.
    </div>

    <div class="ws-notice">
      <span>The audio player finds the closest match on YouTube — it may occasionally surface a live version or cover rather than the original recording. Lyrics are sourced automatically and may sometimes be missing or contain small inaccuracies. You can paste or edit lyrics manually below if needed.</span>
    </div>

    <div class="ws-section">
      <div class="ws-section-title">Find your song</div>

      <div class="song-search-bar">
        <input type="text" id="songSearchInput" data-transient aria-label="Search for a song" placeholder="Song title or artist name…">
        <button class="song-search-btn" id="songSearchBtn">Search</button>
      </div>
      <div class="search-results" id="songSearchResults"></div>

      <div class="song-player" id="songPlayer">
        <div class="song-player-meta">
          <span class="song-player-title" id="songPlayerTitle"></span>
          <span class="song-player-artist" id="songPlayerArtist"></span>
          <button type="button" class="song-player-change" id="songChange">Change song</button>
        </div>
        <div class="yt-audio-wrap" id="ytAudioWrap"></div>
      </div>

      <input type="hidden" data-field="song_title">
      <input type="hidden" data-field="song_artist">
      <input type="hidden" data-field="song_lyrics_auto" id="songLyricsAutoField">

      <div class="ws-field" style="margin-top:1.25rem;">
        <label class="ws-label">If lyrics didn't load, paste or edit them here <em>(optional)</em></label>
        <textarea class="ws-input md" data-field="song_lyrics_manual" placeholder="Paste lyrics here if needed…"></textarea>
      </div>
    </div>

    <div class="lyric-two-col">

      <!-- LEFT: lyrics (desktop only) -->
      <div class="lyric-col-left">
        <div class="lyric-col-label">Lyrics</div>
        <div id="lyricsColLeft">
          <div class="lyrics-box-empty">Lyrics will appear here once you select a song.</div>
        </div>
      </div>

      <!-- RIGHT: all questions -->
      <div class="lyric-col-right">

        <!-- Lyrics panel for mobile only -->
        <div class="lyrics-panel" id="lyricsPanel">
          <p class="section-label" style="margin-bottom:.5rem;">Lyrics</p>
          <div class="lyrics-box" id="lyricsBox"></div>
          <p class="lyrics-hint" id="lyricsHint" style="display:none;">Read through the lyrics, then add selections below to begin your reflection.</p>
        </div>

        <div class="ws-section" style="margin-top:0;">
          <div class="ws-section-title">First impressions</div>
          <div class="ws-field">
            <label class="ws-label">Why did you choose this song today?</label>
            <textarea class="ws-input md" data-field="song_why" placeholder="It might be that you've always loved it, that it appeared suddenly in your mind, that it makes you feel something you can't quite name…"></textarea>
          </div>
          <div class="ws-field">
            <label class="ws-label">What is the song "about" on the surface — the literal story or situation?</label>
            <textarea class="ws-input sm" data-field="song_surface" placeholder="Briefly, in your own words…"></textarea>
          </div>
        </div>

        <p class="section-label" style="margin-top:1.5rem; margin-bottom:.5rem;">Lyric selections</p>
        <div id="lyricBlocks"></div>
        <button class="add-section-btn" id="addLyricBtn">+ Add a lyric selection (up to 3)</button>

        <div class="ws-section" style="margin-top:1.5rem;">
          <div class="ws-section-title">The whole song</div>
          <div class="ws-field">
            <label class="ws-label">After sitting with these lyrics, what do you think this song is really about — beneath the surface?</label>
            <textarea class="ws-input md" data-field="song_deeper" placeholder="What is the emotional truth of it?"></textarea>
          </div>
          <div class="ws-field">
            <label class="ws-label">What has this song revealed or uncovered for you today?</label>
            <textarea class="ws-input md" data-field="song_revealed" placeholder="An insight, a question, a feeling — whatever arose…"></textarea>
          </div>
          <div class="ws-field">
            <label class="ws-label">If this song could say something directly to you right now, what might it say?</label>
            <textarea class="ws-input md" data-field="song_message" placeholder="Try to let the answer come without overthinking…"></textarea>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ── Behaviour ──────────────────────────────────────────
const MAX_BLOCKS = 3;
const BLOCK_FIELDS = [
  ['text',    'The lyric(s) you\'ve chosen <em>— copy them here exactly as they appear in the song</em>', 'Type or paste the line(s) here…', true],
  ['pull',    'Why did these words catch your attention? What was the pull?', 'Don\'t analyse yet — just describe the initial reaction…'],
  ['meaning', 'What do these words mean to you — in your own life, right now?', 'How do they land when you read them as if they were written for you?'],
  ['memory',  'What memory, image, or feeling do these words bring up?', 'Let the association come without judging it…'],
  ['role',    'Who are you in this story? Are you the speaker, another character, someone watching? Or does it shift?', ''],
  ['unsaid',  'Is there something in these words that describes something you haven\'t yet been able to say yourself? What is it?', 'Music often finds the words before we do…'],
];

let root = null;
let mark = () => {};
let hits = [];

const $ = sel => root.querySelector(sel);

function blockHtml() {
  const fields = BLOCK_FIELDS.map(([sub, label, ph, quote]) => `
    <div class="ws-field">
      <label class="ws-label">${label}</label>
      <textarea class="ws-input md" data-sub="${sub}" placeholder="${esc(ph)}"${quote ? ' style="font-style:italic; border-left: 3px solid var(--accent);"' : ''}></textarea>
    </div>`).join('');
  return `
    <div class="lyric-block">
      <div class="lyric-block-header">
        <span class="lyric-block-num">Selection</span>
        <span class="lyric-block-title">Lyric passage</span>
        <button type="button" class="dyn-remove" data-action="remove-block">Remove</button>
      </div>
      ${fields}
    </div>`;
}

function renumberBlocks() {
  const blocks = root.querySelectorAll('#lyricBlocks .lyric-block');
  blocks.forEach((b, i) => { b.querySelector('.lyric-block-num').textContent = `Selection ${i + 1}`; });
  $('#addLyricBtn').hidden = blocks.length >= MAX_BLOCKS;
}

function addBlock() {
  const box = $('#lyricBlocks');
  if (box.children.length >= MAX_BLOCKS) return null;
  box.insertAdjacentHTML('beforeend', blockHtml());
  renumberBlocks();
  return box.lastElementChild;
}

function showLyrics(text) {
  const panel = $('#lyricsPanel');
  panel.classList.add('visible');
  $('#lyricsBox').textContent = text;
  $('#lyricsColLeft').innerHTML = `<div class="lyrics-box" style="max-height:none;white-space:pre-wrap;">${esc(text)}</div>`;
  $('#songLyricsAutoField').value = text;
  $('#lyricsHint').style.display = text ? 'block' : 'none';
}

function showLyricsMissing() {
  const note = '<span style="font-style:italic;color:var(--muted)">Lyrics not found automatically. Paste them in the field above if you\'d like them here.</span>';
  $('#lyricsPanel').classList.add('visible');
  $('#lyricsBox').innerHTML = note;
  $('#lyricsColLeft').innerHTML = `<div class="lyrics-box-empty">${note}</div>`;
  $('#songLyricsAutoField').value = '';
  $('#lyricsHint').style.display = 'none';
}

async function loadPlayer(title, artist) {
  const wrap = $('#ytAudioWrap');
  wrap.innerHTML = '<div style="padding:.5rem;font-size:.75rem;color:var(--muted);font-style:italic;">Finding player…</div>';
  const id = await findVideoId(title, artist);
  wrap.innerHTML = id
    ? `<iframe src="${embedUrl(id)}" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;border:none;" title="Audio player for ${esc(title)}"></iframe>`
    : '<div style="padding:.5rem;font-size:.75rem;color:var(--muted);font-style:italic;">No video found for this song.</div>';
}

function showSong(title, artist) {
  $('#songPlayerTitle').textContent = title;
  $('#songPlayerArtist').textContent = artist;
  $('#songPlayer').classList.add('visible');
  $('[data-field="song_title"]').value = title;
  $('[data-field="song_artist"]').value = artist;
}

async function runSearch() {
  const q = $('#songSearchInput').value.trim();
  if (!q) return;
  const btn = $('#songSearchBtn'), results = $('#songSearchResults');
  btn.disabled = true;
  results.innerHTML = '<div class="search-loading">Searching…</div>';
  results.classList.add('visible');
  try {
    hits = (await searchSongs(q)).slice(0, 6);
    results.innerHTML = hits.length
      ? hits.map((h, i) => `<button type="button" class="search-result-item" data-i="${i}"><span><span class="search-result-title">${esc(h.title)}</span><span class="search-result-artist">${esc(h.artist)}</span></span></button>`).join('')
      : '<div class="search-loading">No results found. Try a different search.</div>';
  } catch (err) {
    results.innerHTML = `<div class="search-loading">Search error: ${esc(err.message)}</div>`;
  }
  btn.disabled = false;
}

async function selectSong(i) {
  const { title, artist } = hits[i];
  $('#songSearchResults').classList.remove('visible');
  showSong(title, artist);
  mark();
  $('#lyricsBox').textContent = 'Loading lyrics…';
  loadPlayer(title, artist);
  const lyrics = await fetchLyrics(title, artist);
  lyrics ? showLyrics(lyrics) : showLyricsMissing();
  mark();
}

function changeSong() {
  $('#songPlayer').classList.remove('visible');
  $('#lyricsPanel').classList.remove('visible');
  $('#ytAudioWrap').innerHTML = '';
  $('#lyricsColLeft').innerHTML = '<div class="lyrics-box-empty">Lyrics will appear here once you select a song.</div>';
  $('#songLyricsAutoField').value = '';
  $('[data-field="song_title"]').value = '';
  $('[data-field="song_artist"]').value = '';
  $('#songSearchInput').value = '';
  $('#songSearchInput').focus();
  mark();
}

export default {
  ...bySlug('lyric-analysis'),
  savedNoun: 'Saved lyric analyses',
  render,

  init(ctx) {
    root = ctx.root; mark = ctx.markDirty;
    $('#songSearchBtn').addEventListener('click', runSearch);
    $('#songSearchInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
    $('#songSearchResults').addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (b) selectSong(Number(b.dataset.i));
    });
    $('#songChange').addEventListener('click', changeSong);
    $('#addLyricBtn').addEventListener('click', () => { addBlock(); mark(); });
    $('#lyricBlocks').addEventListener('click', e => {
      if (!e.target.closest('[data-action="remove-block"]')) return;
      e.target.closest('.lyric-block').remove();
      renumberBlocks(); mark();
    });
  },

  collect() {
    const data = collectFields(root, '.lyric-block');
    // Renumber by on-screen order so removed selections never leave gaps
    root.querySelectorAll('#lyricBlocks .lyric-block').forEach((block, i) => {
      block.querySelectorAll('[data-sub]').forEach(el => { data[`lyric_${i + 1}_${el.dataset.sub}`] = el.value; });
    });
    return { schema: 1, data };
  },

  restore(payload) {
    const data = payload.data || {};
    restoreFields(root, data, '.lyric-block');
    // Rebuild selections: any lyric_N_* key counts, even if an earlier N is missing
    const ns = new Set();
    Object.keys(data).forEach(k => { const m = k.match(/^lyric_(\d+)_/); if (m) ns.add(Number(m[1])); });
    [...ns].sort((a, b) => a - b).slice(0, MAX_BLOCKS).forEach(n => {
      const block = addBlock();
      block.querySelectorAll('[data-sub]').forEach(el => { el.value = data[`lyric_${n}_${el.dataset.sub}`] || ''; });
    });
    if (data.song_title && data.song_artist) {
      showSong(data.song_title, data.song_artist);
      loadPlayer(data.song_title, data.song_artist);
      if (data.song_lyrics_auto) showLyrics(data.song_lyrics_auto);
      else if (data.song_lyrics_manual) showLyrics(data.song_lyrics_manual);
      else fetchLyrics(data.song_title, data.song_artist).then(l => l ? showLyrics(l) : showLyricsMissing());
    }
  },
};
