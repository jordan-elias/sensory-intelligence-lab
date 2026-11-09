// Subscribe page: a therapist must be chosen (and available) before the session plans can be started.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const {page}=await newPage(await browser.createBrowserContext(),BASE,{});
await page.goto(`${BASE}/subscribe/`,{waitUntil:'domcontentloaded'}); await sleep(1500);
async function state(links,dir){
  return page.evaluate(async(links,dir)=>{
    const t=r=>({select(){return t2(r)}}); const t2=r=>{ const b={in(){return b},limit(){return b},then(res){res({data:r,error:null})}}; return b; };
    window._supabase={...window._supabase,from:n=>n==='my_therapists'?t(links):n==='therapist_directory'?t(dir):window._supabase.__orig(n)};
    ['call1','call2'].forEach(x=>{const c=document.getElementById('cta-'+x); c.className='plan-cta primary'; c.disabled=false; c.textContent='Get started';});
    await window.__silLoadGate();
    return {gate:document.getElementById('therapistGate').innerText, c1:document.getElementById('cta-call1').textContent, c1d:document.getElementById('cta-call1').disabled, lab:document.getElementById('cta-lab').textContent};
  },links,dir);
}
const a=await state([],[]);
ok(/No therapist is taking new clients/.test(a.gate)&&a.c1==='No therapist available'&&a.c1d,'nobody accepting: session plans cannot be started');
const b=await state([],[{user_id:'t1'}]);
ok(/Choose your therapist first/.test(b.gate)&&b.c1==='Choose a therapist first'&&!b.c1d,'someone accepting but none chosen: asks to choose first');
ok(b.lab===a.lab,'Lab plan is not affected');
const c=await state([{link_id:'l1',status:'pending',display_name:'Dr Sam'}],[{user_id:'t1'}]);
ok(/Dr Sam/.test(c.gate)&&/Choose someone else/.test(c.gate)&&c.c1==='Get started','chosen (pending): plans open and the choice is shown');
await browser.close(); server.close(); process.exit(fail?1:0);
