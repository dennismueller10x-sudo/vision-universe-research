"""Synthetic-only membership, suppression and repeat protection."""
import copy
import datetime as dt
import json
import os
import unittest
from unittest.mock import patch
import test_safety
from client import Client
from internal_membership import MembershipClient, add_membership
from prepare import Blocked
import test_preview as previews


class Fake(test_safety.Fake):
    def call(self, method, path, body=None, **kwargs):
        if method == "POST" and path == "/contacts/lists/4/contacts/add":
            self.calls.append((method, path, copy.deepcopy(body)))
            for contact in self.contacts.values():
                if contact["id"] in body["ids"]:
                    contact["listIds"] = sorted(set(contact["listIds"]) | {4})
            return {}
        return super().call(method, path, body, **kwargs)


class Membership(unittest.TestCase):
    def setUp(self):
        self.fake = Fake()
        self.fake.lists = dict(zip(test_safety.LISTS, (4, 5, 6)))
        self.config = {"test_addresses": {"test_1": "one@example.invalid", "test_2": "two@example.invalid"},
                       "test_addresses_confirmed": True}
        for i, address in enumerate(self.config["test_addresses"].values(), 1):
            self.fake.contacts[address] = {"id": i, "email": address, "listIds": [6],
                "emailBlacklisted": False,
                "attributes": {"VU_INTERNAL_TEST": True, "VU_EMAIL_CONSENT": "subscribed", "VU_BUYER": True}}
        self.env = {"BREVO_AUTOMATIONS_REVIEWED_AT": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "BREVO_IMPORT_TRIGGERS_EXCLUDED": "true", "BREVO_AUTOMATION_EVIDENCE_SHA256": "a"*64}

    def test_additive_readback_repeat_no_mail_and_no_personal_output(self):
        baseline = copy.deepcopy(self.fake.contacts)
        with patch.dict(os.environ, self.env):
            result = add_membership(self.fake, self.config, True)
            again = add_membership(self.fake, self.config, True)
        self.assertEqual(result["added"], 2)
        self.assertEqual(again["added"], 0)
        self.assertEqual(sum(m == "POST" for m, _, _ in self.fake.calls), 1)
        self.assertEqual(result["emails_sent"], 0)
        for address, contact in self.fake.contacts.items():
            self.assertEqual(contact, {**baseline[address], "listIds": [4, 6]})
            self.assertNotIn(address, json.dumps(result))

    def test_preview_no_write_missing_automation_blocks_write(self):
        self.assertEqual(add_membership(self.fake, self.config)["would_add"], 2)
        with patch.dict(os.environ, {"BREVO_IMPORT_TRIGGERS_EXCLUDED": "false"}):
            with self.assertRaises(Blocked): add_membership(self.fake, self.config, True)
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def test_withdrawn_unclear_or_list_unsubscribed_contact_is_held(self):
        for change in ({"listUnsubscribed": [4]},
                       {"attributes": {"VU_INTERNAL_TEST": True, "VU_EMAIL_CONSENT": "withdrawn"}},
                       {"attributes": {"VU_INTERNAL_TEST": True}}, {"emailBlacklisted": None}):
            self.setUp()
            first = next(iter(self.fake.contacts.values()))
            first.update(change)
            with patch.dict(os.environ, self.env): result = add_membership(self.fake, self.config, True)
            self.assertEqual(result["held"], 1)
            self.assertEqual(first["listIds"], [6])

    def test_global_block_or_missing_test_membership_prevents_any_write(self):
        for change in ({"emailBlacklisted": True}, {"listIds": []}):
            self.setUp()
            next(iter(self.fake.contacts.values())).update(change)
            with patch.dict(os.environ, self.env):
                with self.assertRaises(Blocked): add_membership(self.fake, self.config, True)
            self.assertFalse(any(m == "POST" for m, _, _ in self.fake.calls))

    def test_transport_blocks_send_removal_contact_create_and_status_updates(self):
        with patch.dict(os.environ, {"BREVO_API_KEY": "synthetic"}): client = MembershipClient()
        with patch.object(Client, "call", return_value={}) as api:
            for method, path, body in (("POST", "/emailCampaigns/11/sendNow", None),
                    ("POST", "/contacts", {"email": "one@example.invalid"}),
                    ("PUT", "/contacts/1", {"emailBlacklisted": False}),
                    ("POST", "/contacts/lists/6/contacts/remove", {"ids": [1]}),
                    ("POST", "/contacts/lists/5/contacts/add", {"ids": [1]})):
                with self.assertRaises(Blocked): client.call(method, path, body)
            api.assert_not_called()


    def test_overlap_in_main_does_not_block_preview_or_remove_regular_exclusion(self):
        case = previews.Preview()
        case.setUp()
        self.addCleanup(case.tearDown)
        for contact in case.fake.contacts.values(): contact["listIds"] = [1, 3]
        result = case.execute()
        self.assertEqual(result["recipient_count"], 2)
        self.assertEqual(case.fake.clone["recipients"], {"listIds": [3], "exclusionListIds": [2]})
        self.assertEqual(case.fake.campaign["recipients"]["exclusionLists"], [3])
