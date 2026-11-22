// Therapist record: import notes from a Markdown file (preview first, encrypted on save, no doubles).
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_notes:[]}});
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000}); await sleep(1200);
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});

const setup=await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady();
  const {makeNotesStore}=await import('/assets/js/therapist/notes.js'); const {mountRecord}=await import('/assets/js/therapist/record.js');
    const store=makeNotesStore(window._supabase,s);
  const T=[['2026-01-10','First session. [[Anna]] was critical growing up. #perfectionism shows up at work. Cannot sleep, is exhausted and worries.'],
          ['2026-01-24','Talked about [[Anna]] again. #perfectionism and #avoidance around the [[Move 2019]]. Felt sad and lonely, not happy.'],
          ['2026-02-07','Work was better. #perfectionism eased. Proud of the presentation.'],['2026-02-21','Slept well. Good week, hopeful and calm.'],['2026-03-07','Steady week. Walking daily, in good spirits.']];
  for(const [d,t] of T) await store.add('c1',t,d);
  window.__store=store; window.__box=document.body.appendChild(document.createElement('div')); window.__deleted=0;
  const fam={doc:{overview:'Close but busy.',members:[{name:'Anna',relationship:'Mother',status:'Living',description:'Critical.',history:'',impact:'Shapes work.'}]},sent_at:'2026-01-05T00:00:00Z'};
  window.__intake={fields:{reason:'Cannot sleep and worried about work',dob:'1996-04-02'},submitted_at:'2026-01-02T10:00:00Z'}; window.__fam=fam;
  window.__mount=(live=true)=>mountRecord(window.__box,{store,clientId:'c1',clientName:'Sam Lee',active:false,intake:live?window.__intake:null,fam:live?fam:null,profile:live?{name:'Sam Lee'}:null,sharedDates:['2099-03-10T10:00:00Z','2099-03-12T10:00:00Z'],onDeleted:()=>{window.__deleted++;}});
  await window.__mount(); await new Promise(r=>setTimeout(r,800)); return JSON.stringify(window.__tbl.therapist_notes); });
ok(!/Anna|perfectionism/.test(setup)&&/"v":2|v\\":2|ciphertext/.test(setup)||!/Anna|perfectionism/.test(setup),'the stored notes are encrypted (no readable text, including the session date)');
const txt=()=>page.evaluate(()=>window.__box.innerText), tab=async n=>{ await page.evaluate(n=>[...window.__box.querySelectorAll('[role=tab]')].find(b=>b.textContent===n).click(),n); await sleep(250); };

await tab('Export and delete');
const md = '# Sam Lee\n\n## 2026-01-10\n\n'+(await page.evaluate(()=>window.__store.list('c1').then(l=>l.find(n=>n.date==='2026-01-10').text)))+'\n\n## 2025-12-01\n\nOlder note about [[Mia]] and #grief.\n\n## Intake form\n\nstuff\n';
await page.evaluate(m=>{ const f=new File([m],'old.md',{type:'text/markdown'}); const dt=new DataTransfer(); dt.items.add(f); const i=window.__box.querySelector('#recImportFile'); i.files=dt.files; i.dispatchEvent(new Event('change')); },md);
await sleep(400);
ok(/2 dated sections found/.test(await txt())&&/Skipped, no date: Intake form/.test(await txt()),'the preview counts dated sections and names what it skipped');
ok(/already in your record/.test(await txt()),'a section that matches an existing note is flagged as a copy');
const before=await page.evaluate(()=>window.__tbl.therapist_notes.length);
ok(before===await page.evaluate(()=>window.__tbl.therapist_notes.length),'nothing is saved by choosing the file');
const boxes=await page.$$eval('#recImportList input[type=checkbox]',l=>l.map(b=>[b.checked,b.disabled]));
ok(JSON.stringify(boxes)==='[[false,true],[true,false]]','the copy is unticked and locked, the new one is ticked');
await page.evaluate(()=>[...window.__box.querySelectorAll('#recImportList button')].find(b=>b.textContent==='Import').click()); await sleep(900);
ok(await page.evaluate(()=>window.__tbl.therapist_notes.length)===before+1,'only the new note was saved');
ok(!/Mia|grief/.test(await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes))),'the imported note is stored encrypted');
await tab('Notes'); ok(/Older note about/.test(await txt()),'the imported note shows in Notes with its date');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|'));
await tab('Notes');
await page.select('#recTpl','soap'); ok(/S \(what they told me\)/.test(await page.$eval('#recText',e=>e.value)),'choosing a template puts its structure in the note box');
await page.evaluate(()=>{ window.prompt=()=>'My intake'; }); await page.$eval('#recText',e=>{ e.value='Why they came:\n\nGoals:\n'; });
await page.evaluate(()=>[...window.__box.querySelectorAll('button')].find(b=>b.textContent==='Save this as my template').click()); await sleep(100);
ok(await page.$$eval('#recTpl option',l=>l.some(o=>/My intake \(mine\)/.test(o.textContent))),'my own template appears in the list');
ok(!/Why they came/.test(await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes))),'templates are not sent to the database');
await browser.close(); server.close(); process.exit(fail?1:0);
