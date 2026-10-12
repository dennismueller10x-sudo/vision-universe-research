/** Data-only residual-factor contract. No strategy, regression, or performance calculation. */
import {createHash} from 'node:crypto';
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
export const RESIDUAL_FACTOR_CONTRACT=freeze({
 schema:'supertrader-residual-factor-contract-1.0.0',methodId:'residual_momentum',priorReference:'#589',
 source:{id:'residual2011',url:'https://repub.eur.nl/pub/22252/ResidualMomentum-2011.pdf',locator:'Accepted manuscript pp.9–12, Equation (1), French(2010) reference'},
 original:{regressionMonths:36,regressionMonthOffsets:[-36,-1],formationMonthOffsets:[-12,-2],formationMonths:11,interceptEstimated:true,estimatedAlphaIncludedInScore:false,scoreResidualFormula:'stockExcessReturn - beta_market*mktRf - beta_smb*smb - beta_hml*hml; estimated intercept is NOT subtracted',alphaRationale:'Manuscript p11: including the estimated alpha would make stocks with large positive old t-36..t-13 returns rank low; authors explicitly avoid that long-term-reversal effect. This is not raw OLS epsilon=excessReturn-alpha-beta*F.',factors:['mktRf','smb','hml'],stockReturnBasis:'MONTHLY_TOTAL_RETURN_MINUS_MATCHED_RF',standardization:'RESIDUAL_RETURN_DIVIDED_BY_RESIDUAL_STANDARD_DEVIATION_OVER_SAME_11_MONTHS',stockWeights:'EQUAL_WEIGHT_DECILE',publishedHoldingMonths:[1,3,6,12],chosenHoldingMonths:null,eligibleHistory:'COMPLETE_36_MONTHS',stockUniverse:'DOMESTIC_PRIMARY_NYSE_AMEX_NASDAQ',excludedInstruments:['CLOSED_END_FUNDS','REITS','UNIT_TRUSTS','ADRS','FOREIGN_STOCKS'],priceRule:'EXCLUDE_STOCK_MONTHS_BELOW_ONE_DOLLAR'},
 engineEligibility:'BLOCKED_RULE_VARIANT_UNSELECTED',
 allowedDataMode:'EX_POST_SCIENTIFIC_PARTIAL',historicalAsKnown:'BLOCKED_UNCERTIFIED_MONTHLY_PUBLICATION_VINTAGES',
 scientificInterpretation:'The paper cites one French(2010) historical research dataset and uses lagged economic observations; it does not specify archived monthly publication vintages. A frozen later revised snapshot supports only explicitly ex-post scientific partial research, not reproduction of the original data snapshot or an as-known/PIT/live claim.',
 conventionChanges:['JANUARY_2025_FIZ_TO_CIZ_RECONSTRUCTION','JUNE_2024_RF_IBBOTSON_TO_ICE_BOFA'],
 rights:'FREE_PUBLIC_DOWNLOAD_COPYRIGHTED_REDISTRIBUTION_UNCERTIFIED',
 noPaperReturnInheritance:true,noMissingFactorProxy:true,noFrozenTenMethodChanges:true
});
export const FACTOR_URLS=freeze({current:'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip',archiveIndex:'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/f-f_factors_archive.html',library:'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html'});
const validMonth=m=>typeof m==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const ordinal=m=>{const[y,n]=m.split('-').map(Number);return y*12+n-1;};
const monthAt=n=>`${Math.floor(n/12).toString().padStart(4,'0')}-${(n%12+1).toString().padStart(2,'0')}`;
const officialUrl=u=>typeof u==='string'&&/^https:\/\/mba\.tuck\.dartmouth\.edu\/pages\/faculty\/ken\.french\/(?:ftp|Data_Library\/Historical_Archives\/[^/]+\/ftp)\/F-F_Research_Data_Factors(?:_CSV)?\.zip$/.test(u);
export function parseFrenchMonthlyFactors(text,{sourceUrl, retrievedAt, archiveSha256, dataMode}={}) {
 if(typeof text!=='string'||!officialUrl(sourceUrl)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(retrievedAt||'')||!Number.isFinite(Date.parse(retrievedAt)))throw Error('OFFICIAL_SNAPSHOT_PROVENANCE_REQUIRED');
 if(dataMode!=='EX_POST_SCIENTIFIC_PARTIAL')return {status:'BLOCKED_FACTOR_DATA_MODE',reason:'NO_CERTIFIED_CONTEMPORANEOUS_MONTHLY_VINTAGES',pitCertified:false,rows:[]};
 if(archiveSha256!==undefined&&!/^[a-f0-9]{64}$/.test(archiveSha256))throw Error('INVALID_ARCHIVE_CHECKSUM');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),headers=lines.filter(l=>!/^\s*\d{4}(?:\d{2})?\s*,/.test(l)).filter(l=>l.trim()).slice(0,16);
 const header=lines.findIndex(l=>/^\s*,\s*Mkt-RF\s*,\s*SMB\s*,\s*HML\s*,\s*RF\s*$/.test(l));
 if(header<0)throw Error('FF3_RF_MONTHLY_HEADER_REQUIRED');
 const rows=[],seen=new Set();let started=false;
 for(let i=header+1;i<lines.length;i++){
  const line=lines[i].trim();if(!/^\d{6}\s*,/.test(line)){if(started)break;continue;}
  started=true;const cells=line.split(',').map(x=>x.trim());if(cells.length!==5)throw Error('FACTOR_COLUMN_COUNT_MISMATCH');
  const month=`${cells[0].slice(0,4)}-${cells[0].slice(4)}`;if(!validMonth(month)||seen.has(month))throw Error('INVALID_OR_DUPLICATE_FACTOR_MONTH');seen.add(month);
  const values=cells.slice(1).map(x=>x!==''?Number(x):NaN);const missing=values.some(x=>!Number.isFinite(x)||x===-99.99||x===-999);
  rows.push({month,...Object.fromEntries(['mktRf','smb','hml','rf'].map((key,j)=>[key,missing?null:values[j]/100])),status:missing?'MISSING':'OBSERVED',knownFrom:null});
 }
 if(!rows.length)throw Error('MONTHLY_FACTORS_REQUIRED');rows.sort((a,b)=>a.month.localeCompare(b.month));
 return {status:'READY_EX_POST_SCIENTIFIC_PARTIAL',dataMode,pitCertified:false,rows,provenance:{sourceUrl,retrievedAt,archiveSha256:archiveSha256??null,csvSha256:createHash('sha256').update(text).digest('hex'),publicHeaders:headers,dataStartMonth:rows[0].month,dataCutMonth:rows.at(-1).month,publicationVintage:'FROZEN_REVISED_SNAPSHOT_NOT_HISTORICAL_AS_KNOWN',rights:RESIDUAL_FACTOR_CONTRACT.rights,conventionChanges:RESIDUAL_FACTOR_CONTRACT.conventionChanges}};
}
export function residualFactorWindow(dataset,{formationMonth,claimMode}={}) {
 if(!validMonth(formationMonth))throw Error('VALID_FORMATION_MONTH_REQUIRED');
 if(claimMode!=='EX_POST_SCIENTIFIC_PARTIAL')return {status:'BLOCKED_HISTORICAL_AS_KNOWN',reason:'CONTEMPORANEOUS_MONTHLY_FACTOR_RELEASE_VINTAGES_UNCERTIFIED',rows:[],pitCertified:false};
 if(dataset?.status!=='READY_EX_POST_SCIENTIFIC_PARTIAL'||dataset.dataMode!==claimMode||dataset.pitCertified!==false) return {status:'BLOCKED_FACTOR_CONTRACT',rows:[],pitCertified:false};
 const wanted=Array.from({length:36},(_,i)=>monthAt(ordinal(formationMonth)-36+i)),byMonth=new Map();
 for(const row of dataset.rows??[]){if(!validMonth(row.month)||byMonth.has(row.month))throw Error('INVALID_OR_DUPLICATE_FACTOR_MONTH');byMonth.set(row.month,row);}
 const missingMonths=wanted.filter(m=>!byMonth.has(m)||byMonth.get(m).status!=='OBSERVED'||['mktRf','smb','hml','rf'].some(k=>!Number.isFinite(byMonth.get(m)[k])));
 if(missingMonths.length)return {status:'BLOCKED_FACTOR_WINDOW_INCOMPLETE',missingMonths,rows:[],pitCertified:false};
 return {status:'READY_EX_POST_SCIENTIFIC_PARTIAL',formationMonth,rows:wanted.map(m=>byMonth.get(m)),regressionMonths:36,scoreMonths:wanted.slice(-12,-1),pitCertified:false,dataMode:claimMode,engineEligibility:RESIDUAL_FACTOR_CONTRACT.engineEligibility};
}
export function publicFactorContractProof(dataset) {
 if(dataset?.status!=='READY_EX_POST_SCIENTIFIC_PARTIAL')throw Error('PARSED_DATASET_REQUIRED');
 return {schema:'supertrader-public-factor-contract-proof-1.0.0',methodId:'residual_momentum',source:RESIDUAL_FACTOR_CONTRACT.source,dataMode:dataset.dataMode,pitCertified:false,engineEligibility:RESIDUAL_FACTOR_CONTRACT.engineEligibility,officialUrls:FACTOR_URLS,provenance:dataset.provenance,monthlyRows:dataset.rows.length,missingMonthlyRows:dataset.rows.filter(r=>r.status!=='OBSERVED').length,factorValuesIncluded:false,noPerformanceMeasurement:true};
}
