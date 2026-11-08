import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const now=new Date().toISOString();
async function run(therapists,tier='call1'){
  const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{my_therapists:therapists,bookings:[]}});
  await P.page.evaluateOnNewDocument(t=>{window.__tier=t;},tier);
  await P.page.goto(`${BASE}/booking/`,{waitUntil:'domcontentloaded'}); await sleep(2000);
  const out=await P.page.evaluate(()=>({text:document.getElementById('bookingRoot').innerText,
    link:[...document.querySelectorAll('#bookingRoot a[target=_blank]')].map(a=>a.href),
    calls:JSON.stringify(window.Cal&&window.Cal.ns&&window.Cal.ns['subscriber-session']?window.Cal.ns['subscriber-session'].q.map(a=>[...a]):[]),
    hasCal:!!document.getElementById('cal-subscriber')?.classList.contains('cal-embed-wrap')}));
  return {...out,errors:P.errors.filter(e=>!/Failed to load resource|ERR_FAILED/.test(e))};
}
const T=(o)=>({link_id:'L1',status:'active',user_id:'t1',display_name:'Dr Rivera',has_availability:true,booking_link:'https://cal.com/rivera/monthly',...o});
let r=await run([T({})]);
ok(/Monthly session with Dr Rivera/i.test(r.text)&&r.calls.includes('rivera/monthly')&&!r.calls.includes('jordan-elias'),'Cal.com link: embeds the therapist\'s own calendar');
r=await run([T({booking_link:'https://calendly.com/rivera/x'})]);
ok(r.link.includes('https://calendly.com/rivera/x')&&/own page/.test(r.text)&&!r.hasCal,'other booking site: opens as a link in a new tab');
r=await run([T({has_availability:false})]);
ok(/not taking session bookings/.test(r.text)&&!r.hasCal&&r.link.length===0,'availability off: message instead of calendar');
r=await run([T({booking_link:null})]);
ok(/not added a booking link/.test(r.text),'no link yet: plain message');
r=await run([]);
ok(/Connect with your therapist/i.test(r.text)&&r.calls.includes('jordan-elias/subscriber-session'),'not connected: prompt, practice calendar still works');
r=await run([T({})],'lab');
ok(!/Monthly session with Dr Rivera/i.test(r.text),'Lab members are not sent to a therapist calendar');
ok(r.errors.length===0,'no page errors '+r.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
