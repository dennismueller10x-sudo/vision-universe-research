import assert from 'node:assert/strict';
/* Genau EINE Wiederholung eines Browser-QA-Falls nach einem Timeout des Warte-Schritts (Refresh 45261750453, 23.11.2026: erster Fall
   TSLA/390/dark, 90 s Timeout, Seite zeigte die Zugangsschranke, kein Datenrequest).
   Nur ein TimeoutError oder ein belegter transienter Hosting-5xx (Refresh 45344615779, 24.11.2026: 18x HTTP 503 text/html auf Snapshot-Dateien
   direkt nach dem Deploy, Minuten spaeter alle 200) wird wiederholt, und nur ein Mal; jede inhaltliche Pruefung (AssertionError und jeder andere Fehler) endet sofort und
   unveraendert streng. Der zweite Versuch laeuft mit einer frischen Seite (die der Aufrufer im Lauf selbst oeffnet). Rein, ohne Browser. */
export const isTimeout=e=>e?.name==='TimeoutError';
export async function runCaseWithOneRetry(run,item,{retriable=isTimeout,onRetry=async()=>{}}={}){
 try{return await run(item,1);}
 catch(e){
  if(!retriable(e))throw e;
  await onRetry(e,item);
  return await run(item,2);
 }
}
export const isTransientHosting=e=>e?.name==='TransientHostingError';
export const isRetriable=e=>isTimeout(e)||isTransientHosting(e);
/* Jeder Datenrequest muss 200 liefern. Ein 5xx (und nur 5xx; 4xx, 3xx und andere bleiben streng) ist Hosting-Rauschen und wird einmal wiederholt. */
export function assertHostingStatuses(requests){
 const bad=requests.filter(r=>r.status!==200);
 if(!bad.length)return;
 const msg='non-200 data requests: '+bad.slice(0,5).map(r=>r.status+' '+r.path).join(', ');
 if(bad.every(r=>r.status>=500&&r.status<600)){const e=new Error(msg);e.name='TransientHostingError';throw e;}
 assert.fail(msg);
}
