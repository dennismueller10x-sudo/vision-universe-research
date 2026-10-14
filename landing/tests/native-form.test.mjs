import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build,root,validateConfig} from '../scripts/build.mjs';
const ready={formUrl:'https://test.sibforms.com/serve/SYNTHETIC_FORM',unsubscribeFormUrl:'https://test.sibforms.com/serve/SYNTHETIC_UNSUBSCRIBE',liveFlowVerified:true,privacyReviewed:true,privacyHtmlPath:'test-only.html'};
test('Formularkonfiguration erlaubt nur Brevo-Adressen und vollständige echte Freigaben',()=>{
  for(const config of [{apiKey:'SYNTHETIC_SECRET'}, {actionUrl:'/api/waitlist/signup'},
    {...ready,formUrl:'https://evil.example/serve/id'}, {...ready,formUrl:'/api/waitlist/signup'},
    {...ready,formUrl:'https://test.sibforms.com.evil.example/serve/id'},
    {...ready,formUrl:'https://test.sibforms.com/serve/id?redirect=other'},
    {...ready,formUrl:'https://user@test.sibforms.com/serve/id'},
    {...ready,formUrl:'http://test.sibforms.com/serve/id'},
    {...ready,formUrl:'https://test.sibforms.com/serve/id#secret'},
    {...ready,liveFlowVerified:false}, {...ready,privacyReviewed:false},
    {...ready,privacyHtmlPath:''}, {...ready,unsubscribeFormUrl:''},
    {...ready,unsubscribeFormUrl:ready.formUrl}, {...ready,frameHeight:639},
    {...ready,frameHeight:'850'}, {...ready,privacyReviewed:'true'}])assert.throws(()=>validateConfig(config));
});
test('Datenschutz-Entwurf kann auch mit Freigabeflag nicht veröffentlicht werden',async()=>{
  await assert.rejects(build({config:{privacyReviewed:true,privacyHtmlPath:'datenschutz/index.html'},output:resolve(root,'tests/output/draft-blocked')}),/kein freigegebener Rechtstext/);
});
test('Statischer Build enthält keine Worker, Datenbank, Operatoren oder Secrets',async()=>{
  const secret='SYNTHETIC_KEY_NEVER_PUBLISH';process.env.BREVO_API_KEY=secret;process.env.WAITLIST_TOKEN_KEY=secret;
  try{
    const output=resolve(root,'tests/output/static-only');await build({output});
    const files=await readdir(output,{recursive:true});
    assert.ok(files.every(name=>!/(^|\/)(server|scripts|mail|functions|warteliste|_worker[^/]*|_routes.json|abmelden)(\/|$)/.test(name)));
    for(const name of files.filter(n=>/\.(html|js|json|css)$/.test(n)))assert.ok(!(await readFile(resolve(output,name),'utf8')).includes(secret));
    const html=await readFile(resolve(output,'index.html'),'utf8');assert.doesNotMatch(html,/<iframe/);
  }finally{delete process.env.BREVO_API_KEY;delete process.env.WAITLIST_TOKEN_KEY;}
});
test('DOI-Mail nutzt nativen Platzhalter und wortgleiche Einwilligung',async()=>{
  const html=await readFile(resolve(root,'mail/newsletter-doi.html'),'utf8');
  assert.match(html,/href="{{ doubleoptin }}"/);assert.doesNotMatch(html,/App-Warteliste|App-Anmeldung|App-Mail|Launch-News/);assert.doesNotMatch(html,/params\.|\/api\/|token|unsubscribe_url/);
  const consent='Ich möchte den Vision-Universe-Newsletter per E-Mail erhalten: Neuigkeiten zu Vision Universe, neue Research-Inhalte und Informationen zu seinen Produkten einschließlich des App-Starts. Ich kann mich jederzeit über den Abmeldelink abmelden.';
  assert.ok(html.includes(consent));assert.ok((await readFile(resolve(root,'index.html'),'utf8')).includes(consent));
});

test('Nativer Abmeldelink ist für den privaten Test verfügbar, öffentliche Anmeldung bleibt gesperrt',async()=>{
  const output=resolve(root,'tests/output/unsubscribe-only');
  await build({output,config:{unsubscribeFormUrl:ready.unsubscribeFormUrl}});
  const home=await readFile(resolve(output,'index.html'),'utf8');
  assert.match(home,/<fieldset disabled>/);assert.doesNotMatch(home,/<iframe|<form[^>]*action=/);
  assert.match(await readFile(resolve(output,'_headers'),'utf8'),/frame-src 'none'/);
  const confirmation=await readFile(resolve(output,'newsletter/bestaetigt/index.html'),'utf8');
  assert.ok(confirmation.includes(ready.unsubscribeFormUrl));assert.doesNotMatch(confirmation,/<script|<form/);
  for(const url of ['https://evil.example/serve/id','/api/waitlist/unsubscribe'])assert.throws(()=>validateConfig({unsubscribeFormUrl:url}));
});
