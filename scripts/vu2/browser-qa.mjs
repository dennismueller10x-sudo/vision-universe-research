// Explicitly requested static-repository QA. No deployment or provider calls.
//
// NEU AUSGERICHTET AM 30.09.2026 AUF DAS NEUE QUANT-FRONTEND.
//
// Die Oberflaeche ist die Hash-App unter /quant/ (quant/index.html +
// quant/app/*.js; im Release ein Bundle quant/release-bundle.js). Diese QA
// laeuft wie vorher im gebauten Release-Verzeichnis (cwd) und prueft bei
// 1440 und 390 px jede Route: genau eine Ueberschrift, kein Ueberlauf,
// automatisierte WCAG-2.1-A/AA-Pruefung (axe) mit NULL Verstoessen,
// Ressourcenbudgets, die fuenf Quant-Bereiche und kein fremdes Produkt, die
// Tastaturwege (Sprunglink, Suchdialog, Fokusfalle, Fokus-Rueckgabe) und
// die Ausfall- und Wiederherstellungsbilder. Dazu die Tablet-Pruefung bei
// 768 px: unter 1000 px traegt die untere Leiste die fuenf Bereiche, die
// Kopfnavigation ist ausgeblendet.
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
// Erwartungen werden aus den ausgelieferten Artefakten GELESEN, nicht
// abgeschrieben: die Reihenfolge der sieben Faktoren aus der Engine, die
// Strategien aus der Methodik, der Name aus dem Verzeichnis. Eine
// abgeschriebene Zeichenkette ist die Falle, in die diese QA am 28.09.2026
// dreimal gelaufen ist.
const factorEvidence=require(resolve(root,'quant/engines/factor-evidence.js'));
if(factorEvidence.FACTOR_ORDER.length!==7)throw Error('der Faktorkanon hat nicht sieben Faktoren');
const profiles=JSON.parse(await readFile(resolve(root,'quant/methodology/strategy-profiles-v1.json'),'utf8')).profiles;
const universeIndex=JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/product/universe-list-v1.json.gz'))).toString('utf8'));
const nvdaName=(universeIndex.entries||[]).find(e=>e.s==='NVDA')?.n;
if(!nvdaName)throw Error('das Verzeichnis nennt keinen Namen fuer NVDA');
const nvdaEod=(universeIndex.entries||[]).find(e=>e.s==='NVDA');
// Explicit stale-data scenario, retaining actual source files and all freshness assertions.
const staleClock=new Date(Date.parse(nvdaEod.d+'T22:00:00Z')+7*86400000);
await writeFile(out+'/observation-context.json',JSON.stringify({sourceAsOf:nvdaEod.d,browserClock:staleClock.toISOString(),scenario:'STALE_EOD',syntheticMarketData:false}));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname.split('/').some(s=>s.startsWith('.')))throw Error('private');if(pathname.endsWith('/'))pathname+='index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.gz')?'application/octet-stream':(mime[extname(file)]||'application/octet-stream'));res.end(await readFile(file));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
/* Lokal liegt Chromium an einem festen Pfad, auf dem Runner sucht
   Playwright selbst - dieselbe Regel wie im Produktions-Smoke. */
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
 ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const origin='http://127.0.0.1:'+server.address().port;const checks=[],performanceSamples=[],accessibility=[],resourceBudgets=[],findings=[];
const Q=origin+'/quant/';
/* Jede Route, die die App kennt - mit dem Budget-Schluessel, wo eines gilt.
   Alle zehn Methodik-Themen und alle Strategien stehen mit drin: eine
   Unterseite ohne axe-Lauf ist eine ungepruefte Unterseite. */
const ROUTES=[
 ['home','#/','home'],
 ['radar','#/radar'],
 ['screener','#/screener','screener'],
 ['screener-hoch','#/screener?frage=hoch'],
 ['screener-setups','#/screener?frage=setups'],
 ['screener-profi','#/screener/profi','screenerPro'],
 ['strategien','#/strategien'],
 ...profiles.map(p=>['strategie-'+p.profileId,'#/strategien/'+p.profileId]),
 ['aktien','#/aktien'],
 ['aktie-nvda','#/aktie/NVDA','stock'],
 ['aktie-jpm','#/aktie/JPM'],
 ['aktie-edva','#/aktie/EDVA'],
 ['aktie-aaac','#/aktie/AAAC'],
 ['aktie-all-p-b','#/aktie/ALL-P-B'],
 ['aktie-unbekannt','#/aktie/ZZZZZ'],
 /* Seit Technical Intelligence v3 zeigen die alten Technik-Routen das Chartbild (Lesezeichen bleiben gueltig). */
 ['technik','#/aktie/NVDA/technik'],
 ['elliott','#/aktie/NVDA/technik?elliott=1'],
 ['chartbild','#/aktie/NVDA/chartbild'],
 ['chartlagen','#/chartlagen'],
 ['zahlen','#/aktie/NVDA/zahlen'],
 ['vergleich','#/vergleich/NVDA,MSFT'],
 ['methodik','#/methodik'],
 ...['daten','faktoren','gewichtung','branchen','setups','strategien','chartbild','historie','grenzen','versionen'].map(t=>['methodik-'+t,'#/methodik/'+t]),
 ['nicht-gefunden','#/gibtsnicht']
];
/* UI-Vereinheitlichung 10/2026: die gemeinsame Produkt-Leiste der Shell.
   Der erste Eintrag ist der Produktname; "Screener" heisst fuer
   Screenreader "Quant Screener". Methodik ist sekundaer (Hero, Fuss). */
const SOLL_BEREICHE=['Quant','Screener','Strategien','Aktien'];
async function bereit(page,view){
 await page.waitForFunction(v=>{const m=document.querySelector('main#qx-main');return !!m&&m.dataset.ready==='true'&&m.getAttribute('aria-busy')==='false'&&(!v||m.dataset.view===v)&&!m.querySelector('.qx-loading');},view||null,{timeout:45000});
 await page.waitForFunction(()=>{const c=document.querySelector('section.qc-chart');return !c||!!c.dataset.range||!/Chart wird geladen/.test(c.textContent);},null,{timeout:10000}).catch(()=>{});
 await page.waitForTimeout(150);
}
async function frisch(page,hash,view){await page.goto('about:blank');await page.goto(Q+hash);await bereit(page,view);}
/* ALLE AUFKLAPPER OEFFNEN - UND ZWAR WIRKLICH ALLE. Ein geoeffneter
   Aufklapper legt verschachtelte nach; deshalb nach jedem Oeffnen neu
   suchen, mit einer Schranke gegen eine Endlosschleife. */
