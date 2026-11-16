// Regulation: every journey renders, stays at a safe level, and the states sound different from one another.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{});
await page.goto(`${BASE}/regulation/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.sb',{timeout:20000}); await sleep(500);
const MEASURE=`(async()=>{
  const buf=await (await fetch(window.__regS.wavUrl)).arrayBuffer(); const dv=new DataView(buf), n=(buf.byteLength-44)/2, sr=44100;
  const x=new Float32Array(n); for(let i=0;i<n;i++) x[i]=dv.getInt16(44+i*2,true)/32768;
  const win=(a,b)=>{ const s=Math.floor(a*sr), e=Math.floor(b*sr); let sq=0,dq=0,pk=0; for(let i=s+1;i<e;i++){ sq+=x[i]*x[i]; const d=x[i]-x[i-1]; dq+=d*d; const v=Math.abs(x[i]); if(v>pk)pk=v; } return {rms:Math.sqrt(sq/(e-s)), zcr:Math.sqrt(dq/Math.max(sq,1e-12)), peak:pk}; };
  // loudness changes per 0.25 s: how much it moves (dynamics)
  const env=[]; for(let t=20;t<40;t+=0.25){ env.push(win(t,t+0.25).rms); } const m=env.reduce((a,b)=>a+b,0)/env.length, sd=Math.sqrt(env.reduce((a,b)=>a+(b-m)**2,0)/env.length);
  const act=(a,b)=>{ const e=[]; for(let t=a;t<b;t+=0.1) e.push(win(t,t+0.1).rms); const mm=e.reduce((p,q)=>p+q,0)/e.length; return Math.sqrt(e.reduce((p,q)=>p+(q-mm)**2,0)/e.length)/mm; };
  return {early:win(20,50), late:win(250,280), all:win(0,300), move:sd/m, actEarly:act(20,50), actLate:act(250,280)};
})()`;
async function journey(cur,tgt){
  await page.evaluate((c,t)=>{ document.querySelector('.sb[data-g=cur][data-s='+c+']').click(); document.querySelector('.sb[data-g=tgt][data-s='+t+']').click(); document.getElementById('genBtn').click(); },cur,tgt);
  await page.waitForFunction(()=>/WAV ready|Render failed/.test(document.getElementById('rs').textContent),{timeout:240000});
  const status=await page.$eval('#rs',e=>e.textContent); const m=await page.evaluate(MEASURE); return {status,m};
}
const R={};
for(const [c,t] of (process.env.PAIRS?process.env.PAIRS.split(',').map(x=>x.split('>')):[['overwhelmed','calm'],['tired','energized'],['overstim','grounded']])){ R[c+'>'+t]=await journey(c,t); const r=R[c+'>'+t]; console.log(c,t,JSON.stringify(r.m)); ok(r.status==='WAV ready',c+' to '+t+' renders'); ok(r.m.all.peak<=0.95&&r.m.all.peak>0.05,c+' to '+t+' stays below clipping and is audible (peak '+r.m.all.peak.toFixed(2)+')'); }
const a=R['overwhelmed>calm'].m, b=R['tired>energized'].m, c=R['overstim>grounded'].m;
ok(a.early.zcr>a.late.zcr*1.15,'overwhelmed to calm gets darker as it goes');
ok(b.actLate>b.actEarly*1.3,'tired to energized becomes more active as it goes ('+b.actEarly.toFixed(3)+' to '+b.actLate.toFixed(3)+')');
ok(c.early.zcr>c.late.zcr*1.15,'overstimulated to grounded gets darker as it goes');
ok(c.actEarly>c.actLate*1.3,'overstimulated to grounded becomes less busy as it goes ('+c.actEarly.toFixed(3)+' to '+c.actLate.toFixed(3)+')');
ok(errors.filter(e=>!/Failed to load resource|play\(\)|NotAllowed/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
