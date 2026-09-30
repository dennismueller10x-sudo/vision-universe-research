// Explicitly requested static-repository QA. No deployment or provider calls.
import {assessResourceBudget} from './resource-budget.mjs';
import {createServer} from 'node:http';
import {gunzipSync} from 'node:zlib';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const axePath=require.resolve('axe-core/axe.min.js');
const root=resolve(process.cwd()),out=resolve(process.env.VU_QA_OUTPUT||'../vu2-evidence/experience');
await mkdir(out,{recursive:true});
// Compare the current checked-in canonical outputs; fixed old quotes are not invariants.
const panel=JSON.parse(await readFile(resolve(root,'quant/data/sec/quant-factor-inputs.json'),'utf8')),nvda=panel.securities.NVDA;
const technical=JSON.parse(await readFile(resolve(root,'quant/data/technical/instruments/NVDA.json'),'utf8'));
let productIntelligence=null;try{productIntelligence=JSON.parse(await readFile(resolve(root,'quant/data/product/technical-signals-v1/summary.json'),'utf8'));}catch{}
let defaultSignals=null;try{defaultSignals=JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/product/technical-signals-v1/signals-20.json.gz'))));}catch{}
const quarterlyTSLA=JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/sec/quarterly/05.json.gz')))).issuers['0001318605'];
const pct=value=>value.toLocaleString('de-DE',{maximumFractionDigits:2})+' %';
const trendLabel={BULLISH:'Aufwärtstrend',BEARISH:'Abwärtstrend',NEUTRAL:'Keine klare Richtung',SIDEWAYS:'Seitwärts'}[technical.bundle.trend.direction];
// DIE UEBERSCHRIFT WIRD GELESEN, NICHT ABGESCHRIEBEN.
//
// Diese Pruefung hat bis zum 28.09.2026 auf eine Ueberschrift 'Technical
// Intelligence' gewartet. Genau dieser Begriff steht im Sprachverzeichnis
// als `internal` und auf der Verbotsliste fuer Hauptkopie - die Seite zeigt
// deshalb seit dem Sprachverzeichnis (M15) die Nutzerfrage 'Was zeigt der
// Kursverlauf?'. Die QA hat also einen Text erwartet, den die Hausregeln
// verbieten, und ist seither bei jedem Lauf in einen 30-Sekunden-Timeout
// gelaufen.
//
// Sie liest den Text jetzt aus derselben Quelle wie die Oberflaeche. Eine
// abgeschriebene Zeichenkette waere dieselbe Falle noch einmal: aendert sich
// das Verzeichnis, aendert sich beides zusammen.
const productLanguage=require(resolve(root,'quant/engines/product-language.js'));
productLanguage.load(JSON.parse(await readFile(resolve(root,'quant/methodology/product-language-v1.json'),'utf8')));
const kursverlaufHeading=productLanguage.question('technicalIntelligence');
const factorEvidence=require(resolve(root,'quant/engines/factor-evidence.js'));
const canonFactorLabels=factorEvidence.FACTOR_ORDER.map(id=>(factorEvidence.FACTOR_MEANING[id]||{}).label);
// Die Quant-Ansicht traegt als Ueberschrift den FIRMENNAMEN - denselben, den
// das Verzeichnis nennt. Die Pruefung erwartete 'Das Unternehmen in Zahlen',
// einen Titel, den die Seite nicht mehr fuehrt. Der Name wird gelesen, nicht
// abgeschrieben: damit prueft dieselbe Zeile zugleich das Identitaets-Gate.
const universeIndex=JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/product/universe-list-v1.json.gz'))).toString('utf8'));
const nvdaName=(universeIndex.entries||[]).find(e=>e.s==='NVDA')?.n;
if(!nvdaName)throw Error('das Verzeichnis nennt keinen Namen fuer NVDA');
if(canonFactorLabels.some(l=>!l))throw Error('der Faktorkanon nennt nicht fuer jeden Faktor eine Bezeichnung');
if(canonFactorLabels.length!==7)throw Error('der Faktorkanon hat nicht sieben Faktoren');
if(!kursverlaufHeading)throw Error('das Sprachverzeichnis nennt keine Frage fuer technicalIntelligence');
if(productLanguage.violatesPrimaryCopy(kursverlaufHeading))throw Error('die erwartete Ueberschrift verletzt die Hauptkopie-Regel: '+kursverlaufHeading);
// Explicit stale-data scenario, retaining actual source files and all freshness assertions.
const staleClock=new Date(Date.parse(nvda.marketData.asOf+'T22:00:00Z')+7*86400000);
await writeFile(out+'/observation-context.json',JSON.stringify({sourceAsOf:nvda.marketData.asOf,browserClock:staleClock.toISOString(),scenario:'STALE_EOD',syntheticMarketData:false}));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.split('/').some(s=>s.startsWith('.')))throw Error('private');if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
/* Lokal liegt Chromium an einem festen Pfad, auf dem Runner sucht
   Playwright selbst - dieselbe Regel wie im Produktions-Smoke. Ohne sie
   laesst sich diese Pruefung ausserhalb von CI nicht nachstellen, und
   ein Push ohne lokale Gegenprobe kostet eine Runde. */
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
 ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const origin='http://127.0.0.1:'+server.address().port;const checks=[],performanceSamples=[],accessibility=[],resourceBudgets=[];
/* ALLE AUFKLAPPER OEFFNEN - UND ZWAR WIRKLICH ALLE.

   Der Einsteiger-Umbau baut den Inhalt eines <details> erst beim
   Oeffnen. Eine Pruefung, die zugeklappten Inhalt nicht ansieht, wuerde
   seinen Verlust nicht bemerken.

   Naiv war: alle <summary> einsammeln und der Reihe nach klicken. Das
   schlaegt fehl, weil ein geoeffneter Aufklapper VERSCHACHTELTE
   Aufklapper nachlegt - das DOM verschiebt sich, und die vorher
   eingesammelte Liste zeigt ins Leere. Gemessen: von drei Aufklappern
   blieb der dritte zu, und die Zusicherung darunter lief in einen
   Timeout.

   Deshalb: nach jedem Oeffnen neu suchen, bis keiner mehr zu ist. Die
   Schranke verhindert eine Endlosschleife, falls ein Aufklapper sich
   selbst nachlegt. */
