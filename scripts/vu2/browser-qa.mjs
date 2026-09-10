// Explicitly requested static-repository QA. No deployment or provider calls.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=resolve(process.cwd()),out=resolve(process.env.VU_QA_OUTPUT||'../vu2-evidence/experience');
await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.split('/').some(s=>s.startsWith('.')))throw Error('private');if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const origin='http://127.0.0.1:'+server.address().port;const checks=[];
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const view of ['home','stock','discover','research','markets','screener','compare','strategies','signals','portfolio']){
 await page.goto(origin+'/vu2/?view='+view+'&ticker=NVDA');await page.locator('main footer').waitFor();
 if(await page.locator('h1').count()!==1)throw Error('missing heading '+view);
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('page overflow '+view+' '+width);
 if(view==='home'){if(await page.locator('a.row').count()!==5)throw Error('real scope missing');await page.getByRole('button',{name:'Suche',exact:true}).click();await page.getByRole('textbox',{name:'Suche',exact:true}).fill('NVDA');await page.getByRole('dialog').getByRole('link',{name:/NVDA/}).waitFor();await page.getByRole('button',{name:'Schließen'}).click();}
 if(view==='stock'){await page.getByRole('button',{name:'Max',exact:true}).click();if(await page.locator('.q-chart').count()!==1)throw Error('MAX chart missing');await page.getByRole('button',{name:'1J',exact:true}).click();}
 if(view==='discover'){if(await page.locator('.collection').count()!==3)throw Error('collections missing');await page.getByRole('link',{name:'Regeln im Screener bearbeiten'}).nth(1).click();await page.locator('main footer').waitFor();if(await page.getByRole('combobox',{name:'Kennzahl'}).inputValue()!=='revenueGrowth'||await page.getByRole('spinbutton').inputValue()!=='20')throw Error('recipe handoff lost');await page.goto(origin+'/vu2/?view=discover');await page.locator('main footer').waitFor();}
 if(view==='screener'){await page.getByRole('spinbutton').fill('999');await page.getByRole('button',{name:'Anwenden'}).click();await page.getByText('0 Treffer in 5 verfügbaren Unternehmen · kein Gesamtmarkt-Ranking').waitFor();}
 await page.screenshot({path:out+'/'+view+'-'+width+'.png',fullPage:true});checks.push({view,width,pass:true});
 }
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
 await writeFile(out+'/results.json',JSON.stringify({checks},null,2));console.log(JSON.stringify({passed:checks.length,output:out}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
