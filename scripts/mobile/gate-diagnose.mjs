// Zugangsdiagnose fuer den Ladezeit-Messer (measure.mjs): nur erlaubte Felder.
/** Nur die erlaubten Felder. verifier8 (erste 8 Zeichen des oeffentlich ausgelieferten Pruefwerts, Merkmal der Huelle) darf rein; gespeicherter Schluessel nie. */
export function saubereDiagnose(d){
 if(!d||typeof d!=='object')return null;
 const g=d.gate||null;
 return {readyState:d.readyState??null,busy:d.busy??null,gateShown:!!d.gateShown,browserNow:d.browserNow??null,accessError:d.accessError??null,storageKeyPresent:!!d.storageKeyPresent,
  gate:g?{settings:g.settings&&typeof g.settings==='object'?{version:g.settings.version??null,verifier8:typeof g.settings.verifier8==='string'?g.settings.verifier8.slice(0,8):null,unreadable:g.settings.unreadable===true}:null,stored:g.stored??null,accessJs:g.accessJs??null}:null};
}
