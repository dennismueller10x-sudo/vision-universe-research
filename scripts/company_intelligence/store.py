"""Transactional local state. No new hosted database; bounded static exports."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
import re
from .model import SCHEMA, normalize, stable_id, canonical_url

def item_time(item):
    return item.get('publishedAt') or (item['publishedDate'] + 'T00:00:00Z' if item.get('publishedDate') else item.get('observedAt'))


def export_revision():
    """A producer change cannot reuse an immutable generation from older code."""
    import hashlib
    digest = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob('*.py')):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.digest()


def timeline_entry(value):
    # Timeline links to the richer section instead of repeating every financial metric/exhibit.
    keys = ('companyId', 'newsId', 'eventId', 'eventType', 'headline', 'publishedAt', 'publishedDate', 'observedAt',
            'timestampPrecision', 'date', 'dateStart', 'dateEnd', 'startsAt', 'timezone', 'canonicalUrl', 'sourceUrl',
            'importance', 'categories', 'confidence', 'confirmationStatus', 'eventStatus', 'fiscalYear', 'fiscalQuarter', 'reportingPeriod',
            'secItems', 'verificationState', 'classificationVersion')
    return {key: value[key] for key in keys if key in value}


def material_documents(events, cid):
    """References only; no document downloading or republishing."""
    documents = {}
    for e in events:
        for doc in e.get('sourceDocuments', []) + [{'url': e.get(k), 'type': kind} for k, kind in
                [('presentationUrl', 'PRESENTATION'), ('transcriptUrl', 'COMPANY_TRANSCRIPT'), ('quarterlyReportUrl', 'FINANCIAL_REPORT'), ('earningsReleaseUrl', 'EARNINGS_RELEASE'), ('webcastUrl', 'WEBCAST'), ('replayUrl', 'CALL_RECORDING')]]:
            url = doc.get('url')
            if not url:
                continue
            key = (url, doc.get('type') or 'SOURCE_DOCUMENT')
            documents[key] = {**doc, 'type': key[1], 'documentId': stable_id(cid, *key), 'companyId': cid, 'eventId': e['eventId'],
                              'reportingPeriod': e.get('reportingPeriod'), 'fiscalYear': e.get('fiscalYear'), 'fiscalQuarter': e.get('fiscalQuarter'), 'date': e.get('date'), 'label': doc.get('label') or e.get('headline')}
    return list(documents.values())


PRIORITY = {'IR_FEED': 0, 'IR_EVENTS': 0, 'SEC': 1, 'RSS': 2, 'GDELT': 3}


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def atomic_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(dumps(payload) + '\n')
    tmp.replace(path)


def duplicate_reason(a, b):
    # Never overmerge opposite actions or different numerical results / reporting periods.
    if a.get('eventType') != b.get('eventType'):
        return None
    delta = abs((datetime.fromisoformat(item_time(a).replace('Z', '+00:00')) -
                 datetime.fromisoformat(item_time(b).replace('Z', '+00:00'))).total_seconds())
    at, bt = normalize(a['headline']), normalize(b['headline'])
    if a['canonicalUrl'] == b['canonicalUrl'] and at == bt:
        if delta <= 72 * 3600 or not a.get('publishedAt') or not b.get('publishedAt'):
            return 'CANONICAL_URL_AND_EXACT_TITLE'
    if delta > 72 * 3600:
        return None
    if at == bt:
        return 'EXACT_NORMALIZED_TITLE_WITHIN_72H'
    if set(re.findall(r'\d+(?:\.\d+)?', a['headline'])) != set(re.findall(r'\d+(?:\.\d+)?', b['headline'])):
        return None
    actions = r'\b(increases?|decreases?|raises?|cuts?|beats?|misses?|approves?|rejects?|expands?|reduces?)\b'
    if set(re.findall(actions, at)) != set(re.findall(actions, bt)):
        return None
    # Similarity is deliberately high and requires substantial titles and same category.
    if min(len(at), len(bt)) >= 45 and a.get('categories') == b.get('categories'):
        if SequenceMatcher(None, at, bt, autojunk=False).ratio() >= .94:
            return 'TITLE_SIMILARITY_GE_0.94_WITHIN_72H'
    return None


class Store:
    def __init__(self, path):
        self.path = Path(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,company TEXT NOT NULL,published TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS company_time ON items(company,published DESC);
        CREATE INDEX IF NOT EXISTS company_url ON items(company,json_extract(payload,'$.canonicalUrl'));
        CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,company TEXT,active INTEGER NOT NULL,next_check TEXT,payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS due_sources ON sources(active,next_check);
        CREATE INDEX IF NOT EXISTS company_sources ON sources(company);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,company TEXT NOT NULL,kind TEXT NOT NULL,date TEXT,payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS company_events ON events(company,date DESC);
        CREATE INDEX IF NOT EXISTS company_filing ON events(company,json_extract(payload,'$.filingId'));
        CREATE TABLE IF NOT EXISTS event_alias(alias TEXT PRIMARY KEY,target TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,created TEXT NOT NULL,source TEXT,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS state(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
        ''')

    def close(self):
        self.db.close()

    def state(self, key, default=None):
        r = self.db.execute('SELECT payload FROM state WHERE key=?', (key,)).fetchone()
        return json.loads(r[0]) if r else default

    def set_state(self, key, payload):
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO state VALUES(?,?)', (key, dumps(payload)))

    def source(self, source):
        old = self.db.execute('SELECT payload FROM sources WHERE id=?', (source['sourceId'],)).fetchone()
        if old:
            source = {**json.loads(old[0]), **source}
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?,?,?)',
                            (source['sourceId'], source.get('companyId'), int(source.get('active', True)), source.get('nextCheck'), dumps(source)))
        return source

    def sources(self, now=None):
        sql = 'SELECT payload FROM sources WHERE active=1'
        args = ()
        if now:
            sql += ' AND (next_check IS NULL OR next_check<=?)'
            args = (now,)
        return [json.loads(r[0]) for r in self.db.execute(sql + ' ORDER BY next_check,id', args)]

    def audit(self, now, source, code, **evidence):
        payload = {'code': code, **evidence}
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO audit VALUES(?,?,?,?)',
                            (stable_id(now, source, payload), now, source, dumps(payload)))

    def ingest(self, item):
        """Single-writer transactions; every sighting retains provenance and first discovery."""
        with self.db:
            existing = self.db.execute('SELECT payload FROM items WHERE id=?', (item['newsId'],)).fetchone()
            candidates = [json.loads(existing[0])] if existing else [json.loads(r[0]) for r in self.db.execute(
                "SELECT payload FROM items WHERE company=? AND ((published>=? AND published<=?) OR json_extract(payload,'$.canonicalUrl')=?) ORDER BY published,id",
                (item['companyId'], (datetime.fromisoformat(item_time(item).replace('Z', '+00:00')) - timedelta(days=3)).isoformat().replace('+00:00', 'Z'),
                 (datetime.fromisoformat(item_time(item).replace('Z', '+00:00')) + timedelta(days=3)).isoformat().replace('+00:00', 'Z'), item['canonicalUrl']))]
            for old in candidates:
                reason = 'IDENTICAL_ID' if old['newsId'] == item['newsId'] else duplicate_reason(old, item)
                if not reason:
                    continue
                def priority(x):
                    return min(PRIORITY.get(p['discoverySource'], 9) for p in x['provenance'])
                primary = item if priority(item) < priority(old) else old
                merged = {**primary, 'newsId': old['newsId'], 'duplicateGroup': old['newsId'],
                          'discoveredAt': min(old['discoveredAt'], item['discoveredAt'])}
                refs = {}
                for p in old['provenance'] + item['provenance']:
                    key = (p['sourceId'], p['originalUrl'], p['headline'])
                    if key not in refs or p['discoveredAt'] < refs[key]['discoveredAt']:
                        refs[key] = p
                merged['provenanceTruncated'] = old.get('provenanceTruncated', False) or len(refs) > 32
                merged['provenance'] = sorted(refs.values(), key=lambda p: (PRIORITY.get(p['discoverySource'], 9), p['sourceId'], p['originalUrl']))[:32]
                merged['deduplicationEvidence'] = sorted(set(old.get('deduplicationEvidence', []) + [reason]))
                from .model import classify
                merged.update(classify(merged['headline']))
                self.db.execute('INSERT OR REPLACE INTO items VALUES(?,?,?,?)',
                                (merged['newsId'], merged['companyId'], item_time(merged), dumps(merged)))
                return 'DUPLICATE'
            self.db.execute('INSERT INTO items VALUES(?,?,?,?)', (item['newsId'], item['companyId'], item_time(item), dumps(item)))
            return 'NEW'

    def event(self, event, now):
        from .q4_events import correct_event
        event = correct_event(event)
        event = dict(event)
        incoming_id = event['eventId']
        alias = self.db.execute('SELECT target FROM event_alias WHERE alias=?', (incoming_id,)).fetchone()
        if alias and self.db.execute('SELECT 1 FROM events WHERE id=?', (alias[0],)).fetchone():
            event['eventId'] = alias[0]
        prior_row = self.db.execute('SELECT payload FROM events WHERE id=?', (event['eventId'],)).fetchone()
        prior_event = json.loads(prior_row[0]) if prior_row else {}
        independent = [p for p in (prior_event.get('eventProvenance') or []) if p.get('sourceId') and any(signal in ('OFFICIAL_RESULTS_RELEASE_TITLE', 'ISSUER_AUTHORED_RESULTS_RELEASE_TITLE_AND_DISTRIBUTOR_METADATA') for signal in (p.get('detectionEvidence') or []))] if event['eventType'] == 'EARNINGS_CANDIDATE' and prior_event.get('eventType') == 'EARNINGS_PUBLISHED' else []
        if event['eventType'] == 'EARNINGS_CANDIDATE' and prior_event.get('eventType') == 'EARNINGS_PUBLISHED' and independent:
            # A weaker SEC representation cannot revoke an independently proven
            # company release. Retain its candidate status in source provenance.
            ref = {k: event.get(k) for k in ('sourceId', 'sourceUrl', 'filingId', 'publishedAt', 'date', 'detectionEvidence')}
            ref['verificationState'] = 'CANDIDATE'
            refs = [p for p in prior_event['eventProvenance'] if (p.get('sourceUrl'), p.get('filingId')) != (ref.get('sourceUrl'), ref.get('filingId'))] + [ref]
            event = {**prior_event, 'eventProvenance': refs, 'documentEvidence': event.get('documentEvidence', {}),
                     'detectionEvidence': independent[0]['detectionEvidence']}
        # First-party release and verified SEC earnings are one event only with exact period AND date evidence.
        correction = bool(re.search(r'correct(?:ion|ed)|restated|revised', event.get('headline', '') + ' ' + (event.get('documentEvidence', {}).get('evidence') or ''), re.I))
        earnings_group = (not correction and event['eventType'] == 'EARNINGS_PUBLISHED' and event.get('reportingPeriod') and event.get('fiscalQuarter') and event.get('fiscalYear') and not event.get('isAmendment'))
        call_group = event['eventType'] == 'EARNINGS_CALL' and event.get('startsAt') and event.get('confirmationStatus') == 'CONFIRMED'
        peers = []
        if earnings_group or call_group:
            peers = [json.loads(r[0]) for r in self.db.execute(
                "SELECT payload FROM events WHERE company=? AND kind='EARNINGS_PUBLISHED' AND date=? AND json_extract(payload,'$.reportingPeriod')=? AND json_extract(payload,'$.fiscalQuarter')=? AND json_extract(payload,'$.fiscalYear')=?",
                (event['companyId'], event['date'], event.get('reportingPeriod'), event.get('fiscalQuarter'), event.get('fiscalYear')))] if earnings_group else [json.loads(r[0]) for r in self.db.execute("SELECT payload FROM events WHERE company=? AND kind='EARNINGS_CALL' AND json_extract(payload,'$.startsAt')=? AND json_extract(payload,'$.confirmationStatus')='CONFIRMED'", (event['companyId'], event['startsAt']))]
            peers = [p for p in peers if not p.get('isAmendment') and not re.search(r'correct(?:ion|ed)|restated|revised', p.get('headline', ''), re.I)]
            peers = [correct_event(p) for p in peers]
            if call_group:
                peers = [p for p in peers if all(not event.get(k) or not p.get(k) or event[k] == p[k] for k in ('fiscalQuarter', 'fiscalYear'))]
            if peers:
                preferred = min([event] + peers, key=lambda e: (not bool(e.get('sourceId')), e.get('sourceUrl', '')))
                combined = {**preferred, 'eventId': peers[0]['eventId'], 'discoveredAt': min(e.get('discoveredAt', now) for e in peers + [event])}
                documents, provenance = {}, {}
                for e in peers + [event]:
                    for doc in e.get('sourceDocuments', []):
                        documents[(doc['url'], doc.get('filingId'))] = doc
                    refs = e.get('eventProvenance') or [{k: e.get(k) for k in ('sourceId','sourceUrl','filingId','publishedAt','startsAt','date','detectionEvidence')}]
                    for ref in refs:
                        provenance[(ref.get('sourceUrl'), ref.get('filingId'))] = ref
                combined.update(sourceDocuments=list(documents.values()), eventProvenance=list(provenance.values()),
                                groupingEvidence='EXACT_ISSUER_FISCAL_PERIOD_REPORT_END_AND_PUBLICATION_DATE' if earnings_group else 'EXACT_ISSUER_CONFIRMED_CALL_START_TIME')
                # Prefer the newly parsed evidence on a rerun of the same source.
                for key in ('documentEvidence', 'guidance', 'companyKPIs', 'webcastUrl', 'replayUrl', 'presentationUrl', 'transcriptUrl', 'materialEvidence'):
                    enriched = [e[key] for e in [event] + peers if e.get(key)]
                    if enriched:
                        combined[key] = enriched[0]
                summaries = [e['summary'] for e in [event] + peers if e.get('summary', {}).get('state') == 'AVAILABLE']
                if summaries:
                    combined['summary'] = max(summaries, key=lambda s: s.get('sourceAsOf', ''))
                with self.db:
                    ids = {incoming_id, event['eventId']} | {peer['eventId'] for peer in peers}
                    for original in ids:
                        self.db.execute('UPDATE event_alias SET target=? WHERE target=?', (combined['eventId'], original))
                        self.db.execute('INSERT OR REPLACE INTO event_alias VALUES(?,?)', (original, combined['eventId']))
                        if original != combined['eventId']:
                            self.db.execute('DELETE FROM events WHERE id=?', (original,))
                    for peer in peers:
                        if peer['eventId'] != combined['eventId']:
                            self.db.execute('DELETE FROM events WHERE id=?', (peer['eventId'],))
                event = combined
        old = self.db.execute('SELECT payload FROM events WHERE id=?', (event['eventId'],)).fetchone()
        if old:
            prior = correct_event(json.loads(old[0]))
            event['discoveredAt'] = prior.get('discoveredAt', now)
            event.setdefault('confirmationHistory', prior.get('confirmationHistory', []))
            for key in ('webcastUrl', 'replayUrl', 'presentationUrl', 'transcriptUrl', 'materialEvidence'):
                if not event.get(key) and prior.get(key) and prior.get('date') == event.get('date'):
                    event[key] = prior[key]
            prior_date, new_date = prior.get('date'), event.get('date')
            if prior_date != new_date or prior.get('startsAt') != event.get('startsAt'):
                event['dateHistory'] = prior.get('dateHistory', []) + [{'previous': prior_date, 'current': new_date, 'changedAt': now, 'previousStartsAt': prior.get('startsAt'), 'currentStartsAt': event.get('startsAt')}]
                self.audit(now, event.get('sourceId'), 'CALENDAR_CHANGED', eventId=event['eventId'], previous=prior_date, current=new_date)
            else:
                event['dateHistory'] = prior.get('dateHistory', [])
        # Explicit PDF-document metadata cannot survive as a webcast/replay
        # merely because an earlier source used ambiguous attachment wording.
        pdf_urls = {canonical_url(d.get('url')) for d in event.get('sourceDocuments', [])
                    if d.get('mimeType') == 'application/pdf' and
                    d.get('type') in ('PRESENTATION','COMPANY_TRANSCRIPT')}
        for field in ('webcastUrl','replayUrl'):
            if event.get(field) and canonical_url(event[field]) in pdf_urls:
                event[field] = next((record[field] for record in peers + [prior_event]
                                     if record.get(field) and canonical_url(record[field]) not in pdf_urls), None)
        with self.db:
            encoded = dumps(event)
            if old and old[0] == encoded:
                return
            self.db.execute('INSERT OR REPLACE INTO events VALUES(?,?,?,?,?)',
                            (event['eventId'], event['companyId'], event['eventType'], event.get('date') or event.get('publishedAt'), encoded))

    def retire_composite_call(self, replacement, now):
        """Retire only a proven release-date/call-date mix-up on the same source."""
        proof = replacement.get('evidence') or {}
        if (replacement.get('eventType') != 'EARNINGS_SCHEDULED' or
                proof.get('method') != 'EXPLICIT_FIRST_PARTY_RELEASE_CLAUSE_IN_COMPOSITE_HEADLINE' or
                proof.get('retireLegacyCallOnReleaseDate') is not True or not replacement.get('sourceId') or not proof.get('originalHeadline')):
            return 0
        target = self.db.execute('SELECT payload FROM events WHERE id=?', (replacement['eventId'],)).fetchone()
        if not target or json.loads(target[0]).get('eventType') != 'EARNINGS_SCHEDULED':
            return 0  # Commit the verified replacement before retiring any prior row.
        old_rows = self.db.execute("SELECT id,payload FROM events WHERE company=? AND kind='EARNINGS_CALL' AND date=? AND json_extract(payload,'$.sourceId')=? AND json_extract(payload,'$.sourceUrl')=?",
                                   (replacement['companyId'], replacement['date'], replacement['sourceId'], replacement['sourceUrl'])).fetchall()
        retired = 0
        with self.db:
            for row in old_rows:
                old = json.loads(row['payload'])
                if (old.get('headline') != proof['originalHeadline'] or
                        (old.get('evidence') or {}).get('method') != 'EXPLICIT_OFFICIAL_ANNOUNCEMENT'):
                    continue
                audit = {'code':'COMPOSITE_CALL_RECLASSIFIED_AS_RELEASE','previousEvent':old,
                         'replacementEventId':replacement['eventId'],'reason':'The explicit full date proves the release; the headline names a different call day.'}
                self.db.execute('INSERT OR REPLACE INTO audit VALUES(?,?,?,?)',
                                (stable_id(now,replacement['sourceId'],audit),now,replacement['sourceId'],dumps(audit)))
                self.db.execute('UPDATE event_alias SET target=? WHERE target=?',(replacement['eventId'],row['id']))
                self.db.execute('INSERT OR REPLACE INTO event_alias VALUES(?,?)',(row['id'],replacement['eventId']))
                self.db.execute('DELETE FROM events WHERE id=?',(row['id'],))
                retired += 1
        return retired

    def prune(self, now):
        cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=365)).isoformat().replace('+00:00', 'Z')
        audit_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=30)).isoformat().replace('+00:00', 'Z')
        # Copy and commit before hot-ledger deletion. Interrupted pruning may
        # duplicate rows across stores, but cannot erase useful history.
        event_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=5 * 366)).date().isoformat()
        archive = sqlite3.connect(self.path.with_name('archive.sqlite'))
        try:
            archive.execute('CREATE TABLE IF NOT EXISTS history(kind TEXT,id TEXT,company TEXT,date TEXT,payload TEXT,PRIMARY KEY(kind,id))')
            with archive:
                for table, clock, threshold in [('items', 'published', cutoff), ('events', 'date', event_cutoff)]:
                    rows = self.db.execute(f'SELECT id,company,{clock},payload FROM {table} WHERE {clock}<? OR id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY company ORDER BY {clock} DESC,id) AS n FROM {table}) WHERE n>500)', (threshold,))
                    archive.executemany('INSERT OR REPLACE INTO history VALUES(?,?,?,?,?)', ((table, *tuple(r)) for r in rows))
        finally:
            archive.close()
        with self.db:
            self.db.execute('DELETE FROM items WHERE published<?', (cutoff,))
            self.db.execute('DELETE FROM audit WHERE created<?', (audit_cutoff,))
            self.db.execute("DELETE FROM state WHERE key LIKE 'sec-document:%' AND json_extract(payload,'$.filingDate')<?", (cutoff[:10],))
            self.db.execute('DELETE FROM event_alias WHERE target NOT IN (SELECT id FROM events)')
            event_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=5 * 366)).date().isoformat()
            self.db.execute('DELETE FROM events WHERE date<?', (event_cutoff,))
            self.db.execute('DELETE FROM events WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY company ORDER BY date DESC,id) AS n FROM events) WHERE n>500)')
            # Retired targets must not leave aliases dangling until the next run.
            self.db.execute('DELETE FROM event_alias WHERE target NOT IN (SELECT id FROM events)')
            # A burst cannot produce an unbounded company feed; preserve regulatory history separately.
            self.db.execute('DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY company ORDER BY published DESC,id) AS n FROM items) WHERE n>500)')

    def company_payload(self, company, now):
        cid = company['companyId']
        items = [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM items WHERE company=? ORDER BY published DESC,id LIMIT 100', (cid,))]
        from .model import classify
        for item in items:
            item.update(classify(item['headline']))
        events = [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM events WHERE company=? ORDER BY date DESC,id LIMIT 200', (cid,))]
        # Attach calls only with one same-issuer release on the same source date.
        for call in [e for e in events if e['eventType'] == 'EARNINGS_CALL']:
            releases = [e for e in events if e['eventType'] == 'EARNINGS_PUBLISHED' and e.get('date') == call.get('date') and e.get('fiscalQuarter') and e.get('fiscalYear') and all(not call.get(k) or call[k] == e[k] for k in ('fiscalQuarter', 'fiscalYear'))]
            periods = {(e['fiscalYear'], e['fiscalQuarter'], e.get('reportingPeriod')) for e in releases}
            if len(periods) == 1:
                release = releases[0]
                call.update(earningsEventId=release['eventId'], fiscalYear=release['fiscalYear'], fiscalQuarter=release['fiscalQuarter'], reportingPeriod=release.get('reportingPeriod'), linkageEvidence='UNIQUE_ISSUER_RELEASE_PERIOD_ON_SAME_SOURCE_DATE')
            elif call.get('fiscalYear') and call.get('fiscalQuarter') and call.get('confirmationStatus') == 'CONFIRMED' and call.get('date'):
                # Explicit issuer fiscal labels plus a bounded release/call gap;
                # never derive a fiscal period from the call's calendar date.
                linked = [e for e in events if e['eventType'] in ('EARNINGS_PUBLISHED', 'EARNINGS_SCHEDULED') and e.get('fiscalYear') == call['fiscalYear'] and e.get('fiscalQuarter') == call['fiscalQuarter'] and e.get('date') and 0 <= (datetime.fromisoformat(call['date']) - datetime.fromisoformat(e['date'])).days <= 7 and (e['eventType'] == 'EARNINGS_PUBLISHED' or e.get('confirmationStatus') == 'CONFIRMED') and not e.get('isAmendment')]
                if len(linked) == 1:
                    release = linked[0]
                    key = 'earningsEventId' if release['eventType'] == 'EARNINGS_PUBLISHED' else 'scheduledEarningsEventId'
                    call.update({key: release['eventId'], 'linkageEvidence': 'UNIQUE_ISSUER_EXPLICIT_FISCAL_PERIOD_RELEASE_AND_CALL_WITHIN_SEVEN_DAYS'})
        release_urls = {doc['url']: e for e in events if e['eventType'] == 'EARNINGS_PUBLISHED' for doc in e.get('sourceDocuments', []) if doc.get('url')}
        # An official release can be both news and a richer earnings event; show one timeline entry.
        related = {}
        timeline_items = []
        for item in items:
            release = release_urls.get(item['canonicalUrl'])
            if release and 'Earnings' in item.get('categories', []):
                related.setdefault(release['eventId'], []).append(item['newsId'])
            else:
                timeline_items.append(item)
        result_filings = {e.get('filingId') for e in events if e['eventType'] in ('EARNINGS_PUBLISHED', 'PERIODIC_REPORT_PUBLISHED', 'MATERIAL_SEC_EVENT') and e.get('filingId')}
        timeline_events = [e for e in events if e['eventType'] != 'SEC_FILING' or e.get('filingId') not in result_filings]
        timeline = [timeline_entry(e) for e in sorted(timeline_items + timeline_events, key=lambda e: e.get('publishedAt') or e.get('observedAt') or e.get('date') or '', reverse=True)[:100]]
        for entry in timeline:
            if entry.get('eventId') in related:
                entry['relatedNewsIds'] = related[entry['eventId']]
            if entry.get('eventId'):
                original = next((e for e in events if e['eventId'] == entry['eventId']), {})
                if original.get('filingId'):
                    entry['filingGroupId'] = stable_id(cid, original['filingId'], 'SEC_DISCLOSURE_GROUP')
                    entry['relatedEventIds'] = [e['eventId'] for e in events if e.get('filingId') == original['filingId'] and e['eventId'] != original['eventId']]
        configuration_documents = [d for cfg in self.state('ir:' + cid, {}).get('configurations', []) for d in cfg.get('documents', [])]
        financials = self.state('financials:' + cid, {'state': 'UNAVAILABLE', 'reason': 'NOT_PROJECTED'})
        from .profiles import public_profile
        profile = public_profile(self.state('companyProfile:' + cid), cid, now)
        references = {}
        if company.get('cik'):
            from .earnings import filing_url
            for metric in financials.get('metrics', {}).values():
                for key in ('current', 'previousQuarter', 'yearAgoQuarter', 'previousYear'):
                    fact = metric.get(key)
                    if fact and fact.get('filingId'):
                        url = filing_url(company['cik'], fact['filingId'])
                        if url:
                            references[url] = {'documentId': stable_id(cid, url, 'fact-reference'), 'companyId': cid, 'type': 'SEC_FACT_FILING_REFERENCE',
                                               'url': url, 'filingId': fact['filingId'], 'filedAt': fact.get('filedAt'), 'date': None, 'eventId': None,
                                               'evidence': 'EXISTING_VALIDATED_CONSUMER_FACT_ACCESSION', 'label': 'Fact source filing; form and publication time unavailable'}
        event_documents = material_documents(events, cid)
        # A large financial archive must not hide a recent conference webcast
        # merely because its event has passed out of the upcoming section.
        recordings = [d for d in event_documents if d['type'] in ('WEBCAST','CALL_RECORDING')]
        materials = list({(d['url'], d['type']): d for d in recordings + configuration_documents + event_documents + list(references.values())}.values())
        from .materials import placeholder_document_link
        materials = [d for d in materials if not placeholder_document_link(d['url'])]
        return {'schema': SCHEMA, 'companyId': cid, 'listings': company['listings'], 'companyName': company['names'][0] if company['names'] else None,
                'generatedAt': now, 'state': 'AVAILABLE' if profile or items or events or materials or financials.get('state')=='AVAILABLE' else 'NO_DATA',
                **({'companyProfile': profile} if profile else {}),
                'news': [i for i in items if i['eventType'] == 'NEWS'],
                'filings': [e for e in events if e['eventType'] == 'SEC_FILING'][:30],
                'earnings': [e for e in events if e['eventType'] in ('EARNINGS_PUBLISHED', 'EARNINGS_CANDIDATE', 'PERIODIC_REPORT_PUBLISHED')][:12],
                'events': [e for e in events if e['eventType'] in ('EARNINGS_SCHEDULED', 'EARNINGS_ESTIMATED', 'EARNINGS_CALL', 'IR_EVENT') and (e.get('dateEnd') or e.get('date', '')) >= now[:10]][:30],
                'calls': [e for e in events if e['eventType'] == 'EARNINGS_CALL'][:20],
                'timeline': timeline,
                'materialEvents': [e for e in events if e['eventType'] == 'MATERIAL_SEC_EVENT'][:30],
                'latestFinancials': financials,
                'materials': materials[:50],
                'presentations': [d for d in materials if d.get('type') == 'PRESENTATION'][:50],
                'coverage': {'sources': [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM sources WHERE company=?', (cid,))], 'sec': self.state('sec:' + cid, {'state': 'NOT_CHECKED'}), 'ir': self.state('ir:' + cid, {'state': 'NOT_CHECKED'}), 'newsGuarantee': False}}

    def export(self, companies, output, now):
        output = Path(output)
        # Immutable generations: readers never see a new index with old company payloads.
        # Content hash includes all rows: two exports in the same second cannot overwrite each other.
        import hashlib
        digest = hashlib.sha256(now.encode())
        digest.update(export_revision())
        digest.update(dumps(companies).encode())
        for table in ('items', 'events', 'sources'):
            for row in self.db.execute('SELECT payload FROM ' + table + ' ORDER BY id'):
                digest.update(row[0].encode())
        for row in self.db.execute("SELECT key,payload FROM state WHERE key LIKE 'sec:%' OR key LIKE 'ir:%' OR key LIKE 'financials:%' OR key LIKE 'companyProfile:%' ORDER BY key"):
            digest.update(row[0].encode())
            digest.update(row[1].encode())
        generation = digest.hexdigest()[:24]
        paths, tickers = {}, {}
        for cid, company in sorted(companies.items()):
            payload = self.company_payload(company, now)
            if payload['state'] == 'NO_DATA' and not payload['materials'] and payload['latestFinancials'].get('state') != 'AVAILABLE':
                continue
            if payload['materials'] or payload['latestFinancials'].get('state') == 'AVAILABLE':
                payload['state'] = 'AVAILABLE'
            path = 'snapshots/' + generation + '/' + cid + '.json'
            # A noisy issuer cannot prevent publishing all other companies.
            # Trim only the disposable consumer view; ledger/history remain intact.
            while len(dumps(payload).encode()) > 1024 * 1024:
                arrays = [key for key in ('news', 'earnings', 'filings', 'events', 'calls', 'timeline', 'materials', 'presentations', 'materialEvents') if payload.get(key)]
                if not arrays:
                    payload = {k: payload[k] for k in ('schema', 'companyId', 'listings', 'companyName', 'generatedAt')}
                    payload.update(state='NO_DATA', reason='COMPANY_PAYLOAD_BUDGET_EXCEEDED', news=[], earnings=[], filings=[], events=[], calls=[], timeline=[], materials=[], presentations=[])
                    break
                largest = max(arrays, key=lambda key: len(dumps(payload[key]).encode()))
                payload[largest].pop()
                payload['truncated'] = True
            atomic_json(output / path, payload)
            paths[cid] = path
        for cid, company in sorted(companies.items()):
            for l in company['listings']:
                tickers.setdefault(l['symbol'], []).append({'companyId': cid, 'instrumentId': l['instrumentId'], 'exchange': l['exchange']})
        lookups = {}
        for ticker, listings in tickers.items():
            lookups.setdefault(ticker[:2], {})[ticker] = listings
        for prefix, members in sorted(lookups.items()):
            member_ids = {l['companyId'] for listings in members.values() for l in listings}
            atomic_json(output / ('snapshots/' + generation + '/lookup/' + prefix + '.json'), {'schema': SCHEMA, 'generation': generation, 'tickers': members, 'companies': {cid: paths[cid] for cid in sorted(member_ids) if cid in paths}})
        atomic_json(output / 'index.json', {'schema': SCHEMA, 'state': 'PREVIEW', 'generatedAt': now, 'generation': generation, 'lookupShards': sorted(lookups), 'companyCount': len(companies), 'coveredCompanyCount': len(paths)})
        # Keep current + previous generation for in-flight browsers, discard older exports.
        dirs = sorted((output / 'snapshots').glob('*'), key=lambda p: p.stat().st_mtime, reverse=True)
        import shutil
        for path in dirs[2:]:
            shutil.rmtree(path)
        return {'exportedCompanies': len(paths), 'generation': generation}

    def quality(self, now, companies):
        from company_intelligence.coverage import ir_configuration, source_status
        sources = self.sources()
        counts = dict(self.db.execute('SELECT kind,COUNT(*) FROM events GROUP BY kind').fetchall())
        return {'generatedAt': now, 'universeCompanies': len(companies), 'configuredSources': self.db.execute('SELECT COUNT(*) FROM sources').fetchone()[0], 'enabledSources': len(sources), 'activeSources': sum(source_status(s, now) == 'ACTIVE' for s in sources),
                'companiesWithNewsSource': len({s['companyId'] for s in sources if s.get('companyId') and s['type'] in ('IR_FEED', 'RSS')}),
                'companiesWithIRPage': sum(any(ir_configuration(cfg) for cfg in json.loads(row[0]).get('configurations', [])) for row in self.db.execute("SELECT payload FROM state WHERE key LIKE 'ir:%'")),
                'companiesWithEventSource': len({s['companyId'] for s in sources if s.get('companyId') and s['type'] == 'IR_EVENTS'}),
                'sourceFailures': sum(bool(s.get('failureCount')) for s in sources),
                'staleSources': sum(source_status(s, now) == 'STALE' for s in sources),
                'newsItems': self.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 'eventsByType': counts,
                'auditCodes': dict(self.db.execute("SELECT json_extract(payload,'$.code'),COUNT(*) FROM audit GROUP BY json_extract(payload,'$.code')").fetchall())}
