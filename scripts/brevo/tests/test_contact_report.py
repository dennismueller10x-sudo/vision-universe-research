"""Aggregate-only diagnostics with synthetic contacts and no real API."""
import copy
import os
import unittest
from unittest.mock import patch
from client import Client
from contact_report import contact_report, read_contacts
from internal_membership import MembershipClient
from prepare import Blocked


class Fake:
    def __init__(self):
        self.rows = [
            {"id": 1, "email": "regular@example.invalid", "emailBlacklisted": False,
             "listIds": [4], "attributes": {"VU_EMAIL_CONSENT": "subscribed"}},
            {"id": 2, "email": "bounce@example.invalid", "emailBlacklisted": True,
             "listIds": [4], "attributes": {"VU_EMAIL_CONSENT": "subscribed"}},
            {"id": 3, "email": "internal@example.invalid", "emailBlacklisted": False,
             "listIds": [4, 6], "attributes": {"VU_EMAIL_CONSENT": "subscribed", "VU_INTERNAL_TEST": True}},
            {"id": 4, "email": "outside@example.invalid", "listIds": []}]

    def call(self, method, path):
        assert method == "GET"
        if path == "/emailCampaigns/11?statistics=globalStats":
            return {"status": "sent", "statistics": {"globalStats": {
                "sent": 2, "delivered": 1, "hardBounces": 1, "softBounces": 0,
                "email": "sensitive@example.invalid", "complaints": "not a count"}}}
        if path == "/contacts?limit=500&offset=0":
            return {"contacts": copy.deepcopy(self.rows), "count": len(self.rows)}
        list_id = int(path.split("/")[3])
        return {"contacts": [copy.deepcopy(c) for c in self.rows if list_id in c["listIds"]]}


class Reports(unittest.TestCase):
    def test_distinguishes_members_from_blocked_and_delivery_counts_without_pii(self):
        report = contact_report(Fake())
        self.assertEqual(report["all_contacts"]["total"], 4)
        self.assertEqual(report["lists"]["4"]["total"], 3)
        self.assertEqual(report["lists"]["4"]["email_not_blacklisted"], 2)
        self.assertEqual(report["main_test_overlap"], 1)
        self.assertEqual(report["outside_vu_lists"], 1)
        self.assertEqual(report["campaign"]["delivered"], 1)
        self.assertNotIn("@", str(report))
        self.assertNotIn("complaints", report["campaign"])
        self.assertEqual(report["emails_sent"], 0)

    def test_duplicate_or_incomplete_inventory_fails(self):
        for response in ({"contacts": [{"id": 1}, {"id": 1}], "count": 2},
                         {"contacts": [{"id": 1}], "count": 2}):
            class Bad:
                def call(self, *args): return response
            with self.assertRaises(Blocked): read_contacts(Bad(), "/contacts", inventory=True)

    def test_read_only_transport_rejects_even_membership_and_all_send_endpoints(self):
        with patch.dict(os.environ, {"BREVO_API_KEY": "synthetic"}): client = MembershipClient(read_only=True)
        with patch.object(Client, "call", return_value={}) as api:
            for method, path, body in (("POST", "/contacts/lists/4/contacts/add", {"ids": [1]}),
                    ("POST", "/emailCampaigns/11/sendNow", None), ("POST", "/smtp/email", {})):
                with self.assertRaises(Blocked): client.call(method, path, body)
            api.assert_not_called()
            client.call("GET", "/contacts?limit=500&offset=0")
            client.call("GET", "/emailCampaigns/11?statistics=globalStats")
            self.assertEqual(api.call_count, 2)
