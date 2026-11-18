// Time the sections (borrowed form), mark sweet spots (one knob), take it apart in rounds (subtract).
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ const real=performance.now.bind(performance); performance.now=()=>real()*20; });   // 20 times faster
async function open(id,tool){ await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); for(let k=0;k<6&&!(await page.$(`#xpTools ${tool}`));k++){ await page.click('#xpNext'); await sleep(60); } }
await open('borrowed-form','#xpMarksStart');
ok(await page.$eval('#xpMarksMark',b=>b.disabled),'the section button waits until the clock runs');
await page.click('#xpMarksStart'); await sleep(450); await page.click('#xpMarksMark'); await sleep(450); await page.click('#xpMarksMark'); await sleep(300); await page.click('#xpMarksEnd');
ok(await page.$$eval('#xpMarksList li',l=>l.length)===3,'the first section starts with the clock; two more were marked');
ok(await page.$$eval('#xpTimeline .xp-tl',l=>l.length)===3,'a timeline with three sections appears');
await page.type('#xpMarksList li:nth-child(1) .xp-markname','intro');
await page.$eval('#xpMarksList li:nth-child(2) input[type=number]',i=>{ i.value=400; i.dispatchEvent(new Event('change')); });
ok(await page.$$eval('#xpMarksList li input[type=number]',i=>i.map(x=>+x.value)).then(v=>v[0]===0&&v[2]===400&&v[1]<400),'a time can be corrected by hand, and the list stays in order');
ok(await page.$('#xpMarksPlay:not([hidden])')!==null,'once the piece has an end it can be played through');
await page.click('#xpMarksPlay'); await sleep(400); ok(/Stop/.test(await page.$eval('#xpMarksPlay',b=>b.textContent)),'the timeline plays'); await page.click('#xpMarksPlay');
for(let k=0;k<8&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave'); ok(/My timeline/.test(await page.$eval('#xpSave',e=>e.textContent))&&/intro/.test(await page.$eval('#xpSave',e=>e.textContent)),'the timeline is offered for saving');
await open('one-knob','#xpMarksStart');
ok(await page.$('#xpTimeline')===null,'spots mode has a plain list, no timeline');
await page.click('#xpMarksStart'); await sleep(300); await page.click('#xpMarksMark'); await sleep(200); await page.click('#xpMarksMark');
ok(await page.$$eval('#xpMarksList li',l=>l.length)===2,'two sweet spots marked');
await open('subtract','#xpSubParts');
await page.click('#xpSubBegin'); ok(/at least two parts/.test(await page.$eval('#xpTools .xp-tool .xp-hint[role=status]',e=>e.textContent)),'asks for at least two parts');
await page.type('#xpSubParts','drums, bass, chords, melody, vocal, texture'); await page.click('#xpSubBegin');
ok(await page.$$eval('.xp-sround .xp-part',b=>b.length)===6,'six parts listed');
ok(await page.$eval('#xpSubNext',b=>b.disabled),'you cannot go on before removing something');
await page.evaluate(()=>{ [...document.querySelectorAll('.xp-sround .xp-part')].slice(0,3).forEach(b=>b.click()); });
await page.click('#xpSubNext');
ok(await page.$$eval('.xp-sround',r=>r.length)===2&&await page.$$eval('.xp-sround[data-round="1"] .xp-part',b=>b.length)===3,'round two has the three that were left');
ok(await page.$$eval('.xp-sround[data-round="0"] .xp-part',b=>b.every(x=>x.disabled)),'round one is locked once you move on');
for(let k=0;k<8&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave'); ok(/What I took away/.test(await page.$eval('#xpSave',e=>e.textContent)),'what you took away is offered for saving');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
