import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]

api_spec = importlib.util.spec_from_file_location("fundamentals_api", ROOT / "api/fundamentals.py")
api = importlib.util.module_from_spec(api_spec)
api_spec.loader.exec_module(api)

r2_spec = importlib.util.spec_from_file_location("r2_reader", ROOT / "server/r2_reader.py")
r2 = importlib.util.module_from_spec(r2_spec)
r2_spec.loader.exec_module(r2)


class FakeResponse:
    def __init__(self, body):
        self.body = body
        self.headers = {"Content-Length": str(len(body))}
    def __enter__(self): return self
    def __exit__(self, *_): return False
    def read(self, size): return self.body[:size]


class ProductDataApiTests(unittest.TestCase):
    @staticmethod
    def loader(path):
        return json.loads((ROOT / path).read_text())

    def test_identity_uses_company_master_ids(self):
        state, identity = api.resolve_identity("NVDA", loader=self.loader)
        self.assertEqual(state, "AVAILABLE")
        self.assertRegex(identity["securityId"], r"^vu_[a-f0-9]+$")
        self.assertEqual(identity["masterMemberId"], "ref_NVDA")
        self.assertEqual(identity["issuerId"], "iss_cik_0001045810")

    def test_identity_rejects_mismatched_requested_id(self):
        state, identity = api.resolve_identity("NVDA", "vu_wrong", loader=self.loader)
        self.assertEqual(state, "SYMBOL_NOT_SUPPORTED")
        self.assertIsNone(identity)

    def test_r2_reader_signs_get_without_leaking_credentials(self):
        env = {
            "VU_HISTORY_S3_ENDPOINT": "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
            "VU_HISTORY_S3_BUCKET": "vision-universe-history",
            "VU_HISTORY_S3_REGION": "auto",
            "VU_HISTORY_S3_ACCESS_KEY_ID": "test-access",
            "VU_HISTORY_S3_SECRET_ACCESS_KEY": "test-secret",
        }
        seen = {}
        def opener(request, timeout):
            seen["url"] = request.full_url
            seen["auth"] = request.headers["Authorization"]
            return FakeResponse(b"payload")
        self.assertEqual(r2.get_object("v1/sec/fundamentals/_index.json.gz", env=env, opener=opener), b"payload")
        self.assertTrue(seen["url"].endswith("/vision-universe-history/v1/sec/fundamentals/_index.json.gz"))
        self.assertIn("Credential=test-access/", seen["auth"])
        self.assertNotIn("test-secret", seen["auth"])

    def test_not_configured_state_has_no_secret_names_or_values(self):
        state, identity = api.resolve_identity("NVDA", loader=self.loader)
        self.assertEqual(state, "AVAILABLE")
        with patch.dict(os.environ, {}, clear=True):
            result = api.load_projection(identity, policy="as_of_latest", as_of="2026-09-18", usage="research")
        self.assertEqual(result["state"], "NOT_CONFIGURED")
        self.assertNotIn("ACCESS_KEY", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
