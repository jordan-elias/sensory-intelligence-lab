// Retention reminder: kept records past the period are flagged, never deleted; the period is the therapist's setting; snooze works.
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
  await st.add('old1','Session one. #grief','2014-02-01'); await st.keep('old1','profile',{name:'Old Client'});
  await st.add('new1','Session one. #work','2026-01-01'); await st.keep('new1','profile',{name:'Recent Client'});
  for(const r of window.__tbl.therapist_notes){ const old=r.client_id==='old1'; r.created_at=old?'2014-02-01T10:00:00Z':'2026-01-01T10:00:00Z'; r.updated_at=r.created_at; } });
const mount=async(q)=>page.evaluate(async(q)=>{ const {mountArchivePage}=await import('/assets/js/therapist/archive-page.js'); const d=document.createElement('div'); document.body.appendChild(d); window.__root=d; history.replaceState(null,'','/therapist/archive/'+q); await mountArchivePage(d); return d.innerText; },q);
const t=()=>page.evaluate(()=>window.__root.innerText);
let list=await mount('');
ok(/Old Client[\s\S]*Retention period over/.test(list),'a record past ten years is flagged');
ok(!/Recent Client[^\n]*\n[^\n]*\n?[^\n]*Retention period over/.test(list.replace(/Old Client[\s\S]*?Recent Client/,'Recent Client')),'a recent record is not flagged');
ok(/Germany/.test(list)&&/nothing is ever deleted automatically/.test(list),'the note says it is a reminder for Germany and deletes nothing');
const before=await page.evaluate(()=>window.__tbl.therapist_notes.length);
await mount('?client=old1'); await sleep(500);
ok(/Retention period over/.test(await t())&&/Nothing is deleted for you/.test(await t()),'the person page explains that nothing is deleted for them');
ok(await page.evaluate(()=>window.__tbl.therapist_notes.length)===before,'nothing was deleted by showing the reminder');
// snooze
await page.evaluate(()=>{ const u=window._currentUser.id; const {} = {}; });
await page.evaluate(async()=>{ const r=await import('/assets/js/therapist/retention.js'); r.snoozeFor(window._currentUser.id,'old1'); });
await mount('?client=old1'); await sleep(500);
ok(/You asked to be reminded again/.test(await t()),'snoozing moves the reminder a year on');
list=await mount('');
ok(!/Old Client[^\n]*[\s\S]{0,80}Retention period over/.test(list),'a snoozed record is no longer flagged in the list');
// setting
await page.evaluate(()=>{ const i=window.__root.querySelector('#retYears'); i.value='30'; i.dispatchEvent(new Event('change')); });
ok(await page.evaluate(async()=>(await import('/assets/js/therapist/retention.js')).settings(window._currentUser.id).years)===30,'the number of years is saved on this device');
await page.evaluate(async()=>{ const r=await import('/assets/js/therapist/retention.js'); localStorage.removeItem('sil.th.retention.'+window._currentUser.id); r.setYears(window._currentUser.id,0); });
list=await mount('');
ok(!/Retention period over/.test(list),'zero years turns the reminder off');
// dashboard: an ended client and the kept-records card
await page.evaluate(async()=>{ const r=await import('/assets/js/therapist/retention.js'); r.setYears(window._currentUser.id,10);
  window.__tbl.my_clients=[{link_id:'L1',client_id:'ended1',status:'ended',full_name:'Ended Person',email:'e@x.de',started_at:'2012-01-01',ended_at:'2013-05-01',subscription_tier:'session',intake_status:'done'}];
  window.__tbl.my_client_sessions=[{link_id:'L1',scheduled_at:'2013-04-20T10:00:00Z',status:'completed',event_type:'session'}];
  window.__tbl.shared_copies=window.__tbl.shared_copies||[]; window.__tbl.messages=window.__tbl.messages||[]; });
const dash=await page.evaluate(async()=>{ const {mountDashboard}=await import('/assets/js/therapist/dashboard-page.js'); const d=document.createElement('div'); document.body.appendChild(d); await mountDashboard(d); return d.innerText; });
ok(/Ended Person[\s\S]*Retention period over/.test(dash),'an ended client past the period is flagged on the dashboard');
ok(/1 record past the retention period/.test(dash),'the kept-records card counts records past the period');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
