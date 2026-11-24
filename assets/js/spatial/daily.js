/**
 * /assets/js/spatial/daily.js
 * Pure helpers for the spatial game: the day's fixed trials, and the listening room.
 * Nothing here touches the network, the page or the audio.
 */
import { dailySeed } from '../experiments/seeds-core.js';

/** The same number for the same day, level and trial on every device, so everyone hears the same paths today. */
export const trialSeed = (dateStr, level, trial) => dailySeed(dateStr, `spatial|${level}|${trial}`);

/**
 * The one listening space. Nearly anechoic (soft, absorbent surfaces): the sounds seem to be in open air around you, and no reverb tail
 * smears where they are. A room's echoes help sound feel natural but blur the very thing this game asks you to follow.
 * (Sizes in metres; a surface for each wall.)
 */
export const LISTENING_ROOM = {
  size: { width: 8, height: 4, depth: 8 },
  materials: { left: 'transparent', right: 'transparent', front: 'transparent', back: 'transparent', down: 'grass', up: 'transparent' },
};
