import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {versionConsumerAssets} from '../version-consumer-assets.mjs';
test('warm browser cache keys change with the staged UI and ON/OFF gate; unrelated product assets remain intact',()=>{
 const root=mkdtempSync(join(tmpdir(),'ci-cache-version-'));
 const put=(path,body)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),body);};
 try{
  put('company-intelligence/ui/stock-section.js','old consumer code');put('company-intelligence/config/rollout.js','gate AVAILABLE');put('quant/release-bundle.js','bundle gate AVAILABLE');
  put('discover/index.html','<script src="/company-intelligence/ui/stock-section.js"></script><script src="/company-intelligence/config/rollout.js"></script><script src="/discover/app.js"></script>');
  put('quant/index.html','<script src="/quant/release-bundle.js?v=old"></script>');
  assert.deepEqual(versionConsumerAssets(root),['discover/index.html','quant/index.html']);const first=readFileSync(join(root,'discover/index.html'),'utf8'),bundleFirst=readFileSync(join(root,'quant/index.html'),'utf8');
  assert(first.includes('/discover/app.js"'));assert.match(first,/stock-section.js\?v=[a-f0-9]{16}/);assert.deepEqual(versionConsumerAssets(root),[]);
  put('company-intelligence/ui/stock-section.js','new consumer code');versionConsumerAssets(root);const updated=readFileSync(join(root,'discover/index.html'),'utf8');assert.notEqual(updated,first);assert.equal(readFileSync(join(root,'quant/index.html'),'utf8'),bundleFirst);
  put('company-intelligence/config/rollout.js','gate DISABLED');put('quant/release-bundle.js','bundle gate DISABLED');versionConsumerAssets(root);assert.notEqual(readFileSync(join(root,'discover/index.html'),'utf8'),updated);assert.notEqual(readFileSync(join(root,'quant/index.html'),'utf8'),bundleFirst);
  rmSync(join(root,'company-intelligence/ui/stock-section.js'));assert.throws(()=>versionConsumerAssets(root),/LINKED_CONSUMER_ASSET_MISSING/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
