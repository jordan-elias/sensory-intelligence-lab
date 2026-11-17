// The workbench: build a loop from what was drawn and rolled, edit it like the Sequencer, hear it, export it.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ window.__osc=[]; window.__dl=[]; const C=window.AudioContext||window.webkitAudioContext; const o=C.prototype.createOscillator; C.prototype.createOscillator=function(){ const x=o.call(this); const f=x.start.bind(x); x.start=(t)=>{ window.__osc.push([t,x.frequency.value,x.type]); return f(t); }; return x; };
  const oc=URL.createObjectURL; URL.createObjectURL=b=>{ window.__dl.push(b.size+':'+b.type); return oc.call(URL,b); }; });
page.on('pageerror',e=>console.log('ERR',e.message));
await page.goto(`${BASE}/experiments/#/five-note-cage`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin');
for(let k=0;k<8&&!(await page.$('#xpTools #xpBench'));k++){ await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll|Draw/.test(b.textContent)); r&&r.click(); }); await page.click('#xpNext'); await sleep(80); }
ok(await page.$('#xpTools #xpBench')!==null,'the workbench appears on a step of the five-note cage');
ok(await page.$$eval('#xpBench .xp-btrack',t=>t.length)===5,'five tracks: kick, snare, hi-hat, bass, lead');
// nothing is put in for you
ok(await page.$$eval('#xpBench .xp-bs.on',c=>c.length)===0,'it starts empty');
await page.click('#xpBenchPlay'); ok(/Switch some steps on first/.test(await page.$eval('#xpBench > .xp-hint[role=status]',e=>e.textContent)),'playing an empty bench explains what to do');
// bring in the drawn notes and the rolled rhythm
await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>/^Roll|Draw|Press/.test(b.textContent)); });
await page.click('#xpBenchNotes');
const said=await page.$eval('#xpBench > .xp-hint[role=status]',e=>e.textContent);
ok(/notes put on 4 hits of the lead/.test(said)||/Draw your notes first/.test(said),'bringing in notes either places them or asks you to draw first: '+said);
// edit by hand like the sequencer: kick on 1,5,9,13 via Spread, snare by tap, hat euclid
await page.evaluate(()=>{ const kick=document.querySelector('.xp-btrack[data-track=kick]'); kick.querySelector('details summary').click(); });
await page.evaluate(()=>{ const t=document.querySelector('.xp-btrack[data-track=kick]'); const n=t.querySelector('.xp-num'); n.value=4; [...t.querySelectorAll('button')].find(b=>b.textContent==='Spread').click(); });
ok(await page.$$eval('.xp-btrack[data-track=kick] .xp-bs.on',c=>c.map(x=>[...x.parentNode.children].indexOf(x)).join())==='0,4,8,12','Spread puts four kicks evenly');
await page.evaluate(()=>{ const c=document.querySelectorAll('.xp-btrack[data-track=snare] .xp-bs'); c[4].click(); c[12].click(); });
ok(await page.$$eval('.xp-btrack[data-track=snare] .xp-bs.on',c=>c.length)===2,'tapping steps switches them on');
// melodic: tap on, picker opens, choose a note, tap again to switch off
await page.evaluate(()=>{ document.querySelectorAll('.xp-btrack[data-track=bass] .xp-bs')[0].click(); });
ok(await page.$eval('.xp-btrack[data-track=bass] .xp-picker',p=>!p.hidden),'a tapped melodic step opens the note picker');
await page.evaluate(()=>{ [...document.querySelectorAll('.xp-btrack[data-track=bass] .xp-pk')][2].click(); });
const bn=await page.evaluate(()=>window.__bench||document.querySelector('#xpBench').__bench.tracks.find(t=>t.id==='bass').note[0]);
ok(bn===36+4,'the picker only offers notes of the key (third degree of C major = E)');
// loudness and chance
await page.evaluate(()=>{ document.querySelector('[data-mode=vel]').click(); document.querySelector('.xp-btrack[data-track=kick] .xp-bs').click(); });
ok(await page.evaluate(()=>document.querySelector('#xpBench').__bench.tracks[0].vel[0])===0.75,'Loudness mode cycles a step to three quarters');
await page.evaluate(()=>{ document.querySelector('[data-mode=prob]').click(); document.querySelector('.xp-btrack[data-track=kick] .xp-bs').click(); });
ok(await page.evaluate(()=>document.querySelector('#xpBench').__bench.tracks[0].prob[0])===0.75,'Chance mode cycles a step to three quarters');
await page.evaluate(()=>document.querySelector('[data-mode=notes]').click());
// cycle length (polymeter)
await page.evaluate(()=>{ const s=document.querySelector('.xp-btrack[data-track=snare] select'); s.value='12'; s.dispatchEvent(new Event('change')); });
ok(await page.$$eval('.xp-btrack[data-track=snare] .xp-bs.off',c=>c.length)===4,'a 12-step cycle greys out the last four steps');
// play
await page.click('#xpBenchPlay'); await sleep(1500);
ok(/Stop/.test(await page.$eval('#xpBenchPlay',e=>e.textContent)),'Play starts');
ok(await page.evaluate(()=>window.__osc.length>3),'it makes sound');
ok(await page.$$eval('#xpBench .xp-bs.now',c=>c.length)>0,'a playhead moves along the steps');
await page.click('#xpBenchPlay'); ok(/Play/.test(await page.$eval('#xpBenchPlay',e=>e.textContent)),'Stop stops');
// export
await page.click('#xpBenchMidi'); await sleep(200);
ok(await page.evaluate(()=>window.__dl.some(x=>/audio\/midi/.test(x))),'Download MIDI produces a MIDI file');
// save at the end
for(let k=0;k<12&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave'); ok(/My loop/.test(await page.$eval('#xpSave',e=>e.textContent)),'the loop is offered for saving at the end');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
