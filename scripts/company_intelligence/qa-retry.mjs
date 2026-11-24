/* Genau EINE Wiederholung eines Browser-QA-Falls nach einem Timeout des Warte-Schritts (Refresh 45261750453, 23.11.2026: erster Fall
   TSLA/390/dark, 90 s Timeout, Seite zeigte die Zugangsschranke, kein Datenrequest).
   Nur ein TimeoutError wird wiederholt, und nur ein Mal; jede inhaltliche Pruefung (AssertionError und jeder andere Fehler) endet sofort und
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
