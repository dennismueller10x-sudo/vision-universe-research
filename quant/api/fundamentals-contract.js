/* Current historical-report presentation. SEC owns every metric calculation.
 * latest_known is retrospective research, never a historical backtest input. */
(function(g){
'use strict';
const METRICS=Object.freeze([
 ['revenue','Umsatz','USD'],['net_income','Nettogewinn','USD'],['operating_income','Operativer Gewinn','USD'],
 ['free_cash_flow','Freier Cashflow','USD'],['operating_cash_flow','Operativer Cashflow','USD'],
 ['eps_diluted','Gewinn je Aktie · verwässert','USD/shares'],['total_debt','Gesamtschulden','USD'],
 ['cash_and_equivalents','Liquide Mittel','USD'],['shares_outstanding','Ausstehende Aktien','shares'],['dividends_paid','Gezahlte Dividenden','USD']
].map(([id,label,unit])=>Object.freeze({id,label,unit,owner:'quant/config/sec-metric-registry.json'})));
function date(d){return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;}
function unavailable(reason){return {state:'UNAVAILABLE',reason,rows:[],metrics:METRICS};}
function build(payload,options){
 const {ticker,cik,metric='revenue',period='annual'}=options,now=new Date(options.now||Date.now());
 const definition=METRICS.find(m=>m.id===metric);
 if(!definition||!['annual','quarterly','ttm'].includes(period))return unavailable('INVALID_SELECTION');
 if(period==='ttm')return unavailable('TTM_NOT_VALIDATED');
 if(!Number.isFinite(now.getTime()))return unavailable('INVALID_AS_OF');
 if(!payload||payload.cik!==cik||payload.profile?.cik!==cik||!payload.profile?.tickers?.includes(ticker)||payload.isMock===true||!Array.isArray(payload.rows))return unavailable('INVALID_PROVENANCE');
 if(payload.policy!=='latest_known'||payload.versions?.normalization_schema!=='1.0.0')return unavailable('UNSUPPORTED_HISTORY_CONTRACT');
 const generated=Date.parse(payload.generated_at_utc);
 if(!Number.isFinite(generated)||generated>now.getTime())return unavailable('INVALID_SOURCE_TIMESTAMP');
 const today=now.toISOString().slice(0,10),seen=new Set(),rows=[];
 const selected=payload.rows.filter(r=>r.metric===metric&&(period==='annual'?r.fiscal_period==='FY':/^Q[1-4]$/.test(r.fiscal_period)));
 for(const r of selected){
  if(!Number.isInteger(r.fiscal_year))return unavailable('INVALID_PERIOD');
  const key=r.fiscal_year+'-'+r.fiscal_period;
  if(seen.has(key))return unavailable('DUPLICATE_PERIOD');seen.add(key);
  const row={key,label:r.fiscal_period+' '+r.fiscal_year,fiscalYear:r.fiscal_year,fiscalPeriod:r.fiscal_period,state:'SOURCE_MISSING',value:null,unit:definition.unit};
  if(r.available===true){
   const known=Date.parse(r.available_from);
   const provenance=['SEC_EDGAR_XBRL','VISION_UNIVERSE_DERIVED'].includes(r.source)&&['HIGH','MEDIUM'].includes(r.quality)&&typeof r.accession==='string'&&/^\d{10}-\d{2}-\d{6}$/.test(r.accession);
   const timing=date(r.period_end)&&r.period_end<=today&&date(r.filed)&&r.period_end<=r.filed&&r.filed<=today&&typeof r.available_from==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(r.available_from)&&Number.isFinite(known)&&known<=now.getTime()&&r.available_from.slice(0,10)>=r.filed&&(!r.period_start||(date(r.period_start)&&r.period_start<=r.period_end));
   const fatal=(payload.quality_errors?.findings||[]).some(f=>f.severity==='ERROR'&&f.accession===r.accession&&(!f.concept||r.concept?.endsWith(':'+f.concept)));
   if(!provenance||!timing||fatal||!Number.isFinite(r.value)||r.unit!==definition.unit){row.state='PIPELINE_ERROR';row.reason='INVALID_FACT_EVIDENCE';}
   else Object.assign(row,{state:'AVAILABLE',value:r.value,start:r.period_start||null,end:r.period_end,availableFrom:r.available_from,filed:r.filed,accession:r.accession,source:r.source,transformation:r.transformation,quality:r.quality,flags:r.flags||[]});
  }
  rows.push(row);
 }
 rows.sort((a,b)=>a.fiscalYear-b.fiscalYear||a.fiscalPeriod.localeCompare(b.fiscalPeriod));
 return {version:'1.0.0',state:rows.some(r=>r.state==='AVAILABLE')?'AVAILABLE':'UNAVAILABLE',ticker,name:payload.profile.name,metric:definition,metrics:METRICS,period,rows,generatedAt:payload.generated_at_utc,policy:'LATEST_KNOWN',pitEligibility:'NOT_CERTIFIED',missing:rows.filter(r=>r.state!=='AVAILABLE').length};
}
const api={build,metrics:METRICS};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUFundamentalsContract=api;
})(typeof window!=='undefined'?window:globalThis);
