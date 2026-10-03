"""Compressed histories are lossless, deterministic, and fully validated."""
import gzip
import json
import tempfile
import unittest
from pathlib import Path

from quant.sec.artifacts import artifact_paths, read_artifact, write_canonical_artifact
from quant.sec.universe_coverage import load_canonical_bundles


class CanonicalStorageTests(unittest.TestCase):
    def test_new_history_roundtrips_all_dates_provenance_nulls_and_numbers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "NEW.json"
            payload = {"security": {"ticker": "NEW", "securityId": "sec_NEW"},
                       "facts": [{"periodEnd": "2018-06-30", "filedAt": "2018-08-07",
                                  "availableAt": "2018-08-07", "sourceFilingId": "accession",
                                  "value": -0.125, "missing": None, "zero": 0}],
                       "oldest": "2009-03-31", "currency": "EUR"}
            target = write_canonical_artifact(path, payload)
            self.assertEqual(target.name, "NEW.json.gz")
            self.assertEqual(read_artifact(target), payload)
            stored = target.read_bytes()
            self.assertEqual(json.loads(gzip.decompress(stored)), payload)
            write_canonical_artifact(path, payload)
            self.assertEqual(target.read_bytes(), stored)
            self.assertFalse(path.exists())

    def test_existing_json_retains_its_identity_and_explicit_migration_has_one_representation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "BASE.json"
            path.write_text('{"preserved":"path"}')
            target = write_canonical_artifact(path, {"preserved": "path"})
            self.assertEqual(target, path)
            self.assertFalse(Path(str(path) + ".gz").exists())
            target = write_canonical_artifact(path, {"preserved": "path"}, preserve_json=False)
            self.assertFalse(path.exists())
            self.assertEqual(read_artifact(target), {"preserved": "path"})

    def test_native_coverage_reads_index_bound_full_compressed_history_and_rejects_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            base = root / "quant/data/sec/canonical"
            payload = {"security": {"ticker": "NEW"}, "facts": [{"value": 1}]}
            target = write_canonical_artifact(base / "NEW.json", payload)
            index = base.parent / "canonical_index.json"
            index.write_text(json.dumps({"companies": [{"ticker": "NEW", "cik": "4100000001", "file": "canonical/NEW.json.gz"}]}))
            self.assertEqual(load_canonical_bundles(root)["4100000001"], payload)
            (base / "NEW.json").write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "DUPLICATE_CANONICAL_STORAGE_IDENTITY"):
                artifact_paths(base)

    def test_committed_canonical_payloads_validate_after_decoding_including_compressed_sources(self):
        root = Path(__file__).resolve().parents[3]
        paths = artifact_paths(root / "quant/data/sec/canonical")
        self.assertTrue(paths)
        for path in paths:
            with self.subTest(path=path.name):
                payload = read_artifact(path)
                self.assertEqual(payload["schema"], "vu-canonical-v1")
                self.assertEqual(payload["dataSource"]["isMock"], False)
                self.assertEqual(len(payload["facts"]), payload["coverage"]["factCount"])
                for fact in payload["facts"] + ((payload.get("industrySpecificMetrics") or {}).get("facts") or []):
                    self.assertLessEqual(fact["periodEnd"], fact["filedAt"])
                    self.assertLessEqual(fact["filedAt"], fact["availableAt"])
