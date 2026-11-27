// UI kit: icon sprite, shared buttons on the migrated pages.
import {launch,newPage} from './harness.mjs';
import fs from 'fs'; import path from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const REPO=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const sprite=fs.readFileSync(path.join(REPO,'assets/icons/sprite.svg'),'utf8');
const have=new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]));
// every icon any page asks for exists in the sprite
const wanted=new Set();
(function walk(d){ for(const f of fs.readdirSync(d,{withFileTypes:true})){ if(['node_modules','.git'].includes(f.name)) continue; const p=path.join(d,f.name); if(f.isDirectory()) walk(p); else if(/\.(html|js)$/.test(f.name)){ const s=fs.readFileSync(p,'utf8'); for(const m of s.matchAll(/data-icon="([a-z0-9-]+)"/g)) wanted.add(m[1]); for(const m of s.matchAll(/silIcons\.(?:html|set)\((?:[a-zA-Z.]+,\s*)?'([a-z0-9-]+)'/g)) wanted.add(m[1]); } } })(REPO);
const missing=[...wanted].filter(n=>!have.has(n));
ok(wanted.size>0&&missing.length===0,`all ${wanted.size} icons used exist in the sprite ${missing.join(',')}`);

const check=async(p,ids)=>{
  const Q=await newPage(await browser.createBrowserContext(),BASE,{});
  await Q.page.goto(`${BASE}/${p}`,{waitUntil:'domcontentloaded'}).catch(()=>{}); await new Promise(r=>setTimeout(r,900));
  const r=await Q.page.evaluate((ids)=>ids.map(id=>{const b=document.getElementById(id); return b? {id,cls:b.className,icon:!!b.querySelector('svg.icon use'),text:b.textContent.trim()}:{id,missing:true};}),ids);
  const errs=Q.errors.filter(e=>!/Failed to load|net::ERR|ResonanceAudio/.test(e));
  return {Q,r,errs};
};
let {Q,r,errs}=await check('breathing/index.html',['ppb']);
ok(r[0].cls.includes('primary')&&!r[0].icon&&/Play/.test(r[0].text),'breathing: Play is a word, no icon'); ok(errs.length===0,'breathing: no errors '+errs.join('|'));
const read=()=>Q.page.evaluate(()=>document.getElementById('plabel').textContent);
await Q.page.click('.pb'); await Q.page.waitForFunction(()=>!document.getElementById('startBtn').disabled,{timeout:5000}); await Q.page.click('#startBtn'); await new Promise(r=>setTimeout(r,1800));
const playing=await read(); await Q.page.$eval('#ppb',b=>b.click()); await new Promise(r=>setTimeout(r,300)); const paused=await read();
const swapped=[playing,paused];
ok(swapped[0]==='Pause'&&/^(Resume|Begin again)$/.test(swapped[1]),'breathing: Pause and Resume swap '+swapped.join(' / '));
({r,errs}=await check('regulation/index.html',['ppb','dlbtn']));
ok(!r[0].icon&&r[1].icon&&/Download/.test(r[1].text),'regulation: Play is a word; Download keeps its icon'); ok(errs.length===0,'regulation: no errors '+errs.join('|'));
({r,errs}=await check('soundscape-machine/index.html',['playBtn','stopBtn','mixRecordBtn']));
Q=(await check('soundscape-machine/index.html',['playBtn'])).Q;
ok(r.every(x=>!x.icon&&x.cls.includes('btn')),'soundscape: Play, Stop, Record are plain text buttons'); ok(r.map(x=>x.text).join()==='Play,Stop,Rec mix','soundscape: labels are Play, Stop, Rec mix'); ok(errs.length===0,'soundscape: no errors '+errs.join('|'));
await Q.page.setViewport({width:1100,height:900}); await Q.page.evaluate(()=>document.getElementById('playBtn').scrollIntoView({block:'center'})); await Q.page.screenshot({path:'/tmp/claude-0/-home-claude/78f44dbb-ab0b-567f-888e-0e44a6feee0b/scratchpad/sm.png'});
await browser.close(); server.close(); process.exit(fail?1:0);
