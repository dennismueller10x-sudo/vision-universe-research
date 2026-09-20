/* Presentation boundary for the existing Technical Intelligence bundle.
 * Keeps chart annotations, counts and scenario evidence; computes no signals. */
(function(g){
'use strict';
function fail(reason){return {state:'UNAVAILABLE',reason};}
function date(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function build(file,{ticker,now=new Date().toISOString().slice(0,10)}){
 const b=file?.bundle,bars=file?.bars;
 if(file?.instrumentId!==ticker||file.isMock!==false||file.dataMode!=='real'||!file.source||!file.snapshotId||b?.instrumentId!==ticker||b.methodologyVersion!=='technical-v1.0.0')return fail('INVALID_TECHNICAL_PROVENANCE');
 if(!date(now)||!date(b.dataCutoff)||!date(b.analysisTime)||b.dataCutoff>b.analysisTime||b.analysisTime>now||file.priceSeriesType!==b.priceSeriesType||b.priceSeriesType!=='SPLIT_ADJUSTED')return fail('INVALID_ANALYSIS_TIME');
 const times=bars?.timestamps;
 if(!Array.isArray(times)||times.length<2||!Number.isInteger(bars.fromIndex)||bars.fromIndex<0||bars.fromIndex+times.length-1!==b.dataCutoffIndex)return fail('INVALID_CHART_WINDOW');
 if(!['open','high','low','close','volume'].every(key=>Array.isArray(bars[key])&&bars[key].length===times.length))return fail('INVALID_CHART_COLUMNS');
 for(let i=0;i<times.length;i++){
  if(!date(times[i])||times[i]>b.dataCutoff||(i&&times[i]<=times[i-1]))return fail('INVALID_BAR_TIME');
  if(!['open','high','low','close'].every(key=>Number.isFinite(bars[key][i])&&bars[key][i]>0)||bars.high[i]<Math.max(bars.open[i],bars.close[i],bars.low[i])||bars.low[i]>Math.min(bars.open[i],bars.close[i])||!Number.isFinite(bars.volume[i])||bars.volume[i]<0)return fail('INVALID_OHLCV');
 }
 if(times.at(-1)!==b.dataCutoff)return fail('INCOMPLETE_CHART_WINDOW');
 const elliott=b.elliott;
 if(!elliott||elliott.isProbability!==false||elliott.confidenceType!=='method_fit'||elliott.asOf!==b.dataCutoff||!Array.isArray(b.annotations?.annotations)||!Array.isArray(b.scenarios?.scenarios))return fail('INVALID_WORKSPACE_EVIDENCE');
 const series=b.chartSeries;
 if(!series||typeof series!=='object'||Object.values(series).some(col=>!Array.isArray(col)||col.length!==times.length||col.some(v=>v!==null&&!Number.isFinite(v))))return fail('INVALID_CHART_SERIES');
 const historicalTypes=new Set(['PIVOT','SWING_SEGMENT','WAVE_SEGMENT','STRUCTURE_EVENT','FIB_ANCHOR','STRUCTURE_LABEL','WAVE_LABEL','STATE_LABEL','NOW_DIVIDER']);
 for(const a of b.annotations.annotations){
  if(!a||typeof a.type!=='string'||!a.type||!['CONFIRMED','DEVELOPING','PROJECTED'].includes(a.status)||!Array.isArray(a.layers)||a.layers.some(v=>typeof v!=='string')||!Number.isFinite(a.zOrder))return fail('INVALID_ANNOTATION');
  if([a.startTime,a.endTime].some(t=>t!==null&&!date(t))||[a.startPrice,a.endPrice].some(v=>v!==null&&!Number.isFinite(v)))return fail('INVALID_ANNOTATION');
  if(a.startTime&&a.endTime&&a.startTime>a.endTime)return fail('INVALID_ANNOTATION_TIME');
  if(a.status!=='PROJECTED'&&historicalTypes.has(a.type)&&[a.startTime,a.endTime].some(t=>t&&t>b.dataCutoff))return fail('INVALID_ANNOTATION_TIME');
  if(a.meta?.confirmedAt&&(!date(a.meta.confirmedAt)||a.meta.confirmedAt>b.dataCutoff))return fail('INVALID_ANNOTATION_TIME');
  if(a.type==='SERIES'&&!Object.hasOwn(series,a.meta?.seriesRef))return fail('INVALID_CHART_SERIES');
 }
 for(const count of [elliott.primaryCount,elliott.alternativeCount])for(const wave of count?.waves||[]){if(wave.status!=='PROJECTED'&&(!date(wave.fromTime)||!date(wave.toTime)||wave.toTime>b.dataCutoff||wave.fromTime>wave.toTime))return fail('INVALID_WAVE_TIME');}
 if(b.scenarios.scenarios.some(s=>s.instrumentId!==ticker||s.dataCutoff!==b.dataCutoff||!date(s.analysisTime)||s.analysisTime<s.dataCutoff||s.analysisTime>b.analysisTime))return fail('INVALID_SCENARIO_TIME');
 const states={WEAKENED:'Abgeschwächt',AWAITING_TRIGGER:'Wartet auf Bestätigung',CONDITIONAL:'Bedingtes Szenario',ACTIVE:'Aktiv',INVALIDATED:'Ungültig',EXPIRED:'Abgelaufen'};
 return {state:'AVAILABLE',version:'1.0.0',ticker,asOf:b.dataCutoff,analysisTime:b.analysisTime,snapshotId:file.snapshotId,methodology:b.methodologyVersion,
  priceBasis:b.priceSeriesType,chart:{bars,annotations:b.annotations.annotations,series:b.chartSeries},
  scenarios:b.scenarios.scenarios.map(s=>({id:s.scenarioId,kind:s.type,label:{PRIMARY:'Basisszenario',ALTERNATIVE:'Alternatives Szenario',BEAR:'Abwärtsszenario'}[s.type]||'Weiteres Szenario',status:states[s.status]||'Status prüfen',direction:s.direction,
   invalidation:s.invalidation,targets:s.targetZones||[],confirmation:s.whatMustHappen,expiration:s.expiryRule,support:s.supportingEvidence||[],conflicts:s.conflictingEvidence||[]})),
  elliott:{status:elliott.status,label:elliott.status==='AMBIGUOUS'?'Mehrere Zählungen sind möglich':'Zählung im Detail prüfen',primary:elliott.primaryCount,alternative:elliott.alternativeCount,methodology:elliott.methodologyVersion,methodFit:elliott.confidence,isProbability:false,disclaimer:elliott.disclaimer},
  legacyHref:'/quant/technical/?symbol='+encodeURIComponent(ticker),priceHistoryHref:'/vu2/?view=stock&ticker='+encodeURIComponent(ticker)};
}
const api={build};if(typeof module!=='undefined'&&module.exports)module.exports=api;else g.VUTechnicalWorkspaceContract=api;
})(typeof window!=='undefined'?window:globalThis);
