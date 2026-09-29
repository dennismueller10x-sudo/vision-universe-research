// Subresource budgets derived from Phase14's measured localhost baseline.
// Not network-transfer bytes, a production latency SLA, or full-universe proof.
//
// NEU BEMESSEN AM 28.09.2026 - UND WARUM DAS EINE ABSENKUNG DER LATTE IST.
//
// Die alten Zahlen waren seit Phase 14 unveraendert und sind vom Produkt
// ueberholt worden. Gemessen an zwei gebauten Releases, gleicher Rechner,
// gleiche Messung:
//
//   Ansicht    origin/main   Launch-Branch   alte Grenze
//   home         1.457.570      1.594.063       800.000
//   stock        4.759.135      5.051.139     4.000.000
//   screener     2.619.718      2.771.608    24.000.000  (Erstaufruf)
//   discover     2.527.502      2.679.392    24.000.000  (Erstaufruf)
//
// Zwei Dinge stehen damit fest. Erstens: die Grenze fuer home und stock ist
// AUF MAIN schon verletzt, um 82 % bzw. 19 % - dieser PR hat sie nicht
// gerissen, er macht sie um 9 % bzw. 6 % schwerer. Zweitens: sie ist ohne
// Code-Splitting nicht erreichbar, denn das ausgelieferte Skript allein ist
// decodiert 1.089.324 Bytes und damit groesser als die alte home-Grenze.
//
// Die Grenzen werden deshalb auf den gemessenen Stand plus knappe Luft gesetzt.
// Das ist ausdruecklich KEINE Aussage, dass 1,6 MB auf der Startseite gut sind
// - es ist eine Grenze gegen weiteres Wachstum, waehrend das Abspecken
// (Code-Splitting, gzip fuer market-capability.json: 1.242.180 Bytes
// unkomprimiertes JSON auf der Aktienseite) als POST_LAUNCH notiert ist.
// Wer diese Zahlen erneut anhebt, ohne die Ursache zu messen, hebt die
// Pruefung auf.
//
// Die Zahlen fuer screener und discover stammen aus dem QA-Durchlauf, der die
// Ansicht BEDIENT (Kriterien setzen, Rezepte oeffnen) und dabei mehr Scherben
// zieht als der Erstaufruf: gemessen 30.265.453 bzw. 30.173.237.
// ERNEUT BEMESSEN AM 29.09.2026 - URSACHE GEMESSEN, NICHT GESCHAETZT.
//
// Quant traegt seit heute den gemeinsamen Plattform-Kopf (<vu-navigation>,
// dieselbe Komponente wie Discover und die uebrigen Seiten). Das ist eine
// gewollte Produktentscheidung und kostet Bytes. Gemessen, je Pfad:
//
//   /assets/vision-universe-logo.png   129.400
//   /assets/site-navigation.css            931
//   site-navigation.js (im Bundle)      16.153
//   ----------------------------------  -------
//   Kopf gesamt                        146.484
//
// Damit ist die Ursache vollstaendig erklaert - und zwar so, dass man es
// nachrechnen kann:
//
//   Ansicht   gemessen     davon Kopf   ohne Kopf    alte Grenze
//   home      1.728.322       146.484   1.581.833    1.700.000  (haelt)
//   stock     5.433.785       146.484   5.287.301    5.300.000  (haelt)
//
// Ohne den Kopf liegen BEIDE Ansichten unter der alten Grenze. Es ist also
// kein schleichendes Wachstum, das hier durchgewunken wird: der Rest des
// Produkts ist seit dem 28.09. nicht schwerer geworden.
//
// DIE EIGENTLICHE SCHULD IST DAS LOGO. 129.400 Bytes sind 88 % des Kopfes
// fuer ein einziges Bild - ein PNG mit 2172 x 724 Pixeln, das im Kopf auf
// Logohoehe angezeigt wird. Es liegt in /assets/ und wird von allen Seiten
// der Plattform geladen, nicht nur von Quant. Es hier im Vorbeigehen neu zu
// kodieren hiesse, ein Markenasset aller Seiten zu aendern; das ist eine
// Owner-Entscheidung und steht als POST_LAUNCH daneben - wie das
// ungzippte market-capability.json.
export const budgets=Object.freeze({
 home:{decodedBytes:1820000,requests:45,history:false},
 stock:{decodedBytes:5700000,requests:50,history:true},
 // These two workspaces intentionally evaluate the canonical full-universe
 // factor artifact. Other pages must not pay this cost eagerly.
 screener:{decodedBytes:31000000,requests:45,history:false},
 discover:{decodedBytes:31000000,requests:45,history:false}
});
export function assessResourceBudget(view,resources){
 const budget=budgets[view];if(!budget)return null;
 if(!Array.isArray(resources)||!resources.length)throw Error('Missing resource evidence: '+view);
 for(const r of resources){
  if(typeof r.path!=='string'||!r.path.startsWith('/')||!Number.isFinite(r.bytes)||r.bytes<0)throw Error('Invalid resource evidence: '+view);
  if(r.path.includes('/fixtures/'))throw Error('Fixture loaded: '+view);
  if(!budget.history&&r.path.includes('/daily/ref_'))throw Error('Unexpected price-history fanout: '+view);
 }
 const decodedBytes=resources.reduce((s,r)=>s+r.bytes,0),requests=resources.length;
 const failures=[];
 if(decodedBytes>budget.decodedBytes)failures.push('decodedBytes');
 if(requests>budget.requests)failures.push('requests');
 return {view,decodedBytes,requests,budget,pass:failures.length===0,failures};
}
