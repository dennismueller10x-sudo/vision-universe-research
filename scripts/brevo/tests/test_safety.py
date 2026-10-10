"""Synthetic-only tests: no credentials, production assets written or live calls."""
import copy
import csv
import datetime as dt
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import unquote, urlsplit, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare import Blocked, ROOT, normalize, prepare, prepared_digest, private_path, manual_csvs
from client import ATTRS, LISTS, setup
from import_contacts import import_contacts, merge_attributes
from campaigns import Process, render, version


class Fake:
    def __init__(self):
        self.calls, self.contacts = [], {}
        self.lists = {n: i+1 for i, n in enumerate(LISTS)}
        self.campaign = {"id": 8, "status": "draft", "type": "classic", "subject": "Synthetic",
                         "htmlContent": "<html>Synthetic</html>", "sender": {"id": 1},
                         "recipients": {"lists": [1], "exclusionLists": [3]}}
        self.fail_test = False
        self.fail_send = False
        self.fail_draft = False
        self.mutate_on_test = False

    def pages(self, path, key):
        return [{"name": n, "id": i} for n, i in self.lists.items()] if path == "/contacts/lists" else []

    def contact(self, email):
        return copy.deepcopy(self.contacts.get(email))

    def call(self, method, path, body=None, **kwargs):
        self.calls.append((method, path, copy.deepcopy(body)))
        if path == "/account":
            return {"plan": [{"type": "free"}]}
        if path == "/senders":
            return {"senders": [{"id": 1, "active": True, "email": "sender@example.invalid"}]}
        if path.startswith("/senders/domains/"):
            return {"verified": True, "authenticated": True}
        if path == "/contacts/attributes":
            return {"attributes": [{"name": n, "type": t, "category": "normal"} for n, t in ATTRS.items()]}
        if method == "GET" and ("/contacts?" in path or "/contacts/lists/" in path):
            query = parse_qs(urlsplit(path).query)
            offset = int(query.get("offset", [0])[0])
            return {"contacts": [copy.deepcopy(c) for c in self.contacts.values() if 1 in c.get("listIds", [])][offset:offset+500]}
        if path == "/contacts" and method == "POST":
            if body["email"] in self.contacts:
                raise Blocked("Duplicate")
            self.contacts[body["email"]] = {"attributes": body["attributes"], "emailBlacklisted": body["emailBlacklisted"], "listIds": body.get("listIds", [])}
            return {"id": len(self.contacts)}
        if path.startswith("/contacts/") and method == "PUT":
            c = self.contacts[unquote(path[len("/contacts/"):])]
            c["attributes"].update(body["attributes"])
            c["listIds"] = sorted((set(c["listIds"]) | set(body.get("listIds", []))) - set(body.get("unlinkListIds", [])))
            return {}
        if path == "/emailCampaigns/8" and method == "GET":
            return copy.deepcopy(self.campaign)
        if path == "/emailCampaigns" and method == "POST":
            if self.fail_draft:
                raise Blocked("Synthetic timeout")
            self.campaign.update(body)
            self.campaign["recipients"] = {"lists": body["recipients"].get("listIds", []),
                                            "segments": body["recipients"].get("segmentIds", []),
                                            "exclusionLists": body["recipients"]["exclusionListIds"]}
            return {"id": 8}
        if path.endswith("/sendTest"):
            if self.fail_test:
                raise Blocked("Synthetic timeout")
            if self.mutate_on_test:
                self.campaign["subject"] = "Changed concurrently"
            return {}
        if path.endswith("/sendNow"):
            if self.fail_send:
                raise Blocked("Synthetic timeout")
            return {}
        raise AssertionError((method, path))


