"""DNS scope tests with synthetic data only, no network or credentials."""
import copy
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from prepare import Blocked
from domain_auth import DOMAIN, Cloudflare, DomainBrevo, expected_records, plan, protected_snapshot, run


def config():
    return {"domain":DOMAIN,"verified":False,"authenticated":False,"dns_records":{
        "brevo_code":{"type":"TXT","host_name":"@","value":"brevo-code:"+"a"*32},
        "dkim1Record":{"type":"CNAME","host_name":"brevo1._domainkey","value":"b1.synthetic.dkim.brevo.com"},
        "dkim2Record":{"type":"CNAME","host_name":"brevo2._domainkey.","value":"b2.synthetic.dkim.brevo.com"},
        "dmarc_record":{"type":"TXT","host_name":"_dmarc","value":"v=DMARC1; p=reject"}}}


class DNS(unittest.TestCase):
    def test_only_brevo_code_and_dkim_are_extracted(self):
        expected=expected_records(config())
        self.assertEqual(len(expected),3)
        self.assertTrue(all(r["name"]==DOMAIN or "._domainkey." in r["name"] for r in expected))
        self.assertFalse(any("_dmarc" in r["name"] for r in expected))

    def test_same_apex_other_txt_mx_and_website_are_preserved(self):
        records=[{"id":"1","type":"TXT","name":DOMAIN,"content":"v=spf1 -all"},
                 {"id":"2","type":"MX","name":DOMAIN,"content":"mail.synthetic.invalid"},
                 {"id":"3","type":"A","name":DOMAIN,"content":"192.0.2.1"},
                 {"id":"4","type":"CNAME","name":"research."+DOMAIN,"content":"synthetic.pages.dev"}]
        before=copy.deepcopy(records)
        self.assertEqual([r["action"] for r in plan(records,expected_records(config()))],["create"]*3)
        self.assertEqual(records,before)

    def test_conflicting_code_or_dkim_blocks_entire_plan(self):
        for record in ({"id":"1","type":"TXT","name":DOMAIN,"content":"brevo-code:"+"b"*32},
                       {"id":"2","type":"TXT","name":"brevo1._domainkey."+DOMAIN,"content":"old key"},
                       {"id":"3","type":"NS","name":"_domainkey."+DOMAIN,"content":"other.synthetic.invalid"}):
            with self.assertRaises(Blocked):plan([record],expected_records(config()))

    def test_existing_matching_cname_only_needs_proxy_toggle(self):
        expected=expected_records(config())
        records=[{**r,"id":str(i),"proxied":r["type"]=="CNAME"} for i,r in enumerate(expected)]
        actions=plan(records,expected)
        self.assertEqual(sum(a["action"]=="dns_only" for a in actions),2)
        for r in records:r["proxied"]=False
        self.assertTrue(all(a["action"]=="unchanged" for a in plan(records,expected)))

    def test_foreign_domain_and_host_are_blocked(self):
        for altered in ("other.invalid","research."+DOMAIN):
            c=config()
            if altered=="other.invalid":c["domain"]=altered
            else:c["dns_records"]["dkim1Record"]["host_name"]=altered
            with self.assertRaises(Blocked):expected_records(c)

    def test_protected_snapshot_detects_mx_ttl_content_or_deletion(self):
        records=[{"id":"1","type":"MX","name":DOMAIN,"content":"mail.synthetic.invalid","ttl":300},
                 {"id":"2","type":"CNAME","name":"brevo1._domainkey."+DOMAIN,"content":"target"}]
        before=protected_snapshot(records,{"2"})
        for field,value in (("content","changed.synthetic.invalid"),("ttl",600)):
            changed=copy.deepcopy(records);changed[0][field]=value
            self.assertNotEqual(protected_snapshot(changed,{"2"}),before)
        self.assertNotEqual(protected_snapshot(records[1:],{"2"}),before)

    def test_brevo_sender_email_contact_and_other_domain_routes_denied(self):
        with patch.dict(os.environ,{"BREVO_API_KEY":"synthetic-only"}):b=DomainBrevo()
        for method,path in (("POST","/smtp/email"),("PUT","/contacts/1"),("POST","/senders"),
                            ("PUT","/senders/domains/other.invalid/authenticate")):
            with self.assertRaises(Blocked):b.call(method,path)

    def test_cf_no_deletion_no_mx_creation_no_content_overwrite(self):
        cf=Cloudflare("synthetic","not-real");cf.zone="a"*32;cf.expected=expected_records(config())
        root="/zones/"+cf.zone+"/dns_records"
        for method,path,body in (("DELETE",root+"/"+"b"*32,None),
                 ("PATCH",root+"/"+"b"*32,{"content":"wrong"}),
                 ("PATCH",root+"/"+"b"*32,{"proxied":False}),
                 ("POST",root,{"type":"MX","name":DOMAIN,"content":"wrong"})):
            with self.assertRaises(Blocked):cf.call(method,path,body)

    def test_apply_without_explicit_authorization_blocks_before_network(self):
        with self.assertRaises(Blocked):run("apply",False)


if __name__=="__main__":unittest.main()
