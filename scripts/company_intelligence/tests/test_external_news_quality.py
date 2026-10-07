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
    "Gainey McKenna & Egleston Announces A Class Action Lawsuit Has Been Filed Against Alphabet Inc. (GOOG; GOOGL)",
    "DEEP FISSION, INC. (NASDAQ: FISN) INVESTIGATION: Johnson Fistel Investigates Potential Securities Claims Following Short-Seller Report",
    "Brodsky & Smith Shareholder Update: Notifying Investors of the Following Investigations: RXO, PTC, Lifecore Biomedical (NASDAQ: LFCR)",
    'MILLROSE PROPERTIES INVESTOR ALERT: Julie & Holleman Investigates Potential Misconduct Related to Dealings with Lennar',
    'Integra LifeSciences (NASDAQ: IART) Investor Alert: Johnson Fistel Investigates Following Flooding-Related Outlook Cuts and 21% Stock Decline',
    'BBNX Investor Alert: Schall, Brown & Schwartz LLP Files Class Action Lawsuit Against Beta Bionics, Inc. and Announces Opportunity for Investors to Lead Class Action Lawsuit',
    'QBTS Investigation Notice: Kessler Topaz Meltzer & Check, LLP Encourages D-Wave Quantum Inc. Investors to Contact the Firm',
)


class HTTP:
    def __init__(self, headline, target="https://apple.com/story"):
        self.headline = headline
        self.target = target

    def get(self, url, **kwargs):
        body = f'<rss><channel><item><title>{escape(self.headline)}</title><link>{escape(self.target)}</link><pubDate>Thu, 01 Oct 2026 12:00:00 GMT</pubDate><category domain="https://www.globenewswire.com/rss/stock">NASDAQ:AAPL</category></item></channel></rss>'
        return {'body': body.encode(), 'finalUrl': url}


class ExternalNewsQualityTests(unittest.TestCase):
    def test_observed_legal_advertising_templates_are_rejected_in_sitemap(self):
        for headline in ADS:
            with self.subTest(headline=headline):
                self.assertTrue(promotional_solicitation(headline))
                self.assertTrue(parse(xml(title=escape(headline)), URL)[0]['promotionalSolicitation'])

    def test_recruitment_with_intervening_investor_words_is_promotional(self):
        self.assertTrue(promotional_solicitation('Apple Inc. lawsuit: Announces Opportunity for Investors to Lead Class Action Lawsuit'))

    def test_firm_contact_recruitment_cannot_create_news_or_candidates(self):
        with tempfile.TemporaryDirectory() as tmp:
            c=company();store=Store(Path(tmp)/'state.sqlite')
            src={'sourceId':'publisher','url':'https://www.globenewswire.com/feed','type':'RSS','verified':False,'provider':'GLOBENEWSWIRE_RSS'}
            pipeline=Pipeline(tmp,{c['companyId']:c},store,HTTP('AAPL Investigation Notice: Example LLP Encourages Apple Inc. Investors to Contact the Firm'),NOW)
            pipeline.ingest_source(src)
            self.assertEqual(store.db.execute('select count(*) from items').fetchone()[0],0)
            self.assertEqual(store.db.execute('select count(*) from events').fetchone()[0],0)
            self.assertEqual(pipeline.run['promotionalRejected'],1)
            self.assertFalse(store.state('siteCandidates:'+c['companyId']))
            store.close()

    def test_factual_litigation_company_warnings_and_law_partner_business_survive(self):
        for headline in (
            'Apple Inc. reaches settlement in patent litigation',
            'Algorhythm’s CEO Andrew Thompson Issues Shareholder Update Outlining Strategic Vision',
            'Apple Inc. alerts investors to impersonation scams',
            'Apple Inc. Investor Alert: Protect Your Account',
            'Apple Inc. expands enterprise services partnership with Example LLP',
            'Apple Inc. board investigates product safety concerns',
            'Apple Inc. Investor Alert: Regulator Investigates Accounting Practices',
            'Apple Inc. encourages investors to contact the company for conference call access',
            'Example LLP advises Apple Inc. on its acquisition',
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

    def test_verified_feed_rejects_external_solicitation_using_effective_trust(self):
        for target in ('https://www.globenewswire.com/news-release/story', 'https://unrelated.example/story'):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as tmp:
                c = company(); store = Store(Path(tmp) / 'state.sqlite')
                source = {'sourceId': 'owned', 'companyId': c['companyId'], 'url': 'https://apple.com/feed', 'type': 'IR_FEED', 'verified': True, 'allowedSites': ['https://apple.com/']}
                pipeline = Pipeline(tmp, {c['companyId']: c}, store, HTTP('Apple Inc. Investor Alert: Example LLP Investigates Securities Losses', target), NOW)
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
