// Social preview is the real revised Hero at 1200x630, with its original styles.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {existsSync} from 'node:fs';
import {root,build} from './build.mjs';
await build();
const directory=resolve(root,'dist');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let path=resolve(directory,'.'+new URL(req.url,'http://localhost').pathname);if(path!==directory&&!path.startsWith(directory+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:1200,height:630},reducedMotion:'reduce'});await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:resolve(root,'assets/social-preview.png')});}finally{await browser.close();await new Promise(r=>server.close(r));}
