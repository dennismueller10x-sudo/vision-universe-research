// Read-only Cloudflare access audit. Never emits credentials or raw API bodies.
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const zoneName='visionuniverse.de';
const repository={owner:'dennismueller10x-sudo',name:'vision-universe-research'};
const tokenNames=['LANDING_CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_TOKEN','CLOUDFLARE_TOKEN','CF_API_TOKEN','CLOUDFLARE_API'];
const tokenName=tokenNames.find(n=>process.env[n]);
const token=tokenName?process.env[tokenName]:null;
const endpoint=process.env.VU_HISTORY_S3_ENDPOINT||'';
let account=process.env.CLOUDFLARE_ACCOUNT_ID||'';
if(!account){try{account=new URL(endpoint).hostname.match(/^([a-f0-9]{32})\.r2\.cloudflarestorage\.com$/)?.[1]||''}catch{}}
const output=process.env.LANDING_AUDIT_OUTPUT;
if(!output)throw Error('Temporäres Audit-Ausgabeverzeichnis fehlt.');
const report={checkedAt:new Date().toISOString(),readOnly:true,tokenPresent:!!token,tokenName:tokenName||null,accountResolved:/^[a-f0-9]{32}$/.test(account),checks:[],projects:[],zone:null};
async function get(path,label){
  try{
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
    let body;try{body=await response.json()}catch{body={}}
    const ok=response.ok&&body.success===true;
    report.checks.push({label,status:response.status,ok,errorCodes:ok?[]:(body.errors||[]).map(e=>e.code).filter(c=>Number.isInteger(c))});
    return ok?body:null;
  }catch{report.checks.push({label,status:null,ok:false,errorCodes:[],networkFailure:true});return null;}
}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));return value;}
function fingerprint(record){
  const fields=['id','name','type','content','ttl','priority','proxied','data','settings','comment','tags'];
  return createHash('sha256').update(JSON.stringify(stable(Object.fromEntries(fields.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]))))).digest('hex');
}
if(token){
  if(report.accountResolved){
    const pages=await get(`/accounts/${account}/pages/projects`,'Pages-Projekte lesen');
    if(pages){
      report.projects=pages.result.filter(p=>p.source?.type==='github'&&p.source.config?.owner===repository.owner&&p.source.config?.repo_name===repository.name).map(p=>({name:p.name,subdomain:p.subdomain,productionBranch:p.production_branch,buildConfig:Object.fromEntries(['root_dir','build_command','destination_dir'].map(k=>[k,p.build_config?.[k]])),source:{type:'github',owner:repository.owner,repo:repository.name},domains:(p.domains||[]).filter(d=>[zoneName,'www.'+zoneName,p.subdomain].includes(d))}));
      report.repositoryConnection=report.projects.length?'Vorhandenes Pages-Projekt aus diesem Repository gefunden':'Keine bestehende Pages-Verbindung dieses Repositorys nachgewiesen; GitHub-Autorisierung kann erforderlich sein';
    }
  }
  const zones=await get(`/zones?name=${zoneName}`,'Zone lesen');
  if(zones){
    const candidates=zones.result.filter(z=>z.name===zoneName);
    if(candidates.length===1){
      const zone=candidates[0];
      report.zone={name:zoneName,status:zone.status,accountMatches:report.accountResolved?zone.account.id===account:null,nameservers:zone.name_servers,recordsComplete:false,web:[],protected:[]};
      const records=[];
      for(let page=1;page<=100;page++){
        const body=await get(`/zones/${zone.id}/dns_records?per_page=100&page=${page}`,'DNS lesen, Seite '+page);
        if(!body)break;
        records.push(...body.result);
        if(page>=(body.result_info?.total_pages||1)){report.zone.recordsComplete=true;break;}
      }
      for(const record of records){
        if(record.name===zoneName||record.name==='www.'+zoneName){
          if(['A','AAAA','CNAME'].includes(record.type)){
            report.zone.web.push({name:record.name,type:record.type,content:record.content,ttl:record.ttl,proxied:record.proxied,shopify:/myshopify\.com\.?$/.test(record.content)||record.content==='23.227.38.65',fingerprint:fingerprint(record)});
            continue;
          }
        }
        // Everything outside the two web hosts, plus all mail/TXT records, is protected.
        report.zone.protected.push({name:record.name,type:record.type,fingerprint:fingerprint(record)});
      }
      report.zone.protected.sort((a,b)=>(a.name+a.type+a.fingerprint).localeCompare(b.name+b.type+b.fingerprint));
      report.zone.protectedSha256=createHash('sha256').update(JSON.stringify(report.zone.protected)).digest('hex');
    }
  }
}
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'cloudflare-audit.json'),JSON.stringify(report,null,2)+'\n');
// Logs contain only capability results; DNS/connection inventory stays in the artifact.
console.log(JSON.stringify({readOnly:true,tokenPresent:report.tokenPresent,accountResolved:report.accountResolved,checks:report.checks,matchingPagesProjects:report.projects.length,zoneStatus:report.zone?.status||null,dnsComplete:report.zone?.recordsComplete||false}));
if(!token||!report.accountResolved||!report.zone?.recordsComplete||report.checks.some(c=>!c.ok))process.exitCode=1;
