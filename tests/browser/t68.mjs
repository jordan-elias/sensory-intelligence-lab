// Wrong-tuning chords: a plucked-string tool to retune, set shapes, strum and compare.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/experiments/#/wrong-tuning`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin');
await page.waitForSelector('#xpTools #xpStrings');
ok(await page.$$eval('.xp-str-row',r=>r.length)===6,'six strings');
await page.select('.xp-str-tune[data-i="0"]','-2'); await page.select('.xp-str-fret[data-i="0"]','0'); await page.select('.xp-str-fret[data-i="1"]','2');
ok(await page.$eval('.xp-str-row[data-string="0"] .xp-str-note',e=>e.textContent)==='D2','string 6 retuned down two now sounds D2 when open');
ok(await page.$eval('.xp-str-row[data-string="1"] .xp-str-note',e=>e.textContent)==='B2','string 5 at fret 2 sounds B2');
await page.click('[data-shape="1"]');
ok(await page.$eval('.xp-str-fret[data-i="0"]',s=>s.value)==='x','shape 2 starts empty, shapes are separate');
await page.click('[data-shape="0"]');
ok(await page.$eval('.xp-str-fret[data-i="1"]',s=>s.value)==='2','shape 1 kept its frets');
await page.click('#xpStrStrum'); await page.click('#xpStrCompare'); await sleep(200);
ok(!/Choose a fret/.test(await page.$eval('#xpStrings .xp-hint[role=status]',e=>e.textContent)),'strum and compare play with no complaint');
await page.click('#xpStrReset');
ok(await page.$eval('.xp-str-tune[data-i="0"]',s=>s.value)==='0','Standard tuning resets the retuning');
await page.select('.xp-str-tune[data-i="0"]','-2');
for(let k=0;k<8&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave'); const t=await page.$eval('#xpSave',e=>e.textContent);
ok(/My retuned shapes/.test(t)&&/D2 \(-2\)/.test(t),'the retuning and shapes are offered for saving');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
