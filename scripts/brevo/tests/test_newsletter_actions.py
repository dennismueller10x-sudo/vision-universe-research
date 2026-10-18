"""No live API or secrets: persistent reservations and reviewed Actions runtime."""
import copy
import json
import os
import unittest
from unittest.mock import patch
import test_safety as safety
from campaigns import Process, digest
from newsletter_actions import Ledger, NewsletterClient, require_review, trusted_newsletter, validate_ledger
from prepare import Blocked

ENV = {"GITHUB_ACTIONS":"true","GITHUB_REF":"refs/heads/main", "BREVO_DEFAULT_BRANCH":"main",
       "GITHUB_EVENT_NAME":"workflow_dispatch", "GITHUB_REPOSITORY":"synthetic/repo",
       "GITHUB_WORKFLOW_REF":"synthetic/repo/.github/workflows/brevo-newsletter.yml@refs/heads/main",
       "GITHUB_RUN_ID":"12"}


class MemoryLedger:
    def __init__(self):
        self.state={"drafts":{},"campaigns":{"8":{"sender_id":1,
            "recipients":{"listIds":[4],"exclusionListIds":[6]}}}}
        self.fail=False
    def load(self): return copy.deepcopy(self.state)
    def save(self,state):
        validate_ledger(state)
        if self.fail: raise Blocked("Synthetic CAS failure")
        self.state=copy.deepcopy(state)


class NewsletterActions(unittest.TestCase):
    setUp=safety.Safety.setUp
    tearDown=safety.Safety.tearDown

    def process(self,ledger):
        with patch.dict(os.environ,ENV):
            return Process(self.fake,{**self.cfg,"ledger_hmac_key":"11"*32},ledger=ledger)

    def test_other_workflows_and_events_cannot_use_ledger(self):
        for key,value in (("GITHUB_WORKFLOW_REF","synthetic/repo/.github/workflows/brevo-admin.yml@refs/heads/main"),
                          ("GITHUB_REF","refs/heads/feature"),("GITHUB_EVENT_NAME","push")):
            with patch.dict(os.environ,{**ENV,key:value}):
                self.assertFalse(trusted_newsletter())
                with self.assertRaises(Blocked): Process(self.fake,self.cfg,ledger=MemoryLedger())

    def test_failed_durable_save_blocks_any_send_call(self):
        ledger=MemoryLedger();ledger.fail=True
        with self.assertRaises(Blocked): self.process(ledger).test(8,True)
        self.assertFalse(any(m=="POST" for m,_,_ in self.fake.calls))

    def test_failed_test_persists_reservation_across_runner_restarts(self):
        ledger=MemoryLedger();self.fake.fail_test=True
        with self.assertRaises(Blocked): self.process(ledger).test(8,True)
        self.fake.fail_test=False
        with self.assertRaises(Blocked): self.process(ledger).test(8,True)
        with self.assertRaises(Blocked): self.process(ledger).check(8)
        self.assertEqual(sum(p.endswith("sendTest") for _,p,_ in self.fake.calls),1)

    def test_successful_test_and_production_cannot_repeat_after_restart(self):
        ledger=MemoryLedger();self.process(ledger).test(8,True)
        with self.assertRaises(Blocked): self.process(ledger).test(8,True)
        check=self.process(ledger).check(8)
        self.process(ledger).send(8,{**check,"explicit_owner_approval":True,"approval_reference":"Synthetic"},True)
        with self.assertRaises(Blocked): self.process(ledger).send(8,{},True)
        self.assertEqual(sum(p.endswith("sendNow") for _,p,_ in self.fake.calls),1)
        serialized=json.dumps(ledger.state)
        for email in self.cfg["test_addresses"].values(): self.assertNotIn(email,serialized)
        self.assertNotIn(digest(list(self.cfg["test_addresses"].values())),serialized)

    def test_changed_content_requires_new_test_and_invalidates_release(self):
        ledger=MemoryLedger();self.process(ledger).test(8,True)
        self.fake.campaign["subject"]="Changed"
        with self.assertRaises(Blocked): self.process(ledger).check(8)
        self.process(ledger).test(8,True)
        self.assertTrue(self.process(ledger).check(8)["requires_owner_approval"])

    def test_public_register_rejects_contact_content_and_malformed_schema(self):
        for state in ({"drafts":{},"campaigns":{},"email":"alpha@example.invalid"},
                      {"drafts":[],"campaigns":{}},
                      {"drafts":{},"campaigns":{"8":{"sender_id":1,"recipients":{"emailTo":[]}}}}):
            with self.assertRaises(Blocked): validate_ledger(state)

    def test_cas_error_prevents_local_sha_advance(self):
        class Github:
            def call(self,*a,**k): raise Blocked("Synthetic conflict")
        ledger=Ledger(Github());ledger.sha="previous"
        with self.assertRaises(Blocked): ledger.save({"drafts":{},"campaigns":{}})
        self.assertEqual(ledger.sha,"previous")

    def test_required_reviewer_and_actual_run_approval(self):
        class Github:
            def __init__(self): self.approved=False;self.rule=True
            def call(self,method,path):
                if path.startswith("/environments/"):
                    return {"protection_rules":[{"type":"required_reviewers","reviewers":[
                        {"type":"User","reviewer":{"login":"owner"}}]}] if self.rule else []}
                return [{"state":"approved","user":{"login":"owner" if self.approved else "other"},
                         "environments":[{"name":"brevo-newsletter-review"}]}]
        github=Github()
        with patch.dict(os.environ,ENV):
            with self.assertRaises(Blocked): require_review(github)
            github.approved=True;require_review(github)
            github.rule=False
            with self.assertRaises(Blocked): require_review(github)

    def test_operation_scoped_client_blocks_cross_operation_routes(self):
        for operation in ("check","draft","test","send"):
            with patch.dict(os.environ,{"BREVO_API_KEY":"synthetic-only"}): client=NewsletterClient(operation,8)
            for method,path in (("POST","/smtp/email"),("PUT","/contacts/alpha%40example.invalid"),
                                ("DELETE","/emailCampaigns/8"),("POST","/emailCampaigns/9/sendNow")):
                with self.assertRaises(Blocked): client.call(method,path)
            if operation!="test":
                with self.assertRaises(Blocked): client.call("POST","/emailCampaigns/8/sendTest")
            if operation!="send":
                with self.assertRaises(Blocked): client.call("POST","/emailCampaigns/8/sendNow")


if __name__=="__main__": unittest.main()
