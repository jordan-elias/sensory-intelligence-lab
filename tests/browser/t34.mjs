// App home: the daily check-in is prominent (app only), and the reminder setting appears only in the app.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dash(app,rows){
  const {page,errors}=await newPage(await browser.createBrowserContext(),BASE,{tables:{checkins:rows}});
  if(app) await page.evaluateOnNewDocument(()=>{ window.SIL_APP=true; });
  await page.goto(`${BASE}/dashboard/`,{waitUntil:'domcontentloaded'}); await sleep(1800);
  const r=await page.evaluate(()=>{ const h=document.getElementById('checkinHero'); return {hidden:h.hidden, done:h.classList.contains('is-done'), btn:document.getElementById('checkinHeroBtn').textContent, href:document.getElementById('checkinHeroBtn').getAttribute('href')}; });
   await page.close(); return r;
}
const web=await dash(false,[]);
ok(web.hidden,'the website dashboard is unchanged');
const app=await dash(true,[]);
ok(!app.hidden&&!app.done&&app.btn==='Check in'&&app.href==='/check-in/','in the app the check-in card is shown at the top');
const done=await dash(true,[{id:'c1',user_id:'u1',created_at:new Date().toISOString()}]);
ok(!done.hidden&&done.done&&/again/i.test(done.btn),'after a check-in today the card says so');
await browser.close(); server.close(); process.exit(fail?1:0);
