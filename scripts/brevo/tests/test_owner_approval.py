"""Synthetic authenticated dispatches; no real approval, key, API or mail."""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import test_safety as safety
from campaigns import Process, version
from newsletter_actions import validate_ledger
from newsletter_actions import run as execute
from newsletter_approval import authorize_dispatch, reserve_approval
from test_newsletter_actions import ENV, MemoryLedger
from prepare import Blocked


class OwnerApproval(unittest.TestCase):
    def setUp(self):
        safety.Safety.setUp(self)
        self.policy = {"mode":"owner-dispatch-v1", "repository":"synthetic/repo",
            "default_branch":"main", "owner":{"login":"owner", "id":7}}
        self.fingerprint = version(self.fake.campaign)
        self.event_path = self.directory / "event.json"
        self.env = {**ENV, "GITHUB_SHA":"a"*40, "GITHUB_RUN_ATTEMPT":"1", "GITHUB_ACTOR":"owner",
            "GITHUB_ACTOR_ID":"7", "GITHUB_TRIGGERING_ACTOR":"owner", "BREVO_AUTHORIZE_SEND":"true",
            "BREVO_APPROVAL_SHA256":"b"*64, "GITHUB_EVENT_PATH":str(self.event_path)}
        self.event = {"sender":{"login":"owner", "id":7}, "repository":{"full_name":"synthetic/repo"},
            "inputs":{"operation":"test", "campaign_id":"8", "expected_version":self.fingerprint,
                "approval_sha256":"b"*64, "authorize_send":"true"}}
        self.run = {"id":12, "event":"workflow_dispatch", "path":".github/workflows/brevo-newsletter.yml",
            "head_branch":"main", "head_sha":"a"*40, "run_attempt":1, "status":"in_progress",
            "created_at":dt.datetime.now(dt.timezone.utc).isoformat(),
            "actor":{"login":"owner", "id":7}, "triggering_actor":{"login":"owner", "id":7}}

    tearDown = safety.Safety.tearDown

    def authorize(self, operation="test"):
        self.event_path.write_text(json.dumps(self.event))
        current_run = self.run
        class Github:
            def call(self, method, path):
                assert (method,path) == ("GET","/actions/runs/12")
                return copy.deepcopy(current_run)
        with patch.dict(os.environ,self.env), patch("newsletter_approval.load_policy",return_value=self.policy):
            return authorize_dispatch(Github(),operation,8,self.fingerprint)

    def process(self, ledger):
        with patch.dict(os.environ,self.env):
            return Process(self.fake,{**self.cfg,"ledger_hmac_key":"11"*32},ledger=ledger)

    def test_owner_dispatch_binds_action_campaign_version_evidence_and_actual_run(self):
        receipt = self.authorize()
        self.assertEqual(receipt,{"run_id":12,"actor_id":7,"operation":"test",
            "version":self.fingerprint,"approval_sha256":"b"*64})
        self.event["inputs"]["authorize_send"] = True
        self.assertEqual(self.authorize(),receipt)
        self.event["inputs"]["operation"] = "send"
        self.assertEqual(self.authorize("send")["operation"],"send")

    def test_wrong_actor_rerun_branch_event_and_missing_reference_block(self):
        for key,value in (("GITHUB_ACTOR","other"),("GITHUB_ACTOR_ID","8"),
                ("GITHUB_TRIGGERING_ACTOR","other"),("GITHUB_RUN_ATTEMPT","2"),
                ("GITHUB_REF","refs/heads/feature"),("GITHUB_EVENT_NAME","push"),
                ("GITHUB_REPOSITORY","other/repo"),("BREVO_AUTHORIZE_SEND","false"),
                ("BREVO_APPROVAL_SHA256",""),("BREVO_APPROVAL_SHA256","alpha@example.invalid")):
            with self.subTest(key=key,value=value):
                original=self.env[key];self.env[key]=value
                with self.assertRaises(Blocked): self.authorize()
                self.env[key]=original

    def test_dispatch_inputs_sender_and_evidence_cannot_be_substituted(self):
        for key,value in (("operation","send"),("campaign_id","9"),("expected_version","c"*64),
                ("approval_sha256","d"*64),("authorize_send",False),("authorize_send",1)):
            with self.subTest(key=key):
                original=self.event["inputs"][key];self.event["inputs"][key]=value
                with self.assertRaises(Blocked): self.authorize()
                self.event["inputs"][key]=original
        self.event["sender"]["id"]=8
        with self.assertRaises(Blocked): self.authorize()

    def test_actual_github_metadata_and_freshness_are_independently_checked(self):
        for key,value in (("event","push"),("head_branch","feature"),("head_sha","c"*40),
                ("path",".github/workflows/brevo-admin.yml"),("run_attempt",2),("id",13),
                ("status","completed"),("actor",{"login":"owner","id":8}),
                ("triggering_actor",{"login":"other","id":7}),
                ("created_at","2000-01-01T00:00:00Z"),("created_at","2999-01-01T00:00:00Z")):
            with self.subTest(key=key):
                original=self.run[key];self.run[key]=value
                with self.assertRaises(Blocked): self.authorize()
                self.run[key]=original

    def test_approval_receipt_is_persistent_and_cannot_be_reused_for_production(self):
        ledger=MemoryLedger();p=self.process(ledger);receipt=self.authorize()
        reserve_approval(p,8,receipt)
        p.test(8,True,expected_version=self.fingerprint)
        restarted=self.process(ledger)
        with self.assertRaises(Blocked): reserve_approval(restarted,8,{**receipt,"run_id":13,"operation":"send"})
        self.assertEqual(ledger.state["campaigns"]["8"]["approvals"]["12"]["operation"],"test")
        serialized=json.dumps(ledger.state)
        for address in self.cfg["test_addresses"].values(): self.assertNotIn(address,serialized)
        self.assertFalse(any(path.endswith("sendNow") for _,path,_ in self.fake.calls))

    def test_failed_approval_reservation_blocks_send_and_does_not_reset_existing_tests(self):
        ledger=MemoryLedger();p=self.process(ledger);receipt=self.authorize();ledger.fail=True
        with self.assertRaises(Blocked): reserve_approval(p,8,receipt)
        self.assertFalse(any(method=="POST" for method,_,_ in self.fake.calls))

    def test_version_drift_is_rejected_inside_test_before_reservation_or_api(self):
        ledger=MemoryLedger();p=self.process(ledger)
        self.fake.campaign["subject"]="Changed since authorized dispatch"
        with self.assertRaises(Blocked): p.test(8,True,expected_version=self.fingerprint)
        self.assertEqual(ledger.state["campaigns"]["8"].get("tests",{}),{})
        self.assertFalse(any(method=="POST" for method,_,_ in self.fake.calls))

    def test_ledger_accepts_legacy_records_but_rejects_personal_data_in_approval(self):
        state=MemoryLedger().state;validate_ledger(state)
        state["campaigns"]["8"]["approvals"]={"12":{
            "operation":"test","version":"a"*64,"approval_sha256":"b"*64,"actor_id":7}}
        validate_ledger(state)
        state["campaigns"]["8"]["approvals"]["12"]["email"]="alpha@example.invalid"
        with self.assertRaises(Blocked): validate_ledger(state)

    def test_dry_run_flag_must_match_the_authenticated_dispatch(self):
        self.event["inputs"]["dry_run"] = True
        with self.assertRaises(Blocked): self.authorize()
        self.env["BREVO_DRY_RUN"] = "true"
        self.assertEqual(self.authorize()["operation"],"test")

    def test_dry_run_executes_real_authorization_path_but_never_reserves_or_posts(self):
        self.env.update({"BREVO_DRY_RUN":"true", "BREVO_NEWSLETTER_OPERATION":"test",
            "BREVO_CAMPAIGN_ID":"8", "BREVO_EXPECTED_VERSION":self.fingerprint,
            "BREVO_NEWSLETTER_CONFIG":json.dumps({**self.cfg,"ledger_hmac_key":"11"*32})})
        self.event["inputs"]["dry_run"] = True
        self.event_path.write_text(json.dumps(self.event))
        ledger=MemoryLedger();before=copy.deepcopy(ledger.state);current_run=self.run
        class Github:
            def call(self, method, path):
                assert (method,path) == ("GET","/actions/runs/12")
                return current_run
        with patch.dict(os.environ,self.env), patch("newsletter_approval.load_policy",return_value=self.policy), \
                patch("newsletter_actions.Github",return_value=Github()), \
                patch("newsletter_actions.Ledger",return_value=ledger), \
                patch("newsletter_actions.NewsletterClient",return_value=self.fake) as client:
            result=execute()
        client.assert_called_once_with("check",8)
        self.assertTrue(result["approval_valid"])
        self.assertTrue(result["dry_run"])
        self.assertEqual(result["emails_sent"],0)
        self.assertEqual(ledger.state,before)
        self.assertFalse(any(method!="GET" for method,_,_ in self.fake.calls))


if __name__=="__main__": unittest.main()
