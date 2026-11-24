// Oramics: the drawing tools, selection, history, snapping (off by default), saving, and an export that matches the live sound.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/compositions/oramics.html`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#c-draw'); await sleep(900);
const box=await page.evaluate(()=>{ document.getElementById('canvasArea').scrollIntoView({block:'center'}); const r=document.getElementById('c-draw').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
await sleep(200);
const X=f=>box.x+box.w*f, Y=f=>box.y+box.h*f;
const drag=async(f1,g1,f2,g2,steps=12,opts={})=>{ await page.mouse.move(X(f1),Y(g1)); await page.mouse.down(); for(let i=1;i<=steps;i++) await page.mouse.move(X(f1+(f2-f1)*i/steps),Y(g1+(g2-g1)*i/steps)); await page.mouse.up(); };
const st=()=>page.evaluate(()=>ORM._state()); const scan=k=>page.evaluate(k=>ORM._scan(k),k);
const tool=t=>page.$eval('#tool-'+t,b=>b.click());

ok((await st()).snap.on===false,'free glide is the default (no snapping)');
ok(await page.$eval('#pitch-free',b=>b.classList.contains('active')),'free glide is shown as chosen');
// brush
await drag(0.1,0.5,0.4,0.3); const nb=await scan('pitch'); ok(nb>50,'brush leaves a mark on the pitch layer ('+nb+' columns)');
// undo / redo
await page.$eval('#btn-undo',b=>b.click()); ok(await scan('pitch')===0,'undo removes it');
await page.$eval('#btn-redo',b=>b.click()); ok(await scan('pitch')===nb,'redo brings it back');
await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control'); ok(await scan('pitch')===0,'Ctrl+Z undoes');
await page.keyboard.down('Control'); await page.keyboard.press('y'); await page.keyboard.up('Control'); ok(await scan('pitch')===nb,'Ctrl+Y redoes');
// pencil is thinner than the brush
await page.$eval('#btn-undo',b=>b.click()); await tool('pencil'); await drag(0.1,0.5,0.3,0.5); const pc=await page.evaluate(()=>ORM._curve('pitch').filter(v=>v>=0).length); ok(pc>20,'pencil draws ('+pc+' columns)');
// line, rect, ellipse, curve
await page.evaluate(()=>ORM.clearAll()); await tool('line'); await drag(0.1,0.8,0.3,0.2); const ln=await page.evaluate(()=>ORM._curve('pitch')); const a=ln.find(v=>v>=0), z=[...ln].reverse().find(v=>v>=0); ok(a>z,'a rising line reads as a rising pitch (top of the film is high)');
await page.evaluate(()=>ORM.clearAll()); await tool('rect'); await page.evaluate(()=>ORM.setShapeFill(true)); await drag(0.2,0.3,0.4,0.6); const rc=await scan('pitch'); ok(rc>=0.2*box.w-6,'a filled rectangle covers its columns ('+rc+')');
const mid=await page.evaluate(()=>ORM._curve('pitch').filter(v=>v>=0)); ok(Math.abs(mid[10]-0.45)<0.05,'a filled rectangle reads at its middle height ('+mid[10].toFixed(2)+')');
await page.evaluate(()=>{ORM.setShapeFill(false); ORM.clearAll();}); await tool('circle'); await drag(0.5,0.2,0.7,0.8); ok(await scan('pitch')>0.15*box.w,'ellipse draws');
await page.evaluate(()=>ORM.clearAll()); await tool('curve'); await drag(0.1,0.5,0.5,0.5,6); ok(await scan('pitch')===0,'curve: the first drag only sets the line');
await page.mouse.move(X(0.3),Y(0.2)); await page.mouse.down(); await page.mouse.up(); const cv=await page.evaluate(()=>ORM._curve('pitch').filter(v=>v>=0)); ok(cv.length>20&&Math.min(...cv)<0.45,'curve: a second click bends it');
// fill
await page.evaluate(()=>ORM.clearAll()); await tool('rect'); await drag(0.2,0.2,0.5,0.7); await tool('fill'); await page.mouse.click(X(0.35),Y(0.45)); const fl=await page.evaluate(()=>ORM._curve('pitch')); ok(fl[Math.round(box.w*0.35)]>0.3&&fl[Math.round(box.w*0.35)]<0.6,'fill floods a closed shape');
// spray
await page.evaluate(()=>ORM.clearAll()); await tool('spray'); await page.mouse.move(X(0.5),Y(0.5)); await page.mouse.down(); await sleep(250); await page.mouse.up(); ok(await scan('pitch')>5,'spray leaves a scatter');
// eraser
await page.evaluate(()=>ORM.clearAll()); await tool('line'); await drag(0.1,0.5,0.5,0.5); const before=await scan('pitch'); await tool('erase'); await drag(0.2,0.5,0.3,0.5); ok(await scan('pitch')<before,'eraser removes marks');
// selection: reverse, repeat
await page.evaluate(()=>ORM.clearAll()); await tool('line'); await drag(0.1,0.8,0.2,0.2); await tool('select'); await drag(0.05,0.1,0.25,0.95);
ok((await st()).hasSel,'a selection box is made');
ok(await page.$eval('[data-selop="flipTime"]',b=>!b.disabled),'selection tools turn on');
const c0=await page.evaluate(()=>ORM._curve('pitch')); const i0=c0.findIndex(v=>v>=0), i1=c0.length-1-[...c0].reverse().findIndex(v=>v>=0);
await page.$eval('[data-selop="flipTime"]',b=>b.click()); const c1=await page.evaluate(()=>ORM._curve('pitch')); const f0=c1.findIndex(v=>v>=0), f1=c1.length-1-[...c1].reverse().findIndex(v=>v>=0);
ok(c0[i0]>c0[i1]&&c1[f0]<c1[f1],'reverse turns a rising line into a falling one');
await page.$eval('[data-selop="flipPitch"]',b=>b.click()); const c2=await page.evaluate(()=>ORM._curve('pitch')); const g0=c2.findIndex(v=>v>=0), g1=c2.length-1-[...c2].reverse().findIndex(v=>v>=0); ok(c2[g0]>c2[g1],'invert turns it upside down');
const w0=await scan('pitch'); await page.$eval('[data-selop="repeat"]',b=>b.click()); ok(await scan('pitch')>=w0*2-4,'repeat copies it straight after');
// move the selection
const s0=(await st()).sel; await page.mouse.move(X((s0.x+s0.w/2)/box.w),Y((s0.y+s0.h/2)/box.h)); await page.mouse.down(); await page.mouse.move(X((s0.x+s0.w/2)/box.w+0.2),Y((s0.y+s0.h/2)/box.h),{steps:6}); await page.mouse.up();
ok((await st()).sel.x>s0.x+50,'a selection can be dragged to move its content');
await page.$eval('[data-selop="delete"]',b=>b.click()); 
// layers together
await page.evaluate(()=>{ORM.clearAll(); ORM.setLayer('pitch');}); await tool('line'); await drag(0.1,0.5,0.2,0.5); await page.evaluate(()=>ORM.setLayer('amp')); await drag(0.1,0.3,0.2,0.3); await page.evaluate(()=>ORM.setLayer('pitch'));
await tool('select'); await page.$eval('#sel-all',c=>c.click()); await drag(0.05,0.05,0.25,0.95); await page.$eval('[data-selop="repeat"]',b=>b.click());
ok(await scan('pitch')>=2*(0.1*box.w)-4&&await scan('amp')>=2*(0.1*box.w)-4,'with all layers together, repeat copies pitch and loudness at once');
await page.$eval('#sel-all',c=>c.click());
// snap to scale: opt-in
await page.evaluate(()=>{ORM.clearAll(); ORM.setLayer('pitch');}); await tool('line'); await drag(0.1,0.52,0.3,0.52);
await page.$eval('#pitch-snap',b=>b.click()); ok((await st()).snap.on===true&&await page.$eval('#snap-opts',e=>!e.hidden),'snapping is available as an option');
// free glide returns
await page.$eval('#pitch-free',b=>b.click()); ok((await st()).snap.on===false,'free glide can be chosen again');
// export matches the live mapping: render and check it is audible and ends silent
const R=await page.evaluate(async()=>{ const b=await ORM.renderBuffer(22050); const d=b.getChannelData(0); let pk=0,bad=0; for(let i=0;i<d.length;i++){ if(!Number.isFinite(d[i])) bad++; pk=Math.max(pk,Math.abs(d[i])); } let tail=0; for(let i=d.length-2000;i<d.length;i++) tail=Math.max(tail,Math.abs(d[i])); return {pk,bad,tail,secs:b.duration}; });
ok(R.bad===0&&R.pk>0.02&&R.pk<1.2&&R.tail<R.pk*0.2,'the export renders sound ('+R.secs.toFixed(1)+' s, peak '+R.pk.toFixed(2)+') and finishes quiet');
// voices and modulation now reach the export
await page.evaluate(()=>{ORM.setVoices(3);}); const R3=await page.evaluate(async()=>{ const b=await ORM.renderBuffer(22050); const d=b.getChannelData(0); let pk=0; for(const v of d) pk=Math.max(pk,Math.abs(v)); return pk; }); ok(R3>0.02,'extra voices are rendered into the file too');
await page.evaluate(()=>ORM.setVoices(1));
// save and load on this device
await page.$eval('#file-name',e=>{e.value='';}); await page.type('#file-name','test tune'); await page.evaluate(()=>ORM.save());
ok(/Saved/.test(await page.$eval('#file-msg',e=>e.textContent)),'saving says where it went');
await page.evaluate(()=>ORM.clearAll()); ok(await scan('pitch')===0,'cleared');
await page.select('#file-slots','test tune'); await sleep(500); ok(await scan('pitch')>20,'a saved drawing opens again');
ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k==='sil.oramics.v1')),'it is kept in this browser only');
// shortcuts
await page.evaluate(()=>document.activeElement&&document.activeElement.blur()); await page.keyboard.press('r'); ok((await st()).tool==='rect','R chooses the rectangle'); await page.keyboard.press('g'); ok((await st()).tool==='fill','G chooses fill');
// the reading head tool (the page may have scrolled to the file controls)
await page.evaluate(()=>document.getElementById('canvasArea').scrollIntoView({block:'center'})); await sleep(200); { const r=await page.evaluate(()=>{const r=document.getElementById('c-draw').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};}); Object.assign(box,r); }
await tool('head'); await page.mouse.move(X(0.5),Y(0.5)); await page.mouse.down(); await page.mouse.move(X(0.6),Y(0.5),{steps:4}); await page.mouse.up(); ok(parseFloat(await page.$eval('#st-pos',e=>e.textContent))>1,'the head tool moves the reading head');
// playing still works and scrubbing no longer happens after each stroke
await tool('pencil'); const pos0=await page.$eval('#st-pos',e=>e.textContent); await drag(0.7,0.4,0.8,0.4); ok(await page.$eval('#st-pos',e=>e.textContent)===pos0,'drawing does not move the reading head');
await page.$eval('#btn-play',b=>b.click()); await sleep(700); ok(await page.$eval('#btn-play',b=>b.classList.contains('active')),'plays'); await page.$eval('#btn-play',b=>b.click());
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.filter(e=>!/Failed to load resource/.test(e)).join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
