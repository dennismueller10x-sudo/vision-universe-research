import copy
import io
import json
import sqlite3
import sys
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
from company_intelligence.model import Resolver, load_universe, make_item, canonical_url, classify
from company_intelligence.store import Store, duplicate_reason
from company_intelligence.feeds import parse_feed, parse_gdelt, discover_ir
from company_intelligence.transport import PublicHTTP, SourceError, BudgetExhausted, validate_public_url
from company_intelligence.earnings import summary, project_sec, estimate_calendar
from company_intelligence.ir_events import from_announcement, parse_ics, parse_jsonld, guidance_evidence
from company_intelligence.pipeline import Pipeline
from company_intelligence.cli import select
from company_intelligence.discovery import validate_candidate

NOW = '2026-10-01T18:00:00Z'


def company(name='Apple Inc.', symbol='AAPL', cik='0000320193'):
    return {'companyId': 'iss_cik_' + cik, 'cik': cik, 'names': [name], 'officialSites': ['https://apple.com/'],
            'listings': [{'instrumentId': 'vu_b8ae31d1562481', 'symbol': symbol, 'exchange': 'NASDAQ', 'shareClass': None}]}


def source(c=None, kind='IR_FEED', url='https://apple.com/feed'):
    c = c or company()
    return {'sourceId': kind + '-source', 'companyId': c['companyId'], 'url': url, 'type': kind, 'verified': kind == 'IR_FEED', 'allowedSites': ['https://apple.com/']}


def item(headline='Apple Inc. announces quarterly earnings results', url='https://apple.com/story', published='2026-10-01T12:00:00Z'):
    raw = {'headline': headline, 'url': url, 'publishedAt': published}
    return make_item(raw, source(), {'companyId': company()['companyId'], 'confidence': 1, 'evidence': ['OFFICIAL']}, NOW)


def consumer():
    c = {'schema': 'vu-consumer-fundamentals-1.0.0', 'cik': '0000320193', 'asOf': '2026-10-01', 'policy': 'as_of_latest',
         'columns': ['fy', 'fp', 'end', 'v', 'filed', 'accn', 'derived'], 'dataSource': {'provider': 'sec_edgar', 'isMock': False},
         'units': {'revenue': 'USD', 'gross_profit': 'USD', 'operating_income': 'USD', 'free_cash_flow': 'USD', 'total_debt': 'USD'},
         'quarterly': {}, 'annual': {}}
    periods = [(2025, 'Q3', '2025-06-30', '2025-08-01'), (2025, 'Q4', '2025-09-30', '2025-11-01'),
               (2026, 'Q1', '2025-12-31', '2026-02-01'), (2026, 'Q2', '2026-03-31', '2026-05-01'), (2026, 'Q3', '2026-06-30', '2026-08-01')]
    for metric, vals in {'revenue': [100, 120, 130, 140, 150], 'gross_profit': [40, 48, 52, 56, 75], 'operating_income': [10, 12, 13, 14, 20], 'free_cash_flow': [20, 30, 10, 15, -5], 'total_debt': [80, 90, 70, 60, 50]}.items():
        c['quarterly'][metric] = [[fy, fp, end, v, filed, f'0000320193-{fy % 100:02d}-000001', 0] for (fy, fp, end, filed), v in zip(periods, vals)]
    return c


