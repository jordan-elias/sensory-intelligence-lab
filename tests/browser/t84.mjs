// Spatial game: the sound is placed where the arena says (left, right, front), every voice is broadband and audible, the tutorial's
// sound starts from a tap, and a whole trial works on a phone-sized screen.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ctx0=await browser.createBrowserContext(); const P=await newPage(ctx0,BASE,{}); const page=P.page;
await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.goto(`${BASE}/spatial-game/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#btn-play'); await sleep(900);

// ── the tutorial opens on a first visit and its sound starts from a tap ──
ok(await page.$eval('#tutorial-overlay',e=>!e.classList.contains('hidden')),'the tutorial opens the first time');
ok(await page.evaluate(()=>!!window.__spatial.G.audioCtx&&!!window.__spatial.G.resonanceScene),'the engine is created early so its tables are ready by the first press');
await page.$eval('#tut-hear',b=>b.click()); await sleep(900);
const st1=await page.$eval('#tut-status-1',e=>e.textContent); ok(/Listen/.test(st1),'step 1 plays the circling sound: '+st1);
ok(await page.evaluate(()=>window.__spatial.G.audioCtx&&window.__spatial.G.audioCtx.state==='running'),'the audio engine is running');
const moved=await page.evaluate(async()=>{ const d=document.getElementById('tut-dot-1'); const a=[d.style.left,d.style.top].join(); await new Promise(r=>setTimeout(r,700)); return a!==[d.style.left,d.style.top].join(); }); ok(moved,'the marker moves with the sound');
await page.$eval('#tut-step-1 [data-tut-next]',b=>b.click()); ok(await page.$eval('#tut-step-2',e=>!e.hidden),'next goes to step 2');
await page.$eval('[data-timbre="woodblock"]',b=>b.click()); await sleep(300); ok(/woodblock/.test(await page.$eval('#tut-status-2',e=>e.textContent)),'each sound can be heard from its side');
await page.$eval('#tut-step-2 [data-tut-next]',b=>b.click()); ok(await page.$eval('#tut-step-3',e=>!e.hidden),'step 3');
await page.$eval('#tut-finish',b=>b.click()); ok(await page.$eval('#tutorial-overlay',e=>e.classList.contains('hidden')),'the tutorial closes');
ok(await page.evaluate(()=>localStorage.getItem('sil_spatial_tutorial_seen')==='1'),'and is not shown again');

// ── layout on a phone ──
const lay=await page.evaluate(()=>{ const s=document.getElementById('spatial-diagram').getBoundingClientRect(), p=document.getElementById('btn-play').getBoundingClientRect(); return { stage:s.width, ratio:s.width/s.height, playBottom:p.bottom, vh:innerHeight, vw:innerWidth, scrollW:document.documentElement.scrollWidth, playH:p.height }; });
ok(lay.stage>=330&&Math.abs(lay.ratio-1)<0.02,'the arena fills the phone width ('+Math.round(lay.stage)+' px) and stays round');
ok(lay.scrollW<=lay.vw+1,'nothing scrolls sideways');
ok(lay.playH>=44,'the play button is a finger-sized target ('+Math.round(lay.playH)+' px)');
ok(await page.$('#room-select')===null,'rooms are gone');

// ── placement: render each voice at left / right / front through the same engine and check where it lands ──
const R=await page.evaluate(async()=>{
  const { ToneSource, SOURCE_CONFIGS } = await import('/assets/js/spatial/voices.js'); const { LISTENING_ROOM } = await import('/assets/js/spatial/daily.js');
  const { toSpatial } = await import('/assets/js/spatial/paths.js');
  const sr=44100, dur=2.4;
  async function render(ti,x,y){ const c=new OfflineAudioContext(2,Math.ceil(sr*dur),sr), sc=new ResonanceAudio(c,{ambisonicOrder:3}); sc.setRoomProperties(LISTENING_ROOM.size,LISTENING_ROOM.materials); sc.output.connect(c.destination); await new Promise(r=>setTimeout(r,500));   // the engine decodes its head-response tables first
    const s=new ToneSource(c,sc,SOURCE_CONFIGS[ti]); s.init(0); const p=toSpatial(x,y); s.setPosition(p.sx,p.sy,p.sz); s.startRhythm(0,false); s.scheduleUntil(dur); const b=await c.startRendering(); return [b.getChannelData(0),b.getChannelData(1)]; }
  const rms=a=>{ const k0=Math.floor(sr*0.5); let s=0; for(let i=k0;i<a.length;i++) s+=a[i]*a[i]; return Math.sqrt(s/(a.length-k0)); };
  const fin=a=>a.every(v=>Number.isFinite(v));
  function hf(a){ const N=4096,w=a.slice(sr*0.5,sr*0.5+N); let lo=0,hi=0; for(let k=1;k<N/2;k+=2){ let re=0,im=0; for(let n=0;n<N;n++){ const ang=2*Math.PI*k*n/N, v=w[n]*(0.5-0.5*Math.cos(2*Math.PI*n/N)); re+=v*Math.cos(ang); im-=v*Math.sin(ang); } const e=re*re+im*im, f=k*sr/N; if(f>2000) hi+=e; else lo+=e; } return hi/(hi+lo); }
  const out={};
  for(const [ti,name] of [[0,'string'],[1,'pad'],[2,'wood']]){
    const L=await render(ti,-130,0), Rr=await render(ti,130,0), F=await render(ti,0,-130);
    out[name]={ left:[rms(L[0]),rms(L[1])], right:[rms(Rr[0]),rms(Rr[1])], front:[rms(F[0]),rms(F[1])], finite:fin(L[0])&&fin(Rr[1])&&fin(F[0]), peak:Math.max(...F[0].map(Math.abs)), hf:hf(F[0]) };
  }
  return out; });
for(const n of ['string','pad','wood']){ const o=R[n];
  ok(o.finite&&o.peak>0.01&&o.peak<1.5,n+': audible and clean (peak '+o.peak.toFixed(3)+')');
  ok(o.left[0]>o.left[1]*1.5,n+': a source on the left is louder in the left ear ('+(o.left[0]/o.left[1]).toFixed(1)+'x)');
  ok(o.right[1]>o.right[0]*1.5,n+': a source on the right is louder in the right ear ('+(o.right[1]/o.right[0]).toFixed(1)+'x)');
  const fr=o.front[0]/o.front[1]; ok(fr>0.8&&fr<1.25,n+': a source in front is balanced between the ears ('+fr.toFixed(2)+')');
  ok(o.hf>0.03,n+': carries high-frequency energy the ear uses to place it ('+(o.hf*100).toFixed(1)+'% above 2 kHz)');
}
console.log('levels', JSON.stringify(Object.fromEntries(Object.entries(R).map(([k,v])=>[k,+v.peak.toFixed(3)]))));

// ── a whole trial on the phone: level 10 is the quickest ──
for(let i=0;i<9;i++) await page.$eval('#lvl-next',b=>b.click());
ok((await page.$eval('#lvl-name',e=>e.firstChild.textContent))==='Level 10','the level stepper reaches level 10');
await page.$eval('#btn-play',b=>b.click()); await sleep(1000);
ok(await page.evaluate(()=>window.__spatial.G.phase==='identity'),'a trial starts with the identity phase');
ok(await page.evaluate(()=>document.querySelectorAll('#spatial-diagram .sound-source').length===3),'three dots (level 10)');
await page.waitForFunction(()=>window.__spatial.G.phase==='guess',{timeout:20000}); await sleep(200);
const g=await page.evaluate(()=>{ const ds=[...document.querySelectorAll('#spatial-diagram .sound-source')]; return { n:ds.length, alike:new Set(ds.map(d=>d.className.replace(/source-clickable| /g,''))).size===1, hit:Math.min(...ds.map(d=>d.getBoundingClientRect().width)), pos:ds.map(d=>[parseFloat(d.style.left),parseFloat(d.style.top)]), r:document.getElementById('spatial-diagram').offsetWidth/2 }; });
ok(g.n===3&&g.alike,'at the guess all dots look the same');
ok(g.pos.every(([x,y])=>Math.hypot(x-g.r,y-g.r)<=g.r),'every dot is inside the arena');
await page.$eval('.sound-source[data-idx="0"]',d=>d.click()); await sleep(300);
ok(/Correct/.test(await page.$eval('#feedback-msg',e=>e.textContent)),'tapping the target is correct');
await sleep(2200);
await page.$eval('#btn-play',b=>b.click()); await page.waitForFunction(()=>window.__spatial.G.phase==='guess',{timeout:20000}); await sleep(200);
const wrong=await page.evaluate(()=>{ const t=window.__spatial.G.targetIndex; return t===0?1:0; });
await page.$eval(`.sound-source[data-idx="${wrong}"]`,d=>d.click()); await sleep(300);
ok(/Not that one/.test(await page.$eval('#feedback-msg',e=>e.textContent))&&await page.$('.source-revealed')!==null,'a wrong tap shows where the bowed string ended up');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.filter(e=>!/Failed to load resource/.test(e)).join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
