import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); const now=new Date().toISOString();
const link={link_id:'L1',status:'active',started_at:now,user_id:'t1',display_name:'Jordan Elias'};
async function run(tables){ const P=await newPage(await browser.createBrowserContext(),BASE,{tables}); await P.page.goto(`${BASE}/messages/`,{waitUntil:'domcontentloaded'}); await sleep(1500); return {t:await P.page.evaluate(()=>document.getElementById('msgApp').innerText),P}; }
let r=await run({my_therapists:[link],my_therapist_keys:[{link_id:'L1',therapist_id:'t1',public_enc:{},public_sign:null,fingerprint:'AAAA-ZZZZ'}],messages:[{id:'m1',link_id:'L1',sender_id:'t1',recipient_id:'u1',read_at:null,created_at:now,sealed:{plain:JSON.stringify({v:1,text:'See you Tuesday'})},signature:'x'}]});
ok(/Jordan Elias/.test(r.t)&&/See you Tuesday/.test(r.t),'client sees the conversation with their therapist');
ok(!!(await r.P.page.$('#mxForm')),'and can write');
r=await run({my_therapists:[],my_therapist_keys:[],messages:[]});
ok(/No therapist connected/.test(r.t),'no therapist: plain explanation');
r=await run({my_therapists:[link],my_therapist_keys:[],messages:[]});
ok(/not finished setting up/.test(r.t)&&!(await r.P.page.$('#mxForm')),'therapist without a vault: messaging unavailable, nothing sent');
await browser.close(); server.close(); process.exit(fail?1:0);
