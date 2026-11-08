import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page,errors}=await newPage(browser,BASE);
await page.goto(`${BASE}/worksheets/music-autobiography/?new`,{waitUntil:'networkidle0'}); await sleep(600);
// insert a legacy-format encrypted row using the page's own key
const id=await page.evaluate(async()=>{
  const cu=await import('/assets/js/crypto-utils.js'); await cu.loadUserKeyFromBase64(btoa(String.fromCharCode(...new Array(32).fill(7)))); const {encrypt}=cu;
  const data={earliest_memory:'lullaby',patterns:'repeats',
    auto_aaa_label:'Childhood',auto_aaa_life:'Berlin',auto_aaa_songs:'hand typed',
    auto_bbb_label:'Teens',auto_bbb_meaning:'escape',
    _chapterOrder:['bbb','aaa'],
    _songOrder:[{chapterUuid:'aaa',title:'Hey Jude!',artist:'Beatles',videoId:'v1'},{chapterUuid:'bbb',title:'Song',artist:'X',videoId:'v2'}],
    '_songnote_Hey_Jude__Beatles':'my note'};
  const row={id:'legacy-1',user_id:'u1',type:'music-auto',title:'Old one',created_at:'2024-01-01T00:00:00Z',content:await encrypt(JSON.stringify({type:'music-auto',data}))};
  window.__db.push(row); return row.id; });

const snapshot=await page.evaluate(()=>window.__db); await page.close();
const p2=await newPage(browser,BASE,{db:snapshot});
const pg=p2.page;
await pg.goto(`${BASE}/worksheets/music-autobiography/?id=${id}`,{waitUntil:'networkidle0'}); await sleep(900);
const chs=await pg.$$eval('.dyn-section',s=>s.map(x=>({label:x.querySelector('.dyn-section-label-input').value,songs:[...x.querySelectorAll('.chapter-player-label')].map(e=>e.textContent),note:[...x.querySelectorAll('.chapter-player-notes textarea')].map(e=>e.value),life:x.querySelector('[data-ch-field="life"]').value,songsText:x.querySelector('[data-ch-field="songsText"]').value})));
console.log(JSON.stringify(chs));
ok(chs.length===2 && chs[0].label==='Teens' && chs[1].label==='Childhood','chapter order preserved');
ok(chs[1].songs[0]==='Hey Jude! — Beatles' && chs[1].note[0]==='my note','song + per-song note migrated');
ok(chs[1].life==='Berlin' && chs[1].songsText==='hand typed','chapter fields migrated');
ok(await pg.$eval('[data-field="earliest_memory"]',e=>e.value)==='lullaby','top-level fields migrated');
// opening alone must NOT write anything
await sleep(2500);
ok((await pg.evaluate(()=>window.__db[0].updated_at))===undefined,'opening a legacy entry does not rewrite it');
// edit -> saved as v2 with backup
await pg.type('[data-field="patterns"]',' more'); await sleep(2300);
const saved=await pg.evaluate(async()=>{ const cu=await import('/assets/js/crypto-utils.js'); await cu.loadUserKeyFromBase64(btoa(String.fromCharCode(...new Array(32).fill(7)))); const {decrypt}=cu; return JSON.parse(await decrypt(window.__db[0].content)); });
ok(saved.schema===2 && saved.data.chapters.length===2 && !!saved.data._v1_backup,'edit re-saves as schema 2 with _v1_backup');
ok(p2.errors.length===0,'no errors '+p2.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
