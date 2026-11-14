import {launch,newPage} from './harness.mjs';
import {encodeWav} from '../../assets/js/experiments/audio-ops.js';
import {writeFileSync,mkdtempSync} from 'fs'; import {tmpdir} from 'os'; import {join} from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}});
const page=P.page;
const fresh=async id=>{ await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card'); await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); };
const go=async(id,args)=>{ await fresh(id); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); await page.waitForSelector('.xp-stepno'); await page.waitForSelector(...args); await sleep(150); };
await page.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card',{timeout:15000});
const n=await page.$$eval('.xp-unit .xp-card',c=>c.length);
ok(n>=20,'the list shows every experiment ('+n+')');
ok(/Experiments in Creativity/.test(await page.$eval('.ph h2',e=>e.textContent)),'the course has its name');
ok((await page.$$eval('.xp-unit',u=>u.length))===7,'the course is laid out in seven units');
const f=await page.$$eval('.xp-unit:nth-of-type(4) .xp-card h3',c=>c.map(x=>x.textContent));
ok(await page.$$eval('.xp-unit .xp-card h3',c=>c.some(x=>x.textContent==='Chop and reorder')),'units list their experiments');
ok(/Begin:/.test(await page.$eval('#xpContinue',e=>e.textContent)),'the course offers a place to begin');
await page.evaluate(()=>[...document.querySelectorAll('.chip')].find(b=>b.textContent==='DAW or sequencer').click()); await sleep(100);
ok((await page.$$eval('.xp-unit .xp-card',c=>c.length))>=3,'filtering by what you need works');
await page.click('#xpSurprise'); await sleep(300);
ok(/#\/./.test(await page.evaluate(()=>location.hash))&&await page.$('#xpBegin')!==null&&await page.$('#xpQuestion')!==null,'Surprise me opens one experiment, ready to begin');

// dice melody: roll
await go('dice-melody',['.xp-tool .xp-btn',{timeout:8000}]);
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll seven notes').click());
ok((await page.$$eval('.xp-chips li',l=>l.length))===7,'rolling gives seven notes');
ok(/Seed \d+/.test(await page.$eval('.xp-seed',e=>e.textContent)),'the seed is shown');
// the guided flow: one step at a time
await fresh('dice-melody'); await page.waitForSelector('#xpBegin');
ok(await page.$('#xpHypothesis')===null&&await page.$('textarea[aria-label="Your prediction"]')===null&&await page.$('.xp-trials')===null&&await page.$('.xp-vars')===null,'no hypothesis, prediction, variables or surprise scores');
ok(await page.$('details.xp-solo')!==null,'instructions for doing it without the app are there');
ok(await page.$('.xp-tool')===null&&/Your first step/.test(await page.$eval('.xp-hint',e=>e.textContent)),'the start screen shows the idea and the first step, with no tools yet');
await page.click('#xpBegin'); await page.waitForSelector('#xpStep');
const first=await page.$eval('#xpStep',e=>e.textContent), ofn=await page.$eval('.xp-stepno',e=>e.textContent);
ok(/^Step 1 of \d+$/.test(ofn)&&first.length>10,'step 1 is shown alone ('+ofn+')');
ok(await page.$('.xp-tool')!==null,'the tools are there under the step');
await page.click('#xpNext'); ok(/^Step 2 of/.test(await page.$eval('.xp-stepno',e=>e.textContent))&&(await page.$eval('#xpStep',e=>e.textContent))!==first,'Next moves to step 2');
await page.click('#xpBack'); ok(await page.$eval('#xpStep',e=>e.textContent)===first,'Back returns to step 1');
const total=+/of (\d+)/.exec(ofn)[1]; for(let k=0;k<total;k++) await page.click('#xpNext');
await page.waitForSelector('#xpNote'); ok(/Record your process or share your thoughts/.test(await page.$eval('.xp-hint',e=>e.textContent)),'the end is an open note, not a form');
await page.type('#xpNote','Started with the rhythm and it kept pulling me back.');
await page.click('#xpFinish'); await page.waitForSelector('.xp-card');
ok(/1 of \d+ done/.test(await page.$eval('.xp-count',e=>e.textContent)),'finishing marks it done on this device');
await fresh('dice-melody'); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); for(let k=0;k<total;k++){ await page.waitForSelector('#xpNext'); await page.click('#xpNext'); }
await page.waitForSelector('#xpNote'); ok((await page.$eval('#xpNote',e=>e.value)).includes('kept pulling me back'),'the note is remembered');
await go('fixed-groove-chords',['.xp-tool']);
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll four chords').click());
ok((await page.$$eval('.xp-chips li',l=>l.length))===4,'rolling gives four chords');
ok((await page.$$eval('.xp-step',c=>c.length))===16,'the rhythm grid has 16 steps');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll a rhythm').click());
ok((await page.$$eval('.xp-step[aria-pressed=true]',c=>c.length))>=1,'a rolled rhythm switches steps on');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Start'&&b.closest('.xp-tool').querySelector('.xp-step')).click()); await sleep(900);
ok(await page.$('.xp-step.on')!==null,'the rhythm plays and shows its position');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Stop')?.click());
// timer
await go('subtract',['.xp-time']);
ok(/20:00/.test(await page.$eval('.xp-time',e=>e.textContent)),'the timer shows its length');
// loops
await go('loop-mismatch',['.xp-lane']);
ok((await page.$$eval('.xp-lane',l=>l.length))===3,'three loop lanes');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Start' && b.closest('.xp-tool').querySelector('.xp-lane')).click()); await sleep(1200);
ok(await page.$('.xp-lane i.on')!==null,'the loops run');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Stop')?.click());
// clip tool with a generated file
const sr=22050, data=Float32Array.from({length:sr*2},(_,i)=>Math.sin(i/20)*0.5*Math.exp(-(i%sr)/9000));
const dir=mkdtempSync(join(tmpdir(),'xp-')), wav=join(dir,'clip.wav'); writeFileSync(wav,encodeWav(data,sr));
await go('chop-reorder',['input[type=file]']);
await (await page.$('input[type=file]')).uploadFile(wav); await page.waitForFunction(()=>/seconds/.test(document.querySelector('.xp-tool [role=status]').textContent),{timeout:8000});
ok(/2\.0 seconds/.test(await page.$eval('.xp-tool [role=status]',e=>e.textContent)),'a loaded clip is read');
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Roll the number of slices').click());
await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].find(b=>b.textContent==='Chop and shuffle').click()); await sleep(300);
const info=await page.evaluate(()=>[...document.querySelectorAll('.xp-hint')].map(e=>e.textContent).find(t=>/slices, order/.test(t)));
ok(!!info,'chop and shuffle reports the order it used');
ok(await page.evaluate(()=>[...document.querySelectorAll('.xp-btn')].some(b=>b.textContent==='Download WAV'&&!b.hidden)),'the result can be downloaded');
for(const [id,btn] of [['scale-contrast','Slow and fast together'],['reverse-answer','Reverse'],['grain-melody','Melody from one grain'],['stutter','Stutter a moment']]){
  await go(id,['input[type=file]']);
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
ok(/Experiments in Creativity: my notebook/.test(await page.$eval('#xpNotebookText',e=>e.textContent))&&/kept pulling me back/.test(await page.$eval('#xpNotebookText',e=>e.textContent)),'the notebook page shows the notebook with the note');
// writing tools
await go('borrowed-end-words',['#xpWords']);
await page.type('#xpWords','The only way out is through the door'); await page.$eval('#xpFrame',b=>b.click());
ok((await page.$$eval('.xp-frame li strong',l=>l.map(x=>x.textContent).join(' ')))==='The only way out is through the door','end-words keep the borrowed order');
await go('burning-page',['#xpBurnStart']);
await page.evaluate(()=>{ const a=document.getElementById('xpBurnText'); a.readOnly=false; a.value='The morning light came slowly over the quiet river and the old bridge held the water still while a small bird sang about nothing at all and everything else besides'; });
await page.evaluate(()=>{ document.getElementById('xpBurn').hidden=false; });
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
await page.click('#xpBurn'); await page.waitForSelector('#xpHaiku',{timeout:5000});
const hk=await page.$$eval('#xpHaiku p',p=>p.map(x=>x.textContent));
ok(hk.length===3,'the burned page leaves a three-line haiku');
await go('strategy-cards',['#xpDraw']); await page.click('#xpDraw');
ok((await page.$$eval('.xp-card-face',c=>c.length))===3&&/Limit:/.test(await page.$eval('.xp-card-limit',e=>e.textContent)),'three strategy cards are drawn, each with a limit');
await go('blackout-poem',['#xpPaste']);
await page.type('#xpPaste','Nothing is quite as loud as the quiet after a storm has passed over the town'); await sleep(200);
await page.evaluate(()=>{ const b=[...document.querySelectorAll('.xp-bw')]; for (const w of ['quiet','storm','passed']) b.find(x=>x.textContent===w).click(); });
ok(await page.$eval('#xpPoem',e=>e.textContent)==='quiet storm passed','blackout keeps the chosen words in order');
await go('photo-words',['#xpWords']); await page.type('#xpWords','EXIT bakery 24 open closed taxi rain'); await page.$eval('#xpFrame',b=>b.click());
ok((await page.$$eval('.xp-frame li',l=>l.length))===7,'words from a photo make a frame');
// music tools
await go('melody-over-chords',['#xpRoll']);
await page.click('#xpRollChords');
ok(/→/.test(await page.$eval('#xpChords',e=>e.textContent)),'four chords are rolled');
await page.click('.xp-rc'); await page.click('.xp-rc');
ok((await page.$$eval('.xp-rc.on',c=>c.length))===0,'tapping a note twice clears it');
await page.click('.xp-rc');
ok((await page.$$eval('.xp-rc.on',c=>c.length))===1,'a tapped note is placed');
await go('treatment-swap',['#xpTracks']); await page.type('#xpTracks','Bass\nKeys\nVoice'); await page.click('#xpTreat');
ok((await page.$$eval('.xp-treat li',l=>l.length))===3,'every track is given a treatment');
await go('one-sample-beat',['#xpLanes',{hidden:true}]);
await (await page.$('input[type=file]')).uploadFile(wav); await page.waitForSelector('#xpLanes',{visible:true,timeout:8000});
ok((await page.$$eval('.xp-lane2',l=>l.length))===4&&(await page.$$eval('.xp-ls',l=>l.length))===64,'one sample gives four lanes of sixteen steps');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
