import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

import higgsfield


class Response:
    def __init__(self, payload, status=200):
        self.status = status
        self.payload = payload
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self): return self.payload


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.model = higgsfield.get_model("bytedance/seedance-2.0")

    def test_native_audio_parameter_mapping(self):
        seedance = higgsfield.build_params(self.model, "text_to_video", "prompt", 20, "1080p", "16:9", True)
        self.assertIs(seedance["generate_audio"], True)
        self.assertNotIn("sound", seedance)
        kling = higgsfield.get_model("kling-video/v3.0/std")
        muted = higgsfield.build_params(kling, "text_to_video", "prompt", 5, "", "16:9", False)
        self.assertEqual(muted["sound"], "off")
        self.assertNotIn("generate_audio", muted)

    def test_seedance_25_image_to_video_uses_reference_framing_without_unsupported_ratio(self):
        model = higgsfield.get_model("bytedance/seedance-2.5")
        params = higgsfield.build_params(model, "image_to_video", "prompt", 20, "1080p", "16:9", True)
        self.assertEqual(params["duration"], 20)
        self.assertEqual(params["resolution"], "1080p")
        self.assertIs(params["generate_audio"], True)
        self.assertNotIn("aspect_ratio", params)

    def test_seedance_25_accepts_only_sha256_verified_master(self):
        model = higgsfield.get_model("bytedance/seedance-2.5")
        approved = model["approved_production_reference"]
        endpoint = higgsfield.validate(model, "image_to_video", "prompt", 20, "1080p", "16:9", approved["path"])
        self.assertEqual(endpoint, model["operations"]["image_to_video"])
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "only the registered"):
            higgsfield.validate(model, "image_to_video", "prompt", 20, "1080p", "16:9", "brand-media/higgsfield/test_higgsfield.py")

    def test_wan_3_vertical_parameters(self):
        model = higgsfield.get_model("alibaba/wan-3.0")
        params = higgsfield.build_params(model, "image_to_video", "prompt", 20, "1080p", "9:16", True)
        self.assertEqual(model["operations"]["image_to_video"], "alibaba/wan-3.0/image-to-video")
        self.assertEqual(params["aspect_ratio"], "9:16")
        self.assertEqual(params["resolution"], "1080p")
        self.assertEqual(params["duration"], 20)
        self.assertIs(params["generate_audio"], True)
        self.assertIs(params["enable_thinking"], False)

    def test_wan_3_accepts_only_registered_master(self):
        model = higgsfield.get_model("alibaba/wan-3.0")
        approved = model["approved_production_reference"]
        self.assertEqual(higgsfield.validate(model, "image_to_video", "prompt", 20, "1080p", "9:16", approved["path"]), model["operations"]["image_to_video"])
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "only the registered"):
            higgsfield.validate(model, "image_to_video", "prompt", 20, "1080p", "9:16", "brand-media/higgsfield/test_higgsfield.py")

    def test_wan_production_estimate_threshold_is_ten(self):
        self.assertEqual(higgsfield.enforce_cost("9.99", "10.00", "produce")[0], higgsfield.Decimal("9.99"))
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "10.00 USD maximum"):
            higgsfield.enforce_cost("10.01", "10.00", "produce")
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "10.00 USD maximum"):
            higgsfield.enforce_cost("4.00", "10.01", "produce")

    def test_missing_secret(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "missing"):
            higgsfield.Client("")

    def test_invalid_model(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "Invalid model"):
            higgsfield.get_model("made-up/model")

    def test_missing_reference(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "missing"):
            higgsfield.validate(self.model, "image_to_video", "prompt", 5, "720p", "16:9", "/missing/file.png")

    def test_invalid_duration(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "duration"):
            higgsfield.validate(self.model, "text_to_video", "prompt", 16, "720p", "16:9")

    def test_unsupported_resolution(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "resolution"):
            higgsfield.validate(self.model, "text_to_video", "prompt", 5, "8k", "16:9")

    def test_budget_overrun(self):
        client = higgsfield.Client("never-print-this", opener=lambda *a, **k: Response(b'{"usd":"1.01","credits":"10"}'))
        estimate = client.estimate(self.model["operations"]["text_to_video"], {"prompt":"x"})
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "Budget"):
            higgsfield.enforce_cost(estimate["usd"], "1.00", "estimate")

    def test_estimate_must_match_separate_approval(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "differs"):
            higgsfield.enforce_cost("1.01", "2.00", "generate", "1.00")

    def test_malformed_estimate_reports_field_names_not_values(self):
        secret = "never-display-this-secret"
        client = higgsfield.Client(secret, opener=lambda *a, **k: Response(b'{"error":"private message"}'))
        with self.assertRaises(higgsfield.HiggsfieldError) as ctx:
            client.estimate("alibaba/wan-3.0/image-to-video", {})
        self.assertIn("error", str(ctx.exception))
        self.assertNotIn(secret, str(ctx.exception))
        self.assertNotIn("private message", str(ctx.exception))

    def test_api_error_no_secret_in_message(self):
        secret = "top-secret-xyz"
        def fail(*a, **k):
            raise urllib.error.HTTPError("https://api.higgsfield.ai", 401, secret, {}, io.BytesIO(secret.encode()))
        with self.assertRaises(higgsfield.HiggsfieldError) as ctx:
            higgsfield.Client(secret, opener=fail).estimate("model/path", {})
        self.assertNotIn(secret, str(ctx.exception))

    def test_rate_limit_no_retry(self):
        calls = []
        def fail(*a, **k):
            calls.append(1)
            raise urllib.error.HTTPError("https://api.higgsfield.ai", 429, "limit", {}, io.BytesIO(b""))
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "rate limit"):
            higgsfield.Client("key", opener=fail).estimate("model/path", {})
        self.assertEqual(len(calls), 1)

    def test_malformed_job_reply(self):
        client = higgsfield.Client("key", opener=lambda *a, **k: Response(b'{"status":"queued"}'))
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "Malformed job"):
            client.submit("model/path", {})

    def test_malformed_status_reply(self):
        client = higgsfield.Client("key", opener=lambda *a, **k: Response(b'{"status":"mystery"}'))
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "Malformed job status"):
            client.status("request-123")

    def test_download_failure(self):
        def fail(*a, **k):
            raise urllib.error.HTTPError("https://storage.example/video", 404, "gone", {}, io.BytesIO(b""))
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(higgsfield.HiggsfieldError, "download returned HTTP 404"):
                higgsfield.Client("key", opener=fail).download("https://storage.example/video", Path(temp)/"bad.mp4")

    def test_secret_leak_guard(self):
        with self.assertRaisesRegex(higgsfield.HiggsfieldError, "secret-bearing"):
            higgsfield.safe_metadata({"prompt": "ordinary", "value": "top-secret-xyz"}, secret="top-secret-xyz")


if __name__ == "__main__":
    unittest.main()
