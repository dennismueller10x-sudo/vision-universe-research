import tempfile
import unittest
from pathlib import Path
from xml.sax.saxutils import escape

from company_intelligence.news_quality import promotional_solicitation
from company_intelligence.news_sitemap import parse, URL
from company_intelligence.pipeline import Pipeline
from company_intelligence.store import Store
from test_engine import company, NOW
from test_news_sitemap import xml


ADS = (
    'MILLROSE PROPERTIES INVESTOR ALERT: Julie & Holleman Investigates Potential Misconduct Related to Dealings with Lennar',
    'Integra LifeSciences (NASDAQ: IART) Investor Alert: Johnson Fistel Investigates Following Flooding-Related Outlook Cuts and 21% Stock Decline',
    'BBNX Investor Alert: Schall, Brown & Schwartz LLP Files Class Action Lawsuit Against Beta Bionics, Inc. and Announces Opportunity for Investors to Lead Class Action Lawsuit',
)


class HTTP:
    def __init__(self, headline):
        self.headline = headline

    def get(self, url, **kwargs):
        body = f'<rss><channel><item><title>{escape(self.headline)}</title><link>https://apple.com/story</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate><category domain="https://www.globenewswire.com/rss/stock">NASDAQ:AAPL</category></item></channel></rss>'
        return {'body': body.encode(), 'finalUrl': url}


class ExternalNewsQualityTests(unittest.TestCase):
    def test_observed_legal_advertising_templates_are_rejected_in_sitemap(self):
        for headline in ADS:
            with self.subTest(headline=headline):
                self.assertTrue(promotional_solicitation(headline))
                self.assertTrue(parse(xml(title=escape(headline)), URL)[0]['promotionalSolicitation'])

    def test_recruitment_with_intervening_investor_words_is_promotional(self):
        self.assertTrue(promotional_solicitation('Apple Inc. lawsuit: Announces Opportunity for Investors to Lead Class Action Lawsuit'))

    def test_factual_litigation_company_warnings_and_law_partner_business_survive(self):
        for headline in (
            'Apple Inc. reaches settlement in patent litigation',
            'Apple Inc. alerts investors to impersonation scams',
            'Apple Inc. Investor Alert: Protect Your Account',
            'Apple Inc. expands enterprise services partnership with Example LLP',
            'Apple Inc. board investigates product safety concerns',
            'Apple Inc. Investor Alert: Regulator Investigates Accounting Practices',
        ):
            with self.subTest(headline=headline):
                self.assertFalse(promotional_solicitation(headline))

    def test_unverified_rss_rejects_ad_before_identity_or_event_derivation(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = company(); store = Store(Path(tmp) / 'state.sqlite')
            source = {'sourceId': 'publisher', 'url': 'https://www.globenewswire.com/feed', 'type': 'RSS', 'verified': False, 'provider': 'GLOBENEWSWIRE_RSS'}
            pipeline = Pipeline(tmp, {c['companyId']: c}, store, HTTP('Apple Inc. Investor Alert: Example LLP Investigates Securities Losses'), NOW)
            pipeline.ingest_source(source)
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 0)
            self.assertEqual(store.db.execute('select count(*) from events').fetchone()[0], 0)
            self.assertEqual(pipeline.run['promotionalRejected'], 1)
            self.assertFalse(store.state('siteCandidates:' + c['companyId']))
            store.close()

    def test_verified_first_party_feed_keeps_direct_issuer_legal_announcement(self):
        with tempfile.TemporaryDirectory() as tmp:
            c = company(); store = Store(Path(tmp) / 'state.sqlite')
            source = {'sourceId': 'owned', 'companyId': c['companyId'], 'url': 'https://apple.com/feed', 'type': 'IR_FEED', 'verified': True, 'allowedSites': ['https://apple.com/']}
            pipeline = Pipeline(tmp, {c['companyId']: c}, store, HTTP('Apple Inc. Investor Alert: Example LLP Investigates Securities Losses'), NOW)
            pipeline.ingest_source(source)
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0], 1)
            self.assertEqual(pipeline.run['promotionalRejected'], 0)
            store.close()


if __name__ == '__main__':
    unittest.main()