class ResolverTests(unittest.TestCase):
    def test_ambiguous_generic_words_are_rejected(self):
        names = [('Root, Inc.', 'ROOT'), ('Unity Software Inc.', 'U'), ('Block, Inc.', 'XYZ'), ('Toast, Inc.', 'TOST'),
                 ('Target Corporation', 'TGT'), ('Affirm Holdings Inc.', 'AFRM'), ('Meta Platforms Inc.', 'META'), ('Apple Inc.', 'AAPL'), ('Oracle Corporation', 'ORCL')]
        texts = ['The root of inflation is earnings pressure', 'Unity between countries supports investors', 'A block of shares trades on NYSE',
                 'Toast to the quarter and profit', 'Analysts target revenue growth', 'Investors affirm support for the outlook', 'Meta analysis of earnings',
                 'Apple harvest forecasts improve', 'Oracle predicts global revenue growth']
        for i, ((name, symbol), title) in enumerate(zip(names, texts)):
            c = company(name, symbol, f'{i:010d}')
            resolver = Resolver({c['companyId']: c})
            self.assertEqual([], resolver.resolve({'headline': title, 'url': 'https://publisher.com/a'}, {'type': 'GDELT', 'ticker': symbol}), (name, title))

    def test_legal_names_and_explicit_tickers(self):
        c = company('Unity Software Inc.', 'U')
        r = Resolver({c['companyId']: c})
        for title in ['Unity Software launches new developer tools', 'Unity Software Inc. reports results', 'NYSE: U announces earnings', '$U shares rise']:
            self.assertEqual(c['companyId'], r.resolve({'headline': title}, {'type': 'RSS'})[0]['companyId'])
        self.assertFalse(r.resolve({'headline': 'U is a letter'}, {'type': 'RSS'}))

    def test_german_analyst_rating_context_keeps_generic_names_blocked(self):
        c = company('Tesla Inc.', 'TSLA')
        r = Resolver({c['companyId']: c})
        self.assertEqual(c['companyId'], r.resolve({'headline': "RBC stuft Tesla auf 'Outperform'"}, {'type': 'RSS'})[0]['companyId'])
        self.assertFalse(r.resolve({'headline': 'Tesla erforscht elektrische Schwingungen'}, {'type': 'RSS'}))
        c = company('Root Inc.', 'ROOT'); r = Resolver({c['companyId']: c})
        self.assertFalse(r.resolve({'headline': "RBC stuft Root auf 'Neutral'"}, {'type': 'RSS'}))

    def test_company_source_only_its_verified_domain(self):
        c = company()
        r = Resolver({c['companyId']: c})
        self.assertEqual(1, r.resolve({'headline': 'A new product', 'url': 'https://www.apple.com/story'}, source())[0]['confidence'])
        self.assertFalse(r.resolve({'headline': 'A new product', 'url': 'https://apple.com.evil.net/story'}, source()))
        self.assertFalse(r.resolve({'headline': 'A new product', 'url': 'https://publisher.com/story'}, {**source(), 'verified': False}))

    def test_multiple_share_classes_share_issuer(self):
        c = company('Alphabet Inc.', 'GOOG')
        c['listings'].append({'instrumentId': 'vu_eb90e69762d28e', 'symbol': 'GOOGL', 'exchange': 'NASDAQ'})
        r = Resolver({c['companyId']: c})
        self.assertEqual(1, len(r.resolve({'headline': 'Alphabet Inc. announces $GOOG and $GOOGL dividend'}, {'type': 'RSS'})))

    def test_collision_cannot_resolve_ticker(self):
        a, b = company('Issuer One', 'ABC', '0000000001'), company('Issuer Two', 'ABC', '0000000002')
        self.assertFalse(Resolver({a['companyId']: a, b['companyId']: b}).resolve({'headline': '$ABC results'}, {'type': 'RSS'}))
        with self.assertRaisesRegex(ValueError, 'AMBIGUOUS_TICKER'):
            select({a['companyId']: a, b['companyId']: b}, 'ABC')

    def test_classification_explainable(self):
        self.assertEqual('CRITICAL', classify('Apple Inc bankruptcy filing')['importance'])
        self.assertIn('Guidance', classify('Apple Inc raises revenue guidance')['categories'])

    def test_url_canonicalization_preserves_semantics(self):
        self.assertEqual('https://example.com/story?id=3', canonical_url('https://EXAMPLE.com:443/story?utm_source=x&id=3#foo'))
        self.assertNotEqual(canonical_url('https://example.com/?id=1'), canonical_url('https://example.com/?id=2'))
        for url in ['javascript:alert(1)', 'data:text/html,x', 'https://user:pw@example.com/', 'https://example.com:broken/']:
            self.assertIsNone(canonical_url(url))


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'state.sqlite')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_four_origins_one_story_with_provenance(self):
        for kind, url in [('GDELT', 'https://agg.com/a'), ('RSS', 'https://wire.com/a'), ('SEC', 'https://sec.gov/a'), ('IR_FEED', 'https://apple.com/a')]:
            i = item(url=url)
            i['newsId'] = kind
            i['provenance'][0].update(discoverySource=kind, sourceId=kind)
            self.store.ingest(i)
        p = self.store.company_payload(company(), NOW)
        self.assertEqual(1, len(p['news']))
        self.assertEqual(4, len(p['news'][0]['provenance']))
        self.assertEqual('https://apple.com/a', p['news'][0]['canonicalUrl'])
        self.assertEqual('GDELT', p['news'][0]['newsId'])  # Group identity remains stable when preferred source arrives.

    def test_distinct_events_numbers_and_opposite_actions(self):
        a = item('Apple Inc. raises revenue guidance to $100 billion')
        for headline in ['Apple Inc. raises revenue guidance to $120 billion', 'Apple Inc. cuts revenue guidance to $100 billion']:
            b = item(headline, url='https://wire.com/a')
            self.assertIsNone(duplicate_reason(a, b))
        b = item(published='2026-09-01T12:00:00Z')
        self.assertIsNone(duplicate_reason(item(), b))

    def test_idempotence_and_first_discovery_preserved(self):
        first = item()
        self.store.ingest(first)
        repeat = copy.deepcopy(first)
        repeat['discoveredAt'] = '2026-10-02T18:00:00Z'
        repeat['provenance'][0]['discoveredAt'] = repeat['discoveredAt']
        self.store.ingest(repeat)
        out = self.store.company_payload(company(), NOW)['news']
        self.assertEqual(1, len(out))
        self.assertEqual(NOW, out[0]['discoveredAt'])
        self.assertEqual(1, len(out[0]['provenance']))

    def test_reused_url_different_story_does_not_merge(self):
        self.store.ingest(item('Apple Inc. launches a new iPhone with new camera'))
        self.store.ingest(item('Apple Inc. announces a dividend increase for investors'))
        self.assertEqual(2, len(self.store.company_payload(company(), NOW)['news']))

    def test_observed_old_article_does_not_refresh_publication(self):
        old = item(published='2026-09-01T12:00:00Z')
        self.store.ingest(old)
        seen = item(published='2026-10-01T12:00:00Z')
        seen['observedAt'], seen['publishedAt'] = seen['publishedAt'], None
        seen['timestampPrecision'] = 'DISCOVERY_TIME'
        seen['provenance'][0].update(publishedAt=None, observedAt=seen['observedAt'], timestampPrecision='DISCOVERY_TIME', sourceId='gdelt', discoverySource='GDELT')
        self.store.ingest(seen)
        out = self.store.company_payload(company(), NOW)['news']
        self.assertEqual(1, len(out))
        self.assertEqual('2026-09-01T12:00:00Z', out[0]['publishedAt'])

    def test_same_second_export_new_content_uses_new_generation(self):
        self.store.ingest(item())
        out = Path(self.tmp.name) / 'public'
        first = self.store.export({company()['companyId']: company()}, out, NOW)
        self.store.ingest(item('Apple Inc declares dividend', url='https://apple.com/dividend'))
        second = self.store.export({company()['companyId']: company()}, out, NOW)
        self.assertNotEqual(first['generation'], second['generation'])
        self.assertTrue((out / 'snapshots' / first['generation']).is_dir())

    def test_calendar_change_audited(self):
        e = {'eventId': 'e', 'companyId': company()['companyId'], 'eventType': 'EARNINGS_SCHEDULED', 'date': '2026-11-01', 'discoveredAt': NOW}
        self.store.event(e, NOW)
        self.store.event({**e, 'date': '2026-11-04'}, '2026-10-02T18:00:00Z')
        row = json.loads(self.store.db.execute('SELECT payload FROM events').fetchone()[0])
        self.assertEqual('2026-11-01', row['dateHistory'][0]['previous'])
        self.assertEqual(1, self.store.quality(NOW, {})['auditCodes']['CALENDAR_CHANGED'])

    def test_export_identity_and_stable_lookup(self):
        self.store.ingest(item())
        out = Path(self.tmp.name) / 'public'
        self.store.export({company()['companyId']: company()}, out, NOW)
        index = json.loads((out / 'index.json').read_text())
        self.assertEqual(company()['companyId'], json.loads((out / ('snapshots/' + index['generation'] + '/lookup/AA.json')).read_text())['tickers']['AAPL'][0]['companyId'])
        self.assertTrue((out / json.loads((out / ('snapshots/' + index['generation'] + '/lookup/AA.json')).read_text())['companies'][company()['companyId']]).exists())

    def test_earnings_exact_period_grouping_and_no_merge_of_amendment(self):
        base = {'companyId': company()['companyId'], 'eventType': 'EARNINGS_PUBLISHED', 'date': '2026-08-05', 'fiscalQuarter': 'Q2', 'fiscalYear': 2026,
                'reportingPeriod': '2026-06-30', 'discoveredAt': NOW, 'sourceDocuments': []}
        self.store.event({**base, 'eventId': 'sec', 'filingId': 'f', 'sourceUrl': 'https://sec.gov/release', 'sourceDocuments': [{'type': 'SEC', 'url': 'https://sec.gov/release', 'filingId': 'f'}]}, NOW)
        self.store.event({**base, 'eventId': 'ir', 'sourceId': 'ir', 'sourceUrl': 'https://apple.com/release', 'sourceDocuments': [{'type': 'IR', 'url': 'https://apple.com/release'}]}, NOW)
        rows = self.store.db.execute("SELECT payload FROM events WHERE kind='EARNINGS_PUBLISHED'").fetchall()
        self.assertEqual(1, len(rows))
        self.assertEqual(2, len(json.loads(rows[0][0])['sourceDocuments']))
        self.store.event({**base, 'eventId': 'amended', 'isAmendment': True, 'sourceUrl': 'https://sec.gov/amended'}, NOW)
        self.assertEqual(2, self.store.db.execute("SELECT COUNT(*) FROM events").fetchone()[0])

    def test_call_grouping_then_reschedule_retains_alias_and_history(self):
        base = {'companyId': company()['companyId'], 'eventType': 'EARNINGS_CALL', 'date': '2026-11-01', 'startsAt': '2026-11-01T22:00:00Z',
                'confirmationStatus': 'CONFIRMED', 'discoveredAt': NOW, 'sourceDocuments': []}
        self.store.event({**base, 'eventId': 'announcement', 'sourceId': 'ir', 'sourceUrl': 'https://apple.com/announcement'}, NOW)
        self.store.event({**base, 'eventId': 'calendar_uid', 'sourceId': 'calendar', 'sourceUrl': 'https://apple.com/calendar'}, NOW)
        self.assertEqual(1, self.store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0])
        self.store.event({**base, 'eventId': 'calendar_uid', 'sourceId': 'calendar', 'sourceUrl': 'https://apple.com/calendar', 'date': '2026-11-02', 'startsAt': '2026-11-02T22:00:00Z'}, NOW)
        row = json.loads(self.store.db.execute('SELECT payload FROM events').fetchone()[0])
        self.assertEqual('2026-11-02', row['date'])
        self.assertEqual('2026-11-01', row['dateHistory'][0]['previous'])
        self.assertEqual(1, self.store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0])

    def test_source_health_persists_across_reseeding(self):
        self.store.source({**source(), 'failureCount': 3, 'nextCheck': NOW})
        s = self.store.source(source())
        self.assertEqual(3, s['failureCount'])
        self.assertFalse(self.store.sources('2026-09-30T00:00:00Z'))

    def test_retention_bounded(self):
        self.store.ingest(item(published='2024-01-01T00:00:00Z'))
        self.store.prune(NOW)
        self.assertEqual(0, self.store.quality(NOW, {})['newsItems'])

    def test_timeline_release_one_entry_and_compact_metrics_reference(self):
        n = item()
        self.store.ingest(n)
        e = {'eventId': 'earnings', 'companyId': company()['companyId'], 'eventType': 'EARNINGS_PUBLISHED', 'date': '2026-10-01',
             'headline': n['headline'], 'sourceDocuments': [{'url': n['canonicalUrl']}], 'summary': {'state': 'AVAILABLE', 'metrics': {'revenue': 123}}}
        self.store.event(e, NOW)
        payload = self.store.company_payload(company(), NOW)
        self.assertEqual(1, len(payload['timeline']))
        self.assertEqual([n['newsId']], payload['timeline'][0]['relatedNewsIds'])
        self.assertNotIn('summary', payload['timeline'][0])
        self.assertEqual(e['summary'], payload['earnings'][0]['summary'])


