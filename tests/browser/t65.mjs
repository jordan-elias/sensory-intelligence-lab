import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const keys=[{link_id:'L1',therapist_id:'t1',public_enc:{kty:'EC'},public_sign:null,fingerprint:'FFFF'}];
const th=[{link_id:'L1',status:'active',user_id:'t1',display_name:'Jordan'}];
// every worksheet offers "Share with <therapist>" once saved, and the new ones fill in and save
for (const s of ['goals-values','music-autobiography','session-reflection','lyric-analysis','coping','interpersonal','dear-man','grow','fast']) {
  const db=[]; const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{db,tables:{my_therapist_keys:keys,my_therapists:th,shared_copies:[]}});
  await page.goto(`${BASE}/worksheets/${s}/`,{waitUntil:'networkidle0'}); await sleep(500);
  const hiddenBefore=await page.$eval('#wsShare',e=>e.hidden);
  const f=await page.$('textarea[data-field], input[type=text][data-field]');
  await f.type('Something real'); await sleep(2400);
  const label=await page.$eval('#wsShare',e=>e.hidden?'hidden':e.textContent);
  ok(hiddenBefore && /Share with Jordan/.test(label), `${s}: share button hidden until saved, then "${label.trim()}"`);
  ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0, `${s}: no page errors ${errors.join('|')}`);
  await page.close();
}
// new worksheets: scale inputs are collected and restored
{
  const {page}=await newPage(await browser.createBrowserContext(),BASE,{db:[],tables:{}});
  await page.goto(`${BASE}/worksheets/grow/`,{waitUntil:'networkidle0'}); await sleep(400);
  await page.type('[data-field="opt1_name"]','Ask for a trial'); ok(await page.$('input[type=range].ws-slider')!==null&&await page.$('input[type=number][data-field]')===null,'ratings are small sliders, not number boxes');
  ok(await page.$eval('#sc-opt1-fit-r',r=>r.classList.contains('is-unset'))&&await page.$eval('#sc-opt1-fit',h=>h.value===''),'a slider starts unset, so an untouched rating is not saved as 5');
  await page.$eval('#sc-opt1-fit-r',r=>{ r.value=8; r.dispatchEvent(new Event('input',{bubbles:true})); });
  ok(await page.$eval('.ws-slider-val',o=>true)&&await page.$$eval('#sc-opt1-fit-r ~ .ws-slider-val',o=>o[0].textContent)==='8','the chosen number is shown beside the slider');
  const cols=await page.$$eval('.ws-compare--3 .ws-compare__col',c=>c.length);
  ok(cols===3,'GROW compares three options side by side');
  const got=await page.evaluate(async()=>{const m=await import('/assets/js/worksheets/ui.js');return m.collectFields(document.body);});
  ok(got.opt1_name==='Ask for a trial'&&got.opt1_fit==='8'&&got.opt2_fit==='','slider value is collected, untouched ones stay empty');
  await page.evaluate(async()=>{const m=await import('/assets/js/worksheets/ui.js'); m.restoreFields(document.body,{opt2_fit:'3',opt1_fit:''});});
  ok(await page.$eval('#sc-opt2-fit-r',r=>r.value==='3'&&!r.classList.contains('is-unset'))&&await page.$eval('#sc-opt1-fit-r',r=>r.classList.contains('is-unset')),'restoring a saved worksheet moves the sliders');
  await page.evaluate(()=>{ document.querySelector('[data-clear=sc-opt2-fit]').click(); });
  ok(await page.$eval('#sc-opt2-fit',h=>h.value===''),'Clear unsets a rating');
}
await browser.close(); server.close(); process.exit(fail?1:0);
