// Phone navigation: a bottom tab bar on phone-sized screens (not on wide ones), a search box, "jump back in", an icon grid, and group views.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{my_therapists:[],messages:[]}}); const page=P.page;
await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
await page.goto(`${BASE}/dashboard/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.sil-tabs',{timeout:20000}); await sleep(500);
ok((await page.$$eval('.sil-tabs a',a=>a.map(x=>x.textContent.trim()))).join()==='Home,Calm,Listen,Create,You','five tabs on a phone');
ok(await page.$eval('.sil-tabs a[aria-current=page]',a=>a.dataset.tab)==='home','Home is current');
ok(await page.$eval('.sil-tabs',e=>getComputedStyle(e).position)==='fixed','bar is fixed');
ok(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--tabbar-h').trim().length>0&&document.documentElement.classList.contains('has-tabbar')),'bar height is published');
ok(await page.$eval('#mobileHome',e=>getComputedStyle(e).display!=='none'),'the icon grid shows on a phone');
ok(await page.$eval('.modules-section',e=>getComputedStyle(e).display==='none'),'the long card list is hidden on a phone');
const tiles=await page.$$eval('.m-tile',a=>a.length); ok(tiles===16,'16 tiles, one per tool ('+tiles+')');
ok(await page.$$eval('.m-tile svg',a=>a.every(s=>s.getBoundingClientRect().width>=20)),'every tile has an icon');
ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
// search
await page.type('#mFind','rain'); await sleep(150);
const hits=await page.$$eval('#mResults .m-tile .m-tile__t',a=>a.map(x=>x.textContent));
ok(hits[0]==='Ambience','searching "rain" finds Ambience ('+hits.join()+')');
ok(await page.$eval('#mBrowse',e=>e.hidden),'the grid steps aside while searching');
await page.$eval('#mFind',e=>{e.value='';e.dispatchEvent(new Event('input'))}); await page.type('#mFind','zzzq'); await sleep(100);
ok(await page.$eval('#mNone',e=>!e.hidden),'a friendly message when nothing matches');
// jump back in
await page.evaluate(()=>localStorage.setItem('sil.recent.v1',JSON.stringify([{href:'/breathing/',at:Date.now()},{href:'/journal/',at:Date.now()-1000}])));
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('.m-chip',{timeout:20000});
ok((await page.$$eval('.m-chip span',a=>a.map(x=>x.textContent))).join()==='Breathing,Timed Journal','jump back in lists recent tools, newest first');
// group view
await page.goto(`${BASE}/dashboard/?g=listen`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.sil-tabs',{timeout:20000}); await sleep(500);
ok(await page.$eval('.sil-tabs a[aria-current=page]',a=>a.dataset.tab)==='listen','Listen tab is current');
ok((await page.$$eval('.m-tile .m-tile__t',a=>a.map(x=>x.textContent))).join()==='Ear Training,Spatial Awareness,Cocktail Party','only the Listen tools show');
ok(await page.$eval('#checkinHero',e=>getComputedStyle(e).display==='none'),'the group view drops the home extras');
// a tool page keeps the bar, under the right tab
await page.goto(`${BASE}/ambience/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.sil-tabs',{timeout:20000});
ok(await page.$eval('.sil-tabs a[aria-current=page]',a=>a.dataset.tab)==='calm','Ambience sits under Calm');
// wide screens: no bar, card list as before
await page.setViewport({width:1280,height:800});
await page.goto(`${BASE}/dashboard/`,{waitUntil:'domcontentloaded'}); await sleep(1200);
ok(await page.$('.sil-tabs')===null,'no tab bar on a wide screen');
ok(await page.$eval('#mobileHome',e=>getComputedStyle(e).display==='none'),'no icon grid on a wide screen');
ok(await page.$eval('.modules-section',e=>getComputedStyle(e).display!=='none'),'the card list is unchanged on a wide screen');
// resizing to a phone adds the bar
await page.setViewport({width:390,height:844}); await sleep(400);
ok(await page.$('.sil-tabs')!==null,'the bar appears when the window becomes phone-sized');
ok(P.errors.filter(e=>!/Failed to load resource|onAuthStateChange|ERR_|recoveryNudge/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