class ParserTests(unittest.TestCase):
    def test_official_site_candidate_requires_visible_legal_owner_and_no_foreign_redirect(self):
        class HTTP:
            def __init__(self, body, url='https://apple.com/'):
                self.body, self.url = body, url
            def get(self, *args, **kwargs):
                return {'body': self.body.encode(), 'finalUrl': self.url}
        candidate = {'url': 'https://apple.com/', 'evidence': 'EXACT_CIK'}
        html = '<title>Apple</title><main>' + ('Product information ' * 100) + '</main><footer>Apple Inc.</footer>'
        self.assertEqual('VALIDATED', validate_candidate(company(), candidate, HTTP(html), NOW)['status'])
        for page, url in [('<title>Apple</title><script>Apple Inc.</script><p>Apple fruit</p>', 'https://apple.com/'),
                          (html, 'https://unrelated.com/'), ('<title>Unrelated</title><p>Apple Inc.</p>', 'https://apple.com/')]:
            with self.assertRaises(SourceError):
                validate_candidate(company(), candidate, HTTP(page, url), NOW)

    def test_atom_uses_published_not_updated(self):
        body = b'<feed xmlns="http://www.w3.org/2005/Atom"><entry><title><![CDATA[Apple &amp; partners]]></title><link href="/a"/><published>2026-09-30T12:00:00Z</published><updated>2026-10-01T15:00:00Z</updated></entry></feed>'
        p = parse_feed(body, 'https://apple.com/feed')[0]
        self.assertEqual('2026-09-30T12:00:00Z', p['publishedAt'])
        self.assertEqual('https://apple.com/a', p['url'])
        self.assertIsNone(parse_feed(body.replace(b'published', b'unknown'), 'https://apple.com/feed')[0]['publishedAt'])

    def test_rss_timezone_and_sanitization(self):
        p = parse_feed(b'<rss><channel><item><title>&lt;script&gt;alert(1)&lt;/script&gt; Test</title><link>https://example.com/a</link><pubDate>Thu, 01 Oct 2026 10:00:00 -0400</pubDate></item></channel></rss>', 'https://example.com/feed')[0]
        self.assertEqual('2026-10-01T14:00:00Z', p['publishedAt'])
        self.assertNotIn('<script>', p['headline'])

    def test_xml_failure_and_entities(self):
        for body in [b'<rss><broken>', b'<!DOCTYPE rss [<!ENTITY x "boom">]><rss/>', b'<html>not feed</html>']:
            with self.assertRaises(SourceError):
                parse_feed(body, 'https://example.com/feed')

    def test_json_feed_and_gdelt_errors(self):
        p = parse_feed(json.dumps({'version': 'https://jsonfeed.org/version/1.1', 'items': [{'title': 'A', 'url': 'https://example.com/a', 'date_published': '2026-09-30T12:00:00Z'}]}).encode(), 'https://example.com/feed')
        self.assertEqual(1, len(p))
        with self.assertRaises(SourceError):
            parse_gdelt(b'{"error":"overloaded"}')
        d = parse_gdelt(b'{"articles":[{"title":"Apple Inc results","url":"https://example.com/a","seendate":"20261001T120000Z"}]}')
        self.assertEqual('DISCOVERY_TIME', d[0]['timestampPrecision'])

    def test_reusable_ir_discovery_validates_linked_feed(self):
        bodies = {'https://apple.com/': b'<a href="https://ir.apple.com/">Investors</a>',
                  'https://ir.apple.com/': b'<link href="/investor/style.css"><link href="/investor/favicon.ico"><a href="/static-files/opaque-id">Investor presentation</a><a href="/">Investors</a><link type="application/atom+xml" href="/rss" rel="alternate">',
                  'https://ir.apple.com/rss': b'<feed><entry><title>Results</title><link href="https://ir.apple.com/news"/><published>2026-10-01T12:00:00Z</published></entry></feed>'}
        class HTTP:
            def get(self, url, **kwargs):
                return {'finalUrl': url, 'body': bodies[url]}
        sources, configs = discover_ir(company(), 'https://apple.com/', HTTP(), NOW)
        self.assertEqual(1, len(sources))
        self.assertTrue(sources[0]['verified'])
        self.assertEqual('GENERIC', configs[0]['providerType'])
        self.assertEqual(2, len(configs))  # Assets and repeated IR homepage do not consume the crawl budget.

    def test_optional_ir_page_failure_preserves_validated_feed(self):
        bodies = {'https://apple.com/': b'<a href="/investors">Investors</a><link type="application/rss+xml" href="/rss">',
                  'https://apple.com/rss': b'<rss><channel><item><title>Apple Inc results</title><link>https://apple.com/release</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'}
        class HTTP:
            def get(self, url, **kwargs):
                if url.endswith('/investors'):
                    raise SourceError('HTTP_503')
                return {'finalUrl': url, 'body': bodies[url]}
        sources, configs = discover_ir(company(), 'https://apple.com/', HTTP(), NOW)
        self.assertEqual(1, len(sources))
        self.assertEqual('HTTP_503', configs[0]['discoveryWarnings'][0]['reason'])


