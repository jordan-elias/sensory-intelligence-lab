// Every tool page uses the one shared button (lab-btn) for its actions, and none keeps its own older button style.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const pages=['sequencer/','compositions/rooms.html','compositions/phase-machine.html','compositions/waves.html','compositions/chance.html','compositions/semantic-synth.html','compositions/oramics.html','spatial-game/','cocktail-party-problem/','breathing/'];
for(const u of pages){
  const P=await newPage(await browser.createBrowserContext(),BASE,{}); const p=P.page; await p.setViewport({width:1100,height:800});
  await p.goto(`${BASE}/${u}`,{waitUntil:'domcontentloaded'}); await new Promise(r=>setTimeout(r,1000));
  const r=await p.evaluate(()=>({lab:document.querySelectorAll('.lab-btn').length,old:[...document.querySelectorAll('button.btn,button.pill,button.tbtn,button.stop-btn:not(.lab-btn),button.analyze-btn:not(.lab-btn)')].filter(b=>!b.classList.contains('lab-btn')).length,fonts:[...new Set([...document.querySelectorAll('.lab-btn')].map(b=>getComputedStyle(b).fontFamily.split(',')[0]))].length,tall:[...document.querySelectorAll('.lab-btn')].filter(b=>b.offsetParent&&b.getBoundingClientRect().height<34).length}));
  ok(r.lab>0&&r.old===0&&r.fonts===1&&r.tall===0,`${u}: ${r.lab} shared buttons, ${r.old} old-style left, ${r.fonts} font, ${r.tall} too short`);
  await P.page.close();
}
await browser.close(); server&&server.close&&server.close(); process.exit(fail?1:0);
