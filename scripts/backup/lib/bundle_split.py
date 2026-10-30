"""Geteiltes Voll-Bundle: Bundle-Kopf (.head) + unveraendertes Pack des Mirrors (.pack, Hardlink).

Ein Git-Bundle v2 ist "# v2 git bundle\\n", je Ref "<oid> <refname>\\n", eine Leerzeile und ein
Packfile. Der Mirror-Klon enthaelt genau ein solches Pack mit allen Objekten. Statt es mit
`git bundle create --all` ein zweites Mal zu schreiben (zweite volle Kopie auf der Platte),
wird es per Hardlink uebernommen. Die Pruefsumme in chain.txt gilt fuer head+pack zusammen,
also fuer genau das Bundle, das `cat x.head x.pack` ergibt.

  bundle_split.py check <head> <pack> [<idx>]   Format, Pack-Trailer (SHA-1 ueber das ganze Pack),
                                                Abgleich mit dem .idx; gibt SHA-256 von head+pack aus
  bundle_split.py sha <datei> [<datei> ...]     SHA-256 der Verkettung

Exit 0 in Ordnung, 1 Fehler (Meldung auf stderr).
"""
import hashlib
import sys

BLOCK = 4 << 20


def fail(msg):
    sys.stderr.write(msg + "\n")
    sys.exit(1)


def check_head(path):
    data = open(path, "rb").read()
    lines = data.split(b"\n")
    if not data.startswith(b"# v2 git bundle\n") or not data.endswith(b"\n\n"):
        fail("Bundle-Kopf: falsches Format")
    refs = [l for l in lines[1:] if l]
    if not refs:
        fail("Bundle-Kopf: keine Refs")
    for line in refs:
        if line.startswith(b"-"):
            fail("Bundle-Kopf: Voraussetzungen in einem Voll-Bundle")
        oid, _, name = line.partition(b" ")
        if len(oid) not in (40, 64) or not name or any(c not in b"0123456789abcdef" for c in oid):
            fail("Bundle-Kopf: ungueltige Zeile")
    return data


def check(head, pack, idx=None):
    total = hashlib.sha256(check_head(head))
    sha1 = hashlib.sha1()
    size = 0
    with open(pack, "rb") as fh:
        first = fh.read(12)
        if len(first) < 12 or first[:4] != b"PACK" or int.from_bytes(first[4:8], "big") not in (2, 3):
            fail("Pack: kein gueltiger Pack-Kopf")
        fh.seek(0)
        pending = b""   # die letzten 20 Bytes (Trailer) gehen nicht in die SHA-1 ein
        for block in iter(lambda: fh.read(BLOCK), b""):
            total.update(block)
            size += len(block)
            data = pending + block
            sha1.update(data[:-20])
            pending = data[-20:]
    if len(pending) < 20 or size < 32:
        fail("Pack: zu kurz")
    trailer = pending
    if sha1.digest() != trailer:
        fail("Pack: Pruefsumme (Trailer) stimmt nicht, Pack beschaedigt")
    if idx:
        raw = open(idx, "rb").read()
        if len(raw) < 40 or raw[-40:-20] != trailer:
            fail("Pack: passt nicht zum Index (.idx)")
    print(total.hexdigest())
    return size


def sha(paths):
    h = hashlib.sha256()
    for p in paths:
        with open(p, "rb") as fh:
            for block in iter(lambda: fh.read(BLOCK), b""):
                h.update(block)
    print(h.hexdigest())


def main():
    if len(sys.argv) >= 4 and sys.argv[1] == "check":
        check(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
    elif len(sys.argv) >= 3 and sys.argv[1] == "sha":
        sha(sys.argv[2:])
    else:
        fail(__doc__)


if __name__ == "__main__":
    main()
