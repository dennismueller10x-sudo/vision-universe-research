/* Shared, disposable Discover/Quant chapter. Uses prepared data; no producer/chart changes. */
(function(g){
'use strict';
const labels={revenue:'Umsatz',eps_diluted:'Gewinn je Aktie (verwässert)',gross_margin:'Bruttomarge',operating_margin:'Operative Marge',free_cash_flow:'Freier Cashflow',net_income:'Nettogewinn',revenue_growth:'Umsatzwachstum',shares_outstanding:'Aktienanzahl',total_debt:'Schulden',cash_and_equivalents:'Liquide Mittel'};
const secLabels={'1.01':'Wesentliche Vereinbarung','1.02':'Vereinbarung beendet','1.03':'Insolvenz / Zwangsverwaltung','2.01':'Akquisition oder Veräußerung','2.03':'Neue finanzielle Verpflichtung','2.04':'Änderung finanzieller Verpflichtungen','2.05':'Restrukturierung','2.06':'Wesentliche Wertminderung','3.01':'Hinweis zur Börsenzulassung','3.02':'Aktienemission','3.03':'Änderung der Aktionärsrechte','4.01':'Wechsel des Wirtschaftsprüfers','4.02':'Hinweis zu früheren Abschlüssen','5.02':'Management, Vorstand oder Vergütung'};
const materialNames={PRESENTATION:'Präsentation',FINANCIAL_REPORT:'Finanzbericht',WEBCAST:'Webcast',REPLAY:'Aufzeichnung',CALL_RECORDING:'Aufzeichnung',COMPANY_TRANSCRIPT:'Unternehmenstranskript',PREPARED_REMARKS:'Vorbereitete Management-Aussagen',SHAREHOLDER_LETTER:'Aktionärsbrief',MANAGEMENT_COMMENTARY:'Management-Kommentar',EARNINGS_WEBCAST:'Ergebnis-Webcast',EARNINGS_RELEASE:'Ergebnisveröffentlichung',SEC_EARNINGS_EXHIBIT:'Ergebnisveröffentlichung',SEC_PRIMARY_DOCUMENT:'Originalbericht',SEC_FACT_FILING_REFERENCE:'Beleg der Finanzzahlen'};
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
function link(host,label,url){const safe=g.VUCompanyIntelligence.safeLink(url);if(!safe)return false;const a=node('a',label);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';a.className='ci-external';host.append(a);return true;}
function block(host,title){const s=node('section',undefined,'ci-block');s.append(node('h3',title));host.append(s);return s;}
function gap(host,title,text){const p=node('p',undefined,'ci-gap');p.append(node('strong',title+': '),document.createTextNode(text));host.append(p);}
function details(host,title){const d=node('details',undefined,'ci-details');d.append(node('summary',title));host.append(d);return d;}
function period(value){const annual=value.fiscalQuarter==='FY'||value.periodType==='FY';return (annual?'Geschäftsjahr'+(value.fiscalYear?' '+value.fiscalYear:''):value.fiscalQuarter||'Berichtszeitraum')+(!annual&&value.fiscalYear?' · Geschäftsjahr '+value.fiscalYear:'')+(value.reportingPeriod?' · Ende '+day(value.reportingPeriod):'');}
function materialName(d){
 let name=d.type==='FINANCIAL_REPORT'&&['10-K','20-F','40-F'].includes(d.form)?'Jahresbericht':d.type==='FINANCIAL_REPORT'&&d.form==='10-Q'?'Quartalsbericht':materialNames[d.type]||'Originalmaterial';
 if(d.type==='FINANCIAL_REPORT'&&!d.form){const years=[...String(d.label||'').matchAll(/(20\d{2})\s*annual[\s_-]*report|annual[\s_-]*report\s*(20\d{2})/gi)].map(m=>m[1]||m[2]);const unique=[...new Set(years)];if(unique.length===1)name='Jahresbericht '+unique[0];}
 if(d.fiscalQuarter&&d.fiscalYear)name+=' · '+period(d);
 else if(d.reportingPeriod)name+=' · Berichtsende '+day(d.reportingPeriod);
 if(d.filedAt)name+=' · eingereicht am '+day(d.filedAt);
 else if(d.date&&d.publicationDateStatus!=='NOT_PROVIDED')name+=' · Datum '+day(d.date);
 return name;
}
function knownDate(item){return item.publishedAt||item.publishedDate||item.date||null;}
const newsTypes={Earnings:'Geschäftszahlen',Guidance:'Ausblick',Operations:'Operatives Update',Product:'Produkt',Management:'Management','M&A':'M&A',Buyback:'Aktienrückkauf',Dividend:'Dividende',Financing:'Finanzierung',Regulation:'Regulatorisch',Contract:'Auftrag',Partnership:'Partnerschaft',Cybersecurity:'Cybersicherheit',Litigation:'Rechtsverfahren',Bankruptcy:'Insolvenz','Investor Day':'Investorentag',Conference:'Investorenveranstaltung'};
const bases={PREVIOUS_QUARTER_YOY_GROWTH:'Wachstumsrate des Vorquartals',PREVIOUS_YEAR:'Vorjahr',YEAR_AGO_QUARTER:'Vorjahresquartal'};
function pill(text){return node('span',text,'ci-pill');}
function freshness(value,now){
 const date=value&&Date.parse(value);if(!Number.isFinite(date))return 'UNDATED';if(date>now)return 'FUTURE';
 const age=now-date;return new Date(date).toISOString().slice(0,10)===new Date(now).toISOString().slice(0,10)?'TODAY':age<=7*86400000?'7_DAYS':age<=30*86400000?'30_DAYS':age<=90*86400000?'90_DAYS':'OLDER';
}
function storyType(item){return item.eventType==='MATERIAL_SEC_EVENT'?'SEC / Regulatorisch':['EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED'].includes(item.eventType)?'Geschäftszahlen':(item.categories||[]).map(k=>newsTypes[k]).find(Boolean)||'Unternehmensmeldung';}
function storyUrl(item){return item.canonicalUrl||item.earningsReleaseUrl||item.sourceUrl;}
function viewModel(payload,now=Date.now()){
 const today=new Date(now).toISOString().slice(0,10),seen=new Set();
 const stories=[...(payload.news||[]),...(payload.materialEvents||[]).filter(e=>['HIGH','CRITICAL'].includes(e.importance)),...(payload.earnings||[]).filter(e=>!e.isAmendment&&['EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED'].includes(e.eventType))]
  .filter(e=>{const key=g.VUCompanyIntelligence.safeLink(storyUrl(e));if(e.companyId&&e.companyId!==payload.companyId||!key||seen.has(key))return false;seen.add(key);return true;})
  .sort((a,b)=>(knownDate(b)||'').localeCompare(knownDate(a)||''));
 const recent=stories.filter(e=>['TODAY','7_DAYS','30_DAYS','90_DAYS'].includes(freshness(knownDate(e),now)));
 const archive=stories.filter(e=>['OLDER','UNDATED'].includes(freshness(knownDate(e),now)));
 const f=payload.latestFinancials,metrics=['revenue','eps_diluted','free_cash_flow','gross_margin','operating_margin','net_income','cash_and_equivalents','total_debt'].filter(k=>Number.isFinite(f?.metrics?.[k]?.current?.value)).slice(0,5);
 const changes=(f?.whatChanged||[]).filter(c=>c.metric!=='shares_outstanding'&&labels[c.metric]&&bases[c.comparison]&&((Number.isFinite(c.previous)&&Number.isFinite(c.current))||(c.unit==='percentage_points'&&Number.isFinite(c.absolute))));
 const priorities=['revenue_growth','gross_margin','free_cash_flow','revenue','net_income','operating_margin','eps_diluted','cash_and_equivalents','total_debt'];changes.sort((a,b)=>priorities.indexOf(a.metric)-priorities.indexOf(b.metric));
 const upcoming=(payload.events||[]).filter(e=>activeEvent(e,now,today)&&['CONFIRMED','ESTIMATED'].includes(e.confirmationStatus)).sort((a,b)=>(a.startsAt||a.date||a.dateStart||'').localeCompare(b.startsAt||b.date||b.dateStart||''));
 const confirmed=upcoming.filter(e=>e.confirmationStatus==='CONFIRMED');
 const estimates=upcoming.filter(e=>e.confirmationStatus==='ESTIMATED'&&!confirmed.some(c=>c.eventType==='EARNINGS_SCHEDULED'&&c.companyId===payload.companyId&&e.companyId===payload.companyId&&c.fiscalYear&&c.fiscalQuarter&&c.fiscalYear===e.fiscalYear&&c.fiscalQuarter===e.fiscalQuarter));
 return {recent,archive,metrics,changes:changes.slice(0,4),confirmed:confirmed.slice(0,4),estimates:estimates.slice(0,1)};
}
function story(item,now){
 const n=node('article',undefined,'ci-story'),regulatory=item.eventType==='MATERIAL_SEC_EVENT';n.dataset.intelligenceType=item.eventType;n.dataset.storyUrl=g.VUCompanyIntelligence.safeLink(storyUrl(item))||'';
 const title=['EARNINGS_PUBLISHED','PERIODIC_REPORT_PUBLISHED'].includes(item.eventType)?(item.eventType==='EARNINGS_PUBLISHED'?'Geschäftszahlen veröffentlicht':'Finanzbericht veröffentlicht')+(item.fiscalQuarter&&item.fiscalYear?' · '+(item.fiscalQuarter==='FY'?'Geschäftsjahr ':item.fiscalQuarter+' · Geschäftsjahr ')+item.fiscalYear:''):regulatory?(item.secItems||[]).map(code=>secLabels[code]||'Regulatorische Meldung').join(' · ')||'Regulatorische Meldung':item.headline||'Unternehmensmeldung';
 const date=knownDate(item),ref=item.provenance?.[0];let source=regulatory?'SEC':ref?.sourceName||item.sourceName||ref?.originalSource;
 if(!source){try{source=new URL(storyUrl(item)).hostname.replace(/^www\./,'');}catch{source='Originalquelle';}}
 const meta=node('div',undefined,'ci-story-meta');meta.append(node('time',freshness(date,now)==='TODAY'?'Heute':date?day(date):'Veröffentlichungsdatum nicht angegeben'),node('span',source));n.append(meta);
 const a=node('div',undefined,'ci-story-title');link(a,title+'',storyUrl(item));if(item.eventType==='NEWS')a.lang=item.language||'en';n.append(a,pill(storyType(item)));
 return n;
}
function activeEvent(e,now,today){
 if(['CANCELLED','CANCELED','WITHDRAWN','POSTPONED'].includes(e.eventStatus)||['CANCELLED','CANCELED'].includes(e.status))return false;
 if(e.startsAt)return Number.isFinite(Date.parse(e.startsAt))&&Date.parse(e.startsAt)>=now;
 return (e.dateEnd||e.date||e.dateStart||'')>=today;
}
function dateRange(start,end){return /^\d{4}-\d{2}-\d{2}$/.test(start||'')&&/^\d{4}-\d{2}-\d{2}$/.test(end||'')&&start.slice(0,7)===end.slice(0,7)?Number(start.slice(8))+'.–'+day(end):day(start)+' – '+day(end);}
function eventRow(e){
 const n=node('article',undefined,'ci-event'),estimated=e.confirmationStatus==='ESTIMATED';
 const kind=e.eventType==='EARNINGS_CALL'?'Ergebnisgespräch (Earnings Call)':e.eventType==='EARNINGS_SCHEDULED'?'Ergebnisveröffentlichung':e.eventType==='EARNINGS_ESTIMATED'?'Geschätzter Berichtszeitraum':/teleconference|conference call/i.test(e.headline||'')?'Telefonkonferenz':'Investorenveranstaltung';
 n.append(pill(estimated?'Geschätzt':'Bestätigt'));
 if(e.fiscalYear&&e.fiscalQuarter)n.append(node('p',period(e),'ci-meta'));
 n.append(node('p',estimated?dateRange(e.dateStart,e.dateEnd):day(e.startsAt||e.date,e.startsAt?'Europe/Berlin':'UTC'),'ci-event-date'),node('p',kind,'ci-headline'));
 if(estimated)n.append(node('p','Basierend auf dem bisherigen Berichtsrhythmus.','ci-meta'));
 else{
  if(e.startsAt)n.append(node('p',new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(e.startsAt))+' (Berlin)','ci-meta'));
  else n.append(node('p','Uhrzeit nicht angegeben','ci-meta'));
  const actions=node('div',undefined,'ci-actions');link(actions,'Ankündigung',e.sourceUrl);if(e.webcastUrl)link(actions,'Webcast öffnen',e.webcastUrl);if(actions.childElementCount)n.append(actions);
 }
 return n;
}
function changeLabel(c){
 if(c.metric==='revenue_growth'){
  if(c.current===c.previous)return 'Unverändert';
  if(c.current<0&&c.previous<0)return c.current>c.previous?'Rückgang abgeschwächt':'Rückgang verstärkt';
  if(c.current>0&&c.previous<0)return 'Wachstum statt Rückgang';
  if(c.current<0&&c.previous>0)return 'Rückgang statt Wachstum';
  if(c.current===0)return c.previous<0?'Kein Umsatzrückgang':'Kein Umsatzwachstum';
  if(c.previous===0)return c.current<0?'Umsatzrückgang':'Umsatzwachstum';
  return c.current>c.previous?'Beschleunigt':'Verlangsamt';
 }
 if(['gross_margin','operating_margin'].includes(c.metric))return c.absolute>0?'Ausgeweitet':c.absolute<0?'Verringert':'Unverändert';
 return c.current>c.previous?'Gestiegen':c.current<c.previous?'Gesunken':'Unverändert';
}
function render(host,payload){
 host.dataset.state=payload.state;delete host.dataset.companyId;delete host.dataset.generatedAt;
 host.dataset.experience='v2';host.replaceChildren(node('h2','Auf einen Blick'));
 if(payload.state!=='AVAILABLE'){host.append(node('p','Unternehmensmeldungen sind derzeit nicht verfügbar. Bitte später erneut versuchen.','ci-meta'));return;}
 host.dataset.companyId=payload.companyId;host.dataset.generatedAt=payload.generatedAt;
 const now=Date.now(),today=new Date(now).toISOString().slice(0,10),vm=viewModel(payload,now),profile=payload.companyProfile,f=payload.latestFinancials;
 const status=node('div',undefined,'ci-status');status.append(node('span',(payload.preview?'Vorschau · ':'')+'Datenstand '+day(payload.generatedAt),'ci-meta'));host.append(status);
 if(payload.previewBasis==='CATALOGUE_AND_EXISTING_FACTS')host.append(node('p','Vorschau mit geprüften Beschreibungen und vorhandenen Geschäftszahlen.','ci-warning'));
 if(payload.stale)host.append(node('p','Älterer Datenstand · Neue Meldungen können fehlen.','ci-warning'));
 if(profile?.state==='AVAILABLE'&&profile.companyId===payload.companyId&&profile.language==='de'){
  const s=block(host,'Unternehmen');s.classList.add('ci-company-card');const p=node('p',profile.description,'ci-profile');p.lang='de';s.append(p);
  // Keep every factual sentence; longer specifics live in an explicit expansion.
  const sentences=Array.from(new Intl.Segmenter('de',{granularity:'sentence'}).segment(profile.description),s=>s.segment);
  if(sentences.length>2&&profile.description.length>260){const count=sentences.slice(0,2).join('').length<=220?2:1;p.textContent=sentences.slice(0,count).join('').trim();const d=details(s,'Mehr zum Unternehmen');d.append(node('p',sentences.slice(count).join('').trim(),'ci-profile-more'));}
  const actions=node('div',undefined,'ci-actions');link(actions,'Website',profile.officialWebsite);if(actions.childElementCount)s.append(actions);
  if(profile.stale)s.append(node('p','Ältere Unternehmensbeschreibung','ci-warning'));
 }
 if(vm.recent.length){
  const s=block(host,'Aktuelles');s.append(pill('Letzte 90 Tage'));
  for(const e of vm.recent.slice(0,3))s.append(story(e,now));
  if(vm.recent.length>3){const d=details(s,'Mehr anzeigen · '+(vm.recent.length-3));for(const e of vm.recent.slice(3))d.append(story(e,now));}
 }
 if(f?.state==='AVAILABLE'&&vm.metrics.length){
  const s=block(host,'Geschäftszahlen'),meta=node('div',undefined,'ci-section-meta');meta.append(node('p',period(f),'ci-meta'));if(f.stale)meta.append(pill('Veraltete Geschäftszahlen'));s.append(meta);
  if(!vm.metrics.some(k=>!['cash_and_equivalents','total_debt'].includes(k)))s.append(node('p','Nur Bilanzwerte verfügbar · Umsatz- und Ergebniszahlen fehlen.','ci-meta'));
  const grid=node('div',undefined,'ci-values');for(const name of vm.metrics){const m=f.metrics[name],n=node('div',undefined,'ci-kpi ci-value');n.append(node('span',labels[name],'ci-kpi-label'),node('b',number(m.current.value,m.current.unit),'ci-kpi-number'));
   if(Number.isFinite(m.changePercentagePoints))n.append(node('small',(m.changePercentagePoints>0?'+':'')+number(m.changePercentagePoints,'percentage_points')+' zum '+(f.fiscalQuarter==='FY'||f.periodType==='FY'?'Vorjahr':'Vorjahresquartal')));
   else if(Number.isFinite(m.yoy?.percent))n.append(node('small',(m.yoy.percent>0?'+':'')+number(m.yoy.percent,'percent')+' zum '+(f.fiscalQuarter==='FY'||f.periodType==='FY'?'Vorjahr':'Vorjahresquartal')));
   else n.append(node('small','Ohne belastbaren Vorjahresvergleich'));grid.append(n);
  }s.append(grid);
  if(vm.changes.length){const d=block(host,'Was hat sich verändert?'),grid=node('div',undefined,'ci-changes');for(const c of vm.changes){
   const n=node('article',undefined,'ci-change'),unit=c.unit==='percentage_points'?'percent':c.unit;n.append(node('span',labels[c.metric],'ci-kpi-label'));
   const values=Number.isFinite(c.previous)&&Number.isFinite(c.current)?number(c.previous,unit)+' → '+number(c.current,unit):(c.absolute>0?'+':'')+number(c.absolute,'percentage_points');
   const change=node('p',undefined,'ci-change-values');if(Number.isFinite(c.previous)&&Number.isFinite(c.current)){change.append(node('span',number(c.previous,unit),'ci-change-previous'),node('span','→','ci-change-arrow'),node('b',number(c.current,unit),'ci-change-current'));}else change.append(node('b',values,'ci-change-current'));n.append(change,node('span',changeLabel(c),'ci-change-direction'),node('small',bases[c.comparison],'ci-meta'));grid.append(n);
  }d.append(grid);}
 }
 if(vm.confirmed.length||vm.estimates.length){const s=block(host,'Als Nächstes');for(const e of vm.confirmed)s.append(eventRow(e));for(const e of vm.estimates)s.append(eventRow(e));}
 const historicalCalls=(payload.calls||[]).filter(e=>!activeEvent(e,now,today)&&!['CANCELLED','CANCELED','WITHDRAWN','POSTPONED'].includes(e.eventStatus)&&!['CANCELLED','CANCELED','WITHDRAWN'].includes(e.status)&&[['webcastUrl','Webcast'],['replayUrl','Aufzeichnung'],['transcriptUrl','Unternehmenstranskript']].some(([k])=>g.VUCompanyIntelligence.safeLink(e[k]))).sort((a,b)=>(b.startsAt||b.date||'').localeCompare(a.startsAt||a.date||''));
 const documentsSeen=new Set(),groups=[];
 function documents(rows){return rows.filter(d=>{const url=g.VUCompanyIntelligence.safeLink(d.url);if(!url||documentsSeen.has(url))return false;documentsSeen.add(url);return true;});}
 for(const b of payload.earningsBundles||[]){const docs=documents(b.materials||[]);if(docs.length)groups.push({title:period(b),docs});}
 const remaining=documents([...(payload.materials||[]),...(payload.filings||[]).filter(f=>/^(?:10-[KQ]|20-F|40-F)$/.test(f.form||'')).map(f=>({url:f.sourceUrl,type:'FINANCIAL_REPORT',form:f.form,filedAt:f.date}))]);
 if(remaining.length)groups.push({title:'Weitere Unterlagen',docs:remaining.slice(0,8)});
 if(groups.length||historicalCalls.length||vm.archive.length){
  // Documents/calls can be the only useful approved module. Show a compact
  // entry point then retain the archive and provenance in the secondary layer.
  if(!profile&&!vm.recent.length&&!vm.metrics.length&&!vm.confirmed.length&&!vm.estimates.length){
   const s=block(host,historicalCalls.length?'Calls / Webcasts':'Berichte & Präsentationen');
   for(const c of historicalCalls.slice(0,2)){const n=node('article',undefined,'ci-story');n.append(node('p','Ergebnisgespräch · '+day(c.startsAt||c.date),'ci-headline'));for(const [key,label] of [['webcastUrl','Webcast'],['replayUrl','Aufzeichnung'],['transcriptUrl','Unternehmenstranskript']])link(n,label,c[key]);s.append(n);}
   if(!historicalCalls.length)for(const doc of groups.flatMap(g=>g.docs).filter(d=>d.type!=='SEC_FACT_FILING_REFERENCE').slice(0,3))link(s,materialName(doc),doc.url);
  }
  const d=details(host,'Dokumente & Quellen');d.classList.add('ci-documents');
  if(historicalCalls.length){const s=block(d,'Calls / Webcasts');for(const c of historicalCalls.slice(0,3)){const n=node('article',undefined,'ci-story');n.append(node('p','Ergebnisgespräch · '+day(c.startsAt||c.date,c.startsAt?'Europe/Berlin':'UTC'),'ci-headline'));for(const [field,label] of [['webcastUrl','Webcast'],['replayUrl','Aufzeichnung'],['transcriptUrl','Unternehmenstranskript']])if(c[field])link(n,label,c[field]);s.append(n);}}
  for(const group of groups.slice(0,5)){d.append(node('p',group.title,'ci-headline'));for(const doc of group.docs)link(d,(doc.type==='SEC_FACT_FILING_REFERENCE'&&f?.fiscalQuarter&&f?.fiscalYear&&Object.values(f.metrics||{}).some(m=>m.current?.filingId===doc.filingId)?f.fiscalQuarter+' '+f.fiscalYear+' · Beleg der Finanzzahlen':materialName(doc))+'',doc.url);if(group.docs.some(doc=>doc.publicationDateStatus==='NOT_PROVIDED'||(!doc.filedAt&&!doc.date)))d.append(node('p','Veröffentlichungsdatum nicht angegeben','ci-meta'));}
  if(vm.archive.length){const archive=details(d,'Ältere Meldungen / Datum nicht angegeben');for(const e of vm.archive)archive.append(story(e,now));}
  if(historicalCalls.length||groups.some(group=>group.docs.some(doc=>['WEBCAST','EARNINGS_WEBCAST','SHAREHOLDER_LETTER','PREPARED_REMARKS'].includes(doc.type))))d.append(node('p','Webcast ≠ bestätigte Aufzeichnung. Aktionärsbriefe und vorbereitete Aussagen sind keine vollständigen Transkripte.','ci-meta'));
 }
 const proof=details(host,'Datenstand und Quellenhinweise');proof.classList.add('ci-sources');proof.append(node('p','Aufbereitungsstand: '+day(payload.generatedAt)+'. Originalquellen können neuer sein. Nachrichten sind keine vollständige Marktberichterstattung.','ci-meta'));
 if(f?.state==='AVAILABLE')proof.append(node('p','Stand der zugrunde liegenden Zahlen: '+day(f.sourceAsOf)+'. Nachträglich aktualisierte Zahlen; kein historischer Echtzeitstand. Zahlenvergleiche sind keine Bewertung der Aktie.','ci-meta'));
 if(f?.stale)proof.append(node('p','Neuere normalisierte Geschäftszahlen sind in diesem Datenstand nicht enthalten.','ci-meta'));
 if(vm.estimates.length)proof.append(node('p','Geschätzte Zeitfenster beruhen auf früheren Berichten. Sie sind keine bestätigten Termine und keine Vorhersage eines Veröffentlichungstags.','ci-meta'));
 for(const source of profile?.sources||[])link(proof,source.type==='SEC'?'Profilquelle · Jahresbericht'+(source.filedAt?' vom '+day(source.filedAt):''):'Profilquelle · Unternehmen',source.url);
 if(profile&&profile.language!=='de'){proof.append(node('p','Quellenbeschreibung (Englisch), noch nicht als deutsches Profil freigegeben:','ci-meta'));const p=node('p',profile.description);p.lang='en';proof.append(p);}
}
function mount(parent,ticker,options={}){
 const config=g.VUCompanyIntelligenceRollout;if(!config?.enabled(ticker,options))return function(){};
 const host=node('section',undefined,'dx-chapter ci-company-intelligence');host.setAttribute('aria-label','Company Intelligence');host.setAttribute('aria-busy','true');host.append(node('p','Unternehmensinformationen werden geladen …','ci-meta'));parent.append(host);
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);let disposed=false;
 g.VUCompanyIntelligence.load(ticker,{enabled:true,base:options.base||config.base,expectedGeneration:config.stage===1?config.expectedGeneration:undefined,signal:controller.signal}).then(p=>{if(!disposed&&host.isConnected)render(host,p);}).catch(()=>{if(!disposed&&host.isConnected)render(host,{state:'UNAVAILABLE'});}).finally(()=>{clearTimeout(timeout);host.setAttribute('aria-busy','false');});
 return ()=>{disposed=true;clearTimeout(timeout);controller.abort();host.remove();};
}
g.VUCompanyIntelligenceStock={mount,render,number,viewModel,freshness,storyType,changeLabel};
})(typeof globalThis!=='undefined'?globalThis:this);
