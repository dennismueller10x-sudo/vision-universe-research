/* Bind browser cache keys to the staged consumer code and gate, never private state. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex').slice(0,16);
export function versionConsumerAssets(release) {
 const changed=[];
 for(const route of ['discover/index.html','quant/index.html']){
  const file=resolve(release,route);if(!existsSync(file))continue;
  const original=readFileSync(file,'utf8');
  let html=original.replace(/((?:src|href)=["'])(\/company-intelligence\/(?:api\/contract\.js|ui\/stock-section\.(?:js|css)|config\/rollout\.js))(?:\?[^"']*)?(["'])/g,(_,before,path,after)=>{
   const asset=resolve(release,'.'+path);if(!existsSync(asset))throw Error('LINKED_CONSUMER_ASSET_MISSING:'+path);
   return before+path+'?v='+digest(asset)+after;
  });
  html=html.replace(/(src=["'])(\/quant\/release-bundle\.js)(?:\?[^"']*)?(["'])/g,(_,before,path,after)=>{
   const asset=resolve(release,'.'+path);if(!existsSync(asset))throw Error('LINKED_CONSUMER_BUNDLE_MISSING');
   return before+path+'?v='+digest(asset)+after;
  });
  if(html!==original){writeFileSync(file,html);changed.push(route);}
 }
 return changed;
}
