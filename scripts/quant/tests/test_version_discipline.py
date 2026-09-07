"""Changing normalization semantics must move NORMALIZATION_LOGIC_VERSION.

This exists because of a real defect found in live run #7. The cover-date fix
in fiscal.py/normalize.py was deployed and every workflow step reported
success -- but `pipeline._is_current()` compares the stored version stamp
against `version_stamp()`, found them equal, and re-used the cached factbooks.
The new logic never executed; the suppressed-cell count stayed at exactly the
old value, which is what gave the silence away.

The digest below is a tripwire: it fails the moment a normalization module
changes without the version constant moving with it.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from quant.sec import version as version_module  # noqa: E402


BUMP_INSTRUCTIONS = (
    "\n\nOne of {sources} changed, so the meaning of stored facts changed too."
    "\nCached factbooks are only re-normalized when the version stamp moves, so:"
    "\n  1. bump NORMALIZATION_LOGIC_VERSION in scripts/quant/sec/version.py"
    "\n     and note WHAT changed in the comment above it, then"
    "\n  2. set NORMALIZATION_SOURCE_DIGEST to the digest below."
    "\nBoth, in the same commit."
)


class VersionDisciplineTests(unittest.TestCase):
    def test_normalization_digest_matches_the_recorded_version(self):
        actual = version_module.normalization_source_digest()
        self.assertEqual(
            actual, version_module.NORMALIZATION_SOURCE_DIGEST,
            BUMP_INSTRUCTIONS.format(
                sources=", ".join(version_module.NORMALIZATION_SOURCES))
            + f"\n\n  expected digest: {actual}",
        )

    def test_every_named_source_exists(self):
        here = Path(version_module.__file__).resolve().parent
        for name in version_module.NORMALIZATION_SOURCES:
            self.assertTrue((here / name).is_file(), f"missing source: {name}")

    def test_the_digest_covers_the_modules_that_assign_periods(self):
        # A module that decides fiscal period, de-accumulation or the canonical
        # boundary belongs in the digest; forgetting one re-opens the defect.
        for name in ("normalize.py", "fiscal.py", "periods.py", "canonical.py"):
            self.assertIn(name, version_module.NORMALIZATION_SOURCES)

    def test_the_digest_is_a_real_sha256(self):
        recorded = version_module.NORMALIZATION_SOURCE_DIGEST
        self.assertEqual(len(recorded), 64)
        self.assertTrue(all(char in "0123456789abcdef" for char in recorded))

    def test_the_version_stamp_carries_the_logic_version(self):
        stamp = version_module.version_stamp()
        self.assertEqual(stamp["normalization_logic"],
                         version_module.NORMALIZATION_LOGIC_VERSION)
