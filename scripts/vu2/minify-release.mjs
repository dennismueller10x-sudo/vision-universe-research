// Verkleinert ausgelieferte JS- und CSS-Dateien im gebauten Release (nicht im Repository).
//
// Nur Leerraum und Syntax, KEINE Umbenennung von Bezeichnern: die Engines sind
// UMD-Skripte mit globalen Namen (`globalThis`), und manche Seiten greifen
// ueber `window.*` auf sie zu. Umbenennen waere hier ein Risiko ohne Not.
// Jede Datei wird einzeln geprueft: schlaegt die Umwandlung fehl oder wird die
// Datei nicht kleiner, bleibt das Original unveraendert. Das Skript bricht
// den Lauf nie ab; es meldet nur, was es gespart hat.
//
// Aufruf: node minify-release.mjs <Release-Ordner>
// esbuild wird aus ESBUILD_PATH geladen (Workflow: /tmp/vu2-release/node_modules/esbuild).
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,extname} from 'node:path';
import {createRequire} from 'node:module';

const SKIP=/(^|\/)(release-bundle\.js|sw\.js)$|\.min\.(js|css)$/;
const root=process.argv[2];
if(!root)throw Error('USAGE: minify-release.mjs <release-dir>');
const esbuild=createRequire(import.meta.url)(process.env.ESBUILD_PATH||'esbuild');

async function* walk(dir,rel=''){
  for(const e of await readdir(dir,{withFileTypes:true})){
    const r=rel?`${rel}/${e.name}`:e.name;
    if(e.isDirectory())yield* walk(join(dir,e.name),r);
    else if(e.isFile())yield r;
  }
}

let files=0,before=0,after=0,kept=0;
for await(const rel of walk(root)){
  const ext=extname(rel);
  if((ext!=='.js'&&ext!=='.css')||SKIP.test(rel))continue;
  const file=join(root,rel);
  const source=await readFile(file,'utf8');
  try{
    const out=esbuild.transformSync(source,{loader:ext==='.js'?'js':'css',minifyWhitespace:true,minifySyntax:true,charset:'utf8',legalComments:'inline'}).code;
    if(out.length>=source.length){kept++;continue;}
    await writeFile(file,out);
    files++;before+=Buffer.byteLength(source);after+=Buffer.byteLength(out);
  }catch{kept++;}
}
console.log(JSON.stringify({minified:files,keptOriginal:kept,bytesBefore:before,bytesAfter:after,saved:before-after}));
