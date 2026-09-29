#!/usr/bin/env node
// Browser-QA der Maerkte-Seite (#/maerkte) gegen eine echte Seite - keine
// Attrappen, keine abgefangenen Daten. Prueft, was der Nutzer sieht:
// Gruppen je Assetklasse, Tracker-Kennzeichnung (nie Indexpunkte), echter
// Nikkei-Index, Krypto 24/7, Renditen/Leitzinsen in bp ohne Kursfarbe,
// Einheiten je Barrel/MMBtu/Unze, kein Querlauf auf dem Telefon.
// Markets 2.0: dazu Markt jetzt, Market Pulse, Movers, klickbare Karten und die
// Marktdetails (#/maerkte/<SYMBOL>) - Tracker-Wahrheit, Einheiten, Zeitraeume,
// kein falsches Live, Deep Link, Zurueck. Breiten 320/390/1440, hell/dunkel.
// Markets 3.0: Hero (Marktumfeld, erste fuenf Sekunden), fuenf Dimensionen, Vorher/Jetzt,
// Warum, Worauf, Aendern, Verlauf (Zeitraumwechsel), Breite, Cross Asset, Geschichten,
// zehn Bildschirme visuelle Abfolge, Einordnung auf den Detailseiten, axe hell/dunkel.
// Markets 4.1: Uebersicht (Kurse zuerst, Marktstimmung, Top & Flop) und die
// Erklaerung auf eigener Seite (#/maerkte/einordnung).
// Markets 4.2: Marktbarometer ganz oben; #/maerkte/einordnung als
// 2-Minuten-Seite (Wetter, grosse Zahlen, Vergleich, Gruende, Stufen),
// alle Details auf #/maerkte/einordnung/details.
// Usage: node scripts/discover/browser-qa-maerkte.mjs --url https://research.visionuniverse.de --out /tmp/maerkte-qa [--engine webkit] [--realtime]
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}catch{playwright=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const arg=(key,otherwise)=>{const i=process.argv.indexOf('--'+key);return i<0?otherwise:process.argv[i+1];};
const base=arg('url','http://127.0.0.1:8765').replace(/\/$/,'');
const out=arg('out','/tmp/maerkte-qa');await mkdir(out,{recursive:true});
const engine=arg('engine','chromium');if(!['chromium','webkit'].includes(engine))throw Error('engine');

const GRUPPEN=['aktien','energie','edelmetalle','krypto','us-renditen','eu-renditen','leitzinsen','devisen'];
const PFLICHT={
 aktien:['QQQ','SPY','DIA','N225'],energie:['WTI','BRENT','NATGAS'],edelmetalle:['XAUUSD','XAGUSD','XPTUSD','XPDUSD'],
 krypto:['BTCUSD','ETHUSD','SOLUSD','XRPUSD'],'us-renditen':['US2Y','US5Y','US10Y','US30Y'],'eu-renditen':['DE2Y','DE10Y','DE30Y'],
 leitzinsen:['FED_TARGET','US_EFFR','ECB_DFR'],devisen:['EURUSD']
};
const TRACKER={QQQ:'Nasdaq 100',SPY:'S&P 500',DIA:'Dow Jones'};

const checks=[];
function check(name,pass,detail){checks.push({name,pass:!!pass,detail:detail===undefined?null:detail});}

const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||undefined}:{})});
const evidence={};
for(const [key,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:900}]]){
 const page=await browser.newPage({viewport});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.goto(base+'/discover/#/maerkte',{waitUntil:'networkidle'});
 await page.waitForSelector('.dx-maerkte .dx-markt-karte',{timeout:30000});
 const seite=await page.evaluate(()=>{
  const t=(n,s)=>{const x=n.querySelector(s);return x?x.textContent.trim():null;};
  return {
   gruppen:[...document.querySelectorAll('.dx-maerkte-gruppe')].map(g=>({id:g.id.replace(/^maerkte-/,''),titel:t(g,'h2'),
    karten:[...g.querySelectorAll('.dx-markt-karte')].map(k=>({symbol:k.dataset.instrument,assetClass:k.dataset.assetClass,proxy:k.dataset.proxy,
     quoteState:k.dataset.quoteState,freshness:k.dataset.freshness,unit:k.dataset.unit,klasse:t(k,'.dx-markt-klasse'),titel:t(k,'h3'),
     wert:t(k,'.dx-markt-wert'),veraenderung:t(k,'.dx-markt-veraenderung b'),
     richtung:(k.querySelector('.dx-markt-veraenderung')||{className:''}).className.replace('dx-markt-veraenderung','').trim(),
     zustand:t(k,'.dx-markt-zustand'),semantik:t(k,'.dx-markt-semantik'),quelle:t(k,'.dx-markt-quelle')}))})),
   sprung:[...document.querySelectorAll('.dx-maerkte-sprung')].map(b=>b.textContent.trim()),
   querlauf:document.documentElement.scrollWidth>window.innerWidth,
   datenstand:t(document,'.dx-maerkte-stand')
  };
 });
 evidence[key]={...seite,pageErrors};
 const karten=Object.fromEntries(seite.gruppen.flatMap(g=>g.karten.map(k=>[k.symbol,{...k,gruppe:g.id}])));
 const p=(n,ok,d)=>check(key+': '+n,ok,d);

 p('Gruppen in der Reihenfolge der Owner-Liste',JSON.stringify(seite.gruppen.map(g=>g.id))===JSON.stringify(GRUPPEN),seite.gruppen.map(g=>g.id));
 p('Sprungleiste je Gruppe',seite.sprung.length===seite.gruppen.length,seite.sprung);
 for(const [gruppe,syms] of Object.entries(PFLICHT))for(const s of syms){
  const k=karten[s];
  p(s+' in '+gruppe+' mit Wert',k&&k.gruppe===gruppe&&k.quoteState==='AVAILABLE'&&!!k.wert,k?{gruppe:k.gruppe,state:k.quoteState,wert:k.wert,frische:k.freshness}:'fehlt');
 }
 for(const [s,markt] of Object.entries(TRACKER)){
  const k=karten[s]||{};
  p(s+' als Tracker gekennzeichnet',k.assetClass==='ETF'&&k.proxy==='tracker'&&k.klasse&&k.klasse.toLowerCase()===('tracker · '+s).toLowerCase()&&k.titel===markt,{klasse:k.klasse,titel:k.titel,proxy:k.proxy});
  p(s+' nie als Indexpunkte',k.wert&&!/Pkt|Punkte/.test(k.wert)&&/%$/.test(k.veraenderung||''),{wert:k.wert,veraenderung:k.veraenderung});
  p(s+' Offenlegung sichtbar',/nicht der offizielle Indexstand/.test(k.semantik||''),k.semantik);
 }
 const n225=karten.N225||{};
 p('Nikkei 225 als echter Index in Punkten',n225.assetClass==='INDEX'&&/Pkt\.$/.test(n225.wert||'')&&n225.proxy==='none',{wert:n225.wert,assetClass:n225.assetClass});
 for(const s of PFLICHT.krypto){const k=karten[s]||{};p(s+' 24/7 ohne Boersensitzung',/24\/7/.test(k.zustand||'')&&!/Sitzung|Börse/.test(k.zustand||''),k.zustand);}
 for(const s of [...PFLICHT['us-renditen'],...PFLICHT['eu-renditen'],...PFLICHT.leitzinsen]){
  const k=karten[s]||{};
  p(s+' Prozent, bp, keine Kursfarbe',/%$/.test(k.wert||'')&&!/[€$]/.test(k.wert||'')&&/ bp$/.test(k.veraenderung||'')&&k.richtung==='is-neutral',{wert:k.wert,veraenderung:k.veraenderung,richtung:k.richtung});
 }
 for(const [s,einheit] of [['WTI','/bbl'],['BRENT','/bbl'],['NATGAS','/MMBtu'],['XAUUSD','/oz'],['XAGUSD','/oz'],['XPTUSD','/oz'],['XPDUSD','/oz']]){
  const k=karten[s]||{};p(s+' Einheit '+einheit,(k.wert||'').endsWith(einheit),k.wert);
 }
 const fx=karten.EURUSD||{};p('EUR/USD als Kurs, nicht umgerechnet',/USD$/.test(fx.wert||'')&&!/€/.test(fx.wert||''),fx.wert);
 p('Keine Seitenfehler',pageErrors.length===0,pageErrors);
 if(key==='mobile')p('Kein Querlauf auf dem Telefon',!seite.querlauf,seite.querlauf);
 /* Markets 4.1: Uebersicht wie in einer Broker-App - Kurse zuerst, eine
    Karte Marktstimmung, die Erklaerung einen Tipp tiefer (#/maerkte/einordnung). */
 const ov=await page.evaluate(()=>{const seite=document.querySelector('.dx-mk');if(!seite)return null;
  const kinder=[...seite.children].map(n=>n.id||n.className.split(' ')[0]);
  const st=document.getElementById('maerkte-stimmung');
  return {kinder,titel:(seite.querySelector('h1')||{}).textContent||'',
   titelSichtbar:(()=>{const h=seite.querySelector('h1');if(!h)return false;const r=h.getBoundingClientRect();return r.width>40&&r.height>20;})(),
   stimmung:st?{text:st.textContent,link:(st.querySelector('a.dx-m3-st-link')||{}).getAttribute?.('href')}:null,
   analyse:!!document.querySelector('.dx-m3-hero,#maerkte-dimensionen,#maerkte-warum'),
   stories:[...document.querySelectorAll('.dx-m3-story')].map(s=>({titel:s.querySelector('h3').textContent,stand:(s.querySelector('.dx-m3-story-stand')||{}).textContent||'',
     links:[...s.querySelectorAll('.dx-m3-story-wert')].map(a=>a.getAttribute('href'))})),
   movers:[...document.querySelectorAll('.dx-movers-spalte a')].map(a=>a.getAttribute('href')),
   kartenLinks:[...document.querySelectorAll('a.dx-markt-karte')].map(a=>a.getAttribute('href'))};});
 const pos=id=>ov?ov.kinder.indexOf(id):-1;
 p('Uebersicht: Titel "Märkte" sichtbar, Kategorien vor den Kursen',!!ov&&ov.titel==='Märkte'&&ov.titelSichtbar&&pos('dx-maerkte-nav')>=0&&pos('dx-maerkte-nav')<pos('maerkte-aktien'),ov&&ov.kinder);
 p('Uebersicht: Marktbarometer ganz oben -> Kategorien -> Aktienmaerkte -> Top & Flop -> Was heute auffaellt -> weitere Maerkte',
   pos('maerkte-stimmung')>=0&&pos('maerkte-stimmung')<pos('dx-maerkte-nav')&&pos('dx-maerkte-nav')<pos('maerkte-aktien')&&pos('maerkte-aktien')<pos('maerkte-movers')&&pos('maerkte-movers')<pos('maerkte-jetzt')&&pos('maerkte-jetzt')<pos('maerkte-energie'),ov&&ov.kinder);
 p('Uebersicht: Marktbarometer mit Stufe, Rueckschlag-Risiko und eindeutigem Knopf zur 2-Minuten-Erklaerung',!!ov&&!!ov.stimmung&&/Rückschlag-Risiko: (normal|erhöht|gering)/.test(ov.stimmung.text)&&
   /Was heißt „[^“]+“\?/.test(ov.stimmung.text)&&/In 2 Minuten erklärt/.test(ov.stimmung.text)&&ov.stimmung.link==='#/maerkte/einordnung',ov&&ov.stimmung&&ov.stimmung.link);
 p('Uebersicht: keine Analyse-Abschnitte auf der Kursseite',!!ov&&!ov.analyse,null);
 {const beleg=await page.evaluate(()=>{const a=document.querySelector('#maerkte-stimmung a.dx-m3-st-beleg');return a?{href:a.getAttribute('href'),text:a.textContent}:null;});
  p('Uebersicht: Stresstest-Beleg im Marktbarometer (x von y Abstuerzen, nachgerechnet)',!!beleg&&beleg.href==='#/maerkte/einordnung'&&/\d von \d großen Abstürzen früh erkannt/.test(beleg.text)&&/nachgerechnet/.test(beleg.text),beleg);}
/* Markets 4.6: Knopf zur Erklaerung im Discover-Gruen vor dem Stresstest-Streifen,
    darunter "Im Klartext" mit den grossen Zahlen und dem Schnitt aller Tage. */
 {const kt=await page.evaluate(()=>{const st=document.getElementById('maerkte-stimmung'),k=document.getElementById('maerkte-klartext');
   const link=st&&st.querySelector('a.dx-m3-st-link'),beleg=st&&st.querySelector('a.dx-m3-st-beleg');
   return {knopfVorBeleg:!!link&&!!beleg&&!!(link.compareDocumentPosition(beleg)&Node.DOCUMENT_POSITION_FOLLOWING),
    knopfFarbe:link?getComputedStyle(link).backgroundColor:'',knopfHoehe:link?link.getBoundingClientRect().height:0,
    box:k?{text:k.textContent,zahlen:k.querySelectorAll('.dx-m3-kt-zahl').length,held:(()=>{const h=k.querySelector('.dx-m3-kt-held-zahl');return h?{text:h.textContent,px:parseFloat(getComputedStyle(h).fontSize)}:null;})(),balken:k.querySelectorAll('.dx-m3-kt-balken li').length,schnitt:(k.textContent.match(/Schnitt aller Tage/g)||[]).length}:null};});
  p('Uebersicht: Knopf "Was heisst ...?" gruen, gross und vor dem Stresstest-Streifen',kt.knopfVorBeleg&&kt.knopfFarbe==='rgb(200, 245, 49)'&&kt.knopfHoehe>=60,kt);
  p('Uebersicht: "Im Klartext" direkt unter dem Barometer - Bedeutung, Hauptzahl 1-Jahres-Rendite gross mit Marktvergleich, drei Zahlen, Hinweis',
   pos('maerkte-klartext')===pos('maerkte-stimmung')+1&&!!kt.box&&kt.box.zahlen===3&&!!kt.box.held&&/^\+\d/.test(kt.box.held.text)&&kt.box.held.px>=52&&kt.box.balken===2&&/ähnlich dem S&P 500/.test(kt.box.text)&&kt.box.schnitt>=2&&/auf einen Blick/.test(kt.box.text)&&/lagen nach 1 Jahr im Plus/.test(kt.box.text)&&
   /kein verlässlicher Hinweis/.test(kt.box.text)&&!/Kaufsignal|kaufen|verkaufen|sollten Sie/i.test(kt.box.text),kt.box&&{zahlen:kt.box.zahlen,schnitt:kt.box.schnitt,held:kt.box.held,balken:kt.box.balken});}
 p('Markt jetzt: Geschichten mit Stand, jede Bewegung verlinkt',!!ov&&ov.stories.length>=1&&ov.stories.every(s=>/Stand|Handelstag/.test(s.stand)&&s.links.length&&s.links.every(h=>/^#\/maerkte\/[A-Z0-9_]+$/.test(h))),ov&&ov.stories);
 p('Movers verlinken auf Aktienseiten',!!ov&&(ov.movers.length===0||ov.movers.every(h=>/^#\/s\/US_REAL\//.test(h))),ov&&ov.movers.slice(0,3));
 p('Jede Karte mit Wert ist ein Link zum Marktdetail',!!ov&&ov.kartenLinks.length>=28&&ov.kartenLinks.every(h=>/^#\/maerkte\//.test(h)),ov&&ov.kartenLinks.length);
 await page.screenshot({path:`${out}/maerkte-${key}.png`});
 {const y0=await page.evaluate(()=>scrollY);await page.click('.dx-maerkte-sprung[data-ziel="maerkte-krypto"]');
  /* Weicher Bildlauf ueber eine lange Seite: warten, bis er steht (max. 6 s). */
  let vor=-1,ruhig=0;for(let i=0;i<30&&ruhig<2;i++){await page.waitForTimeout(200);const y=await page.evaluate(()=>scrollY);ruhig=y===vor&&y>0?ruhig+1:0;vor=y;}
  const sprung=await page.evaluate(()=>{const r=document.getElementById('maerkte-krypto').getBoundingClientRect();return {y:scrollY,top:r.top};});
  p('Sprungleiste fuehrt zur Gruppe',sprung.y!==y0&&sprung.top>=-5&&sprung.top<250,sprung);
  await page.screenshot({path:`${out}/maerkte-${key}-krypto.png`});}
 /* Markets 4.2: das Marktbarometer in zwei Minuten (#/maerkte/einordnung). */
 await page.goto(base+'/discover/#/maerkte/einordnung',{waitUntil:'networkidle'});
 await page.waitForSelector('#bm-heute',{timeout:30000});
 const bm=await page.evaluate(()=>{const q=s=>document.querySelector(s);const t=s=>(q(s)||{}).textContent||'';
  return {folge:[...document.querySelectorAll('.dx-bm>section')].map(n=>n.id),zurueck:(q('.dx-bm>.dx-back')||{getAttribute:()=>null}).getAttribute('href'),
   titel:t('.dx-bm h1'),stufe:t('.bm-heute-stufe'),wetter:t('.bm-heute-wetter'),leiste:document.querySelectorAll('.bm-leiste li').length,
   zahlen:[...document.querySelectorAll('.bm-zahl b')].map(b=>b.textContent),fazit:t('.bm-fazit'),
   tabs:[...document.querySelectorAll('.bm-tabs button')].map(b=>b.textContent),saeulen:document.querySelectorAll('.bm-saeule').length,heute:document.querySelectorAll('.bm-saeule.is-heute').length,
   chartFazit:t('.bm-chart-fazit'),gruende:document.querySelectorAll('.bm-grund').length,stufen:document.querySelectorAll('.bm-stufe').length,
   mehr:(q('a.bm-mehr')||{getAttribute:()=>null}).getAttribute('href'),text:(q('.dx-bm')||{}).textContent||'',
   querlauf:document.documentElement.scrollWidth>innerWidth};});
 p('Marktbarometer: Titel, Weg zurueck, alle Teile in fester Reihenfolge',bm.titel==='Marktbarometer'&&bm.zurueck==='#/maerkte'&&
   JSON.stringify(bm.folge)===JSON.stringify(['bm-heute','bm-krisen','bm-erholung','bm-chance','bm-vergleich','bm-warum','bm-wende','bm-stufen','bm-kalender']),{folge:bm.folge,zurueck:bm.zurueck});
 p('Marktbarometer: Stufe als Wetter mit Leiste der fuenf Stufen',bm.stufe.length>=5&&bm.wetter.length>=4&&bm.leiste===5,{stufe:bm.stufe,wetter:bm.wetter});
 p('Marktbarometer: vier grosse Zahlen in Prozent und ein Fazit',bm.zahlen.length===4&&bm.zahlen.every(z=>/%$/.test(z))&&/Kurz gesagt:/.test(bm.fazit),bm.zahlen);
 p('Marktbarometer: Vergleich mit vier Ansichten, heutige Stufe markiert',bm.tabs.length===4&&bm.saeulen>=4&&bm.heute===1&&bm.chartFazit.length>20,{tabs:bm.tabs,saeulen:bm.saeulen});
 {const vor=bm.chartFazit;await page.click('.bm-tabs button[data-ansicht="schlecht"]');await page.waitForTimeout(150);
  const nach=await page.evaluate(()=>({f:document.querySelector('.bm-chart-fazit').textContent,p:document.querySelector('.bm-tabs button[aria-pressed="true"]').dataset.ansicht}));
  p('Marktbarometer: Ansichtswechsel aendert Diagramm und Aussage',nach.p==='schlecht'&&nach.f!==vor&&/schlechten Jahr/.test(nach.f),nach);}
 p('Marktbarometer: Gruende als Symbol-Kacheln, fuenf Stufen zum Wischen, Weg zu allen Details',bm.gruende>=3&&bm.stufen===5&&bm.mehr==='#/maerkte/einordnung/details',{gruende:bm.gruende,stufen:bm.stufen,mehr:bm.mehr});
 {const kr=await page.evaluate(()=>{const k=document.getElementById('bm-krisen');const c=document.getElementById('bm-kalender');
   return {krisen:k?k.querySelectorAll('.bm-krisen-tabelle tbody tr').length:0,zahlen:k?[...k.querySelectorAll('.bm-krisen-zahl b')].map(b=>b.textContent):[],grenze:k?/Boden voraus/.test(k.textContent)&&/gab es damals noch nicht/.test(k.textContent):false,
    corona:k?/Corona-Crash/.test(k.textContent):false,dotcom:k?/Dotcom-Blase/.test(k.textContent):false,
    kalender:c?{getrennt:/kein Teil des Barometers/.test(c.textContent),jetzt:(c.querySelector('.bm-kal-jetzt-kopf')||{}).textContent||'',monate:c.querySelectorAll('.bm-monat').length,
     monatJetzt:c.querySelectorAll('.bm-monat.is-jetzt').length,zyklus:c.querySelectorAll('.bm-zjahr').length,zyklusJetzt:c.querySelectorAll('.bm-zjahr.is-jetzt').length}:null};});
  p('Stresstest: direkt nach Heute, Tabelle der sieben Abstuerze, vier Kennzahlen, Corona und Dotcom dabei, ehrliche Grenze (Boeden, nachgerechnet)',kr.krisen>=7&&kr.zahlen.length===4&&kr.corona&&kr.dotcom&&kr.grenze,{krisen:kr.krisen,zahlen:kr.zahlen});
  p('Kalender-Kontext: getrennt vom Barometer, 12 Monate, 4 Zyklusjahre, jetzt markiert',!!kr.kalender&&kr.kalender.getrennt&&kr.kalender.monate===12&&kr.kalender.monatJetzt===1&&kr.kalender.zyklus===4&&kr.kalender.zyklusJetzt===1&&/^Jetzt: /.test(kr.kalender.jetzt),kr.kalender);}
 {const er=await page.evaluate(()=>{const e=document.getElementById('bm-erholung');if(!e)return null;
   return {getrennt:/kein Teil des Barometers/.test(e.textContent),status:(e.querySelector('.bm-erh-status b')||{}).textContent||'',
    zeilen:e.querySelectorAll('.bm-erh-tabelle tbody tr').length,zufrueh:e.querySelectorAll('.bm-erh-tabelle td.is-falsch').length,handeln:/kein Signal zum Handeln/.test(e.textContent)};});
  p('Fruehe Erholungszeichen: eigenes Zeichen, Status jetzt, erstes Zeichen je grossem Absturz, zu fruehe Zeichen sichtbar',!!er&&er.getrennt&&er.status.length>5&&er.zeilen>=7&&er.zufrueh>=1&&er.handeln,er);}
 p('Marktbarometer: Quelle, Hinweis, keine Handlungsaufforderung',/French Data Library/.test(bm.text)&&/Keine Anlageberatung/.test(bm.text)&&!/jetzt kaufen|verkaufen Sie|Kaufsignal/i.test(bm.text),null);
 if(key==='mobile')p('Marktbarometer: kein Querlauf auf dem Telefon',!bm.querlauf,null);
 await page.screenshot({path:`${out}/barometer-${key}.png`,fullPage:true});
 /* Alle Details: #/maerkte/einordnung/details */
 await page.goto(base+'/discover/#/maerkte/einordnung/details',{waitUntil:'networkidle'});
 await page.waitForSelector('.dx-m3-hero',{timeout:30000});
 p('Details: eigene Seite mit Titel und Weg zurueck zum Marktbarometer',await page.evaluate(()=>{const b=document.querySelector('.dx-mk-einordnung>.dx-back');const h=document.querySelector('.dx-mk-einordnung h1');
   return !!b&&b.getAttribute('href')==='#/maerkte/einordnung'&&!!h&&/alle Details/.test(h.textContent);}),null);
 /* Der Hero schneidet Ueberstand ab (overflow:hidden) - ein zu breiter Inhalt
    faellt deshalb nicht als Seiten-Querlauf auf, sondern als verschobener
    Gauge und abgeschnittener Text. Direkt messen. */
 const heroBreite=await page.evaluate(()=>{const r=document.querySelector('.dx-m3-hero-raster');
  return r?{inhalt:r.scrollWidth,platz:r.clientWidth}:null;});
 p('Hero passt in die Breite (nichts abgeschnitten)',heroBreite&&heroBreite.inhalt<=heroBreite.platz+1,heroBreite);
 /* Markets 3.0: Einordnung zuerst - Hero, fuenf Dimensionen, Vorher/Jetzt, Warum, Worauf, Aendern, Verlauf, Breite, Cross Asset, Geschichten. */
 const intel=await page.evaluate(()=>{
  const t=s=>{const x=document.querySelector(s);return x?x.textContent.trim():'';};
  const hero=document.querySelector('.dx-m3-hero');const r=hero?hero.getBoundingClientRect():null;
  const zr=(document.querySelector('.dx-m3-aussage')||{getBoundingClientRect:()=>({bottom:99999})}).getBoundingClientRect();
  return {
   environment:hero?hero.dataset.environment:null,zustand:t('.dx-m3-zustand'),aussage:t('.dx-m3-aussage'),anleger:t('.dx-m3-anleger p'),
   heroTop:r?r.top+scrollY:null,aussageUnten:zr.bottom+scrollY,vh:innerHeight,zyklus:t('.dx-m3-zyklus'),seit:t('.dx-m3-seit'),blick:document.querySelectorAll('.dx-m3-blick li').length,
   dims:[...document.querySelectorAll('.dx-m3-dim')].map(d=>({id:d.dataset.dimension,state:d.dataset.state,spur:!!d.querySelector('.dx-m3-spur'),
     tiefe:d.querySelector('.dx-m3-tiefe').textContent})),
   vjTop:t('.dx-m3-vj-top b'),vjRows:document.querySelectorAll('.dx-m3-vj-zeile').length,
   warum:[...document.querySelectorAll('.dx-m3-warum-spalte h3')].map(h=>h.textContent),
   worauf:[...document.querySelectorAll('.dx-m3-worauf .dx-m3-punkt-item h3')].map(h=>h.textContent),
   aendern:[...document.querySelectorAll('.dx-m3-aendern-spalte')].map(x=>x.querySelectorAll('li').length),
   verlaufSvg:!!document.querySelector('.dx-m3-verlauf svg'),verlaufTf:[...document.querySelectorAll('.dx-m3-tf button')].map(b=>b.dataset.range),verlaufSr:t('.dx-m3-v-sr'),
   breite:(document.querySelector('.dx-m3-breite')||{dataset:{}}).dataset.state||null,breiteText:t('.dx-m3-breite'),
   ca:[...document.querySelectorAll('.dx-m3-ca-zeile')].map(a=>a.getAttribute('href')),
   stories:[...document.querySelectorAll('.dx-m3-story')].map(s=>({titel:s.querySelector('h3').textContent,stand:(s.querySelector('.dx-m3-story-stand')||{}).textContent||'',
     links:[...s.querySelectorAll('.dx-m3-story-wert')].map(a=>a.getAttribute('href'))})),
   m3Text:(document.querySelector('.dx-m3')||{}).textContent||'',
   movers:[...document.querySelectorAll('.dx-movers-spalte a')].map(a=>a.getAttribute('href')),
   kartenLinks:[...document.querySelectorAll('a.dx-markt-karte')].map(a=>a.getAttribute('href'))
  };
 });
 evidence[key].intelligence={environment:intel.environment,zustand:intel.zustand,aussage:intel.aussage,anleger:intel.anleger,zyklus:intel.zyklus,seit:intel.seit,
  dims:intel.dims.map(d=>d.id+':'+d.state),vjTop:intel.vjTop,worauf:intel.worauf,aendern:intel.aendern,breite:intel.breite,stories:ov?ov.stories.map(s=>s.titel):[]};
 const LEVELS=['DEFENSIVE','CAUTIOUS','SELECTIVE','CONSTRUCTIVE','BROADLY_CONSTRUCTIVE'];
 p('Hero: Marktumfeld als Zustand (kein Score)',LEVELS.includes(intel.environment)&&intel.zustand.length>=5&&!/\d+\s*\/\s*100/.test(intel.zustand),{env:intel.environment,zustand:intel.zustand});
 p('Hero: Hauptaussage und Bedeutung fuer Anleger',intel.aussage.length>15&&intel.anleger.length>30,{aussage:intel.aussage,anleger:intel.anleger});
 p('Erste fuenf Sekunden: Zustand und Aussage im ersten Bildschirm',intel.heroTop!==null&&intel.heroTop<intel.vh*0.5&&intel.aussageUnten<=intel.vh*(key==='mobile'?1.02:1),{heroTop:intel.heroTop,aussageUnten:intel.aussageUnten,vh:intel.vh});
 p('Hero: Veraenderung seit letzter Bewertung',/Seit der Bewertung vom \d{2}\.\d{2}\./.test(intel.seit),intel.seit);
 p('Hero: letzte und naechste Neubewertung ehrlich (ca., kein Sekundenzaehler)',/Letzte Neubewertung/.test(intel.zyklus)&&/nächste planmäßig ca\./.test(intel.zyklus)&&!/\d{1,2}:\d{2}:\d{2}/.test(intel.zyklus),intel.zyklus);
 p('Hero: Gruende auf einen Blick (fuenf Dimensionen)',intel.blick===5,intel.blick);
 p('Fuenf Dimensionen mit Skala, Belegen und Methodik',JSON.stringify(intel.dims.map(d=>d.id))===JSON.stringify(['TREND','BREADTH','MOMENTUM','RISK','CROSS_ASSET'])&&intel.dims.every(d=>d.spur&&/Methodik/.test(d.tiefe)&&(d.state==='UNAVAILABLE'||/Belege/.test(d.tiefe))),intel.dims.map(d=>d.id+':'+d.state));
 p('Vorher -> Jetzt mit groesster Veraenderung',intel.vjTop.length>10&&intel.vjRows>=5,{top:intel.vjTop,rows:intel.vjRows});
 p('Warum: unterstuetzt/Gegenwind/offen sichtbar',intel.warum.length>=2,intel.warum);
 p('Worauf es ankommt: 1-4 Punkte',intel.worauf.length>=1&&intel.worauf.length<=4,intel.worauf);
 p('Was wuerde das Bild aendern: beide Richtungen',intel.aendern.length===2&&intel.aendern.some(n=>n>0),intel.aendern);
 p('Verlauf: Diagramm, Zeitraeume 1W-1J, Textfassung',intel.verlaufSvg&&JSON.stringify(intel.verlaufTf)===JSON.stringify(['1W','1M','3M','6M','1Y'])&&/Wechsel der Einordnung/.test(intel.verlaufSr),{tf:intel.verlaufTf,sr:intel.verlaufSr});
 p('Marktbreite: aktuell oder ehrlich NICHT AKTUELL',!!intel.breite&&(intel.breite!=='NOT_CURRENT'||/nicht aktuell/i.test(intel.breiteText)),intel.breite);
 p('Cross Asset: Anlageklassen verlinkt, keine Kausalitaet',intel.ca.length>=3&&intel.ca.every(h=>/^#\/maerkte\//.test(h))&&/nicht, warum/.test(intel.m3Text),intel.ca);
 p('Kein Gesamtscore, keine Kauf-/Verkaufsaufforderung, Hinweis sichtbar',!/\d+\s*\/\s*100|Score \d|jetzt kaufen|verkaufen Sie|Kaufsignal/i.test(intel.m3Text)&&/keine Anlageberatung/.test(intel.m3Text),null);
 const kf=await page.evaluate(()=>{const k=document.getElementById('maerkte-kurz');const h=document.querySelector('.dx-m3-hero');if(!k)return null;
   return {nachHero:!!h&&h.nextElementSibling===k,fragen:[...k.querySelectorAll('dt')].map(x=>x.textContent),text:k.textContent};});
 p('Das Wichtigste in 30 Sekunden: direkt nach dem Hero, vier Fragen, Stufe mit Geschichte verbunden',!!kf&&kf.nachHero&&
   JSON.stringify(kf.fragen)===JSON.stringify(['Heute','Warum?','Was heißt das?','Worauf achten?'])&&/von 100 Fällen innerhalb von 3 Monaten/.test(kf.text),kf&&{nachHero:kf.nachHero,fragen:kf.fragen});
 p('Einsteiger zuerst: "Für Fortgeschrittene" vor den Messwerten',await page.evaluate(()=>{const t=[...document.querySelectorAll('.dx-m3-trenner h2')].map(h=>h.textContent);
   const d=document.getElementById('maerkte-dimensionen'),tr=document.querySelector('.dx-m3-trenner');return t[0]==='Für Fortgeschrittene'&&!!d&&!!(tr.compareDocumentPosition(d)&4);}),null);
 const pr=await page.evaluate(()=>{const s=document.querySelector('#maerkte-pruefung');if(!s)return null;return {text:s.textContent,balken:s.querySelectorAll('.dx-m3-pr-balken li').length,
   heute:s.querySelectorAll('.dx-m3-pr-balken li.is-heute').length,quelle:(s.querySelector('.dx-m3-pr-details a')||{}).href||''};});
 p('Wie verlaesslich: Rueckschlag-Risiko je Stufe, heutige Stufe markiert',!!pr&&pr.balken>=4&&pr.heute===1&&/von 100 Fällen/.test(pr.text),pr&&{balken:pr.balken,heute:pr.heute});
 p('Wie verlaesslich: Modellrechnung nie allein (immer investiert, seit 2001, ohne Kosten, Quelle)',!!pr&&/Immer investiert/.test(pr.text)&&/Seit 20\d\d:/.test(pr.text)&&/Ohne Kosten und Steuern/.test(pr.text)&&/ken\.french/.test(pr.quelle),pr&&pr.quelle);
 /* Verlauf: Zeitraumwechsel veraendert Diagramm und Text (Standard ist 1J). */
 const vor=intel.verlaufSr;
 await page.click('.dx-m3-tf button[data-range="3M"]');await page.waitForTimeout(300);
 const nach=await page.evaluate(()=>({sr:document.querySelector('.dx-m3-v-sr').textContent,pressed:document.querySelector('.dx-m3-tf button[aria-pressed="true"]').dataset.range}));
 p('Verlauf: Zeitraumwechsel 1J -> 3M',nach.pressed==='3M'&&nach.sr!==vor,nach);
 /* Kachel-Uebersicht: grosse Kacheln mit Bild, jede fuehrt zu ihren Belegen. */
 const kk=await page.evaluate(()=>[...document.querySelectorAll('.dx-m3-kachel')].map(k=>({id:k.dataset.kachel,bild:!!k.querySelector('.dx-m3-kachel-bild svg,.dx-m3-kachel-bild .dx-m3-spur,.dx-m3-kachel-bild .dx-m3-kk-nr,.dx-m3-kachel-bild .dx-m3-kk-wechsel'),titel:(k.querySelector('.dx-m3-kachel-link')||{}).textContent||''})));
 p('Kacheln: mindestens 6, jede mit Bild und Schlagzeile',kk.length>=6&&kk.every(k=>k.bild&&k.titel.length>=3),kk);
 /* "Direkt zu": Chips ganz oben vor dem Hero, jeder mit Symbol und echtem Ziel. */
 const mn=await page.evaluate(()=>{const n=document.getElementById('maerkte-direkt');if(!n)return null;const hero=document.querySelector('.dx-m3-hero');
  return {vorHero:!!hero&&n.nextElementSibling===hero,chips:[...n.querySelectorAll('.dx-mn-chip')].map(c=>({ziel:c.dataset.ziel,label:c.textContent.trim(),icon:!!c.querySelector('svg'),da:!!document.getElementById(c.dataset.ziel)}))};});
 p('Direkt zu (Einordnung): ganz oben vor dem Hero, jeder Chip mit Symbol und Ziel',mn&&mn.vorHero&&mn.chips.length>=8&&mn.chips.every(c=>c.icon&&c.da&&c.label.length>=3),mn);
 {await page.evaluate(()=>scrollTo(0,0));await page.click('.dx-mn-chip[data-ziel="maerkte-aendern"]');
  let vor=-1,ruhig=0;for(let i=0;i<30&&ruhig<2;i++){await page.waitForTimeout(200);const y=await page.evaluate(()=>scrollY);ruhig=y===vor&&y>0?ruhig+1:0;vor=y;}
  const z=await page.evaluate(()=>document.getElementById('maerkte-aendern').getBoundingClientRect().top);
  p('Direkt zu: Chip fuehrt zum Bereich',z>=-5&&z<250,z);await page.evaluate(()=>scrollTo(0,0));}
 /* Visuelle Abfolge: zehn Bildschirme - wechselnde Flaechen statt Kartenwand. */
 if(key==='mobile'){
  const folge=[];
  for(let i=0;i<10;i++){
   await page.evaluate(y=>scrollTo(0,y),i*(844-120));await page.waitForTimeout(150);
   folge.push(await page.evaluate(()=>{const s=new Set();for(const n of document.querySelectorAll('.dx-m3>section,.dx-m3>nav.dx-mn,.dx-m3>.dx-maerkte-gruppe,.dx-m3>section.dx-maerkte-movers')){const r=n.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)s.add((n.className.match(/dx-m3-[a-z]+|dx-maerkte-[a-z]+|dx-mn\b/)||[''])[0]);}return [...s];}));
   await page.screenshot({path:`${out}/maerkte-folge-${String(i).padStart(2,'0')}.png`});
  }
  const arten=new Set(folge.flat());
  p('Visuelle Abfolge: mindestens 7 Flaechentypen in 10 Bildschirmen, keine reine Kartenwand',arten.size>=7&&folge.every(f=>!(f.length===1&&f[0]==='dx-maerkte-gruppe')),[...arten]);
  await page.evaluate(()=>scrollTo(0,0));
 }
 await page.screenshot({path:`${out}/einordnung-${key}.png`});
 await page.close();
}
/* ------------------------------------------------ Marktdetails */
const DETAIL=['QQQ','SPY','DIA','N225','WTI','XAUUSD','BTCUSD','ETHUSD','US10Y','DE10Y','FED_TARGET','ECB_DFR','EURUSD'];
evidence.detail={};
for(const [key,viewport,scheme] of [['390-light',{width:390,height:844},'light'],['320-dark',{width:320,height:700},'dark'],['1440-light',{width:1440,height:900},'light']]){
 const page=await browser.newPage({viewport,colorScheme:scheme});
 const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
 const d=(n,ok,x)=>check(key+' detail: '+n,ok,x);
 for(const sym of (key==='390-light'?DETAIL:['QQQ','BTCUSD','US10Y','FED_TARGET'])){
  await page.goto(base+'/discover/#/maerkte/'+sym,{waitUntil:'networkidle'});
  await page.waitForSelector('.dx-md h1',{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('.dx-md-chart svg')||document.querySelector('.dx-md-chart .dx-md-leer'),null,{timeout:20000}).catch(()=>null);
  const r=await page.evaluate(()=>{const t=s=>{const x=document.querySelector(s);return x?x.textContent.trim():''};
   const svg=document.querySelector('.dx-md-chart svg');
   return {eyebrow:t('.dx-md-eyebrow'),h1:t('.dx-md h1'),wert:t('.dx-md-wert'),ver:t('.dx-md-veraenderung b'),status:t('.dx-md-status'),
    frische:(document.querySelector('.dx-md-frische')||{className:''}).className,tracker:!!document.querySelector('.dx-md-tracker'),trackerText:t('.dx-md-tracker'),
    ranges:[...document.querySelectorAll('.dx-md-tf button')].map(b=>({id:b.dataset.range,disabled:b.disabled,pressed:b.getAttribute('aria-pressed')==='true'})),
    svg:!!svg,dir:svg?svg.getAttribute('data-direction'):null,fuss:t('.dx-md-chart-fuss'),back:(document.querySelector('.dx-md .dx-back')||{}).getAttribute?.('href'),
    assetClass:(document.querySelector('.dx-md')||{dataset:{}}).dataset.assetClass,querlauf:document.documentElement.scrollWidth>innerWidth};});
  evidence.detail[key+':'+sym]=r;
  const rg=Object.fromEntries(r.ranges.map(x=>[x.id,x]));
  d(sym+' Kopf mit Name, Wert, Veraenderung, Stand',r.h1&&r.wert&&r.wert!=='–'&&r.ver&&/Stand|gültig seit/.test(r.status),{h1:r.h1,wert:r.wert,ver:r.ver});
  d(sym+' Chart gezeichnet',r.svg,r.fuss);
  d(sym+' Zeitraeume 1T..MAX, einer gewaehlt',r.ranges.length===7&&r.ranges.filter(x=>x.pressed).length===1&&!rg['1Y'].disabled,r.ranges);
  d(sym+' Zurueck zu Maerkte',r.back==='#/maerkte',r.back);
  d(sym+' kein Querlauf',!r.querlauf,null);
  d(sym+' Live nur beim Tracker mit frischem Tick',!/is-live/.test(r.frische)||r.tracker,r.frische);
  if(['QQQ','SPY','DIA'].includes(sym)){
   d(sym+' Tracker-Kennzeichnung und Offenlegung',r.eyebrow.includes('Tracker · '+sym)&&r.tracker&&/nicht der offizielle Indexstand/.test(r.trackerText),r.eyebrow);
   d(sym+' Tracker nie in Punkten, Chart je Anteil',!/Pkt/.test(r.wert)&&/je Anteil/.test(r.fuss),{wert:r.wert,fuss:r.fuss});
  }
  if(sym==='N225')d('N225 echter Index in Punkten, ohne Tracker',/Pkt\.$/.test(r.wert)&&!r.tracker,r.wert);
  if(['BTCUSD','ETHUSD'].includes(sym))d(sym+' 24/7 statt Boersensitzung',/24\/7/.test(r.status)&&!/Sitzung|Börse/.test(r.status),r.status);
  if(['US10Y','DE10Y'].includes(sym))d(sym+' Rendite in %, bp, neutral, kein 1T',/%$/.test(r.wert)&&/bp$/.test(r.ver)&&r.dir==='neutral'&&rg['1D'].disabled,{wert:r.wert,ver:r.ver,dir:r.dir});
  if(['FED_TARGET','ECB_DFR'].includes(sym))d(sym+' Leitzins als Beschluss, kein 1T',/gültig seit/.test(r.status)&&/%$/.test(r.wert)&&rg['1D'].disabled&&/Beschluss/.test(r.fuss),{status:r.status,fuss:r.fuss});
  if(sym==='WTI')d('WTI Tageswert, kein 1T, kein Live, je Barrel',rg['1D'].disabled&&!/Live/.test(r.status)&&/\/bbl$/.test(r.wert),{wert:r.wert,status:r.status});
  if(sym==='XAUUSD')d('Gold je Feinunze, 5J nur mit Historie',/\/oz$/.test(r.wert)&&/Feinunze/.test(r.fuss),{wert:r.wert,fuss:r.fuss});
  if(sym==='EURUSD')d('EUR/USD als Kurs, nicht umgerechnet',/USD$/.test(r.wert)&&!/€/.test(r.wert),r.wert);
  const eo=await page.evaluate(()=>{const n=document.querySelector('.dx-md-einordnung');return n?{text:n.textContent,rolle:!!n.querySelector('.dx-md-eo-rolle'),spanne:!!n.querySelector('.dx-md-eo-spur')}:null;});
  if(['FED_TARGET','ECB_DFR'].includes(sym))d(sym+' Beschluss ohne Kurskennzahlen',!eo,eo&&eo.text.slice(0,80));
  else d(sym+' Einordnung: Zustand, 52-Wochen-Spanne, Rolle im Marktumfeld',eo&&eo.spanne&&eo.rolle&&/Stand \d{2}\.\d{2}\.\d{4}/.test(eo.text),eo&&eo.text.slice(0,120));
  if(eo&&['US10Y','DE10Y'].includes(sym))d(sym+' Einordnung in bp, ohne Kursrisiko',/bp/.test(eo.text)&&!/Schwankung|52-Wochen-Hoch/.test(eo.text),eo.text.slice(0,160));
  if(eo&&['QQQ','SPY','DIA'].includes(sym))d(sym+' Einordnung: Trend, Abstand zum Hoch, Rolle als Markt-Tracker',/Trend/.test(eo.text)&&/Abstand zum 52-Wochen-Hoch/.test(eo.text)&&/Markt-Tracker/.test(eo.text)&&!/Pkt|Punkte/.test(eo.text),eo.text.slice(0,160));
  if(eo&&sym==='BTCUSD')d('BTC Schwankung mit 24/7-Kalender (365 Tage)',/365/.test(eo.text),null);
  if(key==='390-light'&&['QQQ','BTCUSD','US10Y'].includes(sym))await page.screenshot({path:`${out}/detail-${sym}-${key}.png`,fullPage:true});
 }
 d('keine Seitenfehler',pageErrors.length===0,pageErrors);
 await page.close();
}
/* Barrierefreiheit (axe, wenn installiert): keine kritischen/ernsten Verstoesse. */
{
 let axePath=null;try{axePath=require.resolve('axe-core/axe.min.js');}catch{}
 if(axePath){
  for(const [route,scheme] of [['#/maerkte','light'],['#/maerkte','dark'],['#/maerkte/einordnung','light'],['#/maerkte/einordnung','dark'],['#/maerkte/einordnung/details','light'],['#/maerkte/einordnung/details','dark'],['#/maerkte/QQQ','light'],['#/maerkte/US10Y','dark']]){
   /* Je Route eine frische Seite mit festem Farbschema: kein Themenwechsel
      (und keine Farbuebergaenge) waehrend der Messung. */
   const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:scheme,reducedMotion:'reduce'});
   await page.goto(base+'/discover/'+route,{waitUntil:'networkidle'});await page.waitForSelector(route==='#/maerkte'?'.dx-markt-karte':route==='#/maerkte/einordnung'?'#bm-heute':route==='#/maerkte/einordnung/details'?'.dx-m3-hero':'.dx-md h1');
   await page.waitForTimeout(400);
   await page.addScriptTag({path:axePath});
   const v=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa']}}).then(r=>r.violations.filter(x=>['critical','serious'].includes(x.impact)).map(x=>({id:x.id,nodes:x.nodes.slice(0,3).map(n=>n.target)}))));
   check('Barrierefreiheit '+route+' ('+scheme+'): keine kritischen/ernsten Verstoesse',v.length===0,v);
   await page.close();
  }
 } else check('Barrierefreiheit: axe-core verfuegbar',process.env.CI!=='true',"axe-core nicht installiert");
}
/* Navigation: Karte -> Detail, Reload auf der Detailroute, Zurueck. */
{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base+'/discover/#/maerkte',{waitUntil:'networkidle'});await page.waitForSelector('a.dx-markt-karte');
 await page.click('a.dx-markt-karte[data-instrument="BTCUSD"]');await page.waitForSelector('.dx-md h1');
 check('Navigation: Karte oeffnet Marktdetail',(await page.evaluate(()=>location.hash))==='#/maerkte/BTCUSD',null);
 await page.reload({waitUntil:'networkidle'});await page.waitForSelector('.dx-md h1');
 check('Navigation: Reload auf Detailroute',(await page.textContent('.dx-md h1')).trim()==='Bitcoin',null);
 await page.goBack({waitUntil:'networkidle'});await page.waitForSelector('.dx-maerkte',{timeout:15000}).catch(()=>null);
 check('Navigation: Browser-Zurueck fuehrt zur Uebersicht',(await page.evaluate(()=>location.hash))==='#/maerkte',null);
 await page.waitForSelector('a.dx-m3-st-link');await page.click('a.dx-m3-st-link');await page.waitForSelector('#bm-heute');
 check('Navigation: Marktbarometer oeffnet die 2-Minuten-Erklaerung',(await page.evaluate(()=>location.hash))==='#/maerkte/einordnung',null);
 await page.click('a.bm-mehr');await page.waitForSelector('.dx-m3-hero');
 check('Navigation: von dort zu allen Details',(await page.evaluate(()=>location.hash))==='#/maerkte/einordnung/details',null);
 await page.click('.dx-mk-einordnung>.dx-back');await page.waitForSelector('#bm-heute');
 check('Navigation: aus den Details zurueck zum Marktbarometer',(await page.evaluate(()=>location.hash))==='#/maerkte/einordnung',null);
 await page.click('.dx-bm>.dx-back');await page.waitForSelector('#maerkte-stimmung');
 check('Navigation: aus dem Marktbarometer zurueck zu den Maerkten',(await page.evaluate(()=>location.hash))==='#/maerkte',null);
 await page.close();
}
/* Realtime der Tracker (Markets 3.0, 58.15) - nur mit --realtime gegen die
   veroeffentlichte Seite: der VU-Live-Worker nimmt nur echte Vision-Universe-
   Urspruenge an, ein lokaler Server bekaeme nie einen Strom. Bei offener
   US-Sitzung wird je Tracker beobachtet, ob frische Ticks ankommen und ob
   "Markt geöffnet · Live" genau dann steht; bei geschlossener Sitzung ist das
   Ergebnis ehrlich MARKET_CLOSED_NOT_PROVEN, kein PASS. */
if(process.argv.includes('--realtime')){
 const bericht=[];
 for(const sym of ['QQQ','SPY','DIA']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(base+'/discover/#/maerkte/'+sym,{waitUntil:'networkidle'});await page.waitForSelector('.dx-md h1');
  const status=(await page.textContent('.dx-md-status'))||'';
  const r={symbol:sym,sitzungOffen:/Handel läuft/.test(status),status:status.trim().slice(0,120),beobachtet:0,ticks:0,stream:null,liveGesehen:false,liveOhneTick:false,werte:[]};
  if(r.sitzungOffen){
   const t0=Date.now();
   while(Date.now()-t0<45000){
    const s=await page.evaluate(()=>{const H=window.VUDiscover&&window.VUDiscover.LiveHub;
     const st=H&&H.liveState?H.liveState():{};const f=document.querySelector('.dx-md-frische');
     return {state:st.state||null,ticks:H&&H.liveStats?(H.liveStats().ticks||0):0,live:!!(f&&/is-live/.test(f.className)),text:f?f.textContent.trim():'',
             wert:(document.querySelector('.dx-md-wert')||{}).textContent||''};});
    r.beobachtet++;r.stream=s.state;r.ticks=s.ticks;
    if(s.live){r.liveGesehen=true;if(!(s.ticks>0))r.liveOhneTick=true;if(!/Markt geöffnet · Live/.test(s.text))r.liveOhneTick=true;}
    if(s.wert&&r.werte[r.werte.length-1]!==s.wert)r.werte.push(s.wert);
    if(r.liveGesehen&&r.werte.length>=2)break;
    await page.waitForTimeout(1500);
   }
  }
  bericht.push(r);evidence['realtime:'+sym]=r;
  await page.close();
 }
 const offen=bericht.filter(r=>r.sitzungOffen);
 let urteil;
 if(!offen.length)urteil='MARKET_CLOSED_NOT_PROVEN';
 else{
  const mitLive=offen.filter(r=>r.liveGesehen&&r.ticks>0);
  check('Tracker-Realtime: bei offener Sitzung zeigen mindestens 2 von 3 Trackern "Markt geöffnet · Live" mit frischen Ticks',mitLive.length>=2,bericht.map(r=>({s:r.symbol,stream:r.stream,ticks:r.ticks,live:r.liveGesehen})));
  check('Tracker-Realtime: "Live" nie ohne frischen Tick',offen.every(r=>!r.liveOhneTick),bericht.map(r=>({s:r.symbol,liveOhneTick:r.liveOhneTick})));
  urteil=mitLive.length>=2&&offen.every(r=>!r.liveOhneTick)?'PASS':'FAIL';
 }
 evidence.realtimeTracker=urteil;
 console.log('REALTIME_TRACKER: '+urteil+' '+JSON.stringify(bericht.map(r=>({symbol:r.symbol,sitzungOffen:r.sitzungOffen,stream:r.stream,ticks:r.ticks,live:r.liveGesehen,werte:r.werte.slice(0,4)}))));
}
await browser.close();

const failed=checks.filter(c=>!c.pass);
const report={schemaVersion:'vu-discover-maerkte-qa-1.2.0',checkedAt:new Date().toISOString(),against:base,engine,
 result:failed.length?'FAIL':'PASS',checks:checks.length,failed:failed.length,failures:failed,evidence};
await writeFile(`${out}/maerkte-qa-${engine}.json`,JSON.stringify(report,null,1));
for(const c of checks)console.log((c.pass?'PASS ':'FAIL ')+c.name+(c.pass?'':' -> '+JSON.stringify(c.detail)));
console.log(`\nMaerkte-QA (${engine}) gegen ${base}: ${report.result} (${checks.length-failed.length}/${checks.length})`);
for(const k of evidence.mobile.gruppen)console.log(`  ${k.titel}: `+k.karten.map(x=>`${x.symbol} ${x.wert||'-'} ${x.veraenderung||''}`).join(' | '));
process.exit(failed.length?1:0);
