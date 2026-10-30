"""Abnahme gegen einen ECHTEN Backblaze-B2-Test-Bucket - ausschliesslich synthetische Daten.

Prueft die Punkte, die der lokale Emulator nicht belegen kann (docs/TESTPLAN.md, T-B2-*).
Laeuft in einer Wegwerf-Shell (z. B. Google Cloud Shell) mit restic, python3, boto3.

  # Phase 1 (sofort)
  python3 b2-acceptance.py now   --bucket vu-backup-test-<zufall>
  # Phase 2 (fruehestens 2 Tage spaeter; Lifecycle des Test-Buckets: 1 Tag)
  python3 b2-acceptance.py later --bucket vu-backup-test-<zufall>
  # Aufraeumen (T-B2-9)
  python3 b2-acceptance.py cleanup --bucket vu-backup-test-<zufall>

Umgebung (Werte nur aus dem Passwortmanager einfuegen, nie in Dateien):
  VU_S3_ENDPOINT                     z. B. https://s3.eu-central-003.backblazeb2.com
  AWS_ACCESS_KEY_ID/_SECRET_ACCESS_KEY   Test-Schreibschluessel (Rolle writer)
  VU_TEST_ANCHOR_KEY_ID/_KEY         Test-Ankerschluessel (Rolle anchor)
  VU_TEST_DELETER_KEY_ID/_KEY        Test-Loeschschluessel (Rolle test-deleter, nur Test-Bucket)
  VU_TEST_READER_KEY_ID/_KEY         optional: Test-Leseschluessel (Rolle reader)

Schutz: Bricht ab, wenn der Bucketname kein "test" enthaelt oder im Bucket irgendein
Objekt ausserhalb von vu-acceptance/ liegt. Schreibt nur unter vu-acceptance/.
Ausgabe: Ergebnis je Test und b2-acceptance-<phase>.json (ohne Schluesselwerte).
Als GitHub-Lauf: Workflow "VU B2-Abnahme" (Environment backup-test, --state-in-bucket).
--emulator: gegen einen lokalen S3-Emulator (Codepfade pruefen; Rechte-Tests entfallen).
"""
import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

PREFIX = "vu-acceptance/"
HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "bin")
results = []


def record(tid, ok, detail="", na=False):
    status = "n/a" if na else ("PASS" if ok else "FAIL")
    results.append({"test": tid, "status": status, "detail": detail})
    print(f"{status:5} {tid} {detail}")


def s3_for(key_id=None, key=None, checksum="when_supported"):
    cfg = Config(retries={"max_attempts": 5, "mode": "standard"},
                 request_checksum_calculation=checksum, response_checksum_validation="when_supported")
    kw = {"endpoint_url": os.environ["VU_S3_ENDPOINT"], "config": cfg}
    if key_id:
        kw.update(aws_access_key_id=key_id, aws_secret_access_key=key)
    return boto3.client("s3", **kw)


def denied(fn):
    try:
        fn()
        return False, "erlaubt"
    except ClientError as err:
        return True, err.response.get("Error", {}).get("Code", "ClientError")


def restic(env, *args, check=True):
    p = subprocess.run(["restic", *args], env=env, capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"restic {args[0]} rc={p.returncode}: {p.stderr.strip()[-300:]}")
    return p


def sha_file(path):
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


STATE_KEY = PREFIX + "state.json"


def load_state(a, s3):
    if a.state_in_bucket:
        return json.loads(s3.get_object(Bucket=a.bucket, Key=STATE_KEY)["Body"].read())
    return json.load(open(a.state))


def save_state(a, s3, state):
    """Zustand fuer 'later'/'cleanup'. Mit --state-in-bucket im Test-Bucket (fuer GitHub-Laeufe ohne
    bleibende Platte); er enthaelt nur Testkennungen und das Wegwerf-Passwort der synthetischen Daten."""
    if a.state_in_bucket:
        import base64, hashlib
        body = json.dumps(state, indent=1).encode()
        s3.put_object(Bucket=a.bucket, Key=STATE_KEY, Body=body,
                      ContentMD5=base64.b64encode(hashlib.md5(body).digest()).decode())
        return
    fd = os.open(a.state, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as fh:
        json.dump(state, fh, indent=1)


def guard(s3, bucket):
    if "test" not in bucket:
        sys.exit("Abbruch: Bucketname muss 'test' enthalten (nie gegen den Produktions-Bucket)")
    for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket):
        for kind in ("Versions", "DeleteMarkers"):
            for v in page.get(kind, []):
                if not v["Key"].startswith(PREFIX):
                    sys.exit(f"Abbruch: fremdes Objekt im Test-Bucket ({kind}); nur synthetische Daten unter {PREFIX} erlaubt")


