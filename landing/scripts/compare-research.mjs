// Screenshot and computed-style comparison against the pinned original Hero.
// The reference is repository markup, not an attempt to bypass the public gate.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {root,build} from './build.mjs';

await build();
const provenance=JSON.parse(await readFile(resolve(root,'reference/source.json'),'utf8'));
const css=(await readFile(resolve(root,'assets/home/home.css'),'utf8')).replace('url(../fonts/inter-latin.woff2)','url(/assets/fonts/inter-latin.woff2)');
assert.equal(createHash('sha256').update(css).digest('hex'),provenance.cssSha256,'Research-CSS darf außer der relativen Font-URL nicht verändert sein');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'};
const directory=resolve(root);
const server=createServer(async(req,res)=>{try{let path=resolve(directory,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(directory+sep))throw Error();if((await stat(path)).isDirectory())path=resolve(path,'index.html');res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const review=resolve(root,'review');await mkdir(review,{recursive:true});
const selectors={
  header:['.lp-head',['paddingTop','paddingBottom','position','backgroundColor']],
  logo:['.lp-logo',['width','aspectRatio','overflow']],
  logoImage:['.lp-logo img',['filter','marginTop']],
  shell:['.hero .shell',['width','maxWidth']],
  hero:['.hero',['paddingTop','paddingBottom','backgroundColor','color']],
  grid:['.hero-grid',['display','gridTemplateColumns','gap','alignItems']],
  title:['.hero h1',['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','marginTop']],
  accent:['.hero h1 em',['color','textShadow','backgroundImage']],
  lead:['.hero .lead',['fontFamily','fontSize','lineHeight','color','marginTop']],
  badge:['.hero-badge',['fontSize','fontWeight','borderRadius','padding','backgroundColor','borderColor']],
  button:['.hero .btn-app',['fontFamily','fontSize','fontWeight','minHeight','padding','borderRadius','backgroundColor','color','boxShadow']],
  glow:['.hero::before',['backgroundImage']],
  background:['.hero-grid-fx',['backgroundImage','maskImage']],
  stage:['.stage',['height','width','position']],
  phone:['.stage .phone',['width','height','borderRadius','transform','left','top']],
  browser:['.stage .browser',['display','width','right','top','backgroundColor','borderRadius']],
  hud:['.stage .hud',['backgroundImage','borderRadius','boxShadow']],
};
async function inspect(page){return page.evaluate(selectors=>Object.fromEntries(Object.entries(selectors).map(([name,[selector,props]])=>{const pseudo=selector.includes('::')?'::'+selector.split('::')[1]:null;const e=document.querySelector(selector.split('::')[0]);const s=getComputedStyle(e,pseudo);return[name,Object.fromEntries(props.map(p=>[p,s[p]]))];})),selectors);}
const comparisons=[];
try{
  for(const[name,width,height]of[['desktop',1440,900],['iphone',390,844]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',isMobile:name==='iphone',hasTouch:name==='iphone'});
    const research=await context.newPage(),landing=await context.newPage();
    await research.goto(base+'/reference/',{waitUntil:'networkidle'});await landing.goto(base+'/dist/',{waitUntil:'networkidle'});
    await research.evaluate(()=>document.fonts.ready);await landing.evaluate(()=>document.fonts.ready);
    const original=await inspect(research),actual=await inspect(landing);assert.deepEqual(actual,original,`${name}: Original-Stile müssen übereinstimmen`);
    await research.screenshot({path:resolve(review,'research-'+name+'.png')});
    await landing.screenshot({path:resolve(review,'landing-'+name+'-viewport.png')});
    // Frame the two unchanged viewport screenshots side by side using the browser.
    const images=await Promise.all(['research-'+name+'.png','landing-'+name+'-viewport.png'].map(async f=>(await readFile(resolve(review,f))).toString('base64')));
    const sheet=await context.newPage();await sheet.setViewportSize({width:width*2+48,height:height+84});
    await sheet.setContent(`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Research und Coming soon</title><style>body{margin:0;padding:16px;background:#f5f6f2;font:16px system-ui}main{display:grid;grid-template-columns:${width}px ${width}px;gap:16px}h2{font-size:16px;margin:0 0 16px}img{display:block;width:${width}px;height:${height}px}</style><main><section><h2>Research · Original aus dem Repository</h2><img src="data:image/png;base64,${images[0]}"></section><section><h2>Coming soon · PR #543</h2><img src="data:image/png;base64,${images[1]}"></section></main>`);
    await sheet.screenshot({path:resolve(review,'comparison-'+name+'.png')});
    comparisons.push({name,viewport:`${width} × ${height}`,styleGroups:Object.keys(selectors).length,matching:true,styles:actual});
    await context.close();
  }
  await writeFile(resolve(review,'design-comparison.json'),JSON.stringify({reference:JSON.parse(await readFile(resolve(root,'reference/source.json'),'utf8')),comparisons,scope:'Gleicher Viewport, gleiche Inter-Datei, reduzierte Bewegung. Originaler Header/Hero aus dem Repository; die öffentliche Research-Auslieferung zeigt den Passwortdialog. Referenz wird nicht veröffentlicht.'},null,2)+'\n');
  console.log(JSON.stringify(comparisons.map(({name,viewport,styleGroups,matching})=>({name,viewport,styleGroups,matching}))));
}finally{await browser.close();await new Promise(r=>server.close(r));}
