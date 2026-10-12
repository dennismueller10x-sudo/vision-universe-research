import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

MODULE = Path(__file__).parents[1] / "research" / "certification" / "repack-artifact.py"
spec = importlib.util.spec_from_file_location("ciphertext_repack", MODULE)
repack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repack)


class RepackTests(unittest.TestCase):
    def envelope(self, body="AAAA"):
        return {"schema": "supertrader-sealed-1.0.0", "alg": "RSA-OAEP-256+A256GCM+gzip",
                "wrappedKey": "AAAA", "iv": "AAAA", "tag": "AAAA", "body": body}

    def test_ciphertext_roundtrip_and_complete_manifest_preserve_source_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "source", Path(tmp) / "output"
            source.mkdir()
            for number in range(4):
                (source / f"part-{number}.session.sealed.json").write_text(json.dumps(self.envelope()))
            (source / "probe-status.json").write_text('{"status":"READY","count":4}')
            originals = {p.name: p.read_bytes() for p in source.iterdir()}
            status = repack.repack(source, output, target_bytes=700, max_zip_bytes=1024)
            self.assertGreater(status["bundles"], 1)
            manifest = json.loads((output / "repack-manifest.json").read_text())
            recovered = {}
            for bundle in manifest["bundles"]:
                p = output / bundle["file"]
                self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(), bundle["sha256"])
                self.assertLessEqual(p.stat().st_size, 700)
                with zipfile.ZipFile(p) as archive:
                    for name in archive.namelist():
                        self.assertNotIn(name, recovered)
                        recovered[name] = archive.read(name)
            self.assertEqual(recovered, originals)
            self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, originals)
            self.assertEqual(status["providerReads"], 0)

    def test_exact_stored_header_boundary_and_real_production_limits(self):
        self.assertEqual(repack.TARGET_BYTES, 24 * 1024 * 1024)
        self.assertEqual(repack.MAX_ZIP_BYTES, 32 * 1024 * 1024)
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source"
            source.mkdir()
            p = source / "one.session.sealed.json"
            p.write_text(json.dumps(self.envelope()))
            expected = repack.stored_size([{"relativePath": p.name, "bytes": p.stat().st_size}])
            status = repack.repack(source, Path(tmp) / "exact", target_bytes=expected, max_zip_bytes=expected)
            self.assertEqual(status["packedBytes"], expected)
            with self.assertRaisesRegex(ValueError, "SINGLE_CIPHERTEXT_FILE_EXCEEDS_BUNDLE_TARGET"):
                repack.repack(source, Path(tmp) / "too-small", target_bytes=expected-1, max_zip_bytes=expected)
            with self.assertRaisesRegex(ValueError, "INVALID_BUNDLE_LIMITS"):
                repack.repack(source, Path(tmp) / "oversize", target_bytes=repack.MAX_ZIP_BYTES+1, max_zip_bytes=repack.MAX_ZIP_BYTES+1)

    def test_raw_files_bad_envelopes_and_symlinks_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "source"
            source.mkdir()
            raw = source / "raw-prices.json"
            raw.write_text('{"close":100}')
            with self.assertRaisesRegex(ValueError, "RAW_OR_UNAPPROVED_FILE_REJECTED"):
                repack.repack(source, Path(tmp) / "raw")
            raw.rename(source / "fake.session.sealed.json")
            with self.assertRaisesRegex(ValueError, "CIPHERTEXT_ENVELOPE_REQUIRED"):
                repack.repack(source, Path(tmp) / "fake")
            (source / "fake.session.sealed.json").unlink()
            (source / "redirect.session.sealed.json").symlink_to(MODULE)
            with self.assertRaisesRegex(ValueError, "ARTIFACT_SYMLINK_REJECTED"):
                repack.repack(source, Path(tmp) / "symlink")


if __name__ == "__main__":
    unittest.main()
