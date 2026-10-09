"""Synthetic error responses only. No credentials, contact data or network calls."""
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_diagnostics import ENDPOINT, diagnose, diagnose_audit, safe_error, secret_status, main, ReadOnlyAudit
from prepare import Blocked


class AuditDiagnostics(unittest.TestCase):
    def test_only_account_get_with_correct_header_and_no_retries(self):
        class Fake:
            calls = []
            def open(self, request, timeout):
                self.calls.append(request)
                raise urllib.error.HTTPError(ENDPOINT, 403, "ignored", {},
                    io.BytesIO(b'{"code":"permission_denied","message":"Key not found"}'))
        fake = Fake()
        result = diagnose("xkeysib-synthetic-only", fake)
        self.assertEqual(len(fake.calls), 1)
        self.assertEqual(fake.calls[0].full_url, ENDPOINT)
        self.assertEqual(fake.calls[0].method, "GET")
        self.assertEqual(fake.calls[0].get_header("Api-key"), "xkeysib-synthetic-only")
        self.assertEqual(result["error_code"], "permission_denied")
        self.assertEqual(result["error_message"], "Key not found")
        self.assertNotIn("xkeysib-synthetic-only", json.dumps(result))

    def test_unknown_errors_pii_and_credentials_never_returned(self):
        for body in ({"code":"person@example.invalid","message":"Person Example person@example.invalid"},
                     {"code":"permission_denied","message":"xkeysib-synthetic-only"},
                     {"code":"permission_denied","message":"Key not found person@example.invalid"},
                     {"code":"permission_denied","message":{"name":"Person Example"}}):
            result = safe_error(json.dumps(body).encode(), "xkeysib-synthetic-only")
            self.assertIsNone(result["error_message"])
            self.assertNotIn("person@example.invalid", json.dumps(result))
            self.assertNotIn("Person Example", json.dumps(result))
            self.assertNotIn("xkeysib-synthetic-only", json.dumps(result))
        self.assertEqual(safe_error(b'<html>secret person@example.invalid</html>', "secret")["response_kind"], "non_json")

    def test_key_type_and_copy_errors_are_only_boolean_metadata(self):
        self.assertEqual(secret_status("xsmtpsib-synthetic-only")["key_format"], "smtp")
        status = secret_status(" xkeysib-synthetic-only\n")
        self.assertTrue(status["surrounding_whitespace"])
        self.assertEqual(status["key_format"], "api_v3")
        self.assertTrue(secret_status('"synthetic-only"')["surrounding_quotes"])
        self.assertNotIn("synthetic-only", json.dumps(status))

    def test_alternate_generic_error_fields_and_nested_errors(self):
        result = safe_error(json.dumps({"error":{"error_code":403,
                            "error_message":"You are not allowed to access this endpoint"}}).encode(), "synthetic-only")
        self.assertEqual(result["error_code"], 403)
        self.assertEqual(result["error_message"], "You are not allowed to access this endpoint")
        for text in ("Your account Person Example is disabled", "Contact john@example.invalid",
                     "IP 192.0.2.1 denied", "Visit https://example.invalid", "Your API key abcdef12345 is invalid"):
            self.assertIsNone(safe_error(json.dumps({"error_message":text}).encode(), "synthetic-only")["error_message"])

    def test_no_secret_or_wrong_operation_cannot_call_api(self):
        class FailIfCalled:
            def open(self, *args, **kwargs):
                raise AssertionError("No request allowed")
        self.assertFalse(diagnose("", FailIfCalled())["request_attempted"])
        with patch.dict("os.environ", {"GITHUB_ACTIONS":"true", "GITHUB_EVENT_NAME":"workflow_dispatch",
                    "GITHUB_REF":"refs/heads/fix/brevo-audit-diagnostics", "BREVO_OPERATION":"setup"}), \
                patch("audit_diagnostics.diagnose_audit", side_effect=AssertionError("No request allowed")), \
                patch("sys.stdout", new_callable=io.StringIO):
            self.assertEqual(main(), 1)

    def test_account_success_body_is_never_read(self):
        class Response:
            status = 200
            def __enter__(self):return self
            def __exit__(self, *args):pass
            def read(self, *args):raise AssertionError("Account PII must not be read")
        class Fake:
            def open(self, *args, **kwargs):return Response()
        self.assertEqual(diagnose("xkeysib-synthetic-only", Fake())["http_status"], 200)

    def test_later_endpoint_failure_does_not_blame_successful_account(self):
        class Response(io.BytesIO):
            status = 200
            def __enter__(self):return self
            def __exit__(self, *args):self.close()
        class Fake:
            calls = []
            def open(self, request, timeout):
                self.calls.append(request)
                if request.full_url == ENDPOINT:
                    return Response(b'{"email":"person@example.invalid"}')
                raise urllib.error.HTTPError(request.full_url, 403, "ignored", {},
                    io.BytesIO(b'{"code":"permission_denied","message":"Permission denied"}'))
        result = diagnose_audit("xkeysib-synthetic-only", Fake())
        self.assertEqual(result["stages"], [{"endpoint":"/account","http_status":200},
                                           {"endpoint":"/senders","http_status":403}])
        self.assertEqual(result["error"]["endpoint"], "/senders")
        self.assertNotIn("person@example.invalid", json.dumps(result))
        self.assertFalse(result["audit_complete"])

    def test_diagnostic_transport_blocks_mutations_and_contact_lookups(self):
        class FailIfCalled:
            def open(self, *args, **kwargs):raise AssertionError("No request allowed")
        client = ReadOnlyAudit("synthetic-only", FailIfCalled())
        for method, path in (("POST","/contacts/lists"),("PUT","/contacts"),
                             ("GET","/contacts/person%40example.invalid"),
                             ("POST","/smtp/email"),("POST","/emailCampaigns/1/sendTest")):
            with self.assertRaises(Blocked):client.call(method,path)
