// Play it: set the drawn notes onto a rhythm, choose which note lands where, and hear it.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ window.__osc=[]; const C=window.AudioContext||window.webkitAudioContext; const o=C.prototype.createOscillator; C.prototype.createOscillator=function(){ const x=o.call(this); const f=x.start.bind(x); x.start=(t)=>{ window.__osc.push(x.frequency.value); return f(t); }; return x; }; });
page.on("pageerror",e=>console.log("ERR",e.message)); await page.goto(`${BASE}/experiments/#/five-note-cage`,{waitUntil:"domcontentloaded"}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin');
for(let k=0;k<8&&!(await page.$('#xpTools #xpPhrasePlay'));k++){ await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll|Draw/.test(b.textContent)); r&&r.click(); }); await page.click('#xpNext'); await sleep(80); }
ok(await page.$('#xpTools #xpPhrasePlay')!==null,'Play it appears on a step of the five-note cage');
// nothing is decided for the person
ok(await page.$$eval('#xpTools .xp-phrase .xp-chips li button',b=>b.length)===0,'no notes are put in for you');
ok(/Add at least one note/.test(await (async()=>{ await page.click('#xpPhrasePlay'); return page.$eval('.xp-phrase > p.xp-hint:last-child',e=>e.textContent); })()),'playing with nothing set explains what to do');
// set the notes by hand
await page.evaluate(()=>{ const k=[...document.querySelectorAll('.xp-key')]; [0,4,7].forEach(i=>k[i].click()); });
ok(await page.$$eval('.xp-phrase .xp-chips li button',b=>b.length)===3,'three notes set by hand');
// set the rhythm by hand: beats 1, 4, 7, 10
await page.evaluate(()=>{ const c=()=>[...document.querySelectorAll('.xp-phrase .xp-step')]; [0,3,6,9].forEach(i=>c()[i].click()); });
ok(await page.$$eval('.xp-phrase select[aria-label^="Note for beat"]',s=>s.length)===4,'each switched-on beat gets a note choice');
ok(await page.$$eval('.xp-phrase select[aria-label^="Note for beat"]',s=>s.map(x=>x.selectedIndex).join(''))==='1231','"in order" fills the beats with the notes in turn');
// choose a note for one beat yourself
await page.select('.xp-phrase select[aria-label="Note for beat 4"]','2');
ok(await page.$$eval('.xp-phrase select[aria-label^="Note for beat"]',s=>s.map(x=>x.selectedIndex).join(''))==='1331','one beat can be set by hand');
// backwards rule
await page.select('.xp-phrase select[aria-label="How notes go onto the hits"]','reverse');
ok(await page.$$eval('.xp-phrase select[aria-label^="Note for beat"]',s=>s.map(x=>x.selectedIndex).join(''))==='3213','"backwards" refills them');
// hear it, in the order and rhythm set
await page.click('#xpPhrasePlay'); await sleep(1800);
ok(/Stop/.test(await page.$eval('#xpPhrasePlay',e=>e.textContent)),'Play starts');
const f=await page.evaluate(()=>window.__osc.slice(0,4).map(x=>Math.round(x)));
ok(f.length===4&&f[0]>f[1]&&f[1]>f[2]&&f[2]<f[3],'it plays G, E, C, G: the notes in the order set ('+f+')');
await page.click('#xpPhrasePlay'); ok(/Play/.test(await page.$eval('#xpPhrasePlay',e=>e.textContent)),'Stop stops');
// save at the end
for(let k=0;k<12&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave'); ok(/My phrase/.test(await page.$eval('#xpSave',e=>e.textContent)),'the phrase is offered at the end');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
