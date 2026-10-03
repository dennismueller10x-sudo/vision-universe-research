"""Lossless canonical artifact storage; legacy JSON paths remain supported."""
import gzip
import json
from pathlib import Path


def read_artifact(path):
    path = Path(path)
    body = path.read_bytes()
    if path.name.endswith(".gz"):
        body = gzip.decompress(body)
    return json.loads(body)


def artifact_paths(directory):
    directory = Path(directory)
    paths = sorted(directory.glob("*.json")) + sorted(directory.glob("*.json.gz"))
    logical = [p.name.removesuffix(".gz") for p in paths]
    if len(set(logical)) != len(logical):
        raise ValueError("DUPLICATE_CANONICAL_STORAGE_IDENTITY")
    return sorted(paths)


def write_canonical_artifact(path, payload, *, preserve_json=None):
    """New full histories compress; existing JSON never changes its URL.

    Explicit preserve_json is bound to the original baseline by callers doing
    a migration in a disposable shadow. Repeated writes are deterministic.
    No history, provenance, null, identity or numeric value is removed.
    """
    path = Path(path)
    if preserve_json is None:
        preserve_json = path.exists()
    target = path if preserve_json else Path(str(path) + ".gz")
    body = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    stored = body if preserve_json else gzip.compress(body, compresslevel=9, mtime=0)
    if json.loads(gzip.decompress(stored) if not preserve_json else stored) != payload:
        raise ValueError("CANONICAL_STORAGE_ROUNDTRIP_FAILED")
    target.write_bytes(stored)
    # Only a deliberately migrated new artifact may lose its old JSON copy.
    # Leaving both representations could silently serve duplicate securities.
    alternate = Path(str(path) + ".gz") if preserve_json else path
    if alternate.exists():
        alternate.unlink()
    return target
