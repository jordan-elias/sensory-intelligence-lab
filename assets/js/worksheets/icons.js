/** /assets/js/worksheets/icons.js — small inline SVG icons (no emoji). Use with aria-label on the button. */
const svg = (d, extra = '') =>
  `<svg class="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const icons = {
  grip:    svg('<circle cx="6" cy="4" r=".8" fill="currentColor"/><circle cx="10" cy="4" r=".8" fill="currentColor"/><circle cx="6" cy="8" r=".8" fill="currentColor"/><circle cx="10" cy="8" r=".8" fill="currentColor"/><circle cx="6" cy="12" r=".8" fill="currentColor"/><circle cx="10" cy="12" r=".8" fill="currentColor"/>'),
  more:    svg('<circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/>'),
  up:      svg('<path d="M4 10l4-4 4 4"/>'),
  down:    svg('<path d="M4 6l4 4 4-4"/>'),
  play:    svg('<path d="M5 3.5v9l7-4.5z" fill="currentColor"/>'),
  pause:   svg('<path d="M5 3.5v9M11 3.5v9"/>'),
  prev:    svg('<path d="M11 3.5v9l-6-4.5zM4 3.5v9"/>'),
  next:    svg('<path d="M5 3.5v9l6-4.5zM12 3.5v9"/>'),
  close:   svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  chevronDown: svg('<path d="M4 6l4 4 4-4"/>'),
  chevronUp:   svg('<path d="M4 10l4-4 4 4"/>'),
};
