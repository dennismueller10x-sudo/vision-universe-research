"""Reproduce conservative ETF/fund audit; provider rows are not account entitlements.
Run from any directory after account_evidence.json is available; never reads secrets.
"""
from pathlib import Path
import collections
import datetime
import json
import re

HERE = Path(__file__).resolve().parent
AUDIT = HERE.parent
MASTER = AUDIT / 'endpoints' / 'tiingo_full_symbol_master.json'
RUNTIME = AUDIT / 'runtime' / 'account_evidence.json'
US_EXCHANGES = {'NYSE','NASDAQ','NYSE ARCA','BATS','AMEX','NYSE MKT','NMFQS'}
CHINA_EXCHANGES = {'SHG','SHE'}
OTC_EXCHANGES = {'PINK','OTCGREY','OTCMKTS','EXPM','OTCBB','OTCQB','OTCD','OTCCE'}
EU_EXCHANGES = {'XETRA','XETR','FRA','FRANKFURT','LSE','LONDON','SIX','SWX','PAR','AMS','BRU','MIL','MAD','CPH','STO','OSL','HEL','VIE','EURONEXT'}
US_SAMPLES = 'SPY QQQ VOO VTI IWM DIA SCHD TLT HYG LQD GLD SLV ARKK XLF XLK XLE SMH SOXX'.split()
UCITS = [
 ('EUNL','iShares Core MSCI World UCITS ETF','Xetra'),
 ('SXR8','iShares Core S&P 500 UCITS ETF','Xetra'),
 ('VWCE','Vanguard FTSE All-World UCITS ETF','Xetra'),
 ('VWRL','Vanguard FTSE All-World UCITS ETF','LSE'),
 ('CSPX','iShares Core S&P 500 UCITS ETF','LSE'),
 ('IWDA','iShares Core MSCI World UCITS ETF','LSE'),
 ('EXS1','iShares DAX UCITS ETF','Xetra')]


def write(name, obj):
    (HERE / name).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')


