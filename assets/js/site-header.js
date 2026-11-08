/**
 * assets/js/site-header.js
 *
 * The one header for every signed-in page. Put this where the header should appear:
 *
 *   <link rel="stylesheet" href="/assets/css/header.css">
 *   ...
 *   <script src="/assets/js/site-header.js"></script>
 *
 * It writes the header in place, marks the current page, runs the mobile menu and signs out
 * (locking the vault first). Role links (Clients, Messages) are added to the same nav by
 * assets/js/nav-links.js once the person is known.
 */
(function () {
  'use strict';
  var me = document.currentScript;
  var header = document.createElement('header');
  header.className = 'sil-header';
  header.innerHTML =
    '<a class="sil-header__wordmark" href="/dashboard/">Sensory Intelligence Lab</a>' +
    '<button class="sil-header__toggle" id="silMenuToggle" aria-label="Toggle navigation" aria-expanded="false" type="button">' +
    '<span></span><span></span><span></span></button>' +
    '<nav class="sil-header__nav" id="silNav">' +
    '<a href="/dashboard/">Dashboard</a>' +
    '<a href="/account/">Account</a>' +
    '<a href="/booking/">Book a session</a>' +
    '<button class="sil-header__signout" id="silSignOut" type="button">Sign out</button>' +
    '</nav>';
  if (me && me.parentNode) me.parentNode.insertBefore(header, me); else document.body.insertBefore(header, document.body.firstChild);

  // Skip link for keyboard and screen-reader users (styled in a11y.css).
  var skip = document.createElement('a');
  skip.className = 'skip-link'; skip.href = '#main'; skip.textContent = 'Skip to content';
  header.parentNode.insertBefore(skip, header);
  function wireSkip() {
    var main = document.querySelector('main');
    if (!main) { skip.remove(); return; }
    if (!main.id) main.id = 'main';
    main.setAttribute('tabindex', '-1');
    skip.setAttribute('href', '#' + main.id);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireSkip); else wireSkip();

  var path = window.location.pathname.replace(/index\.html$/, '').replace(/\/$/, '') || '/';
  var nav = header.querySelector('#silNav');
  nav.querySelectorAll('a').forEach(function (a) {
    var href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/';
    if (href === path) a.classList.add('sil-active');
    a.addEventListener('click', function () { nav.classList.remove('sil-open'); });
  });

  var toggle = header.querySelector('#silMenuToggle');
  toggle.addEventListener('click', function () {
    var open = nav.classList.toggle('sil-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  header.querySelector('#silSignOut').addEventListener('click', async function () {
    this.disabled = true;
    this.textContent = 'Signing out…';
    try { var gate = await import('/assets/js/vault/gate.js'); await gate.lockVault(); } catch (e) { /* signing out anyway */ }
    try {
      var sb = window._supabase;
      if (!sb) {
        var lib = await import('/assets/js/vendor/supabase-js.js');
        sb = lib.createClient('https://lrjuufvrgkuvfxcmybtf.supabase.co', 'sb_publishable_VyiIJOgsGueUOVU_ed49-Q_rS4mi7J1');
      }
      await sb.auth.signOut();
    } finally {
      window.location.replace('/');
    }
  });
})();
