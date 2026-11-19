// Workbench: open a pattern saved in the Sequencer; the Sequencer plays through the shared sounds file.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{course_progress:[]}}); const page=P.page;
const loops=Array.from({length:4},()=>Array.from({length:8},()=>Array(16).fill(null))); loops[0][0][0]=true; loops[0][0][4]=true; loops[0][4][2]=3;
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card');
await page.evaluate(l=>localStorage.setItem('sil.seq.patterns',JSON.stringify([{name:'My groove',saved:new Date().toISOString(),data:{v:1,bpm:132,swing:0,root:'C',scale:'major',loops:l,vel:null,prob:null,len:null,chain:[]}}])),loops);
const ids=await page.$$eval('.xp-card',l=>l.map(e=>(e.getAttribute('href')||'').replace('#/','')));
let found=false;
for(const id of ids){
  await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await sleep(150);
  if(!(await page.$('#xpBegin'))) continue; await page.$eval('#xpBegin',b=>b.click());
  for(let i=0;i<14&&!found;i++){ await sleep(100); found=!!(await page.$('#xpBenchSeqGo')); if(!found){ const nx=await page.$('#xpNext'); if(!nx) break; await nx.evaluate(b=>b.click()); } }
  if(found) break;
}
ok(found,'the workbench offers a saved Sequencer pattern');
if(found){
  await page.$eval('#xpBenchSeqGo',b=>b.click()); await sleep(200);
  ok((await page.$eval('#xpBenchTempo',e=>e.value))==='132','the tempo came across');
  ok(/copy/.test(await page.evaluate(()=>document.querySelector('#xpBench [role=status]').textContent)),'it says it is a copy');
  ok((await page.$$eval('#xpBench .xp-step.on, #xpBench [aria-pressed="true"]',l=>l.length))>=2,'steps are switched on');
}
await browser.close(); server.close(); process.exit(fail?1:0);