def main():
    master = json.loads(MASTER.read_text())
    public_sources_path=AUDIT/'endpoints'/'public_sources.json'
    public_sources=json.loads(public_sources_path.read_text()) if public_sources_path.exists() else {}
    records = master['records']
    runtime = json.loads(RUNTIME.read_text()) if RUNTIME.exists() else {'responses':[],'authentication':'NOT_RUN'}
    by_ticker = collections.defaultdict(list)
    for r in records:
        by_ticker[r['ticker']].append(r)
    latest = {t:max(rr,key=lambda r:(r['endDate'],r['startDate'])) for t,rr in by_ticker.items()}
    observed_max = max(r['endDate'] for r in records)
    cutoff = (datetime.date.fromisoformat(observed_max)-datetime.timedelta(days=7)).isoformat()
    evidence = {}
    for response in runtime['responses']:
        for ref in response['references']:
            evidence[ref['id']] = response
            evidence[ref['id'].lower()] = response
    def summarize(typ):
        rr = [r for r in records if r['assetType']==typ]
        tickers = {r['ticker'] for r in rr}
        ll = [r for r in latest.values() if r['assetType']==typ]
        return {'provider_category':typ,'raw_rows':len(rr),'unique_symbols_ever_in_category':len(tickers),
                'latest_dated_record_category_symbols':len(ll),
                'multi_history_symbols':sum(len(by_ticker[t])>1 for t in tickers),
                'cross_asset_symbol_conflicts':sum(len({r['assetType'] for r in by_ticker[t]})>1 for t in tickers),
                'raw_by_exchange':dict(sorted(collections.Counter(r['exchange'] for r in rr).items())),
                'raw_by_currency':dict(sorted(collections.Counter(r['priceCurrency'] for r in rr).items())),
                'latest_record_by_exchange':dict(sorted(collections.Counter(r['exchange'] for r in ll).items())),
                'latest_record_recent_end_date_symbols':sum(r['endDate']>=cutoff for r in ll),
                'latest_record_older_end_date_symbols':sum(r['endDate']<cutoff for r in ll),
                'raw_us_exchange_rows':sum(r['exchange'] in US_EXCHANGES for r in rr),
                'raw_us_otc_rows':sum(r['exchange'] in OTC_EXCHANGES for r in rr),
                'raw_non_us_exchange_rows':sum(r['exchange'] in CHINA_EXCHANGES for r in rr),
                'raw_unknown_exchange_rows':sum(not r['exchange'] for r in rr),
                'raw_europe_exchange_rows':sum(r['exchange'].upper() in EU_EXCHANGES for r in rr),
                'active_listing_count':None,'inactive_delisted_listing_count':None,
                'account_accessible_full_category_count':None}
    def result(id):
        r=evidence.get(id) or evidence.get(id.lower())
        if r is None:
            return {'classification':'UNKNOWN','http_status':None,'reason':'NO_ACCOUNT_EVIDENCE'}
        payload=r.get('payload')
        positive = r.get('status')==200 and (isinstance(payload,dict) and bool(payload) or isinstance(payload,list) and bool(payload))
        category='AVAILABLE_CURRENT_PLAN' if positive else ('NOT_FOUND' if r.get('status')==404 else 'ENTITLEMENT_BLOCKED' if r.get('status') in (401,403) else 'UNKNOWN')
        return {'classification':category,'http_status':r.get('status'),'observed_at':r.get('observedAt'),
                'url':r['url'],'source_run_id':r.get('sourceRunId',runtime.get('runId')),'source_commit':r.get('sourceCommit',runtime.get('commit')),'fields':sorted(payload.keys()) if isinstance(payload,dict) else sorted({k for row in payload if isinstance(row,dict) for k in row}) if isinstance(payload,list) else [],
                'row_count':len(payload) if isinstance(payload,list) else None,'payload':payload}
    common = {'source':master['source'],'source_retrieved_at':master.get('retrieved_at', public_sources.get('retrieved_at')),
              'public_source_sha256':public_sources.get('sha256',{}).get('supported_tickers.zip'),
              'runtime_authentication':runtime.get('authentication'),'runtime_run_id':runtime.get('runId'),'runtime_actual_requests':runtime.get('actualRequests',len(runtime.get('responses',[]))),
              'warning':master['warning'],'freshness_cutoff':cutoff,
              'methodology':['Public provider assetType, not a legal ETF/fund taxonomy. ETF category includes products such as GLD/SLV trusts; Chinese ETFs510300/510050/510500/159915/159919 are labelled Stock and excluded from provider ETF-labelled totals.',
                             'Latest-dated record per symbol is a provisional counting view, not a canonical security identity; reused symbols and mixed categories remain conflicts.',
                             'Fresh endDate is a metadata freshness proxy. It is not proof of active listing or successful price access.',
                             'Public supported_tickers includes reserved future coverage, so totals are discovery counts only.',
                             'Exchange denotes venue; neither currency nor venue proves domicile. No name, ISIN, issuer, legal UCITS or CEF field exists in this six-column master.']}
    samples=[]
    for t in US_SAMPLES:
        samples.append({'ticker':t,'public_master_rows':by_ticker[t],
                        'metadata':result('etf-'+t.lower()+'-meta'),
                        'prices':result('etf-'+t.lower()+'-prices'),
                        'iex':result('etf-'+t.lower()+'-iex')})
    china_samples=[{'ticker':t,'public_master_rows':by_ticker[t],'metadata':result('china-etf-'+t+'-metadata'),'prices':result('china-etf-'+t+'-history'),'independent_adjustment_validation':'NOT_COMPLETED','quant_supertrader_backtest_fitness':'BLOCKED_UNTIL_INDEPENDENT_ADJUSTMENT_VALIDATION','mainland_feed_risk':'Independent BYD stock-bonus action audit found a three-for-one action unreflected in Tiingo adjusted series. This does not prove ETF samples fail, but adjusted fields alone do not establish safe mainland adjustment semantics.','classification_warning':'Known China ETF identity may disagree with provider assetType; do not add to common equities or assume allETFcategory counts are legal'} for t in ['510300','510040']]
    write('tiingo_etf_universe.json',{**common,'summary':{'ETF':summarize('ETF'),'Mutual Fund':summarize('Mutual Fund'),
          'Closed End Fund':{'raw_rows':None,'reason':'NOT_SEPARATELY_IDENTIFIABLE_FROM_MASTER'}},
          'etf_records':[r for r in records if r['assetType']=='ETF'],
          'mutual_fund_unique_symbols':sorted({r['ticker'] for r in records if r['assetType']=='Mutual Fund'}),
          'us_major_samples':samples,'china_ETF_account_samples':china_samples})
    ucits=[]
    for t,name,exchange in UCITS:
        outcomes={kind:result('ucits-'+t.lower()+'-'+kind) for kind in ['meta','prices','fund','fees']}
        positive=[kind for kind,r in outcomes.items() if r['classification']=='AVAILABLE_CURRENT_PLAN']
        cls='PROVISIONAL_PRICE_RESPONSE_IDENTITY_UNVERIFIED' if 'prices' in positive else 'PROVISIONAL_FUND_RESPONSE_IDENTITY_UNVERIFIED' if 'fund' in positive or 'fees' in positive else 'PROVISIONAL_METADATA_RESPONSE_IDENTITY_UNVERIFIED' if 'meta' in positive else 'NOT_FOUND' if all(r['http_status']==404 for r in outcomes.values()) else 'UNKNOWN'
        price_class='FULL_PRICE_SUPPORT_REQUIRES_IDENTITY_CHECK' if 'prices' in positive else 'NOT_FOUND' if outcomes['prices']['http_status']==404 and outcomes['meta']['http_status']==404 else 'UNKNOWN'
        if cls=='UNKNOWN' and any(outcomes[k]['classification']=='ENTITLEMENT_BLOCKED' for k in ['fund','fees']):
            cls='ENTITLEMENT_BLOCKED'
        ucits.append({'ticker':t,'reference_name':name,'reference_venue':exchange,'public_master_matches':by_ticker.get(t,[]),'classification':cls,'local_price_classification':price_class,'outcomes':outcomes})
    search_ucits=result('search-ucits')
    search_rows=search_ucits.get('payload') if isinstance(search_ucits.get('payload'),list) else []
    brand_searches=[]
    for brand in ['iShares','Vanguard','Xtrackers','Amundi','SPDR','Invesco','VanEck','WisdomTree','UBS','HSBC','Fidelity','Franklin-Templeton','UCITS']:
        response=result('fund-search-'+brand)
        brand_rows=response.get('payload') if isinstance(response.get('payload'),list) else []
        ucits_named=[r for r in brand_rows if isinstance(r,dict) and 'ucits' in (r.get('name') or '').lower()]
        brand_searches.append({'query':brand.replace('-',' '),'response':response,'returned_results':len(brand_rows),'cap':100,'cap_reached':len(brand_rows)==100,'UCITS_named_results':len(ucits_named),'UCITS_named_active_results':sum(r.get('isActive') is True for r in ucits_named),'UCITS_named_country_codes':dict(collections.Counter(r.get('countryCode','UNKNOWN') for r in ucits_named)),'warning':'Brand query is text search, not verified issuer identity. No full provider coverage denominator or legal UCITS/active EOD coverage inferred.'})
    search_candidates=[{'search_metadata':r,'public_master_rows':by_ticker.get(r.get('ticker'),[]),'classification':'SEARCH_METADATA_ONLY_PRICE_ENTITLEMENT_UNVERIFIED','exchange_scope':'US_SEARCH_COUNTRY_CODE_NOT_EUROPE_LOCAL' if r.get('countryCode')=='US' else 'UNKNOWN'} for r in search_rows if isinstance(r,dict)]
    otc_samples=[]
    for ticker in ['SSSPF','IIREF','DAXXF','VFAWF']:
        meta=result('ucits-otc-'+ticker+'-meta')
        if meta['http_status'] is None:
            meta=result('ucits-otc-'+ticker+'-metadata')
        prices=result('ucits-otc-'+ticker+'-history')
        rows=prices.get('payload') if isinstance(prices.get('payload'),list) else []
        bars=[r for r in rows if isinstance(r,dict) and r.get('date') and r.get('close') is not None]
        zero_volume=sum(r.get('volume')==0 for r in bars)
        metrics={'bar_count':len(bars),'first_bar_date':bars[0]['date'] if bars else None,'last_bar_date':bars[-1]['date'] if bars else None,'zero_volume_bars':zero_volume,'positive_volume_bars':sum(isinstance(r.get('volume'),(float,int)) and r['volume']>0 for r in bars),'flat_OHLC_bars':sum(r.get('open')==r.get('high')==r.get('low')==r.get('close') for r in bars),'zero_volume_fraction':zero_volume/len(bars) if bars else None,'distinct_close_values':len({r['close'] for r in bars}), 'nonzero_dividends':sum(bool(r.get('divCash')) for r in bars),'nonunit_splits':sum(r.get('splitFactor',1)!=1 for r in bars)}
        otc_samples.append({'ticker':ticker,'identity_validation':{'classification':'CONFLICTING_PROVIDER_METADATA' if ticker=='SSSPF' and 'Shandong' in str(meta.get('payload')) else 'PROVIDER_NAME_MATCH_ISIN_SHARECLASS_FUNGIBILITY_UNVERIFIED','note':'SSSPF ETF name conflicts with Shandong battery-company description' if ticker=='SSSPF' else 'No ISIN, CUSIP, legal share-class mapping or native European listing identity provided'},'fungibility':'UNKNOWN','native_European_listing_support':'NOT_OBSERVED','priceCurrency_master':sorted({r['priceCurrency'] for r in by_ticker[ticker]}),'technical_volume_backtest_fitness':'BLOCKED_UNTIL_LIQUIDITY_IDENTITY_POLICY_VALIDATED','search_identity':[r for r in search_rows if r.get('ticker')==ticker],'public_master_rows':by_ticker.get(ticker,[]),'metadata':meta,'prices':prices,'price_quality':metrics,'classification':'US_OTC_PRICE_RESPONSE' if bars and prices['http_status']==200 else 'UNKNOWN','product_warning':'OTC price access does not establish European primary listing currency, execution liquidity, UCITS fee/holdings metadata, or suitability for trading/backtesting'})
    write('tiingo_ucits_probe.json',{**common,'scope':'Seven representative UCITS symbols; not exhaustive provider nonavailability proof. No returned ticker alone proves same fund identity.',
          'master_european_etf_venue_rows':sum(r['assetType']=='ETF' and r['exchange'].upper() in EU_EXCHANGES for r in records),
          'issuer_brand_search_limit':'Master has no name or issuer. Seven direct local-symbol samples cover iShares and Vanguard; supplementary real-account name searches cover all requested issuer brands. Results are capped100 and not authoritative issuer/domicile evidence.',
          'issuer_brand_searches':brand_searches,
          'US_OTC_account_samples':otc_samples,'documented_search_UCITS':search_ucits,'UCITS_named_search_candidates':search_candidates,'search_result_count':len(search_candidates),'search_result_cap':100,'search_limit_reached':len(search_candidates)==100,'discovery_conclusion':'UCITS-named fund metadata found through US-labelled search candidates; zero European venue ETF rows. Local samples EOD404 and fund routes entitlement-blocked. OTC price quality requires separate measurements.','samples':ucits})
    fund_rows=[]
    for t in 'SPY QQQ VOO VTI VFINX VTSAX FXAIX'.split():
        fund_rows.append({'ticker':t,'master_categories':sorted({r['assetType'] for r in by_ticker[t]}),
                          'metadata':result('fund-'+t.lower()+'-meta'),'fees':result('fund-'+t.lower()+'-fees')})
    schema_path=AUDIT/'endpoints'/'documented_field_schemas.json'
    schemas=json.loads(schema_path.read_text())['tables'] if schema_path.exists() else {}
    documented_fee_fields=[f.get('jsonFieldName') for f in schemas.get('fundFeesHistoricalPricesTableResponseRows',[])]
    field_routes={
        'fund_name':['name'],'ticker':['ticker'],'exchange':['exchangeCode'],'asset_class':['assetType'],
        'issuer':[],'ISIN':[],'CUSIP':[],'inception_date':[],
        'expense_ratio':['netExpense','grossExpense'],'management_fee':['managementFee'],
        'net_expense_ratio':['netExpense'],'TER_OCF':[],'AUM':[],'NAV':[],
        'benchmark':[],'category':[],'fund_type':[],'domicile':[],
        'distribution_accumulating':[],'replication_method':[],
        'holdings_count':[],'sector_exposure':[],'country_exposure':[],
        'historical_fees':['prospectusDate','netExpense','grossExpense','managementFee'],
        'share_class':['shareClass','otherShareClasses'],'portfolio_turnover':['portfolioTurnover']}
    mutual_daily_sample={'ticker':'VFINX','metadata':result('mutual-vfinx-daily-meta'),'prices':result('mutual-vfinx-daily-history'),'fee_metadata':result('fund-vfinx-meta'),'fees':result('fund-vfinx-fees'),'NAV_semantics_documentation':'Official EOD documentation: Mutual Fund NAVs are available after12AM EST; open/high/low/close contain the NAV value for the given day.'}
    mutual_rows=mutual_daily_sample['prices'].get('payload') if isinstance(mutual_daily_sample['prices'].get('payload'),list) else []
    mutual_daily_sample['price_quality']={'bar_count':len(mutual_rows),'flat_OHLC_bars':sum(r.get('open')==r.get('high')==r.get('low')==r.get('close') for r in mutual_rows),'zero_volume_bars':sum(r.get('volume')==0 for r in mutual_rows),'nonzero_dividends':sum(bool(r.get('divCash')) for r in mutual_rows),'NAV_price_indicators':'PARTIAL_PRICE_ONLY','volume_sensitive_signals':'BLOCKED','intraday_OHLC_patterns':'BLOCKED'}
    field_matrix={}
    for field,names in field_routes.items():
        positive=[]
        for sample in fund_rows+samples:
            for endpoint in ['metadata','fees']:
                rr=sample.get(endpoint,{})
                payload=rr.get('payload')
                rows=payload if isinstance(payload,list) else [payload] if isinstance(payload,dict) else []
                if rr.get('classification')=='AVAILABLE_CURRENT_PLAN' and any(any(row.get(n) is not None for n in names) for row in rows if isinstance(row,dict)):
                    positive.append({'ticker':sample['ticker'],'endpoint':endpoint,'fields':[n for n in names if n in rr.get('fields',[])]})
        if field=='asset_class':
            positive=[{'source':'public_six_column_master','field':'assetType','warning':'Provider category, not legal product classification'}]
        field_matrix[field]={'classification':'AVAILABLE_CURRENT_PLAN' if positive and field!='asset_class' else 'PUBLIC_DISCOVERY_ONLY' if field=='asset_class' else 'UNKNOWN',
                             'provider_fields':names,'account_positive_evidence':positive,
                             'documented_in_reviewed_routes':bool(names),
                             'scope_warning':'Positive mutual fund metadata must not be generalized to ETF coverage' if positive else 'No availability or enterprise-only inference from undocumented fields'}
        if not positive and field in {'expense_ratio','management_fee','net_expense_ratio','historical_fees','share_class','portfolio_turnover'}:
            field_matrix[field]['classification']='AVAILABLE_ENTERPRISE_ONLY'
            field_matrix[field]['enterprise_evidence']='Official Mutual Fund and ETF Fee Data API docs: This endpoint is for enterprise and institutional clients only.'

    if mutual_daily_sample['prices']['classification']=='AVAILABLE_CURRENT_PLAN' and 'close' in mutual_daily_sample['prices']['fields']:
        field_matrix['NAV']={'classification':'AVAILABLE_CURRENT_PLAN','scope':'Verified mutual-fund VFINX only; no ETF NAV inferred','provider_fields':['open','high','low','close'],'semantics_source':'Official EOD mutual-fund NAV documentation','account_evidence':mutual_daily_sample['prices']}
    write('tiingo_etf_metadata_matrix.json',{**common,'documented_routes':[
          {'route':'/tiingo/funds/{ticker}','fields':['ticker','name','description','shareClass','netExpense','otherShareClasses'],'scope':'Official Mutual Fund and ETF Fee Data API; enterprise/institutional clients only per docs; runtime account probes remain authoritative'},
          {'route':'/tiingo/funds/{ticker}/metrics','fields':['prospectusDate','netExpense','grossExpense','managementFee'],'scope':'Historical fund/ETF expenses; enterprise/institutional only documented; preserve prospectusDate and metric semantics'}],
          'mutual_fund_daily_sample':mutual_daily_sample,'metadata_fields':field_matrix,'documented_historical_fee_fields':documented_fee_fields,'fund_runtime_samples':fund_rows,
          'notes':['A successful stock fundamentals endpoint would not prove ETF holdings.','404 is a symbol/product lookup outcome, not proof of enterprise gating.','TER/OCF, management fee and US netExpense are distinct metrics; no relabeling without provider definitions.']})
    write('tiingo_etf_holdings_audit.json',{**common,'classification':'UNKNOWN',
          'documented_current_holdings_endpoint_found':False,'actual_holdings_endpoint_tested':False,
          'full_current':None,'full_stale':None,'partial':None,'enterprise_only':None,
          'fields':{f:'UNKNOWN' for f in ['holding_ticker','holding_name','holding_identifier','holding_weight','holdings_count','update_date','historical_holdings','sector_weights','country_weights']},
          'evidence':'No holdings endpoint found in official documentation reviewed by endpoint_discovery. Neither nonexistence nor enterprise availability can be concluded from that absence.',
          'vu_existing_alternative':'quant/config/index-membership.json separately uses issuer ETF holdings downloads. This demonstrates no Tiingo holdings capability.',
          'product_gate':'BLOCKED_UNTIL_VERIFIED_HOLDINGS_SOURCE'})
    price_supported=[s['ticker'] for s in samples if s['prices']['classification']=='AVAILABLE_CURRENT_PLAN' and {'date','close','adjClose'} <= set(s['prices']['fields'])]
    quote_access=[s['ticker'] for s in samples if s['iex']['classification']=='AVAILABLE_CURRENT_PLAN' and {'ticker','last'} <= set(s['iex']['fields'])]
    quote_observations=[{'ticker':s['ticker'],'classification':'QUOTE_ENDPOINT_ACCESS_OBSERVED','freshness':'NOT_VALIDATED','reason':'Successful quote endpoint access is distinct from real-time freshness; retain lastSaleTimestamp/quoteTimestamp for review','fields':s['iex']['fields']} for s in samples if s['ticker'] in quote_access]
    etf_fee_supported=[s['ticker'] for s in fund_rows if s['master_categories']==['ETF'] and s['fees']['classification']=='AVAILABLE_CURRENT_PLAN']
    requirements={
        'ETF_finder':('PARTIAL' if samples else 'UNKNOWN','Public master category discovery plus runtime sample identities; no comprehensive ETF descriptive classification'),
        'ETF_comparison':('PARTIAL' if price_supported else 'UNKNOWN','Price and technical comparison possible for verified sample; holdings and rich metadata unverified'),
        'price_history':('SUPPORTED' if price_supported else 'UNKNOWN','Sample support only, not full universe entitlement'),
        'dividend_history':('PARTIAL' if any('divCash' in s['prices'].get('fields',[]) for s in samples) else 'UNKNOWN','Runtime cash dividend field; short sample does not prove full distribution history'),
        'TER_costs':('PARTIAL' if etf_fee_supported else 'ENTERPRISE_ONLY','ETF and mutual fund detailed fees explicitly enterprise/institutional only in docs; US netExpense is not automatically UCITS TER/OCF'),
        'AUM':('NOT_SUPPORTED','No verified ETF AUM source'),
        'benchmark':('NOT_SUPPORTED','No verified ETF benchmark source'),
        'distributing_accumulating':('NOT_SUPPORTED','No verified distribution policy source'),
        'domicile':('NOT_SUPPORTED','Exchange/currency are not domicile'),
        'replication':('NOT_SUPPORTED','No verified replication method source'),
        'holdings':('NOT_SUPPORTED','No verified holdings source'),
        'overlap':('NOT_SUPPORTED','Requires verified dated holding identities and weights'),
        'country_exposure':('NOT_SUPPORTED','Requires verified holdings/exposure source'),
        'sector_exposure':('NOT_SUPPORTED','Requires verified holdings/exposure source'),
        'true_portfolio_exposure':('NOT_SUPPORTED','Cannot infer portfolio exposure from price series')}
    write('tiingo_etf_product_fitness.json',{**common,
          'mutual_fund_EOD_sample':{'ticker':'VFINX','classification':mutual_daily_sample['prices']['classification'],'NAV_mapping_documented':True,'fees_permission':mutual_daily_sample['fees']['classification'],'price_quality':mutual_daily_sample['price_quality']},'US_OTC_UCITS_price_samples':[s['ticker'] for s in otc_samples if s['classification']=='US_OTC_PRICE_RESPONSE'],'supported_price_samples':price_supported,'quote_endpoint_access_samples':quote_access,'quote_observations':quote_observations,
          'supported_ETF_fee_samples':etf_fee_supported,
          'requirements':{k:{'classification':v[0],'reason':v[1]} for k,v in requirements.items()},
          'classification_scope':'ENTERPRISE_ONLY for fees is an explicit official documentation statement, not inferred from negative HTTP probes. NOT_SUPPORTED means unimplementable from verified Tiingo interfaces/account evidence in this audit, not proof provider never offers it. Commercial/enterprise capability remains UNKNOWN unless explicitly documented.',
          'mainland_ETF_quant_fitness':'BLOCKED_UNTIL_INDEPENDENT_ADJUSTMENT_VALIDATION: stock-bonus adjustment failure demonstrated elsewhere in mainland feed; ETF endpoint adjusted fields are insufficient certification','future_ETF_product_alone':'PARTIAL: Tiingo price/distribution/technical functions, additional verified holdings and descriptive/cost metadata needed'})
    print('ETF analysis generated; account response references:',len(evidence))

if __name__=='__main__':
    main()