async function alleAufklappen(page,wurzel){
 for(let runde=0;runde<200;runde++){
  const n=await page.evaluate(w=>{const d=document.querySelector((w||'#qx-main')+' details:not([open])');if(!d)return 0;d.open=true;return 1;},wurzel||null);
  if(!n)return;
  await page.waitForTimeout(20);
 }
}
async function auditAccessibility(page,view,width){
 await page.addScriptTag({path:axePath});
 const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
 accessibility.push({view,width,engine:result.testEngine,violations:result.violations,incomplete:result.incomplete,passedRules:result.passes.length});
 await writeFile(out+'/accessibility.json',JSON.stringify({scope:'Automated WCAG 2.1 A/AA checks; not a manual accessibility certification',results:accessibility},null,2));
}
/* Ein Befund bricht den Lauf NICHT ab: er wird gesammelt, und am Ende
   faellt die QA, wenn es einen gibt. So zeigt ein Lauf ALLE Befunde statt
   nur den ersten - der alte Lauf brach beim ersten `throw` ab und
   versteckte damit alles dahinter. */
function befund(view,width,text){findings.push({view,width,finding:text});console.log('BEFUND '+view+'@'+width+': '+text);}
async function versuch(view,width,fn){try{await fn();}catch(e){befund(view,width,'ABBRUCH: '+String(e.message||e).split('\n')[0].slice(0,220));}}

