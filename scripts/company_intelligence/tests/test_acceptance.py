import json
import tempfile
import unittest
import sys
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.acceptance import fingerprint, prepare, advance, verify
from company_intelligence.checkpoint import pack, restore
from company_intelligence.model import Resolver, load_universe
from company_intelligence.feeds import parse_feed
from company_intelligence.earnings import project_sec
from company_intelligence.store import Store
from company_intelligence.coverage import report
from test_engine import company, source, item, NOW

ROOT = Path(__file__).resolve().parents[3]
GN = {'sourceId': 'gn-fixture', 'type': 'RSS', 'provider': 'GLOBENEWSWIRE_RSS', 'verified': False,
      'url': 'https://www.globenewswire.com/RssFeed/country/United%20States/feedTitle/test'}


class AcceptanceTests(unittest.TestCase):
    def test_generic_quarter_title_needs_two_reported_financial_metric_families(self):
        from company_intelligence.model import financial_release_evidence
        from company_intelligence.pipeline import Pipeline
        headline = 'Apple reports third quarter 2026 results'
        self.assertFalse(financial_release_evidence(headline, 'Sales of $1 billion'))
        self.assertFalse(financial_release_evidence(headline, 'Expected sales of $1 billion and EPS of $0.91'))
        snippet = 'Sales of $1 billion; net earnings of $125 million and diluted EPS of $0.91.'
        self.assertIn('REPORTED_FINANCIAL_METRICS_IN_SOURCE_SNIPPET', financial_release_evidence(headline, snippet))
        c = company()
        body = f'<rss><channel><item><title>{headline}</title><link>https://apple.com/results</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate><description>{snippet}</description></item></channel></rss>'.encode()
        class HTTP:
            def get(self, *args, **kwargs): return {'body': body, 'finalUrl': 'https://apple.com/feed'}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW).ingest_source(source(c))
                released = store.company_payload(c, NOW)['earnings']
                self.assertEqual(len(released), 1)
                self.assertEqual(released[0]['eventType'], 'EARNINGS_PUBLISHED')
                self.assertEqual(released[0]['financialEvidence']['excerpt'], snippet)
            finally: store.close()

    def test_valueless_html_attributes_do_not_break_source_discovery(self):
        from company_intelligence.feeds import parse_links
        links = parse_links(b'<a href="/investors" title aria-label type rel>Investors</a><link href="/rss" type rel>', 'https://example.com/')
        self.assertEqual(links[0]['text'], 'Investors')
        self.assertEqual(links[0]['url'], 'https://example.com/investors')
        self.assertEqual(links[0]['type'], '')
        self.assertEqual(links[1]['rel'], '')

    def test_operating_and_phase_results_are_not_financial_earnings_releases(self):
        from company_intelligence.pipeline import Pipeline
        from company_intelligence.model import classify
        c = company()
        for headline in ['Apple reports third quarter operating results', 'Apple reports third quarter phase-3 results']:
            self.assertNotIn('Earnings', classify(headline)['categories'])
            text = f'''<rss><channel><item><title>{headline}</title><link>https://apple.com/update</link>
            <pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'''.encode()
            class HTTP:
                def get(self, *args, **kwargs): return {'body': text, 'finalUrl': 'https://apple.com/feed'}
            with tempfile.TemporaryDirectory() as tmp:
                store = Store(Path(tmp) / 'state.sqlite')
                try:
                    Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW).ingest_source(source(c))
                    self.assertFalse(store.company_payload(c, NOW)['earnings'])
                finally: store.close()

    def test_quarter_results_and_board_approval_need_actual_financial_publication_proof(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        for headline in ['Apple reports third quarter delivery results', 'Apple announces third quarter community results',
                         'Apple announces board meeting to consider second quarter financial results']:
            text = f'''<rss><channel><item><title>{headline}</title><link>https://apple.com/update</link>
            <pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate>
            <description>The board will meet on October 27, 2026 to review financial results.</description></item></channel></rss>'''.encode()
            class HTTP:
                def get(self, *args, **kwargs): return {'body': text, 'finalUrl': 'https://apple.com/feed'}
            with tempfile.TemporaryDirectory() as tmp:
                store = Store(Path(tmp) / 'state.sqlite')
                try:
                    Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW).ingest_source(source(c))
                    self.assertFalse(store.company_payload(c, NOW)['earnings'])
                    self.assertFalse(store.company_payload(c, NOW)['events'])
                finally: store.close()

    def test_universe_acceptance_uses_real_master_offline_not_per_issuer_network(self):
        from company_intelligence.acceptance import project
        with patch('company_intelligence.acceptance.subprocess.run') as run:
            project(Path('/tmp/acceptance'), scope='universe')
            args = run.call_args.args[0]
            self.assertIn('--all-offline', args)
            self.assertNotIn('--network', args)
            self.assertNotIn('--tickers', args)
        with self.assertRaisesRegex(ValueError, 'INVALID_SCOPE'):
            project(Path('/tmp/acceptance'), scope='unvalidated')

    def test_future_release_title_is_calendar_evidence_not_published_earnings(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        text = b'''<rss><channel><item><title>Apple announces third quarter financial results to be released on October 27, 2026</title>
        <link>https://apple.com/planned-release</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate>
        <description>Apple will release financial results on October 27, 2026.</description></item></channel></rss>'''
        class HTTP:
            def get(self, *args, **kwargs): return {'body': text, 'finalUrl': 'https://apple.com/feed'}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW).ingest_source(source(c))
                payload = store.company_payload(c, NOW)
                self.assertFalse(payload['earnings'])
                self.assertEqual(payload['events'][0]['confirmationStatus'], 'CONFIRMED')
                self.assertEqual(payload['events'][0]['date'], '2026-10-27')
            finally: store.close()

    def test_parent_feed_cannot_confirm_child_or_partner_earnings_calendar(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        for title in ['Apple subsidiary will report quarterly financial results on October 27, 2026',
                      'Microsoft Corporation will report quarterly financial results on October 27, 2026',
                      "Apple's Beeline will report quarterly financial results on October 27, 2026"]:
            text = f'''<rss><channel><item><title>{title}</title><link>https://apple.com/owned-story</link>
            <pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate><description>Financial results will be released on October 27, 2026.</description></item></channel></rss>'''.encode()
            class HTTP:
                def get(self, *args, **kwargs): return {'body': text, 'finalUrl': 'https://apple.com/feed'}
            with tempfile.TemporaryDirectory() as tmp:
                store = Store(Path(tmp) / 'state.sqlite')
                try:
                    Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW).ingest_source(source(c))
                    payload = store.company_payload(c, NOW)
                    self.assertEqual(len(payload['news']), 1)  # Owned company announcement remains discoverable.
                    self.assertFalse(payload['events'])
                    self.assertFalse(payload['earnings'])
                finally: store.close()
        from company_intelligence.model import issuer_earnings_announcement
        self.assertTrue(issuer_earnings_announcement('Apple will report third quarter financial results', c))
        self.assertTrue(issuer_earnings_announcement("Apple's third quarter earnings call", c))

    def test_direct_call_presentation_is_in_consumer_and_coverage(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.event({'eventId': 'official-call', 'companyId': c['companyId'], 'eventType': 'EARNINGS_CALL',
                    'date': NOW[:10], 'headline': 'Official call', 'presentationUrl': 'https://apple.com/presentation.pdf'}, NOW)
                self.assertTrue(any(d['type'] == 'PRESENTATION' for d in store.company_payload(c, NOW)['materials']))
                self.assertEqual(report(store, {c['companyId']: c}, NOW)['counts']['presentations']['companies'], 1)
            finally: store.close()

    def test_workflow_never_publishes_private_ledger_or_cache(self):
        workflow = (ROOT / '.github/workflows/company-intelligence.yml').read_text()
        self.assertNotIn('actions/cache/', workflow)
        artifacts = workflow.split('Reviewable snapshots and health')[1].split('  acceptance-a:')[0]
        self.assertNotIn('state.sqlite', artifacts)
        self.assertNotIn('archive.sqlite', artifacts)
        self.assertNotIn('.company-intelligence/http', artifacts)
        self.assertIn('node scripts/company_intelligence/privacy.mjs', workflow)
        self.assertIn('contents: read', workflow)

    def test_changed_producer_cannot_overwrite_prior_immutable_generation(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.ingest(item())
                output = Path(tmp) / 'public'
                with patch('company_intelligence.store.export_revision', return_value=b'producer-one'):
                    first = store.export({c['companyId']: c}, output, NOW)
                    self.assertEqual(store.export({c['companyId']: c}, output, NOW), first)
                with patch('company_intelligence.store.export_revision', return_value=b'producer-two'):
                    changed = store.export({c['companyId']: c}, output, NOW)
                self.assertNotEqual(first['generation'], changed['generation'])
                self.assertTrue((output / 'snapshots' / first['generation']).exists())
            finally: store.close()

    def test_cache_budget_evicts_whole_old_pairs_and_checkpoint_stays_bounded(self):
        import os
        import tarfile
        from company_intelligence.transport import PublicHTTP
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / 'state'
            store = Store(state / 'state.sqlite'); store.close()
            http = PublicHTTP(state / 'http', budget=1)
            for i in (1, 2):
                meta = state / 'http' / (str(i) * 64 + '.json')
                meta.write_text('{}'); meta.with_suffix('.body').write_bytes(b'x' * 200)
                for p in (meta, meta.with_suffix('.body')): os.utime(p, (http.clock() - 3 + i, http.clock() - 3 + i))
            with patch('company_intelligence.checkpoint.MAX_HTTP_CACHE', 250):
                pack(state, Path(tmp) / 'snapshot')
            with tarfile.open(Path(tmp) / 'snapshot') as archive:
                names = archive.getnames()
                self.assertIn('http/' + '2' * 64 + '.body', names)
                self.assertNotIn('http/' + '1' * 64 + '.json', names)
            http.prune(byte_budget=250)
            self.assertFalse((state / 'http' / ('1' * 64 + '.json')).exists())
            self.assertFalse((state / 'http' / ('1' * 64 + '.body')).exists())
            self.assertTrue((state / 'http' / ('2' * 64 + '.body')).exists())

    def test_regulatory_application_is_material_without_inventing_approval(self):
        from company_intelligence.model import classify
        title = 'Ultragenyx Announces Marketing Authorisation Application Submission to the European Medicines Agency'
        result = classify(title)
        self.assertEqual(result['importance'], 'HIGH')
        self.assertEqual(result['categories'], ['Regulation'])
        self.assertNotIn('Earnings', classify('European Medicines Agency clinical trial third quarter results')['categories'])
        self.assertEqual(classify('Company celebrates employee named Ema')['importance'], 'LOW')

    def test_coverage_uses_current_classification_without_changing_story_identity(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                story = item('Apple Inc. announces marketing authorization application submission')
                story.update(importance='LOW', classificationVersion='rules-1.1.0')
                store.ingest(story)
                coverage = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(coverage['counts']['recentMaterialNews']['companies'], 1)
                self.assertEqual(store.company_payload(c, NOW)['news'][0]['newsId'], story['newsId'])
            finally: store.close()

    def test_share_count_change_needs_split_and_issuance_context(self):
        from test_engine import consumer
        from company_intelligence.earnings import summary
        facts = consumer()
        facts['units']['shares_outstanding'] = 'shares'
        facts['quarterly']['shares_outstanding'] = [r[:3] + [100 if r[0] == 2025 else 110] + r[4:] for r in facts['quarterly']['revenue']]
        change = next(x for x in summary(facts, facts['cik'], NOW)['whatChanged'] if x['metric'] == 'shares_outstanding')
        self.assertEqual(change['direction'], 'NEUTRAL')
        self.assertEqual(change['classification'], 'NOT_COMPARABLE')
        self.assertIn('SPLIT_ISSUANCE_BUYBACK', change['interpretation'])

    def test_scoped_ir_feed_cannot_leak_partner_results_into_another_issuer(self):
        from company_intelligence.pipeline import Pipeline
        a = company()
        b = company('Microsoft Corporation', 'MSFT', '0000789019')
        text = b'''<rss><channel><item><title>Microsoft Corporation reports quarterly financial results</title>
        <link>https://publisher.example/msft-results</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>'''
        class HTTP:
            def get(self, *args, **kwargs): return {'body': text, 'finalUrl': 'https://apple.com/feed'}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                p = Pipeline(Path(tmp), {a['companyId']: a, b['companyId']: b}, store, HTTP(), NOW)
                p.ingest_source(source(a))
                self.assertEqual(store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 0)
                self.assertIsNone(store.sources()[0]['latestContentAt'])
            finally: store.close()

    def test_incremental_import_horizon_preserves_existing_history(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        submissions = {'cik': c['cik'], 'filings': {'recent': {'accessionNumber': ['0000320193-26-000001', '0000320193-23-000001'],
            'form': ['8-K', '8-K'], 'filingDate': ['2026-10-01', '2023-01-01'], 'items': ['1.01', '1.02']}}}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            p = Pipeline(Path(tmp), {c['companyId']: c}, store, object(), NOW)
            p.sec_client = lambda budget: object()
            try:
                old = {'eventId': 'retained', 'companyId': c['companyId'], 'eventType': 'SEC_FILING', 'date': '2023-01-01', 'headline': 'Retained history'}
                store.event(old, NOW)
                with patch('quant.sec.provider.SECProvider.get_submissions', return_value=submissions):
                    p.project_company(c, fetch_sec=True, filing_since='2026-04-01')
                cached = store.state('sec-submissions:' + c['companyId'])
                self.assertEqual(cached['filings']['recent']['accessionNumber'], ['0000320193-26-000001'])
                self.assertTrue(store.db.execute("SELECT 1 FROM events WHERE id='retained'").fetchone())
                self.assertFalse(store.db.execute("SELECT 1 FROM events WHERE json_extract(payload,'$.filingId')='0000320193-23-000001'").fetchone())
                self.assertEqual(p.run['secFailures'], 0)
            finally: store.close()

    def test_candidate_rerun_cannot_revoke_independently_verified_official_release(self):
        c = company()
        base = {'companyId': c['companyId'], 'eventType': 'EARNINGS_PUBLISHED', 'date': NOW[:10], 'fiscalYear': 2026,
                'fiscalQuarter': 'Q3', 'reportingPeriod': '2026-06-30', 'headline': 'Earnings published', 'sourceDocuments': []}
        sec = {**base, 'eventId': 'sec', 'filingId': '0000320193-26-000001', 'sourceUrl': 'https://sec.gov/release', 'detectionEvidence': ['SEC_DOCUMENT_EXPLICIT_EARNINGS_RELEASE']}
        ir = {**base, 'eventId': 'official', 'sourceId': 'apple-feed', 'sourceUrl': 'https://apple.com/release', 'detectionEvidence': ['OFFICIAL_RESULTS_RELEASE_TITLE']}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.event(sec, NOW); store.event(ir, NOW)
                store.event({**sec, 'eventType': 'EARNINGS_CANDIDATE', 'detectionEvidence': ['8-K_ITEM_2.02_CANDIDATE'], 'documentEvidence': {}}, NOW)
                result = store.company_payload(c, NOW)['earnings']
                self.assertEqual(len(result), 1)
                self.assertEqual(result[0]['eventType'], 'EARNINGS_PUBLISHED')
                self.assertTrue(any(p.get('verificationState') == 'CANDIDATE' for p in result[0]['eventProvenance']))
                self.assertEqual(result[0]['eventId'], 'sec')
            finally: store.close()

    def test_parent_release_does_not_certify_subsidiary_or_partner_earnings(self):
        from company_intelligence.model import issuer_results_actor
        c = company('VEON Ltd.', 'VEON', '0001468091')
        self.assertTrue(issuer_results_actor('VEON reports second quarter financial results', c))
        for title in ["VEON's Beeline Kazakhstan reports second quarter financial results", 'VEON announces subsidiary second quarter financial results', 'VEON announces partner quarterly results']:
            self.assertFalse(issuer_results_actor(title, c))

    def test_distributor_authored_announcement_can_confirm_calendar_without_trusting_global_feed(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        text = b'''<rss><channel><item><title>Apple Inc. announces date for third quarter financial results</title>
        <link>https://www.globenewswire.com/news-release/official-test</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate>
        <category domain="https://www.globenewswire.com/rss/stock">Nasdaq:AAPL</category>
        <dc:contributor xmlns:dc="http://dublincore.org/documents/dcmi-namespace/">Apple Inc.</dc:contributor>
        <description>Apple will release financial results on October 27, 2026.</description></item></channel></rss>'''
        class HTTP:
            def get(self, *args, **kwargs): return {'body': text, 'finalUrl': GN['url']}
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                p = Pipeline(Path(tmp), {c['companyId']: c}, store, HTTP(), NOW)
                p.ingest_source(GN)
                payload = store.company_payload(c, NOW)
                self.assertEqual(len(payload['news']), 1)
                self.assertEqual(payload['events'][0]['confirmationStatus'], 'CONFIRMED')
                self.assertEqual(payload['events'][0]['date'], '2026-10-27')
                self.assertEqual(payload['events'][0]['confirmationEvidence'], 'ISSUER_AUTHORED_DISTRIBUTOR_ANNOUNCEMENT')
                self.assertFalse(payload['earnings'])
                self.assertFalse(store.sources()[0]['verified'])
            finally: store.close()

    def test_pruning_event_removes_alias_in_same_transaction(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.event({'eventId': 'old', 'companyId': c['companyId'], 'eventType': 'IR_EVENT', 'date': '2010-01-01', 'headline': 'Historical event'}, NOW)
                with store.db: store.db.execute('INSERT INTO event_alias VALUES (?,?)', ('alias', 'old'))
                store.prune(NOW)
                self.assertEqual(store.db.execute('SELECT COUNT(*) FROM event_alias').fetchone()[0], 0)
                self.assertTrue((Path(tmp) / 'archive.sqlite').exists())
            finally: store.close()

    def test_next_day_call_links_only_with_unique_explicit_fiscal_period(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                release = {'eventId': 'planned', 'companyId': c['companyId'], 'headline': 'Official planned earnings',
                           'eventType': 'EARNINGS_SCHEDULED', 'date': '2026-10-27', 'fiscalYear': 2026, 'fiscalQuarter': 'Q3', 'confirmationStatus': 'CONFIRMED'}
                call = {**release, 'eventId': 'call', 'eventType': 'EARNINGS_CALL', 'date': '2026-10-28'}
                store.event(release, NOW); store.event(call, NOW)
                self.assertEqual(store.company_payload(c, NOW)['calls'][0]['scheduledEarningsEventId'], 'planned')
                store.event({**call, 'fiscalQuarter': 'Q4'}, NOW)
                self.assertNotIn('scheduledEarningsEventId', store.company_payload(c, NOW)['calls'][0])
                store.event({**call, 'fiscalQuarter': None}, NOW)
                self.assertNotIn('scheduledEarningsEventId', store.company_payload(c, NOW)['calls'][0])
            finally: store.close()

    def test_foreign_results_description_cannot_override_contradictory_document(self):
        c = company()
        acc = '0000320193-26-000001'
        sub = {'cik': c['cik'], 'filings': {'recent': {'accessionNumber': [acc], 'form': ['6-K'],
               'filingDate': [NOW[:10]], 'primaryDocDescription': ['Third quarter financial results']}}}
        for outcome in [None, 'UNVERIFIED', 'FUTURE_BOARD_MEETING']:
            sub['_intelligenceDocumentEvidence'] = {acc: {'outcome': outcome}} if outcome else {}
            events = project_sec(c, None, sub, None, NOW)
            self.assertFalse(any(e['eventType'] == 'EARNINGS_PUBLISHED' for e in events))
            self.assertTrue(any(e['eventType'] == 'EARNINGS_CANDIDATE' for e in events))
        sub['_intelligenceDocumentEvidence'] = {acc: {'outcome': 'EARNINGS_RELEASE'}}
        e = next(e for e in project_sec(c, None, sub, None, NOW) if e['eventType'] == 'EARNINGS_PUBLISHED')
        self.assertEqual(e['detectionEvidence'], ['SEC_DOCUMENT_EXPLICIT_EARNINGS_RELEASE'])

    def test_403_index_gap_is_retained_while_later_indexes_continue(self):
        from company_intelligence.sec_stream import scan
        from quant.sec.http_client import SECHTTPError
        class Client:
            def get_bytes(self, url, **kwargs):
                if '20260930' in url: raise SECHTTPError(url, 403, 'denied or holiday', 1)
                return b'CIK|Company Name|Form Type|Date Filed|File Name\n-----\n'
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-09-30')
                r = scan(store, {}, Client(), '2026-10-02T00:00:00Z')
                self.assertEqual(r['checkedDays'], ['2026-10-01'])
                self.assertEqual(r['unresolvedIndexDays'], ['2026-09-30'])
                self.assertEqual(store.state('secStreamIndexGaps')['2026-09-30']['httpStatus'], 403)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-02')
                self.assertEqual(scan(store, {}, Client(), '2026-10-02T12:00:00Z')['attemptedDays'], 0)
            finally: store.close()

    def test_backslash_links_from_malformed_html_are_rejected(self):
        from company_intelligence.model import canonical_url
        self.assertIsNone(canonical_url('https://issuer.com/\\"/news\\"'))

    def test_wrong_sec_response_cannot_poison_durable_issuer_metadata(self):
        from company_intelligence.pipeline import Pipeline
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            pipeline = Pipeline(Path(tmp), {c['companyId']: c}, store, object(), NOW)
            pipeline.sec_client = lambda budget: object()
            try:
                with patch('quant.sec.provider.SECProvider.get_submissions', return_value={'cik': '123', 'filings': {'recent': {}}}):
                    pipeline.project_company(c, fetch_sec=True)
                self.assertEqual(pipeline.run['secFailures'], 1)
                self.assertIsNone(store.state('sec-submissions:' + c['companyId']))
                self.assertEqual(store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 0)
            finally: store.close()

    def test_material_stream_exact_cik_join_checkpoint_and_denial_recovery(self):
        from company_intelligence.sec_stream import scan
        now = '2026-10-02T00:00:00Z'
        c = company()
        header = 'CIK|Company Name|Form Type|Date Filed|File Name\n-----\n'
        text = header + '320193|Apple Inc|8-K|20261001|edgar/data/320193/0000320193-26-000001.txt\n' + '123|Other|8-K|2026-10-01|edgar/data/123/0000000123-26-000001.txt\n' + '320193|Wrong path|8-K|2026-10-01|edgar/data/123/0000320193-26-000002.txt\n'
        class Client:
            calls = 0
            fail = False
            def get_bytes(self, *args, **kwargs):
                self.calls += 1
                if self.fail: raise RuntimeError('HTTP_403')
                return text.encode()
        client = Client()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-10-01')
                client.fail = True
                with self.assertRaisesRegex(RuntimeError, '403'): scan(store, {c['companyId']: c}, client, now)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-01')
                self.assertIsNone(store.state('secStreamPending'))
                client.fail = False
                result = scan(store, {c['companyId']: c}, client, now)
                self.assertEqual(result['matchedFilings'], 1)
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-02')
                self.assertEqual(store.state('secStreamPending')[c['companyId']]['latestAccession'], '0000320193-26-000001')
                before = client.calls
                self.assertEqual(scan(store, {c['companyId']: c}, client, now)['checkedDays'], [])
                self.assertEqual(client.calls, before)
                # No input change cannot grow the pending queue.
                self.assertEqual(len(store.state('secStreamPending')), 1)
            finally: store.close()

    def test_material_stream_invalid_index_does_not_advance(self):
        from company_intelligence.sec_stream import scan
        class Client:
            def get_bytes(self, *args, **kwargs): return b'<html>Access denied</html>'
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.set_state('secStreamNextDay', '2026-10-01')
                with self.assertRaisesRegex(ValueError, 'INVALID_HEADER'): scan(store, {}, Client(), '2026-10-02T00:00:00Z')
                self.assertEqual(store.state('secStreamNextDay'), '2026-10-01')
            finally: store.close()

    def test_three_fresh_states_preserve_exact_ledger_and_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            expected = prepare(base / 'a')
            self.assertGreater(expected['tables']['events']['count'], 1)
            self.assertEqual(expected['tables']['event_alias']['count'], 1)
            pack(base / 'a', base / 'snapshot')
            restore(base / 'snapshot', base / 'b')
            newer = advance(base / 'b', expected)
            self.assertNotEqual(newer['logicalHash'], expected['logicalHash'])
            pack(base / 'b', base / 'updated')
            restore(base / 'updated', base / 'c')
            self.assertEqual(verify(base / 'c', newer), newer)
            with self.assertRaisesRegex(ValueError, 'MISMATCH'):
                verify(base / 'c', expected)

    def test_fresh_restore_reprojects_runtime_verified_site_before_config_promotion(self):
        import copy
        for status in ('VALIDATED', 'DEFERRED'):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                c = company(cik='0009999999'); c['officialSites'] = []
                projected = copy.deepcopy(c)
                if status == 'VALIDATED': projected['officialSites'] = ['https://apple.com/']
                store = Store(base / 'a/state.sqlite')
                news = item(); news['companyId'] = c['companyId']; store.ingest(news)
                store.set_state('officialSite:' + c['companyId'], {'status': status, 'url': 'https://apple.com/'})
                exported = store.export({c['companyId']: projected}, base / 'exports', NOW)
                store.set_state('latestRun', {'generatedAt': NOW, 'export': exported}); store.close()
                expected = fingerprint(base / 'a'); pack(base / 'a', base / 'snapshot')
                restore(base / 'snapshot', base / 'b')
                with patch('company_intelligence.acceptance.load_universe', return_value={c['companyId']: copy.deepcopy(c)}):
                    self.assertEqual(verify(base / 'b', expected), expected)

    def test_real_distributor_fixture_resolves_contributor_not_incidental_exchange(self):
        universe = load_universe(ROOT)
        resolver = Resolver(universe)
        entries = parse_feed((Path(__file__).parent / 'fixtures/globenewswire-metadata.xml').read_bytes(), GN['url'])
        rare = next(e for e in entries if e['headline'].startswith('Ultragenyx'))
        matched = resolver.resolve(rare, GN)
        self.assertEqual([m['companyId'] for m in matched], ['iss_cik_0001515673'])
        moderna = next(e for e in entries if e['headline'].startswith('Moderna'))
        self.assertFalse(any(m['companyId'] == 'iss_cik_0001120193' for m in resolver.resolve(moderna, GN)))
        self.assertFalse(any(m['companyId'] == 'iss_cik_0001120193' for m in resolver.resolve(moderna, {'verified': False})))
        # A changed ticker or a wrong company with matching ticker fails closed.
        for changed in [{'stocks': ['Nasdaq:ROOT'], 'contributor': 'Ultragenyx Pharmaceutical Inc.'},
                        {'stocks': ['NYSE:RARE'], 'contributor': 'Ultragenyx Pharmaceutical Inc.'},
                        {'stocks': ['Nasdaq:RARE'], 'contributor': 'Root Inc.'}]:
            self.assertFalse(resolver.resolve({**rare, 'distributionMetadata': changed}, GN))
        self.assertFalse(resolver.resolve({**rare, 'url': 'https://evil.example/story'}, GN))

    def test_common_word_contributor_needs_both_legal_identity_and_listing(self):
        c = company('Root, Inc.', 'ROOT', '0001788882')
        c['listings'][0]['exchange'] = 'NASDAQ'
        resolver = Resolver({c['companyId']: c})
        entry = {'headline': 'Root announces a partnership', 'url': 'https://www.globenewswire.com/news-release/test',
                 'distributionMetadata': {'stocks': ['Nasdaq:ROOT'], 'contributor': 'Root, Inc.'}}
        self.assertEqual(len(resolver.resolve(entry, GN)), 1)
        self.assertFalse(resolver.resolve({**entry, 'distributionMetadata': {'stocks': ['Nasdaq:ROOT'], 'contributor': 'Root Foundation'}}, GN))
        self.assertFalse(resolver.resolve({'headline': 'root of a tree'}, GN))

    def test_sec_bundle_one_per_filing_no_speculative_ceo_or_transaction(self):
        c = company()
        acc = '0000320193-26-000001'
        sub = {'cik': c['cik'], 'filings': {'recent': {'accessionNumber': [acc], 'form': ['8-K'], 'filingDate': [NOW[:10]],
               'items': ['1.01,2.01,5.02,7.01,8.01,9.01'], 'primaryDocument': ['test.htm']}}}
        events = project_sec(c, None, sub, None, NOW)
        material = [e for e in events if e['eventType'] == 'MATERIAL_SEC_EVENT']
        self.assertEqual(len(material), 1)
        self.assertEqual(material[0]['secItems'], ['1.01', '2.01', '5.02'])
        self.assertNotIn('CEO', material[0]['headline'])
        self.assertIsNone(material[0]['fiscalQuarter'])
        self.assertFalse(any(e['eventType'].startswith('EARNINGS') for e in events))
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                for _ in range(2):
                    for e in events: store.event(e, NOW)
                payload = store.company_payload(c, NOW)
                self.assertEqual(len(payload['materialEvents']), 1)
                self.assertEqual(len(payload['timeline']), 1)
                self.assertEqual(len(payload['filings']), 1)
                coverage = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(coverage['counts']['recentMaterialSEC']['companies'], 1)
                self.assertEqual(coverage['counts']['anyMaterialIntelligence']['companies'], 1)
                self.assertEqual(coverage['counts']['anyNews']['companies'], 0)
            finally: store.close()
        sub['filings']['recent']['items'] = ['7.01,8.01,9.01']
        self.assertEqual([e['eventType'] for e in project_sec(c, None, sub, None, NOW)], ['SEC_FILING'])

    def test_news_coverage_requires_fresh_accepted_company_matches(self):
        c = company()
        with tempfile.TemporaryDirectory() as tmp:
            store = Store(Path(tmp) / 'state.sqlite')
            try:
                store.source({**GN, 'lastSuccess': NOW, 'latestContentAt': NOW, 'lastItemCount': 20})
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 0)
                current = item(); current['provenance'][0].update(sourceId=GN['sourceId'], discoverySource='RSS')
                store.ingest(current)
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 1)
                store.source({**GN, 'lastError': 'HTTP_403', 'failureCount': 1})
                out = report(store, {c['companyId']: c}, NOW)
                self.assertEqual(out['counts']['activeExternalNews']['companies'], 0)
                self.assertEqual(out['counts']['anyNews']['companies'], 1)
            finally: store.close()


if __name__ == '__main__': unittest.main()
