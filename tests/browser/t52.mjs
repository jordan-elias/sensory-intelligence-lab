// Phone width: the pages added recently do not scroll sideways and their controls stay on screen.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
await page.setViewport({width:375,height:760,deviceScaleFactor:1,isMobile:true,hasTouch:true});
const over=async()=>page.evaluate(()=>{ const w=document.documentElement.clientWidth; const bad=[]; document.querySelectorAll('body *').forEach(e=>{ const r=e.getBoundingClientRect(); if(r.width>0&&r.right>w+1&&!e.closest('[style*="overflow"],.th-scroll,.tool-row,.toolbar,.track-list,.pad-grid-wrap,pre,table')){ const cs=getComputedStyle(e); if(cs.position!=='fixed'&&cs.visibility!=='hidden') bad.push(e.tagName+'.'+String(e.className).slice(0,30)+' '+Math.round(r.right)); } }); return {sw:document.documentElement.scrollWidth,w,bad:bad.slice(0,5)}; });
for(const [name,url] of [['sequencer','/sequencer/'],['regulation','/regulation/'],['photo words','/experiments/#/photo-words'],['neural synthesis','/compositions/neural-synthesis.html'],['soundscape machine','/soundscape-machine/']]){
  await page.goto(BASE+url,{waitUntil:'domcontentloaded'}); await sleep(1200);
  if(name==='photo words'){ await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); await sleep(400); }
  const o=await over(); console.log(name,JSON.stringify(o));
  ok(o.sw<=o.w+1,name+': the page does not scroll sideways ('+o.sw+' vs '+o.w+')');
}
await page.screenshot({path:process.env.SHOTS?process.env.SHOTS+'/seq-mobile.png':'/dev/null'}).catch(()=>{});
await browser.close(); server.close(); process.exit(fail?1:0);
