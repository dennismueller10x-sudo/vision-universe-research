import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inventory_diagnostics import ReadOnlyInventory, summarize
from prepare import Blocked


class InventoryAudit(unittest.TestCase):
    def test_unknown_status_and_history_are_preserved_without_personal_output(self):
        class Fake:
            pages = lambda self, path, key: [] if key == "lists" else [{"id": 1}, {"id": 2}]
            def call(self, method, path):
                return {"/account": {"marketingAutomation": {"status": "active", "key": "PRIVATE-TOKEN"}},
                        "/contacts/1": {"email": "synthetic@example.invalid", "emailBlacklisted": True,
                            "listUnsubscribed": [9], "attributes": {"FIRSTNAME": "PRIVATE-NAME"},
                            "statistics": {"unsubscriptions": [{"email": "PRIVATE-ADDRESS"}]}},
                        "/contacts/2": {"attributes": {"VU_EMAIL_CONSENT": "not_subscribed"}},
                        "/smtp/blockedContacts?limit=1&offset=0": {"count": 3},
                        "/senders": {"senders": [{"email": "synthetic@gmail.com", "active": True}]}}[path]
        result = summarize(Fake())
        counts = result["contact_status_counts"]
        self.assertEqual(counts["email_blocklisted"], 1)
        self.assertEqual(counts["email_blocklist_status_missing"], 1)
        self.assertEqual(counts["contacts_with_list_unsubscriptions"], 1)
        self.assertEqual(counts["list_unsubscription_status_missing"], 1)
        self.assertEqual(counts["contacts_with_recorded_unsubscription_history"], 1)
        self.assertEqual(result["marketing_automation_account_status"], "active")
        for private in ("synthetic", "PRIVATE-", "gmail.com", "@"):
            self.assertNotIn(private, json.dumps(result))

    def test_write_and_email_identifiers_are_blocked_before_network(self):
        with patch.dict("os.environ", {"BREVO_API_KEY": "synthetic-only"}):
            client = ReadOnlyInventory()
            for method, path in [("POST", "/contacts"), ("PUT", "/contacts/1"),
                                 ("GET", "/contacts/synthetic%40example.invalid"),
                                 ("GET", "/emailCampaigns"), ("POST", "/smtp/email")]:
                with self.assertRaises(Blocked): client.call(method, path)


if __name__ == "__main__": unittest.main()
