/* Produktions-Smoke gegen das GEBAUTE Release, nicht gegen den Quelltext.
   Der Unterschied ist real: die Seite laeuft dort als ein gebuendeltes
   Skript, die Artefakte liegen unter ihren Auslieferungspfaden, und die
   .gz-Dateien werden undurchsichtig ausgeliefert - der Browser entpackt
   sie NICHT transparent. Ein Smoke gegen das Repository wuerde einen Pfad
   testen, den es in Produktion nicht gibt. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve(process.argv[2]);
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
const VIEWS=['/vu2/','/vu2/?view=stock&ticker=NVDA','/vu2/?view=stock&ticker=AAPL','/vu2/?view=stock&ticker=ACAA','/vu2/?view=stock&ticker=EDVA','/vu2/?view=stock&ticker=AHT-P-D','/vu2/?view=quant&ticker=NVDA','/vu2/?view=quant&ticker=JPM','/vu2/?view=quant&ticker=ACAA','/vu2/?view=quant&ticker=WSBCO','/vu2/?view=radar','/vu2/?view=strategies','/vu2/?view=explain','/vu2/?view=screener','/vu2/?view=watchlist','/vu2/?view=technical&ticker=NVDA','/vu2/?view=fundamentals&ticker=NVDA','/vu2/?view=compare','/vu2/?view=signals','/vu2/?view=stocks',
 /* SIEBEN ANSICHTEN, DIE DER SMOKE NIE ANGESEHEN HAT.

    Gemessen am 26.09.2026: von 19 Ansichten im Router standen 12 in dieser
    Liste. atlas, discover, elliott, markets, portfolio und research liefen
    also ungeprueft mit - und genau in dieser Luecke lagen die beiden echten
    Befunde des Tages (die Uebersicht ohne Kurse, der Screener ohne Zahlen),
    weil ein Smoke, der nur auf Fehler schaut, eine leere Seite fuer gesund
    haelt. Gemessene Inhalte beim Aufnehmen: atlas 182.354 Zeichen,
    elliott 183.591, discover 4.699, home 2.880, markets 1.210, research 889,
    portfolio 562. */
 '/vu2/?view=atlas','/vu2/?view=discover','/vu2/?view=elliott&ticker=NVDA',
 '/vu2/?view=markets','/vu2/?view=portfolio','/vu2/?view=research',
 /* Die Seite hinter dem Knopf "Methodik im Detail" - die letzte Station der
    Reise. Sie war ein 404, und der Smoke hat nie eine Ansicht ausserhalb von
    /vu2/ angesehen, obwohl die App zwanzig Pfade dorthin verlinkt. */
 '/quant/methodology/'];
