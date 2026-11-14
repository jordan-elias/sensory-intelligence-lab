// Sequencer: velocity, chance, per-track length, saved patterns.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{});
await page.goto(`${BASE}/sequencer/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#padGrid .pad',{timeout:20000}); await sleep(900);
ok(await page.evaluate(()=>!!window.SEQPAT&&!!window.SEQGROOVE.nextLevel),'the new rules and the pattern store loaded');
const bar=i=>page.$eval(`#padGrid .pad:nth-child(${i+1}) .pad-vel i`,e=>e.style.height);
const label=i=>page.$eval(`#padGrid .pad:nth-child(${i+1}) .pad-prob`,e=>e.style.display==='none'?'':e.textContent);
// kick is track 0, step 0 is on in the example
ok(await bar(0)==='100%','an active step starts at full velocity');
await page.click('[data-editmode=vel]'); await page.click('#padGrid .pad:nth-child(1)'); await sleep(80);
ok(await bar(0)==='75%','tapping in velocity mode lowers it to 75%');
await page.click('#padGrid .pad:nth-child(1)'); await page.click('#padGrid .pad:nth-child(1)'); await page.click('#padGrid .pad:nth-child(1)'); await sleep(80);
ok(await bar(0)==='100%','after 25% the next tap goes back to 100%');
await page.click('#padGrid .pad:nth-child(2)'); await sleep(80);
ok(await page.$eval('#info-hint',e=>/Notes mode first/.test(e.textContent)),'tapping an empty step in velocity mode explains what to do, and does not turn it on');
ok(await page.$eval('#padGrid .pad:nth-child(2)',e=>!e.classList.contains('on')),'the empty step stayed off');
// chance
await page.click('[data-editmode=prob]'); await page.click('#padGrid .pad:nth-child(5)'); await sleep(80);
ok(await label(4)==='75%','tapping in chance mode sets 75%');
await page.click('[data-editmode=notes]'); await sleep(80);
ok(await label(4)==='75%'&&await label(0)==='','a step with less than 100% shows its chance, others do not');
// scheduling uses them
const sched=await page.evaluate(async()=>{
  const G=window.SEQGROOVE; const out={};
  out.quiet=G.velocityVol(0.85,0.25)<G.velocityVol(0.85,1)*0.5; out.never=!G.plays(0,0.0001); out.always=G.plays(1,0.9999); return out; });
ok(sched.quiet&&sched.never&&sched.always,'quiet steps are quieter, 0% never sounds, 100% always sounds');
// length
await page.$eval('#len-input',e=>{e.value='5'; e.dispatchEvent(new Event('change'));}); await sleep(80);
ok(await page.$$eval('#padGrid .pad.beyond',p=>p.length)===11,'steps beyond a length of 5 are dimmed');
await page.click('#track-item-1'); await sleep(80);
ok(await page.$eval('#len-input',e=>e.value)==='16','each track has its own length');
await page.click('#track-item-0'); await sleep(80);
ok(await page.$eval('#len-input',e=>e.value)==='5','the first track kept its length');
// play: nothing breaks with odd lengths and chance
await page.evaluate(()=>SEQ.togglePlay()); await sleep(1500); await page.evaluate(()=>SEQ.togglePlay());
// save / load
await page.$eval('#pat-name',e=>e.value='My groove'); await page.click('#patBar .tbtn'); await sleep(100);
ok(await page.$eval('#pat-msg',e=>e.textContent)==='Saved.','a pattern saves');
ok(await page.$$eval('#pat-select option',o=>o.map(x=>x.value))[0]==='My groove'||(await page.$$eval('#pat-select option',o=>o.map(x=>x.value))).includes('My groove'),'it appears in the list');
ok(await page.evaluate(()=>/My groove/.test(localStorage.getItem('sil.seq.patterns'))),'it is stored on this device');
await page.evaluate(()=>{ SEQ.clearTrack(); SEQ.setLen(16); }); await sleep(80);
ok(await page.$$eval('#padGrid .pad.on',p=>p.length)===0,'after clearing the track nothing is on');
await page.evaluate(()=>SEQ.loadPattern()); await sleep(150);
ok(await page.$$eval('#padGrid .pad.on',p=>p.length)===4&&await page.$eval('#len-input',e=>e.value)==='5','loading brings back the steps and the length');
ok(await bar(0)==='100%'&&await page.$eval('#padGrid .pad:nth-child(5) .pad-prob',e=>e.textContent)==='75%','and the chance');
// a damaged entry cannot break the page
await page.evaluate(()=>{ localStorage.setItem('sil.seq.patterns',JSON.stringify([{name:'Bad',saved:'2026-01-01',data:{loops:[[[true,99,'x']]],bpm:9999,len:'x'}}])); SEQ.refreshPatterns('Bad'); SEQ.loadPattern(); }); await sleep(150);
ok(await page.$eval('#tempo-val',e=>+e.textContent)<=200&&await page.$$eval('#padGrid .pad',p=>p.length)===16,'a damaged saved pattern loads safely');
// export still works
const wav=await page.evaluate(async()=>{ let size=0; const orig=URL.createObjectURL; URL.createObjectURL=b=>{ size=b.size; return orig.call(URL,b); }; await SEQ.exportWav(); await new Promise(r=>setTimeout(r,2500)); return size; });
ok(wav>1000,'WAV export still renders ('+wav+' bytes)');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
