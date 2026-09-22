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
const params=new URLSearchParams(location.search),view=params.get('view')||'home';
const href=(v,t)=>'/vu2/?view='+v+(t?'&ticker='+encodeURIComponent(t):'');
const link=(label,url,cls)=>el('a',{text:label,href:url,class:cls});
const n=(m,d=1)=>m&&Number.isFinite(m.value)?(vuFormat('formatPrice',m.value,m.unit,{numberLocale:'de-DE',decimals:d})||m.value.toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d})+(m.unit==='percent'?' %':m.unit==='USD'?' $':'')):m&&typeof m.value==='string'?m.value.replaceAll('_',' '):'Nicht verfügbar';
const formatFactor=m=>!Number.isFinite(m.value)?'Nicht verfügbar':m.value.toLocaleString('de-DE',{maximumFractionDigits:2})+(m.metricId==='marginExpansion'?' Prozentpunkte':m.unit==='pct'?' %':m.unit==='x'?' ×':'');
const nav=[['home','Home'],['markets','Markets'],['discover','Discover'],['research','Research'],['strategies','Strategies'],['portfolio','Portfolio']];
const groups=[
 ['Aktien & Analyse','Vom Unternehmen bis zur Kursstruktur.',[
 ['Aktien',href('stocks')],['Charts','/quant/stock/?ticker=NVDA'],['Fundamentals & Historie',href('fundamentals','NVDA')],['SEC Dateninspektor','/quant/data-inspector/'],['Was ist Quant?',href('explain')],['Technical Intelligence',href('technical','NVDA')],['Elliott Wave',href('elliott','NVDA')],['Quant',href('quant','NVDA')],['Vergleichen',href('compare')]]],
 ['Märkte & Ideen','Zusammenhänge verstehen und Titel finden.',[
 ['Discover · Marktwelten','/discover/'],['Vordefinierte Screens',href('discover')],['Screener',href('screener')],['Professioneller Screener','/quant/screener/'],['Rankings','/quant/ranking/'],['ETF Research & Vergleich','/etf/'],['Macro Intelligence','/macro/'],['Hedge Funds & Ownership','/hedgefonds/'],['Analyst Ratings','/analysten/']]],
 ['Research & Wissen','Aktuelles einordnen. Tiefer verstehen.',[
 ['News','/news/'],['Morning Briefing','/morning/'],['Weekly Magazine','/magazin/'],['Stock Reports','/reports/xpeng/'],['Academy','/academy/'],['Investment Guide','/guide/'],['Strategies',href('strategies')],['Radar',href('radar')],['Signals',href('signals')],['Watchlist',href('watchlist')],['Ask Atlas',href('atlas')]]]
];
const app=document.getElementById('app');
const researchViews=new Set(['discover','stocks','stock','fundamentals','technical','elliott','quant','explain','compare','screener']);
const activeSection=researchViews.has(view)?'research':view;
function navLink(id,label){const a=link(label,id==='discover'?'/discover/':href(id),id===activeSection?'active':'');if(id===activeSection)a.setAttribute('aria-current',id===view?'page':'location');return a;}
const header=el('header',{class:'top'},[link('',href('home'),'brand'),el('nav',{class:'nav','aria-label':'Hauptnavigation'},nav.map(([id,label])=>navLink(id,label))),el('div',{class:'utility'},[link('Watchlist',href('watchlist')),link('Signals',href('signals')),el('button',{text:'Suche',onclick:()=>openSearch()})])]);
header.querySelector('.brand').append(el('img',{src:'/assets/vision-universe-logo.png',alt:'Vision Universe®'}));
const main=el('main',{id:'content',tabindex:'-1'});app.append(header,main,el('nav',{class:'mobile-nav','aria-label':'Mobile Navigation'},nav.filter(([id])=>id!=='strategies').map(([id,label])=>navLink(id,label))));
const dialog=el('dialog',{'aria-label':'Unternehmen und Workspaces suchen'});app.append(dialog);
dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=[...dialog.querySelectorAll('input,button,a[href]')].filter(n=>!n.disabled&&!n.hidden),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
let universe;
function heading(title,description){return el('div',{class:'intro'},[el('div',{},[el('span',{class:'eyebrow',text:'Vision Universe® · Preview'}),el('h1',{text:title}),description?el('p',{class:'muted',text:description}):null])]);}
function notice(title,text){return el('div',{class:'notice'},[el('h3',{text:title}),el('p',{class:'muted',text})]);}
function stockRows(stocks,metricKey='momentum6m',metricLabel='6 Monate',showAsOf=false){return el('div',{},[el('div',{class:'row eyebrow'},[el('span',{text:'Unternehmen'}),el('span',{class:'number',text:'Schlusskurs'}),el('span',{class:'number',text:metricLabel})]),...stocks.map(s=>el('a',{class:'row',href:href('stock',s.ticker)},[el('div',{},[el('strong',{text:s.ticker}),el('span',{class:'muted',text:s.name}),showAsOf?el('span',{class:'muted row-asof'},[el('span',{text:'Kursstand '}),el('time',{datetime:s.asOf,text:s.asOf||'nicht verfügbar'})]):null]),el('div',{class:'number',text:n(s.price,2)}),el('div',{class:'number '+(Number.isFinite(s[metricKey]?.value)&&s[metricKey].unit==='percent'?(s[metricKey].value>=0?'positive':'negative'):''),text:n(s[metricKey])})]))]);}
function freshness(data,ticker){const root=el('div',{'aria-live':'polite'});function draw(data){const stale=data?.members?.filter(m=>m.state==='STALE').length||0,unknown=data?.members?.filter(m=>!['AVAILABLE','STALE'].includes(m.state)).length||0;let text;if(!data||data.state==='UNAVAILABLE')text='Aktualität des Tagesstands derzeit nicht bestätigt.';else if(data.state==='PIPELINE_ERROR')text='Der Tagesstand benötigt eine Datenprüfung.';else if(stale)text=stale+' '+(stale===1?'Kursstand liegt':'Kursstände liegen')+' vor der letzten abgeschlossenen Börsensitzung ('+data.expectedThrough+'). Neuere Tagesdaten fehlen in dieser Ansicht.'+(unknown?' Weitere '+unknown+' Kursstände sind nicht prüfbar.':'');else text='Tagesdaten reichen bis zur letzten abgeschlossenen Börsensitzung ('+data.expectedThrough+'). Keine Echtzeit- oder Endgültigkeitsbestätigung.';if(root.firstElementChild?.textContent===text)return;S.mount(root,el('p',{class:'market-freshness '+(stale?'freshness-warning':'muted'),text}));}draw(data);let loading=false;const timer=setInterval(async()=>{if(document.hidden||loading)return;loading=true;try{draw(await api.getMarketDataHealth(ticker));}catch{draw(null);}finally{loading=false;}},60000);addEventListener('pagehide',()=>clearInterval(timer),{once:true});return root;}
function evidence(s){return el('div',{class:'evidence'},[['Umsatzwachstum',s.revenueGrowth],['Operative Marge',s.operatingMargin],['Kursentwicklung · 6M',s.momentum6m]].map(([label,m])=>el('div',{},[el('span',{class:'muted',text:label}),el('strong',{text:n(m)})])));}
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
function setupStateSection(setup){const section=el('section',{class:'section','aria-label':'SetupState'});section.append(el('span',{class:'eyebrow',text:'SetupState'}),el('h2',{text:'Setup-Zustand'}));if(!setup||setup.availability?.state!=='AVAILABLE'){section.append(notice('SetupState derzeit nicht verfügbar','Es wird kein Setup-Zustand behauptet: die historische Setup-State-Materialisierung und zertifizierte Regelbindung sind noch nicht aktiv.'));return section;}section.append(el('p',{text:setup.setupState}),el('p',{class:'muted',text:'Evidenzstand '+setup.asOf+' · Backtest-Zertifizierung: '+setup.backtestCertification}));return section;}
async function stockPage(ticker){const s=await api.getStockIntelligence(ticker);main.append(heading(s.name||'Aktienanalyse',s.ticker||''));if(s.state!=='AVAILABLE'){main.append(notice(s.identityState==='AVAILABLE'?'Unternehmen im Produktuniversum':'Daten derzeit nicht verfügbar',s.identityState==='AVAILABLE'&&s.reason==='SOURCE_MISSING'?'Das Unternehmen ist im Wertpapierverzeichnis vorhanden. Die Daten können derzeit nicht geladen werden. Bitte versuche es später erneut.':s.identityState==='AVAILABLE'?'Dieser Titel ist im gemeinsamen Wertpapierverzeichnis vorhanden. Verfügbare Kurs- und Geschäftsjahresdaten werden darunter geladen. Für weitere Analysen kann die Datenabdeckung abweichen.':'Für diesen Titel liegen in dieser Ansicht keine freigegebenen Daten vor.'));
 if(s.identityState==='AVAILABLE'){
  const [history,fundamentals]=await Promise.all([api.getHistoricalPriceHistory(ticker),api.getHistoricalFundamentals(ticker)]);
  if(history.state==='AVAILABLE')main.append(el('section',{class:'section'},[el('h2',{text:'Kursentwicklung'}),QuantCharts.lineChart({title:ticker+' · tägliche Schlusskurse',width:Math.min(900,innerWidth-40),height:290,dates:history.bars.map(b=>b.date),series:[{values:history.bars.map(b=>b.close)}],yFormat:v=>v.toLocaleString('de-DE',{notation:'compact',maximumFractionDigits:1})}),el('p',{class:'muted',text:'Splitbereinigte Schlusskurse · '+history.currency+' · Stand '+history.asOf+'. Verfügbarer Tageszeitraum: '+history.availableFrom+' bis '+history.availableTo+'.'})]));
  else main.append(notice('Kurshistorie derzeit nicht verfügbar','Die gemeinsame Kursreihe konnte für diesen Titel nicht validiert oder geladen werden.'));
  main.append(el('p',{class:'muted',text:fundamentals.state==='AVAILABLE'?'Geschäftsjahresdaten sind verfügbar. Die Historienansicht zeigt Werte und Meldedaten.':'Fundamentaldaten sind für diesen Titel derzeit nicht darstellbar.'}),actions(s.workspaces));
  await liveStockSection(ticker);
 }
 return;}
 const left=el('section',{class:'focus'},[el('span',{class:'pill',text:s.above200.value>0&&s.above50.value>0?'Über wichtigen Trendbereichen':'Kursstruktur prüfen'}),el('div',{class:'quote',text:n(s.price,2)}),el('p',{class:'muted',text:'Letzter verfügbarer Schlusskurs · '+(s.asOf||'Datum nicht verfügbar')})]);
 left.append(freshness(s.health,s.ticker));
 const chart=el('div'),ranges=el('div',{class:'ranges','aria-label':'Chart-Zeitraum'});
 function draw(id){S.clear(chart);if(!s.chart||s.chart.state!=='AVAILABLE'){chart.append(notice('Kurshistorie derzeit nicht verfügbar','Für diesen Titel ist noch keine validierte Materialisierung veröffentlicht.'));return;}const data=VUChartRanges.selectRange(id,{eod:s.chart.bars||[],adjustmentStatus:s.chart.adjustmentStatus});ranges.querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b.dataset.range===id);b.setAttribute('aria-pressed',b.dataset.range===id?'true':'false');});if(!data.ok){chart.append(notice('Dieser Zeitraum ist nicht verfügbar','Tagesverläufe benötigen freigegebene Intraday-Daten. Wähle einen längeren Zeitraum.'));return;}
 chart.append(QuantCharts.lineChart({title:s.ticker+' · historische Schlusskurse',width:Math.min(900,window.innerWidth-40),height:290,dates:data.bars.map(b=>b.date),series:[{values:data.bars.map(b=>b.close)}],yFormat:v=>vuFormat('formatPrice',v,'USD',{numberLocale:'de-DE',decimals:0})||v.toFixed(0)+' $'}));}
 VUChartRanges.RANGES.forEach(r=>ranges.append(el('button',{text:r.label,dataset:{range:r.id},onclick:()=>draw(r.id)})));left.append(chart,ranges,el('p',{class:'muted',text:'Unbereinigte Schlusskurse · USD. Splits können historische Kurssprünge verursachen.'}));draw('1Y');
 const side=el('aside',{},[el('h2',{text:'Was dahintersteht'}),el('p',{text:s.above200.value>0?'Der Kurs liegt über seinem 200-Tage-Durchschnitt. Das beschreibt die bisherige Entwicklung, keine Prognose.':'Die langfristige Kursstruktur verdient einen genaueren Blick.'}),evidence(s),el('details',{},[el('summary',{text:'Evidenz & Methodik'}),el('p',{class:'muted',text:'Abstand zum 200-Tage-Durchschnitt: '+n(s.above200)+'. Fundamentaldaten bis '+s.fundamentalsAsOf+', verfügbar seit '+s.availableAt+'. Quelle: SEC EDGAR; Kurskennzahlen: Tiingo EOD / bestehende Quant-Methodik.'}),link('Daten und Berechnung untersuchen','/quant/data-inspector/','button secondary')])]);
 main.append(el('div',{class:'layout'},[left,side]),setupStateSection(s.setupState),actions(s.workspaces));
 const business=el('section',{class:'section stock-business'},[el('span',{class:'eyebrow',text:'Geschäft, Bewertung und Risiko'}),el('h2',{text:'Was zeigen die Unternehmenszahlen?'}),el('p',{class:'muted',text:'Ergebnisse verstehen, den Preis einordnen und Schwankungen prüfen. Jede Kennzahl führt zu ihrer Definition und zur vollständigen Analyse.'})]);
 if(s.quant?.state==='AVAILABLE'){
  const selected={quality:['operatingMargin','fcfMargin'],growth:['revenueGrowth','epsGrowth'],value:['earningsYield','priceToFcf'],risk:['volatility','maxDrawdown']};
  business.append(el('div',{class:'stock-evidence-grid'},s.quant.families.filter(f=>selected[f.id]).map(f=>el('article',{'data-stock-family':f.id},[el('h3',{text:f.question}),...f.metrics.filter(m=>selected[f.id].includes(m.metricId)).map(m=>el('div',{class:'stock-evidence-metric'},[el('div',{},[el('span',{text:m.label}),el('strong',{text:formatFactor(m)})]),el('details',{},[el('summary',{text:'Warum ist das relevant?'}),el('p',{text:m.description}),el('p',{class:'muted',text:m.state==='AVAILABLE'?'Datenstand '+m.asOf+' · bekannt seit '+m.availableAt:'Für diese Kennzahl fehlen auswertbare oder freigegebene Daten.'})])])),link(f.id==='growth'||f.id==='quality'?'Entwicklung über die Jahre':'Vollständige Kennzahlen & Methodik',f.id==='growth'||f.id==='quality'?href('fundamentals',ticker):href('quant',ticker)+'#factor-'+f.id,'stock-evidence-link')]))));
  business.append(el('p',{class:'muted',text:'Geschäftszahlen bis '+s.quant.fundamentalsAsOf+' · bekannt seit '+s.quant.availableAt+'. Marktbezogene Kennzahlen bis '+s.quant.asOf+'. Bewertungen sind kein Urteil über einen fairen Preis; vergangene Schwankungen sind keine Verlustprognose.'}));
 }else business.append(notice('Unternehmenskennzahlen derzeit nicht auswertbar','Die professionellen Analysezugänge bleiben erreichbar. Fehlende Kennzahlen werden nicht ersetzt.'));
 main.append(business);
 const technical=await api.getTechnicalIntelligence(ticker);
 const section=el('section',{class:'section'},[el('span',{class:'eyebrow',text:'Kursstruktur verstehen'}),el('h2',{text:'Technical Intelligence'})]);
 if(technical.state==='AVAILABLE'){
  const detail=technical.fullWorkspace?[el('p',{text:'Elliott Wave: '+technical.elliott.label+'. Die Szenarien sind keine Wahrscheinlichkeitsprognose.'}),actions([{label:'Vollständige Technical-Analyse',href:technical.workspace},{label:'Elliott: Szenarien & Invalidation',href:technical.elliottWorkspace}])]:[el('p',{class:'muted',text:'Vorhandene Kursfaktor-Evidenz. Ein vollständiges Technical- oder Elliott-Bundle ist für diesen Titel noch nicht publiziert.'}),actions([{label:'Vollständige Kursgeschichte',href:'/quant/stock/?ticker='+encodeURIComponent(ticker)}])];
  section.append(el('div',{class:'technical-summary'},[['Trend',technical.trend],['Momentum',technical.momentum],['Volatilität',technical.volatility]].map(([label,state])=>el('div',{},[el('span',{class:'muted',text:label}),el('h3',{text:state.label})]))),el('p',{class:'muted',text:'Analyse bis '+technical.asOf+' · '+technical.methodology}),...detail);
 }else section.append(notice('Technische Analyse derzeit nicht verfügbar','Der vollständige Workspace bleibt über die Analysezugänge erreichbar.'));
 main.append(section);
 await liveStockSection(ticker);
}
async function technicalWorkspacePage(ticker,elliottMode){
 const data=await api.getTechnicalWorkspace(ticker);
 main.append(heading(elliottMode?'Elliott Wave · Szenarien verstehen':'Kursstruktur untersuchen',ticker+' · Chart, Evidenz und alternative Entwicklungen.'));
 if(data.state!=='AVAILABLE'){main.append(notice('Analyse derzeit nicht verfügbar','Die Daten erfüllen die Anforderungen dieser Ansicht derzeit nicht.'),actions([{label:'Bestehenden Workspace öffnen',href:'/quant/technical/?symbol='+encodeURIComponent(ticker)}]));return;}
 if(elliottMode&&['UNAVAILABLE','INSUFFICIENT_DATA'].includes(data.elliott?.status)){main.append(notice('Elliott-Zählung derzeit nicht verfügbar','Das Technical-Bundle ist gültig, enthält für diesen Titel aber keine validierte Elliott-Zählung.'),actions([{label:'Technical öffnen',href:href('technical',ticker)},{label:'Vollständige Kursgeschichte',href:href('stock',ticker)}]));return;}
 const root=el('section',{class:'technical-workspace'}),chart=el('div',{class:'technical-chart-host'}),select=el('select',{'aria-label':'Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name}))),layer=el('select',{'aria-label':'Chart-Ebene'},[['AUTO','Übersicht'],['STRUCTURE','Marktstruktur'],['TREND','Trend'],['MOMENTUM','Momentum'],['SUPPORT_RESISTANCE','Support / Resistance'],['FIBONACCI','Fibonacci'],['ELLIOTT','Elliott Wave']].map(([value,text])=>el('option',{value,text}))),range=el('select',{'aria-label':'Chart-Zeitraum'},[['1M','1 Monat'],['3M','3 Monate'],['6M','6 Monate'],['YTD','Seit Jahresbeginn'],['1Y','1 Jahr'],['5Y','5 Jahre'],['MAX','Max · vorhandenes Analysefenster']].map(([value,text])=>el('option',{value,text}))),mode=el('select',{'aria-label':'Chart-Darstellung'},[['candles','Kerzen'],['line','Linie']].map(([value,text])=>el('option',{value,text}))),alt=el('input',{type:'checkbox','aria-label':'Alternativen im Chart'}),labels=el('input',{type:'checkbox','aria-label':'Chart-Beschriftungen'});labels.checked=innerWidth>=650;
 select.value=ticker;select.onchange=()=>location.assign(href(elliottMode?'elliott':'technical',select.value));layer.value=elliottMode?'ELLIOTT':'AUTO';range.value='1Y';
 const draw=()=>{const annotations=data.chart.annotations.filter(a=>(a.layers||[]).includes(layer.value)||(alt.checked&&((a.layers||[]).includes('ALTERNATIVE')||(layer.value==='ELLIOTT'&&(a.layers||[]).includes('ELLIOTT_ALT')))));S.mount(chart,QuantCharts.technicalChart({bars:data.chart.bars,series:data.chart.series,annotations,annotationLabels:labels.checked,range:range.value,mode:mode.value,width:Math.max(300,Math.min(1168,main.clientWidth-40)),height:innerWidth<650?340:460,title:ticker+' · '+(elliottMode?'Elliott Wave':'Technical Intelligence'),description:'Historische Kurse und ausdrücklich gekennzeichnete Projektionen. Keine Zukunftsdaten im Kursverlauf.'}));};
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
async function radarPage(){
 main.append(heading('Radar · belegte Kurswechsel','Capability-gesteuerte Übersicht aus den materialisierten Signals-Artefakten. Ohne Quant-Score und ohne Marktregime.'));
 const lookback=[5,20,60].includes(Number(params.get('window')))?Number(params.get('window')):20,data=await api.getRadarIntelligence({lookback,limit:12});
 if(data.state!=='AVAILABLE'){main.append(notice('Radar derzeit nicht auswertbar','Ohne contract-konforme materialisierte Signals werden keine Ersatzlisten erzeugt.'));return;}
 const select=el('select',{'aria-label':'Radar-Zeitraum'},[5,20,60].map(value=>el('option',{value:String(value),text:value+' EOD-Beobachtungen'})));select.value=String(lookback);select.onchange=()=>location.assign(href('radar')+'&window='+select.value);
 main.append(el('div',{class:'workspace-controls'},[select]),el('p',{class:'scope-note',text:data.coverage.available+' von '+data.coverage.requested+' Produkttiteln contract-konform auswertbar · '+data.eventTickerCount+' Titel mit belegtem Wechsel · '+data.eventCount+' Wechsel im Zeitraum'}),el('p',{class:'muted',text:'Jedes Element ist ein retrospektiver EOD-Zustandswechsel. Es ist weder Echtzeit- noch Handels- oder Ranking-Signal. Quant V2 und Market Regime bleiben geschlossen.'}));
 const grid=el('div',{class:'radar-grid'});for(const module of data.modules){const section=el('section',{class:'radar-module'},[el('h2',{text:module.title}),el('p',{class:'muted',text:module.description})]);if(!module.items.length)section.append(el('p',{text:'Keine belegten Wechsel in diesem Ausschnitt.'}));for(const event of module.items){const metric=event.evidence?.[0];section.append(el('article',{class:'radar-item'},[el('div',{},[link(event.ticker,href('stock',event.ticker)),el('span',{class:'muted',text:event.asOf+' · '+event.previousAsOf+' → '+event.asOf})]),el('p',{text:metric&&Number.isFinite(metric.previous)&&Number.isFinite(metric.current)?metric.previous.toLocaleString('de-DE',{maximumFractionDigits:2})+' % → '+metric.current.toLocaleString('de-DE',{maximumFractionDigits:2})+' %':event.rule}),link('Regel prüfen',href('screener')+'&query='+encodeURIComponent(VUScreenerWorkspace.encode(event.query)),'button secondary')]));}grid.append(section);}main.append(grid,actions([{label:'Alle Signals',href:href('signals')+'&window='+lookback},{label:'Watchlist',href:href('watchlist')},{label:'Screener',href:href('screener')} ]));
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
async function homePage(){
 let tickers=[],storageUnavailable=false;try{tickers=VUWatchlistWorkspace.load(localStorage);}catch{storageUnavailable=true;}
 const data=await api.getHomeIntelligence(tickers),observations=data.market.observations;
 main.append(heading('Was ist für dich wichtig?','Unternehmen beobachten. Veränderungen verstehen. Deine nächste Analyse finden.'));
 const session=el('div',{class:'home-session'});
 function showSession(s){S.clear(session);session.append(el('div',{},[el('strong',{text:s.label}),el('span',{class:'muted',text:s.state==='AVAILABLE'?' · Kalenderstand '+s.localDate+' '+s.localTime.slice(0,5)+' New York':' · Kalender derzeit nicht verfügbar'})]),el('span',{class:'pill',text:'Kurse: letzter verfügbarer Tagesstand'}));}
 showSession(data.session);main.append(session,freshness(data.health),el('p',{class:'muted home-session-note',text:'Die Handelsphase folgt dem Börsenkalender. Diese Vorschau zeigt keine Echtzeitkurse; eine geöffnete Börse bedeutet keinen aktiven Datenstream.'}));
 let refreshing=false;const timer=setInterval(async()=>{if(document.hidden||refreshing)return;refreshing=true;try{showSession(await api.getMarketSession());}finally{refreshing=false;}},60000);addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 const personal=el('section',{class:'home-personal'},[el('span',{class:'eyebrow',text:'Deine Perspektive'}),el('h2',{text:'Unternehmen, die dich interessieren'})]);
 if(storageUnavailable)personal.append(notice('Deine Auswahl bleibt geschützt','Die gespeicherte Watchlist ist derzeit nicht lesbar. Sie wird nicht zurückgesetzt.'));
 else if(data.watchlist.state==='EMPTY')personal.append(el('p',{class:'muted',text:'Stelle deine eigene Watchlist zusammen. Hier findest du anschließend ihre aktuelle Kursstruktur und die passenden Analysen.'}));
 else{for(const s of data.watchlist.members.slice(0,3))personal.append(el('div',{class:'home-watch-row'},[link(s.ticker,href('stock',s.ticker)),el('span',{class:'muted',text:(s.state!=='AVAILABLE'?'Analyse derzeit nicht verfügbar':!Number.isFinite(s.above200?.value)?'Trend derzeit nicht verfügbar':s.above200.value>=0?'Am langfristigen Trendbereich oder darüber':'Unter dem langfristigen Trendbereich')+(s.state==='AVAILABLE'?' · Kursstand '+s.asOf:'')})]));if(data.watchlist.members.length>3)personal.append(el('p',{class:'muted',text:'Weitere '+(data.watchlist.members.length-3)+' Titel in deiner Watchlist.'}));}
 personal.append(link(tickers.length?'Deine Watchlist öffnen':'Watchlist zusammenstellen',href('watchlist'),'button'));
 const changes=el('section',{},[el('span',{class:'eyebrow',text:'Was sich verändert hat'}),el('h2',{text:'Nicht jede Bewegung ist ein neues Signal'}),el('p',{class:'muted',text:'Untersuche belegte Wechsel über Trendgrenzen und in der Kursentwicklung. Mit Datum, Vergleichswert und derselben Regel im Screener.'}),link('Historische Änderungen untersuchen',href('signals')+'&window=60','button secondary')]);
 main.append(el('div',{class:'home-priorities'},[personal,changes]));
 const markets=el('section',{class:'section'},[el('div',{class:'home-section-heading'},[el('div',{},[el('span',{class:'eyebrow',text:'Märkte einordnen'}),el('h2',{text:'Ausgewählte Unternehmen mit vollständiger Intelligence'})]),link('Markets öffnen',href('markets'),'button secondary')]),el('p',{class:'scope-note',text:observations.length+' kuratierte Unternehmen. Das kanonische Produktuniversum bleibt über Suche und Aktienansichten erreichbar; diese Auswahl ist kein Gesamtmarktbild und kein Produkt-Gate.'})]);
 if(observations.length)markets.append(stockRows(observations.map(o=>o.stock),'momentum6m','6 Monate',true));else markets.append(notice('Marktdaten derzeit nicht verfügbar','Wir zeigen keine Ersatzkurse und leiten daraus keinen Marktstatus ab.'));
 main.append(markets,el('section',{class:'home-research section'},[el('div',{},[el('span',{class:'eyebrow',text:'Dein nächster Schritt'}),el('h2',{text:'Von der Frage zur vollständigen Analyse'}),el('p',{class:'muted',text:'Geführt starten oder direkt in den professionellen Workspace springen.'})]),el('div',{class:'links'},[link('Ideen mit sichtbaren Regeln entdecken',href('discover')),link('Eigene Kriterien im Screener kombinieren',href('screener')),link('Alle Research-Workspaces',href('research')),link('Morning Briefing','/morning/'),link('News','/news/'),link('Weekly Magazine','/magazin/'),link('Ask Atlas',href('atlas'))])]));
}
/* Kompakte Faktorlage für Listenansichten: dieselbe kanonische Reihenfolge
   und dieselben Bänder wie die Factor DNA, nur ohne Aufklappen. Ein Faktor
   ohne Wert bleibt sichtbar leer statt zu verschwinden - sonst sähen sechs
   von sieben Faktoren aus wie sieben. */
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
  el('div',{class:'strip-head'},[el('span',{class:'eyebrow',text:'Quant V2 · Factor Evidence'}),
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
async function strategyPage(){
 main.append(heading('Aus Überzeugung werden Regeln','Definiere Auswahl, Gewichtung und Kosten. Bewahre jede Änderung nachvollziehbar auf.'));
 const context=await api.getStrategyContext();if(context.state!=='AVAILABLE'){main.append(notice('Methodik derzeit nicht verfügbar','Der bestehende Strategy Builder bleibt erreichbar.'),actions([{label:'Strategy Builder öffnen',href:'/quant/strategies/builder/'}]));return;}
 main.append(el('p',{class:'scope-note',text:(context.currentSelection?.selectable||0).toLocaleString('de-DE')+' kanonische Produkttitel stehen der aktuellen Kriterienprüfung zur Verfügung. Ranking, Quant-V2-Score und historischer Test bleiben bis zur jeweiligen Zertifizierung geschlossen.'}));
 let saved,definition=context.definition;try{saved=VUStrategyWorkspace.load(localStorage);if(saved)definition=VUStrategy.getVersion(saved).definition;if(params.has('query'))definition=VUStrategy.createDefinition({...definition,filters:VUScreenerWorkspace.decode(params.get('query')).filters});}catch{main.append(notice('Gespeicherte Strategie prüfen','Der Entwurf oder die übergebenen Regeln sind nicht gültig. Vorhandene Daten werden nicht überschrieben.'));return;}
 const fields={};function input(id,label,value,attrs={}){const control=el('input',{id:'strategy-'+id,value:String(value),...attrs});fields[id]=control;return el('label',{class:'strategy-field'},[el('span',{text:label}),control]);}
 function select(id,label,value,options){const control=el('select',{'aria-label':label},options.map(([value,text])=>el('option',{value,text})));control.value=value;fields[id]=control;return el('label',{class:'strategy-field'},[el('span',{text:label}),control]);}
 const filters=el('div',{class:'strategy-rules'},definition.filters.length?definition.filters.map(f=>el('p',{text:(VUCatalog.field(f.field)?.label||f.field)+' '+(VUCatalog.operator(f.operator)?.label||f.operator)+' '+f.value+(f.scale==='percentile'?' · Perzentil':VUCatalog.field(f.field)?.unit==='pct'?' %':VUCatalog.field(f.field)?.unit==='usd'?' USD':'')})):[el('p',{text:'Noch keine Auswahlkriterien. Beginne im Screener und übernimm deine Regeln.'})]);
 let editHref=href('screener');try{editHref+='&query='+encodeURIComponent(VUScreenerWorkspace.encode(VUScreenerWorkspace.build(definition.filters)));}catch{}
 const names={quality:'Qualität',momentum:'Momentum',value:'Bewertung',growth:'Wachstum',risk:'Risiko'},status=el('div',{'aria-live':'polite'}),preview=el('section',{'aria-live':'polite'}),history=el('pre',{class:'query-code',text:saved?JSON.stringify(saved,null,2):'Noch keine gespeicherte Version.'});
 main.append(input('name','Name des Entwurfs',saved?.strategy.name||'Meine Investmentidee',{maxlength:'120'}),el('section',{class:'section'},[el('h2',{text:'1 · Welche Unternehmen kommen infrage?'}),filters,link('Kriterien im Screener bearbeiten',editHref,'button secondary')]),el('section',{class:'section'},[el('h2',{text:'2 · Was soll bei der Auswahl zählen?'}),el('p',{class:'muted',text:'Die Faktoranteile müssen zusammen 100 % ergeben. Sie definieren ein späteres Ranking; ein Quant-V2-Rang wird bis zur Zertifizierung nicht berechnet.'}),el('div',{class:'strategy-grid'},context.factors.map(f=>input(f,names[f]+' · Anteil in %',(definition.ranking.factors.find(r=>r.factor===f)?.weight||0)*100,{type:'number',min:'0',max:'100',step:'1'})))]),
 el('section',{class:'section'},[el('h2',{text:'3 · Portfolio und Ausführung'}),el('div',{class:'strategy-grid'},[
 input('positions','Anzahl Positionen',definition.portfolio.positions,{type:'number',min:context.constraints.minPositions,max:context.constraints.maxPositions,step:'1'}),
 select('weighting','Positionsgewichtung',definition.portfolio.weighting,context.weightings.map(v=>[v,{equal:'Gleichgewichtet',score:'Nach Faktorwert',volatility:'Nach Volatilität'}[v]])),
 select('rebalance','Umschichten',definition.rebalance,context.rebalance.map(v=>[v,{monthly:'Monatlich',quarterly:'Quartalsweise'}[v]])),
 select('timing','Ausführungszeitpunkt',definition.execution.timing,context.timings.map(v=>[v,{next_open:'Nächste Eröffnung',next_close:'Nächster Schlusskurs'}[v]])),
 input('cost','Transaktionskosten · Basispunkte',definition.execution.transactionCostsBps,{type:'number',min:'0',max:context.costs.maxTransactionCostsBps,step:'any'}),input('slippage','Slippage · Basispunkte',definition.execution.slippageBps,{type:'number',min:'0',max:context.costs.maxSlippageBps,step:'any'})]),
 el('p',{class:'muted',text:'1 Basispunkt = 0,01 %. Kosten gelten beim Kauf und Verkauf. Entscheidungen werden frühestens am nächsten Handelszeitpunkt ausgeführt.'}),
 el('details',{},[el('summary',{text:'Konzentration & Handelbarkeit'}),el('div',{class:'strategy-grid'},[input('maxPosition','Maximales Positionsgewicht · %',definition.portfolio.maxPositionWeight*100,{type:'number',step:'any'}),input('maxSector','Maximales Sektorgewicht · %',definition.portfolio.maxSectorWeight*100,{type:'number',step:'any'}),input('minVolume','Mindest-Handelsvolumen · Mio. USD',definition.portfolio.minDollarVolumeM,{type:'number',step:'any'}),input('minCap','Mindest-Marktkapitalisierung · Mio. USD',definition.portfolio.minMarketCapM,{type:'number',step:'any'})])])]),
 input('reason','Grund der Änderung',saved?'':'Erster Entwurf',{maxlength:'500'}),status);
 function build(){for(const [key,control] of Object.entries(fields))if(control.type==='number'&&(!control.value.trim()||!Number.isFinite(Number(control.value))||!control.checkValidity()))throw Error('Bitte alle Zahlenfelder gültig ausfüllen.');const number=id=>Number(fields[id].value);return VUStrategy.assertValid(VUStrategy.createDefinition({...definition,ranking:{factors:context.factors.filter(f=>number(f)>0).map(f=>({factor:f,weight:number(f)/100}))},portfolio:{...definition.portfolio,positions:number('positions'),weighting:fields.weighting.value,maxPositionWeight:number('maxPosition')/100,maxSectorWeight:number('maxSector')/100,minDollarVolumeM:number('minVolume'),minMarketCapM:number('minCap')},rebalance:fields.rebalance.value,execution:{timing:fields.timing.value,transactionCostsBps:number('cost'),slippageBps:number('slippage')}}));}
 const save=el('button',{class:'button',text:'Version speichern',onclick:()=>{try{const next=VUStrategyWorkspace.save(localStorage,{name:fields.name.value,definition:build(),reason:fields.reason.value});saved=next;history.textContent=JSON.stringify(next,null,2);fields.name.readOnly=true;S.mount(status,notice('Version '+next.strategy.latestVersion+' gespeichert','Dieser Entwurf liegt nur in diesem Browser. Vorherige Versionen bleiben erhalten.'));fields.reason.value='';}catch(e){S.mount(status,notice('Entwurf nicht gespeichert',/identical/.test(e.message)?'Die Definition ist unverändert. Es wurde keine zusätzliche Version angelegt.':/changeReason/.test(e.message)?'Bitte begründe die Änderung, damit die Version nachvollziehbar bleibt.':'Prüfe Zahlen, Gewichtungen und den Änderungsgrund. Faktoranteile müssen 100 % ergeben; Positionszahl und Konzentrationsgrenzen müssen zusammenpassen. Auch gesperrter Browserspeicher verhindert das Speichern.'));}}});
 const inspect=el('button',{class:'button secondary',text:'Aktuelle Kriterien prüfen',onclick:async()=>{try{const def=build(),query=VUScreenerWorkspace.build(def.filters),result=await api.screen(query);if(result.state!=='AVAILABLE')throw Error('SOURCE_UNAVAILABLE');S.mount(preview,el('div',{},[el('h2',{text:'Aktuelle Kriterien-Auswahl'}),el('p',{text:'Nur die Filter im freigegebenen Analysebereich. Kein historisches Ergebnis, kein Ranking und keine Portfolio-Zuteilung.'}),stockRows(result.stocks||[])]));}catch(e){S.mount(preview,notice('Auswahl noch nicht auswertbar','Prüfe die Definition und die unterstützten Screener-Kriterien.'));}}});
 fields.name.readOnly=!!saved;
 main.append(el('div',{class:'actions'},[save,inspect]),preview,el('section',{class:'section'},[el('h2',{text:'Vor einem historischen Test'}),el('p',{text:'Ein echter Backtest ist für diese Vorschau noch nicht freigegeben. Diese Prüfungen müssen gemeinsam bestanden sein:'}),...context.backtest.checks.map(([title,text])=>el('div',{class:'trust-row'},[el('strong',{text:title}),el('p',{class:'muted',text})]))]),el('details',{},[el('summary',{text:'Gespeicherte Versionen & Definition'}),history]),actions([{label:'Vollständiger Strategy Builder',href:'/quant/strategies/builder/'},{label:'Bestehende Backtest-Umgebung',href:'/quant/backtests/'}]));
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
 }else open.append(notice('Kein Wert für diesen Faktor',factor.reasonText));
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
const SETUP_LABELS={NO_SETUP:'Nichts zu sehen',WATCH:'Beobachten',SETUP_FORMING:'Bildet sich',CONFIRMED:'Bestätigt',ACTIVE:'Aktiv',RISK_RISING:'Risiko steigt',INVALIDATED:'Ungültig',EXIT:'Ausstieg'};
const SETUP_CLOSED={SETUP_MAPPING_NOT_APPROVED:'Die Setup-Methodik ist geschrieben und nachrechenbar, aber noch nicht freigegeben. Bis dahin wird kein Lebenszyklus-Zustand behauptet.',
 SETUP_OBSERVATION_HISTORY_NOT_MATERIALIZED:'Für diesen Titel ist noch keine frühere Beobachtung veröffentlicht. "Wurde bestätigt" oder "wurde ungültig" sind Aussagen über einen Verlauf und lassen sich aus einem einzigen Stichtag nicht gewinnen.',
 INSUFFICIENT_OBSERVATION_HISTORY:'Es liegt noch nicht genug geordnete Beobachtungshistorie vor, um einen Verlauf zu belegen.',
 SETUP_INPUTS_INCOMPLETE:'Für diesen Titel fehlt ein Teil der technischen Evidenz, die die Methodik verlangt. Deshalb steht hier kein Zustand - auch nicht "kein Setup".'};
function setupCondition(condition){
 const demand=Array.isArray(condition.demand)?condition.demand.join(' oder '):condition.demand;
 const value=condition.value===null||condition.value===undefined?'nicht verfügbar':String(condition.value);
 return el('li',{class:'setup-condition '+(condition.met?'is-met':'is-open')},[
  el('span',{class:'setup-mark','aria-hidden':'true',text:condition.met?'✓':'○'}),
  el('div',{},[el('span',{text:condition.label||condition.field||condition.input}),
   el('span',{class:'muted',text:'Wert '+value+' · verlangt '+(condition.operator||'')+' '+demand})])]);
}
function setupJourney(setup,observation){
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
 const section=el('section',{class:'section setup-section'},[
  el('span',{class:'eyebrow',text:'Setup'}),el('h2',{text:'Entsteht gerade eine Situation?'}),
  el('ol',{class:'setup-journey','aria-label':'Setup-Zustände'},steps.map(state=>el('li',{class:'setup-step'+(active===state?' is-active':'')+(classification&&classification.state===state?' is-observed':'')},[
   el('span',{class:'setup-dot','aria-hidden':'true'}),el('span',{text:SETUP_LABELS[state]||state})])))]);
 if(!available){
  section.append(notice('Für diesen Titel liegt keine Setup-Beobachtung vor',
   'Die Setup-Beobachtung wird aus der bestehenden technischen Materialisierung gebildet. Dieser Titel ist darin nicht enthalten, deshalb wird hier kein Zustand behauptet.'));
  return section;
 }
 if(classification.state&&classification.state!=='UNAVAILABLE'){
  section.append(el('p',{class:'setup-classification'},[
   el('span',{class:'setup-badge state-'+classification.state,text:SETUP_LABELS[classification.state]||classification.state}),
   el('span',{class:'muted',text:'Beobachtung am '+observation.asOf+' · '+observation.matchedRule.plain})]));
 }else{
  section.append(notice('Nicht bewertbar',SETUP_CLOSED[classification.reason]||'Die Methodik verlangt Evidenz, die für diesen Titel nicht vollständig vorliegt.'));
 }
 if(!active)section.append(notice('Es wird kein Lebenszyklus-Zustand behauptet',
  SETUP_CLOSED[lifecycle.availability.reason]||'Der Lebenszyklus bleibt geschlossen.'));
 const conditions=observation.conditions||[];
 const met=conditions.filter(c=>c.met).length;
 if(conditions.length){
  section.append(el('p',{class:'setup-count',text:met+' von '+conditions.length+' Bedingungen dieser Regel erfüllt'}),
   el('ul',{class:'setup-conditions'},conditions.map(setupCondition)),
   el('p',{class:'muted',text:'Regel '+observation.matchedRule.ruleId+' · Methodik '+observation.mappingVersion+'. Dieselbe Regel ist als Screener-Abfrage formuliert; sie beschreibt einen Zustand und ist weder Einstiegsregel noch historisch getesteter Auslöser.'}));
 }
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
  body.push(notice('Für diesen Titel nicht auswertbar',{
   INSUFFICIENT_MEASURABLE_WEIGHT:'Zu viele Bedingungen dieses Profils sind für diesen Titel nicht messbar. Aus dem Rest wird keine Übereinstimmung gebildet.',
   INSUFFICIENT_MEASURABLE_CONDITIONS:'Es sind zu wenige Bedingungen messbar, um eine Übereinstimmung zu bilden.',
   NO_EVIDENCE:'Für diesen Titel liegt keine Quant-V2-Faktorevidenz vor.'
  }[profile.reason]||'Die Bedingungen dieses Profils sind derzeit nicht auswertbar.'));
 }
 body.push(el('ul',{class:'match-conditions'},profile.conditions.map(conditionRow)));
 if(profile.mainRisk)body.push(el('p',{class:'muted match-risk',text:'Hauptrisiko: '+profile.mainRisk}));
 body.push(el('p',{class:'muted match-evidence',text:'Historische Evidenz: nicht verfügbar. Wie dieses Profil in der Vergangenheit funktioniert hätte, ist ein Backtest und bleibt geschlossen, bis Universum, Kapitalmaßnahmen und Ausführungsmethodik zertifiziert sind.'}));
 /* Dieselbe Regel, die das Profil erklärt, selektiert auch. */
 if(profile.screenHref)body.push(link('Alle Titel mit diesem Profil zeigen',profile.screenHref,'button secondary'));
 return el('article',{class:'match-card'+(profile.state==='AVAILABLE'?'':' is-missing')},[head,...body]);
}
function strategyMatchSection(match){
 const section=el('section',{class:'section match-section'},[
  el('span',{class:'eyebrow',text:'Strategy Match'}),
  el('h2',{text:'Zu welchem Anlagestil passt dieser Titel?'})]);
 if(!match||match.state!=='AVAILABLE'){
  section.append(notice('Strategy Match derzeit nicht verfügbar',
   match?.reason==='NOT_COVERED_BY_FACTOR_EVIDENCE'
    ?'Für diesen Titel liegt keine Quant-V2-Faktorevidenz vor, gegen die Profile geprüft werden könnten.'
    :'Die Profile oder die Faktorevidenz konnten nicht geladen oder nicht geprüft werden. Es werden keine Ersatzprofile gebildet.'));
  return section;
 }
 const ordered=[...match.profiles].sort((a,b)=>(b.state==='AVAILABLE'?b.match:-1)-(a.state==='AVAILABLE'?a.match:-1));
 section.append(
  el('p',{class:'muted',text:'Jedes Profil ist ein Satz fester Bedingungen an die Quant-V2-Faktorevidenz. Die Übereinstimmung zählt, wie viele der messbaren Bedingungen dieser Titel erfüllt — sie ist kein Rang, keine Erfolgswahrscheinlichkeit und keine Renditeaussage.'}),
  el('div',{class:'match-grid'},ordered.map(matchCard)),
  el('details',{},[el('summary',{text:'Methodik & Grenzen'}),
   el('p',{text:'Evidenz: '+match.evidenceNamespace+' · '+match.evidenceMethodologyVersion+'. Profile: '+match.methodologyVersion+'. Quant V1 bleibt unverändert und wird hier nicht gelesen.'}),
   el('p',{text:'Die Schwellen beschreiben, ab welcher Position eine Eigenschaft für ein Profil als erfüllt gilt. Sie sind für jeden Titel gleich und nicht gegen historische Ergebnisse optimiert.'}),
   el('p',{class:'muted',text:'Eine Bedingung ohne Faktorwert zählt weder als erfüllt noch als verletzt; sie verlässt den Nenner und steht als „nicht messbar“ in der Liste.'})]));
 return section;
}
async function quantPage(ticker){
 const [data,match,profileContract,observation]=await Promise.all([api.getFactorEvidence(ticker),api.getStrategyMatch(ticker).catch(()=>null),api.getStrategyProfiles().catch(()=>null),api.getSetupObservation(ticker).catch(()=>null)]);
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
 const setup=VUSetupStateContract.AVAILABLE_OBSERVATIONS_ALLOWED?(await api.getStockIntelligence(ticker).catch(()=>null))?.setupState||null:null;
 if(data.state!=='AVAILABLE'){
  main.append(heading('Quant-Analyse',ticker));
  main.append(notice('Für diesen Titel liegt keine Faktor-Evidenz vor',data.reason==='NOT_COVERED_BY_FACTOR_EVIDENCE'?'Dieser Titel gehört zum Produktuniversum, erfüllt aber die Datenanforderungen der Faktor-Methodik derzeit nicht. Es werden keine Ersatzwerte gebildet.':data.reason==='NOT_IN_PRODUCT_UNIVERSE'?'Dieser Titel ist im kanonischen Produktuniversum nicht enthalten.':'Die Faktor-Evidenz konnte nicht geladen oder nicht geprüft werden.'),
   actions([{label:'Was ist Quant?',href:href('explain')},{label:'Aktie untersuchen',href:href('stock',ticker)},{label:'Bestehender Quant Workspace',href:'/quant/ranking/'}]));
  return;
 }
 const rated=data.factors.filter(f=>f.state==='AVAILABLE');
 /* HERO: Name, Zustand, ein Satz - keine zwanzig Kennzahlen. */
 main.append(el('section',{class:'quant-hero'},[
  el('span',{class:'eyebrow',text:'Vision Universe® Quant'}),
  el('h1',{text:data.name}),
  el('p',{class:'quant-ticker',text:data.ticker+(data.peer?.industry?' · Branchenschlüssel '+data.peer.industry:'')}),
  el('div',{class:'quant-chips'},[
   el('span',{class:'chip',text:rated.length+' von 7 Faktoren bewertet'}),
   el('span',{class:'chip chip-muted',text:'Kein Gesamtscore veröffentlicht'}),
   el('span',{class:'chip chip-muted',text:'Kursstand '+data.asOf})]),
  el('p',{class:'quant-summary',text:data.summary}),
  el('p',{class:'quant-change',text:data.changeHeadline})]));
 const company=el('select',{'aria-label':'Quant Unternehmen'},universe.stocks.map(s=>el('option',{value:s.ticker,text:s.ticker+' · '+s.name})));
 if(!universe.stocks.some(s=>s.ticker===data.ticker))company.append(el('option',{value:data.ticker,text:data.ticker+' · '+data.name}));
 company.value=data.ticker;company.onchange=()=>location.assign(href('quant',company.value));
 main.append(el('div',{class:'workspace-controls'},[company,link('Was ist Quant?',href('explain'),'button secondary')]));
 /* FACTOR DNA */
 main.append(el('section',{class:'section dna-section'},[
  el('span',{class:'eyebrow',text:'Factor DNA'}),
  el('h2',{text:'Wie stark ist dieses Unternehmen — und warum?'}),
  el('p',{class:'muted',text:'Sieben feste Eigenschaften, immer in derselben Reihenfolge. Jede zeigt ihre Position im Vergleich zu anderen Unternehmen. Tippe auf eine Eigenschaft, um ihre Belege zu sehen.'}),
  el('div',{class:'dna-list'},data.factors.map(factorRow)),
  el('p',{class:'muted',text:'Ein Gesamtscore wird bewusst nicht gebildet: '+(data.composite?.reason==='QUANT_V2_NOT_ACTIVE'?'die Methodik verlangt alle sieben Faktoren, und der Erwartungstrend fehlt ohne lizenzierte Datenquelle.':'die Methodik ist noch nicht freigegeben.')})]));
 /* CHANGE */
 const change=data.change,grouped=[['IMPROVING','Verbessert sich'],['DETERIORATING','Verschlechtert sich'],['STABLE','Weitgehend unverändert']];
 const changeSection=el('section',{class:'section change-section'},[
  el('span',{class:'eyebrow',text:'Veränderung'}),
  el('h2',{text:'Was verändert sich gerade?'}),
  el('p',{class:'muted',text:'Gemessen werden beobachtbare Größen, nicht die Faktorwerte selbst. Ein Verlauf der Faktorwerte benötigt eine Historie veröffentlichter Snapshots und wird nicht rückwirkend nachgebildet.'})]);
 for(const [direction,label] of grouped){
  const entries=change.items.filter(x=>x.state==='AVAILABLE'&&x.direction===direction);
  if(!entries.length)continue;
  changeSection.append(el('h3',{class:'change-group',text:label}),el('div',{class:'change-grid'},entries.map(changeCard)));
 }
 const missing=change.items.filter(x=>x.state!=='AVAILABLE');
 if(missing.length)changeSection.append(el('details',{class:'change-missing'},[el('summary',{text:missing.length+' Bereiche sind derzeit nicht messbar'}),...missing.map(x=>el('p',{},[el('strong',{text:x.label+': '}),el('span',{class:'muted',text:x.reasonText})]))]));
 main.append(changeSection);
 /* SETUP */
 main.append(strategyMatchSection(match));
 main.append(setupJourney(setup,observation));
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
 main.append(el('section',{class:'quant-hero explain-hero'},[
  el('span',{class:'eyebrow',text:'Vision Universe® Quant'}),
  el('h1',{text:'Was ist Quant?'}),
  el('p',{class:'quant-summary',text:'Quant bedeutet: Aktien werden nach festen Daten und klaren Regeln analysiert — statt nach Bauchgefühl.'}),
  el('p',{class:'muted',text:'Jede Aussage hier lässt sich auf eine Zahl, einen Zeitraum und eine Quelle zurückführen. Wo eine Zahl fehlt, steht der Grund und kein Ersatzwert.'})]));
 main.append(el('section',{class:'section'},[
  el('h2',{text:'Wozu das gut ist'}),
  el('div',{class:'explain-grid'},[
   ['Dein Broker beantwortet','Was kostet die Aktie? Wie kaufe ich sie? Was besitze ich?'],
   ['Vision Universe beantwortet','Welche Aktie ist interessant? Warum? Was verändert sich gerade? Wo liegt das Risiko?']
  ].map(([title,text])=>el('article',{class:'explain-card'},[el('h3',{text:title}),el('p',{text})])))]));
 main.append(el('section',{class:'section'},[
  el('h2',{text:'Die sieben Eigenschaften'}),
  el('p',{class:'muted',text:'Jedes Unternehmen wird an denselben sieben Eigenschaften gemessen. Immer in dieser Reihenfolge.'}),
  el('div',{class:'explain-factors'},VUFactorEvidence.FACTOR_ORDER.map(id=>{const m=VUFactorEvidence.FACTOR_MEANING[id];return el('article',{class:'explain-factor'},[el('h3',{text:m.label}),el('p',{class:'explain-question',text:m.question}),el('p',{text:m.plain}),el('p',{class:'muted',text:m.higherMeans})]);}))]));
 main.append(el('section',{class:'section'},[
  el('h2',{text:'Wie eine Position entsteht'}),
  el('ol',{class:'explain-steps'},[
   'Für jede Eigenschaft werden mehrere Einzelkennzahlen aus geprüften Quellen berechnet.',
   'Extreme Ausreißer werden an den Rändern gekappt, damit ein einzelner Sonderfall nicht das ganze Bild verschiebt.',
   'Jede Kennzahl wird mit allen anderen Unternehmen verglichen — bevorzugt innerhalb derselben Branche.',
   'Aus diesen Vergleichen entsteht eine Position zwischen 0 und 100. 50 bedeutet Mittelfeld.',
   'Fehlt eine Kennzahl, bleibt sie fehlend. Sie wird nicht geschätzt und ihr Gewicht wandert nicht zu einer anderen.'
  ].map(text=>el('li',{text})))]));
 main.append(el('section',{class:'section'},[
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
async function screenPage(){
 main.append(heading('Aus einer Idee wird deine Auswahl','Kombiniere Geschäftsentwicklung und Kursstruktur. Alle Kriterien müssen gleichzeitig erfüllt sein.'));
 const editor=VUScreenerWorkspace,recipe=api.getRecipes().find(r=>r.id===params.get('recipe'));
 let initial=recipe?.query||editor.build([{field:'momentum6m',operator:'gte',value:0,scale:'raw'}]),invalidLink=false;
 try{if(params.has('recipe')&&!recipe)throw Error('unknown recipe');if(params.has('query'))initial=editor.decode(params.get('query'));else if(params.has('field')||params.has('threshold'))initial=editor.build([{field:params.get('field')||'momentum6m',operator:'gte',value:Number(params.get('threshold')||0),scale:'raw'}]);}catch{invalidLink=true;main.append(notice('Gespeicherte Regeln konnten nicht geöffnet werden','Die Abfrage enthält ungültige oder in diesem Editor nicht unterstützte Kriterien. Es wurden keine Ersatzregeln ausgeführt. Erstelle hier eine neue Auswahl oder öffne den vollständigen Screener.'));}
 if(recipe)main.append(el('p',{class:'scope-note',text:'Aus Discover: '+recipe.title+'. Alle Kriterien bleiben veränderbar.'}));
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
 const apply=async()=>{const current=++request;try{
  const filters=rows.map(r=>{const def=fieldsOfCurrent().find(f=>f.id===r.field.value),raw=r.value.value;if(!String(raw).trim())throw Error('invalid');const value=def.type==='number'?Number(raw):raw;if(def.type==='number'&&!Number.isFinite(value))throw Error('invalid');return {field:r.field.value,operator:r.op.value,value,scale:'raw'};});
  const query=editor.build(filters,[{field:sort.value,direction:direction.value}]);const result=await api.screen(query);if(current!==request)return;S.clear(out);
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
 }catch{if(current===request){share.hidden=true;strategyLink.hidden=true;method.textContent='';S.mount(out,notice('Kriterium prüfen','Gib für jedes Kriterium einen gültigen Wert ein. Die Regeln wurden nicht angewendet.'));}}};
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
 main.append(el('div',{class:'filter screener-method'},[el('label',{},[el('span',{text:'Methodik'}),methodSelect]),el('label',{},[el('span',{text:'Strategie-Profil'}),profiles]),methodNote]),ruleList,el('div',{class:'actions'},[el('button',{class:'button secondary',text:'Kriterium hinzufügen',onclick:()=>addRule()}),el('button',{class:'button',text:'Anwenden',onclick:apply})]),el('div',{class:'filter'},[el('span',{text:'Ergebnisse sortieren'}),sort,direction]),out,el('details',{},[el('summary',{text:'Regeln speichern & Methodik'}),el('p',{text:'Der Link enthält ausschließlich die Regeln. Ergebnisse werden beim Öffnen mit dem dann verfügbaren Datenstand neu berechnet. Keine historische Simulation.'}),share,strategyLink,el('p',{class:'muted',text:'Die bestehende Query Engine prüft dieselben Kriterien wie im professionellen Screener. Die Vorschau bleibt auf den bestehenden Analysebereich begrenzt.'}),method]),actions([{label:'Vollständigen Screener öffnen',href:'/quant/screener/'}]));
 sort.onchange=direction.onchange=apply;ruleList.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();apply();}});if(!invalidLink)await apply();else share.hidden=true;
}
function recover(title,description,retry=false){S.clear(main);main.append(heading(title,description),actions([...(retry?[{label:'Erneut versuchen',href:location.pathname+location.search}]:[]),{label:'Research öffnen',href:href('research')},{label:'Zur Startseite',href:href('home')}]),el('footer',{class:'footer',text:'Vision Universe® · Entwicklungsvorschau'}));}
async function render(){if(!new Set([...nav.map(([id])=>id),'stocks','stock','technical','elliott','quant','fundamentals','screener','compare','watchlist','signals','radar','atlas','explain']).has(view)){recover('Diese Ansicht wurde nicht gefunden','Öffne einen verfügbaren Workspace über Research oder kehre zur Startseite zurück.');return;}universe=view==='home'||view==='stock'?{state:'AVAILABLE',stocks:[]} : await api.getUniverse();
 if(view==='home')await homePage();
 else if(view==='stock')await stockPage(params.get('ticker')||'NVDA');
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
 else if(view==='stocks'){const measured=universe.productCapabilityState==='AVAILABLE',total=measured?Number(universe.productUniverseSize):universe.stocks.length,counts=universe.capabilityCounts||{};main.append(heading('Unternehmen untersuchen',measured?total.toLocaleString('de-DE')+' kanonische Produkttitel sind über die Suche erreichbar. Die Intelligence wird je Titel nach vorhandenen Capabilities angezeigt.':universe.stocks.length+' kanonische Intelligence-Titel sind verfügbar.'),notice(measured?'Capability-gesteuerte Abdeckung':'Breitenmessung derzeit nicht verfügbar',measured?(Number(counts.fundamentals)||0).toLocaleString('de-DE')+' mit Fundamentals · '+(Number(counts.historicalAvailable)||0).toLocaleString('de-DE')+' mit Kurshistorie · '+(Number(counts.factorEligible)||0).toLocaleString('de-DE')+' mit Markt-Faktorzeile. Quant-V2-Rang und Markt-Regime bleiben bis zur Zertifizierung geschlossen.':'Es wird keine Produktbreite aus einer fehlenden oder ungültigen Capability-Datei abgeleitet.'),el('div',{class:'section'},[el('h2',{text:'Kanonische Produkttitel'}),stockRows(universe.stocks.slice(0,100))]));}
 else {main.append(heading(view==='markets'?'Märkte verstehen':'Das Wichtigste im Blick','Daten einordnen. Zusammenhänge erkennen. Weiterforschen.'));const focus=universe.stocks.find(s=>s.ticker==='NVDA'),measured=universe.productCapabilityState==='AVAILABLE',productCount=measured?Number(universe.productUniverseSize):universe.stocks.length;const left=el('section',{},[notice('Gesamtmarkt noch nicht eingeordnet',measured?productCount.toLocaleString('de-DE')+' Produkttitel sind identifiziert und capability-geprüft; '+universe.stocks.length+' davon besitzen die vollständig verbundene Intelligence-Ansicht. Ein Marktregime oder breiter Rang wird daraus noch nicht behauptet.':universe.stocks.length+' vollständig verbundene Intelligence-Titel bleiben nutzbar; die Breitenmessung ist derzeit nicht verfügbar und wird nicht geschätzt.'),el('div',{class:'section'},[el('h2',{text:'Unternehmen im Blick'}),stockRows(universe.stocks.slice(0,100))])]);const right=el('aside',{},[el('span',{class:'eyebrow',text:'Analyse vertiefen'}),el('h2',{text:focus?'NVIDIA':'Research'}),el('p',{class:'muted',text:'Wie entwickeln sich Geschäft und Kurs? Die Aktienanalyse verbindet Kennzahlen mit ihren Quellen.'}),focus?evidence(focus):null,link('Aktie untersuchen',href('stock','NVDA'),'button'),el('div',{class:'section links'},[link('Ideen entdecken',href('discover')),link('Makro-Zusammenhänge','/macro/'),link('Morning Briefing','/morning/'),link('News im Kontext','/news/'),link('Ask Atlas',href('atlas'))])]);main.append(el('div',{class:'layout'},[left,right]));}
 const footerQuote=view==='stock'?universe.stocks.find(s=>s.ticker===(params.get('ticker')||'NVDA').toUpperCase()):universe.stocks[0];
 main.append(el('footer',{class:'footer',text:'Vision Universe® · Entwicklungsvorschau · Bestehender freigegebener Analysebereich. '+(view==='stock'?'Historische Kennzahlen: EOD. Intraday und Live nennen ihren Stand separat. ':'Kurse: letzter verfügbarer EOD-Stand, nicht realtime. ')+(footerQuote?.asOf?'Kursstand: '+footerQuote.asOf+'. ':'')+'Keine Anlageempfehlung.'}));
}
render().catch(()=>recover('Ansicht derzeit nicht verfügbar','Die Ansicht konnte nicht vollständig geladen werden. Versuche es erneut oder öffne einen anderen Workspace.',true));
})();
