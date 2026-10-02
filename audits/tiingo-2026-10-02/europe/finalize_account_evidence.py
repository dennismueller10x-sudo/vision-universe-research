"""Derive Europe coverage only from captured actual account API evidence."""
import argparse,json,datetime,re,urllib.parse,collections,csv,unicodedata
from pathlib import Path
D=Path(__file__).parent
parser=argparse.ArgumentParser();parser.add_argument('evidence',nargs='+',type=Path);args=parser.parse_args()
allresponses=[];runs=[]
for p in args.evidence:
 j=json.loads(p.read_text());runs.append({'path':str(p),'runId':j.get('runId'),'generatedAt':j.get('generatedAt'),'authentication':j.get('authentication'),'stopReason':j.get('stopReason')});allresponses+=j.get('responses',[])
fundamental_records={}
for response in allresponses:
 if '/fundamentals/meta' in response.get('url','') and response.get('status')==200 and isinstance(response.get('payload'),list):
  for record in response['payload']:
   symbol=str(record.get('ticker','')).upper()
   fundamental_records.setdefault(symbol,[]).append(record)
byref={}
for row in allresponses:
 for ref in row.get('references',[]):byref[ref['id']]=row
bridge=json.loads((D/'tiingo_europe_adr_bridge.json').read_text());reference=json.loads((D/'top_europe_reference.json').read_text())
def shape(row):
 if row is None:return {'status':'NOT_RUN'}
 return {k:row.get(k) for k in ['url','status','observedAt','sha256','payload']}
def latest_valid(row):
 payload=row.get('payload') if row else None
 valid=[r for r in payload if isinstance(r,dict) and isinstance(r.get('close'),(int,float)) and r.get('close')>0 and str(r.get('date',''))[:10]>='2026-09-23'] if isinstance(payload,list) and row.get('status')==200 else []
 return max(valid,key=lambda r:r['date']) if valid else None
def identity_norm(name):
 name=unicodedata.normalize('NFKD',str(name)).encode('ascii','ignore').decode().lower().replace('.','')
 name=name.replace('groep','group')
 name=re.split(r' - |\b(common|ordinary|american|depositary|depository|sponsored|unsponsored|class|adr|ads)\b',name)[0]
 name=re.sub(r'\b(plc|inc|corporation|corp|limited|ltd|ag|sa|se|nv|spa|oyj|ab|as|a/s)\b','',name)
 return re.sub('[^a-z0-9]','',name)
listing_names={}
for file,key in [('nasdaqlisted.txt','Symbol'),('otherlisted.txt','ACT Symbol')]:
 for record in csv.DictReader((D.parent/'global'/file).open(),delimiter='|'):
  if record.get('Test Issue')=='N':listing_names[record.get(key)]=record.get('Security Name')
