// Code-Kennung je Produkt im gebauten Release (nur Auslieferung, nie committet).
//
// WARUM: Ein offener Tab behaelt den Code, mit dem er geoeffnet wurde. Nach einem Deployment fehlen ihm Dateien
// (#616: Technik-Scherben) oder er laedt Nachlade-Skripte, die nicht mehr zu seinem Buendel passen. Der Tab erkennt
// das, wenn er seine eigene Kennung (Meta-Tag) mit der aktuellen (/release-id.json) vergleicht - siehe
// quant/ui/release-guard.js.
//
// WAS: Je Produkt ein Hash ueber alle JS-/CSS-Dateien, die der Tab ausfuehren kann - die in der Seite verlinkten
// (auch in <template>) plus die Nachlade-Verzeichnisse des Produkts. Reine Datenlaeufe aendern ihn nicht: ein
// Release mit gleichem Code hat die gleiche Kennung, ein Tab laedt dann nie ohne Grund neu.
//
// Ausserdem bekommt jedes verlinkte JS-/CSS-Asset einen Stempel ?v=<Hash der ausgelieferten Bytes>. Ohne ihn
// nimmt ein Neuladen (Chrome revalidiert nur die Seite) die Skripte noch bis zu 10 Minuten (GitHub Pages:
// max-age=600) aus dem Cache und der Tab liefe weiter mit altem Code. Die Stempel der Company-Intelligence-
// Pipeline (version-consumer-assets) werden dabei durch denselben Hash der Endfassung ersetzt.
//
// Reihenfolge in pages-release.yml: NACH dem Verkleinern (der Hash gilt den ausgelieferten Bytes), VOR der Passwortsperre
// (sie kopiert die Seiten samt Meta-Tag nach /__research/content/).
// Aufruf: node scripts/vu2/release-id.mjs <Release-Ordner>
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SCHEMA='vu-release-id-1';
export const META_NAME='vu-release';
/* page: HTML-Seite des Produkts; dirs: Verzeichnisse mit Code, den die Seite erst bei Bedarf nachlaedt (loadScript,
   lazy.js); top: JS/CSS-Dateien direkt in einem Verzeichnis (Discover: app.js, home.js ...). */
export const PRODUCTS={
 quant:{page:'quant/index.html',dirs:['quant/app','quant/ui','quant/engines','quant/api'],top:[]},
 // core/: europe-bootstrap.js laedt core/europe-*.js zur Laufzeit nach (ohne Stempel, ohne Waechter) - gehoert zum Code des Tabs.
 discover:{page:'discover/index.html',dirs:['discover/ui','discover/engines','core'],top:['discover']}
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const CODE=/\.(?:js|css)$/;
const EXCLUDED=/(^|\/)(tests|fixtures)\/|\.test\.(?:js|mjs)$/;
const META=/\n?<meta\s+name="vu-release"[^>]*>/g;

async function walk(root,rel,out,recursive){
 let entries;try{entries=await readdir(resolve(root,rel),{withFileTypes:true});}catch{return;}
 for(const e of entries){
  const path=rel+'/'+e.name;
  if(e.isDirectory()){if(recursive)await walk(root,path,out,true);}
  else if(e.isFile()&&CODE.test(e.name)&&!EXCLUDED.test(path))out.add(path);
 }
}
/** Lokale JS-/CSS-Verweise einer Seite (src/href, auch in <template>), ohne Query. */
export function linkedAssets(html){
 const out=new Set();
 for(const m of html.matchAll(/\b(?:src|href)\s*=\s*["'](\/[^"'#?]+\.(?:js|css))(?:\?[^"']*)?["']/g))out.add(m[1].slice(1));
 return out;
}
export function stripMeta(html){return html.replace(META,'');}
const REF=/(\b(?:src|href)\s*=\s*["'])(\/[^"'#?]+\.(?:js|css))(?:\?[^"']*)?(["'])/g;
/** Seite ohne Stempel und Meta-Tag: die Grundlage des Hashes (damit Stempeln wiederholbar ist). */
export const plain=html=>stripMeta(html).replace(REF,'$1$2$3');
/** Setzt ?v=<Hash der Datei> an jedes lokale JS-/CSS-Asset der Seite. */
export async function stampAssets(html,site){
 const digests=new Map();
 for(const m of html.matchAll(REF)){
  const rel=m[2].slice(1);if(digests.has(rel))continue;
  let bytes;try{bytes=await readFile(resolve(site,rel));}catch{throw Error('RELEASE_ID_ASSET_MISSING:'+rel);}
  digests.set(rel,sha(bytes).slice(0,16));
 }
 return html.replace(REF,(_,before,path,after)=>before+path+'?v='+digests.get(path.slice(1))+after);
}

/** Kennung eines Produkts: Hash ueber (Pfad, Hash) aller Codedateien, sortiert; Seite ohne Meta-Tag. */
export async function productId(site,key){
 const p=PRODUCTS[key];if(!p)throw Error('RELEASE_ID_UNKNOWN_PRODUCT:'+key);
 const html=await readFile(resolve(site,p.page),'utf8');
 const files=new Set(linkedAssets(html));
 for(const d of p.dirs)await walk(site,d,files,true);
 for(const d of p.top)await walk(site,d,files,false);
 const lines=[p.page+'\0'+sha(plain(html))];
 for(const f of [...files].sort()){
  let bytes;try{bytes=await readFile(resolve(site,f));}catch{throw Error('RELEASE_ID_ASSET_MISSING:'+f);}
  lines.push(f+'\0'+sha(bytes));
 }
 return sha(lines.join('\n')).slice(0,16);
}

/** Schreibt den Meta-Tag in die Seite (ersetzt einen vorhandenen) und liefert den neuen HTML-Text. */
export function withMeta(html,product,id){
 const tag='<meta name="'+META_NAME+'" data-product="'+product+'" content="'+id+'">';
 const clean=stripMeta(html);
 if(/<meta\s+charset[^>]*>/i.test(clean))return clean.replace(/(<meta\s+charset[^>]*>)/i,'$1\n'+tag);
 if(/<head[^>]*>/i.test(clean))return clean.replace(/(<head[^>]*>)/i,'$1\n'+tag);
 throw Error('RELEASE_ID_NO_HEAD:'+product);
}

export async function stampRelease(site,{commit}={}){
 site=resolve(site);
 const products={};
 for(const key of Object.keys(PRODUCTS)){
  const page=resolve(site,PRODUCTS[key].page);
  try{await readFile(page);}catch{continue;}   // Produkt nicht im Release (gekuerzte Builds)
  products[key]=await productId(site,key);
 }
 if(!Object.keys(products).length)throw Error('RELEASE_ID_NO_PRODUCT');
 for(const [key,id] of Object.entries(products)){
  const page=resolve(site,PRODUCTS[key].page);
  await writeFile(page,withMeta(await stampAssets(await readFile(page,'utf8'),site),key,id));
 }
 let sourceCommit=commit;
 if(!sourceCommit){try{sourceCommit=JSON.parse(await readFile(join(site,'release-delivery.json'),'utf8')).sourceCommit;}catch{/* ohne Angabe */}}
 const report={schema:SCHEMA,commit:typeof sourceCommit==='string'?sourceCommit:null,products};
 await writeFile(join(site,'release-id.json'),JSON.stringify(report)+'\n');
 return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const site=process.argv[2];if(!site)throw Error('USAGE: release-id.mjs <release-dir>');
 console.log(JSON.stringify(await stampRelease(site)));
}
