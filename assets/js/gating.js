/**
 * /assets/js/gating.js
 *
 * Shared module for tier-based access control.
 * Checks whether the current user has paid access and applies
 * a lock overlay + upgrade banner to gated content if not.
 *
 * Usage on any gated page:
 *
 *   import { applyGatingOnReady } from '/assets/js/gating.js';
 *
 *   applyGatingOnReady({
 *     targetSelector: '#myInteractiveSection',
 *     moduleName: 'soundscape-machine',
 *   });
 *
 * If the user is a paid or beta user, applyGating() does nothing.
 * If the user is on the free tier, the target element is visually
 * locked and an upgrade banner is inserted directly after it.
 */

// ─────────────────────────────────────────────────────────
// MODULE MESSAGES
// Gentle, personal copy explaining what each module offers
// and why a subscription unlocks it.
// ─────────────────────────────────────────────────────────
const MODULE_MESSAGES = {
  'spatial-game': {
    heading: 'Spatial Awareness is part of the Lab',
    body: 'Training your auditory attention and sound localisation is a core part of the Lab experience. Subscribe to unlock this and every other tool.',
  },
  'cocktail-party': {
    heading: 'The Cocktail Party Problem is part of the Lab',
    body: 'Selective listening training takes time and repeated practice. Subscribe to track your progress and access all perception exercises.',
  },
  'soundscape-machine': {
    heading: 'The Soundscape Machine is part of the Lab',
    body: 'Four-track tape composition with field recordings is waiting for you. Subscribe to start building your own soundscapes.',
  },
  'journal': {
    heading: 'The Timed Journal is part of the Lab',
    body: 'Writing with intention and sound is a powerful practice. Subscribe to save your entries and explore the full journaling experience.',
  },
  'check-in': {
    heading: 'Check-In is part of the Lab',
    body: 'Tracking your emotional state and sensory load over time reveals patterns that are hard to see day to day. Subscribe to start logging.',
  },
  'compositions': {
    heading: 'Experimental Compositions are part of the Lab',
    body: 'These interactive tools let you learn from and work with techniques from experimental music pioneers. Subscribe to explore them.',
  },
  'phase-machine': {
    heading: 'The Phase Machine is part of the Lab',
    body: "Steve Reich's phasing technique is best understood by doing it yourself. Subscribe to use this tool and all the other composition instruments.",
  },
  'rooms': {
    heading: 'Rooms is part of the Lab',
    body: "Alvin Lucier's iterative resonance process is available to you as an interactive tool. Subscribe to explore it and the rest of the Lab.",
  },
  'waves': {
    heading: 'Waves is part of the Lab',
    body: "Compose slowly evolving drones in the tradition of Éliane Radigue. Subscribe to access this and every other tool in the Lab.",
  },
  'chance': {
    heading: 'Chance is part of the Lab',
    body: "John Cage's indeterminate composition methods are here for you to explore. Subscribe to use this tool and everything else the Lab offers.",
  },
  // Fallback for any module name not listed above
  'default': {
    heading: 'This feature is part of the Lab',
    body: 'Subscribe to unlock full access to every tool, instrument, and module in the Sensory Intelligence Lab.',
  },
};

// ─────────────────────────────────────────────────────────
// CSS
// Injected once into the document head.
// ─────────────────────────────────────────────────────────
const GATING_CSS = `
  /* ── Gated module wrapper ── */
  .sil-gated-wrap {
    position: relative;
  }

  /* ── Locked content: faded, non-interactive ── */
  .sil-gated-content {
    pointer-events: none;
    user-select: none;
    opacity: 0.35;
    filter: blur(1px);
    transition: opacity 0.2s, filter 0.2s;
  }

  /* ── Transparent overlay prevents any click-through ── */
  .sil-lock-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    cursor: default;
  }

  /* ── Upgrade banner ── */
  .sil-upgrade-banner {
    background: #ffffff;
    border: 1px solid #e5e5e0;
    border-left: 3px solid #2a5c45;
    padding: 1.5rem 1.75rem;
    margin-top: 1px;
    display: flex;
    align-items: flex-start;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .sil-upgrade-banner__icon {
    font-size: 1.4rem;
    flex-shrink: 0;
    line-height: 1;
    padding-top: 0.1rem;
    color: #2a5c45;
  }

  .sil-upgrade-banner__body {
    flex: 1;
    min-width: 200px;
  }

  .sil-upgrade-banner__heading {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #1a1a1a;
    margin-bottom: 0.4rem;
    line-height: 1.3;
  }

  .sil-upgrade-banner__text {
    font-family: 'Inter', sans-serif;
    font-size: 0.82rem;
    color: #6b6b6b;
    line-height: 1.65;
    margin: 0;
  }

  .sil-upgrade-banner__cta {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    padding: 0.65rem 1.5rem;
    background: #2a5c45;
    color: white;
    border: none;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    transition: background 0.15s;
    white-space: nowrap;
    flex-shrink: 0;
    align-self: center;
  }

  .sil-upgrade-banner__cta:hover {
    background: #1e4433;
    color: white;
    text-decoration: none;
  }

  @media (max-width: 560px) {
    .sil-upgrade-banner {
      flex-direction: column;
      gap: 1rem;
      padding: 1.25rem;
    }
    .sil-upgrade-banner__cta {
      width: 100%;
      text-align: center;
    }
  }
`;

