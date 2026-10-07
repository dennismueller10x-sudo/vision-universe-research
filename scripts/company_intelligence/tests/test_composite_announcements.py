import unittest
import tempfile
from pathlib import Path
from company_intelligence.ir_events import from_announcement
from company_intelligence.store import Store
from test_engine import source, NOW


class CompositeAnnouncementTests(unittest.TestCase):
    def announcement(self):
        return {'headline':'LSB Industries, Inc. Schedules 2026 Second Quarter Results Release for Wednesday, July 29th and Conference Call for Thursday, July 30th',
                'url':'https://apple.com/announcement','publishedAt':'2026-07-15T12:30:00Z',
                'evidenceText':'LSB today announced that it will release its financial results for the second quarter ended June 30, 2026 on July 29, 2026 after the close of the stock market. Management will host a conference call on'}

    def test_truncated_call_clause_does_not_turn_release_date_into_a_call(self):
        result=from_announcement(self.announcement(),source(),NOW)
        self.assertEqual(len(result),1);self.assertEqual(result[0]['eventType'],'EARNINGS_SCHEDULED')
        self.assertEqual(result[0]['date'],'2026-07-29');self.assertIsNone(result[0]['time'])
        self.assertNotIn('Conference Call',result[0]['headline'])

    def test_full_distinct_dates_remain_ambiguous_without_structured_event_evidence(self):
        item=self.announcement();item['evidenceText']+=' July 30, 2026 at 10:00 AM EDT.'
        self.assertEqual(from_announcement(item,source(),NOW),[])

    def test_explicit_call_date_remains_a_call_when_release_date_is_not_proven(self):
        item=self.announcement();item['evidenceText']='Management will host a conference call on July 30, 2026 at 10:00 AM EDT.'
        result=from_announcement(item,source(),NOW)
        self.assertEqual(result[0]['eventType'],'EARNINGS_CALL');self.assertEqual(result[0]['date'],'2026-07-30')
        self.assertEqual(result[0]['startsAt'],'2026-07-30T14:00:00Z')

    def test_replay_retires_only_wrong_same_source_call_preserving_independent_call_and_audit(self):
        item=self.announcement();replacement=from_announcement(item,source(),NOW)[0]
        with tempfile.TemporaryDirectory() as tmp:
            s=Store(Path(tmp)/'state.sqlite')
            old={**replacement,'eventId':'wrong','eventType':'EARNINGS_CALL','headline':item['headline'],'evidence':{'method':'EXPLICIT_OFFICIAL_ANNOUNCEMENT'}}
            correct={**old,'eventId':'correct','date':'2026-07-30','sourceId':'structured-event-source'}
            unrelated={**old,'eventId':'another-company','companyId':'other'}
            for event in (old,correct,unrelated):s.event(event,NOW)
            self.assertEqual(s.retire_composite_call(replacement,NOW),0)
            s.event(replacement,NOW);self.assertEqual(s.retire_composite_call(replacement,NOW),1)
            self.assertEqual(s.retire_composite_call(replacement,NOW),0)
            self.assertEqual({r[0] for r in s.db.execute("select id from events where kind='EARNINGS_CALL'")},{'correct','another-company'})
            self.assertEqual(s.db.execute("select target from event_alias where alias='wrong'").fetchone()[0],replacement['eventId'])
            self.assertEqual(s.db.execute("select count(*) from audit where json_extract(payload,'$.code')='COMPOSITE_CALL_RECLASSIFIED_AS_RELEASE'").fetchone()[0],1);s.close()

    def test_same_day_call_reference_cannot_retire_a_prior_call(self):
        item=self.announcement();item['headline']=item['headline'].replace('July 30th','July 29th')
        result=from_announcement(item,source(),NOW)[0]
        self.assertFalse(result['evidence']['retireLegacyCallOnReleaseDate'])

    def test_observed_quarter_release_in_truncated_highpeak_feed_is_not_a_call(self):
        item={'headline':'HighPeak Energy, Inc. Announces 2026 Second Quarter Earnings Release and Conference Call Dates',
              'url':'https://apple.com/announcement','publishedAt':'2026-07-31T20:05:27Z',
              'evidenceText':'FORT WORTH, Texas, July 31, 2026 (GLOBE NEWSWIRE) -- HighPeak Energy today announced that it plans to release its 2026 second quarter financial and operating results after the close of trading on Monday, August 10, 2026.'}
        result=from_announcement(item,source(),NOW)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['eventType'],'EARNINGS_SCHEDULED')
        self.assertEqual(result[0]['date'],'2026-08-10')
        self.assertFalse(result[0]['evidence']['retireLegacyCallOnReleaseDate'])
        self.assertIsNone(result[0]['startsAt'])

    def test_quarter_call_with_no_release_clause_still_uses_explicit_call_date(self):
        item={'headline':'HighPeak Energy, Inc. Announces 2026 Second Quarter Earnings Release and Conference Call Dates',
              'url':'https://apple.com/announcement','publishedAt':'2026-07-31T20:05:27Z',
              'evidenceText':'HighPeak Energy will host a conference call on August 11, 2026.'}
        result=from_announcement(item,source(),NOW)
        self.assertEqual(result[0]['eventType'],'EARNINGS_CALL')
        self.assertEqual(result[0]['date'],'2026-08-11')

    def test_observed_greif_company_possessive_release_date_is_not_a_call(self):
        item={'headline':'Greif, Inc. Announces 2026 Fourth Quarter Earnings Release and Conference Call Dates',
              'url':'https://apple.com/announcement','publishedAt':'2026-09-30T12:00:00Z',
              'evidenceText':'DELAWARE, Ohio, Sept. 30, 2026 (GLOBE NEWSWIRE) -- Greif announced today it will report the company’s 2026 fourth quarter financial results after the market closes on Tuesday, November 3, 2026.'}
        result=from_announcement(item,source(),NOW)
        self.assertEqual(result[0]['eventType'],'EARNINGS_SCHEDULED')
        self.assertEqual(result[0]['date'],'2026-11-03')
        self.assertIsNone(result[0]['startsAt'])

    def test_unsupported_release_clause_cannot_assign_its_date_to_composite_call(self):
        item={'headline':'Example Announces Quarterly Earnings Release and Conference Call Dates',
              'url':'https://apple.com/announcement','publishedAt':'2026-09-30T12:00:00Z',
              'evidenceText':'The company expects to issue its results on November 3, 2026. Conference call registration will open later.'}
        self.assertEqual(from_announcement(item,source(),NOW),[])
