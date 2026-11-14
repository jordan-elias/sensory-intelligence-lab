// Caseload overview: sessions without notes, quiet clients, themes across clients; people never matched across clients; nothing in plaintext.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_notes:[],therapist_profiles:[{user_id:'u1',display_name:'T'}],my_clients:[]}});
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000}); await sleep(1200);
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});



await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady(); const {makeNotesStore}=await import('/assets/js/therapist/notes.js');
  const st=makeNotesStore(window._supabase,s);
  await st.add('ca','Talked about #grief and [[Anna]].','2026-01-05'); await st.add('ca','#grief again. #work too.','2026-01-12');
  await st.add('cb','#grief. [[Anna]] is her sister.','2026-02-01');
  window.__tbl.my_clients=[{link_id:'LA',client_id:'ca',status:'active',full_name:'Client A'},{link_id:'LB',client_id:'cb',status:'active',full_name:'Client B'},{link_id:'LC',client_id:'cc',status:'active',full_name:'Client C'}];
  window.__tbl.my_client_sessions=[{link_id:'LA',scheduled_at:'2026-01-05T10:00:00Z',status:'completed'},{link_id:'LA',scheduled_at:'2026-01-19T10:00:00Z',status:'completed'},{link_id:'LB',scheduled_at:'2026-02-01T10:00:00Z',status:'completed'}];
});
const out=await page.evaluate(async()=>{ const {mountCaseloadPage}=await import('/assets/js/therapist/caseload-page.js'); const d=document.createElement('div'); document.body.appendChild(d); await mountCaseloadPage(d); return d.innerText; });
ok(/3 clients, 3 notes/.test(out),'it counts clients and notes');
const gapSec=(out.split('Sessions with no note yet')[1]||'').split('Not written up')[0];
ok(/Client A[^\n]*Jan 19/.test(gapSec)&&!/Client B/.test(gapSec)&&!/Jan 5,/.test(gapSec),'it lists the session on 19 January that has no note, and not the written-up ones');
ok(/Client C[\s\S]*no notes yet/.test(out),'a client with no notes is listed as not written up');
ok(/grief/i.test(out)&&/2 clients/.test(out),'grief is shown as a theme in two clients');
ok(!/Anna/.test(out),'names of people are not compared or shown across clients');
const raw=await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes));
ok(!/grief|Anna/.test(raw),'notes stay encrypted in storage');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
