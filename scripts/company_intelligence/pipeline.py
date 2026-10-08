"""One-company failure isolation, bounded source scheduling, resumable operations."""
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from .model import domain, Resolver, canonical_url, make_item, stable_id, within_domain, issuer_results_actor, issuer_earnings_announcement, financial_release_evidence
from .transport import BudgetExhausted, SourceError
from .feeds import parse_feed, parse_gdelt, discover_ir
from .structured_sources import news_index, gcs_events
from .stockpr_events import parse as stockpr_events
from .ir_events import from_announcement, parse_jsonld, parse_ics, guidance_evidence, event
from .earnings import project_sec, estimate_calendar, summary
from .store import atomic_json

LOG = logging.getLogger('vu.company_intelligence')


def log(code, **fields):
    LOG.info(json.dumps({'code': code, **fields}, sort_keys=True))


def utcnow():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def advance(now, hours):
    return (datetime.fromisoformat(now.replace('Z', '+00:00')) + timedelta(hours=hours)).isoformat(timespec='seconds').replace('+00:00', 'Z')


def read_optional(path):
    return json.loads(path.read_text()) if path.is_file() else None


class Pipeline:
    def __init__(self, root, companies, store, http, now=None):
        self.root, self.companies, self.store, self.http = Path(root), companies, store, http
        self.now = now or utcnow()
        import time
        self.clock = getattr(http, 'clock', time.time)
        self.deadline = getattr(http, 'deadline', self.clock() + 600)
        # Read legal-name aliases only for candidate issuers, never the whole universe.
        # Exact-CIK SEC consumers enrich this resolver without changing the master.
        self.companies = {cid: {**c, 'names': list(c['names'])} for cid, c in companies.items()}
        self.resolver = Resolver(self.companies)
        self._alias_loaded = set()
        self._processed_sources = set()
        self.run = {'new': 0, 'promotionalRejected': 0, 'duplicate': 0, 'unmatched': 0, 'invalid': 0, 'sourceFailures': 0, 'secFailures': 0, 'documentFailures': 0, 'processedCompanies': 0, 'discoveryFailures': 0}

    def ensure_aliases(self, company_ids):
        for cid in company_ids:
            if cid in self._alias_loaded or cid not in self.companies:
                continue
            self._alias_loaded.add(cid)
            company = self.companies[cid]
            if not company.get('cik'):
                continue
            try:
                data = read_optional(self.root / 'quant/data/sec/consumer' / ('CIK' + str(company['cik']) + '.json')) or {}
                legal = data.get('name')
                if data.get('cik') == company['cik'] and data.get('dataSource', {}).get('provider') == 'sec_edgar' and data.get('dataSource', {}).get('isMock') is False and isinstance(legal, str) and 3 <= len(legal) <= 200:
                    self.resolver.add_alias(cid, legal)
            except (OSError, ValueError, TypeError, AttributeError):
                pass

    def seed_sources(self, config):
        for configured in config:
            s = dict(configured)
            if s.get('companyId') and s['companyId'] not in self.companies:
                continue
            s.setdefault('sourceId', stable_id(s.get('companyId'), s['url']))
            s.setdefault('active', True)
            self.store.source(s)

    def ingest_due_sources(self, selected_ids, all_sources=False, force=False, include_global=True):
        from .cadence import due
        near = {r[0] for r in self.store.db.execute("SELECT DISTINCT company FROM events WHERE kind IN ('EARNINGS_SCHEDULED','EARNINGS_CALL') AND date>=? AND date<=? AND json_extract(payload,'$.confirmationStatus')='CONFIRMED'", (self.now[:10], advance(self.now, 48)[:10]))}
        for source in self.store.sources():
            if not force and not due(source, self.now, source.get('companyId') in near):
                continue
            if source.get('companyId') and source['companyId'] not in self.companies:
                self.store.source({**source, 'active': False, 'disabledReason': 'ISSUER_NOT_IN_CURRENT_SUPPORTED_MASTER'})
                self.store.audit(self.now, source['sourceId'], 'SOURCE_RETIRED_OUTSIDE_UNIVERSE', companyId=source['companyId'])
                continue
            if source['type'] != 'GDELT' and (all_sources or (include_global and source.get('companyId') is None) or source.get('companyId') in selected_ids):
                self.ingest_source(source)

    def ingest_source(self, source):
        from .feeds import is_event_feed, is_material_feed
        self.ensure_aliases([source.get('companyId')])
        if source.get('verified') and source['type'] == 'IR_FEED':
            if is_material_feed(source['url']):
                source = {**source, 'type': 'IR_MATERIALS', 'format': 'RSS_MATERIALS', 'intervalHours': 12}
            elif is_event_feed(source['url']):
                source = {**source, 'type': 'IR_EVENTS', 'format': 'RSS_EVENTS', 'intervalHours': 12}
            self.store.source(source)
        sid = source['sourceId']
        signature = (sid, source['type'], source.get('format'))
        if signature in self._processed_sources:
            return
        self._processed_sources.add(signature)
        calendar_issuers = set()
        try:
            accepted = 0
            rejected = 0
            accepted_dates = []
            from .feeds import is_sec_filing_feed
            if source['type'] in ('IR_FEED', 'RSS') and is_sec_filing_feed(source['url']):
                raise SourceError('NON_NEWS_SEC_FILING_FEED')
            if source.get('format') == 'GNN_ARCHIVE':
                from .distributor_archive import pinned_archive
                if not pinned_archive(source['url']):raise SourceError('UNSAFE_DISTRIBUTOR_ARCHIVE')
                original_limit=self.http.MAX_BYTES
                try:
                    self.http.MAX_BYTES=8*1024*1024
                    response=self.http.get(source['url'])
                finally:self.http.MAX_BYTES=original_limit
            elif source.get('format') == 'WORDPRESS_REST_NEWS':
                from .wordpress_news import fetch as fetch_wordpress_news
                response, wordpress_entries = fetch_wordpress_news(self.http, source)
            else:
                response = self.http.get(source['url'], robots=source['type'] != 'GDELT')
            if source.get('provider') == 'GLOBENEWSWIRE_RSS':
                if domain(response['finalUrl']) != 'www.globenewswire.com':
                    raise SourceError('DISTRIBUTOR_REDIRECT_REQUIRES_REVALIDATION')
            if source.get('verified') and source['type'] != 'SEC':
                if not any(within_domain(response['finalUrl'], site) for site in source.get('allowedSites', [])):
                    raise SourceError('SOURCE_REDIRECT_REQUIRES_REVALIDATION')
            if source.get('format') in ('HTML_MATERIALS','Q4_PRESENTATIONS'):
                cid=source['companyId'];ir=self.store.state('ir:'+cid,{})
                if source['format']=='HTML_MATERIALS':
                    from .materials import parse_hub
                    documents=parse_hub(response['body'],source,self.companies[cid],response['finalUrl'],self.now)
                else:
                    from .q4_presentations import parse as parse_presentations
                    documents=parse_presentations(response['body'],source,self.now)
                previous=[d for cfg in ir.get('configurations',[]) if cfg.get('materialsSourceId')==sid for d in cfg.get('documents',[])]
                if source['format']=='Q4_PRESENTATIONS':
                    from .q4_presentations import correct_documents
                    previous=correct_documents(previous)
                else:
                    from .materials import correct_documents
                    previous=correct_documents(previous)
                current_urls={d['url'] for d in documents}
                # A corrected type has a new stable ID. Retire the preceding
                # classification of that URL rather than keeping both types.
                documents=(documents+[d for d in previous if d['url'] not in current_urls])[:100]
                configs=[cfg for cfg in ir.get('configurations',[]) if cfg.get('materialsSourceId')!=sid]
                configs.append({'companyId':cid,'irHomepage':source['metadata']['originatingIRHomepage'],'pageRole':'IR',
                                'providerType':source.get('provider','GENERIC'),'documents':documents,'materialsSourceId':sid,
                                'materialsPage':response['finalUrl'],'lastVerified':self.now,'confidence':.95,
                                'evidence':'VALIDATED_ISSUER_Q4_PRESENTATION_INDEX' if source['format']=='Q4_PRESENTATIONS' else 'VALIDATED_ISSUER_ADVERTISED_MATERIALS_HUB'})
                self.store.set_state('ir:'+cid,{**ir,'configurations':configs})
                self.store.source({**source,'lastChecked':self.now,'lastSuccess':self.now,'failureCount':0,'lastError':None,
                                   'lastItemCount':len(documents),'contentDateStatus':'PUBLICATION_DATE_NOT_PROVIDED',
                                   'nextCheck':advance(self.now,source.get('intervalHours',24))})
                return
            if source.get('format') == 'Q4_REPORTS':
                from .q4_reports import parse as parse_reports
                documents = parse_reports(response['body'], source, self.now)
                cid=source['companyId'];ir=self.store.state('ir:'+cid,{})
                configs=[c for c in ir.get('configurations',[]) if c.get('materialsSourceId')!=sid]
                configs.append({'companyId':cid,'irHomepage':source['allowedSites'][-1], 'pageRole':'IR', 'providerType':'Q4',
                                'documents':documents,'materialsSourceId':sid,'lastVerified':self.now,'confidence':.95,
                                'evidence':'VALIDATED_ISSUER_FINANCIAL_DOCUMENT_INDEX'})
                self.store.set_state('ir:'+cid,{**ir,'configurations':configs})
                self.store.source({**source,'lastChecked':self.now,'lastSuccess':self.now,'failureCount':0,'lastError':None,
                                   'lastItemCount':len(documents),'contentDateStatus':'PUBLICATION_DATE_NOT_PROVIDED',
                                   'nextCheck':advance(self.now,source.get('intervalHours',24))})
                return
            if source['type'] == 'IR_EVENTS':
                if source.get('format') == 'RSS_EVENTS':
                    events = []
                    for entry in parse_feed(response['body'], response['finalUrl']):
                        # pubDate is publication metadata, never assumed to be an event start.
                        values = from_announcement(entry, source, self.now)
                        for value in values:
                            if entry.get('eventUid'):
                                value['eventId'] = stable_id(source['companyId'], source['sourceId'], entry['eventUid'])
                            events.append(value)
                elif source.get('format') == 'Q4_EVENTS':
                    from .q4_events import parse as parse_q4
                    events = parse_q4(response['body'], source, self.now)
                else:
                    events = parse_ics(response['body'], source, self.now) if response['body'].lstrip().startswith(b'BEGIN:VCALENDAR') else parse_jsonld(response['body'], source, self.now) + gcs_events(response['body'], source, self.now) + stockpr_events(response['body'], source, self.now)
                for e in events:
                    if e['eventType'] in ('EARNINGS_CALL', 'EARNINGS_SCHEDULED') and not issuer_earnings_announcement(e['headline'], self.companies[source['companyId']]):
                        rejected += 1
                        self.store.audit(self.now, sid, 'EVENT_REJECTED_WRONG_EARNINGS_ACTOR', headline=e['headline'], url=e.get('sourceUrl'))
                        continue
                    self.store.event(e, self.now)
                    if e['eventType'] in ('EARNINGS_CALL', 'EARNINGS_SCHEDULED') and e.get('confirmationStatus') == 'CONFIRMED':
                        calendar_issuers.add(e['companyId'])
                    accepted += 1
                entries = []
            else:
                if source.get('format') == 'GNN_ARCHIVE':
                    from .distributor_archive import collect
                    entries = collect(source,response,self.http,self.store,self.resolver,self.now)
                elif source.get('format') == 'GNN_NEWS_SITEMAP':
                    from .news_sitemap import parse as parse_news_sitemap
                    entries = parse_news_sitemap(response['body'], response['finalUrl'])
                elif source.get('format') == 'WORDPRESS_REST_NEWS':
                    entries = wordpress_entries
                elif source.get('format') == 'Q4_NEWS':
                    from .q4_news import parse as parse_q4_news
                    entries = parse_q4_news(response['body'], source)
                else:
                    entries = parse_gdelt(response['body']) if source['type'] == 'GDELT' else news_index(response['body'], source, response['finalUrl']) if source.get('format') == 'JSONLD_NEWS' else parse_feed(response['body'], response['finalUrl'])
            from .news_quality import wordpress_feed,eligible,promotional_solicitation,shadowed_actor
            wordpress=(wordpress_feed(response['body']) or source.get('provider')=='WORDPRESS' or source.get('cmsNewsPolicy')=='WORDPRESS_EXPLICIT_ISSUER_ACTOR') if source['type']=='IR_FEED' else False
            if wordpress:source['cmsNewsPolicy']='WORDPRESS_EXPLICIT_ISSUER_ACTOR'
            for entry in entries:
                if wordpress and shadowed_actor(entry.get('headline'), self.companies[source['companyId']], self.resolver):
                    rejected += 1
                    self.store.audit(self.now, sid, 'CMS_MORE_SPECIFIC_ISSUER_REJECTED', headline=entry.get('headline'), url=entry.get('url'))
                    continue
                if source['type']=='IR_FEED' and not eligible(entry,self.companies[source['companyId']],wordpress):
                    rejected+=1
                    self.store.audit(self.now,sid,'CMS_NON_ANNOUNCEMENT_REJECTED',headline=entry.get('headline'),url=entry.get('url'))
                    continue
                entry_time = entry.get('publishedAt') or (entry['publishedDate'] + 'T00:00:00Z' if entry.get('publishedDate') else entry.get('updatedAt'))
                if not entry.get('headline') or not entry.get('url') or not entry_time or entry_time > self.now:
                    self.run['invalid'] += 1
                    rejected += 1
                    self.store.audit(self.now, sid, 'INVALID_ITEM', headline=entry.get('headline'), url=entry.get('url'), reason='MISSING_OR_FUTURE_EVIDENCE')
                    continue
                if entry_time < advance(self.now, -365 * 24):
                    self.store.audit(self.now, sid, 'STALE_ITEM', url=entry['url'])
                    continue
                # Verified feed content from outside linked/authorized domains is not first-party evidence.
                from .platforms import shared_publisher
                effective = {**source, 'verified': False} if shared_publisher(entry['url']) else source
                if source.get('verified') and not any(within_domain(entry['url'], s) for s in source.get('allowedSites', [])):
                    effective = {**source, 'verified': False}
                if entry.get('promotionalSolicitation') or (not effective.get('verified') and promotional_solicitation(entry.get('headline'))):
                    rejected += 1
                    self.run['promotionalRejected'] += 1
                    self.store.audit(self.now, sid, 'PROMOTIONAL_SOLICITATION_REJECTED', headline=entry.get('headline'), url=entry.get('url'))
                    continue
                candidates = set()
                for stock in (entry.get('distributionMetadata') or {}).get('stocks', [])[:20]:
                    ticker = re.fullmatch(r'(?:Nasdaq|NYSE|NYSE American|AMEX):\s*([A-Z][A-Z0-9.-]{0,14})', stock, re.I)
                    if ticker:
                        candidates.update(self.resolver.tickers.get(ticker.group(1).upper(), set()))
                self.ensure_aliases(candidates)
                matches = self.resolver.resolve(entry, effective)
                if source.get('companyId') and source['type'] in ('IR_FEED', 'IR_MATERIALS'):
                    matches = [m for m in matches if m['companyId'] == source['companyId']]
                if source['type'] == 'IR_MATERIALS' and source.get('verified') and not shared_publisher(entry['url']):
                    # An official document feed explicitly delegates its linked materials,
                    # including CDN files. This rule never authorizes publisher news.
                    matches = [{'companyId': source['companyId'], 'confidence': .95, 'evidence': ['DOCUMENT_LINK_IN_VERIFIED_ISSUER_PRESENTATION_FEED']}]
                    effective = source
                if not matches:
                    self.run['unmatched'] += 1
                    rejected += 1
                    self.store.audit(self.now, sid, 'UNMATCHED_TITLE', headline=entry['headline'], url=entry['url'], reason='NO_HIGH_CONFIDENCE_TITLE_ENTITY')
                for match in matches:
                    item = make_item(entry, effective, match, self.now)
                    if source['type'] == 'IR_MATERIALS':
                        if not effective.get('verified') or match['companyId'] != source['companyId']:
                            rejected += 1
                            continue
                        accepted += 1
                        self.store.event({'eventId': stable_id(match['companyId'], entry['url'], 'presentation'), 'companyId': match['companyId'],
                                          'eventType': 'PRESENTATION_PUBLISHED', 'headline': entry['headline'], 'date': entry_time[:10],
                                          'publishedAt': entry.get('publishedAt'), 'observedAt': entry.get('updatedAt') if not entry.get('publishedAt') else None,
                                          'sourceId': sid, 'sourceUrl': entry['url'], 'sourceDocuments': [{'type': 'PRESENTATION', 'url': entry['url']}],
                                          'detectionEvidence': ['VERIFIED_OFFICIAL_PRESENTATION_FEED'], 'confidence': 1, 'discoveredAt': self.now}, self.now)
                        # Reclassify older feed output, retaining its representation in the event.
                        for row in self.store.db.execute('SELECT id,payload FROM items WHERE company=? AND json_extract(payload,\'$.canonicalUrl\')=?', (match['companyId'], entry['url'])).fetchall():
                            old = json.loads(row['payload'])
                            if old.get('provenance') and all(p.get('sourceId') == sid for p in old['provenance']):
                                with self.store.db:
                                    self.store.db.execute('DELETE FROM items WHERE id=?', (row['id'],))
                                self.store.audit(self.now, sid, 'NEWS_RECLASSIFIED_AS_PRESENTATION', newsId=row['id'], url=entry['url'])
                        continue
                    accepted += 1
                    accepted_dates.append(entry_time)
                    if source['type'] == 'GDELT':
                        # seendate is observation, not publication. Never claim it as publisher time.
                        item['observedAt'] = entry['publishedAt']
                        item['publishedAt'] = None
                        item['timestampPrecision'] = 'DISCOVERY_TIME'
                        item['provenance'][0]['timestampPrecision'] = 'DISCOVERY_TIME'
                        item['provenance'][0]['observedAt'] = entry['publishedAt']
                        item['provenance'][0]['publishedAt'] = None
                    distributed_author = source.get('provider') in ('GLOBENEWSWIRE_RSS','GLOBENEWSWIRE_ARTICLE') and any(signal.startswith('EXACT_MASTER_CONTRIBUTOR:') for signal in match.get('evidence', []))
                    if (effective.get('verified') and match['companyId'] == effective.get('companyId')) or distributed_author:
                        announcer = {**effective, 'verified': True, 'type': 'IR_FEED', 'companyId': match['companyId']} if distributed_author else effective
                        announcements = from_announcement(entry, announcer, self.now) if issuer_earnings_announcement(entry['headline'], self.companies[match['companyId']]) else []
                        from .distributor_archive import publisher_call_actor
                        if distributed_author and entry.get('callEvidence') and publisher_call_actor(entry['headline'], self.companies[match['companyId']]):
                            from .distributor_archive import earnings_call_context
                            earnings_call = earnings_call_context(entry['headline'], entry['callEvidence'])
                            # A dated clinical/strategy webcast is useful IR content,
                            # but cannot confirm earnings or retire an estimate.
                            call_label = ' Earnings Conference Call' if earnings_call else ' Investor Conference Call'
                            call_entry={**entry,'headline':entry['distributionMetadata']['contributor']+call_label,'evidenceText':entry['callEvidence']}
                            from .sec_documents import release_period
                            call_events=from_announcement(call_entry,announcer,self.now)
                            call_period=(release_period(entry['headline']) or {}) if earnings_call else {}
                            for call in call_events:
                                call.update(call_period)
                                call['evidence']={'method':'EXPLICIT_ISSUER_AUTHORED_CALL_SCHEDULE' if earnings_call else 'EXPLICIT_ISSUER_AUTHORED_INVESTOR_CALL_SCHEDULE','excerpt':entry['callEvidence'][:1200]}
                            announcements += call_events
                        if distributed_author and entry.get('authorSiteCandidate'):
                            candidate=entry['authorSiteCandidate']
                            key='siteCandidates:'+match['companyId'];prior=self.store.state(key,{})
                            if self.store.state('officialSite:'+match['companyId'],{}).get('status')!='VALIDATED':
                                candidates=prior.get('candidates',[])
                                if not any(c.get('url')==candidate for c in candidates):candidates.append({'url':candidate,'evidence':'EXACT_MASTER_DISTRIBUTOR_AUTHOR_AND_EXCHANGE_TICKER','evidenceUrl':entry['url']})
                                self.store.set_state(key,{**prior,'status':'CANDIDATE' if len({domain(c['url']) for c in candidates})==1 else 'AMBIGUOUS','candidates':candidates[:5]})
                        for e in announcements:
                            if distributed_author:
                                e.update(confidence=.99, confirmationEvidence='ISSUER_AUTHORED_DISTRIBUTOR_ANNOUNCEMENT', issuerMatchEvidence=match['evidence'])
                            self.store.event(e, self.now)
                            self.store.retire_composite_call(e, self.now)
                            if e.get('confirmationStatus') == 'CONFIRMED':
                                calendar_issuers.add(e['companyId'])
                        financial_proof = financial_release_evidence(entry['headline'], entry.get('evidenceText', ''))
                        if issuer_results_actor(entry['headline'], self.companies[match['companyId']]) and financial_proof and entry.get('publishedAt') and re.search(r'\b(reports?|announces?)\b.{0,80}(?:quarter|fiscal|financial|full.year).{0,35}results', entry['headline'], re.I) and not re.search(r'\b(will|to announce|to report|to be|date|scheduled|upcoming|forthcoming|expected|board meeting|board approval|to consider|to approve|to review)\b', entry['headline'], re.I) and not (re.search(r'\b(production|deliveries|operating results|operational results|phase[ -]?[123]|clinical|trial|study)\b', entry['headline'], re.I) and not re.search(r'financial results|earnings', entry['headline'], re.I)):
                            from .sec_documents import release_period
                            period = release_period(entry['headline']) or {}
                            quarter, year = period.get('fiscalQuarter'), period.get('fiscalYear')
                            company = self.companies[match['companyId']]
                            consumer = read_optional(self.root / 'quant/data/sec/consumer' / ('CIK' + str(company['cik']) + '.json')) if company.get('cik') else None
                            earnings = {'eventId': stable_id(match['companyId'], entry['url'], 'official-earnings'), 'companyId': match['companyId'],
                                        'eventType': 'EARNINGS_PUBLISHED', 'headline': entry['headline'], 'date': entry['publishedAt'][:10], 'publishedAt': entry['publishedAt'],
                                        'sourceId': source['sourceId'], 'sourceUrl': entry['url'], 'sourceDocuments': [{'type': 'OFFICIAL_EARNINGS_RELEASE', 'url': entry['url']}],
                                        'eventStatus': 'PUBLISHED', 'discoveredAt': self.now, 'fiscalQuarter': quarter, 'fiscalYear': year, 'reportingPeriod': None,
                                        'detectionEvidence': ['ISSUER_AUTHORED_RESULTS_RELEASE_TITLE_AND_DISTRIBUTOR_METADATA'] if distributed_author else ['OFFICIAL_RESULTS_RELEASE_TITLE'], 'earningsReleaseUrl': entry['url'], 'transcriptUrl': None,
                                        'summary': summary(consumer, company['cik'], self.now, quarter, year) if quarter and year else {'state': 'UNAVAILABLE', 'reason': 'RELEASE_REPORTING_PERIOD_NOT_VERIFIED'}}
                            earnings['detectionEvidence'].extend(financial_proof)
                            if 'REPORTED_FINANCIAL_METRICS_IN_SOURCE_SNIPPET' in financial_proof:
                                earnings['financialEvidence'] = {'method': 'OFFICIAL_SOURCE_PROVIDED_SNIPPET', 'sourceUrl': entry['url'], 'excerpt': entry.get('evidenceText', '')[:400], 'confidence': .99}
                            reported = earnings['summary'].get('metrics', {}).get('revenue', {}).get('current')
                            if reported:
                                earnings['reportingPeriod'] = reported.get('periodEnd')
                            self.store.event(earnings, self.now)
                            calendar_issuers.add(match['companyId'])
                        guidance = guidance_evidence(entry, announcer)
                        if guidance:
                            item['guidanceEvidence'] = guidance
                    outcome = self.store.ingest(item)
                    self.run['duplicate' if outcome == 'DUPLICATE' else 'new'] += 1
            if source.get('format')=='GNN_ARCHIVE':
                for entry in entries:
                    if not entry.get('url'):continue
                    key='distributorArchive:'+entry['url'];prior=self.store.state(key,{})
                    self.store.set_state(key,{k:v for k,v in {**prior,'status':'INGESTED'}.items() if k!='entry'})
            content_dates = [i.get('publishedAt') or i.get('updatedAt') for i in entries if (i.get('publishedAt') or i.get('updatedAt')) and (i.get('publishedAt') or i.get('updatedAt')) <= self.now]
            if source['type'] == 'IR_EVENTS':
                content_dates += [e.get('date') for e in events if e.get('date')]
            elif source.get('companyId') and source['type'] == 'IR_FEED':
                content_dates = accepted_dates
            source.update(latestContentAt=max(content_dates) if content_dates else None, lastItemCount=len(entries) if source['type'] != 'IR_EVENTS' else len(events), lastAcceptedMatches=accepted, lastRejectedItems=rejected, lastSuccess=self.now, lastChecked=self.now, failureCount=0, lastError=None, nextCheck=advance(self.now, source.get('intervalHours', 6)))
            if wordpress and not accepted:source['nextCheck']=advance(self.now,max(24,source.get('intervalHours',6)))
            self.store.source(source)
            log('SOURCE_SUCCESS', sourceId=sid, items=source['lastItemCount'])
        except BudgetExhausted:
            raise
        except Exception as exc:
            failure = source.get('failureCount', 0) + 1
            # Failure to retrieve robots (DNS/proxy/503) is temporary. Only an
            # actual access denial/disallowance receives the slow blocked retry.
            delay = 7 * 24 if any(code in str(exc) for code in ('403', '401', '404', 'ROBOTS_DISALLOWED')) else min(72, 2 ** min(failure, 6))
            source.update(lastFailure=self.now, lastChecked=self.now, failureCount=failure, lastError=(type(exc).__name__ + ':' + str(exc))[:250], nextCheck=advance(self.now, delay))
            self.store.source(source)
            self.store.audit(self.now, sid, 'SOURCE_FAILURE', errorType=type(exc).__name__, reason=str(exc)[:250])
            self.run['sourceFailures'] += 1
            log('SOURCE_FAILURE', sourceId=sid, reason=str(exc)[:250])
        finally:
            # Source polling also runs without SEC/company refresh. Reconcile
            # only issuers with accepted earnings evidence, including partial
            # batches, using the existing estimator and retirement audit.
            for cid in sorted(calendar_issuers):
                self.refresh_estimates(self.companies[cid])

    def sec_client(self, sec_budget=60):
        from quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter
        client = getattr(self, '_sec_client', None)
        if client is None:
            client = self._sec_client = SECHttpClient(cache=DiskCache(self.root / '.sec-cache', ttl_seconds=2 * 3600), rate_limiter=RateLimiter(rate_per_second=1, burst=1), timeout=15, max_retries=1)
        def bounded_sec_open(url, headers, timeout):
            remaining = self.deadline - self.clock()
            if remaining <= 0 or client.stats['requests'] > sec_budget:
                raise BudgetExhausted('SEC_REQUEST_OR_TIME_BUDGET_DEFERRED')
            return client._urlopen(url, headers, min(timeout, remaining))
        client._opener = bounded_sec_open
        return client

    def project_company(self, company, fetch_sec=False, sec_documents=False, sec_budget=60, filing_since=None):
        """Reuse canonical/consumer/raw outputs; optional metadata refresh uses existing SEC client."""
        cid, cik = company['companyId'], company.get('cik')
        try:
            if not cik:
                self.store.audit(self.now, cid, 'SEC_UNAVAILABLE', reason='NO_VERIFIED_CIK')
                self.store.set_state('financials:' + cid, {'state': 'UNAVAILABLE', 'reason': 'NO_VERIFIED_CIK'})
                return
            from quant.sec.store import JsonRawStore
            submissions = JsonRawStore(self.root / 'quant/data/sec/raw').get_latest(cik, 'submissions')
            submissions = submissions or self.store.state('sec-submissions:' + cid)
            if fetch_sec:
                from quant.sec.provider import SECProvider
                client = self.sec_client(sec_budget)
                # No companyfacts downloads. Optional document inspection also uses this same client.
                submissions = SECProvider(client).get_submissions(cik, include_history=False)
                if str(submissions.get('cik', '')).zfill(10) != cik:
                    raise ValueError('SUBMISSIONS_COMPANY_MISMATCH')
                # Persist bounded metadata, not downloaded filings, so a new
                # runner can reproject item rules without refetching SEC.
                columns = submissions.get('filings', {}).get('recent', {})
                dates = columns.get('filingDate', [])
                eligible = [i for i, form in enumerate(columns.get('form', [])) if form in ('8-K','8-K/A','6-K','6-K/A','10-Q','10-Q/A','10-K','10-K/A','20-F','20-F/A','DEF 14A') and (not filing_since or (i < len(dates) and isinstance(dates[i], str) and dates[i] >= filing_since))][:100]
                compact = {'cik': cik, 'filings': {'recent': {k: [v[i] if i < len(v) else None for i in eligible] for k, v in columns.items() if isinstance(v, list)}}}
                self.store.set_state('sec-submissions:' + cid, compact)
                if filing_since:
                    submissions = compact
                if sec_documents:
                    from .sec_documents import enrich_submissions
                    previous = {row[0].rsplit(':', 1)[1]: json.loads(row[1]) for row in self.store.db.execute('SELECT key,payload FROM state WHERE key LIKE ?', ('sec-document:' + cid + ':%',))}
                    submissions = enrich_submissions(submissions, cik, client, self.now, budget=sec_budget, previous=previous)
            if submissions and submissions.get('_intelligenceDocumentEvidence'):
                for accession, evidence in submissions['_intelligenceDocumentEvidence'].items():
                    self.store.set_state('sec-document:' + cid + ':' + accession, evidence)
                    if evidence.get('reason') or evidence.get('exhibitFailure'):
                        self.run['documentFailures'] += 1
                        self.store.audit(self.now, cid, 'SEC_DOCUMENT_FAILURE', filingId=accession, reason=evidence.get('reason') or evidence.get('exhibitFailure'), retryAfter=evidence.get('retryAfter'))
            if submissions:
                from .sec_documents import PARSER_VERSION, CLASSIFICATION_COMPATIBLE
                from .profile_backfill import refresh_changed_sec
                # Cached interpretation; an already authorized SEC refresh may
                # fetch one genuinely new annual document for a stored profile.
                try:
                    refresh_changed_sec(self.root, self.store, company, submissions, self.now, client if fetch_sec else None)
                except Exception as exc:
                    # Optional profile interpretation must never suppress SEC
                    # financial/news/event projection or impose a SEC cooldown.
                    self.store.audit(self.now, cid, 'CACHED_PROFILE_UNAVAILABLE', reason=str(exc)[:200])
                evidence = {acc: self.store.state('sec-document:' + cid + ':' + acc) for acc in submissions.get('filings', {}).get('recent', {}).get('accessionNumber', [])}
                from .sec_documents import inspect_html
                validated = {}
                for acc, value in evidence.items():
                    if not value or value.get('parserVersion') not in CLASSIFICATION_COMPATIBLE:
                        continue
                    if value.get('outcome') == 'EARNINGS_RELEASE' and value.get('parserVersion') != PARSER_VERSION:
                        proof = inspect_html((value.get('evidence') or '').encode(), value.get('sourceUrl') or '')
                        if proof['outcome'] != 'EARNINGS_RELEASE':
                            value = {**value, 'outcome': proof['outcome']}
                    validated[acc] = value
                submissions['_intelligenceDocumentEvidence'] = validated
            canonical = None
            for listing in company['listings']:
                candidate = read_optional(self.root / 'quant/data/sec/canonical' / (listing['symbol'] + '.json'))
                if candidate:
                    canonical = candidate
                    break
            consumer = read_optional(self.root / 'quant/data/sec/consumer' / ('CIK' + cik + '.json'))
            financials = summary(consumer, cik, self.now)
            ends = [m['current']['periodEnd'] for m in financials.get('metrics', {}).values() if (m.get('current') or {}).get('periodEnd')] if financials.get('state') == 'AVAILABLE' else []
            financials['reportingPeriod'] = max(ends) if ends else None
            financials['stale'] = not ends or max(ends) < advance(self.now, -180 * 24)[:10]
            self.store.set_state('financials:' + cid, financials)
            canonical_cik = None
            if canonical:
                index = read_optional(self.root / 'quant/data/sec/inspector_index.json') or {}
                canonical_cik = next((c.get('cik') for c in index.get('companies', []) if c.get('ticker') == canonical.get('security', {}).get('ticker')), None)
            events = project_sec(company, canonical, submissions, consumer, self.now, canonical_cik=canonical_cik)
            # Old imported descriptions outside the bounded metadata cache must
            # not retain a publication claim after the verifier is tightened.
            for row in self.store.db.execute("SELECT payload FROM events WHERE company=? AND kind='EARNINGS_PUBLISHED'", (cid,)).fetchall():
                legacy = json.loads(row[0])
                if legacy.get('detectionEvidence') == ['6-K_EXPLICIT_RESULTS_DESCRIPTION'] and not legacy.get('eventProvenance') and (legacy.get('documentEvidence') or {}).get('outcome') != 'EARNINGS_RELEASE':
                    legacy.update(eventType='EARNINGS_CANDIDATE', headline='Possible earnings release', eventStatus='UNVERIFIED', detectionEvidence=['6-K_RESULTS_DESCRIPTION_CANDIDATE'])
                    self.store.event(legacy, self.now)
                    self.store.audit(self.now, cid, 'LEGACY_DESCRIPTION_ONLY_EARNINGS_RECLASSIFIED', eventId=legacy['eventId'])
            result_ids = {e['eventId'] for e in events if e['eventType'] != 'SEC_FILING'}
            # Replace derived classifications for the same SEC accession; never retain a disproved candidate as published.
            for e in events:
                if e['eventType'] == 'SEC_FILING':
                    with self.store.db:
                        self.store.db.execute("DELETE FROM events WHERE company=? AND kind IN ('EARNINGS_PUBLISHED','EARNINGS_CANDIDATE','OPERATING_RESULTS_PUBLISHED','PERIODIC_REPORT_PUBLISHED') AND json_extract(payload,'$.filingId')=? AND id<>? AND id NOT IN (SELECT target FROM event_alias)",
                                              (cid, e['filingId'], stable_id(cid, e['filingId'], 'RESULTS_EVENT')))
                        result_id = stable_id(cid, e['filingId'], 'RESULTS_EVENT')
                        if result_id not in result_ids:
                            self.store.db.execute('DELETE FROM events WHERE id=? AND id NOT IN (SELECT target FROM event_alias)', (result_id,))
                self.store.event(e, self.now)
            from .reporting_calendar import fact_history
            self.store.set_state('reportingHistory:' + cid, fact_history(consumer, cik, self.now))
            self.refresh_estimates(company)
            sec_state = {**self.store.state('sec:' + cid, {}), 'projectedAt': self.now, 'events': len(events),
                         'hasCanonical': bool(canonical), 'hasConsumer': bool(consumer)}
            if submissions:
                sec_state['hasSubmissions'] = True
            if fetch_sec and submissions:
                sec_state.update(lastSuccess=self.now, retryAfter=None, reason=None)
            self.store.set_state('sec:' + cid, sec_state)
        except BudgetExhausted:
            self.store.audit(self.now, cid, 'SEC_DEFERRED', reason='REQUEST_OR_TIME_BUDGET')
            raise
        except Exception as exc:
            # SEC client has its own failure types; isolate every issuer and persist exact failure.
            self.run['secFailures'] += 1
            self.store.audit(self.now, cid, 'SEC_FAILURE', reason=str(exc)[:250])
            self.store.set_state('sec:' + cid, {**self.store.state('sec:' + cid, {}), 'lastFailure': self.now, 'reason': str(exc)[:250], 'retryAfter': advance(self.now, 24)})
            log('SEC_FAILURE', companyId=cid, reason=str(exc)[:250])
        finally:
            self.run['processedCompanies'] += 1

    def refresh_estimates(self, company):
        cid = company['companyId']
        all_events = [json.loads(r[0]) for r in self.store.db.execute('SELECT payload FROM events WHERE company=?', (cid,))]
        from .reporting_calendar import forecast
        diagnostic = {}
        estimates = forecast(company, all_events, self.store.state('reportingHistory:' + cid, []), self.now, diagnostic)
        self.store.set_state('calendarModel:' + cid, {**diagnostic, 'checkedAt': self.now})
        # Legacy seasonal observations without period ends remain useful; do not
        # mix their windows with a stronger fiscal-end forecast.
        if not estimates:
            estimates = estimate_calendar(company, all_events, self.now)
        # Preserve estimate -> confirmation evidence before retiring an estimate.
        for prior in [e for e in all_events if e['eventType'] == 'EARNINGS_ESTIMATED']:
            confirmations = [e for e in all_events if e['eventType'] in ('EARNINGS_SCHEDULED', 'EARNINGS_CALL') and e.get('confirmationStatus') == 'CONFIRMED'
                             and prior['dateStart'] <= e.get('date', '') <= prior['dateEnd']]
            if len(confirmations) == 1:
                official = confirmations[0]
                transition = {'previousEventId': prior['eventId'], 'previousStatus': 'ESTIMATED', 'previousDateStart': prior['dateStart'],
                              'previousDateEnd': prior['dateEnd'], 'confirmationStatus': 'CONFIRMED', 'date': official['date'], 'sourceUrl': official['sourceUrl'], 'changedAt': self.now}
                history = official.get('confirmationHistory', [])
                if not any(h.get('previousEventId') == prior['eventId'] for h in history):
                    official['confirmationHistory'] = history + [transition]
                    self.store.event(official, self.now)
                    self.store.audit(self.now, company['companyId'], 'ESTIMATE_CONFIRMED', **transition)
        retained = {e['eventId'] for e in estimates}
        with self.store.db:
            for prior in [e for e in all_events if e['eventType'] == 'EARNINGS_ESTIMATED' and e['eventId'] not in retained]:
                reported = [e for e in all_events if e['eventType'] in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED')
                            and not e.get('isAmendment') and e.get('fiscalQuarter') == prior.get('fiscalQuarter')
                            and prior['dateStart'] <= e.get('date', '') <= min(prior['dateEnd'], self.now[:10])]
                self.store.audit(self.now, cid, 'ESTIMATE_RETIRED', eventId=prior['eventId'],
                                 previousDateStart=prior['dateStart'], previousDateEnd=prior['dateEnd'],
                                 reason='ALREADY_REPORTED' if reported else 'WINDOW_NO_LONGER_SUPPORTED',
                                 reportingEvidence=[{'eventId': e['eventId'], 'date': e['date'], 'sourceUrl': e.get('sourceUrl')} for e in reported])
                self.store.db.execute('DELETE FROM events WHERE id=?', (prior['eventId'],))
        previous = {e['eventId']: e for e in all_events if e['eventType'] == 'EARNINGS_ESTIMATED'}
        volatile = {'discoveredAt', 'updatedAt', 'dateHistory', 'confirmationHistory', 'estimationHistory'}
        for e in estimates:
            prior = previous.get(e['eventId'])
            if prior:
                if {k: v for k, v in prior.items() if k not in volatile} == {k: v for k, v in e.items() if k not in volatile}:
                    e['updatedAt'] = prior.get('updatedAt', prior.get('discoveredAt', self.now))
                if (prior.get('dateStart'), prior.get('dateEnd')) != (e.get('dateStart'), e.get('dateEnd')):
                    change = {'previousDateStart': prior.get('dateStart'), 'previousDateEnd': prior.get('dateEnd'), 'dateStart': e.get('dateStart'), 'dateEnd': e.get('dateEnd'), 'changedAt': self.now}
                    e['estimationHistory'] = prior.get('estimationHistory', []) + [change]
                    self.store.audit(self.now, cid, 'ESTIMATE_WINDOW_CHANGED', eventId=e['eventId'], **change)
                elif prior.get('estimationHistory'):
                    e['estimationHistory'] = prior['estimationHistory']
            self.store.event(e, self.now)

    def discover_company(self, company, official_site):
        cid = company['companyId']
        try:
            sources, configurations = discover_ir(company, official_site, self.http, self.now)
            for source in sources:
                self.store.source(source)
            from .materials import retain_source_configurations
            configurations=retain_source_configurations(self.store,cid,configurations)
            warnings = [warning for config in configurations for warning in config.get('discoveryWarnings', [])]
            if warnings:
                self.run['discoveryFailures'] += 1
                self.store.audit(self.now, cid, 'IR_PARTIAL_DISCOVERY', warnings=warnings)
                log('IR_PARTIAL_DISCOVERY', companyId=cid, warnings=warnings)
            self.store.set_state('ir:' + cid, {'lastSuccess': self.now, 'configurations': configurations, 'sources': len(sources), 'nextVerify': advance(self.now, 14 * 24)})
            log('IR_DISCOVERED', companyId=cid, sources=len(sources))
        except BudgetExhausted:
            raise
        except Exception as exc:
            self.run['discoveryFailures'] += 1
            self.store.audit(self.now, cid, 'IR_DISCOVERY_FAILURE', reason=str(exc)[:250])
            self.store.set_state('ir:' + cid, {**self.store.state('ir:' + cid, {}), 'lastFailure': self.now, 'reason': str(exc)[:250], 'retryAfter': advance(self.now, 24)})
            log('IR_DISCOVERY_FAILURE', companyId=cid, reason=str(exc)[:250])

    def gdelt_batch(self, companies, timespan='1d'):
        # Exact company names in OR batches; results still independently resolved from title.
        names = sorted({c['names'][0] for c in companies if c['names']})[:10]
        query = '(' + ' OR '.join('"' + n.replace('"', '') + '"' for n in names) + ') sourcelang:english'
        url = 'https://api.gdeltproject.org/api/v2/doc/doc?' + urlencode({'query': query, 'mode': 'artlist', 'format': 'json', 'maxrecords': 250, 'timespan': timespan, 'sort': 'datedesc'})
        source = {'sourceId': stable_id('gdelt', names), 'type': 'GDELT', 'url': url, 'verified': False, 'active': False, 'intervalHours': 12}
        self.store.source(source)
        self.ingest_source(source)
