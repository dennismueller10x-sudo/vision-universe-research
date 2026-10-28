import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import images
from higgsfield import HiggsfieldError

JOB = "brand-media/higgsfield/image-jobs/bulle-baer-entwurf-1.json"
REFERENCE = "brand-media/higgsfield/references/the-arrival-final-master.jpg"


class Response:
    def __init__(self, payload, status=200):
        self.status = status
        self.payload = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self._offset = 0
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def read(self, size=-1):
        if size is None or size < 0:
            size = len(self.payload) - self._offset
        chunk = self.payload[self._offset:self._offset + size]
        self._offset += len(chunk)
        return chunk


class FakeApi:
    """Answers estimate, submit, status and download calls; records every request."""
    def __init__(self, usd="0.04"):
        self.usd = usd
        self.calls = []
        self.submitted = 0

    def __call__(self, request, timeout=None):
        url = request.full_url
        self.calls.append((request.get_method(), url))
        if "/estimate/" in url:
            return Response({} if self.usd is None else {"usd": self.usd})
        if url.endswith("/status"):
            request_id = url.split("/")[-2]
            return Response({"status": "completed", "request_id": request_id,
                             "images": [{"url": f"https://cdn.example.com/{request_id}.png"}]})
        if url.startswith("https://cdn.example.com/"):
            return Response(b"\x89PNG fake")
        self.submitted += 1
        request_id = f"00000000-0000-0000-0000-{self.submitted:012d}"
        return Response({"status": "queued", "request_id": request_id,
                         "status_url": f"https://api.higgsfield.ai/requests/{request_id}/status"})


def item(**overrides):
    base = {"id": "test", "model": "grok-image-2", "prompt": "bull and bear", "aspect_ratio": "1:1"}
    base.update(overrides)
    return base


