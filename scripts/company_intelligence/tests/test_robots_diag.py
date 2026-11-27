import socket
import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from urllib.error import URLError
from company_intelligence.transport import PublicHTTP, SourceError, robots_diag_line


class RobotsDiagTests(unittest.TestCase):
    def test_line_has_only_scheme_host_and_error_class(self):
        line = robots_diag_line('https://ir.example.com:8443/path?q=secret', SourceError('HTTP_403'))
        self.assertEqual(line, 'ROBOTS_DIAG origin=https://ir.example.com error=HTTP_403 cause=-')
        for forbidden in ('?', 'secret', '/path', '8443'):
            self.assertNotIn(forbidden, line)

    def test_cause_class_is_named(self):
        line = robots_diag_line('https://a.example', SourceError('NETWORK_UNAVAILABLE'), URLError(socket.timeout('timed out')))
        self.assertIn('cause=URLError/', line)

    def test_failed_robots_read_logs_once_per_origin_without_query_and_does_not_fetch(self):
        def opener(request, timeout=0):
            raise URLError(socket.gaierror(socket.EAI_AGAIN, 'temporary'))
        with tempfile.TemporaryDirectory() as tmp:
            http = PublicHTTP(Path(tmp), opener=opener, sleep=lambda s: None, validator=lambda u: u)
            buf = StringIO()
            with redirect_stderr(buf):
                for path in ('/a?token=abc', '/b?x=1'):
                    with self.assertRaises(SourceError) as caught:
                        http.robots_allowed('https://ir.example.com' + path)
                    self.assertTrue(str(caught.exception).startswith('ROBOTS_UNAVAILABLE'))
            lines = [l for l in buf.getvalue().splitlines() if l.startswith('ROBOTS_DIAG')]
            self.assertEqual(len(lines), 1)
            self.assertEqual(lines[0].split()[1], 'origin=https://ir.example.com')
            for forbidden in ('token', 'abc', '?', '/a', '/b'):
                self.assertNotIn(forbidden, lines[0])
            self.assertEqual(http.stats['robotsFailureMemoHits'], 1)
            self.assertFalse(http.robots)


if __name__ == '__main__':
    unittest.main()
