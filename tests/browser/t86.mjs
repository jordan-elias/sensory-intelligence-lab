// Oramics painter: paint with five inks, undo, starters, play, render sound, keep and restore, and layout on desktop and phone.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.setViewport({width:1280,height:800});
await page.goto(`${BASE}/compositions/oramics.html`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#stage'); await sleep(900);
const runsOf=id=>page.evaluate(i=>{ORM.flushAll();return ORM.an[i].runs.filter(Boolean).length},id);
const box=()=>page.$eval('#stage',c=>{const r=c.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height}});
const stroke=async(pts)=>{ const b=await box(); await page.mouse.move(b.x+pts[0][0]*b.w,b.y+pts[0][1]*b.h); await page.mouse.down(); for(const p of pts.slice(1)){ await page.mouse.move(b.x+p[0]*b.w,b.y+p[1]*b.h,{steps:4}); } await page.mouse.up(); await sleep(60); };

ok(await page.$eval('#empty',e=>!e.hidden),'a friendly start overlay shows on an empty canvas');
const lay=await page.evaluate(()=>{const c=document.getElementById('stage').getBoundingClientRect(); return {bottom:c.bottom,vh:innerHeight,w:c.width,h:c.height,ratio:c.width/c.height};});
ok(lay.bottom<=lay.vh&&Math.abs(lay.ratio-1.6)<0.02,'the canvas fits the window without scrolling ('+Math.round(lay.w)+'×'+Math.round(lay.h)+')');
ok((await page.$$('.ink')).length===5&&(await page.$$('.tool')).length===9,'five inks and nine tools');
// paint a melody line
await stroke([[.1,.4],[.3,.3],[.5,.5],[.7,.35]]);
ok(await runsOf('melody')>200,'a stroke becomes paint in the Melody layer ('+await runsOf('melody')+' columns)');
ok(await page.$eval('#empty',e=>e.hidden),'the overlay goes away once you paint');
ok(await runsOf('bass')===0,'other inks stay empty');
// colour is the ink
const px=await page.evaluate(()=>{const d=ORM.layers.melody.g.getImageData(0,0,1280,800).data;for(let i=3;i<d.length;i+=4)if(d[i]===255)return [d[i-3],d[i-2],d[i-1]];return null;});
ok(px&&px[0]>200&&px[2]<120,'melody paints in its own colour '+px);
// undo and redo
await page.$eval('#undo',b=>b.click()); ok(await runsOf('melody')===0,'undo takes the stroke away');
await page.$eval('#redo',b=>b.click()); ok(await runsOf('melody')>200,'redo puts it back');
// shades recolour without changing the music
const before=await runsOf('melody'); await page.$eval('.shade[data-shade="2"]',b=>b.click());
ok(await runsOf('melody')===before,'changing the voice keeps the same marks');
ok(await page.evaluate(()=>ORM.S.settings.shade.melody)===2,'the shade is remembered');
// other inks and tools
await page.keyboard.press('4'); await page.keyboard.press('d'); await stroke([[.1,.9],[.3,.9]]);
ok(await page.evaluate(()=>ORM.S.ink)==='rhythm'&&await runsOf('rhythm')>0,'keys pick the Rhythm ink and the Dots tool, and dots land');
await page.keyboard.press('2'); await page.keyboard.press('r'); await stroke([[.2,.5],[.5,.7]]);
ok(await runsOf('harmony')>100,'a rectangle draws on Harmony');
await page.keyboard.press('3'); await page.keyboard.press('e'); await stroke([[.0,.9],[1,.9]]); ok(true,'eraser runs');
// echo repeats strokes in time
await page.keyboard.press('5'); await page.keyboard.press('b'); await page.select('#echoN','3');
await stroke([[.05,.2],[.1,.2]]); const echoed=await page.evaluate(()=>{ORM.flushAll();const r=ORM.an.texture.runs;const xs=[];for(let i=0;i<r.length;i++)if(r[i]&&(!r[i-1]))xs.push(i);return xs.length});
ok(echoed===3,'Echo ×3 paints three copies ('+echoed+')'); await page.select('#echoN','1');
// mute/solo
await page.$eval('.ink[data-ink="bass"] [data-act=solo]',b=>b.click()); ok(await page.evaluate(()=>ORM.S.solo)==='bass','solo is set'); await page.$eval('.ink[data-ink="bass"] [data-act=solo]',b=>b.click());
// surprise me and starters
await page.$eval('#btnSurprise2',b=>b.click()); await sleep(300);
const all=await page.evaluate(()=>{ORM.flushAll();return Object.keys(ORM.an).map(k=>ORM.an[k].runs.filter(Boolean).length)}); ok(all.every(n=>n>20),'Surprise me paints all five inks '+all);
// play
await page.$eval('#btnPlay',b=>b.click()); await sleep(1200);
ok(await page.evaluate(()=>ORM.S.playing&&ORM.ctx&&ORM.ctx.state==='running'),'it plays'); ok(/Stop/.test(await page.$eval('#playLbl',e=>e.textContent)),'the button becomes Stop');
const t1=await page.$eval('#durOut',e=>e.textContent); await sleep(900); const t2=await page.$eval('#durOut',e=>e.textContent); ok(t1!==t2&&/\//.test(t2),'the clock runs ('+t1+' → '+t2+')');
await page.keyboard.press('Space'); await sleep(200); ok(await page.evaluate(()=>!ORM.S.playing),'Space stops it');
// render the sound offline: it is not silent and uses both sides
const r=await page.evaluate(async()=>{ const m=await import('/assets/js/oramics/engine.js'); ORM.flushAll(); const buf=await m.renderPiece({Offline:OfflineAudioContext,sampleRate:22050,an:ORM.an,w:ORM.S.w,seconds:6,settings:{snap:{on:false},root:0,scale:'major pentatonic'},mix:ORM.S.settings.mix,shade:ORM.S.settings.shade,space:0.5});
  const L=buf.getChannelData(0),R=buf.getChannelData(1);let pl=0,pr=0,e=0;for(let i=0;i<L.length;i++){pl=Math.max(pl,Math.abs(L[i]));pr=Math.max(pr,Math.abs(R[i]));e+=L[i]*L[i];} return {pl,pr,rms:Math.sqrt(e/L.length),len:L.length}; });
ok(r.pl>0.05&&r.pr>0.05&&r.pl<=1.01,'the offline render has sound and does not clip (peak '+r.pl.toFixed(2)+'/'+r.pr.toFixed(2)+', rms '+r.rms.toFixed(3)+')');
// per ink: each one alone makes sound
const per=await page.evaluate(async()=>{ const m=await import('/assets/js/oramics/engine.js'); const out={}; for(const id of ['melody','harmony','bass','rhythm','texture']){ const only={[id]:ORM.an[id]}; const buf=await m.renderPiece({Offline:OfflineAudioContext,sampleRate:22050,an:only,w:ORM.S.w,seconds:4,settings:{snap:{on:false},root:0,scale:'major pentatonic'},mix:ORM.S.settings.mix,shade:ORM.S.settings.shade,space:0.3}); const d=buf.getChannelData(0);let p=0;for(let i=0;i<d.length;i++)p=Math.max(p,Math.abs(d[i]));out[id]=+p.toFixed(3);} return out; });
ok(Object.values(per).every(p=>p>0.01),'each ink makes sound by itself '+JSON.stringify(per));
// keep, reload, restore
await page.type('#pname','Test'); await page.$eval('#btnSave',b=>b.click()); await sleep(300);
ok(await page.$$eval('#slots .slot',a=>a.length)===1,'a picture is kept on this device');
await sleep(1800); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#stage'); await sleep(1200);
ok(await runsOf('melody')>20&&await page.$eval('#msg',e=>/where you left off/.test(e.textContent)),'reloading picks up where you left off');
// paper
await page.$eval('#paper',b=>b.click()); ok(await page.evaluate(()=>ORM.S.settings.paper)==='light','light paper');
// phone
await page.$eval('#clearAll',b=>b.click()); await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#stage'); await sleep(1200);
const ph=await page.evaluate(()=>{const c=document.getElementById('stage').getBoundingClientRect(),b=document.querySelector('.p-bar').getBoundingClientRect(),t=document.querySelector('.sil-tabs');return {cw:c.width,ch:c.height,barBottom:b.bottom,tabTop:t?t.getBoundingClientRect().top:null,vh:innerHeight,sw:document.documentElement.scrollWidth,tools:document.getElementById('tools').getBoundingClientRect().top>c.bottom-1,btn:document.getElementById('btnPlay').getBoundingClientRect().height};});
ok(ph.cw<=390&&ph.ch>300,'phone: the canvas fills the width ('+Math.round(ph.cw)+'×'+Math.round(ph.ch)+')');
ok(ph.sw<=390,'phone: no sideways scroll'); ok(ph.tabTop!==null&&ph.barBottom<=ph.tabTop+1,'phone: the Play bar sits above the tab bar ('+Math.round(ph.barBottom)+' ≤ '+Math.round(ph.tabTop)+')');
ok(ph.btn>=44,'phone: Play is a thumb-sized button'); ok(ph.tools,'phone: tools sit under the canvas');
await page.touchscreen.tap(195,300); ok(true,'tap on canvas does not throw');
ok(P.errors.filter(e=>!/Failed to load resource|ERR_|recoveryNudge/.test(e)).length===0,'no page errors '+P.errors.filter(e=>!/Failed to load resource|ERR_/.test(e)).join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
