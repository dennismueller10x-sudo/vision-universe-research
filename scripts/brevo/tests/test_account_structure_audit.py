import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from account_structure_audit import EXPECTED_IDS,ReadOnlyStructure,label_check,label_context,summarize
from prepare import Blocked


class AccountStructure(unittest.TestCase):
    def test_label_variants_and_missing_or_different_label(self):
        self.assertEqual(label_check({"companyName":" RAM Consulting "}),"matches")
        self.assertEqual(label_check({"companyName":"RAMConsulting"}),"matches_spacing_variant")
        self.assertEqual(label_check({"companyName":"Different synthetic company"}),"differs")
        self.assertEqual(label_check({}),"field_unavailable")

    def test_legal_suffix_and_punctuation_do_not_establish_wrong_account(self):
        self.assertTrue(label_context({"companyName":"RAM-Consulting GmbH"})["expected_business_words_present"])
        self.assertTrue(label_context({"companyName":"Vision Universe"})["vu_brand_label_match"])
        self.assertFalse(label_context({"companyName":"Different company"})["expected_business_words_present"])

    def test_inventory_agrees_with_folder_and_detail_without_identity_output(self):
        lists=[{"id":i,"name":n,"folderId":2} for n,i in EXPECTED_IDS.items()]
        class Fake:
            def pages(self,path,key):return [{"id":2,"name":"Vision Universe"}] if key=="folders" else lists
            def call(self,method,path):
                if path=="/account":return {"companyName":"RAM Consulting","email":"synthetic@example.invalid","api_key":"PRIVATE-KEY"}
                if path=="/contacts/folders/2":return {"id":2,"name":"Vision Universe"}
                if "/contacts?" in path:return {"count":0,"contacts":[{"email":"PRIVATE-ADDRESS"}]}
                return next(x for x in lists if x["id"]==int(path.rsplit("/",1)[-1]))
        result=summarize(Fake())
        self.assertEqual(result["account_company_label_comparison"],"matches")
        self.assertTrue(all(x["folder_scoped_read_contains_list"] and x["list_detail_matches_inventory"] for x in result["vu_lists"]))
        for hidden in ("RAM Consulting","PRIVATE-","@"):
            self.assertNotIn(hidden,json.dumps(result))

    def test_mutations_sends_and_contact_identity_lookups_block_before_network(self):
        with patch.dict("os.environ",{"BREVO_API_KEY":"synthetic-only"}):
            c=ReadOnlyStructure()
            for method,path in (("POST","/contacts/lists"),("DELETE","/contacts/lists/4"),
                                ("POST","/smtp/email"),("GET","/contacts/synthetic%40example.invalid")):
                with self.assertRaises(Blocked):c.call(method,path)


if __name__=="__main__": unittest.main()
