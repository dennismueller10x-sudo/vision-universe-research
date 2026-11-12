import unittest
from company_intelligence.profile_diagnosis import diagnose
from company_intelligence.profiles import extract

COMPANY = {'companyId': 'iss_cik_0000000001', 'cik': '0000000001', 'names': ['Example Holdings Inc.'], 'officialSites': [],
           'listings': [{'symbol': 'EXMP', 'instrumentId': 'vu_aaaaaaaaaaaaaa', 'exchange': 'NASDAQ'}]}
SRC = {'type': 'SEC', 'form': '10-K', 'filingId': '0000000001-26-000001', 'filedAt': '2026-03-01',
       'url': 'https://www.sec.gov/Archives/edgar/data/1/000000000126000001/annual.htm'}


def html(*paras):
    return ('<html lang="en">' + ''.join('<p>%s</p>' % p for p in paras) + '</html>').encode()


class DiagnosisTests(unittest.TestCase):
    def test_classes(self):
        cases = {
            'ITEM1_NOT_FOUND': html('Cover page', 'Risk factors may apply.'),
            'ITEM1_CROSS_REFERENCE': html('Item 1. Business', 'The information required by this item is incorporated by reference to the Annual Report to Shareholders, Exhibit 13.', 'Item 1A. Risk Factors'),
            'ITEM1_NO_BUSINESS_SENTENCES': html('Item 1. Business', 'Overview of recent developments and general matters.', 'Item 1A. Risk Factors'),
            'DESCRIBABLE_OR_REJECTED': html('Item 1. Business', 'Example Holdings Inc. develops software platforms for banks and insurance companies worldwide.', 'Item 1A. Risk Factors'),
        }
        got = {}
        for name, body in cases.items():
            d = diagnose(COMPANY, body, SRC)
            got[name] = d['class']
        self.assertEqual(got['ITEM1_NOT_FOUND'], 'ITEM1_NOT_FOUND')
        self.assertEqual(got['ITEM1_CROSS_REFERENCE'], 'ITEM1_CROSS_REFERENCE')
        self.assertEqual(got['ITEM1_NO_BUSINESS_SENTENCES'], 'ITEM1_NO_BUSINESS_SENTENCES')
        d = diagnose(COMPANY, cases['ITEM1_NO_BUSINESS_SENTENCES'], SRC)
        self.assertEqual(d['afterHeading'][0][1], 'Item 1. Business')
        self.assertTrue(all(len(x[1]) <= 110 for x in d['afterHeading']))

    def test_diagnosis_never_changes_the_parser_result(self):
        body = html('Item 1. Business', 'Example Holdings Inc. develops software platforms for banks and insurance companies worldwide.', 'Item 1A. Risk Factors')
        before = extract(COMPANY, body, SRC, '2026-10-05T12:00:00Z')
        d = diagnose(COMPANY, body, SRC)
        self.assertEqual(before, extract(COMPANY, body, SRC, '2026-10-05T12:00:00Z'))
        self.assertEqual(before['state'], 'AVAILABLE')
        self.assertEqual(d['class'], 'CUSTOMER_ONLY_OR_TOO_SHORT', 'Parser findet etwas: die Klasse ist dann nur ein Hinweis, kein Befund')

    def test_first_person_voice_in_combined_report(self):
        body = html('Item 1. Business', 'We provide infrastructure services and equipment to utilities and customers worldwide.', 'Item 1A. Risk Factors')
        d = diagnose(COMPANY, body, SRC)
        self.assertIn(d['class'], ('CUSTOMER_ONLY_OR_TOO_SHORT', 'ISSUER_SENTENCE_REJECTED_BY_RULES', 'NO_ISSUER_SUBJECT_SENTENCE'))


if __name__ == '__main__':
    unittest.main()
