// Zugangsdiagnose fuer den Ladezeit-Messer (measure.mjs): nur erlaubte Felder.
/** Nur die erlaubten Felder; der Pruefwert-Anfang (verifier8) bleibt draussen. */
export function saubereDiagnose(d){
 if(!d||typeof d!=='object')return null;
 const g=d.gate||null;
 return {readyState:d.readyState??null,busy:d.busy??null,gateShown:!!d.gateShown,browserNow:d.browserNow??null,accessError:d.accessError??null,storageKeyPresent:!!d.storageKeyPresent,
  gate:g?{settings:g.settings&&typeof g.settings==='object'?{version:g.settings.version??null,unreadable:g.settings.unreadable===true}:null,stored:g.stored??null,accessJs:g.accessJs??null}:null};
}
