// Shared header: one copy, same on every page, menu and sign-out work.
import {launch,newPage} from './harness.mjs';
import fs from 'fs';
import path from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const REPO=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
// No page may carry its own header markup, styles or sign-out code any more.
const offenders=[];
(function walk(d){ for(const f of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','.git','tests'].includes(f.name)) continue; const p=path.join(d,f.name); if(f.isDirectory()) walk(p); else if(f.name.endsWith('.html')){ const s=fs.readFileSync(p,'utf8'); if(!/privacy/.test(p)&&/<header class="sil-header"|\.sil-header\s*\{|getElementById\('silSignOut'\)/.test(s)) offenders.push(path.relative(REPO,p)); } } })(REPO);
ok(offenders.length===0,'no page has its own copy of the header '+offenders.join(','));

const pages=['journal/index.html','breathing/index.html','account/index.html','compositions/rooms.html','check-in/index.html','dashboard/index.html'];
for(const p of pages){
  const Q=await newPage(await browser.createBrowserContext(),BASE,{});
  await Q.page.goto(`${BASE}/${p}`,{waitUntil:'domcontentloaded'}).catch(()=>{}); await new Promise(r=>setTimeout(r,600));
  const info=await Q.page.evaluate(()=>({n:document.querySelectorAll('header.sil-header').length,links:[...document.querySelectorAll('#silNav a')].map(a=>a.textContent.trim()),
    active:[...document.querySelectorAll('#silNav a.sil-active')].map(a=>a.getAttribute('href'))}));
  ok(info.n===1&&info.links.slice(0,3).join()==='Dashboard,Account,Book a session',`${p}: one header with the standard links`);
  if(p==='account/index.html') ok(info.active.join()==='/account/','account page marks its own link');
  if(p==='dashboard/index.html') ok(info.active.join()==='/dashboard/','dashboard marks its own link');
  await Q.page.close();
}
const M=await newPage(await browser.createBrowserContext(),BASE,{});
await M.page.setViewport({width:390,height:700});
await M.page.goto(`${BASE}/breathing/index.html`,{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,500));
const vis=()=>M.page.evaluate(()=>getComputedStyle(document.getElementById('silNav')).display);
ok(await vis()==='none','mobile: menu closed to start');
await M.page.click('#silMenuToggle');
ok(await vis()==='flex' && await M.page.$eval('#silMenuToggle',e=>e.getAttribute('aria-expanded'))==='true','mobile: toggle opens the menu');
await M.page.click('#silMenuToggle');
ok(await vis()==='none','mobile: toggle closes it again');
await M.page.evaluate(()=>{ window.__out=0; window._supabase.auth.signOut=async()=>{ window.__out++; }; });
await Promise.all([M.page.waitForNavigation({timeout:8000}).catch(()=>{}),M.page.evaluate(()=>document.getElementById('silSignOut').click())]);
ok(M.page.url().replace(BASE,'')==='/','sign out returns to the front page');
await browser.close(); server.close(); process.exit(fail?1:0);