covered=[];unknown=[]
for row in bridge['companies']:
 us=row.get('usBridge')
 if not us:continue
 s=us['symbol'];us['providerFundamentalsIdentityRecords']=fundamental_records.get(s,[]);us['adrFormWarning']='Provider isADR is retained as a reported indicator; it may be stale or classify foreign registered ordinary shares as ADR. Current legal instrument form remains independently unverified.';meta=byref.get(f'europe-us-{s}-meta');prices=byref.get(f'europe-us-{s}-prices');latest=latest_valid(prices)
 us['metadataEvidence']=shape(meta);us['eodEvidence']=shape(prices);us['latestPriceBar']=latest
 payload=meta.get('payload') if meta else None
 # Symbols derive from reviewed official US listing directories/curated issuer identities, never local ticker coincidence.
 provider_name=identity_norm(payload.get('name','')) if isinstance(payload,dict) else ''
 expected_name=identity_norm(listing_names.get(s,''))
 alias_names=[identity_norm(a) for a in [row['company']]+row.get('aliases',[])]
 namesmatch=bool(provider_name and expected_name and (provider_name==expected_name or (min(len(provider_name),len(expected_name))>=6 and (provider_name in expected_name or expected_name in provider_name)) or any(len(a)>=4 and a in provider_name and a in expected_name for a in alias_names)))
 provider_exchange=str(payload.get('exchangeCode',payload.get('exchange',''))).upper() if isinstance(payload,dict) else ''
 validvenue=provider_exchange in {'NYSE','NASDAQ','AMEX','NYSE MKT','NYSE ARCA','NYSE AMERICAN','BATS'}
 validmeta=isinstance(payload,dict) and meta.get('status')==200 and str(payload.get('ticker','')).upper()==s and namesmatch and validvenue
 us['providerExchangeCode']=provider_exchange;us['providerUsPrimaryVenueVerified']=validvenue
 us['officialUsDirectoryName']=listing_names.get(s);us['providerNameMatchesOfficialDirectory']=namesmatch
 sample_bars=prices.get('payload') if prices and isinstance(prices.get('payload'),list) else []
 us['positiveVolumeBars']=sum((r.get('volume') or 0)>0 for r in sample_bars if isinstance(r,dict))
 if latest and str(latest['date'])[:10]>='2026-10-01' and validmeta and us['positiveVolumeBars']>0:
  us['apiAvailability']='CURRENT_ACCOUNT_EOD_VERIFIED';row['coverageStatus']='US_LISTING_EOD_VERIFIED';covered.append(row)
 else:
  us['apiAvailability']='NOT_CONFIRMED';row['coverageStatus']='US_LISTING_EOD_UNCONFIRMED';unknown.append(row)
  if latest and isinstance(payload,dict) and meta.get('status')==200 and provider_exchange in {'PINK','OTCQX','OTCQB','OTCMKTS','OTCBB','EXPM','OTCGREY','OTCCE'}:
   us['apiAvailability']='CURRENT_OTC_EOD_AVAILABLE_PRIMARY_BRIDGE_UNCONFIRMED';row['coverageStatus']='OTC_ONLY_CURRENT_NOT_COUNTED_AS_PRIMARY_BRIDGE'
 if us['positiveVolumeBars']==0 and latest:us['quoteFitnessWarning']='Current-date price bars have zero volume in entire sample; active trading and volume-dependent techniques are unverified'
 us['identityReview']='Actual provider ticker and normalized name checked against current official US primary listing directory; issuer mapping manually reviewed separately. Unknown name mismatch never counts as coverage.'
 # A provider name can assert ADR; otherwise retain unknown current legal form.
 if isinstance(payload,dict) and re.search(r'\bADR\b|American Depositary|American Depository',payload.get('name',''),re.I):us['securityForm']='PROVIDER_NAME_ADR_INDICATOR'
for row in bridge['companies']:
 otc=row.get('otcCandidate')
 if not otc:continue
 symbol=otc['symbol'];meta=byref.get(f'europe-otc-{symbol}-meta');prices=byref.get(f'europe-otc-{symbol}-prices');latest=latest_valid(prices)
 otc['metadataEvidence']=shape(meta);otc['eodEvidence']=shape(prices);otc['latestPriceBar']=latest
 bars=prices.get('payload') if prices and isinstance(prices.get('payload'),list) else []
 otc['positiveVolumeBars']=sum((r.get('volume') or 0)>0 for r in bars if isinstance(r,dict))
 payload=meta.get('payload') if meta else None
 provider_name=identity_norm(payload.get('name','')) if isinstance(payload,dict) else ''
 expected_aliases=[identity_norm(a) for a in [row['company']]+row.get('aliases',[])]
 expected_aliases += [identity_norm(a) for a in {'BMW':['Bayerische Motoren Werke'],'ABB Ltd':['ABB'],'Mowi':['Mowi ASA']}.get(row['company'],[])]
 identity_matches=bool(provider_name and any(provider_name==a or (min(len(a),len(provider_name))>=4 and (a in provider_name or provider_name in a)) for a in expected_aliases))
 provider_exchange=str(payload.get('exchangeCode',payload.get('exchange',''))).upper() if isinstance(payload,dict) else ''
 otc_venue=provider_exchange in {'PINK','OTCQX','OTCQB','OTCMKTS','OTCBB','EXPM','OTCGREY','OTCCE'}
 otc['providerNameMatchesReviewedIssuer']=identity_matches;otc['providerExchangeCode']=provider_exchange;otc['providerOtcVenueVerified']=otc_venue
 otc['currentAccountPriceResponseVerified']=bool(latest and str(latest['date'])[:10]>='2026-10-01' and isinstance(payload,dict) and meta.get('status')==200 and str(payload.get('ticker','')).upper()==symbol and identity_matches and otc_venue)
 if isinstance(payload,dict) and meta.get('status')==200 and not identity_matches:
  otc['rejectionReason']='PROVIDER_SYMBOL_NOW_IDENTIFIES_A_DIFFERENT_INSTRUMENT: actual name does not match reference issuer; reject recycled symbols despite stale fundamental isActive/name flags'
 otc['quoteFitnessWarning']='Current-date bars all have zero volume; not evidence of active trading' if otc['currentAccountPriceResponseVerified'] and otc['positiveVolumeBars']==0 else 'OTC response requires issuer identity review, liquidity/execution analysis, USD/ADR semantics, and quality gates; no equivalence to primary European price.'