def versions(s3, bucket, prefix):
    out = []
    for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=prefix):
        out += [dict(v, marker=False) for v in page.get("Versions", [])]
        out += [dict(v, marker=True) for v in page.get("DeleteMarkers", [])]
    return out


def phase_now(a, s3, state):
    run = state["run"]
    base = f"{PREFIX}{run}/"
    # T-B2-1 Schluesselrechte
    if a.emulator:
        record("T-B2-1 writer ohne deleteFiles", True, na=True)
    else:
        p = subprocess.run([sys.executable, os.path.join(BIN, "vu-key-check.py"), "writer"], capture_output=True, text=True)
        record("T-B2-1 writer ohne deleteFiles", p.returncode == 0, p.stdout.strip()[:200])
        # T-B2-1b/c: tatsaechliche Rechte der anderen Rollen (nur Capability-Namen, keine Werte)
        for role, kid, kval in (("anchor", "VU_TEST_ANCHOR_KEY_ID", "VU_TEST_ANCHOR_KEY"),
                                ("reader", "VU_TEST_READER_KEY_ID", "VU_TEST_READER_KEY")):
            if not os.environ.get(kid):
                record(f"T-B2-1 {role}: Rechte wie vorgesehen", False, "Schluessel nicht gesetzt", na=True)
                continue
            env = dict(os.environ, AWS_ACCESS_KEY_ID=os.environ[kid], AWS_SECRET_ACCESS_KEY=os.environ[kval])
            p = subprocess.run([sys.executable, os.path.join(BIN, "vu-key-check.py"), role], env=env, capture_output=True, text=True)
            record(f"T-B2-1 {role}: Rechte wie vorgesehen", p.returncode == 0, p.stdout.strip()[:200])
    # T-B2-4 Upload in gesperrten Bucket, mit und ohne zusaetzliche Pruefsumme
    for mode in ("when_supported", "when_required"):
        key = f"{base}probe-{mode}.bin"
        try:
            r = s3_for(checksum=mode).put_object(Bucket=a.bucket, Key=key, Body=os.urandom(4096))
            state.setdefault("probes", {})[key] = r.get("VersionId")
            record(f"T-B2-4 PutObject unter Object Lock (checksum={mode})", True)
        except ClientError as err:
            # Ohne Pruefsumme verlangt S3 bei Object Lock Content-MD5 (AWS-Regel). Massgeblich fuer
            # die Sicherung ist, dass restic Pruefsummen sendet (T-B2-2); dieser Fall ist nur Information.
            code = err.response["Error"]["Code"]
            record(f"T-B2-4 PutObject unter Object Lock (checksum={mode})", mode == "when_required",
                   f"{code} (erwartbar ohne Pruefsumme)" if mode == "when_required" else code, na=mode == "when_required")
    probe = f"{base}probe-when_supported.bin"
    vid = state.get("probes", {}).get(probe)
    # T-B2-12 Standard-Sperre des Buckets greift ohne Zutun (Compliance)
    if vid:
        h = s3.head_object(Bucket=a.bucket, Key=probe, VersionId=vid)
        mode, until = h.get("ObjectLockMode"), h.get("ObjectLockRetainUntilDate")
        record("T-B2-12 neue Objekte automatisch gesperrt (Compliance)", a.emulator or mode == "COMPLIANCE",
               f"{mode} bis {until}", na=a.emulator and mode is None)
    # T-B2-3 Schreibschluessel: Version loeschen muss scheitern
    if a.emulator:
        record("T-B2-3 writer kann Versionen nicht loeschen", True, na=True)
    elif vid:
        ok, code = denied(lambda: s3.delete_object(Bucket=a.bucket, Key=probe, VersionId=vid))
        record("T-B2-3 writer kann Versionen nicht loeschen", ok, code)
    # T-B2-3b Loeschschluessel: gesperrte Version (Compliance) loeschen muss scheitern
    dk = os.environ.get("VU_TEST_DELETER_KEY_ID")
    if dk and vid:
        dels3 = s3_for(dk, os.environ["VU_TEST_DELETER_KEY"])
        ok, code = denied(lambda: dels3.delete_object(Bucket=a.bucket, Key=probe, VersionId=vid, BypassGovernanceRetention=True))
        record("T-B2-3b gesperrte Version auch mit deleteFiles+bypass nicht loeschbar", ok, code)
    else:
        record("T-B2-3b gesperrte Version auch mit deleteFiles+bypass nicht loeschbar", False, "Loeschschluessel fehlt", na=True)
    # T-B2-6 Legal Hold mit Ankerschluessel
    ak = os.environ.get("VU_TEST_ANCHOR_KEY_ID")
    hold = f"{base}anchor-probe.bin"
    hv = s3.put_object(Bucket=a.bucket, Key=hold, Body=b"anchor-probe").get("VersionId")
    state["anchor"] = {"key": hold, "versionId": hv}
    holder = s3_for(ak, os.environ["VU_TEST_ANCHOR_KEY"]) if ak else (s3 if a.emulator else None)
    if holder:
        holder.put_object_legal_hold(Bucket=a.bucket, Key=hold, VersionId=hv, LegalHold={"Status": "ON"})
        st = holder.get_object_legal_hold(Bucket=a.bucket, Key=hold, VersionId=hv)["LegalHold"]["Status"]
        record("T-B2-6 Legal Hold mit Ankerschluessel gesetzt", st == "ON", st)
    else:
        record("T-B2-6 Legal Hold mit Ankerschluessel gesetzt", False, "Ankerschluessel fehlt")
    # T-B2-2 restic mit Schreibschluessel: init, backup, forget, prune, check
    work = tempfile.mkdtemp(prefix="vu-b2-acc-")
    env = dict(os.environ, RESTIC_REPOSITORY=f"s3:{os.environ['VU_S3_ENDPOINT']}/{a.bucket}/{base}restic",
               RESTIC_PASSWORD=state["resticPassword"], RESTIC_CACHE_DIR=os.path.join(work, "cache"))
    try:
        data = os.path.join(work, "data")
        os.makedirs(data)
        for i in range(20):
            open(os.path.join(data, f"f{i}.bin"), "wb").write(os.urandom(512 * 1024))
        marker = b"VU-KLARTEXT-MARKER-" + os.urandom(8).hex().encode()
        open(os.path.join(data, "klartext.txt"), "wb").write(marker * 64)
        restic(env, "init")
        restic(env, "backup", data, "--tag", "acc1")
        open(os.path.join(data, "f0.bin"), "wb").write(os.urandom(512 * 1024))
        restic(env, "backup", data, "--tag", "acc2")
        restic(env, "forget", "--keep-last", "1", "--group-by", "")
        restic(env, "prune")
        restic(env, "check", "--read-data")
        record("T-B2-2 restic init/backup/forget/prune/check mit Schreibschluessel", True)
        # T-B2-10 Wiederherstellung: Stand zurueckholen und Datei fuer Datei vergleichen
        back = os.path.join(work, "restored")
        restic(env, "restore", "latest", "--target", back)
        src = {f: sha_file(os.path.join(data, f)) for f in sorted(os.listdir(data))}
        root = os.path.join(back, data.lstrip("/"))
        dst = {f: sha_file(os.path.join(root, f)) for f in sorted(os.listdir(root))} if os.path.isdir(root) else {}
        record("T-B2-10 Wiederherstellung aus B2: alle Dateien identisch (SHA-256)", src == dst, f"{len(dst)}/{len(src)} Dateien")
        # T-B2-11 Verschluesselung: kein Klartext in den Objekten (restic), SSE-B2 auf dem Bucket
        plain = sse = 0
        objs = [o for pg in s3.get_paginator("list_objects_v2").paginate(Bucket=a.bucket, Prefix=f"{base}restic/")
                for o in pg.get("Contents", [])]
        for o in objs:
            r = s3.get_object(Bucket=a.bucket, Key=o["Key"])
            plain += marker in r["Body"].read()
            sse += r.get("ServerSideEncryption") == "AES256"
        record("T-B2-11 kein Klartext in B2 (restic-Verschluesselung)", plain == 0 and len(objs) > 0, f"{len(objs)} Objekte, Treffer {plain}")
        record("T-B2-11b serverseitige Verschluesselung SSE-B2", a.emulator or sse == len(objs),
               f"{sse}/{len(objs)} Objekte mit SSE", na=a.emulator)
    except RuntimeError as err:
        record("T-B2-2 restic init/backup/forget/prune/check mit Schreibschluessel", False, str(err))
    # T-B2-7 Angriff simulieren (alles verbergen) und Point-in-Time-Wiederherstellung
    try:
        at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        time.sleep(2)
        hidden = 0
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=a.bucket, Prefix=f"{base}restic/"):
            for o in page.get("Contents", []):
                s3.delete_object(Bucket=a.bucket, Key=o["Key"])
                hidden += 1
        gone = restic(env, "snapshots", check=False).returncode != 0
        rec = os.path.join(work, "recovered")
        p = subprocess.run([sys.executable, os.path.join(BIN, "vu-pit-recover.py"), "--at", at, "--to-dir", rec],
                           env=dict(os.environ, VU_S3_BUCKET=a.bucket, VU_S3_PREFIX=f"{base}restic/"), capture_output=True, text=True)
        renv = dict(env, RESTIC_REPOSITORY=rec)
        restic(renv, "unlock", "--remove-all", check=False)
        ok = p.returncode == 0 and restic(renv, "check", "--read-data", check=False).returncode == 0
        record("T-B2-7 nach Verbergen aller Dateien: Zustand per Versionen wiederhergestellt", gone and ok,
               f"verborgen={hidden}, Repository danach unsichtbar={gone}")
    except Exception as err:  # noqa: BLE001 - Abnahme soll weiterlaufen
        record("T-B2-7 nach Verbergen aller Dateien: Zustand per Versionen wiederhergestellt", False, type(err).__name__)
    # T-B2-8 Durchsatz (klein, Freikontingent schonen)
    blob = os.path.join(work, "throughput.bin")
    open(blob, "wb").write(os.urandom(100 * 1024 * 1024))
    t0 = time.time(); s3.upload_file(blob, a.bucket, f"{base}throughput.bin"); up = time.time() - t0
    t0 = time.time(); s3.download_file(a.bucket, f"{base}throughput.bin", blob + ".down"); down = time.time() - t0
    record("T-B2-8 Durchsatz 100 MB", True, f"hoch {100 / up:.1f} MB/s, runter {100 / down:.1f} MB/s")
    s3.delete_object(Bucket=a.bucket, Key=f"{base}throughput.bin")
    shutil.rmtree(work, ignore_errors=True)
    state["hiddenAt"] = dt.datetime.now(dt.timezone.utc).isoformat()


