/**
 * /assets/js/spatial/daily.js
 * Pure helpers for the spatial game: the day's fixed trials, and the rooms.
 * Nothing here touches the network, the page or the audio.
 */
import { dailySeed } from '../experiments/seeds-core.js';

/** The same number for the same day, level and trial on every device, so everyone hears the same paths today. */
export const trialSeed = (dateStr, level, trial) => dailySeed(dateStr, `spatial|${level}|${trial}`);

/** Rooms for Resonance Audio: size in metres and a surface for each wall. Only the first one counts towards best scores. */
const W = (s) => ({ left: s, right: s, front: s, back: s });
export const ROOMS = {
  studio:    { label: 'Small room (usual)', size: { width: 7, height: 3.5, depth: 7 },    materials: { ...W('brick-bare'), down: 'concrete-block-coarse', up: 'acoustic-ceiling-tiles' } },
  dry:       { label: 'Dry booth',          size: { width: 3, height: 2.5, depth: 3 },    materials: { ...W('curtain-heavy'), down: 'curtain-heavy', up: 'acoustic-ceiling-tiles' } },
  hall:      { label: 'Wooden hall',        size: { width: 14, height: 7, depth: 20 },    materials: { ...W('plaster-smooth'), down: 'parquet-on-concrete', up: 'wood-ceiling' } },
  cathedral: { label: 'Stone cathedral',    size: { width: 24, height: 20, depth: 40 },   materials: { ...W('marble'), down: 'polished-concrete-or-tile', up: 'marble' } },
};
export const DEFAULT_ROOM = 'studio';
export const roomKey = k => (Object.hasOwn(ROOMS, k) ? k : DEFAULT_ROOM);
