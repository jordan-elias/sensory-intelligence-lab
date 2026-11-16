// The installed app is consumption-only: no purchase links, no billing buttons, no plans page. The website is unchanged.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for (const app of [true,false]) {
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
  if(app) await page.evaluateOnNewDocument(()=>{ window.SIL_APP=true; window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',Plugins:{}}; });
  await page.goto(BASE+'/subscribe/',{waitUntil:'domcontentloaded'}); await page.addScriptTag({type:'module',content:app?"import('/assets/js/app/native.js')":''}).catch(()=>{}); await sleep(1800);
  const r=await page.evaluate(()=>({t:document.querySelector('main')?.innerText||'', btn:[...document.querySelectorAll('main button')].filter(b=>b.offsetParent).length}));
  if(app){ ok(/Plans are not sold in this app/.test(r.t),'App: the plans page shows a plain note'); ok(r.btn===0,'App: no buy buttons on that page'); }
  else ok(!/Plans are not sold/.test(r.t),'Website: plans page unchanged');
}
await browser.close(); server.close(); process.exit(fail?1:0);