bridge.update({'accountRuns':runs,'apiValidatedCovered':len(covered),'apiUnconfirmedMapped':len(unknown),'referenceTotal':len(reference['companies'])})
(D/'tiingo_europe_adr_bridge.json').write_text(json.dumps(bridge,indent=2,ensure_ascii=False)+'\n')
manifest=json.loads((D/'probes.json').read_text())['probes'];local=[];otc=[]
for p in manifest:
 if p['group'] not in ['europe_local','europe_otc']:continue
 row=byref.get(p['id']);entry={'probe':p,'evidence':shape(row)}
 (local if p['group']=='europe_local' else otc).append(entry)
# A positive local probe must be exposed for review, never silently converted into zero coverage.
local_candidates=[];local_collisions=[]
for p in manifest:
 if p['group']!='europe_local' or not p['id'].endswith('-meta'):continue
 meta=byref.get(p['id']);prices=byref.get(p['id'][:-5]+'-prices');latest=latest_valid(prices);payload=meta.get('payload') if meta else None
 if isinstance(payload,dict) and meta.get('status')==200 and latest and str(latest['date'])[:10]>='2026-10-01':
  ex=str(payload.get('exchangeCode',payload.get('exchange',''))).upper()
  candidate={'metadataProbeId':p['id'],'metadata':payload,'latestPriceBar':latest,'exchangeCode':ex}
  if ex in {'NYSE','NASDAQ','AMEX','NYSE MKT','NYSE ARCA','NYSE AMERICAN','BATS'}:
   candidate['classification']='US_LISTING_SYMBOL_COLLISION';local_collisions.append(candidate)
  else:
   candidate['classification']='UNRESOLVED_LOCAL_POSITIVE_REQUIRES_ISSUER_VENUE_CURRENCY_REVIEW';local_candidates.append(candidate)
(D/'tiingo_europe_probe.json').write_text(json.dumps({'asOf':'2026-10-02','accountRuns':runs,'localProbes':local,'unexpectedLocalCandidates':local_candidates,'usListingCollisions':local_collisions,'archivalProbes':[{'probe':p,'evidence':shape(response)} for response in allresponses for p in response.get('references',[]) if p.get('group')=='europe_archival'],'majorOtcProbes':otc,'classificationWarning':'A successful bare-symbol response (SAP,AOF,HYVE) is not proof of local support. Match issuer and venue/currency first. Dotted local symbols that fail do not prove every alternate symbol fails. OTC positives never count as primary-local coverage.'},indent=2,ensure_ascii=False)+'\n')
exchange=json.loads((D/'tiingo_europe_exchange_coverage.json').read_text())
exchange['accountRuns']=runs
exchange['unexpectedLocalCandidates']=local_candidates
exchange['localCoverageReviewStatus']='UNRESOLVED_POSITIVE_LOCAL_PROBE' if local_candidates else 'NO_POSITIVE_LOCAL_CANDIDATE'
archival_lse=[]
for symbol in ['AOF','HYVE']:
 meta=byref.get(f'europe-local-{symbol}-meta');prices=byref.get(f'europe-archive-{symbol}-prices');payload=meta.get('payload') if meta else None
 if isinstance(payload,dict) and meta.get('status')==200 and payload.get('exchangeCode')=='LSE':
  archival_lse.append({'symbol':symbol,'classification':'ACCOUNT_LSE_LABELLED_ARCHIVED_EOD_RESPONSE_VERIFIED' if prices and prices.get('status')==200 and isinstance(prices.get('payload'),list) and prices['payload'] else 'ACCOUNT_LSE_ARCHIVED_METADATA_VERIFIED','metadataEvidence':shape(meta),'archivalPriceEvidence':shape(prices),'currentEodAvailable':False,'historicalPriceResponseHasBars':bool(prices and prices.get('status')==200 and isinstance(prices.get('payload'),list) and prices['payload']),'currencyAndPrimaryListingSemantics':'UNVERIFIED: provider catalog tags USD, which is not sufficient proof of original venue quotation units.'})
