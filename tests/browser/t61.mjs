// Spatial game: runs, longest run kept on the device, auto level, haptics, headphone check.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{}); const page=P.page;
await page.evaluateOnNewDocument(()=>{ localStorage.setItem('sil_spatial_tutorial_seen','1'); window.__buzz=[]; navigator.vibrate=p=>{ window.__buzz.push(p); return true; }; });
await page.goto(`${BASE}/spatial-game/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#btn-play'); await sleep(800);
ok(await page.$('#stat-streak')!==null&&await page.$('#stat-best-streak')!==null,'the game shows the current run and the longest run');
const r=await page.evaluate(()=>{
  const {G,noteResult,adjustLevel}=window.__spatial; const out={}; noteResult(true); noteResult(true); noteResult(true);
  out.streak=G.streak; out.best=G.bestStreak; out.saved=localStorage.getItem('sil.spatial.bestStreak'); out.buzz=window.__buzz.length;
  out.offMsg=adjustLevel(); out.levelOff=G.currentLevel;                       // auto mode is off: nothing moves
  document.getElementById('auto-level').checked=true; out.upMsg=adjustLevel(); out.levelUp=G.currentLevel; out.streakAfter=G.streak;
  out.badge=document.getElementById('lvl-name').firstChild.textContent;
  noteResult(false); noteResult(false); out.downMsg=adjustLevel(); out.levelDown=G.currentLevel;
  noteResult(true); out.bestKept=G.bestStreak; return out; });
ok(r.streak===3&&r.best===3&&r.saved==='3','three right in a row make a run of 3, kept on this device');
ok(r.buzz===3,'each answer gives a short buzz where the phone supports it');
ok(r.offMsg===''&&r.levelOff===1,'the level does not move unless asked');
ok(r.upMsg==='Level 2'&&r.levelUp===2&&r.badge==='Level 2','three right in a row moves up with auto level on');
ok(r.downMsg==='Back to level 1'&&r.levelDown===1,'two wrong in a row moves down');
ok(r.bestKept===3,'the longest run is not lost when the level changes');
await page.$eval('#more',d=>{d.open=true;}); await page.click('#btn-headphones'); await sleep(1500);
const fm=await page.$eval('#feedback-msg',e=>e.textContent); console.log('MSG',fm); ok(/left, then one on the right/.test(fm),'the headphone check explains what to hear');
ok(P.errors.length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
