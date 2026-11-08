import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';

async function seed(ctx, {corrupt=false}={}){
  const {page}=await newPage(ctx,BASE);
  await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
  const snap=await page.evaluate(async(corrupt)=>{
    const cu=await import('/assets/js/crypto-utils.js');
    await cu.loadUserKeyFromBase64(btoa(String.fromCharCode(...new Array(32).fill(7))));
    const ws=await cu.encrypt(JSON.stringify({type:'goals',schema:1,data:{work_well:'honesty'}}));
    const j=await cu.encrypt('my private journal');
    const n=await cu.encrypt('check-in note');
    const t='2024-01-01T00:00:00Z';
    return { db:[{id:'ws1',user_id:'u1',type:'goals',title:'Old goals',created_at:t,content:ws}],
      tbl:{ journal_entries:[{id:'j1',user_id:'u1',title:'Old',created_at:t,content:j,word_count:3}],
            checkins:[{id:'c1',user_id:'u1',created_at:t,notes:n},{id:'c2',user_id:'u1',created_at:t,notes:null}
              ,...(corrupt?[{id:'c3',user_id:'u1',created_at:t,notes:'{"iv":"AAAAAAAAAAAAAAAA","ciphertext":"AAAAAAAAAAAAAAAAAAAAAAAA","v":1}'}]:[])] } };
  },corrupt);
  await page.close(); return snap;
}
const rowsOf=(page)=>page.evaluate(()=>({ws:window.__db,tbl:window.__tbl,keys:JSON.parse(localStorage.getItem('__keys')||'[]')}));
const txt=(page,sel)=>page.$eval(sel,e=>e.innerText).catch(()=>null);

// ── Scenario A: existing user with old entries ──
const ctxA=await browser.createBrowserContext();
const snap=await seed(ctxA);
const {page,errors}=await newPage(ctxA,BASE,{db:snap.db,tables:snap.tbl});
await page.goto(`${BASE}/worksheets/goals-values/?id=ws1`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('.vault-gate #newPass',{timeout:20000});
ok((await txt(page,'.vault-gate__title'))==='Protect your private writing','first visit shows create-vault dialog over the worksheet');
ok(!(await page.evaluate(()=>/honesty/.test(document.body.innerText))),'private content not shown while locked');
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS);
await page.click('.vault-gate button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-gate .vault-check input'); await sleep(200);
await page.click('#recoveryContinue');
await page.waitForFunction(()=>document.querySelector('.vault-gate')?.innerText.includes('saved entries') && document.querySelector('[data-gate=go]'),{timeout:30000});
const t=await txt(page,'.vault-gate'); ok(/You have\s+3\s+saved entries/.test(t),'upgrade prompt counts 3 old entries: '+t.split('\n').find(l=>/You have/.test(l)));
ok((await rowsOf(page)).ws[0].content.endsWith('"v":1}'),'nothing converted before the user agrees');
await page.click('[data-gate=go]');
await page.waitForFunction(()=>!document.querySelector('.vault-gate'),{timeout:30000});
ok(true,'dialog closes after upgrade');
await sleep(800);
let st=await rowsOf(page);
ok(st.ws[0].content.endsWith('"v":2}') && st.tbl.journal_entries[0].content.endsWith('"v":2}') && st.tbl.checkins[0].notes.endsWith('"v":2}'),'all three old rows now v2');
ok(st.tbl.checkins[1].notes===null,'empty note untouched');
ok(!!st.keys[0].legacy_migrated_at,'migration recorded');
await page.waitForFunction(()=>/honesty/.test(document.body.innerText)||[...document.querySelectorAll('textarea,input')].some(e=>/honesty/.test(e.value)),{timeout:10000}).catch(()=>{});
ok(await page.evaluate(()=>/honesty/.test(document.body.innerText)||[...document.querySelectorAll('textarea,input')].some(e=>/honesty/.test(e.value))),'worksheet opens and shows decrypted content after upgrade');
// journal in the same tab: no prompt
await page.goto(`${BASE}/journal/`,{waitUntil:'domcontentloaded'});
await sleep(2500);
ok(!(await page.$('.vault-gate')),'second page in same tab: no passphrase prompt');
const dec=await page.evaluate(async()=>{ const g=await import('/assets/js/vault/gate.js'); const rows=window.__tbl.journal_entries; return g.decrypt(rows[0].content); });
ok(dec==='my private journal','journal entry decrypts with the new key');
// new tab: must unlock
const p2=await newPage(ctxA,BASE,{db:st.ws,tables:st.tbl});
await p2.page.goto(`${BASE}/journal/`,{waitUntil:'domcontentloaded'});
await p2.page.waitForSelector('.vault-gate input[type=password]',{timeout:20000});
ok((await txt(p2.page,'.vault-gate__title'))==='Unlock your private vault','new tab asks for the passphrase');
await p2.page.type('.vault-gate input[type=password]',PASS); await p2.page.click('.vault-gate button[type=submit]');
await p2.page.waitForFunction(()=>!document.querySelector('.vault-gate'),{timeout:60000});
ok(true,'unlock closes dialog, no second upgrade prompt');
// sign-out clears
await p2.page.evaluate(async()=>{ await window._supabase.auth.signOut(); });
// ── check-in: note encrypt/decrypt round trip ──
ok(errors.length===0 && p2.errors.length===0,'no page errors '+errors.concat(p2.errors).join('|'));

