"""Recovered-state verification must fail before touching existing/private state."""
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import sys
SCRIPT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT))
from accepted_state_verify import verify

class AcceptedStateGuards(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir='.')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.snapshot = self.root / 'input.tar.gz'
        self.snapshot.write_bytes(b'not-a-checkpoint')
        self.state = self.root / 'fresh'
        self.expected = {'checkpointBytes':16,'checkpointSha256':hashlib.sha256(self.snapshot.read_bytes()).hexdigest(),'producerCodeSha':'test'}

    def test_hash_mismatch_never_opens_git_or_creates_state(self):
        with patch('accepted_state_verify.subprocess.check_output') as git:
            with self.assertRaisesRegex(AssertionError,'ACCEPTED_HASH_MISMATCH'):
                verify(self.snapshot,self.state,self.root,{**self.expected,'checkpointSha256':'a'*64})
            git.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_size_mismatch_never_opens_git_or_creates_state(self):
        with patch('accepted_state_verify.subprocess.check_output') as git:
            with self.assertRaisesRegex(AssertionError,'ACCEPTED_BYTES_MISMATCH'):
                verify(self.snapshot,self.state,self.root,{**self.expected,'checkpointBytes':1})
            git.assert_not_called()
        self.assertFalse(self.state.exists())

    def test_existing_state_never_touched(self):
        self.state.mkdir();sentinel=self.state/'state.sqlite';sentinel.write_bytes(b'existing authoritative state')
        with patch('accepted_state_verify.subprocess.check_output') as git:
            with self.assertRaisesRegex(AssertionError,'ACCEPTED_RESTORE_REQUIRES_EMPTY_DIRECTORY'):
                verify(self.snapshot,self.state,self.root,self.expected)
            git.assert_not_called()
        self.assertEqual(sentinel.read_bytes(),b'existing authoritative state')

    def test_relative_engine_is_absolute_before_child_changes_cwd(self):
        calls=[]
        def stop(args,**kw):
            calls.append(args);raise RuntimeError('STOP_BEFORE_RESTORE')
        with patch('accepted_state_verify.subprocess.check_output',side_effect=stop):
            with self.assertRaisesRegex(RuntimeError,'STOP_BEFORE_RESTORE'):
                verify(self.snapshot,self.state,self.root,self.expected)
        self.assertEqual(Path(calls[0][2]),self.root.resolve())
        self.assertFalse(self.state.exists())

    def test_wrong_engine_pin_cannot_restore(self):
        with patch('accepted_state_verify.subprocess.check_output',return_value='wrong-pin\n'),patch('accepted_state_verify.subprocess.run') as restore:
            with self.assertRaisesRegex(AssertionError,'ENGINE_PIN_MISMATCH'):
                verify(self.snapshot,self.state,self.root,self.expected)
            restore.assert_not_called()

    def test_dirty_engine_cannot_restore(self):
        with patch('accepted_state_verify.subprocess.check_output',side_effect=['test\n',' M store.py\n']),patch('accepted_state_verify.subprocess.run') as restore:
            with self.assertRaisesRegex(AssertionError,'ENGINE_MUST_BE_CLEAN'):
                verify(self.snapshot,self.state,self.root,self.expected)
            restore.assert_not_called()
