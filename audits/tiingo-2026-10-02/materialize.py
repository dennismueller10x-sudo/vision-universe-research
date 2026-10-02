#!/usr/bin/env python3
"""Verify and materialize packaged audit caches, without network or production writes."""
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def materialize():
    manifest = json.loads((HERE / 'compressed_inputs.json').read_text())
    count = 0
    for row in manifest['files']:
        target = (HERE / row['rawPath']).resolve()
        source = (HERE / row['compressedPath']).resolve()
        if HERE not in target.parents or HERE not in source.parents:
            raise ValueError('Cache path escapes the audit directory')
        compressed = source.read_bytes()
        if hashlib.sha256(compressed).hexdigest() != row['compressedSha256']:
            raise ValueError(f'Compressed cache hash mismatch: {source.name}')
        raw = gzip.decompress(compressed)
        if len(raw) != row['rawBytes'] or hashlib.sha256(raw).hexdigest() != row['rawSha256']:
            raise ValueError(f'Raw cache hash mismatch: {target.name}')
        if target.exists():
            if target.read_bytes() != raw:
                raise ValueError(f'Existing cache differs; preserve it before materializing: {target}')
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        count += 1
    print(json.dumps({'verifiedCaches': count, 'networkRequests': 0, 'productionWrites': 0}))


if __name__ == '__main__':
    materialize()
