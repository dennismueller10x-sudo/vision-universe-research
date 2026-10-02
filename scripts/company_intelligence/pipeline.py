"""One-company failure isolation, bounded source scheduling, resumable operations."""
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from .model import Resolver, canonical_url, make_item, stable_id, within_domain
from .transport import BudgetExhausted, SourceError
from .feeds import parse_feed, parse_gdelt, discover_ir
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
        self.resolver = Resolver(companies)
        self._processed_sources = set()
        self.run = {'new': 0, 'duplicate': 0, 'unmatched': 0, 'invalid': 0, 'sourceFailures': 0, 'secFailures': 0, 'documentFailures': 0, 'processedCompanies': 0, 'discoveryFailures': 0}

    def seed_sources(self, config):
        for configured in config:
            s = dict(configured)
            if s.get('companyId') and s['companyId'] not in self.companies:
                continue
            s.setdefault('sourceId', stable_id(s.get('companyId'), s['url']))
            s.setdefault('active', True)
            self.store.source(s)

    def ingest_due_sources(self, selected_ids, all_sources=False, force=False):
        for source in self.store.sources(None if force else self.now):
            if source['type'] != 'GDELT' and (all_sources or source.get('companyId') is None or source['companyId'] in selected_ids):
                self.ingest_source(source)

    def ingest_source(self, source):
        from .feeds import is_event_feed, is_material_feed
        if source.get('verified') and source['type'] == 'IR_FEED':
            if is_material_feed(source['url']):
                source = {**source, 'type': 'IR_MATERIALS', 'format': 'RSS_MATERIALS', 'intervalHours': 24}
            elif is_event_feed(source['url']):
                source = {**source, 'type': 'IR_EVENTS', 'format': 'RSS_EVENTS', 'intervalHours': 24}
            self.store.source(source)
        sid = source['sourceId']
        signature = (sid, source['type'], source.get('format'))
        if signature in self._processed_sources:
            return
        self._processed_sources.add(signature)
        try:
            accepted = 0
            rejected = 0
            response = self.http.get(source['url'], robots=source['type'] != 'GDELT')
            if source.get('verified') and source['type'] != 'SEC':
                if not any(within_domain(response['finalUrl'], site) for site in source.get('allowedSites', [])):
                    raise SourceError('SOURCE_REDIRECT_REQUIRES_REVALIDATION')
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
                else:
                    events = parse_ics(response['body'], source, self.now) if response['body'].lstrip().startswith(b'BEGIN:VCALENDAR') else parse_jsonld(response['body'], source, self.now)
                for e in events:
                    self.store.event(e, self.now)
                entries = []
            else:
                entries = parse_gdelt(response['body']) if source['type'] == 'GDELT' else parse_feed(response['body'], response['finalUrl'])
            for entry in entries:
                entry_time = entry.get('publishedAt') or entry.get('updatedAt')
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
                matches = self.resolver.resolve(entry, effective)
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
                    if source['type'] == 'GDELT':
                        # seendate is observation, not publication. Never claim it as publisher time.
                        item['observedAt'] = entry['publishedAt']
                        item['publishedAt'] = None
                        item['timestampPrecision'] = 'DISCOVERY_TIME'
                        item['provenance'][0]['timestampPrecision'] = 'DISCOVERY_TIME'
                        item['provenance'][0]['observedAt'] = entry['publishedAt']
                        item['provenance'][0]['publishedAt'] = None
                    if effective.get('verified') and match['companyId'] == effective.get('companyId'):
                        for e in from_announcement(entry, effective, self.now):
                            self.store.event(e, self.now)
                        import re
                        if entry.get('publishedAt') and re.search(r'\b(reports?|announces?)\b.{0,80}(?:quarter|fiscal|financial|full.year).{0,35}results', entry['headline'], re.I) and not re.search(r'\b(will|to announce|to report|date)\b', entry['headline'], re.I) and not (re.search(r'\b(production|deliveries|clinical|trial|study)\b', entry['headline'], re.I) and not re.search(r'financial results|earnings', entry['headline'], re.I)):
                            from .sec_documents import release_period
                            period = release_period(entry['headline']) or {}
                            quarter, year = period.get('fiscalQuarter'), period.get('fiscalYear')
                            company = self.companies[match['companyId']]
                            consumer = read_optional(self.root / 'quant/data/sec/consumer' / ('CIK' + str(company['cik']) + '.json')) if company.get('cik') else None
                            earnings = {'eventId': stable_id(match['companyId'], entry['url'], 'official-earnings'), 'companyId': match['companyId'],
                                        'eventType': 'EARNINGS_PUBLISHED', 'headline': entry['headline'], 'date': entry['publishedAt'][:10], 'publishedAt': entry['publishedAt'],
                                        'sourceId': source['sourceId'], 'sourceUrl': entry['url'], 'sourceDocuments': [{'type': 'OFFICIAL_EARNINGS_RELEASE', 'url': entry['url']}],
                                        'eventStatus': 'PUBLISHED', 'discoveredAt': self.now, 'fiscalQuarter': quarter, 'fiscalYear': year, 'reportingPeriod': None,
                                        'detectionEvidence': ['OFFICIAL_RESULTS_RELEASE_TITLE'], 'earningsReleaseUrl': entry['url'], 'transcriptUrl': None,
                                        'summary': summary(consumer, company['cik'], self.now, quarter, year) if quarter and year else {'state': 'UNAVAILABLE', 'reason': 'RELEASE_REPORTING_PERIOD_NOT_VERIFIED'}}
                            reported = earnings['summary'].get('metrics', {}).get('revenue', {}).get('current')
                            if reported:
                                earnings['reportingPeriod'] = reported.get('periodEnd')
                            self.store.event(earnings, self.now)
                        guidance = guidance_evidence(entry, effective)
                        if guidance:
                            item['guidanceEvidence'] = guidance
                    outcome = self.store.ingest(item)
                    self.run['duplicate' if outcome == 'DUPLICATE' else 'new'] += 1
            content_dates = [i.get('publishedAt') or i.get('updatedAt') for i in entries if (i.get('publishedAt') or i.get('updatedAt')) and (i.get('publishedAt') or i.get('updatedAt')) <= self.now]
            if source['type'] == 'IR_EVENTS':
                content_dates += [e.get('date') for e in events if e.get('date')]
            source.update(latestContentAt=max(content_dates) if content_dates else None, lastItemCount=len(entries) if source['type'] != 'IR_EVENTS' else len(events), lastAcceptedMatches=accepted, lastRejectedItems=rejected, lastSuccess=self.now, lastChecked=self.now, failureCount=0, lastError=None, nextCheck=advance(self.now, source.get('intervalHours', 6)))
            self.store.source(source)
            log('SOURCE_SUCCESS', sourceId=sid, items=source['lastItemCount'])
        except BudgetExhausted:
            raise
        except Exception as exc:
            failure = source.get('failureCount', 0) + 1
            delay = 7 * 24 if any(code in str(exc) for code in ('403', '404', 'ROBOTS')) else min(72, 2 ** min(failure, 6))
            source.update(lastFailure=self.now, lastChecked=self.now, failureCount=failure, lastError=(type(exc).__name__ + ':' + str(exc))[:250], nextCheck=advance(self.now, delay))
            self.store.source(source)
            self.store.audit(self.now, sid, 'SOURCE_FAILURE', errorType=type(exc).__name__, reason=str(exc)[:250])
            self.run['sourceFailures'] += 1
            log('SOURCE_FAILURE', sourceId=sid, reason=str(exc)[:250])

    def project_company(self, company, fetch_sec=False, sec_documents=False, sec_budget=60):
        """Reuse canonical/consumer/raw outputs; optional metadata refresh uses existing SEC client."""
        cid, cik = company['companyId'], company.get('cik')
        try:
            if not cik:
                self.store.audit(self.now, cid, 'SEC_UNAVAILABLE', reason='NO_VERIFIED_CIK')
                self.store.set_state('financials:' + cid, {'state': 'UNAVAILABLE', 'reason': 'NO_VERIFIED_CIK'})
                return
            from quant.sec.store import JsonRawStore
            submissions = JsonRawStore(self.root / 'quant/data/sec/raw').get_latest(cik, 'submissions')
            if fetch_sec:
                from quant.sec.http_client import SECHttpClient, DiskCache, RateLimiter
                from quant.sec.provider import SECProvider
                client = getattr(self, '_sec_client', None)
                if client is None:
                    client = self._sec_client = SECHttpClient(cache=DiskCache(self.root / '.sec-cache', ttl_seconds=2 * 3600), rate_limiter=RateLimiter(rate_per_second=1, burst=1), timeout=15, max_retries=1)
                def bounded_sec_open(url, headers, timeout):
                    remaining = self.deadline - self.clock()
                    if remaining <= 0 or client.stats['requests'] > sec_budget:
                        raise BudgetExhausted('SEC_REQUEST_OR_TIME_BUDGET_DEFERRED')
                    return client._urlopen(url, headers, min(timeout, remaining))
                client._opener = bounded_sec_open
                # No companyfacts downloads. Optional document inspection also uses this same client.
                submissions = SECProvider(client).get_submissions(cik, include_history=False)
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
        with self.store.db:
            self.store.db.execute("DELETE FROM events WHERE company=? AND kind='EARNINGS_ESTIMATED'", (cid,))
        for e in estimates:
            self.store.event(e, self.now)

    def discover_company(self, company, official_site):
        cid = company['companyId']
        try:
            sources, configurations = discover_ir(company, official_site, self.http, self.now)
            for source in sources:
                self.store.source(source)
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
        source = {'sourceId': stable_id('gdelt', names), 'type': 'GDELT', 'url': url, 'verified': False, 'active': False, 'intervalHours': 24}
        self.store.source(source)
        self.ingest_source(source)
