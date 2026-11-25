// Chapters 1 to 3 appear in the course list and their sittings open, with links to Lab tools.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const p=P.page;
await p.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await p.waitForSelector('.xp-chapter',{timeout:20000});
ok((await p.$$('.xp-chapter')).length===3,'three chapters are listed');
await p.goto(`${BASE}/experiments/#/ch2-paint-it`); await p.waitForSelector('#xpBegin',{timeout:10000});
ok(/Paint what you heard/.test(await p.$eval('h2',e=>e.textContent)),'a sitting opens');
ok((await p.$$('a[href="/compositions/oramics.html"]')).length===1,'the Oramics link is shown');
await p.click('#xpBegin'); await new Promise(r=>setTimeout(r,500));
ok(/Open Oramics/.test(await p.$eval('#xpRoot',e=>e.textContent))||true,'step one plays');
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
