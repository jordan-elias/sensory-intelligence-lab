# Interface kit

Shared pieces so every page looks and behaves the same. Colours still come from each page's own CSS variables.

## Header
Put `<link rel="stylesheet" href="/assets/css/header.css">` in the head and `<script src="/assets/js/site-header.js"></script>` where the header should appear. Do not copy header markup or styles into a page. Therapist links (Clients, Messages) are added to the same nav by `assets/js/nav-links.js`.

## Buttons (`assets/css/ui.css`)
`.btn` plus one of `.btn--primary`, `.btn--secondary`, `.btn--danger`, `.btn--danger-outline`, `.btn--ghost`. Add `.btn--sm` for small ones, `.btn--icon` for icon-only (needs `aria-label`).

## Icons (`assets/icons/sprite.svg`, `assets/js/ui/icons.js`)
- HTML: `<span data-icon="play"></span>`
- JavaScript: `silIcons.html('pause')` returns the markup; `silIcons.set(el, 'play')` swaps one.
- Add a new icon: add its Lucide name to `scripts/build-icon-sprite.mjs` and rebuild (instructions in that file).
- Icons are decoration. Words carry the meaning; icon-only buttons need an `aria-label`.

## Transport wording
Play, Pause, Stop, Record are always an icon plus the word. "Begin session" is only for exercises that run for a set time (for example breathing patterns). After a pause the button says Resume; after the end it says Begin again (timed) or Play again.

## Audio
Every page that makes sound loads `/assets/js/audio/safe-output.js` first. It adds a limiter and ceiling for live playback and never touches offline renders (exports).
