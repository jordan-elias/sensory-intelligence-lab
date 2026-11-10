#!/usr/bin/env node
/**
 * Copies the website into android-app/www for the Capacitor app and adapts it:
 *  - clean addresses (/account) become real files (/account/index.html), using the same table as netlify.toml
 *  - calls to the server functions point at the live site (API_BASE)
 *  - the service worker is left out (the pages are bundled in the app)
 * The website stays the single source: nothing in this folder is edited by hand.
 *
 * Usage: node android-app/scripts/build-web.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const API_BASE = process.env.SIL_API_BASE || 'https://lab.jordanelias.de';
const SKIP_DIRS = new Set(['node_modules', 'tests', 'netlify', 'docs', 'scripts', 'android-app', '.git', '.github', 'shots']);
const SKIP_FILES = new Set(['sw.js', 'offline.html', 'netlify.toml', 'package.json', 'package-lock.json', 'robots.txt', 'sitemap.xml', 'llms.txt', '.gitignore']);
const TEXT = /\.(html|js|mjs|css)$/;

/** The 200-rewrites of netlify.toml as { '/account': '/account/index.html' } (the "/" rule is left to the app's start page). */
export function routeTable(toml) {
  const routes = {};
  for (const block of toml.split('[[redirects]]').slice(1)) {
    const from = /from\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const to = /to\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const status = /status\s*=\s*(\d+)/.exec(block)?.[1];
    if (!from || !to || status !== '200' || from === '/' || from.includes('*') || to.includes(':')) continue;
    routes[from.replace(/\/$/, '')] = to;
  }
  return routes;
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rewrites quoted clean addresses and function calls in one file's text. */
export function rewriteText(text, routes, apiBase = API_BASE) {
  const names = Object.keys(routes).sort((a, b) => b.length - a.length).map(esc);
  if (names.length) {
    const re = new RegExp(`(["'\`(=])(${names.join('|')})/?(?=["'\`?#)\\s>])`, 'g');
    text = text.replace(re, (_, q, r) => q + routes[r]);
  }
  return text.replace(/(["'`])\/\.netlify\/functions\//g, `$1${apiBase}/.netlify/functions/`);
}

const injected = apiBase => `<script>window.SIL_API_BASE=${JSON.stringify(apiBase)};window.SIL_APP=true;</script>\n<script type="module" src="/assets/js/app/native.js"></script>`;

function copyTree(src, dst, routes, apiBase) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.well-known') continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { if (!(src === ROOT && SKIP_DIRS.has(e.name))) copyTree(s, d, routes, apiBase); continue; }
    if (src === ROOT && SKIP_FILES.has(e.name)) continue;
    if (TEXT.test(e.name)) {
      let t = rewriteText(fs.readFileSync(s, 'utf8'), routes, apiBase);
      if (e.name.endsWith('.html')) t = t.replace(/<head([^>]*)>/i, (m) => `${m}\n${injected(apiBase)}`);
      fs.writeFileSync(d, t);
    } else fs.copyFileSync(s, d);
  }
}

export function build(out = path.join(ROOT, 'android-app/www'), apiBase = API_BASE) {
  const routes = routeTable(fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8'));
  fs.rmSync(out, { recursive: true, force: true });
  copyTree(ROOT, out, routes, apiBase);
  return { out, routes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { out, routes } = build(process.argv[2] ? path.resolve(process.argv[2]) : undefined);
  console.log(`Built ${out} (${Object.keys(routes).length} routes mapped)`);
}
