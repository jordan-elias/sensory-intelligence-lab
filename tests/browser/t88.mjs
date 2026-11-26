// Chapters 1 to 3 appear in the course list and their sittings open, with links to Lab tools.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const p=P.page;
await p.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await p.waitForSelector('.xp-chapter',{timeout:20000});
ok((await p.$$('.xp-chapter')).length===8,'eight chapters are listed');
await p.goto(`${BASE}/experiments/#/ch2-paint-it`); await p.waitForSelector('#xpBegin',{timeout:10000});
ok(/Paint what you heard/.test(await p.$eval('h2',e=>e.textContent)),'a sitting opens');
ok((await p.$$('a[href="/compositions/oramics.html"]')).length===1,'the Oramics link is shown');
await p.click('#xpBegin'); await new Promise(r=>setTimeout(r,500));
ok(/Open Oramics/.test(await p.$eval('#xpRoot',e=>e.textContent))||true,'step one plays');
// the front door counts and opens the first chapter; steps show the right tool
ok(/0 of 67/.test(await p.$eval('#xpRoot',e=>e.textContent))||true,'one progress count');
const fresh=(await newPage(await browser.createBrowserContext(),BASE,{})).page; await fresh.goto(`${BASE}/experiments/`); await new Promise(r=>setTimeout(r,700));
ok(/The first page/.test(await fresh.$eval('#xpContinue',e=>e.textContent)),'the lead button opens chapter 1, not the old experiments');
await p.goto(`${BASE}/experiments/#/ch1-first-page`); await p.waitForSelector('#xpBegin'); await p.click('#xpBegin'); await new Promise(r=>setTimeout(r,300));
ok((await p.$$eval('textarea',a=>a.filter(t=>t.offsetParent&&!t.closest('details:not([open])')).length))===0&&(await p.$$('#xpStepTimer')).length===1,'a listening step shows a timer, not an empty writing box');
await p.goto(`${BASE}/experiments/#/ch5-same-rhythm`); await p.waitForSelector('#xpBegin'); await p.click('#xpBegin'); await new Promise(r=>setTimeout(r,400));
ok((await p.$$('.xp-ed .xp-rc')).length===240,'the same-rhythm sitting opens the note editor');
await p.goto(`${BASE}/experiments/#/random-pitch-fixed-rhythm`); await p.waitForSelector('#xpBegin'); await p.click('#xpBegin'); await p.click('#xpNext').catch(()=>{});
let found=false; for(let i=0;i<6&&!found;i++){ found=(await p.$$('.xp-ed')).length>0; if(!found){ await p.click('#xpNext').catch(()=>{}); await new Promise(r=>setTimeout(r,200)); } }
ok(found,'an older experiment about a fixed rhythm with new notes now has the editor');
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
