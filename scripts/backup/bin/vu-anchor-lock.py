"""Erstsicherung dauerhaft schuetzen: Legal Hold auf alle Objekte des Backup-Buckets.

  vu-anchor-lock.py plan     zaehlt, welche Objekte einen Legal Hold bekaemen
  vu-anchor-lock.py apply    setzt Legal Hold ON (nur mit dem Anker-Schluessel)
  vu-anchor-lock.py status   zaehlt Objekte mit und ohne Legal Hold

Gedacht fuer genau einen Zeitpunkt: direkt nach der ersten vollstaendigen, gepruften
Sicherung. Dann gehoeren alle Objekte (config, keys/, data/, index/, snapshots/) zum
Anker. Ein Legal Hold hat kein Ablaufdatum; Lifecycle-Regeln koennen solche Versionen
nicht entfernen. Aufheben kann ihn nur ein Schluessel mit writeFileLegalHolds - den
gibt es nur im Owner-Tresor, nie im Runner.

Umgebung: VU_S3_ENDPOINT, VU_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
optional VU_S3_PREFIX (restic-Unterpfad). Benoetigt boto3.
Schreibt anchor-manifest.json (Schluessel, Version, Groesse) in das aktuelle Verzeichnis.
"""
import json
import os
import sys
import time

import boto3
from botocore.config import Config


def client():
    return boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"],
                        config=Config(retries={"max_attempts": 10, "mode": "standard"}))


def current_objects(s3, bucket, prefix):
    pages = s3.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=prefix)
    for page in pages:
        for v in page.get("Versions", []):
            if v.get("IsLatest"):
                yield v


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "plan"
    bucket, prefix = os.environ["VU_S3_BUCKET"], os.environ.get("VU_S3_PREFIX", "")
    s3 = client()
    objs = list(current_objects(s3, bucket, prefix))
    if mode == "plan":
        print(json.dumps({"objects": len(objs), "bytes": sum(o["Size"] for o in objs)}))
        return 0
    if mode == "status":
        on = 0
        for o in objs:
            try:
                st = s3.get_object_legal_hold(Bucket=bucket, Key=o["Key"], VersionId=o["VersionId"])
                on += st["LegalHold"]["Status"] == "ON"
            except s3.exceptions.ClientError:
                pass
        print(json.dumps({"objects": len(objs), "legalHoldOn": on}))
        return 0 if on == len(objs) else 1
    if mode != "apply":
        print("plan|apply|status", file=sys.stderr)
        return 2
    manifest = []
    for o in objs:
        s3.put_object_legal_hold(Bucket=bucket, Key=o["Key"], VersionId=o["VersionId"], LegalHold={"Status": "ON"})
        manifest.append({"key": o["Key"], "versionId": o["VersionId"], "size": o["Size"]})
    json.dump({"createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "bucket": bucket,
               "objects": manifest}, open("anchor-manifest.json", "w"), indent=1)
    print(json.dumps({"legalHoldSet": len(manifest)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
