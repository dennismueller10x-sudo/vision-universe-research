#!/usr/bin/env python3
"""Download SEC bulk companyfacts.zip and submissions.zip once into private scratch (2 requests)."""
import json
import logging
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from common import PRIVATE, BULK_FACTS_URL, BULK_SUBMISSIONS_URL, client, sha256_file, guard_private  # noqa

logging.basicConfig(level=logging.INFO)
c = client()
manifest = {}
for name, url in (("companyfacts.zip", BULK_FACTS_URL), ("submissions.zip", BULK_SUBMISSIONS_URL)):
    if len(sys.argv) > 1 and name not in sys.argv[1:]:
        continue
    target = guard_private(PRIVATE / "bulk" / name)
    path, size, cached = c.download_to(url, target)
    manifest[name] = {"url": url, "bytes": size, "sha256": sha256_file(path), "cached": cached,
                      "mtime": path.stat().st_mtime}
    print(json.dumps({name: manifest[name]}), flush=True)
old = PRIVATE / "bulk" / "manifest.json"
prev = json.loads(old.read_text()) if old.exists() else {}
prev.update(manifest)
old.write_text(json.dumps(prev, indent=1))
print(json.dumps(c.stats))
