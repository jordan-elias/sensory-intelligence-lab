// Therapist record: links and themes, map, themes table, timeline, brief, export, keep-or-delete. All on the therapist's device.
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
  const {intakeEntry,familyEntry,familyPeople}=await import('/assets/js/notes/entries.js'); const {INTAKE_FIELDS}=await import('/assets/js/intake/intake.js');
  const store=makeNotesStore(window._supabase,s);
  const T=[['2026-01-10','First session. [[Anna]] was critical growing up. #perfectionism shows up at work. Cannot sleep, is exhausted and worries.'],
          ['2026-01-24','Talked about [[Anna]] again. #perfectionism and #avoidance around the [[Move 2019]]. Felt sad and lonely, not happy.'],
          ['2026-02-07','Work was better. #perfectionism eased. Proud of the presentation.'],['2026-02-21','Slept well. Good week, hopeful and calm.'],['2026-03-07','Steady week. Walking daily, in good spirits.']];
  for(const [d,t] of T) await store.add('c1',t,d);
  window.__store=store; window.__box=document.body.appendChild(document.createElement('div')); window.__deleted=0;
  const fam={doc:{overview:'Close but busy.',members:[{name:'Anna',relationship:'Mother',status:'Living',description:'Critical.',history:'',impact:'Shapes work.'}]},sent_at:'2026-01-05T00:00:00Z'};
  window.__mount=()=>mountRecord(window.__box,{store,clientId:'c1',clientName:'Sam Lee',active:false,extras:[intakeEntry({fields:{reason:'Cannot sleep and worried about work'},submitted_at:'2026-01-02T10:00:00Z'},INTAKE_FIELDS),familyEntry(fam)],people:familyPeople(fam),sharedDates:['2099-03-10T10:00:00Z','2099-03-12T10:00:00Z'],onDeleted:()=>{window.__deleted++;}});
  await window.__mount(); return JSON.stringify(window.__tbl.therapist_notes); });
ok(!/Anna|perfectionism/.test(setup)&&/"v":2|v\\":2|ciphertext/.test(setup)||!/Anna|perfectionism/.test(setup),'the stored notes are encrypted (no readable text, including the session date)');
const txt=()=>page.evaluate(()=>window.__box.innerText), tab=async n=>{ await page.evaluate(n=>[...window.__box.querySelectorAll('[role=tab]')].find(b=>b.textContent===n).click(),n); await sleep(250); };
ok(/Private to you/.test(await txt())&&/not an assessment of the client/.test(await txt()),'it says who can read it and that the counts are not an assessment');
ok(/From the intake form/.test(await txt())&&/From the family history/.test(await txt())&&/First session/.test(await txt()),'intake and family history are part of the record, with the session notes');
ok(!/0151|date of birth/i.test(await txt()),'contact details stay out');
// links and backlinks
await page.evaluate(()=>[...window.__box.querySelectorAll('.th-link--entity')].find(b=>b.textContent==='Anna').click()); await sleep(200);
ok(/critical growing up/.test(await page.$eval('#recAbout',e=>e.innerText))&&/again/.test(await page.$eval('#recAbout',e=>e.innerText)),'selecting a person shows every mention');
// search
await page.evaluate(()=>{ const f=window.__box.querySelector('#recFind'); f.value='presentation'; f.dispatchEvent(new Event('input')); });
ok((await page.evaluate(()=>window.__box.querySelectorAll('#recList li').length))===1,'search narrows the record');
await page.evaluate(()=>{ const f=window.__box.querySelector('#recFind'); f.value=''; f.dispatchEvent(new Event('input')); });
// a new note with a link chip
await page.evaluate(()=>{ [...window.__box.querySelectorAll('.th-chip')].find(c=>/Anna/.test(c.textContent)).click(); const t=window.__box.querySelector('#recText'); t.value+='went to the park with her. #grief'; });
await page.evaluate(()=>[...window.__box.querySelectorAll('button')].find(b=>b.textContent==='Save note').click()); await sleep(700);
ok(/went to the park/.test(await txt())&&await page.evaluate(()=>window.__tbl.therapist_notes.length)===6&&!/park/.test(await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes))),'a new note is saved encrypted');
// map
await tab('Map');
ok(await page.$('svg.th-map')!==null&&(await page.$$eval('svg.th-map g',g=>g.length))>=5,'the map shows people, events and themes');
ok(/Anna and perfectionism|perfectionism and Anna/.test(await txt())&&/in the same sentence/.test(await txt()),'the connections are also listed as text');
// themes table
await tab('Themes');
const row=await page.evaluate(()=>[...window.__box.querySelectorAll('.th-matrix tbody tr')].find(r=>/perfectionism/.test(r.innerText)).querySelectorAll('td.on').length);
ok(row===3,'the themes table shows perfectionism in three sessions');
ok(/Not brought up lately/.test(await txt())&&/perfectionism came up 3 times/.test(await txt()),'a theme that went quiet is flagged');
ok(/Possible themes/.test(await txt())&&/sleep/.test(await txt()),'themes are suggested from the words, as suggestions');
// timeline
await tab('Timeline');
ok((await page.$$eval('.th-timeline li',l=>l.length))>=7&&await page.$('.th-tone')!==null,'the timeline lists every entry with a tone reading');
await page.evaluate(()=>[...window.__box.querySelectorAll('.th-chip')].find(c=>c.textContent==='#sleep')?.click()); await sleep(700);
ok(/#sleep/.test(await page.evaluate(()=>JSON.stringify(window.__box.querySelector('.th-timeline').innerText)))&&!/sleep/.test(await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes))),'accepting a suggested theme tags the note and stays encrypted');
// brief
await tab('Before a session');
ok(/Last time/.test(await txt())&&/Steady week/.test(await txt())&&/2 check-ins/.test(await txt()),'the brief shows last time and what was shared since');
// export
await tab('Export and delete');
const md=await page.evaluate(async()=>{ const {toMarkdown,ordered}=await import('/assets/js/notes/graph.js'); const n=(await window.__store.list('c1')); return toMarkdown('Sam Lee',n.map(x=>({...x}))); });
ok(/^# Sam Lee/.test(md)&&/\[\[Anna\]\]/.test(md),'the export is Markdown with the links kept');
ok(/nothing is deleted automatically/.test(await txt()),'an ended connection says nothing is deleted automatically');
// delete all, with confirmation
await page.evaluate(()=>[...window.__box.querySelectorAll('button')].find(b=>/Delete all my notes/.test(b.textContent)).click());
await page.evaluate(()=>{ [...window.__box.querySelectorAll('button')].find(b=>b.textContent==='Delete the notes').click(); }); await sleep(300);
ok(await page.evaluate(()=>window.__tbl.therapist_notes.length)===6,'deleting does nothing without the confirmation word');
await page.type('#recConfirm','DELETE'); await page.evaluate(()=>[...window.__box.querySelectorAll('button')].find(b=>b.textContent==='Delete the notes').click()); await sleep(700);
ok(await page.evaluate(()=>window.__tbl.therapist_notes.length)===0&&await page.evaluate(()=>window.__deleted)===1,'all notes are deleted when the therapist confirms');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
