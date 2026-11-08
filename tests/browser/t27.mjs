// Audio lifecycle: recovery after the system suspends audio, respect for deliberate pauses, latency, media session.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{});
await P.page.goto(`${BASE}/ear-training/index.html`,{waitUntil:'domcontentloaded'});
await P.page.waitForFunction(()=>!!window.silAudio);
const r=await P.page.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const out={};
  const a=new AudioContext(); out.instance=a instanceof AudioContext; out.latency=a.constructor===AudioContext?'native':'wrapped';
  await a.resume(); await sleep(150); out.running=a.state;
  // the system suspends it (bypassing the page's own suspend)
  await AudioContext.prototype.suspend.call(a); out.afterSystem=a.state;
  document.dispatchEvent(new Event('visibilitychange')); await sleep(250); out.recovered=a.state;
  // the page pauses it on purpose
  await a.suspend(); document.dispatchEvent(new Event('visibilitychange')); await sleep(250); out.deliberate=a.state;
  await a.resume(); out.resumedByPage=a.state;
  // never started: left alone
  const b=new AudioContext({latencyHint:'balanced'}); await AudioContext.prototype.suspend.call(b); document.dispatchEvent(new Event('visibilitychange')); await sleep(150); out.neverStarted=b.state;
  out.hint=new AudioContext().baseLatency>=0;
  const ms=silAudio.mediaSession({title:'Test',play(){},pause(){}}); ms.state('playing'); out.ms=('mediaSession' in navigator)?navigator.mediaSession.playbackState:'n/a';
  out.title=('mediaSession' in navigator)?navigator.mediaSession.metadata.title:'n/a';
  return out; });
ok(r.instance,'wrapped AudioContext still passes instanceof');
ok(r.running==='running'&&r.afterSystem==='suspended','system suspend is detected as suspended');
ok(r.recovered==='running','returning to the page resumes audio the system suspended');
ok(r.deliberate==='suspended','a deliberate pause by the page is respected');
ok(r.resumedByPage==='running','the page can still resume its own pause');
ok(r.neverStarted==='suspended','a context that never played is left alone');
ok(r.ms==='playing'&&r.title==='Test','media session metadata and state are set');
const lat=await P.page.evaluate(()=>{ window.SIL_AUDIO_LATENCY='playback'; const c=new AudioContext(); const hi=new AudioContext({latencyHint:'interactive'}); return [c.baseLatency,hi.baseLatency]; });
ok(lat[0]>=lat[1],`playback latency hint is no tighter than interactive (${lat[0].toFixed(3)} vs ${lat[1].toFixed(3)})`);
await browser.close(); server.close(); process.exit(fail?1:0);