for entry in archival_lse:
 bars=entry['archivalPriceEvidence'].get('payload')
 bars=bars if isinstance(bars,list) else []
 entry['historicalBarsReturned']=len(bars);entry['historicalPositiveVolumeBars']=sum((r.get('volume') or 0)>0 for r in bars)
 entry['historicalDataQualityWarning']='Historical EOD response exists; quote currency, original venue feed and corporate-action correctness are not independently validated. Zero-volume bars cannot establish trading activity.'
 for venue in exchange['exchanges']:
  if venue['mic']=='XLON':
   venue['accountCoverageClassification']='ARCHIVED_LSE_LABELLED_EOD_ONLY_CURRENT_UNAVAILABLE'
   venue['supportedCurrentLocalListingsConfirmed']=0
   venue['apiStatus']='ARCHIVED_LSE_LABELLED_METADATA_AND_EOD_VERIFIED; NO_CURRENT_LOCAL_PRICE_RESPONSE'
   venue['archivedMetadataSymbolsVerified']=[r['symbol'] for r in archival_lse]
   venue['historicalPriceSymbolsVerified']=[r['symbol'] for r in archival_lse if r['historicalPriceResponseHasBars']]
   venue['supportedHistoricalListingPriceResponses']=len(venue['historicalPriceSymbolsVerified'])
   venue['note']='Actual metadata identifies AOF/HYVE as LSE-delisted instruments and historical EOD returns bars. No current EOD. Source catalog USD currency/primary-venue semantics unvalidated; AOF archival sample zero volume, HYVE only four positive-volume days.'
exchange['accountVerifiedArchivedLseEntries']=archival_lse
exchange['localProbeHttpStatusCounts']=dict(collections.Counter(str(x['evidence']['status']) for x in local))
exchange['accountConclusion']='No CURRENT European local listing verified. Actual AOF/HYVE LSE-labelled metadata and historical EOD responses prove limited archived Europe-associated data is exposed. Quote currency/original feed unvalidated. Do not claim provider-wide absence of all historical European data.'
(D/'tiingo_europe_exchange_coverage.json').write_text(json.dumps(exchange,indent=2)+'\n')
indexbreakdown=[]
for idx in sorted({idx for r in reference['companies'] for idx in r['referenceIndices']}):
 subset=[r for r in bridge['companies'] if idx in r['referenceIndices']];c=[r for r in subset if r['coverageStatus']=='US_LISTING_EOD_VERIFIED'];otc=[r for r in subset if (r.get('otcCandidate') or {}).get('currentAccountPriceResponseVerified')];volume_otc=[r for r in otc if r['otcCandidate']['positiveVolumeBars']>0];indexbreakdown.append({'referenceIndex':idx,'referenceCompanyRows':len(subset),'validatedUsBridges':len(c),'additionalTestedOtcCurrentQuoteResponses':len(otc),'additionalTestedOtcWithPositiveVolume':len(volume_otc),'primaryPlusTestedOtcQuoteReach':len(c)+len(otc),'primaryPlusTestedOtcQuoteReachPercent':round(100*(len(c)+len(otc))/len(subset),2) if subset else None,'percent':round(100*len(c)/len(subset),2) if subset else None,'note':'Filtered captured secondary-source subset; not an authoritative exact current index membership count.'})
