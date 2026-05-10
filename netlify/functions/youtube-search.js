/**
 * /.netlify/functions/youtube-search.js
 *
 * Resolves a song search query to a YouTube video ID.
 * Checks a Supabase cache table first to preserve API quota.
 * Falls through to YouTube Data API v3 on cache miss.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl        = process.env.SUPABASE_URL || 'https://lrjuufvrgkuvfxcmybtf.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const youtubeApiKey      = process.env.YOUTUBE_API_KEY;

if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normaliseQuery(q) {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

export async function handler(event) {
  const raw = event.queryStringParameters?.q;
  if (!raw) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query parameter q' }) };
  }

  const query = normaliseQuery(raw);

  // ── 1. Check cache ──────────────────────────────────
  const { data: cached, error: cacheErr } = await supabase
    .from('youtube_cache')
    .select('video_id, title')
    .eq('query', query)
    .maybeSingle();

  if (cacheErr) {
    console.warn('Cache lookup error:', cacheErr.message);
    // Non-fatal — fall through to API
  }

  if (cached) {
    console.log(`Cache hit: "${query}" → ${cached.video_id}`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: cached.video_id,
        title:   cached.title,
        source:  'cache',
      }),
    };
  }

  // ── 2. Cache miss — call YouTube API ────────────────
  if (!youtubeApiKey) {
    console.error('YOUTUBE_API_KEY not configured');
    return {
      statusCode: 200,
      body: JSON.stringify({ videoId: null, error: 'YouTube API not configured' }),
    };
  }

  console.log(`Cache miss: "${query}" — calling YouTube API`);

  const ytUrl = `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&q=${encodeURIComponent(query)}&type=video` +
    `&maxResults=1&key=${youtubeApiKey}`;

  let videoId = null;
  let title   = null;

  try {
    const res  = await fetch(ytUrl);
    const data = await res.json();

    if (data.error) {
      console.error('YouTube API error:', data.error.message);
      return {
        statusCode: 200,
        body: JSON.stringify({ videoId: null, error: data.error.message }),
      };
    }

    videoId = data.items?.[0]?.id?.videoId   || null;
    title   = data.items?.[0]?.snippet?.title || null;
  } catch (err) {
    console.error('YouTube fetch error:', err.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ videoId: null, error: err.message }),
    };
  }

  // ── 3. Save to cache (including null results) ───────
  const { error: insertErr } = await supabase
    .from('youtube_cache')
    .upsert({ query, video_id: videoId, title }, { onConflict: 'query' });

  if (insertErr) {
    console.warn('Cache write error:', insertErr.message);
    // Non-fatal — still return the result
  }

  console.log(`YouTube API result: "${query}" → ${videoId}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId, title, source: 'api' }),
  };
}
