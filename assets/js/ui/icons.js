/**
 * assets/js/ui/icons.js  (plain script, exposes window.silIcons)
 *
 * One icon set for the whole site (Lucide, see /assets/icons/sprite.svg).
 *
 *   In HTML:   <span data-icon="play"></span>          -> becomes the play icon
 *   In JS:     silIcons.html('pause')                  -> '<svg class="icon">…</svg>' string
 *              silIcons.set(element, 'play')           -> replaces the icon inside an element
 *
 * Icons are decoration. The words next to them carry the meaning, and the icon is hidden from
 * screen readers. A button with only an icon must have an aria-label.
 */
(function () {
  'use strict';
  var SPRITE = '/assets/icons/sprite.svg';
  function html(name, size) {
    var s = size ? ' style="width:' + size + ';height:' + size + '"' : '';
    return '<svg class="icon" aria-hidden="true" focusable="false"' + s + '><use href="' + SPRITE + '#' + name + '"></use></svg>';
  }
  function set(el, name, size) {
    if (!el) return;
    var old = el.querySelector(':scope > svg.icon');
    if (old) old.outerHTML = html(name, size); else el.insertAdjacentHTML('afterbegin', html(name, size));
  }
  function hydrate(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      var name = el.getAttribute('data-icon');
      if (!name || el.__silIcon === name) return;
      el.__silIcon = name;
      el.innerHTML = html(name, el.getAttribute('data-icon-size'));
    });
  }
  window.silIcons = { html: html, set: set, hydrate: hydrate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  else hydrate();
})();
