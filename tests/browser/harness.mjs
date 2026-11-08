import http from 'http'; import fs from 'fs'; import path from 'path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
const REPO=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const CHROME=process.env.CHROME_PATH||['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(p=>fs.existsSync(p));
const SORTABLE=path.join(REPO,'assets/js/vendor/sortable.esm.js');
const DB = { rows: [] }; // shared fake table
const KEY = Buffer.alloc(32, 7).toString('base64');

const AUTH_STUB = `
try{ const sv=localStorage.getItem('__state'); if(sv){ const o=JSON.parse(sv); window.__db=o.db; window.__tbl=o.tbl; } }catch(e){}
const saveState=()=>{ try{ localStorage.setItem('__state',JSON.stringify({db:window.__db,tbl:window.__tbl})); }catch(e){} };
function builder(table){
  const isKeys = table==='user_keys';
  const rows = isKeys ? (window.__keys ||= JSON.parse(localStorage.getItem('__keys')||'[]')) : table==='worksheets' ? window.__db : ((window.__tbl ||= {})[table] ||= []);
  const persist=()=>{ if(isKeys) localStorage.setItem('__keys',JSON.stringify(rows)); saveState(); };
  const q={op:'select',filters:[],gt:null,like:null,limit:null,head:false,count:false,order:null,cols:'*',payload:null,single:false,after:false};
  const run=()=>{
    let res=rows.filter(r=>q.filters.every(([k,v])=>String(r[k])===String(v)));
    if(q.filters2) res=res.filter(r=>q.filters2.every(([k,v])=>String(r[k])>=String(v)));
    if(q.isNull) res=res.filter(r=>r[q.isNull[0]]==null);
    if(q.like) res=res.filter(r=>typeof r[q.like[0]]==='string' && r[q.like[0]].endsWith(q.like[1].replace(/^%/,'')));
    if(q.ins) res=res.filter(r=>q.ins.every(([k,vs])=>vs.includes(r[k])));
    if(q.gt) res=res.filter(r=>String(r[q.gt[0]])>String(q.gt[1]));
    if(q.op==='select' && q.head) return {data:null,count:res.length,error:null};
    if(q.op==='select'){ if(q.order) res=[...res].sort((a,b)=>(q.order.asc?1:-1)*String(a[q.order.col]).localeCompare(String(b[q.order.col])));
      if(q.limit) res=res.slice(0,q.limit);
      if(!isKeys && q.cols.includes('updated_at') && !window.__hasUpdatedAt) return {data:null,error:{message:'column worksheets.updated_at does not exist'}};
      const out=res.map(r=>q.cols==='*'?{...r}:Object.fromEntries(q.cols.split(',').map(c=>c.trim()).filter(c=>c in r).map(c=>[c,r[c]])));
      return q.single?{data:out[0]||null,error:(out[0]||q.maybe)?null:{message:'not found'}}:{data:out,error:null}; }
    if(q.op==='insert'){ if(isKeys && rows.some(x=>x.user_id===q.payload.user_id)) return {data:null,error:{code:'23505',message:'dup'}}; const r={id:crypto.randomUUID(),created_at:new Date().toISOString(),...(isKeys?{updated_at:new Date().toISOString()}:{}),...q.payload}; rows.push(r); persist(); const o=q.cols.split(',').reduce((a,c)=>{c=c.trim(); if(c in r)a[c]=r[c]; return a},{}); return {data:q.single?o:[o],error:null}; }
    if(q.op==='update'){ res.forEach(r=>Object.assign(r,q.payload,isKeys?{updated_at:new Date(Date.now()+Math.random()*1000).toISOString()}:{})); persist(); const o=res.map(r=>q.cols.split(',').reduce((a,c)=>{c=c.trim(); if(c in r)a[c]=r[c]; return a},{})); return {data:o,error:null}; }
    if(q.op==='delete'){ res.forEach(r=>rows.splice(rows.indexOf(r),1)); persist(); return {data:null,error:null}; }
  };
  const b={ select(c='*',o){ if(q.op==='select'||q.op) {q.cols=c; q.after=true;} if(o&&o.head) q.head=true; return b; }, like(k,v){q.like=[k,v];return b}, gte(k,v){q.filters2=(q.filters2||[]);q.filters2.push([k,v]);return b}, is(k,v){q.isNull=[k,v];return b}, gt(k,v){q.gt=[k,v];return b}, limit(n){q.limit=n;return b},
    insert(p){q.op='insert';q.payload=p;return b}, update(p){q.op='update';q.payload=p;return b}, delete(){q.op='delete';return b},
    eq(k,v){q.filters.push([k,v]);return b}, in(k,vs){q.ins=(q.ins||[]);q.ins.push([k,vs]);return b}, order(col,o){q.order={col,asc:!(o&&o.ascending===false)};return b}, single(){q.single=true;return b}, maybeSingle(){q.single=true;q.maybe=true;return b},
    then(res,rej){ try{ res(run()) }catch(e){ rej&&rej(e) } } };
  return b;
}

window.__storage = window.__storage || new Map();
const _fetch = window.fetch.bind(window);
window.fetch = (u,o)=>{ const k=String(u).indexOf('/__storage/'); const m=k>=0?[0,String(u).slice(k+11)]:null; if(m){ const e=window.__storage.get(decodeURIComponent(m[1])); return Promise.resolve(e? new Response(e.bytes.slice().buffer,{status:200}) : new Response('nf',{status:404})); } return _fetch(u,o); };
const storage={ from:b=>({
  upload:async(p,blob,o)=>{ if(window.__rejectMime && o&&o.contentType==='application/octet-stream') return {error:{message:'mime type application/octet-stream is not supported'}}; if(window.__storage.has(p)) return {error:{message:'exists'}}; window.__storage.set(p,{bytes:new Uint8Array(await blob.arrayBuffer()),type:o&&o.contentType}); return {data:{path:p},error:null}; },
  createSignedUrl:async(p)=> window.__storage.has(p)?{data:{signedUrl:location.origin+'/__storage/'+encodeURIComponent(p)},error:null}:{data:null,error:{message:'nf'}},
  remove:async(ps)=>{ ps.forEach(p=>window.__storage.delete(p)); return {data:null,error:null}; } }) };
const sb={ storage, rpc:(n,a)=>Promise.resolve(window.__rpc?window.__rpc(n,a):{error:null}), from:t=> t==='profiles'? {select(){return {eq(){return {single(){return Promise.resolve({data:{encryption_key_enc: window.__noLegacy?null:'x', full_name:'Test', subscription_tier:window.__tier||'free', subscription_status:window.__tier&&window.__tier!=='free'?'active':'free'}})}}}}}} : builder(t),
  auth:{ getSession:async()=>({data:{session:{access_token:'t',user:{id:'u1'}}}}), signOut:async()=>{} } };
window._supabase=sb; window._currentUser={id:'u1'};
window.dispatchEvent(new CustomEvent('authReady',{detail:{}}));
import('/assets/js/nav-links.js').then(m=>m.mountRoleLinks(window._supabase,window._currentUser)).catch(()=>{});
`;
const GATE_STUB = `
import {encryptWithKey,decryptWithKey} from '/assets/js/vault/vault-crypto.js';
const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), 'AES-GCM', false, ['encrypt','decrypt']);
const s={userId:'u1',fingerprint:'AAAA-BBBB',open:async(sealed)=>sealed.plain,publicKeys:{enc:{},sign:null},sign:async()=>'sig',encrypt:t=>encryptWithKey(key,t),decrypt:p=>decryptWithKey(key,p)};
export const ensureVaultReady=async()=>s;
export const encrypt=t=>s.encrypt(t), decrypt=p=>s.decrypt(p);
export const decryptSafe=async p=>{try{return await s.decrypt(p)}catch{return null}};
export const isEncrypted=v=>{try{const p=JSON.parse(v);return typeof p.iv==='string'&&typeof p.ciphertext==='string'}catch{return false}};
export const lockVault=async()=>{}; export const hasUserKey=()=>true;
`;
const server = http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x'); let p=u.pathname;
  if(p==='/dashboard/auth-guard.js'){ res.setHeader('content-type','text/javascript'); return res.end(AUTH_STUB); }
  if(p==='/assets/js/vault/gate.js' && process.env.REAL_GATE!=='1'){ res.setHeader('content-type','text/javascript'); return res.end(GATE_STUB); }
  if(p==='/assets/js/gating.js'){ res.setHeader('content-type','text/javascript'); return res.end('export function applyGatingOnReady(){} export function applyMultipleGating(){}'); }
  if(p==='/.netlify/functions/get-or-create-vault-key'){ res.setHeader('content-type','application/json'); return res.end(JSON.stringify({key:KEY})); }
  if(p==='/.netlify/functions/genius-search'){ res.setHeader('content-type','application/json'); const q=u.searchParams.get('q'); return res.end(JSON.stringify({hits:[{result:{title:q+' One',primary_artist:{name:'Artist A'}}},{result:{title:q+' Two',primary_artist:{name:'Artist B'}}}]})); }
  if(p==='/.netlify/functions/youtube-search'){ res.setHeader('content-type','application/json'); return res.end(JSON.stringify({videoId:'vid'+(u.searchParams.get('q')||'').length})); }
  if(p==='/__sortable.js'){ res.setHeader('content-type','text/javascript'); return res.end(fs.readFileSync(SORTABLE)); }
  if(p.endsWith('/')) p+='index.html';
  const f=path.join(REPO,p);
  if(fs.existsSync(f)&&fs.statSync(f).isFile()){ const ext=path.extname(f); res.setHeader('content-type',{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}[ext]||'application/octet-stream'); return res.end(fs.readFileSync(f)); }
  res.statusCode=404; res.end('nf');
});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port; const BASE=`http://localhost:${PORT}`;

export async function launch({extraArgs=[]}={}){
  const browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-sandbox','--disable-gpu',...extraArgs]});
  return {browser,BASE,DB,server};
}
export async function newPage(browser,BASE,{hasUpdatedAt=true,db=null,mobile=false,tables=null,noLegacy=false}={}){
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push('pageerror: '+e.message)); page.on('console',m=>{ if(m.type()==='error' && !/ERR_FAILED/.test(m.text())) errors.push('console: '+m.text()); });
  await page.setRequestInterception(true);
  page.on('request',r=>{ const u=r.url();
    if(u.startsWith(BASE)) return r.continue();
    if(u.includes('sortablejs')) return r.respond({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(SORTABLE,'utf8')});
    return r.abort(); });
  await page.evaluateOnNewDocument((hasU,dbRows,tbl,nl)=>{ window.__db=dbRows||[]; window.__hasUpdatedAt=hasU; window.__tbl=tbl||{}; window.__noLegacy=nl; },hasUpdatedAt,db,tables,noLegacy);
  if(mobile) await page.setViewport({width:390,height:800,hasTouch:true,isMobile:true});
  return {page,errors};
}
