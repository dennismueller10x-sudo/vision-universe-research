/* GitHub's Ubuntu mirrorlist can hang on Azure before its official fallback.
 * Keep signed Ubuntu packages and pinned Playwright; bound setup, never tests. */
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const mirrorFiles=['/etc/apt/apt-mirrors.txt','/etc/apt/apt-security-mirrors.txt'];
export function browserInstallPlan(cli, present=mirrorFiles.filter(existsSync)) {
 if(!cli)throw Error('PINNED_PLAYWRIGHT_CLI_REQUIRED');
 if(present.some(p=>!mirrorFiles.includes(p)))throw Error('UNEXPECTED_APT_MIRROR_FILE');
 return [
  ...present.map(file=>({command:'sudo',args:['tee',file],input:'https://archive.ubuntu.com/ubuntu\n'})),
  {command:'sudo',args:['tee','/etc/apt/apt.conf.d/99vu-browser-network'],input:'Acquire::http::Timeout "30";\nAcquire::https::Timeout "30";\nAcquire::Retries "1";\n'},
  {command:'timeout',args:['--signal=TERM','--kill-after=30s','3m',cli,'install','--with-deps','chromium'],inherit:true}
 ];
}
/* Der Spiegel-/DNS-Ausfall von archive.ubuntu.com legte am 11.11.2026 alle
 * Auslieferungen lahm (Schritt scheiterte nach 8 Minuten, kein Deploy, der
 * Intraday-Chart stand still). Darum: Vorbereitung wie bisher, dann zwei
 * Versuche mit Systempaketen und zuletzt nur der Browser ohne Systempakete
 * (der Runner bringt die Bibliotheken mit; es fehlen hoechstens Schriften).
 * Die Tests selbst werden nie abgeschwaecht. */
export function installBrowser(cli, runner=spawnSync, present=mirrorFiles.filter(existsSync), log=console.error) {
 const plan=browserInstallPlan(cli,present);
 const run=(step)=>{
  const result=runner(step.command,step.args,{input:step.input,encoding:'utf8',stdio:step.inherit?'inherit':'pipe'});
  if(result.error)throw result.error;
  return result.status;
 };
 const prep=plan.slice(0,-1), install=plan[plan.length-1];
 for(const step of prep){const st=run(step);if(st!==0)throw Error('BROWSER_SETUP_FAILED:'+step.command+':'+st);}
 let last=null;
 for(let attempt=1;attempt<=2;attempt++){
  last=run(install);
  if(last===0)return;
  log('BROWSER_SETUP_RETRY:with-deps attempt '+attempt+' status '+last);
 }
 const bare=runner('timeout',['--signal=TERM','--kill-after=30s','3m',cli,'install','chromium'],{encoding:'utf8',stdio:'inherit'});
 if(bare.error)throw bare.error;
 if(bare.status!==0)throw Error('BROWSER_SETUP_FAILED:timeout:'+bare.status);
 log('BROWSER_SETUP_DEGRADED:chromium without system packages');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{installBrowser(process.argv[2]);}catch(error){console.error(error.message);process.exitCode=1;}
}
