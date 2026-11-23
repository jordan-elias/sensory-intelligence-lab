// Ambience: the grid, tap and hold, quantised music, recorded and generated beds, Drift, remembering, and real rendered sound.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ctxB=await browser.createBrowserContext(); const P=await newPage(ctxB,BASE,{}); const page=P.page;
await page.goto(`${BASE}/ambience/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.tile'); await sleep(800);
const st=id=>page.$eval(`.tile[data-id="${id}"]`,b=>b.dataset.state);
const vis=id=>page.$eval(`.tile[data-id="${id}"]`,b=>!b.hidden&&b.offsetParent!==null).catch(()=>false);

ok((await page.$$('#rows .tile')).length===11,'eleven music tiles in five rows');
ok((await page.$$('#noise .tile')).length===4,'four generated noises');
for(const n of ['birds','ocean','rain','stream','fire']) ok(await vis('nature:'+n),n+' shows');
ok((await page.$$('#spoken .tile')).length===3&&!(await page.$eval('#h-spoken',e=>e.closest('section').hidden)),'three spoken readings show');
ok((await page.evaluate(()=>window.AMBIENCE.running))===false,'nothing plays by itself');
ok((await st('music:drums:lofi'))==='off','tiles start off');

// tap starts it, on the first bar
await page.click('.tile[data-id="music:drums:lofi"]'); await sleep(500);
ok(await page.evaluate(()=>window.AMBIENCE.running),'tapping a tile starts playback');
ok((await st('music:drums:lofi'))==='on','the first music tile is on at once');
// another drum replaces it, on the next bar
await page.click('.tile[data-id="music:drums:soft"]'); await sleep(150);
ok((await st('music:drums:lofi'))==='off','choosing another drum switches the first off');
ok((await st('music:drums:soft'))==='pending','the new drum waits for the next bar');
await sleep(4500);
ok((await st('music:drums:soft'))==='on','and enters on the bar');
// bass joins the same clock
await page.click('.tile[data-id="music:bass:sub"]'); await sleep(4200); ok((await st('music:bass:sub'))==='on','a second row joins on a bar');

// noise fades in straight away
await page.click('.tile[data-id="noise:pink"]'); await sleep(300); ok((await st('noise:pink'))==='on','noise starts straight away');
await page.click('.tile[data-id="noise:wind"]'); await sleep(200); ok((await st('noise:pink'))==='off'&&(await st('noise:wind'))==='on','only one noise at a time');
// the recorded birds load and play
await page.click('.tile[data-id="nature:birds"]'); await sleep(200);
const loading=await st('nature:birds'); await page.waitForFunction(()=>document.querySelector('.tile[data-id="nature:birds"]').dataset.state==='on',{timeout:15000}).catch(()=>{});
ok(['loading','on'].includes(loading)&&(await st('nature:birds'))==='on','the recorded birds load, then play');

// two nature sounds at most
await page.$eval('.tile[data-id="nature:rain"]',b=>b.click()); await sleep(200);
await page.$eval('.tile[data-id="nature:ocean"]',b=>b.click()); await sleep(200);
ok((await st('nature:birds'))==='off'&&['loading','on'].includes(await st('nature:rain'))&&['loading','on'].includes(await st('nature:ocean')),'a third nature sound makes the oldest step aside');
// spoken word streams, and pauses (not restarts) when switched off
await page.$eval('.tile[data-id="spoken:potatoes"]',b=>b.click()); await sleep(2500);
const sp=await page.evaluate(()=>{const e=window.AMBIENCE.spokenElement('spoken:potatoes'); return e?{paused:e.paused,t:e.currentTime}:null;});
ok(sp&&!sp.paused,'spoken word plays through an audio element '+JSON.stringify(sp));
await page.$eval('.tile[data-id="spoken:lookingglass"]',b=>b.click()); await sleep(200); ok((await st('spoken:potatoes'))==='off','only one spoken reading at a time');
await sleep(6500); const sp2=await page.evaluate(()=>window.AMBIENCE.spokenElement('spoken:potatoes').paused); ok(sp2,'the reading that was switched off pauses');
await page.$eval('.tile[data-id="spoken:lookingglass"]',b=>b.click()); await page.$eval('.tile[data-id="nature:rain"]',b=>b.click()); await page.$eval('.tile[data-id="nature:ocean"]',b=>b.click()); await sleep(400);
// hold opens settings
await page.$eval('.tile[data-id="music:bass:sub"]',b=>b.scrollIntoView({block:'center'})); await sleep(150);
const box=await (await page.$('.tile[data-id="music:bass:sub"]')).boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await sleep(650); await page.mouse.up(); await sleep(300);
ok(await page.$eval('#sheet',d=>d.open),'holding a tile opens its settings, and lifting the finger does not close it');
ok((await page.$eval('#sheet-title-text',e=>e.textContent))==='Bass','the sheet names the row');
ok((await st('music:bass:sub'))==='on','holding does not switch it off');
await page.$eval('#s-vol',e=>{e.value='0.25';e.dispatchEvent(new Event('input',{bubbles:true}));});
await page.$eval('#s-alt',e=>e.click()); ok(!(await page.$eval('#s-rate-row',e=>e.hidden)),'alternating shows its speed');
ok(await page.$eval('#s-pan',e=>e.disabled),'pan is set aside while alternating');
await page.$eval('#s-var-row [data-var="2"]',e=>e.click());
const set=await page.evaluate(()=>window.AMBIENCE.getSettings('music:bass')); ok(set.vol===0.25&&set.alt===true&&set.variation===2,'settings are applied to the engine '+JSON.stringify(set));
ok(await page.$eval('#s-pin-row',e=>e.hidden),'pinning is only offered in Drift');
await page.$eval('#s-close',e=>e.click());

// drift
await page.$eval('[data-mode="drift"]',e=>e.click()); ok(await page.$eval('#bar',e=>e.dataset.mode)==='drift','Drift shows its pace and layers');
ok(await page.$eval('.amb-drift',e=>getComputedStyle(e).display!=='none'),'pace and layers are visible');
await page.$eval('[data-feel="dreamy"]',e=>e.click()); ok((await page.evaluate(()=>window.AMBIENCE.feel))==='dreamy','the feel changes');
// stop and remember
await page.$eval('#play',e=>e.click()); await sleep(300); ok(!(await page.evaluate(()=>window.AMBIENCE.running)),'the stop button stops it');
ok((await st('music:bass:sub'))==='idle','what was on stays marked, paused');
const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sil.ambience.v1')));
ok(saved.mode==='drift'&&saved.feel==='dreamy'&&saved.selected.includes('music:bass:sub')&&saved.settings['music:bass'].alt===true,'choices are saved on this device');
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tile'); await sleep(600);
ok((await st('music:bass:sub'))==='idle'&&!(await page.evaluate(()=>window.AMBIENCE.running)),'after a reload the choices are back but nothing plays');
ok(await page.$eval('#bar',e=>e.dataset.mode)==='drift','the mode is remembered');
// a damaged save cannot break the page
await page.evaluate(()=>localStorage.setItem('sil.ambience.v1','{"selected":[1,"x","music:drums:lofi"],"mode":9,"settings":"no"}'));
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.tile'); await sleep(500);
ok((await st('music:drums:lofi'))==='idle','a damaged save is repaired');
// timer
await page.$eval('#timer',e=>e.click()); ok(/15 min/.test(await page.$eval('#timer',e=>e.textContent)),'the timer steps through its choices');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.filter(e=>!/Failed to load resource/.test(e)).join('|'));

// ── rendered sound: every tile really makes sound, and nothing is loud or broken ──
const R=await page.evaluate(async()=>{
  const { createEngine } = await import('/assets/js/ambience/engine.js'); const { rng, ROWS } = await import('/assets/js/ambience/music.js');
  const SR=22050, LEN=16;
  const render=async(sel,{mode='steady',secs=LEN,drive}={})=>{
    const ctx=new OfflineAudioContext(2,SR*secs,SR); const r=rng(5);
    const e=createEngine({ctx,rand:r,timers:false,loadRecorded:async()=>{ const b=ctx.createBuffer(2,SR*8,SR); for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<d.length;i++) d[i]=(Math.sin(i*0.03)+Math.sin(i*0.071))*0.2; } return b; }});
    e.setSelected(sel); e.setMode(mode); e.begin(0); e.scheduleUntil(secs); if(drive) drive(e); await new Promise(r=>setTimeout(r,60));
    const buf=await ctx.startRendering(); let pk=0,sum=0,bad=0,n=0; const a=buf.getChannelData(0),b=buf.getChannelData(1);
    for(let i=0;i<a.length;i++){ const v=a[i],w=b[i]; if(!Number.isFinite(v)||!Number.isFinite(w)) bad++; pk=Math.max(pk,Math.abs(v),Math.abs(w)); sum+=v*v; n++; }
    return {pk,rms:Math.sqrt(sum/n),bad,e};
  };
  const out={};
  for(const [row,opts] of Object.entries(ROWS)) for(const o of opts){ const x=await render([`music:${row}:${o}`]); out[`${row}:${o}`]={pk:x.pk,rms:x.rms,bad:x.bad}; }
  for(const id of ['noise:pink','noise:brown','noise:white','noise:wind','nature:birds']){ const x=await render([id],{secs:8}); out[id]={pk:x.pk,rms:x.rms,bad:x.bad}; }
  const all=await render(['music:drums:lofi','music:bass:sub','music:chords:warm','music:melody:pluck','music:pad:air','nature:birds','noise:pink']); out.all={pk:all.pk,rms:all.rms,bad:all.bad};
  // quantised entry: a tile switched on mid-bar waits for the bar line
  { const ctx=new OfflineAudioContext(2,SR*20,SR); const e=createEngine({ctx,rand:rng(2),timers:false}); e.setSelected(['music:drums:lofi']); e.begin(0); e.scheduleUntil(1);
    e.toggle('music:bass:sub'); const mid=e.status('music:bass:sub'); e.scheduleUntil(4.5); out.q={mid,after:e.status('music:bass:sub')}; }
  // drift: over many bars it moves, stays inside the cap, and is never silent
  { const ctx=new OfflineAudioContext(2,SR*4,SR); const e=createEngine({ctx,rand:rng(9),timers:false}); e.setMode('drift'); e.setDensity('sparse'); e.setPace('medium');
    e.setSelected(['music:drums:lofi','music:bass:sub','music:chords:warm','music:melody:pluck','music:pad:air','noise:pink']); e.begin(0);
    const seen=new Set(); let maxMusic=0,silent=0; for(let bar=1;bar<=160;bar++){ e.scheduleUntil(bar*3.6); const s=e.sounding; seen.add(s.join()); maxMusic=Math.max(maxMusic,s.filter(x=>x.startsWith('music:')).length); if(!s.length) silent++; }
    out.drift={states:seen.size,maxMusic,silent}; }
  return out;
});
for(const [k,v] of Object.entries(R)){ if(k==='q'||k==='drift'||k==='all') continue; const melodyBells=k==='melody:bells'; ok(v.bad===0&&v.rms>(k.startsWith('noise')||k.startsWith('nature')?0.01:melodyBells?0.0005:0.003)&&v.pk<1,`${k} renders sound (rms ${v.rms.toFixed(4)}, peak ${v.pk.toFixed(2)})`); }
ok(R.all.bad===0&&R.all.pk<2.2&&R.all.rms>0.02,`everything together stays in range (peak ${R.all.pk.toFixed(2)}, rms ${R.all.rms.toFixed(3)})`);
ok(R.q.mid==='pending'&&R.q.after==='on','a tile switched on mid-bar is pending, then on at the bar line '+JSON.stringify(R.q));
ok(R.drift.states>=8&&R.drift.maxMusic<=2&&R.drift.silent===0,'Drift moves, keeps to its cap, and is never silent '+JSON.stringify(R.drift));
// a missing file hides its tile; the real recordings decode, and the short fire is stretched
{ const P2=await newPage(await browser.createBrowserContext(),BASE,{}); const p2=P2.page; p2.evaluateOnNewDocument(()=>{ const f=window.fetch; window.fetch=(u,o)=>/\/audio\/(rain|potatoes)\.mp3/.test(String(u))?Promise.resolve(new Response('no',{status:404,headers:{'content-type':'text/plain'}})):f(u,o); });
  await p2.goto(`${BASE}/ambience/`,{waitUntil:'domcontentloaded'}); await p2.waitForSelector('.tile'); await sleep(800);
  const v=id=>p2.$eval(`.tile[data-id="${id}"]`,b=>!b.hidden&&b.offsetParent!==null).catch(()=>false);
  ok(!(await v('nature:rain'))&&await v('nature:ocean'),'a sound whose file is missing is not shown, the others are');
  ok((await p2.$$('#spoken .tile')).length===2,'nor a missing reading');
  const dur=await p2.evaluate(async()=>{ const { createEngine } = await import('/assets/js/ambience/engine.js'); const ctx=new OfflineAudioContext(2,44100,44100); const out={};
    for(const n of ['fire','ocean','stream']){ const r=await fetch('/audio/'+n+'.mp3'); const raw=await ctx.decodeAudioData(await r.arrayBuffer()); const e=createEngine({ctx,timers:false,loadRecorded:async()=>raw}); e.setSelected(['nature:'+n]); e.begin(0); e.scheduleUntil(1); await new Promise(r=>setTimeout(r,2500)); out[n]={src:raw.duration, status:e.status('nature:'+n)}; }
    return out; });
  ok(dur.fire.src<10&&dur.ocean.src>30&&dur.fire.status==='on'&&dur.ocean.status==='on'&&dur.stream.status==='on','the real recordings decode and play '+JSON.stringify(dur)); }
await browser.close(); server.close(); process.exit(fail?1:0);
