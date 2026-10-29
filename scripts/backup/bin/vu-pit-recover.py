"""Point-in-Time-Wiederherstellung des restic-Repositorys aus Objektversionen.

Fall: Jemand hat mit einem gestohlenen Schreibschluessel Dateien verborgen (S3 Delete
ohne Version -> Delete-Marker/hide) oder ein fehlerhafter prune hat zu viel entfernt.
Die Versionen sind noch da (Object Lock, Legal Hold, Lifecycle-Frist). Dieses Werkzeug
stellt den Zustand zu einem Zeitpunkt wieder her - immer in ein NEUES Ziel, nie in
den Original-Bucket:

  vu-pit-recover.py --at 2026-11-20T00:00:00Z --to-dir /restore/repo
  vu-pit-recover.py --at 2026-11-20T00:00:00Z --to-bucket vu-backup-recovered   (zweites Ziel)
  vu-pit-recover.py --at ... --plan          nur zaehlen

Danach in der isolierten Kopie: restic -r /restore/repo unlock --remove-all (Sperren, die zum
Zeitpunkt bestanden, sind in der Kopie verwaist), restic check --read-data, dann restore wie gewohnt.

Umgebung: VU_S3_ENDPOINT, VU_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
(Leseschluessel genuegt fuer --to-dir), optional VU_S3_PREFIX. Benoetigt boto3.
"""
import argparse
import datetime as dt
import json
import os
import sys

import boto3
from botocore.config import Config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", required=True, help="Zeitpunkt UTC, z. B. 2026-11-20T00:00:00Z")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--to-dir")
    g.add_argument("--to-bucket")
    g.add_argument("--plan", action="store_true")
    a = ap.parse_args()
    at = dt.datetime.fromisoformat(a.at.replace("Z", "+00:00"))
    bucket, prefix = os.environ["VU_S3_BUCKET"], os.environ.get("VU_S3_PREFIX", "")
    if a.to_bucket and a.to_bucket == bucket:
        sys.exit("Ziel-Bucket darf nicht der Original-Bucket sein")
    s3 = boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"],
                      config=Config(retries={"max_attempts": 10, "mode": "standard"}))

    # Je Schluessel die juengste Version/Marker mit LastModified <= at.
    best = {}
    for page in s3.get_paginator("list_object_versions").paginate(Bucket=bucket, Prefix=prefix):
        for kind in ("Versions", "DeleteMarkers"):
            for v in page.get(kind, []):
                if v["LastModified"] > at:
                    continue
                # Gleiche Sekunde (Zeitstempel-Aufloesung): der Delete-Marker ist das spaetere Ereignis.
                rank = (v["LastModified"], kind == "DeleteMarkers", v.get("IsLatest", False))
                cur = best.get(v["Key"])
                if cur is None or rank > cur["rank"]:
                    best[v["Key"]] = dict(v, deleted=(kind == "DeleteMarkers"), rank=rank)
    live = {k: v for k, v in best.items() if not v["deleted"]}
    summary = {"at": a.at, "objects": len(live), "bytes": sum(v["Size"] for v in live.values()),
               "deletedAtThatTime": len(best) - len(live)}
    if a.plan:
        print(json.dumps(summary))
        return 0
    for key, v in sorted(live.items()):
        rel = key[len(prefix):].lstrip("/") if prefix else key
        if a.to_dir:
            path = os.path.join(a.to_dir, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            s3.download_file(bucket, key, path, ExtraArgs={"VersionId": v["VersionId"]})
        else:
            s3.copy({"Bucket": bucket, "Key": key, "VersionId": v["VersionId"]}, a.to_bucket, rel)
    print(json.dumps(dict(summary, restored=True)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