class Safety(unittest.TestCase):
    def setUp(self):
        # Simulate a private runtime for Fake-only tests, including on the CI runner.
        # The dedicated Actions guard test below explicitly restores GITHUB_ACTIONS=true.
        runtime = patch.dict(os.environ, {"GITHUB_ACTIONS": ""})
        runtime.start()
        self.addCleanup(runtime.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.fake = Fake()
        self.cfg = {"test_addresses_confirmed": True,
                    "test_addresses": {"test_1": "alpha@example.invalid", "test_2": "beta@example.invalid"}}
        for address in self.cfg["test_addresses"].values():
            self.fake.contacts[address] = {"attributes": {"VU_INTERNAL_TEST": True}, "emailBlacklisted": False, "listIds": [3]}

    def tearDown(self):
        self.temp.cleanup()

    def process(self):
        p = Process(self.fake, self.cfg, self.directory / "state.json")
        self.addCleanup(p.close)
        if "8" not in p.state["campaigns"]:
            p.state["campaigns"]["8"] = {"recipients": {"listIds": [1], "exclusionListIds": [3]}, "sender_id": 1}
            p.save()
        return p

    def fixture(self):
        source = self.directory / "source.csv"
        fields = ["Email", "First Name", "Last Name", "Accepts Email Marketing", "Total Orders", "Tags"]
        rows = [
            ["One+tag@EXAMPLE.invalid", "One", "Buyer", "yes", "2", "tag-a"],
            [" one+tag@example.invalid ", "One", "Buyer", "no", "1", "tag-b"],
            ["yes@example.invalid", "Yes", "Buyer", "yes", "1", ""],
            ["alpha@example.invalid", "Alpha", "Example", "yes", "1", ""],
            ["beta@example.invalid", "Beta", "Example", "yes", "0", ""],
            ["bad email", "Invalid", "", "yes", "0", ""],
        ]
        with source.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f); writer.writerow(fields); writer.writerows(rows)
        return prepare(source, {"test_1": {"first_name": "Alpha", "last_names": ["Example"]},
                                "test_2": {"first_name": "Beta", "last_names": ["Example"]}})

    def review(self, data):
        return {"reviewed_at": dt.datetime.now(dt.timezone.utc).isoformat(), "source_sha256": data["source_sha256"],
                "prepared_sha256": prepared_digest(data),
                "list_ids": self.fake.lists, "all_active_automations_checked": True,
                "no_contact_create_update_or_list_entry_triggers": True, "reviewer": "Synthetic", "evidence_note": "Synthetic only"}

    def test_normalization_preserves_aliases(self):
        self.assertEqual(normalize(" A+tag@Example.invalid "), "a+tag@example.invalid")
        self.assertNotEqual(normalize("a+tag@example.invalid"), normalize("a@example.invalid"))
        for email in ("a..b@example.invalid", ".a@example.invalid", "a@-example.invalid", "a@example..invalid"):
            self.assertIsNone(normalize(email))

    def test_csv_conflict_and_buyer_separation(self):
        data = self.fixture()
        self.assertEqual(data["summary"]["duplicates_merged"], 1)
        self.assertEqual(data["summary"]["invalid_rows_held"], 1)
        record = data["records"][0]["attributes"]
        self.assertEqual(record["VU_EMAIL_CONSENT"], "unclear")
        self.assertTrue(record["VU_BUYER"])
        self.assertEqual(record["VU_TAGS"], "tag-a, tag-b")
        self.assertEqual(data["summary"]["regular_subscribers_prepared"], 1)

    def test_private_files_never_in_repository(self):
        with self.assertRaises(Blocked):
            private_path(ROOT / "contacts.csv")
        manual_csvs(self.fixture(), self.directory)
        self.assertEqual((self.directory / "newsletter-new-only.csv").stat().st_mode & 0o777, 0o600)

    def test_manual_csv_boolean_format_preserves_groups_and_api_types(self):
        data = self.fixture()
        before = copy.deepcopy(data)
        manual_csvs(data, self.directory)
        groups = {}
        for name in ("newsletter-new-only.csv", "tests-new-only.csv", "non-subscribers-new-only.csv"):
            with (self.directory / name).open(encoding="utf-8", newline="") as source:
                groups[name] = list(csv.DictReader(source))
            for row in groups[name]:
                self.assertIn(row["VU_BUYER"], ("Yes", "No"))
                self.assertIn(row["VU_INTERNAL_TEST"], ("Yes", "No"))
        self.assertEqual(len(groups["newsletter-new-only.csv"]), 1)
        self.assertEqual(groups["newsletter-new-only.csv"][0]["VU_INTERNAL_TEST"], "No")
        self.assertEqual([r["VU_INTERNAL_TEST"] for r in groups["tests-new-only.csv"]], ["Yes", "Yes"])
        self.assertEqual({r["VU_BUYER"] for r in groups["tests-new-only.csv"]}, {"Yes", "No"})
        self.assertEqual(groups["non-subscribers-new-only.csv"][0]["VU_EMAIL_CONSENT"], "unclear")
        self.assertEqual(data, before)
        self.assertTrue(all(type(r["attributes"]["VU_BUYER"]) is bool for r in data["records"]))

    def test_upsert_preserves_blocks_and_is_idempotent(self):
        data = self.fixture()
        self.fake.contacts["yes@example.invalid"] = {"attributes": {}, "emailBlacklisted": True, "listIds": [1, 77]}
        first = import_contacts(self.fake, data, self.review(data))
        second = import_contacts(self.fake, data, self.review(data))
        self.assertEqual(first["created"], 1)
        self.assertEqual(second["created"], 0)
        self.assertEqual(second["updated"], 0)
        self.assertTrue(self.fake.contacts["yes@example.invalid"]["emailBlacklisted"])
        self.assertEqual(self.fake.contacts["yes@example.invalid"]["listIds"], [77])
        for e in self.cfg["test_addresses"].values():
            self.assertEqual(self.fake.contacts[e]["listIds"], [3])
        self.assertFalse(any("emailBlacklisted" in b for m, _, b in self.fake.calls if m == "PUT"))

    def test_existing_withdrawal_never_upgraded(self):
        attrs = merge_attributes({"VU_EMAIL_CONSENT": "subscribed", "VU_BUYER": False, "VU_INTERNAL_TEST": False},
                                 {"attributes": {"VU_EMAIL_CONSENT": "withdrawn", "VU_BUYER": True}})
        self.assertEqual(attrs["VU_EMAIL_CONSENT"], "withdrawn")
        self.assertTrue(attrs["VU_BUYER"])

    def test_missing_automation_review_blocks_all_mutations(self):
        with self.assertRaises(Blocked):
            import_contacts(self.fake, self.fixture(), {})
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def test_stale_review_blocks(self):
        data = self.fixture(); review = self.review(data)
        review["reviewed_at"] = (dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=2)).isoformat()
        with self.assertRaises(Blocked):
            import_contacts(self.fake, data, review)

    def test_no_send_without_authorization(self):
        p = self.process()
        with self.assertRaises(Blocked): p.test(8)
        with self.assertRaises(Blocked): p.send(8, {})
        self.assertFalse(any(m == "POST" for m, _, _ in self.fake.calls))

    def test_success_test_keeps_draft_and_prevents_duplicate(self):
        p = self.process(); result = p.test(8, True)
        self.assertFalse(result["production_sent"])
        self.assertEqual(self.fake.campaign["status"], "draft")
        with self.assertRaises(Blocked): p.test(8, True)
        self.assertEqual(sum(path.endswith("sendTest") for _, path, _ in self.fake.calls), 1)
        self.assertTrue(p.check(8)["requires_owner_approval"])

    def test_content_changes_invalidate_test_and_approval(self):
        p = self.process(); p.test(8, True)
        self.fake.campaign["subject"] = "Changed"
        with self.assertRaises(Blocked): p.check(8)
        p.test(8, True)
        self.assertEqual(sum(path.endswith("sendTest") for _, path, _ in self.fake.calls), 2)

    def test_failed_test_survives_restart_and_blocks_release(self):
        p = self.process(); self.fake.fail_test = True
        with self.assertRaises(Blocked): p.test(8, True)
        with self.assertRaises(Blocked): p.check(8)
        p.save()
        state = json.loads((self.directory / "state.json").read_text())
        self.assertEqual(next(iter(state["campaigns"]["8"]["tests"].values()))["state"], "pending")
        with self.assertRaises(Blocked): p.test(8, True)

    def test_approval_version_and_one_send_only(self):
        p = self.process(); p.test(8, True); check = p.check(8)
        approval = {**check, "explicit_owner_approval": True, "approval_reference": "Synthetic owner instruction"}
        wrong = {**approval, "version": "wrong"}
        with self.assertRaises(Blocked): p.send(8, wrong, True)
        p.send(8, approval, True)
        with self.assertRaises(Blocked): p.send(8, approval, True)
        self.assertEqual(sum(path.endswith("sendNow") for _, path, _ in self.fake.calls), 1)

    def test_recipient_change_and_missing_test_contact_block(self):
        p = self.process()
        self.fake.campaign["recipients"]["exclusionLists"] = []
        with self.assertRaises(Blocked): p.test(8, True)
        self.fake.campaign["recipients"]["exclusionLists"] = [3]
        del self.fake.contacts["beta@example.invalid"]
        with self.assertRaises(Blocked): p.test(8, True)

    def test_unconsented_audience_blocks(self):
        p = self.process()
        self.fake.contacts["unknown@example.invalid"] = {"listIds": [1], "emailBlacklisted": False, "attributes": {}}
        with self.assertRaises(Blocked): p.test(8, True)

    def test_actions_cannot_send_or_import(self):
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "true"}):
            with self.assertRaises(Blocked): self.process()
            with self.assertRaises(Blocked): import_contacts(self.fake, {}, {})

    def test_template_escape_mobile_and_unsubscribe(self):
        content = {"subject": "<Synthetic>", "preheader": "Preview", "intro": "Für dich.",
                   "items": [{"title": "Title", "text": "Text"}], "cta_text": "Öffnen", "cta_url": "https://example.invalid",
                   "company_name": "Synthetic", "company_address": "Synthetic only", "company_details_verified": True, "sender_id": 1}
        output = render(content)
        self.assertIn("&lt;Synthetic&gt;", output)
        self.assertIn("{{ unsubscribe }}", output)
        self.assertIn("@media", output)
        self.assertIn("vision-universe-logo-web.png", output)
        self.assertNotIn("<script", output.lower())
        self.assertNotIn("site-navigation", output)
        self.assertNotIn("<vu-navigation", output)
        content["company_details_verified"] = False
        with self.assertRaises(Blocked): render(content)

    def test_setup_reuses_lists_and_never_sends(self):
        self.assertEqual(setup(self.fake), self.fake.lists)
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def content(self):
        return {"name": "Synthetic draft", "subject": "Synthetic", "preheader": "Preview", "intro": "Für dich.",
                "items": [{"title": "Title", "text": "Text"}], "cta_text": "Öffnen", "cta_url": "https://example.invalid",
                "company_name": "Synthetic", "company_address": "Synthetic only", "company_details_verified": True, "sender_id": 1}

    def test_draft_creation_is_unscheduled_and_idempotent(self):
        p = self.process()
        p.draft(self.content()); p.draft(self.content())
        requests = [body for method, path, body in self.fake.calls if method == "POST" and path == "/emailCampaigns"]
        self.assertEqual(len(requests), 1)
        self.assertNotIn("scheduledAt", requests[0])
        self.assertEqual(requests[0]["recipients"]["exclusionListIds"], [3])
        self.assertEqual(self.fake.campaign["status"], "draft")

    def test_ambiguous_draft_does_not_retry(self):
        p = self.process(); self.fake.fail_draft = True
        with self.assertRaises(Blocked): p.draft(self.content())
        self.fake.fail_draft = False
        with self.assertRaises(Blocked): p.draft(self.content())
        self.assertEqual(sum(path == "/emailCampaigns" for method, path, _ in self.fake.calls if method == "POST"), 1)

    def test_ambiguous_send_does_not_retry(self):
        p = self.process(); p.test(8, True)
        approval = {**p.check(8), "explicit_owner_approval": True, "approval_reference": "Synthetic"}
        self.fake.fail_send = True
        with self.assertRaises(Blocked): p.send(8, approval, True)
        self.fake.fail_send = False
        with self.assertRaises(Blocked): p.send(8, approval, True)
        self.assertEqual(sum(path.endswith("sendNow") for _, path, _ in self.fake.calls), 1)

    def test_concurrent_content_change_requires_new_test(self):
        p = self.process(); self.fake.mutate_on_test = True
        with self.assertRaises(Blocked): p.test(8, True)
        with self.assertRaises(Blocked): p.check(8)

    def test_state_cannot_be_used_in_parallel(self):
        p = self.process()
        with self.assertRaises(BlockingIOError):
            Process(self.fake, self.cfg, self.directory / "state.json")

    def test_changed_sender_blocks(self):
        p = self.process(); self.fake.campaign["sender"]["id"] = 2
        with self.assertRaises(Blocked): p.test(8, True)

    def test_multiple_test_matches_prevent_manual_csv_creation(self):
        data = self.fixture(); data["test_addresses"]["test_1"].append("ambiguous@example.invalid")
        with self.assertRaises(Blocked): manual_csvs(data, self.directory)


if __name__ == "__main__":
    unittest.main()
