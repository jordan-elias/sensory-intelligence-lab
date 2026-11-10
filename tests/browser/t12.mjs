import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const THER={user_id:'th1',display_name:'Jordan Elias',bio:'Music therapist in Berlin.',booking_link:'https://cal.com/jordan',photo_path:null,accepting_clients:true,has_availability:true,is_default:true};

// ── client card ──
const A=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_directory:[THER],my_therapists:[]}});
await A.page.evaluateOnNewDocument(()=>{ window.__tier='call1';
  const f=window.fetch.bind(window);
  window.fetch=async(u,o)=>{ const s=String(u);
    if(s.includes('/.netlify/functions/link-therapist')){ const b=JSON.parse(o.body); if(b.consent_version!=='link-2.0') return new Response(JSON.stringify({error:'stale'}),{status:409}); window.__tbl.my_therapists.push({link_id:'L1',status:'active',started_at:new Date().toISOString(),...window.__tbl.therapist_directory[0]}); window.__linked=b; return new Response('{"ok":true}',{status:200}); }
    if(s.includes('/.netlify/functions/next-available')) return new Response('{"results":{}}',{status:200});
    if(s.includes('/.netlify/functions/end-therapist-link')){ window.__tbl.my_therapists.forEach(r=>r.status='ended'); window.__ended=JSON.parse(o.body); return new Response('{"ok":true}',{status:200}); }
    return f(u,o); }; });
await A.page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'}); await sleep(800);
const html=await A.page.evaluate(async()=>{ const d=document.createElement('div'); d.id='mt'; document.body.append(d);
  const m=await import('/assets/js/booking/therapist-picker.js'); const sb=window._supabase; const mt=await import('/assets/js/therapist/my-therapist.js');
  window.__mount=()=>mt.mountMyTherapist(d,{supabase:sb,profile:{subscription_tier:'free',subscription_status:'active'}});
  window.__after=()=>window.__mount();
  await m.mountChooser(d,sb,{onConnected:()=>window.__after()}); return d.innerText; });
ok(/choose your therapist/i.test(html)&&/Jordan Elias/.test(html),'any client sees the chooser and the therapist');
ok(!(await A.page.evaluate(()=>window.__linked)),'nothing is created until the client agrees');
await A.page.click('[data-choose]'); await sleep(200);
const vis=await A.page.$eval('#tpConsent',e=>e.innerText);
ok(/name, email, whether you have a Lab plan/.test(vis)&&/Nothing else is visible/.test(vis)&&/nothing can undo/.test(vis),'the visibility wording is shown before agreeing');
await A.page.click('#tpAgree'); await sleep(800);
const linked=await A.page.evaluate(()=>({sent:window.__linked,text:document.getElementById('mt').innerText}));
ok(linked.sent.consent_version==='link-2.0','agreeing sends the consent version');
ok(/Connected/.test(linked.text)&&/Book a session/.test(linked.text),'then shows the connected therapist and a booking button');
ok(await A.page.$eval('#mt a.btn',a=>a.href)==='https://cal.com/jordan','booking button uses the therapist\'s own link');
await A.page.click('#thEnd'); ok(!(await A.page.$eval('#thEndConfirm',e=>e.hidden)),'ending asks for confirmation first');
ok(!(await A.page.evaluate(()=>window.__ended)),'not ended yet');
await A.page.click('#thEndYes'); await sleep(800);
ok((await A.page.evaluate(()=>window.__ended)).link_id==='L1','confirming ends the link');
// a free user sees nothing
const hidden=await A.page.evaluate(async()=>{ const d=document.createElement('div'); document.body.append(d); const m=await import('/assets/js/therapist/my-therapist.js');
  await m.mountMyTherapist(d,{supabase:window._supabase,profile:{subscription_tier:'lab',subscription_status:'active'}}); return {hidden:d.hidden,html:d.innerHTML}; });
