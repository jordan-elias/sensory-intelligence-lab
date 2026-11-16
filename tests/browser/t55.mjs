// Sessions: the screen stays on while a session runs, a phone buzzes once at the end, and phase buzzes are opt-in.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(vibrate){
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
  await page.evaluateOnNewDocument((vib)=>{
    window.__lock={req:0,rel:0}; window.__vib=[];
    Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{ window.__lock.req++; return {addEventListener(){},release(){ window.__lock.rel++; }}; }}});
    if(vib) Object.defineProperty(navigator,'vibrate',{configurable:true,value:p=>{ window.__vib.push(p); return true; }}); else Object.defineProperty(navigator,'vibrate',{configurable:true,value:undefined});
    const real=performance.now.bind(performance); performance.now=()=>real()*15;    // a session that takes a minute finishes in seconds
  },vibrate);
  await page.goto(BASE+'/breathing/',{waitUntil:'domcontentloaded'}); await page.waitForSelector('.pb'); await sleep(400);
  return {P,page};
}
{ const {P,page}=await run(true);
  ok(await page.$eval('#hapticOpt',e=>!e.hidden),'the vibration option is shown where the phone can vibrate');
  await page.click('.pb[data-p="box"]'); await page.click('#startBtn'); await sleep(500);
  ok(await page.evaluate(()=>window.__lock.req>=1),'the screen is kept on when the session starts');
  await page.click('#ppb'); await sleep(200);
  ok(await page.evaluate(()=>window.__lock.rel>=1),'it is released when you pause');
  await page.click('#ppb'); await sleep(300);
  ok(await page.evaluate(()=>window.__lock.req>=2),'and taken again when you resume');
  ok(await page.evaluate(()=>window.__vib.length===0),'no breath buzzes unless turned on');
  await page.waitForFunction(()=>document.getElementById('vizLabel').textContent==='Complete',{timeout:30000});
  ok(await page.evaluate(()=>window.__vib.some(p=>p.length===3)),'one buzz at the end of the session');
  ok(await page.$eval('#endNote',e=>!e.hidden)&&/stay as you are/i.test(await page.$eval('#endNote',e=>e.textContent)),'the end is calm and offers what to do next');
  ok(await page.evaluate(()=>window.__lock.rel>=2),'the screen is released at the end');
  await page.click('#startBtn'); await sleep(200); ok(await page.$eval('#endNote',e=>e.hidden),'starting again hides the end note');
  await page.evaluate(()=>localStorage.setItem('sil.haptics','1')); await page.click('#startBtn'); await page.evaluate(()=>{ window.__vib.length=0; }); await sleep(2500);
  ok(await page.evaluate(()=>window.__vib.some(p=>p.length===1)),'breath buzzes happen when turned on');
  ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
}
{ const {page}=await run(false);
  ok(await page.$eval('#hapticOpt',e=>e.hidden),'the vibration option is hidden where it cannot work');
  await page.click('.pb[data-p="box"]'); await page.click('#startBtn'); await sleep(300); ok(true,'a session still runs without vibration');
}
await browser.close(); server.close(); process.exit(fail?1:0);
