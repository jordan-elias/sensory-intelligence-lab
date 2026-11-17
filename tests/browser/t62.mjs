// Breathing: a choice of sound that follows the breath; the default stays as it was; the choice is remembered.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function count(sound){
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
  await page.evaluateOnNewDocument(()=>{ window.__n={osc:0,buf:0}; const C=window.AudioContext||window.webkitAudioContext;
    const co=C.prototype.createOscillator, cb=C.prototype.createBufferSource;
    C.prototype.createOscillator=function(){ window.__n.osc++; return co.call(this); }; C.prototype.createBufferSource=function(){ window.__n.buf++; return cb.call(this); }; });
  await page.goto(BASE+'/breathing/',{waitUntil:'domcontentloaded'}); await page.waitForSelector('.pb'); await sleep(300);
  if(sound) await page.select('#soundSel',sound);
  await page.click('.pb[data-p="box"]'); await page.click('#startBtn'); await sleep(700);
  const n=await page.evaluate(()=>window.__n); return {n,errors:P.errors,page};
}
const d=await count(null), b=await count('breath'), p=await count('pad'), c=await count('chimes');
ok(d.n.osc>0&&d.n.buf>0,`the default drone is as before (${JSON.stringify(d.n)})`);
ok(b.n.buf===d.n.buf+1&&b.n.osc===d.n.osc,'"breath" adds one airy layer to the drone');
ok(p.n.osc===d.n.osc+4,'"pad" adds four soft voices to the drone');
ok(c.n.osc>0&&c.n.osc%2===0&&c.n.buf===0,'"chimes" plays bells only: no drone, no noise');
ok([d,b,p,c].every(x=>x.errors.length===0),'no errors in any sound '+[d,b,p,c].flatMap(x=>x.errors).join('|'));
// remembered
await p.page.reload({waitUntil:'domcontentloaded'}); await p.page.waitForSelector('.pb'); await sleep(300);
ok(await p.page.$eval('#soundSel',s=>s.value)==='pad','the choice is remembered on this device');
await browser.close(); server.close(); process.exit(fail?1:0);
