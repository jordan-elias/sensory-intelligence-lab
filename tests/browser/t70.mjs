// Journal: share ONE entry with a connected therapist. Nothing is shared unless the button is pressed on that entry.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const t=new Date().toISOString();
const entries=[{id:'j1',user_id:'u1',title:'A hard week',created_at:t,content:'Plain words that are mine',word_count:5,music:'amber',duration_min:3,prompt:'p'},
               {id:'j2',user_id:'u1',title:'Another',created_at:t,content:'Second entry',word_count:2}];
async function run(tables,answer){
  const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{db:[],tables:{journal_entries:entries,...tables}});
  await page.evaluateOnNewDocument(a=>{window.confirm=()=>{window.__asked=true;return a;};},answer);
  await page.goto(`${BASE}/journal/`,{waitUntil:'domcontentloaded'}); await sleep(1500);
  await page.evaluate(()=>window.viewEntry('j1')); await sleep(1200);
  return {page,errors};
}
const keys=[{link_id:'L1',therapist_id:'t1',public_enc:{kty:'EC'},public_sign:null,fingerprint:'FFFF'}];
const th=[{link_id:'L1',status:'active',user_id:'t1',display_name:'Jordan'}];
let r=await run({my_therapist_keys:keys,my_therapists:th,shared_copies:[]},false);
ok(await r.page.$eval('#shareEntryBtn',b=>!b.hidden&&/Share with Jordan/.test(b.textContent)),'a saved entry offers "Share with Jordan"');
ok((await r.page.evaluate(()=>window.__tbl.shared_copies.length))===0,'nothing is shared by default');
await r.page.click('#shareEntryBtn'); await sleep(500);
ok(await r.page.evaluate(()=>window.__asked===true),'sharing asks first, and says it is only this entry');
ok((await r.page.evaluate(()=>window.__tbl.shared_copies.length))===0,'declining shares nothing');
r=await run({my_therapist_keys:keys,my_therapists:th,shared_copies:[]},true);
await r.page.click('#shareEntryBtn'); await sleep(900);
ok((await r.page.evaluate(()=>window.__tbl.shared_copies.length))===0&&/Sharing failed/.test(await r.page.$eval('#shareEntryMsg',e=>e.textContent)),'if sealing fails, nothing is stored and the client is told');
r=await run({my_therapist_keys:[],my_therapists:[],shared_copies:[]},false);
ok(await r.page.$eval('#shareEntryBtn',b=>b.hidden),'not connected: no share button');
r=await run({my_therapist_keys:keys,my_therapists:th,shared_copies:[{link_id:'L1',category:'journal',source_id:'j1',sealed:{}}]},false);
ok(await r.page.$eval('#shareEntryBtn',b=>/Take back/.test(b.textContent)),'an entry already shared says so and offers to take it back');
await r.page.evaluate(()=>window.viewEntry('j2')); await sleep(900);
ok(await r.page.$eval('#shareEntryBtn',b=>/Share with Jordan/.test(b.textContent)),'another entry is still not shared: one at a time');
ok(r.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+r.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
