// Download my data: everything is opened in the browser and gathered into one file.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const ctx=await browser.createBrowserContext();
const {page,errors}=await newPage(ctx,BASE,{tables:{
    game_best_scores:[{user_id:'u1',game:'spatial',best:42}], bookings:[{user_id:'u1',id:'b1',start_time:'2026-12-01T10:00:00Z'}], mixer_sessions:[], my_therapists:[]}});
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000}); await sleep(1200);
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});
const r=await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady();
  window.__tbl.journal_entries=[{id:'j1',user_id:'u1',created_at:'2026-02-01T00:00:00Z',title:await s.encrypt('Morning'),content:await s.encrypt('I walked by the river.'),word_count:5,prompt:null,music:null,duration_min:3}];
  window.__db.push({id:'w1',user_id:'u1',type:'coping',title:'Coping',created_at:'2026-03-01T00:00:00Z',content:await s.encrypt(JSON.stringify({type:'coping',schema:1,data:{skill:'breathing'}}))});
  const store=await import('/assets/js/checkins/store.js');
  await store.save({arousal:3,valence:4,sensory_load:2,emotion_words:['calm'],notes:'quiet day',env:null});
  await store.savePlace({name:'Park',kind:'outdoor',notes:'bench'});
  const m=await import('/assets/js/export/export-data.js');
  const out=await m.buildExport({sb:window._supabase,uid:'u1',now:new Date('2026-11-08T12:00:00Z')});
  return {out,name:m.exportFileName(new Date('2026-11-08T12:00:00Z'))}; });
const o=r.out;
ok(r.name==='sil-my-data-2026-11-08.json','file name carries the date');
ok(o.account&&o.account.full_name==='Test'&&!('stripe_customer_id' in o.account)&&!('encryption_key_enc' in o.account),'account details included, billing identifiers and key material left out');
ok(o.journal.length===1&&o.journal[0].text==='I walked by the river.'&&o.journal[0].title==='Morning','journal opened and included');
ok(o.checkins.length===1&&o.checkins[0].notes==='quiet day'&&o.checkins[0].emotion_words[0]==='calm','check-ins opened and included');
ok(o.saved_places.length===1&&o.saved_places[0].name==='Park','saved places included');
ok(o.worksheets.length===1&&o.worksheets[0].content.data.skill==='breathing','worksheets opened and included');
ok(o.game_scores.length===1&&o.bookings.length===1,'scores and bookings included');
ok(Array.isArray(o.messages)&&o.messages.length===0&&Array.isArray(o.recordings),'messages and recordings sections present');
ok(o.notes.length===0,'nothing reported missing '+o.notes.join('|'));
ok(!JSON.stringify(o).includes('"iv"'),'no encrypted blobs left in the file');
await browser.close(); server.close(); process.exit(fail?1:0);
