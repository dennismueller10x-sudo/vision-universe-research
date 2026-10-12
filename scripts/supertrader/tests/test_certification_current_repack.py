import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

MODULE = Path(__file__).parents[1] / 'research' / 'certification' / 'repack-current-artifact.py'
spec = importlib.util.spec_from_file_location('current_ciphertext_transport', MODULE)
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)


def envelope():
    return {'schema': 'supertrader-sealed-1.0.0', 'alg': 'RSA-OAEP-256+A256GCM+gzip',
            'wrappedKey': 'AAAA', 'iv': 'AAAA', 'tag': 'AAAA', 'body': 'AAAA'}


class CurrentTransportTests(unittest.TestCase):
    def test_raw_and_single_outer_string_owner_session_files_roundtrip_original_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / 'source', Path(tmp) / 'output'
            source.mkdir()
            raw = json.dumps(envelope())
            for audience in ['owner', 'session']:
                (source / f'raw.{audience}.sealed.json').write_text(raw + '\n')
                (source / f'quoted.{audience}.sealed.json').write_text(json.dumps(raw) + '\n')
            originals = {p.name: p.read_bytes() for p in source.iterdir()}
            status = transport.repack(source, output, target_bytes=1500, max_zip_bytes=2048)
            manifest = json.loads((output / 'repack-manifest.json').read_text())
            recovered = {}
            for bundle in manifest['bundles']:
                with zipfile.ZipFile(output / bundle['file']) as archive:
                    recovered.update({n: archive.read(n) for n in archive.namelist()})
            self.assertEqual(recovered, originals)
            self.assertEqual({p.name: p.read_bytes() for p in source.iterdir()}, originals)
            for entry in manifest['sourceFiles']:
                self.assertEqual(entry['sha256'], hashlib.sha256(originals[entry['relativePath']]).hexdigest())
            self.assertEqual(status['providerReads'], 0)
            self.assertFalse(status['decrypted'])
            self.assertFalse(status['performanceCalculated'])
            self.assertEqual(transport.TARGET_BYTES, 24 * 1024 * 1024)
            self.assertEqual(transport.MAX_ZIP_BYTES, 32 * 1024 * 1024)

    def test_nested_strings_arrays_plaintext_invalid_schema_base64_and_extra_fields_rejected(self):
        raw = json.dumps(envelope())
        invalid = [json.dumps(json.dumps(raw)), json.dumps([envelope()]), json.dumps('plaintext'),
                   json.dumps({'close': 100}), json.dumps({**envelope(), 'alg': 'OTHER'}),
                   json.dumps({**envelope(), 'body': '!!!'}), json.dumps({**envelope(), 'body': ''}),
                   json.dumps({**envelope(), 'raw': 'unapproved'}),
                   raw.replace('"body": "AAAA"', '"body": "AAAA", "body": "AAAA"')]
        for payload in invalid:
            with self.subTest(payloadKind='INVALID_ENVELOPE'), tempfile.TemporaryDirectory() as tmp:
                source = Path(tmp) / 'source'; source.mkdir()
                (source / 'invalid.session.sealed.json').write_text(payload)
                with self.assertRaises((ValueError, json.JSONDecodeError)):
                    transport.repack(source, Path(tmp) / 'output')

    def test_raw_files_paths_and_symlinks_rejected_without_following_links(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / 'source'; source.mkdir()
            raw = source / 'raw.json'; raw.write_text('{"close":100}')
            with self.assertRaisesRegex(ValueError, 'RAW_OR_UNAPPROVED_FILE_REJECTED'):
                transport.repack(source, Path(tmp) / 'raw-output')
            raw.unlink()
            p = source / 'good.session.sealed.json'; p.write_text(json.dumps(envelope()))
            with self.assertRaisesRegex(ValueError, 'UNAPPROVED_ARTIFACT_PATH'):
                transport.approved_file(p, Path('../good.session.sealed.json'))
            p.unlink(); p.symlink_to(MODULE)
            with self.assertRaisesRegex(ValueError, 'ARTIFACT_SYMLINK_REJECTED'):
                transport.repack(source, Path(tmp) / 'symlink-output')


if __name__ == '__main__':
    unittest.main()
