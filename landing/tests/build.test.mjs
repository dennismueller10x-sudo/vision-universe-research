import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,root,validateConfig} from '../scripts/build.mjs';

test('Ohne Einrichtung bleibt das Formular auch ohne JavaScript gesperrt',async()=>{
  const output=resolve(root,'tests/output/blocked');await build({output});
  const html=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(html,/<fieldset disabled>/);assert.match(html,/data-ready="false"/);assert.doesNotMatch(html,/<form[^>]*action=/);
  assert.match(html,/noch nicht entgegennehmen/);assert.match(html,/noindex, nofollow/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/form-action 'none'/);
});
test('Ungültige oder unvollständige Konfiguration wird abgelehnt',()=>{
  for(const config of [{apiKey:'TEST-SECRET'}, {actionUrl:'https://evil.example/serve/id'}, {actionUrl:'https://test.sibforms.com/serve/TEST'}, {actionUrl:'/api/waitlist/signup',doubleOptInVerified:true,privacyReviewed:true,privacyHtmlPath:'privacy.html',sourceAttribute:'EMAIL'}])assert.throws(()=>validateConfig(config));
});
test('Öffentlicher Build benötigt passende geprüfte Datenschutzhinweise',async()=>{
  await assert.rejects(build({production:true,output:resolve(root,'tests/output/production-blocked')}),/Datenschutzhinweise/);
});
test('Konfiguriertes Formular bettet Brevo ein; keine eigenen Eingaben oder POSTs',async()=>{
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  await writeFile(resolve(root,'tests/output/privacy-fixture.html'),'<!doctype html><html lang="de"><head><title>Nur Testfixture</title></head><body>Kein freigegebener Rechtstext</body></html>');
  const output=resolve(root,'tests/output/ready');
  await build({output,config:{formUrl:'https://test.sibforms.com/serve/SYNTHETIC_FORM',unsubscribeFormUrl:'https://test.sibforms.com/serve/SYNTHETIC_UNSUBSCRIBE',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
  const html=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(html,/iframe title="Anmeldung zur VU App-Warteliste"/);
  assert.match(html,/src="https:\/\/test.sibforms.com\/serve\/SYNTHETIC_FORM"/);
  assert.match(html,/referrerpolicy="no-referrer"/);assert.match(html,/rel="noopener noreferrer"/);
  assert.doesNotMatch(html,/<form\b|name="EMAIL"|name="OPT_IN"|\/api\/waitlist/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/connect-src 'none'; form-action 'none'; frame-src https:\/\/test.sibforms.com/);
  const confirmed=await readFile(resolve(output,'warteliste/bestaetigt/index.html'),'utf8');
  assert.match(confirmed,/href="https:\/\/test.sibforms.com\/serve\/SYNTHETIC_UNSUBSCRIBE"/);
  assert.match(confirmed,/direkter Aufruf dieser Seite bestätigt keine Anmeldung/);
  assert.doesNotMatch(confirmed,/<script|params\.|token|\/api\//);

});
test('Build darf keine Research- oder beliebigen Verzeichnisse überschreiben',async()=>{
  for(const output of [root,resolve(root,'..'),'/tmp/landing-unowned'])await assert.rejects(build({output}),/Ausgabe nur/);
});
