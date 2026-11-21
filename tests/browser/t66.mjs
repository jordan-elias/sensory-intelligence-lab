import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const iso=new Date().toISOString();
const client={link_id:'L1',status:'active',started_at:iso,client_id:'c1',full_name:'Ana Client',email:'ana@example.com',subscription_tier:'lab',intake_status:'completed',intake_received:true};
const plain=o=>({plain:JSON.stringify(o)});
const ws=(id,type,title,data)=>({link_id:'L1',category:'worksheets',source_id:id,source_created_at:iso,sealed:plain({v:1,type,title,schema:1,data,updated_at:iso})});
const copies=[
 {link_id:'L1',category:'intake',source_id:'i1',source_created_at:iso,sealed:plain({fields:{name:'Ana',pronouns:'she/her'},submitted_at:iso})},
 {link_id:'L1',category:'family',source_id:'f1',source_created_at:iso,sealed:plain({doc:{overview:'Grew up by the sea',members:[]},sent_at:iso})},
 ws('w1','grow','Change jobs',{goal:'Find calmer work',opt1_fit:'8'}),
 ws('w2','grow','Move house',{goal:'Be closer to friends'}),
 ws('w3','dear-man','Ask for a quiet desk',{d:'The office is loud',a:'A desk by the window'}),
 {link_id:'L1',category:'journal',source_id:'j1',source_created_at:iso,sealed:plain({v:1,kind:'journal',title:'A hard week',text:'It was loud and I was tired',created_at:iso,shared_at:iso})},
 {link_id:'L1',category:'checkins',source_id:'s1',source_created_at:iso,sealed:plain({v:1,created_at:iso,arousal:4,valence:7,sensory_load:3,emotion_words:['calm'],notes:'ok'})}];
const tables={therapist_profiles:[{user_id:'u1',display_name:'Jordan'}],my_clients:[client],
  my_client_keys:[{link_id:'L1',client_id:'c1',public_enc:{},public_sign:null,fingerprint:'CCCC-DDDD'}],my_client_sessions:[],shared_copies:copies,messages:[]};
const P=await newPage(await browser.createBrowserContext(),BASE,{tables});
await P.page.goto(`${BASE}/therapist/client/?link=L1#shared`,{waitUntil:'domcontentloaded'}); await P.page.waitForSelector('[role=tab]',{timeout:15000}); await sleep(1800);
const txt=sel=>P.page.$eval(sel,e=>e.innerText);
const tabs=await P.page.$$eval('[role=tab]',b=>b.map(x=>x.dataset.tab));
ok(tabs.join()==='overview,messages,folder,notes,sessions','tabs: one Folder next to Messages (no separate Shared / Intake)');
ok(await P.page.$eval('#tab-folder',e=>e.getAttribute('aria-selected'))==='true','old #shared link opens the Folder');
let t=await txt('#folderIndex');
ok(/Intake form\s*Received/.test(t)&&/Family history\s*Received/.test(t)&&/3 documents/.test(t)&&/1 check-in/.test(t),'contents list: intake, family history, worksheets, check-ins');
t=await txt('#panel-folder');
ok(/she\/her/.test(t)&&/Grew up by the sea/.test(t),'intake form and family history are in the folder');
ok(/GROW \(2\)/.test(t)&&/DEAR MAN \(1\)/.test(t),'worksheets are grouped by type with counts');
ok(/Journal entries/.test(t)&&/A hard week/.test(t),'a shared journal entry is listed in its own group');
await P.page.$$eval('#journalList .th-docbtn',b=>b[0].click()); await sleep(150);
ok(/It was loud and I was tired/.test(await txt('.th-journalbody')),'and opens to the full text, read-only');
ok(/1 entry shared/.test(await txt('#folderIndex')),'the contents list counts journal entries');
ok(/Change jobs/.test(t)&&/Ask for a quiet desk/.test(t),'documents are listed by title');
await P.page.click('.th-docbtn'); await sleep(200);
ok(/Find calmer work/.test(await txt('.th-docbody')),'a worksheet opens read-only inside the folder');
ok(!(await P.page.$('#panel-folder input, #panel-folder textarea')),'nothing in the folder can be edited');
await P.page.click('#tab-messages'); await sleep(500);
ok(await P.page.$('#panel-messages #mxForm')!==null,'private messaging is still its own tab');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
ok(/This week/.test(await page.$eval('#folder-week',e=>e.innerText)),'the folder starts with a This week summary');
await browser.close(); server.close(); process.exit(fail?1:0);
