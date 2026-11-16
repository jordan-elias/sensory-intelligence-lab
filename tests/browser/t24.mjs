// Audio safety: the shared output stage limits peaks, leaves exports alone, and is on every sound page.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{});
await P.page.goto(`${BASE}/breathing/index.html`,{waitUntil:'domcontentloaded'});
await P.page.waitForFunction(()=>!!window.silAudio,{timeout:10000});

const loud=await P.page.evaluate(async()=>{
  const off=new OfflineAudioContext(2,44100*2,44100); const bus=silAudio.busFor(off);
  for(let i=0;i<14;i++){ const o=off.createOscillator(); o.frequency.value=110*(i+1); const g=off.createGain(); g.gain.value=0.9; o.connect(g); g.connect(bus.input); o.start(); }
  const r=await off.startRendering(); let peak=0;
  for(let c=0;c<r.numberOfChannels;c++){ const d=r.getChannelData(c); for(let i=0;i<d.length;i++) peak=Math.max(peak,Math.abs(d[i])); }
  return peak; });
ok(loud<=0.91, `14 loud voices stay under the ceiling (peak ${loud.toFixed(3)})`);

const quiet=await P.page.evaluate(async()=>{
  const off=new OfflineAudioContext(1,44100*2,44100); const bus=silAudio.busFor(off);
  const o=off.createOscillator(); o.frequency.value=220; const g=off.createGain(); g.gain.value=0.2; o.connect(g); g.connect(bus.input); o.start();
  const r=await off.startRendering(); const d=r.getChannelData(0); let early=0,late=0;
  for(let i=0;i<200;i++) early=Math.max(early,Math.abs(d[i])); for(let i=44100;i<d.length;i++) late=Math.max(late,Math.abs(d[i]));
  return {early,late}; });
ok(quiet.early<0.02, `starts silent (fades in), first samples ${quiet.early.toFixed(4)}`);
ok(quiet.late>0.12&&quiet.late<0.16, `quiet sound still plays at about 0.7 of its level (${quiet.late.toFixed(3)})`);

const exportPeak=await P.page.evaluate(async()=>{
  const off=new OfflineAudioContext(1,44100,44100); const o=off.createOscillator(); const g=off.createGain(); g.gain.value=0.5; o.connect(g); g.connect(off.destination); o.start();
  const r=await off.startRendering(); const d=r.getChannelData(0); let p=0,first=0; for(let i=0;i<d.length;i++) p=Math.max(p,Math.abs(d[i])); for(let i=0;i<500;i++) first=Math.max(first,Math.abs(d[i]));
  return {p,first}; });
ok(Math.abs(exportPeak.p-0.5)<0.01 && exportPeak.first>0.2, `offline renders for exports are untouched (peak ${exportPeak.p.toFixed(3)})`);

const live=await P.page.evaluate(()=>{
  const ctx=new AudioContext(); const o=ctx.createOscillator();
  const ret=o.connect(ctx.destination); const bus=silAudio.busFor(ctx);
  const same=ret===bus.input; const g=ctx.createGain(); g.connect(ctx.destination); g.disconnect(ctx.destination);
  ctx.close(); return same; });
ok(live,'live connections to the speakers go through the safety stage');

const notice=await P.page.evaluate(()=>!!document.getElementById('silHeadphoneNotice'));
ok(notice,'first use shows the headphone note');
await P.page.evaluate(()=>document.querySelector('#silHeadphoneNotice button').click());
const P2=await newPage(await browser.createBrowserContext(),BASE,{});
await P2.page.goto(`${BASE}/breathing/index.html`,{waitUntil:'domcontentloaded'}); await P2.page.waitForFunction(()=>!!window.silAudio);
await P2.page.evaluate(()=>{ const c=new AudioContext(); silAudio.busFor(c); });
ok(await P2.page.evaluate(()=>!!document.getElementById('silHeadphoneNotice')),'a fresh browser sees the note again');
await P2.page.evaluate(()=>{ const c=new AudioContext(); silAudio.busFor(c); });
ok(await P2.page.evaluate(()=>document.querySelectorAll('#silHeadphoneNotice').length===1),'only one note at a time');

const pages=['breathing/index.html','cocktail-party-problem/index.html','compositions/chance.html','compositions/neural-synthesis.html','compositions/oramics.html','compositions/phase-machine.html','compositions/rooms.html','compositions/semantic-synth.html','compositions/waves.html','ear-training/index.html','journal/index.html','regulation/index.html','sequencer/index.html','soundscape-machine/index.html','spatial-game/index.html','creature/index.html'];
for(const p of pages){
  const Q=await newPage(await browser.createBrowserContext(),BASE,{});
  await Q.page.goto(`${BASE}/${p}`,{waitUntil:'domcontentloaded'}).catch(()=>{});
  await new Promise(r=>setTimeout(r,600));
  const has=await Q.page.evaluate(()=>typeof window.silAudio==='object');
  const errs=Q.errors.filter(e=>!/Failed to load resource|net::ERR|ResonanceAudio is not defined/.test(e));
  ok(has&&errs.length===0,`${p} has the safety stage${errs.length?' ERR '+errs.join('|').slice(0,160):''}`);
  await Q.page.close();
}
await browser.close(); server.close(); process.exit(fail?1:0);
