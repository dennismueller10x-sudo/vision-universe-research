import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {documentRecorder} from '../delivered-document.mjs';
const require=createRequire(import.meta.url),pw=require(process.env.PLAYWRIGHT_PATH || 'playwright');
for(const engine of ['chromium','webkit'])test(engine+' keeps original gate response through document replacement, five consecutive runs',async()=>{
 const documents=documentRecorder();
 const mask='<form id="research-access-form"></form><script type="application/json" id="research-access-settings">{}</script>';
 const original=Buffer.from('<!doctype html>'+mask+'<script>addEventListener("load",()=>setTimeout(()=>{document.open();document.write("<!doctype html><h1>Replacement application</h1>");document.close();},0));</script>');
 const server=createServer((req,res)=>{const body=req.url==='/bare'?Buffer.from('<!doctype html><h1>Unguarded</h1>'):original;res.setHeader('content-type','text/html');documents.record(res,body);res.end(body);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await pw[engine].launch();
 try{
  for(let attempt=1;attempt<=5;attempt++){
   const contexts=await Promise.all(Array.from({length:5},()=>browser.newContext()));
   try { await Promise.all(contexts.map(async context=>{
    const page=await context.newPage(),response=await page.goto(base);
    await page.getByRole('heading',{name:'Replacement application'}).waitFor();
    const html=documents.read(response);assert.equal(html,original.toString());
    assert(html.includes('research-access-settings')&&html.includes('research-access-form'));
    assert.equal(await page.locator('#research-access-form').count(),0,'DOM was replaced');
    const bare=await page.goto(base+'/bare');const unguarded=documents.read(bare);
    assert(!unguarded.includes('research-access-settings')&&!unguarded.includes('research-access-form'),'unguarded response cannot pass');
   })); } finally {await Promise.all(contexts.map(c=>c.close()));}
   console.log(JSON.stringify({engine,attempt,contexts:5,guarded:true,unguardedRejected:true,pass:true}));
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
