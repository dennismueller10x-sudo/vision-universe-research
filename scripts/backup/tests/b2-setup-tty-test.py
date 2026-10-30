"""Terminal-Test fuer bin/vu-b2-setup-keys.sh: echtes Pseudo-Terminal wie in Google Cloud Shell.

Das Skript liest dabei von /dev/tty (nicht von stdin). Geprueft wird die Eingabelogik:
Tastatur-Puffer, Einfuege-Steuerzeichen, Leerraum, leere/vertauschte/falsche Eingaben, falscher
Master-Key, vorhandene Schluessel, und dass kein Geheimnis im Terminal-Mitschnitt erscheint.

  python3 tests/b2-setup-tty-test.py <fake-api-port>
"""
import json
import os
import pty
import re
import select
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "bin", "vu-b2-setup-keys.sh")
PORT = sys.argv[1]
MASTER_ID = "0123456789ab"
MASTER_KEY = "K003SyntheticMasterKeyValue0001"
PASTE = lambda s: b"\x1b[200~" + s.encode() + b"\x1b[201~"
results = []


def post(path, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(body or {}).encode(),
                                 headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=5).read()


class Term:
    def __init__(self):
        env = dict(os.environ, B2_AUTH_URL=f"http://127.0.0.1:{PORT}/b2auth/key", VU_TEST_NO_CLEAR="1",
                   NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
        for k in ("VU_TEST_STDIN", "AWS_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE", "CURL_CA_BUNDLE"):
            env.pop(k, None)
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.execve("/bin/bash", ["bash", SCRIPT, "vu-backup-production-2026"], env)
        self.out = b""

    def read(self, t=0.3):
        end = time.time() + t
        while time.time() < end:
            r, _, _ = select.select([self.fd], [], [], 0.05)
            if r:
                try:
                    self.out += os.read(self.fd, 65536)
                except OSError:
                    return

    def expect(self, pattern, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            self.read(0.2)
            if re.search(pattern.encode(), self.out):
                return True
        return False

    def expect_n(self, pattern, n, timeout=20):
        end = time.time() + timeout
        while time.time() < end:
            self.read(0.2)
            if len(re.findall(pattern.encode(), self.out)) >= n:
                return True
        return False

    def send(self, data):
        os.write(self.fd, data if isinstance(data, bytes) else data.encode())

    def wait(self, timeout=30):
        end = time.time() + timeout
        while time.time() < end:
            self.read(0.2)
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                self.read(0.3)
                return os.waitstatus_to_exitcode(status)
        os.kill(self.pid, 9)
        return -9

    def text(self):
        return self.out.decode(errors="replace")


def check(name, ok, detail=""):
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))


def secrets_absent(text, *secrets):
    return all(s not in text for s in secrets)


# P01: Zeilenumbruch im Puffer (vom Einfuegen des Startbefehls), dann Einfuegen mit Steuerzeichen + Leerraum
t = Term()
t.send(b"\r")                                  # landet vor der ersten Frage im Puffer
ok1 = t.expect(r"Master keyID \(unsichtbar")
t.send(PASTE(MASTER_ID + "  ") + b"\r")
ok2 = t.expect(r"erhalten: 12 Zeichen")
t.expect(r"Master applicationKey \(unsichtbar")
t.send(PASTE(" " + MASTER_KEY) + b"\r\n")
ok3 = t.expect(r"erhalten: 31 Zeichen")
ok4 = t.expect(r"von Backblaze bestaetigt")
check("P01 Frage sichtbar, Puffer verworfen, Einfuegecodes/Leerraum bereinigt, Master bestaetigt", ok1 and ok2 and ok3 and ok4, t.text()[-300:])
# komplett durchlaufen (6 Anzeigen + Rotation)
for i in range(1, 7):
    t.expect_n(r"Enter (zeigt|leert)", i)
    t.send(b"\r")
t.expect(r"Erledigt\? Enter")
post("/b2/rotate-master")
time.sleep(0.4); t.send(b"\r")
rc = t.wait()
check("P02 vollstaendiger Ablauf im Terminal: Exit 0, Rotation nachgewiesen", rc == 0 and "alter Master-Key: abgewiesen" in t.text(), f"rc={rc} {t.text()[-300:]}")
report = t.text().split("Bericht (ohne Geheimnisse")[-1]
check("P03 Master-Key nie im Terminal sichtbar", secrets_absent(t.text(), MASTER_KEY, MASTER_ID))
check("P04 Bericht ohne Schluesselwerte", "synthetic-app-key" not in report and "applicationKey:" not in report)

# Fuer die weiteren Faelle: frischer Emulator-Zustand (Rotation zuruecksetzen ueber neuen Master)
post("/b2/reset")

# P05: erst leer, dann vertauscht (Key statt keyID), dann normale keyID, dann richtig
t = Term()
t.expect(r"Master keyID \(unsichtbar")
t.send(b"\r")
e1 = t.expect(r"nichts angekommen")
t.expect_n(r"Master keyID \(unsichtbar", 2)
t.send(MASTER_KEY + "\r")
e2 = t.expect(r"sieht aus wie der applicationKey")
t.expect_n(r"Master keyID \(unsichtbar", 3)
t.send("0" * 25 + "\r")
e3 = t.expect(r"keyID eines normalen Schluessels")
rc = t.wait()
check("P05 leere, vertauschte und falsche keyID erkannt; nach 3 Versuchen Abbruch ohne Aenderung",
      e1 and e2 and e3 and rc != 0 and "kein Schluessel angelegt" in t.text() and secrets_absent(t.text(), MASTER_KEY), t.text()[-400:])

# P06: falscher Master-Key (Backblaze 401) -> zweiter Versuch moeglich, dann Abbruch ohne Anlage
t = Term()
for i, kid in enumerate(("aaaaaaaaaaaa", "bbbbbbbbbbbb"), 1):
    t.expect_n(r"Master keyID \(unsichtbar", i)
    t.send(kid + "\r")
    t.expect_n(r"Master applicationKey \(unsichtbar", i)
    t.send(MASTER_KEY + "\r")
rc = t.wait()
check("P06 falscher Master-Key: Backblaze lehnt ab, Abbruch, kein Schluessel angelegt",
      rc != 0 and "lehnt den Schluessel ab" in t.text() and "kein Schluessel angelegt" in t.text()
      and "angelegt: vu-backup" not in t.text(), t.text()[-400:])

# P07: vorhandener Schluessel vu-backup-writer -> Abbruch, nichts veraendert
post("/b2/preexisting", {"keyName": "vu-backup-writer"})
t = Term()
t.expect(r"Master keyID \(unsichtbar")
t.send(MASTER_ID + "\r")
t.expect(r"Master applicationKey \(unsichtbar")
t.send(MASTER_KEY + "\r")
rc = t.wait()
check("P07 vorhandener vu-backup-writer: Abbruch vor jeder Anlage, bestehende Schluessel unveraendert",
      rc != 0 and "bereits Schluessel mit diesen Namen: vu-backup-writer" in t.text() and "angelegt: vu-backup" not in t.text(),
      t.text()[-400:])

print(f"\nErgebnis: {sum(results)} bestanden, {len(results) - sum(results)} fehlgeschlagen")
sys.exit(0 if all(results) else 1)
