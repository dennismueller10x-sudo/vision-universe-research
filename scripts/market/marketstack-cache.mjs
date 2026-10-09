/** Marketstack wrapper around the existing authenticated private-cache implementation. */
import { openCache, sealCache } from './tiingo2-cache.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const openMarketstackCache=options=>openCache({workDir:'.market-cache/marketstack',file:'.market-cache/marketstack-cache.enc',...options,provider:'marketstack'});
export const sealMarketstackCache=options=>sealCache({workDir:'.market-cache/marketstack',file:'.market-cache/marketstack-cache.enc',...options,provider:'marketstack'});
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),mode=args.shift(),allowed={'--work-dir':'workDir','--file':'file','--context':'context','--require-readable':'requireReadable'},options={};
  if(!['open','seal'].includes(mode)||args.length%2)throw Error('CACHE_ARGUMENTS_INVALID');
  for(let i=0;i<args.length;i+=2){if(!Object.hasOwn(allowed,args[i])||!args[i+1]||args[i+1].startsWith('--'))throw Error('CACHE_ARGUMENTS_INVALID');options[allowed[args[i]]]=args[i+1];}
  const result=await(mode==='open'?openMarketstackCache:sealMarketstackCache)(options);if(mode==='open'&&options.requireReadable==='true'&&result.reason==='CACHE_UNREADABLE')throw Error('CACHE_RECONCILIATION_REQUIRED');console.log(JSON.stringify(result));
 }catch{console.error('Marketstack encrypted cache operation failed.');process.exitCode=1;}
}
