"""Synthetic internal previews; no real API, recipients, secrets or mail."""
import copy
import json
import io
import os
import unittest
import urllib.error
from unittest.mock import patch
import test_safety as safety
from campaigns import Process, version
from client import Client
from newsletter_actions import NewsletterClient, validate_ledger
from newsletter_preview import preview, clone_body
from prepare import Blocked
from test_newsletter_actions import ENV, MemoryLedger


class PreviewFake(safety.Fake):
    def __init__(self):
        super().__init__()
        self.clone=None
        self.mutate=None
        self.mutate_after_send=False
        self.listed=[]

    def call(self,method,path,body=None,**kwargs):
        if method=="GET" and path.startswith("/emailCampaigns?"):
            self.calls.append((method,path,None));return {"campaigns":copy.deepcopy(self.listed),"count":len(self.listed)}
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

    def test_clone_does_not_round_trip_get_only_or_unset_optional_fields(self):
        source={**self.fake.campaign,"replyTo":"","toField":"","header":"[DEFAULT_HEADER]",
                "footer":"[DEFAULT_FOOTER]","recurring":False,"providerOnly":True}
        result=clone_body(source,{"listIds":[3],"exclusionListIds":[1,2]})
        self.assertEqual(set(result),{"name","type","subject","previewText","htmlContent","sender","recipients"})
        self.assertEqual(result["sender"],source["sender"])

    def recovery(self,run_change=None):
        self.fake.fail_draft=True
        with self.assertRaises(Blocked): self.execute()
        self.fake.fail_draft=False
        fingerprint=version(self.fake.campaign)
        self.ledger.state["campaigns"]["8"]["approvals"]={"12":{
            "operation":"preview","version":fingerprint,"approval_sha256":"b"*64,"actor_id":7}}
        incident={"campaign_id":8,"version":fingerprint,"failed_run_id":12,
                  "head_sha":"c"*40,"approval_sha256":"b"*64,"owner_id":7}
        run={"id":12,"status":"completed","conclusion":"failure","event":"workflow_dispatch",
            "head_branch":"main","head_sha":"c"*40,"run_attempt":1,
            "path":".github/workflows/brevo-newsletter.yml","actor":{"id":7},"triggering_actor":{"id":7}}
        run.update(run_change or {})
        class Github:
            def call(self,method,path):
                assert (method,path)==("GET","/actions/runs/12")
                return run
        return fingerprint,incident,Github()

    def test_reviewed_incident_reconciles_absence_then_one_create_without_reset(self):
        fingerprint,incident,github=self.recovery()
        with patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            result=preview(self.process(),8,fingerprint,True,github)
            with self.assertRaises(Blocked): preview(self.process(),8,fingerprint,True,github)
        state=self.ledger.state["campaigns"]["8"]
        self.assertEqual(state["creation_recoveries"],{fingerprint:12})
        self.assertEqual(state["tests"][fingerprint]["state"],"api_accepted")
        self.assertIn("12",state["approvals"])
        self.assertFalse(result["production_sent"])
        self.assertEqual(sum(p.endswith("sendNow") for _,p,_ in self.fake.calls),1)

    def test_existing_unique_matching_draft_is_adopted_without_duplicate_creation(self):
        fingerprint,incident,github=self.recovery()
        self.fake.clone={**clone_body(self.fake.campaign,{"listIds":[3],"exclusionListIds":[1,2]}),"id":9,"status":"draft"}
        self.fake.listed=[self.fake.clone]
        with patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            preview(self.process(),8,fingerprint,True,github)
        self.assertEqual(sum(m=="POST" and p=="/emailCampaigns" for m,p,_ in self.fake.calls),1) # original rejected call only

    def test_wrong_run_or_possible_send_cannot_be_recovered(self):
        fingerprint,incident,github=self.recovery({"conclusion":"success"})
        with patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            with self.assertRaises(Blocked): preview(self.process(),8,fingerprint,True,github)
        self.ledger.state["campaigns"]["8"]["tests"][fingerprint]["preview_id"]=9
        with patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            with self.assertRaises(Blocked): preview(self.process(),8,fingerprint,True,github)
        self.assertFalse(any(p.endswith("sendNow") for _,p,_ in self.fake.calls))

    def test_second_failed_corrective_creation_cannot_repeat(self):
        fingerprint,incident,github=self.recovery()
        self.fake.fail_draft=True
        with patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            with self.assertRaises(Blocked): preview(self.process(),8,fingerprint,True,github)
            self.fake.fail_draft=False
            with self.assertRaises(Blocked): preview(self.process(),8,fingerprint,True,github)
        self.assertEqual(sum(m=="POST" and p=="/emailCampaigns" for m,p,_ in self.fake.calls),2)
        self.assertFalse(any(p.endswith("sendNow") for _,p,_ in self.fake.calls))

    def test_http_diagnostic_emits_only_known_code_and_fixed_parameter_name(self):
        raw=json.dumps({"code":"invalid_parameter","message":"replyTo invalid: alpha@example.invalid synthetic-only"}).encode()
        error=urllib.error.HTTPError("https://example.invalid/private",400,"private",{},io.BytesIO(raw))
        with patch.dict(os.environ,{"BREVO_API_KEY":"synthetic-only"}), \
                patch("client.urllib.request.OpenerDirector.open",side_effect=error):
            with self.assertRaises(Blocked) as caught: Client().call("GET","/account")
        self.assertIn("Code invalid_parameter",str(caught.exception))
        self.assertIn("Parameter replyTo",str(caught.exception))
        for private in ("alpha@example.invalid","synthetic-only","https://"):
            self.assertNotIn(private,str(caught.exception))

    def test_collection_read_never_sets_creation_id(self):
        with patch.dict(os.environ,{"BREVO_API_KEY":"synthetic-only"}): client=NewsletterClient("preview",8)
        client.preview_recovery=True
        with patch.object(Client,"call",return_value={"campaigns":[],"count":0}):
            self.assertEqual(client.call("GET","/emailCampaigns?type=classic&limit=50&offset=0")["count"],0)
        self.assertIsNone(client.preview_id)
        self.assertEqual(client.campaign_id,8)

    def test_recovery_through_real_scoped_client_reads_creates_and_sends_only_copy(self):
        from urllib.parse import unquote
        fingerprint,incident,github=self.recovery()
        fake=self.fake
        def transport(method,path,body=None,missing=False):
            if method=="GET" and path.startswith("/contacts/lists?"):
                return {"lists":[{"name":n,"id":i} for n,i in fake.lists.items()]}
            if method=="GET" and path.startswith("/contacts/") and "%40" in path:
                return fake.contact(unquote(path[len("/contacts/"):]))
            return fake.call(method,path,body,missing=missing)
        with patch.dict(os.environ,{**ENV,"BREVO_API_KEY":"synthetic-only"}), \
                patch.object(Client,"call",side_effect=transport), \
                patch("newsletter_preview.Path.read_text",return_value=json.dumps(incident)):
            client=NewsletterClient("preview",8)
            process=Process(client,{**self.cfg,"ledger_hmac_key":"11"*32},ledger=self.ledger)
            result=preview(process,8,fingerprint,True,github)
        self.assertEqual(client.campaign_id,8)
        self.assertEqual(client.preview_id,9)
        self.assertEqual(result["preview_campaign_id"],9)
        self.assertFalse(result["production_sent"])
        self.assertEqual(sum(p=="/emailCampaigns/9/sendNow" for _,p,_ in fake.calls),1)
        self.assertFalse(any(p=="/emailCampaigns/8/sendNow" for _,p,_ in fake.calls))


if __name__=="__main__": unittest.main()