class EarningsTests(unittest.TestCase):
    def test_annual_units_duplicates_and_derivation_proof(self):
        c = consumer()
        for metric, values in [('revenue', [100, 150]), ('gross_profit', [40, 75])]:
            c['annual'][metric] = [[year, 'FY', f'{year}-06-30', value, f'{year}-08-01', f'0000320193-{year % 100:02d}-000001', 0] for year, value in zip((2025, 2026), values)]
        s = summary(c, company()['cik'], NOW, 'FY', 2026)
        self.assertAlmostEqual(50, s['metrics']['revenue']['yoyPercent'])
        self.assertEqual(10, s['metrics']['gross_margin']['changePercentagePoints'])
        self.assertEqual('POSITIVE', next(x for x in s['whatChanged'] if x['metric'] == 'revenue')['direction'])
        for mutation in [lambda x: x['annual']['revenue'].append(x['annual']['revenue'][-1]),
                         lambda x: x['annual']['revenue'][-1].__setitem__(6, True),
                         lambda x: x['units'].__setitem__('revenue', 'shares'),
                         lambda x: x['annual']['revenue'][-1].__setitem__(3, float('inf'))]:
            bad = copy.deepcopy(c)
            mutation(bad)
            s = summary(bad, company()['cik'], NOW, 'FY', 2026)
            self.assertEqual('UNAVAILABLE', s['metrics']['revenue']['state'])
            self.assertIsNone(s['metrics']['revenue']['current'])
        c['units']['revenue'] = 'shares'
        self.assertEqual('UNAVAILABLE', summary(c, company()['cik'], NOW)['metrics']['revenue']['state'])

    def test_quarter_comparisons_margins_and_ttm(self):
        s = summary(consumer(), company()['cik'], NOW)
        self.assertEqual((2026, 'Q3'), (s['fiscalYear'], s['fiscalQuarter']))
        self.assertEqual(50, s['metrics']['revenue']['yoy']['percent'])
        self.assertEqual(540, s['metrics']['revenue']['ttm']['value'])
        self.assertIsNone(s['metrics']['total_debt']['ttm'])
        self.assertEqual(50, s['metrics']['gross_margin']['current']['value'])
        changes = {r['metric']: r for r in s['whatChanged']}
        self.assertEqual('NEGATIVE', changes['free_cash_flow']['direction'])
        self.assertEqual('NEUTRAL', changes['total_debt']['direction'])
        self.assertEqual('NOT_COMPARABLE', changes['total_debt']['classification'])
        self.assertEqual('UNAVAILABLE', s['metrics']['eps_diluted']['state'])

    def test_missing_zero_negative_and_bad_currency(self):
        c = consumer()
        c['quarterly']['revenue'][0][3] = 0
        s = summary(c, company()['cik'], NOW)
        self.assertIsNone(s['metrics']['revenue']['yoy']['percent'])
        c['quarterly']['revenue'][0][3] = -100
        self.assertIsNone(summary(c, company()['cik'], NOW)['metrics']['revenue']['yoy']['percent'])
        c['units']['gross_profit'] = 'EUR'
        self.assertEqual('UNAVAILABLE', summary(c, company()['cik'], NOW)['metrics']['gross_margin']['state'])

    def test_duplicate_period_nan_future_filing_rejected(self):
        for change in [lambda c: c['quarterly']['revenue'].append(c['quarterly']['revenue'][-1]),
                       lambda c: c['quarterly']['revenue'][-1].__setitem__(3, float('nan')),
                       lambda c: c['quarterly']['revenue'][-1].__setitem__(4, '2027-01-01')]:
            c = consumer()
            change(c)
            s = summary(c, company()['cik'], NOW)
            self.assertEqual('UNAVAILABLE', s['metrics']['revenue']['state'])

    def test_8k_item_and_foreign_private_issuer(self):
        sub = {'cik': company()['cik'], 'filings': {'recent': {
            'accessionNumber': ['0000320193-26-000091', '0000320193-26-000092', '0000320193-26-000093'],
            'form': ['8-K', '6-K', '6-K'], 'filingDate': ['2026-09-30'] * 3, 'items': ['2.02,9.01', '', ''],
            'primaryDocDescription': ['', 'Notice of meeting', 'Third quarter financial results'],
            'acceptanceDateTime': ['2026-09-30T20:00:00Z'] * 3, 'primaryDocument': ['release.htm'] * 3}}}
        events = project_sec(company(), None, sub, consumer(), NOW)
        earnings = [e for e in events if e['eventType'] in ('EARNINGS_CANDIDATE', 'EARNINGS_PUBLISHED')]
        self.assertEqual(2, len(earnings))
        self.assertIsNone(earnings[0]['reportingPeriod'])
        self.assertEqual('UNAVAILABLE', earnings[0]['summary']['state'])
        self.assertIn('8-K_ITEM_2.02_CANDIDATE', earnings[0]['detectionEvidence'])
        self.assertEqual('UNVERIFIED', earnings[0]['eventStatus'])
        with self.assertRaisesRegex(ValueError, 'COMPANY_MISMATCH'):
            project_sec(company(), None, {**sub, 'cik': '0000000001'}, consumer(), NOW)

    def test_exact_accession_consumer_period_and_wrong_canonical_cik(self):
        sub = {'cik': company()['cik'], 'filings': {'recent': {'accessionNumber': ['0000320193-26-000001'], 'form': ['10-Q'], 'filingDate': ['2026-08-01'], 'reportDate': ['2026-06-30']}}}
        events = project_sec(company(), None, sub, consumer(), NOW)
        report = next(e for e in events if e['eventType'] == 'PERIODIC_REPORT_PUBLISHED')
        self.assertEqual(('Q3', 2026, '2026-06-30'), (report['fiscalQuarter'], report['fiscalYear'], report['reportingPeriod']))
        canonical = {'dataSource': {'isMock': False}, 'security': {'ticker': 'AAPL'}, 'filings': []}
        with self.assertRaisesRegex(ValueError, 'CANONICAL_COMPANY_MISMATCH'):
            project_sec(company(), canonical, None, consumer(), NOW, canonical_cik='0000000001')

    def test_10q_is_report_not_proof_of_earnings_release(self):
        canonical = {'dataSource': {'isMock': False}, 'security': {'ticker': 'AAPL'}, 'filings': [
            {'filingId': '0000320193-26-000001', 'formType': '10-Q', 'filedAt': '2026-08-01', 'periodEnd': '2026-06-30', 'fiscalYear': 2026, 'fiscalPeriod': 'Q3'}]}
        e = project_sec(company(), canonical, None, consumer(), NOW, canonical_cik=company()['cik'])
        self.assertEqual(['SEC_FILING', 'PERIODIC_REPORT_PUBLISHED'], [x['eventType'] for x in e])
        self.assertEqual('Q3', e[1]['fiscalQuarter'])
        self.assertIsNone(e[1]['publishedAt'])

    def test_real_apple_nvidia_microsoft_noncalendar_fiscal_year(self):
        for symbol, cik, quarter, year in [('AAPL', '0000320193', 'Q3', 2026), ('NVDA', '0001045810', 'Q2', 2027), ('MSFT', '0000789019', 'Q4', 2026)]:
            c = json.loads((Path(__file__).parent / 'fixtures' / (symbol + '-consumer.json')).read_text())
            s = summary(c, cik, NOW)
            self.assertEqual((quarter, year), (s['fiscalQuarter'], s['fiscalYear']), symbol)
            self.assertEqual('AVAILABLE', s['metrics']['revenue']['state'])

    def test_estimated_window_never_confirmed_and_stale_history_ignored(self):
        events = [{'eventType': 'PERIODIC_REPORT_PUBLISHED', 'date': f'{y}-10-30', 'fiscalYear': y, 'fiscalQuarter': 'Q3', 'filingId': str(y)} for y in (2023, 2024, 2025)]
        estimate = estimate_calendar(company(), events, NOW)[0]
        self.assertEqual('ESTIMATED', estimate['confirmationStatus'])
        self.assertLess(estimate['dateStart'], estimate['dateEnd'])
        self.assertEqual('SEASONAL_MEDIAN_PERIODIC_REPORT_PROXY', estimate['methodology'])
        confirmed = {'eventType': 'EARNINGS_SCHEDULED', 'confirmationStatus': 'CONFIRMED', 'date': '2026-10-29'}
        self.assertFalse(estimate_calendar(company(), events + [confirmed], NOW))
        self.assertFalse(estimate_calendar(company(), events, '2029-10-01T00:00:00Z'))


