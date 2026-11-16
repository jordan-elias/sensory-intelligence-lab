// Square look, therapist link on the account page, collapsible worksheet sections.
import fs from 'node:fs';
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// 1. No lab stylesheet or page rounds its boxes or buttons (dots, spinners and slider thumbs in check-in are allowed).
{ const files=['experiments/index.html','assets/css/today.css','assets/css/ui.css'];
  const bad=[]; for(const f of files){ for(const m of fs.readFileSync(f,'utf8').matchAll(/border-radius:\s*([^;}"']+)/g)) if(!/^0(px)?\s*$/.test(m[1].trim())) bad.push(f+': '+m[1]); }
  ok(bad.length===0,'course, Today and ui.css have no rounded corners '+bad.join(' | '));
  const dash=fs.readFileSync('dashboard/index.html','utf8');
  ok(!/\.(checkin-hero|checkin-hero-btn|insight-card|insight-btn)\s*\{[^}]*border-radius:\s*[1-9]/.test(dash),'dashboard check-in banner and insight card are square'); }

// 2. Account page: therapists get a link to edit their profile; everyone else does not.
async function acct(tables){ const P=await newPage(await browser.createBrowserContext(),BASE,{tables}); await P.page.goto(`${BASE}/account/`,{waitUntil:'domcontentloaded'}); await sleep(2500); return P; }
{ const P=await acct({therapist_profiles:[{user_id:'u1',display_name:'Jordan Elias'}]});
  ok(await P.page.$eval('#therapistProfileLink',e=>!e.hidden&&e.querySelector('a').getAttribute('href')==='/therapist/profile/'),'therapist sees "Edit your therapist profile"'); }
{ const P=await acct({});
  ok(await P.page.$eval('#therapistProfileLink',e=>e.hidden),'non-therapist does not see it'); }

// 3. Worksheet sections open and close; Expand all / Collapse all; reflection included; answers survive; state remembered.
{ const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page; page.on('dialog',d=>d.accept());
  await page.goto(`${BASE}/worksheets/music-autobiography/?new`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.ws-expandbar',{timeout:15000});
  const titles=await page.$$eval('.ws-section > .ws-section-title',t=>t.map(x=>x.textContent.trim()));
  ok(titles.includes('Before we begin')&&titles.includes('Reflection'),'the start and reflection sections have titles to click ('+titles+')');
  await page.type('[data-field="patterns"]','a pattern');
  await page.click('.ws-expandbar button:nth-child(2)'); await sleep(100);
  ok(await page.$$eval('.ws-section',s=>s.every(x=>x.classList.contains('ws-collapsed'))),'Collapse all closes before/reflection');
  ok(await page.$$eval('.dyn-section',s=>s.length===0||s.every(x=>x.classList.contains('collapsed'))),'Collapse all closes the chapters too');
  ok(await page.$eval('[data-field="patterns"]',e=>getComputedStyle(e.closest('.ws-field')).display==='none'),'closed section hides its fields');
  ok(await page.$eval('[data-field="patterns"]',e=>e.value==='a pattern'),'what was typed is kept while closed');
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.ws-expandbar');
  ok(await page.$$eval('.ws-section',s=>s.every(x=>x.classList.contains('ws-collapsed'))),'closed sections stay closed on this device after a reload');
  await page.click('.ws-expandbar button:nth-child(1)'); await sleep(100);
  ok(await page.$$eval('.ws-section',s=>s.every(x=>!x.classList.contains('ws-collapsed'))),'Expand all opens them');
  await page.click('.ws-section:last-of-type .ws-section-title'); 
  ok((await page.$$eval('.ws-section.ws-collapsed',s=>s.length))>=1,'one title click closes just that section');
  await page.keyboard.press('Tab');
  ok(await page.$eval('.ws-section-title',e=>e.getAttribute('aria-expanded')!==null&&e.tabIndex===0),'titles are keyboard reachable with aria-expanded');
  ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|')); }
await browser.close(); server.close(); process.exit(fail?1:0);
