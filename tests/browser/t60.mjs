// Cocktail party: a visible loading message from the start, Play off until ready, a Try again when a sound fails.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 1. slow network: the message and the disabled button are there before anything has loaded
{ const P=await newPage(await browser.createBrowserContext(),BASE,{onRequest:r=>{ if(/\/audio\//.test(r.url())){ setTimeout(()=>r.continue(),1500); return true; } return false; }}); const page=P.page;
  await page.goto(`${BASE}/cocktail-party-problem/`,{waitUntil:'domcontentloaded'}); await sleep(300);
  ok(await page.$eval('#load-status',e=>!e.hidden&&/Loading sounds/.test(e.textContent)),'"Loading sounds…" is on screen while loading');
  ok(await page.$eval('#btn-play',b=>b.disabled),'Play is off while loading');
  ok(await page.$$eval('#choice-buttons .choice-btn',b=>b.every(x=>x.getAttribute('aria-label'))),'empty answer buttons have a name');
  await page.waitForFunction(()=>document.getElementById('load-status').hidden,{timeout:60000}).catch(()=>{});
  ok(await page.$eval('#load-status',e=>e.hidden)&&await page.$eval('#btn-play',b=>!b.disabled),'when loaded the message goes and Play turns on'); }
// 2. a failing sound: an honest message and a way to try again
let fails=true;
{ const P=await newPage(await browser.createBrowserContext(),BASE,{onRequest:r=>{ if(fails&&/\/audio\/maskers\/traffic/.test(r.url())){ r.respond({status:500,body:'no'}); return true; } return false; }}); const page=P.page;
  await page.goto(`${BASE}/cocktail-party-problem/`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.getElementById('load-retry').hidden,{timeout:60000});
  ok(/could not be loaded/.test(await page.$eval('#load-text',e=>e.textContent)),'a failed sound is reported');
  ok(await page.$eval('#btn-play',b=>b.disabled),'Play stays off');
  fails=false; await page.click('#load-retry');
  await page.waitForFunction(()=>document.getElementById('load-status').hidden,{timeout:60000});
  ok(await page.$eval('#btn-play',b=>!b.disabled),'Try again works and Play turns on'); }
await browser.close(); server.close(); process.exit(fail?1:0);
