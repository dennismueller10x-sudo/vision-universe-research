/* Manual holdings, scoped current valuation. No broker, return simulation,
 * synthetic position, FX assumption or aggregate risk score. */

/* DEFERRED_PRODUCT_DECISION_MULTI_CURRENCY_PORTFOLIO  (O-16)
 *
 * Die Zeile `stock.price.unit === 'USD'` unten sieht aus wie eine fest
 * verdrahtete Waehrung und ist keine. Sie ist ein BEWERTUNGS-GATE: eine
 * Position in Fremdwaehrung wird nicht bewertet, statt sie mit einer
 * stillschweigenden Annahme zu bewerten. Genau das verlangt die
 * Kopfzeile dieser Datei ("No FX assumption") und genau das verlangt
 * O-13.
 *
 * Sie zu entfernen waere keine Migration der Darstellung, sondern die
 * FREISCHALTUNG der Multi-Waehrungs-Depotbewertung - mit allem, was
 * daran haengt: welcher Kurs zu welchem Zeitpunkt, wie ein Depot aus
 * drei Waehrungen einen Gesamtwert bekommt, was eine Gewichtung dann
 * bedeutet. Das ist eine Produktentscheidung und keine Formatierung.
 *
 * Sie ist deshalb ausdruecklich zurueckgestellt und KEIN Blocker fuer
 * den Currency Display Layer. Bis zur Entscheidung bleibt die Zeile
 * unveraendert.
 */
(function(g){
'use strict';
const KEY='vu2.portfolio.holdings.v1';
function validate(positions){
 if(!Array.isArray(positions)||positions.length>500)throw Error('INVALID_HOLDINGS');const seen=new Set();
 return positions.map(p=>{if(!p||typeof p.ticker!=='string'||!/^\b[A-Z0-9][A-Z0-9.-]{0,11}$/.test(p.ticker)||seen.has(p.ticker)||!Number.isFinite(p.quantity)||p.quantity<=0)throw Error('INVALID_HOLDING');seen.add(p.ticker);return {ticker:p.ticker,quantity:p.quantity};});
}
function load(storage){const raw=storage.getItem(KEY);if(raw===null)return [];if(raw.length>100000)throw Error('INVALID_SAVED_HOLDINGS');let saved;try{saved=JSON.parse(raw);}catch{throw Error('INVALID_SAVED_HOLDINGS');}if(saved?.version!=='1.0.0')throw Error('INVALID_SAVED_HOLDINGS');return validate(saved.positions);}
function save(storage,positions){const clean=validate(positions);storage.setItem(KEY,JSON.stringify({version:'1.0.0',positions:clean,updatedAt:new Date().toISOString()}));return clean;}
function build(positions,universe,{now=new Date().toISOString().slice(0,10)}={}){
 const clean=validate(positions);if(!clean.length)return {state:'EMPTY',positions:[],total:null,currency:'USD',asOf:null};
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d&&d<=now;
 const rows=clean.map(p=>{const stock=universe?.state==='AVAILABLE'?universe.stocks.find(s=>s.ticker===p.ticker):null;
  /* vu-currency: E - Bewertungs-Gate, keine Anzeige. Verweigert Fremdwaehrung,
     statt sie anzunehmen (O-13). Migration zurueckgestellt, siehe
     DEFERRED_PRODUCT_DECISION_MULTI_CURRENCY_PORTFOLIO im Dateikopf. */
  const available=stock?.state==='AVAILABLE'&&stock.marketState==='AVAILABLE'&&stock.price?.state==='AVAILABLE'&&stock.price.unit==='USD'&&Number.isFinite(stock.price.value)&&stock.price.value>0&&validDate(stock.asOf);
  const value=available?p.quantity*stock.price.value:null;
  return {...p,name:stock?.name||p.ticker,state:available&&Number.isFinite(value)?'AVAILABLE':'UNAVAILABLE',price:available?stock.price.value:null,value:available&&Number.isFinite(value)?value:null,asOf:available?stock.asOf:null,weight:null};
 });
 const dates=new Set(rows.filter(r=>r.state==='AVAILABLE').map(r=>r.asOf));let total=rows.every(r=>r.state==='AVAILABLE')&&dates.size===1?rows.reduce((sum,r)=>sum+r.value,0):null;if(!Number.isFinite(total)||total<=0)total=null;
 if(total!==null)rows.forEach(r=>{r.weight=r.value/total;});
 return {state:total===null?'INCOMPLETE':'AVAILABLE',reason:total===null?(dates.size>1?'MIXED_PRICE_DATES':'MISSING_POSITION_VALUES'):null,positions:rows,total,currency:'USD',asOf:total===null?null:rows[0].asOf};
}
const api={validate,load,save,build,key:KEY};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUPortfolioWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);