major=['Nestlé','Roche Holding','Siemens','LVMH','Schneider Electric','Allianz','Airbus','BASF','BMW','Mercedes-Benz Group','Volkswagen Group','Hermès','Iberdrola','BNP Paribas','Safran','Adidas','Infineon Technologies','Kering','Dassault Systèmes','Heineken']
missing=[r for r in bridge['companies'] if r['coverageStatus']!='US_LISTING_EOD_VERIFIED']
out={'asOf':'2026-10-02','accountRuns':runs,'TOP_EUROPE_REFERENCE_TOTAL':len(reference['companies']),'COVERED_BY_LOCAL_TIINGO':None if local_candidates else 0,'UNRESOLVED_POSITIVE_LOCAL_CANDIDATES':len(local_candidates),'COVERED_BY_US_ADR_OR_US_LISTING':len(covered),'TOTAL_COVERED':len(covered),'MISSING_OR_UNVERIFIED':len(missing),'TOTAL_COVERED_PERCENT':round(100*len(covered)/len(reference['companies']),2),'CURRENT_QUOTE_COMPANY_REACH_INCLUDING_REVIEWED_OTC':len(covered)+sum(bool((r.get('otcCandidate') or {}).get('currentAccountPriceResponseVerified')) for r in bridge['companies'])+sum(r['coverageStatus']=='OTC_ONLY_CURRENT_NOT_COUNTED_AS_PRIMARY_BRIDGE' for r in bridge['companies']),'COMPANY_REACH_WITH_POSITIVE_VOLUME_IN_SAMPLE':len(covered)+sum(bool((r.get('otcCandidate') or {}).get('currentAccountPriceResponseVerified')) and r['otcCandidate']['positiveVolumeBars']>0 for r in bridge['companies'] if r.get('otcCandidate'))+sum(r['coverageStatus']=='OTC_ONLY_CURRENT_NOT_COUNTED_AS_PRIMARY_BRIDGE' and r['usBridge']['positiveVolumeBars']>0 for r in bridge['companies']),'metricType':'VALIDATED_LOWER_BOUND_ON_REPRESENTATIVE_REFERENCE','maximumCoverage':'UNKNOWN: no authoritative exhaustive cross-listing/ADR directory or entire account universe API enumeration available','localCoverageQualification':'Zero verified CURRENT European local listings. Actual metadata and historical EOD responses for LSE-labelled AOF/HYVE prove archived Europe-associated availability; currency/primary-venue feed unvalidated. Current windows empty. No provider-wide absence-of-history claim.','referenceMethodology':reference['methodology'],'archivedLseEvidence':archival_lse,'referenceQualityLimits':['Secondary source constituents may include stale index members; no market-cap rank asserted.','UK index geography can include non-European domiciles; Europe listing/company relevance is not equivalent to legal domicile.','Historical acquired/delisted entries can remain in reference.','Legal ADR vs US ordinary form often unverified; both are US-price bridges, never local coverage.','Remaining unmatched companies are unresolved; not proof that no OTC/alternate bridge exists.'],'ADDITIONAL_MAJOR_OTC_NAMES_WITH_CURRENT_ACCOUNT_PRICE_RESPONSES':sum(bool((r.get('otcCandidate') or {}).get('currentAccountPriceResponseVerified')) for r in bridge['companies'] if r.get('otcCandidate')),'ADDITIONAL_MAJOR_OTC_NAMES_WITH_POSITIVE_VOLUME':sum(bool((r.get('otcCandidate') or {}).get('currentAccountPriceResponseVerified')) and r['otcCandidate']['positiveVolumeBars']>0 for r in bridge['companies'] if r.get('otcCandidate')),'US_BRIDGE_NOW_OTC_ONLY':[r['usBridge']['symbol'] for r in bridge['companies'] if r['coverageStatus']=='OTC_ONLY_CURRENT_NOT_COUNTED_AS_PRIMARY_BRIDGE'],'majorNamesWithoutValidatedPrimaryBridge':[{'company':r['company'],'companyId':r['companyId'],'otcCandidate':r.get('otcCandidate'),'coverageStatus':r['coverageStatus']} for r in missing if r['company'] in major],'indexSubsets':indexbreakdown,'coveredCompanies':[{'company':r['company'],'companyId':r['companyId'],'symbol':r['usBridge']['symbol'],'securityForm':r['usBridge']['securityForm']} for r in covered],'unverifiedCompanies':[{'company':r['company'],'companyId':r['companyId'],'status':r['coverageStatus']} for r in missing]}
(D/'tiingo_top_europe_coverage.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:out[k] for k in ['TOP_EUROPE_REFERENCE_TOTAL','COVERED_BY_US_ADR_OR_US_LISTING','TOTAL_COVERED_PERCENT','MISSING_OR_UNVERIFIED']}))
