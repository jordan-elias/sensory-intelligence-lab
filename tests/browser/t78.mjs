// Therapist: sessions by month for invoicing. Reads only what the therapist already sees; CSV is made on the device.
import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const now=new Date(), at=(d,h)=>new Date(now.getFullYear(),now.getMonth(),d,h).toISOString();
const sess=[{link_id:'L1',scheduled_at:at(2,10),completed_at:at(2,11),event_type:'session',status:'scheduled'},{link_id:'L2',scheduled_at:at(5,9),event_type:'subscriber-session',status:'scheduled'},{link_id:'L2',scheduled_at:at(6,9),event_type:'session',status:'cancelled'}];
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{therapist_profiles:[{user_id:'u1',display_name:'T'}],my_clients:[{link_id:'L1',full_name:'Ana Client'},{link_id:'L2',full_name:'Ben Client'}],my_client_sessions:sess}}); const page=P.page;
await page.goto(`${BASE}/therapist/sessions/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#mCsv',{timeout:15000});
const t=()=>page.$eval('#dashApp',e=>e.innerText);
ok(/2 sessions/.test(await t())&&/Ana Client/.test(await t())&&/Ben Client/.test(await t()),'the month lists its sessions with client names');
ok(!/Cancelled/.test(await t()),'cancelled sessions are hidden by default');
await page.$eval('#mCan',e=>e.click()); await sleep(100); ok(/Cancelled/.test(await t()),'and shown when asked');
await page.$eval('#mPrev',e=>e.click()); await sleep(100); ok(/No sessions this month/.test(await t()),'the previous month is empty');
ok(/Sessions booked with you through Cal.com/.test(await t()),'the page says what it lists');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
