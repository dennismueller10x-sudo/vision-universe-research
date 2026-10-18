"""Synthetic internal previews; no real API, recipients, secrets or mail."""
import copy
import json
import os
import unittest
from unittest.mock import patch
import test_safety as safety
from campaigns import Process, version
from client import Client
from newsletter_actions import NewsletterClient, validate_ledger
from newsletter_preview import preview
from prepare import Blocked
from test_newsletter_actions import ENV, MemoryLedger


class PreviewFake(safety.Fake):
    def __init__(self):
        super().__init__()
        self.clone=None
        self.mutate=None
        self.mutate_after_send=False

    def call(self,method,path,body=None,**kwargs):
        if method=="POST" and path=="/emailCampaigns":
            self.calls.append((method,path,copy.deepcopy(body)))
            if self.fail_draft: raise Blocked("Synthetic timeout")
            self.clone={**copy.deepcopy(body),"id":9,"status":"draft"}
            if self.mutate: self.mutate(self.clone)
            return {"id":9}
        if method=="GET" and path=="/emailCampaigns/9":
            self.calls.append((method,path,None));return copy.deepcopy(self.clone)
        result=super().call(method,path,body,**kwargs)
        if path=="/emailCampaigns/9/sendNow" and self.mutate_after_send:
            self.campaign["subject"]="Concurrent change"
        return result


