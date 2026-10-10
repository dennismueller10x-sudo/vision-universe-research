import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from company_intelligence.current_state_acceptance import database_proof, verify


class CurrentStateAcceptanceTests(unittest.TestCase):
    def test_complete_table_proof_covers_aliases_audit_profiles_checkpoints_and_archive_blobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'state.sqlite'
            with sqlite3.connect(path) as db:
                db.executescript("CREATE TABLE event_alias(alias TEXT PRIMARY KEY,target TEXT); CREATE TABLE audit(id TEXT PRIMARY KEY,payload TEXT); CREATE TABLE state(key TEXT PRIMARY KEY,payload TEXT); CREATE TABLE history(kind TEXT,id TEXT,payload BLOB,PRIMARY KEY(kind,id));")
                db.execute('INSERT INTO event_alias VALUES (?,?)', ('old', 'current'))
                db.execute('INSERT INTO audit VALUES (?,?)', ('correction', '{"withdrawn":true}'))
                db.execute('INSERT INTO state VALUES (?,?)', ('companyProfile:a', '{"description":"fact"}'))
                db.execute('INSERT INTO state VALUES (?,?)', ('inventorySweep:checkpoint', '{"pending":["a"]}'))
                db.execute('INSERT INTO history VALUES (?,?,?)', ('news', 'a', b'private compressed bytes'))
            before = database_proof(path)
            self.assertEqual(set(before['tables']), {'event_alias', 'audit', 'state', 'history'})
            self.assertEqual(before['tables']['state']['count'], 2)
            with sqlite3.connect(path) as db:
                db.execute('UPDATE event_alias SET target=?', ('wrong',))
            after = database_proof(path)
            self.assertNotEqual(before['logicalHash'], after['logicalHash'])
            self.assertEqual(before['tables']['state'], after['tables']['state'])
            self.assertEqual(before['tables']['history'], after['tables']['history'])

    def test_missing_or_smaller_checkpoint_does_not_create_a_replacement_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            snap = base / 'checkpoint.tar.gz'
            snap.write_bytes(b'smaller checkpoint')
            expected = {'checkpointBytes': 100, 'checkpointSha256': hashlib.sha256(snap.read_bytes()).hexdigest()}
            with patch('company_intelligence.current_state_acceptance.subprocess.run') as run:
                with self.assertRaisesRegex(ValueError, 'DOES_NOT_MATCH_AUTHORITATIVE'):
                    verify(snap, base / 'fresh', base / 'producer', expected)
                run.assert_not_called()
            self.assertFalse((base / 'fresh').exists())

    def test_existing_restore_directory_and_wrong_producer_are_refused_before_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            snap = base / 'snapshot'
            snap.write_bytes(b'checkpoint')
            expected = {'checkpointBytes': snap.stat().st_size, 'checkpointSha256': hashlib.sha256(snap.read_bytes()).hexdigest(), 'producerCodeSha': 'a' * 40}
            (base / 'existing').mkdir()
            with self.assertRaisesRegex(ValueError, 'FRESH_DIRECTORY'):
                verify(snap, base / 'existing', base / 'producer', expected)
            with patch('company_intelligence.current_state_acceptance.subprocess.check_output', return_value='b' * 40), patch('company_intelligence.current_state_acceptance.subprocess.run') as run:
                with self.assertRaisesRegex(ValueError, 'CLEAN_PINNED_COMMIT'):
                    verify(snap, base / 'fresh', base / 'producer', expected)
                run.assert_not_called()
            self.assertFalse((base / 'fresh').exists())
