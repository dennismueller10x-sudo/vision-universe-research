import io
import json
import sqlite3
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from company_intelligence.checkpoint import pack, restore
from company_intelligence.coverage import report, source_status
from company_intelligence.discovery import wikidata_catalogue
from company_intelligence.platforms import fingerprint, endpoints
from company_intelligence.enrichment import guidance, kpis
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company, consumer, item, source, NOW
from company_intelligence.earnings import summary
from company_intelligence.feeds import is_event_feed
from company_intelligence.sec_documents import release_period
from company_intelligence.ir_events import from_announcement, parse_ics, parse_jsonld
from company_intelligence.materials import page_documents
from company_intelligence.sec_documents import inspect_html
from company_intelligence.model import Resolver, classify, canonical_url
from company_intelligence.model import load_universe
from company_intelligence.feeds import parse_feed


class HardeningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.state = self.base / 'state'
        self.store = Store(self.state / 'state.sqlite')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_fresh_runner_restores_ids_health_and_cursor(self):
        self.store.ingest(item())
        self.store.source({**source(), 'failureCount': 2, 'nextCheck': '2026-10-03T00:00:00Z'})
        self.store.set_state('backfillCursor', company()['companyId'])
        self.store.set_state('sec-document:proof', {'parserVersion': 'test'})
        snapshot = self.base / 'snapshot.tar.gz'
        meta = pack(self.state, snapshot)
        restore(snapshot, self.base / 'fresh', meta['sha256'])
        fresh = Store(self.base / 'fresh/state.sqlite')
        try:
            self.assertEqual(fresh.state('backfillCursor'), company()['companyId'])
            self.assertEqual(fresh.state('sec-document:proof')['parserVersion'], 'test')
            self.assertEqual(fresh.sources()[0]['failureCount'], 2)
            self.assertEqual(fresh.ingest(item()), 'DUPLICATE')
            self.assertEqual(fresh.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 1)
        finally:
            fresh.close()

    def test_digest_failure_and_existing_state_fail_closed(self):
        snap = self.base / 'snap'; pack(self.state, snap)
        with self.assertRaisesRegex(ValueError, 'DIGEST'):
            restore(snap, self.base / 'fresh', '0' * 64)
        with self.assertRaisesRegex(ValueError, 'FRESH_STATE'):
            restore(snap, self.state)

    def test_archive_links_traversal_and_duplicate_members_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('http/../escape', tarfile.REGTYPE), ('state.sqlite', tarfile.SYMTYPE)]:
            snap = self.base / 'bad.tar.gz'
            with tarfile.open(snap, 'w:gz') as archive:
                member = tarfile.TarInfo(name); member.type = kind; member.linkname = '/tmp/escape'; member.size = 1 if kind == tarfile.REGTYPE else 0
                archive.addfile(member, io.BytesIO(b'x') if member.size else None)
            with self.assertRaisesRegex(ValueError, 'UNSAFE'):
                restore(snap, self.base / 'fresh')
            self.assertFalse((self.base / 'fresh').exists())

    def test_retention_archives_history_before_pruning(self):
        self.store.ingest(item(published='2024-01-01T00:00:00Z'))
        self.store.prune(NOW)
        self.store.prune(NOW)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 0)
        with sqlite3.connect(self.state / 'archive.sqlite') as archive:
            self.assertEqual(archive.execute('SELECT COUNT(*) FROM history').fetchone()[0], 1)
        snap = self.base / 'snap'; pack(self.state, snap); restore(snap, self.base / 'fresh')
        self.assertTrue((self.base / 'fresh/archive.sqlite').exists())

    def test_fresh_http_response_with_old_content_is_stale(self):
        s = {**source(), 'lastSuccess': NOW, 'latestContentAt': '2020-01-01T00:00:00Z', 'lastVerified': NOW}
        self.assertEqual(source_status(s, NOW), 'STALE')
        self.store.source(s)
        r = report(self.store, {company()['companyId']: company()}, NOW)
        self.assertEqual(r['counts']['newsSourceActive']['companies'], 0)
        self.assertEqual(r['counts']['newsSourceValidated']['companies'], 1)
        self.assertEqual(source_status({**s, 'type': 'IR_MATERIALS'}, NOW), 'STALE')

    def test_source_states_blocked_invalid_degraded_unattempted(self):
        for error, status in [('HTTP_403', 'BLOCKED'), ('HTTP_404', 'INVALID'), ('MALFORMED_XML', 'INVALID'), ('HTTP_503', 'DEGRADED')]:
            self.assertEqual(source_status({**source(), 'lastError': error, 'failureCount': 1}, NOW), status)
        self.assertEqual(source_status(source(), NOW), 'DISCOVERED')
        r = report(self.store, {company()['companyId']: company()}, NOW)
        self.assertEqual(r['counts']['discoveryAttempted']['companies'], 0)

    def test_null_error_empty_feed_and_corporate_page_not_active_ir(self):
        self.store.source({**source(), 'lastError': None, 'lastSuccess': NOW, 'lastItemCount': 0})
        self.store.set_state('ir:' + company()['companyId'], {'lastSuccess': NOW, 'configurations': [{'irHomepage': 'https://apple.com/', 'providerType': 'WORDPRESS', 'pageRole': 'CORPORATE'}]})
        r = report(self.store, {company()['companyId']: company()}, NOW)
        self.assertEqual(r['parserFailures'], 0)
        self.assertEqual(r['sourceStatuses'], {'EMPTY': 1})
        self.assertEqual(r['counts']['irPageFound']['companies'], 0)
        self.assertFalse(r['platformCompanies'])
        q = self.store.quality(NOW, {company()['companyId']: company()})
        self.assertEqual(q['activeSources'], 0)
        self.assertEqual(q['companiesWithIRPage'], 0)

    def test_daily_manifest_queues_omitted_issuers_across_new_manifests(self):
        from company_intelligence.cli import manifest_batch
        a, b = company(cik='0000000001'), company(cik='0000000002')
        companies = {c['companyId']: c for c in (a, b)}
        rows = [{'issuerId': c['companyId'], 'cik': c['cik'], 'latestAccession': c['cik'] + '-26-000001'} for c in (a, b)]
        document = {'STATUS': 'SUCCESS', 'RUN_DATE': NOW[:10], 'UPDATED_ISSUERS': rows}
        selected, pending = manifest_batch(document, companies, self.store, NOW, 1)
        self.assertEqual(selected, [a])
        self.store.set_state('updatedIssuerCheckpoints', {a['companyId']: pending.pop(a['companyId'])})
        self.store.set_state('updatedIssuerPending', pending)
        # An empty next day's producer output must not lose the unfinished issuer.
        selected, pending = manifest_batch({**document, 'UPDATED_ISSUERS': []}, companies, self.store, NOW, 1)
        self.assertEqual(selected, [b])
        self.store.set_state('sec:' + b['companyId'], {'retryAfter': '2026-10-03T00:00:00Z'})
        self.assertFalse(manifest_batch(document, companies, self.store, NOW, 1)[0])
        with self.assertRaisesRegex(ValueError, 'IDENTITY'):
            manifest_batch({**document, 'UPDATED_ISSUERS': [{**rows[0], 'cik': b['cik']}]}, companies, self.store, NOW, 1)

    def test_one_oversized_consumer_projection_cannot_fail_all_exports(self):
        self.store.ingest(item())
        self.store.set_state('financials:' + company()['companyId'], {'state': 'AVAILABLE', 'metrics': {}, 'evidence': 'x' * (1024 * 1024)})
        other = company('Other Inc.', 'OTHER', '0000000001')
        self.store.set_state('financials:' + other['companyId'], {'state': 'AVAILABLE', 'metrics': {}})
        result = self.store.export({c['companyId']: c for c in (company(), other)}, self.base / 'public', NOW)
        values = [json.loads(p.read_text()) for p in (self.base / 'public/snapshots' / result['generation']).glob('*.json')]
        self.assertEqual(result['exportedCompanies'], 2)
        limited = next(p for p in values if p['companyId'] == company()['companyId'])
        self.assertEqual(limited['reason'], 'COMPANY_PAYLOAD_BUDGET_EXCEEDED')
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 1)

    def test_catalogue_joins_exact_master_ciks_without_activating_sources(self):
        c = company()
        class HTTP:
            def get(self, *args, **kwargs):
                return {'body': json.dumps({'results': {'bindings': [{'cik': {'value': '320193'}, 'site': {'value': 'https://apple.com/'}, 'entity': {'value': 'Q312'}}, {'cik': {'value': '1326801'}, 'site': {'value': 'https://wrong.com/'}}]}}).encode()}
        r = wikidata_catalogue({c['companyId']: c}, HTTP())
        self.assertEqual(r[c['companyId']]['status'], 'CANDIDATE')
        self.assertEqual(r[c['companyId']]['candidates'][0]['url'], 'https://apple.com/')
        self.assertFalse(self.store.sources())

    def test_malformed_catalogue_binding_is_a_source_failure(self):
        from company_intelligence.transport import SourceError
        class HTTP:
            def get(self, *args, **kwargs):
                return {'body': b'{"results":{"bindings":[{"cik":null,"site":{}}]}}'}
        with self.assertRaisesRegex(SourceError, 'INVALID_WIKIDATA'):
            wikidata_catalogue({company()['companyId']: company()}, HTTP())

    def test_platform_fingerprints_multiple_issuers_and_prose_not_authority(self):
        for family, host in [('Q4', 's1.q4cdn.com'), ('GCS', 'company.gcs-web.com'), ('NOTIFIED', 'widgets.notified.com'), ('WORDPRESS', 'corporate.com/wp-content/a.js')]:
            for issuer in ['one', 'two']:
                self.assertEqual(fingerprint(f'<script src="https://{host}/{issuer}.js"></script>'.encode()), family)
        self.assertEqual(fingerprint(b'<p>Q4 uses q4cdn.com</p>'), 'GENERIC')

    def test_endpoint_inventory_rejects_unrelated_links(self):
        links = [{'url': 'https://ir.issuer.com/earnings', 'text': 'Quarterly results'}, {'url': 'https://wrong.com/slides', 'text': 'Presentations'}]
        r = endpoints(links, 'https://ir.issuer.com/')
        self.assertTrue(r['earningsUrl'])
        self.assertIsNone(r['presentationsUrl'])

    def test_eps_ttm_unavailable_operating_cashflow_supported(self):
        c = consumer()
        c['units'].update(eps_diluted='USD/shares', operating_cash_flow='USD')
        c['quarterly']['eps_diluted'] = c['quarterly']['revenue']
        c['quarterly']['operating_cash_flow'] = c['quarterly']['revenue']
        result = summary(c, c['cik'], NOW)
        self.assertIsNone(result['metrics']['eps_diluted']['ttm'])
        self.assertEqual(result['metrics']['operating_cash_flow']['current']['value'], 150)

    def test_guidance_explicit_period_bounds_currency_and_evidence(self):
        text = 'Our outlook for the third quarter of fiscal 2027: revenue is expected to be USD 54 billion, plus or minus 2%.'
        r = guidance(text, 'https://issuer.com/release')
        self.assertEqual(r[0]['period'], {'fiscalYear': 2027, 'fiscalQuarter': 'Q3'})
        self.assertEqual(r[0]['low'], 52.92e9)
        self.assertEqual(r[0]['currency'], 'USD')
        self.assertEqual(guidance(text.replace('USD ', '$'), 'https://issuer.com/release')[0]['verificationState'], 'UNVERIFIED_CURRENCY')
        self.assertFalse(guidance('Revenue is expected to be USD 3 to 5 billion', 'https://issuer.com/release'))
        self.assertFalse(guidance(text.replace('2%', '99%'), 'https://issuer.com/release'))

    def test_kpi_registry_rejects_comparative_values_and_guidance(self):
        period = {'fiscalYear': 2026, 'fiscalQuarter': 'Q2'}
        r = kpis('Vehicle deliveries were 384,122.', 'https://issuer.com/release', period)
        self.assertEqual(r[0]['value'], 384122)
        self.assertFalse(kpis('We expect vehicle deliveries were 384,122.', 'https://issuer.com/release', period))
        self.assertFalse(kpis('Vehicle deliveries were 1,000. Vehicle deliveries were 2,000.', 'https://issuer.com/release', period))
        self.assertFalse(kpis('Vehicle deliveries were 1,000.', 'https://issuer.com/release', None))

    def test_real_intel_news_events_path_is_news(self):
        self.assertFalse(is_event_feed('https://www.intc.com/news-events/press-releases/rss'))
        self.assertTrue(is_event_feed('https://ir.joinroot.com/rss/events.xml'))
        self.assertEqual(release_period('Intel Reports Second-Quarter 2026 Financial Results'), {'fiscalQuarter': 'Q2', 'fiscalYear': 2026})
        self.assertEqual(release_period('Affirm reports fourth fiscal quarter 2026 results'), {'fiscalQuarter': 'Q4', 'fiscalYear': 2026})
        self.assertEqual(release_period('Root, Inc. 2Q 2026 Earnings Conference Call'), {'fiscalQuarter': 'Q2', 'fiscalYear': 2026})

    def test_q4_singular_event_and_presentation_feeds_are_not_news(self):
        self.assertTrue(is_event_feed('https://investors.boeing.com/rss/event.aspx'))
        s = {**source(), 'url': 'https://apple.com/rss/presentation.aspx'}
        class HTTP:
            def get(self, *args, **kwargs):
                return {'body': b'<rss><channel><item><title>Q2 2026 investor presentation</title><link>https://cdn.example.com/deck</link><pubDate>Thu, 1 Oct 2026 12:00:00 GMT</pubDate></item><item><title>Apple Inc. investor presentation</title><link>https://businesswire.com/news/other</link><pubDate>Thu, 1 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>', 'finalUrl': s['url']}
        old = item('Apple Inc. investor presentation', 'https://cdn.example.com/deck')
        old['provenance'][0]['sourceId'] = s['sourceId']
        self.store.ingest(old)
        pipe = Pipeline(self.base, {company()['companyId']: company()}, self.store, HTTP(), NOW)
        pipe.ingest_source(s)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 0)
        payload = self.store.company_payload(company(), NOW)
        self.assertEqual(payload['presentations'][0]['url'], 'https://cdn.example.com/deck')
        self.assertEqual(len(payload['presentations']), 1)
        self.assertEqual(payload['timeline'][0]['eventType'], 'PRESENTATION_PUBLISHED')
        self.assertEqual(self.store.sources()[0]['type'], 'IR_MATERIALS')

    def test_reparse_updates_evidence_preserving_earnings_id(self):
        e = {'eventId': 'release', 'companyId': company()['companyId'], 'eventType': 'EARNINGS_PUBLISHED', 'date': '2026-08-01',
             'fiscalQuarter': 'Q3', 'fiscalYear': 2026, 'reportingPeriod': '2026-06-30', 'sourceUrl': 'https://apple.com/release', 'headline': 'Earnings published', 'documentEvidence': {'parserVersion': 'old'}}
        self.store.event(e, NOW)
        self.store.event({**e, 'documentEvidence': {'parserVersion': 'new'}, 'guidance': {'state': 'EVIDENCE_AVAILABLE', 'ranges': [1]}}, NOW)
        value = json.loads(self.store.db.execute("SELECT payload FROM events WHERE id='release'").fetchone()[0])
        self.assertEqual(value['documentEvidence']['parserVersion'], 'new')
        self.assertEqual(value['guidance']['ranges'], [1])
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM events').fetchone()[0], 1)

    def test_call_cannot_merge_or_link_across_conflicting_explicit_quarters(self):
        cid = company()['companyId']
        common = {'companyId': cid, 'eventType': 'EARNINGS_CALL', 'date': '2026-08-01', 'startsAt': '2026-08-01T21:00:00Z', 'confirmationStatus': 'CONFIRMED', 'fiscalYear': 2026, 'sourceUrl': 'https://apple.com/event'}
        for quarter in ['Q2', 'Q3']:
            self.store.event({**common, 'eventId': quarter, 'fiscalQuarter': quarter}, NOW)
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM events WHERE kind='EARNINGS_CALL'").fetchone()[0], 2)
        self.store.event({'eventId': 'release', 'companyId': cid, 'eventType': 'EARNINGS_PUBLISHED', 'date': '2026-08-01', 'fiscalYear': 2026, 'fiscalQuarter': 'Q3', 'reportingPeriod': '2026-06-30'}, NOW)
        calls = self.store.company_payload(company(), NOW)['calls']
        self.assertNotIn('earningsEventId', next(c for c in calls if c['fiscalQuarter'] == 'Q2'))
        self.assertEqual(next(c for c in calls if c['fiscalQuarter'] == 'Q3')['earningsEventId'], 'release')

    def test_estimate_becomes_confirmed_call_with_audit_history(self):
        cid = company()['companyId']
        self.store.event({'eventId': 'estimate', 'companyId': cid, 'eventType': 'EARNINGS_ESTIMATED', 'date': '2026-10-01', 'dateStart': '2026-10-01', 'dateEnd': '2026-10-14', 'confirmationStatus': 'ESTIMATED'}, NOW)
        call = {'eventId': 'call', 'companyId': cid, 'eventType': 'EARNINGS_CALL', 'date': '2026-10-08', 'sourceUrl': 'https://apple.com/event', 'confirmationStatus': 'CONFIRMED'}
        self.store.event(call, NOW)
        pipe = Pipeline(self.base, {cid: company()}, self.store, object(), NOW)
        pipe.refresh_estimates(company())
        self.store.event(call, NOW)  # A later source parse cannot erase transition evidence.
        result = json.loads(self.store.db.execute("SELECT payload FROM events WHERE id='call'").fetchone()[0])
        self.assertEqual(result['confirmationHistory'][0]['previousEventId'], 'estimate')
        self.assertEqual(self.store.db.execute("SELECT COUNT(*) FROM audit WHERE json_extract(payload,'$.code')='ESTIMATE_CONFIRMED'").fetchone()[0], 1)

    def test_dst_ambiguous_or_nonexistent_times_are_not_invented(self):
        s = {**source(), 'type': 'IR_EVENTS', 'format': 'RSS_EVENTS'}
        for day in ['March 8, 2026 2:30 AM ET', 'November 1, 2026 1:30 AM ET']:
            self.assertFalse(from_announcement({'headline': day + ' Earnings Call', 'url': 'https://apple.com/event'}, s, NOW))
        body = b'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=America/New_York:20261101T013000\nSUMMARY:Earnings Call\nURL:https://apple.com/event\nEND:VEVENT\nEND:VCALENDAR'
        self.assertFalse(parse_ics(body, s, NOW))

    def test_jsonld_preserves_explicit_timezone_and_local_day(self):
        body = b'<script type="application/ld+json">{"@type":"Event","name":"Earnings Call","startDate":"2026-10-08T00:30:00+02:00"}</script>'
        e = parse_jsonld(body, {**source(), 'type': 'IR_EVENTS'}, NOW)[0]
        self.assertEqual(e['startsAt'], '2026-10-07T22:30:00Z')
        self.assertEqual(e['date'], '2026-10-08')
        self.assertEqual(e['time'], '00:30')
        self.assertEqual(e['timezone'], 'UTC+02:00')

    def test_real_chemed_confirmed_call_keeps_fiscal_label_and_edt(self):
        entry = {'headline': 'October 28, 2026 10:00 AM EDT : Chemed Corporation Third-Quarter 2026 Earnings Conference Call', 'url': 'https://apple.com/event'}
        e = from_announcement(entry, {**source(), 'type': 'IR_EVENTS', 'format': 'RSS_EVENTS'}, NOW)[0]
        self.assertEqual(e['startsAt'], '2026-10-28T14:00:00Z')
        self.assertEqual(e['fiscalQuarter'], 'Q3')
        self.assertEqual(e['fiscalYear'], 2026)
        self.assertEqual(e['confirmationStatus'], 'CONFIRMED')
        release = {'headline': 'Chemed To Report Third Quarter 2026 Earnings October 27, Related Conference Call To Be Held On October 28', 'url': 'https://apple.com/release',
                   'evidenceText': 'Chemed announced that it will release financial results for the third quarter ended September 30, 2026, on Tuesday, October 27, 2026, following the close of trading.'}
        e = from_announcement(release, source(), NOW)[0]
        self.assertEqual(e['eventType'], 'EARNINGS_SCHEDULED')
        self.assertEqual(e['date'], '2026-10-27')
        self.assertIsNone(e['time'])
        release['evidenceText'] = 'We will release financial results soon. The related conference call is on October 28, 2026.'
        self.assertEqual(from_announcement(release, source(), NOW)[0]['eventType'], 'EARNINGS_CALL')

    def test_real_feed_metadata_parses_for_four_unrelated_issuers(self):
        fixtures = Path(__file__).parent / 'fixtures'
        for entry in json.loads((fixtures / 'phase2-provenance.json').read_text()):
            values = parse_feed((fixtures / entry['file']).read_bytes(), entry['sourceUrl'])
            self.assertEqual(len(values), 3)
            self.assertTrue(all(v['url'] and v['publishedAt'] for v in values))
            self.assertTrue(all(not v['evidenceText'] for v in values))
        for entry in json.loads((fixtures / 'platform-metadata.json').read_text()):
            self.assertEqual(fingerprint(entry['htmlMetadata'].encode()), entry['platform'])

    def test_operating_and_clinical_quarter_results_are_not_earnings(self):
        for title in ['Tesla reports second-quarter 2026 production results', 'Issuer announces third-quarter clinical trial results']:
            proof = inspect_html(('<p>' + title + '</p>').encode(), 'https://www.sec.gov/release')
            self.assertNotEqual(proof['outcome'], 'EARNINGS_RELEASE')
            self.assertNotIn('Earnings', classify(title)['categories'])
            self.assertFalse(from_announcement({'headline': title.replace('reports', 'will report').replace('announces', 'will announce') + ' on November 1, 2026', 'url': 'https://apple.com/release'}, source(), NOW))

    def test_changed_fiscal_calendar_cannot_create_false_growth(self):
        c = consumer()
        for metric in c['quarterly']:
            c['quarterly'][metric][0][2] = '2025-01-01'
        s = summary(c, c['cik'], NOW)
        self.assertIsNone(s['metrics']['revenue']['yoy'])
        self.assertIsNone(s['metrics']['gross_margin']['changePercentagePoints'])

    def test_missing_two_quarters_marks_financial_summary_stale_not_missing(self):
        path = self.base / 'quant/data/sec/consumer'; path.mkdir(parents=True)
        (path / ('CIK' + company()['cik'] + '.json')).write_text(json.dumps(consumer()))
        pipe = Pipeline(self.base, {company()['companyId']: company()}, self.store, object(), '2027-02-01T00:00:00Z')
        pipe.project_company(company())
        value = self.store.state('financials:' + company()['companyId'])
        self.assertEqual(value['state'], 'AVAILABLE')
        self.assertTrue(value['stale'])

    def test_prepared_remarks_not_a_call_transcript_and_cdn_evidence_retained(self):
        links = [{'url': 'https://cdn.example.com/Q2_2026_Prepared_Remarks.pdf', 'text': 'Prepared Remarks'},
                 {'url': 'https://cdn.example.com/Q2_2026_Earnings_Deck.pdf', 'text': 'Earnings Presentation'}]
        docs = page_documents(company(), links, 'https://apple.com/investors', NOW)
        self.assertEqual(docs[0]['type'], 'PREPARED_REMARKS')
        self.assertEqual(docs[1]['type'], 'PRESENTATION')
        self.assertEqual(docs[1]['fiscalQuarter'], 'Q2')
        self.assertEqual(docs[1]['sourceUrl'], 'https://apple.com/investors')

    def test_shared_publisher_cannot_assign_an_unrelated_issuer(self):
        class HTTP:
            def get(self, *args, **kwargs):
                return {'body': b'<rss><channel><item><title>Another issuer launches product</title><link>https://businesswire.com/news/other</link><pubDate>Thu, 1 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>', 'finalUrl': 'https://apple.com/feed'}
        s = {**source(), 'allowedSites': ['https://apple.com/', 'https://businesswire.com/']}
        pipe = Pipeline(self.base, {company()['companyId']: company()}, self.store, HTTP(), NOW)
        pipe.ingest_source(s)
        self.assertEqual(pipe.run['unmatched'], 1)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 0)

    def test_failure_matrix_isolates_sources_and_records_health(self):
        from company_intelligence.transport import SourceError
        for i, reason in enumerate(['HTTP_403', 'HTTP_404', 'HTTP_429', 'HTTP_500', 'HTTP_503', 'NETWORK_UNAVAILABLE', 'MALFORMED_XML', 'INVALID_JSON', 'REDIRECT_LOOP']):
            class HTTP:
                def get(self, *args, **kwargs):
                    raise SourceError(reason)
            s = {**source(), 'sourceId': 'failing-' + str(i)}
            pipe = Pipeline(self.base, {company()['companyId']: company()}, self.store, HTTP(), NOW)
            pipe.ingest_source(s)
            value = next(v for v in self.store.sources() if v['sourceId'] == s['sourceId'])
            self.assertEqual(value['failureCount'], 1)
            self.assertIn(reason, value['lastError'])
            self.assertEqual(pipe.run['sourceFailures'], 1)
        self.assertEqual(len(self.store.sources()), 9)

    def test_german_financial_context_without_generic_word_matches(self):
        c = company('NVIDIA Corporation', 'NVDA')
        r = Resolver({c['companyId']: c})
        self.assertTrue(r.resolve({'headline': 'NVIDIA: Aktie steigt nach Quartalszahlen'}, {'type': 'RSS'}))
        c = company('Root, Inc.', 'ROOT')
        self.assertFalse(Resolver({c['companyId']: c}).resolve({'headline': 'Root: Aktien und Umsatz im Vergleich'}, {'type': 'RSS'}))
        self.assertIsNone(canonical_url('https://example.com/' + 'x' * 8192))

    def test_additional_common_names_from_actual_master_reject_generic_context(self):
        companies = load_universe(Path(__file__).resolve().parents[3])
        cases = {'ONON': 'Investors count on holding steady amid earnings volatility', 'GAP': 'A gap in quarterly revenue estimates',
                 'MTCH': 'Analysts match group revenue estimates', 'LTH': 'Life time earnings for workers decline', 'OPEN': 'An open door to higher stock profits'}
        for ticker, headline in cases.items():
            issuer = next(c for c in companies.values() if any(l['symbol'] == ticker for l in c['listings']))
            self.assertFalse(Resolver({issuer['companyId']: issuer}).resolve({'headline': headline}, {'type': 'RSS', 'ticker': ticker}), ticker)

    def test_rule_upgrade_reclassifies_old_news_without_new_ids_or_dates(self):
        value = item('Roto-Rooter Buys Largest Franchisee Territory')
        value.update(categories=['Other'], importance='LOW', classificationVersion='rules-1.0.0')
        self.store.ingest(value)
        current = self.store.company_payload(company(), NOW)['news'][0]
        self.assertEqual(current['importance'], 'HIGH')
        self.assertIn('M&A', current['categories'])
        self.assertEqual(current['publishedAt'], value['publishedAt'])
        self.assertEqual(current['newsId'], value['newsId'])
        self.assertNotIn('M&A', classify('Apple buys new office chairs')['categories'])

    def test_known_news_survives_discovery_budget_exhaustion(self):
        from unittest.mock import patch
        from company_intelligence.cli import main
        from company_intelligence.transport import BudgetExhausted
        root = self.base / 'root'
        config = root / 'company-intelligence/config'; config.mkdir(parents=True)
        (config / 'official-sites.json').write_text('{}')
        (config / 'sources.json').write_text(json.dumps([source()]))
        c = company(); c['officialSites'] = []
        self.store.set_state('siteCandidates:' + c['companyId'], {'status': 'CANDIDATE', 'candidates': [{'url': 'https://apple.com/'}]})
        class HTTP:
            def __init__(self, *args, **kwargs):
                self.requests, self.stats = 0, {}
            def get(self, *args, **kwargs):
                return {'body': b'<rss><channel><item><title>Apple Inc. launches new product</title><link>https://apple.com/product</link><pubDate>Thu, 1 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>', 'finalUrl': 'https://apple.com/feed'}
            def prune(self):
                pass
        with patch('company_intelligence.cli.load_universe', return_value={c['companyId']: c}), patch('company_intelligence.cli.PublicHTTP', HTTP), patch('company_intelligence.cli.utcnow', return_value=NOW), patch('company_intelligence.cli.validate_candidate', side_effect=BudgetExhausted('EXHAUSTED')), patch('sys.stdout', io.StringIO()):
            result = main(['probe', '--root', str(root), '--state', str(self.state), '--network', '--discover-sites', '--limit', '1'])
        self.assertEqual(result, 0)
        run = json.loads((self.state / 'latest-run.json').read_text())
        self.assertEqual(run['status'], 'DEFERRED')
        self.assertEqual(run['run']['new'], 1)
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM items').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
