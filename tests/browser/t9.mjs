import {launch,newPage} from './harness.mjs';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const PASS='orange bicycle hums nine rivers';
const ctx=await browser.createBrowserContext();
await ctx.overridePermissions(BASE,['geolocation']);

// seed: an old-style check-in with plain columns and an old-key note
const seedPage=(await newPage(ctx,BASE)).page;
await seedPage.goto(`${BASE}/vault/`,{waitUntil:'domcontentloaded'});
const seeded=await seedPage.evaluate(async()=>{
  const cu=await import('/assets/js/crypto-utils.js');
  await cu.loadUserKeyFromBase64(btoa(String.fromCharCode(...new Array(32).fill(7))));
  const note=await cu.encrypt('old private note');
  return {id:'c-old',user_id:'u1',created_at:new Date(Date.now()-86400000).toISOString(),arousal:6,valence:7,sensory_load:3,emotion_words:['calm'],location_tag:'home',selected_notes:null,chord_name:null,notes:note,notes_encrypted_at:null,key_version:1};
});
await seedPage.close();

const {page,errors}=await newPage(ctx,BASE,{tables:{checkins:[seeded]}});
await page.evaluateOnNewDocument(()=>{ window.Chart=class{constructor(){} destroy(){} update(){}}; Chart.defaults={}; });
await page.setGeolocation({latitude:52.520008,longitude:13.404954});
await page.goto(`${BASE}/check-in/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('.vault-gate #newPass',{timeout:20000});
await page.type('#newPass',PASS); await page.type('#newConfirm',PASS);
await page.click('.vault-gate button[type=submit]');
await page.waitForSelector('#recoveryKey',{timeout:60000});
const RK=await page.$eval('#recoveryKey',e=>e.textContent.trim());
await page.type('#keyCheck',RK.slice(0,4)); await page.click('.vault-gate .vault-check input'); await sleep(200);
await page.click('#recoveryContinue');
await page.waitForSelector('[data-gate=go]',{timeout:30000}); await page.click('[data-gate=go]');
await page.waitForFunction(()=>!document.querySelector('.vault-gate'),{timeout:30000});
await sleep(1500);
let st=await page.evaluate(()=>window.__tbl.checkins);
ok(!!st[0].payload && st[0].arousal===null && st[0].notes===null && st[0].location_tag===null,'old check-in moved into an encrypted payload, plain columns emptied');
ok(!JSON.stringify(st).includes('old private note') && !JSON.stringify(st).includes('"calm"'),'no readable text left in the old row');
ok(/old private note/.test(await page.evaluate(async()=>{const s=await import('/assets/js/checkins/store.js'); const r=await s.load({sinceDays:null}); return r.map(x=>x.notes).join('|');})),'old note still readable after the move');

// new check-in with surroundings
await page.evaluate(()=>window.goToStep(3)); await sleep(300);
await page.click('#placeAddToggle'); await page.type('#placeName','Tiergarten bench');
await page.click('#placeLocate'); await page.waitForFunction(()=>/Location found/.test(document.getElementById('placeNote').textContent),{timeout:8000});
await page.click('#placeSave'); await sleep(600);
ok(await page.$eval('#placePicker .env-chip.selected',e=>e.textContent)==='Tiergarten bench','new place saved and selected');
for(const [k,v] of [['noise','2'],['crowd','1'],['light','direct']]) await page.click(`.env-chips[data-env="${k}"] .env-chip[data-v="${v}"]`);
const sunTxt=await page.$eval('#envSun',e=>e.textContent); ok(/Sun at this place right now/.test(sunTxt),'live sun reading shown: '+sunTxt);
await page.type('#checkinNotes','secret surroundings note');
await page.evaluate(()=>window.submitCheckin()); await sleep(1500);
st=await page.evaluate(()=>({c:window.__tbl.checkins,l:window.__tbl.locations}));
const newRow=st.c.find(r=>r.id!=='c-old');
ok(!!newRow && !!newRow.payload && newRow.valence===null && newRow.notes===null,'new check-in stored as one payload only');
const raw=JSON.stringify(st);
ok(!raw.includes('secret surroundings note') && !raw.includes('Tiergarten') && !raw.includes('52.52'),'note, place name and coordinates are not readable in the database');
ok(st.l.length===1 && !!st.l[0].payload && st.l[0].place_name===undefined,'place stored as encrypted payload');
const back=await page.evaluate(async()=>{const s=await import('/assets/js/checkins/store.js'); const r=await s.load({sinceDays:null}); const p=await s.listPlaces(); return {r:r.map(x=>({n:x.notes,env:x.env,pid:x.place_id})),p};});
const mine=back.r.find(x=>x.n==='secret surroundings note');
ok(mine && mine.env.noise===2 && mine.env.crowd===1 && mine.env.light==='direct' && mine.pid===back.p[0].id && Number.isFinite(mine.env.sun_elevation),'surroundings, place link and sun height round-trip');
ok(back.p[0].lat===52.52 && back.p[0].lng===13.4 && back.p[0].exact===false,'coordinates rounded to about 1 km by default');

// insights: add history then open the page
await page.evaluate(async()=>{ const s=await import('/assets/js/checkins/store.js'); const p=(await s.listPlaces())[0];
  const mk=(v,noise,crowd,light,pid)=>s.save({arousal:5,valence:v,sensory_load:4,emotion_words:[],place_id:pid,env:{noise,crowd,light,sun_elevation:30}});
  const cafe=await s.savePlace({name:'Busy cafe',kind:'social'});
  for(const v of [8,9,8]) await mk(v,1,1,'direct',p.id);
  for(const v of [3,4,3]) await mk(v,5,5,'dim',cafe);
});
await page.goto(`${BASE}/check-in/insights/`,{waitUntil:'domcontentloaded'});
await page.waitForSelector('.in-highlights li',{timeout:20000});
const hl=await page.$$eval('.in-highlights li',l=>l.map(x=>x.textContent));
ok(hl.some(t=>/noise/.test(t)),'insights show a noise pattern: '+hl[0]);
await page.select('#wNoise','quiet'); await page.select('#wCrowd','empty'); await sleep(300);
const first=await page.$eval('#results li strong',e=>e.textContent);
ok(first==='Tiergarten bench','"Where to go" puts the quiet, empty place first: '+first);
ok(await page.$$eval('.in-grid .in-cell',c=>c.length)===288,'sun-through-the-year grid drawn (12 x 24)');
await page.screenshot({path:'shots/insights.png',fullPage:true});
ok(errors.length===0,'no page errors '+errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
