"""Verify a supplied real checkpoint against a pinned producer; never initialize state.

The caller performs authenticated private storage reads. This program has no
network or upload path. Only aggregate counts/hashes are written as evidence.
Reprojection uses the ORIGINAL producer tree: export_revision hashes every .py
file, so running a later UI/handoff revision cannot reproduce its generation.
"""
import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
from pathlib import Path


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def database_proof(path):
    if not Path(path).is_file():
        raise ValueError('CURRENT_STATE_DATABASE_MISSING')
    def serial(value):
        return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                          default=lambda v: {'blobSha256': hashlib.sha256(v).hexdigest(), 'bytes': len(v)}).encode()
    with sqlite3.connect('file:' + str(Path(path).resolve()) + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('CURRENT_STATE_DATABASE_CORRUPT')
        schema = db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").fetchall()
        tables = {}
        for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall():
            quoted = '"' + name.replace('"', '""') + '"'
            columns = db.execute('PRAGMA table_info(' + quoted + ')').fetchall()
            pk = [c[1] for c in sorted(columns, key=lambda c: c[5]) if c[5]]
            order = ','.join('"' + c[1].replace('"', '""') + '"' for c in columns)
            rows = db.execute('SELECT * FROM ' + quoted + ' ORDER BY ' + order).fetchall()
            indexes = [next(i for i, c in enumerate(columns) if c[1] == col) for col in pk]
            tables[name] = {'count': len(rows), 'sha256': hashlib.sha256(serial(rows)).hexdigest(),
                            'identitySha256': hashlib.sha256(serial([[r[i] for i in indexes] for r in rows])).hexdigest()}
    return {'schemaSha256': hashlib.sha256(serial(schema)).hexdigest(), 'tables': tables,
            'logicalHash': hashlib.sha256(serial(tables)).hexdigest()}


def verify(snapshot, state, producer_root, expected):
    snapshot, state, producer_root = Path(snapshot), Path(state), Path(producer_root)
    if state.exists():
        raise ValueError('CURRENT_RESTORE_REQUIRES_FRESH_DIRECTORY')
    if not snapshot.is_file() or snapshot.stat().st_size != expected['checkpointBytes'] or digest(snapshot) != expected['checkpointSha256']:
        raise ValueError('CURRENT_CHECKPOINT_DOES_NOT_MATCH_AUTHORITATIVE_REPORT')
    actual_code = subprocess.check_output(['git', '-C', str(producer_root), 'rev-parse', 'HEAD'], text=True).strip()
    if actual_code != expected['producerCodeSha'] or subprocess.check_output(['git', '-C', str(producer_root), 'status', '--porcelain'], text=True).strip():
        raise ValueError('CURRENT_PRODUCER_MUST_MATCH_CLEAN_PINNED_COMMIT')
    checkpoint = producer_root / 'scripts/company_intelligence/checkpoint.py'
    subprocess.run([sys.executable, str(checkpoint), 'restore', '--snapshot', str(snapshot), '--state', str(state),
                    '--sha256', expected['checkpointSha256']], check=True, stdout=subprocess.DEVNULL)
    before = {name: database_proof(state / name) for name in ('state.sqlite', 'archive.sqlite') if (state / name).is_file()}
    # The inherited six-table fingerprint is a separate exact acceptance basis.
    code = "import json,sys; from company_intelligence.acceptance import fingerprint; print(json.dumps(fingerprint(sys.argv[1])))"
    import os
    env = {**os.environ, 'PYTHONPATH': str(producer_root / 'scripts')}
    six = json.loads(subprocess.check_output([sys.executable, '-c', code, str(state)], env=env, cwd=producer_root, text=True))
    if six['generation'] != expected['generation'] or six['logicalHash'] != expected['logicalHash']:
        raise ValueError('CURRENT_RESTORED_GENERATION_OR_TABLE_HASH_MISMATCH')
    evidence = state.parent / (state.name + '-private-verification.json')
    evidence.write_text(json.dumps(six))
    try:
        subprocess.run([sys.executable, str(producer_root / 'scripts/company_intelligence/acceptance.py'), 'verify',
                        '--state', str(state), '--evidence', str(evidence)], check=True, env=env, cwd=producer_root,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        evidence.unlink(missing_ok=True)
    after = {name: database_proof(state / name) for name in before}
    if before != after:
        raise ValueError('CURRENT_REPROJECTION_CHANGED_OPERATIONAL_TABLES')
    index = json.loads((state / 'public/company-intelligence/data/index.json').read_text())
    if index['generation'] != expected['generation'] or index['coveredCompanyCount'] != expected['exportedCompanies']:
        raise ValueError('CURRENT_REPROJECTION_GENERATION_OR_COUNT_MISMATCH')
    return {'schema': 1, 'status': 'FRESH_CURRENT_RESTORE_AND_EXPORT_VERIFIED',
            'checkpointSha256': digest(snapshot), 'checkpointBytes': snapshot.stat().st_size,
            'producerCodeSha': actual_code, 'generation': index['generation'],
            'universeCompanies': index['companyCount'], 'exportedCompanies': index['coveredCompanyCount'],
            'databases': before, 'sixTableLogicalHash': six['logicalHash'],
            'privateStateIncludedInEvidence': False, 'remoteUploadPerformed': False}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--snapshot', required=True, type=Path)
    p.add_argument('--state', required=True, type=Path)
    p.add_argument('--producer-root', required=True, type=Path)
    p.add_argument('--expected', required=True, type=Path)
    p.add_argument('--evidence', required=True, type=Path)
    a = p.parse_args()
    result = verify(a.snapshot, a.state, a.producer_root, json.loads(a.expected.read_text()))
    a.evidence.parent.mkdir(parents=True, exist_ok=True)
    a.evidence.write_text(json.dumps(result, sort_keys=True, indent=2) + '\n')
    print(json.dumps({'status': result['status'], 'generation': result['generation'], 'exportedCompanies': result['exportedCompanies']}))
