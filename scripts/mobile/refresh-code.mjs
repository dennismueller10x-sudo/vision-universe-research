// Compile a reviewed code ref onto an existing release's fixed data snapshot.
// Reuses the actual release writers; never edits source/generated repo files.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {resolve,join,sep,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeQuantCode} from '../vu2/build-release.mjs';
import {writeSupertraderHomeView} from '../vu2/supertrader-home-view.mjs';
import {writeStockHeadViews} from '../vu2/stock-head-view.mjs';
import {bundleDiscover} from './bundle-discover.mjs';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];};
const source=process.cwd(),root=resolve(arg('--root')||''),ref=arg('--ref');
if(!ref||!arg('--root')||root===source||root.startsWith(source+sep)||source.startsWith(root+sep))throw Error('Use --ref and --root outside source');
const delivery=JSON.parse(await readFile(join(root,'release-delivery.json'),'utf8'));
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const codeRef=git('rev-parse',ref).toString().trim();
const releaseWriter=git('show',codeRef+':scripts/vu2/build-release.mjs').toString(),stockPreload=releaseWriter.includes('Preload the route');
const paths=git('ls-tree','-r','--name-only',codeRef).toString().trim().split('\n');
const previous=await readFile(join(root,'mobile-code-overlay.json'),'utf8').then(JSON.parse).catch(()=>({files:{}}));
const changed=[...new Set([...Object.keys(previous.files),...git('diff','--name-only',delivery.sourceCommit,codeRef).toString().trim().split('\n')])].filter(p=>paths.includes(p)&&!/^(app|workers|scripts|docs)\//.test(p)&&!p.includes('/data/')&&/\.(js|css|html)$/.test(p));
const inputs=[...new Set([...paths.filter(p=>/\.(js|css)$/.test(p)&&!p.includes('/data/')&&!/^(app|workers|docs)\//.test(p)), ...paths.filter(p=>/^quant\/(config|methodology)\/.*\.json$/.test(p)),...changed,'quant/index.html','discover/index.html','quant/config/fx-license.json','quant/data/market/fx/ecb/EURUSD.json'])].filter(p=>paths.includes(p));
const mirror=await mkdtemp(join(tmpdir(),'e5-code-'));
const esbuild=createRequire(import.meta.url)(process.env.ESBUILD_PATH||'esbuild');
const options={minifyWhitespace:true,minifySyntax:true,charset:'utf8',legalComments:'inline'};
try {
 execFileSync('tar',['-x','-C',mirror],{input:git('archive',codeRef,'--',...inputs)});
 for(const p of changed) {await mkdir(dirname(join(root,p)),{recursive:true});let b=await readFile(join(mirror,p));if(/\.(js|css)$/.test(p)&&p!=='sw.js')b=esbuild.transformSync(b.toString(),{...options,loader:p.endsWith('.css')?'css':'js'}).code;await writeFile(join(root,p),b);}
 // FX is embedded code, but its observations belong to the fixed data snapshot.
 await writeFile(join(mirror,'quant/data/market/fx/ecb/EURUSD.json'),await readFile(join(root,'quant/data/market/fx/ecb/EURUSD.json')));
 await writeQuantCode({root:mirror,output:root,paths,stockPreload});
 if(paths.includes('scripts/vu2/supertrader-home-view.mjs'))await writeSupertraderHomeView({site:root});
 else await rm(join(root,'supertrader/data/home-view.json'),{force:true});
 if(paths.includes('quant/app/stock-boot.js'))await writeStockHeadViews({source:mirror,site:root});
 else await rm(join(root,'quant/head-bundle.js'),{force:true});
 // Match Pages: bundle gets whitespace-only compaction, packs get syntax too.
 const bundle=join(root,'quant/release-bundle.js');await writeFile(bundle,esbuild.transformSync(await readFile(bundle,'utf8'),{loader:'js',minifyWhitespace:true,charset:'utf8',legalComments:'inline'}).code);
 for(const p of ['quant/head-bundle.js','quant/fx-pack.js','quant/app/pack-stock.js','quant/app/pack-tools.js','quant/app/pack-method.js']){const file=join(root,p);const b=await readFile(file,'utf8').catch(()=>null);if(b)await writeFile(file,esbuild.transformSync(b,{...options,loader:'js'}).code);}
 await writeFile(join(root,'discover/index.html'),await readFile(join(mirror,'discover/index.html')));
 // A pre-E5 ref must retain its original unbundled delivery.
 const chunks=paths.includes('scripts/mobile/bundle-discover.mjs')?await bundleDiscover({root:mirror,output:root}):[];
 for(const c of chunks){const file=join(root,c.path);await writeFile(file,esbuild.transformSync(await readFile(file,'utf8'),{...options,loader:'js'}).code);}
 const headFiles=paths.includes('quant/app/stock-boot.js')?['quant/head-bundle.js','quant/data/product/stock-head-v1/index.json']:[];
 const homeFiles=paths.includes('scripts/vu2/supertrader-home-view.mjs')?['supertrader/data/home-view.json']:[];
 const hashes={};for(const p of [...changed,'quant/release-bundle.js',...headFiles,...homeFiles,...chunks.map(c=>c.path)])hashes[p]=createHash('sha256').update(await readFile(join(root,p))).digest('hex');
 const report={dataSourceCommit:delivery.sourceCommit,codeRef,compiler:esbuild.version,compilerFeatures:{stockPreload,headSplit:headFiles.length>0},files:hashes};
 await writeFile(join(root,'mobile-code-overlay.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await rm(mirror,{recursive:true,force:true});}
