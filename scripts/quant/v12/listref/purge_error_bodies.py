"""V12 LISTREF: remove EFTS error bodies (e.g. upstream ConnectionError JSON without 'hits') that an earlier run stored as
results, from the private cache and the results files, so the next fetch run retries them. Reports the count.

    python3 scripts/quant/v12/listref/purge_error_bodies.py <private>/work/fts-results.json <private>/work/reasons-results.json
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrlib as L  # noqa: E402


def main():
    out = {}
    for f in sys.argv[1:]:
        L._assert_private(f)
        d = json.load(open(f))
        bad = []
        for u in list(d['results']):
            body = L._cache.get(u)
            if body is None:
                continue
            if 'hits' not in json.loads(body):
                bad.append(u)
                L.drop_cached(u)
                del d['results'][u]
        json.dump(d, open(f, 'w'))
        out[os.path.basename(f)] = {'purged': len(bad), 'urls': bad}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
