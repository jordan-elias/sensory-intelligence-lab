// /assets/js/header.js
// Shared header for all lab pages except the landing page.
// Usage on every protected page:
//   1. Add <div id="lab-header"></div> near the top of <body>
//   2. Add <script src="/assets/js/header.js"></script> after auth-guard

(function () {

  const CSS = `
    #lab-header-inner {
      border-bottom: 1px solid var(--border, #e5e5e0);
      padding: 0 1.5rem;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      background: var(--bg, #fff);
      z-index: 100;
      gap: 1rem;
    }
    .lab-wordmark {
      font-family: var(--font-heading, 'Space Grotesk', sans-serif);
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
      flex-shrink: 0;
      text-decoration: none;
      color: var(--text, #1a1a1a);
    }
    .lab-wordmark:hover { color: var(--accent, #2a5c45); }
    .lab-nav {
      display: flex;
      gap: 1.25rem;
      align-items: center;
    }
    .lab-nav a {
      font-size: .8rem;
      font-weight: 500;
      text-decoration: none;
      color: var(--muted, #6b6b6b);
      transition: color .15s;
      white-space: nowrap;
    }
    .lab-nav a:hover { color: var(--text, #1a1a1a); }
    .lab-nav a.lab-active {
      color: var(--accent, #2a5c45);
      font-weight: 600;
    }
    .lab-signout {
      font-family: var(--font-body, 'Inter', sans-serif);
      font-size: .8rem;
      font-weight: 500;
      color: var(--muted, #6b6b6b);
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      transition: color .15s;
      white-space: nowrap;
    }
    .lab-signout:hover { color: var(--text, #1a1a1a); }
    .lab-menu-toggle {
      display: none;
      flex-direction: column;
      gap: 4px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      flex-shrink: 0;
    }
    .lab-menu-toggle span {
      display: block;
      width: 20px;
      height: 2px;
      background: var(--text, #1a1a1a);
    }
    @media (max-width: 680px) {
      .lab-menu-toggle { display: flex; }
      .lab-nav {
        display: none;
        position: absolute;
        top: 56px;
        left: 0;
        right: 0;
        background: var(--bg, #fff);
        border-bottom: 1px solid var(--border, #e5e5e0);
        flex-direction: column;
        align-items: flex-start;
        padding: 1rem 1.5rem;
        gap: .85rem;
        z-index: 99;
      }
      .lab-nav.open { display: flex; }
      .lab-nav a, .lab-signout { font-size: .875rem; }
    }
  `;

  const HTML = `
    <header id="lab-header-inner">
      <a class="lab-wordmark" href="/dashboard/">Sensory Intelligence Lab</a>
      <nav class="lab-nav" id="labNav">
        <a href="/dashboard/">Dashboard</a>
        <a href="/account/">Account</a>
        <a href="/booking/">Schedule a session</a>
        <a href="https://jordanelias.de/blog/" target="_blank" rel="noopener">Blog</a>
        <button class="lab-signout" id="labSignOutBtn">Sign out</button>
      </nav>
      <button class="lab-menu-toggle" id="labMenuToggle" aria-label="Toggle navigation">
        <span></span><span></span><span></span>
      </button>
    </header>
  `;

  // Inject styles
  if (!document.getElementById('lab-header-style')) {
    const style = document.createElement('style');
    style.id = 'lab-header-style';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // Inject HTML
  const placeholder = document.getElementById('lab-header');
  if (!placeholder) return;
  placeholder.outerHTML = HTML;

  // Active link
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.lab-nav a').forEach(a => {
    const href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === currentPath) a.classList.add('lab-active');
  });

  // Mobile toggle
  const toggle = document.getElementById('labMenuToggle');
  const nav    = document.getElementById('labNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
    nav.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => nav.classList.remove('open'))
    );
  }

  // Sign out — uses window._supabase from auth-guard, or loads own client
  async function getClient() {
    if (window._supabase) return window._supabase;
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    return createClient(
      "https://lrjuufvrgkuvfxcmybtf.supabase.co",
      "sb_publishable_VyiIJOgsGueUOVU_ed49-Q_rS4mi7J1"
    );
  }

  const signOutBtn = document.getElementById('labSignOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      signOutBtn.textContent = 'Signing out…';
      signOutBtn.disabled = true;
      try {
        const client = await getClient();
        await client.auth.signOut();
      } finally {
        window.location.replace('/');
      }
    });
  }

})();
