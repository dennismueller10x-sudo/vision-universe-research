"""Transactional local state. No new hosted database; bounded static exports."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from pathlib import Path
import re
from .model import SCHEMA, normalize, stable_id

def item_time(item):
    return item.get('publishedAt') or item.get('observedAt')


def timeline_entry(value):
    # Timeline links to the richer section instead of repeating every financial metric/exhibit.
    keys = ('companyId', 'newsId', 'eventId', 'eventType', 'headline', 'publishedAt', 'publishedDate', 'observedAt',
            'timestampPrecision', 'date', 'dateStart', 'dateEnd', 'startsAt', 'timezone', 'canonicalUrl', 'sourceUrl',
            'importance', 'categories', 'confidence', 'confirmationStatus', 'eventStatus', 'fiscalYear', 'fiscalQuarter', 'reportingPeriod')
    return {key: value[key] for key in keys if key in value}


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
                self.db.execute('INSERT OR REPLACE INTO items VALUES(?,?,?,?)',
                                (merged['newsId'], merged['companyId'], item_time(merged), dumps(merged)))
                return 'DUPLICATE'
            self.db.execute('INSERT INTO items VALUES(?,?,?,?)', (item['newsId'], item['companyId'], item_time(item), dumps(item)))
            return 'NEW'

    def event(self, event, now):
        event = dict(event)
        incoming_id = event['eventId']
        alias = self.db.execute('SELECT target FROM event_alias WHERE alias=?', (incoming_id,)).fetchone()
        if alias and self.db.execute('SELECT 1 FROM events WHERE id=?', (alias[0],)).fetchone():
            event['eventId'] = alias[0]
        # First-party release and verified SEC earnings are one event only with exact period AND date evidence.
        correction = bool(re.search(r'correct(?:ion|ed)|restated|revised', event.get('headline', '') + ' ' + (event.get('documentEvidence', {}).get('evidence') or ''), re.I))
        earnings_group = (not correction and event['eventType'] == 'EARNINGS_PUBLISHED' and event.get('reportingPeriod') and event.get('fiscalQuarter') and event.get('fiscalYear') and not event.get('isAmendment'))
        call_group = event['eventType'] == 'EARNINGS_CALL' and event.get('startsAt') and event.get('confirmationStatus') == 'CONFIRMED'
        if earnings_group or call_group:
            peers = [json.loads(r[0]) for r in self.db.execute(
                "SELECT payload FROM events WHERE company=? AND kind='EARNINGS_PUBLISHED' AND date=? AND json_extract(payload,'$.reportingPeriod')=? AND json_extract(payload,'$.fiscalQuarter')=? AND json_extract(payload,'$.fiscalYear')=?",
                (event['companyId'], event['date'], event.get('reportingPeriod'), event.get('fiscalQuarter'), event.get('fiscalYear')))] if earnings_group else [json.loads(r[0]) for r in self.db.execute("SELECT payload FROM events WHERE company=? AND kind='EARNINGS_CALL' AND json_extract(payload,'$.startsAt')=? AND json_extract(payload,'$.confirmationStatus')='CONFIRMED'", (event['companyId'], event['startsAt']))]
            peers = [p for p in peers if not p.get('isAmendment') and not re.search(r'correct(?:ion|ed)|restated|revised', p.get('headline', ''), re.I)]
            if peers:
                preferred = min(peers + [event], key=lambda e: (not bool(e.get('sourceId')), e.get('sourceUrl', '')))
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
                summaries = [e['summary'] for e in peers + [event] if e.get('summary', {}).get('state') == 'AVAILABLE']
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
            prior = json.loads(old[0])
            event['discoveredAt'] = prior.get('discoveredAt', now)
            prior_date, new_date = prior.get('date'), event.get('date')
            if prior_date != new_date or prior.get('startsAt') != event.get('startsAt'):
                event['dateHistory'] = prior.get('dateHistory', []) + [{'previous': prior_date, 'current': new_date, 'changedAt': now, 'previousStartsAt': prior.get('startsAt'), 'currentStartsAt': event.get('startsAt')}]
                self.audit(now, event.get('sourceId'), 'CALENDAR_CHANGED', eventId=event['eventId'], previous=prior_date, current=new_date)
            else:
                event['dateHistory'] = prior.get('dateHistory', [])
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO events VALUES(?,?,?,?,?)',
                            (event['eventId'], event['companyId'], event['eventType'], event.get('date') or event.get('publishedAt'), dumps(event)))

    def prune(self, now):
        cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=365)).isoformat().replace('+00:00', 'Z')
        audit_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=30)).isoformat().replace('+00:00', 'Z')
        with self.db:
            self.db.execute('DELETE FROM items WHERE published<?', (cutoff,))
            self.db.execute('DELETE FROM audit WHERE created<?', (audit_cutoff,))
            self.db.execute("DELETE FROM state WHERE key LIKE 'sec-document:%' AND json_extract(payload,'$.filingDate')<?", (cutoff[:10],))
            self.db.execute('DELETE FROM event_alias WHERE target NOT IN (SELECT id FROM events)')
            event_cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=5 * 366)).date().isoformat()
            self.db.execute('DELETE FROM events WHERE date<?', (event_cutoff,))
            self.db.execute('DELETE FROM events WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY company ORDER BY date DESC,id) AS n FROM events) WHERE n>500)')
            # A burst cannot produce an unbounded company feed; preserve regulatory history separately.
            self.db.execute('DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY company ORDER BY published DESC,id) AS n FROM items) WHERE n>500)')

    def company_payload(self, company, now):
        cid = company['companyId']
        items = [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM items WHERE company=? ORDER BY published DESC,id LIMIT 100', (cid,))]
        events = [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM events WHERE company=? ORDER BY date DESC,id LIMIT 200', (cid,))]
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
        timeline = [timeline_entry(e) for e in sorted(timeline_items + events, key=lambda e: e.get('publishedAt') or e.get('observedAt') or e.get('date') or '', reverse=True)[:100]]
        for entry in timeline:
            if entry.get('eventId') in related:
                entry['relatedNewsIds'] = related[entry['eventId']]
        return {'schema': SCHEMA, 'companyId': cid, 'listings': company['listings'], 'companyName': company['names'][0] if company['names'] else None,
                'generatedAt': now, 'state': 'AVAILABLE' if items or events else 'NO_DATA',
                'news': [i for i in items if i['eventType'] == 'NEWS'],
                'filings': [e for e in events if e['eventType'] == 'SEC_FILING'][:30],
                'earnings': [e for e in events if e['eventType'] in ('EARNINGS_PUBLISHED', 'EARNINGS_CANDIDATE', 'PERIODIC_REPORT_PUBLISHED')][:12],
                'events': [e for e in events if e['eventType'] in ('EARNINGS_SCHEDULED', 'EARNINGS_ESTIMATED', 'EARNINGS_CALL', 'IR_EVENT') and (e.get('dateEnd') or e.get('date', '')) >= now[:10]][:30],
                'calls': [e for e in events if e['eventType'] == 'EARNINGS_CALL'][:20],
                'timeline': timeline,
                'coverage': {'sources': [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM sources WHERE company=?', (cid,))], 'sec': self.state('sec:' + cid, {'state': 'NOT_CHECKED'}), 'ir': self.state('ir:' + cid, {'state': 'NOT_CHECKED'}), 'newsGuarantee': False}}

    def export(self, companies, output, now):
        output = Path(output)
        # Immutable generations: readers never see a new index with old company payloads.
        # Content hash includes all rows: two exports in the same second cannot overwrite each other.
        import hashlib
        digest = hashlib.sha256(now.encode())
        digest.update(dumps(companies).encode())
        for table in ('items', 'events', 'sources'):
            for row in self.db.execute('SELECT payload FROM ' + table + ' ORDER BY id'):
                digest.update(row[0].encode())
        for row in self.db.execute("SELECT key,payload FROM state WHERE key LIKE 'sec:%' OR key LIKE 'ir:%' ORDER BY key"):
            digest.update(row[0].encode())
            digest.update(row[1].encode())
        generation = digest.hexdigest()[:24]
        paths, tickers = {}, {}
        for cid, company in sorted(companies.items()):
            payload = self.company_payload(company, now)
            if payload['state'] == 'NO_DATA':
                continue
            path = 'snapshots/' + generation + '/' + cid + '.json'
            if len(dumps(payload).encode()) > 1024 * 1024:
                raise ValueError('COMPANY_PAYLOAD_BUDGET_EXCEEDED:' + cid)
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
        sources = self.sources()
        counts = dict(self.db.execute('SELECT kind,COUNT(*) FROM events GROUP BY kind').fetchall())
        return {'generatedAt': now, 'universeCompanies': len(companies), 'activeSources': len(sources),
                'companiesWithNewsSource': len({s['companyId'] for s in sources if s.get('companyId') and s['type'] in ('IR_FEED', 'RSS')}),
                'companiesWithIRPage': self.db.execute("SELECT COUNT(*) FROM state WHERE key LIKE 'ir:%' AND json_extract(payload,'$.lastSuccess') IS NOT NULL").fetchone()[0],
                'companiesWithEventSource': len({s['companyId'] for s in sources if s.get('companyId') and s['type'] == 'IR_EVENTS'}),
                'sourceFailures': sum(bool(s.get('failureCount')) for s in sources),
                'staleSources': sum(not s.get('lastSuccess') or s['lastSuccess'] < (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=2)).isoformat().replace('+00:00', 'Z') for s in sources),
                'newsItems': self.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 'eventsByType': counts,
                'auditCodes': dict(self.db.execute("SELECT json_extract(payload,'$.code'),COUNT(*) FROM audit GROUP BY json_extract(payload,'$.code')").fetchall())}
