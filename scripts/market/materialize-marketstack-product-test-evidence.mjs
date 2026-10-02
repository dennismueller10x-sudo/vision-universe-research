// Read-only evidence materializer. Requires completed local suites/browser reports;
// never runs network requests, changes gates, or turns diagnostic coverage into admission.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const arg=(key,fallback)=>process.argv.find(x=>x.startsWith('--'+key+'='))?.slice(key.length+3)??fallback;
const root=arg('evidence-root','/workspace/scratch'),prefix=join(root,'marketstack-product-fitness-');
const inputs=[];
function bytes(path){const b=readFileSync(path);inputs.push({path,sha256:createHash('sha256').update(b).digest('hex')});return b;}
const json=path=>JSON.parse(bytes(path));
const broad=json(prefix+'regression-final-tests.json'),protectedOutputs=json(prefix+'protected-comparison.json');
const quant=json(prefix+'quant-browser/results.json'),resources=json(prefix+'quant-browser/resource-budgets.json'),axe=json(prefix+'quant-browser/accessibility.json');
const discover=json(prefix+'discover-browser/report.json'),discoverAxe=json(prefix+'discover-browser/accessibility.json');
const global=json(prefix+'global-browser.json'),smoke=json(prefix+'production-smoke.json');
const serving=bytes(prefix+'serving.log').toString(),resourceUnit=bytes(prefix+'resource-unit.log').toString(),journeys=bytes(prefix+'journeys.log').toString(),hygiene=bytes(prefix+'public-hygiene.log').toString();
const release=json(prefix+'release-build.log');
if(!Number.isSafeInteger(release.secBytes)||release.secBytes<0||!Number.isSafeInteger(release.secBudget)||release.secBudget<=0||release.result==='FAIL'||release.result==='FAILED'||release.errors?.length||!Array.isArray(release.files)||!release.files.length||release.secBytes>release.secBudget)throw Error('INVALID_RELEASE_RESOURCE_EVIDENCE');
const checkCount=rows=>({checks:rows.length,pass:rows.filter(x=>x.pass===true).length,fail:rows.filter(x=>x.pass!==true).length});
const accessibility=rows=>({audits:rows.length,violations:rows.reduce((n,r)=>n+(r.violations?.length??0),0),scope:'AUTOMATED_AUDIT_NOT_MANUAL_CERTIFICATION'});
const scopes={...broad.scopes,
 release:{result:'PASS',command:'node scripts/vu2/build-release.mjs --output=PRIVATE_RELEASE; pinned esbuild whitespace minification',scope:'EXISTING_RELEASE_AND_SEC_RESOURCE_GATES_UNCHANGED'},
 serving:{tests:Number(serving.match(/Ran (\d+) tests/)?.[1]),pass:serving.includes('\nOK')?Number(serving.match(/Ran (\d+) tests/)?.[1]):0,fail:serving.includes('\nOK')?0:1,result:serving.includes('\nOK')?'PASS':'FAIL',command:'python3 -m unittest discover -s scripts/vu2'},
 resourceUnit:{tests:Number(resourceUnit.match(/tests (\d+)/)?.[1]),pass:Number(resourceUnit.match(/pass (\d+)/)?.[1]),fail:Number(resourceUnit.match(/fail (\d+)/)?.[1]),command:'node --test scripts/vu2/resource-budget.test.mjs'},
 productionSmoke:{checks:smoke.checks,pass:smoke.checks-smoke.failures,fail:smoke.failures,command:'node scripts/vu2/production-smoke.mjs PRIVATE_RELEASE --report PRIVATE_REPORT'},
 quantBrowser:{...checkCount(quant.checks),findings:quant.findings.length,command:'node scripts/vu2/browser-qa.mjs (release cwd, pinned Playwright 1.58.2 / axe 4.10.3)'},
 resourceBudgets:{...checkCount(resources.results),measurement:resources.measurement,scope:resources.scope},
 quantAccessibility:accessibility(axe.results),discoverBrowser:{...checkCount(discover.checks),errors:discover.errors.length},discoverAccessibility:accessibility(discoverAxe),
 globalCanonicalBrowser:{api:checkCount(global.apiChecks),ui:checkCount(global.uiChecks),pageErrors:global.pageErrors.length,result:global.pass?'PASS':'FAIL',coverage:global.counts,scope:'DELIVERY_IDENTITY_NATIVE_CURRENCY_WATCHLIST_SMOKE_NOT_CURRENT_PRICE_OR_ADJUSTMENT_CERTIFICATION'},
 namedJourneys:{checks:(journeys.match(/^OK  /gm)||[]).length,result:journeys.includes('ALLE PRUEFUNGEN BESTANDEN')?'PASS':'FAIL',command:'node scripts/vu2/verify-journey-surfaces.mjs --site PRIVATE_RELEASE'},
 publicDataHygiene:{result:hygiene.startsWith('Public data hygiene: no commercial-provider raw bars outside scoped previews;')?'PASS':'FAIL',command:'node scripts/market/assert-public-data-hygiene.mjs'}
};
function integer(value,label,positive=false){if(!Number.isSafeInteger(value)||value<(positive?1:0))throw Error('INVALID_COUNTER_'+label);}
for(const [key,scope]of Object.entries(broad.scopes)){
 for(const name of ['tests','pass','fail','skipped'])integer(scope[name],key+'_'+name,name==='tests');
 const cancelled=scope.cancelled??0,todo=scope.todo??0;integer(cancelled,key+'_cancelled');integer(todo,key+'_todo');
 if(scope.tests!==scope.pass+scope.fail+scope.skipped+cancelled+todo||scope.result!=='PASS')throw Error('INVALID_SUITE_TOTAL_'+key);
 const log=bytes(scope.logFile);if(createHash('sha256').update(log).digest('hex')!==scope.logSHA256)throw Error('SUITE_LOG_HASH_MISMATCH_'+key);
}
for(const name of ['serving','resourceUnit']){const x=scopes[name];integer(x.tests,name+'_tests',true);integer(x.pass,name+'_pass');integer(x.fail,name+'_fail');if(x.tests!==x.pass+x.fail)throw Error('INVALID_TOTAL_'+name);}
if(!axe.results.length||!discoverAxe.length||!quant.checks.length||!resources.results.length||!discover.checks.length||!global.apiChecks.length||!global.uiChecks.length)throw Error('EMPTY_BROWSER_EVIDENCE');
integer(smoke.checks,'production_smoke_checks',true);integer(smoke.failures,'production_smoke_failures');
if(scopes.namedJourneys.checks!==12)throw Error('INCOMPLETE_NAMED_JOURNEYS');
for(const [key,scope]of Object.entries(scopes))if(scope.fail>0||['FAIL','FAILED'].includes(scope.result)||scope.errors>0||scope.findings>0||scope.violations>0)throw Error('FAILED_EVIDENCE_'+key);
if(protectedOutputs.result!=='PASS'||!Object.keys(protectedOutputs.groups).length||!Object.values(protectedOutputs.groups).every(g=>g.identical))throw Error('PROTECTED_OUTPUT_DIFFERENCE');
const times=[broad.generatedAt,smoke.generatedAt].map(Date.parse);if(!times.every(Number.isFinite))throw Error('INVALID_EVIDENCE_CLOCK');
const result={schemaVersion:'marketstack-product-fitness-tests-1.0.0',generatedAt:new Date(Math.max(...times)).toISOString(),scope:'LOCAL_FINAL_RESEARCH_BRANCH_SUITES_AND_RELEASE_BROWSER_SMOKES',acceptedBaseline:protectedOutputs.acceptedBaselineCommit,scopes,priorIntroducedFailure:broad.priorIntroducedFailure,esefSampleComparison:broad.esefSampleComparison,protectedOutputs,sourceEvidence:inputs};
writeFileSync(arg('out','reports/marketstack/marketstack_product_fitness_tests.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({quant:scopes.quant.pass,product:scopes.product.pass,sec:scopes.sec.pass,esef:scopes.esef.pass,protectedOutputs:'PASS'}));
