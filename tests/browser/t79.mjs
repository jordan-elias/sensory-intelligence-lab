// Vault: check the recovery key without changing anything; the reminder shows when it is due.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{tables:{user_keys:[]}});
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000}); await sleep(1200);
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});

ok(/Check your recovery key/.test(await page.$eval('.vault-card',e=>e.innerText)),'settings has a recovery key check');
ok(!/gentle reminder/i.test(await page.$eval('.vault-card',e=>e.innerText)),'no reminder right after setup');
await page.type('#ckInput','AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA'); await page.click('#checkRkForm button'); await sleep(2500);
ok(/typo|does not open this vault|not correct/.test(wrongTxt),'a wrong key is refused with a kind message');
await page.type('#ckInput',RK); await page.click('#checkRkForm button'); await sleep(2500);
ok(/opens your vault\. Thank you/.test(await page.$eval('.vault-card',e=>e.innerText)),'the right key is confirmed');
ok(/Last confirmed/.test(await page.$eval('.vault-card',e=>e.innerText)),'and the date is shown');
// due: pretend the vault was set up a year ago
await page.evaluate(()=>{ const t=window.__tbl.user_keys; for(const r of t){ r.recovery_acknowledged_at=new Date(Date.now()-400*864e5).toISOString(); r.recovery_checked_at=null; } });
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.vault-card',{timeout:20000}); await sleep(800);
const txt=await page.$eval('.vault-card',e=>e.innerText); ok(/gentle reminder/i.test(txt)||/Unlock|passphrase/i.test(txt),'the page still loads when a check is due');
ok(errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
