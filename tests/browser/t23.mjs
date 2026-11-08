import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(tables,confirmAnswer){
  const db=[]; const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{db,tables});
  await page.evaluateOnNewDocument(a=>{window.confirm=()=>{window.__asked=true;return a;};},confirmAnswer);
  await page.goto(`${BASE}/worksheets/goals-values/`,{waitUntil:'networkidle0'}); await sleep(500);
  const before=await page.$eval('#wsShare',e=>e.hidden);
  await page.type('[data-field="overall_matters"]','Connection'); await sleep(2400);
  return {page,errors,before};
}
const keys=[{link_id:'L1',therapist_id:'t1',public_enc:{kty:'EC'},public_sign:null,fingerprint:'FFFF'}];
const th=[{link_id:'L1',status:'active',user_id:'t1',display_name:'Jordan'}];
// 1. connected, therapist has keys: button appears only once saved, label names the therapist
let r=await run({my_therapist_keys:keys,my_therapists:th,shared_copies:[]},false);
ok(r.before===true,'no share button before the worksheet is saved');
ok(await r.page.$eval('#wsShare',e=>!e.hidden&&/Share with Jordan/.test(e.textContent)),'after saving, offers "Share with Jordan"');
ok(/Shared with/.test(await r.page.$eval('#savedList',e=>e.innerText))===false,'nothing is marked shared by default');
await r.page.click('#wsShare'); await sleep(500);
ok(await r.page.evaluate(()=>window.__asked===true),'sharing asks for confirmation first');
ok((await r.page.evaluate(()=>window.__tbl.shared_copies.length))===0,'declining shares nothing');
// 2. confirm but encryption cannot complete: fails closed, nothing stored
r=await run({my_therapist_keys:keys,my_therapists:th,shared_copies:[]},true);
await r.page.click('#wsShare'); await sleep(900);
ok((await r.page.evaluate(()=>window.__tbl.shared_copies.length))===0,'if sealing fails, nothing is stored');
ok(/Sharing failed/.test(await r.page.$eval('#wsMsg',e=>e.textContent)),'and the client is told');
// 3. no therapist: no button at all
r=await run({my_therapist_keys:[],my_therapists:[],shared_copies:[]},false);
ok(await r.page.$eval('#wsShare',e=>e.hidden),'not connected: no share button');
ok(r.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+r.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
