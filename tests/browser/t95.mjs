// Regulation sound, measured: renders each journey offline and reads numbers off the audio (loudness, brightness, onsets, peak).
// It can say whether the cues move the way the design says. It cannot say whether it sounds good: that needs ears.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const p=P.page; const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`${BASE}/regulation/`,{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,800));
const analyse=(cur,tgt,seed)=>p.evaluate(async(cur,tgt,seed)=>{
  const {buildGraph,mkRng,DUR,SR}=window.__reg; const SRr=22050;
  const ctx=new OfflineAudioContext(1,DUR*SRr,SRr); buildGraph(ctx,cur,tgt,mkRng(seed)); const buf=await ctx.startRendering(); const d=buf.getChannelData(0);
  const fft=(re)=>{const n=re.length,im=new Float64Array(n);for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){[re[i],re[j]]=[re[j],re[i]];}}
    for(let l=2;l<=n;l<<=1){const a=-2*Math.PI/l,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=l){let cr=1,ci=0;for(let k=0;k<l/2;k++){const u=i+k,v=i+k+l/2,tr=re[v]*cr-im[v]*ci,ti=re[v]*ci+im[v]*cr;re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;const ncr=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=ncr;}}}
    const m=new Float64Array(n/2);for(let i=0;i<n/2;i++)m[i]=Math.hypot(re[i],im[i]);return m;};
  const segs=[];const L=30*SRr;let peak=0;for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>peak)peak=a;}
  for(let s=0;s<10;s++){const a=s*L,b=a+L;let e=0;for(let i=a;i<b;i++)e+=d[i]*d[i];const rms=Math.sqrt(e/L);
    // brightness: spectral centroid, averaged over 6 frames of 4096
    let cen=0,cn=0;for(let f=0;f<6;f++){const o=a+Math.floor((f+.5)*L/6),fr=new Float64Array(4096);for(let i=0;i<4096;i++)fr[i]=d[o+i]*(0.5-0.5*Math.cos(2*Math.PI*i/4095));const m=fft(fr);let sn=0,sd=0;for(let k=1;k<m.length;k++){sn+=k*SRr/4096*m[k];sd+=m[k];}if(sd>0){cen+=sn/sd;cn++;}}
    // onsets: peaks in the 10 ms energy envelope that rise 3 dB over the last 50 ms
    const H=Math.floor(SRr*0.01),env=[];for(let i=a;i+H<=b;i+=H){let q=0;for(let k=0;k<H;k++)q+=d[i+k]*d[i+k];env.push(Math.sqrt(q/H));}
    let on=0;for(let i=6;i<env.length-1;i++){const base=Math.max(1e-5,(env[i-6]+env[i-5]+env[i-4]+env[i-3]+env[i-2])/5);if(env[i]>base*1.5&&env[i]>=env[i-1]&&env[i]>env[i+1]&&env[i]>0.004)on++;}
    segs.push({rms,cen:cen/cn,on:on/30});}
  return {peak,segs,nan:d.some(x=>x!==x)};
},cur,tgt,seed);
const show=(n,r)=>console.log(n.padEnd(20)+' peak '+r.peak.toFixed(2)+' | rms '+r.segs.map(s=>(s.rms*1000|0)).join(' ')+' | centroid '+r.segs.map(s=>s.cen|0).join(' ')+' | onsets/s '+r.segs.map(s=>s.on.toFixed(1)).join(' '));
const R={};
for(const [c,t] of [['angry','calm'],['calm','calm'],['angry','angry'],['tired','alert']]){ R[c+'>'+t]=await analyse(c,t,12345); show(c+'→'+t,R[c+'>'+t]); }
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length, first=(r,k)=>mean(r.segs.slice(0,2).map(s=>s[k])), last=(r,k)=>mean(r.segs.slice(8,10).map(s=>s[k]));
const A=R['angry>calm'];
ok(Object.values(R).every(r=>!r.nan),'no NaN anywhere in any render');
ok(Object.values(R).every(r=>r.peak<0.95),'no render comes near clipping (max '+Math.max(...Object.values(R).map(r=>r.peak)).toFixed(2)+')');
ok(first(R['angry>angry'],'cen')>1.5*first(R['calm>calm'],'cen'),'angry is brighter than calm ('+(first(R['angry>angry'],'cen')|0)+' vs '+(first(R['calm>calm'],'cen')|0)+' Hz centroid)');
ok(first(R['angry>angry'],'on')>2*first(R['calm>calm'],'on'),'angry has many more onsets than calm ('+first(R['angry>angry'],'on').toFixed(1)+' vs '+first(R['calm>calm'],'on').toFixed(1)+' a second)');

ok(last(A,'cen')<0.7*first(A,'cen'),'angry→calm gets darker ('+(first(A,'cen')|0)+' → '+(last(A,'cen')|0)+' Hz)');
ok(last(A,'on')<0.5*first(A,'on'),'angry→calm thins out in onsets ('+first(A,'on').toFixed(1)+' → '+last(A,'on').toFixed(1)+')');
ok(last(A,'rms')<first(A,'rms')*0.6,'it gets clearly softer as it settles ('+(first(A,'rms')*1000|0)+' → '+(last(A,'rms')*1000|0)+')');
ok(mean(R['calm>calm'].segs.map(s=>s.rms))<0.5*mean(R['angry>angry'].segs.map(s=>s.rms)),'calm is much softer than angry');
// a journey from a state to itself should stay put: nothing should settle by rule
const flat=(r,k)=>{const f=first(r,k),l=last(r,k);return Math.max(f/l,l/f)};
ok(flat(R['angry>angry'],'cen')<1.6,'angry→angry keeps its brightness (ratio '+flat(R['angry>angry'],'cen').toFixed(2)+')');
ok(flat(R['calm>calm'],'rms')<1.5&&flat(R['angry>angry'],'rms')<1.5,'a state held for 5 minutes keeps its loudness');
ok(last(R['tired>alert'],'cen')>first(R['tired>alert'],'cen')*1.2,'tired→alert gets brighter ('+(first(R['tired>alert'],'cen')|0)+' → '+(last(R['tired>alert'],'cen')|0)+' Hz)');
const loud=Object.values(R).map(r=>mean(r.segs.map(s=>s.rms))); ok(Math.max(...loud)/Math.min(...loud)<5,'loudness across states stays in a sensible range (ratio '+(Math.max(...loud)/Math.min(...loud)).toFixed(1)+')');
// smoothness: no segment-to-segment jump in loudness bigger than 2x across a whole journey
for(const k of ['angry>calm','tired>alert']){const s=R[k].segs.map(x=>x.rms);let worst=0;for(let i=1;i<s.length;i++)worst=Math.max(worst,Math.max(s[i]/s[i-1],s[i-1]/s[i]));ok(worst<2,k+' loudness moves smoothly (largest step '+worst.toFixed(2)+'x per 30 s)');}
ok(errs.length===0,'no page errors '+errs.join('|'));
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
