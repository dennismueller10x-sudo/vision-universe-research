import unittest
from company_intelligence.news_quality import eligible

COMPANY = {'companyId': 'iss_cik_0001743725', 'names': ['Grid Dynamics']}


class WordPressInstructionalScopeTests(unittest.TestCase):
    def test_explicit_brand_does_not_turn_an_instructional_blog_into_company_news(self):
        entry = {'headline': 'Practical agent evaluation techniques for a real-world knowledge assistant: A Grid Dynamics case study',
                 'url': 'https://www.griddynamics.com/blog/how-to-evaluate-ai-agents'}
        self.assertFalse(eligible(entry, COMPANY, True))
        self.assertTrue(eligible(entry, COMPANY, False))

    def test_company_acquisition_on_the_same_blog_remains_news(self):
        self.assertTrue(eligible({'headline': 'Grid Dynamics acquires Ekumen, deepening expertise in Robotics Product Engineering and Physical AI',
                                  'url': 'https://www.griddynamics.com/blog/grid-dynamics-acquires-ekumen-to-advance-physical-ai'}, COMPANY, True))

    def test_investor_call_access_information_is_not_a_technical_tutorial(self):
        self.assertTrue(eligible({'headline': 'How to join the Grid Dynamics earnings conference call',
                                  'url': 'https://www.griddynamics.com/blog/earnings-call-access'}, COMPANY, True))


if __name__ == '__main__':
    unittest.main()
