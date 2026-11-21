// Delivery-only concatenation. Preserve script order, lazy group boundaries and
// the separately budgeted app/home/detail/themes files. No canonical artifacts.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
export const KEEP_SEPARATE=/^\/(?:company-intelligence\/(?:config\/rollout|api\/contract|ui\/stock-section)|discover\/ui\/detail)\.js$/;
export async function bundleDiscover({root,output,readSource = p => readFile(resolve(root,p),'utf8')}) {
 const page=resolve(output,'discover/index.html');
 let html=await readFile(page,'utf8');const chunks=[],sources=new Map();
 const source=p=>{if(!sources.has(p))sources.set(p,Promise.resolve().then(()=>readSource(p)));return sources.get(p);};
 const maxChunk=256*1024;
 const templates=[...html.matchAll(/<template id="(dx-(?:start|lazy-[a-z-]+))">([\s\S]*?)<\/template>/g)];
 for(const template of templates){
  let body=template[2],run=[],number=0,previousEnd=0,runBytes=0;
  async function flush(){
   if(run.length>1){
    const paths=run.map(t=>t[1].slice(1));
    for(const p of paths)if(!/^(?:assets|core|quant|discover|company-intelligence)\/[A-Za-z0-9/_.-]+\.js$/.test(p))throw Error('INVALID_DISCOVER_BUNDLE_INPUT');
    const code=(await Promise.all(paths.map(async p=>'/* '+p+' */\n'+await source(p)))).join('\n;\n');
    const name='discover/delivery/'+template[1]+'-'+(++number)+'.js',v=createHash('sha256').update(code).digest('hex').slice(0,16);
    await mkdir(dirname(resolve(output,name)),{recursive:true});await writeFile(resolve(output,name),code);
    body=body.replace(run[0][0],'<script src="/'+name+'?v='+v+'"></script>');
    for(const t of run.slice(1))body=body.replace(t[0],'');
    chunks.push({path:name,inputs:paths,bytes:Buffer.byteLength(code)});
   }
   run=[];runBytes=0;
  }
  for(const tag of template[2].matchAll(/<script src="([^"]+)"><\/script>/g)){
   const gap=template[2].slice(previousEnd,tag.index).replace(/<!--[\s\S]*?-->/g,'').trim();
   if(gap)await flush();
   previousEnd=tag.index+tag[0].length;
   // Eigenstaendig bleiben: die separat budgetierten Discover-Dateien und die Consumer-Module von
   // Company Intelligence. Der Release-Schritt stageProduction schreibt rollout.js je Release um
   // (Generation, Kill-Switch), versionConsumerAssets stempelt diese Tags; in einem Buendel
   // erreichte beides sie nicht (07.11.2026: PRODUCTION_GENERATION_MISMATCH, "derzeit nicht
   // verfuegbar", Gate fail-closed geschlossen).
   if(/^\/discover\/(app|home|detail|themes)\.js$/.test(tag[1])||KEEP_SEPARATE.test(tag[1]))await flush();else {
    const path=tag[1].slice(1);if(!/^(?:assets|core|quant|discover|company-intelligence)\/[A-Za-z0-9/_.-]+\.js$/.test(path))throw Error('INVALID_DISCOVER_BUNDLE_INPUT');
    const size=Buffer.byteLength(await source(path));
    if(run.length&&runBytes+size>maxChunk)await flush();
    run.push(tag);runBytes+=size;
   }
  }
  await flush();html=html.replace(template[0],template[0].replace(template[2],body));
 }
 // Vorladen der Startbuendel (Ladezeit 21.11.2026): die Skripte des Starts werden erst nach dem Parse-Ende
 // eingehaengt (dx-start-Weiche in index.html), also nach dem parserblockierenden site-navigation.js. Ein Preload im
 // Kopf startet ihre Uebertragung zusammen mit dem CSS; Reihenfolge und Ausfuehrung bleiben unveraendert, die
 // Request-Zahl ebenfalls (der Preload wird vom spaeteren Skript-Tag verbraucht). Nur dx-start, nie die lazy-Gruppen.
 const startPreload=chunks.filter(c=>/^discover\/delivery\/dx-start-\d+\.js$/.test(c.path)).map(c=>{
  const tag=html.match(new RegExp('<script src="(/'+c.path.replace(/[.]/g,'\\.')+'\\?v=[0-9a-f]+)"></script>'));
  return tag?'<link rel="preload" href="'+tag[1]+'" as="script">':'';
 }).join('');
 if(startPreload&&!/rel="preload" href="\/discover\/delivery\//.test(html)){
  const at=html.indexOf('<link rel="stylesheet"');
  if(at>=0)html=html.slice(0,at)+startPreload+html.slice(at);
 }
 await writeFile(page,html);return chunks;
}
