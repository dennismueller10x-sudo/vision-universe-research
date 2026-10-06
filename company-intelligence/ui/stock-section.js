/* Shared, disposable Discover/Quant chapter. Uses prepared data; no producer/chart changes. */
(function(g){
'use strict';
const labels={revenue:'Umsatz',eps_diluted:'Gewinn je Aktie (verwässert)',gross_margin:'Bruttomarge',operating_margin:'Operative Marge',free_cash_flow:'Freier Cashflow',net_income:'Nettogewinn',revenue_growth:'Umsatzwachstum',shares_outstanding:'Aktienanzahl',total_debt:'Schulden',cash_and_equivalents:'Liquide Mittel'};
const secLabels={'1.01':'Wesentliche Vereinbarung','1.02':'Vereinbarung beendet','1.03':'Insolvenz / Zwangsverwaltung','2.01':'Akquisition oder Veräußerung','2.03':'Neue finanzielle Verpflichtung','2.04':'Änderung finanzieller Verpflichtungen','2.05':'Restrukturierung','2.06':'Wesentliche Wertminderung','3.01':'Hinweis zur Börsenzulassung','3.02':'Aktienemission','3.03':'Änderung der Aktionärsrechte','4.01':'Wechsel des Wirtschaftsprüfers','4.02':'Hinweis zu früheren Abschlüssen','5.02':'Management, Vorstand oder Vergütung'};
const materialNames={PRESENTATION:'Präsentation',FINANCIAL_REPORT:'Finanzbericht',WEBCAST:'Webcast',REPLAY:'Aufzeichnung',CALL_RECORDING:'Aufzeichnung',COMPANY_TRANSCRIPT:'Unternehmenstranskript',PREPARED_REMARKS:'Vorbereitete Management-Aussagen',SHAREHOLDER_LETTER:'Aktionärsbrief',MANAGEMENT_COMMENTARY:'Management-Kommentar',EARNINGS_WEBCAST:'Ergebnis-Webcast',EARNINGS_RELEASE:'Ergebnisveröffentlichung',SEC_EARNINGS_EXHIBIT:'Ergebnisveröffentlichung',SEC_PRIMARY_DOCUMENT:'Originalbericht',SEC_FACT_FILING_REFERENCE:'Quelle der Geschäftszahlen'};
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
function number(value,unit){
 if(typeof value!=='number'||!Number.isFinite(value))return 'Nicht verfügbar';
 const n=new Intl.NumberFormat('de-DE',{notation:Math.abs(value)>=1e6?'compact':'standard',maximumFractionDigits:2}).format(value);
 return n+(unit==='percent'?' %':unit==='percentage_points'?' Prozentpunkte':unit==='shares'?' Aktien':unit?.endsWith('/shares')?' '+unit.split('/')[0]:unit?' '+unit:'');
}
function day(value,zone='UTC'){
 if(!value)return 'Datum nicht angegeben';
 const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(value),d=new Date(dateOnly?value+'T12:00:00Z':value);
 return Number.isFinite(d.valueOf())?new Intl.DateTimeFormat('de-DE',{day:'numeric',month:'short',year:'numeric',timeZone:dateOnly?'UTC':zone}).format(d):'Datum nicht angegeben';
}
function link(host,label,url){const safe=g.VUCompanyIntelligence.safeLink(url);if(!safe)return false;const a=node('a',label);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';host.append(a);return true;}
function block(host,title){const s=node('section',undefined,'ci-block');s.append(node('h3',title));host.append(s);return s;}
function gap(host,title,text){const p=node('p',undefined,'ci-gap');p.append(node('strong',title+': '),document.createTextNode(text));host.append(p);}
function details(host,title){const d=node('details',undefined,'ci-details');d.append(node('summary',title));host.append(d);return d;}
function period(value){return (value.fiscalQuarter==='FY'?'Geschäftsjahr':value.fiscalQuarter||'Berichtszeitraum')+(value.fiscalYear?' · Geschäftsjahr '+value.fiscalYear:'')+(value.reportingPeriod?' · Ende '+day(value.reportingPeriod):'');}
function knownDate(item){return item.publishedAt||item.date||null;}
function story(item){
 const n=node('article',undefined,'ci-story'),regulatory=item.eventType==='MATERIAL_SEC_EVENT';
 const title=['EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED'].includes(item.eventType)?(item.eventType==='EARNINGS_PUBLISHED'?'Geschäftszahlen veröffentlicht':'Finanzbericht veröffentlicht')+(item.fiscalQuarter&&item.fiscalYear?' · '+period(item):''):regulatory?(item.secItems||[]).map(code=>secLabels[code]||'Regulatorische Meldung').join(' · ')||'Regulatorische Meldung':item.headline||'Unternehmensmeldung';
 const p=node('p',title,'ci-headline');if(item.headline&&!regulatory&&item.eventType==='NEWS')p.lang=item.language||'en';n.append(p);
 const date=knownDate(item),ref=item.provenance?.[0],source=regulatory?'SEC':ref?.originalSource||ref?.sourceName||item.sourceName;
 n.append(node('p',(date?day(date):'Veröffentlichungsdatum nicht angegeben')+(source?' · '+source:'')+(regulatory?' · Regulatorische Meldung':''),'ci-meta'));
 link(n,'Originalquelle öffnen',item.canonicalUrl||item.earningsReleaseUrl||item.sourceUrl);
 return n;
}
function activeEvent(e,now,today){
 if(['CANCELLED','CANCELED','WITHDRAWN','POSTPONED'].includes(e.eventStatus)||['CANCELLED','CANCELED'].includes(e.status))return false;
 if(e.startsAt)return Number.isFinite(Date.parse(e.startsAt))&&Date.parse(e.startsAt)>=now;
 return (e.dateEnd||e.date||e.dateStart||'')>=today;
}
function eventRow(e){
 const n=node('article',undefined,'ci-story'),estimated=e.confirmationStatus==='ESTIMATED';
 const kind=e.eventType==='EARNINGS_CALL'?'Ergebnisgespräch (Earnings Call)':e.eventType==='EARNINGS_SCHEDULED'?'Ergebnisveröffentlichung':e.eventType==='EARNINGS_ESTIMATED'?'Geschätzter Berichtszeitraum':'Investorenveranstaltung';
 n.append(node('p',kind,'ci-headline'));
 if(estimated)n.append(node('p',day(e.dateStart)+' – '+day(e.dateEnd)+' · Geschätzt'),node('p','Zeitfenster aus früheren Berichten. Kein bestätigter Termin und keine Vorhersage eines Veröffentlichungstags.','ci-meta'));
 else{
  n.append(node('p',day(e.startsAt||e.date,e.startsAt?'Europe/Berlin':'UTC')+' · Bestätigt'));
  if(e.startsAt)n.append(node('p',new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(e.startsAt))+' (Berlin)','ci-meta'));
  else n.append(node('p','Uhrzeit nicht angegeben.','ci-meta'));
  link(n,'Ankündigung',e.sourceUrl);if(e.webcastUrl)link(n,'Webcast öffnen',e.webcastUrl);
 }
 return n;
}
function render(host,payload){
 host.replaceChildren(node('p','Company Intelligence','dv2-detail-eyebrow'),node('h2','Unternehmensüberblick'));
 if(payload.state!=='AVAILABLE'){host.append(node('p','Unternehmensmeldungen sind derzeit nicht verfügbar. Bitte später erneut versuchen.','ci-meta'));return;}
 const now=Date.now(),today=new Date(now).toISOString().slice(0,10),cutoff=new Date(now-30*86400000).toISOString().slice(0,10);
 const status=node('p',(payload.preview?'Vorschau · ':'')+'Daten aufbereitet am '+day(payload.generatedAt)+' · Abdeckung je Unternehmen unterschiedlich.','ci-meta');host.append(status);
 if(payload.previewBasis==='CATALOGUE_AND_EXISTING_FACTS')host.append(node('p','Diese Vorschau enthält geprüfte Beschreibungen und vorhandene Geschäftszahlen. Der erweiterte Nachrichten- und Terminbestand ist hier noch nicht verfügbar.','ci-warning'));
 if(payload.stale)host.append(node('p','Älterer Datenstand. Neue Meldungen können fehlen.','ci-warning'));
 const profile=payload.companyProfile;
 if(profile?.state==='AVAILABLE'&&profile.companyId===payload.companyId&&profile.language==='de'){
  const s=block(host,'Unternehmen'),p=node('p',profile.description,'ci-profile');p.lang='de';s.append(p);link(s,'Unternehmenswebsite',profile.officialWebsite);
  for(const source of profile.sources||[])link(s,source.type==='SEC'?'Quelle: Jahresbericht'+(source.filedAt?' vom '+day(source.filedAt):''):'Quelle: Unternehmen',source.url);
  if(profile.stale)s.append(node('p','Ältere Unternehmensbeschreibung. Das heutige Angebot kann abweichen.','ci-warning'));
 }else gap(host,'Unternehmen','Eine ausreichend belegte deutsche Beschreibung ist noch nicht verfügbar.');
 // Publication dates only; observation times never make an old story current.
 const seen=new Set(),stories=[...(payload.news||[]),...(payload.materialEvents||[]).filter(e=>['HIGH','CRITICAL'].includes(e.importance)),...(payload.earnings||[]).filter(e=>!e.isAmendment&&['EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED'].includes(e.eventType))]
  .filter(e=>{const key=g.VUCompanyIntelligence.safeLink(e.canonicalUrl||e.earningsReleaseUrl||e.sourceUrl)||e.newsId||e.eventId;if(!key||seen.has(key))return false;seen.add(key);return true;})
  .sort((a,b)=>(knownDate(b)||'').localeCompare(knownDate(a)||''));
 const current=stories.filter(e=>knownDate(e)&&knownDate(e).slice(0,10)>=cutoff&&Date.parse(knownDate(e))<=now);
 const older=stories.filter(e=>!current.includes(e)&&(!knownDate(e)||Date.parse(knownDate(e))<=now));
 if(stories.length){const s=block(host,'Neuigkeiten');if(current.length)for(const e of current.slice(0,5))s.append(story(e));else s.append(node('p','Keine Meldungen mit bekanntem Veröffentlichungsdatum aus den letzten 30 Tagen vorhanden.','ci-meta'));if(older.length){const d=details(s,'Ältere Meldungen und Meldungen ohne Datum');for(const e of older.slice(0,5))d.append(story(e));}}else gap(host,'Neuigkeiten','Im verfügbaren Datenstand sind keine Meldungen enthalten.');
 const f=payload.latestFinancials,metrics=['revenue','eps_diluted','gross_margin','operating_margin','free_cash_flow','net_income','cash_and_equivalents','total_debt'].filter(k=>Number.isFinite(f?.metrics?.[k]?.current?.value)).slice(0,5);
 if(f?.state==='AVAILABLE'&&metrics.length){
  const s=block(host,'Letzte Geschäftszahlen');s.append(node('p',period(f),'ci-headline'));
  if(!metrics.some(k=>!['cash_and_equivalents','total_debt'].includes(k)))s.append(node('p','Nur Bilanzwerte verfügbar. Geprüfte Umsatz- und Ergebniszahlen fehlen für diesen Berichtszeitraum.','ci-meta'));
  if(f.stale)s.append(node('p','Veraltete Geschäftszahlen. Neuere Berichte sind in diesem Datenstand nicht enthalten.','ci-warning'));
  s.append(node('p','Stand der zugrunde liegenden Zahlen: '+day(f.sourceAsOf)+'. Nachträglich aktualisierte Zahlen; kein historischer Echtzeitstand.','ci-meta'));
  const grid=node('div',undefined,'ci-values');for(const name of metrics){const m=f.metrics[name],n=node('div',undefined,'ci-value');n.append(node('span',labels[name]),node('b',number(m.current.value,m.current.unit)));
   if(Number.isFinite(m.changePercentagePoints))n.append(node('small',number(m.changePercentagePoints,'percentage_points')+' zum Vorjahresquartal'));
   else if(Number.isFinite(m.yoy?.percent))n.append(node('small',number(m.yoy.percent,'percent')+' zum '+(f.fiscalQuarter==='FY'?'Vorjahr':'Vorjahresquartal')));
   else n.append(node('small','Kein belastbarer Vorjahresvergleich'));grid.append(n);
  }s.append(grid);
  const changes=(f.whatChanged||[]).filter(c=>labels[c.metric]&&Number.isFinite(c.previous)&&Number.isFinite(c.current)).slice(0,5);
  if(changes.length){const d=details(s,'Veränderungen und Vergleichsbasis');for(const c of changes){const basis=c.comparison==='PREVIOUS_QUARTER_YOY_GROWTH'?'Wachstumsrate des Vorquartals':c.comparison==='PREVIOUS_YEAR'?'Vorjahr':'Vorjahresquartal';d.append(node('p',labels[c.metric]+': '+number(c.previous,c.unit==='percentage_points'?'percent':c.unit)+' → '+number(c.current,c.unit==='percentage_points'?'percent':c.unit)+' · '+basis));}}
 }else gap(host,'Letzte Geschäftszahlen','Für diesen Titel liegen keine ausreichend geprüften Geschäftszahlen vor.');
 const upcoming=(payload.events||[]).filter(e=>activeEvent(e,now,today)&&['CONFIRMED','ESTIMATED'].includes(e.confirmationStatus)).sort((a,b)=>(a.startsAt||a.date||a.dateStart||'').localeCompare(b.startsAt||b.date||b.dateStart||''));
 const confirmed=upcoming.filter(e=>e.confirmationStatus==='CONFIRMED'),estimates=upcoming.filter(e=>e.confirmationStatus==='ESTIMATED');
 if(upcoming.length){const s=block(host,'Nächste Termine');if(!confirmed.length)s.append(node('p','Kein bestätigter kommender Termin vorhanden.','ci-meta'));for(const e of confirmed.slice(0,4))s.append(eventRow(e));for(const e of estimates.slice(0,1))s.append(eventRow(e));}else gap(host,'Nächste Termine','Kein bestätigter kommender Termin im verfügbaren Datenstand.');
 const documentsSeen=new Set(),groups=[];
 function documents(rows){return rows.filter(d=>{const url=g.VUCompanyIntelligence.safeLink(d.url);if(!url||documentsSeen.has(url))return false;documentsSeen.add(url);return true;});}
 for(const b of payload.earningsBundles||[]){const docs=documents(b.materials||[]);if(docs.length)groups.push({title:period(b),docs});}
 const calls=(payload.calls||[]).filter(e=>!activeEvent(e,now,today)&&!['CANCELLED','CANCELED','WITHDRAWN'].includes(e.eventStatus));
 for(const c of calls.slice(0,3)){const docs=documents([['webcastUrl','WEBCAST'],['replayUrl','REPLAY'],['transcriptUrl','COMPANY_TRANSCRIPT']].filter(([field])=>c[field]).map(([field,type])=>({url:c[field],type})));if(docs.length)groups.push({title:'Historisches Ergebnisgespräch · '+day(c.startsAt||c.date,c.startsAt?'Europe/Berlin':'UTC'),docs});}
 const remaining=documents([...(payload.materials||[]),...(payload.filings||[]).filter(f=>/^(?:10-[KQ]|20-F|40-F)$/.test(f.form||'')).map(f=>({url:f.sourceUrl,type:'FINANCIAL_REPORT',label:(f.form==='10-Q'?'Quartalsbericht':'Jahresbericht')+' · '+day(f.date)}))]);
 if(remaining.length)groups.push({title:'Weitere verfügbare Unterlagen',docs:remaining.slice(0,8)});
 if(groups.length){const s=block(host,'Berichte & Präsentationen');for(const group of groups.slice(0,5)){s.append(node('p',group.title,'ci-headline'));for(const d of group.docs){const name=d.type==='FINANCIAL_REPORT'&&['10-K','20-F','40-F'].includes(d.form)?'Jahresbericht':materialNames[d.type]||'Originalmaterial';link(s,name+(d.filedAt?' · eingereicht am '+day(d.filedAt):''),d.url);}if(group.docs.some(d=>d.publicationDateStatus==='NOT_PROVIDED'))s.append(node('p','Unterlagen aus dem Archiv; Veröffentlichungsdatum nicht angegeben.','ci-meta'));}if(groups.some(group=>group.docs.some(d=>['WEBCAST','EARNINGS_WEBCAST','SHAREHOLDER_LETTER','PREPARED_REMARKS'].includes(d.type))))s.append(node('p','Ein Webcast-Link bestätigt keine verfügbare Aufzeichnung. Ein Aktionärsbrief und vorbereitete Aussagen sind keine vollständigen Call-Transkripte.','ci-meta'));}else gap(host,'Berichte & Präsentationen','In diesem Datenstand sind keine belegten Unterlagen verknüpft.');
 const proof=details(host,'Datenstand und Quellenhinweise');proof.append(node('p','Aufbereitungsstand: '+day(payload.generatedAt)+'. Originalquellen können neuer sein. Nachrichten sind keine vollständige Marktberichterstattung.','ci-meta'));
 if(profile&&profile.language!=='de'){proof.append(node('p','Quellenbeschreibung (Englisch), noch nicht als deutsches Profil freigegeben:','ci-meta'));const p=node('p',profile.description);p.lang='en';proof.append(p);for(const source of profile.sources||[])link(proof,'Profilquelle',source.url);}
}
function mount(parent,ticker,options={}){
 const config=g.VUCompanyIntelligenceRollout;if(!config?.enabled(ticker,options))return function(){};
 const host=node('section',undefined,'dx-chapter ci-company-intelligence');host.setAttribute('aria-label','Company Intelligence');host.setAttribute('aria-busy','true');host.append(node('p','Unternehmensinformationen werden geladen …','ci-meta'));parent.append(host);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let disposed=false;
 g.VUCompanyIntelligence.load(ticker,{enabled:true,base:options.base||config.base,signal:controller.signal}).then(p=>{if(!disposed&&host.isConnected)render(host,p);}).catch(()=>{if(!disposed&&host.isConnected)render(host,{state:'UNAVAILABLE'});}).finally(()=>{clearTimeout(timeout);host.setAttribute('aria-busy','false');});
 return ()=>{disposed=true;clearTimeout(timeout);controller.abort();host.remove();};
}
g.VUCompanyIntelligenceStock={mount,render,number};
})(typeof globalThis!=='undefined'?globalThis:this);
