import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const now=new Date().toISOString();
const tomorrow=new Date(Date.now()+86400000).toISOString();
async function run(therapists,tier='call1',directory=[]){
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{my_therapists:therapists,bookings:[],therapist_directory:directory}});
  await P.page.evaluateOnNewDocument((tm)=>{ const f=window.fetch; window.fetch=async (u,o)=>{ const s=String(u);
    if(s.includes('/.netlify/functions/next-available')) return new Response(JSON.stringify({results:{t1:{next:tm},t2:{next:null}}}),{status:200});
    if(s.includes('/.netlify/functions/link-therapist')){ sessionStorage.setItem('linked',o.body); return new Response('{"ok":true}',{status:200}); }
    return f(u,o); }; },tomorrow);
  await P.page.evaluateOnNewDocument(t=>{window.__tier=t;},tier);
  await P.page.goto(`${BASE}/booking/`,{waitUntil:'domcontentloaded'}); await sleep(2000);
  const out=await P.page.evaluate(()=>({text:document.getElementById('bookingRoot').innerText,
    link:[...document.querySelectorAll('#bookingRoot a[target=_blank]')].map(a=>a.href),
    calls:JSON.stringify(window.Cal&&window.Cal.ns&&window.Cal.ns['subscriber-session']?window.Cal.ns['subscriber-session'].q.map(a=>[...a]):[]),
    hasCal:!!document.getElementById('cal-subscriber')?.classList.contains('cal-embed-wrap')}));
  out.page=P;
  return {...out,errors:P.errors.filter(e=>!/Failed to load resource|ERR_FAILED/.test(e))};
}
const T=(o)=>({link_id:'L1',status:'active',user_id:'t1',display_name:'Dr Rivera',has_availability:true,booking_link:'https://cal.com/rivera/monthly',...o});
let r=await run([T({})]);
ok(/Monthly session with Dr Rivera/i.test(r.text)&&r.calls.includes('rivera/monthly')&&!r.calls.includes('jordan-elias'),'Cal.com link: embeds the therapist\'s own calendar');
r=await run([T({booking_link:'https://calendly.com/rivera/x'})]);
ok(r.link.includes('https://calendly.com/rivera/x')&&/own page/.test(r.text)&&!r.hasCal,'other booking site: opens as a link in a new tab');
r=await run([T({accepting_clients:false})]);
ok(r.calls.includes('rivera/monthly')&&/Your therapist/i.test(r.text)&&/Dr Rivera/.test(r.text),'not taking new clients: an existing client still books, and sees their therapist card');
r=await run([T({booking_link:null})]);
ok(/not added a booking link/.test(r.text),'no link yet: plain message');
const DIR=[{user_id:'t1',display_name:'Dr Rivera',bio:'Music therapist, Berlin.',booking_link:'https://cal.com/rivera/monthly',accepting_clients:true,is_default:true},{user_id:'t2',display_name:'Sam Okoye',bio:'Sound and trauma work.',booking_link:'https://calendly.com/sam/x',accepting_clients:true}];
r=await run([],'call1',DIR);
ok(/Choose your therapist/i.test(r.text)&&/Dr Rivera/.test(r.text)&&/Sam Okoye/.test(r.text)&&/Music therapist, Berlin/.test(r.text),'not connected: every available therapist is listed with name and bio');
ok(/Tomorrow, \d\d:\d\d/.test(r.text)&&/See availability/.test(r.text),'next available time shown, with a prompt when unknown');
ok(!r.calls.includes('jordan-elias')&&!r.hasCal,'not connected: no shared practice calendar any more');
await r.page.page.click('[data-choose="t2"]'); await sleep(300);
ok(/Connect with Sam Okoye/.test(await r.page.page.evaluate(()=>document.getElementById('tpConsent').innerText))&&/name, email, subscription/i.test(await r.page.page.evaluate(()=>document.getElementById('tpConsent').innerText)),'choosing shows what the therapist will see before connecting');
await r.page.page.click('#tpAgree'); await sleep(900);
ok(JSON.parse(await r.page.page.evaluate(()=>sessionStorage.getItem('linked')||'{}')).therapist_id==='t2','agreeing connects with the chosen therapist');
r=await run([],'call1',[]);
ok(/No therapist is taking new clients/.test(r.text),'no therapists available: says so');
r=await run([T({})],'lab');
ok(!/Monthly session with Dr Rivera/i.test(r.text),'Lab members are not sent to a therapist calendar');
ok(r.errors.length===0,'no page errors '+r.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
