/* UI rule editing delegates validation, normalization and execution semantics
 * to the existing Query/Catalog engines. No metric calculations here. */
(function(g){
'use strict';
const node=typeof module!=='undefined'&&module.exports;
const Query=node?require('../engines/query.js'):g.VUQuery,Catalog=node?require('../engines/catalog.js'):g.VUCatalog,Rules=node?require('../engines/rule-contract.js'):g.VURuleContract;
const fields=Object.freeze([
 ['momentum6m','Kursentwicklung · 6 Monate','momentum6m'],['revenueGrowth','Umsatzwachstum','revenueGrowth'],
 ['priceTo200dma','Abstand zum 200-Tage-Durchschnitt','above200'],['priceTo50dma','Abstand zum 50-Tage-Durchschnitt','above50'],
 ['operatingMargin','Operative Marge','operatingMargin'],['fcfMargin','Freier Cashflow · Marge','fcfMargin'],
 ['roic','Kapitalrendite (ROIC)','roic'],['price','Aktienkurs','price'],
 ['technicalOpportunityScore','Technical Opportunity Score','technicalOpportunityScore'],
 ['technicalTrend','Technical Trend','technicalTrend'],
 ['technicalPrimaryDirection','Primärszenario · Richtung','technicalPrimaryDirection'],
 ['elliottCountStatus','Elliott Count · Methodenstatus','elliottCountStatus']
].map(([id,label,productKey])=>{const field=Catalog.field(id);return Object.freeze({id,label,productKey,unit:field.unit,type:field.type,values:field.values,
 operatorIds:field.type==='number'?['gte','gt','lte','lt','eq','ne']:['eq','ne'],availability:field.availability||'CURRENT_AND_HISTORICAL',
 backtestEligibility:field.backtestEligibility||'CERTIFIED_BY_PROVIDER',isProbability:field.isProbability===true,methodology:field.description||field.label});}));
const operators=Object.freeze(['gte','gt','lte','lt','eq','ne'].map(id=>Object.freeze({id,label:Catalog.operator(id).label})));
const sortableFields=Object.freeze(fields.filter(field=>field.type==='number'));
function supported(query){return Query.validate(query).valid&&query.filters.every(f=>fields.some(x=>x.id===f.field)&&operators.some(o=>o.id===f.operator)&&f.scale==='raw')&&query.sort.every(s=>fields.some(f=>f.id===s.field));}
function build(filters,sort){const firstSortable=(filters||[]).find(filter=>sortableFields.some(field=>field.id===filter.field));const query=Query.createQuery({filters,sort:sort||[{field:firstSortable?.field||'momentum6m',direction:'desc'}],limit:50});if(!supported(query))throw Error('INVALID_SCREEN_RULES');return query;}
function decode(value){if(typeof value!=='string'||value.length>24000)throw Error('INVALID_SCREEN_LINK');const query=Query.createQuery(JSON.parse(value));if(!supported(query))throw Error('UNSUPPORTED_SCREEN_LINK');return query;}
function encode(query){if(!supported(query))throw Error('INVALID_SCREEN_RULES');return JSON.stringify(query);}
function predicate(query){if(!supported(query))throw Error('INVALID_SCREEN_RULES');return Rules.fromQuery(query);}
const api={fields,sortableFields,operators,build,decode,encode,predicate,maxFilters:Query.MAX_FILTERS};if(node)module.exports=api;else g.VUScreenerWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);
