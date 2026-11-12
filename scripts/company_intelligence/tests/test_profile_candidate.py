import unittest
from company_intelligence.profiles import extract, experiment, short_name
from company_intelligence.profile_diagnosis import compare

NOW = '2026-11-12T12:00:00Z'
SRC = {'type': 'SEC', 'form': '10-K', 'filingId': '0000000001-26-000001', 'filedAt': '2026-03-01',
       'url': 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm'}


def company(name):
    return {'companyId': 'iss_cik_0000000001', 'cik': '0000000001', 'names': [name], 'officialSites': [],
            'listings': [{'symbol': 'EXMP', 'instrumentId': 'vu_aaaaaaaaaaaaaa', 'exchange': 'NASDAQ'}]}


def doc(*paras):
    return ('<html lang="en"><p>Item 1. Business</p>' + ''.join('<p>%s</p>' % p for p in paras) + '<p>Item 1A. Risk Factors</p></html>').encode()


class CandidateTests(unittest.TestCase):
    def test_short_name(self):
        self.assertEqual(short_name('Goldman Sachs Group, Inc.'), 'Goldman Sachs')
        self.assertEqual(short_name('The Walt Disney Company'), 'Walt Disney')
        self.assertIsNone(short_name('Apple Inc.'), 'zu kurz: kein Kurzname')
        self.assertIsNone(short_name('Abbott Laboratories'))

    def test_default_parser_is_unchanged_and_candidate_is_opt_in(self):
        c = company('The Example Company')
        body = doc('The Example Company, together with the subsidiaries through which businesses are conducted (the Company), is a diversified worldwide entertainment company with operations in media and parks.')
        self.assertEqual(extract(c, body, SRC, NOW)['state'], 'UNAVAILABLE')
        with experiment():
            r = extract(c, body, SRC, NOW)
        self.assertEqual(r['state'], 'AVAILABLE')
        self.assertTrue(r['description'].startswith('The Example Company is a diversified'))
        self.assertEqual(extract(c, body, SRC, NOW)['state'], 'UNAVAILABLE', 'Schalter ist wieder aus')

    def test_through_our_subsidiaries(self):
        c = company('Baxterish International Inc.')
        body = doc('Baxterish International Inc., through our subsidiaries, provides a broad portfolio of essential healthcare products and services worldwide.')
        self.assertEqual(compare(c, body, SRC, NOW)['verdict'], 'NEWLY_AVAILABLE')

    def test_available_titles_keep_their_text(self):
        c = company('Example Holdings Inc.')
        body = doc('Example Holdings Inc. develops software platforms for banks and insurance companies worldwide.')
        r = compare(c, body, SRC, NOW)
        self.assertEqual(r['verdict'], 'SAME')

    def test_history_and_strategy_do_not_become_hits(self):
        c = company('Example Holdings Inc.')
        body = doc('Example Holdings Inc. was incorporated in Delaware in 1929.', 'Our core strategy is to grow our business globally within the parameters of our operating margin target.', 'Example Holdings manages its business through three reportable segments: Live, Wagering and Gaming.')
        self.assertEqual(compare(c, body, SRC, NOW)['verdict'], 'SAME')


if __name__ == '__main__':
    unittest.main()
