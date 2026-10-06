import unittest

from company_intelligence.discovery import validate_candidate
from company_intelligence.transport import SourceError
from test_engine import company, NOW
from test_ownership_routes import HTTP


URL='https://issuer.example/'


class CorporateHeaderEvidenceTests(unittest.TestCase):
    def verify(self, legal, body, ticker='TEST'):
        return validate_candidate(company(legal,ticker),{'url':URL,'evidence':'candidate'},HTTP({URL:body}),NOW)

    def test_observed_home_link_logo_supplies_brand_with_exact_legal_owner(self):
        for legal, brand in [('Federal Signal Corporation','Federal Signal'),('Mitsubishi UFJ Financial Group Inc.','MUFG')]:
            with self.subTest(legal=legal):
                body=f'<title>Home</title><a href="/"><img src="/logo.svg" alt="{brand}"></a><footer>© 2026 {legal}. All rights reserved.</footer>'
                self.assertEqual(self.verify(legal,body)['status'],'VALIDATED')

    def test_customer_and_unlinked_images_cannot_supply_corporate_header(self):
        for link in ('<a href="https://customer.example/">{img}</a>','<a href="/customers">{img}</a>','<a href="#customer">{img}</a>','<a href="/?customer=1">{img}</a>','{img}','<a name="customer">{img}</a>'):
            with self.subTest(link=link):
                image='<img src="/logo.svg" alt="Federal Signal">'
                body='<title>Home</title>'+link.format(img=image)+'<footer>© 2026 Federal Signal Corporation. All rights reserved.</footer>'
                with self.assertRaisesRegex(SourceError,'OWNER_NOT_VALIDATED'):
                    self.verify('Federal Signal Corporation',body)

    def test_logo_cannot_override_conflicting_or_extended_legal_owner(self):
        for owner in ('Different Owner LLC','Federal Signal Corporation Japan Services LLC'):
            with self.subTest(owner=owner):
                body=f'<title>Home</title><a href="/"><img src="/logo.svg" alt="Federal Signal"></a><footer>© 2026 {owner}. All rights reserved.</footer>'
                with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
                    self.verify('Federal Signal Corporation',body)

    def test_explicit_short_legal_brand_requires_exact_footer(self):
        for legal,brand in [('PPG Industries Inc.','PPG'),('ABM Industries Incorporated','ABM'),('ICF International Inc.','ICF'),('OGE Energy Corp.','OG&E')]:
            with self.subTest(legal=legal):
                good=f'<title>{brand}</title><footer>© 2026 {legal}. All rights reserved.</footer>'
                self.assertEqual(self.verify(legal,good)['status'],'VALIDATED')
                bad=f'<title>{brand}</title><p>{legal} is our customer.</p><footer>© Different Owner LLC.</footer>'
                with self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
                    self.verify(legal,bad)

    def test_ticker_alone_is_not_a_short_legal_brand(self):
        body='<title>ABC</title><footer>© 2026 Cocoa Industries Inc. All rights reserved.</footer>'
        with self.assertRaisesRegex(SourceError,'OWNER_NOT_VALIDATED'):
            self.verify('Cocoa Industries Inc.',body,'ABC')

    def test_boolean_image_attributes_do_not_abort_valid_logo_evidence(self):
        body='<title>Home</title><a href="/"><img src="/logo.svg" class alt="Federal Signal"></a><footer>© 2026 Federal Signal Corporation. All rights reserved.</footer>'
        self.assertEqual(self.verify('Federal Signal Corporation',body)['status'],'VALIDATED')
