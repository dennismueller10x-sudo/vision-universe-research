/* Neuer Commit auf main vor dem eigenen Pages-Dispatch, damit Pages wirklich neu ausliefert.
 *
 * WARUM (10.11.2026): actions/deploy-pages@v4 setzt pages_build_version = GITHUB_SHA. Ein zweiter Deploy desselben Commits mit neuem
 * Inhalt wurde nicht uebernommen: Pages 42753904874 deployte die CI-Generation 2ff33541 um 04:19 als adbfda1c (nachts kein neuer
 * Commit), live blieb e1d74267, und der Refresh 42744743112 schaltete danach den Vollumfang ab. Ein `env: GITHUB_SHA` am
 * Deploy-Schritt (#1768) wirkt nicht: Lauf 42763174678 zeigte env GITHUB_SHA = <sha>-<run>-<attempt>, die Payload trug trotzdem
 * den reinen Commit. Bleibt nur ein neuer Commit vor dem Dispatch.
 *
 * WIE: Die Datei MARKER_PATH wird ueber die Contents-API (gh api, GITHUB_TOKEN) auf main geschrieben. Kein Checkout, kein git push;
 * die Datei-SHA ist der Vergleichswert (409/422 bei Wettlauf -> neu lesen, hoechstens `attempts` Versuche). Ein Commit mit dem
 * GITHUB_TOKEN loest keinen Workflow aus; der folgende `gh workflow run pages-release.yml --ref main` laeuft auf dem neuen Kopf.
 * Die Datei ist kein Datenartefakt und wird von nichts gelesen.
 *
 * Exit 0 = Marker geschrieben, Exit 1 = nicht geschrieben. Der Aufrufer macht dann wie bisher weiter (Warnung): der Dispatch liefert
 * aus, sobald main einen neuen Commit hat, und #1767 verhindert das Abschalten, wenn er es nicht tut. */
import {execFile} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const MARKER_PATH='company-intelligence/release-marker.json';
const REASONS=new Set(['refresh','universe-release','universe-recovery']);

export function markerBody({reason,runId,at,sha}){
 const content={schema:1,purpose:'Neue Pages-Build-Version vor dem eigenen Dispatch (deploy-pages nimmt den Commit als Version)',reason,runId:String(runId||'local'),at};
 return {message:`Pages-Release-Marker: ${reason} (Lauf ${content.runId})`,branch:'main',content:Buffer.from(JSON.stringify(content,null,1)+'\n').toString('base64'),...(sha?{sha}:{})};
}

/** gh: {get(path):Promise<{sha}|null> (null = Datei fehlt), put(path,body):Promise<{commit:{sha}}>}; Fehler mit .status (409/422 = Wettlauf). */
export async function writeMarker({gh,reason,runId,now=()=>new Date(),attempts=4,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!REASONS.has(reason))return {status:'REASON_INVALID'};
 let last=null;
 for(let n=1;n<=attempts;n++){
  try{
   const cur=await gh.get(MARKER_PATH);
   const res=await gh.put(MARKER_PATH,markerBody({reason,runId,at:now().toISOString(),sha:cur?.sha||null}));
   const commit=res?.commit?.sha;
   if(!/^[0-9a-f]{40}$/.test(String(commit||'')))return {status:'NO_COMMIT',attempts:n};
   return {status:'WRITTEN',commit,attempts:n};
  }catch(e){
   last=e;
   if(![409,422].includes(e?.status)||n===attempts)break;
   await sleep(2000*n);
  }
 }
 return {status:'FAILED',error:String(last?.status||last?.message||last).slice(0,120)};
}

const run=(args,input)=>new Promise((resolve,reject)=>{
 const p=execFile('gh',args,{timeout:60000,maxBuffer:1<<20},(e,out,err)=>{
  if(!e)return resolve(String(out));
  const m=/HTTP (\d{3})/.exec(String(err||''));const x=Error(String(err||e.message).slice(0,200));x.status=m?Number(m[1]):null;reject(x);
 });
 if(input!==undefined){p.stdin.end(input);}
});

export function realGh(repo=process.env.GITHUB_REPOSITORY){
 return {
  get:async path=>{try{return JSON.parse(await run(['api','-X','GET',`repos/${repo}/contents/${path}?ref=main`]));}catch(e){if(e.status===404)return null;throw e;}},
  put:async(path,body)=>JSON.parse(await run(['api','-X','PUT',`repos/${repo}/contents/${path}`,'--input','-'],JSON.stringify(body)))
 };
}

export async function main(argv=process.argv.slice(2),env=process.env,io={}){
 const i=argv.indexOf('--reason'),reason=i>=0?argv[i+1]:null;
 const r=await writeMarker({gh:io.gh||realGh(env.GITHUB_REPOSITORY),reason,runId:env.GITHUB_RUN_ID,...(io.sleep?{sleep:io.sleep}:{})});
 console.log(JSON.stringify(r));
 return r;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const r=await main();process.exitCode=r.status==='WRITTEN'?0:1;}catch(e){console.error('PAGES_RELEASE_MARKER_ERROR',e?.name);process.exitCode=1;}
}
