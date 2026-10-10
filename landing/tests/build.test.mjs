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
  for(const config of [{apiKey:'TEST-SECRET'}, {actionUrl:'https://evil.example/serve/id'}, {actionUrl:'https://test.sibforms.com/serve/TEST'}, {actionUrl:'https://test.sibforms.com/serve/TEST',doubleOptInVerified:true,privacyReviewed:true,privacyHtmlPath:'privacy.html',sourceAttribute:'EMAIL'}])assert.throws(()=>validateConfig(config));
});
test('Öffentlicher Build benötigt passende geprüfte Datenschutzhinweise',async()=>{
  await assert.rejects(build({production:true,output:resolve(root,'tests/output/production-blocked')}),/Datenschutzhinweise/);
});
test('Konfiguriertes Formular sendet ausschließlich an Brevo mit Einwilligung und Quelle',async()=>{
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  await writeFile(resolve(root,'tests/output/privacy-fixture.html'),'<!doctype html><html lang="de"><head><title>Nur Testfixture</title></head><body>Kein freigegebener Rechtstext</body></html>');
  const output=resolve(root,'tests/output/ready');
  await build({output,config:{actionUrl:'https://test.sibforms.com/serve/TEST-ONLY',doubleOptInVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html',sourceAttribute:'SOURCE'}});
  const html=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(html,/action="https:\/\/test.sibforms.com\/serve\/TEST-ONLY"/);assert.match(html,/name="SOURCE" value="Coming-soon-Landingpage"/);assert.match(html,/name="OPT_IN" type="checkbox" value="1" required/);assert.doesNotMatch(html,/<fieldset disabled>|checked[\s=>]|novalidate/);assert.match(html,/Bestätige darin deine Anmeldung/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/form-action https:\/\/test.sibforms.com/);
});
test('Build darf keine Research- oder beliebigen Verzeichnisse überschreiben',async()=>{
  for(const output of [root,resolve(root,'..'),'/tmp/landing-unowned'])await assert.rejects(build({output}),/Ausgabe nur/);
});
