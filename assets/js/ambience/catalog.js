/**
 * /assets/js/ambience/catalog.js
 * What Ambience offers, in plain data. Music is all generated and shares one clock; the atmosphere layers (nature, noise,
 * spoken word) are free-running and sit over the music. Every family has a limit on how many can sound at once:
 * one choice per music row, up to two nature sounds, one noise, one spoken voice.
 */

/** Music rows. One option per row can sound at a time; choosing another replaces it. */
export const MUSIC = [
  { id: 'drums', label: 'Drums', options: [{ id: 'lofi', label: 'Lofi' }, { id: 'soft', label: 'Soft' }, { id: 'heart', label: 'Heartbeat' }] },
  { id: 'bass', label: 'Bass', options: [{ id: 'sub', label: 'Sub' }, { id: 'pulse', label: 'Pulse' }] },
  { id: 'chords', label: 'Chords', options: [{ id: 'warm', label: 'Warm' }, { id: 'open', label: 'Open' }] },
  { id: 'melody', label: 'Melody', options: [{ id: 'pluck', label: 'Pluck' }, { id: 'bells', label: 'Bells' }] },
  { id: 'pad', label: 'Pad', options: [{ id: 'air', label: 'Air' }, { id: 'deep', label: 'Deep' }] },
];

/** Recorded nature loops. `src` lists files to try in order; a sound whose file is missing is simply not shown. */
export const NATURE = [
  { id: 'ocean', label: 'Ocean', src: ['/audio/ocean.mp3', '/audio/ambience/ocean.m4a'] },
  { id: 'rain', label: 'Rain', src: ['/audio/rain.mp3', '/audio/ambience/rain.m4a'] },
  { id: 'birds', label: 'Birds', src: ['/audio/maskers/nature.mp3'] },   // the same recording as the Cocktail Party Problem game
  { id: 'stream', label: 'Stream', src: ['/audio/stream.mp3', '/audio/ambience/stream.m4a'] },
  { id: 'fire', label: 'Fire', src: ['/audio/fire.mp3', '/audio/ambience/fire.m4a'] },
];

/** Generated noise. */
export const NOISE = [
  { id: 'pink', label: 'Pink' }, { id: 'brown', label: 'Brown' }, { id: 'white', label: 'White' }, { id: 'wind', label: 'Wind' },
];

/** Recorded spoken word (public-domain readings). These are long, so they are streamed rather than loaded whole, and they carry on from where they left off. */
export const SPOKEN = [
  { id: 'lookingglass', label: 'Looking-Glass', src: ['/audio/lookingglass.mp3'] },        // Through the Looking-Glass, chapter 1
  { id: 'montechristo', label: 'Monte Cristo', src: ['/audio/montechristo.mp3'] },        // The Count of Monte Cristo, chapter 1
  { id: 'potatoes', label: 'Potatoes', src: ['/audio/potatoes.mp3'] },                    // Twenty ways of cooking potatoes
];

/** The tempo and key each feel sets. Everything generated follows it. `bpm` is quarter notes per minute. */
export const FEELS = [
  { id: 'calm', label: 'Calm', bpm: 66, root: 9, mode: 'minor' },    // A minor
  { id: 'warm', label: 'Warm', bpm: 76, root: 2, mode: 'dorian' },   // D dorian
  { id: 'dreamy', label: 'Dreamy', bpm: 60, root: 5, mode: 'lydian' }, // F lydian
];
export const DEFAULT_FEEL = 'calm';

export const MAX_NATURE = 2;

/** Tile ids: music:<row>:<option>, nature:<id>, noise:<id>, spoken:<id>. */
export const tileId = (family, ...parts) => [family, ...parts].join(':');
export function allTiles({ nature = NATURE, spoken = SPOKEN } = {}) {
  const t = [];
  for (const r of MUSIC) for (const o of r.options) t.push({ id: tileId('music', r.id, o.id), family: 'music', row: r.id, label: o.label });
  for (const n of nature) t.push({ id: tileId('nature', n.id), family: 'nature', label: n.label });
  for (const n of NOISE) t.push({ id: tileId('noise', n.id), family: 'noise', label: n.label });
  for (const n of spoken) t.push({ id: tileId('spoken', n.id), family: 'spoken', label: n.label });
  return t;
}
/** Where a tile's settings (volume, pan, reverb) live: one set per music row, one per other tile. */
export const strip = id => (id.startsWith('music:') ? id.split(':').slice(0, 2).join(':') : id);
