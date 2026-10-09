// A screenshot of brand typography, using the original wordmark and local Inter.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {root} from './build.mjs';
const html=`<!doctype html><html lang="de"><meta charset="utf-8"><style>@font-face{font-family:Inter;src:url('/inter-latin.woff2');font-weight:100 900}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;padding:66px 76px;background:#07090b;color:#f4f5f1;font-family:Inter,sans-serif}img{width:400px;height:auto;margin:-36px 0 -22px -5px;filter:invert(1)}p{font-size:20px;font-weight:650;letter-spacing:.07em;color:#c8f531;margin:52px 0 26px}h1{font-size:78px;font-weight:850;line-height:1.03;letter-spacing:-.055em;margin:0}em{font-style:normal;color:#c8f531}footer{font-size:23px;color:#b4b9c0;margin-top:38px}</style><img src="/vision-universe-logo-web.png" alt="Vision Universe"><p>APP BALD VERFÜGBAR</p><h1>Dein nächster<br>Blick auf die <em>Börse.</em></h1><footer>Vision Universe · Aktienresearch in einer App.</footer></html>`;
const server=createServer(async(req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}try{res.end(await readFile(root+'assets/'+req.url.slice(1)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:1200,height:630}});await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:root+'assets/social-preview.png'});}finally{await browser.close();await new Promise(r=>server.close(r));}
