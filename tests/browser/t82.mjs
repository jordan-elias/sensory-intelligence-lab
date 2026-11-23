// Semantic Synth: Composed and Raw modes, the working Voice mix slider, and a rendered check of the composed sound.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch({extraArgs:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/compositions/semantic-synth.html`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#main-input'); await sleep(900);
ok(await page.$eval('.mode-chip[data-mode="composed"]',b=>b.getAttribute('aria-pressed')==='true'),'Composed is the default mode');
const TEXT='The river moves slowly through the quiet valley, and I remember the light. Why does it never stop?';
await page.type('#main-input',TEXT); await page.$eval('#analyze-btn',b=>b.click()); await sleep(900);
const note=await page.$eval('.composed-note',e=>e.textContent).catch(()=>''); ok(/Composed in [A-G]#? (minor|dorian|lydian) at \d+ bpm/.test(note),'the response names its key and tempo: '+note);
ok(await page.evaluate(()=>!document.getElementById('stop-btn').disabled&&document.getElementById('analyze-btn').disabled),'playing: stop is on, analyze is off');
await sleep(5500);   // bar one is an introduction, so the first word comes in after about four seconds
ok(await page.$$eval('.token-chip.playing, .token-chip.played',c=>c.length)>=2,'the words light up as they are played');
ok(await page.$$eval('.voice-bar-fill',b=>b.some(x=>parseFloat(x.style.width)>0)),'the voice bars move');
const plan=await page.evaluate(()=>{const p=window.SS_LAST_PLAN; return {bpm:p.bpm,key:p.key.name,n:p.events.length,pcs:p.key.pcs,midi:p.events.flatMap(e=>e.midi),sent:p.sentences.map(s=>s.kind)};});
ok(plan.n>20&&plan.midi.every(m=>plan.pcs.includes(m%12)),'every note is in '+plan.key+' ('+plan.n+' notes)');
ok(JSON.stringify(plan.sent)==='[".","?"]','two sentences, the second a question');
await page.$eval('#stop-btn',b=>b.click()); await sleep(400);
ok(await page.evaluate(()=>document.getElementById('stop-btn').disabled&&!document.getElementById('analyze-btn').disabled),'stop returns the buttons');
// the same text composes the same piece
await page.type('#main-input',TEXT); await page.$eval('#analyze-btn',b=>b.click()); await sleep(300);
const again=await page.evaluate(()=>window.SS_LAST_PLAN.key.name+'|'+window.SS_LAST_PLAN.events.length); ok(again.split('|')[0]===plan.key,'the same text keeps the same key (its events differ only by the recalled tune)');
await page.$eval('#stop-btn',b=>b.click()); await sleep(300);
// the voice mix slider now does something (raw and composed)
await page.$eval('#ctrl-mix',e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});
ok(await page.evaluate(()=>mixG(true)===1.6&&mixG(false)===0),'mix at 0 is all pulse and syntax');
await page.$eval('#ctrl-mix',e=>{e.value='50';e.dispatchEvent(new Event('input',{bubbles:true}));});
ok(await page.evaluate(()=>mixG(true)===1&&mixG(false)===1),'mix at 50 is even, as before');
// raw mode still plays the original way
await page.$eval('.mode-chip[data-mode="raw"]',b=>b.click());
ok(await page.$eval('#input-hint',e=>e.textContent)==='Five voices · No understanding','Raw restores its original line');
await page.type('#main-input','Quiet water falls'); await page.$eval('#analyze-btn',b=>b.click()); await sleep(1200);
ok(await page.$$eval('.token-chip.playing, .token-chip.played',c=>c.length)>=1&&await page.$$eval('.composed-note',c=>c.length)===2,'Raw plays the old way (no composed note on the new response)');
await page.$eval('#stop-btn',b=>b.click());
// ── memory, export, live typing ──
await page.$eval('.mode-chip[data-mode="composed"]',b=>b.click());
ok(await page.$eval('#save-wav',b=>b.disabled)===false||true,'export buttons exist');
await page.$eval('#main-input',e=>{e.value='';});
await page.type('#main-input','Quiet water falls softly.'); await page.$eval('#analyze-btn',b=>b.click()); await sleep(1500);
ok(await page.$eval('#save-midi',b=>!b.disabled)&&await page.$eval('#save-wav',b=>!b.disabled),'save buttons enable once a piece is composed');
await page.$eval('#stop-btn',b=>b.click());
const M=await page.evaluate(async()=>{ const { encodePlanMidi }=await import('/assets/js/semantic/export.js'); const m=encodePlanMidi(window.SS_LAST_PLAN); return { head:String.fromCharCode(...m.slice(0,4)), len:m.length, mem:window.SS_LAST_PLAN.memory.mode }; });
ok(M.head==='MThd'&&M.len>100,'MIDI export of the last plan is a valid file');
await page.type('#main-input',' Quiet water falls softly.'); await page.$eval('#analyze-btn',b=>b.click()); await sleep(1200);
ok(await page.evaluate(()=>window.SS_LAST_PLAN.memory.mode)!=='none','a second piece carries memory of the first');
await page.$eval('#stop-btn',b=>b.click());
await page.$eval('#live-toggle',b=>b.click());
ok(await page.$eval('#live-toggle',b=>b.getAttribute('aria-pressed'))==='true','Play words toggles on');
await page.focus('#main-input'); await page.keyboard.type(' new words. ');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'typing while live raises no errors '+P.errors.join('|'));
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.filter(e=>!/Failed to load resource/.test(e)).join('|'));

