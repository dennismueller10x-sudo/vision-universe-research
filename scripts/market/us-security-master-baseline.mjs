/** Bind a discovery audit to the exact membership bytes it actually read. */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';

export const baselineSha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function readSecurityMasterBaseline(file,expectedSha256){
 const stored=readFileSync(file),bytes=file.endsWith('.gz')?gunzipSync(stored):stored;
 const sha256=baselineSha256(bytes);
 if(expectedSha256&&sha256!==expectedSha256)throw Error('SECURITY_MASTER_BASELINE_HASH_MISMATCH');
 const document=JSON.parse(bytes);
 if(!Array.isArray(document.securities))throw Error('SECURITY_MASTER_BASELINE_MEMBERS_MISSING');
 return {bytes,document,sha256};
}
export function pinSecurityMasterBaseline({root,outDir,sourceFile,sourceBytes}){
 const baseline=sourceBytes?{bytes:sourceBytes,document:JSON.parse(sourceBytes),sha256:baselineSha256(sourceBytes)}:readSecurityMasterBaseline(sourceFile);
 const {bytes,document,sha256}=baseline,dir=join(outDir,'baselines');
 if(!Array.isArray(document.securities))throw Error('SECURITY_MASTER_BASELINE_MEMBERS_MISSING');
 const file=join(dir,'universe-FULL_UNIVERSE.'+sha256+'.json.gz');
 mkdirSync(dir,{recursive:true});
 if(existsSync(file))readSecurityMasterBaseline(file,sha256);
 else writeFileSync(file,gzipSync(bytes,{level:9}),{flag:'wx'});
 return {file:relative(root,file).split('\\').join('/'),sha256,document};
}
