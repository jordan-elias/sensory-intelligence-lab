// Sequencer: swing, mute and solo, and Euclidean rhythms.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{});
await page.goto(`${BASE}/sequencer/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#padGrid .pad',{timeout:20000}); await sleep(600);
ok(await page.evaluate(()=>!!window.SEQGROOVE&&typeof window.SEQGROOVE.euclid==='function'),'the rhythm rules loaded');
const on=()=>page.$$eval('#padGrid .pad.on',p=>p.length);
await page.click('#track-item-0'); await page.$eval('#euclid-hits',e=>{e.value='4';}); await page.$eval('#euclid-rot',e=>{e.value='0';});
await page.evaluate(()=>SEQ.euclid()); await sleep(100);
ok(await on()===4&&await page.$$eval('#padGrid .pad',p=>p.map((x,i)=>x.classList.contains('on')?i:-1).filter(i=>i>=0).join())==='0,4,8,12','four hits on the kick fall on the four beats');
await page.$eval('#euclid-hits',e=>{e.value='3';}); await page.$eval('#euclid-rot',e=>{e.value='1';}); await page.evaluate(()=>SEQ.euclid()); await sleep(100);
ok(await page.$$eval('#padGrid .pad',p=>p.map((x,i)=>x.classList.contains('on')?i:-1).filter(i=>i>=0).length)===3,'three hits, rotated');
await page.click('#track-item-4'); await page.evaluate(()=>SEQ.euclid()); await sleep(100);
ok(await on()===3,'a melody track gets the rhythm too, on the root note');
// mute / solo
const pressed=sel=>page.$eval(sel,e=>e.getAttribute('aria-pressed'));
await page.click('#track-item-1 [data-ms=m]'); await sleep(100);
ok(await pressed('#track-item-1 [data-ms=m]')==='true','mute turns on');
await page.click('#track-item-2 [data-ms=s]'); await sleep(100);
ok(await pressed('#track-item-2 [data-ms=s]')==='true','solo turns on');
ok(await page.$eval('#track-item-4',e=>e.classList.contains('active')),'pressing M or S does not change which track is being edited');
// swing
await page.$eval('#swing-slider',e=>{e.value='60'; e.dispatchEvent(new Event('input'));});
ok(await page.$eval('#swing-val',e=>e.textContent)==='60%','swing shows its value');
// export still works with mute/solo and swing
const wav=await page.evaluate(async()=>{ let blobSize=0; const orig=URL.createObjectURL; URL.createObjectURL=b=>{ blobSize=b.size; return orig.call(URL,b); }; await SEQ.exportWav(); await new Promise(r=>setTimeout(r,2500)); return blobSize; });
ok(wav>1000,'WAV export still renders with mute, solo and swing on ('+wav+' bytes)');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
