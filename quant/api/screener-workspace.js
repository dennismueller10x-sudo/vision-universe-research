/* UI rule editing delegates validation, normalization and execution semantics
 * to the existing Query/Catalog engines. No metric calculations here. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Query=node?require('../engines/query.js'):g.VUQuery,Catalog=node?require('../engines/catalog.js'):g.VUCatalog,Rules=node?require('../engines/rule-contract.js'):g.VURuleContract;
/* Zwei Methodiken, getrennt auswaehlbar.
 *
 * Quant V1 und die Marktdatenfelder beschreiben einen Titel anders als die
 * Quant-V2-Faktorevidenz. Beide in einer Abfrage zu mischen hiesse, eine
 * Auswahl zu treffen, deren Kriterien zwei Bedeutungen tragen - und pro
 * Titel zwei Zeilen aus zwei Quellen zu joinen. Eine Abfrage gehoert
 * deshalb genau einer Methodik; der Nutzer waehlt sie ausdruecklich.
 *
 * Bestehende gespeicherte Abfragen enthalten ausschliesslich Legacy-Felder
 * und loesen deshalb unveraendert in die Legacy-Methodik auf. */
const LEGACY_FIELDS=[
 ['momentum6m','Kursentwicklung · 6 Monate','momentum6m'],['revenueGrowth','Umsatzwachstum','revenueGrowth'],
 ['priceTo200dma','Abstand zum 200-Tage-Durchschnitt','above200'],['priceTo50dma','Abstand zum 50-Tage-Durchschnitt','above50'],
 ['operatingMargin','Operative Marge','operatingMargin'],['fcfMargin','Freier Cashflow · Marge','fcfMargin'],
 ['roic','Kapitalrendite (ROIC)','roic'],['price','Aktienkurs','price'],
 ['technicalOpportunityScore','Technical Opportunity Score','technicalOpportunityScore'],
 ['technicalTrend','Technical Trend','technicalTrend'],
 ['technicalPrimaryDirection','Primärszenario · Richtung','technicalPrimaryDirection'],
 ['elliottCountStatus','Elliott Count · Methodenstatus','elliottCountStatus']
];
const EVIDENCE_NAMESPACE='quantV2.factorEvidence';
/* Die Feldliste kommt aus dem Katalog, nicht aus einer zweiten Aufzaehlung:
 * ein neuer Faktor im Namensraum erscheint hier automatisch. */
const EVIDENCE_FIELDS=Catalog.namespaceFieldIds(EVIDENCE_NAMESPACE)
 .map(id=>[id,Catalog.field(id).label,id]);
function describe(entry,methodologyId,source){
 const [id,label,productKey]=entry,field=Catalog.field(id);
 return Object.freeze({id,label,productKey,unit:field.unit,type:field.type,values:field.values,
  operatorIds:field.type==='number'?['gte','gt','lte','lt','eq','ne']:['eq','ne'],
  availability:field.availability||'CURRENT_AND_HISTORICAL',
  backtestEligibility:field.backtestEligibility||'CERTIFIED_BY_PROVIDER',
  isProbability:field.isProbability===true,methodology:field.description||field.label,
  methodologyId,namespace:field.namespace||null,source});
}
const METHODOLOGIES=Object.freeze([
 Object.freeze({id:'legacy',label:'Quant V1 & Marktdaten',source:'PRODUCT_UNIVERSE',
  methodologyVersion:'quant-v1.0.0',
  note:'Bestehende Marktdaten-, Fundamental- und Technical-Felder. Unveraendert; Quant V1 bleibt erhalten.',
  defaultField:'momentum6m',
  fields:Object.freeze(LEGACY_FIELDS.map(entry=>describe(entry,'legacy','PRODUCT_UNIVERSE')))}),
 Object.freeze({id:'quantV2Evidence',label:'Quant V2 · Factor Evidence',source:'FACTOR_EVIDENCE_SCREENING',
  methodologyVersion:'vu-factor-evidence-1.0.0',namespace:EVIDENCE_NAMESPACE,
  note:'Position je kanonischem Quant-V2-Faktor im Vergleichsuniversum. Kein Composite Score und kein Rang.',
  defaultField:EVIDENCE_NAMESPACE+'.momentum',
  fields:Object.freeze(EVIDENCE_FIELDS.map(entry=>describe(entry,'quantV2Evidence','FACTOR_EVIDENCE_SCREENING')))})
]);
const fields=Object.freeze(METHODOLOGIES.flatMap(m=>m.fields));
/* Welche Methodik eine Abfrage benutzt - oder null, wenn sie mischt. */
function methodologyOf(query){
 const ids=new Set([...(query.filters||[]).map(f=>f.field),...(query.sort||[]).map(s=>s.field)]);
 const used=new Set();
 for(const id of ids){const def=fields.find(f=>f.id===id);if(!def)return null;used.add(def.methodologyId);}
 if(used.size!==1)return null;
 return METHODOLOGIES.find(m=>m.id===[...used][0])||null;
}
function methodology(id){return METHODOLOGIES.find(m=>m.id===id)||null;}
const operators=Object.freeze(['gte','gt','lte','lt','eq','ne'].map(id=>Object.freeze({id,label:Catalog.operator(id).label})));
const sortableFields=Object.freeze(fields.filter(field=>field.type==='number'));
function supported(query){return Query.validate(query).valid&&query.filters.every(f=>fields.some(x=>x.id===f.field)&&operators.some(o=>o.id===f.operator)&&f.scale==='raw')&&query.sort.every(s=>fields.some(f=>f.id===s.field))&&methodologyOf(query)!==null;}
function build(filters,sort){const firstSortable=(filters||[]).find(filter=>sortableFields.some(field=>field.id===filter.field));const query=Query.createQuery({filters,sort:sort||[{field:firstSortable?.field||'momentum6m',direction:'desc'}],limit:50});if(!supported(query))throw Error('INVALID_SCREEN_RULES');return query;}
function decode(value){if(typeof value!=='string'||value.length>24000)throw Error('INVALID_SCREEN_LINK');const query=Query.createQuery(JSON.parse(value));if(!supported(query))throw Error('UNSUPPORTED_SCREEN_LINK');return query;}
function encode(query){if(!supported(query))throw Error('INVALID_SCREEN_RULES');return JSON.stringify(query);}
function predicate(query){if(!supported(query))throw Error('INVALID_SCREEN_RULES');return Rules.fromQuery(query);}
const api={fields,sortableFields,operators,build,decode,encode,predicate,methodologies:METHODOLOGIES,methodology,methodologyOf,maxFilters:Query.MAX_FILTERS};if(node)module.exports=api;else g.VUScreenerWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);
