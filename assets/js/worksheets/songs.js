/**
 * /assets/js/worksheets/songs.js
 * Song search (Genius via Netlify function), YouTube lookup, and lyrics (lrclib).
 */
export const VIDEO_VARIANTS = ['official audio', 'audio', 'lyrics', 'official video', 'live'];

export async function searchSongs(query) {
  const res = await fetch(`/.netlify/functions/genius-search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Search failed');
  const { hits } = await res.json();
  return (hits || []).map(h => ({ title: h.result.title, artist: h.result.primary_artist.name }));
}

function regionCode() {
  try {
    const parts = (navigator.language || '').split('-');
    if (parts.length >= 2) return parts[parts.length - 1].toUpperCase();
  } catch {}
  return null;
}

/** variant = index into VIDEO_VARIANTS (used by "try another version"). */
export async function findVideoId(title, artist, variant = 0) {
  const params = new URLSearchParams({ q: `${title} ${artist} ${VIDEO_VARIANTS[variant % VIDEO_VARIANTS.length]}` });
  const rc = regionCode();
  if (rc) params.set('regionCode', rc);
  try {
    const res = await fetch(`/.netlify/functions/youtube-search?${params}`);
    const data = await res.json();
    return data.videoId || null;
  } catch (err) {
    console.warn('Video lookup failed:', err);
    return null;
  }
}

export async function fetchLyrics(title, artist) {
  try {
    const res = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`);
    if (!res.ok) return '';
    const d = await res.json();
    return d.plainLyrics || (d.syncedLyrics || '').replace(/\[\d+:\d+\.\d+\]\s?/g, '') || '';
  } catch { return ''; }
}

export const embedUrl = id =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?controls=1&rel=0&modestbranding=1&playsinline=1`;
export const watchUrl = id => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

/** Opens as a temporary playlist in YouTube (and the YouTube app on phones). */
export const playlistUrl = ids => `https://www.youtube.com/watch_videos?video_ids=${ids.map(encodeURIComponent).join(',')}`;
