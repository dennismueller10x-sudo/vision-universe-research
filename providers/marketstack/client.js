/* Node-only ingestion transport. Credentials enter the URL only inside fetch;
   the shared VU transport/cache/error state never contains a credential URL. */
'use strict';
const MarketClient = require('../../quant/engines/market-client.js');
const DEFAULT_BASE_URL = 'https://api.marketstack.com/v2';
const DOCUMENTATION = 'https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json';
function estimateCredits(endpoint, params = {}) {
  const path = String(endpoint).split('?')[0].replace(/\/$/, '');
  if (/\/(etflist|etfholdings)$/.test(path)) return 20;
  // Conservatively reserve one credit per requested symbol on every page.
  // This is an estimate, not observed billing; batching saves HTTP overhead.
  if (params.symbols) return Math.max(1, new Set(String(params.symbols).split(',').filter(Boolean)).size);
  return 1;
}
function createMarketstackClient(options = {}) {
  const apiKey = options.apiKey === undefined ? process.env.MARKETSTACK_API_KEY : options.apiKey;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxRequests = options.maxRequests === undefined ? 100 : options.maxRequests;
  const maxCredits = options.maxCredits === undefined ? 100 : options.maxCredits;
  const maxRetries = options.maxRetries === undefined ? 2 : options.maxRetries;
  const timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs;
  const minIntervalMs = options.minIntervalMs === undefined ? 250 : options.minIntervalMs;
  const cacheTtlMs = options.cacheTtlMs === undefined ? 300000 : options.cacheTtlMs;
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  if (baseUrl !== DEFAULT_BASE_URL && options.allowTestBaseUrl !== true) throw new Error('Marketstack API version must remain v2');
  for (const [name, value] of Object.entries({maxRequests,maxCredits,maxRetries,timeoutMs,minIntervalMs,cacheTtlMs})) {
    if (!Number.isFinite(value) || value < 0 || (name === 'timeoutMs' && value === 0)) throw new Error('Invalid Marketstack option: ' + name);
  }
  if (!Number.isInteger(maxRequests) || !Number.isInteger(maxRetries)) throw new Error('Request and retry limits must be integers');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Marketstack base URL must be credential-free HTTPS');
  if (base.hostname !== 'api.marketstack.com' && options.allowTestBaseUrl !== true) throw new Error('Marketstack credentials may only be sent to api.marketstack.com');
  const stats = {provider:'marketstack',requestsAttempted:0,estimatedCreditsConsumed:0,cacheHits:0,deduplicated:0,retries:0,budgetBlocks:0,errors:0,symbolsProcessed:0,symbolRequestUnits:0,successfulRequests:0,creditSemantics:'CONSERVATIVE_ESTIMATE',documentation:DOCUMENTATION};
  const cache = new Map(), inflight = new Map(), seenSymbols=new Set();
  let queue = Promise.resolve(), lastAttempt = null, lastError = null, attemptContext;
  const endpointAttempts=new Map();
  const endpointIntervals={ '/companyratings':60000,...(options.endpointIntervals||{}) };
  const sanitize = value => {
    if (typeof value === 'string') return value.split(String(apiKey || '\u0000')).join('[REDACTED]').replace(/access_key(?:=|%3D)[^&\s"<>]+/gi,'access_key=[REDACTED]');
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(access_key|api_key)$/i.test(key)).map(([key,v]) => [key,sanitize(v)]));
    return value;
  };
  const error = (reason, status = null, message = reason, source = 'provider') => ({ok:false,data:null,reason,status,message:sanitize(message),source});
  async function safeFetch(publicUrl) {
    const ctx = attemptContext;
    const cost = estimateCredits(ctx.endpoint, ctx.params);
    if (stats.requestsAttempted + 1 > maxRequests || stats.estimatedCreditsConsumed + cost > maxCredits) {
      stats.budgetBlocks++; ctx.failure = error('budgetExceeded',null,'Marketstack run safety budget exhausted','clientBudget');
      return {status:403,text:async () => '{}'};
    }
    const lastEndpoint=endpointAttempts.get(ctx.endpoint),endpointGap=endpointIntervals[ctx.endpoint]||0;
    const wait = Math.max(lastAttempt === null ? 0 : Math.max(0,minIntervalMs - (now()-lastAttempt)),lastEndpoint===undefined ? 0 : Math.max(0,endpointGap-(now()-lastEndpoint)));
    if (wait) await sleep(wait);
    if (!options.sharedBudget && options.allowUncoordinatedTestRequests !== true) {
      ctx.failure = error('budgetUnverified',null,'Shared current-account budget evidence is required','clientBudget');
      return {status:403,text:async () => '{}'};
    }
    if (options.sharedBudget) {
      try { await options.sharedBudget.reserve({cost,endpoint:ctx.endpoint}); }
      catch (failure) { ctx.failure=error(failure.code||'budgetReservationFailed',null,'Shared request reservation refused','clientBudget');return {status:403,text:async()=> '{}'}; }
    }
    stats.requestsAttempted++; stats.estimatedCreditsConsumed += cost;
    // Persist the conservative reservation before any external request.
    if (options.onAttempt) {
      try { await options.onAttempt({requestsAttempted:stats.requestsAttempted,estimatedCreditsConsumed:stats.estimatedCreditsConsumed}); }
      catch (_) { ctx.failure=error('accountingPersistenceFailed',null,'Request accounting could not be persisted','clientBudget');return {status:403,text:async()=> '{}'}; }
    } lastAttempt = now();endpointAttempts.set(ctx.endpoint,lastAttempt);
    const requestedSymbols=ctx.params.symbols?String(ctx.params.symbols).split(',').filter(Boolean):ctx.params.ticker?[String(ctx.params.ticker)]:[];
    stats.symbolRequestUnits+=requestedSymbols.length;requestedSymbols.forEach(symbol=>seenSymbols.add(symbol));stats.symbolsProcessed=seenSymbols.size;
    const url = new URL(publicUrl); url.searchParams.set('access_key',apiKey);
    const controller = new AbortController();
    let timer;
    try {
      // Race includes body download; fetch resolution alone does not end timeout.
      const work = (async () => {
        const response = await fetchImpl(url.toString(),{method:'GET',signal:controller.signal,redirect:'error'});
        const raw = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
        let body;
        try { body = JSON.parse(raw); } catch (_) { ctx.failure = error('invalidResponse',response.status,'Marketstack returned non-JSON data'); body = {}; }
        if (response.status === 429 && !(body && body.error)) ctx.failure = error('rateLimited',429,'Marketstack rate limit reached');
        if (response.status === 404 && !(body && body.error)) ctx.failure = error('dataUnavailable',404,'Marketstack resource unavailable');
        if(body&&typeof body==='object'&&!body.error&&Number(body.code)>=400&&String(body.message||'').toLowerCase()==='error') {
          body={error:{code:Number(body.code),type:Number(body.code)===404?'data_not_available':Number(body.code)>=500?'internal_error':'provider_error'}};
        }
        if (body && body.error) {
          const numericTypes={105:'function_access_restricted',106:'rate_limit_reached',104:'usage_limit_reached',0:'internal_error'};
          const code = String(body.error.type || numericTypes[body.error.code] || body.error.code || 'providerError');
          const reason = ({function_access_restricted:'entitlementRestricted',unauthorized:'authError',too_many_requests:'quotaExceeded',usage_limit_reached:'quotaExceeded',daily_limit_reached:'quotaExceeded',fair_use_limit_reached:'quotaExceeded',fairuse_limit_reached:'quotaExceeded',monthly_limit_reached:'quotaExceeded',rate_limit_reached:'rateLimited',data_not_available:'dataUnavailable',internal_error:'internalError',maintenance:'internalError'})[code] || 'providerError';
          ctx.failure = {...error(reason,response.status,'Marketstack error: ' + code),providerErrorType:sanitize(code),providerErrorCode:sanitize(body.error.code??null)};
          ctx.providerCode = sanitize(code);
        }
        if(options.onResponse){try{await options.onResponse({body:sanitize(body),endpoint:ctx.endpoint,params:{...ctx.params},apiVersion:'v2',host:'api.marketstack.com',status:response.status,retrievedAt:new Date(now()).toISOString()});}catch(_){ctx.failure=error('responsePersistenceFailed',null,'Private source response could not be persisted','privateStorage');}}
        const header = response.headers && typeof response.headers.get === 'function' ? response.headers.get('retry-after') : null;
        if (header) { const seconds = Number(header); ctx.retryAfterMs = Number.isFinite(seconds) ? seconds*1000 : Math.max(0,Date.parse(header)-now()); }
        // The legacy transport treats 429 as a terminal quota event. Our outer
        // loop distinguishes per-second throttling from monthly exhaustion.
        return {status:response.status === 429 ? 400 : response.status,headers:response.headers,text:async () => JSON.stringify(sanitize(body))};
      })();
      const timeout = new Promise((_,reject) => { timer = setTimeout(() => {controller.abort();reject(new Error('timeout'));},timeoutMs); });
      return await Promise.race([work,timeout]);
    } catch (_) {
      // Never retain the original exception; fetch often includes the full URL.
      ctx.failure = error(controller.signal.aborted ? 'timeout' : 'networkError',0,'Marketstack transport failed');
      return {status:502,text:async () => '{}'};
    } finally { clearTimeout(timer); }
  }
  const transport = MarketClient.createMarketClient({providerId:'marketstack',fetchImpl:safeFetch,now,sleep,
    limits:{requestsPerMinute:Infinity,requestsPerHour:Infinity,requestsPerDay:Infinity,concurrency:1,maxRetries:0,maxStaleMs:0},ttl:{marketstack:0}});
  function request(endpoint, params = {}, opts = {}) {
    if (!apiKey || typeof fetchImpl !== 'function') return Promise.resolve(error('notConfigured',null,'MARKETSTACK_API_KEY is not configured','configuration'));
    if (typeof endpoint !== 'string' || !/^\/[a-zA-Z0-9_/{},.-]+$/.test(endpoint) || endpoint.includes('..')) return Promise.resolve(error('invalidEndpoint',null,'Expected a relative Marketstack endpoint','validation'));
    if (Object.keys(params).some(k => /access_key|api_key/i.test(k))) return Promise.resolve(error('invalidParameters',null,'Credentials must not be supplied as parameters','validation'));
    const query = new URLSearchParams();
    Object.keys(params).sort().forEach(key => {if(params[key]!==undefined && params[key]!==null) query.set(key,String(params[key]));});
    const publicUrl = baseUrl.replace(/\/$/,'') + endpoint + (query.size ? '?' + query.toString() : '');
    const key = publicUrl, ttl = opts.cacheTtlMs === undefined ? cacheTtlMs : opts.cacheTtlMs;
    const cached = cache.get(key);
    if (cached && cached.expires > now()) {stats.cacheHits++;return Promise.resolve({...cached.result,fromCache:true});}
    if (inflight.has(key)) {stats.deduplicated++;return inflight.get(key);}
    async function execute() {
      for(let retry=0;retry<=maxRetries;retry++) {
        const ctx = {endpoint,params}; attemptContext = ctx;
        const res = await transport.request({kind:'marketstack',url:publicUrl,allowStale:false,detectError:body => body && body.error ? {status:400,message:'Marketstack provider error'} : null});
        if(res.ok && !ctx.failure) {
          const result = {ok:true,data:res.data,fromCache:false,stale:false,retrievedAt:new Date(now()).toISOString(),apiVersion:'v2',host:'api.marketstack.com',endpoint};
          if(ttl>0) cache.set(key,{result,expires:now()+ttl});
          stats.successfulRequests++;lastError=null;return result;
        }
        const failure = ctx.failure || error(res.status===401 ? 'authError' : res.status===403 ? 'entitlementRestricted' : 'requestFailed',res.status,'Marketstack request failed');
        const transient = ['networkError','timeout','rateLimited','internalError'].includes(failure.reason) || (!ctx.failure && [408,425,500,502,503,504].includes(res.status));
        if(transient && retry<maxRetries) {
          const backoff = Math.max((options.baseBackoffMs ?? 500)*2**retry,ctx.retryAfterMs || 0);
          if(backoff>60000) {lastError={...failure,retryAfterSeconds:backoff/1000};return lastError;}
          stats.retries++;await sleep(backoff);continue;
        }
        stats.errors++;lastError=failure;return failure;
      }
    }
    const promise = queue.then(execute).catch(() => error('requestFailed',null,'Marketstack client failed'));
    queue = promise.then(()=>{},()=>{});inflight.set(key,promise);
    promise.finally(()=>inflight.delete(key));return promise;
  }
  async function paginate(endpoint, params = {}, opts = {}) {
    const maxPages=opts.maxPages===undefined ? 1000 : opts.maxPages;
    const limit=Number(params.limit || 1000);let offset=Number(params.offset || 0);
    if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(offset)||offset<0||!Number.isInteger(maxPages)||maxPages<1) return error('invalidPagination',null,'Invalid pagination controls','validation');
    const rows=[];let pagination=null,pages=0,retrievedAt=null;
    for(;pages<maxPages;pages++) {
      const res=await request(endpoint,{...params,limit,offset},opts);
      if(!res.ok) return {...res,data:rows,complete:false,pages,nextOffset:offset,pagination};
      retrievedAt=res.retrievedAt;
      const page=opts.extract ? opts.extract(res.data) : Array.isArray(res.data.data)?res.data.data:res.data.data&&res.data.data.tickers;
      pagination=res.data.pagination || null;
      if(!Array.isArray(page)) return {...error('invalidResponse',null,'Expected a paginated data array'),data:rows,complete:false,pages:pages+1,nextOffset:offset};
      if(pagination && (Number(pagination.offset)!==offset || (pagination.count!==undefined && Number(pagination.count)!==page.length))) return {...error('invalidPagination',null,'Provider pagination did not advance as requested'),data:rows,complete:false,pages:pages+1,nextOffset:offset};
      rows.push(...page);offset+=page.length;
      const total=pagination && Number(pagination.total);
      if((Number.isFinite(total) && offset>=total)||(!pagination && page.length<limit)) return {ok:true,data:rows,complete:true,pages:pages+1,nextOffset:offset,pagination,retrievedAt};
      if(page.length===0) return {...error('invalidPagination',null,'Empty page before provider total'),data:rows,complete:false,pages:pages+1,nextOffset:offset};
    }
    return {...error('pageBudgetExceeded',null,'Marketstack page safety limit reached','clientBudget'),data:rows,complete:false,pages,nextOffset:offset,pagination,retrievedAt};
  }
  async function requestBatches(endpoint, symbols, params = {}, opts = {}) {
    const batchSize=opts.batchSize ?? 100;
    if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100) return error('invalidBatchSize',null,'Batch size must be 1..100','validation');
    const unique=[...new Set(symbols)];const results=[];
    for(let i=0;i<unique.length;i+=batchSize) {
      const batch=unique.slice(i,i+batchSize);const res=await paginate(endpoint,{...params,symbols:batch.join(',')},opts);
      results.push({symbols:batch,...res});if(!res.ok) return {ok:false,results,processed:i,remaining:unique.length-i,reason:res.reason};
    }
    return {ok:true,results,processed:unique.length,remaining:0};
  }
  return {request,paginate,requestBatches,clearCache:()=>{cache.clear();transport.clearCache();},
    stats:()=>({...stats,maxRequests,maxCredits,requestsRemaining:Math.max(0,maxRequests-stats.requestsAttempted),creditsRemaining:Math.max(0,maxCredits-stats.estimatedCreditsConsumed),lastError}),
    health:()=>({provider:'marketstack',status:!apiKey?'notConfigured':lastError?'degraded':'available',lastError,authenticationState:stats.successfulRequests?'RESPONSE_OBSERVED':'NOT_TESTED'})};
}
module.exports={createMarketstackClient,estimateCredits,DEFAULT_BASE_URL,DOCUMENTATION};