class EventTests(unittest.TestCase):
    def test_explicit_date_and_timezone(self):
        i = {'headline': 'Apple will announce quarterly results on October 29, 2026 at 5:00 p.m. ET', 'url': 'https://apple.com/event'}
        e = from_announcement(i, source(), NOW)[0]
        self.assertEqual('CONFIRMED', e['confirmationStatus'])
        self.assertEqual('2026-10-29T21:00:00Z', e['startsAt'])
        self.assertEqual('America/New_York', e['timezone'])
        self.assertFalse(from_announcement(i, {**source(), 'verified': False}, NOW))

    def test_multiple_dates_past_release_and_dst_conflict_rejected(self):
        for title in ['Apple reports quarterly results October 29, 2026',
                      'Apple will report earnings October 29, 2026 and November 4, 2026',
                      'Apple will report earnings September 29, 2026',
                      'Apple will report earnings October 29, 2026 at 5:00 p.m. EST']:
            self.assertFalse(from_announcement({'headline': title, 'url': 'https://apple.com/event'}, source(), NOW), title)

    def test_jsonld_and_ics_calls_and_no_transcript(self):
        data = {'@context': 'https://schema.org', '@type': 'Event', 'name': 'Apple quarterly earnings call', 'startDate': '2026-10-29T17:00:00-04:00', 'url': 'https://apple.com/event'}
        e = parse_jsonld(('<script type="application/ld+json">' + json.dumps(data) + '</script>').encode(), source(kind='IR_EVENTS'), NOW)[0]
        self.assertEqual('EARNINGS_CALL', e['eventType'])
        self.assertIsNone(e['transcriptUrl'])
        ics = b'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:call-1\nSUMMARY:Apple quarterly earnings call\nDTSTART;TZID=America/New_York:20261029T170000\nURL:https://apple.com/call\nEND:VEVENT\nEND:VCALENDAR'
        e = parse_ics(ics, source(kind='IR_EVENTS'), NOW)[0]
        self.assertEqual('2026-10-29T21:00:00Z', e['startsAt'])
        self.assertFalse(parse_ics(ics.replace(b';TZID=America/New_York', b''), source(kind='IR_EVENTS'), NOW))

    def test_real_root_event_feed_dates_have_title_evidence(self):
        body = (Path(__file__).parent / 'fixtures/ROOT-events.xml').read_bytes()
        c = company('Root, Inc.', 'ROOT', '0001788882')
        s = {**source(c, 'IR_EVENTS', 'https://ir.joinroot.com/rss/events.xml'), 'format': 'RSS_EVENTS', 'verified': True}
        events = [e for i in parse_feed(body, s['url']) for e in from_announcement(i, s, NOW)]
        call = next(e for e in events if '2Q 2026' in e['headline'])
        self.assertEqual('2026-08-05T21:00:00Z', call['startsAt'])
        self.assertEqual('CONFIRMED', call['confirmationStatus'])
        conference = next(e for e in events if 'Goldman Sachs' in e['headline'])
        self.assertEqual('2026-09-15', conference['date'])
        self.assertIsNone(conference['startsAt'])

    def test_press_release_dateline_does_not_override_call_date(self):
        i = {'headline': 'Root, Inc. Schedules Conference Call to Discuss Second Quarter 2026 Financial Results', 'url': 'https://apple.com/call',
             'publishedAt': '2026-06-24T20:05:31Z', 'evidenceText': 'COLUMBUS, Ohio, June 24, 2026 (GLOBE NEWSWIRE) -- Root plans to host a call on Wednesday, August 5, 2026 at 5:00 p.m. Eastern Time.'}
        e = from_announcement(i, source(), NOW)[0]
        self.assertEqual('2026-08-05T21:00:00Z', e['startsAt'])

    def test_guidance_uncertainty_explicit(self):
        i = {'url': 'https://apple.com/release', 'evidenceText': 'Management expects revenue between $10 and $12 billion next quarter.'}
        g = guidance_evidence(i, source())[0]
        self.assertEqual('UNVERIFIED_EVIDENCE', g['status'])
        self.assertIsNone(g['currency'])
        self.assertFalse(guidance_evidence({**i, 'evidenceText': 'expects revenue between $12 and $10 billion'}, source()))


