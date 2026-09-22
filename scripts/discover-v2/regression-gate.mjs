#!/usr/bin/env node
// Compare the parallel view against the audited production source, including
// uncommitted edits. Never rebuild data while checking preservation.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const git=(...args)=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const fixedBaseline='c84caa38382022a6bd65fc00df0ec20389bc96e1';
const baseline=process.env.DISCOVER_BASELINE||(()=>{try{return git('merge-base','HEAD','origin/main').toString().trim();}catch{return fixedBaseline;}})();
const allowedPaths=new Set([
  'discover-v2/app.css','discover-v2/app.js','discover-v2/detail.css','discover-v2/detail.js',
  'discover-v2/home.css','discover-v2/home.js','discover-v2/index.html',
  'scripts/discover-v2/browser-qa.mjs','scripts/discover-v2/contract-qa.mjs','scripts/discover-v2/regression-gate.mjs',
  'docs/discover-v2/premium-orchestration.md','docs/discover-v2/premium-contract-audit.md',
  'docs/discover-v2/premium-design-qa.md',
  'discover/config/company-recognition.json',
  'discover/engines/discovery-eligibility.js','discover/tests/discovery-eligibility.test.mjs',
  'scripts/discover/build-discover-data.mjs',
  // Migriert eine Oberflaeche auf den zentralen Currency Contract, muss sie
  // dessen eigene Nachweise mitfuehren: die Testmatrix bucht die Seite in
  // M12-5 und O16-1 ein, das Register zaehlt eine Klasse-A-Stelle weniger,
  // der Oberflaechen-Nachweis prueft UI8 wieder voll. Ohne sie waere die
  // Migration gruen und die Zusage daneben unwahr.
  // Das Einfrieren von Discover 1.0 (frozenDiscoverFrontend, unten) bleibt
  // davon unberuehrt - das ist der Schutz, auf den es ankommt.
  'quant/tests/currency-fx-matrix.test.mjs','quant/data/market/fx/currency-debt-register.json',
  'quant/config/currency-formatting-baseline.json','scripts/quality/verify-currency-ui.mjs',
  'docs/VU_CURRENCY_FX_LAYER.md'
]);
const allowedPrefixes=['discover/data/'];
const allowed=path=>allowedPaths.has(path)||allowedPrefixes.some(prefix=>path.startsWith(prefix));
const frozenDiscoverFrontend=[
  'discover/index.html','discover/app.js','discover/discover.css',
  ...git('ls-tree','-r','--name-only',baseline,'discover/ui').toString().trim().split('\n').filter(Boolean)
];
const files=git('ls-tree','-r','--name-only',baseline).toString().trim().split('\n').filter(path=>path&&!allowed(path));
const changed=git('diff','--name-only',baseline).toString().trim().split('\n').filter(path=>path&&!allowed(path));
const untracked=git('ls-files','--others','--exclude-standard').toString().trim().split('\n').filter(path=>path&&!allowed(path));
assert.deepEqual([...changed,...untracked],[],'Files outside the isolated preview changed');
const checked=files.length;
for(const path of frozenDiscoverFrontend){
  assert.equal(readFileSync(path).toString(),git('show',baseline+':'+path).toString(),path+' differs from the frozen Discover 1.0 frontend');
}
const navPath='assets/site-navigation.js';
const before=git('show',baseline+':'+navPath).toString();
const after=readFileSync(navPath,'utf8');
const entry=/^.*\['Discover 2\.0',\s*'\/discover-v2\/'\],?\s*\n/gm;
assert.equal((after.match(entry)||[]).length,1,'Exactly one Discover 2.0 navigation entry required');
assert.equal(after,before,'Shared navigation must remain identical to production baseline');
const html=readFileSync('discover-v2/index.html','utf8');
assert(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html),'Preview must be noindex');
assert(/<vu-navigation[\s>]/i.test(html),'Shared navigation required');
assert(html.includes('/assets/site-navigation.css'),'Shared navigation CSS required');
assert(/lang=["']de["']/.test(html),'German document language required');
const permittedChanged=git('diff','--name-only',baseline).toString().trim().split('\n').filter(Boolean).filter(allowed);
const contractGate=JSON.parse(execFileSync(process.execPath,['scripts/discover-v2/contract-qa.mjs'],{maxBuffer:4*1024*1024}).toString());
assert.match(contractGate.status,/^PASS/,'Discover 2.1 contract gate failed');
console.log(JSON.stringify({status:'PASS',baseline,protectedFiles:checked,protectedDiscoverFrontend:frozenDiscoverFrontend,allowedPaths:[...allowedPaths].sort(),allowedPrefixes,permittedChanged,navigation:'UNCHANGED',preview:'NOINDEX',contractGate:{status:contractGate.status,b1:contractGate.b1,b2:contractGate.b2,b3:contractGate.b3,b4:contractGate.b4,b5:contractGate.b5,zeroCost:contractGate.zeroCost,eligibility:contractGate.eligibility}},null,2));
