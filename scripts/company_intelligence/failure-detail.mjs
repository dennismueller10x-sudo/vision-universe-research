/* Bereinigte Fehlerangabe fuer health.json und Lauf-Ausgabe, wenn die Meldung kein Code ist
   (refresh-run.mjs mappt sie sonst nur auf REFRESH_STAGE_FAILED). Nur Fehlername, Code und eine
   gekuerzte Meldung: URLs, Hosts, Pfade, Schluessel- oder Signatur-aehnliche Folgen sind maskiert. */
export const MAX_DETAIL=160;
export function failureDetail(error){
 const name=String(error?.name||'Error').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,40)||'Error';
 const raw=error?.code??error?.cause?.code??error?.$metadata?.httpStatusCode??null;
 const code=raw==null?null:String(raw).replace(/[^A-Za-z0-9_:.-]/g,'').slice(0,40)||null;
 let m=String(error?.message??'')
  .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi,'<url>')
  .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?\S*/gi,'<host>')
  .replace(/(?:^|[\s=(])\/[^\s)]*/g,m=>m[0]==='/'?'<path>':m[0]+'<path>')
  .replace(/\b(?:authorization|bearer|token|secret|signature|x-amz-[a-z-]+|access[_-]?key\w*|password)\b\s*[:=]?\s*\S*/gi,'<masked>')
  .replace(/[A-Za-z0-9+/_=-]{24,}/g,'<masked>')
  .replace(/\s+/g,' ').trim();
 return {name,code,message:m.slice(0,MAX_DETAIL)};
}
