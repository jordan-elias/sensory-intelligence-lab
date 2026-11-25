// Experiments in Creativity is paid: subscribers get the course, free users get a preview page with a Subscribe link and nothing of the course.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// free
const F=await newPage(await browser.createBrowserContext(),BASE,{}); const fp=F.page;
const loaded=[]; fp.on('request',r=>loaded.push(r.url()));
await fp.evaluateOnNewDocument(()=>{window.__free=true;});
await fp.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await fp.waitForSelector('.xp-preview',{timeout:20000}); await sleep(500);
ok(await fp.$eval('#xpSubscribe',a=>a.getAttribute('href'))==='/subscribe/','free users see a Subscribe button that goes to the subscribe page');
ok((await fp.$$('.xp-prev-units li')).length===7,'the preview lists the seven sections');
ok(/part of the Lab.s paid plan/.test(await fp.$eval('.xp-preview',e=>e.textContent)),'it says the course is part of the paid plan');
ok(!loaded.some(u=>u.includes('/experiments/page.js')),'the course code is not even loaded for free users');
ok(await fp.$('.xp-list, .xp-card, #xpResume')===null,'no course content on the page');
// paid
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const pp=P.page;
await pp.goto(`${BASE}/experiments/`,{waitUntil:'domcontentloaded'}); await sleep(2500);
ok(await pp.$('.xp-preview')===null,'subscribers do not see the preview');
ok((await pp.$eval('#xpRoot',e=>e.textContent.length))>400,'subscribers get the course');
ok(P.errors.filter(e=>!/Failed to load resource|ERR_|recoveryNudge/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
