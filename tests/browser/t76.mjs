// Spatial game: today's challenge repeats the same paths; rooms change the reverb and keep best scores honest.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ localStorage.setItem('sil_spatial_tutorial_seen','1'); });
await page.goto(`${BASE}/spatial-game/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#btn-play'); await sleep(600);
const r=await page.evaluate(()=>{
  const {G,buildPaths}=window.__spatial; const sig=p=>JSON.stringify(p.map(x=>x.map(f=>[Math.round(f.x),Math.round(f.y)])));
  const a=sig(buildPaths(6)), b=sig(buildPaths(6)); G.daily=true; const c=sig(buildPaths(6)), d=sig(buildPaths(6)); G.trialsInLevel=1; const e=sig(buildPaths(6));
  return {open: a!==b, same: c===d, nextTrialDiffers: c!==e};
});
ok(r.open,'normally every trial is different'); ok(r.same,"today's challenge repeats the same paths"); ok(r.nextTrialDiffers,'the next trial in the day is a different one');
ok(await page.$('#room-select')===null,'there is no room choice any more');
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#btn-play'); await sleep(300); await page.$eval('#more',d=>{d.open=true;});
await page.click('#daily-toggle'); ok(/same for everyone today/.test(await page.$eval('#mode-note',e=>e.textContent)),"today's challenge explains itself");
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
