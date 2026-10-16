"""Synthetic public release guard. No Brevo, Cloudflare or inbox access."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import newsletter_release as release

PUBLIC = '<!doctype html><html lang="de" data-policy-status="approved" data-newsletter-release-scope="public"><head><title>Datenschutz</title></head><body>Geprüfte synthetische Fassung.</body></html>'


class Release(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.tested = Path(self.temp.name) / 'tested'
        self.publication = Path(self.temp.name) / 'publication'
        for root in (self.tested, self.publication):
            for relative in release.TESTED_FILES:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('Synthetic unchanged newsletter source')
            (root / release.POLICY).parent.mkdir(parents=True, exist_ok=True)
            (root / release.POLICY).write_text(PUBLIC)

    def prepare(self, text=PUBLIC, digest=None):
        (self.publication / release.POLICY).write_text(text)
        return release.prepare_public_policy(self.tested, self.publication, digest or hashlib.sha256(text.encode()).hexdigest())

    def test_only_exact_public_policy_changes_and_functional_files_remain_identical(self):
        (self.tested / release.POLICY).write_text('Earlier approved controlled policy')
        result = self.prepare()
        self.assertEqual((self.tested / release.POLICY).read_text(), PUBLIC)
        self.assertEqual(result['functional_files_overwritten'], 0)
        for relative in release.TESTED_FILES:
            self.assertEqual((self.tested / relative).read_bytes(), (self.publication / relative).read_bytes())

    def test_relevant_changes_require_new_acceptance_before_policy_can_be_overlaid(self):
        for relative in release.TESTED_FILES:
            path = self.publication / relative
            original = path.read_bytes()
            path.write_text('Relevant change')
            before = (self.tested / release.POLICY).read_bytes()
            with self.subTest(path=relative), self.assertRaisesRegex(ValueError, 'flow changed'):
                self.prepare()
            self.assertEqual((self.tested / release.POLICY).read_bytes(), before)
            path.write_bytes(original)

    def test_draft_controlled_unresolved_and_ambiguous_documents_stay_blocked(self):
        for text in (PUBLIC.replace('approved', 'draft'), PUBLIC.replace('public', 'controlled'),
                     PUBLIC.replace('public', 'unknown'), PUBLIC.replace('Geprüfte', 'OFFEN: Geprüfte'),
                     PUBLIC + '<html lang="de">', PUBLIC.replace('lang="de"', 'lang="de" lang="en"')):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.prepare(text)

    def test_unapproved_hash_and_escaped_source_stay_blocked(self):
        for value in ('', 'incorrect', 'f' * 64):
            with self.subTest(digest=value), self.assertRaises(ValueError):
                release.prepare_public_policy(self.tested, self.publication, value)
        path = self.publication / release.TESTED_FILES[0]
        path.unlink()
        path.symlink_to(self.tested / release.TESTED_FILES[0])
        with self.assertRaises(ValueError):
            self.prepare()

    def test_untrusted_dispatch_never_overlays_policy(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(release, 'prepare_public_policy') as prepare:
            with self.assertRaises(ValueError):
                release.run()
            prepare.assert_not_called()


if __name__ == '__main__':
    unittest.main()
