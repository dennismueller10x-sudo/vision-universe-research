/* Befund einer Browser-Seite bei einem QA-Fehler: Zugangsschranke der Research-Seite (scripts/access-gate/build.mjs).
   Gemeinsam nutzbar (Kandidaten-QA universe-browser-qa.mjs, Ladezeit-Monitor), reine Lesediagnose ohne Schreibzugriff.
   Wichtig: Der Zugangsschluessel (localStorage[...].key) und das Passwort verlassen die Seite NIE; es kommen nur version und expiresAt heraus.
   Die Seitenfunktion ist selbststaendig (kein Bezug auf Modul-Variablen), weil Playwright sie serialisiert. */
export const ACCESS_STORAGE_KEY='vu.research.access.v1';
export const ACCESS_JS_PATH='/__research/access.js';
/* In der Seite ausgefuehrt. arg: {key, accessPath}. Liefert nur die erlaubten Felder. */
export async function inPageAccessDiagnostics({key,accessPath}){
 const q=s=>document.querySelector(s);
 const gateShown=!!q('#research-access-gate');
 const err=q('#research-access-error');
 const out={readyState:document.readyState,busy:q('#v2-main')?.getAttribute('aria-busy')??null,ciState:q('.ci-company-intelligence')?.dataset.state??null,
  gateShown,browserNow:Date.now(),accessError:err?{text:String(err.textContent||'').trim().slice(0,200),hidden:err.hidden===true||err.hasAttribute('hidden')}:null};
 let stored=null,present=false;
 try{
  const raw=localStorage.getItem(key);present=raw!==null;
  if(present){const o=JSON.parse(raw);stored={version:o?.version??null,expiresAt:typeof o?.expiresAt==='number'?o.expiresAt:null};}
 }catch{stored={unreadable:true};}
 out.storageKeyPresent=present;
 if(gateShown){
  let settings=null;
  try{const o=JSON.parse(q('#research-access-settings')?.textContent||'');settings={version:o.version??null,verifier8:typeof o.verifier==='string'?o.verifier.slice(0,8):null};}catch{settings={unreadable:true};}
  let accessJs=null;
  try{
   const src=q('script[src*="'+accessPath+'"]')?.getAttribute('src')||accessPath;
   const r=await fetch(src,{cache:'no-store'});
   accessJs={status:r.status,lastModified:r.headers.get('last-modified'),etag:r.headers.get('etag')};
  }catch(e){accessJs={error:String(e?.name||'error')};}
  out.gate={settings,stored,accessJs};
 }
 return out;
}
/* Playwright: page.evaluate(inPageAccessDiagnostics,{key,accessPath}); Fehler der Diagnose selbst duerfen den QA-Fehlerbericht nie verhindern. */
export async function accessGateDiagnostics(page,{storageKey=ACCESS_STORAGE_KEY,accessPath=ACCESS_JS_PATH}={}){
 return page.evaluate(inPageAccessDiagnostics,{key:storageKey,accessPath}).catch(()=>null);
}
