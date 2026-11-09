// Intake form: sealed for the client and therapist, nothing readable stored, empty refused, reopened and resent.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{tables:{shared_copies:[]}});
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000}); await sleep(1200);
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});
const r=await page.evaluate(async()=>{
  const gate=await import('/assets/js/vault/gate.js'); const s=await gate.ensureVaultReady();
  const m=await import('/assets/js/intake/intake.js'); const sb=window._supabase; const out={};
  const target={link_id:'L1',therapist_id:s.userId,public_enc:s.publicKeys.enc};
  out.clean=JSON.stringify(m.cleanIntake({name:'  Sam ',dob:'',pronouns:'they/them',junk:'x'}));
  out.none=m.cleanIntake({name:'  '});
  try{ await m.submitIntake({sb,session:s,target,fields:{name:' '}}); out.empty='accepted'; }catch(e){ out.empty=e.message; }
  await m.submitIntake({sb,session:s,target,fields:{name:'Sam',medications:'sertraline 50mg',history:'anxiety since 2019'}});
  out.raw=JSON.stringify(window.__tbl.shared_copies); out.n=window.__tbl.shared_copies.length;
  out.cat=window.__tbl.shared_copies[0].category; out.src=window.__tbl.shared_copies[0].source_id;
  const row=window.__tbl.shared_copies[0];
  const o=await m.openIntake(s,{...row,link_id:'L1'}); out.open=JSON.stringify(o.fields);
  await m.submitIntake({sb,session:s,target,fields:{name:'Sam R',pronouns:'they/them'}});
  out.n2=window.__tbl.shared_copies.length;
  out.open2=JSON.stringify((await m.openIntake(s,{...window.__tbl.shared_copies[0],link_id:'L1'})).fields);
  try{ await m.openIntake(s,{...row,link_id:'OTHER'}); out.wrong='opened'; }catch{ out.wrong='refused'; }
  const dl=m.renderIntake(document,{fields:{name:'<b>x</b>',history:'h'}}); out.html=dl.innerHTML;
  return out; });
ok(r.clean==='{"name":"Sam","pronouns":"they/them"}'&&r.none===null,'only known, non-empty fields are kept');
ok(/Fill in at least one/.test(r.empty),'an empty form is refused');
ok(!/sertraline|anxiety|Sam/.test(r.raw),'the saved row holds no readable text');
ok(r.n===1&&r.cat==='intake'&&r.src==='L1','one intake copy per connection');
ok(r.open==='{"name":"Sam","medications":"sertraline 50mg","history":"anxiety since 2019"}','the form opens for its owner');
ok(r.n2===1&&/Sam R/.test(r.open2)&&!/sertraline/.test(r.open2),'sending again replaces the copy');
ok(r.wrong==='refused','a copy cannot be opened under another connection');
ok(!/<b>/.test(r.html)&&/&lt;b&gt;/.test(r.html),'client text is never inserted as markup');
console.log('errors:',errors.length?errors.slice(0,3):'none');
await browser.close(); server.close(); process.exit(fail?1:0);
