// The network page: it runs, the sound engine builds a graph, and the music evolves over time.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.goto(`${BASE}/compositions/neural-network.html`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#nnPlay',{timeout:20000}); await sleep(800);
ok(await page.$eval('#essayH',e=>!!e)&&(await page.$$eval('.essay h3',h=>h.length))>=8,'the essay is there with its sections');
ok((await page.$eval('#nnCanvas',c=>c.width))>100,'the network is drawn');
await page.click('#nnPlay'); await sleep(1500);
ok(await page.evaluate(()=>window.__nn.running&&window.__nn.ctx&&window.__nn.ctx.state==='running'),'the audio engine is running');
const snap=()=>page.evaluate(()=>{ const c=window.__nn.conductor; return {t:c.t,loss:c.lossNow,chord:c.chord.join(),w:c.net.W[1][0][0]}; });
const a=await snap();
await page.evaluate(()=>{ const c=window.__nn.conductor; for(let i=0;i<1500;i++) c.tick(0.1); });   // fast-forward 2.5 minutes of the network
const b=await snap();
ok(b.t>a.t+100&&b.chord!==a.chord&&b.w!==a.w,'after minutes the chord and the weights have moved on');
ok(/\d+:\d\d/.test(await page.$eval('#nnTime',e=>e.textContent)),'the clock runs');
await page.click('#nnPlay'); await sleep(300);
ok(await page.$eval('#nnPlay',e=>e.textContent)==='Resume','it can be paused');
await page.click('#nnNew'); await sleep(1200);
ok(await page.$eval('#nnLog',e=>/new network/i.test(e.textContent)),'a new network can be made');
ok(P.errors.filter(e=>!/Failed to load resource|net::ERR/.test(e)).length===0,'no page errors '+P.errors.join('|').slice(0,300));
await browser.close(); server.close(); process.exit(fail?1:0);
