/**
 * /assets/js/experiments/studio-tools.js
 * The in-app tools added to the older experiments so each one can be done without a DAW or an instrument:
 * a note editor, a keyboard that records, and a microphone recorder. These are offered in the steps that ask you to
 * make or play something; the rest stay under "Your other tools". Anyone with a DAW can still use that instead.
 */
const editor = (o = {}) => ({ type: 'editor', ...o });
const keys = () => ({ type: 'keys' });
const rec = (label, hint) => ({ type: 'recorder', label, hint });

export const EXTRA = {
  'dice-melody': [editor(), keys()],
  'wrong-tuning': [keys()],
  'five-note-cage': [editor(), keys()],
  'fixed-groove-chords': [editor({ voices: ['soft', 'bass'] }), keys()],
  'fixed-notes-rhythm': [editor(), keys()],
  'nine-feelings': [keys(), rec('Record the way you played it')],
  'borrowed-rhythm': [editor(), rec('Record your version')],
  'random-pitch-fixed-rhythm': [editor({ voices: ['soft'] })],
  'swap-the-track': [editor({ voices: ['soft', 'bass', 'pluck', 'bell'] })],
  'soundscape-seed': [rec('Record a take')],
  'weakest-hand': [keys(), rec('Record it')],
  'subtract': [editor({ voices: ['soft', 'bass', 'pluck'] })],
  'melody-over-chords': [editor({ voices: ['soft', 'bass'] }), keys()],
  'treatment-swap': [rec('Record a version')],
  'borrowed-chords': [editor({ voices: ['soft', 'bass'] }), keys()],
  'borrowed-contour': [editor(), keys()],
  'borrowed-form': [editor({ steps: 32 })],
  'two-notes-and-a-word': [keys(), rec('Record your song')],
  'capstone-three-limits': [editor({ voices: ['soft', 'bass'] }), keys(), rec('Record it')],
  'capstone-loop': [editor({ voices: ['soft', 'bass'] })],
  'capstone-remake': [editor({ voices: ['soft', 'bass'] }), rec('Record it')],
  'capstone-short-piece': [rec('Record it')],
};
export function addStudioTools(experiments) {
  for (const e of experiments) { const more = EXTRA[e.id]; if (more) e.tools = [...(e.tools || []), ...more.map(t => ({ ...t }))]; }
  return experiments;
}
