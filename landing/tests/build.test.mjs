import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
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
test('Freigegebenes Formular behält eigene Oberfläche und sendet ausschließlich zur eigenen API',async()=>{
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  await writeFile(resolve(root,'tests/output/privacy-fixture.html'),'<!doctype html><html lang="de"><head><title>Nur Testfixture</title></head><body>Kein freigegebener Rechtstext</body></html>');
  const output=resolve(root,'tests/output/ready');
  await build({output,config:{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-fixture.html'}});
  const html=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(html,/action="\/api\/newsletter\/subscribe"/);
  assert.match(html,/name="EMAIL"/);assert.match(html,/name="OPT_IN"/);assert.doesNotMatch(html,/<iframe|sibforms|<fieldset disabled>|novalidate/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/form-action 'self'; frame-src 'none'/);
  const confirmed=await readFile(resolve(output,'newsletter/bestaetigt/index.html'),'utf8');assert.match(confirmed,/direkter Aufruf dieser Seite bestätigt keine Anmeldung/);assert.doesNotMatch(confirmed,/<script|token|\/api\//);

});
test('Build darf keine Research- oder beliebigen Verzeichnisse überschreiben',async()=>{
  for(const output of [root,resolve(root,'..'),'/tmp/landing-unowned'])await assert.rejects(build({output}),/Ausgabe nur/);
});
test('Kontrollierter Hauptdomain-Build lässt normale Besucher geschlossen und verlangt konkrete Freigabe',async()=>{
  assert.throws(()=>validateConfig({mode:'controlled'}),/Datenschutz/);
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  await writeFile(resolve(root,'tests/output/privacy-controlled.html'),'<!doctype html><html lang="de"><head><title>Nur synthetische Freigabe</title></head><body>Test</body></html>');
  const output=resolve(root,'tests/output/controlled');
  await build({output,production:true,config:{mode:'controlled',privacyReviewed:true,privacyHtmlPath:'tests/output/privacy-controlled.html'}});
  const html=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(html,/data-ready="false" data-controlled="true"/);assert.match(html,/<fieldset disabled>/);
  assert.doesNotMatch(html,/NEWSLETTER_TEST_ACCESS_HASH|#vu-test=/);assert.match(await readFile(resolve(output,'_headers'),'utf8'),/form-action 'self'/);
});
test('Partnerpräsentation bleibt eigenständig, ohne fremde Quellen und außerhalb der Suche',async()=>{
  const output=resolve(root,'tests/output/partner');await build({output});
  const html=await readFile(resolve(output,'partner/index.html'),'utf8');
  assert.match(html,/<meta name="robots" content="noindex, nofollow">/);assert.match(html,/Content-Security-Policy[^>]*media-src &#39;self&#39;/);
  assert.match(html,/partner\.css\?v=[0-9a-f]{16}/);assert.match(html,/partner\.js\?v=[0-9a-f]{16}/);
  assert.doesNotMatch(html,/(src|href)="https?:\/\/(?!(?:www|research)\.visionuniverse\.de\/)/);assert.doesNotMatch(html,/<iframe|<form/);
  for(const src of html.matchAll(/(?:src|poster)="\.\/(media\/[^"]+)"/g))await readFile(resolve(output,'partner',src[1]));
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/media-src 'self'/);
});
test('Instagram-Seiten: keine App-Links, nur eigene Quellen, Listen verlinkt',async()=>{
  const output=resolve(root,'tests/output/instagram');await build({output});
  for(const page of ['instagram/index.html','instagram/robotaxi/index.html','instagram/energie/index.html']){
    const html=await readFile(resolve(output,page),'utf8');
    assert.match(html,/<meta name="robots" content="noindex, nofollow">/);assert.match(html,/Content-Security-Policy/);
    assert.doesNotMatch(html,/research\.visionuniverse\.de|data-app|App öffnen<\/a>/);
    assert.doesNotMatch(html,/(src|href)="https?:\/\//);assert.doesNotMatch(html,/<iframe|<form/);
    assert.match(html,/App bald verfügbar/);assert.match(html,/partner\.css\?v=[0-9a-f]{16}/);assert.match(html,/instagram\.css\?v=[0-9a-f]{16}/);
    for(const m of html.matchAll(/(?:src|poster|href)="(\.{1,2}\/[^"?#]+\.(?:css|js|png|jpg|mp4|woff2))(?:\?v=[0-9a-f]{16})?"/g))await readFile(resolve(output,dirname(page),m[1]));
  }
  const index=await readFile(resolve(output,'instagram/index.html'),'utf8');assert.match(index,/href="\.\/robotaxi\/"/);assert.match(index,/href="\.\/energie\/"/);
  const list=await readFile(resolve(output,'instagram/robotaxi/index.html'),'utf8');assert.equal((list.match(/<li>/g)||[]).length,10);assert.match(list,/keine Kauf- oder Verkaufsempfehlung/);
});
