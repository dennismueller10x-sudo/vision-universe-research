"""Kleine S3-Helfer fuer das Backup-Ziel (B2 ueber die S3-API). Gibt nie Zugangsdaten aus.

  s3_put.py put <datei> <objekt> <sha256> [--meta k=v ...]   Upload mit Pruefsumme (Object Lock)
  s3_put.py verify <objekt> <sha256>                          zuruecklesen und vergleichen
  s3_put.py latest <praefix> <suffix>                         juengstes Objekt (Name) ausgeben
  s3_put.py get <objekt> <datei>                              herunterladen (z. B. Wiederherstellung)

Umgebung: VU_S3_ENDPOINT, VU_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.
Der Upload sendet Content-MD5 und eine SHA-256-Pruefsumme: S3 verlangt bei Object Lock
eine Pruefsumme; B2 prueft sie serverseitig.
"""
import argparse
import base64
import hashlib
import os
import sys

import boto3
from botocore.config import Config


def s3():
    return boto3.client("s3", endpoint_url=os.environ["VU_S3_ENDPOINT"],
                        config=Config(retries={"max_attempts": 8, "mode": "standard"}))


def sha_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["put", "verify", "latest", "get"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--meta", action="append", default=[])
    a = ap.parse_args()
    bucket = os.environ["VU_S3_BUCKET"]
    c = s3()
    if a.cmd == "put":
        path, key, sha = a.args
        if sha_of(path) != sha:
            sys.exit("Pruefsumme der lokalen Datei stimmt nicht")
        body = open(path, "rb").read()
        md5 = base64.b64encode(hashlib.md5(body).digest()).decode()
        meta = dict(m.split("=", 1) for m in a.meta)
        meta["sha256"] = sha
        c.put_object(Bucket=bucket, Key=key, Body=body, ContentMD5=md5,
                     ChecksumSHA256=base64.b64encode(bytes.fromhex(sha)).decode(), Metadata=meta)
        print(f"hochgeladen: {key} ({len(body)} Bytes)")
    elif a.cmd == "verify":
        key, sha = a.args
        h = hashlib.sha256()
        for chunk in c.get_object(Bucket=bucket, Key=key)["Body"].iter_chunks(1 << 20):
            h.update(chunk)
        if h.hexdigest() != sha:
            sys.exit(f"Rueckpruefung fehlgeschlagen: {key}")
        print(f"rueckgeprueft: {key}")
    elif a.cmd == "latest":
        prefix, suffix = a.args
        best = None
        for page in c.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            for o in page.get("Contents", []):
                if o["Key"].endswith(suffix) and (best is None or o["Key"] > best):
                    best = o["Key"]   # Namen enthalten den Zeitstempel -> lexikografisch = zeitlich
        if not best:
            sys.exit("kein Objekt gefunden")
        print(best)
    else:
        key, path = a.args
        c.download_file(bucket, key, path)
        print(f"geladen: {key}")


if __name__ == "__main__":
    main()
