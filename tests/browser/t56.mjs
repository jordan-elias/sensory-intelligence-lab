// Dashboard "Today": two questions, a short path, ticks for what you opened, answers kept on the device only.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function dash(app,rows=[]){ const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{checkins:rows}}); if(app) await P.page.evaluateOnNewDocument(()=>{ window.SIL_APP=true; }); await P.page.goto(`${BASE}/dashboard/`,{waitUntil:'domcontentloaded'}); await P.page.waitForSelector('#todayPath:not([hidden])',{timeout:10000}); return P; }

{ const P=await dash(true); const page=P.page;
  ok(await page.$('#todayGo')!==null&&await page.$eval('#todayGo',b=>b.disabled),'first visit: two questions, and no path until both are answered');
  ok((await page.$$eval('.today-opt',b=>b.length))===7,'four things you might want and three lengths');
  await page.click('[data-i="calm"]'); ok(await page.$eval('#todayGo',b=>b.disabled),'one answer is not enough'); await page.click('[data-m="15"]'); ok(!(await page.$eval('#todayGo',b=>b.disabled)),'both answers enable the path');
  await page.click('#todayGo'); await page.waitForSelector('.today-steps');
  const steps=await page.$$eval('.today-steps li a',a=>a.map(x=>x.getAttribute('href')));
  ok(!steps.includes('/check-in/')&&steps.length>=2&&steps.length<=3,'the path has two or three steps and leaves out the check-in, which has its own card ('+steps+')');
  ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('sil.today.v1')).intent==='calm'),'the answers are saved on this device');
  ok(!/\b(null|undefined)\b/.test(await page.$eval('#todayPath',e=>e.innerText)),'no stray null/undefined text');
  // opening a step ticks it
  await page.evaluate(()=>document.addEventListener('click',e=>{ if(e.target.closest('a')) e.preventDefault(); },true));
  await page.click('.today-steps li:nth-child(2) a'); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.today-steps');
  ok(await page.$$eval('.today-steps li.is-done',l=>l.length)===1,'a step you opened is ticked, and the path stays the same');
  ok(await page.$$eval('.today-steps li a',a=>a.map(x=>x.getAttribute('href'))).then(x=>x.join()===steps.join()),'using a tool does not reshuffle the path');
  await page.click('#todayChange'); await page.waitForSelector('#todayGo'); ok(await page.$eval('[data-i="calm"]',b=>b.getAttribute('aria-pressed'))==='true','changing starts from your current answers');
  await page.click('[data-i="create"]'); await page.click('#todayGo'); await page.waitForSelector('.today-steps');
  ok(await page.$$eval('.today-steps li a',a=>a.some(x=>/experiments/.test(x.getAttribute('href')))),'"Make something" includes the course');
  ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
}
{ const P=await dash(true); await P.page.click('#todaySkip'); await P.page.waitForSelector('.today-steps');
  ok(await P.page.evaluate(()=>JSON.parse(localStorage.getItem('sil.today.v1')).skipped===true),'skipping gives a short default path and is remembered'); }
// the website does not show it at all
{ const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{checkins:[]}}); await P.page.goto(`${BASE}/dashboard/`,{waitUntil:'networkidle0'}); await sleep(500);
  ok(await P.page.$eval('#todayPath',e=>e.hidden)&&!(await P.page.$('#todayGo')),'on the website the Today path is not shown'); }
{ const P=await dash(true); await P.page.click('#todaySkip'); await P.page.waitForSelector('.today-steps');
  ok(!(await P.page.$$eval('.today-steps li a',a=>a.some(x=>x.getAttribute('href')==='/check-in/'))),'in the app the check-in card is already above, so the path leaves it out'); }
await browser.close(); server.close(); process.exit(fail?1:0);
