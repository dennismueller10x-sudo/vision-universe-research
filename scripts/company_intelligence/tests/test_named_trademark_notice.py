import unittest
from company_intelligence.discovery import validate_candidate
from company_intelligence.transport import SourceError
from test_engine import company, NOW
from test_ownership_routes import HTTP

URL = 'https://issuer.example/'
NOTICE = ('Unless otherwise specified, all product names appearing in this internet site '
          'are trademarks owned by or licensed to {owner}, its subsidiaries or affiliates.')


class NamedTrademarkNoticeTests(unittest.TestCase):
    def verify(self, name, owner, trademark_owner):
        body = '<title>' + name + '</title><footer>Copyright © 2026 ' + owner + ' ' + NOTICE.format(owner=trademark_owner) + '</footer>'
        return validate_candidate(company(name, 'ISSUER'), {'url': URL, 'evidence': 'candidate'}, HTTP({URL: body}), NOW)

    def test_same_legal_owner_trademark_notice_after_address_does_not_extend_owner(self):
        self.assertEqual(self.verify('AbbVie Inc.', 'AbbVie Inc. North Chicago, Illinois, U.S.A', 'AbbVie Inc.')['status'], 'VALIDATED')

    def test_long_subsidiary_before_notice_remains_conflicting(self):
        with self.assertRaisesRegex(SourceError, 'CONFLICTING_COPYRIGHT_OWNER'):
            self.verify('Root Inc.', 'Root Inc. Japan East Asia Regional Services LLC.', 'Root Inc.')

    def test_different_trademark_owner_cannot_supply_the_boundary(self):
        with self.assertRaisesRegex(SourceError, 'CONFLICTING_COPYRIGHT_OWNER'):
            self.verify('Root Inc.', 'Root Inc. North Chicago, Illinois', 'Root Inc. Japan LLC')

    def test_notice_does_not_rescue_a_different_initial_copyright_owner(self):
        with self.assertRaisesRegex(SourceError, 'CONFLICTING_COPYRIGHT_OWNER'):
            self.verify('AbbVie Inc.', 'Other Holdings LLC.', 'AbbVie Inc.')

    def test_exact_self_copyright_repeat_is_not_a_different_legal_owner(self):
        notice='All website design, text, graphics, the selection and arrangement thereof, and all software are copyright by '
        def verify(owner, repeated):
            body='<title>Devon Energy</title><footer>© 2026 Copyright '+owner+'. '+notice+repeated+'. ALL RIGHTS RESERVED.</footer>'
            return validate_candidate(company('Devon Energy Corp', 'DVN'), {'url':URL,'evidence':'candidate'},HTTP({URL:body}),NOW)
        self.assertEqual(verify('Devon Energy Corporation','Devon Energy Corporation')['status'],'VALIDATED')
        for owner,repeated in [('Devon Energy Corporation Japan LLC','Devon Energy Corporation'),
                               ('Devon Energy Corporation','Devon Energy Corporation Japan LLC'),
                               ('Other Holdings LLC','Devon Energy Corporation')]:
            with self.subTest(owner=owner,repeated=repeated), self.assertRaisesRegex(SourceError,'CONFLICTING_COPYRIGHT_OWNER'):
                verify(owner,repeated)


if __name__ == '__main__':
    unittest.main()
