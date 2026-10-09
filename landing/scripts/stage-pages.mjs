// Stage build files only in a separately cloned, tightly named Pages repository.
// Does not create repositories, change Pages settings, push or add a CNAME.
import {readFile,cp,readdir,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,relative} from 'node:path';
import {root} from './build.mjs';

export async function stagePages({target,owner=process.env.LANDING_PAGES_OWNER,source=resolve(root,'dist')}={}){
  if(!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner||''))throw Error('GitHub-Owner fehlt.');
  if(!target)throw Error('Separater Ziel-Checkout fehlt.');
  target=resolve(target);source=resolve(source);
  const repository=resolve(root,'..');
  if(target===repository||!relative(repository,target).startsWith('..')||!relative(target,source).startsWith('..'))throw Error('Research und Quell-Build dürfen nicht als Ziel verwendet werden.');
  const git=args=>execFileSync('git',args,{cwd:target,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const remote=git(['remote','get-url','origin']);
  const expected=`${owner}/vision-universe-landing-pages`;
  if(![ `git@github.com:${expected}.git`,`https://github.com/${expected}`,`https://github.com/${expected}.git` ].includes(remote))throw Error('Ausschließlich das separate Landing-Pages-Ziel ist erlaubt.');
  if(git(['branch','--show-current'])!=='gh-pages')throw Error('Zielbranch muss gh-pages sein.');
  if(git(['status','--porcelain']))throw Error('Ziel-Checkout ist nicht sauber.');
  const cnamePath=resolve(target,'CNAME');
  if(existsSync(cnamePath)&&(await readFile(cnamePath,'utf8')).trim()!=='www.visionuniverse.de')throw Error('Fremde CNAME wird nicht verändert.');
  const html=await readFile(resolve(source,'index.html'),'utf8');
  if(!html.includes('https://www.visionuniverse.de/')||html.includes('content="noindex, nofollow"'))throw Error('Geprüfter Produktionsbuild fehlt.');
  const entries=await readdir(source);
  if(entries.includes('CNAME'))throw Error('Quell-Build darf keine Domain setzen.');
  for(const entry of await readdir(target)){if(entry!=='.git'&&entry!=='CNAME')await rm(resolve(target,entry),{recursive:true,force:true});}
  for(const entry of entries)await cp(resolve(source,entry),resolve(target,entry),{recursive:true});
  await writeFile(resolve(target,'README.md'),'# Vision Universe · Veröffentlichungsziel\n\nNur der statische Coming-soon-Build. Maßgeblicher Quellcode: https://github.com/'+owner+'/vision-universe-research/tree/main/landing\nKeine Research-Dateien, Zugangsdaten oder Newsletter-Kontakte.\n');
  return {targetRepository:expected,branch:'gh-pages',cname:'unverändert'};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
  try{const target=process.argv.slice(2).find(a=>a.startsWith('--target='))?.slice(9);console.log(JSON.stringify(await stagePages({target})));}catch{console.error('Pages-Staging blockiert: Ziel, Branch, sauberer Checkout oder geprüfter Produktionsbuild fehlen.');process.exitCode=1;}
}