try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});await page.addInitScript(time=>{const NativeDate=Date,fixed=NativeDate.parse(time);globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixed]));}static now(){return fixed;}};},staleClock.toISOString());
 const errors=[];let fremd=false;
 /* Absichtlich abgebrochene Anfragen (Ausfallbilder) erzeugen je eine
    Konsolenzeile "net::ERR_FAILED". Sie werden gezaehlt und genau so oft
    uebergangen - jede weitere Zeile bleibt ein Befund. Vorher verdeckte
    ein zufaellig fehlschlagender Fremdabruf (Webfont) diese Zeilen lokal,
    und in CI, wo er gelingt, wurden sie zum Befund. */
 let absichtlich=0;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{if(!r.url().startsWith(origin))fremd=true;});
 page.on('console',m=>{const t=m.text();if(m.type()!=='error'||t.includes('404')||t.includes('favicon'))return;if(absichtlich>0&&/^Failed to load resource: net::ERR_FAILED/.test(t)){absichtlich--;return;}if(fremd&&/^Failed to load resource: net::ERR_/.test(t))return;errors.push('console: '+t.split('\n')[0]);});
 /* Eine Leiste fuer alle Produkte: die schwebende Produkt-Leiste der
    gemeinsamen Shell (#vu-dock, Shadow DOM; Playwright-Locator durchdringen
    ihn), bei jeder Breite unten. */
 const leiste='#vu-dock nav';
 for(const [view,hash,budgetKey] of ROUTES){await versuch(view,width,async()=>{
  const started=performance.now();await frisch(page,hash);
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,bytes:r.decodedBodySize,durationMs:Math.round(r.duration)})));performanceSamples.push({view,width,renderMs:Math.round(performance.now()-started),decodedBytes:resources.reduce((sum,r)=>sum+r.bytes,0),requests:resources.length});
  if(budgetKey){const budget=assessResourceBudget(budgetKey,resources);if(budget){resourceBudgets.push({...budget,route:hash,width});
   /* Bei einer Verletzung die groessten Posten ausgeben - sonst ist ein
      roter Budget-Lauf in CI nicht ohne das Artefakt zu deuten. */
   if(!budget.pass)console.log('BUDGET '+view+'@'+width+': '+resources.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,15).map(r=>r.bytes+' '+r.path).join(' | '));}}
  if(view==='home'&&resources.some(r=>r.path.includes('/daily/ref_')||r.path.includes('/fixtures/')))befund(view,width,'Home loads raw history or fixtures');
  const h1=await page.locator('h1').count();
  if(h1!==1)befund(view,width,'H1='+h1);
  /* KEINE SEITE WIEDERHOLT DEN ANSPRUCH AUS DER KOPFZEILE ALS UEBERSCHRIFT.
     Zweimal gefunden (Screener "Chancen finden.", Strategien "Strategien
     verstehen."): dieselben Woerter zweimal, rund 90 px auseinander. Der
     Anspruch steht in der Kopfzeile (Discovers .v2-bar-caption). */
  /* Konzept-Design: die Kopfzeile traegt keinen Anspruch mehr. Ohne
     Element nicht 30 s auf textContent warten - gezaehlt wird zuerst. */
  const anspruchNode=page.locator('.qx-bar .v2-bar-caption').first();
  const anspruch=(await anspruchNode.count()?(await anspruchNode.textContent().catch(()=>''))||'':'').trim();
  const ueberschrift=(await page.locator('main h1').first().innerText().catch(()=>'')).trim();
  const norm=t=>t.toLowerCase().replace(/[.!?–-]+/g,' ').replace(/\s+/g,' ').trim();
  if(anspruch&&ueberschrift&&norm(anspruch)===norm(ueberschrift))befund(view,width,'"'+ueberschrift+'" steht zweimal: als Anspruch in der Kopfzeile und als Ueberschrift');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))befund(view,width,'page overflow');
  /* DIE FUENF BEREICHE, UND KEIN FREMDES PRODUKT - in genau einer Leiste,
     die bei jeder Breite sichtbar ist und dort steht, wo man sie erwartet. */
  if(await page.locator('nav.qx-nav, nav.qx-tabbar, nav.v2-dock').count()!==0||await page.locator(leiste).count()!==1)befund(view,width,'zwei Navigationen');
  {
   const bereiche=(await page.locator(leiste+' a').allTextContents()).map(t=>t.trim());
   if(bereiche.join('|')!==SOLL_BEREICHE.join('|'))befund(view,width,'Quant-Navigation ist nicht die erwartete: '+leiste+' '+bereiche.join('|'));
   for(const fremdes of ['Discover','Research','Markets','Portfolio','Screener'])
    if(await page.locator(leiste).getByRole('link',{name:fremdes,exact:true}).count())befund(view,width,fremdes+' steht in der Quant-Navigation');
  }
  if(!await page.locator(leiste).isVisible())befund(view,width,'die Navigation dieser Breite ist nicht sichtbar: '+leiste);
  {
   const box=await page.locator(leiste).boundingBox();
   const oben=await page.evaluate(()=>window.scrollY);
   void oben;
   if(box&&box.y+box.height<page.viewportSize().height-40)befund(view,width,'die Leiste steht nicht unten');
   if(box&&box.y+box.height>page.viewportSize().height)befund(view,width,'die Leiste ragt aus dem Bild');
  }

  if(view==='home'){
   /* HOME BEANTWORTET ZUERST DIE PRODUKTFRAGE: ein Satz, was Quant ist,
      eine Suche, und die Wege dorthin mit ihrem Ziel. */
   if(!(await page.locator('.qx-hero .q-intro-note').innerText()).includes('US-Aktien'))befund(view,width,'Home sagt nicht, was Quant prueft');
   if(!(await page.locator('.qx-hero .qx-lead').innerText()).includes('wie oft das früher besser lief als der Markt'))befund(view,width,'Home verliert den historischen Marktvergleich');
   await page.locator('button.qx-searchbox').waitFor();
   const einstiege=await page.locator('a.qx-door').evaluateAll(ns=>ns.map(n=>({titel:(n.querySelector('h2,strong')||{}).textContent||'',ziel:n.getAttribute('href')||''})));
   for(const [name,ziel] of [['Aktie analysieren','#/aktien'],['Quant Screener','#/screener'],['Strategien','#/strategien'],['Aktuelle Setups','#/screener?frage=setups']]){
    const treffer=einstiege.find(e=>e.titel.trim()===name);
    if(!treffer)befund(view,width,'Weg "'+name+'" fehlt auf Home');
    else if(treffer.ziel!==ziel)befund(view,width,'Weg "'+name+'" zeigt nicht auf '+ziel+': '+treffer.ziel);
   }
   /* "HEUTE BEI QUANT" IST KEIN ERFUNDENER FEED. Entweder stehen dort die
      ausgewerteten Zustaende MIT ihrem Stichtag, oder der ehrliche Satz,
      dass nichts abrufbar ist. Ein dritter Fall waere erfunden. */
   const heute=await page.locator('section.qx-section').filter({hasText:'Heute bei Quant'}).innerText();
   const mitStand=/\d{2}\.\d{2}\.\d{4}/.test(heute)&&/Stand|→/.test(heute);
   if(!mitStand&&!heute.includes('Gerade keine Veränderungen abrufbar'))befund(view,width,'Heute zeigt weder Zustaende mit Stichtag noch den ehrlichen Rueckfall');
   /* Quellen und die Absage an Empfehlung, Prognose, Kursziel. */
   const fuss=await page.locator('footer.qx-foot').innerText();
   for(const satz of ['Keine Anlageempfehlung','SEC EDGAR','Tiingo'])if(!fuss.includes(satz))befund(view,width,'Fusszeile ohne '+satz);
   if(!await page.locator('footer.qx-foot a[href="/quant/methodology/"]').count())befund(view,width,'Fusszeile ohne Methodik im Detail');
   /* FAELLT DER KALENDER AUS, DARF DIE SEITE IHRE EINSTIEGE NICHT VERLIEREN. */
   await page.route('**/quant/config/market-calendar.json',route=>{absichtlich++;return route.abort();});
   await page.reload();await bereit(page,'home');
   if(await page.locator('a.qx-door').count()!==4)befund(view,width,'Ohne Kalender verliert die Startseite ihre Einstiege');
   await page.unroute('**/quant/config/market-calendar.json');
   await frisch(page,hash,'home');
  }
  if(view==='screener'){
   /* Sieben Fragen, genau eine gedrueckt, ein Satz, der sie vorliest, und
      bei jedem Treffer der gemessene Wert als Antwort auf "warum ist die
      Aktie hier?". */
   const fragen=page.locator('button.qx-question[data-question]');
   if(await fragen.count()!==7)befund(view,width,'nicht sieben Fragen: '+await fragen.count());
   if(await page.locator('button.qx-question[aria-pressed="true"]').count()!==1)befund(view,width,'nicht genau eine Frage gewaehlt');
   await page.locator('button.qx-question[data-question="momentum"]').click();
   await page.waitForFunction(()=>location.hash==='#/screener?frage=momentum'&&!document.querySelector('#qx-main .qx-loading'),null,{timeout:30000});
   if(await page.locator('button.qx-question[data-question="momentum"]').getAttribute('aria-pressed')!=='true')befund(view,width,'die gewaehlte Frage ist nicht markiert');
   if(!/Kursentwicklung/.test(await page.locator('.qx-sentence').innerText()))befund(view,width,'der Satz liest die Frage nicht vor');
   const ohneWert=(await page.locator('#qx-main a.qx-row .qx-row-why').allInnerTexts()).filter(t=>!/\d/.test(t));
   if(!await page.locator('#qx-main a.qx-row').count())befund(view,width,'der einfache Einstieg zeigt keine Treffer');
   if(ohneWert.length)befund(view,width,'Trefferzeile ohne gemessenen Wert: '+ohneWert[0]);
   /* Jede Trefferzeile traegt ein URTEIL in Worten, keine zweite Zahl.
      Konzept-Design: es steht unter dem Namen (.qx-row-verdict), die rechte
      Spalte zeigt den Wert der gefilterten Eigenschaft - mit ihrem Namen.
      Die Marke stellt "Eigenschaften:" voran - geprueft wird das Urteil. */
   const urteile=(await page.locator('#qx-main a.qx-row .qx-row-verdict .qx-pill').allTextContents()).map(t=>t.trim().replace(/^(Gesamt|Eigenschaften):\s*/,'').toLowerCase());
   const erlaubt=['Überwiegend stark','Mehr Stärken als Schwächen','Gemischtes Bild','Mehr Schwächen als Stärken','Überwiegend schwach'].map(t=>t.toLowerCase());
   const fremdesUrteil=urteile.filter(t=>!erlaubt.includes(t));
   if(!urteile.length)befund(view,width,'keine einzige Trefferzeile traegt ein Urteil');
   if(fremdesUrteil.length)befund(view,width,'Trefferzeile traegt kein Klartext-Urteil: '+JSON.stringify(fremdesUrteil[0]));
   /* Die Methodik der Frage steht dabei: die Schwelle ist ein WERT (70),
      die Stufe daneben eine POSITION (factor-band-2.0.0) - beides gesagt. */
   await page.getByText(/Gesucht wird ein Wert von 70 oder mehr .*Die Stufe neben jeder Aktie .* ist dagegen ihre Position unter allen bewerteten Aktien/).waitFor();
   /* Und der Weg in den Profi-Modus traegt die Regel mit. */
   await page.getByRole('link',{name:'Im Profi-Modus verfeinern',exact:true}).click();
   await bereit(page,'screener');
   if(!/^#\/screener\/profi\?query=/.test(await page.evaluate(()=>location.hash)))befund(view,width,'der Profi-Modus bekommt die Regel nicht');
   if(await page.locator('.qx-rules .qx-rule').count()<1)befund(view,width,'Profi-Modus ohne Regel');
  }
  if(view==='screener-hoch'){
   const zeilen=await page.locator('#qx-main a.qx-row').allInnerTexts();
   if(zeilen.length<20)befund(view,width,'nahe am Hoch: nur '+zeilen.length+' Zeilen');
   const mitKurs=zeilen.filter(t=>/\d+,\d+\s*\$/.test(t)&&/\d{2}\.\d{2}\.\d{4}/.test(t)).length;
   if(mitKurs<zeilen.length*0.8)befund(view,width,'nahe am Hoch: nur '+mitKurs+' von '+zeilen.length+' Zeilen mit Kurs und Datum');
  }
  if(view==='screener-profi'){
   /* Die Datenbasis ist waehlbar, eine Regel ist sichtbar und teilbar, und
      eine unerfuellbare Regel liefert "Keine Treffer" statt Ersatz. */
   const basis=page.getByRole('combobox',{name:'Datenbasis',exact:true});
   if(await basis.locator('option').count()<2)befund(view,width,'screener methodologies missing');
   if(!await page.locator('#qx-main a.qx-row').count())befund(view,width,'Profi-Modus liefert nichts');
   /* Ein Wert ausserhalb der Skala (999 von 100) ist entweder "keine
      Treffer" oder eine sichtbare Absage - nie das alte Ergebnis unter
      einer neuen Regel. */
   const vorher=await page.locator('#qx-main section p.qx-small').first().innerText().catch(()=>'');
   await page.getByRole('spinbutton',{name:'Vergleichswert'}).first().fill('999');
   await page.getByRole('button',{name:'Treffer anzeigen',exact:true}).click();
   const antwort=await page.waitForFunction(()=>/Keine Treffer|Regel unvollständig|nicht verfügbar|ungültig/i.test(document.querySelector('#qx-main').innerText),null,{timeout:8000}).then(()=>true,()=>false);
   if(!antwort)befund(view,width,'Regel 999 von 100: keine Antwort, das alte Ergebnis bleibt stehen ('+vorher.slice(0,40)+')');
   else if(await page.locator('#qx-main a.qx-row').count())befund(view,width,'unerfuellbare Regel liefert Treffer');
   /* Wirft die App dabei unbehandelt, ist das ein eigener Befund dieser
      Ansicht - und nicht ein namenloser Konsolenfehler am Ende. */
   const geworfen=errors.filter(e=>/INVALID_SCREEN_RULES/.test(e));
   if(geworfen.length){befund(view,width,'Regel 999 wirft unbehandelt: '+geworfen[0].slice(0,80));errors.splice(0,errors.length,...errors.filter(e=>!/INVALID_SCREEN_RULES/.test(e)));}
   await page.getByRole('spinbutton',{name:'Vergleichswert'}).first().fill('80');
   await page.getByRole('button',{name:'Treffer anzeigen',exact:true}).click();
   await page.locator('#qx-main a.qx-row').first().waitFor();
   const geteilt=await page.getByRole('link',{name:'Link zu dieser Auswahl',exact:true}).getAttribute('href');
   await frisch(page,geteilt,'screener');
   if(await page.getByRole('spinbutton',{name:'Vergleichswert'}).first().inputValue()!=='80')befund(view,width,'saved rules lost');
   /* UNGUELTIGE REGELN WERDEN NICHT STILL ERSETZT. Die Seite sagt es - und
      fuehrt dann keine Ersatzregel aus. */
   await frisch(page,'#/screener/profi?query=invalid','screener');
   await page.getByText('Gespeicherte Regeln konnten nicht geöffnet werden',{exact:true}).waitFor();
   if(await page.locator('#qx-main a.qx-row').count())befund(view,width,'invalid rules silently replaced: die Seite sagt "keine Ersatzregeln" und zeigt '+await page.locator('#qx-main a.qx-row').count()+' Treffer der Standardregel');
  }
  if(view==='strategien'){
   const karten=await page.locator('#qx-main a.qx-strat').count();
   if(karten!==profiles.length)befund(view,width,'der Strategie-Katalog zeigt '+karten+' von '+profiles.length+' Ansaetzen');
   const katalog=await page.locator('#qx-main').innerText();
   if(!/Aktien erfüllen heute alle Bedingungen/.test(katalog))befund(view,width,'kein Ansatz nennt seine heutigen Treffer');
   /* KEINE TREFFERQUOTE. */
   if(!/bewusst keine Erfolgs- oder Trefferquote/.test(katalog))befund(view,width,'die Absage an eine Trefferquote fehlt');
  }
  if(view.startsWith('strategie-')){
   const text=await page.locator('#qx-main').innerText();
   if(/Gerade nicht erreichbar/.test(text))befund(view,width,'Strategieseite faellt in die Wiederherstellung');
   for(const satz of ['Welche Bedingungen gelten?','Wer passt heute?'])if(!text.includes(satz))befund(view,width,'fehlt: '+satz);
  }
  if(view==='aktie-nvda'){
   /* DIE SIEBEN EIGENSCHAFTEN, IN DER REIHENFOLGE DES KANONS - gelesen aus
      der Engine. Eine Gesamtnote gibt es bewusst nicht. */
   const ids=await page.locator('details.qx-factor[data-factor]').evaluateAll(ns=>ns.map(n=>n.dataset.factor));
   if(ids.join('|')!==factorEvidence.FACTOR_ORDER.join('|'))befund(view,width,'factor order drifted: '+ids.join('|'));
   await page.getByText(/Eine Gesamtnote gibt es bewusst nicht/).first().waitFor();
   /* Quant Daily Usefulness: Pro/Contra hat einen eigenen Abschnitt (#dafuer). */
   const gruppen=(await page.locator('#dafuer .qx-pc-col h3').allTextContents()).map(t=>t.trim());
   if(gruppen.join('|')!=='Spricht dafür|Spricht dagegen')befund(view,width,'Pro/Contra ohne dafuer/dagegen: '+gruppen.join('|'));
   /* "Was ist jetzt wichtig?" steht neben dem Chart und traegt den Radar-Stand. */
   const jetzt=await page.locator('.qx-verdict-card').innerText();
   if(!/Was ist jetzt wichtig\?/.test(jetzt))befund(view,width,'"Was ist jetzt wichtig?" fehlt neben dem Chart');
   await page.locator('.qx-verdict-card .q-now').filter({hasText:/Setup|Veränderung|Stand/}).waitFor();
   /* Setup & Trigger in Alltagssprache; Backtests mit gemessenem Grund. */
   const setupText=await page.locator('#setup').innerText();
   for(const w of ['Interessant ab','Ungültig unter'])if(!setupText.includes(w))befund(view,width,'Setup-Karte ohne "'+w+'"');
   /* Evidence Experience: Stufe C nennt den Zertifizierungsstand und je geschlossener Art den gemessenen Grund. */
   {const hist=await page.locator('#historie').innerText();
    if(!/C · Zertifizierter Backtest/i.test(hist)||!/kein vollständig zertifizierter Backtest vor/.test(hist)||!/noch keine Zahlen\. Es fehlt unter anderem: .+\(nötig .+, heute .+\)/.test(hist))befund(view,width,'Backtest-Stand fehlt im Rueckblick');}
   /* Bedeutung ist zu, bis jemand fragt - und oeffnet dann bis zu den Rohdaten. */
   const first=page.locator('details.qx-factor').first();
   if(await first.evaluate(d=>d.open))befund(view,width,'factor evidence not progressively disclosed');
   await first.locator('summary').click();
   await first.locator('[data-component]').first().waitFor();
   await first.locator('details.qx-more > summary').first().click();
   await first.locator('.qx-code').first().waitFor();
   await first.locator('summary').first().click();
   /* EIN CHART: elf Zeitraeume, Max und zurueck. */
   if(await page.locator('section.qc-chart').count()!==1)befund(view,width,'nicht genau ein Chart');
   if(await page.locator('.qx-quote').count()!==1)befund(view,width,'nicht genau ein Kurs im Kopf');
   await page.locator('section.qc-chart').getByRole('button',{name:'Max',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('section.qc-chart').dataset.range==='MAX');
   if(!await page.locator('section.qc-chart .qc-plot svg').count())befund(view,width,'MAX chart missing');
   await page.locator('section.qc-chart').getByRole('button',{name:'1J',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('section.qc-chart').dataset.range==='1Y');
   /* Die Abschnitte der Analyse und die Vertiefungen. */
   const abschnitte=await page.locator('#qx-main section[id]').evaluateAll(ns=>ns.map(n=>n.id));
   /* Reihenfolge nach Owner-Auftrag "Quant Daily Usefulness" (01.10.2026). */
   const soll=['setup','historie','dafuer','einordnung','veraenderung','strategie','technik','zahlen','grenzen'];
   for(const id of soll)if(!abschnitte.includes(id))befund(view,width,'Abschnitt fehlt: '+id);
   const ist=abschnitte.filter(id=>soll.includes(id));
   if(ist.join('|')!==soll.filter(id=>ist.includes(id)).join('|'))befund(view,width,'Abschnitte in falscher Reihenfolge: '+ist.join('|'));
   const grenzen=await page.locator('#grenzen').innerText();
   for(const q of ['Tiingo','SEC EDGAR'])if(!grenzen.includes(q))befund(view,width,'Daten und Grenzen ohne '+q);
   if(!/\d{2}\.\d{2}\.\d{4}/.test(await page.locator('.qx-quote').innerText()))befund(view,width,'Kurs ohne Datum');
   if(!/keine Prognose/i.test(await page.locator('#historie').innerText()))befund(view,width,'Historical Replay ohne Prognose-Absage');
   await page.locator('#technik').getByRole('link',{name:'Chartbild öffnen',exact:true}).waitFor();
   /* Elliott nur im Chartbild: keine V1-Zaehlung ("Validierte Zaehlung", "Method Fit") auf der Aktienseite. */
   if(/Validierte Zählung|Method Fit|Elliott-Wellen\b/.test(await page.locator('#technik').innerText()))befund(view,width,'V1-Elliott auf der Aktienseite');
   await page.locator('#zahlen').getByRole('link',{name:'Entwicklung über die Jahre',exact:true}).waitFor();
   if((await page.locator('.qx-stock-hero h1').innerText()).trim()!==nvdaName)befund(view,width,'Name weicht vom Verzeichnis ab');
  }
  if(view==='radar'){
   /* QUANT RADAR: Karten mit Ereignis, Datum und - wo vorhanden - Niveaus;
      die Sortierregel und die geschlossenen Ereignistypen stehen offen da. */
   const karten=page.locator('a.q-radar-card');
   if(!await karten.count())befund(view,width,'Radar ohne Karten');
   const erste=await karten.first().innerText();
   if(!/Stand \d{2}\.\d{2}\.\d{4}/.test(erste))befund(view,width,'Radar-Karte ohne Datum');
   /* "keine Gesamtnote" ist die Absage, nicht die Note. */
   const radarText=await page.locator('#qx-main').innerText();
   if(/(?<![Kk]eine )Gesamtnote|\b(Kaufen|Verkaufen|Kursziel)\b/i.test(radarText))befund(view,width,'Radar mit Noten- oder Handlungssprache');
   const regel=await page.locator('section.qx-section').filter({hasText:'Wie der Radar sortiert'}).innerText();
   if(!/radar-priority-1\.0\.0/.test(regel))befund(view,width,'Sortierregel nicht offen gelegt');
   await page.locator('button.q-chip[data-filter="setups"]').click();
   if(await page.locator('button.q-chip[data-filter="setups"]').getAttribute('aria-pressed')!=='true')befund(view,width,'Filter nicht markiert');
  }
  if(view==='aktie-jpm'){
   /* A bank keeps its industry template instead of inventing factors. */
   if(await page.locator('details.qx-factor').count()!==7)befund(view,width,'factor DNA incomplete for JPM');
   await alleAufklappen(page);
   if(!/Branchenvorlage/.test(await page.locator('#qx-main').innerText()))befund(view,width,'Branchenvorlage ungenannt');
  }
  if(view==='aktie-aaac'){
   /* Ein belegter ETF behaelt Kurs und Verlauf und verliert die Aktienaussage. */
   if(await page.locator('.qx-verdict-card').count()||await page.locator('details.qx-factor').count())befund(view,width,'ETF traegt eine Aktienaussage');
   if(await page.locator('section.qc-chart').count()!==1)befund(view,width,'ETF ohne Kursverlauf');
  }
  if(view==='aktie-edva'){
   /* Datenarm heisst reduziert, nicht kaputt: kein Code, die Luecken benannt. */
   const text=await page.locator('#qx-main').innerText();
   if(/\b[A-Z]{3,}_[A-Z][A-Z_]{2,}\b/.test(text))befund(view,width,'interner Code im Haupttext');
   if(!/Was fehlt/.test(await page.locator('#grenzen').innerText()))befund(view,width,'die Luecken sind nicht benannt');
  }
  let danach=null;
  if(view==='aktie-unbekannt'){
   if((await page.locator('main h1').innerText()).trim()!=='Aktie nicht gefunden')befund(view,width,'unbekanntes Kuerzel ohne Absage');
   danach=async()=>{await page.locator('#qx-main').getByRole('link',{name:'Aktie suchen',exact:true}).click();await bereit(page,'aktien');};
  }
  if(view==='technik'||view==='elliott'||view==='chartbild'){
   /* CHARTBILD (Technical Intelligence v3): Ausblick, Szenario-Wechsel, Chart mit Zonen. Die alten Routen
      zeigen dieselbe Seite; ?elliott=1 oeffnet die Profi-Ansicht mit der Elliott-Strukturdeutung. */
   await page.locator('#qx-main .cb-outlook').first().waitFor();
   await page.locator('#qx-main .cb-chart svg').first().waitFor();
   const knoepfe=page.locator('#qx-main .cb-switch-btn');
   if(await knoepfe.count()<2)befund(view,width,'kein Szenario-Wechsel');
   else{await knoepfe.nth(1).click();await page.locator('#qx-main .cb-chart svg').first().waitFor();await knoepfe.nth(0).click();}
   const text=await page.locator('#qx-main').innerText();
   if(!/Szenario/i.test(text))befund(view,width,'kein Szenario');
   if(!/Ungültig|Invalid/i.test(text))befund(view,width,'keine Ungueltig-Linie');
   if(/Validierte Zählung|Method Fit/.test(text))befund(view,width,'V1-Elliott-Wortlaut im Chartbild');
   if(view==='elliott'){
    await page.locator('#qx-main section.cb-pro').waitFor();
    if(!/Elliott/i.test(await page.locator('#qx-main section.cb-pro').innerText()))befund(view,width,'Profi-Ansicht ohne Elliott');
   }
  }
  if(view==='chartlagen'){
   if(!/Chart|Lage/i.test(await page.locator('#qx-main').innerText()))befund(view,width,'Chartlagen leer');
  }
  if(view==='zahlen'){
   await page.locator('#qx-main svg').first().waitFor();
   await page.getByRole('combobox',{name:'Berichtsart',exact:true}).selectOption('ttm');
   await page.waitForFunction(()=>!document.querySelector('#qx-main .qx-loading'));
   const ttm=await page.locator('#qx-main').innerText();
   if(!/Zwölfmonatswerte noch nicht verfügbar|Letzte 12 Monate/.test(ttm))befund(view,width,'TTM weder gezeigt noch begruendet');
   await page.getByRole('combobox',{name:'Berichtsart',exact:true}).selectOption('annual');
   await page.getByRole('combobox',{name:'Kennzahl',exact:true}).selectOption({index:1});
   await page.waitForFunction(()=>!document.querySelector('#qx-main .qx-loading'));
   const kennzahl=await page.getByRole('combobox',{name:'Kennzahl',exact:true}).inputValue();
   /* Die Auswahl steht in der Adresse und kommt nach einem Neuladen wieder. */
   await page.reload();await bereit(page,'zahlen');
   if(await page.getByRole('combobox',{name:'Kennzahl',exact:true}).inputValue()!==kennzahl)befund(view,width,'history link lost state');
   if(!/SEC EDGAR/.test(await page.locator('#qx-main').innerText()))befund(view,width,'Zahlen ohne Quelle');
  }
  if(view==='vergleich'){
   if(await page.locator('#qx-main table thead th').count()!==3)befund(view,width,'Vergleich ohne zwei Spalten');
   if(await page.locator('#qx-main table tbody td.num').count()<10)befund(view,width,'full comparison evidence missing');
   await frisch(page,'#/vergleich/NVDA,NVDA','vergleich');
   if(await page.locator('#qx-main table').count())befund(view,width,'doppelte Auswahl wird still verglichen');
   await page.getByText('Auswahl prüfen',{exact:true}).waitFor();
  }
  if(view==='methodik'){
   if(await page.locator('#qx-main .qx-method-grid a').count()!==10)befund(view,width,'nicht zehn Methodik-Themen');
   await page.getByRole('link',{name:/Methodik im Detail/}).first().waitFor();
  }
  if(view==='nicht-gefunden'){
   await page.getByRole('heading',{name:'Diese Seite gibt es nicht',exact:true}).waitFor();
   danach=async()=>{await page.getByRole('link',{name:'Zur Startseite',exact:true}).click();await bereit(page,'home');};
  }
  await auditAccessibility(page,view,width);
  await page.screenshot({path:out+'/'+view+'-'+width+'.png',fullPage:true});if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:out+'/'+view+'-390-viewport.png'});}
  if(danach)await danach();
  checks.push({view,width,pass:true});
 });}

 /* AUSFALLBILDER. */
 await versuch('panel-outage',width,async()=>{
  /* Faellt das Faktor-Panel aus, bleiben Identitaet, Kurs und Chart. */
  await page.route('**/quant/data/sec/quant-factor-inputs.json',route=>{absichtlich++;return route.abort();});
  await frisch(page,'#/aktie/NVDA','aktie');
  await page.locator('.qx-stock-hero h1').filter({hasText:'NVIDIA'}).waitFor();
  if(await page.locator('section.qc-chart').count()!==1||await page.locator('.qx-quote').count()!==1)befund('panel-outage',width,'panel outage hid independent canonical intelligence');
  await page.unroute('**/quant/data/sec/quant-factor-inputs.json');
  /* Faellt die Kurshistorie aus, erfindet der Chart keinen Verlauf. */
  for(const p of ['**/quant/data/market/discover-series/**','**/quant/data/market/golden-preview/daily/**','**/quant/data/market/intraday/**','**/quant/data/market/discover-series-long/**','**/discover/data/stocks/**'])await page.route(p,route=>{absichtlich++;return route.abort();});
  await frisch(page,'#/aktie/NVDA','aktie');
  await page.waitForFunction(()=>{const c=document.querySelector('section.qc-chart');return c&&(c.dataset.range||c.querySelector('.qc-empty:not(:empty)'));},null,{timeout:10000}).catch(()=>{});
  if(await page.locator('section.qc-chart .qc-plot svg').count())befund('panel-outage',width,'history outage fabricated a chart');
  if(!await page.locator('section.qc-chart .qc-empty').count())befund('panel-outage',width,'history outage without a stated reason');
  for(const p of ['**/quant/data/market/discover-series/**','**/quant/data/market/golden-preview/daily/**','**/quant/data/market/intraday/**','**/quant/data/market/discover-series-long/**','**/discover/data/stocks/**'])await page.unroute(p);
  await page.screenshot({path:out+'/history-outage-'+width+'.png',fullPage:true});
  checks.push({view:'canonical-identity-panel-outage',width,pass:true});
 });
 await versuch('render-failure-recovery',width,async()=>{
  /* Scheitert eine Seite als Ganzes, steht eine Wiederherstellung mit
     Ueberschrift da - und "Erneut versuchen" fuehrt zurueck zur Seite. Die
     Stoerung wird VOR der Initialisierung in das ausgelieferte Skript
     eingesetzt und wirkt genau einmal. */
  const serviceRoute=/\/quant\/(?:release-bundle|app\/pages)\.js(?:\?v=[a-f0-9]+)?$/;
  await page.route(serviceRoute,async route=>{const response=await route.fetch();const injected=`
Object.defineProperty(window,'QXPages',{configurable:true,set(pages){
 let einmal=true;const home=pages.home;
 Object.defineProperty(window,'QXPages',{configurable:true,writable:true,value:{...pages,home:async(...a)=>{if(einmal){einmal=false;throw Error('QA injected render failure');}return home(...a);}}});
}});
`;
   await route.fulfill({response,body:injected+await response.text()});});
  const vorher=errors.length;
  await page.goto('about:blank');await page.goto(Q+'#/');await bereit(page,'home');
  errors.length=vorher;
  await page.getByText('Gerade nicht erreichbar',{exact:true}).waitFor();
  if(await page.locator('h1').count()!==1)befund('render-failure-recovery',width,'die Wiederherstellung traegt '+await page.locator('h1').count()+' Ueberschriften');
  if(await page.locator('#qx-main a.qx-door').count())befund('render-failure-recovery',width,'failed render retained partial content');
  await page.screenshot({path:out+'/render-recovery-'+width+'.png',fullPage:true});
  await page.unroute(serviceRoute);
  await page.getByRole('button',{name:'Erneut versuchen',exact:true}).click();
  await bereit(page,'home');
  /* Premium-Hero: kurze H1, vollständiger Nutzen und Methodik bleiben sichtbar. */
  await page.locator('#qx-main h1').filter({hasText:'Jeden Tag sehen, was sich verändert.'}).waitFor();
  await page.locator('#qx-main .q-hero-lead').filter({hasText:'wie oft das früher besser lief als der Markt'}).waitFor();
  await page.locator('#qx-main .q-intro-note').filter({hasText:'Quant beobachtet über 6.000 US-Aktien nach festen Regeln'}).waitFor();
  checks.push({view:'render-failure-recovery',width,pass:true});
 });

 /* TASTATUR: Sprunglink zuerst, Suchdialog mit Fokusfalle und
    Fokus-Rueckgabe, "/" und Strg+K oeffnen ihn, Pfeiltasten und Enter
    waehlen einen Treffer. */
 await versuch('keyboard-navigation',width,async()=>{
  await frisch(page,'#/aktie/NVDA','aktie');
  /* Die Aktienanalyse gehoert zum Bereich AKTIEN und markiert ihn. */
  if(await page.locator(leiste).getByRole('link',{name:'Aktien',exact:true}).getAttribute('aria-current')!=='page')befund('keyboard-navigation',width,'Bereich AKTIEN ist auf der Aktienseite nicht markiert');
  await page.keyboard.press('Tab');if(!await page.locator('a.qx-skip').evaluate(e=>e===document.activeElement))befund('keyboard-navigation',width,'skip link not first');
  await page.keyboard.press('Enter');if(!await page.locator('main#qx-main').evaluate(e=>e===document.activeElement))befund('keyboard-navigation',width,'skip target not focused');
  /* Die Quant-Suche steht prominent im Hero der Startseite (die Kopfzeile ist
     seit 10/2026 die gemeinsame Shell); dazu / und Strg+K ueberall in Quant. */
  await frisch(page,'#/','home');
  const searchButton=page.locator('button.qx-searchbox');await searchButton.focus();await page.keyboard.press('Enter');
  const dialog=page.locator('dialog.qx-dialog');await dialog.waitFor();
  const searchInput=dialog.locator('input[type=search]');
  if(!await searchInput.evaluate(e=>e===document.activeElement))befund('keyboard-navigation',width,'search input not focused on open');
  await searchInput.fill('NVDA');
  await dialog.locator('#qx-search-list a.qx-hit').filter({hasText:'NVDA'}).first().waitFor();
  await dialog.getByRole('status').filter({hasText:/Treffer/}).waitFor();
  /* Ein zweites Strg+K bei offenem Dialog darf die Eingabe nicht verlieren. */
  await page.keyboard.press('Control+k');if(await searchInput.inputValue()!=='NVDA')befund('keyboard-navigation',width,'repeated command lost query ("'+await searchInput.inputValue()+'")');
  await searchInput.fill('NVDA');await dialog.locator('#qx-search-list a.qx-hit').first().waitFor();
  for(let i=0;i<12;i++){await page.keyboard.press(i<6?'Tab':'Shift+Tab');if(!await dialog.evaluate(e=>e.contains(document.activeElement))){befund('keyboard-navigation',width,'focus escaped modal');break;}}
  await page.keyboard.press('Escape');
  if(await dialog.evaluate(d=>d.open))befund('keyboard-navigation',width,'command dialog keyboard exit failed');
  if(!await searchButton.evaluate(e=>e===document.activeElement))befund('keyboard-navigation',width,'search focus not restored');
  /* "/" und Strg+K oeffnen die Suche; Pfeil runter und Enter oeffnen den Treffer. */
  await page.locator('main#qx-main').focus();
  await page.keyboard.press('/');await dialog.waitFor();
  if(!await dialog.evaluate(d=>d.open))befund('keyboard-navigation',width,'"/" oeffnet die Suche nicht');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  if(!await dialog.evaluate(d=>d.open))befund('keyboard-navigation',width,'Strg+K oeffnet die Suche nicht');
  await searchInput.fill('TSLA');await dialog.locator('#qx-search-list a.qx-hit').filter({hasText:'TSLA'}).first().waitFor();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>location.hash==='#/aktie/TSLA');await bereit(page,'aktie');
  if(await dialog.evaluate(d=>d.open))befund('keyboard-navigation',width,'Dialog bleibt nach der Auswahl offen');
  await page.locator('.qx-stock-hero h1').filter({hasText:'Tesla'}).waitFor();
  await auditAccessibility(page,'canonical-stock-tsla',width);
  checks.push({view:'keyboard-navigation',width,pass:true});
 });

 /* DIE PLATTFORM: Quant verlinkt in seiner Leiste nur eigene Bereiche;
    die anderen Produkte bleiben ueber den gemeinsamen Plattform-Kopf
    erreichbar. Ohne die zweite Haelfte koennte man die Wege einfach kappen
    und diese Pruefung bliebe still. */
 await versuch('platform-header',width,async()=>{
  await frisch(page,'#/','home');
  const quantLinks=await page.locator(leiste+' a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
  if(quantLinks.length!==4)befund('platform-header',width,'die Quant-Leiste hat nicht vier Bereiche: '+quantLinks.length);
  if(quantLinks.some(h=>!h||!h.startsWith('/quant/#/')))befund('platform-header',width,'die Quant-Navigation fuehrt aus Quant heraus: '+quantLinks.join(', '));
  const kopf=await page.locator('vu-navigation a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
  for(const path of ['/discover/','/news/','/etf/','/macro/','/hedgefonds/','/analysten/','/morning/','/magazin/','/reports/','/academy/','/screener/'])
   if(!kopf.some(h=>h&&h.startsWith(path)))befund('platform-header',width,'der Plattform-Kopf fuehrt nicht mehr zu '+path);
  checks.push({view:'platform-header',width,pass:true});
 });
 if(errors.length)befund('console',width,errors.slice(0,5).join(' / '));
 await page.close();}

 // Test-only relay fixture exercises the production UI without contacting a provider.
 //
 // Der Chart abonniert den Live-Strom jetzt selbst (ein Chart, derselbe Hub
 // wie Discover); einen Start-Knopf gibt es nicht mehr. Geprueft wird: eine
 // Verbindung, nur zum eigenen Relay, nur fuer diesen Titel, und sie wird
 // beim Verlassen der Seite freigegeben. Ein Kursangebot (QUOTE) und ein
 // unbestimmtes Ereignis bewegen den gezeigten Kurs nie. Dass ein
 // bestaetigter Trade ihn bewegt, laesst sich mit den ausgelieferten Daten
 // nicht zeigen: der letzte veroeffentlichte Tagesverlauf ist abgeschlossen
 // (regularComplete), und ein abgeschlossener Tag bleibt zu Recht stehen.
 for(const width of [1440,390]){await versuch('relay-fixture',width,async()=>{
  const live=await browser.newPage({viewport:{width,height:1000}});
  await live.addInitScript(()=>{
   const NativeDate=Date,fixed=NativeDate.parse('2026-09-18T15:00:00Z');window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[fixed]));}static now(){return fixed;}};
   window.__relayTest={opens:0,urls:[],sent:[],closed:0};
   window.WebSocket=class{constructor(url){window.__relayTest.urls.push(String(url));window.__relayTest.opens++;window.__relayTest.socket=this;setTimeout(()=>this.onopen?.({}),0);}send(value){window.__relayTest.sent.push(JSON.parse(value));}close(){window.__relayTest.closed++;}};
  });
  await live.goto(Q+'#/aktie/TSLA');await bereit(live,'aktie');await live.waitForTimeout(3200);
  const t=await live.evaluate(()=>({opens:__relayTest.opens,urls:__relayTest.urls,sent:__relayTest.sent}));
  if(t.opens>1)befund('relay-fixture',width,t.opens+' Live-Verbindungen fuer eine Seite');
  if(t.urls.some(u=>u!=='wss://live.visionuniverse.de/live'))befund('relay-fixture',width,'unexpected relay: '+t.urls.join(', '));
  const fremdeTitel=t.sent.flatMap(m=>m.symbols||[]).filter(x=>x!=='TSLA');
  if(fremdeTitel.length)befund('relay-fixture',width,'abonniert fremde Titel: '+fremdeTitel.join(','));
  if(t.opens){
   const kurs=async()=>live.evaluate(()=>[document.querySelector('.qc-price').textContent,document.querySelector('.qx-quote b').textContent].join('|'));
   const vorher=await kurs();
   const send=(type,price)=>live.evaluate(([type,price])=>__relayTest.socket.onmessage({data:JSON.stringify({op:'u',schemaVersion:'vu-live-update-1.1.0',v:[['TSLA',price,Date.now(),price,price,price,price,Date.now()-1000]],semantics:[{priceType:type,messageForm:'iexTyped',candlePriceType:'REALTIME_REFERENCE'}]})}),[type,price]);
   await send('QUOTE',9999);await live.waitForTimeout(300);
   if(await kurs()!==vorher)befund('relay-fixture',width,'quote moved price');
   await send('UNSPECIFIED',9999);await live.waitForTimeout(300);
   if(await kurs()!==vorher)befund('relay-fixture',width,'untyped event moved price');
  }
  if(await live.evaluate(()=>document.documentElement.scrollWidth>innerWidth))befund('relay-fixture',width,'live stock overflow');
  await live.screenshot({path:out+'/live-relay-test-fixture-'+width+'.png',fullPage:true});
  /* Wer die Seite verlaesst, gibt die Verbindung frei. */
  await live.evaluate(()=>{location.hash='#/';});await bereit(live,'home');await live.waitForTimeout(300);
  const nach=await live.evaluate(()=>({opens:__relayTest.opens,closed:__relayTest.closed,sent:__relayTest.sent}));
  const abgemeldet=nach.sent.some(m=>/unsub/i.test(m.op||''));
  if(nach.opens&&nach.closed<nach.opens&&!abgemeldet)befund('relay-fixture',width,'subscription not released');
  checks.push({view:'trade-only-relay-test-fixture',width,pass:true,productionDataClaim:false,relayOpens:nach.opens,relayClosed:nach.closed});await live.close();
 });}

 /* 768 PX: DIE LEISTE IST DA UND VOLLSTAENDIG - es gibt genau eine, damit
    nicht zwei dieselben Ziele zeigen (Discovers v2-dock). */
 const tablet=await browser.newPage({viewport:{width:768,height:1024},deviceScaleFactor:1});
 for(const [view,hash] of [['home','#/'],['vergleich','#/vergleich/NVDA,MSFT'],['methodik','#/methodik'],['aktie-nvda','#/aktie/NVDA']]){await versuch(view,768,async()=>{
  await frisch(tablet,hash);
  if(await tablet.evaluate(()=>document.documentElement.scrollWidth>innerWidth))befund(view,768,'tablet overflow');
  const nav=tablet.locator('#vu-dock nav');
  if(!await nav.isVisible()||await nav.locator('a').count()!==4||await nav.locator('button').count()!==1)befund(view,768,'tablet navigation incomplete');
  if(await tablet.locator('nav.qx-nav, nav.qx-tabbar, nav.v2-dock').count()!==0)befund(view,768,'zwei Navigationen auf 768 px');
  await tablet.screenshot({path:out+'/'+view+'-768.png',fullPage:true});checks.push({view,width:768,pass:true});
 });}
 await tablet.close();

 await writeFile(out+'/results.json',JSON.stringify({checks,findings},null,2));await writeFile(out+'/performance.json',JSON.stringify({environment:'GitHub Actions local static server; not production performance',samples:performanceSamples},null,2));console.log(JSON.stringify({passed:checks.length,findings:findings.length,output:out}));
 await writeFile(out+'/resource-budgets.json',JSON.stringify({scope:'Decoded subresource bytes and request count; not production latency',results:resourceBudgets},null,2));
 console.log(JSON.stringify({resourceBudgetChecks:resourceBudgets.length,resourceBudgets:resourceBudgets.map(r=>({view:r.view,width:r.width,decodedBytes:r.decodedBytes,requests:r.requests,pass:r.pass}))}));
 const violations=accessibility.flatMap(r=>r.violations.map(v=>({view:r.view,width:r.width,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
 console.log(JSON.stringify({accessibilityPages:accessibility.length,violations}));
 if(findings.length)throw Error(findings.length+' QA findings; see results.json');
 if(resourceBudgets.length!==8||resourceBudgets.some(r=>!r.pass))throw Error('Resource budget gate failed; see resource-budgets.json');
 if(violations.length)throw Error('Automated accessibility gate failed; see accessibility.json');
}finally{await browser.close();await new Promise(r=>server.close(r));}
