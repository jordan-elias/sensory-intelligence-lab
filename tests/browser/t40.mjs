// Blackout poetry reads a real PDF in the browser with the vendored pdf.js (nothing is uploaded).
import {launch,newPage} from './harness.mjs';
import {writeFileSync,mkdtempSync} from 'fs'; import {tmpdir} from 'os'; import {join} from 'path';
const {browser,BASE,server}=await launch();
let fail=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
const P=await newPage(await browser.createBrowserContext(),BASE,{tables:{}}); const page=P.page;
// a minimal one-page PDF with a line of text
const text='Quiet rivers carry heavy stones toward the sea';
const objs=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const stream=`BT /F1 14 Tf 20 100 Td (${text}) Tj ET`; objs[3]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
let pdf='%PDF-1.4\n', offs=[]; objs.forEach((o,i)=>{ offs.push(pdf.length); pdf+=`${i+1} 0 obj\n${o}\nendobj\n`; });
const xref=pdf.length; pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const f=join(mkdtempSync(join(tmpdir(),'pdf-')),'page.pdf'); writeFileSync(f,pdf);
await page.goto(`${BASE}/experiments/#/blackout-poem`,{waitUntil:'domcontentloaded'}); await page.waitForSelector('#xpPaste');
await (await page.$('input[type=file]')).uploadFile(f);
await page.waitForFunction(()=>document.querySelectorAll('.xp-bw').length>0,{timeout:20000});
ok((await page.$$eval('.xp-bw',b=>b.map(x=>x.textContent).join(' ')))===text,'the words of the PDF page appear');
ok(await page.$eval('#xpPageNo',e=>+e.max)===1&&await page.$('#xpPageRandom')!==null,'a page picker is shown');
ok(P.errors.filter(e=>!/Failed to load resource/.test(e)).length===0,'no page errors '+P.errors.join('|'));
await browser.close(); server.close(); process.exit(fail?1:0);
