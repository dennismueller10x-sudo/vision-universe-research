import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('secure_evidence', Path(__file__).with_name('secure_evidence.py'))
secure = importlib.util.module_from_spec(spec)
spec.loader.exec_module(secure)


class EnvelopeTests(unittest.TestCase):
    def fixture(self, path):
        raw = path / 'raw.json'
        raw.write_bytes(b'{"private": "audit evidence"}')
        encrypted = path / 'evidence.enc'
        secure.encrypt(raw, encrypted)
        return raw, encrypted, path / 'restored.json'

    @patch.dict(os.environ, {'TIINGO_API_KEY': 'test-only-envelope-password'})
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            raw, encrypted, restored = self.fixture(Path(directory))
            secure.decrypt(encrypted, restored)
            self.assertEqual(raw.read_bytes(), restored.read_bytes())
            self.assertNotIn(raw.read_bytes(), encrypted.read_bytes())

    @patch.dict(os.environ, {'TIINGO_API_KEY': 'test-only-envelope-password'})
    def test_wrong_key_writes_no_plaintext(self):
        with tempfile.TemporaryDirectory() as directory:
            _, encrypted, restored = self.fixture(Path(directory))
            with patch.dict(os.environ, {'TIINGO_API_KEY': 'different-test-password'}):
                with self.assertRaisesRegex(ValueError, 'authentication failed'):
                    secure.decrypt(encrypted, restored)
            self.assertFalse(restored.exists())

    @patch.dict(os.environ, {'TIINGO_API_KEY': 'test-only-envelope-password'})
    def test_tampering_writes_no_plaintext(self):
        with tempfile.TemporaryDirectory() as directory:
            _, encrypted, restored = self.fixture(Path(directory))
            body = bytearray(encrypted.read_bytes())
            body[-1] ^= 1
            encrypted.write_bytes(body)
            with self.assertRaisesRegex(ValueError, 'authentication failed'):
                secure.decrypt(encrypted, restored)
            self.assertFalse(restored.exists())
