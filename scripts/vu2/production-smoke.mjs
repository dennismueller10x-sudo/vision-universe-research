/* Produktions-Smoke gegen das GEBAUTE Release, nicht gegen den Quelltext.
   Der Unterschied ist real: die Seite laeuft dort als ein gebuendeltes
   Skript, die Artefakte liegen unter ihren Auslieferungspfaden, und die
   .gz-Dateien werden undurchsichtig ausgeliefert - der Browser entpackt
   sie NICHT transparent. Ein Smoke gegen das Repository wuerde einen Pfad
   testen, den es in Produktion nicht gibt.

   NEU AUSGERICHTET AM 30.09.2026 AUF DAS NEUE QUANT-FRONTEND.

   Die Oberflaeche liegt jetzt unter /quant/ (quant/index.html +
   quant/app/*.js) und navigiert ueber den Hash (#/aktie/NVDA, #/screener,
   #/methodik/<thema>, ...). /vu2/ und /Quant/ sind Umleitungsstuecke, und
   alte Adressen (?view=stock&ticker=NVDA) werden beim Laden einmal auf die
   neue Route abgebildet. Jede Pruefabsicht des alten Smoke ist erhalten und
   auf die neue Flaeche uebertragen: Inhaltsboden, Ueberlauf, genau eine
   Ueberschrift, keine verbotenen Begriffe in der Hauptkopie, die fuenf
   Bereiche und kein fremdes Produkt in der Navigation, die gemessenen
   Inhaltsfaelle M26 bis M29, die Branchenvorlage, die zurueckgehaltene
   Bewertung, die historischen Vergleichsfaelle und Option C.

   WARTEN AUF DIE SEITE, NICHT AUF DIE UHR. Die App setzt am Ende jeder
   Route `main#qx-main[data-ready="true"]` und `aria-busy="false"`. Weil
   `data-ready` beim naechsten Routenwechsel NICHT zurueckgesetzt wird (am
   30.09.2026 gemessen), laedt der Smoke jede Ansicht frisch und prueft
   zusaetzlich `data-view` und das Verschwinden aller Ladeplatzhalter. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const argv=process.argv.slice(2);
const root=resolve(argv.find((a,i)=>!a.startsWith('--')&&!['--report','--only'].includes(argv[i-1])));
// Test-only browser state of a successful login. Since gate version 2 the public
// verifier no longer opens pages, so the state is derived from the build password
// (RESEARCH_ACCESS_PASSWORD or the file RESEARCH_ACCESS_LOGIN_FILE, never logged)
// and checked against the release's own config.
const ACCESS_GATE=argv.includes('--access-gate')?await (async()=>{
 const config=JSON.parse(await readFile(resolve(root,'__research/config.json'),'utf8'));
 const password=process.env.RESEARCH_ACCESS_PASSWORD||(process.env.RESEARCH_ACCESS_LOGIN_FILE?(await readFile(process.env.RESEARCH_ACCESS_LOGIN_FILE,'utf8')).trim():'');
 const {accessStateFor,verifierForKey}=await import(new URL('../access-gate/build.mjs',import.meta.url));
 const state=accessStateFor(password);
 if(verifierForKey(state.key)!==config.verifier)throw new Error('--access-gate: Passwort passt nicht zum Release (kein Wert ausgegeben).');
 return {storageKey:config.storageKey,state};
})():null;
/* Die Launch-Gates 7 bis 10 sind nur im Browser messbar. Damit die
   Launch-Messung sie nicht erfinden muss, schreibt der Smoke sein
   Ergebnis auf Wunsch als Bericht - mit dem Commit, gegen den er lief.
   Ein Bericht ohne passenden Commit ist fuer die Gates kein Beleg. */
/* --only <teil>: nur Ansichten, deren Adresse <teil> enthaelt - fuer die
   Fehlersuche. Ein Bericht aus einem Teillauf ist kein Launch-Beleg und
   wird deshalb nicht geschrieben. */
const ONLY=(()=>{const i=argv.indexOf('--only');return i>=0&&argv[i+1]?argv[i+1]:null;})();
const REPORT=(()=>{const i=argv.indexOf('--report');return i>=0&&argv[i+1]?resolve(argv[i+1]):null;})();
const befunde=[];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://l').pathname);if(p.endsWith('/'))p+='index.html';const file=resolve(root,'.'+p);if(!file.startsWith(root+sep))throw Error('path');
 if(file.endsWith('.gz')){res.setHeader('Content-Type','application/octet-stream');res.end(await readFile(file));return;}
 res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end('nf');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],
 /* Lokal liegt Chromium an einem festen Pfad, auf dem Runner sucht
    Playwright selbst. Ein hart verdrahteter Pfad wuerde genau dort
    scheitern, wo der Smoke gebraucht wird. */
 ...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const FORBIDDEN=JSON.parse(await readFile(new URL('../../quant/methodology/product-language-v1.json',import.meta.url),'utf8')).forbiddenInPrimaryCopy;

/* ALLE ROUTEN DES NEUEN FRONTENDS.

   quant/tests/smoke-view-coverage.test.mjs liest die Routen aus
   quant/app/app.js (parse), die Fragen aus quant/app/pages.js (QUESTIONS),
   die Themen aus quant/app/page-method.js (TOPICS) und die Strategien aus
   quant/methodology/strategy-profiles-v1.json - und verlangt jede davon in
   dieser Liste. Was der Smoke nicht anschaut, verfaellt (M26, M28, M29). */
