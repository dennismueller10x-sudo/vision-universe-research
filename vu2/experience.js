(function(){
'use strict';
const S=QuantShell,el=S.el,api=VUProductServices.create({loadJSON:S.loadJSON,displayPolicy:VUDisplayPolicy,queryEngine:VUQuery});
/* O-12: Waehrungsdarstellung kommt aus dem zentralen Contract, nicht aus
   dieser Datei. Der Rueckfall bleibt stehen - eine zentrale
   Formatierung, die eine Seite leer laesst, waere schlechter als die
   verteilte, die sie ersetzt.

   Umgerechnet wird hier NICHT: diese Seite zeigt Originalwaehrung und
   sagt das auch. Sie konsumiert die Formatierung, nicht die Engine. */
const vuFormat=(fn,value,unit,opts)=>{
 const X=(typeof VUFx!=='undefined')?VUFx:null,F=X&&X.Format,R=X&&X.Registry;
 if(!F||typeof F[fn]!=='function')return null;
 /* Ob eine Einheit eine Waehrung ist, weiss die Registry - nicht diese
    Datei. Ein Vergleich gegen 'USD' waere genau die verteilte Kenntnis,
    die O-6 abbauen soll, und er wuerde ein kuenftiges unit:'EUR' still
    falsch darstellen. */
 if(R&&typeof R.isKnown==='function'&&!R.isKnown(unit))return null;
 return F[fn](value,unit,opts);
};
const params=new URLSearchParams(location.search);
/* Sprechende Zweitnamen für die fünf Bereiche. Sie zeigen auf dieselben
   Ansichten - ein neuer Name darf keine Route spalten. */
const VIEW_ALIAS={methodik:'explain',methodology:'explain',aktien:'stocks',strategien:'strategies'};
const view=VIEW_ALIAS[params.get('view')]||params.get('view')||'home';
const href=(v,t)=>'/vu2/?view='+v+(t?'&ticker='+encodeURIComponent(t):'');
const link=(label,url,cls)=>el('a',{text:label,href:url,class:cls});
const n=(m,d=1)=>m&&Number.isFinite(m.value)?(vuFormat('formatPrice',m.value,m.unit,{numberLocale:'de-DE',decimals:d})||m.value.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d})+(m.unit==='percent'?' %':m.unit==='USD'?' $':'')):m&&typeof m.value==='string'?m.value.replaceAll('_',' '):'Nicht verfügbar';
const formatFactor=m=>!Number.isFinite(m.value)?'Nicht verfügbar':m.value.toLocaleString('de-DE',{maximumFractionDigits:2})+(m.metricId==='marginExpansion'?' Prozentpunkte':m.unit==='pct'?' %':m.unit==='x'?' ×':'');
/* =========================================================================
   DIE QUANT-INTERNE NAVIGATION — FÜNF BEREICHE, SONST NICHTS.

   Vision Universe ist die Übermarke, Quant ein eigenständiges Produkt darin.
   Discover, Research, Markets und Portfolio sind andere Produkte oder
   andere Ziele; sie bleiben erreichbar (siehe Capability Map in
   docs/VU_QUANT_2_FRONTEND_TRANSFORMATION.md), aber sie stehen nicht in
   dieser Leiste. Ein Produkt, dessen Hauptnavigation vier fremde Produkte
   anbietet, erklärt sich selbst nicht.

   Die Ansicht heisst weiter `explain` - eine Route umzubenennen bricht
   bestehende Verweise, ohne dass ein Nutzer etwas davon hätte. `methodik`
   ist als sprechender Zweitname zugelassen (siehe viewAlias).
   ========================================================================= */
const nav=[['home','Home'],['screener','Screener'],['strategies','Strategien'],['stocks','Aktien'],['explain','Methodik']];
/* Strichzeichnungen statt Bildern: sie erben die Farbe des aktiven Zustands
   und kosten keine zusätzliche Anfrage. */
const NAV_ICON={
 home:'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
 screener:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
 strategies:'M4 20V11M10 20V5M16 20v-7M22 20H2',
 stocks:'M4 7h16M4 12h16M4 17h10',
 explain:'M12 3 4 6.2v5.3c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5V6.2L12 3Zm-3 8.6 2.2 2.2L15.4 10'
};
function navIcon(id){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const p=document.createElementNS('http://www.w3.org/2000/svg','path');
 p.setAttribute('d',NAV_ICON[id]||NAV_ICON.stocks);svg.append(p);return svg;
}
const groups=[
 ['Aktien & Analyse','Vom Unternehmen bis zur Kursstruktur.',[
 ['Aktien',href('stocks')],['Charts','/quant/stock/?ticker=NVDA'],['Fundamentals & Historie',href('fundamentals','NVDA')],['SEC Dateninspektor','/quant/data-inspector/'],['Was ist Quant?',href('explain')],['Kursstruktur',href('technical','NVDA')],['Elliott Wave',href('elliott','NVDA')],['Quant',href('quant','NVDA')],['Vergleichen',href('compare')]]],
 ['Märkte & Ideen','Zusammenhänge verstehen und Titel finden.',[
 ['Discover · Marktwelten','/discover/'],['Vordefinierte Screens',href('discover')],['Quant Screener',href('screener')],['Quant Screener (klassisch)','/quant/screener/'],['Rankings','/quant/ranking/'],['ETF Research & Vergleich','/etf/'],['Macro Intelligence','/macro/'],['Hedge Funds & Ownership','/hedgefonds/'],['Analyst Ratings','/analysten/']]],
 ['Research & Wissen','Aktuelles einordnen. Tiefer verstehen.',[
 ['News','/news/'],['Morning Briefing','/morning/'],['Weekly Magazine','/magazin/'],['Stock Reports','/reports/xpeng/'],['Academy','/academy/'],['Investment Guide','/guide/'],['Strategies',href('strategies')],['Radar',href('radar')],['Signals',href('signals')],['Watchlist',href('watchlist')],['Ask Atlas',href('atlas')]]]
];
const app=document.getElementById('app');
/* Welcher der fünf Bereiche ist gerade offen? Die Einzelanalyse gehört zu
   AKTIEN, die Faktor- und Kursarbeitsflächen ebenso: ein Nutzer, der von
   der Aktienliste in die Analyse geht, soll nicht sehen, wie die Marke
   unter ihm wegspringt. */
const SECTION_OF={stock:'stocks',quant:'stocks',fundamentals:'stocks',technical:'stocks',elliott:'stocks',
 compare:'stocks',watchlist:'stocks',signals:'stocks',radar:'screener',atlas:'explain'};
const activeSection=SECTION_OF[view]||view;
function navLink(id,label,withIcon){
 const a=link(label,href(id),id===activeSection?'active':'');
 if(id===activeSection)a.setAttribute('aria-current',id===view?'page':'location');
 if(withIcon)a.prepend(navIcon(id));
 return a;
}
/* Die Wortmarke aus den Mockups: Übermarke klein darüber, Produktname gross
   in Quant-Grün, darunter ein Satz, der sagt, wo man ist. */
const CLAIM={home:'Transparenz zuerst.',screener:'Chancen finden.',strategies:'Strategien verstehen.',
 stocks:'Finden. Verstehen. Handeln.',explain:'Keine Blackbox.'};
function brandBlock(){
 const a=el('a',{href:href('home'),class:'q-brand','aria-label':'Vision Universe Quant · Startseite'},[
  /* KEIN ZWEITES "VISION UNIVERSE".
     Seit das Produkt den gemeinsamen Plattform-Kopf traegt (<vu-navigation>,
     wie Discover und die uebrigen 44 Seiten), steht die Marke dort - als
     Logo, ganz oben. Eine Zeile mit denselben Worten 100 px darunter war
     dieselbe Doppelung wie "Chancen finden." und "Strategien verstehen."
     zuvor: gemessen im ersten Bildschirm, und dort zaehlt jede Zeile.

     Der Produktname BLEIBT: der Bereichsname im gemeinsamen Kopf ist unter
     1120 px ausgeblendet, auf dem Smartphone saehe man sonst nicht mehr,
     in welchem Produkt man ist. */
  el('span',{class:'q-word',text:'Quant'}),
  el('span',{class:'q-claim',text:CLAIM[activeSection]||CLAIM.home})]);
 return a;
}
const header=el('header',{class:'top'},[brandBlock(),
 el('nav',{class:'nav','aria-label':'Quant-Navigation'},nav.map(([id,label])=>navLink(id,label))),
 el('div',{class:'utility'},[link('Watchlist',href('watchlist')),el('button',{text:'Suche',onclick:()=>openSearch()})])]);
const main=el('main',{id:'content',tabindex:'-1'});
app.append(header,main,el('nav',{class:'q-bottom','aria-label':'Quant-Navigation'},
 nav.map(([id,label])=>navLink(id,label,true))));
const dialog=el('dialog',{'aria-label':'Unternehmen und Workspaces suchen'});app.append(dialog);
dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=[...dialog.querySelectorAll('input,button,a[href]')].filter(n=>!n.disabled&&!n.hidden),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
let universe;
function heading(title,description){return el('div',{class:'intro'},[el('div',{},[el('span',{class:'eyebrow',text:'Vision Universe® · Preview'}),el('h1',{text:title}),description?el('p',{class:'muted',text:description}):null])]);}

/* =========================================================================
   BAUSTEINE DER NEUEN OBERFLÄCHE

   Sie sind bewusst klein und ohne eigenes Wissen über Daten: eine Karte
   weiss nicht, was ein Faktor ist. Jede inhaltliche Entscheidung bleibt
   bei der Seite, die den Baustein füllt, und jede Zahl bleibt bei dem
   Dienst, der sie liefert.
   ========================================================================= */
const ICONS={
 chart:'M4 20V10M10 20V4M16 20v-8M20 20H3',
 search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4.2-4.2',
 star:'m12 3.6 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.6Z',
 trend:'M3 17 9.5 10.5l3.5 3.5L21 6M21 6h-5M21 6v5',
 layers:'M12 3 3 7.5 12 12l9-4.5L12 3ZM3 12.5 12 17l9-4.5M3 17 12 21.5 21 17',
 shield:'M12 3 4 6.2v5.3c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5V6.2L12 3Z',
 doc:'M6 3h8l4 4v14H6V3Zm8 0v4h4M9 12h6M9 16h6',
 clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 3.8V12l3 1.8',
 people:'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Zm-6 8.5c0-3 2.7-4.7 6-4.7s6 1.7 6 4.7M17 11.2a2.6 2.6 0 1 0 0-5.2M18 15c2 .5 3.4 1.9 3.4 4',
 bulb:'M9.2 18h5.6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5.9 1.1.9 1.8v.4h5.4v-.4c0-.7.3-1.3.9-1.8A6 6 0 0 0 12 3Z',
 scale:'M12 4v16M6 8h12M4 8l-2 5h4l-2-5Zm16 0-2 5h4l-2-5ZM8 20h8',
 target:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z',
 warn:'M12 4 2.5 20h19L12 4Zm0 5.5v5m0 3v.1',
 filter:'M4 6h16M7 12h10M10 18h4',
 compass:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.5 4.5-2 5-5 2 2-5 5-2Z'
};
function glyph(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
 const p=document.createElementNS('http://www.w3.org/2000/svg','path');
 p.setAttribute('d',ICONS[name]||ICONS.doc);svg.append(p);return svg;
}
/* Die Bühne oben auf jedem Bereich: Nutzenversprechen statt Modellname. */
function stage(title,lead,sub,note){
 const box=el('section',{class:'q-stage'},[el('h1',{text:title}),el('p',{class:'q-lead',text:lead})]);
 if(sub)box.append(el('p',{class:'q-sub',text:sub}));
 if(note)box.append(el('p',{class:'q-stage-note',text:note}));
 return box;
}
function card(title,intro,body,more){
 const head=el('div',{class:'q-card-head'},[el('h2',{text:title})]);
 if(more)head.append(link(more[0],more[1],'q-more'));
 const box=el('section',{class:'q-card'},[head]);
 if(intro)box.append(el('p',{class:'q-card-intro',text:intro}));
 for(const part of [].concat(body||[]))if(part)box.append(part);
 return box;
}
function tile(icon,title,text,url){
 const inner=[el('span',{class:'q-ico'},[glyph(icon)]),el('h3',{text:title}),el('p',{text})];
 return url?el('a',{class:'q-tile',href:url},inner):el('div',{class:'q-tile'},inner);
}
function tiles(count,items){return el('div',{class:'q-tiles q-tiles-'+count},items);}
function steps(items){
 return el('div',{class:'q-steps'},items.map((it,i)=>el('div',{class:'q-step'},[
  el('span',{class:'q-step-n',text:'Schritt '+(i+1)}),el('h3',{text:it[0]}),el('p',{text:it[1]})])));
}
function stateMark(kind,text){return el('span',{class:'q-state q-state-'+kind,text});}

/* ===================================================================
   EINSTEIGER ZUERST, TIEFE EINE EBENE DARUNTER.

   Gemessen am 28.09.2026 bei 390 px verlangten sechs Ansichten 4.933
   Woerter und 436 Klickziele - die Strategien-Seite allein 192. Das ist
   keine Oberflaeche fuer jemanden, der 25 Euro im Monat spart.

   `mehr` ist die Antwort darauf, und zwar ausdruecklich NICHT durch
   Loeschen: der Inhalt bleibt vollstaendig, er liegt nur zu. Gebaut wird
   er erst beim Aufklappen - so kostet die Tiefe, die niemand oeffnet,
   auch keine Ladezeit und keine Wortzahl auf dem ersten Bildschirm.

   <details> statt eigener Logik, weil es Tastatur, Screenreader und
   Browser-Suche ohne Zutun richtig macht. */
function mehr(titel,bauen,offen){
 const box=el('details',{class:'q-mehr'});
 if(offen)box.setAttribute('open','');
 box.append(el('summary',{text:titel}));
 let gebaut=false;
 const fuellen=()=>{if(gebaut)return;gebaut=true;
  for(const teil of [].concat(bauen()||[]))if(teil)box.append(teil);};
 if(offen)fuellen();else box.addEventListener('toggle',()=>{if(box.open)fuellen();},{once:false});
 return box;
}

/* Die Klartext-Antwort: eine Stufe, eine Zaehlzeile, bis zu vier Gruende.
   Keine Gesamtnote - warum nicht, steht in plain-verdict.js. */
function verdictBlock(urteil,opts){
 opts=opts||{};
 if(!urteil)return null;
 const box=el('section',{class:'q-verdict q-verdict-'+urteil.ton});
 box.append(el('p',{class:'q-verdict-stufe',text:urteil.stufe}));
 box.append(el('p',{class:'q-verdict-zaehl',text:urteil.zaehlsatz}));
 if(urteil.gruende.length)box.append(el('ul',{class:'q-verdict-gruende'},
  urteil.gruende.map(g=>el('li',{class:'g-'+g.art},[
   el('span',{class:'g-mark','aria-hidden':'true',text:g.art==='plus'?'+':g.art==='minus'?'−':'·'}),
   el('span',{text:g.text})]))));
 /* Eine Luecke ist eine Aussage, kein Schoenheitsfehler - sie steht
    deshalb im Block und nicht im Kleingedruckten darunter. */
 if(urteil.luecketext)box.append(el('p',{class:'q-verdict-luecke',text:urteil.luecketext+' – die Daten dafür erfüllen die Methodik nicht.'}));
 if(opts.hinweis)box.append(el('p',{class:'q-verdict-hinweis',text:opts.hinweis}));
 return box;
}
/* Die Belegtreppe: Bedeutung steht oben offen, alles darunter ist
   aufklappbar. Ein Nutzer, der nur das Ergebnis will, sieht kein Fachwort;
   einer, der es prüfen will, kommt bis zur Methodik. */
function ladder(levels){
 const box=el('div',{class:'q-ladder'});
 for(const [label,parts] of levels){
  if(!parts||!parts.length)continue;
  const body=el('div',{class:'q-ladder-body'});
  for(const p of parts)if(p)body.append(typeof p==='string'?el('p',{text:p}):p);
  box.append(el('details',{},[el('summary',{text:label}),body]));
 }
 return box.children.length?box:null;
}
/* Ein Faktor mit Balken. `share` ist 0..1 oder null - null heisst
   ausdruecklich "nicht bewertbar" und bekommt eine gestreifte Spur statt
   eines Balkens der Laenge null, den man als "schlecht" lesen wuerde. */
function factorBar(name,note,valueText,share,negative){
 const row=el('div',{class:'q-factor'},[
  el('div',{class:'q-factor-name',text:name},note?[el('span',{text:note})]:[]),
  el('div',{class:'q-factor-val',text:valueText})]);
 const bar=el('div',{class:'q-bar'+(share===null||share===undefined?' is-none':negative?' is-neg':'')});
 if(share!==null&&share!==undefined)bar.append(el('i',{style:'width:'+Math.max(2,Math.min(100,share*100)).toFixed(1)+'%'}));
 row.append(bar);return row;
}
/* Die rechte Spalte traegt normalerweise eine Zahl - rechtsbuendig, mit
   Ziffern gleicher Breite, damit Zeilen untereinander vergleichbar sind.
   Mit `ton` traegt sie stattdessen ein Urteil in Worten, als Marke: dann
   gelten Umbruch und Farbe des Tons statt Zahlensatz. Die vier anderen
   Aufrufer reichen weiter Zahlen und bleiben unberuehrt. */
const TON_KLASSE={gut:'pos',schwach:'neg',neutral:'neutral'};
function hitRow(ticker,name,why,numText,numNote,ton){
 const klasse=ton&&TON_KLASSE[ton];
 return el('a',{class:'q-hit'+(klasse?' q-hit-urteil':''),href:href('stock',ticker)},[
  el('div',{class:'q-hit-id'},[el('strong',{text:ticker}),el('span',{text:name||''})]),
  el('p',{class:'q-hit-why',text:why||''}),
  el('div',{class:'q-hit-num'},[
   klasse?el('span',{class:'q-state q-state-'+klasse,text:numText||''})
         :el('strong',{text:numText||''}),
   numNote?el('span',{text:numNote}):null])]);
}
function notice(title,text){return el('div',{class:'notice'},[el('h3',{text:title}),el('p',{class:'muted',text})]);}
/* EIN KUERZEL ZWEIMAL IST KEINE ZEILE.
 *
 * Gemessen am 26.09.2026: 1.102 von 6.875 Zeilen schrieben ihren Ticker in
 * beide Spalten ("AAAC | AAAC"), weil der Stamm keinen Namen kannte. Der Name
 * lag veroeffentlicht vor (company-names-1.0.0), und seit M41 tragen 6.857
 * Zeilen ihn. Fuer die restlichen 18 gibt der Anbieter nachweislich keinen
 * Namen her (PROVIDER_HAS_NO_NAME, erneuter Versuch ab 2026-10-14) - dann
 * steht das da und nicht das Kuerzel ein zweites Mal. */
const zeilenName=(s)=>(s.name&&s.name!==s.ticker)?s.name:'Firmenname nicht veröffentlicht';
function stockRows(stocks,metricKey='momentum6m',metricLabel='6 Monate',showAsOf=false){return el('div',{},[el('div',{class:'row eyebrow'},[el('span',{text:'Unternehmen'}),el('span',{class:'number',text:'Schlusskurs'}),el('span',{class:'number',text:metricLabel})]),...stocks.map(s=>el('a',{class:'row',href:href('stock',s.ticker)},[el('div',{},[el('strong',{text:s.ticker}),el('span',{class:'muted',text:zeilenName(s)}),showAsOf?el('span',{class:'muted row-asof'},[el('span',{text:'Kursstand '}),el('time',{datetime:s.asOf,text:s.asOf||'nicht verfügbar'})]):null]),el('div',{class:'number',text:n(s.price,2)}),el('div',{class:'number '+(Number.isFinite(s[metricKey]?.value)&&s[metricKey].unit==='percent'?(s[metricKey].value>=0?'positive':'negative'):''),text:n(s[metricKey])})]))]);}
function freshness(data,ticker){const root=el('div',{'aria-live':'polite'});function draw(data){const stale=data?.members?.filter(m=>m.state==='STALE').length||0,unknown=data?.members?.filter(m=>!['AVAILABLE','STALE'].includes(m.state)).length||0;let text;if(!data||data.state==='UNAVAILABLE')text='Aktualität des Tagesstands derzeit nicht bestätigt.';else if(data.state==='PIPELINE_ERROR')text='Der Tagesstand benötigt eine Datenprüfung.';else if(stale)text=stale+' '+(stale===1?'Kursstand liegt':'Kursstände liegen')+' vor der letzten abgeschlossenen Börsensitzung ('+data.expectedThrough+'). Neuere Tagesdaten fehlen in dieser Ansicht.'+(unknown?' Weitere '+unknown+' Kursstände sind nicht prüfbar.':'');else text='Tagesdaten reichen bis zur letzten abgeschlossenen Börsensitzung ('+data.expectedThrough+'). Keine Echtzeit- oder Endgültigkeitsbestätigung.';if(root.firstElementChild?.textContent===text)return;S.mount(root,el('p',{class:'market-freshness '+(stale?'freshness-warning':'muted'),text}));}draw(data);let loading=false;const timer=setInterval(async()=>{if(document.hidden||loading)return;loading=true;try{draw(await api.getMarketDataHealth(ticker));}catch{draw(null);}finally{loading=false;}},60000);addEventListener('pagehide',()=>clearInterval(timer),{once:true});return root;}
/* Gemessen an ACAA: dieser Block zeigte drei Zeilen "Nicht verfuegbar"
   untereinander - dieselbe leere Flaeche, die die Verdichtung abschafft,
   nur an einer Stelle, die keine Station ist. `nurVorhandene` laesst die
   leeren Zeilen weg; ihre Ursache steht gruppiert weiter unten. Ohne die
   Option bleibt alles wie es war, denn bei einem datenreichen Titel ist
   eine einzelne fehlende Kennzahl eine Information. */
function evidence(s,nurVorhandene){const zeilen=[['Umsatzwachstum',s.revenueGrowth],['Operative Marge',s.operatingMargin],['Kursentwicklung · 6M',s.momentum6m]].filter(([,m])=>!nurVorhandene||Number.isFinite(m&&m.value));if(!zeilen.length)return null;return el('div',{class:'evidence'},zeilen.map(([label,m])=>el('div',{},[el('span',{class:'muted',text:label}),el('strong',{text:n(m)})])));}
function actions(items){return el('div',{class:'actions'},items.map((a,i)=>link(a.label,a.href,'button'+(i?' secondary':''))));}
function openSearch(){if(dialog.open){dialog.querySelector('input').focus();return;}S.clear(dialog);const input=el('input',{class:'search',placeholder:'Unternehmen, Ticker oder Workspace','aria-label':'Suche'});const results=el('div',{class:'search-results links'}),status=el('p',{class:'search-status muted',role:'status','aria-live':'polite','aria-atomic':'true'});
 let request=0;
 async function update(){const current=++request,q=input.value.trim(),workspaceMatches=groups.flatMap(g=>g[2].map(([label,href])=>({label,href}))).filter(x=>x.label.toLowerCase().includes(q.toLowerCase())).slice(0,9);
  S.clear(results);results.append(...workspaceMatches.map(x=>link(x.label,x.href)));status.textContent=q?'Unternehmen werden gesucht …':'Workspaces direkt öffnen oder nach einem Unternehmen suchen.';
  if(!q)return;
  const response=await api.searchInstruments(q,{limit:12});if(current!==request||!dialog.open)return;
  S.clear(results);const stocks=response.entries||[];results.append(...stocks.map(s=>link(s.ticker+' · '+s.name,href('stock',s.ticker))),...workspaceMatches.map(x=>link(x.label,x.href)));
  status.textContent=response.state!=='AVAILABLE'?'Unternehmenssuche derzeit nicht verfügbar. Versuche es erneut.':stocks.length?stocks.length+' Unternehmen gefunden'+(response.limited?' · Auswahl begrenzt; Suche präzisieren.':'.')+' Datenverfügbarkeit wird auf der Aktienseite angezeigt.':workspaceMatches.length?'Passende Workspaces. Keine passenden Unternehmen gefunden.':'Keine passenden Unternehmen oder Workspaces gefunden.';
 }
 input.addEventListener('input',update);dialog.append(el('h2',{text:'Was möchtest du untersuchen?'}),input,status,results,el('button',{class:'button secondary',text:'Schließen',onclick:()=>dialog.close()}));update();dialog.showModal();input.focus();}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();openSearch();}});
async function liveStockSection(ticker){
 const root=el('section',{class:'section','aria-label':'Intraday und Live'}),status=el('p',{class:'muted',role:'status'}),plot=el('div'),quote=el('p',{class:'number'}),button=el('button',{class:'button secondary',text:'Live-Verbindung starten'});
 root.append(el('h2',{text:'Im Handelsverlauf'}),status,plot,quote,button);main.append(root);
 const [snapshot,capability]=await Promise.all([api.getIntraday(ticker),api.getRealtimeCapability(ticker)]);
 const axisTime=value=>String(value).slice(11,19)||String(value);
 if(snapshot.state==='INTRADAY_AVAILABLE'){
  plot.append(QuantCharts.lineChart({title:ticker+' · veröffentlichter Intraday-Verlauf',width:Math.min(900,innerWidth-40),height:240,dates:snapshot.points.map(p=>p[0]),series:[{values:snapshot.points.map(p=>p[1])}],xFormat:v=>v,yFormat:v=>v.toLocaleString('de-DE',{notation:'compact',maximumFractionDigits:1})}));
  root.append(el('p',{class:'muted',text:'Veröffentlichter Snapshot · Sitzung '+snapshot.sessionDate+' · Stand '+snapshot.asOf+'. Kursart nicht spezifiziert; keine Trade- oder Echtzeitbestätigung.'}));
 }else plot.append(notice('Tagesverlauf nicht verfügbar','Für diesen Titel liegt derzeit kein validierter Intraday-Snapshot vor. Die Kurshistorie bleibt unabhängig verfügbar.'));
 const livePlot=el('div');root.append(livePlot,el('p',{class:'muted',text:'Live wird nur auf Wunsch verbunden. Nur bestätigte Trades verändern den beobachteten Live-Verlauf; Quotes und untypisierte Ereignisse nicht. Die Ansicht zeigt empfangene Updates, kein vollständiges Handelsband. Historische Schlusskurse bleiben unverändert.'}));
 let disposed=false,sessionBusy=false,session,client;
 function show(model){
  const labels={NOT_CONNECTED:'Live-Verbindung beendet. Veröffentlichten Snapshot weiter verwenden.',CONNECTING:'Live-Verbindung wird aufgebaut.',WAITING_FOR_TRADE:'Verbunden · wartet auf einen bestätigten Trade.',LIVE:'Bestätigtes Trade-Update empfangen.',STALE:'Kein frischer bestätigter Trade · letzter beobachteter Stand.',UNAVAILABLE:'Live-Verbindung derzeit nicht verfügbar.'};
  status.textContent=labels[model.state]||labels.UNAVAILABLE;button.textContent=['CONNECTING','WAITING_FOR_TRADE','LIVE','STALE'].includes(model.state)?'Live-Verbindung beenden':'Live-Verbindung starten';
  if(model.reason)status.textContent+=' '+({HIDDEN:'Bei verborgenem Tab pausiert.',SESSION_CLOSED:'Außerhalb des regulären Handels.',BUDGET_LIMIT:'Relay-Kontingent erreicht.',CONNECTION_ERROR:'Verbindung fehlgeschlagen; erneuter Start ist möglich.',CONNECTION_CLOSED:'Verbindung unterbrochen; erneuter Start ist möglich.'}[model.reason]||'');
  quote.textContent=model.last?'Zuletzt beobachtet: '+model.last.price.toLocaleString('de-DE',{maximumFractionDigits:4})+' · '+new Date(model.last.timestamp).toISOString()+' (UTC)':'';
  S.clear(livePlot);if(model.points.length>1)livePlot.append(QuantCharts.lineChart({title:ticker+' · bestätigte Trades seit Verbindungsstart',width:Math.min(900,innerWidth-40),height:200,dates:model.points.map(p=>new Date(p.timestamp).toISOString()),series:[{values:model.points.map(p=>p.price)}],xFormat:axisTime,yFormat:v=>v.toLocaleString('de-DE',{notation:'compact',maximumFractionDigits:1})}));
 }
 if(capability.state==='AVAILABLE'&&typeof WebSocket==='function')client=VULiveRelayClient.create({capability,connect:url=>new WebSocket(url),onChange:show});
 async function checkSession(){if(disposed||sessionBusy)return;sessionBusy=true;try{session=await api.getMarketSession();if(disposed)return;button.disabled=!client||session.state!=='AVAILABLE'||session.phase!=='REGULAR';if(button.disabled){if(client?.snapshot().state!=='NOT_CONNECTED')client?.stop('SESSION_CLOSED');status.textContent=!client?'Live-Verbindung für diesen Titel derzeit nicht verfügbar.':session.state==='AVAILABLE'?session.label+' · Live ist nur im regulären Handel verfügbar.':'Handelsphase nicht bestätigt · Live bleibt pausiert.';}else if(client.snapshot().state==='NOT_CONNECTED')status.textContent='Regulärer Handel · Live auf Wunsch verbinden.';}finally{sessionBusy=false;}}
 button.onclick=async()=>{if(!client)return;if(client.snapshot().state!=='NOT_CONNECTED'){client.stop();return;}await checkSession();if(!disposed&&!document.hidden&&!button.disabled)client.start();};
 const hide=()=>{if(document.hidden)client?.stop('HIDDEN');};document.addEventListener('visibilitychange',hide);
 const timer=setInterval(checkSession,30000);addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',hide);client?.stop('PAGE_HIDDEN');},{once:true});
 await checkSession();
}
/* Die Aktienseite zeigt denselben Zustand wie die Quant-Seite, aus
   derselben veroeffentlichten Beobachtung. Bis 2026-09-23 stand hier der
   Platzhalter des aelteren Vertrags mit dem Satz, es brauche dafuer noch
   eine geordnete Historie und eine freigegebene Methodik - beides gibt es
   seitdem, und 5.676 Titel tragen einen Zustand. Ein Nutzer bekam auf der
   meistbesuchten Flaeche gesagt, es gebe die Aussage nicht, waehrend sie
   einen Klick weiter stand. Kein zweiter Auswerter: die Beobachtung wird
   gelesen, nicht neu gerechnet. */
/* `schonBeantwortet` heisst: die Auskunft oben hat Zustand, Grund, naechste
   Stufe und Ende dieses Zustands bereits gesagt. Dann steht hier nur noch,
   woran er haengt - sonst stuenden Etikett und Regelsatz zweimal auf einer
   Seite, und zwei gleichlautende Hauptaussagen sind fuer einen Leser ein
   Fehler der Seite, auch wenn beide stimmen. */
/* „NICHT VORHANDEN" UND „BEWUSST ZURUECKGEHALTEN" SIND ZWEI AUSSAGEN.
 *
 * Gemessen am 26.09.2026: 266 Titel, deren Boersenwert die Faktorschicht
 * ausdruecklich zurueckhaelt, zeigten hier trotzdem ein Kurs-Gewinn- und ein
 * Kurs-Umsatz-Verhaeltnis. Seit M40 fallen diese Kennzahlen geschlossen - und
 * dann muss an ihrer Stelle der GRUND stehen und nicht der Satz „fuer diese
 * Kennzahl fehlen auswertbare Daten". Es fehlt nichts: es wird eine Zahl
 * nicht genannt, die sich nur schaetzen liesse. Das Woerterbuch verlangt
 * dafuer ausdruecklich zwei verschiedene Texte. */
const KENNZAHL_GRUND={
 SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING:'Diese Kennzahl braucht den Börsenwert genau dieser Notierung. '
  +'Das Unternehmen hat mehrere börsennotierte Wertpapiere, und die veröffentlichte Aktienzahl gilt für das '
  +'Unternehmen als Ganzes - welcher Anteil auf dieses Papier entfällt, steht nicht in den Unterlagen. '
  +'Die Kennzahl wird deshalb nicht genannt, statt sie zu schätzen.',
 DISPLAY_NOT_PERMITTED:'Für diesen Titel ist die Anzeige marktbezogener Werte in dieser Ansicht nicht freigegeben.'};
function kennzahlGrund(m){
 return (m&&KENNZAHL_GRUND[m.reason])||'Für diese Kennzahl fehlen auswertbare oder freigegebene Daten.';
}
function setupStateSection(observation,index,ticker,schonBeantwortet){
 const section=el('section',{class:'section','aria-label':'Situation'});
 section.append(el('span',{class:'eyebrow',text:'Situation'}),
  el('h2',{text:schonBeantwortet?'Woran dieser Zustand hängt':LQ('setupState')}));
 const state=observation&&observation.state==='AVAILABLE'?observation.classification.state:null;
 if(!state||state==='UNAVAILABLE'){
  /* Die Absage steht oben schon, wenn die Auskunft sie gesagt hat. */
  if(schonBeantwortet)return null;
  section.append(notice(LU('setupState'),LB('setupState')));
  return section;
 }
 if(!schonBeantwortet)section.append(el('p',{class:'setup-badge state-'+state,text:L(state)}),
  el('p',{class:'muted',text:LB(state)}),
  el('p',{class:'muted',text:'Beobachtet am '+observation.asOf+'. '+observation.matchedRule.plain}));
 section.append(setupCurrency(observation));
 /* Die vier Verlaufszustaende sind hier genauso geschlossen wie auf der
    Quant-Seite; das steht daneben, statt es durch Weglassen so aussehen
    zu lassen, als waeren sie geprueft und ausgeschlossen worden. */
 if(observation.lifecycle&&observation.lifecycle.availability.state!=='AVAILABLE'){
  section.append(notice(LU('setupState'),LB(observation.lifecycle.availability.reason)));
 }
 section.append(setupChange(observation));
 section.append(setupPeers(index,state,ticker));
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{class:'muted',text:'Interner Zustand '+state+' · Regel '+observation.matchedRule.ruleId+' · Zuordnung '+observation.mappingVersion+' · Evidenzstand '+observation.asOf+'. Dieselbe Regel ist als Screener-Abfrage formuliert; sie beschreibt einen Zustand und ist weder Einstiegsregel noch historisch getesteter Ausloeser.'}),
  link('Vollständige Analyse',href('quant',ticker),'button secondary')]));
 return section;
}
/* Die Einstiegsflaeche beantwortet die beiden Kopffragen selbst.

   Gemessener Anlass: die Aktienseite ist die Seite, auf der ein Nutzer
   landet, und sie sagte bisher nichts zu "wie stark ist diese Aktie" und
   nichts zu "Chance gegen Risiko" - beides stand einen Klick weiter auf der
   Quant-Seite. Wer nicht klickt, sieht Kurs und Kennzahlen und geht wieder.

   Keine zweite Engine und keine Kopie der Quant-Seite: die
   Sieben-Faktoren-Leiste ist dieselbe Komponente wie in der Watchlist, und
   die Musterbilanz liest das veroeffentlichte Pattern-Match-Artefakt. Die
   Tiefe bleibt drueben; hier steht die Antwort. */
function patternBalance(patterns,ticker,lead){
 const section=el('section',{class:'section pattern-balance'},[
  el('span',{class:'eyebrow',text:'Einordnung'}),el('h2',{text:LQ('patternBalance')}),
  /* Erst die Aussage, dann die Zaehlung - dieselbe Engine wie die Auskunft oben. */
  lead&&lead.sentence?el('p',{class:'pattern-lead',text:lead.sentence}):null]);
 if(!patterns||patterns.state!=='AVAILABLE'){
  section.append(notice(LU('patternBalance'),LB('patternBalance')));
  return section;
 }
 const holds=patterns.holds||[];
 /* DER NENNER IST, WAS GEPRUEFT WERDEN KONNTE.
 
    Gemessen: von 5.569 Titeln haben 3.471 Muster, die fuer sie nicht
    messbar sind; bei 1.494 sind es 181 von 250, weil keine
    Fundamentaldaten vorliegen. "29 von 250" liest sich so, als waeren 221
    geprueft worden und laegen nicht vor. Geprueft wurden 69. */
 const abdeckung=patterns.coverage||{registered:holds.length+(patterns.others||[]).length,
  measurable:holds.length+(patterns.others||[]).length,notMeasurable:0,reason:null};
 const nichtPruefbar=abdeckung.notMeasurable
  ? ' '+abdeckung.notMeasurable+' weitere '+(abdeckung.notMeasurable===1?'ist':'sind')+' für diesen Titel nicht prüfbar'
    +(abdeckung.reason==='NO_FUNDAMENTALS'?', weil keine Geschäftszahlen vorliegen.':', weil die dafür nötigen Kennzahlen fehlen.')
  : '';
 if(!holds.length){
  /* Null Treffer ist eine Aussage und keine leere Flaeche. Ein Titel, auf
     den kein vorregistriertes Muster zutrifft, ist nicht unbewertet - er
     ist unauffaellig, und das gehoert hingeschrieben. */
  section.append(el('p',{text:'Von '+abdeckung.measurable+' prüfbaren Mustern trifft heute keines auf diesen Titel zu.'+nichtPruefbar}),
   el('p',{class:'muted',text:'Das ist kein fehlender Wert: die Lage dieses Titels gleicht keiner der untersuchten Konstellationen deutlich genug.'}));
  section.append(link('Alle Muster ansehen',href('quant',ticker),'button secondary'));
  return section;
 }
 /* Je Muster einzeln gezaehlt und NICHT zu einer Zahl verrechnet: die
    Muster ueberlappen sich, eine kombinierte Quote waere erfunden. */
 const favourable=holds.filter(row=>row.asymmetry>1);
 const adverse=holds.filter(row=>!(row.asymmetry>1));
 /* Einzahl und Mehrzahl getrennt: "1 von 249 Mustern treffen zu" ist der
    Satz, an dem ein Nutzer merkt, dass hier niemand mitgelesen hat. */
 section.append(el('p',{text:(holds.length===1
  ? 'Eines von '+abdeckung.measurable+' prüfbaren Mustern trifft heute zu.'
  : holds.length+' von '+abdeckung.measurable+' prüfbaren Mustern treffen heute zu.')+nichtPruefbar}));
 section.append(el('div',{class:'balance-pair'},[
  el('div',{class:'balance-side'},[el('strong',{text:String(favourable.length)}),
   el('span',{class:'muted',text:favourable.length===1?'Muster, bei dem die Chance historisch größer war als das Risiko':'Muster, bei denen die Chance historisch größer war als das Risiko'})]),
  el('div',{class:'balance-side is-down'},[el('strong',{text:String(adverse.length)}),
   el('span',{class:'muted',text:adverse.length===1?'Muster, bei dem das Risiko mindestens so groß war':'Muster, bei denen das Risiko mindestens so groß war'})])]));
 if(!favourable.length)section.append(el('p',{class:'muted',text:LN('patternBalance')}));
 const best=holds.slice().sort((a,b)=>b.asymmetry-a.asymmetry)[0];
 section.append(el('p',{class:'muted',text:'Deutlichste Neigung: '+best.plain+' · Chance-Risiko-Verhältnis '+best.asymmetry.toFixed(2).replace('.',',')+' bei '+best.support.toLocaleString('de-DE')+' historischen Beobachtungen.'}));
 section.append(el('p',{class:'muted',text:'Historische Häufigkeiten über '+patterns.horizonMonths+' Monate, gemessen an der gesamten Grundgesamtheit. Keine Aussage über diesen Titel und keine Prognose.'}));
 section.append(link('Chance und Risiko im Detail',href('quant',ticker),'button secondary'));
 return section;
}
/* WARUM DIESER TITEL KEINE KURSSTRUKTUR HAT - IN EINEM SATZ, DER STIMMT.
 *
 * Vorher stand dort viermal derselbe Satz: "Technische Analyse derzeit
 * nicht verfuegbar". Gemessen am 25.09.2026 verbergen sich darunter vier
 * verschiedene Sachverhalte - 990 Titel mit zu kurzer Historie (COOL:
 * zwanzig Handelstage, notiert seit sechs Wochen), 208 mit einem Tag im
 * Analysefenster ohne gesicherte Sitzungsaussage, einer ohne Reihe, plus
 * die Faelle, in denen eine Pruefung angeschlagen hat.
 *
 * "Derzeit" ist bei einem sechs Wochen alten Titel zudem irreführend: da
 * fehlt nichts, was gleich kommt - es fehlen 280 Handelstage. Ein
 * unbekannter Code fuehrt bewusst zu null und damit zum alten Satz; ein
 * roher Enum-Wert erscheint nie. */
const TECHNICAL_REASON={
 INSUFFICIENT_HISTORY:u=>u.bars!==null&&u.requiredBars!==null
  ?'Diese Auswertung benötigt '+u.requiredBars.toLocaleString('de-DE')+' Handelstage; für diesen Titel liegen '+u.bars.toLocaleString('de-DE')+' vor.'
  :'Für diesen Titel liegen noch zu wenige Handelstage vor.',
 NOT_TECHNICAL_READY:()=>'Dieser Titel ist im geprüften Datenbestand für diese Auswertung noch nicht vorgemerkt.',
 TECHNICAL_CALENDAR_INVALID:()=>'Im Auswertungsfenster liegt ein Tag, für den der geprüfte Börsenkalender keine gesicherte Sitzungsaussage hat. Ohne sie wird hier nichts veröffentlicht.',
 /* Die Aufspaltung von TECHNICAL_CALENDAR_INVALID. Gemessen am 26.09.2026
    an 42 Titeln: 39 werden so duenn gehandelt, dass ihre letzten 270
    Kurstage 1,1 bis 4,0 Jahre zurueckreichen - "aktuelle Kursstruktur"
    waere dort ein falsches Wort; 2 tragen eine Kursbar an einem Tag, an dem
    die Boerse geschlossen war. Der alte Satz nannte beide einen
    Kalenderfehler und schickte den Leser an die falsche Stelle. */
 TECHNICAL_WINDOW_OUTSIDE_CALENDAR:u=>{
  const d=u.detail||{};
  const spanne=d.windowFirst&&d.windowLast?' Die letzten '+(d.windowSessions||270)+' Kurstage dieses Titels reichen von '+d.windowFirst+' bis '+d.windowLast+'.':'';
  return 'Dieser Titel wird so selten gehandelt, dass das Auswertungsfenster weit in die Vergangenheit reicht.'+spanne
   +' Eine Aussage über die aktuelle Kursstruktur wäre damit keine Aussage über die aktuelle Lage.';
 },
 TECHNICAL_SESSION_NOT_A_TRADING_DAY:u=>{
  const tag=u.detail&&u.detail.nonTradingDay?u.detail.nonTradingDay:null;
  return 'Die Kurshistorie dieses Titels enthält einen Kurstag an einem Tag, an dem die Börse geschlossen war'
   +(tag?' ('+tag+')':'')+'. Bis das geklärt ist, wird aus dieser Reihe keine Kursstruktur veröffentlicht.';
 },
 SOURCE_MISSING:()=>'Für diesen Titel liegt keine geprüfte Kurshistorie vor.',
 INVALID_HISTORY_PROVENANCE:()=>'Die Kurshistorie dieses Titels hat die Herkunftsprüfung nicht bestanden.',
 INVALID_HISTORY_BAR:()=>'Ein Kurstag dieses Titels hat die Plausibilitätsprüfung nicht bestanden.',
 INVALID_HISTORY_OBSERVED_AT:()=>'Der Beobachtungszeitpunkt der Kurshistorie ist nicht belegt.',
 INVALID_CANONICAL_SERIES:()=>'Die aufbereitete Kursreihe hat die Schlussprüfung nicht bestanden.',
 TECHNICAL_PARTIAL:()=>'Die Auswertung blieb unvollständig und wird deshalb nicht veröffentlicht.'};
/* ZWEI STAENDE NEBENEINANDER SIND ZWEI STAENDE.
 *
 * Gemessen am 25.09.2026: die Kursstruktur der Produktartefakte endet am
 * 2026-09-10, der veroeffentlichte Kursstand am 2026-09-24 - bei 5.646 von
 * 5.676 Titeln dieselben zehn Handelstage Abstand. Die Seite zeigte beides
 * untereinander, jedes fuer sich richtig, und nichts sagte, dass sie nicht
 * denselben Tag beschreiben. Wer den Trend liest, liest den Trend von vor
 * zwei Wochen.
 *
 * Die Ursache liegt in der Ablage, aus der die Materialisierung liest (im
 * Orchestrator-State benannt). Solange sie besteht, gehoert der Abstand auf
 * die Seite - nicht, weil er gut ist, sondern weil er wahr ist. */
function analysisLagLine(lag){
 if(!lag||!Number.isFinite(lag.lagSessions)||lag.lagSessions<1)return null;
 const tage=lag.lagSessions===1?'einen Handelstag':lag.lagSessions+' Handelstage';
 return el('p',{class:'analysis-lag',text:'Diese Auswertung steht auf dem Stand '+lag.analysisAsOf
  +' und liegt damit '+tage+' hinter dem veröffentlichten Kursstand ('+lag.priceAsOf
  +'). Der Kursverlauf darüber ist aktuell; die Kursstruktur beschreibt den älteren Stand.'});
}
/* WARUM DIESER TITEL KEINEN MUSTERVERGLEICH HAT - IN EINEM SATZ MIT ZAHL.
 *
 * Gemessen am 25.09.2026: 1.306 der 6.875 Titel haben keinen Eintrag, und die
 * Seite sagte dazu nur "derzeit nicht verfuegbar". Die Luecke ist vollstaendig
 * erklaerbar und enthaelt keinen Defekt: 737 Titel haben eine kuerzere
 * Wochenreihe als die vorregistrierten 104 Wochen, 567 gar keine, zwei keine
 * messbaren Merkmale. Sechs stehen bei genau 103 Wochen - fuer die ist "eine
 * Woche fehlt noch" die wahre Auskunft, und die bekommen sie jetzt. */
const PATTERN_REASON={
 INSUFFICIENT_WEEKLY_HISTORY:u=>u.weeks!==null&&u.requiredWeeks!==null
  ?'Dieser Vergleich braucht '+u.requiredWeeks.toLocaleString('de-DE')+' Wochen Kurshistorie; für diesen Titel liegen '+u.weeks.toLocaleString('de-DE')+' vor.'
  :'Die Kurshistorie dieses Titels ist für diesen Vergleich noch zu kurz.',
 NO_WEEKLY_SERIES:()=>'Für diesen Titel ist keine Wochenreihe veröffentlicht, gegen die Muster geprüft werden könnten.',
 NO_MEASURABLE_FEATURES:()=>'Aus der Kursreihe dieses Titels ließen sich die verlangten Merkmale nicht messen.',
 INVALID_SERIES_CONTRACT:()=>'Die Wochenreihe dieses Titels hat die Herkunftsprüfung nicht bestanden.'};
function patternReasonText(unavailability){
 if(!unavailability||typeof unavailability.reason!=='string')return null;
 const satz=PATTERN_REASON[unavailability.reason];
 return satz?satz(unavailability):null;
}
function technicalReasonText(unavailability){
 if(!unavailability||typeof unavailability.reason!=='string')return null;
 const satz=TECHNICAL_REASON[unavailability.reason]
  ||(unavailability.reason.startsWith('TECHNICAL_CONTRACT_')?TECHNICAL_REASON.TECHNICAL_PARTIAL:null);
 return satz?satz(unavailability):null;
}
/* =========================================================================
   WAS EINE DATENARME SEITE AUS DER REISE MACHT - UND WIE SIE STATTDESSEN
   AUSSIEHT.

   Gemessen am 26.09.2026 ueber die 500er-Stichprobe der Reisemessung: 89
   Titel bekommen zwischen zwei und acht GEHALTVOLLE Stationen, zwei
   bekommen hoechstens eine. Auf einer solchen Seite standen bisher im
   Median FUENF Absagen - fuer DREI verschiedene Ursachen. ACAA ist der
   typische Fall: Kurs und Kursverlauf sind da (117 Handelstage), und
   darunter folgten eine leere Faktorleiste, eine Setup-Absage, eine
   Muster-Absage, ein Kennzahlengitter mit acht Zeilen "Nicht verfuegbar"
   und eine Technical-Absage. Jede einzelne Aussage war richtig. Zusammen
   sahen sie aus wie eine kaputte Seite.

   Die Verdichtung erfindet nichts und verschweigt nichts: dieselben
   Gruende, dieselben Zahlen, aber einmal erklaert statt fuenfmal abgesagt -
   und die vorhandenen Erkenntnisse zuerst. Welche Form eine Seite bekommt,
   entscheidet nicht diese Datei, sondern `journey-shape.js`, damit die
   Messung und die Oberflaeche dieselbe Regel benutzen und nicht zwei.

   Fuer datenreiche Titel aendert sich nichts: bis zu zwei Absagen bleiben
   im Fluss der vollen Reise stehen, wo sie hingehoeren. */
/* Eine Gruppe, ein Grund, die betroffenen Bereiche mit Namen. Die Saetze
   kommen aus dem Vertrag; hier wird nur gesetzt. */
function journeyGapSection(shape,ticker,minimal){
 const section=el('section',{class:'section journey-gap','data-journey-shape':shape.shape},[
  el('span',{class:'eyebrow',text:minimal?'Datenlage':'Was hier noch nicht geht'}),
  el('h2',{text:minimal?'Zu diesem Titel liegt noch zu wenig vor'
   :'Diese Bereiche warten noch auf Daten'}),
  el('p',{class:'muted',text:minimal
   ?'Der Titel gehört zum Produktuniversum. Was von ihm veröffentlicht ist, reicht für eine Einordnung noch nicht aus. Ersatzwerte werden nicht gebildet.'
   :(shape.groups.length===1?'Ein Grund, und er betrifft mehrere Bereiche:'
     :shape.groups.length+' Gründe, und sie betreffen jeweils mehrere Bereiche:')})]);
 for(const group of shape.groups){
  section.append(el('article',{class:'gap-group','data-cause':group.causeId},[
   el('h3',{text:group.headline}),
   el('p',{text:group.explanation}),
   group.outlook?el('p',{class:'muted',text:group.outlook}):null,
   el('p',{class:'gap-areas',text:(group.areas.length===1?'Betrifft: ':'Betrifft '+group.areas.length+' Bereiche: ')
    +group.areas.join(' · ')})]));
 }
 section.append(el('details',{},[el('summary',{text:'Welche Gründe genau veröffentlicht sind'}),
  ...shape.groups.map(g=>el('p',{class:'muted',text:g.areas.join(', ')+': '+g.reasons.join(', ')})),
  el('p',{class:'muted',text:'Diese Bezeichnungen stehen so in den veröffentlichten Daten. Sie sind der Grund, nicht ein Ersatz für einen Wert.'})]));
 return section;
}
/* EIN LESEWEG FUER DIE GANZE SEITE.
 *
 * Die Auskunft oben und die Abschnitte darunter stehen auf denselben Werten.
 * Sie werden deshalb EINMAL geholt - die Dienstschicht ruft dafür dieselben
 * sechs Dienste, die diese Seite ohnehin gebraucht hat. Zwei Lesewege wären
 * zwei Stände desselben Titels auf einer Seite. */
/* =========================================================================
   HISTORISCHE VERGLEICHSFÄLLE — DIE FLÄCHE

   Sie stellt zwei Ebenen NEBENEINANDER, weil jede allein in die Irre führt:

   EBENE 1/2 · DIESER TITEL   "Wann galt diese Kurslage hier schon einmal?"
                              Wenige Fälle, aber es ist derselbe Titel.
   EBENE 3   · ALLE TITEL     "Wie verhielt sich die Grundgesamtheit?"
                              Viele Fälle, aber es sind andere Unternehmen.

   KEIN CHERRY PICKING. Der letzte vergleichbare Fall erscheint nur, wenn
   auch die Verteilung erscheint - ein einzelnes Datum neben einer Rendite
   ist eine Anekdote, die wie ein Beleg aussieht. Unter zehn abgeschlossenen
   Fällen wird gar nichts gerechnet und die Anzahl genannt.

   KEINE PROGNOSESPRACHE. Überschriften sind Fragen über die Vergangenheit
   ("Was geschah danach?"), nie Aussagen über die Zukunft.
   ========================================================================= */
/* Eigener Name mit Absicht: `pct1` gibt es in dieser Datei schon, und zwei
   Funktionen gleichen Namens im selben Gültigkeitsbereich sind kein
   Versehen, das auffällt - die Zahlen sahen nur leicht anders aus. */
function renditeText(x){return (x>=0?'+':'−')+Math.abs(x*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %';}
function faelleKachel(h){
 if(!h)return null;
 if(!h.sufficient){
  return el('div',{class:'q-case is-thin'},[
   el('span',{class:'q-case-h',text:h.label}),
   el('div',{class:'q-case-v',text:h.completed+' '+(h.completed===1?'Fall':'Fälle')}),
   el('p',{class:'q-case-n',text:'Zu wenige abgeschlossene Vergleichsfälle für eine belastbare Aussage.'})]);
 }
 return el('div',{class:'q-case'},[
  el('span',{class:'q-case-h',text:h.label}),
  el('div',{class:'q-case-v',text:renditeText(h.medianReturn)}),
  el('p',{class:'q-case-n',text:'Median aus '+h.completed+' Fällen · '+h.positive+' davon positiv'+
   (Number.isFinite(h.medianDrawdown)?' · typischer Rückschlag '+renditeText(h.medianDrawdown):'')})]);
}
function historischeFaelleSection(faelle,ticker,name){
 const section=el('section',{class:'q-card'});
 section.append(el('div',{class:'q-card-head'},[el('h2',{text:'Ähnliche Situationen bei '+(name||ticker)})]));

 if(!faelle||faelle.state!=='AVAILABLE'){
  const grund=(faelle&&faelle.reason)||'SOURCE_MISSING';
  const klartext={
   NO_PRICE_CONDITION_TODAY:'Für diesen Titel gilt heute keine der geprüften Kursbedingungen. Ohne eine Lage gibt es nichts zu vergleichen.',
   SERIES_TOO_SHORT:'Die veröffentlichte Kursgeschichte dieses Titels ist zu kurz, um frühere vergleichbare Phasen zu finden.',
   NO_COMPARABLE_CASE:'Diese Lage ist in der Geschichte dieses Titels bisher nicht wieder aufgetreten.',
   NOT_COVERED_BY_PATTERN_MATCH:'Dieser Titel ist in der Musterauswertung nicht enthalten.',
   INVALID_IDENTITY:'Die Kennung dieses Titels ist nicht auswertbar.'
  }[grund]||'Für diesen Titel liegt keine auswertbare Kursgeschichte vor.';
  section.append(el('p',{class:'q-card-intro',text:klartext}));
  section.append(el('p',{class:'muted',style:'font-size:13.5px',
   text:'Es wird kein Ersatzwert und kein Durchschnitt aus anderen Unternehmen an diese Stelle gesetzt.'}));
  return section;
 }

 section.append(el('span',{class:'q-level',text:'Ebene 1 · Dieser Titel'}));
 section.append(el('p',{class:'q-card-intro',
  text:'Gesucht wurden Wochen, in denen bei '+(name||ticker)+' dieselben Kursbedingungen galten wie heute. '+
       'Zusammenhängende Wochen zählen als ein Fall.'}));

 const bedingungen=el('div',{class:'q-chips',style:'margin-bottom:16px'});
 for(const id of faelle.conditions||[])bedingungen.append(el('span',{class:'q-chip',style:'min-height:34px;font-size:13px',
  text:BEDINGUNG_KLARTEXT[id]||id}));
 if((faelle.conditions||[]).length)section.append(bedingungen);

 section.append(el('p',{style:'margin:0 0 14px'},[
  stateMark('neutral',faelle.episodes+' vergleichbare '+(faelle.episodes===1?'Phase':'Phasen')+
   ' seit '+(faelle.from||'Beginn der Reihe'))]));

 section.append(el('h3',{style:'font-size:15px;margin:18px 0 10px',text:'Was geschah danach?'}));
 const kacheln=el('div',{class:'q-cases'});
 for(const h of VUHistoricalCases.HORIZONS){const k=faelleKachel(faelle.horizons&&faelle.horizons[h.id]);if(k)kacheln.append(k);}
 section.append(kacheln);

 /* Der letzte Fall NUR neben der Verteilung - und nur, wenn die Verteilung
    überhaupt gerechnet werden durfte. */
 const m12=faelle.horizons&&faelle.horizons.m12;
 if(m12&&m12.sufficient&&m12.lastCaseDate){
  section.append(el('p',{class:'muted',style:'font-size:13.5px;margin:0 0 4px',
   text:'Die letzte vergleichbare Phase mit abgeschlossenem Zwölf-Monats-Fenster begann am '+m12.lastCaseDate+
        '. Sie ist einer von '+m12.completed+' Fällen und steht hier neben ihnen, nicht statt ihrer.'}));
 }else if(!faelle.measured){
  section.append(el('p',{style:'margin:6px 0 0'},[stateMark('warn',
   'Zu wenige historische Vergleichsfälle für eine belastbare Aussage')]));
  section.append(el('p',{class:'muted',style:'font-size:13.5px;margin:8px 0 0',
   text:'Erst ab '+VUHistoricalCases.MIN_EPISODES+' abgeschlossenen Fällen wird ein Median gerechnet. Darunter bliebe eine Zahl ein Zufallswert — sie wird deshalb nicht gebildet.'}));
 }

 /* Ebene 3 daneben, damit die dünne Ebene 1 nicht allein steht. */
 if(faelle.marketWide&&faelle.marketWide.available){
  section.append(el('div',{style:'margin-top:24px;padding-top:20px;border-top:1px solid var(--q-card-line)'},[
   el('span',{class:'q-level',text:'Ebene 3 · Alle Titel'}),
   el('p',{class:'muted',style:'font-size:14px;margin:0 0 10px',
    text:'Dieselben Bedingungen über die gesamte Grundgesamtheit ausgewertet — viele Fälle, aber andere Unternehmen. Diese Ebene steht vollständig im Abschnitt Chance und Risiko auf dieser Seite.'}),
   faelle.marketWide.caveats&&faelle.marketWide.caveats.statement
    ?el('p',{class:'muted',style:'font-size:13.5px;margin:0'},[el('em',{text:faelle.marketWide.caveats.statement})]):null]));
 }

 const stufen=[
  ['Wie ein Fall gezählt wird',[
   'Eine Bedingung, die mehrere Wochen am Stück gilt, ist ein Ereignis und nicht mehrere. Gezählt wird die erste Woche jeder zusammenhängenden Folge: '+
   faelle.rawWeeks+' Trefferwochen ergeben '+faelle.episodes+' Fälle.',
   'Phasen, deren Zeitfenster noch nicht abgelaufen ist, werden als offen gezählt und nicht gewertet.']],
  ['Woraus gerechnet wurde',[
   'Wochenschlusskurse dieses Titels, splitbereinigt, '+(faelle.from||'?')+' bis '+(faelle.to||'?')+' ('+faelle.weeks+' Wochen).',
   'Bedingungen und Rechenweg stammen aus '+(faelle.methodologyVersion||'der Musterstudie')+', derselben Methodik wie die marktweite Auswertung. Darstellungsregeln: '+faelle.schemaVersion+'.']],
  ['Was diese Zahlen nicht können',(faelle.limits||[]).slice()],
  ['Warum hier keine Prognose steht',[
   'Diese Zahlen beschreiben, was nach vergleichbaren Phasen der Vergangenheit geschah. Sie sagen nicht, was als Nächstes geschieht, und sie werden durch die Nähe zum Namen dieses Titels nicht zu einer Erwartung.']]
 ];
 const treppe=ladder(stufen);
 if(treppe)section.append(treppe);
 return section;
}
/* Die Begriffe der Studie in Produktsprache. Fehlt einer, steht seine
   Kennung da - ein erfundener Klartext waere schlimmer als eine Kennung. */
const BEDINGUNG_KLARTEXT={
 'near-52w-high':'Nahe dem Jahreshoch','at-all-time-high':'Am bisherigen Höchststand',
 'above-40w-line':'Über der langfristigen Linie','trend-stacked':'Kurzfristiger Trend über dem langfristigen',
 'quiet-range':'Ruhige Kursspanne','wide-range':'Weite Kursspanne','high-volatility':'Hohe Schwankung',
 'far-below-52w-high':'Weit unter dem Jahreshoch','deep-drawdown':'Tiefer Rückschlag vom Höchststand',
 'three-month-thrust':'Kräftiger Schub über drei Monate','six-month-thrust':'Kräftiger Schub über sechs Monate',
 'weak-12m-momentum':'Schwache Entwicklung über zwölf Monate',
 'strong-12m-momentum':'Starke Entwicklung über zwölf Monate',
 'very-strong-12m-momentum':'Sehr starke Entwicklung über zwölf Monate'
};

/* =========================================================================
   AKTIEN — DER EINSTIEG ZUR EINZELANALYSE

   Kein Katalog zum Durchblättern: 6.875 Titel als Liste sind keine Hilfe.
   Diese Seite hat genau eine Aufgabe - den Nutzer in die Analyse EINES
   Titels zu bringen. Deshalb oben die Suche, darunter die zuletzt
   angesehenen Titel, darunter erst die Breite.

   "Zuletzt analysiert" liegt im Browser des Nutzers und nirgends sonst.
   Ist der Speicher nicht lesbar, steht das da, statt die Liste leer
   aussehen zu lassen.
   ========================================================================= */
const ZULETZT_SCHLUESSEL='vu2.zuletzt';
function zuletztLesen(){
 try{const roh=localStorage.getItem(ZULETZT_SCHLUESSEL);if(!roh)return [];
  const liste=JSON.parse(roh);
  return Array.isArray(liste)?liste.filter(x=>typeof x==='string'&&/^[A-Z0-9.-]{1,12}$/.test(x)).slice(0,8):[];
 }catch{return null;}
}
function zuletztMerken(ticker){
 if(!/^[A-Z0-9.-]{1,12}$/.test(ticker||''))return;
 try{const alt=zuletztLesen()||[];
  localStorage.setItem(ZULETZT_SCHLUESSEL,JSON.stringify([ticker,...alt.filter(t=>t!==ticker)].slice(0,8)));
 }catch{/* Kein Speicher, kein Verlauf - kein Grund, die Seite zu stoeren. */}
}
async function aktienPage(){
 /* Die Buehne trug drei Absaetze ueber das, was gleich kommt. Wer eine
    Aktie sucht, will suchen - nicht lesen, dass er gleich suchen kann. */
 main.append(el('section',{class:'q-hero'},[
  el('h1',{text:'Welche Aktie willst du prüfen?'}),
  el('p',{class:'q-hero-lead',text:'Tippe einen Namen oder ein Kürzel. Du bekommst in einem Satz, was dafür und was dagegen spricht.'})]));

 /* ---- Suche direkt auf der Seite, nicht nur im Dialog ---- */
 const eingabe=el('input',{class:'search',type:'search',placeholder:'Unternehmen oder Kürzel','aria-label':'Unternehmen suchen'});
 const ergebnis=el('div',{class:'q-hitlist','aria-live':'polite'});
 const hinweis=el('p',{class:'muted',style:'font-size:13px;margin:10px 0 0',
  text:'Mindestens zwei Zeichen eingeben.'});
 let lauf=0;
 async function suchen(){
  const meine=++lauf,q=eingabe.value.trim();
  S.clear(ergebnis);
  if(q.length<2){hinweis.textContent='Mindestens zwei Zeichen eingeben.';return;}
  hinweis.textContent='Wird gesucht …';
  let treffer;
  try{treffer=await api.searchInstruments(q,{limit:12});}catch{treffer=null;}
  if(meine!==lauf)return;
  /* Der Dienst antwortet mit `entries` - geraten hatte ich `instruments`,
     und die Liste waere immer leer geblieben, ohne dass es auffaellt. */
  if(!treffer||treffer.state!=='AVAILABLE'){
   hinweis.textContent='Die Unternehmenssuche ist derzeit nicht verfügbar.';return;}
  const zeilen=treffer.entries||[];
  if(!zeilen.length){hinweis.textContent='Kein Unternehmen zu „'+q+'" gefunden.';return;}
  hinweis.textContent=zeilen.length+' Treffer'+(treffer.limited?' · Auswahl begrenzt, Suche präzisieren.':'.');
  for(const z of zeilen.slice(0,12)){
   if(!z.ticker)continue;
   ergebnis.append(hitRow(z.ticker,z.name&&z.name!==z.ticker?z.name:'',
    z.name&&z.name!==z.ticker?'':'Für dieses Kürzel ist kein belegter Name veröffentlicht.',''));
  }
 }
 eingabe.addEventListener('input',()=>{clearTimeout(eingabe._t);eingabe._t=setTimeout(suchen,220);});
 main.append(el('section',{class:'q-suche'},[eingabe,hinweis,ergebnis]));

 /* ---- Zuletzt analysiert ---- */
 const zuletzt=zuletztLesen();
 const verlauf=el('div',{});
 if(zuletzt===null)verlauf.append(el('p',{class:'q-card-intro',text:'Der Browser-Speicher ist nicht lesbar. Ein Verlauf wird deshalb nicht geführt — deine Analysen funktionieren trotzdem.'}));
 else if(!zuletzt.length)verlauf.append(el('p',{class:'q-card-intro',text:'Noch keine Aktie geöffnet. Sobald du eine analysierst, findest du sie hier wieder.'}));
 else{
  const chips=el('div',{class:'q-chips'});
  for(const t of zuletzt)chips.append(el('a',{class:'q-chip',href:href('stock',t),text:t}));
  verlauf.append(chips);
  verlauf.append(el('p',{class:'muted',style:'font-size:13px;margin:12px 0 0',
   text:'Dieser Verlauf liegt nur in diesem Browser und wird nirgendwo gespeichert oder übertragen.'}));
 }
 main.append(card('Zuletzt analysiert',null,[verlauf]));

 /* ---- Die Breite, mit ihrer gemessenen Abdeckung ---- */
 const gemessen=universe.productCapabilityState==='AVAILABLE';
 const gesamt=gemessen?Number(universe.productUniverseSize):universe.stocks.length;
 const counts=universe.capabilityCounts||{};
 const breite=el('div',{});
 if(gemessen){
  breite.append(tiles(3,[
   tile('doc',(Number(counts.fundamentals)||0).toLocaleString('de-DE')+' mit Geschäftszahlen','Bilanz, Ergebnis und Zahlungsfluss aus geprüften Meldungen.'),
   tile('chart',(Number(counts.historicalAvailable)||0).toLocaleString('de-DE')+' mit Kurshistorie','Splitbereinigte Schlusskurse als Grundlage jeder Kursaussage.'),
   tile('layers',(Number(counts.factorEligible)||0).toLocaleString('de-DE')+' mit Faktorzeile','Die sieben Eigenschaften, an denen jedes Unternehmen gemessen wird.')]));
  breite.append(el('p',{class:'muted',style:'font-size:13px;margin:16px 0 0',
   text:gesamt.toLocaleString('de-DE')+' Titel sind über die Suche erreichbar. Wie tief eine Analyse geht, hängt davon ab, was für den einzelnen Titel veröffentlicht ist — ein Rang über den Gesamtmarkt wird daraus nicht abgeleitet.'}));
 }else{
  breite.append(el('p',{class:'q-card-intro',text:'Die Breitenmessung ist derzeit nicht verfügbar. Sie wird nicht geschätzt. '+universe.stocks.length+' vollständig verbundene Titel bleiben nutzbar.'}));
 }

 /* SECHS ZEILEN STEHEN OFFEN, DER REST LIEGT ZU.

    Erst hatte ich die ganze Liste zugeklappt - und der Smoke hat es
    gemeldet ("ZU_WENIGE_ZEILEN=0"). Zu Recht, und nicht nur formal: wer
    ohne einen Namen im Kopf herkommt, stand dann vor einem Suchfeld und
    sonst nichts. Ein leerer Bildschirm ist keine Vereinfachung.

    Sechs sind genug, um zu zeigen, was einen erwartet, und wenig genug,
    dass keine Wand entsteht. Die uebrigen 34 bleiben vollstaendig. */
 const liste=el('div',{class:'q-hitlist'});
 const listeRest=el('div',{class:'q-hitlist'});
 const gezeigt=universe.stocks.slice(0,40);

 /* =============================================================
    ZWEI KONSTANTEN, VIERZIGMAL WIEDERHOLT.

    Ueber alle 40 Zeilen gemessen (aufgeklappt, am gebauten Release):

      "Stand 2026-09-28"                          40 von 40
      "Vollstaendig verbundene Analyse verfuegbar." 36 von 40
      "Kein Aktienurteil - dieses Papier ist keine Aktie."  4 von 40

    Der Stichtag war auf jeder Zeile derselbe und machte 18 der 24
    Zahlen dieser Spalte aus. Der Satz sagte auf 36 Zeilen dasselbe -
    und genau dadurch fiel die AUSNAHME nicht auf, die einzige Zeile,
    die wirklich etwas mitteilt: dass dieses Papier keine Aktie ist.

    Dieselbe Fehlerklasse wie "nur 6 von 7 pruefbar" im Screener und wie
    der Waechter, der jede Nacht schrie: was immer dasteht, wird nicht
    mehr gelesen - und verdeckt das, was nur manchmal dasteht.

    JETZT: der Stichtag steht EINMAL ueber der Liste, und zwar nur, wenn
    alle Zeilen denselben tragen. Weicht eine ab, behaelt sie ihren
    eigenen - dann ist er naemlich eine Auskunft und keine Tapete.
    Der Normalfall sagt nichts; die Ausnahme steht da. */
 const staende=new Set();
 for(const s of gezeigt)if(s.price&&s.price.asOf)staende.add(s.price.asOf);
 const einStand=staende.size===1?[...staende][0]:null;

 for(const s of gezeigt){
  const ausnahme=s.factorState==='UNAVAILABLE'
   ?(s.factorReason==='NOT_AN_EQUITY_LISTING'?'Kein Aktienurteil — dieses Papier ist keine Aktie.':'Faktorzeile für diesen Titel nicht verfügbar.')
   :'';
  const eigenerStand=s.price&&s.price.asOf&&s.price.asOf!==einStand?'Stand '+s.price.asOf:'';
  liste.append(hitRow(s.ticker,s.name&&s.name!==s.ticker?s.name:'',ausnahme,
   s.price&&Number.isFinite(s.price.value)?n(s.price,2):'',eigenerStand));
 }
 /* Die ersten sechs bleiben in `liste`, alles weitere wandert in `listeRest`. */
 while(liste.children.length>6)listeRest.append(liste.children[6]);
 /* Vierzig Zeilen mit Kurs und Stichtag sind eine Zahlenwand - gemessen
    24,5 Zahlen je 100 Woerter, und das liest sich als "nicht fuer mich".
    Sie bleiben vollstaendig, aber zugeklappt: wer sucht, sucht oben. */
 main.append(card('Oder fang hier an',null,[
  einStand?el('p',{class:'muted',style:'font-size:13px;margin:0 0 10px',
   text:'Kurse: Stand '+einStand}):null,
  liste,
  mehr('Mehr Titel zum Durchsehen',()=>[listeRest,
   el('p',{class:'muted',text:'Keine Rangliste — die Reihenfolge bedeutet nichts.'}),
   link('Alle Zustände im Radar',href('radar'),'button secondary')])]));
 main.append(mehr('Wie viele Aktien könnt ihr überhaupt auswerten?',()=>[breite]));
}

function stockIdentity(s){
 const benannt=s.name&&s.name!==s.ticker;
 const kopf=el('section',{class:'q-ident'},[
  el('a',{class:'q-back',href:href('stocks'),text:'Zurück zu Aktien'}),
  el('h1',{text:benannt?s.name:'Aktienanalyse'})]);
 const zeile=el('p',{class:'q-ident-line'});
 zeile.append(el('strong',{text:s.ticker||''}));
 if(!benannt)zeile.append(el('span',{class:'muted',
  text:' · Für dieses Kürzel ist kein belegter Unternehmensname veröffentlicht.'}));
 kopf.append(zeile);
 /* KEIN KURS IN DIESEM KOPF. Er steht unmittelbar darunter im
    Kursblock - zusammen mit seinem Stichtag, seiner Basis und der
    Aktualitätszeile. Ihn hier zu wiederholen hiesse, dieselbe Zahl zweimal
    zu zeigen und die zweite ohne ihre Einschränkungen. */
 return kopf;
}
async function stockPage(ticker){const brief=await api.getIntelligenceBrief(ticker).catch(()=>null);
 const s=(brief&&brief.sources&&brief.sources.stock)||await api.getStockIntelligence(ticker);
 /* Kein Name heisst nicht: Ticker als Ueberschrift und Ticker als
    Untertitel. Dann steht die Ueberschrift fuer das, was sie ist. */
 /* IDENTITÄT ZUERST, IN EINER ZEILE LESBAR: Unternehmen, Kürzel, Kurs,
    Stichtag. Der alte Kopf trug die Augenbraue "Vision Universe · Preview"
    über dem Firmennamen - eine Zeile, die nichts über diesen Titel sagt,
    an der Stelle, an der ein Leser zuerst hinsieht. */
 main.append(stockIdentity(s));
 /* WENN ZWEI QUELLEN VERSCHIEDENE GESELLSCHAFTEN NENNEN, STEHT DAS OBEN.
  *
  * Gemessen am 28.09.2026 nach company-naming-1.0.0: bei 310 Kuerzeln nennen
  * die Emittentenebene (SEC ueber die CIK) und die Wertpapierebene (Metadaten
  * des Kursanbieters) verschiedene Gesellschaften - AACI "Armada Acquisition
  * Corp. III" gegen "Armada Acquisition Corp I", AEC "Anfield Energy" gegen
  * "Associated Estates Realty". Eine der beiden Angaben ist falsch, und lokal
  * ist nicht entscheidbar, welche. Ein Name, der ohne diesen Hinweis dasteht,
  * behauptet eine Zuordnung, die nicht belegt ist. */
 if(s.identityConflict)main.append(identitaetsHinweis(s));if(s.state!=='AVAILABLE'){main.append(notice(s.identityState==='AVAILABLE'?'Unternehmen im Produktuniversum':'Daten derzeit nicht verfügbar',s.identityState==='AVAILABLE'&&s.reason==='SOURCE_MISSING'?'Das Unternehmen ist im Wertpapierverzeichnis vorhanden. Die Daten können derzeit nicht geladen werden. Bitte versuche es später erneut.':s.identityState==='AVAILABLE'?'Dieser Titel ist im gemeinsamen Wertpapierverzeichnis vorhanden. Verfügbare Kurs- und Geschäftsjahresdaten werden darunter geladen. Für weitere Analysen kann die Datenabdeckung abweichen.':'Für diesen Titel liegen in dieser Ansicht keine freigegebenen Daten vor.'));
 if(s.identityState==='AVAILABLE'){
  const [history,fundamentals]=await Promise.all([api.getHistoricalPriceHistory(ticker),api.getHistoricalFundamentals(ticker)]);
  if(history.state==='AVAILABLE')main.append(el('section',{class:'section'},[el('h2',{text:'Kursentwicklung'}),QuantCharts.lineChart({title:ticker+' · tägliche Schlusskurse',width:Math.min(900,innerWidth-40),height:290,dates:history.bars.map(b=>b.date),series:[{values:history.bars.map(b=>b.close)}],yFormat:v=>v.toLocaleString('de-DE',{notation:'compact',maximumFractionDigits:1})}),el('p',{class:'muted',text:'Splitbereinigte Schlusskurse · '+history.currency+' · Stand '+history.asOf+'. Verfügbarer Tageszeitraum: '+history.availableFrom+' bis '+history.availableTo+'.'})]));
  else main.append(notice('Kurshistorie derzeit nicht verfügbar','Die gemeinsame Kursreihe konnte für diesen Titel nicht validiert oder geladen werden.'));
  main.append(el('p',{class:'muted',text:fundamentals.state==='AVAILABLE'?'Geschäftsjahresdaten sind verfügbar. Die Historienansicht zeigt Werte und Meldedaten.':'Fundamentaldaten sind für diesen Titel derzeit nicht darstellbar.'}),actions(s.workspaces));
  await liveStockSection(ticker);
 }
 return;}
 const left=el('section',{class:'focus'},[el('span',{class:'pill',text:s.above200.value>0&&s.above50.value>0?'Über wichtigen Trendbereichen':'Kursstruktur prüfen'}),el('div',{class:'quote',text:n(s.price,2)}),el('p',{class:'muted',text:'Letzter verfügbarer Schlusskurs · '+((s.price&&s.price.asOf)||s.asOf||'Datum nicht verfügbar')
   /* Der Kurs bringt sein eigenes Datum mit, wenn er aus der gezeichneten
      Reihe kommt - `s.asOf` traegt den Stand der Geschaeftszahlen und war
      fuer diese Titel leer, waehrend der Chart daneben bis zum 25.09. lief. */
   +((s.price&&s.price.basis==='PUBLISHED_CLOSE_FROM_SERIES')?' · Schlusskurs der Reihe, die unten gezeichnet ist':'')})]);
 /* ===============================================================
    DIE ANTWORT STEHT VOR DEM BELEG.

    Vorher verlangte diese Seite 1.046 Woerter und 17 Karten, bevor die
    Frage "ist das gut?" beantwortet war - erst Kurs, dann Chart, dann
    Faktoren, dann Setup. Wer 25 Euro im Monat spart, kommt dort nie an.

    Jetzt steht direkt unter dem Kurs eine Stufe im Klartext und bis zu
    vier Gruende in Alltagssprache. KEINE Gesamtnote: warum nicht, steht
    in plain-verdict.js. Der Datenstand rutscht in den Aufklapper - er
    ist wichtig, aber er ist nicht die Antwort. */
 const faktorQuelle=(brief&&brief.sources&&brief.sources.factors)||await api.getFactorEvidence(ticker).catch(()=>null);
 const klartext=faktorQuelle?VUPlainVerdict.urteil(faktorQuelle):null;
 if(klartext)left.append(verdictBlock(klartext,{hinweis:'Das ist eine Einordnung im Vergleich zu allen anderen Aktien – keine Empfehlung.'}));
 left.append(mehr('Wie aktuell sind diese Zahlen?',()=>[freshness(s.health,s.ticker)]));
 const chart=el('div'),ranges=el('div',{class:'ranges','aria-label':'Chart-Zeitraum'});
 function draw(id){S.clear(chart);if(!s.chart||s.chart.state!=='AVAILABLE'){chart.append(notice('Kurshistorie derzeit nicht verfügbar','Für diesen Titel ist noch keine validierte Materialisierung veröffentlicht.'));return;}const data=VUChartRanges.selectRange(id,{eod:s.chart.bars||[],adjustmentStatus:s.chart.adjustmentStatus});ranges.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.range===id);b.setAttribute('aria-pressed',b.dataset.range===id?'true':'false');});if(!data.ok){chart.append(notice('Dieser Zeitraum ist nicht verfügbar','Tagesverläufe benötigen freigegebene Intraday-Daten. Wähle einen längeren Zeitraum.'));return;}
 chart.append(QuantCharts.lineChart({title:s.ticker+' · historische Schlusskurse',width:Math.min(900,window.innerWidth-40),height:290,dates:data.bars.map(b=>b.date),series:[{values:data.bars.map(b=>b.close)}],yFormat:v=>vuFormat('formatPrice',v,'USD',{numberLocale:'de-DE',decimals:0})||v.toFixed(0)+' $'}));}
 VUChartRanges.RANGES.forEach(r=>ranges.append(el('button',{text:r.label,dataset:{range:r.id},onclick:()=>draw(r.id)})));
 /* Die Bildunterschrift sagt, was gezeichnet ist - und sie leitet es aus
    dem Zustand der Reihe ab, statt ihn zu behaupten. Vorher stand hier
    fest "Unbereinigte Schlusskurse", und das war richtig und falsch
    zugleich: richtig ueber die Daten, falsch gegenueber dem Vertrag, der
    den Chart auf splitbereinigte Kurse bindet. Jetzt ist die Reihe
    bereinigt, und wenn sie es einmal nicht sein kann, steht es da. */
 const chartBasis=s.chart&&s.chart.adjustmentStatus==='splitAdjusted'
  ?'Splitbereinigte Schlusskurse · USD. Splits sind herausgerechnet; der letzte Kurs ist der gehandelte.'
   +(s.chart.splitEvents?(s.chart.splitEvents===1?' Im vollen Zeitraum liegt ein Split.':' Im vollen Zeitraum liegen '+s.chart.splitEvents+' Splits.'):'')
  :'Unbereinigte Schlusskurse · USD. Für diese Reihe fehlen die Splitfaktoren, deshalb können Splits als Kurssprünge erscheinen.';
 /* ZWISCHEN KURS UND CHART - dort sucht ein Einsteiger die Antwort, und
    dort hat bisher der Chart gestanden. Bei 390 px ist das die erste
    Bildschirmhöhe nach dem Kurs. */
 const hatAuskunft=!!(brief&&brief.headline&&brief.headline.sentence);
 if(hatAuskunft)left.append(briefSection(brief,ticker,false));
 left.append(chart,ranges,el('p',{class:'muted',text:chartBasis}));draw('1Y');
 /* Alles, was die Seite braucht, VOR der Entscheidung ueber ihre Form -
    die Kursstruktur eingeschlossen. Sie wurde vorher erst unten geholt;
    die Form der Seite haengt aber an ihr. */
 const quellen=(brief&&brief.sources)||{};
 const [setupIndex,evidenceRow]=await Promise.all([
  api.getSetupScreenIndex().catch(()=>null),
  api.getFactorEvidenceScreening().then(r=>(r?.rows||[]).find(x=>x.ticker===ticker)||null).catch(()=>null)]);
 const setupObservation=quellen.setup||await api.getSetupObservation(ticker).catch(()=>null);
 const patterns=quellen.patterns||await api.getPatternMatch(ticker).catch(()=>null);
 const technical=quellen.technical||await api.getTechnicalIntelligence(ticker).catch(()=>({state:'UNAVAILABLE',reason:'SOURCE_MISSING'}));
 const shape=VUJourneyShape.assess(VUJourneyShape.stationsFrom(
  {stock:s,evidenceRow,setup:setupObservation,patterns,technical}));
 /* HOECHSTENS EINE GEHALTVOLLE STATION: dann ist eine Reise die falsche
    Form. Kein Chart ueber zwei Punkte, keine Leiste aus sieben Strichen -
    ein Satz, der sagt was ist, und die Zugaenge, die trotzdem offen sind. */
 if(shape.shape==='MINIMAL'){
  main.append(journeyGapSection(shape,ticker,true));
  main.append(actions([{label:'Alle Unternehmen',href:href('stocks')},
   {label:'Was Vision Universe messen kann',href:href('explain')},
   {label:'Bestehende Datenpruefung',href:'/quant/data-inspector/'}]));
  await liveStockSection(ticker);
  return;
 }
 const reduziert=shape.shape==='REDUCED';
 /* DER NEBENBLOCK SAGT NUR, WAS GEMESSEN IST.
    Stand hier bisher kein Wert fuer den 200-Tage-Durchschnitt, sagte die
    Seite trotzdem "Die langfristige Kursstruktur verdient einen genaueren
    Blick" - ein Satz, der eine Beurteilung behauptet, wo keine Zahl ist.
    Und darunter standen drei Zeilen "Nicht verfuegbar". */
 const hatDurchschnitt=Number.isFinite(s.above200&&s.above200.value);
 const side=el('aside',{},[el('h2',{text:'Was dahintersteht'}),
  el('p',{text:hatDurchschnitt
   ?(s.above200.value>0?'Der Kurs liegt über seinem 200-Tage-Durchschnitt. Das beschreibt die bisherige Entwicklung, keine Prognose.'
     :'Die langfristige Kursstruktur verdient einen genaueren Blick.')
   :'Für die Einordnung dieses Kursverlaufs fehlen die Durchschnittswerte. Woran das liegt, steht weiter unten.'}),
  evidence(s,reduziert),
  el('details',{},[el('summary',{text:'Evidenz & Methodik'}),el('p',{class:'muted',text:'Abstand zum 200-Tage-Durchschnitt: '+n(s.above200)+'. Fundamentaldaten bis '+s.fundamentalsAsOf+', verfügbar seit '+s.availableAt+'. Quelle: SEC EDGAR; Kurskennzahlen: Tiingo EOD / bestehende Quant-Methodik.'}),link('Daten und Berechnung untersuchen','/quant/data-inspector/','button secondary')])]);
 main.append(el('div',{class:'layout'},[left,side]));
 /* Zuerst die Frage, die jeder zuerst stellt. Die Leiste ist dieselbe
    Komponente wie in der Watchlist - ein zweiter Satz Faktornamen waere
    genau die Doppelsprache, die das Woerterbuch abschafft. */
 const strength=el('section',{class:'section strength-section'},[
  el('span',{class:'eyebrow',text:'Einordnung'}),el('h2',{text:LQ('factorDna')})]);
 const strip=factorStrip(evidenceRow);
 /* In der reduzierten Form steht eine Station nur da, wenn sie etwas zeigt.
    Eine Leiste aus sieben Strichen ohne einen einzigen Wert ist keine
    Antwort, und ihre Absage steht unten in der Gruppe - einmal, mit Zahl. */
 if(strip&&shape.substantive.includes('factorStrength')){
  strength.append(strip);
  /* WARUM HIER KEINE EINZELNE ZAHL STEHT.
     Der Entwurf zeigte an dieser Stelle "Quant Score 91/100". Den gibt es
     nicht - nicht weil er fehlt, sondern weil er abgelehnt ist: eine Zahl,
     die Qualitaet und Kursdynamik zu einem Wert verrechnet, verbirgt genau
     den Zielkonflikt, den ein Anleger sehen muss. Ein Leser, der die grosse
     Zahl sucht und sie nicht findet, verdient diesen Satz an der Stelle,
     an der er sie sucht - nicht erst in der Methodik. */
  strength.append(el('p',{class:'muted',style:'font-size:13.5px;max-width:640px',
   text:'Es gibt bewusst keine Gesamtnote. Eine Zahl, die alle Eigenschaften zu einem Wert verrechnet, würde den Zielkonflikt verbergen, auf den es ankommt — etwa hohe Qualität bei anspruchsvoller Bewertung. Die sieben Eigenschaften stehen deshalb einzeln da.'}));
  strength.append(link('Woran das gemessen wurde',href('quant',ticker),'button secondary'));
 }else if(!reduziert){strength.append(notice(LU('factorDna'),LB('factorDna')));}

 /* ===============================================================
    DIE BELEGE LIEGEN EINE EBENE TIEFER - ABER SIE LIEGEN DA.

    Die Antwort steht oben im Klartext. Alles hier ist der Beleg dafuer,
    und ein Beleg, den niemand aufschlaegt, muss auch keinen Platz auf
    dem ersten Bildschirm kosten. Geloescht ist nichts: jede Station der
    bisherigen Seite ist einen Griff entfernt, in derselben Reihenfolge
    wie vorher, mit demselben Inhalt.

    Die Titel der Aufklapper sind Fragen, keine Fachnamen. Wer nicht
    weiss, was ein Setup ist, findet es unter "Wie die Lage technisch
    aussieht" - und nicht unter einem Wort, das er erst lernen muss. */
 const faelle=await api.getHistoricalCases(ticker).catch(()=>null);
 const tiefe=[];
 if(strip&&shape.substantive.includes('factorStrength')||!reduziert)
  tiefe.push(['Die sieben Eigenschaften im Einzelnen',()=>[strength]]);
 if(!reduziert||shape.substantive.includes('setup'))
  tiefe.push(['Wie die Lage technisch aussieht',()=>[setupStateSection(setupObservation,setupIndex,ticker,hatAuskunft)]]);
 if(!reduziert||shape.substantive.includes('patterns'))
  tiefe.push(['Was in ähnlichen Lagen am Markt passierte',()=>[patternBalance(patterns,ticker,brief&&brief.pattern)]]);
 tiefe.push(['Was bei dieser Aktie früher passierte',()=>[historischeFaelleSection(faelle,ticker,s.name)]]);
 if(tiefe.length)main.append(card('Warum wir das sagen',
  'Jede Aussage oben lässt sich hier nachlesen.',
  tiefe.map(([titel,bauen])=>mehr(titel,bauen))));
 main.append(actions(s.workspaces));
 const business=el('section',{class:'section stock-business'},[el('span',{class:'eyebrow',text:'Geschäft, Bewertung und Risiko'}),el('h2',{text:'Was zeigen die Unternehmenszahlen?'}),el('p',{class:'muted',text:'Ergebnisse verstehen, den Preis einordnen und Schwankungen prüfen. Jede Kennzahl führt zu ihrer Definition und zur vollständigen Analyse.'})]);
 if(s.quant?.state==='AVAILABLE'){
  /* ZWEI ARBEITSFLAECHEN, ZWEI SAETZE KENNZAHL-NAMEN.
   *
   * Gemessen am 26.09.2026: der Panelweg liefert die Bewertungsfamilie als
   * `earningsYield`/`priceToFcf`, der breite Weg als
   * `priceEarnings`/`priceSales`/`fcfYield`. Diese Auswahl kannte nur die
   * ersten beiden - fuer jeden Titel ausserhalb des Panels stand deshalb die
   * Ueberschrift „Welcher Preis steht dem Geschaeft gegenueber?" ueber einem
   * leeren Kasten. Eine Frage ohne eine einzige Zeile darunter ist keine
   * Antwort; sie sieht wie ein Fehler aus. */
  const selected={quality:['operatingMargin','fcfMargin','netMargin'],growth:['revenueGrowth','epsGrowth'],
   value:['earningsYield','priceToFcf','priceEarnings','priceSales'],risk:['volatility','maxDrawdown']};
  /* Gemessen: bei ACAA sind 0 von 16 Kennzahlen veroeffentlicht, und dieses
     Gitter zeigte trotzdem acht Zeilen mit "Nicht verfuegbar". In der
     reduzierten Form stehen nur Kennzahlen, die einen Wert haben; die
     fehlenden erklaert die Gruppe unten, mit ihrer Zahl. */
  const zeige=(f,m)=>selected[f.id].includes(m.metricId)&&(!reduziert||m.state==='AVAILABLE');
  /* Ein Kasten entsteht nur, wenn wenigstens eine Zeile darin steht - in
     jeder Form, nicht nur in der verdichteten. */
  business.append(el('div',{class:'stock-evidence-grid'},s.quant.families.filter(f=>selected[f.id]&&(f.metrics||[]).some(m=>zeige(f,m))).map(f=>el('article',{'data-stock-family':f.id},[el('h3',{text:f.question}),...f.metrics.filter(m=>zeige(f,m)).map(m=>el('div',{class:'stock-evidence-metric'},[el('div',{},[el('span',{text:m.label}),el('strong',{text:m.reason==='SHARE_COUNT_NOT_ATTRIBUTABLE_TO_LISTING'?'Bewusst nicht genannt':formatFactor(m)})]),el('details',{},[el('summary',{text:'Warum ist das relevant?'}),el('p',{text:m.description}),el('p',{class:'muted',text:m.state==='AVAILABLE'?'Datenstand '+m.asOf+' · bekannt seit '+m.availableAt:kennzahlGrund(m)})])])),link(f.id==='growth'||f.id==='quality'?'Entwicklung über die Jahre':'Vollständige Kennzahlen & Methodik',f.id==='growth'||f.id==='quality'?href('fundamentals',ticker):href('quant',ticker)+'#factor-'+f.id,'stock-evidence-link')]))));
  business.append(el('p',{class:'muted',text:'Geschäftszahlen bis '+s.quant.fundamentalsAsOf+' · bekannt seit '+s.quant.availableAt+'. Marktbezogene Kennzahlen bis '+s.quant.asOf+'. Bewertungen sind kein Urteil über einen fairen Preis; vergangene Schwankungen sind keine Verlustprognose.'}));
 }else if(!reduziert)business.append(notice('Unternehmenskennzahlen derzeit nicht auswertbar','Die professionellen Analysezugänge bleiben erreichbar. Fehlende Kennzahlen werden nicht ersetzt.'));
 /* Auch die Geschaeftszahlen sind Beleg, nicht Antwort: sie beantworten
    "woran sieht man das", nicht "ist das gut". Derselbe Inhalt, ein Griff
    entfernt. */
 if(!reduziert||shape.substantive.includes('business'))main.append(mehr('Die Zahlen des Unternehmens',()=>[business]));
 const technicalGrund=technicalReasonText(technical.unavailability);
 const section=el('section',{class:'section'},[el('span',{class:'eyebrow',text:'Kursstruktur verstehen'}),el('h2',{text:LQ('technicalIntelligence')})]);
 if(technical.state==='AVAILABLE'){
  const detail=technical.fullWorkspace?[el('p',{text:'Elliott Wave: '+technical.elliott.label+'. Die Szenarien sind keine Wahrscheinlichkeitsprognose.'}),actions([{label:'Vollständige Technical-Analyse',href:technical.workspace},{label:'Elliott: Szenarien & Invalidation',href:technical.elliottWorkspace}])]:[el('p',{class:'muted',text:'Vorhandene Kursfaktor-Evidenz. '+(technicalGrund||'Ein vollständiges Technical- oder Elliott-Bundle ist für diesen Titel noch nicht publiziert.')}),actions([{label:'Vollständige Kursgeschichte',href:'/quant/stock/?ticker='+encodeURIComponent(ticker)}])];
  section.append(el('div',{class:'technical-summary'},[['Trend',technical.trend],['Momentum',technical.momentum],['Volatilität',technical.volatility]].map(([label,state])=>el('div',{},[el('span',{class:'muted',text:label}),el('h3',{text:state.label})]))),el('p',{class:'muted',text:'Analyse bis '+technical.asOf+' · '+technical.methodology}),analysisLagLine(technical.lag),...detail);
 }else if(!reduziert)section.append(notice('Technische Analyse derzeit nicht verfügbar',(technicalGrund?technicalGrund+' ':'')+'Der vollständige Workspace bleibt über die Analysezugänge erreichbar.'));
 if(!reduziert||shape.substantive.includes('technical'))main.append(section);
 /* Und ganz unten, einmal: was noch nicht geht und warum. Nicht als
    Fussnote, sondern als eigener Abschnitt - ein Leser soll nicht raten,
    ob die Seite zu Ende ist oder kaputt. */
 if(reduziert)main.append(journeyGapSection(shape,ticker,false));
 await liveStockSection(ticker);
}
async function technicalWorkspacePage(ticker,elliottMode){
 const data=await api.getTechnicalWorkspace(ticker);
 main.append(heading(elliottMode?'Elliott Wave · Szenarien verstehen':'Kursstruktur untersuchen',ticker+' · Chart, Evidenz und alternative Entwicklungen.'));
 if(data.state!=='AVAILABLE'){main.append(notice('Analyse derzeit nicht verfügbar','Die Daten erfüllen die Anforderungen dieser Ansicht derzeit nicht.'),actions([{label:'Bestehenden Workspace öffnen',href:'/quant/technical/?symbol='+encodeURIComponent(ticker)}]));return;}
 if(elliottMode&&['UNAVAILABLE','INSUFFICIENT_DATA'].includes(data.elliott?.status)){main.append(notice('Elliott-Zählung derzeit nicht verfügbar','Das Technical-Bundle ist gültig, enthält für diesen Titel aber keine validierte Elliott-Zählung.'),actions([{label:'Technical öffnen',href:href('technical',ticker)},{label:'Vollständige Kursgeschichte',href:href('stock',ticker)}]));return;}
 const root=el('section',{class:'technical-workspace'}),chart=el('div',{class:'technical-chart-host'}),select=el('select',{'aria-label':'Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name}))),layer=el('select',{'aria-label':'Chart-Ebene'},[['AUTO','Übersicht'],['STRUCTURE','Marktstruktur'],['TREND','Trend'],['MOMENTUM','Momentum'],['SUPPORT_RESISTANCE','Support / Resistance'],['FIBONACCI','Fibonacci'],['ELLIOTT','Elliott Wave']].map(([value,text])=>el('option',{value,text}))),range=el('select',{'aria-label':'Chart-Zeitraum'},[['1M','1 Monat'],['3M','3 Monate'],['6M','6 Monate'],['YTD','Seit Jahresbeginn'],['1Y','1 Jahr'],['5Y','5 Jahre'],['MAX','Max · vorhandenes Analysefenster']].map(([value,text])=>el('option',{value,text}))),mode=el('select',{'aria-label':'Chart-Darstellung'},[['candles','Kerzen'],['line','Linie']].map(([value,text])=>el('option',{value,text}))),alt=el('input',{type:'checkbox','aria-label':'Alternativen im Chart'}),labels=el('input',{type:'checkbox','aria-label':'Chart-Beschriftungen'});labels.checked=innerWidth>=650;
 select.value=ticker;select.onchange=()=>location.assign(href(elliottMode?'elliott':'technical',select.value));layer.value=elliottMode?'ELLIOTT':'AUTO';range.value='1Y';
 const draw=()=>{const annotations=data.chart.annotations.filter(a=>(a.layers||[]).includes(layer.value)||(alt.checked&&((a.layers||[]).includes('ALTERNATIVE')||(layer.value==='ELLIOTT'&&(a.layers||[]).includes('ELLIOTT_ALT')))));S.mount(chart,QuantCharts.technicalChart({bars:data.chart.bars,series:data.chart.series,annotations,annotationLabels:labels.checked,range:range.value,mode:mode.value,width:Math.max(300,Math.min(1168,main.clientWidth-40)),height:innerWidth<650?340:460,title:ticker+' · '+(elliottMode?'Elliott Wave':'Kursstruktur'),description:'Historische Kurse und ausdrücklich gekennzeichnete Projektionen. Keine Zukunftsdaten im Kursverlauf.'}));};
 layer.onchange=range.onchange=mode.onchange=alt.onchange=labels.onchange=draw;
 const primary=data.scenarios.find(s=>s.kind==='PRIMARY');
 root.append(el('div',{class:'workspace-toolbar'},[select,layer,range,mode,el('label',{class:'toggle'},[alt,el('span',{text:'Alternativen'})]),el('label',{class:'toggle'},[labels,el('span',{text:'Chart-Texte'})])]),el('div',{class:'workspace-meaning'},[el('h2',{text:elliottMode?data.elliott.label:(primary?primary.label+' · '+primary.status:'Kursstruktur im Detail')}),el('p',{class:'muted',text:'Analysestand: '+data.asOf+' · Szenarien beschreiben Bedingungen, keine gesicherten Vorhersagen.'})]),chart,el('p',{class:'chart-key',text:'Durchgezogen: Historie · farbig: laufende Struktur · gestrichelt: Projektion. Der Jetzt-Marker trennt Daten und Szenarien. Chart-Texte lassen sich einblenden; vollständige Zählungen und Bedingungen stehen darunter.'}),el('p',{class:'muted',text:'Analysefenster: '+data.chart.bars.timestamps[0]+' bis '+data.asOf+'. Kursbasis: '+(data.priceBasis==='SPLIT_ADJUSTED'?'splitbereinigt':data.priceBasis)+'. Max zeigt das vorhandene Analysefenster; weitere Kursgeschichte findest du in der Aktienanalyse.'}));main.append(root);draw();
 const price=v=>Number.isFinite(v)?v.toLocaleString('de-DE',{maximumFractionDigits:2}):'Nicht verfügbar';
 function countSection(count,label){if(!count)return notice(label,'Keine validierte Zählung verfügbar.');return el('section',{class:'wave-count'},[el('h3',{text:label}),el('p',{text:'Aktuelle Welle: '+(count.currentWave?.label||'Nicht verfügbar')+' · '+(count.currentWave?.status==='DEVELOPING'?'noch in Entwicklung':'Status im Detail prüfen')}),el('p',{text:'Invalidation: '+price(count.invalidation?.price)+' · '+(count.invalidation?.statement||'Bedingung nicht verfügbar')}),el('p',{text:'Projektionszonen: '+((count.projection?.zones||[]).map(z=>z.label+': '+price(z.zoneLow)+'–'+price(z.zoneHigh)).join(' · ')||'Keine bestätigten Zonen')}),el('details',{},[el('summary',{text:'Vollständige Zählung & Regeln'}),el('div',{class:'table-wrap',tabindex:'0'},[el('table',{},[el('thead',{},[el('tr',{},['Welle','Von','Bis','Status'].map(text=>el('th',{text})))]),el('tbody',{},(count.waves||[]).map(w=>el('tr',{},[el('td',{text:w.label}),el('td',{text:w.fromTime+' · '+price(w.fromPrice)}),el('td',{text:w.toTime+' · '+price(w.toPrice)}),el('td',{text:{CONFIRMED:'Bestätigt',DEVELOPING:'In Entwicklung',PROJECTED:'Projektion'}[w.status]||w.status})])))])]),...(count.hardRuleResults||[]).map(r=>el('p',{class:'muted',text:(r.passed===true?'Erfüllt: ':r.passed===false?'Verletzt: ':'Noch offen: ')+r.detail}))])]);}
 const wave=el('section',{class:'section'},[el('h2',{text:'Elliott · Zählungen und Grenzen'}),el('p',{class:'muted',text:'Method Fit bewertet, wie gut die Zählung zu den Regeln passt. Es ist keine Eintrittswahrscheinlichkeit.'}),countSection(data.elliott.primary,'Basiszählung'),countSection(data.elliott.alternative,'Alternative Zählung'),el('details',{},[el('summary',{text:'Confidence & Methodik'}),el('p',{text:'Method Fit: '+price(data.elliott.methodFit)+'/100. '+(data.elliott.disclaimer||'Keine Wahrscheinlichkeit.')}),el('p',{class:'muted',text:data.elliott.methodology})])]);
 const scenarios=el('section',{class:'section'},[el('h2',{text:'Szenarien & Invalidation'}),...data.scenarios.map(s=>el('article',{class:'scenario-row'},[el('div',{},[el('h3',{text:s.label}),el('span',{class:'muted',text:s.status})]),el('div',{},[el('p',{text:s.confirmation||'Bestätigungsbedingung nicht verfügbar'}),el('p',{text:'Invalidation: '+price(s.invalidation?.price)+' · '+(s.invalidation?.rule||'Bedingung nicht verfügbar')}),el('p',{text:'Zielzonen: '+(s.targets.map(t=>price(t.zoneLow)+'–'+price(t.zoneHigh)).join(' · ')||'Keine verfügbar')}),el('details',{},[el('summary',{text:'Evidenz und Gegenargumente'}),el('p',{text:s.expiration||'Ablaufbedingung nicht verfügbar'}),...s.support.map(e=>el('p',{text:'Dafür: '+e.statement})),...s.conflicts.map(e=>el('p',{text:'Dagegen: '+e.statement}))])])]))]);
 main.append(...(elliottMode?[wave,scenarios]:[scenarios,wave]),actions([{label:'Alle technischen Details im bestehenden Workspace',href:data.legacyHref},{label:'Vollständige Kursgeschichte',href:data.priceHistoryHref},{label:'Fundamentals',href:href('fundamentals',ticker)}]));
}
async function signalsPage(){
 main.append(heading('Was hat sich verändert?','Belegte Zustandswechsel aus vorhandenen Tagesschlusskursen.'));
 const lookback=[5,20,60].includes(Number(params.get('window')))?Number(params.get('window')):20,data=await api.getSignals({lookback});if(data.state!=='AVAILABLE'){main.append(notice('Änderungen derzeit nicht auswertbar','Ohne vergleichbare Kursbeobachtungen und freigegebene Daten erzeugen wir keine Signale.'));return;}
 const windowSelect=el('select',{'aria-label':'Signal-Zeitraum'},[5,20,60].map(n=>el('option',{value:String(n),text:n+' EOD-Beobachtungen'})));windowSelect.value=String(lookback);windowSelect.onchange=()=>location.assign(href('signals')+'&window='+windowSelect.value);
 const available=data.results.filter(r=>r.state==='AVAILABLE'),coverage=data.coverage||{requested:data.results.length,available:available.length,unavailable:data.results.length-available.length};
 main.append(el('p',{class:'scope-note',text:'Verfügbare Kursstände: '+[...new Set(available.slice(0,250).map(r=>r.asOf))].join(', ')+' · '+coverage.available+' von '+coverage.requested+' Unternehmen contract-konform geprüft'}));
 const eventTickers=[...new Set(data.events.map(e=>e.ticker))].sort(),requestedTicker=params.get('ticker'),companyTickers=[...new Set([...eventTickers,...(available.some(r=>r.ticker===requestedTicker)?[requestedTicker]:[])])].sort();
 const company=el('select',{'aria-label':'Signals Unternehmen'},[el('option',{value:'all',text:'Alle belegten Wechsel'}),...companyTickers.map(ticker=>el('option',{value:ticker,text:ticker}))]),target=el('div');
 main.append(el('div',{class:'workspace-controls'},[company,windowSelect]),el('p',{class:'muted',text:'Betrachtet werden die letzten '+lookback+' vorhandenen EOD-Beobachtungen je Unternehmen. Ein Wechsel liegt zwischen zwei angegebenen Daten; er ist kein Echtzeit- oder Handelssignal.'}));
 const evidenced=available.filter(r=>r.events?.length);
 main.append(el('details',{},[el('summary',{text:'Datenabdeckung & Beobachtungszeitraum'}),el('p',{text:coverage.available+' contract-konform auswertbar · '+coverage.unavailable+' nicht auswertbar · '+coverage.requested+' Produkttitel geprüft.'}),...evidenced.slice(0,200).map(r=>el('p',{text:r.ticker+' · Vergleich '+r.from+' bis '+r.asOf+' · '+r.events.length+' Wechsel'})),evidenced.length>200?el('p',{class:'muted',text:'Weitere '+(evidenced.length-200)+' Titel mit Wechseln sind in der Ergebnisliste enthalten.'}):null,el('p',{class:'muted',text:'Auswertung des heute vorhandenen Datenbestands. Keine Rekonstruktion des damaligen Wissensstands und kein Point-in-Time-Backtest. Der Kalender prüft Sitzungsschluss, keine endgültige Bestätigung durch den Anbieter.'})]));
 if(data.partial)main.append(notice('Nicht alle Unternehmen auswertbar','Die Übersicht ist unvollständig. Fehlende Quellen erzeugen keine Ersatzereignisse.'));
 function draw(){const matching=data.events.filter(e=>company.value==='all'||e.ticker===company.value),events=matching.slice(0,200);S.clear(target);if(!events.length){target.append(notice('Keine belegten Wechsel in diesem Ausschnitt','Ein unveränderter Zustand ist kein neues Signal. Die Regeln bleiben im Screener untersuchbar.'));return;}
 for(const e of events){const title=e.definitionId==='positive-momentum'?(e.transition==='ENTERED'?'Sechs-Monats-Entwicklung wieder nicht negativ':'Sechs-Monats-Entwicklung wird negativ'):(e.transition==='ENTERED'?'Zurück am langfristigen Trendbereich':'Unter den langfristigen Trendbereich gefallen');
 target.append(el('article',{class:'signal-event'},[el('div',{class:'signal-date'},[el('span',{class:'eyebrow',text:e.asOf}),link(e.ticker,href('stock',e.ticker))]),el('div',{},[el('h2',{text:title}),el('p',{class:'muted',text:'Regel: '+e.rule+'. Vergleich '+e.previousAsOf+' → '+e.asOf+'.'}),el('details',{},[el('summary',{text:'Warum wurde der Wechsel erkannt?'}),...e.evidence.map(m=>el('p',{text:(VUCatalog.field(m.metricId)?.label||m.metricId)+': '+m.previous.toLocaleString('de-DE',{maximumFractionDigits:3})+' % → '+m.current.toLocaleString('de-DE',{maximumFractionDigits:3})+' %'})),el('p',{class:'muted',text:'Historische Beobachtung, keine Kauf- oder Verkaufsempfehlung. '+(e.expiration.at?'Abgelöst durch die nächste vorhandene Beobachtung vom '+e.expiration.at+'.':'Letzte Beobachtung dieses Datensatzes. Keine laufende Überwachung behauptet.')}),el('p',{class:'muted',text:'Definition '+e.definitionId+' · v'+e.definitionVersion+' · Daten bis '+e.snapshotAsOf})]),link('Regel im Screener untersuchen',href('screener')+'&query='+encodeURIComponent(VUScreenerWorkspace.encode(e.query)),'button secondary')])]));
 }if(matching.length>events.length)target.append(el('p',{class:'muted',text:'Gezeigt werden 200 von '+matching.length+' belegten Wechseln. Bitte ein Unternehmen auswählen, um die Ansicht einzugrenzen.'}));}if(data.results.some(r=>r.state==='AVAILABLE'&&r.ticker===params.get('ticker')))company.value=params.get('ticker');company.onchange=draw;main.append(target,actions([{label:'Radar',href:href('radar')},{label:'Discover',href:href('discover')},{label:'Watchlist',href:href('watchlist')}]));draw();
}
/* Die Besetzung der Lagen zum Stichtag. Der Radar zeigt sonst WECHSEL;
   das hier ist der Bestand - wie viele Titel gerade wo stehen. Beides
   nebeneinander, weil 'was hat sich bewegt' und 'wo steht gerade wie
   viel' zwei verschiedene Fragen sind und eine Zahl die andere nicht
   beantwortet. Geschlossene Stufen tragen ihren Grund statt einer Null. */
function setupDistribution(index){
 if(!index||index.state!=='AVAILABLE')return null;
 const section=el('section',{class:'section setup-distribution'},[
  ...sectionHead('Lage im Markt','setupScreen'),
  el('p',{class:'muted',text:'Stand '+index.asOf+' · '+index.universe.toLocaleString('de-DE')+' ausgewertete Titel. Jeder Titel steht in genau einer Lage.'})]);
 for(const entry of index.states){
  const row=el('article',{class:'distribution-row'+(entry.availability.state==='AVAILABLE'?'':' is-pending')});
  row.append(el('div',{class:'distribution-head'},[
   el('span',{class:'setup-badge state-'+entry.state,text:L(entry.state)}),
   el('strong',{class:'distribution-count',text:entry.count===null?'–':entry.count.toLocaleString('de-DE')})]));
  row.append(el('p',{class:'muted',text:entry.availability.state==='AVAILABLE'?LB(entry.state):LB(entry.availability.reason)}));
  if(entry.availability.state!=='AVAILABLE'){
   row.append(el('p',{class:'muted',text:LU('setupStateCount')}));
  }else{
   for(const rule of entry.rules.filter(rule=>Array.isArray(rule.tickers)&&rule.tickers.length)){
    row.append(el('p',{class:'peer-tickers'},rule.tickers.slice(0,12).map(ticker=>link(ticker,href('quant',ticker),'peer-chip'))));
    row.append(link('Regel prüfen · '+rule.plain,href('screener')+'&setupRule='+encodeURIComponent(rule.ruleId),'button secondary'));
   }
  }
  section.append(row);
 }
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{class:'muted',text:'Zuordnung '+index.mappingVersion+' · '+index.methodologyVersion+'. Die Listen entstehen aus derselben Regel, die den Zustand eines einzelnen Titels bestimmt, und werden gegen sie geprüft. Ein Titel, auf den mehrere Regeln zutreffen, zählt bei der weitesten, deshalb ist eine Liste kürzer als die Treffermenge ihrer Regel allein.'}),
  el('p',{class:'muted',text:'Der Auffangzustand trägt keine Titelliste: er ist kein Merkmal, sondern das, was keine andere Regel genommen hat.'})]));
 return section;
}
/* Wie breit der gemessene Markt heute getragen ist. Ausdruecklich eine
   Beschreibung der Gegenwart: kein Timing-Signal, keine Prognose, keine
   Empfehlung. Die Uebergangsstufe steht sichtbar daneben als noch nicht
   freigeschaltet, damit ihre Abwesenheit nicht wie ein Befund aussieht. */
function marketRegimeSection(regime){
 const section=el('section',{class:'section regime-section'},[...sectionHead('Marktumfeld','marketRegime')]);
 if(!regime||regime.state!=='AVAILABLE'){
  section.append(notice(LU('marketRegime'),
   regime&&regime.reason&&VUProductLanguage.has(regime.reason)?LB(regime.reason):LB('marketRegime')));
  return section;
 }
 section.append(el('p',{class:'regime-lead'},[
  el('span',{class:'setup-badge state-'+regime.regime,text:L(regime.regime)}),
  el('span',{class:'muted',text:LB(regime.regime)})]));
 /* Der Regeltext stand hier einmal direkt unter der Einsteigererklaerung
    und sagte fast dasselbe - zwei fast gleiche Saetze untereinander lesen
    sich wie ein Fehler. Er gehoert ohnehin zur Methodik und steht jetzt
    dort, zusammen mit seiner Begruendung. */
 section.append(el('div',{class:'regime-grid'},(regime.measures||[]).map(m=>el('div',{class:'regime-measure'},[
  el('strong',{text:(m.share*100).toFixed(1).replace('.',',')+' %'}),
  el('span',{text:m.label}),
  el('span',{class:'muted',text:m.hits.toLocaleString('de-DE')+' von '+m.observed.toLocaleString('de-DE')+' Titeln'})]))));
 /* Dass es die drei Verlaufszustaende gibt und warum sie noch nichts
    sagen, steht daneben - sonst liest sich ihre Abwesenheit wie ein
    Befund. */
 if(regime.transitions&&regime.transitions.state!=='OPEN'){
  section.append(notice(L('MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED'),LB('MARKET_REGIME_TRANSITIONS_NOT_ACTIVATED')));
 }
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{},[el('strong',{text:regime.matchedRule.ruleId+': '}),el('span',{text:regime.matchedRule.plain})]),
  el('p',{class:'muted',text:regime.matchedRule.rationale}),
  el('p',{class:'muted',text:'Stand '+regime.asOf+' · '+regime.methodologyVersion+' über '+regime.universe.toLocaleString('de-DE')+' ausgewertete Titel. '+regime.scope.universe}),
  el('p',{class:'muted',text:regime.thresholdPolicy.note}),
  el('p',{class:'muted',text:regime.notAForecast})]));
 return section;
}
async function radarPage(){
 main.append(heading(LQ('radar'),LB('radar')));
 const lookback=[5,20,60].includes(Number(params.get('window')))?Number(params.get('window')):20;
 /* Der Strategie-Index stand hier einmal versehentlich mit im Abruf und
    wurde nie gelesen - ein Abruf, den niemand braucht, faellt beim Lesen
    des Codes nicht auf, beim Nutzer aber als Wartezeit. Hier stehen genau
    die drei Quellen, die diese Seite zeigt. */
 const [data,setupIndex,regime]=await Promise.all([
  api.getRadarIntelligence({lookback,limit:12}),
  api.getSetupScreenIndex().catch(()=>null),
  api.getMarketRegime().catch(()=>null)]);
 const regimeSection=marketRegimeSection(regime);
 if(data.state!=='AVAILABLE'){
  /* Der Bestand haengt nicht an den Wechseln. Faellt die eine Quelle aus,
     bleibt die andere sichtbar, statt die Seite leer zu lassen. */
  main.append(notice('Hier ist gerade nichts belegbar',LU('radar')));
  if(regimeSection)main.append(regimeSection);
  const standalone=setupDistribution(setupIndex);if(standalone)main.append(standalone);
  return;
 }
 const select=el('select',{'aria-label':'Radar-Zeitraum'},[5,20,60].map(value=>el('option',{value:String(value),text:value+' EOD-Beobachtungen'})));select.value=String(lookback);select.onchange=()=>location.assign(href('radar')+'&window='+select.value);
 main.append(el('div',{class:'workspace-controls'},[select]),el('p',{class:'scope-note',text:data.coverage.available+' von '+data.coverage.requested+' Produkttiteln contract-konform auswertbar · '+data.eventTickerCount+' Titel mit belegtem Wechsel · '+data.eventCount+' Wechsel im Zeitraum'}),el('p',{class:'muted',text:'Jedes Element ist ein retrospektiver EOD-Zustandswechsel. Es ist weder Echtzeit- noch Handels- oder Ranking-Signal. Ein Gesamtscore wird weiterhin nicht gebildet.'}));
 const grid=el('div',{class:'radar-grid'});for(const module of data.modules){const section=el('section',{class:'radar-module'},[el('h2',{text:module.title}),el('p',{class:'muted',text:module.description})]);if(!module.items.length)section.append(el('p',{text:'Keine belegten Wechsel in diesem Ausschnitt.'}));for(const event of module.items){const metric=event.evidence?.[0];section.append(el('article',{class:'radar-item'},[el('div',{},[link(event.ticker,href('stock',event.ticker)),el('span',{class:'muted',text:event.asOf+' · '+event.previousAsOf+' → '+event.asOf})]),el('p',{text:metric&&Number.isFinite(metric.previous)&&Number.isFinite(metric.current)?metric.previous.toLocaleString('de-DE',{maximumFractionDigits:2})+' % → '+metric.current.toLocaleString('de-DE',{maximumFractionDigits:2})+' %':event.rule}),link('Regel prüfen',href('screener')+'&query='+encodeURIComponent(VUScreenerWorkspace.encode(event.query)),'button secondary')]));}grid.append(section);}if(regimeSection)main.append(regimeSection);main.append(grid);const distribution=setupDistribution(setupIndex);if(distribution)main.append(distribution);main.append(actions([{label:'Alle Signals',href:href('signals')+'&window='+lookback},{label:'Watchlist',href:href('watchlist')},{label:'Screener',href:href('screener')} ]));
}
async function comparePage(){
 main.append(heading('Unternehmen im direkten Vergleich','Ertragskraft, Wachstum, Bewertung und Kursverhalten aus derselben Kennzahlenbasis.'));
 let selected;try{if(params.has('tickers')&&params.get('tickers').length>51)throw Error('INVALID_COMPARISON');const first=params.get('ticker')||'NVDA';selected=VUCompareWorkspace.validate(params.has('tickers')?params.get('tickers').split(','):[first,first==='MSFT'?'AAPL':'MSFT']);}catch{main.append(notice('Vergleichsauswahl prüfen','Wähle zwei bis vier unterschiedliche Ticker. Diese Auswahl wird nicht automatisch ersetzt.'),link('Neuen Vergleich öffnen',href('compare'),'button'));return;}
 const controls=el('div',{class:'compare-controls'}),topic=el('select',{'aria-label':'Vergleich Bereich'},[['all','Alle Kennzahlen'],['quality','Ertragskraft'],['growth','Wachstum'],['value','Bewertung'],['momentum','Kursstärke'],['risk','Kursrisiko']].map(([value,text])=>el('option',{value,text}))),target=el('section'),saved=link('Diese Auswahl erneut öffnen',href('compare'),'button secondary');let request=0,last;
 function inputs(){S.clear(controls);selected.forEach((ticker,index)=>{const options=[...new Set([...universe.stocks.map(s=>s.ticker),...selected])],select=el('select',{'aria-label':'Vergleich Unternehmen '+(index+1)},options.map(t=>el('option',{value:t,text:t,disabled:t!==ticker&&selected.includes(t)})));select.value=ticker;select.onchange=()=>{selected[index]=select.value;inputs();draw();};controls.append(el('div',{class:'compare-company'},[el('label',{},[el('span',{text:'Unternehmen '+(index+1)}),select]),selected.length>2?el('button',{class:'button secondary',text:'Entfernen','aria-label':ticker+' aus Vergleich entfernen',onclick:()=>{selected.splice(index,1);inputs();draw();}}):null]));});
 const next=universe.stocks.find(s=>!selected.includes(s.ticker));if(selected.length<4)controls.append(el('button',{class:'button secondary',text:'Unternehmen hinzufügen',disabled:!next,onclick:()=>{if(next){selected.push(next.ticker);inputs();draw();}}}));saved.href=href('compare')+'&tickers='+encodeURIComponent(selected.join(','));
 }
 function evidenceTable(data){S.clear(target);if(data.state!=='AVAILABLE'){target.append(notice('Vergleich derzeit nicht auswertbar','Für die gewählten Unternehmen fehlen belastbare Daten. Deine Auswahl bleibt erhalten.'));return;}
 const headers=[el('th',{scope:'col',text:'Kennzahl'}),...data.companies.map(c=>el('th',{scope:'col'},[link(c.ticker,href('stock',c.ticker)),el('span',{class:'muted',text:c.state==='AVAILABLE'?'Geschäftsdaten '+c.fundamentalsAsOf:'Daten nicht verfügbar'}),c.state==='AVAILABLE'?el('span',{class:'muted',text:'Bekannt seit '+c.availableAt}):null,c.state==='AVAILABLE'?el('span',{class:'muted',text:'Kurse '+c.asOf}):null]))];
 const rows=[];for(const f of data.families.filter(f=>topic.value==='all'||f.id===topic.value)){
  rows.push(el('tr',{class:'compare-family'},[el('th',{scope:'rowgroup',colspan:String(data.companies.length+1),text:f.label+' · '+f.question})]));
  for(const m of f.metrics){const cells=m.values.map(v=>el('td',{class:v.value===null?'muted':''},[el('strong',{text:formatFactor({...m,value:v.value})})]));rows.push(el('tr',{},[el('th',{scope:'row'},[el('span',{text:m.label}),el('details',{},[el('summary',{text:'Definition'}),el('p',{text:m.description})])]),...cells]));}
 }
 target.append(el('p',{class:'scope-note',text:'Berichtszeiträume können voneinander abweichen. Prüfe die Datenstände je Spalte. Der Vergleich enthält keine Rangfolge oder Kaufempfehlung.'}),el('p',{class:'compare-scroll-hint muted',text:'Auf kleinen Bildschirmen seitlich wischen, um alle Unternehmen zu sehen.'}),el('div',{class:'table-wrap compare-table',tabindex:'0','aria-label':'Unternehmensvergleich, horizontal scrollbar'},[el('table',{},[el('thead',{},[el('tr',{},headers)]),el('tbody',{},rows)])]));if(data.partial)target.append(notice('Nicht alle Unternehmen auswertbar','Spalten ohne freigegebene oder passende Daten bleiben erhalten und werden nicht durch Ersatzwerte gefüllt.'));
 }
 async function draw(){const current=++request;last=null;S.mount(target,el('p',{class:'muted',text:'Vergleich wird aktualisiert …'}));const data=await api.getComparison(selected);if(current!==request)return;last=data;evidenceTable(data);}
 topic.onchange=()=>{if(last)evidenceTable(last);};inputs();main.append(controls,el('div',{class:'compare-actions'},[el('label',{},[el('span',{text:'Analysebereich'}),topic]),saved]),target,actions([{label:'Eigene Auswahl screenen',href:href('screener')},{label:'Alle Research-Workspaces',href:href('research')}]));await draw();
}
async function atlasPage(){
 main.append(el('div',{class:'atlas-intro'},[el('img',{src:'/assets/atlas.png',alt:'Atlas',width:'88',height:'88'}),heading('Ask Atlas · verstehen, was dahintersteht','Geführte Fragen mit belegten Antworten aus Vision Universe®.')]),el('p',{class:'scope-note',text:'Diese Vorschau nutzt feste Fragen und vorhandene Produktdaten, kein angeschlossenes Sprachmodell. Freie KI-Unterhaltung ist noch nicht aktiviert.'}));
 const tools=VUAtlasTools.create(api),company=el('select',{'aria-label':'Atlas Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name}))),question=el('select',{'aria-label':'Atlas Frage'},[['quality','Wie profitabel arbeitet das Unternehmen?'],['growth','Wie verändert sich das Geschäft?'],['value','Wie wird das Unternehmen bewertet?'],['momentum','Wie hat sich der Kurs entwickelt?'],['risk','Wie stark schwankte der Kurs?'],['technical','Was sagt die technische Analyse?']].map(([value,text])=>el('option',{value,text}))),answer=el('section',{class:'atlas-answer','aria-live':'polite'});company.value=params.get('ticker')||'NVDA';let request=0;
 async function draw(){const current=++request,ticker=company.value,topic=question.value;S.mount(answer,el('p',{class:'muted',text:'Vorhandene Evidenz wird geladen …'}));const result=await tools.call(topic==='technical'?'getTechnicalEvidence':'getQuantEvidence',{ticker});if(current!==request)return;S.clear(answer);
  if(!result.ok||result.data?.state!=='AVAILABLE'){answer.append(notice('Dazu fehlt derzeit belastbare Evidenz','Ohne verfügbare Produktdaten erzeugt Atlas keine Ersatzantwort oder erfundene Kennzahlen.'));return;}
  const data=result.data;
  if(topic==='technical')answer.append(el('h2',{text:'Die Kursstruktur von '+ticker}),el('p',{class:'muted',text:'Analyse bis '+data.asOf+' · '+data.methodology}),el('div',{class:'technical-summary'},[['Trend',data.trend],['Momentum',data.momentum],['Volatilität',data.volatility]].map(([label,state])=>el('div',{},[el('span',{class:'muted',text:label}),el('h3',{text:state.label})]))),data.fullWorkspace?el('p',{text:'Elliott Wave: '+data.elliott.label+'. Szenarien und Confidence sind keine garantierten Wahrscheinlichkeiten.'}):el('p',{text:'Technische Basisevidenz ist verfügbar; ein vollständiges Technical-/Elliott-Bundle ist für diesen Titel nicht publiziert.'}),actions(data.fullWorkspace?[{label:'Technische Evidenz untersuchen',href:data.workspace},{label:'Elliott-Szenarien',href:data.elliottWorkspace}]:[{label:'Aktie untersuchen',href:href('stock',ticker)}]));
  else{const family=data.families.find(f=>f.id===topic);answer.append(el('span',{class:'eyebrow',text:data.name}),el('h2',{text:family.question}),el('p',{class:'muted',text:'Geschäftsdaten bis '+data.fundamentalsAsOf+' · verfügbar seit '+data.availableAt+' · Kurse bis '+data.asOf}),...family.metrics.map(m=>el('article',{class:'atlas-evidence'},[el('div',{},[el('h3',{text:m.label}),el('p',{class:'muted',text:m.description})]),el('strong',{text:formatFactor(m)}),el('details',{},[el('summary',{text:'Beleg & Definition'}),el('p',{text:'Kennzahl '+m.registryId+' · Definition '+m.definitionVersion+' · Stand '+m.asOf}),el('p',{class:'muted',text:m.state==='AVAILABLE'?'Unveränderter Wert aus dem bestehenden Produktvertrag.':'Diese Kennzahl ist in der aktuellen Quelle oder Freigabe nicht verfügbar.'})])])),actions([{label:'Vollständige Quant-Analyse',href:href('quant',ticker)},{label:'Fundamental-Historie',href:href('fundamentals',ticker)},{label:'Aktie untersuchen',href:href('stock',ticker)}]));}
  answer.append(el('p',{class:'muted atlas-limit',text:'Die Einordnung beschreibt vorhandene Daten, keine Kaufempfehlung. Es werden keine zusätzlichen Scores, Kursziele oder historischen Ergebnisse generiert.'}));
 }
 company.onchange=question.onchange=draw;main.append(el('div',{class:'atlas-controls'},[el('label',{},[el('span',{text:'Unternehmen'}),company]),el('label',{},[el('span',{text:'Deine Frage'}),question])]),answer,el('details',{},[el('summary',{text:'Wie Atlas an seine Antworten kommt'}),el('p',{text:'Diese Antworten werden aus denselben Produktdiensten wie Quant, Technical und Fundamentals zusammengestellt. Die zugehörigen Werkzeuge sind ausschließlich lesend; sie können weder freien Code ausführen noch beliebige Quellen abrufen oder eine Strategie speichern.'}),el('p',{text:'Ein später angebundenes Sprachmodell kann diese strukturierten Werkzeuge nutzen. In dieser Ansicht werden noch keine Fragen an einen KI-Anbieter übertragen.'}),link('Bisheriger AI-Workspace','/quant/ai/','button secondary')]));await draw();
}
/* =========================================================================
   HOME — "WAS KANN ICH HIER TUN?"

   Die alte Startseite begann mit fünf kuratierten Titeln. Das beantwortet
   die Frage eines Nutzers, der schon weiss, was Quant ist - also fast
   keines. Diese Seite beantwortet zuerst die Produktfrage und führt dann
   in die drei Einstiege.

   "Heute im Fokus" ist bewusst KEIN erfundener Feed: es sind die
   veröffentlichten Setup-Zustände mit ihrer eigenen Regel und ihrem
   eigenen Stichtag. Sie ändern sich mit jeder Materialisierung, sie sind
   erklärbar, und wenn das Artefakt fehlt, steht dort nichts Erfundenes,
   sondern der Einstieg über Screener und Methodik.
   ========================================================================= */
async function homePage(){
 let tickers=[],storageUnavailable=false;try{tickers=VUWatchlistWorkspace.load(localStorage);}catch{storageUnavailable=true;}
 const [data,setup,regime]=await Promise.all([api.getHomeIntelligence(tickers),api.getSetupScreenIndex().catch(()=>({state:'UNAVAILABLE'})),api.getMarketRegime().catch(()=>null)]);

 /* ===============================================================
    DER ERSTE BILDSCHIRM HAT EINE AUFGABE: "was kann ich hier tun?"

    Vorher standen hier 551 Woerter in sechs Karten - Nutzenversprechen,
    vier Schritte, drei Kacheln, Transparenzversprechen, Watchlist und
    Datenstand, alles gleichzeitig. Wer 25 Euro im Monat spart, liest das
    nicht, der wischt weg.

    Jetzt: ein Satz, drei Wege, die Lage. Alles Weitere liegt zu und
    bleibt einen Griff entfernt. Geloescht wurde nichts. */
 main.append(el('section',{class:'q-hero'},[
  el('h1',{text:'Aktien verstehen, ohne Vorwissen.'}),
  el('p',{class:'q-hero-lead',text:'Wir prüfen jede Aktie nach denselben Regeln und sagen dir in einem Satz, was dafür und was dagegen spricht.'}),
  el('a',{class:'q-hero-cta',href:href('stocks'),text:'Eine Aktie prüfen'})]));

 main.append(el('nav',{class:'q-wege','aria-label':'Die drei Wege'},[
  weg('search','Aktie prüfen','Du hast einen Namen im Kopf.',href('stocks')),
  weg('filter','Aktien finden','Du weißt noch nicht, welche.',href('screener')),
  weg('shield','Wie wir das machen','Du willst wissen, ob du uns trauen kannst.',href('explain'))]));

 /* ---- HEUTE IM FOKUS: echte Produktzustände oder gar keine ---- */
 const fokus=el('div',{});
 if(setup&&setup.state==='AVAILABLE'&&Array.isArray(setup.states)){
  const nachZustand=Object.fromEntries(setup.states.map(s=>[s.state,s]));
  /* Drei Zustaende, je vier Woerter. Die langen Erklaersaetze von vorher
     stehen jetzt im Aufklapper darunter. */
  const zeigbar=[
   ['CONFIRMED','Alles erfüllt'],
   ['SETUP_FORMING','Fast so weit'],
   ['WATCH','Im Blick behalten']
  ].filter(([id])=>nachZustand[id]&&Number.isFinite(nachZustand[id].count)&&nachZustand[id].count>0);
  if(zeigbar.length){
   fokus.append(el('div',{class:'q-zahlen'},zeigbar.map(([id,titel])=>{
    const s=nachZustand[id],regel=(s.rules||[]).find(r=>Array.isArray(r.tickers)&&r.tickers.length);
    /* Der Screener liest `setupRule` (eine Regel-ID), nicht den Zustand:
       ein Zustand kann mehrere Regeln haben, und die Fläche zeigt die
       Regel, nicht den Sammelbegriff. */
    const ziel=regel&&regel.screenable?href('screener')+'&setupRule='+encodeURIComponent(regel.ruleId):href('radar');
    return el('a',{class:'q-zahl',href:ziel},[
     el('span',{class:'q-zahl-n',text:s.count.toLocaleString('de-DE')}),
     el('span',{class:'q-zahl-t',text:titel})]);
   })));
   fokus.append(mehr('Was heißt das?',()=>[
    el('p',{text:'Wir prüfen jeden Tag alle Aktien auf dieselben Bedingungen: Trend, Struktur und Umsatz. „Alles erfüllt" heißt, dass alle drei gleichzeitig zutreffen. „Fast so weit" heißt, einer fehlt noch.'}),
    el('p',{class:'muted',text:'Stand: '+(setup.asOf||'nicht angegeben')+'. Das ist keine Kaufliste, sondern eine Auswertung.'}),
    marketRegimeSection(regime)]));
  }
 }
 if(!fokus.children.length){
  fokus.append(el('p',{text:'Heute liegt keine ausgewertete Lage vor. Wir erfinden dann keine.'}));
  fokus.append(mehr('Was jetzt trotzdem geht',()=>[
   el('p',{text:'Du kannst jede einzelne Aktie prüfen und im Screener nach Kriterien suchen. Beides braucht die Tagesauswertung nicht.'}),
   marketRegimeSection(regime)]));
 }
 main.append(card('Heute',null,[fokus],['Alle ansehen',href('radar')]));

 /* ---- Alles Weitere: vorhanden, aber zugeklappt ---- */
 const eigene=el('div',{});
 if(storageUnavailable)eigene.append(el('p',{text:'Deine gespeicherte Liste ist gerade nicht lesbar. Sie wird nicht gelöscht.'}));
 else if(!data.watchlist||data.watchlist.state==='EMPTY')eigene.append(el('p',{text:'Du beobachtest noch keine Aktie.'}));
 else{
  const liste=el('div',{class:'q-hitlist'});
  for(const s of data.watchlist.members.slice(0,4)){
   liste.append(hitRow(s.ticker,null,
    s.state!=='AVAILABLE'?'Gerade nicht auswertbar'
     :!Number.isFinite(s.above200&&s.above200.value)?'Trend gerade nicht auswertbar'
     :s.above200.value>=0?'Läuft über dem langfristigen Trend':'Läuft unter dem langfristigen Trend',
    '',s.state==='AVAILABLE'?'Kurs vom '+s.asOf:''));
  }
  eigene.append(liste);
 }
 eigene.append(link(tickers.length?'Liste öffnen':'Liste anlegen',href('watchlist'),'button secondary'));
 main.append(card('Deine Aktien',null,[eigene]));

 const session=el('div',{class:'home-session'});
 function showSession(s){S.clear(session);session.append(
  el('div',{},[el('strong',{text:s.label}),el('span',{class:'muted',text:s.state==='AVAILABLE'?' · Stand '+s.localDate+' '+s.localTime.slice(0,5)+' New York':' · gerade nicht verfügbar'})]),
  el('span',{class:'pill',text:'Kurse: letzter Tagesstand'}));}
 showSession(data.session);
 main.append(mehr('Woher die Zahlen kommen',()=>[
  el('p',{text:'Keine Echtzeitkurse. Auch bei geöffneter Börse siehst du den letzten Tagesstand.'}),
  session,freshness(data.health)]));
 let refreshing=false;const timer=setInterval(async()=>{if(document.hidden||refreshing)return;refreshing=true;
  try{showSession(await api.getMarketSession());}finally{refreshing=false;}},60000);
 addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
/* Ein Weg ist eine Frage, die der Nutzer schon hat - nicht ein Name,
   den er erst lernen muss. Deshalb steht unter jedem die Lage, in der
   man ihn waehlt, und nicht die Funktion, die dahinter liegt. */
function weg(icon,titel,lage,url){
 return el('a',{class:'q-weg',href:url},[
  el('span',{class:'q-ico'},[glyph(icon)]),
  el('span',{class:'q-weg-t',text:titel}),
  el('span',{class:'q-weg-l',text:lage})]);
}
/* Kompakte Faktorlage für Listenansichten: dieselbe kanonische Reihenfolge
   und dieselben Bänder wie die Faktor-Auswertung, nur ohne Aufklappen. Ein
   Faktor ohne Wert bleibt sichtbar leer statt zu verschwinden - sonst sähen
   sechs von sieben Faktoren aus wie sieben. */
function factorStrip(row){
 if(!row)return null;
 const cells=VUFactorEvidence.FACTOR_ORDER.map(id=>{
  const value=row['quantV2.factorEvidence.'+id],
   meaning=VUFactorEvidence.FACTOR_MEANING[id],
   band=Number.isFinite(value)?VUFactorEvidence.band(value):null;
  return el('div',{class:'strip-cell',title:meaning.label+': '+(Number.isFinite(value)?pct(value):'nicht verfügbar')},[
   el('span',{class:'strip-label',text:meaning.label}),
   el('span',{class:'strip-bar','aria-hidden':'true'},[el('span',{class:'band-'+(band?band.id:'NONE'),
    style:'width:'+(Number.isFinite(value)?Math.max(3,Math.min(100,value)):0)+'%'})]),
   el('span',{class:'strip-value',text:Number.isFinite(value)?pct(value):'–'})]);
 });
 const rated=row['quantV2.factorEvidence.availableFactors'];
 return el('div',{class:'factor-strip'},[
  el('div',{class:'strip-head'},[el('span',{class:'eyebrow',text:'Stärken & Schwächen'}),
   el('span',{class:'muted',text:(Number.isFinite(rated)?rated:0)+' von 7 bewertet'})]),
  el('div',{class:'strip-grid'},cells)]);
}
async function watchlistPage(){
 main.append(heading('Deine Unternehmen im Blick','Beobachte selbst gewählte Titel und vertiefe ihre aktuelle Entwicklung.'));
 let selected;try{selected=VUWatchlistWorkspace.load(localStorage);}catch{main.append(notice('Gespeicherte Watchlist nicht lesbar','Die vorhandenen Einträge bleiben erhalten und werden nicht automatisch überschrieben.'),link('Bisherige Watchlist öffnen','/quant/watchlist/','button secondary'));return;}
 const ticker=el('input',{type:'text',maxlength:'12',placeholder:'z. B. NVDA','aria-label':'Watchlist Ticker'}),message=el('div',{'aria-live':'polite'}),target=el('section',{'aria-live':'polite'});let request=0;
 const changed=()=>S.mount(message,notice('Auswahl noch nicht gespeichert','Speichere deine Watchlist, um sie beim nächsten Öffnen wiederzufinden.'));
 /* Eine Abfrage für die ganze Liste statt eine je Titel: die Evidenztabelle
    ist genau dafür da. */
 let evidenceRows=null;
 async function evidenceFor(ticker){
  if(evidenceRows===null){const screening=await api.getFactorEvidenceScreening().catch(()=>null);
   evidenceRows=new Map((screening?.rows||[]).map(row=>[row.ticker,row]));}
  return evidenceRows.get(ticker)||null;
 }
 /* DIESELBE REGEL, AUF DER WATCHLIST GELESEN.

    Eine Watchlist beantwortet bisher "wie steht mein Titel heute". Die
    Frage danach ist "hat sich etwas geaendert" - und die Zuordnung zu
    einem Anlagestil ist genau dieselbe Regel, die der Screener anwendet
    und die ein Alarm beobachten wuerde (§20: eine Regel, drei Leser).

    Gemessen zwischen den Staenden 2026-09-23 und 2026-09-24: 36 von 6.437
    Titeln haben ihre Zuordnung gewechselt. Auf einer Watchlist von zehn
    Titeln ist das selten - und deshalb steht die Zeile nur bei einem
    Wechsel, damit sie etwas bedeutet, wenn sie da ist. */
 async function changeFor(ticker){return api.getAssignmentChange(ticker).catch(()=>null);}
 async function draw(){const id=++request,data=await api.getWatchlistIntelligence(selected);if(id!==request)return;S.clear(target);
  if(data.state==='EMPTY'){target.append(notice('Wen möchtest du beobachten?','Füge deinen ersten Ticker hinzu. Die Watchlist startet ohne Beispielbestände.'));return;}
  if(!Array.isArray(data.members)){target.append(notice('Auswahl derzeit nicht auswertbar','Deine Eingaben bleiben erhalten.'));return;}
  const coverage=data.coverage||{};target.append(el('p',{class:'scope-note',text:data.members.length+' Titel ausgewählt · '+data.members.filter(s=>s.state==='AVAILABLE').length+' im verfügbaren Analysebereich'+(coverage.selectable?' · '+coverage.selectable+' Produkttitel auswählbar · '+coverage.signalsCapable+' Signals- · '+coverage.technicalCapable+' Technical- · '+coverage.elliottCapable+' Elliott-capable':'' )}));
  for(const s of data.members){const available=s.state==='AVAILABLE',trend=s.above200?.value;
   const intelligence=s.intelligence||{},signal=intelligence.signals||{},technical=intelligence.technical||{},elliott=intelligence.elliott||{},recent=Array.isArray(signal.events)?signal.events.length:0;
   target.append(el('article',{class:'watchlist-member'},[el('div',{},[link(s.ticker,href('stock',s.ticker)),el('p',{class:'muted',text:s.name}),el('button',{class:'button secondary',text:'Entfernen','aria-label':s.ticker+' aus Watchlist entfernen',onclick:()=>{selected=selected.filter(t=>t!==s.ticker);changed();draw();}})]),el('div',{},[
    el('h2',{text:!available?'Analyse noch nicht verfügbar':!Number.isFinite(trend)?'Trend noch nicht einordenbar':trend>=0?'Am langfristigen Trendbereich oder darüber':'Unter dem langfristigen Trendbereich'}),
    available?el('p',{class:'muted',text:'Schlusskurs '+n(s.price,2)+' · Kursstand '+s.asOf}):el('p',{class:'muted',text:'Für diesen Ticker fehlen in dieser Ansicht Daten oder die Anzeigefreigabe. Er bleibt auf deiner Liste.'}),
    available?evidence(s):null,
    factorStrip(await evidenceFor(s.ticker)),
    (change=>change&&change.state==='CHANGED'?assignmentChangeLine(change):null)(await changeFor(s.ticker)),
    el('p',{class:'capability-line',text:(signal.state==='AVAILABLE'?'Signals verfügbar · '+recent+' Wechsel in 60 EOD-Beobachtungen':'Signals nicht verfügbar')+' · '+(technical.state==='AVAILABLE'?'Technical verfügbar':'Technical nicht verfügbar')+' · '+(elliott.state==='AVAILABLE'?'Elliott verfügbar':'Elliott nicht verfügbar')}),
    available?el('details',{},[el('summary',{text:'Warum diese Einordnung?'}),el('p',{text:'Abstand zum 200-Tage-Durchschnitt: '+n(s.above200)+'. Die Aussage beschreibt den vorhandenen Kursstand, keine Prognose und keinen neuen Zustandswechsel.'}),el('p',{class:'muted',text:'Geschäftsdaten bis '+s.fundamentalsAsOf+' · verfügbar seit '+s.availableAt})]):null,
    actions(available?[{label:'Aktie untersuchen',href:href('stock',s.ticker)},{label:'Quant-Analyse',href:href('quant',s.ticker)},...(signal.state==='AVAILABLE'?[{label:'Historische Änderungen',href:href('signals',s.ticker)+'&window=60'}]:[]),...(technical.state==='AVAILABLE'?[{label:'Technical',href:technical.workspace}]:[]),...(elliott.state==='AVAILABLE'?[{label:'Elliott',href:elliott.workspace}]:[]),{label:'Fundamental-Historie',href:href('fundamentals',s.ticker)}]:[{label:'Analysebereich öffnen',href:href('research')}])
   ])]));
  }
 }
 const add=el('button',{class:'button secondary',text:'Titel hinzufügen',onclick:()=>{try{const symbol=ticker.value.trim().toUpperCase();selected=VUWatchlistWorkspace.validate([...selected,symbol]);ticker.value='';changed();draw();}catch{S.mount(message,notice('Ticker prüfen','Verwende einen gültigen Ticker, der noch nicht auf deiner Liste steht.'))}}}),save=el('button',{class:'button',text:'Watchlist speichern',onclick:()=>{try{VUWatchlistWorkspace.save(localStorage,selected);S.mount(message,notice('Watchlist gespeichert','Nur in diesem Browser gespeichert. Keine automatische Überwachung oder Benachrichtigung.'));}catch{S.mount(message,notice('Speichern nicht möglich','Deine Eingaben bleiben sichtbar. Der Browserspeicher ist möglicherweise nicht verfügbar.'));}}});
 main.append(el('div',{class:'watchlist-editor'},[el('label',{},[el('span',{text:'Unternehmen auswählen'}),ticker]),add,save]),message,target,el('details',{},[el('summary',{text:'Bestehende Watchlist & Speicherung'}),el('p',{text:'Diese Vorschau speichert deine Auswahl getrennt von der bisherigen Watchlist. Vorhandene Einträge und deren Funktionen bleiben unverändert. Beispielauswahlen werden nicht automatisch importiert.'}),link('Bisherige Watchlist öffnen','/quant/watchlist/','button secondary')]),actions([{label:'Unternehmen entdecken',href:href('discover')},{label:'Portfolio',href:href('portfolio')}]));await draw();
}
async function portfolioPage(){
 main.append(heading('Deine Positionen im Zusammenhang','Trage Bestände ein und untersuche ihren Wert und ihre Gewichtung.'));
 let positions;try{positions=VUPortfolioWorkspace.load(localStorage);}catch{main.append(notice('Gespeicherte Bestände nicht lesbar','Die vorhandenen Daten bleiben erhalten. Diese Ansicht überschreibt sie nicht automatisch.'));return;}
 const ticker=el('input',{type:'text',placeholder:'NVDA',maxlength:'12','aria-label':'Position Ticker'}),quantity=el('input',{type:'number',min:'0',step:'any',placeholder:'Anzahl','aria-label':'Stückzahl'}),message=el('div',{'aria-live':'polite'}),holdings=el('section',{'aria-live':'polite'});let request=0;
 const usd=value=>value===null?'Nicht verfügbar':value.toLocaleString('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:2});
 async function draw(){const current=++request,data=await api.getPortfolioIntelligence(positions);if(current!==request)return;S.clear(holdings);
  if(data.state==='EMPTY'){holdings.append(notice('Noch keine Positionen','Beginne mit einem Ticker und der Stückzahl. Es werden keine Beispielpositionen angelegt.'));return;}
  if(!Array.isArray(data.positions)){holdings.append(notice('Bestände nicht auswertbar','Prüfe die Eingaben und die verfügbare Datenquelle.'));return;}
  holdings.append(el('div',{class:'portfolio-total'},[el('span',{class:'eyebrow',text:'Erfasste Positionen · USD'}),el('div',{class:'quote',text:usd(data.total)}),el('p',{class:'muted',text:data.total!==null?'Bewertung mit den zuletzt verfügbaren Schlusskursen vom '+data.asOf+'. Kein Depotstand in Echtzeit.':'Ein Gesamtwert und Gewichte werden erst angezeigt, wenn für jede Position ein vergleichbarer Kursstand vorliegt.'})]));
  holdings.append(el('div',{class:'holdings'},data.positions.map(p=>el('article',{class:'holding'},[
   el('div',{},[link(p.ticker,href('stock',p.ticker)),el('p',{class:'muted',text:p.quantity.toLocaleString('de-DE',{maximumSignificantDigits:15})+' Stück · '+p.name})]),
   el('div',{class:'holding-value'},[el('strong',{text:usd(p.value)}),el('p',{class:'muted',text:p.state==='AVAILABLE'?'Kurs '+usd(p.price)+' · '+p.asOf:'Für diesen Bestand ist kein freigegebener Kurs verfügbar.'})]),
   el('div',{class:'holding-weight'},[el('span',{text:p.weight===null?'Gewicht offen':(p.weight*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %'}),p.weight===null?null:el('div',{class:'weight-track','aria-hidden':'true'},[el('span',{style:'width:'+(p.weight*100)+'%'})])]),
   el('div',{class:'actions'},[el('button',{class:'button secondary',text:'Bearbeiten',onclick:()=>{ticker.value=p.ticker;quantity.value=String(p.quantity);quantity.focus();}}),el('button',{class:'button secondary',text:'Entfernen','aria-label':p.ticker+' entfernen',onclick:()=>{positions=positions.filter(x=>x.ticker!==p.ticker);S.mount(message,notice('Änderung noch nicht gespeichert','Speichere die Bestände, um die Änderung in diesem Browser zu behalten.'));draw();}})])]))));
 }
 const add=el('button',{class:'button secondary',text:'Position übernehmen',onclick:()=>{try{const next={ticker:ticker.value.trim().toUpperCase(),quantity:Number(quantity.value)};VUPortfolioWorkspace.validate([next]);positions=VUPortfolioWorkspace.validate([...positions.filter(p=>p.ticker!==next.ticker),next]);S.mount(message,notice('Änderung noch nicht gespeichert','Speichere die Bestände, um sie beim nächsten Öffnen wiederzufinden.'));ticker.value='';quantity.value='';draw();}catch{S.mount(message,notice('Position prüfen','Gib einen gültigen Ticker und eine positive Stückzahl ein.'))}}});
 const save=el('button',{class:'button',text:'Bestände speichern',onclick:()=>{try{VUPortfolioWorkspace.save(localStorage,positions);S.mount(message,notice('Bestände gespeichert','Nur in diesem Browser gespeichert. Keine Übertragung an einen Broker.'));}catch{S.mount(message,notice('Speichern nicht möglich','Die Eingaben bleiben hier sichtbar. Prüfe, ob der Browserspeicher verfügbar ist.'));}}});
 main.append(el('div',{class:'portfolio-editor'},[el('label',{},[el('span',{text:'Ticker'}),ticker]),el('label',{},[el('span',{text:'Stückzahl'}),quantity]),add,save]),message,holdings,el('details',{},[el('summary',{text:'Was diese Auswertung umfasst'}),el('p',{text:'Bewertet werden ausschließlich deine erfassten Stückzahlen mit vorhandenen USD-Schlusskursen. Nicht erfasst sind Cash, Gebühren, Steuern, Kaufkurse und Währungsumrechnung. Deshalb werden weder Gewinn noch Rendite ausgewiesen.'}),el('p',{text:'Die Gewichtung zeigt Konzentration innerhalb der erfassten Bestände. Sektor-, Korrelations- und Drawdown-Analysen benötigen weitere validierte Daten und werden hier nicht geschätzt.'})]),actions([{label:'Watchlist öffnen',href:href('watchlist')},{label:'Unternehmen vergleichen',href:href('compare')},{label:'Strategien',href:href('strategies')}]));await draw();
}
/* =========================================================================
   STRATEGIEN — "WELCHE ART VON AKTIEN SUCHE ICH?"

   Bisher begann dieser Bereich mit einem Regel-Editor. Das ist ein
   Werkzeug für jemanden, der seine Strategie schon kennt. Wer sie noch
   nicht kennt, braucht zuerst den Katalog: was sucht ein Ansatz, für wen
   ist er gedacht, wo ist sein Hauptrisiko, wie viele Titel erfüllen ihn
   heute - und welcher Ansatz gerade gar nichts liefert, samt Grund.

   KEINE TREFFERQUOTE. Der Index führt `historicalEvidence`, aber das ist
   ASSIGNMENT_PERSISTENCE über ein Zeitfenster von Tagen - also wie stabil
   eine Zugehörigkeit ist, nicht wie oft ein Ansatz "recht hatte". Diese
   Fläche zeigt die Zahl mit ihrem Fenster und sagt ausdrücklich, dass eine
   Erfolgsquote nicht zertifiziert ist.
   ========================================================================= */
const FAKTOR_KLARTEXT={quality:'Qualität',growth:'Wachstum',momentum:'Kursstärke',value:'Bewertung',
 profitability:'Profitabilität',revisions:'Erwartungstrend',risk:'Risiko'};
function strategieKarte(profil,vertrag,persistenz){
 const def=(vertrag&&(vertrag.profiles||[]).find(p=>p.profileId===profil.profileId))||null;
 const verfuegbar=profil.availability&&profil.availability.state==='AVAILABLE'&&Number.isFinite(profil.count);
 /* ===============================================================
    EINE STRATEGIE IST EINE ZEILE, BIS JEMAND MEHR WILL.

    Vorher trug jede der acht Karten ihren Klartext, ALLE Bedingungen
    mit Schwelle, die Trefferzahl, zehn Kuerzel als Verweise und eine
    vierstufige Belegtreppe - gleichzeitig, offen, achtmal untereinander.
    Gemessen: 895 Woerter und 83 Klickziele auf einem Bildschirm.

    Jetzt steht oben, was der Ansatz sucht und wie viele ihn heute
    erfuellen. Alles andere - Bedingungen, Kuerzel, Risiko, Gewichtung,
    Bestaendigkeit, Regelkennung - liegt unveraendert im Aufklapper.
    `detail` sammelt es, `koerper` traegt die Zeile. */
 const koerper=[],detail=[];

 if(def&&def.plain)koerper.push(el('p',{class:'q-card-intro',text:def.plain}));

 /* WAS DER ANSATZ SUCHT: die Bedingungen im Klartext, mit Schwelle. */
 if(def&&def.conditions&&def.conditions.length){
  const liste=el('div',{});
  for(const c of def.conditions){
   const name=FAKTOR_KLARTEXT[c.id]||c.id;
   liste.append(el('div',{class:'q-factor'},[
    el('div',{class:'q-factor-name',text:name},[el('span',{text:c.rationale||''})]),
    el('div',{class:'q-factor-val',text:'ab '+c.value})]));
  }
  detail.push(el('p',{style:'font-size:13px;font-weight:650;margin:4px 0 2px',text:'Diese Bedingungen müssen gleichzeitig erfüllt sein'}),liste);
 }

 /* WIE VIELE ERFÜLLEN IHN HEUTE - oder warum keiner. */
 if(verfuegbar){
  koerper.push(el('p',{style:'margin:18px 0 8px'},[
   stateMark(profil.count>0?'pos':'neutral',profil.count.toLocaleString('de-DE')+' Titel erfüllen heute alle Bedingungen')]));
  const titel=(profil.tickers||[]).slice(0,10);
  if(titel.length){
   const liste=el('div',{class:'q-chips',style:'margin-top:10px'});
   for(const t of titel)liste.append(el('a',{class:'q-chip',href:href('stock',t),text:t}));
   detail.push(liste);
   if(profil.count>titel.length)detail.push(el('p',{class:'muted',style:'font-size:13px;margin:8px 0 0',
    text:'und '+(profil.count-titel.length).toLocaleString('de-DE')+' weitere.'}));
  }
 }else{
  const grund=(profil.availability&&profil.availability.reason)||'UNAVAILABLE';
  koerper.push(el('p',{style:'margin:18px 0 8px'},[stateMark('warn','Derzeit keine Auswahl')]));
  koerper.push(el('p',{class:'muted',style:'font-size:14px;margin:6px 0 0',
   text:'Dieser Ansatz braucht eine Bedingung, die das Produkt nicht liefert, und liefert deshalb bewusst keine Liste statt einer unvollständigen. Grund: '+
    (VUProductLanguage.has(grund)?VUProductLanguage.label(grund):grund)+'.'}));
 }

 /* DIE BELEGTREPPE für diesen Ansatz. */
 const stufen=[];
 if(def&&def.mainRisk)stufen.push(['Wo dieser Ansatz schwach wird',[def.mainRisk]]);
 if(def&&def.conditions)stufen.push(['Gewichtung der Bedingungen',
  [def.conditions.map(c=>(FAKTOR_KLARTEXT[c.id]||c.id)+' '+Math.round((c.weight||0)*100)+' %').join(' · '),
   'Die Gewichtung beschreibt, wie stark eine Bedingung in die Übereinstimmung eingeht. Erfüllt sein müssen trotzdem alle.']]);
 const p=persistenz&&persistenz.profiles?persistenz.profiles.find(x=>x.profileId===profil.profileId):null;
 if(p&&Number.isFinite(p.persistence))stufen.push(['Wie stabil war die Zugehörigkeit?',
  [Math.round(p.persistence*100)+' % der '+p.previousMembers+' Titel vom '+persistenz.from+' erfüllen den Ansatz am '+persistenz.to+' noch.',
   'Das ist die Beständigkeit einer Zuordnung über dieses Fenster — KEINE Erfolgs- oder Trefferquote. Eine Aussage darüber, ob ein Ansatz in der Vergangenheit Geld verdient hätte, ist nicht zertifiziert und wird hier nicht behauptet.']]);
 if(profil.predicateHash)stufen.push(['Regel und Methodik',
  ['Regelkennung: '+profil.predicateHash+'. Dieselbe Regel wählt die Titel aus, die im Screener erscheinen, und begründet auf einer Aktienseite die Übereinstimmung.',
   link('Methodik dieses Ansatzes',href('explain')+'#strategien','q-more')]]);
 const treppe=ladder(stufen);
 if(treppe)detail.push(treppe);

 if(verfuegbar&&profil.count>0)koerper.push(
  link('Diese Titel im Screener öffnen',href('screener')+'&profil='+encodeURIComponent(profil.profileId),'button secondary'));

 if(detail.length)koerper.push(mehr('Die genauen Bedingungen und heutigen Treffer',()=>detail));
 return card(def&&def.label||profil.label||profil.profileId,null,koerper);
}

async function strategiekatalog(){
 const [index,profile]=await Promise.all([
  api.getStrategyIndex().catch(()=>null),
  api.getStrategyProfiles().catch(()=>null)]);
 /* DERSELBE BEFUND WIE AUF DER SCREENER-SEITE, GEMESSEN BEI 390 x 844:

      50 px   "Strategien verstehen."   (Anspruch in der Kopfzeile)
     142 px   "Strategien verstehen."   (dieselbe Ueberschrift nochmal)
     187 px   "Waehle einen Ansatz, der zu deinem Stil passt."
     252 px   25 Woerter, die aufzaehlen, was jede Karte darunter zeigt
     377 px   "Stand der Auswertung: … · 8 Ansaetze · Methodik strategy-profile-1.0.0"
     441 px   erste Strategiekarte

   Dieselben drei Woerter standen zweimal, 92 px auseinander. Der dritte
   Satz zaehlte auf, was die acht Karten darunter vorfuehren - und war
   zugleich der einzige lange Satz der Seite.

   Was bleibt, ist der Auftrag der Seite in einer Zeile. Die Karten
   selbst sind NICHT gekuerzt: acht echte Wahlmoeglichkeiten rechtfertigen
   ihre Laenge, und eine nackte Namensliste ("GARP", "Value Momentum")
   waere fuer genau den Einsteiger wertlos, um den es hier geht. */
 main.append(stage('Anlagestile','Jeder Ansatz sagt, was er sucht — und wie viele Aktien ihn heute erfüllen.'));
 if(!index||index.state!=='AVAILABLE'||!Array.isArray(index.profiles)){
  main.append(card('Ansätze derzeit nicht abrufbar',
   'Die ausgewertete Zuordnung ist nicht verfügbar. Es wird keine Ersatzliste gezeigt.',
   [link('Methodik lesen',href('explain'),'button secondary')]));
  return;
 }
 const vertrag=profile&&profile.state==='AVAILABLE'?profile.contract:null;
 const persistenz=index.historicalEvidence&&index.historicalEvidence.state==='AVAILABLE'?index.historicalEvidence:null;
 /* Von vier Angaben bleibt die eine, die entscheidet, ob man den Zahlen
    trauen kann: der Stichtag. Die Zahl der Ansaetze steht als Karten
    darunter, und die Methodikversion gehoert zu den Vorbehalten am Fuss
    der Seite - dort, wo ohnehin steht, was diese Zahlen NICHT sind. */
 main.append(el('p',{class:'muted',style:'margin:-28px 0 20px;font-size:14px',
  text:'Stand '+(index.asOf||'nicht angegeben')}));
 const katalog=el('div',{class:'q-catalog'});
 for(const profil of index.profiles)katalog.append(strategieKarte(profil,vertrag,persistenz));
 main.append(katalog);
 main.append(card('Was diese Zahlen nicht sind',null,[
  el('p',{class:'q-card-intro',
   text:'Die Anzahl der Titel ist eine Auszählung von heute, keine Rangliste und keine Empfehlung. Eine historische Erfolgsquote je Ansatz ist nicht zertifiziert und wird deshalb nirgends gezeigt — auch nicht als Näherung.'}),
  persistenz?el('p',{class:'muted',style:'font-size:14px',
   text:'Die einzige veröffentlichte historische Grösse ist die Beständigkeit der Zuordnung zwischen '+persistenz.from+' und '+persistenz.to+'. Sie sagt, wie stabil eine Zugehörigkeit ist, nicht wie gut ein Ansatz war.'}):null,
  /* Die Methodikkennung stand oben im ersten Bildschirm, wo sie niemanden
     erreicht, der noch nicht weiss, was ein Ansatz ist. Hier steht sie bei
     den anderen Vorbehalten - nachpruefbar und am richtigen Ort. */
  el('p',{class:'muted',style:'font-size:13px',
   text:index.profiles.length+' Ansätze · Methodik '+(index.methodologyVersion||'nicht angegeben')}),
  link('Wie Strategien entstehen',href('explain'),'button secondary')]));
}

async function strategyPage(){
 await strategiekatalog();
 /* Der Regel-Editor bleibt vollständig erhalten - er steht jetzt hinter
    dem Katalog statt vor ihm. Wer eine eigene Strategie bauen will,
    findet hier dieselben Felder, dieselbe Speicherung, dieselbe Historie. */
 const builderZiel=el('div',{});
 /* Wer mit `?query=` hier ankommt, kommt aus dem Screener und will genau
    diese Regeln weiterentwickeln - dann steht der Editor offen. Dieselbe
    Regel wie im Screener, aus demselben Grund. */
 const mitRegelnImLink=params.has('query');
 const builderAnhaengen=()=>main.append(card('Eigene Strategie bauen',
  'Der vollständige Regel-Editor mit Gewichtung, Kosten und gespeicherten Versionen. Unverändert erhalten.',
  [el('details',{class:'q-pro',open:mitRegelnImLink||null},
   [el('summary',{text:'Strategie-Editor öffnen'}),builderZiel])]));
 /* Bevor jemand eine eigene Regel baut: welche Stile es gibt und wie
    besetzt sie heute sind. Dieselbe Regel, die auf einer Aktienseite
    erklaert, warum ein Titel passt, waehlt hier die Titel aus. */
 const strategyIndex=await api.getStrategyIndex().catch(()=>null);
 const distribution=strategyDistribution(strategyIndex);
 if(distribution)builderZiel.append(distribution);
 const context=await api.getStrategyContext();if(context.state!=='AVAILABLE'){builderZiel.append(notice('Methodik derzeit nicht verfügbar','Der bestehende Strategy Builder bleibt erreichbar.'),actions([{label:'Strategy Builder öffnen',href:'/quant/strategies/builder/'}]));builderAnhaengen();return;}
 builderZiel.append(el('p',{class:'scope-note',text:(context.currentSelection?.selectable||0).toLocaleString('de-DE')+' kanonische Produkttitel stehen der aktuellen Kriterienprüfung zur Verfügung. Ranking, Quant-V2-Score und historischer Test bleiben bis zur jeweiligen Zertifizierung geschlossen.'}));
 let saved,definition=context.definition;try{saved=VUStrategyWorkspace.load(localStorage);if(saved)definition=VUStrategy.getVersion(saved).definition;if(params.has('query'))definition=VUStrategy.createDefinition({...definition,filters:VUScreenerWorkspace.decode(params.get('query')).filters});}catch{builderZiel.append(notice('Gespeicherte Strategie prüfen','Der Entwurf oder die übergebenen Regeln sind nicht gültig. Vorhandene Daten werden nicht überschrieben.'));builderAnhaengen();return;}
 const fields={};function input(id,label,value,attrs={}){const control=el('input',{id:'strategy-'+id,value:String(value),...attrs});fields[id]=control;return el('label',{class:'strategy-field'},[el('span',{text:label}),control]);}
 function select(id,label,value,options){const control=el('select',{'aria-label':label},options.map(([value,text])=>el('option',{value,text})));control.value=value;fields[id]=control;return el('label',{class:'strategy-field'},[el('span',{text:label}),control]);}
 const filters=el('div',{class:'strategy-rules'},definition.filters.length?definition.filters.map(f=>el('p',{text:(VUCatalog.field(f.field)?.label||f.field)+' '+(VUCatalog.operator(f.operator)?.label||f.operator)+' '+f.value+(f.scale==='percentile'?' · Perzentil':VUCatalog.field(f.field)?.unit==='pct'?' %':VUCatalog.field(f.field)?.unit==='usd'?' USD':'')})):[el('p',{text:'Noch keine Auswahlkriterien. Beginne im Screener und übernimm deine Regeln.'})]);
 let editHref=href('screener');try{editHref+='&query='+encodeURIComponent(VUScreenerWorkspace.encode(VUScreenerWorkspace.build(definition.filters)));}catch{}
 const names=Object.fromEntries(['quality','momentum','value','growth','risk'].map(id=>[id,L(id)])),status=el('div',{'aria-live':'polite'}),preview=el('section',{'aria-live':'polite'}),history=el('pre',{class:'query-code',text:saved?JSON.stringify(saved,null,2):'Noch keine gespeicherte Version.'});
 builderZiel.append(input('name','Name des Entwurfs',saved?.strategy.name||'Meine Investmentidee',{maxlength:'120'}),el('section',{class:'section'},[el('h2',{text:'1 · Welche Unternehmen kommen infrage?'}),filters,link('Kriterien im Screener bearbeiten',editHref,'button secondary')]),el('section',{class:'section'},[el('h2',{text:'2 · Was soll bei der Auswahl zählen?'}),el('p',{class:'muted',text:'Die Faktoranteile müssen zusammen 100 % ergeben. Sie definieren ein späteres Ranking; ein Quant-V2-Rang wird bis zur Zertifizierung nicht berechnet.'}),el('div',{class:'strategy-grid'},context.factors.map(f=>input(f,names[f]+' · Anteil in %',(definition.ranking.factors.find(r=>r.factor===f)?.weight||0)*100,{type:'number',min:'0',max:'100',step:'1'})))]),
 el('section',{class:'section'},[el('h2',{text:'3 · Portfolio und Ausführung'}),el('div',{class:'strategy-grid'},[
 input('positions','Anzahl Positionen',definition.portfolio.positions,{type:'number',min:context.constraints.minPositions,max:context.constraints.maxPositions,step:'1'}),
 select('weighting','Positionsgewichtung',definition.portfolio.weighting,context.weightings.map(v=>[v,{equal:'Gleichgewichtet',score:'Nach Faktorwert',volatility:'Nach Volatilität'}[v]])),
 select('rebalance','Umschichten',definition.rebalance,context.rebalance.map(v=>[v,{monthly:'Monatlich',quarterly:'Quartalsweise'}[v]])),
 select('timing','Ausführungszeitpunkt',definition.execution.timing,context.timings.map(v=>[v,{next_open:'Nächste Eröffnung',next_close:'Nächster Schlusskurs'}[v]])),
 input('cost','Transaktionskosten · Basispunkte',definition.execution.transactionCostsBps,{type:'number',min:'0',max:context.costs.maxTransactionCostsBps,step:'any'}),input('slippage',L('slippage')+' · Basispunkte',definition.execution.slippageBps,{type:'number',min:'0',max:context.costs.maxSlippageBps,step:'any'})]),
 el('p',{class:'muted',text:'1 Basispunkt = 0,01 %. Kosten gelten beim Kauf und Verkauf. Entscheidungen werden frühestens am nächsten Handelszeitpunkt ausgeführt. '+LT('slippage')}),
 el('details',{},[el('summary',{text:'Konzentration & Handelbarkeit'}),el('div',{class:'strategy-grid'},[input('maxPosition','Maximales Positionsgewicht · %',definition.portfolio.maxPositionWeight*100,{type:'number',step:'any'}),input('maxSector','Maximales Sektorgewicht · %',definition.portfolio.maxSectorWeight*100,{type:'number',step:'any'}),input('minVolume','Mindest-Handelsvolumen · Mio. USD',definition.portfolio.minDollarVolumeM,{type:'number',step:'any'}),input('minCap','Mindest-Marktkapitalisierung · Mio. USD',definition.portfolio.minMarketCapM,{type:'number',step:'any'})])])]),
 input('reason','Grund der Änderung',saved?'':'Erster Entwurf',{maxlength:'500'}),status);
 function build(){for(const [key,control] of Object.entries(fields))if(control.type==='number'&&(!control.value.trim()||!Number.isFinite(Number(control.value))||!control.checkValidity()))throw Error('Bitte alle Zahlenfelder gültig ausfüllen.');const number=id=>Number(fields[id].value);return VUStrategy.assertValid(VUStrategy.createDefinition({...definition,ranking:{factors:context.factors.filter(f=>number(f)>0).map(f=>({factor:f,weight:number(f)/100}))},portfolio:{...definition.portfolio,positions:number('positions'),weighting:fields.weighting.value,maxPositionWeight:number('maxPosition')/100,maxSectorWeight:number('maxSector')/100,minDollarVolumeM:number('minVolume'),minMarketCapM:number('minCap')},rebalance:fields.rebalance.value,execution:{timing:fields.timing.value,transactionCostsBps:number('cost'),slippageBps:number('slippage')}}));}
 const save=el('button',{class:'button',text:'Version speichern',onclick:()=>{try{const next=VUStrategyWorkspace.save(localStorage,{name:fields.name.value,definition:build(),reason:fields.reason.value});saved=next;history.textContent=JSON.stringify(next,null,2);fields.name.readOnly=true;S.mount(status,notice('Version '+next.strategy.latestVersion+' gespeichert','Dieser Entwurf liegt nur in diesem Browser. Vorherige Versionen bleiben erhalten.'));fields.reason.value='';}catch(e){S.mount(status,notice('Entwurf nicht gespeichert',/identical/.test(e.message)?'Die Definition ist unverändert. Es wurde keine zusätzliche Version angelegt.':/changeReason/.test(e.message)?'Bitte begründe die Änderung, damit die Version nachvollziehbar bleibt.':'Prüfe Zahlen, Gewichtungen und den Änderungsgrund. Faktoranteile müssen 100 % ergeben; Positionszahl und Konzentrationsgrenzen müssen zusammenpassen. Auch gesperrter Browserspeicher verhindert das Speichern.'));}}});
 const inspect=el('button',{class:'button secondary',text:'Aktuelle Kriterien prüfen',onclick:async()=>{try{const def=build(),query=VUScreenerWorkspace.build(def.filters),result=await api.screen(query);if(result.state!=='AVAILABLE')throw Error('SOURCE_UNAVAILABLE');S.mount(preview,el('div',{},[el('h2',{text:'Aktuelle Kriterien-Auswahl'}),el('p',{text:'Nur die Filter im freigegebenen Analysebereich. Kein historisches Ergebnis, kein Ranking und keine Portfolio-Zuteilung.'}),stockRows(result.stocks||[])]));}catch(e){S.mount(preview,notice('Auswahl noch nicht auswertbar','Prüfe die Definition und die unterstützten Screener-Kriterien.'));}}});
 fields.name.readOnly=!!saved;
 builderZiel.append(el('div',{class:'actions'},[save,inspect]),preview,el('section',{class:'section'},[el('h2',{text:'Vor einem historischen Test'}),el('p',{text:'Ein echter Backtest ist für diese Vorschau noch nicht freigegeben. Diese Prüfungen müssen gemeinsam bestanden sein:'}),...context.backtest.checks.map(([title,text])=>el('div',{class:'trust-row'},[el('strong',{text:title}),el('p',{class:'muted',text})]))]),el('details',{},[el('summary',{text:'Gespeicherte Versionen & Definition'}),history]),actions([{label:'Vollständiger Strategy Builder',href:'/quant/strategies/builder/'},{label:'Bestehende Backtest-Umgebung',href:'/quant/backtests/'}]));
 builderAnhaengen();
}
/* ---------------------------------------------------------------------------
   QUANT EXPERIENCE

   Vier Ebenen in fester Reihenfolge: Bedeutung, Erklärung, Evidenz,
   Workspace. Die erste Ebene muss ohne Fachbegriff lesbar sein; die
   vierte darf nichts weglassen. Ein fehlender Wert bekommt seinen Grund
   und nie einen Ersatz.
   --------------------------------------------------------------------------- */
const pct=v=>Number.isFinite(v)?v.toLocaleString('de-DE',{maximumFractionDigits:1})+' %':'Nicht verfügbar';
const ratioText=(value,unit)=>{
 if(!Number.isFinite(value))return 'Nicht verfügbar';
 if(unit==='count')return value.toLocaleString('de-DE',{maximumFractionDigits:0});
 if(unit==='boolean')return value?'Ja':'Nein';
 if(unit==='shares')return value.toLocaleString('de-DE',{notation:'compact',maximumFractionDigits:1})+' Stück';
 return (value*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %';
};
/* WENN EINE ANDERE METHODIK GILT, MUSS DAS DASTEHEN.
 *
 * Gemessen am 26.09.2026: 974 Titel werden nach einer eigenen Branchenvorlage
 * gerechnet - Banken, Versicherungstraeger, REITs. Auf der Seite sah man das
 * nicht. WSBCO zeigte die Eigenkapitalquote mit Gewicht 0,30, AAPL dieselbe
 * Kennzahl mit 0,15: dieselbe Beschriftung, eine andere Vorlage, kein Wort
 * dazu. Ein Leser, der beide Seiten vergleicht, haelt das fuer einen Fehler -
 * und ein Leser, der nur eine sieht, haelt eine Bankkennzahl fuer die
 * allgemeine.
 *
 * Die Ebenen bleiben in der Reihenfolge des Woerterbuchs: erst was gilt, dann
 * warum, und der interne Name der Fassung zuletzt und nie allein. */
const VORLAGE_ERKLAERUNG={
 BALANCE_SHEET_FINANCIAL:'Eine Bankbilanz besteht aus Einlagen und Krediten. Rohertrag, '
  +'Nettoverschuldung und operative Marge - die Kennzahlen eines Industrieunternehmens - sagen '
  +'darüber nichts. Gemessen wird deshalb, was hier zählt: Eigenkapitalquote, Rendite auf '
  +'Bilanzsumme und Eigenkapital, Verlässlichkeit dieser Rendite über die Jahre.',
 INSURANCE_CARRIER:'Ein Versicherer verdient an Prämien und Kapitalanlagen, nicht an einer '
  +'Handelsmarge. Gemessen werden Eigenkapitalquote, Rendite auf Bilanzsumme und Eigenkapital '
  +'sowie das Ergebnis je Umsatz.',
 REAL_ESTATE_TRUST:'Bei einer Immobiliengesellschaft drückt die Abschreibung das Ergebnis, '
  +'ohne dass Geld abfließt. Gemessen wird deshalb der operative Zahlungsfluss - und ob die '
  +'Ausschüttung davon gedeckt ist.'
};
function branchenvorlageHinweis(data){
 const vorlage=data&&data.template;
 if(!vorlage||!vorlage.id)return null;
 const erklaerung=VORLAGE_ERKLAERUNG[vorlage.id];
 return el('div',{class:'template-note','data-template':vorlage.id},[
  el('p',{text:'Für diesen Titel gilt eine eigene Branchenvorlage.'}),
  erklaerung?el('p',{class:'muted',text:erklaerung}):null,
  /* Die Methodikebene: hier darf der interne Name stehen, weil ein
     Nutzerbegriff vor ihm steht. */
  el('p',{class:'muted',text:'Verlässlichkeit, Bewertung und Ertragskraft folgen dieser Vorlage; '
   +'Wachstum, Kursstärke und Schwankungsbreite werden für alle Titel gleich gemessen. '
   +'Grundlage: '+(vorlage.label||vorlage.id)+(vorlage.appliesTo?' ('+vorlage.appliesTo+')':'')
   +' · Fassung '+vorlage.version+'.'})]);
}

/* =========================================================================
   DIE OBERE HÄLFTE EINER AKTIENSEITE.

   Gemessen am 26.09.2026 am gebauten Release bei 390 px: die erste
   Bildschirmhöhe zeigte einen Namen, ein Etikett, einen Kurs, eine
   Aktualitätszeile - und dann einen Chart. Die fünf Fragen, mit denen ein
   Einsteiger auf diese Seite kommt (wie steht sie da, warum, was ändert
   sich, gibt es ein Setup, was spricht dafür und dagegen), wurden alle
   beantwortet: in Abschnitt vier, sechs, sieben und auf einer zweiten
   Ansicht. Ein Anfänger scrollt nicht bis dorthin, und wenn er es tut, muss
   er sich den Satz selbst bilden.

   Dieser Abschnitt steht deshalb zwischen Kurs und Chart. Er rechnet nichts:
   jede Zeile kommt aus `VUIntelligenceBrief`, und die Engine kommt mit ihren
   Belegen. Die Reihenfolge ist die des Wörterbuchs - Aussage, Erklärung,
   Evidenz, Methodik -, und die Methodik ist eingeklappt.
   ========================================================================= */
/* Der Hinweis auf eine unsichere Zuordnung. Er nennt beide Namen, sagt was
   gezeigt wird und warum - und trifft die Entscheidung nicht. Der interne
   Gruppenschluessel steht in der Methodikebene und nie zuerst. */
const IDENTITAET_GRUND={
 D:'Die beiden Quellen nennen verschiedene Zahlwörter im Firmennamen. Bei Nachfolgegesellschaften '
  +'und Serien sind das zwei verschiedene Unternehmen.',
 F:'Die beiden Quellen nennen Firmennamen ohne ein gemeinsames Wort, und die Verknüpfung stützt sich '
  +'nur auf das Kürzel.',
 G:'Die beiden Quellen nennen verschiedene Firmennamen. Ob es eine Umbenennung ist oder ein '
  +'wiederverwendetes Kürzel, lässt sich aus den vorliegenden Angaben nicht entscheiden.'};
function identitaetsHinweis(s){
 const k=s.identityConflict||{};
 return el('div',{class:'identity-note','data-conflict':k.kind||''},[
  el('p',{text:'Zu diesem Kürzel liegen zwei verschiedene Firmennamen vor.'}),
  k.alternativeName?el('p',{class:'muted',text:'Angezeigt wird „'+(s.name||s.ticker)+'". '
   +'Eine andere Quelle nennt „'+k.alternativeName+'".'}):null,
  el('p',{class:'muted',text:(IDENTITAET_GRUND[k.kind]||'Die Quellen sind über die Zuordnung uneins.')
   +' Die Geschäftszahlen unten stammen aus den Unterlagen der Gesellschaft, der dieses Kürzel '
   +'im Wertpapierverzeichnis zugeordnet ist. Wir entscheiden diese Frage nicht, solange sie nicht belegt ist.'}),
  el('p',{class:'muted',text:'Prüfung der Namensquellen: Fassung '+(k.contract||'unbekannt')+'.'})]);
}

function briefListe(titel, eintraege, cls, leerText){
 return el('div',{class:'brief-column '+cls},[
  el('h3',{text:titel}),
  eintraege.length
   ?el('ul',{class:'brief-list'},eintraege.slice(0,4).map(entry=>el('li',{},[
     el('span',{class:'brief-text',text:entry.text}),
     entry.why?el('span',{class:'muted',text:entry.why}):null])))
   :el('p',{class:'muted',text:leerText}),
  eintraege.length>4?el('details',{class:'brief-more'},[
   el('summary',{text:'Weitere '+(eintraege.length-4)}),
   el('ul',{class:'brief-list'},eintraege.slice(4).map(entry=>el('li',{},[
    el('span',{class:'brief-text',text:entry.text}),
    entry.why?el('span',{class:'muted',text:entry.why}):null])))]):null]);
}
/* Der Setup-Zustand als Handlungslogik: Zustand, warum, was als Nächstes,
   was ihn beendet. Vier Fragen, vier Antworten - und wo eine nicht
   beantwortbar ist, steht der Grund und keine leere Liste. */
function briefSetup(setup){
 if(!setup||setup.state==='UNAVAILABLE'||!setup.state){
  const grund=technicalReasonText(setup&&setup.unavailability);
  return el('div',{class:'brief-setup is-missing'},[
   el('h3',{text:'Gibt es ein Setup?'}),
   el('p',{class:'muted',text:'Für diesen Titel liegt keine Beobachtung vor. '
    +(grund||'Sie entsteht aus der bestehenden technischen Materialisierung; dieser Titel ist darin nicht enthalten.')})]);
 }
 const zeile=(frage,antwort)=>antwort?el('p',{},[el('strong',{text:frage+' '}),el('span',{text:antwort})]):null;
 return el('div',{class:'brief-setup'},[
  el('h3',{text:'Gibt es ein Setup?'}),
  el('p',{class:'brief-setup-state'},[
   el('span',{class:'setup-badge state-'+setup.state,text:setup.label}),
   el('span',{text:setup.sentence})]),
  zeile('Warum?',setup.why&&setup.why.sentence),
  zeile('Was müsste als Nächstes passieren?',setup.next&&setup.next.sentence),
  zeile('Was würde es beenden?',setup.invalidation&&setup.invalidation.sentence),
  el('p',{class:'muted',text:'Ein Vergleich mit dem heutigen Stand - kein Kursziel, keine Einstiegsregel und keine Aussage darüber, ob ein Zustand eintritt.'})]);
}
/* `mitMuster` steuert, ob die Musterlage HIER steht. Auf der Aktienseite
   folgt direkt darunter der eigene Musterabschnitt mit den Zahlen je Muster;
   zwei Bloecke ueber dieselbe Sache in derselben Bildschirmhoehe machen die
   obere Haelfte lang, ohne eine Frage mehr zu beantworten. Die fuenf Fragen,
   die diese Haelfte beantworten muss, sind die des Einstiegs - und die
   Musterfrage ist nicht darunter. */
function briefSection(brief,ticker,mitMuster){
 const section=el('section',{class:'section brief-section'},[
  el('span',{class:'eyebrow',text:'Wie steht die Aktie da?'}),
  el('p',{class:'brief-headline',text:brief.headline.sentence})]);
 /* Die Branchenvorlage gilt hier genauso wie in der Faktorsektion: wechselt
    die Methodik, muss es dort stehen, wo die Aussage steht. Dieselbe Tabelle,
    kein zweiter Satz. */
 const vorlage=brief.methodologySwitch&&brief.methodologySwitch.active
  ?branchenvorlageHinweis({template:{id:brief.methodologySwitch.id,label:brief.methodologySwitch.label,
    appliesTo:brief.methodologySwitch.appliesTo,version:brief.methodologySwitch.version}}):null;
 if(vorlage)section.append(vorlage);
 section.append(el('div',{class:'brief-balance'},[
  briefListe('Spricht dafür',brief.pro,'is-pro','Derzeit steht hier nichts Belegbares.'),
  briefListe('Spricht dagegen',brief.contra,'is-con','Derzeit steht hier nichts Belegbares.'),
  briefListe('Noch nicht bewertbar',brief.unknown,'is-unknown','Alles Gemessene ist eingeordnet.')]));
 section.append(briefSetup(brief.setup));
 if(brief.strategy&&brief.strategy.sentence){
  section.append(el('div',{class:'brief-strategy'},[
   el('h3',{text:'Welcher Anlagestil passt?'}),
   el('p',{text:brief.strategy.sentence}),
   brief.strategy.plain?el('p',{class:'muted',text:brief.strategy.plain}):null,
   el('p',{class:'muted',text:[
    brief.strategy.fulfils.length?brief.strategy.fulfils.length+' Bedingung'+(brief.strategy.fulfils.length===1?'':'en')+' erfüllt':null,
    brief.strategy.missing.length?brief.strategy.missing.length+' offen: '+brief.strategy.missing.map(c=>c.label).join(', '):null,
    brief.strategy.blocking.length?brief.strategy.blocking.length+' nicht messbar: '+brief.strategy.blocking.map(c=>c.label).join(', '):null
   ].filter(Boolean).join(' · ')}),
   link('Alle Anlagestile zu diesem Titel',href('quant',ticker),'button secondary')]));
 }
 if(mitMuster&&brief.pattern&&brief.pattern.sentence){
  section.append(el('div',{class:'brief-pattern'},[
   el('h3',{text:'Wie sahen ähnliche Situationen aus?'}),
   el('p',{text:brief.pattern.sentence}),
   brief.pattern.upside&&brief.pattern.upside.sentence?el('p',{class:'muted',text:brief.pattern.upside.sentence}):null,
   brief.pattern.downside&&brief.pattern.downside.sentence?el('p',{class:'muted',text:brief.pattern.downside.sentence}):null,
   brief.pattern.sampleSentence?el('p',{class:'muted',text:brief.pattern.sampleSentence+' '+(brief.pattern.robustSentence||'')}):null,
   brief.pattern.caveat?el('p',{class:'muted',text:brief.pattern.caveat}):null]));
 }
 section.append(el('p',{class:'muted brief-not',text:'Diese Auskunft ordnet vorhandene Messungen. Sie ist keine Prognose, keine Empfehlung, kein Kursziel und kein Gesamtscore.'}));
 return section;
}

function factorRow(factor){
 const open=el('div',{class:'dna-detail',hidden:'hidden'});
 const head=el('button',{class:'dna-head',type:'button','aria-expanded':'false'},[
  el('span',{class:'dna-label',text:factor.label}),
  el('span',{class:'dna-band band-'+(factor.band||'NONE'),text:factor.bandLabel})]);
 head.onclick=()=>{const hidden=open.hasAttribute('hidden');if(hidden)open.removeAttribute('hidden');else open.setAttribute('hidden','hidden');head.setAttribute('aria-expanded',String(hidden));};
 const track=el('div',{class:'dna-track','aria-hidden':'true'},[el('span',{class:'band-'+(factor.band||'NONE'),style:'width:'+(Number.isFinite(factor.score)?Math.max(2,Math.min(100,factor.score)):0)+'%'})]);
 /* Ebene 1 und 2 stehen immer da, auch wenn kein Wert existiert. */
 open.append(el('p',{class:'dna-plain',text:factor.plain}),el('p',{class:'muted',text:factor.question}));
 if(factor.state==='AVAILABLE'){
  open.append(el('p',{text:factor.bandPlain}),el('p',{class:'muted',text:factor.higherMeans}));
  const peer=factor.peer;
  open.append(el('p',{class:'muted',text:'Verglichen wird gegen '+(peer?.level==='sic4_industry'?'die Branche':peer?.level==='sic_division'?'den Sektor':'das gesamte Universum')+(peer?.confidencePenalty?' · ohne ausreichend große Vergleichsgruppe, daher mit Abschlag auf die Datensicherheit':'')+'. Datensicherheit: '+(factor.confidenceBand?.label||'nicht angegeben')+' ('+pct(factor.confidence)+'), das ist keine Erfolgswahrscheinlichkeit.'}));
 }else open.append(notice(factor.reasonHeadline||'Kein Wert für diesen Faktor',factor.reasonText));
 /* Ebene 3: jede Einzelkennzahl mit Rohwert, Position und Zustand. */
 const rows=factor.components.map(c=>el('div',{class:'dna-component'+(c.state==='AVAILABLE'?'':' is-missing')},[
  el('div',{},[el('span',{text:c.label||c.id}),c.window?el('span',{class:'muted',text:c.window}):null]),
  el('div',{class:'number'},[el('strong',{text:c.state==='AVAILABLE'?ratioText(c.raw,c.unit):'Nicht verfügbar'}),
   el('span',{class:'muted',text:c.state==='AVAILABLE'?'Position '+pct(c.score)+' · Gewicht '+pct((c.weight||0)*100):(VUFactorEvidence.REASON_TEXT[c.reason]||'Eingabe fehlt')})]),
  c.note?el('p',{class:'muted dna-note',text:c.note}):null]));
 open.append(el('div',{class:'dna-components'},rows),
  el('details',{},[el('summary',{text:'Methodik'}),
   el('p',{text:'Die Einzelkennzahlen werden zuerst an den Rändern gekappt (2. und 98. Perzentil), dann in eine Rangposition im Universum übersetzt und mit ihren Gewichten zusammengefasst. Fehlende Kennzahlen werden nicht durch andere ersetzt; ihr Gewicht wandert nicht zu einem anderen Faktor.'}),
   el('p',{class:'muted',text:'Vertrag '+VUFactorEvidence.METHODOLOGY_VERSION+', abgeleitet aus '+VUFactorEvidence.DERIVED_FROM+'. Abgedecktes Gewicht in diesem Faktor: '+pct((factor.coverage||0)*100)+'.'})]));
 return el('article',{class:'dna-row'},[head,track,open]);
}
function changeCard(entry){
 const arrow=entry.direction==='IMPROVING'?'↑':entry.direction==='DETERIORATING'?'↓':'→';
 const body=[el('p',{class:'muted',text:entry.plain})];
 if(entry.state==='AVAILABLE'){
  if(entry.from&&entry.to)body.push(el('p',{class:'change-values',text:(entry.from.label||'Vorher')+': '+ratioText(entry.from.value,entry.from.unit)+'  →  '+(entry.to.label||'Jetzt')+': '+ratioText(entry.to.value,entry.to.unit)}));
  if(entry.evidence?.length)body.push(el('details',{},[el('summary',{text:'Weitere Belege'}),...entry.evidence.map(m=>el('p',{class:'muted',text:m.label+': '+ratioText(m.value,m.unit)}))]));
 }else body.push(el('p',{class:'muted',text:entry.reasonText}));
 return el('article',{class:'change-card dir-'+(entry.direction||'NONE')+(entry.state==='AVAILABLE'?'':' is-missing')},[
  el('div',{class:'change-head'},[el('span',{class:'change-arrow','aria-hidden':'true',text:entry.state==='AVAILABLE'?arrow:'·'}),
   el('h3',{text:entry.label}),entry.window?el('span',{class:'muted',text:entry.window}):null]),...body]);
}
/* Die kanonische Setup-Reise. Die Zustaende, ihre Reihenfolge und die
   Bedingungen, die einen Zustand entscheiden, stehen in der versionierten
   Setup-Methodik - nicht in dieser Datei. Was hier passiert, ist
   Darstellung: welche Regel gegriffen hat und welche ihrer Bedingungen
   erfuellt ist. Die Klassifikation ("so sieht es heute aus") und der
   Lebenszyklus ("an dieser Stelle steht der Titel in seinem Verlauf")
   bleiben sichtbar getrennt; der zweite verlangt eine geordnete
   Beobachtungshistorie und bleibt bis dahin ausdruecklich geschlossen. */
/* Die Zustandsnamen kommen aus dem Woerterbuch. Ein Enum-Wert erreicht
   die Oberflaeche nie roh - er wird uebersetzt oder gar nicht gezeigt. */
/* Die lokale Gruende-Tabelle ist weg. Sie war eine zweite Textquelle
   neben dem Woerterbuch - genau die Doppelsprache, die das Woerterbuch
   abschafft - und die neue Aktienseiten-Sektion umging sie ohnehin und
   rief LB(reason) direkt auf. Fuer vier der Gruende gab es dort gar
   keinen Eintrag: ein Titel mit unvollstaendiger technischer Evidenz
   haette die Seite zum Absturz gebracht, sobald es einen gibt. Heute gibt
   es keinen, was den Fehler unsichtbar hielt. */
/* EINE BEDINGUNG IN LESBAREN WORTEN.

   Vorher stand hier der interne Satz: "Technical Volume State · Wert
   BREAKOUT_VOLUME_UP · verlangt in BREAKOUT_VOLUME_UP,EXPANSION". Jedes
   Stueck davon ist richtig und keines davon ist lesbar - ein englischer
   Feldname, ein roher Enum-Wert und ein Operator als Wort. Genau das
   schliesst das Woerterbuch aus, und diese Zeile war die letzte Stelle in
   der Setup-Sektion, an der es umgangen wurde.

   Uebersetzt wird der BEGRIFF, nicht die Bedingung: dieselbe Regel, dieselbe
   Schwelle, derselbe Vergleich. Was keinen Eintrag hat, wird nicht roh
   gezeigt, sondern bleibt der eingeklappten Methodikzeile - dort duerfen
   interne Namen stehen (Schicht METHODOLOGY), in der Hauptaussage nicht. */
const SETUP_OPERATOR={eq:'verlangt',ne:'verlangt: nicht',in:'verlangt',gte:'verlangt mindestens',lte:'verlangt höchstens',gt:'verlangt mehr als',lt:'verlangt weniger als',isNotNull:'verlangt einen vorhandenen Wert'};
function setupFieldTerm(condition){
 const id=condition.field||condition.input;
 return id&&VUProductLanguage.has(id)?L(id):(condition.label||id||'Bedingung');
}
function setupValueText(condition,value){
 if(value===null||value===undefined)return 'nicht verfügbar';
 const field=condition.field?VUCatalog.field(condition.field):null;
 if(typeof value==='number'){
  if(field&&field.unit==='ratio')return (value*100).toLocaleString('de-DE',{maximumFractionDigits:1})+' %';
  return value.toLocaleString('de-DE',{maximumFractionDigits:2});
 }
 const id=condition.field?condition.field+'.'+value:null;
 if(id&&VUProductLanguage.has(id))return L(id);
 /* Kein Eintrag: der rohe Wert bleibt draussen. Die Bedingung wird
    weiterhin gezeigt, nur ohne ein Wort, das niemand lesen kann. */
 return null;
}
function setupDemandText(condition){
 const parts=[].concat(condition.demand===undefined?[]:condition.demand)
  .map(value=>setupValueText(condition,value)).filter(Boolean);
 if(condition.operator==='isNotNull')return SETUP_OPERATOR.isNotNull;
 if(!parts.length)return null;
 return (SETUP_OPERATOR[condition.operator]||'verlangt')+' '+parts.join(' oder ');
}
function setupCondition(condition){
 const ist=setupValueText(condition,condition.value);
 const verlangt=setupDemandText(condition);
 /* "Nicht erfuellt" und "nicht messbar" bekommen nicht dasselbe Zeichen.
    Gemessen: 146 von 5.676 Titeln tragen beim Volumenzustand "nicht
    auswertbar", 61 zusaetzlich beim Momentum - fuenf der neun Filterfelder
    stehen nicht in coverage.requiredFields. Die Regel greift dann zurecht
    nicht; behauptet wird damit aber nichts ueber den Titel. Dieselbe
    Unterscheidung fuehrt der Strategy Match mit demselben Zeichen. */
 const messbar=condition.measurable!==false;
 const zeile=[verlangt,ist===null?null:'aktuell '+ist,
  messbar?null:'nicht messbar · zählt weder als erfüllt noch als verletzt'].filter(Boolean).join(' · ');
 return el('li',{class:'setup-condition '+(!messbar?'is-missing':condition.met?'is-met':'is-open')},[
  el('span',{class:'setup-mark','aria-hidden':'true',text:!messbar?'–':condition.met?'✓':'○'}),
  el('div',{},[el('span',{text:setupFieldTerm(condition)}),
   zeile?el('span',{class:'muted',text:zeile}):null,
   el('details',{class:'setup-internal'},[el('summary',{text:'Feld & Vergleich'}),
    el('p',{class:'muted',text:(condition.field||condition.input)+' '+(condition.operator||'')+' '+JSON.stringify(condition.demand===undefined?null:condition.demand)+' · Wert '+JSON.stringify(condition.value===undefined?null:condition.value)})])])]);
}
/* WIE AKTUELL DIESE AUSSAGE IST - und wogegen sie NICHT aktuell ist.

   Der Zustand steht auf der technischen Materialisierung, der Chart auf den
   Tagesschlusskursen. Das sind zwei Staende, und sie sind nicht derselbe:
   gemessen am 25.09.2026 liegt der Setup-Stand auf dem 10.09.2026, weil die
   kanonische Historie, aus der die Bundles entstehen, in diesem Workstream
   nur GELESEN wird. Ein Datum allein sagt das nicht - ein Leser nimmt eine
   Zustandsangabe als heutige. Deshalb steht hier der Abstand und nicht nur
   der Stichtag. */
function setupCurrency(observation){
 const stand=observation.asOf,lauf=observation.dataCutoff;
 const tage=(()=>{const a=Date.parse(stand+'T00:00:00Z');if(!Number.isFinite(a))return null;
  return Math.round((Date.now()-a)/86400000);})();
 const satz='Dieser Zustand folgt der technischen Materialisierung, nicht dem täglichen Kursstand'
  +(lauf&&lauf!==stand?' (Datenstand des Laufs '+lauf+')':'')+'.'
  +(tage!==null&&tage>2?' Er ist '+tage+' Kalendertage alt und wird erst mit der nächsten Materialisierung neu bestimmt.':'');
 return el('p',{class:'muted setup-currency',text:satz});
}
/* WAS DIESEN ZUSTAND AENDERN WUERDE.

   Die Sektion konnte sagen, welcher Zustand gilt und woran das liegt. Die
   naechste Frage - was muesste anders sein - stand unbeantwortet daneben,
   obwohl die Kaskade sie beantwortet: sie benennt fuer jeden Zustand die
   Bedingungen, und die Zeile, an der entschieden wurde, liegt seit
   setup-observation-product-1.1.0 im Artefakt.

   Gerechnet wird das in der Engine (explainCascade) mit denselben zwei
   Funktionen, die auch den Zustand zugeordnet haben. Hier steht nur die
   Darstellung: nach Naehe sortiert, offene Bedingungen zuerst benannt.

   Ausdruecklich KEINE Aussage darueber, ob ein Zustand eintritt. Der
   Vergleich gilt fuer den heutigen Stand und sagt das auch. */
function setupChange(observation){
 if(!observation||observation.state!=='AVAILABLE')return null;
 const block=el('details',{class:'setup-change'},[el('summary',{text:'Was diesen Zustand ändern würde'})]);
 if(!observation.cascade){
  block.append(el('p',{class:'muted',text:'Für diesen Titel liegt die Zeile, an der die Regel entschieden hat, nicht im veröffentlichten Artefakt. Ohne sie lässt sich nicht sagen, welche Bedingungen eines anderen Zustands schon gelten - und eine leere Liste wäre die falsche Antwort auf eine offene Frage.'}));
  return block;
 }
 const aktuell=observation.matchedRule?observation.matchedRule.ruleId:null;
 /* Nur die entscheidbare Stufe. Die vier Verlaufszustaende haengen an einer
    Vorbeobachtung und sind ohnehin geschlossen; sie stehen als solche in
    der Reise und werden hier nicht als "nicht erfuellt" gezeigt - das
    waere eine Aussage, die niemand geprueft hat. */
 const offen=observation.cascade.filter(rule=>rule.tier==='POINT_IN_TIME'&&rule.ruleId!==aktuell&&!rule.unanswerable&&rule.total>0)
  .sort((a,b)=>(b.met/b.total)-(a.met/a.total));
 if(!offen.length){
  block.append(el('p',{class:'muted',text:'Neben dem heutigen Zustand gibt es in der entscheidbaren Stufe keine weitere Regel mit prüfbaren Bedingungen.'}));
  return block;
 }
 for(const rule of offen){
  block.append(el('article',{class:'setup-change-rule'},[
   el('h3',{},[el('span',{class:'setup-badge state-'+rule.state,text:L(rule.state)}),
    el('span',{class:'muted',text:rule.met+' von '
     +rule.conditions.filter(c=>c.measurable!==false).length+' messbaren Bedingungen gelten schon'})]),
   el('p',{class:'muted',text:rule.plain}),
   el('ul',{class:'setup-conditions'},rule.conditions.map(setupCondition))]));
 }
 block.append(el('p',{class:'muted',text:'Ein Vergleich mit dem heutigen Stand. Er sagt, was ein anderer Zustand verlangt - nicht, dass er eintritt, und nicht wann.'}));
 return block;
}
function setupJourney(setup,observation,index,logik){
 const available=observation&&observation.state==='AVAILABLE';
 const lifecycle=available?observation.lifecycle:null;
 const classification=available?observation.classification:null;
 const active=lifecycle&&lifecycle.availability.state==='AVAILABLE'?lifecycle.state:null;
 /* Die Kaskade ist nach Entscheidungsvorrang geordnet - erst das, was einen
    frueheren Zustand beendet. Die Reise wird dagegen als Verlauf gelesen,
    deshalb hier eine reine Darstellungsreihenfolge. Welche Zustaende
    ueberhaupt vorkommen, sagt weiterhin die Methodik. */
 const JOURNEY_ORDER=['WATCH','SETUP_FORMING','CONFIRMED','ACTIVE','RISK_RISING','INVALIDATED','EXIT'];
 const steps=(available?observation.journey.map(rule=>rule.state).filter((state,index,list)=>list.indexOf(state)===index)
  :JOURNEY_ORDER.slice()).filter(state=>JOURNEY_ORDER.includes(state))
  .sort((a,b)=>JOURNEY_ORDER.indexOf(a)-JOURNEY_ORDER.indexOf(b));
 /* Die vier Verlaufszustaende sind methodisch freigegeben, operativ aber
    noch geschlossen. Sie verschwinden deshalb nicht aus der Reise - sie
    stehen sichtbar als noch nicht freigeschaltet da. Ein Nutzer soll
    sehen, dass es sie gibt und warum sie noch nichts sagen. */
 const pathOpen=available&&observation.pathTier&&observation.pathTier.state==='OPEN';
 const PATH=['ACTIVE','RISK_RISING','INVALIDATED','EXIT'];
 const section=el('section',{class:'section setup-section'},[
  el('span',{class:'eyebrow',text:'Situation'}),el('h2',{text:LQ('setupState')}),
  el('ol',{class:'setup-journey',tabindex:'0','aria-label':'Setup-Zustände, waagerecht scrollbar'},steps.map(state=>{
   const pending=PATH.includes(state)&&!pathOpen;
   return el('li',{class:'setup-step'+(active===state?' is-active':'')+(classification&&classification.state===state?' is-observed':'')+(pending?' is-pending':''),
    title:pending?LT('PATH_DEPENDENT_STATES_NOT_ACTIVATED'):LB(state)},[
    el('span',{class:'setup-dot','aria-hidden':'true'}),el('span',{text:L(state)}),
    pending?el('span',{class:'setup-pending',text:'noch nicht freigeschaltet'}):null]);
  }))]);
 if(!available){
  /* Der Mechanismus allein erklaert nichts: "ist darin nicht enthalten" laesst
     offen, warum. Der Grund steht im Technical-Shard und ist derselbe - also
     dieselbe Zahl, nicht ein zweiter Satz fuer eine Ursache. */
  const grund=technicalReasonText(observation&&observation.unavailability);
  section.append(notice('Für diesen Titel liegt keine Setup-Beobachtung vor',
   'Die Setup-Beobachtung wird aus der bestehenden technischen Materialisierung gebildet. Dieser Titel ist darin nicht enthalten, deshalb wird hier kein Zustand behauptet.'
   +(grund?' '+grund:'')));
  return section;
 }
 if(classification.state&&classification.state!=='UNAVAILABLE'){
  section.append(el('p',{class:'setup-classification'},[
   el('span',{class:'setup-badge state-'+classification.state,text:L(classification.state)}),
   el('span',{class:'muted',text:LB(classification.state)})]),
   el('p',{class:'muted',text:'Beobachtet am '+observation.asOf+'. '+observation.matchedRule.plain}),
   setupCurrency(observation));
 }else{
  section.append(notice(L('UNAVAILABLE'),VUProductLanguage.has(classification.reason)?LB(classification.reason):LB('UNAVAILABLE')));
 }
 if(!active)section.append(notice(LU('setupState'),
  VUProductLanguage.has(lifecycle.availability.reason)?LB(lifecycle.availability.reason):LB('UNAVAILABLE')));
 /* Auch wenn ein Zustand veroeffentlicht ist: was NICHT geprueft wurde,
    gehoert danebengesagt. Sonst liest sich 'Beobachten' so, als waere
    'Trend laeuft' ausgeschlossen worden. */
 if(active&&!pathOpen)section.append(notice(L('PATH_DEPENDENT_STATES_NOT_ACTIVATED'),
  LB('PATH_DEPENDENT_STATES_NOT_ACTIVATED')));
 const conditions=observation.conditions||[];
 const met=conditions.filter(c=>c.met).length;
 const messbareBedingungen=conditions.filter(c=>c.measurable!==false).length;
 const ohneWert=conditions.length-messbareBedingungen;
 if(conditions.length){
  section.append(el('p',{class:'setup-count',text:met+' von '+messbareBedingungen+' messbaren Bedingungen dieser Regel erfüllt'
   +(ohneWert?', '+ohneWert+' ohne auswertbaren Wert':'')}),
   el('ul',{class:'setup-conditions'},conditions.map(setupCondition)),
   el('p',{class:'muted',text:'Regel '+observation.matchedRule.ruleId+' · Methodik '+observation.mappingVersion+'. Dieselbe Regel ist als Screener-Abfrage formuliert; sie beschreibt einen Zustand und ist weder Einstiegsregel noch historisch getesteter Auslöser.'}));
 }
 /* DIE ZWEI FRAGEN, DIE KEIN ABSCHNITT GESTELLT HAT.
    Die Kaskade unten nennt alle anderen Regeln mit ihren Bedingungen. Was
    daraus folgt - welche Stufe die naechste ist und was den heutigen Zustand
    beendet -, stand nirgends als Satz. Beides rechnet dieselbe Engine, die
    die Auskunft oben bildet; hier steht nur die Darstellung. */
 if(logik&&logik.state===(classification&&classification.state)){
  const zeile=(frage,antwort)=>antwort?el('p',{class:'setup-logic'},[el('strong',{text:frage+' '}),el('span',{text:antwort})]):null;
  section.append(zeile('Was müsste als Nächstes passieren?',logik.next&&logik.next.sentence),
   zeile('Was würde diesen Zustand beenden?',logik.invalidation&&logik.invalidation.sentence));
 }
 section.append(setupChange(observation));
 section.append(setupPeers(index,classification&&classification.state,observation.ticker));
 return section;
}
/* Dieselbe Regel, andersherum gelesen. Die Liste kommt aus der Zuordnung
   der Kaskade: wer statt dessen das Regelpraedikat ausliefert, zeigt
   Titel als 'beobachtet', die laengst bestaetigt sind - beim Zustand
   Beobachten waeren das ueber achthundert von rund vierzehnhundert. */
function setupPeers(index,state,self){
 if(!index||index.state!=='AVAILABLE'||!state||state==='UNAVAILABLE')return null;
 const entry=index.states.find(row=>row.state===state);
 if(!entry)return null;
 const block=el('details',{class:'setup-peers'},[el('summary',{text:LQ('setupScreen')})]);
 if(entry.availability.state!=='AVAILABLE'){
  block.append(el('p',{class:'muted',text:LU('setupScreen')}),
   el('p',{class:'muted',text:LB(entry.availability.reason)}));
  return block;
 }
 const listed=entry.rules.filter(rule=>Array.isArray(rule.tickers));
 const peers=listed.flatMap(rule=>rule.tickers).filter(ticker=>ticker!==self);
 if(!listed.length){
  /* Der Auffangzustand traegt kein Praedikat. 'Alles, was keine andere
     Regel genommen hat' ist keine Eigenschaft eines Titels und wird
     deshalb nicht als Liste ausgegeben - die Zahl steht trotzdem da. */
  block.append(el('p',{text:entry.count.toLocaleString('de-DE')+' Titel stehen am '+index.asOf+' an derselben Stelle.'}),
   el('p',{class:'muted',text:'Für diese Lage wird keine Titelliste gebildet: sie ist der Auffangzustand und damit keine eigene Eigenschaft, nach der sich suchen ließe.'}));
  return block;
 }
 block.append(el('p',{text:peers.length?peers.length.toLocaleString('de-DE')+' weitere Titel stehen am '+index.asOf+' an derselben Stelle.':LN('setupScreen')}));
 if(peers.length)block.append(el('p',{class:'peer-tickers'},peers.slice(0,24).map(ticker=>link(ticker,href('quant',ticker),'peer-chip'))));
 if(peers.length>24)block.append(el('p',{class:'muted',text:'Gezeigt werden 24 von '+peers.length.toLocaleString('de-DE')+'. Die vollständige Liste entsteht aus derselben Regel im Screener.'}));
 block.append(...listed.map(rule=>link('Regel prüfen · '+rule.plain,
  href('screener')+'&setupRule='+encodeURIComponent(rule.ruleId),'button secondary')));
 block.append(el('p',{class:'muted',text:'Stand '+index.asOf+' · Zuordnung '+index.mappingVersion+'. Jeder Titel steht in genau einer Lage; eine Aktie, auf die mehrere Regeln zutreffen, zählt bei der weitesten.'}));
 return block;
}
/* VU Pattern Match. Was HISTORISCH in der Grundgesamtheit passiert ist,
   wenn eine Konfiguration wie diese vorlag - und ausdruecklich nicht, was
   mit diesem Titel passieren wird. Jede Zeile traegt die Verlustseite
   neben der Gewinnseite; eine Quote ohne ihre Kehrseite waere genau die
   halbe Wahrheit, die aus Forschung eine Erzaehlung macht. */
function pct1(value){return Number.isFinite(value)?(value*100).toFixed(1).replace('.',',')+' %':'–';}
function patternRow(row,baseRate,lossThreshold){
 const up=el('div',{class:'pattern-side'},[
  el('span',{class:'pattern-side-label',text:'verdoppelt'}),
  el('strong',{text:pct1(row.conditionalRate)}),
  el('span',{class:'muted',text:'statt '+pct1(row.baseRate)+' · '+row.lift.toFixed(2).replace('.',',')+'×'})]);
 const down=el('div',{class:'pattern-side is-down'},[
  el('span',{class:'pattern-side-label',text:'halbiert'}),
  el('strong',{text:pct1(row.conditionalLossRate)}),
  el('span',{class:'muted',text:'statt '+pct1(row.baseLossRate)+' · '+row.lossLift.toFixed(2).replace('.',',')+'×'})]);
 /* Chance und Risiko stehen nebeneinander und werden in einem Satz
    eingeordnet. Eine Quote ohne ihre Kehrseite waere die halbe Wahrheit. */
 const tilt=row.asymmetry>=1.1?'Die Chance war stärker erhöht als das Verlustrisiko.'
  :row.asymmetry<=0.9?'Das Verlustrisiko war stärker erhöht als die Chance.'
  :'Chance und Verlustrisiko waren gleich stark erhöht.';
 return el('article',{class:'pattern-card'+(row.asymmetry>=1.1?' is-tilted':'')},[
  el('h3',{text:row.plain}),
  el('div',{class:'pattern-sides'},[up,down]),
  el('p',{class:'pattern-tilt',title:LT('asymmetry'),text:L('asymmetry')+': '+tilt}),
  el('ul',{class:'pattern-facts'},[
   L('medianOutcome')+': '+pct1(row.medianForwardReturn)+' (alle Titel: '+pct1(row.medianForwardReturnPopulation)+')',
   L('medianDrawdown')+': '+pct1(row.medianMaxDrawdownWithinHorizon),
   row.support.toLocaleString('de-DE')+' Fälle · '+row.winners.toLocaleString('de-DE')+' davon verdoppelt',
   L('outOfSample')+': '+(Number.isFinite(row.outOfSampleLift)?row.outOfSampleLift.toFixed(2).replace('.',',')+'×':'–')
  ].map(text=>el('li',{text})))]);
}
function patternMatchSection(patterns,lead){
 const section=el('section',{class:'section pattern-section'},[
  el('span',{class:'eyebrow',text:'Vergangenheit'}),
  el('h2',{text:LQ('patternEngine')}),
  /* ERST DIE AUSSAGE, DANN DIE TABELLE.
     Die Sektion begann mit der Erklaerung der Methodik und einer Zaehlung
     ("3 von 69 pruefbaren Mustern liegen vor"). Die Frage, mit der ein Leser
     herkommt, ist eine andere: war die Chance historisch groesser als das
     Risiko. Sie ist gerechnet - als Median der Asymmetrie der erfuellten
     Muster - und stand nur nicht als Satz da. */
  lead&&lead.sentence?el('p',{class:'pattern-lead',text:lead.sentence}):null,
  el('p',{class:'muted',text:LB('patternEngine')})]);
 if(!patterns||patterns.state!=='AVAILABLE'){
  /* Der Grund des Titels zuerst, der allgemeine Hinweis danach: was hier
     fehlt, ist eine Datengrenze der Studie und kein Fehlschlag des Titels. */
  /* Der genaue Grund ERSETZT den allgemeinen Hinweis, er tritt nicht daneben:
     "keine Wochenreihe veroeffentlicht" und "die Kurshistorie reicht nicht
     aus" sind zwei verschiedene Aussagen, und die zweite waere dort falsch. */
  const grund=patternReasonText(patterns&&patterns.unavailability);
  section.append(notice(L('UNAVAILABLE'),grund||LU('patternEngine')));
  return section;
 }
 section.append(el('p',{class:'muted',text:'Zeitraum '+patterns.horizonMonths+' Monate. „Verdoppelt" heißt: der Kurs stand am Ende mindestens '+
  ((patterns.winnerMinReturn+1))+'-mal so hoch. „Halbiert" heißt: mindestens '+pct1(Math.abs(patterns.lossThreshold))+' tiefer. Gezeigt werden nur Situationen, die auch in Jahren hielten, die bei ihrer Prüfung nicht mitgezählt wurden.'}));
 if(!patterns.holds.length){
  section.append(notice('Dieser Titel sieht derzeit keiner der geprüften Situationen ähnlich',
   'Das ist eine vollständige Antwort, keine Lücke. Es heißt nicht, dass nichts passiert — nur, dass keine der im Voraus festgelegten Konstellationen vorliegt.'));
 }else{
  section.append(el('p',{class:'pattern-count',text:patterns.holds.length+' von '
   +(patterns.coverage?patterns.coverage.measurable:patterns.holds.length+patterns.others.length)
   +' prüfbaren Mustern liegen derzeit vor'
   +(patterns.coverage&&patterns.coverage.notMeasurable?' · '+patterns.coverage.notMeasurable
     +' nicht prüfbar'+(patterns.coverage.reason==='NO_FUNDAMENTALS'?' (keine Geschäftszahlen)':' (Kennzahl fehlt)'):'')}),
   el('div',{class:'pattern-grid'},patterns.holds
    .slice().sort((a,b)=>(b.asymmetry||0)-(a.asymmetry||0))
    .map(row=>patternRow(row,patterns.baseRate,patterns.lossThreshold))));
 }
 section.append(el('p',{class:'muted pattern-caveat',text:patterns.caveats.statement+
  ' Die Reihen sind splitbereinigt und ohne Dividenden; die Grundgesamtheit enthält nur Titel, die es heute noch gibt, was absolute Quoten nach oben zieht. Kein Backtest, keine Prognose.'}));
 return section;
}
/* Strategy Match: zu welchem Anlagestil passt dieser Titel gerade, und was
   fehlt noch. Gezaehlte Bedingungen, kein Rang und keine Renditeaussage. */
function conditionRow(c){
 const mark=c.state==='MET'?'✓':c.state==='NOT_MET'?'○':'–';
 const cmp={gte:'mindestens',lte:'höchstens',gt:'über',lt:'unter',eq:'genau'}[c.operator]||c.operator;
 const detail=c.state==='NOT_MEASURABLE'
  ? 'Für diesen Titel nicht messbar · zählt weder als erfüllt noch als verletzt'
  : 'Position '+pct(c.value)+' · verlangt '+cmp+' '+pct(c.threshold);
 return el('li',{class:'match-condition '+(c.state==='MET'?'is-met':c.state==='NOT_MET'?'is-open':'is-missing')},[
  el('span',{class:'setup-mark','aria-hidden':'true',text:mark}),
  el('div',{},[el('span',{text:c.label}),el('span',{class:'muted',text:detail}),
   c.rationale?el('span',{class:'muted match-why',text:c.rationale}):null])]);
}
function matchCard(profile){
 const met=profile.conditions.filter(c=>c.state==='MET').length,
  measurable=profile.conditions.filter(c=>c.state!=='NOT_MEASURABLE').length;
 const head=el('div',{class:'match-head'},[
  el('h3',{text:profile.label}),
  el('span',{class:'match-score band-'+(profile.band||'NONE'),
   text:profile.state==='AVAILABLE'?pct(profile.match)+' · '+profile.bandLabel:'Nicht auswertbar'})]);
 const body=[el('p',{class:'muted',text:profile.plain||''})];
 if(profile.state==='AVAILABLE'){
  body.push(el('p',{class:'match-count',text:met+' von '+measurable+' messbaren Bedingungen erfüllt'}));
 }else{
  body.push(notice(L('NOT_MEASURABLE'),{
   INSUFFICIENT_MEASURABLE_WEIGHT:'Zu viele Bedingungen dieses Profils sind für diesen Titel nicht messbar. Aus dem Rest wird keine Übereinstimmung gebildet.',
   INSUFFICIENT_MEASURABLE_CONDITIONS:'Es sind zu wenige Bedingungen messbar, um eine Übereinstimmung zu bilden.',
   NO_EVIDENCE:LU('factorDna')
  }[profile.reason]||'Die Bedingungen dieses Profils sind derzeit nicht auswertbar.'));
 }
 body.push(el('ul',{class:'match-conditions'},profile.conditions.map(conditionRow)));
 if(profile.mainRisk)body.push(el('p',{class:'muted match-risk',text:'Hauptrisiko: '+profile.mainRisk}));
 body.push(el('p',{class:'muted match-evidence',title:LT('backtest'),text:LQ('backtest')+' '+LU('backtest')}));
 /* Dieselbe Regel, die das Profil erklärt, selektiert auch. */
 if(profile.screenHref)body.push(link('Alle Titel mit diesem Profil zeigen',profile.screenHref,'button secondary'));
 return el('article',{class:'match-card'+(profile.state==='AVAILABLE'?'':' is-missing')},[head,...body]);
}
/* WAS DIE VEROEFFENTLICHTE SNAPSHOT-REIHE SCHON HERGIBT.

   Hier stand ein fester Satz: es gebe keine historische Vergleichsbasis.
   Das war richtig und blieb es auch, nachdem der Index anfing, seine Reihe
   zu MESSEN - ein fester Satz sieht nicht nach. Jetzt liest die Zeile den
   gemessenen Zustand:

     PENDING_HISTORY  mit dem Abstand in Snapshots, nicht nur mit dem Nein.
     AVAILABLE        die Bestaendigkeit der Zuordnung, ausdruecklich als
                      Beobachtung an zwei Stichtagen - keine Rendite, keine
                      Trefferquote, kein Backtest.

   Was ein Stil abgeworfen hat, steht hier weiterhin nicht. Dafuer braucht
   es Vorwaertsrenditen auf Gesamtrenditebasis und eine punktgenaue
   Indexmitgliedschaft; beides fehlt, und das bleibt so benannt. */
function historicalEvidenceLine(index,best){
 const hist=index&&index.state==='AVAILABLE'?index.historicalEvidence:null;
 if(!hist)return el('p',{class:'muted',text:L('FACTOR_HISTORY_NOT_AVAILABLE')+': '+LB('FACTOR_HISTORY_NOT_AVAILABLE')});
 if(hist.state==='PENDING_HISTORY'){
  return el('p',{class:'muted',text:L('FACTOR_HISTORY_NOT_AVAILABLE')+': '+LB('FACTOR_HISTORY_NOT_AVAILABLE')
   +' Vorhanden '+hist.published+' von '+hist.required+' veröffentlichten Ständen dieser Methodikversion'
   +(hist.publishedDates&&hist.publishedDates.length?' ('+hist.publishedDates.join(', ')+')':'')
   +'. Stände verschiedener Methodikversionen werden nicht zusammengezählt.'});
 }
 if(hist.state!=='AVAILABLE'||hist.kind!=='ASSIGNMENT_PERSISTENCE'){
  return el('p',{class:'muted',text:L('FACTOR_HISTORY_NOT_AVAILABLE')+': '+LB('FACTOR_HISTORY_NOT_AVAILABLE')});
 }
 const eintrag=best?(hist.profiles||[]).find(row=>row.profileId===best.profileId):null;
 const quote=eintrag&&eintrag.persistence!==null
  ? ' Von den Titeln, die am '+hist.from+' zu '+best.label+' passten, passen am '+hist.to+' noch '
    +pct1(eintrag.persistence)+' ('+eintrag.stillMatching+' von '+eintrag.comparable+').'
  : '';
 /* Der Hinweis bleibt - aber nicht als Widerspruch. Vorher stand direkt
    hinter der gemessenen Quote "Keine historische Vergleichsbasis", was
    das Gegenteil dessen behauptet, was die Zeile eben belegt hat. Gemeint
    war und ist: es fehlt der Faktorpanel je vergangenem Stichtag, also
    jede Aussage darueber, wie ein Stil FRUEHER abgeschnitten haette. */
 return el('p',{class:'muted',text:'Beständigkeit der Zuordnung, gemessen zwischen zwei veröffentlichten Ständen ('
  +hist.from+' → '+hist.to+').'+quote
  +' Das ist eine Beobachtung an zwei Stichtagen und keine Rendite, keine Trefferquote und kein Backtest.'
  +' Was weiterhin fehlt – '+L('FACTOR_HISTORY_NOT_AVAILABLE')+': '+LB('FACTOR_HISTORY_NOT_AVAILABLE')});
}
/* WAS SICH AN DER ZUORDNUNG GEAENDERT HAT - ZWISCHEN ZWEI STAENDEN.
 *
 * Gemessen am 25.09.2026 zwischen den veroeffentlichten Staenden
 * 2026-09-23 und 2026-09-24: 37 Wechsel, 36 betroffene Titel von 6.437.
 * Fuer die uebrigen 6.401 ist "nichts geaendert" die Antwort und keine
 * Luecke - deshalb steht sie da, statt die Zeile wegzulassen.
 *
 * Die Zeile sagt ausdruecklich, WORAUF sie sich bezieht. Ein "seit
 * gestern" ohne Datum liest sich wie ein Ereignis von heute; es sind zwei
 * veroeffentlichte Staende, nicht mehr und nicht weniger. */
function assignmentChangeLine(change){
 if(!change||(change.state!=='CHANGED'&&change.state!=='NO_CHANGE'))return null;
 if(change.state==='NO_CHANGE'){
  return el('p',{class:'muted',text:'Zwischen den beiden veröffentlichten Ständen ('+change.from+' → '
   +change.to+') hat sich an der Zuordnung dieses Titels nichts geändert.'});
 }
 const teile=[];
 if(change.entered.length)teile.push('neu erfüllt: '+change.entered.map(e=>e.label).join(', '));
 if(change.exited.length)teile.push('nicht mehr erfüllt: '+change.exited.map(e=>e.label).join(', '));
 return el('p',{class:'assignment-change',text:'Gegenüber dem veröffentlichten Stand vom '+change.from
  +' — am '+change.to+' '+teile.join(' · ')
  +'. Eine Beobachtung zwischen zwei veröffentlichten Ständen — kein Ereignis von heute, '
  +'kein Signal und keine Prognose.'});
}
function strategyMatchSection(match,index,ticker,change){
 const section=el('section',{class:'section match-section'},[
  el('span',{class:'eyebrow',text:'Anlagestil'}),
  el('h2',{text:LQ('strategyMatch')}),
  el('p',{class:'muted',text:LB('strategyMatch')})]);
 if(!match||match.state!=='AVAILABLE'){
  /* DREI GRUENDE, DIE NICHT DASSELBE SIND.
  
     Gemessen am 25.09.2026: von 6.358 Titeln hat bei 810 KEIN Profil genug
     messbare Bedingungen - 797 davon, weil zu den verlangten Eigenschaften
     gar keine Faktorevidenz vorliegt, 13 (103 Profilfaelle), weil zu wenige
     Bedingungen messbar sind. Sie alle bekamen den Satz "konnten nicht
     geladen oder nicht geprueft werden". Geladen und geprueft wurde aber
     sehr wohl; das Ergebnis ist, dass nichts messbar war. Ein
     Ladefehler-Satz vor einem Datenbefund ist eine falsche Auskunft ueber
     die eigene Lage - und sie laesst den Leser an der falschen Stelle
     suchen. */
  section.append(notice(LU('strategyMatch'),{
   NOT_COVERED_BY_FACTOR_EVIDENCE:'Für diesen Titel liegt keine Quant-V2-Faktorevidenz vor, gegen die Profile geprüft werden könnten.',
   NO_EVIDENCE:'Zu den Eigenschaften, die diese Profile verlangen, liegt für diesen Titel keine Faktorevidenz vor. Die Profile wurden geprüft; messbar war keine ihrer Bedingungen. Das ist eine Lücke in der Datengrundlage und keine Aussage darüber, dass der Titel zu keinem Stil passt.',
   INSUFFICIENT_MEASURABLE_CONDITIONS:'Für jedes Profil sind zu wenige Bedingungen messbar, um eine Übereinstimmung zu bilden. Aus dem Rest wird keine gebildet - auch nicht als Näherung.',
   INSUFFICIENT_MEASURABLE_WEIGHT:'Die messbaren Bedingungen tragen in jedem Profil zu wenig Gewicht, um eine Übereinstimmung zu bilden.'
  }[match?.reason]||'Die Profile oder die Faktorevidenz konnten nicht geladen oder nicht geprüft werden. Es werden keine Ersatzprofile gebildet.'));
  return section;
 }
 const ordered=[...match.profiles].sort((a,b)=>(b.state==='AVAILABLE'?b.match:-1)-(a.state==='AVAILABLE'?a.match:-1));
 /* Zuerst die Antwort in einem Satz, dann erst die Tabelle.

    DREI FAELLE, NICHT ZWEI. Gemessen am 25.09.2026 ueber 6.358 Titel:
    2.738 haben einen Stil ab 40 %, 2.810 keinen darueber - und 810 haben
    KEIN einziges messbares Profil. Die dritte Gruppe bekam den Satz der
    zweiten: "Zu keinem Anlagestil passt dieser Titel derzeit gut ... Das
    ist eine Antwort, keine Luecke." Bei ihnen ist es genau umgekehrt. Ein
    nicht messbares Profil als Nichtpassung auszugeben ist die Art von
    stiller Verwechslung, die §40 ausschliesst: sie behauptet ein Ergebnis,
    wo nichts gerechnet wurde. */
 const best=ordered.find(profile=>profile.state==='AVAILABLE');
 if(best&&best.match>=40){
  const met=best.conditions.filter(c=>c.state==='MET').length;
  const messbar=best.conditions.filter(c=>c.state!=='NOT_MEASURABLE').length;
  const ohne=best.conditions.length-messbar;
  /* "2 von 2 Bedingungen" liest sich vollstaendig. Waren drei weitere
     nicht messbar, ist es das nicht - und die Karte darunter sagt es
     ohnehin. Derselbe Satz, dieselbe Einschraenkung. */
  section.append(el('p',{class:'match-lead'},[el('span',{text:'Diese Aktie passt aktuell am besten zu: '}),
   el('strong',{text:best.label}),
   el('span',{class:'muted',text:' — '+met+' von '+messbar+' messbaren Bedingungen erfüllt'
    +(ohne?', '+ohne+' weitere '+(ohne===1?'ist':'sind')+' für diesen Titel nicht messbar':'')+'.'})]));
 }else{
  /* EIN NEIN, DAS WEITERFUEHRT.
   *
   * Gemessen am 26.09.2026 an der Reise-Stichprobe: 217 von 500 Titeln
   * bekommen hier "zu keinem Anlagestil passt dieser Titel gut" - das sind
   * 43 Prozent und damit der haeufigste Satz dieses Abschnitts. Er war
   * richtig und endete im Nichts: welcher Stil am naechsten kommt und was
   * ihm fehlt, stand nur in den Karten darunter, jede fuer sich.
   *
   * Beides ist bereits gerechnet - `match` je Profil und der Zustand je
   * Bedingung. Hier wird nichts Neues geschaetzt, nichts gerundet und
   * keine Schwelle verschoben: dasselbe Ergebnis, einen Satz weiter
   * gedacht. Die Reihenfolge ist die des Vertrags (`ordered`), die
   * Bedingungen tragen ihre eigenen Namen. */
  const naechste=best&&best.state==='AVAILABLE'?best:null;
  const offen=naechste?naechste.conditions.filter(c=>c.state==='NOT_MET'):[];
  const nichtMessbar=naechste?naechste.conditions.filter(c=>c.state==='NOT_MEASURABLE').length:0;
  const erfuellt=naechste?naechste.conditions.filter(c=>c.state==='MET').length:0;
  const messbar=naechste?naechste.conditions.length-nichtMessbar:0;
  section.append(notice('Zu keinem Anlagestil passt dieser Titel derzeit gut',
   VUProductLanguage.negative('strategyMatch')+' Das ist eine Antwort, keine Lücke.'));
  if(naechste){
   const namen=offen.map(c=>c.label).filter(Boolean);
   section.append(el('p',{class:'match-nearest'},[
    el('span',{text:'Am nächsten kommt '}),el('strong',{text:naechste.label}),
    el('span',{text:' mit '+pct(naechste.match)+' — '+erfuellt+' von '+messbar+' messbaren Bedingungen erfüllt'
     +(namen.length?'. Offen '+(namen.length===1?'ist':'sind')+': '+namen.join(', '):'')
     +(nichtMessbar?'. Für diesen Titel nicht messbar: '+nichtMessbar+(nichtMessbar===1?' Bedingung':' Bedingungen'):'')+'.'}),
    el('span',{class:'muted',text:' Das ist die Nähe zu einem Bedingungssatz und keine Prognose.'})]));
  }
 }
 const wechsel=assignmentChangeLine(change);
 if(wechsel)section.append(wechsel);
 section.append(
  el('p',{class:'muted',text:'Ein Anlagestil ist ein Satz fester Bedingungen. Gezählt wird, wie viele davon dieser Titel erfüllt — das ist kein Rang, keine Erfolgswahrscheinlichkeit und keine Renditeaussage.'}),
  el('div',{class:'match-grid'},ordered.map(matchCard)),
  el('details',{},[el('summary',{text:'Methodik & Grenzen'}),
   el('p',{text:'Evidenz: '+match.evidenceNamespace+' · '+match.evidenceMethodologyVersion+'. Profile: '+match.methodologyVersion+'. Quant V1 bleibt unverändert und wird hier nicht gelesen.'}),
   el('p',{text:'Die Schwellen beschreiben, ab welcher Position eine Eigenschaft für ein Profil als erfüllt gilt. Sie sind für jeden Titel gleich und nicht gegen historische Ergebnisse optimiert.'}),
   el('p',{class:'muted',text:'Eine Bedingung ohne Faktorwert zählt weder als erfüllt noch als verletzt; sie verlässt den Nenner und steht als „nicht messbar“ in der Liste.'}),
   /* Die Grenze gehoert neben die Profile und nicht in eine Fussnote. Der
      Grund nennt die fehlende Datengrundlage und nicht einen fehlenden
      Zertifizierungsschritt - sonst liest es sich, als muesste nur noch
      jemand etwas freigeben. */
   historicalEvidenceLine(index,best)]));
 if(best&&best.state==='AVAILABLE')section.append(strategyPeers(index,best.profileId,ticker));
 return section;
}
/* Dasselbe Profil, andersherum gelesen. Anders als bei der Setup-Kaskade
   gibt es hier keinen Vorrang: ein Titel darf zu mehreren Stilen passen,
   und die Liste eines Profils ist genau die Treffermenge seines
   Praedikats. Getrennt bleiben muessen zwei Nullen - kein Titel passt
   (ein Befund) und die Eigenschaft ist gar nicht erhoben (eine Luecke). */
function strategyPeers(index,profileId,self){
 if(!index||index.state!=='AVAILABLE')return null;
 const entry=index.profiles.find(p=>p.profileId===profileId);
 if(!entry)return null;
 const block=el('details',{class:'setup-peers'},[el('summary',{text:LQ('strategyScreen')})]);
 if(entry.availability.state!=='AVAILABLE'){
  block.append(el('p',{class:'muted',text:LU('strategyScreen')}),
   el('p',{class:'muted',text:LB(entry.availability.reason)}));
  return block;
 }
 const peers=(entry.tickers||[]).filter(t=>t!==self);
 block.append(el('p',{text:peers.length
  ? (peers.length===1?'Ein weiterer Titel erfüllt am '+index.asOf+' dieselben Bedingungen.'
                     :peers.length.toLocaleString('de-DE')+' weitere Titel erfüllen am '+index.asOf+' dieselben Bedingungen.')
  : LN('strategyScreen')}));
 if(peers.length)block.append(el('p',{class:'peer-tickers'},peers.slice(0,24).map(t=>link(t,href('quant',t),'peer-chip'))));
 if(peers.length>24)block.append(el('p',{class:'muted',text:'Gezeigt werden 24 von '+peers.length.toLocaleString('de-DE')+'.'}));
 block.append(el('p',{class:'muted',text:'Auswahl nach Regel, keine Rangfolge und keine Empfehlung. Ein Titel darf zu mehreren Stilen passen.'}));
 return block;
}
/* Die Besetzung aller Stile auf einen Blick. */
function strategyDistribution(index){
 if(!index||index.state!=='AVAILABLE')return null;
 const section=el('section',{class:'section setup-distribution'},[
  ...sectionHead('Stile im Markt','strategyScreen'),
  el('p',{class:'muted',text:'Stand '+index.asOf+' · '+index.universe.toLocaleString('de-DE')+' ausgewertete Titel. Ein Titel darf zu mehreren Stilen passen; die Zahlen addieren sich deshalb nicht zum Universum.'})]);
 for(const entry of index.profiles){
  const open=entry.availability.state==='AVAILABLE';
  const row=el('article',{class:'distribution-row'+(open?'':' is-pending')});
  row.append(el('div',{class:'distribution-head'},[
   el('span',{class:'chip',text:entry.label}),
   el('strong',{class:'distribution-count',text:entry.count===null?'–':entry.count.toLocaleString('de-DE')})]));
  row.append(el('p',{class:'muted',text:open?entry.plain:LB(entry.availability.reason)}));
  if(open&&entry.tickers&&entry.tickers.length){
   row.append(el('p',{class:'peer-tickers'},entry.tickers.slice(0,12).map(t=>link(t,href('quant',t),'peer-chip'))));
  }else if(open){
   row.append(el('p',{class:'muted',text:LN('strategyScreen')}));
  }
  section.append(row);
 }
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{class:'muted',text:'Profile '+index.methodologyVersion+' über '+index.evidenceNamespace+'. Die Liste eines Stils ist die Treffermenge seiner eigenen Regel — dieselbe Regel, die auf einer Aktienseite erklärt, warum ein Titel passt.'}),
  el('p',{class:'muted',text:L('FACTOR_HISTORY_NOT_AVAILABLE')+': '+LB('FACTOR_HISTORY_NOT_AVAILABLE')})]));
 return section;
}
/* WAS SPRICHT DAFÜR, WAS DAGEGEN.

   Kein neuer Motor und keine neue Zahl: gelesen wird ausschliesslich, was
   die Faktorevidenz, die Veraenderungsmessung und der Musterabgleich
   ohnehin schon berechnet haben. Was hier entsteht, ist die Sortierung -
   und die Regel, dass keine Seite ohne die andere gezeigt wird. */
/* WAS SPRICHT DAFUER, WAS DAGEGEN - UND WAS IST NOCH NICHT BEWERTBAR.
 *
 * Diese Sektion hatte zwei Spalten und baute ihre Saetze selbst: „Bewertung
 * liegt ueber dem Vergleich: Position 82,0 %" - also die Wiederholung des
 * Faktorwerts, den der Leser eine Sektion hoeher schon gesehen hat. Und sie
 * hatte keine dritte Spalte: eine kurze Dafuer-Liste liest sich wie ein
 * Urteil, wenn nicht dabeisteht, was ausdruecklich NICHT bewertet wurde.
 *
 * Jetzt kommen die Aussagen aus derselben Engine wie die Auskunft oben - in
 * Alltagssprache, je Aussage mit ihrem Beleg, und in drei Gruppen. */
function prosAndCons(brief){
 if(!brief)return null;
 return el('section',{class:'section balance-section'},[
  el('span',{class:'eyebrow',text:'Abwägung'}),
  el('h2',{text:'Was spricht dafür, was dagegen?'}),
  el('p',{class:'muted',text:'Alle drei Gruppen aus denselben Messungen. Keine Empfehlung und keine Gewichtung — was belegt dafür spricht, was belegt dagegen, und was noch nicht bewertbar ist.'}),
  el('div',{class:'brief-balance'},[
   briefListe('Spricht dafür',brief.pro,'is-pro','Hier steht derzeit nichts Belegbares.'),
   briefListe('Spricht dagegen',brief.contra,'is-con','Hier steht derzeit nichts Belegbares.'),
   briefListe('Noch nicht bewertbar',brief.unknown,'is-unknown','Alles Gemessene ist eingeordnet.')])]);
}

/* WIE BELASTBAR IST DIE HISTORISCHE EVIDENZ.

   Die Belastbarkeit ist keine Rendite. Sie sagt, wie viel man auf die
   historischen Zahlen daneben geben kann - und nennt beim Namen, was an
   ihnen schieflaeuft. */
function evidenceTrustSection(patterns){
 const section=el('section',{class:'section trust-section'},[
  el('span',{class:'eyebrow',text:'Belastbarkeit'}),
  el('h2',{text:LQ('backtestTrustScore')}),
  el('p',{class:'muted',text:LB('backtestTrustScore')})]);
 if(!patterns||patterns.state!=='AVAILABLE'){
  /* Dieselbe Auskunft an der Belastbarkeitsstation: ohne Vergleich gibt es
     auch nichts, dessen Belastbarkeit man beschreiben koennte. */
  /* Der genaue Grund ERSETZT den allgemeinen Hinweis, er tritt nicht daneben:
     "keine Wochenreihe veroeffentlicht" und "die Kurshistorie reicht nicht
     aus" sind zwei verschiedene Aussagen, und die zweite waere dort falsch. */
  const grund=patternReasonText(patterns&&patterns.unavailability);
  section.append(notice(L('UNAVAILABLE'),grund||LU('patternEngine')));
  return section;
 }
 const withheld=Object.entries({...(patterns.withheld?.price||{}),...(patterns.withheld?.fundamental||{})});
 const facts=[
  ['Woraus die Zahlen stammen','Gezählte Fälle aus der Vergangenheit über hunderttausende Beobachtungen, nicht aus einem einzelnen Beispiel.'],
  ['Was geprüft wurde',LB('outOfSample')],
  [L('survivorship'),LB('survivorship')],
  ['Kursbasis','Splitbereinigt und ohne Dividenden. Das trifft Gewinner und Nicht-Gewinner gleichermaßen und wird nicht geschätzt.'],
  [LQ('backtest'),LU('backtest')]
 ];
 section.append(el('ul',{class:'trust-list'},facts.map(([title,text])=>el('li',{},[
  el('strong',{text:title}),el('span',{class:'muted',text})]))));
 if(withheld.length){
  const total=withheld.reduce((sum,[,count])=>sum+count,0);
  section.append(el('details',{class:'trust-withheld'},[
   el('summary',{text:total+' geprüfte Situationen werden hier bewusst nicht gezeigt'}),
   ...withheld.map(([verdict,count])=>el('p',{},[
    el('strong',{text:count+' × '+L(verdict)+': '}),el('span',{class:'muted',text:LB(verdict)})]))]));
 }
 /* Die Backtest-Schicht steht schon in der Sprache bereit, in der sie
    gelesen werden soll: erst die fünf Größen, die ein Einsteiger braucht,
    die Fachwerte darunter eingeklappt. Zahlen stehen keine drin - das Gate
    ist geschlossen, und jede Zahl hier wäre erfunden. Die Struktur jetzt
    zu haben heißt, dass sie später nicht in Fachsprache aufgeht. */
 const backtestRow=id=>el('li',{},[el('strong',{text:L(id)}),
  el('span',{class:'muted',text:LB(id)}),
  el('span',{class:'muted trust-pending',text:LU(id)})]);
 section.append(el('details',{class:'trust-backtest'},[
  el('summary',{text:LQ('backtest')}),
  el('p',{class:'muted',text:LB('backtest')}),
  el('ul',{class:'trust-list'},['totalReturn','maxDrawdown','hitRate','situationCount','benchmarkDelta'].map(backtestRow)),
  el('details',{},[el('summary',{text:'Fachwerte'}),
   el('ul',{class:'trust-list'},['sharpe','sortino','exposure','turnover','slippage'].map(backtestRow))])]));
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{class:'muted',text:'Musterforschung '+(patterns.studies?.price?.methodologyVersion||'—')+
   (patterns.studies?.fundamental?' · Fundamentalfamilie '+patterns.studies.fundamental.methodologyVersion:'')+
   '. Backtest-Zertifizierung: '+patterns.caveats.backtest+'. Prognose: '+patterns.caveats.prediction+'.'})]));
 return section;
}

async function quantPage(ticker){
 /* DIESELBE AUSKUNFT WIE AUF DER AKTIENSEITE.
  *
  * Vorher holte diese Ansicht ihre Evidenz selbst und bildete ihren eigenen
  * Zusammenfassungssatz. Zwei Zusammenfassungen desselben Titels auf zwei
  * Ansichten sind zwei Wahrheiten, sobald eine von beiden sich aendert -
  * deshalb liest hier dieselbe Engine dieselben Quellen. */
 const [brief,profileContract,setupIndex,strategyIndex,assignmentChange]=await Promise.all([
  api.getIntelligenceBrief(ticker).catch(()=>null),
  api.getStrategyProfiles().catch(()=>null),api.getSetupScreenIndex().catch(()=>null),
  api.getStrategyIndex().catch(()=>null),api.getAssignmentChange(ticker).catch(()=>null)]);
 const quellen=(brief&&brief.sources)||{};
 const data=quellen.factors||await api.getFactorEvidence(ticker);
 const match=quellen.match||null,observation=quellen.setup||null,patterns=quellen.patterns||null;
 /* Die Screener-Abfrage entsteht aus derselben Regel wie die Bewertung; sie
    wird nicht daneben noch einmal formuliert. */
 if(match?.state==='AVAILABLE'&&profileContract?.state==='AVAILABLE'){
  for(const profile of match.profiles){
   const definition=profileContract.contract.profiles.find(p=>p.profileId===profile.profileId);
   if(!definition)continue;
   try{profile.screenHref=href('screener')+'&query='+encodeURIComponent(VUScreenerWorkspace.encode(VUStrategyMatch.screenQuery(definition)));}catch{}
  }
 }
 /* Der SetupState-Vertrag sagt selbst, ob ein verfuegbarer Zustand
    ueberhaupt zulaessig ist. Solange er das verneint, waere eine Abfrage
    nur teuer; sie wird geholt, sobald die Methodik aktiv ist. */
 const setup=VUSetupStateContract.AVAILABLE_OBSERVATIONS_ALLOWED?(quellen.stock||await api.getStockIntelligence(ticker).catch(()=>null))?.setupState||null:null;
 if(data.state!=='AVAILABLE'){
  main.append(heading(data.name||'Quant-Analyse',ticker));
  /* DIE ZWEITE HAELFTE DER REISE VERDICHTET GENAUSO.

     Gemessen im gebauten Release: diese Ansicht zeigte fuer ACAA vier
     Absagekaesten untereinander - keine Faktor-Evidenz, keine
     Setup-Beobachtung, "Nicht bewertbar", kein Anlagestil. Dieselbe Lage,
     dieselbe Ursache, viermal abgesagt. Die Regel und die Saetze kommen aus
     demselben Vertrag wie auf der Aktienseite; ein zweites Vokabular waere
     genau die Doppelsprache, die das Woerterbuch abschafft.

     Was verfuegbar ist, bleibt sichtbar: 426 Titel tragen einen
     veroeffentlichten Setup-Zustand ohne Faktorzeile. Die fehlende
     Faktorzeile ist ein Grund, die Faktoren nicht zu zeigen, und kein
     Grund, den Rest zu verschweigen. */
  const form=VUJourneyShape.assess(VUJourneyShape.stationsFrom(
   {factors:data,setup:observation,patterns,match,assignmentChange}));
  const knapp=form.shape!=='FULL';
  if(!knapp)main.append(notice('Für diesen Titel liegt keine Faktor-Evidenz vor',data.reason==='NOT_COVERED_BY_FACTOR_EVIDENCE'?'Dieser Titel gehört zum Produktuniversum, erfüllt aber die Datenanforderungen der Faktor-Methodik derzeit nicht. Es werden keine Ersatzwerte gebildet.':data.reason==='NOT_IN_PRODUCT_UNIVERSE'?'Dieser Titel ist im kanonischen Produktuniversum nicht enthalten.':'Die Faktor-Evidenz konnte nicht geladen oder nicht geprüft werden.'));
  if(!knapp||form.substantive.includes('setup'))main.append(setupJourney(setup,observation,setupIndex,brief&&brief.setup));
  if(!knapp||form.substantive.includes('patterns'))main.append(patternMatchSection(patterns,brief&&brief.pattern));
  if(!knapp||form.substantive.includes('strategy'))main.append(strategyMatchSection(match,strategyIndex,ticker,assignmentChange));
  if(knapp)main.append(journeyGapSection(form,ticker,form.shape==='MINIMAL'));
  main.append(actions([{label:'Aktie untersuchen',href:href('stock',ticker)},{label:'Was ist Quant?',href:href('explain')},{label:'Bestehender Quant Workspace',href:'/quant/ranking/'}]));
  return;
 }
 const rated=data.factors.filter(f=>f.state==='AVAILABLE');
 /* AUCH HIER ENTSCHEIDET DER GEHALT, NICHT DER ZUSTAND.

    Gemessen: ACAA traegt eine Faktor-Evidenz mit Zustand AVAILABLE - und
    null bewerteten Faktoren. Diese Ansicht lief deshalb in den vollen Pfad
    und zeigte sieben leere Eigenschaftszeilen, eine Tabelle ohne Zahlen und
    darunter mehrere Absagen. Ein Zustand ist kein Wert; gezeigt wird, was
    einen hat. Kursstaerke, Anlegerrendite und die Dafuer-Dagegen-Bilanz
    haengen an den bewerteten Eigenschaften - ohne eine einzige bewertete
    Eigenschaft haben sie nichts zu zeigen. */
 const form=VUJourneyShape.assess(VUJourneyShape.stationsFrom(
  {factors:data,setup:observation,patterns,match,assignmentChange}));
 const knapp=form.shape!=='FULL';
 const zeig=(id)=>!knapp||form.substantive.includes(id);
 /* HERO: Name, Zustand, ein Satz - keine zwanzig Kennzahlen. */
 main.append(el('section',{class:'quant-hero'},[
  el('span',{class:'eyebrow',text:'Wie stark ist diese Aktie?'}),
  el('h1',{text:data.name||'Quant-Analyse'}),
  el('p',{class:'quant-ticker',text:data.ticker+(data.peer?.industry?' · Branchenschlüssel '+data.peer.industry:'')}),
  /* Ein Satz, nicht zwei nebeneinander: die Auskunft nennt Stärken,
     Schwächen und den Setup-Zustand, die Bewegungszeile den Wechsel. */
  el('p',{class:'quant-summary',text:(brief&&brief.headline&&brief.headline.sentence)||data.summary}),
  el('p',{class:'quant-change',text:data.changeHeadline}),
  el('div',{class:'quant-chips'},[
   el('span',{class:'chip',title:LT('factorDna'),text:rated.length+' von 7 Eigenschaften bewertet'}),
   el('span',{class:'chip chip-muted',title:LT('compositeScore'),text:L('compositeScore')+': '+L('WITHHELD').toLowerCase()}),
   el('span',{class:'chip chip-muted',text:'Kursstand '+data.asOf})]),
  el('p',{class:'quant-orientation',text:knapp
   /* Ein Versprechen ueber acht Abschnitte, von denen dann drei kommen,
      laesst die Seite kaputt wirken - auch wenn jede einzelne Absage
      stimmt. Der Satz sagt, was WIRKLICH folgt. */
   ?'Darunter steht, was zu diesem Titel schon aussagekräftig ist — und danach, welche Bereiche noch auf Daten warten.'
   :'Darunter der Reihe nach: warum das so ist, was sich gerade ändert, ob sich eine Situation aufbaut, was dafür und dagegen spricht, wie ähnliche Situationen früher ausgingen, welcher Anlagestil passt — und wie belastbar das alles ist.'})]));
 const company=el('select',{'aria-label':'Quant Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name})));
 if(!universe.stocks.some(s=>s.ticker===data.ticker))company.append(el('option',{value:data.ticker,text:data.ticker+' · '+data.name}));
 company.value=data.ticker;company.onchange=()=>location.assign(href('quant',company.value));
 main.append(el('div',{class:'workspace-controls'},[company,link('Was ist Quant?',href('explain'),'button secondary')]));
 /* FACTOR DNA */
 if(zeig('factorStrength'))main.append(el('section',{class:'section dna-section'},[
  ...sectionHead('Stärken & Schwächen','factorDna'),
  el('p',{class:'muted',text:'Tippe auf eine Eigenschaft, um zu sehen, woran sie gemessen wurde.'}),
  branchenvorlageHinweis(data),
  el('div',{class:'dna-list'},data.factors.map(factorRow)),
  el('p',{class:'muted',text:'Ein Gesamtscore wird bewusst nicht gebildet: '+(data.composite?.reason==='QUANT_V2_NOT_ACTIVE'?'die Methodik verlangt alle sieben Faktoren, und der Erwartungstrend fehlt ohne lizenzierte Datenquelle.':'die Methodik ist noch nicht freigegeben.')})]));
 /* KURSSTAERKE UND ANLEGERRENDITE

    Die beiden Fragen, die Option C getrennt haelt, stehen hier
    nebeneinander - weil sie nur nebeneinander verstaendlich sind. Wer
    nur die Kursstaerke sieht, haelt sie fuer den Ertrag; wer nur den
    Ertrag sieht, haelt ihn fuer die Kursbewegung. */
 if(zeig('factorStrength'))main.append(returnKindSection(data));
 /* CHANGE */
 const change=data.change,grouped=['IMPROVING','DETERIORATING','STABLE'].map(id=>[id,L(id)]);
 const changeSection=el('section',{class:'section change-section'},sectionHead('Bewegung','changeEngine'));
 for(const [direction,label] of grouped){
  const entries=change.items.filter(x=>x.state==='AVAILABLE'&&x.direction===direction);
  if(!entries.length)continue;
  changeSection.append(el('h3',{class:'change-group',text:label}),el('div',{class:'change-grid'},entries.map(changeCard)));
 }
 const missing=change.items.filter(x=>x.state!=='AVAILABLE');
 if(missing.length)changeSection.append(el('details',{class:'change-missing'},[el('summary',{text:missing.length+' Bereiche sind derzeit nicht messbar'}),...missing.map(x=>el('p',{},[el('strong',{text:x.label+': '}),el('span',{class:'muted',text:x.reasonText})]))]));
 if(zeig('change'))main.append(changeSection);
 /* Die Lesereihenfolge folgt der Frage, die ein Nutzer wirklich stellt:
    wie stark - warum - was aendert sich - baut sich etwas auf - was
    spricht dafuer und dagegen - wie sah das frueher aus - welcher Stil
    passt - wie belastbar ist das alles. */
 if(zeig('setup'))main.append(setupJourney(setup,observation,setupIndex,brief&&brief.setup));
 if(zeig('factorStrength'))main.append(prosAndCons(brief));
 if(zeig('patterns'))main.append(patternMatchSection(patterns,brief&&brief.pattern));
 if(zeig('strategy'))main.append(strategyMatchSection(match,strategyIndex,ticker,assignmentChange));
 if(zeig('patterns'))main.append(evidenceTrustSection(patterns));
 /* Und einmal, am Ende der Reise: was noch nicht geht und warum. */
 if(knapp)main.append(journeyGapSection(form,ticker,form.shape==='MINIMAL'));
 /* EVIDENZ & WORKSPACE */
 main.append(el('section',{class:'section'},[
  el('span',{class:'eyebrow',text:'Datenstand'}),
  el('h2',{text:'Worauf diese Analyse beruht'}),
  el('ul',{class:'evidence-list'},[
   'Kursdaten bis '+data.asOf+' · Kursbasis '+(data.priceBasis==='adjustedClose'?'bereinigte Schlusskurse':data.priceBasis),
   data.fundamentalsAsOf?'Geschäftszahlen bis '+data.fundamentalsAsOf+(data.fundamentalsAvailableAt?' · öffentlich bekannt seit '+data.fundamentalsAvailableAt:''):'Keine zeitpunktsicheren Geschäftszahlen verfügbar',
   Number.isFinite(data.marketCap)?'Börsenwert '+(data.marketCap/1e9).toLocaleString('de-DE',{maximumFractionDigits:1})+' Mrd. USD · aus veröffentlichter Aktienzahl und letztem Schlusskurs':'Kein Börsenwert berechenbar',
   'Methodik '+data.methodologyVersion+' · abgeleitet aus '+data.derivedFrom,
   'Datenqualität der Kursreihe: '+(data.dataQuality||'nicht angegeben')
  ].map(text=>el('li',{text}))),
  el('p',{class:'muted',text:'Alle Geschäftszahlen werden nur verwendet, wenn ihr Veröffentlichungsdatum vor dem Auswertungsstichtag liegt. Kein Wert aus der Zukunft fließt in eine Aussage über die Vergangenheit.'})]));
 main.append(actions([{label:'Was ist Quant?',href:href('explain')},{label:'Kursstruktur',href:href('technical',data.ticker)},{label:'Fundamental-Historie',href:href('fundamentals',data.ticker)},{label:'Vergleichen',href:href('compare',data.ticker)},{label:'Aktie untersuchen',href:href('stock',data.ticker)}]));
}
/* Die Einsteigerfläche. Erst Bedeutung, dann Beispiele, keine Formel. */
async function explainPage(){
 /* ===============================================================
    METHODIK IST EIN PRODUKTMERKMAL, KEIN ANHANG - ABER SIE IST AUCH
    KEIN LEHRBUCH.

    Vorher standen hier 1.228 Woerter in 28 Kaesten, alle gleichzeitig
    offen. Wer wissen will, ob er uns trauen kann, bekam eine Vorlesung.

    Jetzt: drei Saetze, die die Vertrauensfrage beantworten, und darunter
    zehn Fragen zum Aufklappen. Jeder Block von vorher ist unveraendert
    erhalten - er traegt nur jetzt die Frage als Titel, unter der man ihn
    sucht, statt des Fachbegriffs, den man erst lernen muesste. */
 const tiefeBloecke=[];
 const tief=(frage,knoten)=>{if(knoten)tiefeBloecke.push([frage,knoten]);};

 main.append(el('section',{class:'q-hero'},[
  el('h1',{text:'Wir zeigen dir, wie wir rechnen.'}),
  el('p',{class:'q-hero-lead',text:'Jede Aussage lässt sich auf eine Zahl, einen Zeitraum und eine Quelle zurückführen. Fehlt eine Zahl, sagen wir das — wir schätzen sie nicht.'})]));

 main.append(el('ul',{class:'q-trust'},[
  ['Dieselben Regeln für alle','Keine Aktie bekommt eine Sonderbehandlung.'],
  ['Wir rechnen nichts schön','Wo Daten fehlen, steht das da, statt ersetzt zu werden.'],
  ['Keine Empfehlung','Wir ordnen ein. Was du kaufst, entscheidest du.']
 ].map(([t,s])=>el('li',{},[el('strong',{text:t}),el('span',{text:s})]))));
 /* "WAS IST QUANT?" IST DIE ERSTE FRAGE DES AUFTRAGS an diese Seite - und
    ihre Antwort steht im Sprachverzeichnis, nicht in dieser Datei. Beim
    Umbau war die Überschrift verschwunden, weil die Bühne ihren Platz
    einnahm; die Browser-QA hat es gemeldet. Die Bühne trägt jetzt den
    Anspruch, diese Karte die Definition. */
 main.append(card(LQ('quant'),null,[
  /* Der Satz über Zahl, Zeitraum und Quelle steht schon auf der Bühne
     darüber - zweimal dasselbe liest sich wie ein Fehler. */
  el('p',{class:'q-card-intro',text:LB('quant')}),
  /* Der interne Name gehört hinter eine Klappe, nicht in die Hauptkopie -
     genau das prüft der Sprachwächter, und die alte Erklärseite hat es
     ebenso gehalten. */
  el('details',{},[el('summary',{text:'Fachbegriff'}),
   el('p',{class:'muted',text:VUProductLanguage.pro('quant')+' · intern: '+VUProductLanguage.internal('quant')})])]));
 tief('Wie tief kann ich nachbohren?',card('Die fünf Ebenen jeder Einschätzung',
  'Du kannst auf jeder Ebene aufhören. Wer nur das Ergebnis will, sieht kein Fachwort; wer prüfen will, kommt bis zur Methodik.',
  [tiles(5,[
   tile('target','1 · Ergebnis','Die Einordnung in einem Wort oder einer Zahl.'),
   tile('bulb','2 · Warum','Was dafür und was dagegen spricht — beides.'),
   tile('layers','3 · Komponenten','Welche Einzelgrößen den Faktor bestimmen.'),
   tile('doc','4 · Daten','Konkrete Werte, Zeiträume, Stichtage, Quelle.'),
   tile('shield','5 · Methodik','Regel, Gewichtung, Version, Sonderlogik, Grenze.')])]));
 tief('Wofür ist das gut – und wofür nicht?',el('section',{class:'section'},[
  el('h2',{text:'Wozu das gut ist'}),
  el('div',{class:'explain-grid'},[
   ['Dein Broker beantwortet','Was kostet die Aktie? Wie kaufe ich sie? Was besitze ich?'],
   ['Vision Universe beantwortet','Welche Aktie ist interessant? Warum? Was verändert sich gerade? Wo liegt das Risiko?']
  ].map(([title,text])=>el('article',{class:'explain-card'},[el('h3',{text:title}),el('p',{text})])))]));
 tief('Welche sieben Eigenschaften prüfen wir?',el('section',{class:'section'},[
  el('h2',{text:'Die sieben Eigenschaften'}),
  el('p',{class:'muted',text:'Jedes Unternehmen wird an denselben sieben Eigenschaften gemessen. Immer in dieser Reihenfolge.'}),
  el('div',{class:'explain-factors'},VUFactorEvidence.FACTOR_ORDER.map(id=>{const m=VUFactorEvidence.FACTOR_MEANING[id];return el('article',{class:'explain-factor'},[el('h3',{text:m.label}),el('p',{class:'explain-question',text:m.question}),el('p',{text:m.plain}),el('p',{class:'muted',text:m.higherMeans})]);}))]));
 tief('Welche Fragen beantwortet Quant?',el('section',{class:'section'},[
  el('h2',{text:'Welche Fragen Quant beantwortet'}),
  el('p',{class:'muted',text:'Jede Ansicht beantwortet genau eine Frage. Hier stehen sie alle nebeneinander.'}),
  el('div',{class:'explain-factors'},['factorDna','changeEngine','setupState','patternEngine','strategyMatch','backtestTrustScore','marketRegime'].map(id=>
   el('article',{class:'explain-factor'},[
    el('h3',{text:LQ(id)}),
    el('p',{text:LB(id)}),
    el('p',{class:'muted',text:LT(id)}),
    el('details',{},[el('summary',{text:'Fachbegriff'}),el('p',{class:'muted',text:VUProductLanguage.pro(id)+' · intern: '+VUProductLanguage.internal(id)})])])))]));
 tief('Wie entsteht eine Einschätzung Schritt für Schritt?',el('section',{class:'section'},[
  el('h2',{text:'Wie eine Position entsteht'}),
  el('ol',{class:'explain-steps'},[
   'Für jede Eigenschaft werden mehrere Einzelkennzahlen aus geprüften Quellen berechnet.',
   'Extreme Ausreißer werden an den Rändern gekappt, damit ein einzelner Sonderfall nicht das ganze Bild verschiebt.',
   'Jede Kennzahl wird mit allen anderen Unternehmen verglichen — bevorzugt innerhalb derselben Branche.',
   'Aus diesen Vergleichen entsteht eine Position zwischen 0 und 100. 50 bedeutet Mittelfeld.',
   'Fehlt eine Kennzahl, bleibt sie fehlend. Sie wird nicht geschätzt und ihr Gewicht wandert nicht zu einer anderen.'
  ].map(text=>el('li',{text})))]));
 tief('Was steht hier bewusst NICHT?',el('section',{class:'section'},[
  el('h2',{text:'Was hier bewusst nicht steht'}),
  el('ul',{class:'evidence-list'},[
   'Keine Kursprognose und kein Kursziel.',
   'Keine Kauf- oder Verkaufsempfehlung.',
   'Kein Gesamtscore, solange nicht alle sieben Eigenschaften methodisch abgesichert sind.',
   'Keine historische Rendite ohne offengelegte Methodik und Datenqualität.',
   'Keine geschätzten Werte anstelle fehlender Daten.'
  ].map(text=>el('li',{text}))),
  el('p',{class:'muted',text:'Eine Position von 90 sagt: dieses Unternehmen liegt bei dieser Eigenschaft unter den stärksten zehn Prozent des Vergleichsuniversums. Sie sagt nichts darüber, wie sich der Kurs entwickeln wird.'})]));
 main.append(actions([{label:'Eine Aktie ansehen',href:href('quant','NVDA')},{label:'Unternehmen suchen',href:href('stocks')},{label:'Methodik im Detail',href:'/quant/methodology/'}]));
 /* WAS DER ENTWURF VERLANGT UND BISHER NIRGENDS STAND. */
 tief('Wie historische Vergleichsfälle funktionieren',card('Wie historische Vergleichsfälle funktionieren',
  'Die Frage lautet „wann galt diese Lage schon einmal und was geschah danach" — nie „was wird passieren".',
  [tiles(3,[
   tile('clock','Ebene 1 · Dieser Titel','Wochen der eigenen Geschichte, in denen dieselben Kursbedingungen galten. Wenige Fälle, aber dasselbe Unternehmen.'),
   tile('people','Ebene 2 · Gelockert','Dieselbe Historie, aber nur die Kurslage — die Geschäftslage der Vergangenheit fliesst nicht ein.'),
   tile('compass','Ebene 3 · Alle Titel','Dieselbe Bedingung über die ganze Grundgesamtheit. Viele Fälle, aber andere Unternehmen.')]),
   el('div',{class:'q-ladder'},[
    el('details',{},[el('summary',{text:'Warum ein Fall nicht eine Woche ist'}),
     el('div',{class:'q-ladder-body'},[el('p',{text:'Eine Bedingung, die zwölf Wochen am Stück gilt, ist ein Ereignis und nicht zwölf. Gezählt wird die erste Woche jeder zusammenhängenden Folge. Ohne diese Bündelung zeigte ein Titel 945 „Fälle" statt 28 — eine Zahl, die nur misst, wie lange ein Zustand anhielt.'})])]),
    el('details',{},[el('summary',{text:'Warum unter zehn Fällen nichts gerechnet wird'}),
     el('div',{class:'q-ladder-body'},[
      el('p',{text:'Ein Median aus überlappenden Zeitfenstern braucht eine Mindestmenge, sonst beschreibt er Zufall. Ab '+VUHistoricalCases.MIN_EPISODES+' abgeschlossenen Fällen wird gerechnet, darunter steht nur die Anzahl.'}),
      el('p',{text:'Gemessen über eine Stichprobe von 300 Titeln erreichen 33,7 % diese Schwelle im Zwölf-Monats-Fenster. Für die übrigen bleibt die Fläche bewusst leer statt gefüllt.'})])]),
    el('details',{},[el('summary',{text:'Was diese Zahlen nicht können'}),
     el('div',{class:'q-ladder-body'},VUHistoricalCases.LIMITS.map(t=>el('p',{text:t})))])])]));

 tief('Was „Asymmetrie" bedeutet',card('Was „Asymmetrie" bedeutet',
  'Ein Muster kann häufiger zu starken Gewinnern führen und gleichzeitig häufiger zu starken Verlierern. Asymmetrie setzt beides ins Verhältnis.',
  [el('p',{class:'muted',
    text:'Ein Wert über 1 heisst: die Aufwärtsseite war in der Vergangenheit stärker ausgeprägt als die Abwärtsseite. Ein Wert um 1 heisst: beide Seiten waren gleich ausgeprägt — ein solches Muster ist kein Argument, auch wenn seine Trefferquote hoch aussieht. Deshalb steht neben jeder Chance immer auch das Gegenstück.'})]));

 tief('Was bewusst zurückgehalten wird',card('Was bewusst zurückgehalten wird',
  'Zurückhalten ist hier eine Entscheidung mit Grund, kein Datenausfall. Was fehlt, wird gezählt statt verschwiegen.',
  [el('div',{class:'q-hitlist'},[
   el('div',{class:'q-hit'},[el('div',{class:'q-hit-id'},[el('strong',{text:'Gesamtnote'}),el('span',{text:'Ein einzelner Score über alle Faktoren'})]),el('p',{class:'q-hit-why',text:'Eine Zahl, die Qualität und Kursdynamik zu einem Wert verrechnet, verbirgt genau den Zielkonflikt, den ein Anleger sehen muss.'}),el('div',{class:'q-hit-num'},[])]),
   el('div',{class:'q-hit'},[el('div',{class:'q-hit-id'},[el('strong',{text:'Erwartungstrend'}),el('span',{text:'Revisionen von Analystenschätzungen'})]),el('p',{class:'q-hit-why',text:'Die Datengrundlage ist nicht freigegeben. Der Faktor bleibt sichtbar leer, statt durch einen Näherungswert ersetzt zu werden.'}),el('div',{class:'q-hit-num'},[])]),
   el('div',{class:'q-hit'},[el('div',{class:'q-hit-id'},[el('strong',{text:'Historischer Test'}),el('span',{text:'Backtest einer Strategie'})]),el('p',{class:'q-hit-why',text:'Nicht zertifiziert. Deshalb erscheint nirgends eine Erfolgs- oder Trefferquote je Ansatz — auch nicht als Näherung.'}),el('div',{class:'q-hit-num'},[])]),
   el('div',{class:'q-hit'},[el('div',{class:'q-hit-id'},[el('strong',{text:'Bewertung einzelner Titel'}),el('span',{text:'Wenn die Aktienzahl nicht zur Kurslinie passt'})]),el('p',{class:'q-hit-why',text:'Eine Kennzahl aus zwei nicht zueinander gehörenden Grössen wäre falsch und sähe richtig aus. Sie wird dann nicht gebildet.'}),el('div',{class:'q-hit-num'},[])])])]));

 tief('Warum Quant manchmal „nicht bewertbar" sagt',card('Warum Quant manchmal „nicht bewertbar" sagt',null,[
  el('p',{class:'q-card-intro',text:'Ein leeres Feld ist eine Aussage. Diese Gründe kommen vor:'}),
  tiles(3,[
   tile('warn','Keine Aktie','Ein börsengehandelter Fonds oder eine Sonderklasse bekommt kein Aktienurteil — die Kennzahlen bedeuten dort etwas anderes.'),
   tile('clock','Zu jung','Ein Titel ohne ausreichende Geschichte kann an Vergangenheitsgrössen nicht gemessen werden.'),
   tile('doc','Quelle fehlt','Der zugrunde liegende Wert ist nicht veröffentlicht oder nicht prüfbar.')])]));

 /* Die zehn Bloecke von oben, alle zu, jeder unter seiner Frage. Der
    Inhalt ist unveraendert - nur die Reihenfolge des Lesens ist es nicht
    mehr: wer nichts anklickt, hat die Vertrauensfrage trotzdem
    beantwortet bekommen. */
 main.append(card('Wenn du es genauer wissen willst',
  'Zehn Fragen. Klapp auf, was dich interessiert.',
  tiefeBloecke.map(([frage,knoten])=>mehr(frage,()=>[knoten]))));
}
async function fundamentalsPage(){
 main.append(heading('Wie entwickelt sich das Geschäft?','Geschäftszahlen über die Zeit verstehen – mit Berichtszeiträumen und nachvollziehbarer Herkunft.'));
 const company=el('select',{'aria-label':'Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name}))),metric=el('select',{'aria-label':'Fundamentale Kennzahl'},VUFundamentalsContract.metrics.map(m=>el('option',{value:m.id,text:m.label}))),period=el('select',{'aria-label':'Berichtsart'},[['annual','Geschäftsjahre'],['quarterly','Quartalsmeldungen'],['ttm','Letzte zwölf Monate (TTM)']].map(([value,text])=>el('option',{value,text}))),target=el('section',{'aria-live':'polite'});
 const ticker=params.has('ticker')?params.get('ticker'):'NVDA',metricId=params.has('metric')?params.get('metric'):'revenue',periodId=params.has('period')?params.get('period'):'annual';
 if(!/^[A-Z0-9.-]{1,12}$/.test(ticker)||!VUFundamentalsContract.metrics.some(m=>m.id===metricId)||!['annual','quarterly','ttm'].includes(periodId)){main.append(notice('Historienauswahl prüfen','Dieser Link enthält ein ungültiges Unternehmen, eine unbekannte Kennzahl oder Berichtsart. Es wird keine Ersatzhistorie geöffnet.'),link('Neue Historienauswahl öffnen',href('fundamentals'),'button secondary'));return;}
 if(!universe.stocks.some(s=>s.ticker===ticker))company.append(el('option',{value:ticker,text:ticker+' · Auswahl aus dem Produktuniversum'}));company.value=ticker;metric.value=metricId;period.value=periodId;
 const saved=link('Diese Historie erneut öffnen',href('fundamentals'),'button secondary');
 main.append(el('div',{class:'filter history-controls'},[company,metric,period]),saved,target);let request=0;
 async function update(){const current=++request;saved.href=href('fundamentals',company.value)+'&metric='+encodeURIComponent(metric.value)+'&period='+encodeURIComponent(period.value);S.mount(target,el('p',{class:'muted',text:'Historie wird aktualisiert …'}));const result=await api.getHistoricalFundamentals(company.value,{metric:metric.value,period:period.value});if(current!==request)return;S.clear(target);
  if(result.state!=='AVAILABLE'){target.append(notice(result.reason==='TTM_NOT_VALIDATED'?'TTM noch nicht verfügbar':result.reason==='PERIOD_SEMANTICS_NOT_VALIDATED'?'Quartalsabgrenzung noch nicht bestätigt':'Historie derzeit nicht verfügbar',result.reason==='TTM_NOT_VALIDATED'?'Für diese Ansicht liegt noch keine validierte Zwölfmonats-Reihe vor. Geschäftsjahre und Quartalsmeldungen bleiben zugänglich.':result.reason==='PERIOD_SEMANTICS_NOT_VALIDATED'?'Die vorhandenen abgeleiteten Werte lassen sich noch nicht sicher einem einzelnen Quartal zuordnen. Die Geschäftsjahres-Historie und der SEC-Dateninspektor bleiben verfügbar.':'Es fehlen belastbare Daten für diese Auswahl. Werte werden nicht ersetzt oder geschätzt.'));return;}
  const known=result.rows.filter(r=>r.state==='AVAILABLE'),latest=known.at(-1),perShare=result.metric.unit.endsWith('/shares'),scale=perShare?1:1e9,unit=perShare?result.metric.unit.replace('/shares',' je Aktie'):result.metric.unit==='shares'?'Mrd. Aktien':'Mrd. '+result.metric.unit;
  const value=r=>(r.value/scale).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
  target.append(el('div',{class:'history-header'},[el('div',{},[el('span',{class:'eyebrow',text:result.name}),el('h2',{text:result.metric.label}),el('div',{class:'quote',text:value(latest)+' '+unit}),el('p',{class:'muted',text:latest.label+' · '+(latest.start?latest.start+' bis ':'Stichtag ')+latest.end})]),el('p',{class:'muted',text:'Berichtsstand: '+result.generatedAt.slice(0,10)+'. Frühere Angaben können nachträglich angepasst sein.'})]));
  target.append(QuantCharts.barChart({title:result.metric.label+' nach Berichtsperiode',description:'Verfügbare gemeldete Werte. Exakte Zahlen und fehlende Perioden stehen in der Tabelle.',width:Math.min(1100,innerWidth-40),maxLabels:innerWidth<650?3:8,height:300,items:known.map(r=>({label:period.value==='annual'?String(r.fiscalYear):r.fiscalPeriod+' '+String(r.fiscalYear).slice(-2),value:r.value/scale})),yFormat:v=>v.toLocaleString('de-DE',{maximumFractionDigits:1})}),el('p',{class:'muted',text:'Skala: '+unit+' · '+known.length+' verfügbare Berichtsperioden. '+result.missing+' Perioden ohne darstellbaren Wert.'}));
  if(period.value==='quarterly')target.append(notice('Berichtszeitraum beachten',result.sourceContract==='vu-consumer-fundamentals-1.0.0'?'Gezeigt werden eigenständige Geschäftsquartale aus der bestehenden SEC-Aufbereitung. Kumulierte Meldungen wurden dort bereits abgegrenzt; abgeleitete Werte sind in der Tabelle gekennzeichnet. Dies ist eine rückblickende Ansicht, kein historischer PIT-Datensatz.':'Gezeigt werden direkt gemeldete Werte mit ihrem Quellenzeitraum. Dieser kann seit Geschäftsjahresbeginn kumuliert sein. Abgeleitete Quartalswerte bleiben ausgeblendet, solange ihre zeitliche Abgrenzung nicht bestätigt ist.'));
  const body=result.rows.slice().reverse().map(r=>el('tr',{},[el('th',{scope:'row',text:r.label+(r.derived?' · abgeleitet':'')}),el('td',{text:r.state==='AVAILABLE'?value(r)+' '+unit:r.state==='PIPELINE_ERROR'?'Datenprüfung erforderlich':r.reason==='PERIOD_SEMANTICS_NOT_VALIDATED'?'Quartalsabgrenzung offen':'Nicht verfügbar'}),el('td',{text:r.state==='AVAILABLE'?(r.start?r.start+' → ':'')+r.end:'—'}),el('td',{text:r.state==='AVAILABLE'?r.availableFrom.replace('T',' ').replace('.000Z',' UTC'):'—'})]));
  target.append(el('h2',{class:'section',text:'Die Zahlen im Detail'}),el('div',{class:'table-wrap',tabindex:'0','aria-label':'Historische Geschäftszahlen, horizontal scrollbar'},[el('table',{},[el('thead',{},[el('tr',{},['Berichtsperiode',result.metric.label,'Zeitraum / Stichtag',result.availabilityPrecision==='FILING_DATE'?'Meldedatum · Tagesgenauigkeit':'Bekannt seit · Originalzeitpunkt'].map(text=>el('th',{scope:'col',text})))]),el('tbody',{},body)])]),el('details',{},[el('summary',{text:'Quellen und Methodik'}),el('p',{text:'Diese rückblickende Ansicht ist kein damaliger Informationsstand für Backtests. Quelle: SEC EDGAR. Stand der Aufbereitung: '+result.generatedAt.slice(0,10)+'. Gemeldete und bereits im bestehenden SEC-Workstream abgeleitete Werte werden unverändert übernommen.'}),el('p',{text:'Letzter Wert, ungerundet: '+latest.value.toLocaleString('de-DE',{maximumFractionDigits:12})+' '+latest.unit+'. Meldung: '+latest.accession+'. '+(latest.source==='SEC_CONSUMER'?'Unveränderter Wert aus dem bestehenden SEC-Consumer-Artefakt; kein historischer PIT-Nachweis.':latest.source==='VISION_UNIVERSE_DERIVED'?'Abgeleitete Kennzahl nach vorhandener SEC-Methodik.':'Gemeldete SEC-Kennzahl.')})]),actions([{label:'Alle Quellen im Dateninspektor',href:'/quant/data-inspector/'},{label:'Zur Aktienanalyse',href:href('stock',company.value)}]));
 }
 company.onchange=metric.onchange=period.onchange=update;await update();
}
async function marketsPage(){
 const market=await api.getMarketIntelligence();
 main.append(heading('Den Markt einordnen','Kursstrukturen untersuchen. Den Kontext verstehen. Die Evidenz prüfen.'),notice('Markt-Regime derzeit nicht verfügbar','Das kanonische Produktuniversum ist capability-gesteuert verfügbar; ein erklärbares Markt-Regime bleibt bis zur geprüften Gewichtung, Hysterese und Confidence fail-closed.'));
 const rows=el('section',{class:'section'},[el('h2',{text:'Trendradar · verfügbarer Analysebereich'}),el('p',{class:'muted',text:'Ein Kurs über seinen Durchschnittslinien beschreibt seine bisherige Position. Er ist kein Kaufsignal.'})]);
 for(const {stock,trend} of market.observations.slice(0,5)){rows.append(el('article',{class:'market-observation'},[el('div',{},[link(stock.ticker,href('stock',stock.ticker),'stock-link'),el('p',{class:'muted',text:stock.name})]),el('div',{},[el('h3',{text:trend.label}),el('p',{class:'muted',text:'Kursstand: '+stock.asOf}),el('details',{},[el('summary',{text:'Warum?'}),el('p',{text:trend.explanation||'Für die Einordnung fehlen belastbare Kennzahlen.'}),...(trend.evidence||[]).map(e=>el('p',{text:e.label+': '+n(e.metric)})),link('Vollständige Analyse öffnen','/quant/technical/?symbol='+stock.ticker)])]),el('div',{class:'number'},[el('span',{class:'muted',text:'6 Monate'}),el('strong',{text:n(stock.momentum6m)})])]));}
 if(!market.observations.length)rows.append(notice('Titel derzeit nicht verfügbar','Die zugrunde liegenden Daten konnten nicht geladen werden.'));
 main.append(rows,el('section',{class:'section'},[el('h2',{text:'Das größere Bild'}),actions([{label:'Macro Intelligence',href:'/macro/'},{label:'ETF Research & Vergleich',href:'/etf/'},{label:'Aktuelle Nachrichten',href:'/news/'}])]));
}
async function discoverPage(){
 main.append(heading('Eine Idee ist der Anfang','Entdecke Unternehmen anhand sichtbarer Kriterien. Öffne jede Auswahl im Screener und entwickle sie weiter.'));
 const data=await api.getDiscover();
 main.append(el('p',{class:'scope-note',text:'Capability-gesteuerte Auswahl aus dem kanonischen Produktuniversum. Diese Ergebnisse sind keine Rangliste des Gesamtmarkts.'}));
 for(const collection of data.collections){
  const result=collection.result;
  const title=el('div',{},[el('span',{class:'eyebrow',text:'Entdecken · '+(result.state==='AVAILABLE'?result.stocks.length+' Treffer':'Daten fehlen')}),el('h2',{text:collection.title}),el('p',{class:'muted',text:collection.explanation}),el('p',{class:'recipe-rule',text:collection.rule}),link('Regeln im Screener bearbeiten',href('screener')+'&recipe='+encodeURIComponent(collection.id),'button secondary')]);
  const evidence=result.state==='AVAILABLE'?(result.stocks.length?stockRows(result.stocks,collection.field==='priceTo200dma'?'above200':collection.field,collection.field==='revenueGrowth'?'Umsatzwachstum':collection.field==='priceTo200dma'?'Abstand 200T':'6 Monate'):notice('Aktuell keine Treffer','Das Kriterium trifft auf kein Unternehmen im verfügbaren Analysebereich zu. Du kannst es im Screener verändern.')):notice('Auswahl derzeit nicht verfügbar','Die zugrunde liegenden Daten konnten nicht geladen werden.');
  main.append(el('section',{class:'collection'},[title,el('div',{},[evidence])]));
 }
}
/* Eine Regel aus der Lagen-Zuordnung wird hier als ERGEBNIS gezeigt und
   nicht als bearbeitbare Abfrage geoeffnet. Das ist kein fehlendes
   Feature: das Praedikat einer Regel trifft mehr Titel, als die Regel
   zuordnet, weil die Kaskade vorrangige Regeln zuerst bedient. Wer die
   Regel im Editor laufen laesst, bekaeme die Treffermenge statt der Lage
   - beim Zustand Beobachten rund 1.400 statt 620 Titeln. Deshalb kommt
   die Liste aus der veroeffentlichten Zuordnung und traegt den
   Praedikat-Fingerabdruck der Regel, die sie erzeugt hat. */
async function setupRuleResult(ruleId){
 const index=await api.getSetupScreenIndex().catch(()=>null);
 const section=el('section',{class:'section setup-rule-result'},[...sectionHead('Lage im Markt','setupScreen')]);
 if(!index||index.state!=='AVAILABLE'){section.append(notice(LU('setupScreen'),LB('setupScreen')));return section;}
 let found=null,owner=null;
 for(const entry of index.states)for(const rule of entry.rules)if(rule.ruleId===ruleId){found=rule;owner=entry;}
 if(!found){section.append(notice('Diese Regel gibt es in der veröffentlichten Zuordnung nicht',
  'Es wurde keine Ersatzregel ausgeführt. Die Lagen im Markt sind über den Radar erreichbar.'));return section;}
 section.append(el('p',{class:'scope-note'},[el('span',{class:'setup-badge state-'+owner.state,text:L(owner.state)}),
  el('span',{text:' '+found.plain})]));
 if(owner.availability.state!=='AVAILABLE'||!Array.isArray(found.tickers)){
  section.append(notice(LU('setupScreen'),owner.availability.reason?LB(owner.availability.reason):LB('setupScreen')));
  return section;
 }
 section.append(el('p',{text:found.tickers.length?found.tickers.length.toLocaleString('de-DE')+' Titel stehen am '+index.asOf+' in dieser Lage.':LN('setupScreen')}));
 if(found.tickers.length)section.append(el('p',{class:'peer-tickers'},found.tickers.map(ticker=>link(ticker,href('quant',ticker),'peer-chip'))));
 section.append(el('details',{},[el('summary',{text:'Methodik'}),
  el('p',{class:'muted',text:'Regel '+found.ruleId+' · '+found.predicateHash+' · Zuordnung '+index.mappingVersion+'. Die Liste ist die Zuordnung der Kaskade und nicht die Treffermenge des Prädikats allein: ein Titel, auf den auch eine vorrangige Regel zutrifft, steht dort und nicht hier. Deshalb ist diese Regel unten nicht als bearbeitbare Abfrage geladen.'})]));
 return section;
}
/* =========================================================================
   SCREENER · EINFACHER EINSTIEG

   Der Nutzer startet bei einer Frage, nicht bei einem Feldnamen. Deshalb
   sind die Marken hier Eigenschaften ("Qualität", "Momentum"), und was
   sie technisch bedeuten, steht darunter als Satz, nicht als Formel.

   EINE METHODIK JE ABFRAGE: der Screener-Workspace erzwingt das, und es
   ist richtig so - eine Regel aus Quant V1 meint in V2 etwas anderes. Der
   einfache Einstieg arbeitet deshalb ausschliesslich auf der
   Faktor-Evidenz von Quant V2, dem Kanon des Produkts.

   WAS HIER BEWUSST FEHLT: Grösse (Large/Small Cap) und Region. Der
   Screener kennt dafür kein Feld. Eine Marke, die nichts filtert, wäre
   eine Lüge in Gestalt eines Knopfes - deshalb steht stattdessen ein Satz
   darüber, dass es sie noch nicht gibt.
   ========================================================================= */
const EINFACHE_KRITERIEN=[
 ['quality','Qualität','Stabile Geschäftsmodelle und hohe Kapitalrenditen.'],
 ['growth','Wachstum','Steigende Umsätze und Gewinne mit Substanz.'],
 ['momentum','Momentum','Positive Kursdynamik und relative Stärke.'],
 ['value','Bewertung','Attraktiver Preis im Branchen- und Historienvergleich.'],
 ['profitability','Profitabilität','Verdient verlässlich Geld aus dem laufenden Geschäft.'],
 ['risk','Risiko','Solide Bilanz und geringere Schwankungen.']
];
const EINFACH_SCHWELLE=70;
/* =========================================================================
   DAS KLARTEXT-URTEIL AUS EINER SCREENING-ZEILE

   Die Screener-Antwort traegt in `evidence` die ganze Evidenzzeile: alle
   sieben Faktoren plus die Zahl der bewerteten. Damit ist dasselbe Urteil
   berechenbar, das auf der Aktienseite steht - ohne neues Artefakt und
   ohne zweite Anfrage.

   WARUM DAS IN DER TREFFERLISTE ZAEHLT: wer auf "Qualitaet" filtert, sieht
   sonst nur, dass dieser Titel in Qualitaet stark ist. Dass er in allem
   anderen schwach ist, steht erst auf der naechsten Seite. Das Urteil hier
   ist die Warnung, die variiert - anders als der Hinweis, den es vorher
   gab (siehe unten).
   ========================================================================= */
/* =========================================================================
   WELCHER FAKTOR TRAEGT FUER KEINEN EINZIGEN TITEL EINEN WERT?

   Gemessen am Stand vom 28.09.2026 ueber 6.297 Titel:

     Kursstaerke        88,4 %      Bewertung           40,0 %
     Risiko             88,4 %      Profitabilitaet     31,1 %
     Unternehmensqual.  57,5 %      ERWARTUNGSTREND      0,0 %
     Wachstum           50,9 %

   `revisions` steht im Artefakt, zaehlt im Nenner von sieben mit und ist
   nie gefuellt. Kein Titel erreicht deshalb 7 von 7; das Maximum ist 6,
   und das haben 20,4 %.

   Der Satz darueber gehoert EINMAL auf die Seite. Er wird hier gezaehlt
   und nicht hineingeschrieben: sobald der Faktor Werte traegt,
   verschwindet er von selbst. Eine harte Zahl waere im Moment richtig und
   in drei Wochen eine Behauptung.
   ========================================================================= */
async function luekenSatz(){
 const s=await api.getFactorEvidenceScreening().catch(()=>null);
 if(!s||s.state!=='AVAILABLE'||!Array.isArray(s.rows)||!s.rows.length)return null;
 const leer=[];
 for(const id of VUFactorEvidence.FACTOR_ORDER){
  const key='quantV2.factorEvidence.'+id;
  if(!s.rows.some(r=>Number.isFinite(r[key])))
   leer.push((VUFactorEvidence.FACTOR_MEANING[id]||{}).label||id);
 }
 if(!leer.length)return null;
 const rest=VUFactorEvidence.FACTOR_ORDER.length-leer.length;
 return el('p',{class:'muted',style:'font-size:13px;margin:8px 0 0',
  text:(leer.length===1?'Ein Faktor trägt derzeit für keinen Titel einen Wert':
        leer.length+' Faktoren tragen derzeit für keinen Titel einen Wert')+
       ': '+leer.join(', ')+'. Geprüft wird deshalb auf höchstens '+rest+
       ' der sieben Eigenschaften — für jeden Titel gleich, kein Mangel des einzelnen.'});
}
function urteilAusEvidenz(ev){
 if(!ev||typeof VUPlainVerdict==='undefined'||typeof VUFactorEvidence==='undefined')return null;
 const factors={};
 for(const id of VUFactorEvidence.FACTOR_ORDER){
  const v=ev['quantV2.factorEvidence.'+id];
  factors[id]=Number.isFinite(v)
   ?{state:'AVAILABLE',score:v}
   :{state:'UNAVAILABLE',reason:'INPUT_NOT_MATERIALIZED',score:null};
 }
 try{return VUPlainVerdict.urteil({factors});}catch{return null;}
}
async function einfacherScreener(){
 const editor=VUScreenerWorkspace;
 const methodik=editor.methodology('quantV2Evidence')||editor.methodologies[0];
 const feld=(id)=>'quantV2.factorEvidence.'+id;
 /* Vorauswahl aus dem Link, damit "Momentum Leader" von der Startseite
    hier ankommt statt auf einer leeren Maske. */
 const gewaehlt=new Set((params.get('faktoren')||'').split(',').map(s=>s.trim()).filter(Boolean)
  .filter(id=>EINFACHE_KRITERIEN.some(([k])=>k===id)));
 if(!gewaehlt.size)gewaehlt.add('quality');

 const chips=el('div',{class:'q-chips'});
 const satz=el('p',{class:'q-sentence','aria-live':'polite'});
 const treffer=el('div',{'aria-live':'polite'});
 const knopf=el('button',{class:'button',text:'Treffer anzeigen'});

 function satzText(){
  /* Deutsche Substantive bleiben gross, und ein Adjektiv vor einer Aufzählung
     müsste sich beugen ("überdurchschnittlicher Qualität, Wachstum und
     Momentum" ist falsch). Deshalb steht die Eigenschaft hinter dem Doppel-
     punkt statt vor dem Substantiv. */
  const namen=EINFACHE_KRITERIEN.filter(([id])=>gewaehlt.has(id)).map(([,label])=>label);
  if(!namen.length)return 'Wähle mindestens eine Eigenschaft aus.';
  const liste=namen.length===1?namen[0]:namen.slice(0,-1).join(', ')+' und '+namen.at(-1);
  return namen.length===1
   ?'Du suchst Aktien, die in '+liste+' überdurchschnittlich sind.'
   :'Du suchst Aktien, die in allen diesen Eigenschaften überdurchschnittlich sind: '+liste+'.';
 }
 let lauf=0;
 async function suchen(){
  const meine=++lauf;
  satz.textContent=satzText();
  if(!gewaehlt.size){S.mount(treffer,el('p',{class:'muted',text:'Ohne Eigenschaft gibt es nichts zu filtern.'}));return;}
  S.mount(treffer,el('p',{class:'muted',text:'Wird gesucht …'}));
  const filter=[...gewaehlt].map(id=>({field:feld(id),operator:'gte',value:EINFACH_SCHWELLE,scale:'raw'}));
  const sortierFeld=feld([...gewaehlt][0]);
  let ergebnis;
  try{ergebnis=await api.screen(editor.build(filter,[{field:sortierFeld,direction:'desc'}]));}
  catch{ergebnis={state:'UNAVAILABLE'};}
  if(meine!==lauf)return;
  if(!ergebnis||ergebnis.state!=='AVAILABLE'){
   S.mount(treffer,notice('Treffer derzeit nicht verfügbar','Die Auswertung konnte nicht geladen werden. Deine Auswahl bleibt bestehen.'));return;}
  const liste=el('div',{class:'q-hitlist'});
  for(const s of (ergebnis.stocks||[]).slice(0,25)){
   const werte=EINFACHE_KRITERIEN.filter(([id])=>gewaehlt.has(id))
    .map(([id,label])=>[label,s.evidence&&s.evidence[feld(id)]])
    .filter(([,v])=>Number.isFinite(v));
   /* WARUM IST DIESE AKTIE HIER? Die Antwort ist die erfüllte Bedingung
      mit ihrem gemessenen Wert - nicht ein Etikett. */
   /* ZAHLEN IN WORTE. Gemessen trug diese Liste 26,1 Zahlen je 100
      Woerter - "Qualitaet 83 · Wachstum 79 von 100", fuenfundzwanzigmal
      untereinander. Eine Zahlenwand liest sich als "das ist nichts fuer
      mich", und genau die Leute sollen hier ankommen.

      Dieselbe Messung, dasselbe Band, nur als Wort: die Baender der
      Methodik tragen ihre Beschriftung bereits ("Sehr stark", "Stark",
      "Durchschnittlich", ...). Der Zahlenwert bleibt in der Spalte
      rechts - wer ihn will, findet ihn, aber er traegt die Zeile nicht
      mehr. */
   /* DAS WORT TRAEGT DIE BEDEUTUNG, DIE ZAHL DEN BELEG.

      Erst hatte ich hier nur das Band stehen ("Qualitaet: stark"), um
      die Zahlendichte zu senken. Die Browser-QA hat das zu Recht
      abgelehnt: sie verlangt in jeder Trefferzeile einen GEMESSENEN
      Wert, und "stark" allein ist ein Etikett, das niemand nachpruefen
      kann - genau die Art unbelegter Behauptung, die dieses Produkt
      sonst ueberall vermeidet.
      Also beides: das Wort fuer den Einsteiger, der Wert fuer den, der
      es genau wissen will. Die Zahl steht in Klammern und traegt die
      Zeile nicht mehr - das war der eigentliche Zweck der Aenderung. */
   const warum=werte.length
    ?werte.map(([label,v])=>{const b=VUFactorEvidence.band(v);
      return label+': '+(b?b.label.toLowerCase():'ohne Einordnung')+' ('+Math.round(v)+')';}).join(' · ')
    :'Für diesen Titel lässt sich das nicht prüfen.';
   /* ZWEI BEFUNDE AN DERSELBEN ZEILE, GEMESSEN AM GEBAUTEN RELEASE.

      1. DIE ZAHL STAND ZWEIMAL DA. Die Zeile las sich
         "Qualitaet: stark (90) | 90 | nur 6 von 7 pruefbar". Die rechte
         Spalte trug 75 der 112 Zahlen dieser Seite - und ihre erste war
         eine woertliche Doppelung der Zahl aus derselben Zeile.

      2. "NUR X VON 7 PRUEFBAR" STAND AUF 25 VON 25 ZEILEN. Der Grund:
         KEIN EINZIGER TITEL im Universum erreicht 7 von 7. Gemessen ueber
         6.297 Titel traegt `revisions` bei 0,0 % einen Wert - das Feld
         steht im Artefakt, zaehlt im Nenner mit und ist nie gefuellt.
         Das Maximum ist 6, und das haben 20,4 %.
         Der Satz war damit wahr und trotzdem irrefuehrend: er las sich
         als Maengel DIESES Titels, waehrend die Luecke systemisch ist.
         Eine Warnung, die immer an ist, warnt nicht mehr.

      WAS JETZT DASTEHT: das Klartext-Urteil ueber alle bewerteten
      Faktoren. Es variiert - und es ist genau die Auskunft, die einem
      Einsteiger fehlt, wenn er auf eine Eigenschaft filtert: stark in
      Qualitaet, aber wie sieht das Gesamtbild aus? Der Nenner dieses
      Urteils sind die GEPRUEFTEN Punkte ("Stark in 3 von 5 geprueften
      Punkten"), er beschreibt sich also selbst und braucht keine 7.
      Die systemische Luecke steht EINMAL auf der Seite statt
      fuenfundzwanzigmal.

      Der gemessene Wert bleibt in `warum` - die QA verlangt ihn dort zu
      Recht, und ein Band allein waere ein Etikett ohne Beleg. */
   const urteil=urteilAusEvidenz(s.evidence);
   const hatUrteil=urteil&&urteil.stufeId!=='KEINE_DATEN';
   liste.append(hitRow(s.ticker,s.name,warum,
    hatUrteil?urteil.stufe:'',null,hatUrteil?urteil.ton:null));
  }
  /* DIE ZEILE UEBER DER LISTE STAND GENAU DA, WO DER ERSTE TREFFER STUENDE.

     Sie nannte vier Dinge auf einmal: Trefferzahl, Groesse des geprueften
     Universums, Methodik ("Quant V2 · Factor Evidence" - im Sprachvertrag
     erlaubt, am Kuechentisch trotzdem englischer Fachbegriff) und den
     Sortierschluessel, den die Marken darueber ohnehin zeigen.

     Was oben bleibt, sind die zwei Dinge, die ein Einsteiger hier
     wirklich braucht:

       - WIE VIELE ER SIEHT, und zwar ehrlich: "25 von 50" statt "50
         Treffer" ueber einer Liste mit 25 Zeilen. Damit erklaert sich der
         Unterschied von selbst und braucht keinen Absatz mehr.
       - DASS DAS KEINE RANGLISTE DES MARKTES IST. Das ist die
         gefaehrliche Fehllesart - "die 50 besten Aktien" - und sie gehoert
         nicht hinter eine Klappe.

     Alles andere liegt eine Ebene tiefer, bei der Frage, die man dazu
     wirklich stellt. */
  const anzahl=(ergebnis.stocks||[]).length,gezeigt=Math.min(anzahl,25);
  const sortName=EINFACHE_KRITERIEN.find(([id])=>feld(id)===sortierFeld)[1];
  const kopf=el('p',{class:'muted',style:'font-size:14px;margin:0 0 6px',
   text:(anzahl>gezeigt?gezeigt+' von '+anzahl+' Treffern':anzahl+' Treffer')+
        ' · keine Rangliste des Marktes'});
  S.mount(treffer,el('div',{},[kopf,liste,
   mehr('Woher kommen diese Treffer?',()=>[
    el('p',{class:'muted',style:'font-size:13px;margin:0',
     text:'Geprüft wurden '+ergebnis.eligible+' auswertbare Unternehmen, sortiert nach '+
          sortName+'. Methodik: '+methodik.label+'.'}),
    anzahl>gezeigt?el('p',{class:'muted',style:'font-size:13px;margin:8px 0 0',
     text:'Der Screener gibt höchstens 50 Zeilen zurück. Das ist die Spitze deiner Auswahl, keine vollständige Rangliste — im Profi-Modus lässt sie sich verfeinern.'}):null])]));
 }
 for(const [id,label,erklaerung] of EINFACHE_KRITERIEN){
  const chip=el('button',{class:'q-chip',type:'button',text:label,title:erklaerung,
   'aria-pressed':gewaehlt.has(id)?'true':'false'});
  chip.onclick=()=>{
   if(gewaehlt.has(id))gewaehlt.delete(id);else gewaehlt.add(id);
   chip.setAttribute('aria-pressed',gewaehlt.has(id)?'true':'false');
   suchen();
  };
  chips.append(chip);
 }
 knopf.onclick=suchen;

 /* DER ERSTE TREFFER GEHOERT IN DEN ERSTEN BILDSCHIRM.

    Gemessen bei 390 x 844: der Hero war 256 px hoch, und die erste
    Trefferzeile begann bei 909 px - 65 px unter der Falte. Wer hierher
    kommt, sieht also drei Saetze ueber Aktien und keine Aktie.

    Zwei Gruende, beide sichtbar im Screenshot:

    1. "Chancen finden." stand ZWEIMAL da - einmal als Anspruch in der
       Kopfzeile (CLAIM.screener), 200 px darunter nochmal als
       Ueberschrift. Dieselben drei Woerter, zweimal.
    2. Der dritte Satz erklaerte, dass jeder Treffer zeigt, warum er dabei
       ist. Genau das steht seit diesem Umbau in jeder Zeile. Eine
       Erklaerung fuer etwas, das die Oberflaeche vorfuehrt, kostet nur
       Platz - und zwar den Platz, an dem das Vorgefuehrte stuende.

    Die Kurzfassung sagt nur noch das Neue: "Waehle Eigenschaften" stuende
    eine Karte tiefer schon als "Wonach suchst du?" ueber den Marken. */
 main.append(stage('Aktien finden','Jeder Treffer zeigt, warum er dabei ist.'));
 /* WAS IM ERSTEN BILDSCHIRM STEHT, ENTSCHEIDET, OB JEMAND BLEIBT.

    Gemessen: die beiden Methodik-Absaetze standen offen ueber der
    Trefferliste und trugen die erste Bildschirmhoehe von 82 auf 113
    Woerter - 63 Woerter Methodik, bevor ein Einsteiger den ersten Treffer
    sieht. Beide gehoeren zur Sache und bleiben vollstaendig; sie stehen
    jetzt eine Ebene tiefer, hinter einer Frage, die man wirklich stellt.

    Oben bleibt, was zum Handeln gehoert: die Marken und der Satz, der die
    eigene Auswahl vorliest. */
 const luecke=await luekenSatz();
 main.append(card('Wonach suchst du?',null,[
  chips,
  satz,
  mehr('Wie wird gefiltert?',()=>[
   el('p',{class:'muted',style:'font-size:13px;margin:0',
    text:'Eine Eigenschaft gilt ab '+EINFACH_SCHWELLE+' von 100 Punkten in der Faktor-Evidenz von Quant V2. Größe und Region sind noch keine Kriterien — dafür führt der Screener kein Feld.'}),
   /* DIE SYSTEMISCHE LUECKE STEHT EINMAL, NICHT AUF JEDER TREFFERZEILE.
      Zur Laufzeit aus dem Artefakt gezaehlt, nicht hier hineingeschrieben:
      traegt ein Faktor eines Tages Werte, verschwindet der Satz von selbst.
      Vorher stand stattdessen "nur 6 von 7 pruefbar" unter jedem Treffer -
      wahr, aber irrefuehrend, weil kein Titel 7 erreicht. */
   luecke])]));
 main.append(card('Treffer',null,[treffer]));
 await suchen();
}

async function screenPage(){
 await einfacherScreener();
 const profiZiel=el('div',{});
 /* SELBSTGEFUNDEN BEIM PRUEFEN DES EIGENEN UMBAUS: dieser Aufruf ist mit
    dem Profi-Editor in die zugeklappte Flaeche gewandert. Von der Startseite
    kommt man mit `setupRule` hierher, um genau dieses Ergebnis zu sehen - und
    landete vor einem geschlossenen Aufklapper. Der Grund war eine mechanische
    Ersetzung (main.append -> profiZiel.append), die diese eine Zeile
    mitgenommen hat, obwohl sie nichts mit dem Editor zu tun hat. */
 if(params.has('setupRule'))main.append(card('Titel dieser Setup-Regel',null,
  [await setupRuleResult(params.get('setupRule'))]));
 const editor=VUScreenerWorkspace,recipe=api.getRecipes().find(r=>r.id===params.get('recipe'));
 let initial=recipe?.query||editor.build([{field:'momentum6m',operator:'gte',value:0,scale:'raw'}]),invalidLink=false;
 try{if(params.has('recipe')&&!recipe)throw Error('unknown recipe');if(params.has('query'))initial=editor.decode(params.get('query'));else if(params.has('field')||params.has('threshold'))initial=editor.build([{field:params.get('field')||'momentum6m',operator:'gte',value:Number(params.get('threshold')||0),scale:'raw'}]);}catch{invalidLink=true;profiZiel.append(notice('Gespeicherte Regeln konnten nicht geöffnet werden','Die Abfrage enthält ungültige oder in diesem Editor nicht unterstützte Kriterien. Es wurden keine Ersatzregeln ausgeführt. Erstelle hier eine neue Auswahl oder öffne den vollständigen Screener.'));}
 if(recipe)profiZiel.append(el('p',{class:'scope-note',text:'Aus Discover: '+recipe.title+'. Alle Kriterien bleiben veränderbar.'}));
 const ruleList=el('div',{class:'rule-list'}),out=el('section',{'aria-live':'polite'}),method=el('pre',{class:'query-code'}),share=link('Diese Auswahl erneut öffnen','#','button secondary'),strategyLink=link('Als Strategie weiterentwickeln','#','button secondary'),sort=el('select',{'aria-label':'Sortieren nach'}),direction=el('select',{'aria-label':'Sortierreihenfolge'},[['desc','Absteigend'],['asc','Aufsteigend']].map(([value,text])=>el('option',{value,text})));let rows=[],request=0;strategyLink.hidden=true;
 /* Eine Abfrage gehoert genau einer Methodik. Der Wechsel setzt die Regeln
    ausdruecklich zurueck, statt sie stillschweigend mitzunehmen - eine Regel
    aus der anderen Methodik meint dort etwas anderes. */
 let current=editor.methodologyOf(initial)||editor.methodologies[0];
 const methodSelect=el('select',{'aria-label':'Methodik'},editor.methodologies.map(m=>el('option',{value:m.id,text:m.label})));
 methodSelect.value=current.id;
 const methodNote=el('p',{class:'muted screener-method-note'});
 function fieldsOfCurrent(){return current.fields;}
 function fillSort(){S.clear(sort);fieldsOfCurrent().filter(f=>f.type==='number').forEach(f=>sort.append(el('option',{value:f.id,text:f.label})));}
 function describeMethod(){methodNote.textContent=current.label+' · '+current.methodologyVersion+'. '+current.note+(current.id==='legacy'?'':' Quant V1 bleibt unverändert und wird in dieser Auswahl nicht gelesen.');}
 fillSort();describeMethod();
 sort.value=initial.sort[0].field;direction.value=initial.sort[0].direction;
 function addRule(filter){
  filter=filter||{field:current.defaultField,operator:'gte',value:0,scale:'raw'};
  if(rows.length>=editor.maxFilters)return;
  const field=el('select',{'aria-label':'Kennzahl'},fieldsOfCurrent().map(f=>el('option',{value:f.id,text:f.label}))),op=el('select',{'aria-label':'Vergleich'}),unit=el('span',{class:'muted'}),row=el('div',{class:'rule'});let value=el('input',{type:'number',step:'any','aria-label':'Vergleichswert'});
  field.value=filter.field;const item={row,field,op,get value(){return value;}};rows.push(item);
  function configure(raw,preferred){const def=fieldsOfCurrent().find(f=>f.id===field.value)||fieldsOfCurrent()[0],next=def.type==='number'?el('input',{type:'number',step:'any',value:String(raw??0),'aria-label':'Vergleichswert'}):el('select',{'aria-label':'Vergleichswert'},def.values.map(v=>el('option',{value:v,text:v.replaceAll('_',' ')})));if(def.type!=='number')next.value=def.values.includes(raw)?raw:def.values[0];value.replaceWith(next);value=next;op.replaceChildren(...editor.operators.filter(o=>def.operatorIds.includes(o.id)).map(o=>el('option',{value:o.id,text:o.label})));op.value=def.operatorIds.includes(preferred)?preferred:def.operatorIds[0];unit.textContent=def.unit==='usd'?'USD':def.unit==='pct'||def.unit==='percent'?'%':def.unit==='score'?'Punkte':def.unit==='method_fit'?'Methodenstatus':'';}
  field.onchange=()=>configure(undefined,op.value);configure(filter.value,filter.operator);
  row.append(field,op,value,unit,el('button',{text:'Entfernen',class:'remove-rule','aria-label':'Kriterium entfernen',onclick:()=>{rows=rows.filter(r=>r!==item);row.remove();}}));ruleList.append(row);
 }
 initial.filters.forEach(addRule);
 /* EIN NAME, DER DIE METHODIK VERSCHLUCKT HAT.
    Gemessen am 26.09.2026 am gebauten Release: der Screener liefert 50
    Treffer aus 6.875 Titeln, richtig sortiert (VIVKD 145,5 % · CATG 51,7 % ·
    QHUOY 49,6 % · MSFT 41,6 %) - und zeigte in JEDER Zeile "– / 7" und
    "Nicht verfuegbar". Der Satz darueber lautete "50 Treffer in 6875
    verfuegbaren Unternehmen · undefined · kein Gesamtmarkt-Ranking".
    Das "undefined" war die Spur: `const current=++request` verdeckte in
    diesem Abschluss die aeussere Methodik `current`. Damit war
    `current.label` undefined und `current.id==='legacy'` immer falsch - die
    Oberflaeche zeichnete also die Faktor-Tabelle der V2-Methodik ueber
    Zeilen der V1-Abfrage, und dort gibt es kein `evidence`-Feld. Die Daten
    waren die ganze Zeit da; nur las sie niemand.
    Deshalb heisst der Zaehler jetzt, was er ist. */
 const apply=async()=>{const anfrage=++request;try{
  const filters=rows.map(r=>{const def=fieldsOfCurrent().find(f=>f.id===r.field.value),raw=r.value.value;if(!String(raw).trim())throw Error('invalid');const value=def.type==='number'?Number(raw):raw;if(def.type==='number'&&!Number.isFinite(value))throw Error('invalid');return {field:r.field.value,operator:r.op.value,value,scale:'raw'};});
  const query=editor.build(filters,[{field:sort.value,direction:direction.value}]);const result=await api.screen(query);if(anfrage!==request)return;S.clear(out);
  share.hidden=false;strategyLink.hidden=false;strategyLink.href=href('strategies')+'&query='+encodeURIComponent(editor.encode(query));method.textContent=JSON.stringify(query,null,2);share.href=href('screener')+'&query='+encodeURIComponent(editor.encode(query));
  if(result.state!=='AVAILABLE'){out.append(notice('Ergebnisse derzeit nicht verfügbar','Die Daten konnten nicht geladen werden. Deine Kriterien bleiben erhalten.'));return;}
  const selected=fieldsOfCurrent().find(f=>f.id===sort.value);
  out.append(el('p',{class:'muted',text:result.stocks.length+' Treffer in '+result.eligible+' verfügbaren Unternehmen · '+current.label+' · kein Gesamtmarkt-Ranking'}),
   current.id==='legacy'
    ?stockRows(result.stocks,selected.productKey,selected.label)
    :el('div',{},[el('div',{class:'row eyebrow'},[el('span',{text:'Unternehmen'}),el('span',{class:'number',text:'Bewertete Faktoren'}),el('span',{class:'number',text:selected.label})]),
      ...result.stocks.map(stock=>el('a',{class:'row',href:href('quant',stock.ticker)},[
       el('div',{},[el('strong',{text:stock.ticker}),el('span',{class:'muted',text:stock.name||''})]),
       el('div',{class:'number',text:String(stock.evidence?.['quantV2.factorEvidence.availableFactors']??'–')+' / 7'}),
       el('div',{class:'number',text:Number.isFinite(stock.evidence?.[selected.id])?pct(stock.evidence[selected.id]):'Nicht verfügbar'})]))]));
 }catch{if(anfrage===request){share.hidden=true;strategyLink.hidden=true;method.textContent='';S.mount(out,notice('Kriterium prüfen','Gib für jedes Kriterium einen gültigen Wert ein. Die Regeln wurden nicht angewendet.'));}}};
 methodSelect.onchange=()=>{const next=editor.methodology(methodSelect.value);if(!next||next.id===current.id)return;current=next;rows=[];S.clear(ruleList);fillSort();describeMethod();addRule();sort.value=current.defaultField;S.mount(out,notice('Methodik gewechselt','Die Regeln wurden zurückgesetzt. Eine Regel der anderen Methodik bedeutet hier etwas anderes und wird nicht übernommen.'));share.hidden=true;strategyLink.hidden=true;method.textContent='';profiles.value='';};
 /* Ein Strategie-Profil lädt seine eigene Regel in den Editor - dieselbe,
    die auf der Aktienseite die Übereinstimmung erklärt. */
 const profiles=el('select',{'aria-label':'Strategie-Profil'},[el('option',{value:'',text:'Kein Profil'})]);
 const profileSource=await api.getStrategyProfiles().catch(()=>null);
 if(profileSource?.state==='AVAILABLE'){
  profileSource.contract.profiles.forEach(p=>profiles.append(el('option',{value:p.profileId,text:p.label})));
  profiles.onchange=()=>{const definition=profileSource.contract.profiles.find(p=>p.profileId===profiles.value);if(!definition)return;
   let query;try{query=VUStrategyMatch.screenQuery(definition);}catch{S.mount(out,notice('Profil nicht ladbar','Die Regel dieses Profils konnte nicht in Kriterien übersetzt werden.'));return;}
   const next=editor.methodologyOf(query);if(next&&next.id!==current.id){current=next;methodSelect.value=next.id;fillSort();describeMethod();}
   rows=[];S.clear(ruleList);query.filters.forEach(addRule);sort.value=query.sort[0].field;direction.value=query.sort[0].direction;apply();};
 }else profiles.disabled=true;
 profiZiel.append(el('div',{class:'filter screener-method'},[el('label',{},[el('span',{text:'Methodik'}),methodSelect]),el('label',{},[el('span',{text:'Strategie-Profil'}),profiles]),methodNote]),ruleList,el('div',{class:'actions'},[el('button',{class:'button secondary',text:'Kriterium hinzufügen',onclick:()=>addRule()}),el('button',{class:'button',text:'Anwenden',onclick:apply})]),el('div',{class:'filter'},[el('span',{text:'Ergebnisse sortieren'}),sort,direction]),out,el('details',{},[el('summary',{text:'Regeln speichern & Methodik'}),el('p',{text:'Der Link enthält ausschließlich die Regeln. Ergebnisse werden beim Öffnen mit dem dann verfügbaren Datenstand neu berechnet. Keine historische Simulation.'}),share,strategyLink,el('p',{class:'muted',text:'Die bestehende Query Engine prüft dieselben Kriterien wie im professionellen Screener. Die Vorschau bleibt auf den bestehenden Analysebereich begrenzt.'}),method]),actions([{label:'Quant Screener (klassisch) öffnen',href:'/quant/screener/'}]));
 /* WER MIT REGELN IM LINK ANKOMMT, HAT DEN EINFACHEN EINSTIEG SCHON HINTER
    SICH. Aus Discover, aus einer gespeicherten Auswahl oder aus einer
    Strategie führt der Weg direkt in diese Kriterien - und eine
    zugeklappte Fläche wäre dort eine Sackgasse. Dasselbe Versehen hatte
    schon den Setup-Einstieg von der Startseite getroffen. */
 const mitRegelnImLink=['recipe','query','field','threshold'].some(k=>params.has(k));
 main.append(card('Profi-Modus',
  'Alle Kennzahlen, alle Vergleiche, beide Methodiken. Nichts davon ist weggefallen — es beginnt nur nicht mehr hier.',
  [el('details',{class:'q-pro',open:mitRegelnImLink||null},
   [el('summary',{text:'Kriterien selbst zusammenstellen'}),profiZiel])]));
 sort.onchange=direction.onchange=apply;ruleList.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});if(!invalidLink)await apply();else share.hidden=true;
}
function recover(title,description,retry=false){S.clear(main);main.append(heading(title,description),actions([...(retry?[{label:'Erneut versuchen',href:location.pathname+location.search}]:[]),{label:'Research öffnen',href:href('research')},{label:'Zur Startseite',href:href('home')}]),el('footer',{class:'footer',text:'Vision Universe® · Entwicklungsvorschau'}));}
/* Die Produktsprache wird einmal geladen, bevor irgendetwas gezeichnet
   wird. Sie ist Daten, keine Konstantensammlung in dieser Datei: zwei
   Ansichten koennen denselben Begriff nicht unterschiedlich nennen, weil
   es nur eine Stelle gibt, an der die Worte stehen. Schlaegt das Laden
   fehl, erfindet diese Datei keine Ersatzworte - die betroffenen
   Ansichten sagen, dass die Texte fehlen. */
let languageReady=false;
async function loadLanguage(){
 if(languageReady)return true;
 try{VUProductLanguage.load(await S.loadJSON('/quant/methodology/product-language-v1.json'));languageReady=true;}
 catch{languageReady=false;}
 return languageReady;
}
const L=id=>VUProductLanguage.label(id);
const LQ=id=>VUProductLanguage.question(id);
const LB=id=>VUProductLanguage.beginner(id);
const LT=id=>VUProductLanguage.tooltip(id);
const LU=id=>VUProductLanguage.unavailable(id);
const LN=id=>VUProductLanguage.negative(id);
/* Eine Sektionsueberschrift besteht immer aus Nutzerbegriff und Frage -
   nie aus dem internen Namen. Der steht, wenn er gebraucht wird, in der
   eingeklappten Methodik darunter. */

/* Die Kursrendite kommt aus den Momentumkomponenten, die Anlegerrendite
   aus ihrer eigenen Evidenz. Gezeigt werden nur die Zeitraeume, fuer die
   BEIDE eine Zahl haben - ein halbes Paar erklaert den Unterschied
   nicht, sondern verdeckt ihn. */
function returnKindSection(data){
 const fenster=[['3M','3 Monate','priceReturn3m','3M'],
                ['6M','6 Monate','priceReturn6m','6M'],
                ['12M1M','12 Monate ohne den letzten','priceReturn12m1m',null]];
 const momentum=data.factors?.find?.(f=>f.id==='momentum')||null;
 const komponente=id=>{
  const c=(momentum&&momentum.components||[]).find(x=>x.id===id);
  return c&&c.state==='AVAILABLE'&&Number.isFinite(c.raw)?c.raw:null;
 };
 const investor=data.investorReturn||{state:'UNAVAILABLE'};
 const anleger=(key)=>{
  if(investor.state!=='AVAILABLE')return null;
  const v=key===null?investor.return12M1M:investor.returns?.[key];
  return Number.isFinite(v)?v:null;
 };
 const zeilen=fenster
  .map(([id,label,priceId,investorKey])=>({id,label,kurs:komponente(priceId),rendite:anleger(investorKey)}))
  .filter(z=>Number.isFinite(z.kurs)&&Number.isFinite(z.rendite));

 const section=el('section',{class:'section return-kind-section'},
  sectionHead('Kurs und Ertrag','priceStrengthVsInvestorReturn'));

 if(!zeilen.length){
  section.append(notice(L('investorReturn')+' nicht verfügbar',
   investor.state==='AVAILABLE'
    ? 'Für diesen Titel liegen nicht beide Zahlen über denselben Zeitraum vor. Eine einzelne davon würde den Unterschied verdecken statt ihn zu zeigen.'
    : VUProductLanguage.unavailable('investorReturn')));
  return section;
 }

 section.append(el('div',{class:'return-kind-grid'},[
  el('div',{class:'row eyebrow'},[el('span',{text:'Zeitraum'}),
   el('span',{class:'number',text:L('priceStrength')}),
   el('span',{class:'number',text:L('investorReturn')})]),
  ...zeilen.map(z=>el('div',{class:'row'},[
   el('span',{text:z.label}),
   el('span',{class:'number '+(z.kurs>=0?'positive':'negative'),text:pct1(z.kurs)}),
   el('span',{class:'number '+(z.rendite>=0?'positive':'negative'),text:pct1(z.rendite)})]))]));

 /* Der Unterschied selbst, in Worten. Bei einem Titel ohne Ausschuettung
    ist er null - und genau das ist die Aussage, nicht ein Fehler. */
 const groesste=zeilen.reduce((a,z)=>Math.abs(z.rendite-z.kurs)>Math.abs(a.rendite-a.kurs)?z:a,zeilen[0]);
 const abstand=groesste.rendite-groesste.kurs;
 section.append(el('p',{class:'muted',
  text:Math.abs(abstand)<0.0005
   ? VUProductLanguage.negative('priceStrengthVsInvestorReturn')
   /* Das Label kleinzuschreiben ergab "Über 12 monate ohne den letzten" -
      es faengt mit einer Zahl an, und der Rest ist ein Substantiv. */
   : 'Über ' + groesste.label + ' lagen die Ausschüttungen bei ' + pct1(Math.abs(abstand)) +
     ' — so viel mehr, als die reine Kursbewegung zeigt.'}));
 section.append(el('details',{},[el('summary',{text:VUProductLanguage.question('priceStrengthVsInvestorReturn')}),
  el('p',{text:VUProductLanguage.beginner('priceStrengthVsInvestorReturn')})]));
 return section;
}

function sectionHead(eyebrow,termId,intro){
 const parts=[el('span',{class:'eyebrow',text:eyebrow}),el('h2',{text:LQ(termId)})];
 if(intro!==false)parts.push(el('p',{class:'muted',text:intro||LB(termId)}));
 return parts;
}
/* ERREICHBAR BLEIBT ALLES, WAS ES GAB.
   Die Navigation zeigt fünf Bereiche - die Liste der gültigen Ansichten ist
   davon unabhängig und länger. Als sie aus `nav` abgeleitet wurde, hat die
   neue Navigation `portfolio`, `discover`, `markets` und `research` still
   in "Ansicht nicht gefunden" verwandelt: eine Navigationsänderung hatte
   Funktionen entfernt. Deshalb steht die Liste jetzt ausgeschrieben da. */
const GUELTIGE_ANSICHTEN=new Set(['home','screener','strategies','stocks','explain',
 'stock','technical','elliott','quant','fundamentals','compare','watchlist','signals',
 'radar','atlas','portfolio','markets','discover','research']);
/* =========================================================================
   DER SEITENTITEL NENNT DAS PRODUKT UND DEN BEREICH

   Owner-Entscheid 29.09.2026 (Produktgrenze): Vision Universe hat ein
   EIGENSTAENDIGES Produkt "Screener" unter /screener/. Quant hat einen
   EIGENEN, internen Screener. Beide duerfen nicht verwechselt werden -
   ausdruecklich auch nicht im Seitentitel.

   Der Titel war bisher statisch ("Vision Universe® — Investment
   Intelligence"), in jedem Bereich derselbe. Ein Reiter, der nicht sagt,
   wo man ist, ist bei zwei gleichnamigen Produkten kein Schoenheitsfehler
   mehr, sondern eine Verwechslungsquelle.

   Der Screener heisst hier deshalb "Quant Screener" - das eigenstaendige
   Produkt heisst schlicht "Screener". Keine Zusammenlegung der beiden
   ohne ausdruecklichen Owner-Entscheid. */
const TITEL={home:'Quant',screener:'Quant Screener',strategies:'Quant Anlagestile',
 stocks:'Quant Aktien',explain:'Quant Methodik',stock:'Quant Aktienanalyse',
 quant:'Quant Aktienanalyse',technical:'Quant Kursstruktur',elliott:'Quant Elliott Wave',
 fundamentals:'Quant Fundamentaldaten',compare:'Quant Vergleich',watchlist:'Quant Watchlist',
 signals:'Quant Signale',radar:'Quant Radar',atlas:'Quant Ask Atlas',
 portfolio:'Quant Portfolio',markets:'Quant Märkte',discover:'Quant Screens',
 research:'Quant Research'};
function titelSetzen(){
 const t=TITEL[view];
 document.title=(t?t:'Quant')+' — Vision Universe®';
}
async function render(){titelSetzen();if(!GUELTIGE_ANSICHTEN.has(view)){recover('Diese Ansicht wurde nicht gefunden','Öffne einen der fünf Quant-Bereiche über die Navigation oder kehre zur Startseite zurück.');return;}universe=view==='home'||view==='stock'?{state:'AVAILABLE',stocks:[]} : await api.getUniverse();
 /* Die Quant-Familie lebt von diesen Texten. Ohne sie wird nicht
    halbfertig gezeichnet, sondern gesagt, was fehlt. */
 const needsLanguage=new Set(['quant','explain','watchlist','radar','stock','strategies','signals','screener','technical','home']);
 if(needsLanguage.has(view)&&!await loadLanguage()){
  recover('Die Texte dieser Ansicht konnten nicht geladen werden','Diese Ansicht beschreibt Fachbegriffe in Alltagssprache. Ohne die Textquelle werden keine Ersatzformulierungen erfunden. Bitte lade die Seite neu.',true);
  return;
 }
 if(view==='home')await homePage();
 else if(view==='stock'){const t=(params.get('ticker')||'NVDA').toUpperCase();zuletztMerken(t);await stockPage(t);}
 else if(view==='technical'||view==='elliott')await technicalWorkspacePage(params.get('ticker')||'NVDA',view==='elliott');
 else if(view==='quant')await quantPage(params.get('ticker')||'NVDA');
 else if(view==='explain')await explainPage();
 else if(view==='fundamentals')await fundamentalsPage();
 else if(view==='markets')await marketsPage();
 else if(view==='discover')await discoverPage();
 else if(view==='screener')await screenPage();
 else if(view==='research'){main.append(heading('Research ohne Umwege','Deine Workspaces. Von der ersten Frage bis zur vollständigen Analyse.'),el('div',{class:'catalog'},groups.map(([title,desc,links])=>el('section',{},[el('h2',{text:title}),el('p',{text:desc}),el('div',{class:'links'},links.map(([label,url])=>link(label,url)))]))));}
 else if(view==='compare')await comparePage();
 else if(view==='strategies')await strategyPage();
 else if(view==='portfolio')await portfolioPage();
 else if(view==='watchlist')await watchlistPage();
 else if(view==='atlas')await atlasPage();
 else if(view==='signals')await signalsPage();
 else if(view==='radar')await radarPage();
 else if(view==='stocks')await aktienPage();
 else {main.append(heading(view==='markets'?'Märkte verstehen':'Das Wichtigste im Blick','Daten einordnen. Zusammenhänge erkennen. Weiterforschen.'));const focus=universe.stocks.find(s=>s.ticker==='NVDA'),measured=universe.productCapabilityState==='AVAILABLE',productCount=measured?Number(universe.productUniverseSize):universe.stocks.length;const left=el('section',{},[notice('Gesamtmarkt noch nicht eingeordnet',measured?productCount.toLocaleString('de-DE')+' Produkttitel sind identifiziert und capability-geprüft; '+universe.stocks.length+' davon besitzen die vollständig verbundene Intelligence-Ansicht. Ein Marktregime oder breiter Rang wird daraus noch nicht behauptet.':universe.stocks.length+' vollständig verbundene Intelligence-Titel bleiben nutzbar; die Breitenmessung ist derzeit nicht verfügbar und wird nicht geschätzt.'),el('div',{class:'section'},[el('h2',{text:'Unternehmen im Blick'}),stockRows(universe.stocks.slice(0,100))])]);const right=el('aside',{},[el('span',{class:'eyebrow',text:'Analyse vertiefen'}),el('h2',{text:focus?'NVIDIA':'Research'}),el('p',{class:'muted',text:'Wie entwickeln sich Geschäft und Kurs? Die Aktienanalyse verbindet Kennzahlen mit ihren Quellen.'}),focus?evidence(focus):null,link('Aktie untersuchen',href('stock','NVDA'),'button'),el('div',{class:'section links'},[link('Ideen entdecken',href('discover')),link('Makro-Zusammenhänge','/macro/'),link('Morning Briefing','/morning/'),link('News im Kontext','/news/'),link('Ask Atlas',href('atlas'))])]);main.append(el('div',{class:'layout'},[left,right]));}
 const footerQuote=view==='stock'?universe.stocks.find(s=>s.ticker===(params.get('ticker')||'NVDA').toUpperCase()):universe.stocks[0];
 main.append(el('footer',{class:'footer',text:'Vision Universe® · Entwicklungsvorschau · Bestehender freigegebener Analysebereich. '+(view==='stock'?'Historische Kennzahlen: EOD. Intraday und Live nennen ihren Stand separat. ':'Kurse: letzter verfügbarer EOD-Stand, nicht realtime. ')+(footerQuote?.asOf?'Kursstand: '+footerQuote.asOf+'. ':'')+'Keine Anlageempfehlung.'}));
}
render().catch(e=>{console.error("RENDER FAILED:",e&&e.stack||e);return recover('Ansicht derzeit nicht verfügbar','Die Ansicht konnte nicht vollständig geladen werden. Versuche es erneut oder öffne einen anderen Workspace.',true);});
})();
