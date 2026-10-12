#!/usr/bin/env python3
"""Repackage ciphertext/status files only. No decrypt, network, R2 or strategy."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import zipfile

TARGET_BYTES = 24 * 1024 * 1024
MAX_ZIP_BYTES = 32 * 1024 * 1024


def sha_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while data := stream.read(1024 * 1024):
            digest.update(data)
    return digest.hexdigest()


def approved_file(path, relative):
    if path.is_symlink() or any(not re.fullmatch(r"[A-Za-z0-9_.-]+", p) for p in relative.parts):
        raise ValueError("UNAPPROVED_ARTIFACT_PATH")
    if relative.name.endswith(".sealed.json"):
        payload = json.loads(path.read_bytes())
        if payload.get("schema") != "supertrader-sealed-1.0.0" or payload.get("alg") != "RSA-OAEP-256+A256GCM+gzip":
            raise ValueError("CIPHERTEXT_ENVELOPE_REQUIRED")
        for field in ("wrappedKey", "iv", "tag", "body"):
            value = payload.get(field)
            if not isinstance(value, str) or not value:
                raise ValueError("CIPHERTEXT_FIELD_REQUIRED")
            base64.b64decode(value, validate=True)
        return "CIPHERTEXT"
    if relative.name.endswith("status.json"):
        if not isinstance(json.loads(path.read_bytes()), dict):
            raise ValueError("STATUS_OBJECT_REQUIRED")
        return "PUBLIC_STATUS"
    raise ValueError("RAW_OR_UNAPPROVED_FILE_REJECTED")


def stored_size(entries):
    # No ZIP64: every stored bundle is bounded to 32 MiB and <65,535 files.
    return 22 + sum(e["bytes"] + 76 + 2 * len(e["relativePath"].encode("ascii")) for e in entries)


def repack(input_dir, output_dir, *, target_bytes=TARGET_BYTES, max_zip_bytes=MAX_ZIP_BYTES):
    """The configurable limits support boundary tests; production CLI fixes 24/32 MiB."""
    source, output = Path(input_dir).resolve(), Path(output_dir).resolve()
    if not source.is_dir() or output == source or source in output.parents or output in source.parents:
        raise ValueError("SEPARATE_INPUT_OUTPUT_DIRECTORIES_REQUIRED")
    if not isinstance(target_bytes, int) or target_bytes < 22 or target_bytes > max_zip_bytes or max_zip_bytes > MAX_ZIP_BYTES:
        raise ValueError("INVALID_BUNDLE_LIMITS")
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("EMPTY_OUTPUT_DIRECTORY_REQUIRED")
    files = []
    for path in sorted(source.rglob("*")):
        if path.is_symlink():
            raise ValueError("ARTIFACT_SYMLINK_REJECTED")
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        kind = approved_file(path, relative)
        entry = {"relativePath": relative.as_posix(), "bytes": path.stat().st_size,
                 "sha256": sha_file(path), "kind": kind}
        if stored_size([entry]) > target_bytes:
            raise ValueError("SINGLE_CIPHERTEXT_FILE_EXCEEDS_BUNDLE_TARGET")
        files.append(entry)
    if not files:
        raise ValueError("NO_APPROVED_SOURCE_FILES")
    groups, pending = [], []
    for entry in files:
        if pending and stored_size(pending + [entry]) > target_bytes:
            groups.append(pending)
            pending = []
        pending.append(entry)
    if pending:
        groups.append(pending)
    bundles = []
    for number, entries in enumerate(groups):
        name = f"canonical-bundle-{number:04d}.zip"
        dest = output / name
        with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_STORED, allowZip64=False) as archive:
            for entry in entries:
                info = zipfile.ZipInfo(entry["relativePath"], date_time=(1980, 1, 1, 0, 0, 0))
                info.external_attr = 0o600 << 16
                info.compress_type = zipfile.ZIP_STORED
                with archive.open(info, "w") as stream, (source / entry["relativePath"]).open("rb") as original:
                    while data := original.read(1024 * 1024):
                        stream.write(data)
        if dest.stat().st_size != stored_size(entries) or dest.stat().st_size > target_bytes or dest.stat().st_size > max_zip_bytes:
            raise ValueError("STORED_ZIP_SIZE_CONTRACT_FAILED")
        # Verify extraction bytes without materializing redundant source copies.
        with zipfile.ZipFile(dest) as archive:
            if archive.namelist() != [e["relativePath"] for e in entries]:
                raise ValueError("BUNDLE_FILE_MEMBERSHIP_MISMATCH")
            for entry in entries:
                digest, count = hashlib.sha256(), 0
                with archive.open(entry["relativePath"]) as stream:
                    while data := stream.read(1024 * 1024):
                        digest.update(data)
                        count += len(data)
                if count != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
                    raise ValueError("BUNDLE_EXTRACTION_HASH_MISMATCH")
                original = source / entry["relativePath"]
                if original.stat().st_size != entry["bytes"] or sha_file(original) != entry["sha256"]:
                    raise ValueError("SOURCE_FILE_CHANGED_DURING_REPACK")
        dest.chmod(0o600)
        bundles.append({"file": name, "bytes": dest.stat().st_size, "sha256": sha_file(dest),
                        "relativeFileNames": [e["relativePath"] for e in entries]})
    manifest = {"schema": "supertrader-ciphertext-repack-1.0.0", "sourceFiles": files, "bundles": bundles,
                "targetZipBytes": target_bytes, "maxZipBytes": max_zip_bytes, "compression": "ZIP_STORED",
                "allExtractionHashesVerified": True, "originalFilesUnchanged": True,
                "decrypted": False, "providerReads": 0, "performanceCalculated": False}
    manifest_path = output / "repack-manifest.json"
    manifest_path.write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
    manifest_path.chmod(0o600)
    status = {"schema": manifest["schema"], "status": "CIPHERTEXT_REPACK_VERIFIED",
              "sourceFiles": len(files), "bundles": len(bundles), "sourceBytes": sum(e["bytes"] for e in files),
              "packedBytes": sum(e["bytes"] for e in bundles), "targetZipBytes": target_bytes,
              "maxZipBytes": max_zip_bytes, "manifestSha256": sha_file(manifest_path),
              "originalFilesUnchanged": True, "decrypted": False, "providerReads": 0,
              "performanceCalculated": False}
    (output / "repack-status.json").write_text(json.dumps(status, sort_keys=True) + "\n")
    (output / "repack-status.json").chmod(0o600)
    return status


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(repack(args.input, args.out), sort_keys=True))
    except (ValueError, OSError, json.JSONDecodeError) as error:
        # Enum-only message: no file content, URL, credentials or private paths.
        print(json.dumps({"status": "REPACK_FAILED", "errorType": type(error).__name__,
                          "code": str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Z_]+", str(error)) else "IO_OR_SCHEMA_ERROR",
                          "performanceCalculated": False}))
        raise SystemExit(2)
