import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const ctx=await browser.createBrowserContext();
const {page,errors}=await newPage(ctx,BASE,{tables:{recordings:[
  {id:'r-old',user_id:'u1',created_at:'2026-01-01T00:00:00Z',title:'Old voice memo',duration_s:3.5,mime_type:'audio/webm',storage_path:'u1/old.webm',file_size:1000,payload:null,file_url:null}]}});
await page.evaluateOnNewDocument(()=>{ const b=new Uint8Array(1000).map((_,i)=>(i*7)%251); window.__plain=Array.from(b); window.__storage=new Map([['u1/old.webm',{bytes:b,type:'audio/webm'}]]); });
await page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#newPass',{timeout:20000});
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS); await page.click('button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-check input'); await sleep(200); await page.click('#recoveryContinue');
await page.waitForSelector('.vault-status',{timeout:30000});

const r=await page.evaluate(async()=>{
  const s=await import('/assets/js/recordings/store.js');
  const out={};
  let list=await s.list(); out.before=list.map(x=>({legacy:x.legacy,title:x.title}));
  out.sec=await s.secureLegacy(list);
  list=await s.list(); out.after=list.map(x=>({legacy:x.legacy,title:x.title,dur:x.duration_s,mime:x.mime_type,path:x.storage_path}));
  const row=window.__tbl.recordings[0]; out.row={title:row.title,dur:row.duration_s,mime:row.mime_type,hasPayload:!!row.payload,payloadText:row.payload};
  out.oldGone=!window.__storage.has('u1/old.webm');
  const stored=window.__storage.get(row.storage_path).bytes; out.storedSame=JSON.stringify(Array.from(stored.slice(12,1012)))===JSON.stringify(window.__plain);
  out.audio=Array.from(new Uint8Array(await s.fetchAudio(list[0]))); out.plain=window.__plain;
  // new upload
  const f=new File([new Uint8Array(5000).map((_,i)=>i%200)],'My <b>take</b>.webm',{type:'audio/webm'});
  const id=await s.upload(f,{durationS:2.25}); list=await s.list();
  const mine=list.find(x=>x.id===id); out.up={title:mine.title,dur:mine.duration_s,size:mine.file_size};
  const back=new Uint8Array(await s.fetchAudio(mine)); out.upOk=back.length===5000&&back[199]===199&&back[200]===0;
  await s.rename(mine,'Renamed'); out.renamed=(await s.list()).find(x=>x.id===id).title;
  out.dbHasTitle=JSON.stringify(window.__tbl.recordings).includes('Renamed')||JSON.stringify(window.__tbl.recordings).includes('My <b>');
  await s.remove(mine); out.afterDelete=(await s.list()).length; out.storageCount=window.__storage.size;
  // bucket that only accepts audio types
  window.__rejectMime=true; const id2=await s.upload(new File([new Uint8Array(10)],'x.webm',{type:'audio/webm'})); out.mimeFallback=!!id2;
  return out;
});
ok(r.before[0].legacy===true,'old recording starts out plain');
ok(r.sec.done===1&&r.sec.failed===0,'old recording encrypted in place');
ok(r.after[0].legacy===false&&r.after[0].title==='Old voice memo'&&r.after[0].dur===3.5&&r.after[0].mime==='audio/webm','title, duration and type survive inside the encrypted payload');
ok(r.row.title===null&&r.row.dur===null&&r.row.mime===null&&r.row.hasPayload&&!r.row.payloadText.includes('Old voice'),'database no longer shows title, duration or type');
ok(r.oldGone&&!r.storedSame,'plain file deleted; stored file is not the plain audio');
ok(JSON.stringify(r.audio)===JSON.stringify(r.plain),'decrypted audio is byte-identical to the original');
ok(r.up.title==='My <b>take</b>'&&r.up.dur===2.25&&r.up.size===5028&&r.upOk,'new upload: encrypted size is plain + 28 bytes, round-trips');
ok(r.renamed==='Renamed'&&!r.dbHasTitle,'rename works and the name is not readable in the database');
ok(r.afterDelete===1&&r.storageCount===1,'delete removes row and file');
ok(r.mimeFallback,'falls back when the bucket only accepts audio types');
ok(errors.length===0,'no page errors '+errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
