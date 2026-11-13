import {launch,newPage} from './harness.mjs';
import {encodeWav} from '../../assets/js/experiments/audio-ops.js';
import {writeFileSync,mkdtempSync} from 'fs'; import {tmpdir} from 'os'; import {join} from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}});
const page=P.page;
await page.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card',{timeout:15000});
const n=await page.$$eval('.xp-unit .xp-card',c=>c.length);
ok(n>=20,'the list shows every experiment ('+n+')');
ok(/Within Limits/.test(await page.$eval('.ph h2',e=>e.textContent)),'the course has its name');
ok((await page.$$eval('.xp-unit',u=>u.length))===7,'the course is laid out in seven units');
const f=await page.$$eval('.xp-unit:nth-of-type(4) .xp-card h3',c=>c.map(x=>x.textContent));
ok(await page.$$eval('.xp-unit .xp-card h3',c=>c.some(x=>x.textContent==='Chop and reorder')),'units list their experiments');
ok(/Begin:/.test(await page.$eval('#xpContinue',e=>e.textContent)),'the course offers a place to begin');
await page.evaluate(()=>[...document.querySelectorAll('.chip')].find(b=>b.textContent==='DAW or sequencer').click()); await sleep(100);
ok((await page.$$eval('.xp-unit .xp-card',c=>c.length))>=3,'filtering by what you need works');
await page.click('#xpSurprise'); await sleep(300);
ok(/#\/./.test(await page.evaluate(()=>location.hash))&&await page.$('.xp-proc')!==null&&await page.$('#xpHypothesis')!==null,'Surprise me opens one experiment as a protocol');

// dice melody: roll
await page.goto(`${BASE}/experiments/#/dice-melody`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-tool .xp-btn',{timeout:8000});
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll seven notes').click());
ok((await page.$$eval('.xp-chips li',l=>l.length))===7,'rolling gives seven notes');
ok(/Seed \d+/.test(await page.$eval('.xp-seed',e=>e.textContent)),'the seed is shown');
ok(await page.$('details.xp-solo')!==null,'instructions for doing it without the app are there');
// notes + done persist
await page.type('textarea[aria-label="Your prediction"]','I expect a surprise'); await page.select('select[aria-label="Version A: how surprising (1 to 5)"]','4'); await page.select('select[aria-label="Was the hypothesis supported?"]','partly'); await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>/Mark as done/.test(b.textContent)).click());
await page.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card');
ok(/1 of \d+ done/.test(await page.$eval('.xp-count',e=>e.textContent)),'done is remembered on this device');
await page.goto(`${BASE}/experiments/#/dice-melody`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('textarea');
ok(await page.$eval('textarea[aria-label="Your prediction"]',e=>e.value)==='I expect a surprise'&&await page.$eval('select[aria-label="Version A: how surprising (1 to 5)"]',e=>e.value)==='4'&&await page.$eval('select[aria-label="Was the hypothesis supported?"]',e=>e.value)==='partly','prediction, trial scores and conclusion are remembered on this device');
// protocol sections
await page.goto(`${BASE}/experiments/#/fixed-groove-chords`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-vars');
ok((await page.$$eval('.xp-vars h4',h=>h.map(x=>x.textContent))).join()==='Held fixed,Changed,Measured','variables are laid out as fixed, changed and measured');
ok((await page.$$eval('.xp-params tr',r=>r.length))>=4,'parameters are listed with exact values');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll four chords').click());
ok((await page.$$eval('.xp-chips li',l=>l.length))===4,'rolling gives four chords');
ok((await page.$$eval('.xp-step',c=>c.length))===16,'the rhythm grid has 16 steps');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll a rhythm').click());
ok((await page.$$eval('.xp-step[aria-pressed=true]',c=>c.length))>=1,'a rolled rhythm switches steps on');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Start'&&b.closest('.xp-tool').querySelector('.xp-step')).click()); await sleep(900);
ok(await page.$('.xp-step.on')!==null,'the rhythm plays and shows its position');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Stop')?.click());
// timer
await page.goto(`${BASE}/experiments/#/subtract`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-time');
ok(/20:00/.test(await page.$eval('.xp-time',e=>e.textContent)),'the timer shows its length');
// loops
await page.goto(`${BASE}/experiments/#/loop-mismatch`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-lane');
ok((await page.$$eval('.xp-lane',l=>l.length))===3,'three loop lanes');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Start' && b.closest('.xp-tool').querySelector('.xp-lane')).click()); await sleep(1200);
ok(await page.$('.xp-lane i.on')!==null,'the loops run');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Stop')?.click());
// clip tool with a generated file
const sr=22050, data=Float32Array.from({length:sr*2},(_,i)=>Math.sin(i/20)*0.5*Math.exp(-(i%sr)/9000));
const dir=mkdtempSync(join(tmpdir(),'xp-')), wav=join(dir,'clip.wav'); writeFileSync(wav,encodeWav(data,sr));
await page.goto(`${BASE}/experiments/#/chop-reorder`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('input[type=file]');
await (await page.$('input[type=file]')).uploadFile(wav); await page.waitForFunction(()=>/seconds/.test(document.querySelector('.xp-tool [role=status]').textContent),{timeout:8000});
ok(/2\.0 seconds/.test(await page.$eval('.xp-tool [role=status]',e=>e.textContent)),'a loaded clip is read');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll the number of slices').click());
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Chop and shuffle').click()); await sleep(300);
const info=await page.evaluate(()=>[...document.querySelectorAll('.xp-hint')].map(e=>e.textContent).find(t=>/slices, order/.test(t)));
ok(!!info,'chop and shuffle reports the order it used');
ok(await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].some(b=>b.textContent==='Download WAV'&&!b.hidden)),'the result can be downloaded');
for(const [id,btn] of [['scale-contrast','Slow and fast together'],['reverse-answer','Reverse'],['grain-melody','Melody from one grain'],['stutter','Stutter a moment']]){
  await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('input[type=file]');
  await (await page.$('input[type=file]')).uploadFile(wav); await page.waitForFunction(()=>/seconds/.test(document.querySelector('.xp-tool [role=status]').textContent),{timeout:8000});
  await page.evaluate(b=>[...document.querySelectorAll('.xp-btn')].find(x=>x.textContent===b).click(),btn); await sleep(200);
  ok(await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].some(b=>b.textContent==='Play result'&&!b.hidden)),id+': makes a result');
}
// method lesson and printable book
await page.goto(`${BASE}/experiments/#/method`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-method-steps');
ok((await page.$$eval('.xp-method-steps li',l=>l.length))===5,'the method lesson has five steps');
await page.goto(`${BASE}/experiments/#/book`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-bk');
ok((await page.$$eval('.xp-bk',l=>l.length))>=30&&await page.$('#xpPrint')!==null,'the printable book lists every protocol');
// notebook
await page.goto(`${BASE}/experiments/#/notebook`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpNotebookText');
ok(/Within Limits: my notebook/.test(await page.$eval('#xpNotebookText',e=>e.textContent)),'the notebook page shows the notebook');
// writing tools
await page.goto(`${BASE}/experiments/#/borrowed-end-words`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpWords');
await page.type('#xpWords','The only way out is through the door'); await page.click('#xpFrame');
ok((await page.$$eval('.xp-frame li strong',l=>l.map(x=>x.textContent).join(' ')))==='The only way out is through the door','end-words keep the borrowed order');
await page.goto(`${BASE}/experiments/#/burning-page`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBurnStart');
await page.evaluate(()=>{ const a=document.getElementById('xpBurnText'); a.readOnly=false; a.value='The morning light came slowly over the quiet river and the old bridge held the water still while a small bird sang about nothing at all and everything else besides'; });
await page.evaluate(()=>{ document.getElementById('xpBurn').hidden=false; });
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
await page.click('#xpBurn'); await page.waitForSelector('#xpHaiku',{timeout:5000});
const hk=await page.$$eval('#xpHaiku p',p=>p.map(x=>x.textContent));
ok(hk.length===3,'the burned page leaves a three-line haiku');
await page.goto(`${BASE}/experiments/#/strategy-cards`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpDraw'); await page.click('#xpDraw');
ok((await page.$$eval('.xp-card-face',c=>c.length))===3&&/Limit:/.test(await page.$eval('.xp-card-limit',e=>e.textContent)),'three strategy cards are drawn, each with a limit');
await page.goto(`${BASE}/experiments/#/blackout-poem`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpPaste');
await page.type('#xpPaste','Nothing is quite as loud as the quiet after a storm has passed over the town'); await sleep(200);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('.xp-bw')]; for (const w of ['quiet','storm','passed']) b.find(x=>x.textContent===w).click(); });
ok(await page.$eval('#xpPoem',e=>e.textContent)==='quiet storm passed','blackout keeps the chosen words in order');
await page.goto(`${BASE}/experiments/#/photo-words`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpWords'); await page.type('#xpWords','EXIT bakery 24 open closed taxi rain'); await page.click('#xpFrame');
ok((await page.$$eval('.xp-frame li',l=>l.length))===7,'words from a photo make a frame');
// music tools
await page.goto(`${BASE}/experiments/#/melody-over-chords`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpRoll');
await page.click('#xpRollChords');
ok(/→/.test(await page.$eval('#xpChords',e=>e.textContent)),'four chords are rolled');
await page.click('.xp-rc'); await page.click('.xp-rc');
ok((await page.$$eval('.xp-rc.on',c=>c.length))===0,'tapping a note twice clears it');
await page.click('.xp-rc');
ok((await page.$$eval('.xp-rc.on',c=>c.length))===1,'a tapped note is placed');
await page.goto(`${BASE}/experiments/#/treatment-swap`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpTracks'); await page.type('#xpTracks','Bass\nKeys\nVoice'); await page.click('#xpTreat');
ok((await page.$$eval('.xp-treat li',l=>l.length))===3,'every track is given a treatment');
await page.goto(`${BASE}/experiments/#/one-sample-beat`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpLanes',{hidden:true});
await (await page.$('input[type=file]')).uploadFile(wav); await page.waitForSelector('#xpLanes',{visible:true,timeout:8000});
ok((await page.$$eval('.xp-lane2',l=>l.length))===4&&(await page.$$eval('.xp-ls',l=>l.length))===64,'one sample gives four lanes of sixteen steps');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
