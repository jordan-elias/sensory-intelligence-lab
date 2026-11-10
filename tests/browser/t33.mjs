// Subscribe page: one Lab plan next to Free, no session plans, no script errors.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{});
await page.goto(`${BASE}/subscribe/`,{waitUntil:'domcontentloaded'}); await sleep(1800);
const r=await page.evaluate(()=>({cards:[...document.querySelectorAll('.plan-card')].map(c=>c.id), text:document.body.innerText, labCta:document.getElementById('cta-lab')?.textContent}));
ok(r.cards.join()==='card-free,card-lab','only the Free and Lab plans are shown');
ok(!/1 session|2 sessions|\+ 1 Call|\+ 2 Calls/i.test(r.text),'no session plans are mentioned');
ok(/member rate/i.test(r.text),'the member session rate is explained');
console.log('lab cta:',JSON.stringify(r.labCta)); ok(/Get started|Current plan|Upgrade/.test(r.labCta),'the Lab button is wired');
ok(errors.length===0,'no script errors '+JSON.stringify(errors.slice(0,2)));
await browser.close(); server.close(); process.exit(fail?1:0);
