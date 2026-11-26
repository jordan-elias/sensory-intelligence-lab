/**
 * /assets/js/oramics/inks.js
 * The five inks. Each ink is a layer of the picture and a part of the music: a colour you paint with, a job in the sound,
 * and four shades that are four different voices for that job. Plain data; the page, the engine and the saved files all read it.
 */
export const INK_ORDER = ['melody', 'harmony', 'bass', 'rhythm', 'texture'];

export const INKS = {
  melody: {
    name: 'Melody', short: 'Voice', role: 'A single singing line.',
    how: 'Height is pitch. A thicker stroke is louder. Where you lift the brush, it falls silent.',
    range: { lo: 130.8, hi: 2093 },     // C3 to C7
    shades: [{ name: 'Soft', color: '#f2b632' }, { name: 'Flute', color: '#f08a24' }, { name: 'Strings', color: '#e8c95a' }, { name: 'Reed', color: '#d9742b' }],
  },
  harmony: {
    name: 'Harmony', short: 'Chords', role: 'Paint blobs to make chords.',
    how: 'Every separate band in a column is a note. Stack three bars to make a chord. Notes always land on the key.',
    range: { lo: 98, hi: 1046.5 },      // G2 to C6
    shades: [{ name: 'Warm', color: '#9b6ee0' }, { name: 'Choir', color: '#b58cf0' }, { name: 'Organ', color: '#7a58c8' }, { name: 'Glass', color: '#c9a8ff' }],
  },
  bass: {
    name: 'Bass', short: 'Low', role: 'The low line underneath.',
    how: 'Height is pitch, in the low register. A thicker stroke is louder.',
    range: { lo: 41.2, hi: 261.6 },     // E1 to C4
    shades: [{ name: 'Sub', color: '#4b7fe0' }, { name: 'Round', color: '#3a6bd0' }, { name: 'Growl', color: '#5a93f0' }, { name: 'Pulse', color: '#2f5cc0' }],
  },
  rhythm: {
    name: 'Rhythm', short: 'Beat', role: 'Taps and dabs become drum hits.',
    how: 'Each new mark is a hit. Low is a kick, higher is a drum, snare, then hats. Tall marks hit several at once.',
    range: { lo: 1, hi: 2 },
    shades: [{ name: 'Soft', color: '#e5584f' }, { name: 'Electro', color: '#ff6b5e' }, { name: 'Wood', color: '#d4533f' }],
  },
  texture: {
    name: 'Texture', short: 'Air', role: 'A wash of filtered noise.',
    how: 'Height sets how bright it is. A thicker stroke is louder. Good for wind, rain and shimmer.',
    range: { lo: 140, hi: 9000 },
    shades: [{ name: 'Air', color: '#2fb5ad' }, { name: 'Wind', color: '#4cc4a6' }, { name: 'Shimmer', color: '#6fd8d0' }, { name: 'Rumble', color: '#1f9a96' }],
  },
};
export const shadeCount = id => INKS[id].shades.length;
export const inkColor = (id, shade = 0) => INKS[id].shades[Math.max(0, Math.min(shadeCount(id) - 1, shade | 0))].color;