const VIEWS=['/quant/#/','/quant/#/radar','/quant/#/radar?filter=setups','/quant/#/radar?filter=historisch',
 '/quant/#/backtest','/quant/#/backtest/NEW_52W_HIGH','/quant/#/backtest/SETUP_CONFIRMED',
 '/quant/#/screener',
 '/quant/#/screener?frage=qualitaet','/quant/#/screener?frage=momentum','/quant/#/screener?frage=wachstum-qualitaet',
 '/quant/#/screener?frage=guenstig','/quant/#/screener?frage=ruhig','/quant/#/screener?frage=setups','/quant/#/screener?frage=hoch',
 '/quant/#/screener/profi',
 '/quant/#/strategien',
 '/quant/#/strategien/quality-compounder','/quant/#/strategien/momentum-leader','/quant/#/strategien/quality-momentum',
 '/quant/#/strategien/garp','/quant/#/strategien/future-leader','/quant/#/strategien/defensive-quality',
 '/quant/#/strategien/value-momentum','/quant/#/strategien/earnings-revision-leader',
 '/quant/#/aktien',
 /* Datenreich (NVDA, AAPL, MSFT, T, SO), Bank (JPM), REIT (O), Hypotheken-
    REIT (AGNC), datenarm (ACAA, EDVA, ABTC), Vorzugspapiere (AHT-P-D,
    ALL-P-B, ABR-P-D), zwei Gattungen eines Emittenten (GOOG, GOOGL), ein
    belegter ETF (AAAC) und ein unbekanntes Kuerzel (ZZZZZ).

    DIE ABNAHMESTICHPROBE, IM BROWSER. Gemessen am 28.09.2026: von 22
    Titeln der Produkt-Abnahmestichprobe hatte der Smoke DREI angesehen -
    also nur Titel, bei denen alles da ist. Die Lagen, in denen eine Seite
    kaputt AUSSIEHT statt reduziert, stehen deshalb hier mit. */
 '/quant/#/aktie/NVDA','/quant/#/aktie/AAPL','/quant/#/aktie/MSFT','/quant/#/aktie/JPM','/quant/#/aktie/O','/quant/#/aktie/AGNC',
 '/quant/#/aktie/ACAA','/quant/#/aktie/EDVA','/quant/#/aktie/ABTC','/quant/#/aktie/AHT-P-D','/quant/#/aktie/ALL-P-B','/quant/#/aktie/ABR-P-D',
 '/quant/#/aktie/GOOG','/quant/#/aktie/GOOGL','/quant/#/aktie/T','/quant/#/aktie/SO','/quant/#/aktie/AAAC',
 '/quant/#/aktie/AACI','/quant/#/aktie/ACGL','/quant/#/aktie/ABCB','/quant/#/aktie/WSBCO',
 '/quant/#/aktie/ZZZZZ',
 '/quant/#/aktie/NVDA/technik','/quant/#/aktie/NVDA/technik?elliott=1','/quant/#/aktie/NVDA/chartbild','/quant/#/aktie/AAPL/chartbild?ansicht=profi','/quant/#/chartlagen','/quant/#/aktie/NVDA/zahlen','/quant/#/aktie/JPM/zahlen',
 '/quant/#/vergleich/NVDA,MSFT','/quant/#/vergleich/AAPL,MSFT,GOOGL',
 '/quant/#/methodik',
 '/quant/#/methodik/daten','/quant/#/methodik/faktoren','/quant/#/methodik/gewichtung','/quant/#/methodik/branchen',
 '/quant/#/methodik/setups','/quant/#/methodik/strategien','/quant/#/methodik/chartbild','/quant/#/methodik/historie','/quant/#/methodik/grenzen','/quant/#/methodik/versionen',
 '/quant/#/gibtsnicht',
 /* Die Seite hinter dem Knopf "Methodik im Detail" - die letzte Station der
    Reise. Sie war ein 404, und der Smoke hat nie eine Ansicht ausserhalb
    der App angesehen, obwohl die App dorthin verlinkt. */
 '/quant/methodology/',
 /* ALTE ADRESSEN. Links aus Suchmaschinen, Lesezeichen und anderen Produkten
    zeigen weiter auf /vu2/?view=... und /quant/?view=... - sie muessen auf
    der richtigen neuen Route landen, nicht auf Home. */
 '/vu2/?view=stock&ticker=NVDA','/vu2/?view=quant&ticker=JPM','/vu2/','/quant/?view=screener',
 '/quant/?view=screener&faktoren=momentum','/Quant/?view=explain','/vu2/?view=fundamentals&ticker=NVDA'];
/* Wohin eine alte Adresse fuehren muss - pathname+search+hash nach dem Laden. */
const LEGACY={
 '/vu2/?view=stock&ticker=NVDA':'/quant/#/aktie/NVDA',
 '/vu2/?view=quant&ticker=JPM':'/quant/#/aktie/JPM',
 '/vu2/':'/quant/#/',
 '/quant/?view=screener':'/quant/#/screener',
 '/quant/?view=screener&faktoren=momentum':'/quant/#/screener?frage=momentum',
 '/Quant/?view=explain':'/quant/#/methodik',
 '/vu2/?view=fundamentals&ticker=NVDA':'/quant/#/aktie/NVDA/zahlen?kennzahl=revenue&periode=annual'
};
/* Absichtliche Absagen: die Seite IST die Auskunft "gibt es nicht". Sie
   tragen ihre eigene Ueberschrift und einen Weg zurueck; der Inhaltsboden
   von 400 Zeichen gilt fuer sie nicht (gemessen: 281 bzw. 122 Zeichen),
   dafuer wird genau diese Auskunft verlangt. */
const ABSAGE={'/quant/#/aktie/ZZZZZ':'Aktie nicht gefunden','/quant/#/gibtsnicht':'Diese Seite gibt es nicht'};
const DATENREICH=['NVDA','AAPL','MSFT','JPM','O','T','SO','GOOG','GOOGL'];
const DATENARM=['ACAA','EDVA','ABTC','AAAC'];
const BRANCHENVORLAGE=['JPM','O','WSBCO','ABCB'];
/* ZURUECKHALTUNG AUS DEN DATEN (04.10.2026).
   Ob ein Boersenwert zurueckgehalten wird, entscheidet die Materialisierung
   (marketCapReason SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING) - nicht diese
   Liste. JPM war zurueckgehalten, weil AMJB (eine Schuldverschreibung von
   JPMorgan) denselben Emittenten trug; seit Schuldverschreibungen keine
   Aktienzeilen mehr sind (#366), ist JPMs Anteilsbestand zuordenbar. Gefragt
   wird deshalb das veroeffentlichte Artefakt. GOOG und GOOGL sind zwei
   Aktiengattungen eines Emittenten: dort MUSS zurueckgehalten werden - faellt
   das weg, ist das ein Fehler, keine Datenlage. */
const ZURUECKHALTUNG_PFLICHT=['GOOG','GOOGL'];
const ZURUECKHALTUNG_KANDIDATEN=['JPM','GOOG','GOOGL'];
const ZURUECKHALTUNG=[];let vorabFehler=0;
for(const t of ZURUECKHALTUNG_KANDIDATEN){
 let grund=null;
 try{const {gunzipSync}=await import('node:zlib');const shard=JSON.parse(gunzipSync(await readFile(resolve(root,'quant/data/product/factor-evidence-v1/'+(t+'_').slice(0,2)+'.json.gz'))));grund=shard.securities?.[t]?.marketCapReason||null;}catch(e){grund='LESEFEHLER '+e.message;}
 if(grund==='SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING')ZURUECKHALTUNG.push(t);
 else if(ZURUECKHALTUNG_PFLICHT.includes(t)){console.log('FAIL Zurueckhaltung '+t+': Daten halten den Boersenwert nicht mehr zurueck ('+grund+')');vorabFehler++;}
 else console.log('     Zurueckhaltung '+t+': laut Daten nicht zurueckgehalten ('+grund+')');
}
const NICHT_STAMMAKTIE=['AHT-P-D','ALL-P-B','ABR-P-D','AAAC'];
/* Markierter Eintrag der gemeinsamen Produkt-Leiste je Ansicht; Methodik
   ist sekundaer und markiert keinen der vier Eintraege (leer). */
