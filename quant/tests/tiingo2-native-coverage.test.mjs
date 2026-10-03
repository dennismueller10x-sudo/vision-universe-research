import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync,linkSync,rmSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {materializeNativeCoverage} from '../../scripts/market/tiingo2-native-coverage.mjs';
const sourceRoot=resolve(import.meta.dirname,'../..');
test('native aggregate wrapper refuses the protected source root before running the writer',()=>{
 assert.throws(()=>materializeNativeCoverage({shadowRoot:sourceRoot}),/ISOLATED_NATIVE_COVERAGE_REQUIRED/);
});
test('native aggregate wrapper refuses nested issuer/report links before a native producer can overwrite protected bytes',()=>{
 const cache=join(sourceRoot,'.market-cache');mkdirSync(cache,{recursive:true});
 for(const attack of ['issuer-directory','issuer-file','report-file','report-hardlink']){
  const fixture=mkdtempSync(join(cache,'native-coverage-link-'));
  try{
   const shadow=join(fixture,'shadow'),protectedDir=join(fixture,'protected'),file=join(protectedDir,'coverage-report.json');mkdirSync(protectedDir,{recursive:true});writeFileSync(file,'{"unchanged":true}\n');
   const destination=join(shadow,'quant/data/fundamentals',attack.startsWith('issuer')?'issuers'+(attack==='issuer-file'?'/000.json':''):'coverage-report.json');mkdirSync(dirname(destination),{recursive:true});
   if(attack==='report-hardlink')linkSync(file,destination);
   else symlinkSync(attack==='issuer-directory'?protectedDir:file,destination,attack==='issuer-directory'?'dir':'file');
   assert.throws(()=>materializeNativeCoverage({shadowRoot:shadow}),/SHADOW_DATA_(?:SYMLINK|HARDLINK)/,attack);
   assert.equal(readFileSync(file,'utf8'),'{"unchanged":true}\n',attack);
  }finally{rmSync(fixture,{recursive:true,force:true});}
 }
});
