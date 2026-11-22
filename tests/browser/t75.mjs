// Capstone: four choices; each opens, shows its tools with the right steps, and the loop one brings the rolls onto the workbench.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{course_progress:[]}}); const page=P.page;
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card');
const caps=await page.$$eval('#u-capstone ~ .xp-grid a.xp-card',l=>l.map(a=>a.getAttribute('href')));
ok(caps.length===4,'the capstone unit shows four choices');
ok(/Choose any one|meant for after/.test(await page.$eval('#u-capstone ~ p.xp-hint:nth-of-type(2)',e=>e.textContent).catch(()=>await_text())),'the unit says when to open them');
async function await_text(){ return page.evaluate(()=>document.querySelector('#u-capstone').parentElement.innerText); }
for(const h of caps){
  await page.goto(`${BASE}/experiments/${h}`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.$eval('#xpBegin',b=>b.click());
  let steps=0, sawTool=false, sawTimer=false;
  for(let i=0;i<8;i++){ await sleep(80); steps++; if(await page.$('#xpTools .xp-btn')) sawTool=true; if(await page.$('[role=timer]')) sawTimer=true; const nx=await page.$('#xpNext'); if(!nx) break; await nx.evaluate(b=>b.click()); }
  ok(sawTool&&sawTimer,`${h}: tools and a timer show up along the steps`);
  ok(!/\b(null|undefined)\b/.test(await page.$eval('#xpRoot',e=>e.innerText)),`${h}: no stray null/undefined`);
}
// the loop capstone: roll notes, roll rhythm, bring both onto the workbench
await page.goto(`${BASE}/experiments/#/capstone-loop`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.$eval('#xpBegin',b=>b.click()); await sleep(150);
const clickBtn=l=>page.evaluate(l=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent===l); if(b) b.click(); return !!b; },l);
ok(await clickBtn('Roll your five notes'),'the notes roll is on the first step');
await page.$eval('#xpNext',b=>b.click()); await sleep(150);
ok(await clickBtn('Roll a rhythm'),'the rhythm roll is on the second step');
await page.$eval('#xpNext',b=>b.click()); await sleep(150);
await clickBtn('Use the rhythm I rolled'); await clickBtn('Put the notes I drew on the hits'); await sleep(100);
ok((await page.$$eval('#xpBench [aria-pressed="true"]',l=>l.length))>=3,'both rolls landed on the workbench');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
