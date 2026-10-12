// Verify the manually created project only. Never create or change resources.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from './build.mjs';

const tokenName=['LANDING_CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_TOKEN','CLOUDFLARE_TOKEN','CF_API_TOKEN','CLOUDFLARE_API'].find(n=>process.env[n]);
const token=tokenName?process.env[tokenName]:null;
let account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
if(!account){try{account=new URL(process.env.VU_HISTORY_S3_ENDPOINT||'').hostname.match(/^([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/)?.[1]||''}catch{}}
const output=process.env.LANDING_AUDIT_OUTPUT;
if(!output)throw Error('Temporäres Ausgabeverzeichnis fehlt.');
const config=JSON.parse(await readFile(resolve(root,'deployment/cloudflare-pages.json'),'utf8'));
const owner='dennismueller10x-sudo',repo='vision-universe-research',name='vision-universe';
const report={checkedAt:new Date().toISOString(),operation:'verify-existing-project',readOnly:true,dnsChanged:false,domainsAttached:false,projectCreated:false,checks:[]};
async function api(path){
  const method='GET';
  try{
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{method,headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
    let data;try{data=await response.json()}catch{data={}}
    // Classify errors without exposing provider text, account identifiers or headers.
    const categories=[...new Set((data.errors||[]).map(e=>{
      const message=String(e.message||'');
      if(/github|git provider/i.test(message))return 'GitHub authorization';
      if(/repository|repositories/i.test(message))return 'Repository authorization';
      if(/permission|scope/i.test(message))return 'API permission';
      if(/auth|credential/i.test(message))return 'Authentication';
      if(/invalid|validation|configuration/i.test(message))return 'Configuration';
      return 'Provider rejection';
    }))];
    report.checks.push({method,status:response.status,ok:response.ok&&data.success===true,errorCodes:(data.errors||[]).map(e=>e.code).filter(Number.isInteger),errorCategories:categories});
    if(!response.ok||data.success!==true)throw Error('Cloudflare-Anfrage nicht freigegeben: HTTP '+response.status);
    return data.result;
  }catch(error){if(error.message.startsWith('Cloudflare-Anfrage'))throw error;throw Error('Cloudflare-Anfrage fehlgeschlagen; keine Rohantwort ausgegeben.');}
}
try{
  if(!token||!/^[a-f0-9]{32}$/.test(account))throw Error('Vorhandener Cloudflare-Zugang oder Kontozuordnung fehlt.');
  if(config.name!==name||config.source?.type!=='github'||config.source.config.owner!==owner||config.source.config.repo_name!==repo||config.production_branch!=='main'||config.build_config.root_dir!=='landing'||config.build_config.build_command!=='node scripts/build.mjs'||config.build_config.destination_dir!=='dist')throw Error('Fremdes Projekt/Repository oder abweichende Build-Konfiguration.');
  const zones=await api('/zones?name=visionuniverse.de');
  if(zones.length!==1||zones[0].name!=='visionuniverse.de'||zones[0].status!=='active'||zones[0].account.id!==account)throw Error('Aktive Domain liegt nicht eindeutig im ausgewählten Konto.');
  const projects=await api(`/accounts/${account}/pages/projects`);
  const project=projects.find(p=>p.name===name);
  if(project){
    if(project.source?.type!=='github'||project.source.config.owner!==owner||project.source.config.repo_name!==repo||project.build_config?.root_dir!=='landing')throw Error('Namenskollision: bestehendes Projekt wird nicht verändert.');
    if(project.production_branch!=='main'||project.build_config.build_command!==config.build_config.build_command||project.build_config.destination_dir!=='dist')throw Error('Vorhandene Landing-Konfiguration benötigt gezielte Prüfung; keine blinde Ersetzung.');
    report.existingProjectVerified=true;
  }else{
    throw Error('Das eingerichtete Projekt vision-universe ist nicht sichtbar. Kein Ersatzprojekt wird angelegt.');
  }
  report.project={name:project.name,subdomain:project.subdomain,productionBranch:project.production_branch};
  report.productionState='Öffentlicher Inhalt und Datenschutz müssen unabhängig vom erfolgreichen Build geprüft werden.';
}catch(error){report.blocked=error.message;process.exitCode=1;}
await mkdir(output,{recursive:true});await writeFile(resolve(output,'cloudflare-project.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
