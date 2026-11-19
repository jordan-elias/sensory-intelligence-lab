// Impressum: the page exists, is linked from the footers, and says what a legal notice needs to say.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/impressum/`,{waitUntil:'domcontentloaded'});
const t=await page.evaluate(()=>document.body.innerText);
ok(/Impressum/.test(t)&&/§ 5/.test(t)&&/hello@jordanelias\.de/.test(t)&&/Jordan Elias/.test(t)&&/Berlin/.test(t),'name, place, email and the legal basis are there');
ok(/Responsible for the content/.test(t)&&/Dispute resolution/.test(t)&&/Tax/.test(t),'content responsibility, dispute resolution and tax sections are there');
ok(!(await page.$('script[src*="http"]')),'the page loads nothing from outside');
for(const [u,sel] of [['/','footer a[href="/impressum/"]'],['/privacy/','footer a[href="/impressum/"]'],['/subscribe/','footer a[href="/impressum/"]']]){
  await page.goto(`${BASE}${u}`,{waitUntil:'domcontentloaded'}); ok(!!(await page.$(sel)),`${u} footer links to the Impressum`);
}
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
