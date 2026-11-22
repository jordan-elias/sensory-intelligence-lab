// Sequencer: the screen is held awake while it plays and released when it stops.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ window.__wl={req:0,rel:0}; Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wl.req++;const l=new EventTarget();l.release=()=>{window.__wl.rel++;};return l;}}}); });
await page.goto(`${BASE}/sequencer/`,{waitUntil:'networkidle0'});
await page.evaluate(()=>window.SEQ.togglePlay()); await new Promise(r=>setTimeout(r,200));
ok((await page.evaluate(()=>window.__wl.req))===1,'play takes a wake lock');
await page.evaluate(()=>window.SEQ.togglePlay()); await new Promise(r=>setTimeout(r,100));
ok((await page.evaluate(()=>window.__wl.rel))===1,'stop releases it');
await page.evaluate(()=>window.SEQ.togglePlay()); await new Promise(r=>setTimeout(r,600)); await page.evaluate(()=>window.SEQ.togglePlay());
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'playing with the shared sounds raises no errors '+P.errors.join('|'));
await page.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); window.SEQ.togglePlay(); });
await new Promise(r=>setTimeout(r,800)); await page.evaluate(()=>window.SEQ.togglePlay());
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'playing with the page hidden (screen off) raises no errors');
await browser.close(); server.close(); process.exit(fail?1:0);
