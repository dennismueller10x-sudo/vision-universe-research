// Beleg: docs/reports/browser-qa-20261109.md; docs/reports/browser-qa-20261109-belege.json
// Keep the exact bytes handed to res.end for this navigation. WebKit may evict
// Network.getResponseBody when the access gate calls document.open/write/close.
// Read the recorded response, never a second HTTP fetch or the replacement DOM.
export function documentRecorder() {
 const bodies=new Map(); let sequence=0;
 return {
  record(res,body) { const id=String(++sequence); bodies.set(id,body); res.setHeader('x-qa-document-id',id); },
  read(response) {
   const id=response?.headers()['x-qa-document-id'];
   if(!id || !bodies.has(id)) throw Error('Navigation document was not recorded');
   const body=bodies.get(id); bodies.delete(id); return body.toString('utf8');
  }
 };
}
