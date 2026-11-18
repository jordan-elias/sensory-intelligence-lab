// Loop mismatch and odd meter now happen in the workbench: tracks that cycle against each other.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
async function open(id){ await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); }
await open('loop-mismatch'); await page.waitForSelector('#xpTools #xpBench');
const lens=await page.evaluate(()=>document.querySelector('#xpBench').__bench.tracks.map(t=>t.len).join());
ok(lens==='3,4,5','the three tracks start at 3, 4 and 5 steps');
ok(/every 60 steps/.test(await page.$eval('#xpBenchTogether',e=>e.textContent)),'it says when they line up again (60 steps)');
ok(await page.$('#xpBench select[aria-label$="length in steps"]')===null,'the lengths are locked, as the experiment says');
ok(await page.$('#xpBenchBring')===null,'no drawn-notes panel here');
await page.evaluate(()=>{ document.querySelector('.xp-btrack[data-track=hihat] .xp-bs').click(); document.querySelector('.xp-btrack[data-track=kick] .xp-bs').click(); });
ok(await page.$$eval('#xpBench .xp-bs.off',c=>c.length)===13+12+11,'steps past each track\'s length are greyed out');
await page.click('#xpBenchPlay'); await sleep(800); ok(await page.$$eval('#xpBench .xp-bs.now',c=>c.length)>=3,'every track has its own playhead'); await page.click('#xpBenchPlay');
await open('odd-meter');
for(let k=0;k<6&&!(await page.$('#xpTools #xpBench'));k++){ await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll/.test(b.textContent)); r&&r.click(); }); await page.click('#xpNext'); await sleep(60); }
await page.click('#xpBenchNumber'); ok(/Roll the number first/.test(await page.$eval('#xpBench > .xp-hint[role=status]',e=>e.textContent)),'asks for a roll first when there is none');
await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll/.test(b.textContent)); r.click(); });
const rolled=await page.evaluate(()=>+document.querySelector('#xpTools .xp-chips li')?.textContent.replace(/\D/g,''));
await page.click('#xpBenchNumber');
const L=await page.evaluate(()=>document.querySelector('#xpBench').__bench.tracks.map(t=>t.len));
ok(rolled>=5&&rolled<=13&&L.every(n=>n===rolled),`every track now cycles every ${rolled} steps, the rolled number (${L})`);
ok(await page.$$eval('#xpBench select[aria-label$="length in steps"]',(s,n)=>s.every(x=>+x.value===n),rolled),'the length menus show it too');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