let failures=0;
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('console',m=>{const t=m.text();if(m.type()==='error'&&!t.includes('favicon')&&!t.includes('404'))errors.push('console: '+t);});
 for(const view of VIEWS){
  await page.goto(origin+view);
  await page.waitForTimeout(2200);
  const text=await page.locator('main').innerText().catch(()=>'');
  const recovered=text.includes('Ansicht derzeit nicht verfügbar')||text.includes('Diese Ansicht wurde nicht gefunden');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  const h1=await page.locator('h1').count();
  const primary=await page.evaluate(()=>[...document.querySelectorAll('h1,h2,h3,.eyebrow,[class*=chip],[class*=badge]')].map(n=>n.textContent.trim()));
  const hits=primary.filter(t=>FORBIDDEN.some(f=>t.includes(f)));
  const bad=[];
  /* EINE ANSICHT, DIE NUR EINE UEBERSCHRIFT ZEIGT, IST KEINE ANSICHT.

     Der Boden ist bewusst niedrig: die duennste berechtigte Ansicht ist die
     leere Depot-Ansicht mit 562 Zeichen, und eine Seite, die nur Titel und
     Untertitel setzt, kommt auf rund 200. 400 Zeichen fangen also den Fall
     "nichts gerendert", ohne einen Inhaltsstand einzufrieren - gemessen
     werden soll ein Rueckschritt, nicht der Tagesstand. */
  if(text.length<400)bad.push('ZU_WENIG_INHALT='+text.length);
  if(recovered)bad.push('RECOVER');
  if(overflow)bad.push('OVERFLOW');
  if(h1!==1)bad.push('H1='+h1);
  if(hits.length)bad.push('FORBIDDEN:'+hits.join('|'));

  /* OPTION C, IM GEBAUTEN RELEASE GEPRUEFT

     Kursstaerke und Anlegerrendite muessen nebeneinander stehen UND
     verschiedene Zahlen zeigen. Eine Oberflaeche, die beide Begriffe
     traegt und darunter denselben Wert schreibt, hat die Trennung
     beschriftet statt umgesetzt - und genau das faellt in einem
     Screenshot niemandem auf. */
  if(view.startsWith('/vu2/?view=quant')&&!/ticker=(ACAA|EDVA)/.test(view)){
   const grid=page.locator('.return-kind-grid');
   if(!await grid.count()){bad.push('RETURN_KIND_FEHLT');}
   else{
    const kopf=await grid.locator('.row.eyebrow span').allTextContents();
    if(kopf.join('|')!=='Zeitraum|Kursstärke|Anlegerrendite')bad.push('RETURN_KIND_KOPF:'+kopf.join('|'));
    const zeilen=grid.locator('.row:not(.eyebrow)');
    const anzahl=await zeilen.count();
    if(anzahl<2)bad.push('RETURN_KIND_ZEILEN='+anzahl);
    else{
     let verschieden=0;
     for(let z=0;z<anzahl;z++){
      const w=await zeilen.nth(z).locator('span').allTextContents();
      if(w[1]!==w[2])verschieden++;
     }
     if(!verschieden)bad.push('RETURN_KIND_IDENTISCH');
    }
   }
  }
  /* DIE VERDICHTETE REISE, IM GEBAUTEN RELEASE GEPRUEFT.

     Ein datenarmer Titel darf nicht wie eine kaputte Seite aussehen. Der
     Smoke kannte bisher nur NVDA, AAPL und JPM - also nur Titel, bei denen
     alles da ist. Genau deshalb waere ein Stapel Absagen hier nie
     aufgefallen. ACAA (117 Handelstage, keine Kennzahl) und EDVA (kein
     Kurs) sind die gemessenen Faelle. */
  /* DIE KOPFZAHL, DIE IM CHART DANEBEN STAND.

     AHT-P-D ist der gemessene Fall: Vorzugsaktie, nicht im Panel, 270
     veroeffentlichte Handelstage - und bis zum 26.09.2026 sagte die Kopfzahl
     "nicht verfuegbar", waehrend der Chart darunter 5,17 zeichnete. Der Smoke
     verlangt jetzt beides: eine Zahl im Kopf und das Datum dazu. */
  /* DIE UEBERSICHT NENNT NAMEN UND KURSE.

     Gemessen am 26.09.2026 am gebauten Release: von 6.875 Zeilen trugen
     FUENF einen Kurs und KEINE einen Namen - die Zeile schrieb den Ticker
     zweimal ("A | A | Nicht verfuegbar"). Der Smoke hat das nie gesehen,
     weil er die Liste nur auf Fehlerfreiheit geprueft hat. Jetzt prueft er
     ihren Inhalt. */
  /* DER SCREENER ZEIGT, WAS ER FINDET.

     Gemessen am 26.09.2026: er lieferte 50 richtige Treffer und zeigte in
     jeder Zeile "– / 7" und "Nicht verfuegbar", weil ein Name in der Seite
     die gewaehlte Methodik verdeckte. Der Smoke hat die Ansicht nur auf
     Fehlerfreiheit geprueft - eine unbenutzbare Hauptfunktion faellt so nie
     auf. Jetzt zaehlt er die Zahlen in den Zeilen. */
  if(view==='/vu2/?view=screener'){
   const satz=(await page.locator('main p.muted').allInnerTexts()).find(t=>t.includes('Treffer'))||'';
   const zeilen=await page.locator('.row:not(.eyebrow)').allInnerTexts();
   const mitZahl=zeilen.filter(t=>/\d+,\d+/.test(t)).length;
   if(!zeilen.length)bad.push('KEINE_TREFFER');
   else if(mitZahl<zeilen.length)bad.push('LEERE_ZEILEN='+(zeilen.length-mitZahl)+'/'+zeilen.length);
   if(/undefined/.test(satz))bad.push('UNDEFINED_IM_SATZ');
   console.log('     Screener: '+mitZahl+' von '+zeilen.length+' Zeilen mit Zahl · '+satz.slice(0,70));
  }
  if(view==='/vu2/?view=stocks'){
   const zeilen=await page.locator('.row:not(.eyebrow)').allInnerTexts();
   if(zeilen.length<20)bad.push('ZU_WENIGE_ZEILEN='+zeilen.length);
   else{
    const mitKurs=zeilen.filter(t=>/\d+,\d+\s*\$/.test(t)).length;
    const mitName=zeilen.filter(t=>{const teile=t.split('\n');return teile[0]&&teile[1]&&teile[0]!==teile[1];}).length;
    if(mitKurs/zeilen.length<0.8)bad.push('KURSE='+mitKurs+'/'+zeilen.length);
    if(mitName/zeilen.length<0.5)bad.push('NAMEN='+mitName+'/'+zeilen.length);
    console.log('     Uebersicht: '+mitKurs+' von '+zeilen.length+' Zeilen mit Kurs · '+mitName+' mit Namen');
   }
  }
  if(view.includes('ticker=AHT-P-D')){
   const quote=await page.locator('.quote').first().innerText().catch(()=>'');
   const unter=await page.locator('.focus .muted').first().innerText().catch(()=>'');
   if(!/\d/.test(quote))bad.push('KEIN_KURS:'+quote);
   if(!/\d{2}\.\d{2}\.\d{2}|\d{4}-\d{2}-\d{2}/.test(unter))bad.push('KEIN_KURSDATUM:'+unter.slice(0,40));
   console.log('     Kopfzahl: '+quote.replace(/\n/g,' ')+' · '+unter.split('·').slice(1).join('·').trim().slice(0,60));
  }
  if(/ticker=(ACAA|EDVA)/.test(view)){
   const gap=page.locator('.journey-gap');
   if(!await gap.count())bad.push('VERDICHTUNG_FEHLT');
   else{
    const gruppen=await gap.locator('.gap-group').count();
    const notizen=await page.locator('main .notice').count();
    const gapText=await gap.innerText();
    if(!gruppen)bad.push('KEINE_GRUPPE');
    /* Eine verdichtete Seite stapelt keine Einzelabsagen mehr. Erlaubt ist,
       was aus dem Chart selbst kommt (ein nicht verfuegbarer Zeitraum). */
    if(notizen>1)bad.push('EINZELABSAGEN='+notizen);
    if(!/Betrifft/.test(gapText))bad.push('BEREICHE_FEHLEN');
    /* Und ein Leser muss lesen koennen, was noch fehlt - nicht den Code. */
    if(/INSUFFICIENT_|NOT_COVERED_|SOURCE_MISSING/.test(gapText.split('Welche Gründe')[0]))bad.push('CODE_IN_HAUPTTEXT');
    console.log('     Verdichtung: '+gruppen+' Gruppen · '+notizen+' Einzelabsagen');
   }
  }
  /* EINE EIGENE BRANCHENVORLAGE MUSS AUF DER SEITE STEHEN.
   *
   * Gemessen betrifft das 974 Titel: sie rechnen nach einer anderen Methodik
   * als ein Industrieunternehmen, und bis M39 stand davon kein Wort auf der
   * Seite. WSBCO zeigte die Eigenkapitalquote mit Gewicht 0,30 und AAPL
   * dieselbe Kennzahl mit 0,15. */
  if(view.includes('ticker=WSBCO')){
   const hinweis=page.locator('.template-note');
   if(!await hinweis.count())bad.push('BRANCHENVORLAGE_UNGENANNT');
   else{
    const text=await hinweis.innerText();
    if(!/Branchenvorlage/.test(text))bad.push('VORLAGE_OHNE_NUTZERSATZ');
    if(!/Fassung/.test(text))bad.push('VORLAGE_OHNE_FASSUNG');
    /* Der interne Code darf nicht vor dem Nutzersatz stehen. Die Fassung
       traegt ihn zu Recht - sie steht in der letzten Zeile. */
    const vorFassung=text.split('Fassung')[0];
    if(/[A-Z]{3,}_[A-Z_]{3,}/.test(vorFassung))bad.push('CODE_VOR_DEM_SATZ');
    console.log('     Branchenvorlage: '+text.split('\n')[0].slice(0,60));
   }
  }
  /* DIE OBERE HAELFTE EINER AKTIENSEITE - AM GEBAUTEN RELEASE GEPRUEFT.
   *
   * Gemessen bei 390 px: die erste Bildschirmhoehe zeigte Name, Etikett,
   * Kurs, Aktualitaetszeile und dann einen Chart. Die fuenf Fragen, mit denen
   * ein Einsteiger kommt, wurden in Abschnitt vier, sechs und sieben
   * beantwortet - und die Abwaegung ueberhaupt erst auf der Quant-Ansicht.
   *
   * Geprueft wird deshalb die Reihenfolge im DOM und nicht nur, DASS es die
   * Auskunft gibt: ein Abschnitt hinter dem Chart waere derselbe Befund
   * nochmal. */
  if(/\?view=stock&ticker=(NVDA|AAPL)/.test(view)){
   const auskunft=page.locator('.brief-section');
   if(!await auskunft.count())bad.push('AUSKUNFT_FEHLT');
   else{
    const kopf=await auskunft.locator('.brief-headline').innerText().catch(()=>'');
    if(kopf.length<40)bad.push('KOPFSATZ_ZU_KURZ='+kopf.length);
    /* Kein interner Code im Kopfsatz und keine Handlungs- oder
       Prognosesprache - §81 gilt auch fuer eine Zusammenfassung. */
    if(/[A-Z]{3,}_[A-Z_]{3,}/.test(kopf))bad.push('CODE_IM_KOPFSATZ');
    if(/\b(kaufen|verkaufen|Kursziel|wird steigen|wird fallen)\b/i.test(kopf))bad.push('HANDLUNGSSPRACHE');
    /* Die drei Gruppen, in ihrer Reihenfolge. */
    const gruppen=await auskunft.locator('.brief-column h3').allInnerTexts();
    if(gruppen.join('|')!=='Spricht dafür|Spricht dagegen|Noch nicht bewertbar')bad.push('GRUPPEN:'+gruppen.join('|'));
    /* Und die Setup-Frage mit ihren Folgefragen. */
    const setupText=await auskunft.locator('.brief-setup').innerText().catch(()=>'');
    if(!/Gibt es ein Setup\?/.test(setupText))bad.push('SETUPFRAGE_FEHLT');
    if(!/Was würde es beenden\?|liegt keine Beobachtung vor/.test(setupText))bad.push('ENDE_UNBEANTWORTET');
    /* Vor dem Chart, nicht dahinter. */
    const reihenfolge=await page.evaluate(()=>{
     const a=document.querySelector('.brief-section'),c=document.querySelector('.q-chart');
     if(!a||!c)return 'FEHLT';
     return (a.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)?'VOR_CHART':'NACH_CHART';
    });
    if(reihenfolge!=='VOR_CHART')bad.push('AUSKUNFT_'+reihenfolge);
    /* Und sie steht wirklich im ersten Bildschirm: bei 390 px darf der
       Kopfsatz nicht unterhalb von zwei Bildschirmhoehen liegen. */
    const oben=await auskunft.evaluate(n=>n.getBoundingClientRect().top+scrollY);
    if(width===390&&oben>1800)bad.push('AUSKUNFT_ZU_TIEF='+Math.round(oben));
    console.log('     Auskunft: '+kopf.slice(0,74)+' · '+Math.round(oben)+'px');
   }
  }
  /* EINE ZURUECKGEHALTENE BEWERTUNG BLEIBT ZURUECKGEHALTEN.
   *
   * Gemessen: 266 der 465 Titel mit zurueckgehaltenem Boersenwert zeigten
   * drei Zeilen tiefer ein Kurs-Gewinn- und ein Kurs-Umsatz-Verhaeltnis, aus
   * zwei anderen Wegen. JPM ist der gemessene Fall - und die Quant-Ansicht
   * ist die Flaeche, auf der die Bewertungsfamilie vollstaendig steht. */
  if(view.includes('ticker=JPM')){
   const text=await page.locator('main').innerText();
   const bewertung=text.includes('Bewertung bewusst zurückgehalten')||text.includes('Bewertung wird hier bewusst zurückgehalten');
   if(!bewertung)bad.push('ZURUECKHALTUNG_UNGENANNT');
   /* Und kein Kurs-Gewinn-Verhaeltnis mit einer Zahl daneben. */
   const kgv=(await page.locator('main').innerText()).match(/Kurs-Gewinn-Verhältnis[^\n]*\n?([^\n]*)/);
   if(kgv&&/\d+,\d+\s*×/.test(kgv[1]||''))bad.push('KGV_TROTZ_ZURUECKHALTUNG:'+kgv[1].slice(0,30));
   console.log('     Zurueckhaltung genannt: '+bewertung);
  }
  if(errors.length)bad.push('ERRORS:'+errors.slice(0,2).join(' / '));
  console.log((bad.length?'FAIL ':'ok   ')+view+'@'+width+(bad.length?'  '+bad.join('  '):''));
  if(bad.length)failures++;
  errors.length=0;
 }
 await page.close();
}
await browser.close();server.close();
console.log(failures?'PRODUCTION SMOKE FAILURES '+failures:'PRODUCTION SMOKE CLEAN');
process.exit(failures?1:0);
