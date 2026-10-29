"""Prueft die Rechte eines Backblaze-B2-Schluessels, bevor er benutzt wird (fail closed).

  vu-key-check.py writer|anchor|reader

Liest AWS_ACCESS_KEY_ID (keyID) und AWS_SECRET_ACCESS_KEY (applicationKey) aus der
Umgebung, fragt b2_authorize_account und vergleicht die erteilten Capabilities mit der
Rolle. Gibt nur Capability-Namen aus, nie Schluesselwerte.

  writer  darf lesen, listen, schreiben (hide). Darf NICHT: deleteFiles, bypassGovernance,
          writeFileRetentions, writeFileLegalHolds, writeBuckets, writeBucketRetentions,
          deleteBuckets, writeKeys, deleteKeys.
  anchor  wie writer ohne writeFiles, zusaetzlich writeFileLegalHolds/readFileLegalHolds.
  reader  nur listFiles, readFiles (+ listBuckets/readBuckets).
Ausserdem muss der Schluessel auf genau einen Bucket beschraenkt sein.

Exit 0 passend, 5 zu viele Rechte, 6 fehlende Rechte, 7 nicht pruefbar.
B2_AUTH_URL ist fuer Tests umstellbar.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

AUTH_URL = os.environ.get("B2_AUTH_URL", "https://api.backblazeb2.com/b2api/v3/b2_authorize_account")

FORBIDDEN_ALWAYS = {"deleteFiles", "bypassGovernance", "writeFileRetentions", "writeBuckets",
                    "writeBucketRetentions", "deleteBuckets", "writeKeys", "deleteKeys",
                    "writeBucketReplications", "writeBucketEncryption", "writeBucketNotifications"}
ROLES = {
    "writer": {"need": {"listFiles", "readFiles", "writeFiles"},
               "forbid": FORBIDDEN_ALWAYS | {"writeFileLegalHolds"}},
    "anchor": {"need": {"listFiles", "writeFileLegalHolds"},
               "forbid": FORBIDDEN_ALWAYS | {"writeFiles"}},
    "reader": {"need": {"listFiles", "readFiles"},
               "forbid": FORBIDDEN_ALWAYS | {"writeFiles", "writeFileLegalHolds"}},
}


def main():
    role = sys.argv[1] if len(sys.argv) > 1 else "writer"
    key_id = os.environ.get("AWS_ACCESS_KEY_ID", "")
    app_key = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
    if not key_id or not app_key:
        print("Schluessel fehlt in der Umgebung", file=sys.stderr)
        return 7
    token = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
    req = urllib.request.Request(AUTH_URL, headers={"Authorization": "Basic " + token})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            info = json.load(resp)
    except (urllib.error.URLError, ValueError) as err:
        print(f"Autorisierung nicht pruefbar: {type(err).__name__}", file=sys.stderr)
        return 7
    # v3: apiInfo.storageApi.allowed{buckets[], capabilities[]}; v2: allowed{bucketId, capabilities[]}
    storage = (info.get("apiInfo") or {}).get("storageApi") or {}
    allowed = storage.get("allowed") or info.get("allowed") or {}
    caps = set(allowed.get("capabilities") or [])
    buckets = allowed.get("buckets")
    if buckets is None:
        buckets = [{"id": allowed["bucketId"]}] if allowed.get("bucketId") else []
    rules = ROLES[role]
    too_many = sorted(caps & rules["forbid"])
    missing = sorted(rules["need"] - caps)
    print(json.dumps({"role": role, "capabilities": sorted(caps), "tooMany": too_many, "missing": missing,
                      "bucketRestricted": bool(buckets) and len(buckets) == 1}))
    if too_many:
        print(f"Schluessel hat zu viele Rechte fuer '{role}': {', '.join(too_many)}", file=sys.stderr)
        return 5
    if not buckets or len(buckets) != 1:
        print("Schluessel ist nicht auf genau einen Bucket beschraenkt", file=sys.stderr)
        return 5
    if missing:
        print(f"Schluessel fehlen Rechte fuer '{role}': {', '.join(missing)}", file=sys.stderr)
        return 6
    return 0


if __name__ == "__main__":
    sys.exit(main())
