import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let SNAP=[];
async function go(page,url){ await page.evaluateOnNewDocument(s=>{window.__db=s},SNAP); await page.goto(url,{waitUntil:'networkidle0'}); }
const snap=async page=>{ SNAP=await page.evaluate(()=>window.__db); };
const db=[];
// ── Goals: autosave creates then updates ──
let {page,errors}=await newPage(browser,BASE,{db}); page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});
await page.goto(`${BASE}/worksheets/goals-values/`,{waitUntil:'networkidle0'}); await sleep(500);
await page.type('[data-field="overall_matters"]','Connection');
await sleep(2300);
let rows=await page.evaluate(()=>window.__db.map(r=>({t:r.type,title:r.title,enc:String(r.content).slice(0,12)})));
ok(rows.length===1 && rows[0].t==='goals','autosave created one goals row '+JSON.stringify(rows));
ok(await page.evaluate(()=>location.search.startsWith('?id=')),'URL switched to ?id=');
await page.type('[data-field="overall_matters"]',' and rest'); await sleep(2300);
rows=await page.evaluate(()=>window.__db.length); ok(rows===1,'second edit updates, not duplicates');
ok(/Saved/.test(await page.$eval('#wsStatus',e=>e.textContent)),'status shows Saved');
ok(errors.length===0,'no errors goals '+errors.join('|'));
// reload and verify restore
const url=page.url(); await snap(page); await go(page,url); await sleep(800);
ok(await page.$eval('[data-field="overall_matters"]',e=>e.value)==='Connection and rest','reload restores saved text');
// scale + pill
await snap(page); await page.close();

// ── Conflict ──
({page,errors}=await newPage(browser,BASE,{db}));
await go(page,url); await sleep(600);
await page.evaluate(()=>{ window.__db[0].updated_at='2099-01-01T00:00:00.000Z'; });
await page.type('[data-field="overall_value"]','x'); await sleep(2300);
ok(await page.$eval('#wsConflict',e=>!e.hidden),'conflict banner shows when row changed elsewhere');
await page.click('#wsConflictKeep'); await sleep(1500);
ok(await page.$eval('#wsConflict',e=>e.hidden),'keep-mine resolves conflict');
ok(/Saved/.test(await page.$eval('#wsStatus',e=>e.textContent)),'saved after resolving');
await snap(page); await page.close();

// ── Music autobiography ──
({page,errors}=await newPage(browser,BASE,{db}));
await go(page,`${BASE}/worksheets/music-autobiography/?new`); await sleep(600);
await page.type('[data-search-input]','Song'); await page.keyboard.press('Enter'); await sleep(500);
await page.click('[data-action="pick-hit"][data-i="0"]'); await sleep(300);
await page.type('[data-search-input]','Tune'); await page.keyboard.press('Enter'); await sleep(500);
await page.click('[data-action="pick-hit"][data-i="1"]'); await sleep(500);
let titles=()=>page.$$eval('.chapter-player-label',els=>els.map(e=>e.textContent));
ok((await titles()).length===2,'two songs added '+await titles());
// right-click menu
const first=await page.$('.chapter-player-row');
const box=await first.boundingBox();
await page.mouse.click(box.x+60,box.y+10,{button:'right'}); await sleep(450);
ok(!!(await page.$('.ctx-menu')),'right-click opens menu');
const items=await page.$$eval('.ctx-item',e=>e.map(x=>x.textContent+(x.disabled?'(disabled)':'')));
console.log('  menu:',items.join(' | '));
ok(items[1].includes('Move up')&&items[1].includes('disabled'),'Move up disabled on first');
await page.evaluate(()=>[...document.querySelectorAll('.ctx-item')].find(b=>b.textContent==='Move down').click()); await sleep(300);
const t2=await titles(); ok(t2[0].includes('Two')&&t2[1].includes('One'),'Move down reorders '+t2);
// arrow keys on handle
await page.focus('.chapter-player[data-song] .drag-handle'); 
await page.keyboard.press('ArrowDown'); await sleep(200);
const t3=await titles(); ok(t3[0].includes('One'),'ArrowDown on handle reorders '+t3);
// add chapter, move song to it
await page.click('#maAddChapter'); await sleep(300);
await page.evaluate(()=>document.querySelector('.chapter-player-row').scrollIntoView({block:'center'})); await sleep(200);
const r=await (await page.$('.chapter-player-row')).boundingBox();
await page.mouse.click(r.x+60,r.y+10,{button:'right'}); await sleep(450);
const movable=await page.$$eval('.ctx-item',e=>e.map(x=>x.textContent).filter(t=>t.startsWith('Move to')));
console.log('  items:',await page.$$eval('.ctx-item',e=>e.map(x=>x.textContent)), 'chapters:',await page.$$eval('.dyn-section',e=>e.length)); ok(movable.length===1,'Move to chapter offered '+movable);
await page.evaluate(()=>[...document.querySelectorAll('.ctx-item')].find(b=>b.textContent.startsWith('Move to')).click()); await sleep(300);
const counts=await page.$$eval('[data-songs-for]',e=>e.map(x=>x.children.length)); ok(counts.join()==='1,1','song moved across chapters '+counts);
// touch long press
await page.evaluate(()=>document.querySelector('.chapter-player-row').scrollIntoView({block:'center'})); await sleep(200);
const r2=await (await page.$('.chapter-player-row')).boundingBox();
const cdp=await page.createCDPSession();
const tp=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
await tp('touchStart',[{x:r2.x+80,y:r2.y+10}]); await sleep(750);
ok(!!(await page.$('.ctx-menu')),'touch long-press opens menu');
await tp('touchEnd',[]); await sleep(100);
await page.keyboard.press('Escape'); await sleep(100);
// autosave persisted structure
await page.type('.dyn-section-label-input','Teens'); await sleep(2300);
const saved=await page.evaluate(()=>window.__db.filter(r=>r.type==='music-auto').length); ok(saved===1,'music-auto autosaved');
ok(errors.length===0,'no errors music '+errors.join('|'));
const murl=page.url(); await snap(page); await page.close();
({page,errors}=await newPage(browser,BASE,{db}));
await go(page,murl); await sleep(800);
ok((await page.$$eval('.chapter-player-label',e=>e.length))===2 && await page.$eval('.dyn-section-label-input',e=>e.value)==='Teens','reload restores chapters+songs');
ok(errors.length===0,'no errors on reload '+errors.join('|'));
await page.close();

// ── v1 legacy migration ──
const legacy={type:'music-auto',data:{earliest_memory:'lullaby',auto_c1_label:'Childhood',auto_c1_life:'Berlin',_chapterOrder:['c1'],_songOrder:[{chapterUuid:'c1',title:'Hey',artist:'Me',videoId:'abc'}],_songnote_Hey_Me:'note here'}};
const {encrypt}= {};
await browser.close(); server.close(); process.exit(fail?1:0);
