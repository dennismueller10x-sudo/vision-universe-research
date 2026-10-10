import unittest
from copy import deepcopy
from company_intelligence.consumer_event_review import apply_review

class ConsumerEventReviewTests(unittest.TestCase):
    def setUp(self):
        self.cid='iss_cik_0000019584'
        self.parent={'companyId':self.cid,'eventType':'EARNINGS_SCHEDULED','confirmationStatus':'CONFIRMED','date':'2026-10-27','sourceUrl':'https://owned.example/announcement'}
        self.payload={'companyId':self.cid,'generatedAt':'2026-10-06T14:00:21Z','sourceUsagePolicy':'OWNED_IR_SEC_METADATA_PREVIEW_V1','events':[self.parent]}
        self.review={'schema':1,'releaseState':'REVIEW_ONLY','rows':[{'companyId':self.cid,'parentSourceUrl':self.parent['sourceUrl'],'parentReleaseDate':'2026-10-27','callDate':'2026-10-28','localCallTime':'10:00','timeZone':'America/New_York','sourceContentHash':'a'*64,'sourceCapturedAt':'2026-10-07T08:50:00Z','method':'MANUAL_EXACT_OFFICIAL_BODY_DATE_AND_CLOCK_REVIEW','fiscalQuarter':'Q3','fiscalYear':2026}]}

    def test_exact_separate_call_preserves_date_only_release_and_input(self):
        before=deepcopy(self.payload);v=apply_review(self.payload,self.review)
        self.assertEqual(self.payload,before);self.assertEqual(v['events'][0],self.parent)
        self.assertNotIn('startsAt',v['events'][0]);self.assertEqual(v['events'][1]['startsAt'],'2026-10-28T14:00:00Z')
        self.assertEqual(apply_review(v,self.review),v)
        self.assertNotIn('replayUrl',v['events'][1]);self.assertNotIn('transcriptUrl',v['events'][1])

    def test_pacific_after_dst_correct_and_never_invents_release_clock(self):
        row=self.review['rows'][0];row.update(callDate='2026-11-05',localCallTime='14:00',timeZone='America/Los_Angeles')
        v=apply_review(self.payload,self.review);self.assertEqual(v['events'][1]['startsAt'],'2026-11-05T22:00:00Z')
        self.assertNotIn('startsAt',v['events'][0])

    def test_wrong_url_date_issuer_or_confirmation_cannot_attach(self):
        for key,value in [('sourceUrl','https://other.example/'),('date','2026-10-28'),('companyId','other'),('confirmationStatus','ESTIMATED')]:
            p=deepcopy(self.payload);p['events'][0][key]=value
            self.assertEqual(len(apply_review(p,self.review)['events']),1)

    def test_unfiltered_or_nonreview_publication_refused(self):
        p=deepcopy(self.payload);del p['sourceUsagePolicy']
        with self.assertRaisesRegex(ValueError,'REQUIRES_FILTERED'):apply_review(p,self.review)
        self.review['releaseState']='PUBLIC'
        with self.assertRaisesRegex(ValueError,'INVALID_BOUNDED'):apply_review(self.payload,self.review)

    def test_new_generation_or_a_rescheduled_upstream_call_never_gets_old_review(self):
        self.review['sourceGeneration']='old-snapshot'
        self.assertEqual(apply_review(self.payload,self.review,source_generation='new-snapshot'),self.payload)
        p=deepcopy(self.payload);p['events'].append({'companyId':self.cid,'eventType':'EARNINGS_CALL','date':'2026-10-28','startsAt':'2026-10-28T15:00:00Z'})
        self.assertEqual(apply_review(p,self.review,source_generation='old-snapshot'),p)
