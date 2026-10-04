import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from company_intelligence.inventory_runner import drive
from company_intelligence.store import Store
from company_intelligence.checkpoint import restore


class RunnerTests(unittest.TestCase):
 def test_interrupt_preserves_candidate_and_resumed_batch_accounting(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite')
   store.set_state('officialSite:one',{'status':'DEFERRED','reason':'ROBOTS_UNAVAILABLE:HTTP_503'})
   store.close()
   reports=iter([{'requests':3,'httpStats':{'bytesDownloaded':200},'stopReason':'BATCH_COMPLETED'}])
   calls=[]
   def execute(command,**kwargs):
    calls.append(command)
    try:return SimpleNamespace(returncode=0,stdout=json.dumps(next(reports)))
    except StopIteration:return SimpleNamespace(returncode=1,stdout='')
   with contextlib.redirect_stdout(io.StringIO()):
    with self.assertRaisesRegex(RuntimeError,'INVENTORY_BATCH_FAILED'):drive(tmp,state,'resume',batches=2,execute=execute)
   store=Store(state/'state.sqlite');prior=store.state('inventoryRunner:resume:domains');store.close()
   self.assertEqual(prior['requests'],3);self.assertEqual(prior['completedBatches'],1)
   self.assertEqual(prior['failureClusters']['categories'],{'TEMPORARILY_UNAVAILABLE':1})
   def recovered(command,**kwargs):return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':2,'stopReason':'NO_DUE_CANDIDATES'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'resume',execute=recovered)
   restore(state/'checkpoints/resume-domains.tar.gz',Path(tmp)/'restored')
   store=Store(Path(tmp)/'restored/state.sqlite');value=store.state('inventoryRunner:resume:domains');store.close()
   self.assertEqual(value['requests'],5);self.assertEqual(value['completedBatches'],2)
   self.assertEqual(value['bytesDownloaded'],200)

 def test_circuit_stop_does_not_submit_a_second_batch(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite');store.close();calls=[]
   def execute(command,**kwargs):
    calls.append(command)
    return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':0,'stopReason':'CIRCUIT_COOLDOWN'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'blocked',batches=5,execute=execute)
   self.assertEqual(len(calls),1)

 def test_ir_is_ingested_between_domain_batches_without_restarting_domain_pass(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite');store.close();lanes=[]
   def execute(command,**kwargs):
    lanes.append(command[command.index('--inventory-lane')+1])
    return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':2,'stopReason':'BATCH_COMPLETED'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'mixed',batches=2,ir_every=1,execute=execute)
   self.assertEqual(lanes,['domains','ir','domains','ir'])
   store=Store(state/'state.sqlite');self.assertEqual(store.state('inventoryRunner:mixed:domains')['requests'],4);self.assertEqual(store.state('inventoryRunner:mixed:ir')['requests'],4);store.close()

 def test_operator_stop_waits_for_current_checkpoint_then_avoids_next_batch(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite');store.close();calls=[]
   def execute(command,**kwargs):
    calls.append(command);(state/'stop-inventory').touch()
    return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':2,'stopReason':'BATCH_COMPLETED'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'stopped',batches=5,execute=execute)
   self.assertEqual(len(calls),1);self.assertTrue((state/'checkpoints/stopped-domains.tar.gz').is_file())