class ImageJobTests(unittest.TestCase):
    def setUp(self):
        # Paths in jobs are repository-relative, as in the workflow.
        self._cwd = os.getcwd()
        os.chdir(Path(__file__).resolve().parents[2])
        self.addCleanup(os.chdir, self._cwd)

    def test_checked_in_job_validates_offline(self):
        job, plans = images.load_job(JOB)
        self.assertEqual(job["job_id"], "bulle-baer-entwurf-1")
        self.assertLessEqual(len(plans), images.MAX_IMAGES_PER_JOB)
        self.assertTrue(all(p["endpoint"] == images.IMAGE_MODELS[p["model"]]["endpoint"] for p in plans))

    def test_qwen_keeps_prompt_as_written(self):
        params = images.build_params(item(model="qwen-image-3", seed=7))
        self.assertIs(params["prompt_extend"], False)
        self.assertIs(params["enable_thinking"], False)
        self.assertEqual(params["seed"], 7)

    def test_recraft_palette_shape(self):
        params = images.build_params(item(model="recraft-v4.1", colors=[[1, 2, 3]], background_color=[255, 255, 255]))
        self.assertEqual(params["colors"], [{"rgb": [1, 2, 3]}])
        self.assertEqual(params["background_color"], {"rgb": [255, 255, 255]})
        self.assertEqual(params["resolution"], "1k")

    def test_rejects_fields_unknown_or_foreign_to_model(self):
        with self.assertRaisesRegex(HiggsfieldError, "Unknown"):
            images.build_params(item(steps=30))
        with self.assertRaisesRegex(HiggsfieldError, "not supported"):
            images.build_params(item(colors=[[1, 2, 3]]))
        with self.assertRaisesRegex(HiggsfieldError, "aspect ratio"):
            images.build_params(item(model="recraft-v4.1", aspect_ratio="auto"))

    def test_reference_rules(self):
        images.build_params(item(references=[REFERENCE]))
        with self.assertRaisesRegex(HiggsfieldError, "accepts 0-0"):
            images.build_params(item(model="qwen-image-3", references=[REFERENCE]))
        with self.assertRaisesRegex(HiggsfieldError, "accepts 1-3"):
            images.build_params(item(model="qwen-image-3-edit"))
        with self.assertRaisesRegex(HiggsfieldError, "under brand-media"):
            images.build_params(item(references=["core/identity.js"]))
        with self.assertRaisesRegex(HiggsfieldError, "under brand-media"):
            images.build_params(item(references=["brand-media/../core/x.png"]))

    def test_job_file_location_is_fixed(self):
        with self.assertRaisesRegex(HiggsfieldError, "image-jobs"):
            images.load_job("brand-media/higgsfield/registry.json")

    def test_estimate_parsing_never_defaults_to_zero(self):
        self.assertEqual(str(images.parse_usd({"usd": "0.094"})), "0.094")
        self.assertIsNone(images.parse_usd({"credits": 3}))
        self.assertIsNone(images.parse_usd({"usd": "-1"}))
        self.assertIsNone(images.parse_usd([]))

    def run_job(self, api, approval, budget="5"):
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict(os.environ, {"HIGGSFIELD_API_KEY": "id:secret", "GITHUB_RUN_ID": "42", "GITHUB_RUN_ATTEMPT": "1"}), \
                patch.object(images.ImageClient, "__init__", lambda self, key: images.Client.__init__(self, key, opener=api)), \
                patch.object(images.time, "sleep"):
            args = SimpleNamespace(action="generate", job=JOB, budget_usd=budget, approval=approval, output_dir=tmp)
            images.run(args)
            out = Path(tmp) / "bulle-baer-entwurf-1"
            manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
            return manifest, sorted(p.name for p in out.iterdir())

    def test_generate_downloads_every_image_and_writes_manifest(self):
        api = FakeApi(usd="0.04")
        manifest, files = self.run_job(api, images.APPROVAL_PHRASE)
        self.assertEqual(api.submitted, 6)
        self.assertEqual(sum(e["status"] == "completed" for e in manifest["images"]), 6)
        self.assertEqual(manifest["estimate_total_usd"], "0.24")
        self.assertIn("a-recraft-duo.png", files)
        self.assertNotIn("secret", json.dumps(manifest))

    def test_generate_requires_approval_and_budget(self):
        with self.assertRaisesRegex(HiggsfieldError, "approval"):
            self.run_job(FakeApi(), "yes")
        with self.assertRaisesRegex(HiggsfieldError, "exceeds"):
            self.run_job(FakeApi(usd="1.00"), images.APPROVAL_PHRASE, budget="2")

    def test_missing_estimate_needs_the_explicit_no_estimate_phrase(self):
        api = FakeApi(usd=None)
        with self.assertRaisesRegex(HiggsfieldError, "no complete price estimate"):
            self.run_job(api, images.APPROVAL_PHRASE)
        self.assertEqual(api.submitted, 0)
        manifest, _ = self.run_job(FakeApi(usd=None), images.NO_ESTIMATE_APPROVAL_PHRASE)
        self.assertIsNone(manifest["estimate_total_usd"])

    def test_rerun_is_blocked_before_submission(self):
        api = FakeApi()
        with patch.dict(os.environ, {"GITHUB_RUN_ATTEMPT": "2"}):
            with tempfile.TemporaryDirectory() as tmp, \
                    patch.dict(os.environ, {"HIGGSFIELD_API_KEY": "id:secret", "GITHUB_RUN_ID": "42"}), \
                    patch.object(images.ImageClient, "__init__", lambda self, key: images.Client.__init__(self, key, opener=api)):
                args = SimpleNamespace(action="generate", job=JOB, budget_usd="5", approval=images.APPROVAL_PHRASE, output_dir=tmp)
                with self.assertRaisesRegex(HiggsfieldError, "reruns"):
                    images.run(args)
        self.assertEqual(api.submitted, 0)


if __name__ == "__main__":
    unittest.main()
