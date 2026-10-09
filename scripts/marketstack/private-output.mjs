import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const repositoryRoot=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
export function rejectSymlinkAncestors(value){
 let p=resolve(value);for(;;){try{if(lstatSync(p).isSymbolicLink())throw Error('PRIVATE_OUTPUT_SYMLINK_REJECTED');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;p=dirname(p);}
}
export function assertPrivateOutput(value,{allowCache=false}={}){
 const out=resolve(value);rejectSymlinkAncestors(out);
 const inside=out===repositoryRoot||out.startsWith(repositoryRoot+sep);
 if(inside&&!(allowCache&&out.startsWith(repositoryRoot+sep+'.market-cache'+sep)))throw Error('PRIVATE_OUTPUT_OUTSIDE_REPOSITORY_REQUIRED');
 return out;
}
