// The installed app shows no purchase or billing links; the website still does.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
const visible=sel=>page.$$eval(sel,els=>els.filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'&&r.width>0}).length);
await page.goto(`${BASE}/therapy/`,{waitUntil:'domcontentloaded'}); await sleep(600);
ok(await visible('a[href*="subscribe"]')>0,'on the website the therapy page offers the Lab plan');
await page.evaluate(async()=>{ const m=await import('/assets/js/app/nopay.js'); m.installNoPay(); }); await sleep(200);
ok(await visible('a[href*="subscribe"]')===0,'in the app that link is hidden');
ok(await visible('a[href*="booking"]')>0,'and the booking link is still there');
// pressing a subscribe link anyway goes nowhere
const before=page.url(); await page.evaluate(()=>{ const a=document.createElement('a'); a.href='/subscribe/'; a.id='x'; a.textContent='x'; document.body.appendChild(a); a.click(); }); await sleep(300);
ok(page.url()===before,'a subscribe link that is clicked anyway does not navigate');
// the subscribe page itself bounces to the dashboard in the app
await page.goto(`${BASE}/subscribe/`,{waitUntil:'domcontentloaded'}); await sleep(300);
const dest=await page.evaluate(async()=>{ const m=await import('/assets/js/app/nopay.js'); let to=null; const win={location:{pathname:'/subscribe/',replace:u=>{to=u}},document:document}; m.installNoPay(win); return to; });
ok(dest==='/dashboard/index.html','opening the subscribe page in the app sends you to the dashboard');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|').slice(0,200));
await browser.close(); server.close(); process.exit(fail?1:0);