class DocumentTests(unittest.TestCase):
    def test_failed_document_retries_after_cooldown_and_remains_bounded(self):
        from company_intelligence.sec_documents import enrich_submissions
        acc = '0000320193-26-000001'
        sub = {'filings': {'recent': {'accessionNumber': [acc], 'form': ['8-K'], 'filingDate': ['2026-09-30'], 'items': ['2.02'], 'primaryDocument': ['results.htm']}}}
        class Client:
            def __init__(self):
                self.stats, self.fail = {'requests': 0}, True
            def get_bytes(self, url):
                self.stats['requests'] += 1
                if self.fail:
                    raise OSError('Temporary failure')
                return b'<p>Apple announced financial results for third quarter fiscal 2026.</p>'
        client = Client()
        failed = enrich_submissions(sub, company()['cik'], client, NOW)['_intelligenceDocumentEvidence']
        self.assertEqual('UNAVAILABLE', failed[acc]['outcome'])
        client.fail = False
        self.assertEqual({}, enrich_submissions(sub, company()['cik'], client, NOW, previous=failed)['_intelligenceDocumentEvidence'])
        result = enrich_submissions(sub, company()['cik'], client, '2026-10-02T19:00:00Z', previous=failed)
        self.assertEqual('EARNINGS_RELEASE', result['_intelligenceDocumentEvidence'][acc]['outcome'])
        self.assertEqual(2, client.stats['requests'])

    def test_future_financial_release_is_operating_update_not_earnings(self):
        from company_intelligence.sec_documents import inspect_html
        payload = b'<h1>Tesla Vehicle Deliveries</h1><p>Tesla will post its financial results for the second quarter of 2026 on July 22.</p>'
        self.assertEqual('OPERATING_RESULTS', inspect_html(payload, 'https://sec.gov/file.htm')['outcome'])
        payload = b'<p>The company announced financial results for the quarter ended June 30, 2026.</p>'
        result = inspect_html(payload, 'https://sec.gov/file.htm')
        self.assertEqual('EARNINGS_RELEASE', result['outcome'])
        self.assertEqual('2026-06-30', result['periodEnd'])
        # Real XPeng board notice wording; future approval is not a published release.
        payload = b'<p>The Board of XPeng Inc. hereby announces that a meeting of the Board will be held on Monday, August 24, 2026, for the purposes of considering and approving the second quarterly results of the Company.</p>'
        self.assertEqual('UNVERIFIED', inspect_html(payload, 'https://sec.gov/file.htm')['outcome'])

    def test_period_year_order_noncalendar_and_inline_html(self):
        from company_intelligence.sec_documents import inspect_html, release_period
        for title in ['NVIDIA announces second quarter fiscal 2027 results', 'Root announces 2026 Second Quarter Results']:
            self.assertEqual('Q2', release_period(title)['fiscalQuarter'])
        parsed = inspect_html(b'<p>NVIDIA announces financial results for second quarter fiscal <span>20</span><span>27</span>.</p><a href="q2fy27pr.htm">99.1</a>', 'https://www.sec.gov/Archives/issuer/filing.htm')
        self.assertEqual(2027, parsed['period']['fiscalYear'])
        self.assertEqual(['https://www.sec.gov/Archives/issuer/q2fy27pr.htm'], parsed['exhibits'])

