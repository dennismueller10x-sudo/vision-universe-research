import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTarget,waitForRelease,redactSecrets} from '../europe-public-live-qa.mjs';
const expected='a'.repeat(40);
test('live QA is fixed to the reviewed production origin',()=>{
 assert.equal(publicTarget(),'https://research.visionuniverse.de');
 for(const target of ['http://research.visionuniverse.de','https://example.com','https://research.visionuniverse.de.attacker.test','https://research.visionuniverse.de?token=secret'])assert.throws(()=>publicTarget(target),/REVIEWED_PUBLIC_SITE_REQUIRED/);
});
test('live QA waits for the exact deployed commit and ignores earlier builds',async()=>{
 const calls=[],pauses=[];let count=0;
 const result=await waitForRelease({origin:publicTarget(),expected,pause:async ms=>pauses.push(ms),fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({sourceCommit:++count===1?'b'.repeat(40):expected})};}});
 assert.equal(result.sourceCommit,expected);assert.equal(result.attempts,2);assert.deepEqual(pauses,[5000]);assert.equal(calls[0].options.cache,'no-store');assert.ok(calls.every(c=>c.url.startsWith(publicTarget()+'/release-delivery.json?')));
});
test('unavailable release metadata cannot become successful live evidence',async()=>{
 await assert.rejects(waitForRelease({origin:publicTarget(),expected,deadlineMs:0,fetcher:async()=>{throw Error('offline');}}),/EXPECTED_PRODUCTION_RELEASE_NOT_OBSERVED/);
});
test('live QA rejects an absent or malformed expected SHA before fetch',async()=>{
 let calls=0;
 for(const value of ['', 'a'.repeat(39),'G'.repeat(40)])await assert.rejects(waitForRelease({origin:publicTarget(),expected:value,fetcher:async()=>{calls++;throw Error();}}),/EXPECTED_SOURCE_SHA_REQUIRED/);
 assert.equal(calls,0);
});

test('QA redacts plaintext and derived keys literally in error and browser messages',()=>{
 const password='fixture.+[password]',key='abc123'.repeat(10)+'abcd',message='console '+password+' stack '+key+' repeated '+password;
 const redacted=redactSecrets(message,[password,key]);
 assert.ok(!redacted.includes(password));assert.ok(!redacted.includes(key));assert.equal(redacted.match(/\[REDACTED\]/g).length,3);
 assert.equal(redactSecrets('unchanged',[undefined,'']),'unchanged');
});

test('EQ-Befunde: jeder Befund bekommt Screenshot und Namen, das Szenario laeuft weiter, am Ende scheitert der Lauf einmal mit allen (21.11.2026)', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../europe-public-live-qa.mjs', import.meta.url), 'utf8');
  assert.match(src, /async function befund\(step,error\)\{[^}]*failures\.push\(\{scenario:scenario\.key,step,message\}\)[^]*FEHLER-/, 'Schritt-Befund mit Screenshot');
  for (const step of ['europa-vollliste', 'rheinmetall-detail', 'us-320']) assert.ok(src.includes("befund('" + step + "',error)"), 'Schritt ' + step + ' faengt seinen Fehler');
  assert.match(src, /step:'szenario'/, 'ein Fehler im Szenario ist ein Befund, der naechste Browser laeuft trotzdem');
  assert.match(src, /console\.log\('ZAHLEN '/, 'Zaehlzahlen der Vollliste immer im Log');
  assert.match(src, /deployment,reports,failures\}/, 'Beleg nennt die Befunde');
  assert.match(src, /if\(failures\.length\)throw Error\('Befunde \('/, 'am Ende scheitert der Lauf mit allen Befunden');
  assert.ok(src.indexOf("receipt.json") < src.indexOf("if(failures.length)throw"), 'Beleg wird vor dem Scheitern geschrieben');
});

test('EQ-Preis: der Rheinmetall-Block liest den SICHTBAREN Preis (alter Kopf .dx-dhero ist per CSS ausgeblendet, 21.11.2026)', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../europe-public-live-qa.mjs', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("#/s/EUROPE/ref_RHM_DE_XETR';"), src.indexOf("liveProof=")) ;
  assert.match(block, /\.dx-chart-hero-preis \.num, \.dx-price b'\)\.filter\(\{visible:true\}\)\.first\(\)/);
  assert.ok(!/waitForSelector\('\.dx-price b'\)/.test(block), 'kein Warten auf das erste .dx-price b (steht im ausgeblendeten Kopf)');
  assert.match(block, /price:await sichtbarerPreis\.innerText\(\)/);
});

