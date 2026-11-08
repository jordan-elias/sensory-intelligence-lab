import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const L={link_id:'L1',status:'active',started_at:new Date().toISOString(),display_name:'Jordan Elias',bio:'',booking_link:null,photo_path:null};
async function run(keys){
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{my_therapists:[L],therapist_directory:[],sharing_preferences:[],shared_copies:[],my_therapist_keys:keys}});
  await P.page.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'}); await sleep(800);
  const r=await P.page.evaluate(async()=>{ const d=document.createElement('div'); document.body.append(d);
    const m=await import('/assets/js/therapist/my-therapist.js');
    await m.mountMyTherapist(d,{supabase:window._supabase,profile:{subscription_tier:'call1',subscription_status:'active'}});
    await new Promise(r=>setTimeout(r,800));
    const en=d.querySelector('#shEnable'); return {text:d.innerText, exists:!!en, checked:en?.checked, disabled:en?.disabled, notesDisabled:d.querySelector('#shNotes')?.disabled, copies:window.__tbl.shared_copies.length, prefs:window.__tbl.sharing_preferences.length}; });
  return {r,errors:P.errors};
}
const a=await run([{link_id:'L1',therapist_id:'th1',public_enc:{},fingerprint:'x'}]);
ok(a.r.exists&&!a.r.checked&&!a.r.disabled,'switch is off by default and usable when the therapist has a vault');
ok(/Private/.test(a.r.text)&&!/Shared\b(?! with)/.test(a.r.text.replace(/Sharing with/,'')),'state reads Private');
ok(a.r.notesDisabled,'notes option disabled while sharing is off');
ok(/only check-ins are shared/i.test(a.r.text)&&/cannot undo/.test(a.r.text),'wording explains scope and limits');
ok(a.r.copies===0&&a.r.prefs===0,'viewing the card creates nothing');
const b=await run([]);
ok(b.r.disabled&&/not finished setting up/.test(b.r.text),'no therapist vault: switch disabled with an explanation');
ok(a.errors.length===0&&b.errors.length===0,'no page errors '+a.errors.concat(b.errors).join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
