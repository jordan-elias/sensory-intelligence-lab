// Therapist notes: encrypted with the therapist's own vault, added, edited and deleted from the Notes tab.
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

const r=await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady();
  const {makeNotesStore,mountNotes}=await import('/assets/js/therapist/notes.js');
  const store=makeNotesStore(window._supabase,s); const out={};
  await store.add('c1','First session: settled quickly.');
  const row=window.__tbl.therapist_notes[0]; out.stored=JSON.stringify(row); out.cols=Object.keys(row).sort().join();
  out.list=(await store.list('c1')).map(n=>n.text);
  try{ await store.add('c1','   '); out.empty='accepted'; }catch(e){ out.empty=e.message; }
  try{ await store.add('c1','x'.repeat(20001)); out.long='accepted'; }catch(e){ out.long=e.message; }
  window.__box=document.body.appendChild(document.createElement('div'));
  await mountNotes(window.__box,{store,clientId:'c1',clientName:'Alex'});
  return out; });
ok(!r.stored.includes('settled quickly')&&!r.stored.includes('First session'),'the saved row holds no readable text');
ok(JSON.stringify(r.list)==='["First session: settled quickly."]','the therapist can open their own note');
ok(/empty|something/i.test(r.empty)&&/long/i.test(r.long),'empty and oversized notes are refused');
const txt=()=>page.evaluate(()=>window.__box.innerText);
ok(/Private to you/.test(await txt())&&/First session/.test(await txt())&&/deletes their account/.test(await txt()),'tab explains who can read notes and shows the note');
await page.evaluate(()=>{ const b=window.__box; b.querySelector('#noteNew').value='Second: homework went well.'; b.querySelector('#noteAdd').click(); }); await sleep(600);
ok(/Second: homework/.test(await txt())&&await page.evaluate(()=>window.__box.querySelectorAll('li[data-id]').length)===2,'adding a note shows it');
await page.evaluate(()=>{ const li=[...window.__box.querySelectorAll('li[data-id]')].find(l=>/Second/.test(l.innerText)); li.querySelector('[data-edit]').click(); li.querySelector('[data-editbox]').value='Second: homework went very well.'; li.querySelector('[data-edit]').click(); }); await sleep(600);
ok(/very well/.test(await txt())&&!/homework went well/.test(await txt()),'editing replaces the text');
await page.evaluate(()=>{ const li=[...window.__box.querySelectorAll('li[data-id]')].find(l=>/very well/.test(l.innerText)); li.querySelector('[data-del]').click(); li.querySelector('[data-yes]').click(); }); await sleep(600);
ok(!/very well/.test(await txt())&&/First session/.test(await txt()),'deleting removes only that note');
const raw=await page.evaluate(()=>JSON.stringify(window.__tbl.therapist_notes));
ok(!/First session|homework/.test(raw),'nothing readable was ever stored');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
