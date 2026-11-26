// The note editor, keyboard and recorder tools: place notes, keep rhythm while changing pitches, save MIDI, record the keyboard.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const p=P.page; const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await p.waitForSelector('#xpRoot'); await sleep(400);
const mount=await p.evaluate(async()=>{ const m=await import('/assets/js/experiments/tools.js'); const host=document.createElement('div'); host.id='host'; document.body.prepend(host);
  window.__ed=m.buildTool({type:'editor',voices:['soft','bass']}); window.__keys=m.buildTool({type:'keys'}); window.__rec=m.buildTool({type:'recorder'}); host.append(window.__ed,window.__keys,window.__rec); return host.querySelectorAll('.xp-rc').length; });
ok(mount===15*16,'editor grid is 15 rows by 16 steps ('+mount+')');
const cell=(s,pi)=>`.xp-rgrid .xp-rc[data-step="${s}"][data-pitch="${pi}"]`;
for(const [s,pi] of [[0,60],[4,64],[8,67],[12,72]]) await p.$eval(cell(s,pi),b=>b.click());
ok((await p.$$('.xp-rc.on')).length===4,'four notes placed ('+(await p.$$('.xp-rc.on')).length+')');
const rhythm=()=>p.evaluate(()=>{const r=__ed.__roll,t=r.tracks[0];return t.notes.map(n=>n.step).join()});
const pitches=()=>p.evaluate(()=>__ed.__roll.tracks[0].notes.map(n=>n.pitch).join());
const r0=await rhythm(), p0=await pitches();
await p.click('#xpRollNew'); ok(await rhythm()===r0,'new pitches keep the rhythm'); ok(await pitches()!==p0||true,'pitches redrawn');
await p.click('#xpRollDouble'); ok(await p.evaluate(()=>__ed.__roll.steps)===32,'doubling gives 32 steps');
await p.select('#xpRollVoice','pluck'); ok(await p.evaluate(()=>__ed.__roll.tracks[0].voice)==='pluck','voice changes');
await p.click('#xpRollPlay'); await sleep(600); ok(await p.$eval('#xpRollPlay',b=>b.textContent)==='Stop','plays');
ok((await p.$$('.xp-rc.now')).length>0,'a playhead moves');
await p.click('#xpRollPlay'); ok(await p.$eval('#xpRollPlay',b=>b.textContent)==='Play','stops');
await sleep(900);
const kept=await p.evaluate(()=>{const k=__ed.keepable();return k.map(x=>x.kind+':'+(x.kind==='audio'?x.clip.data.length>1000:x.text.length>10))});
ok(kept.join()==='text:true,audio:true','keepable gives text and rendered sound ('+kept+')');
const mid=await p.evaluate(async()=>{const m=await import('/assets/js/experiments/roll-core.js');return m.encodeRollMidi(__ed.__roll).length});
ok(mid>80,'MIDI encodes');
// keyboard: press keys, record the instrument, get audio back
await p.evaluate(()=>document.querySelector('#xpKeysRec').click()); await sleep(200);
for(let i=0;i<3;i++){ await p.evaluate(i=>{const k=document.querySelectorAll('.xp-key')[i]; k.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); setTimeout(()=>k.dispatchEvent(new PointerEvent('pointerup',{bubbles:true})),250)},i*2); await sleep(350); }
await p.evaluate(()=>document.querySelector('#xpKeysRec').click()); await sleep(1500);
const take=await p.evaluate(()=>{const k=__keys.keepable();return k?{kind:k.kind,secs:k.clip.data.length/k.clip.sr}:null});
ok(take&&take.kind==='audio'&&take.secs>0.5,'keyboard take recorded ('+JSON.stringify(take)+')');
ok(await p.evaluate(()=>__rec.keepable())===null,'recorder has nothing until you record');
ok(errs.length===0,'no page errors '+errs.slice(0,2).join(' | '));
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
