"""Legt einen Backblaze-B2-Anwendungsschluessel mit GENAU den Rechten einer Rolle an.

Die Web-Oberflaeche bietet nur "Read and Write" / "Read Only" / "Write Only". Der
Schreibschluessel fuer restic braucht aber listFiles+readFiles+writeFiles OHNE
deleteFiles - das geht nur ueber die API. Dieses Skript laeuft in einer Wegwerf-Shell
(z. B. Google Cloud Shell im Ephemeral-Modus) und braucht den Master-Schluessel nur
fuer diesen einen Aufruf.

  B2_MASTER_KEY_ID=... B2_MASTER_KEY=... \\
    python3 vu-b2-make-key.py --bucket <name> --role writer --name vu-backup-writer [--days 365]

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bucket", required=True)
    ap.add_argument("--role", required=True, choices=sorted(ROLES))
    ap.add_argument("--name", required=True)
    ap.add_argument("--days", type=int, default=0, help="Ablauf in Tagen (0 = kein Ablauf, max. 999)")
    ap.add_argument("--out", help="Datei (Rechte 600) statt Terminal")
    a = ap.parse_args()
    if a.role == "test-deleter" and "test" not in a.bucket:
        sys.exit("test-deleter nur fuer Test-Buckets (Name enthaelt 'test')")
    kid, key = os.environ.get("B2_MASTER_KEY_ID"), os.environ.get("B2_MASTER_KEY")
    if not kid or not key:
        sys.exit("B2_MASTER_KEY_ID und B2_MASTER_KEY in der Umgebung setzen (nicht als Argument)")
    auth = call(AUTH_URL, {"Authorization": "Basic " + base64.b64encode(f"{kid}:{key}".encode()).decode()})
    api = auth["apiInfo"]["storageApi"]["apiUrl"]
    token = {"Authorization": auth["authorizationToken"]}
    buckets = call(f"{api}/b2api/v3/b2_list_buckets", token, {"accountId": auth["accountId"], "bucketName": a.bucket})["buckets"]
    if len(buckets) != 1:
        sys.exit(f"Bucket {a.bucket} nicht gefunden")
    bucket = buckets[0]
    if a.role in ("writer", "anchor") and not (bucket.get("fileLockConfiguration", {}).get("value") or {}).get("isFileLockEnabled"):
        sys.exit("Object Lock ist fuer diesen Bucket nicht aktiviert - erst aktivieren")
    # API v4: Bucket-Bindung ueber "bucketIds" (v3 hatte "bucketId"; in v4 entfernt)
    body = {"accountId": auth["accountId"], "capabilities": ROLES[a.role], "keyName": a.name, "bucketIds": [bucket["bucketId"]]}
    if a.days:
        body["validDurationInSeconds"] = min(a.days, 999) * 86400
    created = call(f"{api}/b2api/v4/b2_create_key", token, body)
    # Fail closed: stimmt der angelegte Schluessel nicht genau (Rechte, ein Bucket), sofort wieder loeschen
    bound = created.get("bucketIds") or ([created["bucketId"]] if created.get("bucketId") else [])
    if sorted(created.get("capabilities") or []) != sorted(ROLES[a.role]) or bound != [bucket["bucketId"]]:
        call(f"{api}/b2api/v4/b2_delete_key", token, {"applicationKeyId": created["applicationKeyId"]})
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