ok(hidden.hidden&&hidden.html==='','a lab-only user sees nothing about therapists');
ok(A.errors.length===0,'no page errors '+A.errors.join('|'));

// ── therapist profile page ──
const B=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_profiles:[{...THER,user_id:'u1'}]}});
B.page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url())});
await B.page.goto(`${BASE}/therapist/profile/`,{waitUntil:'domcontentloaded'});
await B.page.waitForSelector('#thForm',{timeout:15000});
ok(await B.page.$eval('#thName',e=>e.value)==='Jordan Elias','profile loads');
await B.page.$eval('#thName',e=>e.value=''); await B.page.type('#thName','J. Elias');
await B.page.$eval('#thLink',e=>e.value=''); await B.page.type('#thLink','http://insecure.example');
await B.page.click('#thSave'); await sleep(300);
ok(/https/.test(await B.page.$eval('#thMsg',e=>e.textContent))&&(await B.page.evaluate(()=>window.__tbl.therapist_profiles[0].booking_link))==='https://cal.com/jordan','a non-https booking link is refused');
await B.page.$eval('#thLink',e=>e.value=''); await B.page.type('#thLink','https://cal.com/j-elias');
await B.page.click('#thAccepting'); await B.page.type('#thBio',' Also teaches.');
await B.page.click('#thSave'); await sleep(500);
const row=await B.page.evaluate(()=>window.__tbl.therapist_profiles[0]);
ok(row.display_name==='J. Elias'&&row.booking_link==='https://cal.com/j-elias'&&row.accepting_clients===false&&/Also teaches/.test(row.bio)&&row.is_default===true,'edits are saved; no longer taking new clients');
// photo upload: big non-square image
const big=await B.page.evaluate(async()=>{ const c=document.createElement('canvas'); c.width=1600;c.height=900; const g=c.getContext('2d'); g.fillStyle='#c33';g.fillRect(0,0,1600,900); const b=await new Promise(r=>c.toBlob(r,'image/png')); const dt=new DataTransfer(); dt.items.add(new File([b],'me.png',{type:'image/png'})); const i=document.getElementById('thFile'); i.files=dt.files; i.dispatchEvent(new Event('change')); return b.size; });
await B.page.waitForFunction(()=>window.__tbl.therapist_profiles[0].photo_path,{timeout:10000});
const up=await B.page.evaluate(async()=>{ const p=window.__tbl.therapist_profiles[0].photo_path; const e=window.__storage.get(p); const bmp=await createImageBitmap(new Blob([e.bytes])); return {p,type:e.type,w:bmp.width,h:bmp.height,size:e.bytes.length}; });
ok(up.p.startsWith('u1/')&&up.type==='image/jpeg'&&up.w===512&&up.h===512,'photo is cropped square, resized to 512px and stored under the therapist\'s own folder');
await sleep(500);
ok(await B.page.$('.th-photo img')!==null,'photo shown on the page');
await B.page.click('#thDropPhoto'); await sleep(600);
ok((await B.page.evaluate(()=>({p:window.__tbl.therapist_profiles[0].photo_path,n:window.__storage.size})))&&true,'photo can be removed');
const gone=await B.page.evaluate(()=>({p:window.__tbl.therapist_profiles[0].photo_path,n:window.__storage.size}));
ok(gone.p===null&&gone.n===0,'removing deletes the file too');
const be=B.errors.filter(e=>!/Failed to load resource/.test(e)); ok(be.length===0,'no page errors B '+be.join('|'));

// non-therapist
const C=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_profiles:[]}});
await C.page.goto(`${BASE}/therapist/profile/`,{waitUntil:'domcontentloaded'}); await C.page.waitForSelector('.ws-callout',{timeout:15000});
ok(/for therapists/.test(await C.page.$eval('.ws-callout',e=>e.innerText)),'someone who is not a therapist gets a plain explanation');
await browser.close(); server.close(); process.exit(fail?1:0);
