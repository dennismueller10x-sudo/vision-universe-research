/* Versioned controlled cohort. Durable consumer gate and exact generation are required by delivery. */
(function(g){
'use strict';
const cohort = ["AAPL","NVDA","TSLA","MSFT","PLTR","GOOG","GOOGL","XPEV","META","AMZN","ORCL","CRM","U","SOFI","ROOT","ACU","CHE","AOS","RARE","PYXS","VEON","JPM","BAC","GS","MS","PNC","BOH","SBSI","CAC","AFL","MET","HNRG","AMPY","MCHB","OPTU","JBI","ARBE","VCYT","TK","ONCY","QCOM","AMD","TGT","TOST","AFRM","XYZ"];
// Delivery inserts the validated generation-bound issuer decisions. Null keeps
// the verified legacy cohort until a gated universe consumer is accepted.
const eligibility = null;
function enabled(ticker, options = {}) {
 if(config.productionOff)return false;
 const symbol=String(ticker).trim().toUpperCase();
 if(config.eligibility){
  const row=config.eligibility[symbol];
  return config.stage===1&&['ELIGIBLE_FULL','ELIGIBLE_PARTIAL'].includes(row?.status)&&/^(?:iss_cik_\d{10}|vu_[a-f0-9]{14})$/.test(row.companyId)&&Object.entries(row.modules||{}).some(([key,value])=>key!=='whatChanged'&&value===true);
 }
 const query = options.search === undefined ? (g.location?.search || '') : options.search;
 return cohort.includes(symbol) && (config.stage === 1 || options.enabled === true || new URLSearchParams(query).get('company-intelligence') === 'preview');
}
const config = {stage:1, cohort, eligibility, enabled, expectedGeneration:'6c3fb74e36086a0b86dfdf3b', base:'/company-intelligence/data/'};
if(typeof module !== 'undefined' && module.exports)module.exports=config;else g.VUCompanyIntelligenceRollout=config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
