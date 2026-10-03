/* Stage 0 by default. Preview is explicit, cohort-limited, and still requires server delivery gate. */
(function(g){
'use strict';
const cohort = ['AAPL','NVDA','TSLA','MSFT','XPEV','PLTR','SOFI','ROOT','U','XYZ','TOST','TGT','AFRM','META','GOOG','GOOGL','ACU','CHE','AOS','RARE','PYXS','VEON'];
function enabled(ticker, options = {}) {
 const query = options.search === undefined ? (g.location?.search || '') : options.search;
 return cohort.includes(String(ticker).toUpperCase()) && (options.enabled === true || new URLSearchParams(query).get('company-intelligence') === 'preview');
}
const config = {stage:0, cohort, enabled, base:'/company-intelligence/data/'};
if(typeof module !== 'undefined' && module.exports)module.exports=config;else g.VUCompanyIntelligenceRollout=config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
