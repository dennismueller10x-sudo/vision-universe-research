"""Die Groessenkontrolle muss den Commit messen, nicht die Platte.

Lauf 34713330734 hat den gesamten Backfill durchlaufen, die Coverage
gemessen - und ist an der Groessenkontrolle gescheitert:
quant/data/sec lag mit 589 MB auf der Platte, weil dort der
Faktenspeicher liegt. Der steht in .gitignore; git haette 18 Dateien
gesehen. Der Schritt hat einen fertigen Lauf wegen Daten abgebrochen,
die er nie angefasst haette.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKRIPT = ROOT / "scripts" / "ci" / "pruefe-datengroesse.sh"


def git(*args, cwd):
    subprocess.run(["git", *args], cwd=cwd, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class GroessenkontrolleTests(unittest.TestCase):
    def setUp(self):
        if not SKRIPT.exists():
            self.skipTest("Skript fehlt")
        self._tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self._tmp.name)
        git("init", cwd=self.repo)
        git("config", "user.email", "t@t.tt", cwd=self.repo)
        git("config", "user.name", "t", cwd=self.repo)
        for d in ("fundamentals", "universe", "sec"):
            (self.repo / "quant" / "data" / d).mkdir(parents=True)

    def tearDown(self):
        self._tmp.cleanup()

    def _lauf(self, grenze="400"):
        return subprocess.run(
            ["bash", str(SKRIPT)], cwd=self.repo, capture_output=True, text=True,
            env={**os.environ, "GRENZE_MB": grenze})

    def _schreibe(self, pfad, megabyte):
        ziel = self.repo / pfad
        ziel.parent.mkdir(parents=True, exist_ok=True)
        ziel.write_bytes(b"x" * (megabyte * 1024 * 1024))

    def test_ignorierte_dateien_zaehlen_nicht(self):
        """Der eigentliche Befund: der Faktenspeicher ist gitignored."""
        (self.repo / ".gitignore").write_text("quant/data/sec/facts/\n")
        self._schreibe("quant/data/sec/facts/gross.bin", 12)
        ergebnis = self._lauf(grenze="5")
        self.assertEqual(ergebnis.returncode, 0, ergebnis.stdout + ergebnis.stderr)
        self.assertIn("0 MB im Commit", ergebnis.stdout)

    def test_eine_wirklich_committete_datei_bricht_ab(self):
        self._schreibe("quant/data/sec/gross.json", 12)
        ergebnis = self._lauf(grenze="5")
        self.assertEqual(ergebnis.returncode, 1)
        self.assertIn("::error::", ergebnis.stdout)

    def test_verfolgte_dateien_zaehlen_mit(self):
        self._schreibe("quant/data/universe/gross.json", 12)
        git("add", "quant/data/universe/gross.json", cwd=self.repo)
        git("commit", "-m", "x", cwd=self.repo)
        ergebnis = self._lauf(grenze="5")
        self.assertEqual(ergebnis.returncode, 1)

    def test_ein_leerer_bestand_ist_kein_fehler(self):
        ergebnis = self._lauf()
        self.assertEqual(ergebnis.returncode, 0, ergebnis.stdout + ergebnis.stderr)

    def test_die_platte_wird_zur_einordnung_mitgemeldet(self):
        """Damit "0 MB" nicht wie ein kaputter Zaehler aussieht."""
        (self.repo / ".gitignore").write_text("quant/data/sec/facts/\n")
        self._schreibe("quant/data/sec/facts/gross.bin", 12)
        ergebnis = self._lauf()
        self.assertIn("auf der Platte", ergebnis.stdout)


if __name__ == "__main__":
    unittest.main()
