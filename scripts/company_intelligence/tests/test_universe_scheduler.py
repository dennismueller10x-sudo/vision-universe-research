import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from company_intelligence.universe_scheduler import source_queue, sec_queue, sec_feed_entries
from company_intelligence.store import Store

NOW='2026-10-10T08:00:00Z'
def source(i,cid='iss_cik_0000000001'):
    return {'sourceId':str(i),'companyId':cid,'url':f'https://company.example/feed/{i}','type':'IR_FEED','provider':'FIRST_PARTY','active':True,'verified':True,'allowedSites':['https://company.example/'],'lastSuccess':'2026-10-09T08:00:00Z'}
class SchedulerTests(unittest.TestCase):
    def test_age_measurements_distinguish_unknown_history_and_do_not_change_queue(self):
        a=source(1);b=source(2);b.pop('lastSuccess');c=source(3);c['lastSuccess']='2026-10-01T08:00:00Z'
        rows,r=source_queue([a,b,c],{a['companyId']:{}},NOW)
        self.assertEqual([s['sourceId']for s in rows],['2','3','1'])
        self.assertEqual(r['sourceAge']['provenActiveSources'],2)
        self.assertEqual(r['sourceAge']['neverProvenActiveSources'],1)
        self.assertEqual(r['sourceAge']['maximumLastSuccessAgeHours'],216)
        self.assertEqual(r['sourceAge']['medianLastSuccessAgeHours'],120)
        self.assertEqual(r['sourceAge']['maximumKnownOverdueHours'],212)
        self.assertEqual(r['sourceAge']['lastSuccessOlderThanSevenDays'],1)
        self.assertEqual(r['sourceAge']['dueSourcesWithoutKnownDueTime'],1)
    def test_owner_conflict_does_not_poll_or_starve_independent_owned_sources(self):
        a=source(1);b=source(2,'iss_cik_0000000002')
        rows,r=source_queue([a,b],{a['companyId']:{},b['companyId']:{}},NOW,blocked_issuers={a['companyId']})
        self.assertEqual([x['sourceId']for x in rows],['2'])
        self.assertEqual(r['excluded']['CURRENT_OWNER_REVIEW_REQUIRED'],1)
        self.assertTrue(a['active'])
    def test_sec_global_metadata_hints_require_exact_known_cik_not_a_name(self):
        body=b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Apple</title><updated>2026-10-10T07:00:00Z</updated><link href="https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/x.htm" /></entry><entry><title>Apple</title><updated>2026-10-10T07:00:00Z</updated><link href="https://other.example/Archives/edgar/data/320193/000032019326000001/x.htm" /></entry></feed>'''
        rows,dates,count=sec_feed_entries(body,{'iss_cik_0000320193':{}});self.assertEqual(len(rows),1);self.assertEqual(rows[0]['accession'],'0000320193-26-000001');self.assertEqual(count,2)
        rows,_,_=sec_feed_entries(body,{'iss_cik_0001318605':{}});self.assertEqual(rows,[])
    def test_sec_html_error_cannot_be_a_successful_empty_feed(self):
        with self.assertRaises(ValueError):sec_feed_entries(b'<html>blocked</html>',{})
    def test_oldest_deferred_sources_resume_before_checked_sources(self):
        sources=[source(i) for i in range(500)];companies={sources[0]['companyId']:{}}
        first,report=source_queue(sources,companies,NOW);self.assertEqual(report['dueSources'],500)
        seen={s['sourceId'] for s in first[:100]}
        for s in sources:
            if s['sourceId'] in seen:s['lastSuccess']=NOW
        nxt,_=source_queue(sources,companies,'2026-10-10T12:00:00Z');self.assertTrue(all(s['sourceId'] not in seen for s in nxt[:100]))
    def test_one_bad_source_cooldown_does_not_starve_other_issuers(self):
        a=source(1);a.update(failureCount=5,nextCheck='2026-10-17T00:00:00Z');b=source(2)
        rows,r=source_queue([a,b],{a['companyId']:{}},NOW);self.assertEqual([x['sourceId'] for x in rows],['2'])

    def test_repeated_unchanged_news_adapts_to_daily_and_weekly_tiers(self):
        a=source(1);a['consecutiveUnchanged']=2
        b=source(2);b['consecutiveUnchanged']=12
        c=source(3);c['consecutiveUnchanged']=6
        for s in (a,b,c):s['lastSuccess']='2026-10-01T08:00:00Z'
        rows,report=source_queue([a,b,c],{a['companyId']:{}},NOW)
        self.assertEqual([(r['refreshTier'],r['intervalHours']) for r in rows],
                         [('LOW_CHANGE_NEWS_24H',24),('LOW_CHANGE_NEWS_72H',72),('LOW_CHANGE_NEWS_5D',120)])
        self.assertEqual(report['tiers']['LOW_CHANGE_NEWS_24H'],1)
        self.assertEqual(report['tiers']['LOW_CHANGE_NEWS_5D'],1)
        self.assertEqual(report['tiers']['LOW_CHANGE_NEWS_72H'],1)

    def test_quiet_material_and_event_sources_move_to_slower_lanes(self):
        event=source(1);event.update(type='IR_EVENTS',consecutiveUnchanged=3)
        material=source(2);material.update(type='IR_MATERIALS',consecutiveUnchanged=8)
        event['lastSuccess']=material['lastSuccess']='2026-10-01T08:00:00Z'
        rows,_=source_queue([event,material],{event['companyId']:{}},NOW)
        self.assertEqual([(r['refreshTier'],r['intervalHours']) for r in rows],
                         [('LOW_CHANGE_EVENTS_24H',24),('LOW_CHANGE_MATERIALS_5D',120)])

    def test_high_priority_canaries_keep_four_hour_news_cadence(self):
        a=source(1,'iss_cik_0000320193');a['consecutiveUnchanged']=20
        a['latestContentAt']='2025-01-01T00:00:00Z'
        rows,_=source_queue([a],{a['companyId']:{}},NOW)
        self.assertEqual(rows[0]['intervalHours'],4)

    def test_scheduler_reports_due_age_buckets_and_source_age_percentiles(self):
        values=[source(i) for i in range(1,6)]
        values[0]['lastSuccess']='2026-10-10T00:00:00Z'
        values[1]['lastSuccess']='2026-10-09T00:00:00Z'
        values[2]['lastSuccess']='2026-10-06T00:00:00Z'
        values[3]['lastSuccess']='2026-10-01T00:00:00Z'
        values[4].pop('lastSuccess')
        _,report=source_queue(values,{values[0]['companyId']:{}},NOW)
        age=report['sourceAge']
        self.assertEqual(age['neverProvenActiveSources'],1)
        self.assertEqual(age['medianLastSuccessAgeHours'],68)
        self.assertEqual(age['p95LastSuccessAgeHours'],224)
        self.assertEqual(age['p99LastSuccessAgeHours'],224)
        self.assertEqual(age['overdueBuckets']['24h'],3)
        self.assertIn('ageByLane',age)

    def test_archive_backlog_cannot_starve_current_news_or_events(self):
        values=[source(i) for i in range(30)]
        for i,s in enumerate(values):
            if i>=20:s.update(type='IR_MATERIALS',lastSuccess='2026-01-01T00:00:00Z')
            elif i>=15:s.update(type='IR_EVENTS',lastSuccess='2026-02-01T00:00:00Z')
        rows,r=source_queue(values,{values[0]['companyId']:{}},NOW)
        self.assertEqual([s['type'] for s in rows[:12]],['IR_FEED']*8+['IR_EVENTS']*3+['IR_MATERIALS'])
        self.assertEqual(len(rows),len(values))

    def test_old_backlog_activates_bounded_drain_fairness_then_returns_to_steady_state(self):
        values=[source(i) for i in range(120)]
        for s in values:s.update(consecutiveUnchanged=12,lastSuccess='2026-09-01T08:00:00Z')
        rows,report=source_queue(values,{values[0]['companyId']:{}},NOW)
        self.assertEqual(report['mode'],'BACKLOG_DRAIN')
        self.assertGreater(report['fairQueuePattern'].count('LOW_CHANGE_NEWS_5D'),
                           report['fairQueuePattern'].count('LOW_CHANGE_NEWS_24H'))
        self.assertEqual(len(rows),120)
        for s in values:s['lastSuccess']='2026-10-10T08:00:00Z'
        rows,report=source_queue(values,{values[0]['companyId']:{}},'2026-10-10T12:00:00Z')
        self.assertEqual(report['mode'],'STEADY_STATE')

    def test_shared_endpoint_cannot_guess_issuer_ownership(self):
        a=source(1);b=source(1,'iss_cik_0000000002');b['sourceId']='other'
        rows,r=source_queue([a,b],{a['companyId']:{},b['companyId']:{}},NOW);self.assertEqual(rows,[]);self.assertEqual(r['excluded']['ENDPOINT_MULTI_OWNER_CONFLICT'],2)
    def test_sec_rotation_is_bounded_and_survives_restart(self):
        companies={f'iss_cik_{i:010d}':{'cik':f'{i:010d}'} for i in range(1000)}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/'state.sqlite';s=Store(p);rows,r=sec_queue(s,companies,NOW,80);self.assertEqual(len(rows),80)
            prior={cid for cid,_ in rows}
            for cid,_ in rows:s.set_state('universeSecCheck:'+cid,{'lastAttempt':NOW})
            s.close();s=Store(p)
            try:
                rows,r=sec_queue(s,companies,'2026-10-10T12:00:00Z',80);self.assertTrue(all(cid not in prior for cid,_ in rows));self.assertEqual(r['deferredIssuers'],920)
            finally:s.close()
if __name__=='__main__':unittest.main()
