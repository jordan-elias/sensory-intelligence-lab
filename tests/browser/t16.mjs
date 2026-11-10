import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date(); const soon=new Date(now.getTime()+3*864e5).toISOString();
const clients=[
 {link_id:'L1',status:'active',started_at:now.toISOString(),client_id:'c1',full_name:'Ana Client',email:'ana@example.com',subscription_tier:'lab',intake_status:'completed'},
 {link_id:'L3',status:'active',started_at:now.toISOString(),client_id:'c3',full_name:'Cy Quiet',email:'cy@example.com',subscription_tier:'free',intake_status:null},
 {link_id:'L2',status:'ended',started_at:now.toISOString(),ended_at:now.toISOString(),archived_at:null,client_id:'c2',full_name:'Ben Past',email:'ben@example.com',subscription_tier:'lab'}];
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_profiles:[{user_id:'u1',display_name:'Jordan Elias'}],my_clients:clients,
  my_client_sessions:[{id:'b1',link_id:'L1',client_id:'c1',event_type:'subscriber-session',scheduled_at:soon,completed_at:null,status:'scheduled'}],
  shared_copies:[{link_id:'L1',category:'checkins'},{link_id:'L1',category:'worksheets'},{link_id:'L2',category:'checkins'}],
  messages:[{id:'m1',link_id:'L1',sender_id:'c1',recipient_id:'u1',read_at:null}]}});
await P.page.goto(`${BASE}/therapist/`,{waitUntil:'domcontentloaded'}); await P.page.waitForSelector('.th-client',{timeout:15000});
const t=await P.page.evaluate(()=>document.getElementById('dashApp').innerText);
ok(/Ana Client/.test(t)&&/Lab member/.test(t)&&/Intake complete/.test(t),'active client with plan and intake status');
ok(/Next:/.test(t),'shows the next session');
ok(/1 new message/.test(t),'shows unread messages');
ok(/2 shared items/.test(t),'shows how many items were shared');
ok(/Cy Quiet/.test(t)&&/No session booked/.test(t)&&/Nothing shared/.test(t),'a client with nothing yet says so plainly');
ok(/Ben Past/.test(t)&&/Ended/.test(t)&&!/Next:/.test(t.split('Archive')[1]),'ended client is in the archive without a next session');
const hrefs=await P.page.$$eval('.th-client-link',as=>as.map(a=>a.getAttribute('href')));
ok(hrefs.includes('/therapist/client/?link=L1')&&hrefs.length===3,'every card opens that client\'s page');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
const N=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_profiles:[]}});
await N.page.goto(`${BASE}/therapist/`,{waitUntil:'domcontentloaded'}); await N.page.waitForSelector('.ws-callout',{timeout:15000});
ok(/for therapists/.test(await N.page.$eval('.ws-callout',e=>e.innerText)),'a non-therapist gets a plain explanation');
await browser.close(); server.close(); process.exit(fail?1:0);
