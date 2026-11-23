/* Frischealarm fuer den eingefrorenen 46er-Rollback (Steuerung 23.11.2026, nach der Sackgasse "Freeze abgelaufen
   UND Gate zu"): Der Freeze verfaellt sieben Tage nach generatedAt. WARNING ab 5 Tagen Alter (< 48 h Restlaufzeit),
   CRITICAL ab 6 Tagen (< 24 h), bei abgelaufen, fehlend, unlesbar oder ohne lesbares Datum sofort CRITICAL.
   Ergaenzt das Health-Urteil um `freezeSLO` und hebt `status` nur an, nie ab. Rein lesend: nutzt das Feld
   `rollbackFreeze`, das `refresh-run.mjs health` schon in die Urteilsdatei schreibt (freeze-expiry.mjs). */
import {readFileSync,writeFileSync} from 'node:fs';
export const FREEZE_CRITICAL_HOURS=24;
const RANK={HEALTHY:0,OFF:0,WARNING:1,CRITICAL:2};
export function freezeSLO(freeze){
 if(!freeze||typeof freeze!=='object')return null;
 switch(freeze.state){
  case 'VALID':return 'HEALTHY';
  case 'EXPIRING':return Number.isFinite(freeze.hoursToExpiry)&&freeze.hoursToExpiry<FREEZE_CRITICAL_HOURS?'CRITICAL':'WARNING';
  default:return 'CRITICAL'; // EXPIRED, MISSING, UNKNOWN, UNREADABLE
 }
}
export function applyFreeze(verdict){
 const slo=freezeSLO(verdict?.rollbackFreeze);
 if(!slo)return verdict;
 const status=RANK[slo]>RANK[verdict.status]?slo:verdict.status;
 return {...verdict,freezeSLO:slo,status,exitCode:status==='CRITICAL'?1:verdict.exitCode};
}
export function freezeNote(verdict){
 const f=verdict?.rollbackFreeze,slo=verdict?.freezeSLO;
 if(!f||!slo||slo==='HEALTHY')return null;
 return `::${slo==='CRITICAL'?'error':'warning'}::Company Intelligence Rollback-Freeze ${f.state}${Number.isFinite(f.hoursToExpiry)?' (Restlaufzeit '+f.hoursToExpiry+' h, bis '+f.expiresAt+')':''}: Re-Freeze noetig (Auto-Re-Freeze; bei geschlossenem Gate: company-intelligence-refreeze-recover.yml)`;
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const file=process.argv[process.argv.indexOf('--verdict')+1];
 let verdict;try{verdict=JSON.parse(readFileSync(file,'utf8'));}catch{process.exit(Number(process.env.PRIOR_RC||2));}
 const final=applyFreeze(verdict);
 writeFileSync(file,JSON.stringify(final,null,2)+'\n');
 const note=freezeNote(final);if(note)console.log(note);
 process.exitCode=final.exitCode;
}
