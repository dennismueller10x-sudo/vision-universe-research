// Statischer Server fuer Browser-QA in CI-Containern ohne Python (z. B. dem
// Playwright-Image). Verhaelt sich wie `python -m http.server`: Datei aus dem
// Verzeichnis, Verzeichnis -> index.html (ohne Schraegstrich 301 dorthin),
// sonst 404; MIME-Typen wie Pythons SimpleHTTPRequestHandler (.gz -> application/gzip).
// Aufruf: node scripts/ci/static-server.mjs --dir=<pfad> [--port=8765] [--host=127.0.0.1]
import {createServer} from 'node:http';
import {stat,readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';

const arg=(k,d)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3)??d;
const dir=resolve(arg('dir','.')),port=Number(arg('port','8765')),host=arg('host','127.0.0.1');
const MIME={'.html':'text/html','.htm':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css',
 '.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg',
 '.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.ico':'image/vnd.microsoft.icon','.woff2':'font/woff2','.woff':'font/woff',
 '.webmanifest':'application/manifest+json','.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.xml':'application/xml',
 '.pdf':'application/pdf','.mp4':'video/mp4','.wasm':'application/wasm'};

createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  const path=decodeURIComponent(url.pathname);
  let file=resolve(dir,'.'+path);
  if(file!==dir&&!file.startsWith(dir+sep))throw Object.assign(Error('outside'),{code:'ENOENT'});
  let info=await stat(file);
  if(info.isDirectory()){
   if(!path.endsWith('/')){res.writeHead(301,{Location:path+'/'+url.search});res.end();return;}
   file=resolve(file,'index.html');info=await stat(file);
  }
  const body=req.method==='HEAD'?null:await readFile(file);
  res.writeHead(200,{'Content-Type':MIME[extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size,'Last-Modified':info.mtime.toUTCString()});
  res.end(body);
 }catch(e){
  const missing=e&&(e.code==='ENOENT'||e.code==='ENOTDIR');
  res.writeHead(missing?404:500,{'Content-Type':'text/html;charset=utf-8'});
  res.end('<!DOCTYPE HTML><html lang="en"><head><meta charset="utf-8"><title>Error response</title></head><body><h1>Error response</h1><p>Error code: '+(missing?'404':'500')+'</p><p>Message: '+(missing?'File not found':'Server error')+'.</p></body></html>\n');
 }
}).listen(port,host,()=>console.log(`static-server: ${dir} auf http://${host}:${port}`));