// ── Scenario B: a damaged old row must not block the rest or be overwritten ──
const ctxB=await browser.createBrowserContext();
const snapB=await seed(ctxB,{corrupt:true});
const B=await newPage(ctxB,BASE,{db:snapB.db,tables:snapB.tbl});
await B.page.goto(`${BASE}/worksheets/goals-values/?id=ws1`,{waitUntil:'domcontentloaded'});
await B.page.waitForSelector('.vault-gate #newPass',{timeout:20000});
await B.page.type('#newPass',PASS); await B.page.type('#newConfirm',PASS);
await B.page.click('.vault-gate button[type=submit]');
await B.page.waitForSelector('#recoveryKey',{timeout:60000});
const RKB=await B.page.$eval('#recoveryKey',e=>e.textContent.trim());
await B.page.type('#keyCheck',RKB.slice(0,4)); await B.page.click('.vault-gate .vault-check input'); await sleep(200);
await B.page.click('#recoveryContinue');
await B.page.waitForSelector('[data-gate=go]',{timeout:30000}); await B.page.click('[data-gate=go]');
await B.page.waitForSelector('[data-gate=continue]',{timeout:30000});
ok(/1 could not be converted/.test(await txt(B.page,'.vault-gate')),'damaged row is reported');
const sb2=await rowsOf(B.page);
ok(sb2.ws[0].content.endsWith('"v":2}') && sb2.tbl.checkins[0].notes.endsWith('"v":2}'),'good rows still upgraded');
ok(sb2.tbl.checkins[2].notes.includes('"v":1}'),'damaged row left exactly as it was');
ok(!sb2.keys[0].legacy_migrated_at,'not marked finished, will retry next time');
await B.page.click('[data-gate=continue]');
await B.page.waitForFunction(()=>!document.querySelector('.vault-gate'),{timeout:10000});
ok(true,'user can continue');
ok(B.errors.length===0,'no page errors B '+B.errors.join('|'));

// ── Scenario C: brand-new user, no old key: no upgrade step ──
const ctxC=await browser.createBrowserContext();
const C=await newPage(ctxC,BASE,{noLegacy:true});
await C.page.goto(`${BASE}/journal/`,{waitUntil:'domcontentloaded'});
await C.page.waitForSelector('.vault-gate #newPass',{timeout:20000});
await C.page.type('#newPass',PASS); await C.page.type('#newConfirm',PASS);
await C.page.click('.vault-gate button[type=submit]');
await C.page.waitForSelector('#recoveryKey',{timeout:60000});
const RKC=await C.page.$eval('#recoveryKey',e=>e.textContent.trim());
await C.page.type('#keyCheck',RKC.slice(0,4)); await C.page.click('.vault-gate .vault-check input'); await sleep(200);
await C.page.click('#recoveryContinue');
await C.page.waitForFunction(()=>!document.querySelector('.vault-gate'),{timeout:30000});
ok(true,'new user goes straight through, no upgrade prompt');
ok(!!(await rowsOf(C.page)).keys[0].legacy_migrated_at,'new user marked as nothing to upgrade');
ok(C.errors.length===0,'no page errors C '+C.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
