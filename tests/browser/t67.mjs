// One knob: a four-bar loop (64 steps) can be built in the workbench.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ window.__dl=[]; const oc=URL.createObjectURL; URL.createObjectURL=b=>{ window.__dl.push(b.size+':'+b.type); return oc.call(URL,b); }; });
await page.goto(`${BASE}/experiments/#/one-knob`,{waitUntil:'domcontentloaded'}); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); await page.click('#xpBegin');
for(let k=0;k<8&&!(await page.$('#xpTools #xpBench'));k++){ await page.click('#xpNext'); await sleep(60); }
ok(await page.$('#xpTools #xpBench')!==null,'the workbench appears on a step of One knob');
ok(await page.evaluate(()=>document.querySelector('#xpBench').__bench.steps)===64,'it holds 64 steps (four bars)');
ok(await page.$$eval('.xp-btrack[data-track=kick] .xp-bs',c=>c.length)===64,'each track shows 64 steps');
const opts=await page.$$eval('.xp-btrack[data-track=kick] select[aria-label$="length in steps"] option',o=>o.map(x=>+x.value));
ok(opts.includes(64)&&opts.includes(32)&&Math.max(...opts)===64,'cycle lengths go up to 64: '+opts.join());
await page.evaluate(()=>{ const c=document.querySelectorAll('.xp-btrack[data-track=kick] .xp-bs'); [0,16,32,48].forEach(i=>c[i].click()); });
ok(await page.$$eval('.xp-btrack[data-track=kick] .xp-bs.on',c=>c.length)===4,'a kick on each bar');
await page.click('#xpBenchMidi'); await page.click('#xpBenchWav');
await page.waitForFunction(()=>window.__dl.some(x=>/audio\/wav/.test(x)),{timeout:20000}).catch(()=>{});
const dl=await page.evaluate(()=>window.__dl);
ok(dl.some(x=>/audio\/midi/.test(x))&&dl.some(x=>/audio\/wav/.test(x)),'MIDI and WAV both export');
const wav=+dl.find(x=>/wav/.test(x)).split(':')[0];
ok(wav>44100*2*10,'two passes of 4 bars at 100 BPM is over 19 seconds of audio: '+wav);
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
