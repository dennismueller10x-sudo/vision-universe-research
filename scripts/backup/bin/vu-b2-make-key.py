"""Legt einen Backblaze-B2-Anwendungsschluessel mit GENAU den Rechten einer Rolle an.

Die Web-Oberflaeche bietet nur "Read and Write" / "Read Only" / "Write Only". Der
Schreibschluessel fuer restic braucht aber listFiles+readFiles+writeFiles OHNE
deleteFiles - das geht nur ueber die API. Dieses Skript laeuft in einer Wegwerf-Shell
(z. B. Google Cloud Shell im Ephemeral-Modus) und braucht den Master-Schluessel nur
fuer diesen einen Aufruf.

  B2_MASTER_KEY_ID=... B2_MASTER_KEY=... \\
    python3 vu-b2-make-key.py --bucket <name> --role writer --name vu-backup-writer [--days 365]
  ... vu-b2-make-key.py --bucket <name> --inspect     nur pruefen: privat, SSE, Object Lock, Endpunkt

Rollen:
  writer        listBuckets listFiles readFiles writeFiles
  anchor        listBuckets listFiles readFiles readFileLegalHolds writeFileLegalHolds readFileRetentions
  reader        listBuckets listFiles readFiles
  test-deleter  wie writer + deleteFiles + bypassGovernance  (NUR fuer Buckets mit "test" im Namen,
                nur fuer die Abnahme T-B2-3b/T-B2-6b; danach loeschen)

Ausgabe: keyID und applicationKey EINMAL auf dem Terminal (nicht in Dateien, nicht in
Logs) - direkt in den Passwortmanager kopieren. Mit --out wird stattdessen eine Datei
mit Rechten 600 geschrieben. B2_API_URL ist fuer Tests umstellbar.
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

AUTH_URL = os.environ.get("B2_AUTH_URL", "https://api.backblazeb2.com/b2api/v3/b2_authorize_account")
ROLES = {
    "writer": ["listBuckets", "listFiles", "readFiles", "writeFiles"],
    "anchor": ["listBuckets", "listFiles", "readFiles", "readFileLegalHolds", "writeFileLegalHolds", "readFileRetentions"],
    "reader": ["listBuckets", "listFiles", "readFiles"],
    "test-deleter": ["listBuckets", "listFiles", "readFiles", "writeFiles", "deleteFiles", "bypassGovernance"],
}


def call(url, headers, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={**headers, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        detail = json.loads(err.read() or b"{}").get("code", "")
        sys.exit(f"B2-API {err.code} {detail}")


def check_master(auth, api, token):
    """Master-Key? (writeKeys + listKeys, keine Bucket-Bindung). Nennt vorhandene vu-backup-*-Schluessel (nur Namen)."""
    allowed = auth["apiInfo"]["storageApi"].get("allowed") or {}
    caps = set(allowed.get("capabilities") or [])
    is_master = {"writeKeys", "listKeys", "deleteKeys"} <= caps and not allowed.get("buckets") and not allowed.get("bucketId")
    names, start = [], None
    if is_master:
        while True:
            body = {"accountId": auth["accountId"], "maxKeyCount": 1000}
            if start:
                body["startApplicationKeyId"] = start
            page = call(f"{api}/b2api/v3/b2_list_keys", token, body)
            names += [k["keyName"] for k in page.get("keys", []) if k.get("keyName", "").startswith("vu-backup-")]
            start = page.get("nextApplicationKeyId")
            if not start:
                break
    print(json.dumps({"master": is_master, "existingVuBackupKeys": sorted(names)}))
    return 0 if is_master and not names else 1


def bucket_facts(bucket, auth):
    """Einrichtung des Buckets (nur lesen): privat, Verschluesselung, Object Lock Compliance, Lifecycle."""
    lock = (bucket.get("fileLockConfiguration") or {}).get("value") or {}
    ret = (lock.get("defaultRetention") or {})
    period = ret.get("period") or {}
    sse = ((bucket.get("defaultServerSideEncryption") or {}).get("value") or {}).get("mode")
    facts = {
        "bucket": bucket.get("bucketName"),
        "s3Endpoint": (auth.get("apiInfo") or {}).get("storageApi", {}).get("s3ApiUrl"),
        "private": bucket.get("bucketType") == "allPrivate",
        "encryption": sse,
        "objectLock": bool(lock.get("isFileLockEnabled")),
        "defaultRetention": f"{ret.get('mode')} {period.get('duration')} {period.get('unit')}" if ret.get("mode") else None,
        "lifecycleRules": bucket.get("lifecycleRules") or [],
        "problems": [],
    }
    if not facts["private"]:
        facts["problems"].append("Bucket ist nicht privat")
    if not sse:
        facts["problems"].append("keine serverseitige Verschluesselung")
    if not facts["objectLock"]:
        facts["problems"].append("Object Lock nicht aktiviert")
    elif (ret.get("mode") or "").lower() != "compliance":
        facts["problems"].append("Standard-Sperre ist nicht Compliance")
    if facts["s3Endpoint"] and "eu-central" not in facts["s3Endpoint"]:
        facts["problems"].append("Konto liegt nicht in EU Central")
    return facts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--inspect", action="store_true", help="nur Bucket pruefen und S3-Endpunkt zeigen, nichts anlegen")
    ap.add_argument("--check-master", action="store_true",
                    help="nur pruefen: ist es der Master-Key (writeKeys, ohne Bucket-Bindung)? vorhandene vu-backup-* Schluessel nennen")
    ap.add_argument("--role", choices=sorted(ROLES))
    ap.add_argument("--name")
    ap.add_argument("--days", type=int, default=0, help="Ablauf in Tagen (0 = kein Ablauf, max. 999)")
    ap.add_argument("--out", help="Datei (Rechte 600) statt Terminal")
    a = ap.parse_args()
    if not (a.inspect or a.check_master) and (not a.role or not a.name):
        sys.exit("--role und --name angeben (oder --inspect)")
    if a.role == "test-deleter" and "test" not in a.bucket:
        sys.exit("test-deleter nur fuer Test-Buckets (Name enthaelt 'test')")
    kid, key = os.environ.get("B2_MASTER_KEY_ID"), os.environ.get("B2_MASTER_KEY")
    if not kid or not key:
        sys.exit("B2_MASTER_KEY_ID und B2_MASTER_KEY in der Umgebung setzen (nicht als Argument)")
    auth = call(AUTH_URL, {"Authorization": "Basic " + base64.b64encode(f"{kid}:{key}".encode()).decode()})
    api = auth["apiInfo"]["storageApi"]["apiUrl"]
    token = {"Authorization": auth["authorizationToken"]}
    if a.check_master:
        return check_master(auth, api, token)
    buckets = call(f"{api}/b2api/v3/b2_list_buckets", token, {"accountId": auth["accountId"], "bucketName": a.bucket})["buckets"]
    if len(buckets) != 1:
        sys.exit(f"Bucket {a.bucket} nicht gefunden")
    bucket = buckets[0]
    facts = bucket_facts(bucket, auth)
    if a.inspect:
        print(json.dumps(facts, indent=1))
        return 0 if not facts["problems"] else 1
    if a.role in ("writer", "anchor") and facts["problems"]:
        sys.exit("Bucket nicht wie vorgesehen eingerichtet: " + "; ".join(facts["problems"]))
    # API v4: Bucket-Bindung ueber "bucketIds" (v3 hatte "bucketId"; in v4 entfernt)
    body = {"accountId": auth["accountId"], "capabilities": ROLES[a.role], "keyName": a.name, "bucketIds": [bucket["bucketId"]]}
    if a.days:
        body["validDurationInSeconds"] = min(a.days, 999) * 86400
    created = call(f"{api}/b2api/v4/b2_create_key", token, body)
    # Fail closed: stimmt der angelegte Schluessel nicht genau (Rechte, ein Bucket), sofort wieder loeschen
    bound = created.get("bucketIds") or ([created["bucketId"]] if created.get("bucketId") else [])
    if sorted(created.get("capabilities") or []) != sorted(ROLES[a.role]) or bound != [bucket["bucketId"]]:
        try:
            call(f"{api}/b2api/v4/b2_delete_key", token, {"applicationKeyId": created["applicationKeyId"]})
        except SystemExit:
            sys.exit(f"Angelegter Schluessel weicht ab und konnte NICHT geloescht werden: in Backblaze unter "
                     f"Application Keys den Schluessel '{created.get('keyName')}' von Hand loeschen.")
        sys.exit("Angelegter Schluessel weicht ab (Rechte oder Bucket-Bindung) und wurde sofort wieder geloescht. Nichts uebernehmen.")
    out = {"keyName": created["keyName"], "keyID": created["applicationKeyId"], "applicationKey": created["applicationKey"],
           "capabilities": created["capabilities"], "bucket": a.bucket}
    if a.out:
        fd = os.open(a.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as fh:
            json.dump(out, fh, indent=1)
        print(f"geschrieben: {a.out} (Rechte 600). Nach dem Uebertragen in den Passwortmanager loeschen: shred -u {a.out}")
    else:
        print(json.dumps(out, indent=1))
        print("\nJetzt keyID und applicationKey in den Passwortmanager kopieren. Der applicationKey ist spaeter nicht mehr abrufbar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
