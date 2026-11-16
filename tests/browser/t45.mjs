// Kept records: a client who deleted their account is gone, but the therapist's own copies of the notes, intake form and family history remain and open.
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

const seeded=await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady(); const {makeNotesStore}=await import('/assets/js/therapist/notes.js');
  const st=makeNotesStore(window._supabase,s);
  await st.add('gone1','Session one. Her parents divorced in 2005 when she was 9. [[Mother]] moved away. #grief','2026-01-10');
  await st.keep('gone1','profile',{name:'Robin Hale'}); await st.keep('gone1','intake',{fields:{reason:'Low mood after a move',dob:'1990-03-01',contact:'0151 555 0100'},submitted_at:'2026-01-02T10:00:00Z'});
  await st.keep('gone1','family',{doc:{overview:'Small family.',members:[{name:'Mother',relationship:'Mother',status:'Living',description:'Moved away.',history:'',impact:''}]},sent_at:'2026-01-05T00:00:00Z'});
  const again=await st.keep('gone1','intake',{fields:{reason:'Low mood after a move',dob:'1990-03-01',contact:'0151 555 0100'},submitted_at:'2026-01-02T10:00:00Z'});
  return {rows:window.__tbl.therapist_notes.length, again, raw:JSON.stringify(window.__tbl.therapist_notes)}; });
ok(seeded.rows===4&&seeded.again===false,'keeping the same copy twice does not duplicate it');
ok(!/Robin|Low mood|0151|divorced/.test(seeded.raw),'everything kept is encrypted');
// the list of kept records
const list=await page.evaluate(async()=>{ const {mountArchivePage}=await import('/assets/js/therapist/archive-page.js'); const d=document.body.appendChild(document.createElement('div')); window.__root=d; history.replaceState(null,'','/therapist/archive/'); await mountArchivePage(d); return d.innerText; });
ok(/Kept records/.test(list)&&/Robin Hale/.test(list),'the list shows the person by the name the therapist saved');
// open one
await page.evaluate(async()=>{ const {mountArchivePage}=await import('/assets/js/therapist/archive-page.js'); history.replaceState(null,'','/therapist/archive/?client=gone1'); window.__root.innerHTML=''; await mountArchivePage(window.__root); });
await sleep(600); const t=()=>page.evaluate(()=>window.__root.innerText);
ok(/Robin Hale/.test(await t())&&/No longer connected to you/.test(await t())&&/Session one/.test(await t()),'opening a kept record shows the notes');
ok(/From the intake form/.test(await t())&&/Low mood after a move/.test(await t())&&!/0151/.test(await t()),'the kept intake form is there, without contact details in the analysis view');
await page.evaluate(()=>[...window.__root.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Life story').click()); await sleep(250);
ok(/2005/.test(await t())&&/age 9/i.test(await t())&&/1990/.test(await t()),'the life story works from kept copies alone');
await page.evaluate(()=>[...window.__root.querySelectorAll('[role=tab]')].find(b=>b.textContent==='Export and delete').click()); await sleep(250);
ok(/nothing is deleted automatically/.test(await t()),'it says the records stay until the therapist deletes them');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
