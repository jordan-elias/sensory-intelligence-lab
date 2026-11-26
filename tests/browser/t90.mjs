// Oramics: Stop is silent. Notes, drum hits and the reverb tail that were already scheduled must not be heard after Stop.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/compositions/oramics.html`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#stage'); await sleep(800);
await page.evaluate(async()=>{ const m=await import('/assets/js/oramics/starters.js'); ORM.startFrom(m.starterMarks('heartbeat'),'x'); ORM.startFrom(m.starterMarks('rain'),'x'); });
await page.evaluate(()=>{ ORM.play(); window.__an=null; });
await sleep(300);
await page.evaluate(()=>{ const e=ORM.engine, c=e.ctx, a=c.createAnalyser(); a.fftSize=2048; e.master.connect(a); window.__an=a; window.__rms=()=>{const d=new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s=0; for(const x of d) s+=x*x; return Math.sqrt(s/d.length);}; window.__max=async(ms)=>{let m=0; const t0=performance.now(); while(performance.now()-t0<ms){ m=Math.max(m,window.__rms()); await new Promise(r=>setTimeout(r,20)); } return m;}; });
const playing=await page.evaluate(()=>window.__max(1200));
ok(playing>0.01,'it is making sound while playing (rms '+playing.toFixed(3)+')');
const useSilence=process.argv.includes('--old');
await page.evaluate(u=>{ if(u){ ORM.engine.silence(ORM.engine.ctx.currentTime); clearInterval(0); } ORM.stop(); },useSilence);
await sleep(150);
const after=await page.evaluate(()=>window.__max(2500));
ok(after<0.002,'silent after Stop, including the reverb tail (rms '+after.toExponential(2)+')');
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
