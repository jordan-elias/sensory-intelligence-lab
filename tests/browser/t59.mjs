// Writing in place: lines under the end-words, a counting pad, saved at the end.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
async function open(id){ await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin'); }
await open('photo-words');
for(let k=0;k<6&&!(await page.$('#xpTools #xpFrame'));k++){ await page.click('#xpNext'); await sleep(60); }
await page.type('#xpWords','open exit coffee nine taxi bread');
await page.click('#xpFrame'); await sleep(100);
ok(await page.$$eval('.xp-frame li input.xp-line',i=>i.length)===6,'each end-word has a line to write on');
await page.type('.xp-frame li:nth-child(1) input','I walked out past the open');
ok(await page.$eval('.xp-frame li:nth-child(1) input',i=>i.value.includes('open')),'typing works in place');
for(let k=0;k<8&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(40); }
await page.waitForSelector('#xpSave');
ok(/The frame/.test(await page.$eval('#xpSave',e=>e.textContent))&&/I walked out past the open/.test(await page.$eval('#xpSave',e=>e.textContent)),'the written lines are offered for saving');
await page.click('#xpFinish'); await sleep(400);
await open('list-prompts');
for(let k=0;k<6&&!(await page.$('#xpPad'));k++){ await page.click('#xpNext'); await sleep(60); }
ok(await page.$('#xpPad')!==null,'the list experiment has a writing pad');
await page.type('#xpPad','one\ntwo\nthree');
ok(/3 of 15/.test(await page.$eval('#xpTools .xp-tool .xp-hint:last-child',e=>e.textContent)),'it counts the items');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
