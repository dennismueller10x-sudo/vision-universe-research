import base64
import contextlib
import copy
import gzip
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from client import Client, audit, permitted_call
from import_contacts import import_contacts, preflight
from prepare import Blocked
from transfer import MAX_RAW_BYTES, decode, encode, run, trusted_dispatch
import test_safety as safety


class Transfer(unittest.TestCase):
    setUp = safety.Safety.setUp
    tearDown = safety.Safety.tearDown
    fixture = safety.Safety.fixture
    review = safety.Safety.review

    def environment(self, data, review=None):
        return {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main", "BREVO_DEFAULT_BRANCH": "main",
                "GITHUB_EVENT_NAME": "workflow_dispatch", "BREVO_IMPORT_PAYLOAD": encode(data),
                "BREVO_IMPORT_REVIEW": json.dumps(review or {})}

    def test_transfer_roundtrip_preserves_exact_private_data(self):
        data = self.fixture()
        self.assertEqual(decode(encode(data)), data)

    def test_invalid_payload_and_decompression_limit_fail_closed(self):
        for payload in ("", "bad-payload", "a" * 48001,
                        base64.b64encode(gzip.compress(b" " * (MAX_RAW_BYTES + 1))).decode()):
            with self.assertRaises(Blocked): decode(payload)

    def test_branch_and_event_matrix(self):
        data = self.fixture()
        for field, bad in (("GITHUB_REF", "refs/heads/feature"), ("GITHUB_REF", "refs/tags/main"),
                           ("GITHUB_EVENT_NAME", "push"), ("GITHUB_EVENT_NAME", "pull_request"),
                           ("BREVO_DEFAULT_BRANCH", "")):
            with patch.dict(os.environ, {**self.environment(data), field: bad}):
                self.assertFalse(trusted_dispatch())
                with self.assertRaises(Blocked): run("import-preview")
        with patch.dict(os.environ, self.environment(data)):
            self.assertTrue(trusted_dispatch())

    def test_secret_preview_is_read_only_and_logs_counts_only(self):
        data = self.fixture()
        out = io.StringIO()
        with patch.dict(os.environ, self.environment(data)), patch("transfer.Client", return_value=self.fake):
            with contextlib.redirect_stdout(out):
                result = run("import-preview")
        self.assertEqual(out.getvalue(), "")
        self.assertEqual(result["contacts_imported"], 0)
        self.assertEqual(result["contacts_checked"], 4)
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))
        self.assertFalse(any(r["email"] in json.dumps(result) for r in data["records"]))

    def test_secret_import_requires_actual_current_ui_review(self):
        data = self.fixture()
        with patch.dict(os.environ, self.environment(data)), patch("transfer.Client", return_value=self.fake):
            with self.assertRaises(Blocked): run("import")
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def test_review_binds_exact_payload_and_rejects_tampering(self):
        data = self.fixture(); review = self.review(data)
        data["records"][0]["attributes"]["VU_TAGS"] += ", changed"
        with self.assertRaises(Blocked): import_contacts(self.fake, data, review)
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def test_protected_secret_import_and_repetition(self):
        data = self.fixture(); review = self.review(data)
        with patch.dict(os.environ, self.environment(data, review)), patch("transfer.Client", return_value=self.fake):
            result = run("import")
        self.assertEqual(result["created"], 2)
        self.assertEqual(result["emails_sent"], 0)
        with patch.dict(os.environ, self.environment(data, review)), patch("transfer.Client", return_value=self.fake):
            repeat = run("import")
        self.assertEqual(repeat["created"], 0)
        self.assertEqual(repeat["updated"], 0)
        self.assertFalse(any("Campaign" in path for _, path, _ in self.fake.calls))
        self.assertFalse(any(2 in c["listIds"] for c in self.fake.contacts.values()))

    def test_incomplete_existing_status_blocks_before_any_mutation(self):
        data = self.fixture()
        self.fake.contacts["yes@example.invalid"] = {"attributes": {}, "listIds": []}
        with self.assertRaises(Blocked): import_contacts(self.fake, data, self.review(data))
        self.assertFalse(any(m != "GET" for m, _, _ in self.fake.calls))

    def test_api_allowlist_never_permits_any_email_endpoint(self):
        for mode in ("admin", "import"):
            for method in ("GET", "POST", "PUT", "DELETE"):
                for path in ("/emailCampaigns", "/emailCampaigns/1/sendNow", "/emailCampaigns/1/sendTest", "/smtp/email", "/contacts/import"):
                    if path == "/contacts/import" and method == "GET":
                        continue
                    self.assertFalse(permitted_call(mode, method, path))
        self.assertTrue(permitted_call("import", "POST", "/contacts"))
        self.assertTrue(permitted_call("import", "PUT", "/contacts/alpha%40example.invalid"))
        self.assertFalse(permitted_call("admin", "POST", "/contacts"))
        self.assertFalse(permitted_call("import", "DELETE", "/contacts/alpha%40example.invalid"))

    def test_api_errors_redact_response_payloads(self):
        with patch.dict(os.environ, {"BREVO_API_KEY": "synthetic-key"}):
            client = Client(mode="admin")
        error = urllib.error.HTTPError("https://example.invalid/private", 400, "alpha@example.invalid", {}, io.BytesIO(b"synthetic-key alpha@example.invalid"))
        with patch("urllib.request.OpenerDirector.open", side_effect=error):
            with self.assertRaises(Blocked) as caught: client.call("GET", "/account")
        self.assertNotIn("synthetic-key", str(caught.exception))
        self.assertNotIn("alpha@example.invalid", str(caught.exception))

    def test_audit_has_no_sender_contact_or_domain_values(self):
        original = self.fake.call
        def call(method, path, body=None, **kw):
            if path == "/contacts?limit=1&offset=0":
                return {"count": 2, "contacts": [{"email": "alpha@example.invalid"}]}
            if path == "/senders/domains":
                return {"domains": [{"domain_name": "example.invalid", "creator": {"email": "alpha@example.invalid"}}]}
            if path == "/account":
                return {"plan": [{"type": "alpha@example.invalid"}]}
            return original(method, path, body, **kw)
        self.fake.call = call
        result = audit(self.fake)
        rendered = json.dumps(result)
        self.assertNotIn("example.invalid", rendered)
        self.assertEqual(result["plan_types"], ["unknown"])
        self.assertEqual(result["authenticated_domains_count"], 1)


if __name__ == "__main__":
    unittest.main()