async function alleAufklappen(page,wurzel){
 const ort=wurzel||'#app';
 /* Die Schranke war 12 und damit zu klein: die Aktienseite traegt
     allein acht "Warum ist das relevant?"-Aufklapper plus die Belege
     darueber. Wer zu frueh aufhoert, prueft die Haelfte und meldet
     fehlende Kennzahlen, die nur zugeklappt sind. */
 for(let runde=0;runde<80;runde++){
  const zu=page.locator(ort+' details:not([open]) > summary');
  const n=await zu.count();
  if(!n)return;
  await zu.first().click().catch(()=>{});
  await page.waitForTimeout(60);
 }
}
async function auditAccessibility(page,view,width){
 await page.addScriptTag({path:axePath});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
 accessibility.push({view,width,engine:result.testEngine,violations:result.violations,incomplete:result.incomplete,passedRules:result.passes.length});
 await writeFile(out+'/accessibility.json',JSON.stringify({scope:'Automated WCAG 2.1 A/AA checks; not a manual accessibility certification',results:accessibility},null,2));
}
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});await page.addInitScript(time=>{const NativeDate=Date,fixed=NativeDate.parse(time);globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};},staleClock.toISOString());const errors=[];page.on('pageerror',e=>errors.push(e.message));
 /* `stocks` (die Uebersicht) fehlte hier - nur `stock` (die Einzelseite)
    stand drin. Aufgefallen bei der Gegenprobe zu einer neuen Pruefung:
    sie war gruen, weil ihr Block nie lief. Eine Pruefung, die nicht
    ausgefuehrt wird, sieht aus wie Abdeckung und ist keine. */
 for(const view of ['home','stock','stocks','technical','elliott','quant','explain','fundamentals','discover','research','markets','screener','compare','strategies','signals','radar','portfolio','watchlist','atlas']){
 const started=performance.now();await page.goto(origin+'/vu2/?view='+view+'&ticker=NVDA');await page.locator('main footer').waitFor();
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.decodedBodySize,durationMs:Math.round(r.duration)})));performanceSamples.push({view,width,renderMs:Math.round(performance.now()-started),decodedBytes:resources.reduce((sum,r)=>sum+r.bytes,0),requests:resources.length});
 const budget=assessResourceBudget(view,resources);if(budget)resourceBudgets.push({...budget,width});
 if(view==='home'&&resources.some(r=>r.path.includes('/daily/ref_')||r.path.includes('/fixtures/')))throw Error('Home loads raw history or fixtures');
 if(await page.locator('h1').count()!==1)throw Error('missing heading '+view);
 /* KEINE SEITE WIEDERHOLT DEN ANSPRUCH AUS DER KOPFZEILE ALS UEBERSCHRIFT.

    Zweimal gefunden, an zwei Tagen, auf zwei Seiten:
      Screener     "Chancen finden."      Kopfzeile bei 50 px, h1 bei 142 px
      Strategien   "Strategien verstehen." dieselben zwei Stellen

    Dieselben Woerter zweimal, rund 90 px auseinander - und dazwischen
    nichts. Der Platz kostet auf 390 px den ersten Treffer beziehungsweise
    die erste vollstaendige Strategiekarte.

    Die Regel steht hier statt im Quelltext einer einzelnen Seite, weil
    sie fuer ALLE 18 Ansichten gilt, auch fuer die, die es noch nicht
    gibt. Der Anspruch orientiert, die Ueberschrift benennt die Aufgabe -
    wer beides gleich schreibt, hat eines davon verschenkt. */
 const anspruch=(await page.locator('.q-claim').first().innerText().catch(()=>'')).trim();
 const ueberschrift=(await page.locator('main h1').first().innerText().catch(()=>'')).trim();
 if(anspruch&&ueberschrift&&anspruch.replace(/[.!?]+$/,'')===ueberschrift.replace(/[.!?]+$/,''))
  throw Error('"'+ueberschrift+'" steht auf '+view+' zweimal: als Anspruch in der Kopfzeile und als Ueberschrift');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow)throw Error('page overflow '+view+' '+width);
 if(view==='home'){
  /* DIE FUENF BEREICHE, UND KEIN FREMDES PRODUKT.
     Diese Pruefung stand vorher auf dem Kopf: sie verlangte, dass in der
     Quant-Navigation ein Verweis "Discover" auf /discover/ zeigt. Discover
     ist ein anderes Produkt; die Eigentuemerentscheidung vom 28.09.2026
     nimmt es (mit Research, Markets und Portfolio) aus dieser Leiste.
     Geprueft wird jetzt das Gegenteil - und zwar beides: dass die fuenf da
     sind und dass die vier nicht da sind. */
  const leiste=width<=900?'.q-bottom':'.nav';
  const bereiche=await page.locator(leiste+' a').allInnerTexts();
  /* Owner-Entscheid 29.09.2026: der Quant-interne Screener heisst
     "Quant Screener". "Screener" allein ist das eigenstaendige Produkt
     unter /screener/ und gehoert NICHT zu Quant. */
  const erwartet=['Home','Quant Screener','Strategien','Aktien','Methodik'];
  if(bereiche.map(t=>t.trim()).join('|')!==erwartet.join('|'))
   throw Error('Quant-Navigation ist nicht die erwartete: '+bereiche.join('|'));
  for(const fremd of ['Discover','Research','Markets','Portfolio'])
   if(await page.locator(leiste).getByRole('link',{name:fremd,exact:true}).count())
    throw Error(fremd+' steht in der Quant-Navigation');
  /* HOME BEANTWORTET ZUERST DIE PRODUKTFRAGE.

     Vorher standen hier zwei Ueberschriften ("So nutzt du Quant",
     "Schnell starten") und drei Kacheln. Der Einsteiger-Umbau hat die
     Startseite von 551 auf 110 Woerter gekuerzt; diese Pruefung lief
     danach 30 s in einen Timeout auf eine Ueberschrift, die es nicht
     mehr gibt.

     Die ABSICHT bleibt dieselbe und wird weiter geprueft: die
     Startseite sagt in einem Satz, was Quant ist, und bietet die Wege
     dorthin mit ihrem Ziel. Nur die Form hat sich geaendert - aus
     Kacheln mit Ueberschrift wurden Wege mit der Frage, in der man sie
     waehlt. */
  await page.getByRole('heading',{name:'Aktien verstehen, ohne Vorwissen.',exact:true}).waitFor();
  await page.locator('.q-hero-cta').waitFor();
  /* Ein Weg ist EIN Verweis aus Symbol, Titel und Lage - sein
     zugaenglicher Name ist deshalb der ganze Text und nie nur
     "Screener". Ein exakter Namensvergleich lief hier frueher in einen
     Timeout. Gesucht wird ueber den Titel, gelesen wird das Ziel. */
  const einstiege=await page.locator('.q-weg').evaluateAll(
   ns=>ns.map(n=>({titel:(n.querySelector('.q-weg-t')||{}).textContent||'',ziel:n.getAttribute('href')||''})));
  if(einstiege.length!==3)throw Error('Home bietet '+einstiege.length+' Wege an, erwartet sind drei');
  for(const [name,ziel] of [['Aktie prüfen','view=stocks'],['Aktien finden','view=screener'],['Wie wir das machen','view=explain']]){
   const treffer=einstiege.find(e=>e.titel.trim()===name);
   if(!treffer)throw Error('Weg "'+name+'" fehlt auf Home');
   if(!treffer.ziel.includes(ziel))throw Error('Weg "'+name+'" zeigt nicht auf '+ziel+': '+treffer.ziel);
  }
  /* "HEUTE IM FOKUS" IST KEIN ERFUNDENER FEED. Entweder stehen dort die
     ausgewerteten Zustaende MIT ihrem Stichtag, oder es stehen die beiden
     Wege, die ohne sie funktionieren. Ein dritter Fall waere erfunden. */
  /* Die Karte heisst jetzt "Heute" statt "Heute im Fokus", und der
     Stichtag steht im Aufklapper darunter statt offen daneben. Die Regel
     ist unveraendert: entweder ausgewertete Zustaende MIT Stichtag, oder
     der ehrliche Satz, dass heute keine Lage vorliegt. Ein dritter Fall
     waere erfunden. Der Aufklapper wird geoeffnet, sonst prueft diese
     Zusicherung nur die Huelle. */
  await page.getByRole('heading',{name:'Heute',exact:true}).waitFor();
  const heuteKarte=page.locator('.q-card').filter({hasText:'Heute'}).first();
  await alleAufklappen(page,'.q-card');
  const fokus=await heuteKarte.innerText();
  const mitStand=/Stand: \d{4}-\d{2}-\d{2}/.test(fokus);
  const mitRueckfall=fokus.includes('keine ausgewertete Lage');
  if(!mitStand&&!mitRueckfall)throw Error('Heute zeigt weder ausgewertete Zustaende mit Stichtag noch den ehrlichen Rueckfall: '+fokus.slice(0,160));
  /* BESTAND: Aktualitaetszeile, Datenstand, Listen-Einstieg, Suche.

     Der Datenstand liegt seit dem Einsteiger-Umbau im Aufklapper
     "Woher die Zahlen kommen" - er ist wichtig, aber er ist nicht die
     Antwort auf die erste Frage. Geprueft wird er weiter, nur eben nach
     dem Oeffnen: eine Zusicherung, die zugeklappten Inhalt nicht
     ansieht, wuerde seinen Verlust nicht bemerken. */
  await alleAufklappen(page);
  await page.locator('.market-freshness').waitFor();
  await page.getByText('Kurse: letzter Tagesstand',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Liste anlegen',exact:true}).waitFor();
  await page.getByRole('button',{name:'Suche',exact:true}).click();
  await page.getByRole('textbox',{name:'Suche',exact:true}).fill('NVDA');
  await page.getByRole('dialog').getByRole('link',{name:/NVDA/}).waitFor();
  await page.getByRole('button',{name:'Schließen'}).click();
  /* FAELLT DER KALENDER AUS, DARF DIE SEITE IHRE EINSTIEGE NICHT
     VERLIEREN - und sie darf die Handelsphase nicht erfinden.

     Beides gilt unveraendert. Neu ist nur, wo es steht: die Marktlage
     liegt im Aufklapper, und ein reload() schliesst ihn wieder. Wer hier
     nicht erneut oeffnet, prueft eine zugeklappte Schublade und haelt
     sie fuer leer. */
  await page.route('**/quant/config/market-calendar.json',route=>route.abort());
  await page.reload();await page.locator('main footer').waitFor();
  if(await page.locator('.q-weg').count()!==3)
   throw Error('Ohne Kalender verliert die Startseite ihre Einstiege');
  await alleAufklappen(page);
  await page.getByText('Handelsphase nicht bestätigt',{exact:true}).waitFor();
  await page.unroute('**/quant/config/market-calendar.json');
  await page.reload();await page.locator('main footer').waitFor();
 }
 if(view==='stock'){
  /* Die Belege der Aktienseite liegen seit dem Einsteiger-Umbau im
     Aufklapper 'Warum wir das sagen'. Erst oeffnen, dann pruefen -
     sonst misst diese Zusicherung eine geschlossene Schublade. */
  await alleAufklappen(page);
  await page.locator('.market-freshness').waitFor();if(await page.locator('[data-stock-family]').count()!==4||await page.locator('.stock-evidence-metric').count()!==8)throw Error('stock business evidence missing');await page.locator('[data-stock-family=quality]').getByText(pct(nvda.fundamentals.operatingMargin),{exact:true}).waitFor();await page.locator('[data-stock-family=growth]').getByText(pct(nvda.fundamentals.revenueGrowth),{exact:true}).waitFor();await page.locator('[data-stock-family=risk]').getByText(pct(nvda.fundamentals.volatility),{exact:true}).waitFor();await page.getByText('Warum ist das relevant?',{exact:true}).first().click();await page.getByRole('heading',{name:kursverlaufHeading,exact:true}).waitFor();await page.getByRole('heading',{name:trendLabel,exact:true}).waitFor();await page.getByRole('button',{name:'Max',exact:true}).click();if(await page.locator('.focus .q-chart').count()!==1)throw Error('MAX chart missing');await page.getByRole('button',{name:'1J',exact:true}).click();}
 if(view==='technical'||view==='elliott'){await page.locator('.technical-chart-host svg').waitFor();await page.getByRole('combobox',{name:'Chart-Zeitraum',exact:true}).selectOption('MAX');await page.getByRole('checkbox',{name:'Alternativen im Chart'}).check();const labels=page.getByRole('checkbox',{name:'Chart-Beschriftungen'});await labels.check();if(!await page.locator('.technical-chart-host .ann-label:not(.ann-now-label)').count())throw Error('chart labels missing');if(width===390)await labels.uncheck();await page.getByRole('heading',{name:'Szenarien & Invalidation',exact:true}).waitFor();await page.getByRole('heading',{name:'Alternative Zählung',exact:true}).waitFor();await page.getByText('Vollständige Zählung & Regeln',{exact:true}).first().click();if(await page.locator('.wave-count').first().locator('tbody tr').count()<40)throw Error('wave count truncated');await page.getByText('Vollständige Zählung & Regeln',{exact:true}).first().click();await page.getByRole('combobox',{name:'Chart-Zeitraum',exact:true}).selectOption('1Y');}
 if(view==='quant'){
  // Factor DNA is the canonical seven, always in the same order, and a
  // composite score must stay absent while Quant V2 is not active.
  if(await page.locator('.dna-row').count()!==7)throw Error('factor DNA incomplete');
  const factorLabels=await page.locator('.dna-row .dna-label').allTextContents();
  // Auch die sieben Bezeichnungen werden GELESEN und nicht abgeschrieben.
  // Die abgeschriebene Liste begann mit 'Qualität'; die Engine nennt den
  // Faktor 'Unternehmensqualität' - also hat die Pruefung eine Drift
  // gemeldet, wo keine war, und die echte Reihenfolge nie geprueft.
  if(factorLabels.join('|')!==canonFactorLabels.join('|'))throw Error('factor order drifted: '+factorLabels.join('|')+' statt '+canonFactorLabels.join('|'));
  // Der Satz lautete 'Kein Gesamtscore veröffentlicht'. Die Seite sagt
  // inzwischen, WARUM keiner gebildet wird - das ist die Aussage, auf die es
  // ankommt, und sie darf sich im Wortlaut weiterentwickeln. Geprueft wird
  // deshalb, dass die Absage steht UND ihren Grund nennt, nicht ein Satz
  // Zeichen fuer Zeichen.
  await page.getByText(/Gesamtscore wird bewusst nicht gebildet/).first().waitFor();
  await page.getByText(/Erwartungstrend fehlt ohne lizenzierte Datenquelle|Methodik ist noch nicht freigegeben/).first().waitFor();
  await page.getByText('Erwartungstrend',{exact:true}).first().waitFor();
  // Meaning is closed until asked for; the evidence must open on demand.
  const first=page.locator('.dna-row').first();
  if(await first.locator('.dna-detail').isVisible())throw Error('factor evidence not progressively disclosed');
  await first.locator('.dna-head').click();
  await first.locator('.dna-detail').waitFor();
  if(!await first.locator('.dna-component').count())throw Error('factor components missing');
  await first.locator('.dna-head').click();
  await page.getByRole('heading',{name:'Was verändert sich gerade?',exact:true}).waitFor();
  // Auch hier: Ueberschrift und Absage kommen aus dem Sprachverzeichnis.
  // Die abgeschriebene Ueberschrift lautete 'Entsteht gerade eine
  // Situation?'. Seit M40 traegt die Quant-Ansicht ausserdem einen zweiten
  // berechtigten Titel: hat die Auskunft oben die Setup-Frage schon
  // beantwortet, heisst der Abschnitt 'Woran dieser Zustand haengt' - zwei
  // Ueberschriften fuer zwei Lagen, und die QA muss beide kennen, statt eine
  // dritte zu erwarten.
  const setupHeading=productLanguage.question('setupState');
  const setupAbsage=productLanguage.unavailable('setupState');
  if(!setupHeading||!setupAbsage)throw Error('das Sprachverzeichnis nennt Frage oder Absage fuer setupState nicht');
  await page.getByRole('heading',{name:new RegExp('^('+[setupHeading,'Woran dieser Zustand hängt'].map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$')}).first().waitFor();
  // ENTWEDER EIN ZUSTAND ODER DIE ABSAGE - NIE KEINES VON BEIDEN.
  //
  // Vorher stand hier die Absage allein. Die galt, solange NVDA keine
  // Setup-Beobachtung hatte; inzwischen hat der Titel eine, und die Absage
  // erscheint zu Recht nicht mehr. Eine Pruefung, die an einer Datenlage
  // haengt, prueft das Produkt nicht - geprueft wird die Regel: der
  // Abschnitt nennt einen Zustand aus dem Vertrag ODER sagt, dass keiner
  // behauptet wird.
  const setupStates=['NO_SETUP','WATCH','SETUP_FORMING','CONFIRMED','ACTIVE','RISK_RISING','INVALIDATED','EXIT']
    .map(id=>productLanguage.label(id)).filter(Boolean);
  if(setupStates.length!==8)throw Error('das Sprachverzeichnis nennt nicht alle acht Setup-Zustaende');
  const setupText=await page.locator('.setup-journey, .setup-section, main').first().innerText();
  const zustandGenannt=setupStates.some(l=>setupText.includes(l));
  if(!zustandGenannt&&!setupText.includes(setupAbsage)){
   throw Error('der Setup-Abschnitt nennt weder einen Zustand noch die Absage');
  }
  if(!await page.locator('.setup-conditions li').count())throw Error('observable conditions missing');
  // Strategy Match reads Quant V2 evidence only, counts conditions and
  // claims no historical result.
  await page.getByRole('heading',{name:productLanguage.question('strategyMatch'),exact:true}).first().waitFor();
  if(await page.locator('.match-card').count()!==8)throw Error('strategy profiles incomplete');
  // Die Karte sagte einmal 'Historische Evidenz: nicht verfügbar'. Sie sagt
  // jetzt die Frage UND die begruendete Absage aus dem Sprachverzeichnis -
  // also mehr, nicht weniger. Geprueft wird deshalb die Absage selbst.
  await page.getByText(productLanguage.unavailable('backtest'),{exact:false}).first().waitFor();
  // 'Quant V1' DARF in der Methodikschicht stehen - dort steht der Satz, der
  // die beiden Methodiken ueberhaupt trennt ('Quant V1 bleibt unveraendert
  // und wird hier nicht gelesen'). Die Hausregel verbietet den internen
  // Namen in der HAUPTKOPIE, nicht in der Offenlegung. Diese Pruefung hat
  // bis zum 28.09.2026 jedes Vorkommen verboten und damit genau die
  // Transparenz bestraft, die sie schuetzen soll.
  const v1Primary=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,.eyebrow,[class*=chip],[class*=badge],.match-card>p:first-of-type')]
   .filter(n=>!n.closest('details')).map(n=>n.textContent.trim()).filter(t=>/Quant V1/.test(t)));
  if(v1Primary.length)throw Error('Quant V1 in primary copy of a Quant V2 match: '+v1Primary.join(' | '));
  const v1Anywhere=await page.evaluate(()=>[...document.querySelectorAll('*')]
   .filter(n=>n.children.length===0&&/Quant V1/.test(n.textContent||'')).map(n=>({text:n.textContent.trim().slice(0,80),inDetails:!!n.closest('details')})));
  const v1Offen=v1Anywhere.filter(x=>!x.inDetails);
  if(v1Offen.length)throw Error('Quant V1 outside the methodology disclosure: '+v1Offen.map(x=>x.text).join(' | '));
  // The rule that explains a profile also selects with it (section 20).
  if(await page.getByRole('link',{name:'Alle Titel mit diesem Profil zeigen'}).count()!==8)throw Error('profile screen links missing');
  // Option C: Kursstaerke und Anlegerrendite stehen nebeneinander, und
  // zwar mit ZWEI verschiedenen Zahlen. Eine Oberflaeche, die beide
  // Begriffe zeigt und darunter denselben Wert schreibt, hat die
  // Trennung nicht umgesetzt, sondern nur beschriftet.
  await page.getByRole('heading',{name:'Warum unterscheiden sich Kursstärke und Anlegerrendite?',exact:true}).waitFor();
  const returnRows=page.locator('.return-kind-grid .row:not(.eyebrow)');
  if(await returnRows.count()<2)throw Error('Kursstärke/Anlegerrendite: zu wenige Zeiträume');
  const kopf=await page.locator('.return-kind-grid .row.eyebrow span').allTextContents();
  if(kopf.join('|')!=='Zeitraum|Kursstärke|Anlegerrendite')throw Error('return kind header drifted: '+kopf.join('|'));
  const erste=await returnRows.first().locator('span').allTextContents();
  if(erste[1]===erste[2])throw Error('Kursstärke und Anlegerrendite zeigen denselben Wert: '+erste.join('|'));
  // Und kein Fachwort in der primaeren Oberflaeche.
  const rohtext=await page.locator('.return-kind-section').innerText();
  for(const wort of ['adjustedClose','split adjusted','total return','TOTAL_RETURN','SPLIT_ADJUSTED'])
   if(rohtext.includes(wort))throw Error('technischer Begriff in der Oberfläche: '+wort);
  await page.getByRole('heading',{name:'Worauf diese Analyse beruht',exact:true}).waitFor();
  // A bank keeps its closed industry factors instead of inventing them.
  await page.getByRole('combobox',{name:'Quant Unternehmen'}).selectOption('JPM');await page.locator('main footer').waitFor();
  if(await page.locator('.dna-row').count()!==7)throw Error('factor DNA incomplete for JPM');
  await page.getByRole('combobox',{name:'Quant Unternehmen'}).selectOption('NVDA');await page.locator('main footer').waitFor();
 }
 if(view==='explain'){
  /* DIE METHODIK IST JETZT EINE ANTWORT MIT ZEHN FRAGEN DARUNTER.
     Vorher standen 1.228 Woerter in 28 Kaesten offen da. Alle Inhalte
     sind erhalten, sie liegen nur im Aufklapper - erst oeffnen, dann
     pruefen. Die Ueberschrift der Karte selbst steht offen. */
  await alleAufklappen(page);
  await page.getByRole('heading',{name:productLanguage.question('quant'),exact:true}).waitFor();
  // Der Einsteigersatz steht im Sprachverzeichnis und wurde dort
  // ueberarbeitet; die abgeschriebene Fassung war seit M15 falsch.
  await page.getByText(productLanguage.beginner('quant'),{exact:true}).waitFor();
  // Die Erklaerseite traegt inzwischen ZWEI Gruppen: die sieben Eigenschaften
  // und die sieben Modulfragen. Die Pruefung zaehlte 7 Karten und stammt aus
  // der Zeit mit einer Gruppe - sie hat seither 14 gefunden und jeden Lauf
  // abgebrochen. Geprueft wird jetzt die Aussage: die erste Gruppe erklaert
  // JEDE Eigenschaft des Kanons, und jede Karte der zweiten stellt eine
  // Frage.
  const explainGroups=page.locator('.explain-factors');
  if(await explainGroups.count()<2)throw Error('die Erklaerseite hat nicht beide Gruppen');
  const explainFactorHeads=await explainGroups.nth(0).locator('.explain-factor h3').allTextContents();
  if(explainFactorHeads.join('|')!==canonFactorLabels.join('|'))throw Error('beginner factor explanation incomplete: '+explainFactorHeads.join('|'));
  const explainModuleHeads=await explainGroups.nth(1).locator('.explain-factor h3').allTextContents();
  if(!explainModuleHeads.length||explainModuleHeads.some(t=>!t.trim().endsWith('?')))throw Error('eine Modulkarte stellt keine Frage: '+explainModuleHeads.join('|'));
  await page.getByText('Keine Kursprognose und kein Kursziel.',{exact:true}).waitFor();
 }
 if(view==='stocks'){
  /* EINE SPALTE, DIE AUF JEDER ZEILE DASSELBE SAGT, SAGT NICHTS.

     Gemessen ueber alle 40 Zeilen der Uebersicht, aufgeklappt:

       "Stand 2026-09-28"                            40 von 40
       "Vollstaendig verbundene Analyse verfuegbar."  36 von 40
       "Kein Aktienurteil - dieses Papier ist keine Aktie."  4 von 40

     Der Stichtag machte 18 der 24 Zahlen dieser Spalte aus, und der Satz
     auf 36 Zeilen verdeckte genau die vier, die wirklich etwas mitteilen.
     Dieselbe Fehlerklasse wie "nur 6 von 7 pruefbar" im Screener: was
     immer dasteht, wird nicht mehr gelesen.

     Geprueft wird deshalb die REGEL, nicht der heutige Text: kein
     Nebentext einer Trefferzeile darf auf ALLEN Zeilen derselbe sein. */
  /* SELBST GEFUNDEN, BEIM ERSTEN SAUBEREN LAUF DIESER PRUEFUNG.

     Erst stand hier `.filter(Boolean)` vor dem Vergleich - und damit
     verbot die Regel etwas Richtiges: die vier Ausnahmezeilen tragen
     naturgemaess ALLE denselben Satz ("dieses Papier ist keine Aktie"),
     und nach dem Filtern sah das aus wie "auf allen Zeilen".

     Zwei Dinge, die ich verwechselt hatte:
       ein Text auf ALLEN Zeilen  -> Tapete, der Defekt
       ein Text auf EINIGEN       -> eine Kategorie, genau richtig

     Verglichen wird deshalb gegen die Zahl ALLER Zeilen, nicht gegen die
     der gefuellten. */
  const zeilen=await page.locator('.q-hit').count();
  const gleichAufAllen=(werte)=>{
   const gesetzt=werte.map(t=>t.trim()).filter(Boolean);
   return zeilen>1&&gesetzt.length===zeilen&&new Set(gesetzt).size===1?gesetzt[0]:null;
  };
  const zusatz=gleichAufAllen(await page.locator('.q-hit .q-hit-num span').allInnerTexts());
  if(zusatz)throw Error('der Zusatz "'+zusatz+'" steht auf allen '+zeilen+' Zeilen - er gehoert einmal ueber die Liste');
  const warum=gleichAufAllen(await page.locator('.q-hit .q-hit-why').allInnerTexts());
  if(warum)throw Error('"'+warum+'" steht auf allen '+zeilen+' Zeilen - was immer dasteht, verdeckt die Ausnahme');
  /* Und der Stichtag muss trotzdem dastehen - einmal, ueber der Liste.
     Ihn ganz wegzulassen waere nicht Vereinfachung, sondern Verlust. */
  await page.getByText(/^Kurse: Stand \d{4}-\d{2}-\d{2}$/).waitFor();
 }
 if(view==='screener'){
  /* DER EINFACHE EINSTIEG ZUERST - er ist jetzt das, was ein Nutzer sieht.
     Sechs Eigenschaften, ein Satz, der die Auswahl vorliest, und bei jedem
     Treffer der gemessene Wert als Antwort auf "warum ist die Aktie hier?". */
  const marken=await page.locator('.q-chip[aria-pressed]').allInnerTexts();
  const erwarteteMarken=['Qualität','Wachstum','Momentum','Bewertung','Profitabilität','Risiko'];
  if(marken.map(t=>t.trim()).join('|')!==erwarteteMarken.join('|'))
   throw Error('die einfachen Kriterien sind nicht die erwarteten: '+marken.join('|'));
  await page.locator('.q-sentence').filter({hasText:'Du suchst Aktien'}).waitFor();
  const trefferZeilen=await page.locator('.q-hit').count();
  if(!trefferZeilen)throw Error('der einfache Einstieg zeigt keine Treffer');
  const ohneWert=(await page.locator('.q-hit .q-hit-why').allInnerTexts()).filter(t=>!/\d/.test(t));
  if(ohneWert.length)throw Error('Trefferzeile ohne gemessenen Wert: '+ohneWert[0]);
  /* DIE RECHTE SPALTE TRAEGT EIN URTEIL, KEINE ZWEITE ZAHL.
     Vorher stand dort die Zahl aus derselben Zeile noch einmal
     ("Qualitaet: stark (90)" und daneben "90") - 75 der 112 Zahlen dieser
     Seite lagen in dieser Spalte. Jetzt steht dort das Klartext-Urteil
     ueber alle bewerteten Faktoren. Die Pruefung haelt fest, dass es ein
     WORT ist und zur Tonlage passt: eine Zahl an dieser Stelle waere der
     Rueckfall. */
  const urteile=await page.locator('.q-hit .q-hit-num').allInnerTexts();
  if(!urteile.length)throw Error('die Trefferzeilen tragen keine rechte Spalte');
  const erlaubt=['Überwiegend stark','Mehr Stärken als Schwächen','Gemischtes Bild',
   'Mehr Schwächen als Stärken','Überwiegend schwach',''];
  const fremd=urteile.map(t=>t.trim()).filter(t=>!erlaubt.includes(t));
  if(fremd.length)throw Error('rechte Spalte traegt kein Klartext-Urteil: '+JSON.stringify(fremd[0]));
  if(urteile.every(t=>!t.trim()))throw Error('keine einzige Trefferzeile traegt ein Urteil');
  const marke=await page.locator('.q-hit .q-hit-num .q-state').count();
  if(!marke)throw Error('das Urteil ist nicht als Zustandsmarke gezeichnet');

  /* Was der Screener NICHT kann, muss dastehen statt als Knopf zu
     erscheinen - aber nicht zwingend im ersten Bildschirm. Die Methodik
     liegt hinter "Wie wird gefiltert?"; die Pruefung oeffnet sie und
     verlangt die Aussage darin. Erreichbar statt weggelassen ist der
     Unterschied, auf den es hier ankommt. */
  await page.locator('.q-mehr > summary').filter({hasText:'Wie wird gefiltert?'}).click();
  await page.getByText(/Größe und Region sind noch keine Kriterien/).waitFor();
  /* Und die systemische Luecke gehoert genau EINMAL auf die Seite, nicht
     unter jeden Treffer: kein Titel erreicht 7 von 7, weil ein Faktor fuer
     keinen Titel einen Wert traegt. */
  await page.getByText(/trägt derzeit für keinen Titel einen Wert/).waitFor();
  const proZeile=await page.locator('.q-hit').filter({hasText:'von 7'}).count();
  if(proZeile)throw Error(proZeile+' Trefferzeilen tragen wieder den Nenner 7 - kein Titel erreicht ihn');
  /* Der Profi-Modus liegt hinter einer Klappe. Sie muss geoeffnet werden,
     bevor irgendetwas darin sichtbar ist - sonst prueft der Lauf einen
     Editor, den der Browser gar nicht darstellt. */
  await page.locator('.q-pro > summary').click();
  // The two methodologies must be separately selectable, and switching
  // must not carry rules across: a rule means something else over there.
  const methodology=page.getByRole('combobox',{name:'Methodik',exact:true});
  await methodology.waitFor();
  if(await methodology.locator('option').count()!==2)throw Error('screener methodologies missing');
  if(!await page.locator('a.row').count())throw Error('legacy screen returned nothing');
  await methodology.selectOption('quantV2Evidence');
  await page.getByRole('heading',{name:'Methodik gewechselt',exact:true}).waitFor();
  const fieldNames=await page.locator('.rule select').first().locator('option').allTextContents();
  if(fieldNames.some(name=>!name.startsWith('Quant V2')))throw Error('legacy field offered under the Quant V2 methodology');
  await page.getByRole('button',{name:'Anwenden',exact:true}).click();
  await page.getByText(/Quant V2 · Factor Evidence · kein Gesamtmarkt-Ranking/).waitFor();
  if(!await page.locator('a.row').count())throw Error('Quant V2 screen returned nothing');
  // A strategy profile loads its own rule into the editor, and it is the
  // same rule: same filter count, and it selects.
  const profileSelect=page.getByRole('combobox',{name:'Strategie-Profil',exact:true});
  await profileSelect.selectOption('quality-momentum');
  await page.waitForFunction(()=>document.querySelectorAll('.rule').length===3);
  if(await page.locator('.screener-method select').first().inputValue()!=='quantV2Evidence')throw Error('profile did not carry its methodology');
  await page.waitForFunction(()=>document.querySelectorAll('a.row').length>0);
  await page.goto(origin+'/vu2/?view=screener');await page.locator('main footer').waitFor();
 }
 if(view==='strategies'){
  /* DER KATALOG ZUERST: acht Ansaetze mit Klartext, Bedingungen samt
     Schwelle, heutigen Treffern - und einem, der bewusst nichts liefert. */
  const karten=await page.locator('.q-catalog > .q-card h2').allInnerTexts();
  if(karten.length<7)throw Error('der Strategie-Katalog zeigt nur '+karten.length+' Ansaetze');
  const katalogText=await page.locator('.q-catalog').innerText();
  if(!/Titel erfüllen heute alle Bedingungen/.test(katalogText))throw Error('kein Ansatz nennt seine heutigen Treffer');
  if(!/Derzeit keine Auswahl/.test(katalogText))throw Error('der Ansatz ohne Datengrundlage sagt nicht, dass er nichts liefert');
  /* KEINE TREFFERQUOTE. Die einzige veroeffentlichte historische Groesse ist
     die Bestaendigkeit der Zuordnung, und sie muss von einer Erfolgsquote
     ausdruecklich abgegrenzt sein. */
  await page.getByText(/Eine historische Erfolgsquote je Ansatz ist nicht zertifiziert/).waitFor();
  /* Der Regel-Editor liegt hinter einer Klappe und muss geoeffnet werden. */
  await page.locator('.q-pro > summary').click();
  await page.getByText(/6\.875 kanonische Produkttitel stehen der aktuellen Kriterienprüfung zur Verfügung/).waitFor();const query=await page.evaluate(()=>VUScreenerWorkspace.build([{field:'momentum6m',operator:'gte',value:10,scale:'raw'},{field:'revenueGrowth',operator:'gte',value:20,scale:'raw'}]));await page.goto(origin+'/vu2/?view=strategies&query='+encodeURIComponent(JSON.stringify(query)));await page.locator('main footer').waitFor();/* Mit Regeln im Link oeffnet die Seite den Editor selbst - ein Klick wuerde ihn schliessen. */if(!await page.locator('.q-pro').evaluate(d=>d.open))throw Error('Editor bleibt zu, obwohl Regeln im Link stehen');if(await page.locator('.strategy-rules p').count()!==2)throw Error('strategy rules lost');await page.getByRole('button',{name:'Version speichern',exact:true}).click();await page.getByRole('heading',{name:'Version 1 gespeichert',exact:true}).waitFor();await page.locator('#strategy-slippage').fill('10');await page.locator('#strategy-reason').fill('Konservativere Ausführung');await page.getByRole('button',{name:'Version speichern',exact:true}).click();await page.getByRole('heading',{name:'Version 2 gespeichert',exact:true}).waitFor();await page.reload();await page.locator('main footer').waitFor();if(await page.locator('#strategy-slippage').inputValue()!=='10')throw Error('strategy version not restored');await page.getByRole('button',{name:'Aktuelle Kriterien prüfen',exact:true}).click();await page.getByRole('heading',{name:'Aktuelle Kriterien-Auswahl',exact:true}).waitFor();if(await page.locator('a.row').count()!==1)throw Error('strategy filter mismatch');await page.route('**/quant/data/market/factors/factors-FULL_UNIVERSE.json',route=>route.abort());await page.reload();await page.locator('main footer').waitFor();await page.getByRole('button',{name:'Aktuelle Kriterien prüfen',exact:true}).click();await page.getByRole('heading',{name:'Auswahl noch nicht auswertbar',exact:true}).waitFor();if(await page.locator('a.row').count())throw Error('unavailable strategy source rendered as selection');await page.unroute('**/quant/data/market/factors/factors-FULL_UNIVERSE.json');await page.reload();await page.locator('main footer').waitFor();}
 if(view==='portfolio'){await page.getByRole('heading',{name:'Noch keine Positionen',exact:true}).waitFor();await page.getByRole('textbox',{name:'Position Ticker'}).fill('NVDA');await page.getByRole('spinbutton',{name:'Stückzahl'}).fill('10');await page.getByRole('button',{name:'Position übernehmen',exact:true}).click();await page.getByRole('button',{name:'Bestände speichern',exact:true}).click();await page.getByRole('heading',{name:'Bestände gespeichert',exact:true}).waitFor();await page.reload();await page.locator('main footer').waitFor();if(await page.locator('.holding').count()!==1)throw Error('holdings not restored');await page.getByRole('textbox',{name:'Position Ticker'}).fill('TSLA');await page.getByRole('spinbutton',{name:'Stückzahl'}).fill('1');await page.getByRole('button',{name:'Position übernehmen',exact:true}).click();/* Der Depotwert war 'Nicht verfuegbar', solange einer der beiden Titel keinen
   veroeffentlichten Schlusskurs hatte. Inzwischen haben beide einen, und die
   Summe steht da - zu Recht. Eine Pruefung auf die Absage allein prueft also
   eine Datenlage und nicht das Produkt. Geprueft wird die Regel: entweder ein
   Betrag MIT seinem Bewertungsstichtag, oder die Absage MIT ihrem Grund. */
await page.locator('.portfolio-total .quote').waitFor();
const depotWert=(await page.locator('.portfolio-total .quote').innerText()).trim();
const depotSatz=(await page.locator('.portfolio-total p').innerText()).trim();
if(depotWert==='Nicht verfügbar'){
 if(!/kein|nicht|fehlt/i.test(depotSatz))throw Error('Depotwert nicht verfuegbar und ohne Grund: '+depotSatz);
}else{
 if(!/\d/.test(depotWert))throw Error('Depotwert ist weder Betrag noch Absage: '+depotWert);
 if(!/\d{2}\.\d{2}\.\d{2,4}|\d{4}-\d{2}-\d{2}/.test(depotSatz))throw Error('Depotwert ohne Bewertungsstichtag: '+depotSatz);
}
await page.getByRole('button',{name:'TSLA entfernen',exact:true}).click();await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();await page.getByRole('spinbutton',{name:'Stückzahl'}).fill('12');await page.getByRole('button',{name:'Position übernehmen',exact:true}).click();await page.getByRole('button',{name:'Bestände speichern',exact:true}).click();await page.reload();await page.locator('main footer').waitFor();await page.locator('.portfolio-total .quote').getByText((12*nvda.fundamentals.price).toLocaleString('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:2}),{exact:true}).waitFor();}
 if(view==='signals'){if(productIntelligence){if(defaultSignals?.lookback!==20||defaultSignals?.counts?.requested!==productIntelligence.counts.productUniverse)throw Error('default signals artifact does not match product universe');await page.getByText(defaultSignals.counts.available+' von '+defaultSignals.counts.requested+' Unternehmen contract-konform geprüft',{exact:false}).waitFor();if(await page.locator('.signal-event').count()>200)throw Error('broad signals rendered an unbounded event list');const company=page.getByRole('combobox',{name:'Signals Unternehmen'}),ticker=await company.locator('option').nth(1).getAttribute('value');if(!ticker)throw Error('broad signals contain no evidenced company');await company.selectOption(ticker);if(!await page.locator('.signal-event').count())throw Error('broad signal company filter failed');}else{await page.getByRole('heading',{name:'Keine belegten Wechsel in diesem Ausschnitt',exact:true}).waitFor();await page.getByRole('combobox',{name:'Signal-Zeitraum'}).selectOption('60');await page.locator('main footer').waitFor();if(await page.locator('.signal-event').count()!==4)throw Error('historical transitions missing');await page.getByRole('combobox',{name:'Signals Unternehmen'}).selectOption('MSFT');if(await page.locator('.signal-event').count()!==2)throw Error('signal company filter failed');}await page.getByText('Warum wurde der Wechsel erkannt?',{exact:true}).first().click();await page.getByRole('link',{name:'Regel im Quant Screener untersuchen',exact:true}).first().click();await page.locator('main footer').waitFor();if(!['momentum6m','priceTo200dma'].includes(await page.getByRole('combobox',{name:'Kennzahl'}).inputValue()))throw Error('signal rule handoff lost');await page.goto(origin+'/vu2/?view=signals&window=60');await page.locator('main footer').waitFor();}
 if(view==='fundamentals'){await page.locator('.q-chart .bar').first().waitFor();await page.getByRole('combobox',{name:'Berichtsart'}).selectOption('ttm');await page.getByText('TTM noch nicht verfügbar',{exact:true}).waitFor();await page.getByRole('combobox',{name:'Berichtsart'}).selectOption('quarterly');await page.getByText('Berichtszeitraum beachten',{exact:true}).waitFor();await page.getByRole('combobox',{name:'Fundamentale Kennzahl'}).selectOption('free_cash_flow');await page.getByRole('heading',{name:'Freier Cashflow',exact:true}).waitFor();await page.locator('.q-chart .bar').first().waitFor();await page.getByRole('combobox',{name:'Berichtsart'}).selectOption('annual');await page.getByRole('rowheader').filter({hasText:/^FY /}).first().waitFor();await page.getByRole('combobox',{name:'Fundamentale Kennzahl'}).selectOption('revenue');await page.getByRole('heading',{name:'Umsatz',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Fundamentale Kennzahl'}).selectOption('net_income');await page.getByRole('combobox',{name:'Berichtsart'}).selectOption('ttm');await page.getByText('TTM noch nicht verfügbar',{exact:true}).waitFor();const saved=await page.getByRole('link',{name:'Diese Historie erneut öffnen',exact:true}).getAttribute('href');await page.goto(origin+saved);await page.getByText('TTM noch nicht verfügbar',{exact:true}).waitFor();if(await page.getByRole('combobox',{name:'Fundamentale Kennzahl'}).inputValue()!=='net_income'||await page.getByRole('combobox',{name:'Unternehmen',exact:true}).inputValue()!=='NVDA')throw Error('history link lost state');
  await page.goto(origin+'/vu2/?view=fundamentals&ticker=TSLA');await page.getByRole('heading',{name:'Umsatz',exact:true}).waitFor();if(await page.getByRole('combobox',{name:'Unternehmen',exact:true}).inputValue()!=='TSLA'||!await page.locator('.q-chart').count())throw Error('canonical consumer history missing or substituted');await page.getByText('Meldedatum · Tagesgenauigkeit',{exact:true}).waitFor();await page.screenshot({path:out+'/canonical-fundamentals-'+width+'.png',fullPage:true});await auditAccessibility(page,'canonical-fundamentals',width);
  await page.getByRole('combobox',{name:'Berichtsart'}).selectOption('quarterly');await page.getByText(/Gezeigt werden eigenständige Geschäftsquartale/).waitFor();
  const expectedQuarter=quarterlyTSLA.quarterly.revenue.at(-1);await page.getByRole('rowheader',{name:expectedQuarter[1]+' '+expectedQuarter[0]+(expectedQuarter[6]?' · abgeleitet':''),exact:true}).waitFor();
  const quarters=await page.evaluate(async()=>{const api=VUProductServices.create({loadJSON:QuantShell.loadJSON,displayPolicy:VUDisplayPolicy,queryEngine:VUQuery});return api.getHistoricalFundamentals('TSLA',{period:'quarterly'});});
  if(quarters.state!=='AVAILABLE'||quarters.pitEligibility!=='NOT_CERTIFIED'||JSON.stringify(quarters.rows.map(r=>[r.fiscalYear,r.fiscalPeriod,r.end,r.value,r.filed,r.accession,Number(r.derived)]))!==JSON.stringify(quarterlyTSLA.quarterly.revenue))throw Error('quarterly projection changed canonical facts');
  await page.getByText('Berichtsstand: '+quarters.generatedAt.slice(0,10)+'. Frühere Angaben können nachträglich angepasst sein.',{exact:true}).waitFor();
  await page.screenshot({path:out+'/canonical-quarterly-'+width+'.png',fullPage:true});await auditAccessibility(page,'canonical-quarterly',width);checks.push({view:'canonical-quarterly',width,pass:true});

  await page.goto(origin+'/vu2/?view=fundamentals&ticker=NVDA&metric=unknown');await page.getByText('Historienauswahl prüfen',{exact:true}).waitFor();if(await page.locator('.q-chart').count())throw Error('invalid metric rendered fallback');await page.goto(origin+'/vu2/?view=fundamentals&ticker=NVDA');await page.getByRole('heading',{name:'Umsatz',exact:true}).waitFor();}
 if(view==='research'){for(const href of await page.locator('.catalog a').evaluateAll(links=>links.map(a=>a.href))){const response=await page.request.get(href);if(!response.ok())throw Error('workspace link unavailable '+href);}}
 if(view==='markets'){if(await page.locator('.market-observation').count()!==5)throw Error('market observations missing');await page.getByText('Warum?',{exact:true}).first().click();await page.getByText(/Abstand zum 200-Tage-Durchschnitt:/).first().waitFor();}
 if(view==='discover'){if(await page.locator('.collection').count()!==3)throw Error('collections missing');await page.getByRole('link',{name:'Regeln im Quant Screener bearbeiten'}).nth(1).click();await page.locator('main footer').waitFor();if(await page.getByRole('combobox',{name:'Kennzahl'}).inputValue()!=='revenueGrowth'||await page.getByRole('spinbutton').inputValue()!=='20')throw Error('recipe handoff lost');await page.goto(origin+'/vu2/?view=discover');await page.locator('main footer').waitFor();}
 if(view==='screener'){
  /* Ohne Regeln im Link ist der Profi-Modus zugeklappt; dieser Abschnitt
     bedient ihn und muss ihn deshalb oeffnen. Kommt jemand MIT Regeln
     (aus Discover, aus einer gespeicherten Auswahl), oeffnet ihn die Seite
     von selbst - das prueft der Discover-Abschnitt weiter oben. */
  await page.locator('.q-pro > summary').click();
  await page.getByRole('spinbutton').fill('999');await page.getByRole('button',{name:'Anwenden'}).click();/* Der Trefferstand nennt seit M29 die GEWAEHLTE METHODIK zwischen Zahl und
   Ranking-Absage: '0 Treffer in 6875 verfuegbaren Unternehmen · <Methodik> ·
   kein Gesamtmarkt-Ranking'. Die abgeschriebene Fassung kannte den
   Mittelteil nicht und ist seither in einen Timeout gelaufen. Geprueft
   werden die drei Angaben, die zaehlen: die Zahl, das geprüfte Universum und
   die Absage an ein Gesamtranking. */
await page.getByText(/^0 Treffer in 6875 verfügbaren Unternehmen · .+ · kein Gesamtmarkt-Ranking$/).waitFor();await page.getByRole('spinbutton').fill('10');await page.getByRole('button',{name:'Kriterium hinzufügen'}).click();await page.getByRole('spinbutton').nth(1).fill('20');await page.getByRole('button',{name:'Anwenden'}).click();await page.getByText(/Treffer in 6875 verfügbaren Unternehmen · .+ · kein Gesamtmarkt-Ranking/).waitFor();await page.getByText('Regeln speichern & Methodik',{exact:true}).click();const saved=await page.getByRole('link',{name:'Diese Auswahl erneut öffnen'}).getAttribute('href');await page.goto(origin+'/vu2/?view=screener&query=invalid');await page.locator('main footer').waitFor();if(await page.locator('a.row').count())throw Error('invalid rules silently replaced');await page.goto(origin+saved);await page.locator('main footer').waitFor();if(await page.getByRole('spinbutton').count()!==2)throw Error('saved rules lost');await page.getByText(/Treffer in 6875 verfügbaren Unternehmen · .+ · kein Gesamtmarkt-Ranking/).waitFor();}
  if(view==='watchlist'){
  await page.getByRole('heading',{name:'Wen möchtest du beobachten?',exact:true}).waitFor();
  /* EIN FEHLENDES WARTEN, KEIN PRODUKTFEHLER - und seit dem Launch als
     POST_LAUNCH_BACKLOG bekannt: die Schleife hat beide Kuerzel eingefuegt,
     ohne nach dem ersten auf das gerenderte Mitglied zu warten. Das Feld
     wird beim Rendern neu aufgebaut; das zweite `fill` traf dann
     gelegentlich das alte Feld und der Eintrag ging verloren. Gemessen:
     lokal 2 Fehlschlaege auf 5 Laeufe, in CI 2 von 2 gruen - also genau die
     Art Flackern, die man einmal sieht und dann wegerklaert. Jetzt wartet
     die Schleife nach jedem Eintrag auf seine Zeile. */
  let erwartet=0;
  for(const ticker of ['NVDA','TSLA']){
   await page.getByRole('textbox',{name:'Watchlist Ticker'}).fill(ticker);
   await page.getByRole('button',{name:'Titel hinzufügen',exact:true}).click();
   erwartet+=1;
   await page.waitForFunction(n=>document.querySelectorAll('.watchlist-member').length===n,erwartet);
  }if(await page.getByRole('heading',{name:'Analyse noch nicht verfügbar',exact:true}).count())throw Error('canonical watchlist member remained five-scope gated');
  // Quant V2 evidence travels with the list: all seven factors per member,
  // a factor without a value stays visibly empty rather than disappearing.
  await page.waitForFunction(()=>document.querySelectorAll('.factor-strip').length===2);
  if(await page.locator('.factor-strip').first().locator('.strip-cell').count()!==7)throw Error('watchlist factor strip incomplete');
  await page.getByText(/von 7 bewertet/).first().waitFor();
  if(await page.getByRole('link',{name:'Quant-Analyse'}).count()!==2)throw Error('watchlist quant links missing');
  await page.getByRole('button',{name:'Watchlist speichern',exact:true}).click();await page.reload();await page.locator('main footer').waitFor();if(await page.locator('.watchlist-member').count()!==2)throw Error('watchlist selection not preserved');
  await page.getByRole('button',{name:'TSLA aus Watchlist entfernen',exact:true}).click();await page.getByRole('button',{name:'Watchlist speichern',exact:true}).click();
  await page.getByRole('link',{name:'Historische Änderungen',exact:true}).click();await page.locator('main footer').waitFor();if(await page.getByRole('combobox',{name:'Signals Unternehmen'}).inputValue()!=='NVDA')throw Error('watchlist signal context lost');
  await page.goto(origin+'/vu2/?view=watchlist');await page.locator('main footer').waitFor();
  const saved=await page.evaluate(()=>{const key='vu2.watchlist.selection.v1',value=localStorage.getItem(key);localStorage.setItem(key,'broken');return value;});
  await page.reload();await page.getByRole('heading',{name:'Gespeicherte Watchlist nicht lesbar',exact:true}).waitFor();await page.getByRole('link',{name:'Bisherige Watchlist öffnen',exact:true}).waitFor();
  if(await page.evaluate(()=>localStorage.getItem('vu2.watchlist.selection.v1'))!=='broken')throw Error('corrupt watchlist overwritten');
  await page.evaluate(value=>localStorage.setItem('vu2.watchlist.selection.v1',value),saved);await page.reload();await page.locator('main footer').waitFor();await page.getByText('Warum diese Einordnung?',{exact:true}).click();
  if(await page.evaluate(()=>localStorage.getItem('vu.quant.watchlist.v1'))!==null)throw Error('legacy demo was seeded');
  await page.goto(origin+'/vu2/?view=home');await page.locator('main footer').waitFor();
  /* Die beobachteten Titel stehen als Trefferzeile (.q-hit) in der Karte,
     die seit dem Einsteiger-Umbau "Deine Aktien" heisst (vorher "Deine
     beobachteten Titel", davor .home-watch-row). Die ABSICHT ist durch
     alle drei Fassungen dieselbe geblieben: was in der Watchlist
     gespeichert wurde, muss auf der Startseite wieder auftauchen - sonst
     ist der Rundweg gebrochen. */
  await page.locator('.q-card').filter({hasText:'Deine Aktien'}).locator('.q-hit').filter({hasText:'NVDA'}).first().waitFor();await page.screenshot({path:out+'/home-personal-'+width+'.png',fullPage:true});await page.goto(origin+'/vu2/?view=watchlist');await page.locator('main footer').waitFor();await page.getByText('Warum diese Einordnung?',{exact:true}).click();
  }
  if(view==='radar'){
   /* Der Satz lautete 'Quant V2 und Market Regime bleiben geschlossen.' -
      und 'Market Regime' ist selbst ein interner Name auf der Verbotsliste
      fuer Hauptkopie. Die Seite sagt die Absage jetzt in Alltagssprache aus
      dem Sprachverzeichnis. Geprueft wird, dass die Marktbreite entweder
      ausgewiesen ODER begruendet zurueckgehalten wird - und dass der
      interne Name dabei nicht in der Hauptkopie steht. */
   const regimeAbsage=productLanguage.unavailable('marketRegime');
   const regimeFrage=productLanguage.question('marketRegime');
   const radarText=await page.locator('main').innerText();
   if(!radarText.includes(regimeAbsage)&&!radarText.includes(regimeFrage)){
    throw Error('radar fail-closed disclosure missing: weder Frage noch Absage zur Marktbreite');
   }
   const regimePrimary=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,.eyebrow,[class*=chip],[class*=badge]')]
    .filter(n=>!n.closest('details')).map(n=>n.textContent.trim()).filter(t=>/Market Regime|Quant V2/.test(t)));
   if(regimePrimary.length)throw Error('interner Name in der Hauptkopie des Radars: '+regimePrimary.join(' | '));
   if(await page.locator('.radar-module').count()!==4)throw Error('materialized radar modules missing');
   if(await page.locator('.radar-item').count()===0)throw Error('broad radar events missing');
  }
 if(view==='compare'){
  if(await page.locator('.compare-table th[scope="row"]').count()!==18)throw Error('full comparison evidence missing');
  await page.getByRole('button',{name:'Unternehmen hinzufügen',exact:true}).click();await page.getByRole('button',{name:'Unternehmen hinzufügen',exact:true}).click();await page.locator('.compare-controls select').nth(3).waitFor();await page.getByRole('combobox',{name:'Vergleich Bereich'}).selectOption('growth');
  await page.getByRole('rowheader',{name:/Margenausweitung/}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.compare-table td').length===16);
  const saved=await page.getByRole('link',{name:'Diese Auswahl erneut öffnen',exact:true}).getAttribute('href');await page.goto(origin+saved);await page.locator('main footer').waitFor();if(await page.locator('.compare-controls select').count()!==4)throw Error('comparison link lost selection');
  await page.goto(origin+'/vu2/?view=compare&tickers=NVDA,TSLA');await page.locator('main footer').waitFor();if(await page.getByRole('heading',{name:'Nicht alle Unternehmen auswertbar',exact:true}).count())throw Error('canonical comparison remained five-scope gated');if(await page.locator('.compare-table thead th').count()!==3)throw Error('canonical comparison column dropped');
  await page.goto(origin+'/vu2/?view=compare&tickers=NVDA,NVDA');await page.locator('main footer').waitFor();await page.getByRole('heading',{name:'Vergleichsauswahl prüfen',exact:true}).waitFor();
  await page.goto(origin+saved);await page.locator('main footer').waitFor();await page.getByRole('combobox',{name:'Vergleich Bereich'}).selectOption('quality');const comparisonRemovers=page.locator('.compare-controls button[aria-label$=" aus Vergleich entfernen"]');await comparisonRemovers.first().click();await comparisonRemovers.first().click();await page.waitForFunction(()=>document.querySelectorAll('.compare-table thead th').length===3);await page.getByText('Definition',{exact:true}).first().click();
 }
 if(view==='atlas'){
  await page.getByText(/kein angeschlossenes Sprachmodell/).waitFor();await page.locator('.atlas-evidence').getByText(pct(nvda.fundamentals.operatingMargin),{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Atlas Frage'}).selectOption('growth');await page.locator('.atlas-evidence').getByText(pct(nvda.fundamentals.revenueGrowth),{exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Atlas Frage'}).selectOption('technical');await page.getByRole('heading',{name:'Die Kursstruktur von NVDA',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Atlas Unternehmen'}).selectOption('JPM');await page.getByRole('heading',{name:'Die Kursstruktur von JPM',exact:true}).waitFor();
  await page.getByRole('combobox',{name:'Atlas Frage'}).selectOption('quality');await page.getByRole('combobox',{name:'Atlas Unternehmen'}).selectOption('NVDA');await page.locator('.atlas-evidence').getByText(pct(nvda.fundamentals.operatingMargin),{exact:true}).waitFor();await page.getByText('Beleg & Definition',{exact:true}).first().click();
  const calls=await page.evaluate(async()=>{const tools=VUAtlasTools.create(VUProductServices.create({loadJSON:QuantShell.loadJSON,displayPolicy:VUDisplayPolicy,queryEngine:VUQuery}));return [await tools.call('runBacktest',{}),await tools.call('getQuantEvidence',{ticker:'TSLA'})];});if(calls[0].ok||calls[1].data.state!=='AVAILABLE'||calls[1].data.score.state!=='UNAVAILABLE')throw Error('Atlas consumer breadth or execution gate changed');
 }
 await auditAccessibility(page,view,width);
 await page.screenshot({path:out+'/'+view+'-'+width+'.png',fullPage:true});if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+view+'-390-viewport.png'});}checks.push({view,width,pass:true});
 }
 await page.goto(origin+'/vu2/?view=home');await page.locator('main footer').waitFor();
 await page.getByRole('button',{name:'Suche',exact:true}).click();await page.getByRole('textbox',{name:'Suche',exact:true}).fill('TSLA');
 await page.getByRole('dialog').getByRole('link',{name:/^TSLA ·/}).waitFor();await page.screenshot({path:out+'/canonical-search-'+width+'.png',fullPage:true});
 await page.getByRole('dialog').getByRole('link',{name:/^TSLA ·/}).click();await page.locator('main footer').waitFor();
 /* Auf die ERSTE Ueberschrift festlegen: seit die Vergleichsfaelle den
    Firmennamen in ihrer eigenen Ueberschrift tragen ("Aehnliche Situationen
    bei Tesla Inc."), trifft ein blosses /Tesla/ zwei Elemente. Gemeint war
    immer: die Aktienseite dieses Unternehmens ist offen. */
 await page.locator('main h1').filter({hasText:'Tesla'}).waitFor();
 if(!await page.locator('.q-chart').count()||await page.locator('.quote').count()!==1)throw Error('canonical stock intelligence missing or duplicated');await page.getByRole('link',{name:'Historische Fundamentals',exact:true}).waitFor();await page.getByRole('heading',{name:kursverlaufHeading,exact:true}).waitFor();if(productIntelligence)await page.getByRole('link',{name:'Vollständige Technical-Analyse',exact:true}).waitFor();else await page.getByText(/Kursfaktor-Evidenz/).waitFor();await auditAccessibility(page,'canonical-stock',width);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('canonical stock identity overflow');
 await page.screenshot({path:out+'/canonical-stock-'+width+'.png',fullPage:true});checks.push({view:'canonical-search-identity',width,pass:true});
 if(productIntelligence){for(const [view,ticker] of [['technical','TSLA'],['elliott','AMD']]){await page.goto(origin+'/vu2/?view='+view+'&ticker='+ticker);await page.locator('main footer').waitFor();await page.locator('.technical-chart-host svg').waitFor();if(await page.getByRole('combobox',{name:'Unternehmen'}).inputValue()!==ticker)throw Error(view+' broad identity lost for '+ticker);await page.getByRole('heading',{name:'Szenarien & Invalidation',exact:true}).waitFor();checks.push({view:'broad-'+view+'-'+ticker.toLowerCase(),width,pass:true});}}
 await page.route('**/quant/data/sec/quant-factor-inputs.json',route=>route.abort());
 await page.goto(origin+'/vu2/?view=stock&ticker=NVDA');await page.locator('main footer').waitFor();
 /* Dieselbe Mehrdeutigkeit wie bei Tesla: auf die erste Ueberschrift festlegen. */
 await page.locator('main h1').filter({hasText:'NVIDIA'}).waitFor();if(!await page.locator('.q-chart').count()||await page.locator('.quote').count()!==1)throw Error('panel outage hid independent canonical intelligence');
 const independent=await page.evaluate(async()=>{const service=VUProductServices.create({loadJSON:QuantShell.loadJSON,displayPolicy:VUDisplayPolicy,queryEngine:VUQuery});const model=await service.getHistoricalPriceHistory('NVDA');const raw=await QuantShell.loadJSON(model.sourcePath);return model.identity.ticker==='NVDA'&&JSON.stringify(model.bars)===JSON.stringify(raw.points.map(([date,close])=>({date,close})));});
 if(!independent)throw Error('panel outage chart differs from canonical source');
 await page.route('**/quant/data/market/discover-series/**',route=>route.abort());
 await page.route('**/quant/data/market/golden-preview/daily/**',route=>route.abort());
 await page.route('**/quant/data/market/intraday/**',route=>route.abort());
 await page.goto(origin+'/vu2/?view=stock&ticker=NVDA');await page.locator('main footer').waitFor();
 if(await page.locator('.q-chart').count()||await page.locator('.quote').count()!==1)throw Error('history outage hid valid quote or fabricated chart');
 await page.getByRole('heading',{name:'Kurshistorie derzeit nicht verfügbar',exact:true}).waitFor();
 await page.unroute('**/quant/data/market/discover-series/**');
 await page.unroute('**/quant/data/market/golden-preview/daily/**');
 await page.unroute('**/quant/data/market/intraday/**');
 await page.unroute('**/quant/data/sec/quant-factor-inputs.json');checks.push({view:'canonical-identity-panel-outage',width,pass:true});
 await page.goto(origin+'/vu2/?view=does-not-exist');await page.getByRole('heading',{name:'Diese Ansicht wurde nicht gefunden',exact:true}).waitFor();if(await page.locator('h1').count()!==1)throw Error('unknown route kept a misleading view');await page.screenshot({path:out+'/not-found-'+width+'.png',fullPage:true});await page.getByRole('link',{name:'Research öffnen',exact:true}).click();await page.getByRole('heading',{name:'Research ohne Umwege',exact:true}).waitFor();checks.push({view:'unknown-workspace-recovery',width,pass:true});
 const serviceRoute=/\/(?:quant\/api\/product-services|vu2\/release-bundle)\.js(?:\?v=[a-f0-9]+)?$/;
 // Install the same rejection before service initialization, independent of
 // whitespace/minification. Removing this route restores the original service.
 await page.route(serviceRoute,async route=>{const response=await route.fetch();const injected=`
Object.defineProperty(window,'VUProductServices',{configurable:true,set(service){
 const original=service.create;
 Object.defineProperty(window,'VUProductServices',{configurable:true,writable:true,value:{...service,create:(...args)=>({...original(...args),getHomeIntelligence:async()=>{throw Error('QA injected product rejection');}})}});
}});
`;
 await route.fulfill({response,body:injected+await response.text()});});
 await page.goto(origin+'/vu2/?view=home');await page.getByRole('heading',{name:'Ansicht derzeit nicht verfügbar',exact:true}).waitFor();if(await page.locator('h1').count()!==1||await page.locator('a.row').count())throw Error('failed render retained partial content');await page.screenshot({path:out+'/render-recovery-'+width+'.png',fullPage:true});await page.unroute(serviceRoute);await page.getByRole('link',{name:'Erneut versuchen',exact:true}).click();await page.getByRole('heading',{name:'Aktien verstehen, ohne Vorwissen.',exact:true}).waitFor();checks.push({view:'render-failure-recovery',width,pass:true});
 await page.goto(origin+'/vu2/?view=stock&ticker=NVDA');await page.locator('main footer').waitFor();
 /* Die Aktienanalyse gehoert zum Bereich AKTIEN und markiert ihn.
    Vorher stand hier 'Research' - den Bereich gibt es in der
    Quant-Navigation nicht mehr; die Absicht (die offene Seite faerbt
    ihren Bereich ein) bleibt dieselbe. */
 const visibleNav=page.locator(width<=900?'.q-bottom':'.nav');
 if(await visibleNav.getByRole('link',{name:'Aktien',exact:true}).getAttribute('aria-current')!=='location')throw Error('Bereich AKTIEN ist auf der Aktienseite nicht markiert');
 await page.keyboard.press('Tab');if(!await page.locator('.skip').evaluate(e=>e===document.activeElement))throw Error('skip link not first');await page.keyboard.press('Enter');if(!await page.locator('main').evaluate(e=>e===document.activeElement))throw Error('skip target not focused');
 const searchButton=page.getByRole('button',{name:'Suche',exact:true});await searchButton.focus();await page.keyboard.press('Enter');const searchInput=page.getByRole('textbox',{name:'Suche',exact:true});await searchInput.fill('NVDA');await page.keyboard.press('Control+k');if(await searchInput.inputValue()!=='NVDA')throw Error('repeated command lost query');await page.getByRole('status').filter({hasText:'1 Unternehmen gefunden.'}).waitFor();
 for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');if(!await page.getByRole('dialog').evaluate(e=>e.contains(document.activeElement)))throw Error('focus escaped modal');}await page.keyboard.press('Escape');if(!await searchButton.evaluate(e=>e===document.activeElement))throw Error('search focus not restored');checks.push({view:'keyboard-navigation',width,pass:true});
 await page.goto(origin+'/quant/technical/?symbol=NVDA&layer=ELLIOTT');await page.locator('[role="tab"][data-layer="ELLIOTT"][aria-selected="true"]').waitFor();await page.locator('.q-tech-chart-wrap svg').waitFor();await page.getByRole('heading',{name:'Szenarien',exact:true}).waitFor();await page.getByRole('button',{name:'Alternative',exact:true}).click();await page.screenshot({path:out+'/elliott-preserved-'+width+'.png',fullPage:true});checks.push({view:'elliott-preserved',width,pass:true});
 await page.goto(origin+'/vu2/?view=home');await page.locator('main footer').waitFor();await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor();await page.getByRole('textbox',{name:'Suche',exact:true}).fill('NVDA');await page.getByRole('dialog').getByRole('link',{name:/NVDA/}).click();await page.locator('main footer').waitFor();await page.locator('.quote').getByText(nvda.fundamentals.price.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' $',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Full Chart',exact:true}).click();await page.locator('.q-chart').first().waitFor();await page.goBack();await page.locator('main footer').waitFor();
 /* DIE PRUEFUNG MUSS SAGEN, WELCHE FLAECHE SIE MEINT.

    Seit der gemeinsame Plattform-Kopf auch auf Quant steht, gibt es den
    Namen 'Quant' auf der Aktienseite zweimal: einmal als Vertiefungsknopf
    IM INHALT (fuehrt in die Quant-Ansicht dieses Titels) und einmal im
    Schnellzugriff des Kopfes (fuehrt in das Produkt Quant). Beides ist
    richtig, und ein ungebundener Locator ist deshalb ab jetzt
    zweideutig - gemessen: 'strict mode violation ... resolved to 2
    elements'.

    Die Knoepfe, um die es hier geht, stehen im Inhalt. Also wird im
    Inhalt gesucht. Ein `.first()` waere die bequeme Variante und die
    falsche: es wuerde auch dann gruen bleiben, wenn der Knopf aus dem
    Inhalt verschwindet und nur noch der Kopfeintrag uebrig ist. */
 const inhalt=page.locator('main#content');
 for(const [name,heading] of [['Technical','Kursstruktur untersuchen'],['Elliott Wave','Elliott Wave · Szenarien verstehen'],['Historische Fundamentals','Wie entwickelt sich das Geschäft?'],['Quant',nvdaName]]){await inhalt.getByRole('link',{name,exact:true}).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.goBack();await page.locator('main footer').waitFor();}
 await page.getByRole('link',{name:'Strategie definieren',exact:true}).click();
 /* Von der Aktienseite fuehrt der Weg auf die Strategieseite OHNE Regeln in
    der Adresse - dort steht der Katalog vorn und der Regel-Editor hinter
    seiner Klappe. Was im Editor liegt, wird erst nach dem Oeffnen sichtbar. */
 await page.locator('.q-pro > summary').click();
 await page.getByRole('heading',{name:'Vor einem historischen Test',exact:true}).waitFor();if(await page.getByRole('link',{name:'Bestehende Backtest-Umgebung',exact:true}).getAttribute('href')!=='/quant/backtests/')throw Error('professional backtest access lost');
 /* DER KATALOG FUEHRT AUS QUANT NICHT MEHR IN FREMDE PRODUKTE.

    Bis zum 29.09.2026 hat diese Zeile das Gegenteil verlangt: der Katalog
    MUSSTE Academy, Analysten, Discover, ETF, Hedgefonds, Macro, Magazin,
    Morning, News und Reports fuehren. Der Owner-Entscheid zur
    Produktarchitektur sagt: Discover, Quant, Screener, Research usw. sind
    eigenstaendige Produkte, und innerhalb von Quant stehen ausschliesslich
    Home, Quant Screener, Strategien, Aktien und Methodik. Ein Katalog, der
    zehn andere Produkte als Quant-Unterpunkte auffuehrt, ist genau die
    Vermischung, die der Entscheid verbietet.

    Die Pruefung wird deshalb nicht geloescht, sondern umgedreht - und sie
    prueft beide Haelften, sonst waere sie nur noch die Haelfte wert:

      (a) Quant verlinkt in seinem Katalog nur eigene Flaechen.
      (b) Die zehn Produkte sind trotzdem erreichbar, naemlich im
          gemeinsamen Plattform-Kopf. Ohne (b) koennte man die Wege
          einfach kappen und diese Datei bliebe still. */
 await page.goto(origin+'/vu2/?view=research');await page.locator('main footer').waitFor();
 const directory=await page.locator('.catalog a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
 const fremd=['/discover/','/news/','/etf/','/macro/','/hedgefonds/','/analysten/','/morning/','/magazin/','/reports/','/academy/','/dashboard/','/guide/','/budget/','/screener/'];
 const ausgang=directory.filter(h=>h&&fremd.some(p=>h.startsWith(p)));
 if(ausgang.length)throw Error('der Quant-Katalog fuehrt in fremde Produkte: '+ausgang.join(', '));
 if(!directory.some(h=>h&&h.startsWith('/quant/')))throw Error('der Quant-Katalog verlinkt keine einzige Quant-Flaeche mehr - der Auszug greift nicht');
 /* Der Kopf ist ein Web-Component mit offenem Shadow-Root; Playwrights
    CSS-Engine sieht hinein. */
 const kopf=await page.locator('vu-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
 for(const path of ['/discover/','/news/','/etf/','/macro/','/hedgefonds/','/analysten/','/morning/','/magazin/','/reports/','/academy/','/screener/'])
  if(!kopf.some(h=>h&&h.startsWith(path)))throw Error('der Plattform-Kopf fuehrt nicht mehr zu '+path+' - das Produkt ist aus Quant heraus unerreichbar');
 await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');if(await page.getByRole('dialog').isVisible())throw Error('command dialog keyboard exit failed');checks.push({view:'guided-professional-journey',width,pass:true});
 if(errors.length)throw Error(errors.join('\n'));await page.close();}
 // Test-only relay fixture exercises the production UI without contacting a provider.
 for(const width of [1440,390]){
  const live=await browser.newPage({viewport:{width,height:1000}});
  await live.addInitScript(()=>{
   const NativeDate=Date,fixed=NativeDate.parse('2026-09-18T15:00:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
   window.__relayTest={opens:0,sent:[],closed:0};
   window.WebSocket=class{constructor(url){if(url!=='wss://live.visionuniverse.de/live')throw Error('unexpected relay');window.__relayTest.opens++;window.__relayTest.socket=this;setTimeout(()=>this.onopen?.({}),0);}send(value){window.__relayTest.sent.push(JSON.parse(value));}close(){window.__relayTest.closed++;}};
  });
  await live.goto(origin+'/vu2/?view=stock&ticker=TSLA');await live.locator('main footer').waitFor();
  if(await live.evaluate(()=>__relayTest.opens)!==0)throw Error('automatic realtime subscription');
  await live.getByRole('button',{name:'Live-Verbindung starten',exact:true}).click();
  await live.getByText('Verbunden · wartet auf einen bestätigten Trade.',{exact:true}).waitFor();
  await live.evaluate(()=>{const send=(type,price,at)=>__relayTest.socket.onmessage({data:JSON.stringify({op:'u',schemaVersion:'vu-live-update-1.1.0',v:[['TSLA',price,Date.now(),9999,9999,9999,9999,at]],semantics:[{priceType:type,messageForm:'iexTyped',candlePriceType:'REALTIME_REFERENCE'}]})});window.__relayTest.send=send;send('QUOTE',9999,Date.now()-3000);});
  if(await live.getByText(/Zuletzt beobachtet:/).count())throw Error('quote moved price');
  await live.evaluate(()=>{__relayTest.send('TRADE',240,Date.now()-2000);__relayTest.send('TRADE',241,Date.now()-1000);});
  await live.getByText(/Zuletzt beobachtet: 241/).waitFor();await live.getByRole('img',{name:'TSLA · bestätigte Trades seit Verbindungsstart'}).waitFor();
  await live.evaluate(()=>__relayTest.send('UNSPECIFIED',9999,Date.now()));
  if(!/241/.test(await live.getByText(/Zuletzt beobachtet:/).innerText()))throw Error('untyped event moved price');
  if(await live.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('live stock overflow');
  await live.screenshot({path:out+'/live-relay-test-fixture-'+width+'.png',fullPage:true});
  await live.getByRole('button',{name:'Live-Verbindung beenden',exact:true}).click();
  if(await live.evaluate(()=>__relayTest.closed)!==1)throw Error('subscription not released');
  checks.push({view:'trade-only-relay-test-fixture',width,pass:true,productionDataClaim:false});await live.close();
 }
 const tablet=await browser.newPage({viewport:{width:768,height:1024},deviceScaleFactor:1});for(const view of ['home','compare','research']){await tablet.goto(origin+'/vu2/?view='+view);await tablet.locator('main footer').waitFor();if(await tablet.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('tablet overflow '+view);/* Auf 768 px traegt die untere Leiste die Navigation; die obere ist ab
    900 px ausgeblendet, damit nicht beide dieselben Ziele zeigen. */
   const nav=tablet.locator('.q-bottom');if(!await nav.isVisible()||await nav.locator('a').count()!==5)throw Error('tablet navigation incomplete');
   if(await tablet.locator('.top .nav').isVisible())throw Error('zwei Navigationen auf 768 px');await tablet.screenshot({path:out+'/'+view+'-768.png',fullPage:true});checks.push({view,width:768,pass:true});}await tablet.close();
 await writeFile(out+'/results.json',JSON.stringify({checks},null,2));await writeFile(out+'/performance.json',JSON.stringify({environment:'GitHub Actions local static server; not production performance',samples:performanceSamples},null,2));console.log(JSON.stringify({passed:checks.length,output:out}));
 await writeFile(out+'/resource-budgets.json',JSON.stringify({scope:'Decoded subresource bytes and request count; not production latency',results:resourceBudgets},null,2));
 console.log(JSON.stringify({resourceBudgetChecks:resourceBudgets.length,resourceBudgetFailures:resourceBudgets.filter(r=>!r.pass)}));
 if(resourceBudgets.length!==8||resourceBudgets.some(r=>!r.pass))throw Error('Resource budget gate failed; see resource-budgets.json');
 const violations=accessibility.flatMap(r=>r.violations.map(v=>({view:r.view,width:r.width,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
 console.log(JSON.stringify({accessibilityPages:accessibility.length,violations}));
 if(violations.length)throw Error('Automated accessibility gate failed; see accessibility.json');
}finally{await browser.close();await new Promise(r=>server.close(r));}
