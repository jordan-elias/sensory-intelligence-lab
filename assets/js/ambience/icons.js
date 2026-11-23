/**
 * /assets/js/ambience/icons.js
 * One simple line icon per sound (24 x 24, drawn with strokes so they take the page's colour). Decoration only: every tile also has a text label.
 */
const I = {
  'music:drums:lofi': '<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9"/><path d="M9 4l3 4M15 4l-3 4"/>',
  'music:drums:soft': '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  'music:drums:heart': '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z"/>',
  'music:bass:sub': '<path d="M2 12c3-8 6-8 10 0s7 8 10 0"/>',
  'music:bass:pulse': '<path d="M5 18V9M10 18V5M15 18V12M20 18V8"/>',
  'music:chords:warm': '<path d="M5 8h14M5 12h14M5 16h14"/>',
  'music:chords:open': '<path d="M5 7h14M5 12h8M5 17h14"/>',
  'music:melody:pluck': '<path d="M3 17l4-8 4 5 4-9 4 12"/>',
  'music:melody:bells': '<path d="M6 17h12l-1.5-2v-4a4.5 4.5 0 0 0-9 0v4L6 17z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  'music:pad:air': '<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A4.5 4.5 0 0 1 17 18H7z"/>',
  'music:pad:deep': '<path d="M3 10c3 0 3 4 6 4s3-4 6-4 3 4 6 4"/><path d="M3 17c3 0 3 3 6 3s3-3 6-3 3 3 6 3"/>',
  'nature:ocean': '<path d="M2 9c3-3 5 3 10 0s7 3 10 0M2 15c3-3 5 3 10 0s7 3 10 0"/>',
  'nature:rain': '<path d="M7 13a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1A4.5 4.5 0 0 1 17 13H7z"/><path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3"/>',
  'nature:birds': '<path d="M3 9c3 0 4 2 6 2 2 0 3-2 6-2M10 17c2 0 3 1 5 1 2 0 3-1 5-1"/>',
  'nature:stream': '<path d="M4 5c4 3 4 6 0 9M10 5c4 3 4 6 0 9M16 5c4 3 4 6 0 9M4 16c4 3 4 5 0 6"/>',
  'nature:fire': '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  'noise:pink': '<path d="M3 12h2l1-4 2 8 2-10 2 12 2-8 1 4h5"/>',
  'noise:brown': '<path d="M3 12c2 0 2-5 4-5s2 10 4 10 2-5 4-5 2 0 3 0"/>',
  'noise:white': '<path d="M3 12l1-3 1 6 1-8 1 10 1-9 1 7 1-6 1 8 1-10 1 9 1-5 1 3h3"/>',
  'noise:wind': '<path d="M3 9h10a3 3 0 1 0-3-3M3 14h14a3 3 0 1 1-3 3M3 19h7"/>',
};
/** The SVG markup for a tile, with a plain speech-bubble for any spoken-word sound. */
export function icon(id) {
  const body = I[id] || (id.startsWith('spoken:') ? '<path d="M4 5h16v11H9l-5 4V5z"/>' : '<circle cx="12" cy="12" r="7"/>');
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const KNOWN_ICONS = Object.keys(I);
