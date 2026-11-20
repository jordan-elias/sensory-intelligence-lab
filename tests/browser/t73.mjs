// My seeds: renamed shelf, today's roll is the same all day, two rolls combine into one.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{course_progress:[]}}); const page=P.page;
page.on('dialog',d=>d.accept());
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card');
ok(/My seeds/.test(await page.$eval('#xpKeepLink',e=>e.textContent)),'the link says My seeds');
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'});
const first=await page.$eval('.xp-card',e=>e.getAttribute('href')||'');
// a gen tool: find an experiment with a roll button
const ids=await page.$$eval('.xp-card',l=>l.map(e=>(e.getAttribute('href')||'').replace('#/','')));
let found=false;
for(const id of ids){
  await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await sleep(150);
  if(!(await page.$('#xpBegin'))) continue; await page.$eval('#xpBegin',b=>b.click());
  for(let i=0;i<12&&!found;i++){
    await sleep(100);
    found=await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==="Today's roll"));
    if(!found){ const nx=await page.$('#xpNext'); if(!nx) break; await nx.evaluate(b=>b.click()); }
  }
  if(found) break;
}
ok(found,"a roll tool offers Today's roll");
if(found){
  const roll=async()=>{ await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==="Today's roll").click()); await sleep(80); return page.$eval('.xp-seed',e=>e.textContent); };
  const a=await roll(), b=await roll(); ok(a===b&&/Seed \d+/.test(a),"today's roll gives the same seed twice");
}
// combine on the shelf: put two rolls on the shelf through the page's own storage API
await page.goto(`${BASE}/experiments/#/keep`,{waitUntil:'domcontentloaded'}); await sleep(200);
ok(!(await page.$('#xpCombine')),'no combine button with nothing kept');
const exp=ids[0], now=Date.now();
await page.evaluate((exp,now)=>{ const o=JSON.parse(localStorage.getItem('sil.exp.v1')||'{}'); o.shelf={ k1:{exp,kind:'text',title:'A: What I rolled',text:'C · E · G\nSeed 1',secs:0,at:now}, k2:{exp,kind:'text',title:'B: What I rolled',text:'D · F\nSeed 2',secs:0,at:now-1000,} }; localStorage.setItem('sil.exp.v1',JSON.stringify(o)); },exp,now);
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.goto(`${BASE}/experiments/#/keep`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-kept-item');
ok(await page.$eval('#xpCombine',b=>b.disabled),'combine waits until two are picked');
const boxes=await page.$$('.xp-pickbox'); ok(boxes.length===2,'each text roll can be picked');
for(const b of boxes) await b.evaluate(x=>x.click());
ok(!(await page.$eval('#xpCombine',b=>b.disabled)),'combine is ready with two picked');
await page.$eval('#xpCombine',b=>b.click()); await sleep(200);
ok(await page.evaluate(()=>[...document.querySelectorAll('.xp-kept-item')].some(a=>/Combined seed/.test(a.querySelector('h3').textContent)&&/C · D · E · F · G/.test(a.querySelector('.xp-kept')?.textContent||''))),'the combined seed is on the shelf, taking turns');
await browser.close(); server.close(); process.exit(fail?1:0);