def phase_later(a, s3, state):
    base = f"{PREFIX}{state['run']}/"
    vs = versions(s3, a.bucket, base)
    # T-B2-5 Lifecycle hat verborgene, nicht mehr gesperrte Versionen entfernt; Legal Hold blieb
    restic_versions = [v for v in vs if "/restic/" in v["Key"] and not v["marker"]]
    anchor = [v for v in vs if v["Key"] == state["anchor"]["key"] and v.get("VersionId") == state["anchor"]["versionId"]]
    record("T-B2-5 Lifecycle entfernt verborgene Versionen nach Sperrende", len(restic_versions) == 0,
           f"verbliebene Versionen: {len(restic_versions)} (Lifecycle-Regel auf 1 Tag gesetzt?)")
    record("T-B2-6a Legal-Hold-Version unberuehrt von Lifecycle", len(anchor) == 1)
    dk = os.environ.get("VU_TEST_DELETER_KEY_ID")
    if dk and anchor:
        dels3 = s3_for(dk, os.environ["VU_TEST_DELETER_KEY"])
        ok, code = denied(lambda: dels3.delete_object(Bucket=a.bucket, Key=state["anchor"]["key"],
                                                      VersionId=state["anchor"]["versionId"], BypassGovernanceRetention=True))
        record("T-B2-6b Legal-Hold-Version auch nach Ablauf der Retention nicht loeschbar", ok, code)
    print("\nAufraeumen (T-B2-9): Legal Hold mit dem Ankerschluessel aufheben, dann alle Versionen unter "
          f"{PREFIX} mit dem Loeschschluessel entfernen, danach den Loeschschluessel in B2 loeschen.")


