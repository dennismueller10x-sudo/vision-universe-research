#!/usr/bin/env python3
"""Quant V10 reproduction manifest: sha256 of every V10 script, evidence file, research engine and test, plus the base
commit and the paths V10 must not touch (checked against git, fails if any changed).

  python3 -I scripts/quant/v10/build-manifest.py --root . --base a1a0dd972a --out docs/quant-recovery/v10/artifact-manifest-1.0.0.json
"""
import argparse, hashlib, json, os, subprocess

GROUPS = {
    'scripts': ['scripts/quant/v10'],
    'evidence': ['docs/quant-recovery/v10'],
    'reports': ['docs/quant-recovery/BACKTEST_V10_FINAL.md', 'docs/quant-recovery/BACKTEST_V10_EVIDENCE_MATRIX.md', 'docs/quant-recovery/BACKTEST_V10_DATA_RECOVERY.md',
                'docs/quant-recovery/BACKTEST_V10_REAL_STUDIES.md', 'docs/quant-recovery/BACKTEST_V10_CERTIFICATION_READINESS.md', 'docs/quant-recovery/BACKTEST_V10_VALIDATION.md',
                'docs/quant-recovery/BACKTEST_V10_HANDOFF.md'],
    'researchEngines': ['quant/engines/research-weekly-loader.cjs', 'quant/engines/research-identity-evidence.cjs', 'quant/engines/research-ca-evidence.cjs',
                        'quant/engines/research-listing-lifecycle.cjs'],
    'unchangedEngines': ['quant/engines/weekly-real-adapter.cjs', 'quant/engines/corporate-action-evidence.js', 'quant/engines/research-studies.cjs',
                         'quant/engines/research-validation.cjs', 'quant/engines/research-portfolio.cjs', 'quant/engines/weekly-benchmark.cjs', 'quant/engines/setup-engine.js',
                         'quant/engines/factor-evidence.js', 'quant/engines/fundamental-inputs.js', 'quant/engines/return-series.js'],
    'tests': ['quant/tests/v10-population.test.mjs', 'quant/tests/v10-corporate-actions.test.mjs', 'quant/tests/v10-studies.test.mjs', 'quant/tests/v10-factor.test.mjs',
              'quant/tests/v10-setup.test.mjs', 'quant/tests/research-ca-evidence.test.mjs', 'quant/tests/research-identity-evidence.test.mjs'],
}
FORBIDDEN = ['quant/data', 'discover/data', 'supertrader/data', 'social/data', 'technical/data', '.github', 'quant/engines/weekly-real-adapter.cjs',
             'quant/engines/corporate-action-evidence.js', 'server', 'quant/index.html', 'assets']
SELF = 'docs/quant-recovery/v10/artifact-manifest-1.0.0.json'


def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def files(root, entry):
    p = os.path.join(root, entry)
    if os.path.isfile(p):
        return [entry]
    out = []
    for d, _, names in os.walk(p):
        if '__pycache__' in d:
            continue
        out += [os.path.relpath(os.path.join(d, n), root) for n in names if not n.endswith('.pyc')]
    return sorted(x for x in out if x != SELF)


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, text=True).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default='.')
    ap.add_argument('--base', required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    changed = git(root, 'diff', '--name-only', a.base, 'HEAD').splitlines()
    touched = sorted(c for c in changed if any(c == f or c.startswith(f.rstrip('/') + '/') for f in FORBIDDEN))
    if touched:
        raise SystemExit('FORBIDDEN_PATHS_CHANGED: ' + ', '.join(touched))
    groups = {g: {f: sha(os.path.join(root, f)) for e in entries for f in files(root, e) if os.path.exists(os.path.join(root, f))} for g, entries in GROUPS.items()}
    out = {'schemaVersion': 'v10-artifact-manifest-1.0.0', 'base': git(root, 'rev-parse', a.base), 'head': git(root, 'rev-parse', 'HEAD'),
           'note': 'head is the commit the manifest was built on; the manifest file itself is excluded from its hashes',
           'changedFilesVsBase': len(changed), 'forbiddenPathsChanged': touched, 'forbiddenPaths': FORBIDDEN,
           'groups': groups, 'counts': {g: len(v) for g, v in groups.items()},
           'certification': 'NOT_CERTIFIED', 'productionApproved': False}
    with open(os.path.join(root, a.out), 'w') as f:
        json.dump(out, f, indent=1, sort_keys=True)
        f.write('\n')
    print(json.dumps({'changedFilesVsBase': len(changed), 'counts': out['counts'], 'forbiddenPathsChanged': touched}))


if __name__ == '__main__':
    main()
