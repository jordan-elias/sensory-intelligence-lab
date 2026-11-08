// Accessibility basics: skip link, icon-only buttons labelled, focus ring, reduced motion.
import {launch,newPage} from './harness.mjs';
import fs from 'fs'; import path from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const REPO=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const missing=[], noCss=[];
(function walk(d){ for(const f of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','.git','tests'].includes(f.name)) continue; const p=path.join(d,f.name);
  if(f.isDirectory()) walk(p); else if(f.name.endsWith('.html')){ const s=fs.readFileSync(p,'utf8'); if(s.includes('</head>')&&!s.includes('a11y.css')) noCss.push(path.relative(REPO,p));
    for(const m of s.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)){ const txt=m[2].replace(/<[^>]+>/g,'').replace(/&#?\w+;/g,'x').trim(); if(!/aria-label/.test(m[1]) && (txt===''&&!/choice-btn/.test(m[1]) || /^[×✕✖+\-−▶⏸■●○✓x]$/.test(txt))) missing.push(path.relative(REPO,p)+': '+m[1].trim().slice(0,40)); } } } })(REPO);
ok(noCss.length===0,'every page links a11y.css '+noCss.join(','));
ok(missing.length===0,'icon-only buttons have an aria-label '+missing.join(' | '));

const P=await newPage(await browser.createBrowserContext(),BASE,{});
await P.page.goto(`${BASE}/breathing/index.html`,{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,600));
const info=await P.page.evaluate(()=>({skip:document.querySelector('.skip-link')?.getAttribute('href'),mainId:document.querySelector('main')?.id,first:document.querySelector('.skip-link')===document.body.querySelector('a')}));
ok(info.skip==='#'+info.mainId&&info.mainId,'skip link points at the main content');
await P.page.keyboard.press('Tab');
ok(await P.page.evaluate(()=>document.activeElement.classList.contains('skip-link')),'skip link is the first thing Tab reaches');
const top=await P.page.evaluate(()=>Math.round(document.querySelector('.skip-link').getBoundingClientRect().top));
ok(top>=0,'skip link becomes visible when focused');
await P.page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
const dur=await P.page.evaluate(()=>{ const e=document.createElement('div'); e.style.transition='opacity 2s'; document.body.appendChild(e); return getComputedStyle(e).transitionDuration; });
ok(parseFloat(dur)<0.01,'reduced motion collapses transitions ('+dur+')');
await P.page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
const dur2=await P.page.evaluate(()=>{ const e=document.createElement('div'); e.style.transition='opacity 2s'; document.body.appendChild(e); return getComputedStyle(e).transitionDuration; });
ok(parseFloat(dur2)===2,'normal motion is untouched');
await browser.close(); server.close(); process.exit(fail?1:0);
