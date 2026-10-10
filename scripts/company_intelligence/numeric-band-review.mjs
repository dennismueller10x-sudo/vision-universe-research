/* Three targeted acceptance reads; existing Tiingo adapter + SEC. No price/factor writes. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{createTiingoProvider}=require('../../providers/tiingo/adapter.js');
const samples=[['BOH','MID_CAP'],['SBSI','SMALL_CAP'],['AMPY','MICRO_CAP']];
const today=new Date().toISOString().slice(0,10),from=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
const provider=createTiingoProvider({apiKey:process.env.TIINGO_API_KEY,fetchImpl:(url,init)=>fetch(url,init),limits:{requestsPerMinute:3,requestsPerHour:3,requestsPerDay:3,maxRetries:0,concurrency:1}});
const rows=[];
for(const [ticker,expectedBand] of samples){
 const detail=JSON.parse(readFileSync(new URL(`../../discover/data/stocks/US_REAL/${ticker}.json`,import.meta.url)));
 const cik=detail.fundamentals?.cik;if(!/^\d{10}$/.test(cik||''))throw Error('NUMERIC_REVIEW_IDENTITY_MISSING');
 const quote=await provider.getDailyBars(ticker,{from,to:today,currency:'USD'});
 const bars=quote.data?.bars||[],bar=bars.at(-1);
 if(!quote.available||!bar||!Number.isFinite(bar.close)||bar.close<=0||bar.date>today||Date.now()-Date.parse(bar.date)>4*86400000){
  console.log(JSON.stringify({ticker,available:quote.available,reason:quote.reason,status:quote.status,budgetSource:quote.source,barCount:bars.length,barKeys:bar?Object.keys(bar):[],priceDate:bar?.date,keyConfigured:Boolean(process.env.TIINGO_API_KEY)}));
  throw Error('CURRENT_NUMERIC_PRICE_UNAVAILABLE_'+ticker);
 }
 const sourceUrl=`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
 const response=await fetch(sourceUrl,{headers:{'User-Agent':'VisionUniverseResearch info@visionuniverse.de'},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('CURRENT_SHARE_SOURCE_UNAVAILABLE_'+ticker);
 const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>12*1024*1024)throw Error('SHARE_SOURCE_BUDGET_EXCEEDED');
 const facts=JSON.parse(bytes);if(String(facts.cik).padStart(10,'0')!==cik)throw Error('SHARE_SOURCE_IDENTITY_MISMATCH');
 const shares=(facts.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares||[]).filter(x=>Number.isFinite(x.val)&&x.val>0&&x.end<=bar.date&&x.filed<=today&&['10-Q','10-K'].includes(x.form));
 shares.sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));const latest=shares[0];
 if(!latest||Date.parse(bar.date)-Date.parse(latest.end)>180*86400000||new Set(shares.filter(s=>s.end===latest.end&&s.filed===latest.filed).map(s=>s.val)).size!==1)throw Error('CURRENT_UNAMBIGUOUS_SHARE_COUNT_REQUIRED_'+ticker);
 const marketCapUSD=bar.close*latest.val,band=marketCapUSD>=10e9?'LARGE_CAP':marketCapUSD>=2e9?'MID_CAP':marketCapUSD>=300e6?'SMALL_CAP':marketCapUSD>=50e6?'MICRO_CAP':'NANO_CAP';
 if(band!==expectedBand)throw Error('NUMERIC_BAND_NOT_REPRODUCED_'+ticker);
 rows.push({ticker,companyId:'iss_cik_'+cik,companyName:detail.companyName,band,marketCapUSD,priceUSD:bar.close,priceAsOf:bar.date,priceSource:'EXISTING_TIINGO_DAILY_ADAPTER',shares:latest.val,sharesAsOf:latest.end,sharesFiled:latest.filed,shareForm:latest.form,shareAccession:latest.accn,sourceUrl,sourceSha256:createHash('sha256').update(bytes).digest('hex'),basis:'CURRENT_UNADJUSTED_USD_CLOSE_TIMES_LATEST_UNAMBIGUOUS_REPORTED_COMMON_SHARES',limitation:'Reported shares have their own date; this is a dated size-band QA calculation, not an intraday market-cap promise.'});
}
const report={status:'PASS',checkedAt:new Date().toISOString(),thresholdsUSD:{MID_CAP:[2e9,10e9],SMALL_CAP:[300e6,2e9],MICRO_CAP:[50e6,300e6]},rows,newDataProvider:false,productionMarketDataWrites:0,broadDiscovery:false};
const i=process.argv.indexOf('--evidence');if(i<0)throw Error('EVIDENCE_PATH_REQUIRED');writeFileSync(process.argv[i+1],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
