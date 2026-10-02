// An isolated shadow dataset exercises the existing Screener with observed metadata.
// No candidate becomes a production constituent and unavailable metrics stay null.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),Engine=require('../../screener/engine/engine.js'),Query=require('../../screener/engine/query.js');
export function validateShadowScreener(listings){
 const cols={s:listings.map(l=>l.providerSymbol+'|'+l.mic),n:listings.map(l=>l.companyName),co:listings.map(l=>l.issuerVerified===false||l.identityConflict===true||l.issuerAssociationAssessment?.status==='CONTRADICTED_QUOTED_ISSUER_ASSOCIATION'?null:l.domicile??null),ex:listings.map(l=>l.mic??null),cls:listings.map(l=>l.shareType??null)};
 for(const col of ['ipo','sec','sic2','div','idx','was','price','avgVol','dollarVol','mcap','revGrowth','epsGrowth','grossMargin','fcfMargin','pe','ps','evEbitda','fcfYield','distSma50','distSma200','dist52wH','perf6m','perf1y'])cols[col]=listings.map(()=>null);
 const dataset=Engine.createDataset({schema:'vu-screener-universe-1.0.0',cols});
 const run=(field,op,value)=>{const query=Query.validate({v:1,groups:[{id:'isolated',op:'AND',filters:[{field,op,value}]}]});const result=Engine.evaluate(dataset,query);
  return{field,operator:op,value,matches:result.count,missing:result.funnel.at(-1)?.missing??null};};
 const metadata=[run('country','in',['DE']),run('exchange','in',['XETR'])];
 const unavailable=['marketCap','revenueGrowth','epsGrowth','pe','priceVsSma200'].map(field=>run(field,'gte',0));
 return{schemaVersion:'marketstack-screener-fitness-1.0.0',scope:'ASSOCIATED_REFERENCE_METADATA_SHADOW_DATASET_NOT_PRODUCTION_CONSUMER_UNIVERSE',
  sampledListings:listings.length,quarantinedIssuerDomicileRows:cols.co.filter((v,i)=>v===null&&listings[i].domicile!=null).length,metadataDiagnostics:metadata,unavailableMetricDiagnostics:unavailable,
  missingValuesBecomeZero:unavailable.some(r=>r.matches!==0),productionAdmission:false,
  technical:'BLOCKED',fundamental:'BLOCKED',currencySafety:'EXISTING_PRICE_AND_DOLLAR_VOLUME_FIELDS_ARE_USD_SPECIFIC_NON_USD_RAW_VALUES_NOT_INJECTED',
  caveat:'Reference domicile association is exercised as input metadata, not independently certified investable issuer domicile. Only accepted Search/Watchlist/Chart coverage is currently served.'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input='reports/marketstack/germany_company_master.json',bytes=readFileSync(input),j=JSON.parse(bytes),r=validateShadowScreener(j.listings);
 r.generatedAt=j.generatedAt;r.inputProvenance={path:input,sha256:createHash('sha256').update(bytes).digest('hex')};
 writeFileSync('reports/marketstack/screener_marketstack_fitness.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r));
}
