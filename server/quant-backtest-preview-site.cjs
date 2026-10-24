/* Serve the existing public Quant release on the loopback review origin only.
   No source-tree file server, private blob route, proxy, directory index or deployment entry. */
'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const within=(base,file)=>file!==base&&file.startsWith(base+path.sep);
function create({directory,privateDirectory,root}){
 const site=fs.realpathSync(directory),privateRoot=fs.realpathSync(privateDirectory),repo=fs.realpathSync(root);
 if(site===privateRoot||within(site,privateRoot)||within(privateRoot,site)||site===repo||within(repo,site))throw Error('SEPARATE_PUBLIC_RELEASE_REQUIRED');
 const report=JSON.parse(fs.readFileSync(path.join(site,'release-delivery.json')));if(report.status!=='PASS'||!/^[a-f0-9]{40}$/.test(report.sourceCommit))throw Error('VALID_PUBLIC_RELEASE_REQUIRED');
 const index=fs.readFileSync(path.join(site,'quant/index.html'),'utf8');
 const hashes=[...index.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.gz':'application/gzip','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon'};
 return async function serve(req,res,{authenticated,prefix}){
  const url=new URL(req.url,'http://localhost'),p=url.pathname;
  const page=p==='/quant/'||p==='/quant/index.html';
  if(p===prefix+'integrated.js'){
   if(!authenticated){res.statusCode=401;res.end();return true;}
   res.setHeader('Content-Type',mime['.js']);res.end(await fsp.readFile(path.join(root,'scripts/quant/preview/integrated.js')));return true;
  }
  if(page){
   if(!authenticated){res.statusCode=303;res.setHeader('Location',prefix);res.end();return true;}
   if(url.search){res.statusCode=400;res.end();return true;}
   // Hash only the existing inline theme/navigation initializers, never unsafe-inline scripts.
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'");
   const anchor='<script src="/quant/release-bundle.js';if(!index.includes(anchor))throw Error('RELEASE_BUNDLE_REQUIRED');
   res.setHeader('Content-Type',mime['.html']);res.end(index.replace(anchor,'<script src="'+prefix+'integrated.js"></script>'+anchor));return true;
  }
  // Only assets used by the existing Quant product; other product pages and server/source files remain absent.
  const allowed=/^\/(?:quant\/|assets\/|core\/|discover\/(?:ui|logos|data)\/|company-intelligence\/(?:api|config|ui|data)\/)/.test(p)||p==='/discover/discover.css'||p==='/release-id.json';
  if(!allowed||p.startsWith(prefix)||p.includes('%')||p.includes('\\')||p.split('/').some(x=>x.startsWith('.'))||!mime[path.extname(p)]||path.extname(p)==='.html')return false;
  if(!authenticated){res.statusCode=401;res.end();return true;}
  for(const k of url.searchParams.keys())if(k!=='v'||url.searchParams.getAll(k).length!==1){res.statusCode=400;res.end();return true;}
  let file;try{file=await fsp.realpath(path.join(site,p));}catch{res.statusCode=404;res.end();return true;}
  if(!within(site,file)){res.statusCode=404;res.end();return true;}
  const stat=await fsp.stat(file);if(!stat.isFile()||stat.size>16*1024*1024){res.statusCode=413;res.end();return true;}
  res.setHeader('Content-Type',mime[path.extname(p)]);res.end(await fsp.readFile(file));return true;
 };
}
module.exports={create};
