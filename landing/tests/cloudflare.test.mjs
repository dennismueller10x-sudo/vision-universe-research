import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from '../scripts/build.mjs';

test('Cloudflare-Audit bleibt lesend und gibt weder Credentials noch TXT-Inhalte aus',async()=>{
  const output=resolve(root,'tests/output/cloudflare-audit');await mkdir(output,{recursive:true});
  const credential='TEST_ONLY_NOT_A_REAL_API_TOKEN';
  const privateText='TEST_ONLY_DNS_VERIFICATION_VALUE';
  const script=`
    globalThis.fetch=async(url,options)=>{
      if(options.method && options.method!=='GET')throw Error('Mutation forbidden');
      let result;
      if(url.endsWith('/pages/projects'))return {ok:false,status:403,json:async()=>({success:false,errors:[{code:10000,message:${JSON.stringify(credential)}}]})};
      if(url.includes('/zones?'))result=[{id:'fixture-zone',name:'visionuniverse.de',status:'active',account:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'},name_servers:['fixture.invalid']}];
      else result=[{id:'web',name:'www.visionuniverse.de',type:'CNAME',content:'shops.myshopify.com',ttl:300,proxied:true},{id:'mail',name:'visionuniverse.de',type:'TXT',content:${JSON.stringify(privateText)},ttl:300}];
      return {ok:true,status:200,json:async()=>({success:true,result,result_info:{total_pages:1}})};
    };
    await import(${JSON.stringify(pathToFileURL(resolve(root,'scripts/cloudflare-audit.mjs')).href)});
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,CLOUDFLARE_API_TOKEN:credential,CLOUDFLARE_ACCOUNT_ID:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',LANDING_AUDIT_OUTPUT:output},encoding:'utf8'});
  assert.equal(result.status,1); // Missing Pages rights really block readiness.
  const artifact=await readFile(resolve(output,'cloudflare-audit.json'),'utf8');
  for(const text of [result.stdout,result.stderr,artifact]){assert.ok(!text.includes(credential));assert.ok(!text.includes(privateText));}
  const report=JSON.parse(artifact);
  assert.equal(report.zone.recordsComplete,true);assert.equal(report.zone.web[0].shopify,true);
  assert.match(report.zone.protectedSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.checks.find(c=>c.label==='Pages-Projekte lesen').ok,false);
  assert.equal(report.checks.find(c=>c.label==='Pages-Projekte lesen').status,403);
  assert.ok(report.checks.every(c=>!c.networkFailure));
});

test('Unveränderter Pages-Build-Befehl kann den öffentlichen Datenschutz-Gate nicht umgehen',()=>{
  const result=spawnSync(process.execPath,[resolve(root,'scripts/build.mjs')],{env:{...process.env,LANDING_PUBLICATION_MODE:'production',LANDING_PRIVACY_REVIEWED:'',LANDING_PRIVACY_HTML_PATH:'',BREVO_FORM_ACTION:''},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Öffentliche Veröffentlichung blockiert/);
});

test('Pages-Vorbereitung schreibt nur das eigene Projekt und stoppt bei Namenskollision oder GitHub-Ablehnung',async()=>{
  for(const fixture of ['new','foreign','github-denied']){
    const output=resolve(root,'tests/output/cloudflare-prepare-'+fixture);
    const secret='TEST_ONLY_PROVIDER_TOKEN';
    const script=`
      const calls=[];
      globalThis.fetch=async(url,options)=>{
        calls.push({method:options.method,url});
        let result;
        if(url.includes('/zones?'))result=[{name:'visionuniverse.de',status:'active',account:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}}];
        else if(options.method==='GET')result=${fixture==='foreign'?'[{name:"vision-universe-landing",source:{type:"github",config:{owner:"someone-else",repo_name:"different"}},build_config:{root_dir:"research"}}]':'[]'};
        else {
          if(options.method!=='POST'||!url.endsWith('/pages/projects'))throw Error('Foreign mutation');
          const body=JSON.parse(options.body);
          if(body.source.config.repo_name!=='vision-universe-research'||body.build_config.root_dir!=='landing'||body.deployment_configs.production.env_vars.LANDING_PUBLICATION_MODE.value!=='production')throw Error('Unsafe configuration');
          ${fixture==='github-denied'?`return {ok:false,status:401,json:async()=>({success:false,errors:[{code:8000011,message:'GitHub authorization: ${secret}'}]})};`:''}
          result={name:body.name,production_branch:'main',subdomain:'test-fixture.pages.dev'};
        }
        return {ok:true,status:200,json:async()=>({success:true,result})};
      };
      await import(${JSON.stringify(pathToFileURL(resolve(root,'scripts/cloudflare-prepare.mjs')).href)});
      const fs=await import('node:fs/promises');await fs.writeFile(${JSON.stringify(resolve(output,'calls.json'))},JSON.stringify(calls));
    `;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,LANDING_CLOUDFLARE_API_TOKEN:secret,CLOUDFLARE_ACCOUNT_ID:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',LANDING_AUDIT_OUTPUT:output},encoding:'utf8'});
    assert.equal(result.status,fixture==='new'?0:1);
    const artifact=await readFile(resolve(output,'cloudflare-project.json'),'utf8');assert.ok(!artifact.includes(secret));assert.ok(!result.stdout.includes(secret));
    const report=JSON.parse(artifact);assert.equal(report.dnsChanged,false);assert.equal(report.domainsAttached,false);
    const calls=JSON.parse(await readFile(resolve(output,'calls.json'),'utf8'));
    assert.deepEqual(calls.map(c=>c.method),fixture==='foreign'?['GET','GET']:['GET','GET','POST']);
    if(fixture==='new')assert.equal(report.projectCreated,true);
    if(fixture==='github-denied')assert.deepEqual(report.checks.at(-1).errorCategories,['GitHub authorization']);
  }
});