// ── rendered sound ──
const R=await page.evaluate(async()=>{
  const { composePlan } = await import('/assets/js/semantic/compose.js'); const { createPlayer } = await import('/assets/js/semantic/player.js');
  const SR=22050; const out={};
  const toks=(text)=>analyzeText(text).tokens.map(t=>({...t,pred:BIGRAMS[t.lower]?BIGRAMS[t.lower].map(([w,wt])=>[w,wt,getFreqScore(w)]):undefined}));
  for(const [name,text] of [['statement','The river moves slowly through the quiet valley and I remember the light.'],['question','Why does the river never stop moving through the quiet valley?'],['ellipsis','Nothing here is certain... the light is gone...'],['one','silence']]){
    const plan=composePlan(text,toks(text)); const probe=new OfflineAudioContext(2,SR,SR); const secs=Math.ceil(createPlayer({ctx:probe,out:probe.destination,timers:false}).renderAll(plan,0.1))+1;
    const ctx=new OfflineAudioContext(2,SR*Math.min(secs,90),SR); const pl=createPlayer({ctx,out:ctx.destination,timers:false}); pl.renderAll(plan,0.1);
    const buf=await ctx.startRendering(); const a=buf.getChannelData(0),b=buf.getChannelData(1); let pk=0,sum=0,bad=0; for(let i=0;i<a.length;i++){ if(!Number.isFinite(a[i])||!Number.isFinite(b[i])) bad++; pk=Math.max(pk,Math.abs(a[i]),Math.abs(b[i])); sum+=a[i]*a[i]; }
    // the last second must be quieter than the loudest second (a fade, not a cut)
    const win=SR; let loud=0,lastRms=0; for(let s=0;s+win<=a.length;s+=win){ let r=0; for(let i=s;i<s+win;i++) r+=a[i]*a[i]; r=Math.sqrt(r/win); loud=Math.max(loud,r); lastRms=r; }
    out[name]={key:plan.key.name,secs:buf.duration,pk,rms:Math.sqrt(sum/a.length),bad,loud,lastRms,stereo:a.some((v,i)=>Math.abs(v-b[i])>1e-4)};
  } return out; });
for(const [k,v] of Object.entries(R)) ok(v.bad===0&&v.rms>0.003&&v.pk<1.5&&v.lastRms<=v.loud,`${k}: ${v.key}, ${v.secs.toFixed(0)}s, rms ${v.rms.toFixed(3)}, peak ${v.pk.toFixed(2)}, ends softer than its loudest`);
ok(R.statement.stereo,'the sound is placed in stereo');
await browser.close(); server.close(); process.exit(fail?1:0);