// ─────────────────────────────────────────────────────────
// INJECT CSS (once per page load)
// ─────────────────────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('sil-gating-styles')) return;
  const style = document.createElement('style');
  style.id = 'sil-gating-styles';
  style.textContent = GATING_CSS;
  document.head.appendChild(style);
}

// ─────────────────────────────────────────────────────────
// isPaidUser
//
// Returns true if the current user has full lab access.
// Reads from window._isPaidUser set by auth-guard.js.
// ─────────────────────────────────────────────────────────
export function isPaidUser() {
  return window._isPaidUser === true;
}

// ─────────────────────────────────────────────────────────
// applyGating
//
// Locks a page section for free-tier users and inserts an
// upgrade banner. Safe to call after authReady has fired.
//
// @param {object} options
// @param {string}  options.targetSelector   — CSS selector for the element to lock
// @param {string}  options.moduleName       — key from MODULE_MESSAGES
// @param {string}  [options.bannerPosition] — 'after' (default) | 'before'
//
// @returns {boolean} true if gating was applied, false if user has access
// ─────────────────────────────────────────────────────────
export function applyGating({ targetSelector, moduleName, bannerPosition = 'after' }) {
  // Paid and beta users see everything — do nothing
  if (isPaidUser()) return false;

  const target = document.querySelector(targetSelector);
  if (!target) {
    console.warn(`applyGating: element not found for selector "${targetSelector}"`);
    return false;
  }

  injectStyles();

  const msg = MODULE_MESSAGES[moduleName] || MODULE_MESSAGES['default'];

  // ── Wrap target in a relative-positioned container ──
  const wrap = document.createElement('div');
  wrap.className = 'sil-gated-wrap';
  target.parentNode.insertBefore(wrap, target);
  wrap.appendChild(target);

  // ── Fade and disable the locked content ──
  target.classList.add('sil-gated-content');

  // ── Transparent overlay prevents clicks reaching content ──
  const overlay = document.createElement('div');
  overlay.className = 'sil-lock-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  wrap.appendChild(overlay);

  // ── Upgrade banner ──
  const banner = document.createElement('div');
  banner.className = 'sil-upgrade-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Subscribe to access this feature');
  banner.innerHTML = `
    <div class="sil-upgrade-banner__icon" aria-hidden="true">◎</div>
    <div class="sil-upgrade-banner__body">
      <div class="sil-upgrade-banner__heading">${msg.heading}</div>
      <p class="sil-upgrade-banner__text">${msg.body}</p>
    </div>
    <a href="/subscribe/" class="sil-upgrade-banner__cta">See plans</a>
  `;

  if (bannerPosition === 'before') {
    wrap.parentNode.insertBefore(banner, wrap);
  } else {
    // Default: banner appears directly below the locked section
    wrap.parentNode.insertBefore(banner, wrap.nextSibling);
  }

  return true;
}

// ─────────────────────────────────────────────────────────
// applyGatingOnReady
//
// Convenience wrapper that waits for authReady before calling
// applyGating(). Use this when you're not sure if auth-guard
// has resolved yet — which is almost always the right choice.
//
// @param {object} options — same as applyGating()
// ─────────────────────────────────────────────────────────
export function applyGatingOnReady(options) {
  if (window._currentUser !== undefined) {
    // auth-guard has already resolved — gate immediately
    applyGating(options);
    return;
  }
  window.addEventListener('authReady', () => applyGating(options), { once: true });
}

// ─────────────────────────────────────────────────────────
// applyMultipleGating
//
// Gate several sections on the same page in one call.
// Waits for authReady if needed.
//
// @param {object[]} optionsArray — array of applyGating() options objects
//
// Example:
//   applyMultipleGating([
//     { targetSelector: '#transport',  moduleName: 'soundscape-machine' },
//     { targetSelector: '#librarySection', moduleName: 'soundscape-machine' },
//   ]);
// ─────────────────────────────────────────────────────────
export function applyMultipleGating(optionsArray) {
  if (window._currentUser !== undefined) {
    optionsArray.forEach(opts => applyGating(opts));
    return;
  }
  window.addEventListener('authReady', () => {
    optionsArray.forEach(opts => applyGating(opts));
  }, { once: true });
}
