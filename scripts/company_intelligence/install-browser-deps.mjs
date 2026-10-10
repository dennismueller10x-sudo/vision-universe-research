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
  {command:'timeout',args:['--signal=TERM','--kill-after=30s','8m',cli,'install','--with-deps','chromium'],inherit:true}
 ];
}
export function installBrowser(cli, runner=spawnSync, present=mirrorFiles.filter(existsSync)) {
 for(const step of browserInstallPlan(cli,present)){
  const result=runner(step.command,step.args,{input:step.input,encoding:'utf8',stdio:step.inherit?'inherit':'pipe'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('BROWSER_SETUP_FAILED:'+step.command+':'+result.status);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{installBrowser(process.argv[2]);}catch(error){console.error(error.message);process.exitCode=1;}
}
