/* Explicit personal selection; never seeds or rewrites the legacy demo store. */
(function(g){
'use strict';
const key='vu2.watchlist.selection.v1';
function validate(tickers){
 if(!Array.isArray(tickers)||tickers.length>500)throw Error('INVALID_WATCHLIST');
 const seen=new Set();return tickers.map(t=>{if(typeof t!=='string'||!/^[A-Z0-9][A-Z0-9.-]{0,11}$/.test(t)||seen.has(t))throw Error('INVALID_WATCHLIST');seen.add(t);return t;});
}
function load(storage){const raw=storage.getItem(key);if(raw===null)return [];if(raw.length>20000)throw Error('INVALID_SAVED_WATCHLIST');let data;try{data=JSON.parse(raw);}catch{throw Error('INVALID_SAVED_WATCHLIST');}if(data?.version!=='1.0.0')throw Error('INVALID_SAVED_WATCHLIST');return validate(data.tickers);}
function save(storage,tickers){const clean=validate(tickers);storage.setItem(key,JSON.stringify({version:'1.0.0',tickers:clean}));return clean;}
function build(tickers,universe,{capabilities={},coverage=null}={}){const selected=validate(tickers);const members=selected.map(ticker=>{const stock=universe?.state==='AVAILABLE'?universe.stocks.find(s=>s.ticker===ticker):null,intelligence=capabilities[ticker]||{signals:{state:'UNAVAILABLE',reason:'SIGNAL_EVIDENCE_NOT_PUBLISHED',events:[]},technical:{state:'UNAVAILABLE',reason:'TECHNICAL_BUNDLE_NOT_PUBLISHED'},elliott:{state:'UNAVAILABLE',reason:'ELLIOTT_BUNDLE_NOT_PUBLISHED'}};return stock?{...stock,intelligence}:{ticker,name:ticker,state:'UNAVAILABLE',reason:'SOURCE_OR_DISPLAY_UNAVAILABLE',intelligence};});return {state:members.length?'AVAILABLE':'EMPTY',partial:members.some(s=>s.state!=='AVAILABLE'||s.intelligence?.signals?.state!=='AVAILABLE'||s.intelligence?.technical?.state!=='AVAILABLE'),members,scope:'USER_SELECTION_WITHIN_CANONICAL_PRODUCT_UNIVERSE',coverage};}
const api={key,validate,load,save,build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUWatchlistWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);
