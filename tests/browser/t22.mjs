import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date(); const iso=now.toISOString(); const soon=new Date(now.getTime()+3*864e5).toISOString(); const ago=new Date(now.getTime()-5*864e5).toISOString();
const client={link_id:'L1',status:'active',started_at:iso,client_id:'c1',full_name:'Ana Client',email:'ana@example.com',subscription_tier:'call2',intake_status:'completed'};
const plain=o=>({plain:JSON.stringify(o)});
const copies=[
 {link_id:'L1',category:'checkins',source_id:'s1',source_created_at:iso,sealed:plain({v:1,created_at:iso,arousal:4,valence:7,sensory_load:3,emotion_words:['calm'],notes:'<b>quiet</b> walk'})},
 {link_id:'L1',category:'worksheets',source_id:'w1',source_created_at:iso,sealed:plain({v:1,type:'coping',title:'My coping plan',schema:1,data:{q1_feelings:'<i>tense</i>',skills:['walk','music'],empty:''},updated_at:iso})}];
const tables={therapist_profiles:[{user_id:'u1',display_name:'Jordan'}],my_clients:[client],
  my_client_keys:[{link_id:'L1',client_id:'c1',public_enc:{},public_sign:null,fingerprint:'CCCC-DDDD'}],
  my_client_sessions:[{id:'b1',link_id:'L1',client_id:'c1',event_type:'subscriber-session',scheduled_at:soon,completed_at:null,status:'scheduled'},
                      {id:'b2',link_id:'L1',client_id:'c1',event_type:'session',scheduled_at:ago,completed_at:null,status:'scheduled'}],
  shared_copies:copies,
  messages:[{id:'m1',link_id:'L1',sender_id:'c1',recipient_id:'u1',read_at:null,created_at:iso,sealed:plain({v:1,text:'See you soon'}),signature:'x'}]};
const P=await newPage(await browser.createBrowserContext(),BASE,{tables});
await P.page.evaluateOnNewDocument(()=>{ window.__rpc=(n,a)=>{ sessionStorage.setItem('__rpc',JSON.stringify({n,a})); return {error:null}; }; });
await P.page.goto(`${BASE}/therapist/client/?link=L1`,{waitUntil:'domcontentloaded'}); await P.page.waitForSelector('[role=tab]',{timeout:15000});
const txt=sel=>P.page.$eval(sel,e=>e.innerText);
let t=await P.page.evaluate(()=>document.getElementById('dashApp').innerText);
ok(/Ana Client/.test(t)&&/ana@example.com/.test(t)&&/2 sessions/.test(t)&&/Intake complete/.test(t),'header shows who, plan and intake status');
ok(/1 new/.test(await txt('#tab-messages')),'Messages tab shows the unread count');
t=await txt('#panel-overview');
ok(/Next session/i.test(t)&&/Monthly session/.test(t),'overview shows the next session');
ok(/1 new message/.test(t)&&/1 check-in/.test(t)&&/1 document/.test(t),'overview summarises messages and shared items');
await P.page.click('#showCode'); await sleep(500);
const sc=(await txt('#safetyCode')).trim(); console.log('code:',JSON.stringify(sc)); ok(/^[0-9 -]{20,}$/.test(sc),'safety code is a real code after unlock');
// tabs
await P.page.click('#tab-messages'); await sleep(900);
t=await txt('#panel-messages');
ok(/See you soon/.test(t)&&!!(await P.page.$('#panel-messages #mxForm')),'Messages tab shows the thread and a way to reply');
await P.page.click('#tab-shared'); await sleep(900);
t=await txt('#panel-shared');
ok(/1 check-in/.test(t)&&/<b>quiet<\/b> walk/.test(t),'Shared tab shows check-ins, notes as text');
ok(/My coping plan/.test(t)&&/Coping/.test(t),'Shared tab lists the shared document');
await P.page.click('.th-docbtn'); await sleep(200);
t=await txt('.th-docbody');
ok(/Q1 feelings/i.test(t)&&/<i>tense<\/i>/.test(t)&&/walk/.test(t)&&!/empty/i.test(t),'document opens read-only with tidy labels, empty answers skipped, text not markup');
ok(!(await P.page.$('.th-docbody input, .th-docbody textarea')),'documents cannot be edited by the therapist');
await P.page.click('#tab-sessions');
t=await txt('#panel-sessions');
ok(/Upcoming/.test(t)&&/Monthly session/.test(t)&&/Past/.test(t),'Sessions tab lists upcoming and past');
// keyboard
await P.page.focus('#tab-sessions'); await P.page.keyboard.press('ArrowRight'); await sleep(100);
ok(await P.page.$eval('#tab-overview',e=>e.getAttribute('aria-selected'))==='true','arrow keys move between tabs');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
// ended client: archive actions
const E=await newPage(await browser.createBrowserContext(),BASE,{tables:{...tables,my_clients:[{...client,status:'ended',ended_at:iso}],my_client_keys:[],my_client_sessions:[]}});
await E.page.evaluateOnNewDocument(()=>{ window.__rpc=(n,a)=>{ sessionStorage.setItem('__rpc',JSON.stringify({n,a})); return {error:null}; }; });
await E.page.goto(`${BASE}/therapist/client/?link=L1#overview`,{waitUntil:'domcontentloaded'}); await E.page.waitForSelector('#deleteRecords',{timeout:15000});
ok(/Ended/.test(await E.page.$eval('.th-head',e=>e.innerText)),'ended client is marked Ended');
await E.page.click('#deleteRecords'); await sleep(200);
ok(!(await E.page.evaluate(()=>sessionStorage.getItem('__rpc'))),'delete asks first');
await E.page.click('#cYes'); await sleep(600);
ok(JSON.parse((await E.page.evaluate(()=>sessionStorage.getItem('__rpc')))||'{}').n==='delete_ended_client_records','confirming deletes my records for that client');
// not found / not therapist
const X=await newPage(await browser.createBrowserContext(),BASE,{tables:{...tables,my_clients:[]}});
await X.page.goto(`${BASE}/therapist/client/?link=NOPE`,{waitUntil:'domcontentloaded'}); await X.page.waitForSelector('.ws-callout',{timeout:15000});
ok(/not found/i.test(await X.page.$eval('.ws-callout',e=>e.innerText)),'unknown client: plain message');
await browser.close(); server.close(); process.exit(fail?1:0);
