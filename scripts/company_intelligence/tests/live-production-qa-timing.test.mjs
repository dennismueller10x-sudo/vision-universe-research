/* Audit 21.11.2026: Darstellungs-Timing in live-production-qa.mjs ist begrenzt wiederholbar, echte Inhaltspruefungen bleiben
   unmittelbar und unveraendert. Quelltext-Vertrag (kein Browser): jede Abwartefunktion steht VOR der unveraenderten Pruefung. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const src = readFileSync(fileURLToPath(new URL('../live-production-qa.mjs', import.meta.url)), 'utf8');

test('eventually wartet hoechstens 10 x 500 ms und gibt nur den Wert zurueck (keine Pruefung)', () => {
 assert.match(src, /async function eventually\(read,\{tries=10,delayMs=500\}=\{\}\)/);
 assert.doesNotMatch(src.match(/async function eventually[\s\S]*?\n\}/)[0], /assert|throw/);
});
test('Ueberlauf, Navigation und Kapitel-Links werden erst abgewartet, dann unveraendert geprueft', () => {
 assert.match(src, /await eventually\(async\(\)=>!\(await page\.evaluate\(\(\)=>document\.documentElement\.scrollWidth>innerWidth\)\)\);assert\.equal\(await page\.evaluate\(\(\)=>document\.documentElement\.scrollWidth>innerWidth\),false\)/);
 assert.match(src, /await eventually\(async\(\)=>\(await page\.locator\('vu-navigation'\)\.count\(\)\)===1&&\(await chapter\.locator\('a'\)\.count\(\)\)>0\);assert\.equal\(await page\.locator\('vu-navigation'\)\.count\(\),1\);assert\(await chapter\.locator\('a'\)\.count\(\)>0\)/);
});
test('Navigation: nur TimeoutError wird wiederholt (3 Versuche), alles andere sofort', () => {
 const g = src.match(/async function gotoWithRetry[\s\S]*?\n\}/)[0];
 assert.match(g, /attempts=3/);
 assert.match(g, /e\?\.name!=='TimeoutError'\)throw e/);
});
test('Screenshot ist Kosmetik (3 Versuche, dann ohne Bild); der Bericht nennt es', () => {
 assert.match(src, /async function shoot\(page,path\)\{\n for\(let i=0;i<3;i\+\+\)/);
 assert.match(src, /status:'PASS',screenshot,consumerRequests/);
});
test('Inhaltspruefungen bleiben sofort: Text, Seitenfehler, Antworten, Manifest-Hashes, geschlossenes Gate', () => {
 for (const needle of ["includes('derzeit nicht verfügbar'),ticker)", 'assert.deepEqual(errors,[])', 'assertConsumerResponses(responses,ticker)',
  'assert.equal(bytes.length,meta.bytes,path)', "createHash('sha256').update(bytes).digest('hex'),meta.sha256,path)", "assert.equal(await closed.locator('.ci-company-intelligence').count(),0)", "assert.equal(release.sourceCommit,expectedSha,'WRONG_PRODUCTION_COMMIT')"])
  assert.ok(src.includes(needle), needle);
});
