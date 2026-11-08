import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
// 1. every page loads and renders without errors
for (const s of ['','goals-values','music-autobiography','session-reflection','lyric-analysis','coping','interpersonal']) {
  const {page,errors}=await newPage(browser,BASE);
  await page.goto(`${BASE}/worksheets/${s?s+'/':''}`,{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,400));
  const info=await page.evaluate(()=>({h:document.querySelector('h2')?.textContent, header:!!document.querySelector('.sil-header'), fields:document.querySelectorAll('[data-field]').length, links:document.querySelectorAll('.ws-card').length}));
  ok(errors.length===0 && info.header && !!info.h, `/worksheets/${s} loads: ${JSON.stringify(info)} ${errors.join(' | ')}`);
  await page.close();
}
await browser.close(); server.close(); process.exit(fail?1:0);
