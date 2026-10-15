/* live-production-qa.mjs als Ganzes ausfuehren (Kindprozess mit Fake-Fetch und Fake-Playwright): faengt Skriptfehler wie
   "reviewed is not defined" im Browserpfad nach bestandenem Beweis (Review-Befund PR #695). Kein Netz, kein Browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './fixtures/ci-site.mjs';
import {reviewed} from '../production-approval.mjs';

const SCRIPT = fileURLToPath(new URL('../live-production-qa.mjs', import.meta.url));

function runQa(site, {routine = true} = {}) {
 const dir = mkdtempSync(join(tmpdir(), 'ci-live-qa-')), nm = join(dir, 'node_modules/playwright');
 mkdirSync(nm, {recursive: true}); mkdirSync(join(dir, 'out'));
 writeFileSync(join(nm, 'package.json'), '{"name":"playwright","main":"index.js"}');
 writeFileSync(join(nm, 'index.js'), "exports.chromium={launch:async()=>{throw Object.assign(new Error('FAKE_BROWSER'),{name:'FakeBrowser'});}};");
 writeFileSync(join(dir, 'site.json'), JSON.stringify([...site.map].map(([k, v]) => [k, v.toString('base64')])));
 writeFileSync(join(dir, 'stub.mjs'), `import {readFileSync} from 'node:fs';
const site=new Map(JSON.parse(readFileSync(process.env.STUB_SITE,'utf8')).map(([k,v])=>[k,Buffer.from(v,'base64')]));
const real=globalThis.fetch;
globalThis.fetch=async(url,init)=>{const u=new URL(String(url));if(u.origin!=='https://research.visionuniverse.de')throw new Error('KEIN_NETZ '+u.origin);
 const b=site.get(u.pathname);if(!b)return new Response('nf',{status:404});return new Response(b,{status:200,headers:{'x-cache':'HIT'}});};`);
 const r = spawnSync(process.execPath, ['--import', join(dir, 'stub.mjs'), SCRIPT, ...(routine ? ['--routine'] : []), '--out', join(dir, 'out')],
  {encoding: 'utf8', env: {...process.env, NODE_PATH: join(dir, 'node_modules'), STUB_SITE: join(dir, 'site.json'), CI_QA_BUDGET_MS: '1200000', EXPECTED_PRODUCTION_SHA: ''}, timeout: 60000});
 let report = null; try { report = JSON.parse(readFileSync(join(dir, 'out/report.json'), 'utf8')); } catch { /* kein Bericht */ }
 return {status: r.status, stderr: r.stderr, stdout: r.stdout, report};
}

const site = () => build({gen: reviewed.generation, cohort: reviewed.tickers.length, issuers: 45});

test('Skript laeuft nach bestandenem Beweis bis in die Asset-Pruefung: reviewed ist definiert (kein ReferenceError)', () => {
 const r = runQa(site());
 assert.notEqual(r.status, 0, 'ohne echte Assets/Browser muss der Lauf scheitern');
 assert.ok(r.report, 'Bericht muss entstehen: ' + r.stderr.slice(-600));
 assert.equal(r.report.cause, 'BROWSER_ASSERTION_AFTER_PROVEN_PROPAGATION');
 assert.equal(r.report.propagation.status, 'PROPAGATED');
 assert.notEqual(r.report.error.name, 'ReferenceError', r.report.error.message);
 assert.doesNotMatch(r.report.error.message, /is not defined/);
 // erreicht: reviewed.generation/issuers/tickers (delivery-Pruefung) UND reviewed.assets (Asset-Hash gegen Manifest)
 assert.equal(r.report.generation, reviewed.generation);
 assert.match(r.report.error.message, /index\.json|lookup|iss_cik/, 'Fehler stammt aus der Asset-Pruefung gegen reviewed.assets: ' + r.report.error.message);
});