const SECTION={home:'Quant',screener:'Screener',strategien:'Strategien',aktien:'Aktien',aktie:'Aktien',technik:'Aktien',zahlen:'Aktien',vergleich:'Aktien',methodik:''};

/* Bereit ist eine Route, wenn die App sie fertig gemeldet hat, kein
   Ladeplatzhalter mehr steht und der Chart (falls es einen gibt) einen
   Zeitraum gezeichnet oder abgesagt hat. */
async function bereit(page,view){
 await page.waitForFunction(()=>{const m=document.querySelector('main#qx-main');return !!m&&m.dataset.ready==='true'&&m.getAttribute('aria-busy')==='false'&&!m.querySelector('.qx-loading');},null,{timeout:45000});
 await page.waitForFunction(()=>{const c=document.querySelector('section.qc-chart');return !c||!!c.dataset.range||!/Chart wird geladen/.test(c.textContent);},null,{timeout:10000}).catch(()=>{});
 await page.waitForTimeout(150);
}
async function allesAufklappen(page){
 /* Nach jedem Oeffnen neu suchen: ein geoeffneter Aufklapper legt
    verschachtelte Aufklapper nach. Die Schranke verhindert eine
    Endlosschleife. */
 for(let runde=0;runde<200;runde++){
  const n=await page.evaluate(()=>{const d=document.querySelector('#qx-main details:not([open])');if(!d)return 0;d.open=true;return 1;});
  if(!n)break;
  await page.waitForTimeout(20);
 }
}

/* Der Live-Kursdienst (wss://live.visionuniverse.de) laesst nur die
   veroeffentlichten Domains zu; der Rauchtest laeuft auf 127.0.0.1 und
   wird waehrend der US-Handelszeit bewusst mit 403 abgewiesen. Das ist
   dieselbe Lage wie eine gescheiterte Anfrage an einen fremden Host und
   kein Fehler des Releases. Ein WebSocket zum Release selbst zaehlt
   weiter als Fehler. */
