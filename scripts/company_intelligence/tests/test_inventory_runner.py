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
 def test_same_pass_ir_inherits_domain_cohort_but_preserves_an_existing_ir_checkpoint(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite')
   store.set_state('inventorySweep:scoped:domains:inventory',['recovered','pending'])
   store.set_state('siteCandidates:unrelated',{'status':'CANDIDATE'})
   store.close();seen=[]
   def execute(command,**kwargs):
    store=Store(state/'state.sqlite');seen.append(store.state('inventorySweep:scoped:ir:inventory'));store.close()
    return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':0,'stopReason':'NO_DUE_CANDIDATES'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'scoped',lane='ir',execute=execute)
   self.assertEqual(seen,[['recovered','pending']])
   store=Store(state/'state.sqlite');store.set_state('inventorySweep:scoped:ir:inventory',['previously-frozen']);store.close()
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'scoped',lane='ir',execute=execute)
   self.assertEqual(seen[-1],['previously-frozen'])
   restore(state/'checkpoints/scoped-ir.tar.gz',Path(tmp)/'restored')
   store=Store(Path(tmp)/'restored/state.sqlite');self.assertEqual(store.state('inventorySweep:scoped:ir:inventory'),['previously-frozen']);store.close()

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
   restore(state/'checkpoints/resume-domains.tar.gz',Path(tmp)/'interrupted-restore')
   store=Store(Path(tmp)/'interrupted-restore/state.sqlite')
   self.assertEqual(store.state('inventoryRunner:resume:domains'),prior)
   self.assertEqual(store.state('officialSite:one')['reason'],'ROBOTS_UNAVAILABLE:HTTP_503')
   store.close()
   def recovered(command,**kwargs):return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':2,'stopReason':'NO_DUE_CANDIDATES'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'resume',execute=recovered)
   restore(state/'checkpoints/resume-domains.tar.gz',Path(tmp)/'restored')
   store=Store(Path(tmp)/'restored/state.sqlite');value=store.state('inventoryRunner:resume:domains');store.close()
   self.assertEqual(value['requests'],5);self.assertEqual(value['completedBatches'],2)
   self.assertEqual(value['bytesDownloaded'],200)

 def test_first_failed_child_restores_partial_candidate_without_inventing_batch_totals(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite')
   store.set_state('inventorySweep:partial:domains:inventory',['completed','pending'])
   store.close();calls=[]
   def interrupted(command,**kwargs):
    calls.append(command);store=Store(state/'state.sqlite')
    store.set_state('inventorySweep:partial:domains:completed',{'status':'VALIDATED'})
    store.set_state('officialSite:completed',{'status':'VALIDATED','url':'https://owned.example/'})
    store.close();return SimpleNamespace(returncode=1,stdout='')
   with self.assertRaisesRegex(RuntimeError,'INVENTORY_BATCH_FAILED:1'):
    drive(tmp,state,'partial',batches=3,execute=interrupted)
   self.assertEqual(len(calls),1)
   fresh=Path(tmp)/'restore';restore(state/'checkpoints/partial-domains.tar.gz',fresh)
   store=Store(fresh/'state.sqlite')
   self.assertEqual(store.state('inventorySweep:partial:domains:inventory'),['completed','pending'])
   self.assertEqual(store.state('inventorySweep:partial:domains:completed'),{'status':'VALIDATED'})
   self.assertIsNone(store.state('inventorySweep:partial:domains:pending'))
   self.assertEqual(store.state('officialSite:completed')['url'],'https://owned.example/')
   self.assertIsNone(store.state('inventoryRunner:partial:domains'))
   store.close()

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

 def test_stop_during_ir_interleave_does_not_start_another_domain_batch(self):
  with tempfile.TemporaryDirectory() as tmp:
   state=Path(tmp)/'state';store=Store(state/'state.sqlite');store.close();lanes=[]
   def execute(command,**kwargs):
    lane=command[command.index('--inventory-lane')+1];lanes.append(lane)
    if lane=='ir':(state/'stop-inventory').touch()
    return SimpleNamespace(returncode=0,stdout=json.dumps({'requests':2,'stopReason':'BATCH_COMPLETED'}))
   with contextlib.redirect_stdout(io.StringIO()):drive(tmp,state,'mixed-stop',batches=5,ir_every=1,execute=execute)
   self.assertEqual(lanes,['domains','ir'])