class Response(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(body)
        self.headers = headers or {}


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.calls = []
        self.clock = lambda: 1000000

    def tearDown(self):
        self.tmp.cleanup()

    def client(self, opener, budget=10):
        return PublicHTTP(self.tmp.name, opener=opener, validator=lambda u: u, clock=self.clock, sleep=lambda x: None, budget=budget)

    def test_conditional_cache_and_304(self):
        def opener(req, timeout):
            self.calls.append(dict(req.header_items()))
            if len(self.calls) == 1:
                return Response(b'feed', {'ETag': '"v1"', 'Last-Modified': 'yesterday'})
            raise urllib.error.HTTPError(req.full_url, 304, '', {}, None)
        first = self.client(opener).get('https://example.com/feed', robots=False)
        second = self.client(opener).get('https://example.com/feed', robots=False)
        self.assertEqual(first['body'], second['body'])
        self.assertIn('If-none-match', self.calls[1])
        self.assertEqual('"v1"', self.calls[1]['If-none-match'])

    def test_robots_disallow_no_source_fetch(self):
        def opener(req, timeout):
            self.calls.append(req.full_url)
            return Response(b'User-agent: *\nDisallow: /private')
        with self.assertRaisesRegex(SourceError, 'ROBOTS_DISALLOWED'):
            self.client(opener).get('https://example.com/private/feed')
        self.assertEqual(['https://example.com/robots.txt'], self.calls)

    def test_gzip_and_time_budget(self):
        import gzip
        c = self.client(lambda req, timeout: Response(gzip.compress(b'<rss/>'), {'Content-Encoding': 'gzip'}))
        self.assertEqual(b'<rss/>', c.get('https://example.com/feed', robots=False)['body'])
        c = self.client(lambda req, timeout: Response(b'abc'))
        c.deadline = 0
        with self.assertRaisesRegex(BudgetExhausted, 'TIME_BUDGET'):
            c.get('https://example.com/feed', robots=False)
        c = self.client(lambda req, timeout: Response(b'abc'))
        c.last_request = self.clock()
        c.deadline = self.clock() + 1
        with self.assertRaisesRegex(BudgetExhausted, 'TIME_BUDGET'):
            c.get('https://example.com/feed', robots=False)

    def test_timeout_rate_limit_size_and_budget(self):
        for opener, pattern in [(lambda req, timeout: (_ for _ in ()).throw(TimeoutError()), 'NETWORK_UNAVAILABLE'),
                                (lambda req, timeout: (_ for _ in ()).throw(urllib.error.HTTPError(req.full_url, 429, '', {'Retry-After': '3600'}, None)), 'RATE_LIMIT_DEFER'),
                                (lambda req, timeout: Response(b'x' * (PublicHTTP.MAX_BYTES + 1)), 'SOURCE_TOO_LARGE')]:
            with self.assertRaisesRegex(SourceError, pattern):
                self.client(opener).get('https://example.com/feed', robots=False)
        c = self.client(lambda req, timeout: Response(b'abc'), budget=1)
        c.get('https://example.com/a', robots=False)
        with self.assertRaises(BudgetExhausted):
            c.get('https://example.com/b', robots=False)

    def test_private_urls_and_redirects_blocked(self):
        dns = lambda host, *args, **kwargs: [(None, None, None, None, ('127.0.0.1', 0))]
        for url in ['http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/', 'http://publisher.com/', 'https://example.com:8080/']:
            with self.assertRaises(SourceError):
                validate_public_url(url, resolve=dns)
        def opener(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 302, '', {'Location': 'http://127.0.0.1/'}, None)
        c = self.client(opener)
        c.validator = lambda u: validate_public_url(u, resolve=lambda host, *args, **kwargs: [(None, None, None, None, ('127.0.0.1' if host == '127.0.0.1' else '1.1.1.1', 0))])
        with self.assertRaisesRegex(SourceError, 'PRIVATE_ADDRESS'):
            c.get('https://example.com/feed', robots=False)


class IntegrationTests(unittest.TestCase):
    def test_discovery_failure_keeps_last_success_and_configuration(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite')
            c = company()
            s.set_state('ir:' + c['companyId'], {'lastSuccess': '2026-09-30T12:00:00Z', 'configurations': [{'irHomepage': 'https://apple.com/'}]})
            class HTTP:
                def get(self, *args, **kwargs):
                    raise SourceError('HTTP_503')
            p = Pipeline(ROOT, {c['companyId']: c}, s, HTTP(), NOW)
            p.discover_company(c, 'https://apple.com/')
            state = s.state('ir:' + c['companyId'])
            self.assertEqual('2026-09-30T12:00:00Z', state['lastSuccess'])
            self.assertEqual('https://apple.com/', state['configurations'][0]['irHomepage'])
            self.assertEqual('2026-10-02T18:00:00Z', state['retryAfter'])
            self.assertEqual(1, p.run['discoveryFailures'])
            s.close()

    def test_disproved_foreign_earnings_removed_on_reprojection(self):
        from quant.sec.store import JsonRawStore
        from company_intelligence.sec_documents import PARSER_VERSION
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            s = Store(root / 'state.sqlite')
            acc = '0000320193-26-000001'
            sub = {'cik': company()['cik'], 'filings': {'recent': {'accessionNumber': [acc], 'form': ['6-K'], 'filingDate': ['2026-09-30'], 'primaryDocument': ['notice.htm']}}}
            JsonRawStore(root / 'quant/data/sec/raw').put(company()['cik'], 'submissions', sub)
            key = 'sec-document:' + company()['companyId'] + ':' + acc
            s.set_state(key, {'outcome': 'EARNINGS_RELEASE', 'parserVersion': PARSER_VERSION})
            p = Pipeline(root, {company()['companyId']: company()}, s, object(), NOW)
            p.project_company(company())
            self.assertEqual(1, s.db.execute("SELECT COUNT(*) FROM events WHERE kind='EARNINGS_PUBLISHED'").fetchone()[0])
            s.set_state(key, {'outcome': 'UNVERIFIED', 'parserVersion': PARSER_VERSION})
            p.project_company(company())
            self.assertEqual(0, s.db.execute("SELECT COUNT(*) FROM events WHERE kind='EARNINGS_PUBLISHED'").fetchone()[0])
            self.assertEqual(1, s.db.execute("SELECT COUNT(*) FROM events WHERE kind='SEC_FILING'").fetchone()[0])
            self.assertEqual(0, p.run['secFailures'])
            s.close()

    def test_workflow_is_manual_preview_and_read_only(self):
        workflow = (ROOT / '.github/workflows/company-intelligence.yml').read_text()
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('contents: read', workflow)
        self.assertIn('--request-budget 160 --max-seconds 480', workflow)
        self.assertIn('Reject changes to protected production paths', workflow)
        self.assertNotRegex(workflow, r'(?m)^\s*contents: write')
        self.assertIn("vars.COMPANY_INTELLIGENCE_ENABLED == 'true'", workflow)
        self.assertIn("vars.COMPANY_INTELLIGENCE_STATE_READY == 'true'", workflow)
        self.assertIn("if: github.event_name != 'schedule'", workflow)
        self.assertNotIn('git push', workflow)

    def test_real_master_share_classes_generic_and_renamed(self):
        companies = load_universe(ROOT)
        by_symbol = {l['symbol']: c for c in companies.values() for l in c['listings']}
        self.assertIs(by_symbol['GOOG'], by_symbol['GOOGL'])
        self.assertEqual('0001512673', by_symbol['XYZ']['cik'])
        self.assertEqual('0001206264', by_symbol['SGI']['cik'])
        self.assertGreater(len(companies), 5000)
        self.assertFalse(Resolver(companies).resolve({'headline': 'Unity between countries. A block of shares. Investors affirm their target.'}, {'type': 'RSS'}))

    def test_atom_updated_only_first_party_is_available_without_inventing_publication(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite')
            class HTTP:
                def get(self, url, **kwargs):
                    return {'finalUrl': url, 'body': b'<feed><entry><title>New product</title><link href="https://apple.com/new"/><updated>2026-09-30T12:00:00Z</updated></entry></feed>'}
            c = company()
            p = Pipeline(ROOT, {c['companyId']: c}, s, HTTP(), NOW)
            p.ingest_source(source())
            news = s.company_payload(c, NOW)['news'][0]
            self.assertIsNone(news['publishedAt'])
            self.assertEqual('SOURCE_UPDATED_TIME', news['timestampPrecision'])
            self.assertEqual('2026-09-30T12:00:00Z', news['observedAt'])
            s.close()

    def test_cli_resumes_without_writing_production_artifacts(self):
        import subprocess
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            args = [sys.executable, str(ROOT / 'scripts/company_intelligence/cli.py'), 'backfill', '--state', str(state), '--limit', '2']
            subprocess.run(args, cwd=ROOT, check=True, capture_output=True)
            s = Store(state / 'state.sqlite')
            first = s.state('backfillCursor')
            s.close()
            subprocess.run(args, cwd=ROOT, check=True, capture_output=True)
            s = Store(state / 'state.sqlite')
            self.assertGreater(s.state('backfillCursor'), first)
            s.close()
            bad = subprocess.run(args + ['--out', str(ROOT / 'quant/data/intelligence')], cwd=ROOT, capture_output=True)
            self.assertNotEqual(0, bad.returncode)

    def test_resolver_performance_1000_titles_real_universe(self):
        import time
        r = Resolver(load_universe(ROOT))
        started = time.monotonic()
        for _ in range(1000):
            self.assertTrue(r.resolve({'headline': 'NVIDIA Corporation announces quarterly earnings and revenue growth'}, {'type': 'RSS'}))
        self.assertLess(time.monotonic() - started, 5.0)

    def test_broken_source_does_not_stop_next_source_or_rerun(self):
        with tempfile.TemporaryDirectory() as tmp:
            s = Store(Path(tmp) / 'state.sqlite')
            class HTTP:
                def get(self, url, **kwargs):
                    if 'bad' in url:
                        raise SourceError('HTTP_503')
                    return {'finalUrl': url, 'body': b'<rss><channel><item><title>Apple Inc quarterly results</title><link>https://apple.com/a</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'}
            c = company()
            p = Pipeline(ROOT, {c['companyId']: c}, s, HTTP(), NOW)
            p.ingest_source({**source(), 'sourceId': 'bad', 'url': 'https://apple.com/bad'})
            p.ingest_source(source())
            p.ingest_source(source())
            self.assertEqual((1, 1, 0), (p.run['sourceFailures'], p.run['new'], p.run['duplicate']))
            rerun = Pipeline(ROOT, {c['companyId']: c}, s, HTTP(), NOW)
            rerun.ingest_source(source())
            self.assertEqual(1, rerun.run['duplicate'])
            self.assertEqual('SourceError:HTTP_503', next(x for x in s.sources() if x['sourceId'] == 'bad')['lastError'])
            s.close()


if __name__ == '__main__':
    unittest.main()
