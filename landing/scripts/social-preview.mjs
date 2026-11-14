// Social preview (og:image, 1200 × 630): the real hero of the built start page, headline and phone on white with the
// lime circle. Run after a change to the hero: node scripts/social-preview.mjs  → assets/social-preview.png
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {existsSync} from 'node:fs';
import {root,build} from './build.mjs';
const directory=resolve(root,'tests/output/social-preview');
await build({output:directory});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{try{let path=resolve(directory,'.'+new URL(req.url,'http://localhost').pathname);if(path!==directory&&!path.startsWith(directory+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
try{
  // The hero is laid out for 1440 px; a device scale of 5/6 turns the 1440 × 756 view into exactly 1200 × 630 pixels.
  const page=await browser.newPage({viewport:{width:1440,height:756},deviceScaleFactor:5/6,reducedMotion:'reduce'});
  await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
  // Presentation only, on the rendered page: keep brand, badge, headline, lead and the stage; drop navigation and buttons.
  await page.evaluate(()=>{
    for(const e of document.querySelectorAll('.nls,.bar .soon,.bar .cta,.heroX .acts,.heroX .badges,.dock,.skip'))e.style.display='none';
    const bar=document.querySelector('.bar');bar.style.background='none';bar.style.boxShadow='none';bar.style.backdropFilter='none';
    const hero=document.querySelector('.heroX');hero.style.paddingTop='128px';hero.style.minHeight='756px';hero.style.borderRadius='0';
    document.querySelector('.heroX .split').style.alignItems='center';
  });
  await page.locator('.heroX video').evaluate(v=>new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src=v.poster;}));
  await page.screenshot({path:resolve(root,'assets/social-preview.png')});
}finally{await browser.close();await new Promise(r=>server.close(r));}