const fremdeLiveAbsage=t=>{const m=/^WebSocket connection to '(wss?:\/\/[^']+)' failed/.exec(t);return Boolean(m)&&!m[1].replace(/^ws/,'http').startsWith(origin);};
let failures=0;
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 if(ACCESS_GATE)await page.addInitScript(config=>{
  if(!/^https?:$/.test(location.protocol))return;
  localStorage.setItem(config.storageKey,JSON.stringify(config.state));
 },ACCESS_GATE);
 const errors=[];let fremdFehlgeschlagen=false;
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 /* Nur Anfragen an einen fremden Host (etwa die Schriften von Google) duerfen
    in einer abgeschotteten Umgebung scheitern. Eine gescheiterte Anfrage an
    das Release selbst ist ein Fehler. 404 bleibt ausgenommen: der
    Produktdienst probiert fuer duenne Titel bewusst mehrere Quellen. */
 page.on('requestfailed',r=>{if(!r.url().startsWith(origin))fremdFehlgeschlagen=true;else errors.push('requestfailed: '+r.url().replace(origin,''));});
 page.on('console',m=>{const t=m.text();if(m.type()!=='error'||t.includes('favicon')||t.includes('404'))return;if(fremdFehlgeschlagen&&/^Failed to load resource: net::ERR_/.test(t))return;if(fremdeLiveAbsage(t))return;errors.push('console: '+t.split('\n')[0]);});
 for(const view of VIEWS.filter(v=>!ONLY||v.includes(ONLY))){
  await page.goto('about:blank');
  await page.goto(origin+view);
  const app=!view.startsWith('/quant/methodology/');
  const bad=[];
  if(app){await bereit(page).catch(()=>bad.push('NICHT_BEREIT'));}
  else await page.waitForLoadState('load').then(()=>page.waitForTimeout(1200));
  const ort=await page.evaluate(()=>location.pathname+location.search+location.hash);
  const route=app?await page.evaluate(()=>(document.querySelector('main#qx-main')||{dataset:{}}).dataset.view||''):'';
  const text=await page.locator(app?'main#qx-main':'main').first().innerText().catch(()=>'');
  const absage=ABSAGE[view]||null;
  const recovered=text.includes('Gerade nicht erreichbar')||text.includes('Daten derzeit nicht verfügbar')
   ||(!absage&&(text.includes('Diese Seite gibt es nicht')||text.includes('Aktie nicht gefunden')));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  const h1=await page.locator('h1').count();
  /* Hauptkopie: Ueberschriften, Dachzeilen, Marken und Etiketten. Die
     Klassen heissen jetzt qx-eyebrow, qx-pill, qx-tag - der alte Ausdruck
     `.eyebrow` haette sie nicht getroffen, deshalb die Teilstring-Form. */
  const primary=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,h4,[class*=eyebrow],[class*=chip],[class*=badge],[class*=pill],[class*=tag]')].map(n=>n.textContent.trim()));
  const hits=[...new Set(primary.filter(t=>FORBIDDEN.some(f=>t.includes(f))))];

  /* EINE ANSICHT, DIE NUR EINE UEBERSCHRIFT ZEIGT, IST KEINE ANSICHT.

     Der Boden ist bewusst niedrig: die duennste berechtigte Ansicht der
     neuen App ist die Methodik "Versionen" mit 425 Zeichen, und eine Seite,
     die nur Titel und Untertitel setzt, kommt auf rund 200. 400 Zeichen
     fangen also den Fall "nichts gerendert", ohne einen Inhaltsstand
     einzufrieren - gemessen werden soll ein Rueckschritt, nicht der
     Tagesstand. */
  if(!absage&&text.length<400)bad.push('ZU_WENIG_INHALT='+text.length);
  if(absage){
   const kopf=(await page.locator('main#qx-main h1').first().innerText().catch(()=>'')).trim();
   if(kopf!==absage)bad.push('ABSAGE_FALSCH:'+kopf);
   if(!await page.locator('main#qx-main .qx-notice').count())bad.push('ABSAGE_OHNE_GRUND');
   if(!await page.locator('main#qx-main a[href^="#/"]').count())bad.push('ABSAGE_OHNE_WEG');
   if(text.length<100)bad.push('ABSAGE_OHNE_INHALT='+text.length);
  }
  if(recovered)bad.push('RECOVER');
  if(overflow)bad.push('OVERFLOW');
  if(h1!==1)bad.push('H1='+h1);
  if(hits.length)bad.push('FORBIDDEN:'+hits.join('|'));

  /* ALTE ADRESSEN LANDEN AUF IHRER NEUEN ROUTE - ohne ?view= in der Adresse. */
  if(LEGACY[view]&&ort!==LEGACY[view])bad.push('UMLEITUNG:'+ort);

  /* DIE FUENF BEREICHE SIND VON JEDER ANSICHT ERREICHBAR, UND NUR SIE.
     Eine Navigation, die auf einer Unterseite ein fremdes Produkt anbietet
     oder die Methodik verliert, ist genau der Rueckschritt, den dieser Lauf
     fangen soll. Geprueft werden BEIDE Leisten (Kopf ab 1000 px, untere
     Leiste darunter) - und dass bei jeder Breite genau eine sichtbar ist.
     Seiten ausserhalb der App (/quant/methodology/) tragen diese Leisten
     nicht. */
  if(app){
   /* "Quant Screener", nicht "Screener" - Owner-Entscheid 29.09.2026.
      "Screener" allein ist der Name eines EIGENSTAENDIGEN Produkts unter
      /screener/, das nicht zu Quant gehoert.

      Diese fuenf Namen stehen hier ABSICHTLICH woertlich. Laese der Smoke
      die Erwartung aus derselben Quelle, aus der die Seite gebaut wird
      (quant/app/ui.js NAV), ginge eine falsche Umbenennung unbemerkt
      durch. Dass eine Umbenennung diese Datei mitzieht, ist der Zweck,
      nicht der Preis. */
   /* UI-VEREINHEITLICHUNG (10/2026): die gemeinsame Produkt-Leiste der
      Vision-Universe-Shell. Erster Eintrag ist der Produktname (nie
      "Home"); der sichtbare Eintrag "Screener" steht neben "Quant" und
      heisst fuer Screenreader "Quant Screener" (Owner-Entscheid 29.09.2026
      bleibt so pruefbar). Methodik ist sekundaer (Hero, Fuss). */
   const sollBereiche=['Quant','Screener','Strategien','Aktien'];
   /* DISCOVER-ANGLEICHUNG (30.09.2026): Kopf- und Tab-Leiste sind EINE
      Leiste wie Discovers v2-dock - am Desktop oben mittig im Rahmen, am
      Handy unten am Bildschirmrand. Geprueft wird dieselbe Absicht wie
      vorher: genau die fuenf Bereiche, der richtige markiert, kein fremdes
      Produkt, und die Leiste steht dort, wo man sie bei dieser Breite
      erwartet. */
   const leiste='#vu-dock nav';
   if(await page.locator(leiste).count()!==1||await page.locator('nav.v2-dock, nav.qx-tabbar').count()!==0)bad.push('NAV_ANZAHL:'+await page.locator(leiste).count());
   {
    const bereiche=(await page.locator(leiste+' a').allTextContents()).map(t=>t.trim());
    if(bereiche.join('|')!==sollBereiche.join('|'))bad.push('NAV:'+leiste+':'+bereiche.join('|'));
    /* Und der Name eines anderen Produkts darf hier ueberhaupt nicht stehen. */
    for(const fremd of ['Discover','Research','Markets','Portfolio'])
     if(bereiche.some(t=>t===fremd))bad.push('FREMDES_PRODUKT_IN_NAV:'+fremd);
    if(await page.locator(leiste).getByRole('link',{name:'Screener',exact:true}).count())bad.push('FREMDES_PRODUKT_IN_NAV:Screener ohne Quant');
    const markiert=await page.locator(leiste+' a[aria-current="page"]').allTextContents();
    const soll=SECTION[route];
    if(soll!==undefined&&markiert.map(t=>t.trim()).join('|')!==soll)bad.push('NAV_MARKE:'+leiste+':'+markiert.join('|'));
   }
   const box=await page.locator(leiste).boundingBox();
   const hoehe=page.viewportSize().height;
   const sichtbar=await page.locator(leiste).isVisible();
   if(!sichtbar||!box)bad.push('NAV_SICHTBAR:'+sichtbar);
   else if(box.y+box.height<hoehe-40||box.y+box.height>hoehe)bad.push('NAV_ORT:nicht_unten:y='+Math.round(box.y));
  }

  /* DER SCREENER ZEIGT, WAS ER FINDET (M29).

     Gemessen am 26.09.2026: er lieferte 50 richtige Treffer und zeigte in
     jeder Zeile "– / 7" und "Nicht verfuegbar". Eine Trefferzeile ohne Wert
     - oder mit einer Absage statt eines Werts - ist eine kaputte
     Hauptfunktion. Die Trefferzeile heisst jetzt `a.qx-row`; bei den
     Faktorfragen traegt sie den erfuellten Faktorwert ("Qualitaet: stark
     (82)"), bei "nahe am Hoch" den Abstand und den Kurs. */
  if(route==='screener'&&!view.includes('/profi')){
   const frage=new URLSearchParams((ort.split('#')[1]||'').split('?')[1]||'').get('frage')||'qualitaet';
   const fragen=await page.locator('button.qx-question[data-question]').evaluateAll(b=>b.map(x=>({id:x.dataset.question,on:x.getAttribute('aria-pressed')})));
   if(fragen.length!==7)bad.push('FRAGEN='+fragen.length);
   const an=fragen.filter(f=>f.on==='true').map(f=>f.id);
   if(an.join('|')!==frage)bad.push('FRAGE_MARKE:'+an.join('|'));
   const satz=(await page.locator('.qx-sentence').innerText().catch(()=>'')).trim();
   const stand=(await page.locator('main#qx-main p.qx-small').allInnerTexts()).join(' ');
   if(!satz)bad.push('SATZ_FEHLT');
   if(/undefined|NaN/.test(satz+' '+stand))bad.push('UNDEFINED_IM_SATZ');
   const zeilen=await page.locator('main#qx-main a.qx-row').allInnerTexts();
   if(!zeilen.length)bad.push('KEINE_TREFFER');
   else if(frage!=='setups'){
    const mitZahl=zeilen.filter(t=>/\d/.test(t.split('\n').slice(2).join(' '))&&!/Nicht verfügbar|nicht bewertbar|ohne Wert/.test(t)).length;
    if(mitZahl<zeilen.length)bad.push('LEERE_ZEILEN='+(zeilen.length-mitZahl)+'/'+zeilen.length);
    console.log('     Screener '+frage+': '+mitZahl+' von '+zeilen.length+' Zeilen mit Wert · '+satz.slice(0,60));
   }
   /* DIE LISTE NENNT NAMEN UND KURSE (M28).

      Gemessen am 26.09.2026 am gebauten Release: von 6.875 Zeilen der
      Uebersicht trugen FUENF einen Kurs und KEINE einen Namen - die Zeile
      schrieb den Ticker zweimal. Die neue App hat keine Kursliste mehr; die
      Liste, die Kurse zeigt, ist die Frage "nahe am 52-Wochen-Hoch". Dort
      werden Kurse und Namen gezaehlt, Namen zusaetzlich auf jeder
      Trefferliste. Die Schwelle von 0,95 faengt einen Rueckfall und friert
      keinen Tagesstand ein - Titel ohne Anbieternamen duerfen fehlen. */
   const namen=await page.locator('main#qx-main a.qx-row .qx-row-title').evaluateAll(ns=>ns.map(n=>({t:(n.querySelector('.qx-ticker')||{}).textContent||'',n:(n.querySelector('span')||{}).textContent||''})));
   const mitName=namen.filter(x=>x.n&&x.n!==x.t&&x.n!=='Firmenname nicht veröffentlicht').length;
   if(namen.length&&mitName/namen.length<0.95)bad.push('NAMEN='+mitName+'/'+namen.length);
   if(frage==='hoch'){
    if(zeilen.length<20)bad.push('ZU_WENIGE_TREFFER='+zeilen.length);
    const mitKurs=zeilen.filter(t=>/\d+,\d+\s*\$/.test(t)&&/\d{2}\.\d{2}\.\d{4}/.test(t)).length;
    if(mitKurs/Math.max(1,zeilen.length)<0.8)bad.push('KURSE='+mitKurs+'/'+zeilen.length);
    console.log('     Nahe am Hoch: '+mitKurs+' von '+zeilen.length+' Zeilen mit Kurs und Datum · '+mitName+' mit Namen');
   }
  }
  if(route==='screener'&&view.includes('/profi')){
   const regeln=await page.locator('main#qx-main .qx-rules .qx-rule').count();
   if(!regeln)bad.push('KEINE_REGEL');
   const zeilen=await page.locator('main#qx-main a.qx-row').count();
   if(!zeilen)bad.push('KEINE_TREFFER');
  }
  if(route==='aktien'){
   /* Discover-Angleichung: #/aktien zeigt Discovers Aktienkarten (dx-poster)
      in Schienen statt Zeilen. Gezaehlt wird dasselbe: jede Aktie steht mit
      ihrem Namen da, nicht nur mit dem Kuerzel. */
   /* Konzept-Design: Karten (a.qx-poster) tragen den Namen in .q-card-name,
      das Kuerzel im data-symbol. */
   const zeilen=await page.locator('main#qx-main a.qx-row .qx-row-title, main#qx-main a.qx-poster').evaluateAll(ns=>ns.map(n=>({t:(n.querySelector('.qx-ticker')||{}).textContent||n.dataset.symbol||'',n:(n.querySelector('.qx-row-name,.q-card-name')||n.querySelector('span')||{}).textContent||''})));
   if(!zeilen.length)bad.push('KEINE_ZEILEN');
   const mitName=zeilen.filter(x=>x.n&&x.n!==x.t).length;
   if(zeilen.length&&mitName/zeilen.length<0.95)bad.push('NAMEN='+mitName+'/'+zeilen.length);
   console.log('     Aktien: '+zeilen.length+' Zeilen · '+mitName+' mit Namen');
  }
  if(route==='strategien'&&!/strategien\/[a-z]/.test(view)){
   const karten=await page.locator('main#qx-main a.qx-strat').count();
   if(karten<8)bad.push('STRATEGIEN='+karten);
   /* KEINE TREFFERQUOTE: die Seite sagt, dass es keine gibt. */
   if(!/keine Erfolgs- oder Trefferquote/.test(text))bad.push('TREFFERQUOTE_UNGENANNT');
  }
  if(route==='strategien'&&/strategien\/[a-z]/.test(view)){
   if(!/Welche Bedingungen gelten\?/.test(text))bad.push('BEDINGUNGEN_FEHLEN');
   if(!/Wer passt heute\?/.test(text))bad.push('TREFFER_FEHLEN');
  }

  /* DIE AKTIENSEITE. */
  const stock=(view.match(/#\/aktie\/([A-Z0-9.-]+)$/)||[])[1]||(LEGACY[view]&&(LEGACY[view].match(/#\/aktie\/([A-Z0-9.-]+)$/)||[])[1])||null;
  if(stock&&!absage){
   const idTicker=(await page.locator('.qx-stock-hero .qx-stock-id b').first().innerText().catch(()=>'')).trim();
   if(idTicker!==stock)bad.push('TICKER_FALSCH:'+idTicker);
   const kopf=(await page.locator('.qx-stock-hero h1').first().innerText().catch(()=>'')).trim();
   if(!kopf)bad.push('NAME_FEHLT');
   /* EIN CHART, NICHT ZWEI. */
   const charts=await page.locator('section.qc-chart').count();
   if(charts!==1)bad.push('CHARTS='+charts);
   /* DIE KOPFZAHL, DIE IM CHART DANEBEN STAND (M27).

      AHT-P-D ist der gemessene Fall: bis zum 26.09.2026 sagte die Kopfzahl
      "nicht verfuegbar", waehrend der Chart darunter 5,17 zeichnete.
      Verlangt wird jetzt fuer JEDE Aktienseite, deren Chart einen Verlauf
      zeichnet: eine Zahl im Kopf und das Datum dazu. Eine Uhrzeit ohne
      Datum ist kein Stichtag - ein Tagesverlauf von vorgestern liest sich
      sonst wie heute. */
   const gezeichnet=await page.locator('section.qc-chart .qc-plot svg').count();
   const quote=(await page.locator('.qx-quote').first().innerText().catch(()=>'')).replace(/\n/g,' ');
   const preis=(await page.locator('.qx-quote b').first().innerText().catch(()=>'')).trim();
   if(gezeichnet&&!/\d/.test(preis))bad.push('KEIN_KURS:'+quote.slice(0,50));
   if(gezeichnet&&!/\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}/.test(quote))bad.push('KEIN_KURSDATUM:'+quote.slice(0,60));
   if(/am –|bis –/.test(text))bad.push('STRICH_STATT_DATUM');
   if(['AHT-P-D','ABTC','EDVA'].includes(stock))console.log('     Kopfzahl '+stock+': '+quote.slice(0,80));

   /* EIN PAPIER, DAS KEINE STAMMAKTIE IST, SAGT DAS IM KOPF. Und ein
      belegter ETF traegt keine Aktienaussage (Owner-Entscheid 1). */
   if(NICHT_STAMMAKTIE.includes(stock)){
    const marke=(await page.locator('.qx-stock-hero .qx-stock-id .qx-tag').allTextContents()).join('|');
    if(!/keine Stammaktie|Vorzugsaktie|ETF/.test(marke))bad.push('PAPIERART_UNGENANNT');
    if(stock==='AAAC'&&(await page.locator('.qx-verdict-card').count()||await page.locator('details.qx-factor').count()))bad.push('AKTIENAUSSAGE_BEI_ETF');
   }

   /* DIE OBERE HAELFTE EINER AKTIENSEITE (M40).

      Gemessen bei 390 px: die erste Bildschirmhoehe zeigte Name, Etikett,
      Kurs, Aktualitaetszeile und dann einen Chart; die Abwaegung stand weit
      darunter. Die neue Seite setzt die Quant-Einordnung bewusst direkt
      hinter den einen Chart (Kurs, Chart, Einordnung - page-stock.js,
      Abschnitt 1). Die DOM-Regel "vor dem Chart" gilt deshalb nicht mehr;
      die ABSICHT - die Auskunft steht oben - wird als Lage gemessen:
      bei 1440 px in der ersten Bildschirmhoehe (neben dem Chart), bei
      390 px nicht tiefer als zwei Bildschirmhoehen. */
   if(['NVDA','AAPL','MSFT'].includes(stock)){
    const auskunft=page.locator('.qx-verdict-card');
    if(!await auskunft.count())bad.push('AUSKUNFT_FEHLT');
    else{
     const kopfsatz=(await auskunft.locator('.qx-verdict-top').innerText().catch(()=>'')).replace(/\n+/g,' ');
     if(kopfsatz.length<40)bad.push('KOPFSATZ_ZU_KURZ='+kopfsatz.length);
     const ganz=await auskunft.innerText();
     /* Kein interner Code und keine Handlungs- oder Prognosesprache - §81
        gilt auch fuer eine Zusammenfassung. */
     if(/[A-Z]{3,}_[A-Z_]{3,}/.test(ganz))bad.push('CODE_IM_KOPFSATZ');
     if(/\b(kaufen|verkaufen|Kursziel|wird steigen|wird fallen)\b/i.test(ganz))bad.push('HANDLUNGSSPRACHE');
     /* Die Gruppen, in ihrer Reihenfolge. "Noch nicht bewertbar" steht als
        dritte Gruppe nur, wenn etwas offen ist. */
     /* Quant Daily Usefulness: Pro/Contra steht in einem eigenen Abschnitt. */
     const gruppen=(await page.locator('#dafuer .qx-pc-col h3').allTextContents()).map(t=>t.trim());
     if(gruppen.join('|')!=='Spricht dafür|Spricht dagegen')bad.push('GRUPPEN:'+gruppen.join('|'));
     const oben=await auskunft.evaluate(n=>n.getBoundingClientRect().top+scrollY);
     if(width===390&&oben>1800)bad.push('AUSKUNFT_ZU_TIEF='+Math.round(oben));
     if(width===1440&&oben>900)bad.push('AUSKUNFT_ZU_TIEF='+Math.round(oben));
     console.log('     Auskunft: '+kopfsatz.slice(0,74)+' · '+Math.round(oben)+'px');
    }
    /* Und die Setup-Frage mit ihrer Folgefrage. */
    const setupText=await page.locator('#setup').innerText().catch(()=>'');
    const grenzen=await page.locator('#grenzen').innerText().catch(()=>'');
    /* innerText folgt text-transform (Dachzeilen stehen in Versalien) -
       deshalb ohne Ruecksicht auf Gross-/Kleinschreibung. */
    if(!/Gibt es ein Setup\?|Wie weit ist die Aktie im Setup\?/i.test(setupText)&&!/Setup:/.test(grenzen))bad.push('SETUPFRAGE_FEHLT');
    if(setupText&&!/Was würde das Setup ungültig machen\?|Was müsste als Nächstes passieren\?|Kein Setup|keine Beobachtung/i.test(setupText))bad.push('ENDE_UNBEANTWORTET');
   }

   /* DIE SIEBEN EIGENSCHAFTEN - ZUERST AUFKLAPPEN, DANN ZAEHLEN.

      Der Inhalt eines Faktor-Aufklappers entsteht erst beim Oeffnen. Eine
      Pruefung, die zugeklappten Inhalt nicht ansieht, wuerde seinen Verlust
      nicht bemerken - ein Aufklapper, der nie fuellt, sieht aus wie einer,
      der leer ist. Der Smoke oeffnet deshalb ALLE Aufklapper der Seite und
      prueft danach ALLE Komponentenzeilen. */
   if(DATENREICH.includes(stock)){
    const faktoren=await page.locator('details.qx-factor[data-factor]').count();
    if(faktoren!==7)bad.push('FAKTOREN='+faktoren);
    for(const d of await page.locator('main#qx-main details').all())
     await d.evaluate(node=>{node.open=true;}).catch(()=>{});
    await page.waitForTimeout(250);
    const zeilen=await page.locator('details.qx-factor [data-component]').allInnerTexts();
    if(zeilen.length<20)bad.push('ZU_WENIGE_ZEILEN='+zeilen.length);
    const leer=zeilen.filter(t=>!/\d/.test(t)&&!/fehlt/.test(t)).length;
    if(leer)bad.push('KOMPONENTE_OHNE_WERT='+leer);
    /* OPTION C: Kursstaerke und Anlegerrendite stehen nebeneinander UND
       zeigen verschiedene Zahlen. Eine Oberflaeche, die beide Begriffe
       traegt und darunter denselben Wert schreibt, hat die Trennung
       beschriftet statt umgesetzt. Die Bedingung ist dieselbe wie vorher:
       jede Aktienseite, die die Faktorstaerke zeigt. */
    const offen=await page.locator('main#qx-main').innerText();
    if(!/Anlegerrendite/.test(offen)||!/Kursstärke/.test(offen))bad.push('RETURN_KIND_FEHLT');
    else{
     const paare=[...offen.matchAll(/Kursstärke[^\n]*?([+−-]?\d+,\d+ %)[\s\S]{0,80}?Anlegerrendite[^\n]*?([+−-]?\d+,\d+ %)/g)];
     if(!paare.length)bad.push('RETURN_KIND_OHNE_ZAHLEN');
     else if(paare.every(p=>p[1]===p[2]))bad.push('RETURN_KIND_IDENTISCH');
    }
    console.log('     Faktoren '+stock+': '+faktoren+' · '+zeilen.length+' Komponentenzeilen');
   }

   /* HISTORISCHE VERGLEICHSFAELLE: EINE ZAHL NUR MIT IHRER STICHPROBE.
      Die Regel des Vertrags (historical-cases-1.0.0) lautet: ein Median
      erscheint erst ab zehn abgeschlossenen Faellen. */
   const historie=await page.locator('#historie').innerText().catch(()=>'');
   if(historie){
    for(const m of historie.matchAll(/(\d+) von (\d+) Fällen/g))if(Number(m[2])<10)bad.push('FALLZAHL_UNTER_SCHWELLE='+m[2]);
    const horizonte=await page.locator('#historie .qx-horizon').evaluateAll(hs=>hs.map(h=>({wert:(h.querySelector('b')||{}).textContent||'',satz:(h.querySelector('small')||{}).textContent||''})));
    for(const h of horizonte)if(/\d+,\d+ %/.test(h.wert)&&!/Fällen/.test(h.satz))bad.push('RENDITE_OHNE_STICHPROBE');
    for(const wort of ['wird wahrscheinlich','dürfte steigen','dürfte fallen','Kursziel','Prognose:'])
     if(historie.replace(/kein Kursziel|keine Prognose|Kein Kursziel|Keine Prognose/g,'').includes(wort))bad.push('PROGNOSESPRACHE:'+wort);
   }

   /* DIE VERDICHTETE REISE (M26).

      Ein datenarmer Titel darf nicht wie eine kaputte Seite aussehen: kein
      Stapel Einzelabsagen, die Bereiche genannt, kein Code im Haupttext.
      Erlaubt ist, was aus dem Chart selbst kommt. */
   if(DATENARM.includes(stock)){
    const grenzenAbschnitt=page.locator('#grenzen');
    if(!await grenzenAbschnitt.count())bad.push('VERDICHTUNG_FEHLT');
    else{
     const gapText=await grenzenAbschnitt.innerText();
     const hatFaktoren=await page.locator('details.qx-factor').count();
     const notizen=await page.locator('main#qx-main .qx-notice').count();
     if(!hatFaktoren&&!/Was fehlt/.test(gapText))bad.push('KEINE_GRUPPE');
     if(notizen>1)bad.push('EINZELABSAGEN='+notizen);
     if(!/Kurs|Geschäftszahlen|Faktoren|Setup/.test(gapText))bad.push('BEREICHE_FEHLEN');
     /* Und ein Leser muss lesen koennen, was noch fehlt - nicht den Code. */
     if(/INSUFFICIENT_|NOT_COVERED_|SOURCE_MISSING|\b[A-Z]{3,}_[A-Z][A-Z_]{2,}\b/.test(text))bad.push('CODE_IN_HAUPTTEXT');
     console.log('     Verdichtung '+stock+': '+notizen+' Einzelabsagen · Faktoren '+hatFaktoren);
    }
   }

   /* EINE EIGENE BRANCHENVORLAGE MUSS AUF DER SEITE STEHEN.
      Gemessen betrifft das 974 Titel: sie rechnen nach einer anderen
      Methodik als ein Industrieunternehmen. WSBCO zeigte die
      Eigenkapitalquote mit Gewicht 0,30 und AAPL dieselbe Kennzahl mit 0,15. */
   if(BRANCHENVORLAGE.includes(stock)){
    await allesAufklappen(page);
    const alles=await page.locator('main#qx-main').innerText();
    const satz=(alles.match(/Branchenvorlage[^\n]*/)||[''])[0];
    if(!satz)bad.push('BRANCHENVORLAGE_UNGENANNT');
    else{
     if(/[A-Z]{3,}_[A-Z_]{3,}/.test(satz))bad.push('CODE_VOR_DEM_SATZ');
     if(stock==='WSBCO'&&!/Fassung|Version|v\d/.test(satz))bad.push('VORLAGE_OHNE_FASSUNG');
     console.log('     Branchenvorlage '+stock+': '+satz.slice(0,70));
    }
   }

   /* EINE ZURUECKGEHALTENE BEWERTUNG BLEIBT ZURUECKGEHALTEN.
      Gemessen: 266 der 465 Titel mit zurueckgehaltenem Boersenwert zeigten
      drei Zeilen tiefer ein Kurs-Gewinn- und ein Kurs-Umsatz-Verhaeltnis,
      aus zwei anderen Wegen. */
   if(ZURUECKHALTUNG.includes(stock)){
    const alles=await page.locator('main#qx-main').innerText();
    /* Die Absage hat ihren Wortlaut mehrfach gewechselt; verlangt wird, dass
       sie dasteht und ihren Grund (den Boersenwert) nennt. */
    const genannt=/Bewertung (bewusst |wird hier bewusst )?zurückgehalten|Börsenwert wird deshalb nicht genannt|Börsenwert ist nicht belegt|braucht den Börsenwert genau dieser Notierung/.test(alles);
    if(!genannt)bad.push('ZURUECKHALTUNG_UNGENANNT');
    const zahlen=await page.locator('#zahlen .qx-stat').allInnerTexts();
    const vielfache=zahlen.filter(t=>/\d+(,\d+)?\s*×/.test(t)||/Kurs-Gewinn|Kurs-Umsatz/.test(t)&&/\d/.test(t));
    if(vielfache.length)bad.push('KGV_TROTZ_ZURUECKHALTUNG:'+vielfache[0].replace(/\n/g,' ').slice(0,40));
    console.log('     Zurueckhaltung '+stock+' genannt: '+genannt);
   }

   /* DER EINE CHART: elf Zeitraeume, genau einer gedrueckt, und er
      wechselt auf Klick. Auf 1T traegt die Flaeche ihren Quellenzustand. */
   if(stock==='NVDA'&&view.startsWith('/quant/#/')){
    const knoepfe=await page.locator('section.qc-chart .qc-range').allInnerTexts();
    if(knoepfe.join('|')!=='1T|5T|1M|3M|6M|YTD|1J|3J|5J|10J|Max')bad.push('ZEITRAEUME:'+knoepfe.join('|'));
    const zustand=async()=>page.evaluate(()=>{const c=document.querySelector('section.qc-chart');return {range:c&&c.dataset.range,pressed:[...document.querySelectorAll('section.qc-chart .qc-range[aria-pressed="true"]')].map(b=>b.dataset.range),src:(c&&c.querySelector('.qc-plot')||{dataset:{}}).dataset.sourceState,live:(c&&c.querySelector('.qc-plot')||{dataset:{}}).dataset.live};});
    const z0=await zustand();
    if(z0.pressed.join('|')!==String(z0.range))bad.push('ZEITRAUM_MARKE:'+z0.pressed.join('|')+'/'+z0.range);
    if(z0.range==='1D'&&(!z0.src||!z0.live))bad.push('TAGESVERLAUF_OHNE_QUELLE');
    for(const [label,id] of [['Max','MAX'],['1J','1Y']]){
     await page.locator('section.qc-chart .qc-range',{hasText:new RegExp('^'+label+'$')}).click();
     await page.waitForFunction(i=>document.querySelector('section.qc-chart').dataset.range===i,id,{timeout:5000}).catch(()=>{});
     const z=await zustand();
     if(z.range!==id||z.pressed.join('|')!==id)bad.push('ZEITRAUM_KLICK_'+label+':'+z.range);
    }
   }
  }
  if(errors.length)bad.push('ERRORS:'+errors.slice(0,2).join(' / '));
  console.log((bad.length?'FAIL ':'ok   ')+view+'@'+width+(bad.length?'  '+bad.join('  '):''));
  befunde.push({view,width,ok:!bad.length,findings:bad.slice(),chars:text.length,h1,overflow,recovered});
  if(bad.length)failures++;
  errors.length=0;fremdFehlgeschlagen=false;
 }

 /* ZURUECK UND VOR. Eine Hash-App, die ihren Verlauf verliert, sperrt den
    Nutzer auf einer Seite ein. Geprueft wird der echte Weg: Navigation
    anklicken, Treffer anklicken, zurueck, vor - und jedes Mal die richtige
    Ansicht mit dem richtigen markierten Bereich. */
 {
  const bad=[];
  const leiste='#vu-dock nav';
  const ansicht=async(v)=>page.waitForFunction(x=>{const m=document.querySelector('main#qx-main');return m&&m.dataset.view===x&&m.getAttribute('aria-busy')==='false'&&!m.querySelector('.qx-loading');},v,{timeout:45000}).then(()=>true,()=>false);
  const marke=async()=>(await page.locator(leiste+' a[aria-current="page"]').allTextContents()).map(t=>t.trim()).join('|');
  await page.goto('about:blank');await page.goto(origin+'/quant/#/');await bereit(page).catch(()=>bad.push('NICHT_BEREIT'));
  await page.locator(leiste).getByRole('link',{name:'Quant Screener',exact:true}).click();
  if(!await ansicht('screener'))bad.push('SCREENER_NICHT_ERREICHT');
  await page.locator('main#qx-main a.qx-row').first().waitFor({timeout:30000}).catch(()=>bad.push('KEIN_TREFFER'));
  const ziel=await page.locator('main#qx-main a.qx-row').first().getAttribute('href').catch(()=>null);
  await page.locator('main#qx-main a.qx-row').first().click().catch(()=>{});
  if(!await ansicht('aktie'))bad.push('AKTIE_NICHT_ERREICHT');
  if(ziel&&!(await page.evaluate(()=>location.hash)).startsWith(ziel))bad.push('FALSCHE_AKTIE');
  await page.goBack();
  if(!await ansicht('screener'))bad.push('ZURUECK_NICHT_SCREENER:'+await page.evaluate(()=>location.hash));
  if(await marke()!=='Screener')bad.push('ZURUECK_MARKE:'+await marke());
  await page.goBack();
  if(!await ansicht('home'))bad.push('ZURUECK_NICHT_HOME:'+await page.evaluate(()=>location.hash));
  await page.goForward();
  if(!await ansicht('screener'))bad.push('VOR_NICHT_SCREENER');
  await page.goForward();
  if(!await ansicht('aktie'))bad.push('VOR_NICHT_AKTIE');
  if(await marke()!=='Aktien')bad.push('VOR_MARKE:'+await marke());
  if(errors.length)bad.push('ERRORS:'+errors.slice(0,2).join(' / '));
  errors.length=0;
  console.log((bad.length?'FAIL ':'ok   ')+'zurueck-vor@'+width+(bad.length?'  '+bad.join('  '):''));
  befunde.push({view:'history-back-forward',width,ok:!bad.length,findings:bad.slice(),chars:0,h1:1,overflow:false,recovered:false});
  if(bad.length)failures++;
 }
 await page.close();
}
await browser.close();server.close();
if(REPORT&&!ONLY){
 const {writeFile,mkdir}=await import('node:fs/promises');
 const {dirname}=await import('node:path');
 const {execFileSync}=await import('node:child_process');
 let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../..',import.meta.url).pathname}).toString().trim();}catch{/* ohne Git kein Commit */}
 await mkdir(dirname(REPORT),{recursive:true});
 await writeFile(REPORT,JSON.stringify({
  schemaVersion:'production-smoke-1.0.0',
  generatedAt:new Date().toISOString().replace(/\.\d{3}Z$/,'.000Z'),
  commit,release:root,
  widths:[1440,390],views:VIEWS.length,
  checks:befunde.length,failures,
  clean:failures===0,
  byWidth:Object.fromEntries([1440,390].map(w=>[String(w),{
   checks:befunde.filter(b=>b.width===w).length,
   failures:befunde.filter(b=>b.width===w&&!b.ok).length,
   overflow:befunde.filter(b=>b.width===w&&b.overflow).length,
   withoutSingleH1:befunde.filter(b=>b.width===w&&b.h1!==1).length,
   recovered:befunde.filter(b=>b.width===w&&b.recovered).length
  }])),
  results:befunde
 },null,1)+'\n');
 console.log('Bericht: '+REPORT);
}
console.log(failures?'PRODUCTION SMOKE FAILURES '+failures:'PRODUCTION SMOKE CLEAN');
process.exit(failures||vorabFehler?1:0);
