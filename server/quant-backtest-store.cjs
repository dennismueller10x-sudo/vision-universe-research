/* Internal-review storage adapter, not an HTTP endpoint. No provider or engine calls.
   The directory must be a PRIVATE materializer output outside the static repository. */
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
function create({directory,repositoryRoot=path.resolve(__dirname,'..')}={}){
 if(!directory)throw Error('PRIVATE_BACKTEST_DIRECTORY_REQUIRED');
 const root=path.resolve(directory),repo=path.resolve(repositoryRoot);
 if(!path.relative(repo,root).startsWith('..'+path.sep))throw Error('PUBLIC_BACKTEST_STORAGE_FORBIDDEN');
 const jsonPath=/^(?:release\.json|[a-f0-9]{64}\/(?:index\/[A-Z0-9._-]{2}\.json|listings\/ref_[A-Za-z0-9_.-]{1,80}\/summary\.json))$/;
 const detailPath=/^[a-f0-9]{64}\/listings\/ref_[A-Za-z0-9_.-]{1,80}\/(?:1Y|3Y|5Y|10Y|MAX)-(?:equity|trades)\.json\.gz$/;
 async function bytes(relative,pattern,max){
  if(!pattern.test(relative))throw Error('INVALID_BACKTEST_PATH');
  const realRoot=await fs.realpath(root),realRepo=await fs.realpath(repo),file=await fs.realpath(path.join(root,relative));
  if(!path.relative(realRepo,realRoot).startsWith('..'+path.sep))throw Error('PUBLIC_BACKTEST_STORAGE_FORBIDDEN');
  if(!path.relative(realRoot,file).startsWith('..'+path.sep)&&path.relative(realRoot,file)!=='..'){
   // Opening the verified path and checking fstat also bounds file replacements.
   const handle=await fs.open(file,'r');try{const stat=await handle.stat();if(!stat.isFile()||stat.size>max)throw Error('BACKTEST_PAYLOAD_LIMIT');const b=await handle.readFile();if(b.length>max)throw Error('BACKTEST_PAYLOAD_LIMIT');return b;}finally{await handle.close();}
  }
  throw Error('BACKTEST_STORAGE_ESCAPE');
 }
 return {loadJSON:async p=>JSON.parse((await bytes(p,jsonPath,262144)).toString('utf8')),loadDetail:async p=>JSON.parse(zlib.gunzipSync(await bytes(p,detailPath,262144),{maxOutputLength:2097152}).toString('utf8'))};
}
module.exports={create};
