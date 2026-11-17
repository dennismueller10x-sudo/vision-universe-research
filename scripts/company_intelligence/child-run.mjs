/* Kindprozess mit Fehlerdetail (Steuerung 17.11.2026). Lauf 44052659037 scheiterte in der Profil-Stichprobe nur mit REFRESH_STAGE_FAILED:
   der freie Fehlertext von execFileSync ist kein Fehlercode, stderr ging verloren. Hier wird die Beendigung des Kindprozesses (Exit-Status,
   Signal, Zeitueberschreitung, Puffer-Ueberlauf) als Fehlercode (nur Grossbuchstaben, Ziffern, Unterstriche) und das Ende von stderr
   in die schon hochgeladene Datei source-onboarding-stderr.txt geschrieben. Der Kindprozess selbst bleibt unveraendert. */
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {join} from 'node:path';
export const CHILD_STDERR_FILE='source-onboarding-stderr.txt',CHILD_STDERR_TAIL=3000;
const word=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,''),labelWord=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9_]/g,'');
export function childEnding(error){
 if(error?.code==='ETIMEDOUT')return '_TIMEOUT';
 if(error?.code==='ENOBUFS')return '_STDERR_OVERFLOW';
 if(error?.signal)return '_'+word(error.signal);
 return Number.isInteger(error?.status)?'_EXIT'+error.status:'';
}
export function childRun(label,command,args,options,{temporary,exec=execFileSync}={}){
 try{return exec(command,args,options);}
 catch(error){
  const text=String(error?.stderr||'');
  try{if(temporary)appendFileSync(join(temporary,CHILD_STDERR_FILE),`[${label}] status=${error?.status} signal=${error?.signal} code=${error?.code}\n`+text.slice(-CHILD_STDERR_TAIL)+'\n');}catch{/* Beleg optional */}
  throw Error(labelWord(label)+'_FAILED'+childEnding(error));
 }
}