def usage_report(s3, bucket):
    """Belegter Speicher im Test-Bucket (alle Versionen) und Hochrechnung der Kosten."""
    total = sum(v.get("Size", 0) for v in versions(s3, bucket, PREFIX) if not v["marker"])
    usd_per_gb = 6.95 / 1000
    record("T-B2-8b Speicher im Test-Bucket (alle Versionen)", True,
           f"{total / 1e6:.1f} MB; Kosten bei Vollbelegung ueber 10 GB frei: {max(0, total / 1e9 - 10) * usd_per_gb:.4f} USD/Monat")


def phase_cleanup(a, s3, state):
    """T-B2-9: Legal Hold aufheben (Ankerschluessel), alle Versionen unter vu-acceptance/ entfernen (Loeschschluessel).
    Gesperrte Versionen (Compliance) lassen sich erst nach Ablauf der Retention entfernen."""
    ak, dk = os.environ.get("VU_TEST_ANCHOR_KEY_ID"), os.environ.get("VU_TEST_DELETER_KEY_ID")
    if not ak or not dk:
        sys.exit("Fuer das Aufraeumen werden Anker- und Loeschschluessel des TEST-Buckets gebraucht")
    holder = s3_for(ak, os.environ["VU_TEST_ANCHOR_KEY"])
    dels3 = s3_for(dk, os.environ["VU_TEST_DELETER_KEY"])
    anchor = state.get("anchor") or {}
    if anchor:
        try:
            holder.put_object_legal_hold(Bucket=a.bucket, Key=anchor["key"], VersionId=anchor["versionId"], LegalHold={"Status": "OFF"})
        except ClientError as err:
            print("Legal Hold:", err.response["Error"]["Code"])
    removed = blocked = 0
    for v in versions(s3, a.bucket, PREFIX):
        try:
            dels3.delete_object(Bucket=a.bucket, Key=v["Key"], VersionId=v["VersionId"])
            removed += 1
        except ClientError:
            blocked += 1
    record("T-B2-9 Test-Bucket geleert", blocked == 0, f"entfernt {removed}, noch gesperrt {blocked} (spaeter wiederholen)")
    print("Danach in B2: Schluessel vu-test-deleter loeschen.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("phase", choices=["now", "later", "cleanup"])
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--state", default="b2-acceptance-state.json")
    ap.add_argument("--state-in-bucket", action="store_true", help="Zustand unter vu-acceptance/state.json im Test-Bucket")
    ap.add_argument("--emulator", action="store_true")
    a = ap.parse_args()
    s3 = s3_for()
    guard(s3, a.bucket)
    if a.phase == "now":
        state = {"run": time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()), "bucket": a.bucket,
                 "resticPassword": os.urandom(24).hex()}   # nur fuer synthetische Testdaten
        phase_now(a, s3, state)
        save_state(a, s3, state)
    elif a.phase == "later":
        phase_later(a, s3, load_state(a, s3))
    else:
        phase_cleanup(a, s3, load_state(a, s3))
    if a.phase != "cleanup":
        usage_report(s3, a.bucket)
    report = {"phase": a.phase, "bucket": a.bucket, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "results": results}
    json.dump(report, open(f"b2-acceptance-{a.phase}.json", "w"), indent=1)
    failed = [r for r in results if r["status"] == "FAIL"]
    print(f"\n{len(results) - len(failed)} von {len(results)} ohne Fehler; Bericht: b2-acceptance-{a.phase}.json")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
