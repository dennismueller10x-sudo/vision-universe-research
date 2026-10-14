import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,root,validateConfig} from '../scripts/build.mjs';
import {CONSENT_TEXT} from '../server/newsletter.mjs';
test('Neue Konfiguration akzeptiert keine Iframes, fremden Ziele oder fehlende Freigaben',()=>{
  for(const config of [{apiKey:'synthetic'},{formUrl:'https://test.sibforms.com/serve/id'},{actionUrl:'/api/other'},{mode:'public'},{mode:'public',liveFlowVerified:true,privacyReviewed:false},{mode:'public',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:''},{privacyReviewed:'true'}])assert.throws(()=>validateConfig(config));
});
test('Datenschutz-Entwurf wird auch bei gesetztem Freigabeflag abgelehnt',async()=>{
  await assert.rejects(build({config:{privacyReviewed:true,privacyHtmlPath:'datenschutz/index.html'},output:resolve(root,'tests/output/draft-blocked')}),/kein freigegebener Rechtstext/);
});
test('Freigabe nur für den Betreiber-Test lässt sich nicht als allgemeine Anmeldung bauen',async()=>{
  await mkdir(resolve(root,'tests/output'),{recursive:true});
  const policyPath='tests/output/controlled-only-policy.html';
  await writeFile(resolve(root,policyPath),'<!doctype html><html lang="de" data-policy-status="approved" data-newsletter-release-scope="controlled"><head><title>Synthetic policy</title></head><body>Controlled test only</body></html>');
  const config={privacyReviewed:true,privacyHtmlPath:policyPath,liveFlowVerified:true};
  const output=resolve(root,'tests/output/controlled-only-release');
  await build({config:{...config,mode:'controlled'},production:true,output});
  assert.match(await readFile(resolve(output,'index.html'),'utf8'),/<fieldset disabled>/);
  await assert.rejects(build({config:{...config,mode:'public'},production:true,output:resolve(root,'tests/output/controlled-public-rejected')}),/ausschließlich für den kontrollierten Test/);
});
test('Build enthält Servercode ohne Schlüsselwerte, keinen Iframe oder Datenbank',async()=>{
  const secret='SYNTHETIC_KEY_NEVER_PUBLISH';process.env.BREVO_API_KEY=secret;process.env.NEWSLETTER_RATE_KEY=secret;
  try{
    const output=resolve(root,'tests/output/runtime-isolated');await build({output});const files=await readdir(output,{recursive:true});
    assert.ok(files.every(n=>!/(^|\/)(server|scripts|mail|functions|warteliste|abmelden)(\/|$)/.test(n)));
    for(const name of files.filter(n=>/\.(html|js|json|css)$/.test(n)))assert.ok(!(await readFile(resolve(output,name),'utf8')).includes(secret));
    assert.doesNotMatch(await readFile(resolve(output,'index.html'),'utf8'),/<iframe|sibforms/);
    assert.ok(files.includes('_worker.js'));assert.match(await readFile(resolve(output,'_headers'),'utf8'),/frame-src 'none'/);
  }finally{delete process.env.BREVO_API_KEY;delete process.env.NEWSLETTER_RATE_KEY;}
});
test('API-DOI-Mail verwendet den richtigen Link und die identische Einwilligung',async()=>{
  const mail=await readFile(resolve(root,'mail/newsletter-api-doi.html'),'utf8');assert.match(mail,/href="{{ params.DOIurl }}"/);assert.doesNotMatch(mail,/{{ doubleoptin }}|App-Warteliste|App-Anmeldung/);
  assert.ok(mail.includes(CONSENT_TEXT));assert.ok((await readFile(resolve(root,'index.html'),'utf8')).includes(CONSENT_TEXT));
});
