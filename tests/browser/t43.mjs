// Neural Synthesis, Instrument mode: the network is the oscillator in an AudioWorklet; the controls change the sound.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/compositions/neural-synthesis.html`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#nnPlay',{timeout:20000}); await sleep(800);
ok(await page.evaluate(()=>window.__nnmode()==='inst'),'it opens in Instrument mode');
ok(await page.$eval('#instPanel',e=>!e.hidden)&&await page.$eval('#tabSound',e=>e.hidden),'instrument controls are shown, the self-playing mixer is hidden');
ok((await page.$$eval('#nnKeys button',b=>b.length))===13,'there is a keyboard');
// a spectrum exists before any sound
ok(await page.evaluate(()=>window.__inst.harm.length===24&&window.__inst.cycle.length===256),'one cycle and its harmonics are drawn before starting');
await page.click('#nnPlay'); await sleep(1500);
ok(await page.evaluate(()=>window.__inst.running&&window.__inst.ctx.state==='running'&&!!window.__inst.node),'the audio worklet is running');
// hear it: tap the worklet output through an analyser
const rms=async()=>page.evaluate(async()=>{ const e=window.__inst, an=e.ctx.createAnalyser(); an.fftSize=2048; e.master.connect(an); await new Promise(r=>setTimeout(r,300)); const d=new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); e.master.disconnect(an); return Math.sqrt(d.reduce((s,v)=>s+v*v,0)/d.length); });
ok(await rms()<1e-4,'silent until a note is played');
await page.evaluate(()=>window.__inst.noteOn(220)); await sleep(400);
const loud=await rms(); ok(loud>0.005,'a note makes sound that comes from the network ('+loud.toFixed(4)+')');
// changing a weight changes the wave
const wave1=await page.evaluate(()=>Array.from(window.__inst.cycle.slice(0,64)));
await page.click('#nnGainUp'); await sleep(300);
const wave2=await page.evaluate(()=>Array.from(window.__inst.cycle.slice(0,64)));
ok(wave1.some((v,i)=>Math.abs(v-wave2[i])>0.01),'changing the weights changes the wave');
await page.evaluate(()=>window.__inst.noteOff()); await sleep(600);
ok(await rms()<0.002,'releasing the note fades the sound out');
// choose a neuron: the inspector shows its cycle
await page.evaluate(()=>window.__nnui.choose({kind:'node',layer:1,i:2})); await sleep(300);
ok(await page.$('#nnICycle')!==null&&!/null/.test(await page.$eval('#nnInspector',e=>e.textContent)),'a neuron shows its own cycle and no stray text');
// teach a wave
await page.select('#nnTeachWave','square'); await page.click('#nnTeach'); await sleep(7000);
const sq=await page.evaluate(()=>{ const c=window.__inst.cycle; return {a:c[32],b:c[96],loss:window.__inst.conductor.lossNow}; });
ok(sq.loss<0.2,'teaching a square wave lowers the error ('+sq.loss.toFixed(3)+')');
// switch modes
await page.click('#modePlay'); await sleep(500);
ok(await page.evaluate(()=>window.__nnmode()==='play')&&await page.$eval('#instPanel',e=>e.hidden)&&await page.$eval('#tabSound',e=>!e.hidden),'Self-playing mode brings back its own controls');
await page.click('#nnPlay'); await sleep(1500);
ok(await page.evaluate(()=>window.__nn.running),'the self-playing network still runs');
ok(P.errors.filter(e=>!/Failed to load resource|net::ERR/.test(e)).length===0,'no page errors '+P.errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
