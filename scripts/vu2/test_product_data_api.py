import importlib.util
import gzip
import io
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

    def test_fundamental_identity_keeps_all_product_eligibility_states(self):
        row = next(r for r in self.loader("quant/data/universe/instruments/NV.json")["instruments"] if r["symbol"] == "NVDA")
        for eligibility in ("ELIGIBLE", "REVIEW", "SEPARATE_CLASS", "EXCLUDED", "UNKNOWN"):
            changed = dict(row, productEligibility=eligibility)
            state, _ = api.resolve_identity("NVDA", loader=lambda _: {"instruments": [changed]})
            self.assertEqual(state, "AVAILABLE" if eligibility in ("ELIGIBLE", "REVIEW", "SEPARATE_CLASS") else "NOT_ELIGIBLE")
        changed = dict(row, legacyIds=[])
        self.assertEqual(api.resolve_identity("NVDA", loader=lambda _: {"instruments": [changed]})[0], "INVALID_IDENTITY")

    def test_index_cannot_redirect_to_another_issuer_or_namespace(self):
        _, identity = api.resolve_identity("NVDA", loader=self.loader)
        for key in ("v1/sec/fundamentals/facts/0000320193.json.gz", "v1/market/private.json.gz"):
            reads = []
            payload = gzip.compress(json.dumps({"objects": {identity["cik"]: {"key": key, "sha256": "a" * 64}}}).encode())
            def reader(key, **kwargs):
                reads.append(key)
                return payload
            with patch.object(api, "configured", return_value=True):
                result = api.load_projection(identity, policy="as_of_latest", as_of="2026-09-17", usage="backtest", reader=reader, full_history=True)
            self.assertEqual(result["reason"], "INVALID_FUNDAMENTALS_INDEX")
            self.assertEqual(reads, [api.INDEX_KEY])

    def test_malformed_and_oversized_index_fail_closed(self):
        _, identity = api.resolve_identity("NVDA", loader=self.loader)
        for payload in (b"bad", gzip.compress(b"[]"), gzip.compress(b"x" * (32 * 1024 * 1024 + 1))):
            with patch.object(api, "configured", return_value=True):
                result = api.load_projection(identity, policy="as_of_latest", as_of="2026-09-17", usage="research", reader=lambda *a, **k: payload)
            self.assertEqual(result["reason"], "INVALID_FUNDAMENTALS_INDEX")

    def test_http_requires_explicit_scope_without_touching_identity_or_r2(self):
        handler = object.__new__(api.handler)
        handler.headers = {}
        for path in ("/api/fundamentals?ticker=NVDA", "/api/fundamentals?ticker=NVDA&scope=full_history"):
            handler.path = path
            results = []
            handler._json = lambda status, body: results.append((status, body))
            with patch.object(api, "resolve_identity", side_effect=AssertionError("must not read")):
                handler.do_GET()
            self.assertEqual(results[0][1]["reason"], "EXPLICIT_HISTORY_SCOPE_REQUIRED")

    def test_http_requires_explicit_pit_activation_before_identity_or_r2(self):
        handler = object.__new__(api.handler)
        handler.headers = {}
        handler.path = "/api/fundamentals?ticker=NVDA&scope=full_history&asOf=2026-09-17"
        results = []
        handler._json = lambda status, body: results.append((status, body))
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(api, "resolve_identity", side_effect=AssertionError("must not read")):
            handler.do_GET()
        self.assertEqual(results, [(200, {"state": "NOT_CONFIGURED", "reason": "PIT_SERVICE_DISABLED"})])

    def test_enabled_http_request_forwards_only_full_history_projection(self):
        handler = object.__new__(api.handler)
        handler.headers = {}
        handler.path = "/api/fundamentals?ticker=NVDA&scope=full_history&asOf=2025-01-01&usage=backtest"
        results = []
        handler._json = lambda status, body: results.append((status, body))
        identity = {"securityId": "vu_test", "instrumentId": "vu_test",
                    "masterMemberId": "ref_NVDA", "issuerId": "iss_cik_0001045810",
                    "cik": "0001045810", "ticker": "NVDA", "name": "NVIDIA"}
        with patch.dict(os.environ, {"VU_PIT_FUNDAMENTALS_ENABLED": " TRUE "}, clear=True), \
                patch.object(api, "resolve_identity", return_value=("AVAILABLE", identity)), \
                patch.object(api, "load_projection", return_value={"state": "AVAILABLE"}) as load:
            handler.do_GET()
        self.assertEqual(results, [(200, {"state": "AVAILABLE"})])
        self.assertTrue(load.call_args.kwargs["full_history"])
        self.assertEqual(load.call_args.kwargs["usage"], "backtest")

    def test_response_budget_never_returns_a_silently_partial_history(self):
        handler = object.__new__(api.handler)
        handler.wfile = io.BytesIO()
        handler._headers = lambda status: None
        handler._json(200, {"history": "x" * (4 * 1024 * 1024)})
        result = json.loads(handler.wfile.getvalue())
        self.assertEqual(result["reason"], "RESPONSE_BUDGET_EXCEEDED")
        self.assertNotIn("history", result)

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