class Preview(unittest.TestCase):
    def setUp(self):
        safety.Safety.setUp(self)
        self.fake=PreviewFake()
        self.fake.campaign.update(name="Synthetic",previewText="Synthetic preview")
        self.fake.campaign["sender"]["name"]="Vision Universe | Aktien & Börse 📈"
        for address in self.cfg["test_addresses"].values():
            self.fake.contacts[address]={"email":address,"attributes":{"VU_INTERNAL_TEST":True},
                "emailBlacklisted":False,"listIds":[3]}
        self.ledger=MemoryLedger()

    tearDown=safety.Safety.tearDown

    def process(self):
        with patch.dict(os.environ,ENV):
            return Process(self.fake,{**self.cfg,"ledger_hmac_key":"11"*32},ledger=self.ledger)

    def execute(self,expected=None):
        return preview(self.process(),8,expected or version(self.fake.campaign),True)

    def test_only_separate_campaign_sends_once_same_content_main_stays_draft(self):
        before=copy.deepcopy(self.fake.campaign);result=self.execute()
        self.assertEqual(self.fake.campaign,before)
        self.assertFalse(result["production_sent"])
        self.assertEqual(result["recipient_count"],2)
        self.assertEqual(self.fake.clone["recipients"],{"listIds":[3],"exclusionListIds":[1,2]})
        for key in ("subject","sender","htmlContent","previewText"):
            self.assertEqual(self.fake.clone[key],before[key])
        self.assertEqual([p for m,p,_ in self.fake.calls if m=="POST"],
                         ["/emailCampaigns","/emailCampaigns/9/sendNow"])
        self.assertEqual(self.process().check(8)["version"],result["version"])
        with self.assertRaises(Blocked): self.execute()
        self.assertEqual(sum(p.endswith("sendNow") for _,p,_ in self.fake.calls),1)
        for address in self.cfg["test_addresses"].values(): self.assertNotIn(address,json.dumps(self.ledger.state))

    def test_extra_missing_suppressed_or_misclassified_recipient_blocks_creation(self):
        baseline=copy.deepcopy(self.fake.contacts)
        variants=[{**baseline,"other@example.invalid":{"email":"other@example.invalid","listIds":[3]}},
                  dict(list(baseline.items())[:1])]
        for change in ({"emailBlacklisted":True},{"emailBlacklisted":None},{"listIds":[2,3]},
                       {"attributes":{"VU_INTERNAL_TEST":False}}):
            contacts=copy.deepcopy(baseline);next(iter(contacts.values())).update(change);variants.append(contacts)
        for contacts in variants:
            self.fake.contacts=contacts
            with self.assertRaises(Blocked): self.execute()
            self.assertFalse(any(m=="POST" for m,_,_ in self.fake.calls))

    def test_changed_clone_content_settings_or_audience_blocks_send(self):
        for field,value in (("subject","Changed"),("sender",{"id":1,"name":"Other"}),
                ("htmlContent","Changed"),("newProviderSetting",True),
                ("recipients",{"listIds":[1],"exclusionListIds":[3]}),
                ("scheduledAt","2099-01-01T00:00:00Z")):
            self.ledger=MemoryLedger();self.fake.calls=[]
            self.fake.mutate=lambda c,k=field,v=value:c.update({k:v})
            with self.assertRaises(Blocked): self.execute()
            self.assertFalse(any(p.endswith("sendNow") for _,p,_ in self.fake.calls))
            self.assertEqual(next(iter(self.ledger.state["campaigns"]["8"]["tests"].values()))["state"],"pending")

    def test_cas_failure_prevents_any_campaign_post(self):
        self.ledger.fail=True
        with self.assertRaises(Blocked): self.execute()
        self.assertFalse(any(m=="POST" for m,_,_ in self.fake.calls))

    def test_ambiguous_create_or_send_blocks_retry_and_release_after_restart(self):
        for failure in ("fail_draft","fail_send"):
            self.ledger=MemoryLedger();self.fake.calls=[];setattr(self.fake,failure,True)
            with self.assertRaises(Blocked): self.execute()
            setattr(self.fake,failure,False)
            with self.assertRaises(Blocked): self.execute()
            with self.assertRaises(Blocked): self.process().check(8)
            self.assertEqual(sum(m=="POST" and p=="/emailCampaigns" for m,p,_ in self.fake.calls),1)

    def test_source_changed_after_send_cannot_gain_main_release(self):
        self.fake.mutate_after_send=True
        with self.assertRaises(Blocked): self.execute()
        self.assertEqual(next(iter(self.ledger.state["campaigns"]["8"]["tests"].values()))["state"],"pending")
        with self.assertRaises(Blocked): self.process().check(8)

    def test_wrong_version_or_missing_authorization_blocks_posts(self):
        with self.assertRaises(Blocked): self.execute("a"*64)
        with self.assertRaises(Blocked): preview(self.process(),8,version(self.fake.campaign))
        self.assertFalse(any(m=="POST" for m,_,_ in self.fake.calls))

    def test_client_never_sends_source_or_unknown_id_or_transactional_mail(self):
        with patch.dict(os.environ,{"BREVO_API_KEY":"synthetic-only"}): client=NewsletterClient("preview",8)
        client.preview_recipients={"listIds":[3],"exclusionListIds":[1,2]}
        with patch.object(Client,"call",return_value={"id":9}) as api:
            for path in ("/emailCampaigns/8/sendNow","/emailCampaigns/9/sendNow","/smtp/email"):
                with self.assertRaises(Blocked): client.call("POST",path)
            with self.assertRaises(Blocked): client.call("POST","/emailCampaigns",{"type":"classic","recipients":{"listIds":[1]}})
            client.call("POST","/emailCampaigns",{"type":"classic","recipients":client.preview_recipients})
            with self.assertRaises(Blocked): client.call("POST","/emailCampaigns/8/sendNow")
            with self.assertRaises(Blocked): client.call("POST","/emailCampaigns/10/sendNow")
            client.call("POST","/emailCampaigns/9/sendNow")
            self.assertEqual(api.call_count,2)

    def test_register_rejects_source_id_and_personal_data(self):
        self.execute();state=copy.deepcopy(self.ledger.state)
        for change in ({"preview_id":8},{"preview_id":True},{"email":"alpha@example.invalid"}):
            altered=copy.deepcopy(state)
            next(iter(altered["campaigns"]["8"]["tests"].values())).update(change)
            with self.assertRaises(Blocked): validate_ledger(altered)


if __name__=="__main__": unittest.main()
