/* Restlaufzeit des eingefrorenen 46er-Rollbacks (eligible-rollback-top46-v1).
   Der Freeze verfaellt sieben Tage nach manifest.generatedAt (CONSUMER_EXPIRED). Danach scheitern restore46 und
   rollback, und ein Fehler endet im geschlossenen Gate statt im 46er-Stand. Der Health-Lauf warnt ab 48 h vor
   Verfall (Entscheidung Steuerung 08.11.2026); erneuert wird im Auto-Re-Freeze (Legacy-GOOD oder, bei aktivem
   Universum, 46er-Projektion des Universe-GOOD). Reine Funktion, liest nichts. */
export const FREEZE_LIFETIME_MS=7*24*3600000;
export const FREEZE_WARNING_MS=48*3600000;
export function freezeStatus(frozen,now=Date.now()){
 if(!frozen?.manifest)return {state:'MISSING',warn:true,generation:null,generatedAt:null,expiresAt:null,hoursToExpiry:null};
 const expires=Date.parse(frozen.manifest.generatedAt)+FREEZE_LIFETIME_MS;
 if(!Number.isFinite(expires))return {state:'UNKNOWN',warn:true,generation:frozen.generation,generatedAt:frozen.manifest.generatedAt||null,expiresAt:null,hoursToExpiry:null};
 const remaining=expires-now,state=remaining<=0?'EXPIRED':remaining<FREEZE_WARNING_MS?'EXPIRING':'VALID';
 return {state,warn:state!=='VALID',generation:frozen.generation,generatedAt:frozen.manifest.generatedAt,expiresAt:new Date(expires).toISOString(),
  hoursToExpiry:Math.round(remaining/360000)/10,projectedFrom:frozen.refreeze?.projection?.sourceGeneration||null};
}
export function freezeWarning(s){
 if(!s.warn)return null;
 if(s.state==='MISSING')return '::warning::Company Intelligence Rollback-Freeze fehlt: kein 46er-Rueckfall moeglich (Auto-Re-Freeze pruefen)';
 if(s.state==='UNKNOWN')return '::warning::Company Intelligence Rollback-Freeze ohne lesbares generatedAt: Restlaufzeit unbekannt (Auto-Re-Freeze pruefen)';
 if(s.state==='EXPIRED')return `::warning::Company Intelligence Rollback-Freeze ${s.generation} ist abgelaufen (seit ${s.expiresAt}): kein 46er-Rueckfall, Fehler enden im geschlossenen Gate (Auto-Re-Freeze pruefen)`;
 return `::warning::Company Intelligence Rollback-Freeze ${s.generation} verfaellt in ${s.hoursToExpiry} h (${s.expiresAt}); Auto-Re-Freeze pruefen`;
}
