import unittest
from copy import deepcopy
from company_intelligence.consumer_usage import filter_for_preview


class ConsumerUsageTests(unittest.TestCase):
    cid = 'iss_cik_0000320193'
    def source(self):
        return {'sourceId': 'owned', 'companyId': self.cid, 'verified': True, 'type': 'IR_FEED', 'provider': 'GCS', 'url': 'https://ir.apple.com/news', 'allowedSites': ['https://ir.apple.com/']}
    def test_public_publisher_feed_does_not_imply_customer_reuse_and_ledger_is_unchanged(self):
        row = {'companyId': self.cid, 'headline': 'Company reports results', 'canonicalUrl': 'https://www.globenewswire.com/news-release/story', 'provenance': [{'sourceId': 'global', 'originalUrl': 'https://www.globenewswire.com/news-release/story'}], 'body': 'ARTICLE BODY'}
        p = {'companyId': self.cid, 'news': [row], 'companyProfile': {'description': 'Prepared neutral company description'}, 'previewBasis': 'CATALOGUE_AND_EXISTING_FACTS'}
        original = deepcopy(p)
        q, stats = filter_for_preview(p, [{'sourceId': 'global', 'active': True, 'verified': True, 'type': 'RSS', 'provider': 'GLOBENEWSWIRE_RSS'}])
        self.assertEqual(q['news'], [])
        self.assertEqual(stats['excluded']['news'], 1)
        self.assertEqual(q['companyProfile'], p['companyProfile'])
        self.assertEqual(q['previewBasis'], 'CATALOGUE_AND_EXISTING_FACTS')
        self.assertEqual(p, original)
    def test_issuer_owned_and_sec_metadata_survive_without_bodies_or_publisher_provenance(self):
        p = {'companyId': self.cid, 'news': [{'companyId': self.cid, 'headline': 'Results', 'canonicalUrl': 'https://ir.apple.com/news/results', 'body': 'private body', 'summary': 'excerpt', 'provenance': [{'sourceId': 'owned', 'originalUrl': 'https://ir.apple.com/news/results'}, {'sourceId': 'global', 'originalUrl': 'https://globenewswire.com/story'}]}], 'filings': [{'companyId': self.cid, 'sourceUrl': 'https://www.sec.gov/Archives/edgar/report.htm'}]}
        q, _ = filter_for_preview(p, [self.source()])
        self.assertEqual(len(q['news']), 1)
        self.assertEqual(len(q['filings']), 1)
        self.assertNotIn('body', q['news'][0])
        self.assertNotIn('summary', q['news'][0])
        self.assertEqual(len(q['news'][0]['provenance']), 1)
    def test_wrong_issuer_provider_name_and_unverified_sources_cannot_authorize_news(self):
        p = {'companyId': self.cid, 'news': [{'companyId': self.cid, 'headline': 'Results', 'canonicalUrl': 'https://ir.apple.com/story', 'provenance': [{'sourceId': 'owned'}]}]}
        for source in [{**self.source(), 'companyId': 'other'}, {**self.source(), 'verified': False}, {**self.source(), 'allowedSites': []}]:
            self.assertEqual(filter_for_preview(p, [source])[0]['news'], [])
    def test_estimated_window_stays_explicit_and_unlicensed_calendar_does_not_leak(self):
        p = {'companyId': self.cid, 'events': [{'companyId': self.cid, 'eventType': 'EARNINGS_ESTIMATED', 'confirmationStatus': 'ESTIMATED', 'dateStart': '2026-10-20'}, {'companyId': self.cid, 'eventType': 'EARNINGS_SCHEDULED', 'confirmationStatus': 'CONFIRMED', 'sourceUrl': 'https://www.globenewswire.com/story'}]}
        q, _ = filter_for_preview(p, [])
        self.assertEqual(len(q['events']), 1)
        self.assertEqual(q['events'][0]['confirmationStatus'], 'ESTIMATED')
    def test_owned_source_id_cannot_authorize_a_foreign_news_url(self):
        p = {'companyId': self.cid, 'news': [{'companyId': self.cid, 'headline': 'Unrelated', 'canonicalUrl': 'https://wrong.example/story', 'provenance': [{'sourceId': 'owned', 'originalUrl': 'https://wrong.example/story'}]}]}
        self.assertEqual(filter_for_preview(p, [self.source()])[0]['news'], [])
    def test_distributor_duplicate_requires_exact_owned_title_date_before_replacing_link(self):
        p = {'companyId': self.cid, 'news': [{'companyId': self.cid, 'headline': 'Results', 'publishedAt': '2026-10-01T12:00:00Z', 'canonicalUrl': 'https://globenewswire.com/story', 'provenance': [{'sourceId': 'owned', 'headline': 'Results', 'publishedAt': '2026-10-01T12:00:00Z', 'originalUrl': 'https://ir.apple.com/results'}]}]}
        q, _ = filter_for_preview(p, [self.source()])
        self.assertEqual(q['news'][0]['canonicalUrl'], 'https://ir.apple.com/results')
        p['news'][0]['provenance'][0]['publishedAt'] = '2026-09-01T12:00:00Z'
        self.assertEqual(filter_for_preview(p, [self.source()])[0]['news'], [])
    def test_explicit_company_material_on_platform_cdn_survives_only_its_verified_parent(self):
        doc = {'companyId': self.cid, 'eventId': 'call', 'url': 'https://s202.q4cdn.com/report.pdf', 'type': 'PRESENTATION'}
        p = {'companyId': self.cid, 'calls': [{'companyId': self.cid, 'eventId': 'call', 'sourceUrl': 'https://ir.apple.com/events/call', 'sourceDocuments': [doc]}], 'materials': [doc]}
        q, _ = filter_for_preview(p, [self.source()])
        self.assertEqual(len(q['materials']), 1)
        self.assertEqual(q['materials'][0]['url'], doc['url'])
        p['calls'][0]['sourceUrl'] = 'https://globenewswire.com/story'
        self.assertEqual(filter_for_preview(p, [self.source()])[0]['materials'], [])
