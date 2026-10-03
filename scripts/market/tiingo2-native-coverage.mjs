/** Existing Python aggregate producer, scoped to the canonical private shadow. */
import {execFileSync} from 'node:child_process';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {assertShadowRoot} from './tiingo2-fundamentals.mjs';
const sourceRoot=resolve(fileURLToPath(new URL('../..',import.meta.url)));
export function materializeNativeCoverage({shadowRoot}){
 const root=realpathSync(shadowRoot);
 if(!root.startsWith(join(sourceRoot,'.market-cache')+sep))throw Error('ISOLATED_NATIVE_COVERAGE_REQUIRED');
 assertShadowRoot(root);
 const output=execFileSync('python3',[join(sourceRoot,'scripts/quant/refresh-native-coverage.py'),'--root',root],{encoding:'utf8',maxBuffer:4*1024*1024});
 const report=JSON.parse(output);
 if(report.providerRequests!==0||report.priceHistoryRebuilt!==false||report.canonicalInputsUnchanged!==true||report.sourceIssuerSummariesUnchanged!==true)throw Error('NATIVE_COVERAGE_INPUT_MUTATION');
 return report;
}
