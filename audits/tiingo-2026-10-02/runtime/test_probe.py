import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("audit_probe", Path(__file__).with_name("probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Response:
    def __init__(self, code, payload):
        self.code, self.payload = code, payload
        self.headers = {"content-type": "application/json", "set-cookie": "private"}
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return json.dumps(self.payload).encode()


class ProbeSafetyTests(unittest.TestCase):
    def test_reflected_secret_is_redacted_and_rate_limit_stops(self):
        key = "test-secret-do-not-publish"
        plan = [{"url": "https://api.tiingo.com/api/test", "references": [{"id": "auth"}]}] * 3
        with tempfile.TemporaryDirectory() as d, patch.dict(probe.os.environ, {"TIINGO_API_KEY": key}), \
             patch.object(probe, "merge_manifests", return_value=plan), \
             patch.object(probe.urllib.request, "urlopen", return_value=Response(429, {"echo": key})) as fetch:
            out = Path(d)
            report = probe.collect(out, interval=0)
            self.assertEqual(fetch.call_count, 1)
            self.assertEqual(report["stopReason"], "AUTHENTICATION_OR_RATE_LIMIT_STOP")
            text = (out / "account_evidence.json").read_text()
            self.assertNotIn(key, text)
            self.assertNotIn("set-cookie", text)
            request = fetch.call_args.args[0]
            self.assertNotIn(key, request.full_url)
            self.assertEqual(request.get_header("Authorization"), "Token " + key)

    def test_missing_credential_does_not_request(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(probe.os.environ, {"TIINGO_API_KEY": ""}), \
             patch.object(probe, "merge_manifests", return_value=[]), \
             patch.object(probe.urllib.request, "urlopen") as fetch:
            report = probe.collect(Path(d))
            fetch.assert_not_called()
            self.assertEqual(report["stopReason"], "NO_CREDENTIAL_REQUESTS_NOT_RUN")

    def test_manifest_url_deduplication_and_forbidden_credentials(self):
        with tempfile.TemporaryDirectory() as d, patch.object(probe, "AUDIT", Path(d)):
            p = Path(d) / "tests" / "probes.json"
            p.parent.mkdir()
            a = {"id": "one", "path": "/tiingo/daily/DNA", "params": {"b": 2, "a": 1}}
            b = {"id": "two", "path": a["path"], "params": {"a": 1, "b": 2}}
            p.write_text(json.dumps({"probes": [a, b]}))
            self.assertEqual(len(probe.merge_manifests()), 1)
            self.assertEqual(len(probe.merge_manifests()[0]["references"]), 2)
            a["params"] = {"token": "unsafe"}
            p.write_text(json.dumps({"probes": [a]}))
            with self.assertRaises(ValueError):
                probe.merge_manifests()


if __name__ == "__main__":
    unittest.main()
