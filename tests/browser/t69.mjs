// Random pitch, fixed rhythm: save rolls as versions, loop them, name them, rank them twice.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/experiments/#/random-pitch-fixed-rhythm`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin');
const hasRoll=()=>page.evaluate(()=>!![...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll/.test(b.textContent)));
for(let k=0;k<8&&!((await page.$('#xpTools #xpVersions'))&&(await hasRoll()));k++){ await page.click('#xpNext'); await sleep(60); }
const click=sel=>page.$eval(sel,b=>b.click());
await click('#xpVerSave'); ok(/Roll a pattern first/.test(await page.$eval('#xpVersions > .xp-hint[role=status]',e=>e.textContent)),'saving with no roll asks for a roll first');
const roll=()=>page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll/.test(b.textContent)); r.click(); });
for(let i=0;i<5;i++){ await roll(); await click('#xpVerSave'); }
ok(await page.$$eval('#xpVerList li',l=>l.length)===5,'five rolls saved as five versions');
await roll(); await click('#xpVerSave'); ok(/all 5/.test(await page.$eval('#xpVersions > .xp-hint[role=status]',e=>e.textContent))&&await page.$$eval('#xpVerList li',l=>l.length)===5,'a sixth is refused');
await page.type('.xp-ver-word','bright');
await click('.xp-ver-play'); await sleep(300); ok(await page.$eval('.xp-ver-play',b=>b.getAttribute('aria-pressed')==='true'),'a version can be played on a loop'); await click('.xp-ver-play');
// rank
await click('#xpRank li:nth-child(3) button[aria-label$="up"]');
const first=await page.$$eval('#xpRank li',l=>l.map(x=>x.dataset.v).join());
ok(first==='0,2,1,3,4','the arrows put version 3 above version 2: '+first);
await click('#xpVerRerank');
await click('#xpRank li:nth-child(5) button[aria-label$="up"]'); await click('#xpRank li:nth-child(4) button[aria-label$="up"]');
const phase=await page.$eval('#xpVerPhase',e=>e.textContent);
ok(/Version 5 moved from 5th to 3rd/.test(phase)||/Version 5 moved/.test(phase),'the second order is compared with the first: '+phase);
for(let k=0;k<10&&await page.$('#xpNext');k++){ await click('#xpNext'); await sleep(60); }
await page.waitForSelector('#xpSave',{timeout:5000}); const t=await page.$eval('#xpSave',e=>e.textContent);
ok(/My versions/.test(t)&&/bright/.test(t),'the versions and both orders are offered for saving');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
