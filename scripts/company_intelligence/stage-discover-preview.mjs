/* Stage REVIEW_ONLY consumer assets into a fresh LOCAL release. No storage SDK calls. */
import {readFileSync,realpathSync,writeFileSync,mkdirSync,unlinkSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {preflight,validateManifest} from './public-delivery.mjs';
const arg=k=>{const i=process.argv.indexOf('--'+k);if(i<0)throw Error('MISSING_ARGUMENT');return realpathSync(process.argv[i+1]);};
const source=arg('consumer'),release=arg('release');
if(source===release||source.startsWith(release+sep)||release.startsWith(source+sep))throw Error('SEPARATE_RELEASE_REQUIRED');
const m=validateManifest(JSON.parse(readFileSync(resolve(source,'manifest.json'))));
if(m.releaseState!=='REVIEW_ONLY')throw Error('REVIEW_CANDIDATE_REQUIRED');
// Validation is shared; only local review permits this release state. publish()
// always invokes preflight with its defaults and refuses REVIEW_ONLY.
const checked=preflight(source,m,null,{localReview:true});
const target=resolve(release,'company-intelligence/data');
if(existsSync(target)&&readdirSync(target).some(name=>name!=='index.json'))throw Error('FRESH_DISABLED_RELEASE_REQUIRED');
if(existsSync(resolve(target,'index.json'))&&JSON.parse(readFileSync(resolve(target,'index.json'))).state!=='DISABLED')throw Error('FRESH_DISABLED_RELEASE_REQUIRED');
for(const [path,{bytes}] of checked){if(path==='index.json')continue;mkdirSync(dirname(resolve(target,path)),{recursive:true});writeFileSync(resolve(target,path),bytes);}
mkdirSync(target,{recursive:true});writeFileSync(resolve(target,'index.json'),checked.get('index.json').bytes);
// The release needs only rollout.js; operational/static preparation catalogues
// are not consumer downloads, even though their descriptors are tracked in Git.
for(const file of readdirSync(resolve(release,'company-intelligence/config')))if(file.endsWith('.json'))unlinkSync(resolve(release,'company-intelligence/config',file));
console.log(JSON.stringify({status:'LOCAL_REVIEW_STAGED',generation:m.generation,assets:checked.size,remoteWrites:0}));
