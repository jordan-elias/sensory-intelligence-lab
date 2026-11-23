/**
 * /assets/js/ambience/drift.js
 * Drift mode: the tiles the person switched on become a pool, and every few bars the mix changes a little by rules, so it moves
 * without ever becoming a mess. Plain functions (given a random generator) so the rules can be tested without any audio.
 *
 *  - Music changes only on phrase boundaries, one change at a time, and never beyond the cap for the chosen density.
 *  - Nothing changes again too soon after it changed (a cooldown), and pinned tiles never drop out.
 *  - Beds (nature, noise, spoken) come and go more slowly, and there is never silence while anything is switched on.
 *  - Spoken word comes in rarely, stays a few phrases, then leaves.
 */
export const DENSITY = { sparse: { maxMusic: 2, change: 0.45, bed: 0.15 }, medium: { maxMusic: 3, change: 0.6, bed: 0.22 }, full: { maxMusic: 4, change: 0.75, bed: 0.3 } };
/** Bars between decisions. */
export const PACE = { slow: 8, medium: 4 };
export const DEFAULT_DENSITY = 'medium', DEFAULT_PACE = 'medium';
const MUSIC_COOL = 2, BED_COOL = 3, VAR_COOL = 2, SPOKEN_COOL = 6;
const isBed = id => !id.startsWith('music:');
const rowOf = id => id.split(':')[1];

/**
 * The state of a drift. `music` maps a row to its sounding { option, variation }; `beds` lists sounding bed ids;
 * `since` maps ids and rows to the phrase they last changed; `spokenLeft` counts phrases of spoken word still to play.
 */
export const emptyState = () => ({ music: {}, beds: [], since: {}, phrase: 0, spokenLeft: 0 });

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
const selectedMusic = sel => sel.filter(id => id.startsWith('music:')).map(id => ({ row: id.split(':')[1], option: id.split(':')[2], id }));

/** Where a drift starts: every selected bed, and one music row (a pinned one if there is one) so it begins gently. */
export function startState(sel, { pinned = [], density = DEFAULT_DENSITY } = {}, r = Math.random) {
  const st = emptyState(), cap = DENSITY[density].maxMusic;
  st.beds = sel.filter(isBed).filter(id => !id.startsWith('spoken:') || pinned.includes(id));
  const music = selectedMusic(sel), pin = music.filter(m => pinned.includes(m.id)), rest = music.filter(m => !pinned.includes(m.id));
  const first = pin.length ? pin : rest.length ? [pick(rest, r)] : [];
  for (const m of first.slice(0, cap)) st.music[m.row] = { option: m.option, variation: 0 };
  return st;
}

/** Makes sure what sounds is still switched on, adding anything pinned. Used when the person changes the selection mid-drift. */
export function reconcile(st, sel, pinned = []) {
  const out = { ...st, music: {}, beds: st.beds.filter(id => sel.includes(id)) };
  for (const m of selectedMusic(sel)) if (st.music[m.row]?.option === m.option) out.music[m.row] = st.music[m.row];
  for (const id of pinned) if (sel.includes(id) && isBed(id) && !out.beds.includes(id)) out.beds.push(id);
  for (const m of selectedMusic(sel)) if (pinned.includes(m.id) && !out.music[m.row]) out.music[m.row] = { option: m.option, variation: 0 };
  return out;
}

/** The state after one decision (one phrase boundary). Never changes `st`. */
export function step(st, sel, { pinned = [], density = DEFAULT_DENSITY } = {}, r = Math.random) {
  const D = DENSITY[density] || DENSITY[DEFAULT_DENSITY], cap = D.maxMusic;
  const s = { music: { ...st.music }, beds: st.beds.slice(), since: { ...st.since }, phrase: st.phrase + 1, spokenLeft: st.spokenLeft };
  const ph = s.phrase, cool = (key, n) => ph - (s.since[key] ?? -99) >= n, mark = key => { s.since[key] = ph; };

  // Anything no longer switched on stops sounding; anything pinned always sounds.
  const music = selectedMusic(sel);
  for (const row of Object.keys(s.music)) if (!music.some(m => m.row === row && m.option === s.music[row].option)) delete s.music[row];
  s.beds = s.beds.filter(id => sel.includes(id));
  for (const id of pinned) { if (!sel.includes(id)) continue; if (isBed(id)) { if (!s.beds.includes(id)) s.beds.push(id); } else { const m = music.find(x => x.id === id); if (m && !s.music[m.row]) s.music[m.row] = { option: m.option, variation: 0 }; } }

  const bedPool = sel.filter(isBed), musicNow = () => Object.keys(s.music), pinnedRow = row => pinned.some(p => !isBed(p) && rowOf(p) === row);

  // Spoken word: it leaves when its turn is up, and comes in rarely.
  for (const id of bedPool.filter(x => x.startsWith('spoken:'))) {
    if (s.beds.includes(id)) { s.spokenLeft -= 1; if (s.spokenLeft <= 0 && !pinned.includes(id)) { s.beds = s.beds.filter(x => x !== id); mark(id); } }
    else if (cool(id, SPOKEN_COOL) && r() < 0.15) { s.beds.push(id); s.spokenLeft = 3 + Math.floor(r() * 3); mark(id); }
  }

  // Nature and noise: now and then one slips out or comes back in, slowly.
  if (r() < D.bed) {
    const movable = bedPool.filter(id => !id.startsWith('spoken:') && !pinned.includes(id) && cool(id, BED_COOL));
    if (movable.length) {
      const id = pick(movable, r);
      if (s.beds.includes(id)) { if (s.beds.length + musicNow().length > 1) { s.beds = s.beds.filter(x => x !== id); mark(id); } }
      else { s.beds.push(id); mark(id); }
    }
  }

  // Music: at most one row comes or goes, within the cap.
  if (r() < D.change) {
    const now = musicNow(), canAdd = music.filter(m => !s.music[m.row] && cool(m.row, MUSIC_COOL)), canDrop = now.filter(row => !pinnedRow(row) && cool(row, MUSIC_COOL));
    let add = canAdd.length > 0 && now.length < cap, drop = canDrop.length > 0 && now.length > 0 && (s.beds.length > 0 || now.length > 1);
    if (add && drop) add = r() < (now.length < 2 ? 0.7 : 0.4);
    if (add) { const m = pick(canAdd, r); s.music[m.row] = { option: m.option, variation: 0 }; mark(m.row); }
    else if (drop) { const row = pick(canDrop, r); delete s.music[row]; mark(row); }
  }

  // A sounding row sometimes plays a different variation.
  if (r() < 0.35) {
    const rows = musicNow().filter(row => cool('var:' + row, VAR_COOL));
    if (rows.length) { const row = pick(rows, r); s.music[row] = { ...s.music[row], variation: (s.music[row].variation + 1 + Math.floor(r() * 2)) % 3 }; mark('var:' + row); }
  }

  // Never silent while something is switched on.
  if (s.beds.length === 0 && musicNow().length === 0 && sel.length) {
    const beds = bedPool.filter(id => !id.startsWith('spoken:'));
    if (beds.length) s.beds.push(pick(beds, r)); else if (music.length) { const m = pick(music, r); s.music[m.row] = { option: m.option, variation: 0 }; }
  }
  return s;
}

/** Tiles that sound right now, as ids. */
export const soundingIds = st => [...Object.entries(st.music).map(([row, m]) => `music:${row}:${m.option}`), ...st.beds];
