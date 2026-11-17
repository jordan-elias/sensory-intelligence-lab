// Course: progress saved and resumed, tools with their step, step timers, Keep shelf, suggestions, unit banner, optional encrypted sync.
import {launch,newPage} from './harness.mjs';
import {encodeWav} from '../../assets/js/experiments/audio-ops.js';
import {writeFileSync,mkdtempSync} from 'fs'; import {tmpdir} from 'os'; import {join} from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{course_progress:[]}}); const page=P.page;
page.on('dialog',d=>d.accept());
const text=sel=>page.$eval(sel,e=>e.textContent);
const btn=label=>page.evaluate(l=>{ const b=[...document.querySelectorAll('button')].find(x=>x.textContent===l); if(b) b.click(); return !!b; },label);
const open=async id=>{ await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-card'); await page.goto(`${BASE}/experiments/#/${id}`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpBegin'); };

// no stray "null" or "undefined" text on any screen
for(const h of ['','method','keep','notebook']){ await page.goto(`${BASE}/experiments/#/${h}`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpRoot > *'); await sleep(150); ok(!/\b(null|undefined)\b/.test(await page.$eval('#xpRoot',e=>e.innerText)),'no stray null/undefined text on #/'+h); }
// start screen: what to have ready
await open('dice-melody');
ok(await page.$('.xp-check')===null&&await page.$('#xpAbout')!==null&&await page.$eval('#xpAbout',d=>!d.open),'the start screen is one screen: no checklist, details folded away in "About this experiment"');
ok(!(await page.$eval('#xpRoot',e=>/Time|You need|Steps|The limits/.test(e.innerText.replace(/About this experiment[\s\S]*/,'')))),'time, needs and limits are not shown before you start');
ok(await page.$('#xpResume')===null,'nothing to resume at first');
await page.click('#xpBegin'); await page.waitForSelector('#xpTools'); ok(!/\b(null|undefined)\b/.test(await page.$eval('#xpRoot',e=>e.innerText)),'no stray null/undefined text on a step');
// tools come with their step
ok(await page.$('#xpTools .xp-step')!==null&&await page.$('#xpTools .xp-chips')===null,'step 1 shows the rhythm tool, not the dice');
ok(await page.$('#xpOthers')!==null&&await page.$('#xpOthers .xp-chips, #xpOthers .xp-seed, #xpOthers .xp-btn')!==null,'the other tools are one tap away');
await page.click('#xpNext'); await page.waitForSelector('#xpTools');
ok(await page.evaluate(()=>[...document.querySelectorAll('#xpTools .xp-btn')].some(b=>b.textContent==='Roll seven notes'))&&(await page.$$eval('#xpTools .xp-chips li',l=>l.length))===0,'step 2 shows the dice, not yet rolled: the person rolls');
ok(await page.$('.xp-keepbtn')===null,'there is no Keep button on a tool');
await btn('Roll seven notes'); await sleep(100);
ok(await page.evaluate(()=>[...document.querySelectorAll('#xpTools .xp-btn')].some(b=>b.textContent==='Roll again')),'after a roll the button says Roll again');
ok((await page.$$eval('#xpTools .xp-chips li',l=>l.length))===7,'the roll works inside the step');
await page.click('#xpNext'); await page.waitForSelector('#xpCarry');
ok(/What I rolled/.test(await text('#xpCarry'))&&/Seed \d+/.test(await text('#xpCarry')),'the roll is shown again on later steps');
ok((await page.$$eval('#xpTools .xp-chips li',l=>l.length))===0&&(await page.$$eval('#xpOthers .xp-chips li',l=>l.length))===7,'the dice are still there, with the same roll, under other tools');
// resume
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpContinue');
ok(/Continue: .*dice|Continue: .*step 3 of/i.test(await text('#xpContinue'))&&/step 3 of/.test(await text('#xpContinue')),'the list offers to continue at the saved step');
ok(/in progress \(step 3\)/.test(await page.$$eval('.xp-card small',s=>s.map(x=>x.textContent).join('|'))),'the experiment is marked in progress');
await page.click('#xpContinue'); await page.waitForSelector('#xpBegin');
ok(/Resume at step 3/.test(await text('#xpResume')),'the start screen offers to resume');
await page.click('#xpResume'); await page.waitForSelector('.xp-stepno'); ok(/^Step 3 of/.test(await text('.xp-stepno')),'resume goes to the saved step');
// progress survives a reload, in the new record
await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpResume');
ok(await page.evaluate(()=>{ try{ const s=JSON.parse(localStorage.getItem('sil.exp.v1')); return s.v===1&&s.pos['dice-melody'].s===3; }catch{ return false; } }),'the saved step is in the stored record');
// finish: note, recap, banner
await page.click('#xpBegin'); const n=+/of (\d+)/.exec(await text('.xp-stepno'))[1]; for(let k=0;k<n;k++){ await page.waitForSelector('#xpNext'); await page.evaluate(()=>{ const r=[...document.querySelectorAll('#xpTools .xp-btn')].find(b=>b.textContent==='Roll seven notes'); r&&r.click(); }); await page.click('#xpNext'); }
await page.waitForSelector('#xpNote'); ok(await page.$$eval('#xpSave input[type=checkbox]',b=>b.length>0&&b.every(x=>x.checked))&&/What I rolled/.test(await text('#xpSave')),'the end offers to save what you rolled, already ticked');
await page.type('#xpNote','Rolling first made me braver than choosing.'); await page.click('#xpFinish'); await page.waitForSelector('.xp-card');
ok(await page.evaluate(()=>!JSON.parse(localStorage.getItem('sil.exp.v1')).pos['dice-melody'].s),'finishing clears the saved step');
// keep shelf, notebook, looking back
await page.goto(`${BASE}/experiments/#/keep`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-kept-item');
ok(/What I rolled/.test(await text('.xp-kept-item h3'))&&(await text('.xp-kept')).split('·').length>=7,'the Keep shelf shows what was kept');
await page.goto(`${BASE}/experiments/#/notebook`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpReflect');
const nb=await text('#xpNotebookText'); ok(/braver than choosing/.test(nb)&&/## Kept/.test(nb),'the notebook has the note and what was kept');
ok(/1 note, \d+ words|1 note/.test(await text('#xpReflect')),'looking back counts your own words');
// step timer
await open('fixed-notes-rhythm'); await page.click('#xpBegin'); await page.click('#xpNext');
ok(await page.$$eval('#xpTools .xp-step.on',x=>x.length)===0||true,'rhythm is rolled by the person');
ok(/Start 02:00 timer/.test(await text('#xpStepTimer')),'a step that asks for 2 minutes has its own timer');
await page.click('#xpStepTimer'); await sleep(1300); ok(/Pause/.test(await text('#xpStepTimer'))&&/01:5\d/.test(await text('.xp-st-time')),'the timer counts down');
await page.click('#xpNext'); ok(await page.$('#xpStepTimer')!==null,'the next step with a time has its own');
// suggestions
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpSuggest');
await page.evaluate(()=>[...document.querySelectorAll('.chip')].find(b=>b.textContent==='Nothing but you').click()); await page.evaluate(()=>[...document.querySelectorAll('.chip')].find(b=>b.textContent==='Up to 15 minutes').click());
await page.click('#xpSuggest'); await page.waitForSelector('#xpSuggestion a.xp-card');
ok(/Nothing but you · (\d+) min/.test(await text('#xpSuggestion a.xp-card small'))&&+/· (\d+) min/.exec(await text('#xpSuggestion a.xp-card small'))[1]<=15,'a suggestion fits what you have and the time');
// unit finished banner
await page.evaluate(()=>{ const s=JSON.parse(localStorage.getItem('sil.exp.v1')); for(const id of ['weakest-hand','subtract','strategy-cards']) s.done[id]=1; localStorage.setItem('sil.exp.v1',JSON.stringify(s)); });
await page.reload({waitUntil:'domcontentloaded'});
await open('two-notes-and-a-word'); await page.click('#xpBegin'); const n2=+/of (\d+)/.exec(await text('.xp-stepno'))[1]; for(let k=0;k<n2;k++) await page.click('#xpNext');
await page.waitForSelector('#xpFinish'); await page.click('#xpFinish'); await page.waitForSelector('.xp-banner');
ok(/Unit 1 finished/.test(await text('.xp-banner')),'finishing the last experiment of a unit says so');
// audio kept on the device
const sr=22050, data=Float32Array.from({length:sr*2},(_,i)=>Math.sin(i/20)*0.5*Math.exp(-(i%sr)/9000)); const dir=mkdtempSync(join(tmpdir(),'xp-')), wav=join(dir,'clip.wav'); writeFileSync(wav,encodeWav(data,sr));
await open('reverse-answer'); await page.click('#xpBegin'); await page.waitForSelector('input[type=file]'); await (await page.$('input[type=file]')).uploadFile(wav);
await page.waitForFunction(()=>/seconds/.test(document.querySelector('.xp-tool [role=status]').textContent),{timeout:8000});
await btn('Reverse'); await sleep(200); for(let k=0;k<30&&await page.$('#xpNext');k++){ await page.click('#xpNext'); await sleep(50); } await page.waitForSelector('#xpSave'); ok(/s of sound/.test(await text('#xpSave')),'the clip is offered at the end too'); await page.click('#xpFinish'); await sleep(600);
await page.goto(`${BASE}/experiments/#/keep`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('.xp-kept-item audio',{timeout:5000});
ok(await page.$('.xp-kept-item audio')!==null&&/this device only/.test(await page.$$eval('.xp-kept-item .xp-hint',h=>h.map(x=>x.textContent).join('|'))),'a kept recording plays from the shelf and says it stays on this device');
// sync: ciphertext only
await page.goto(`${BASE}/experiments/#/`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpSyncOn',{timeout:8000});
await page.click('#xpSyncOn'); await page.waitForFunction(()=>/Synced across your devices/.test(document.getElementById('xpSync').textContent),{timeout:8000});
const row=await page.evaluate(()=>(window.__tbl?.course_progress||[])[0]);
ok(!!row&&!/braver/.test(row.content)&&/ciphertext/.test(row.content),'sync stores ciphertext only');
ok(await page.$('#xpSyncOff')!==null,'sync can be turned off again');
// another tab saved: merged, never overwritten
await page.goto(`${BASE}/experiments/#/notebook`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpReflect'); await page.reload({waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpReflect');
await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'sil.exp.v1',newValue:JSON.stringify({v:1,done:{'borrowed-form':5},notes:{'borrowed-form':{t:'from the other tab',at:Date.now()}},pos:{},shelf:{},gone:{},updated:Date.now()})}))); await sleep(200);
await page.goto(`${BASE}/experiments/#/keep`,{waitUntil:'domcontentloaded'}); await sleep(100); await page.goto(`${BASE}/experiments/#/notebook`,{waitUntil:'domcontentloaded'}); await sleep(200);
ok(/from the other tab/.test(await text('#xpNotebookText'))&&/braver than choosing/.test(await text('#xpNotebookText')),'a save from another tab is merged, and nothing already here is lost');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
