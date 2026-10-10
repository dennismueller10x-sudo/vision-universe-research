import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from company_intelligence.cli import main
from company_intelligence.store import Store
from company_intelligence.transport import SourceError
from test_engine import company, NOW


class ArchiveCooldownTests(unittest.TestCase):
 def test_operator_pause_preserves_archive_checkpoint_and_source_health_without_http(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);self.seed(r,2,'2099-01-01T00:00:00Z')
   (r/'.company-intelligence/stop-source-backfill').touch()
   result,calls=self.run_archive(r,AssertionError('REQUEST_DURING_OPERATOR_PAUSE'))
   self.assertEqual(calls,0);self.assertEqual(result['stopReason'],'OPERATOR_CHECKPOINT_PAUSE')
   self.assertFalse(result['checkpointCurrentRun']);self.assertEqual(result['checkpoint'],{'attempted':7,'parsed':5})
   s=Store(r/'.company-intelligence/state.sqlite')
   v=json.loads(s.db.execute("select payload from sources where id='gnn-archive-2026-09'").fetchone()[0])
   self.assertEqual((v['failureCount'],v['nextCheck'],v['active']), (2,'2099-01-01T00:00:00Z',False))
   self.assertEqual(s.state('distributorArchive:retained-release'),{'status':'INGESTED'});s.close()

 def test_material_operator_pause_does_not_derive_sources_or_change_health(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);cfg=r/'company-intelligence/config';cfg.mkdir(parents=True)
   (cfg/'official-sites.json').write_text('{}');state=r/'.company-intelligence'
   s=Store(state/'state.sqlite');health={'sourceId':'material','url':'https://apple.com/materials','type':'IR_MATERIALS','failureCount':3,'nextCheck':'2099-01-01T00:00:00Z'}
   s.source(health);s.close();(state/'stop-source-backfill').touch();output=io.StringIO();c=company()
   with patch('company_intelligence.cli.load_universe',return_value={c['companyId']:c}),patch('company_intelligence.materials.backfill',side_effect=AssertionError('DERIVATION_DURING_PAUSE')),contextlib.redirect_stdout(output):
    self.assertEqual(main(['materials-backfill','--root',str(r),'--state',str(state),'--network']),0)
   self.assertEqual(json.loads(output.getvalue())['stopReason'],'OPERATOR_CHECKPOINT_PAUSE')
   s=Store(state/'state.sqlite');v=s.sources()[0];self.assertEqual(v['failureCount'],3);self.assertEqual(v['nextCheck'],health['nextCheck']);s.close()

 def run_archive(self, root, response):
  cfg=root/'company-intelligence/config';cfg.mkdir(parents=True,exist_ok=True)
  (cfg/'sources.json').write_text('[]');(cfg/'official-sites.json').write_text('{}')
  output=io.StringIO();c=company()
  with patch('company_intelligence.cli.load_universe',return_value={c['companyId']:c}),patch('company_intelligence.cli.utcnow',return_value=NOW),patch('company_intelligence.transport.PublicHTTP.get',side_effect=response) as get,contextlib.redirect_stdout(output):
   self.assertEqual(main(['news-archive','--root',str(root),'--state',str(root/'.company-intelligence'),'--network','--archive-month','2026-09','--limit','5']),0)
  return json.loads(output.getvalue()),get.call_count

 def seed(self, root, failures, due):
  s=Store(root/'.company-intelligence/state.sqlite')
  s.source({'sourceId':'gnn-archive-2026-09','url':'https://sitemaps.globenewswire.com/news/en/2026-09.xml','type':'RSS','active':False,'failureCount':failures,'nextCheck':due,'lastError':'HTTP_503' if failures else None})
  s.set_state('distributorArchiveRun:gnn-archive-2026-09',{'attempted':7,'parsed':5})
  s.set_state('distributorArchive:retained-release',{'status':'INGESTED'})
  s.close()

 def test_publisher_failure_cooldown_survives_new_cli_and_preserves_release_checkpoint(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);self.seed(r,2,'2099-01-01T00:00:00Z')
   result,calls=self.run_archive(r,AssertionError('OUTBOUND_REQUEST_DURING_COOLDOWN'))
   self.assertEqual(calls,0);self.assertEqual(result['stopReason'],'SOURCE_COOLDOWN');self.assertEqual(result['checkpoint'],{'attempted':7,'parsed':5})
   self.assertFalse(result['checkpointCurrentRun'])
   s=Store(r/'.company-intelligence/state.sqlite');v=json.loads(s.db.execute("select payload from sources where id='gnn-archive-2026-09'").fetchone()[0])
   self.assertEqual(v['failureCount'],2);self.assertEqual(s.state('distributorArchive:retained-release'),{'status':'INGESTED'});s.close()

 def test_retry_after_due_accumulates_publisher_failures_instead_of_resetting_to_one(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);self.seed(r,1,'2020-01-01T00:00:00Z')
   result,calls=self.run_archive(r,SourceError('ROBOTS_UNAVAILABLE:HTTP_503'))
   self.assertEqual(calls,1);self.assertEqual(result['run']['sourceFailures'],1)
   self.assertFalse(result['checkpointCurrentRun']);self.assertEqual(result['checkpoint'],{'attempted':7,'parsed':5})
   from company_intelligence.pipeline import advance
   s=Store(r/'.company-intelligence/state.sqlite');v=json.loads(s.db.execute("select payload from sources where id='gnn-archive-2026-09'").fetchone()[0]);self.assertEqual(v['failureCount'],2);self.assertEqual(v['nextCheck'],advance(NOW,4));self.assertEqual(s.state('distributorArchive:retained-release'),{'status':'INGESTED'});s.close()

 def test_actual_robots_disallowance_retains_slow_retry(self):
  from company_intelligence.pipeline import advance
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);self.seed(r,0,'2020-01-01T00:00:00Z')
   result,calls=self.run_archive(r,SourceError('ROBOTS_DISALLOWED'))
   self.assertEqual(calls,1)
   s=Store(r/'.company-intelligence/state.sqlite');v=json.loads(s.db.execute("select payload from sources where id='gnn-archive-2026-09'").fetchone()[0]);self.assertEqual(v['nextCheck'],advance(NOW,7*24));s.close()

 def test_healthy_explicit_backfill_continues_before_normal_weekly_interval(self):
  with tempfile.TemporaryDirectory() as tmp:
   r=Path(tmp);self.seed(r,0,'2099-01-01T00:00:00Z')
   response={'body':b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>','finalUrl':'https://sitemaps.globenewswire.com/news/en/2026-09.xml'}
   result,calls=self.run_archive(r,lambda *args,**kw:response)
   self.assertEqual(calls,1);self.assertNotEqual(result.get('stopReason'),'SOURCE_COOLDOWN');self.assertEqual(result['run']['sourceFailures'],0)
   self.assertTrue(result['checkpointCurrentRun']);self.assertEqual(result['checkpoint']['attempted'],0)
