/* Unified read-only metric catalogue. Definitions keep their existing owners.
 * factor.* IDs deliberately do not alias market-factors ratio definitions. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Market=node?require('./market-metric-registry.js'):g.VUMarketMetricRegistry,Catalog=node?require('./catalog.js'):g.VUCatalog;
const specs=[
 ['operatingMargin','fundamentals',4,'Trailing operating income / trailing revenue ×100. Requires four complete periods.'],
 ['fcfMargin','fundamentals',4,'Trailing free cash flow / trailing revenue ×100. Requires four complete periods.'],
 ['roic','fundamentals',4,'Trailing operating income ×(1−0.21) / latest positive invested capital ×100.'],
 ['revenueGrowth','fundamentals',8,'Current four-period revenue / prior four-period revenue −1, ×100; prior base must be positive.'],
 ['epsGrowth','fundamentals',8,'Growth of trailing net income / latest shares against prior trailing net income / prior latest shares; positive prior base required.'],
 ['fcfGrowth','fundamentals',8,'Current four-period free cash flow / prior four-period free cash flow −1, ×100; positive prior base required.'],
 ['marginExpansion','fundamentals',8,'Current minus prior four-period operating margin, in percentage points.'],
 ['earningsYield','valuation',4,'Trailing net income / (current price × latest shares) ×100.'],
 ['fcfYield','valuation',4,'Trailing free cash flow / (current price × latest shares) ×100.'],
 ['evToSales','valuation',4,'(Current price × latest shares + latest net debt) / trailing revenue.'],
 ['priceToFcf','valuation',4,'Current price × latest shares / positive trailing free cash flow.'],
 ['momentum3m','market',64,'Adjusted close[t] / adjusted close[t−63] −1, ×100, rounded to 3 decimals.'],
 ['momentum6m','market',127,'Adjusted close[t] / adjusted close[t−126] −1, ×100, rounded to 3 decimals.'],
 ['momentum12m','market',253,'Adjusted close[t] / adjusted close[t−252] −1, ×100, rounded to 3 decimals.'],
 ['priceTo200dma','market',200,'Raw close distance from arithmetic mean of 200 raw closes, ×100, rounded to 3 decimals.'],
 ['volatility','market',62,'Sample standard deviation of adjusted simple daily returns, trailing at most252 returns, ×sqrt(252) ×100; more than 60 returns required.'],
 ['downsideVolatility','market',62,'Root mean square of negative adjusted simple returns ×sqrt(252) ×100; more than 60 total returns and more than 5 negative returns required.'],
 ['maxDrawdown','market',1,'Positive magnitude of worst adjusted-close drawdown from running peak in trailing at most253 bars, ×100; legacy partial-window behavior preserved.']
];
const explanations={
 operatingMargin:'Anteil des operativen Gewinns am Umsatz der letzten vier vollständigen Berichtsperioden.',fcfMargin:'Anteil des freien Cashflows am Umsatz der letzten vier vollständigen Berichtsperioden.',
 roic:'Operativer Gewinn der letzten vier Perioden nach einem normierten Steuersatz von 21 % im Verhältnis zum zuletzt ausgewiesenen investierten Kapital.',
 revenueGrowth:'Umsatz der letzten vier Perioden im Vergleich zu den vier Perioden davor. Eine positive Vergleichsbasis ist erforderlich.',
 epsGrowth:'Veränderung von Jahresüberschuss je zuletzt ausgewiesener Aktie gegenüber der vorherigen Vier-Perioden-Gruppe. Dies ist die bestehende Faktor-Definition, nicht eine neue EPS-Schätzung.',
 fcfGrowth:'Freier Cashflow der letzten vier Perioden im Vergleich zu den vier Perioden davor; eine positive Vergleichsbasis ist erforderlich.',
 marginExpansion:'Veränderung der operativen Marge gegenüber der vorherigen Vier-Perioden-Gruppe, in Prozentpunkten.',
 earningsYield:'Jahresüberschuss der letzten vier Perioden im Verhältnis zum Börsenwert aus Kurs und zuletzt ausgewiesener Aktienzahl.',
 fcfYield:'Freier Cashflow der letzten vier Perioden im Verhältnis zum Börsenwert.',evToSales:'Börsenwert zuzüglich Nettoverschuldung im Verhältnis zum Umsatz der letzten vier Perioden.',priceToFcf:'Börsenwert im Verhältnis zum positiven freien Cashflow der letzten vier Perioden.',
 momentum3m:'Kursentwicklung über 63 vorhandene Handelstage anhand der bereinigten Schlusskursreihe.',momentum6m:'Kursentwicklung über 126 vorhandene Handelstage anhand der bereinigten Schlusskursreihe.',momentum12m:'Kursentwicklung über 252 vorhandene Handelstage anhand der bereinigten Schlusskursreihe.',
 priceTo200dma:'Prozentualer Abstand des Schlusskurses zum Durchschnitt der letzten 200 unbereinigten Schlusskurse. Diese bestehende Definition bleibt vom bereinigten Trendmodell getrennt.',
 volatility:'Auf ein Jahr hochgerechnete Schwankung der täglichen bereinigten Kursrenditen. Verwendet bis zu 252 Renditen; mindestens 61 sind erforderlich.',
 downsideVolatility:'Auf ein Jahr hochgerechnete Stärke negativer Tagesrenditen. Benötigt mindestens 61 Renditen und mehr als fünf negative Beobachtungen.',
 maxDrawdown:'Größter Rückgang von einem zuvor erreichten Hoch innerhalb von bis zu 253 bereinigten Schlusskursen. Bei kurzer Historie gilt nur das vorhandene Fenster.'
};
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(deepFreeze);Object.freeze(value);}return value;}
const legacy=specs.map(([field,family,minimum,methodology])=>{const f=Catalog.field(field),market=family==='market';return {
 metricId:'factor.'+field,version:'1.0.0',field:[field],owner:'quant/engines/factors.js',ownerRevision:{algorithm:'sha256',value:'5627ae2ce7623d520afb65deb6cd7dca12f361bef38e31be322a95ae7c6731b8'},
 engineVersion:null,definitionFamily:family,unit:field==='marginExpansion'?'percentage_points':f.unit,minimumBars:market?minimum:null,minimumPeriods:market?null:minimum,
 inputs:market?(field==='priceTo200dma'?['legacy.price_panel.close','legacy.price_panel.adjustedClose']:['legacy.price_panel.adjustedClose']):family==='valuation'?['canonical.fundamentals.periods','legacy.price_panel.close']:['canonical.fundamentals.periods'],
 timeSemantics:market?'Trailing existing trading bars through observation, inclusive':'Existing four-period aggregation and latest balance-sheet/share values; historical availability must be supplied by the caller',
 adjustmentSemantics:market?'Existing PanelBuilder basis and Float32 arrays. raw close and adjustedClose retain different roles; adjusted fallback is not silently reinterpreted.':family==='valuation'?'Current raw-price valuation with source-period accounting units; no FX conversion':'Canonical accounting periods from validated adapter; no SEC concept mapping is defined here',
 missingDataPolicy:'Preserve source null/unavailable. Ratios reject invalid denominators; growth rejects non-positive prior bases. Never zero-fill.',pitEligibility:'NOT_CERTIFIED',
 updateCadence:market?'EOD':family==='valuation'?'EOD_OR_FILING':'VALIDATED_FILING',
 provenance:['asOf','availableAt','panelVersion','sourceRevision'],uxMapping:{label:f.label,explanation:explanations[field],format:field==='marginExpansion'?'percentage_points':f.unit},methodology
};});
const entries=deepFreeze([...Market.entries,...legacy]);
const api=Object.freeze({version:'1.1.0',entries,get:id=>entries.find(m=>m.metricId===id)||null,affectedBy:inputs=>entries.filter(m=>m.inputs.some(i=>inputs.includes(i))).map(m=>m.metricId)});
if(node)module.exports=api;else g.VUMetricRegistry=api;
})(typeof window!=='undefined'?window:globalThis);
