/**
 * /assets/js/worksheets/player.js
 * Sticky mini-player for a queue of YouTube tracks.
 *
 *   const player = createPlayer();
 *   player.play(queue, startIndex)  // queue: [{ id, title, artist, videoId, context? }]
 *   player.stop(); player.currentId
 *
 * Also wires the Media Session API (lock-screen / headset controls and
 * track info). NOTE: a YouTube *embed* is paused by most mobile browsers once
 * the screen locks or the tab is backgrounded; Media Session cannot override
 * that. The page offers "Open in YouTube" for listening with the screen off.
 */
import { esc } from './core.js';
import { icons } from './icons.js';

let apiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('Could not load the YouTube player')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function createPlayer({ onChange } = {}) {
  let queue = [];
  let index = -1;
  let yt = null;
  let ytReady = null;
  let playing = false;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="stickyPlayer" hidden role="region" aria-label="Music player">
      <div id="stickyPlayerHeader">
        <div id="stickyPlayerMeta">
          <div id="stickyPlayerTitle">—</div>
          <div id="stickyPlayerArtist"></div>
        </div>
        <div id="stickyPlayerControls">
          <button type="button" id="spPrev" aria-label="Previous track">${icons.prev}</button>
          <button type="button" id="spToggle" aria-label="Play or pause">${icons.pause}</button>
          <button type="button" id="spNext" aria-label="Next track">${icons.next}</button>
          <button type="button" id="spCollapse" aria-label="Hide video" aria-expanded="true">${icons.chevronDown}</button>
          <button type="button" id="spClose" aria-label="Close player">${icons.close}</button>
        </div>
      </div>
      <div id="stickyVideoWrap"><div id="ytStickyPlayer"></div></div>
    </div>`);
  const $ = id => document.getElementById(id);
  const box = $('stickyPlayer');

  function setPlayingUi(p) {
    playing = p;
    $('spToggle').innerHTML = p ? icons.pause : icons.play;
    $('spToggle').setAttribute('aria-label', p ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
  }

  function setMediaSession(t) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title || '', artist: t.artist || '', album: t.context || 'Music Autobiography',
        artwork: t.videoId ? [{ src: `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }] : [],
      });
      const h = (name, fn) => { try { navigator.mediaSession.setActionHandler(name, fn); } catch {} };
      h('play', () => yt && yt.playVideo());
      h('pause', () => yt && yt.pauseVideo());
      h('previoustrack', prev);
      h('nexttrack', next);
    } catch {}
  }

  async function ensurePlayer() {
    if (ytReady) return ytReady;
    ytReady = loadYouTubeApi().then(() => new Promise(resolve => {
      yt = new window.YT.Player('ytStickyPlayer', {
        width: '100%', height: '100%',
        playerVars: { controls: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => resolve(yt),
          onStateChange: e => {
            const S = window.YT.PlayerState;
            if (e.data === S.ENDED) next();
            setPlayingUi(e.data === S.PLAYING || e.data === S.BUFFERING);
          },
          onError: () => { if (index < queue.length - 1) next(); },
        },
      });
    })).catch(err => { ytReady = null; throw err; });
    return ytReady;
  }

  async function load(i) {
    if (i < 0 || i >= queue.length) return;
    index = i;
    const t = queue[i];
    box.hidden = false;
    document.body.classList.add('has-sticky-player');
    $('stickyPlayerTitle').textContent = t.title || '—';
    $('stickyPlayerArtist').textContent = t.videoId ? (t.artist || '') : `${t.artist || ''} (no video found)`;
    $('spPrev').disabled = i === 0;
    $('spNext').disabled = i === queue.length - 1;
    setMediaSession(t);
    onChange && onChange(t.id);
    if (!t.videoId) { if (i < queue.length - 1) setTimeout(() => { if (index === i) next(); }, 1200); return; }
    try {
      const p = await ensurePlayer();
      if (index !== i) return; // user moved on while the API loaded
      p.loadVideoById(t.videoId);
    } catch (err) {
      $('stickyPlayerArtist').textContent = err.message;
    }
  }

  function next() { if (index < queue.length - 1) load(index + 1); }
  function prev() { if (index > 0) load(index - 1); }

  function stop() {
    if (yt && yt.stopVideo) { try { yt.stopVideo(); } catch {} }
    box.hidden = true;
    document.body.classList.remove('has-sticky-player');
    index = -1; queue = [];
    setPlayingUi(false);
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch {} }
    onChange && onChange(null);
  }

  $('spPrev').addEventListener('click', prev);
  $('spNext').addEventListener('click', next);
  $('spClose').addEventListener('click', stop);
  $('spToggle').addEventListener('click', () => { if (!yt) return; playing ? yt.pauseVideo() : yt.playVideo(); });
  $('spCollapse').addEventListener('click', () => {
    const collapsed = $('stickyVideoWrap').classList.toggle('collapsed');
    $('spCollapse').innerHTML = collapsed ? icons.chevronUp : icons.chevronDown;
    $('spCollapse').setAttribute('aria-label', collapsed ? 'Show video' : 'Hide video');
    $('spCollapse').setAttribute('aria-expanded', String(!collapsed));
  });

  return {
    play(q, start = 0) { queue = q.slice(); $('stickyVideoWrap').classList.remove('collapsed'); load(start); },
    stop,
    /** If the current track was removed/moved, keep the queue pointing at the right item. */
    updateQueue(q) {
      const cur = queue[index]?.id;
      queue = q.slice();
      const i = queue.findIndex(t => t.id === cur);
      index = i;
    },
    get currentId() { return queue[index]?.id || null; },
  };
}
