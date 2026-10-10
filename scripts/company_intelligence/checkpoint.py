"""Consistent, bounded SQLite backups and safe restore on fresh runners.

Only dedicated intelligence state is included. Public exports are reproducible;
locks/WAL files and the protected SEC cache are never copied.
"""
import argparse
import hashlib
import json
import json
import re
import shutil
import sqlite3
import tarfile
import tempfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

MAX_COMPRESSED = 128 * 1024 * 1024
MAX_EXPANDED = 1024 * 1024 * 1024
MAX_HTTP_CACHE = 64 * 1024 * 1024


def allowed(name):
    return name in ('state.sqlite', 'archive.sqlite', 'latest-run.json') or bool(re.fullmatch(r'http/[a-f0-9]{64}\.(?:json|body)', name))


def check_db(path):
    with sqlite3.connect('file:' + str(path.resolve()) + '?mode=ro', uri=True) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('CHECKPOINT_DATABASE_CORRUPT')


def _pack(state, destination):
    state, destination = Path(state), Path(destination)
    if not (state / 'state.sqlite').is_file():
        raise ValueError('CHECKPOINT_STATE_MISSING')
    with tempfile.TemporaryDirectory() as tmp:
        stage = Path(tmp)
        for name in ('state.sqlite', 'archive.sqlite'):
            if (state / name).is_file():
                with sqlite3.connect(state / name) as source, sqlite3.connect(stage / name) as target:
                    source.backup(target)
                    # Compact only the staged backup, never the live ledger.
                    # SQLite high-water/free pages must not inflate each upload.
                    target.execute('VACUUM')
                check_db(stage / name)
        cache_paths, cache_bytes = [], 0
        for meta in sorted((state / 'http').glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
            # Older interrupted collectors may have left a raw article pair.
            # Preserve its staged SQLite metadata, never its copyrighted body.
            try:
                cached = json.loads(meta.read_text())
                urls = [urlsplit(cached.get(k, '')) for k in ('url', 'finalUrl')]
                if any((u.hostname or '').removeprefix('www.') == 'globenewswire.com' and u.path.startswith('/news-release/') for u in urls):
                    continue
            except (OSError, ValueError, TypeError, AttributeError):
                pass
            body = meta.with_suffix('.body')
            pair = [p for p in (meta, body) if p.is_file()]
            size = sum(p.stat().st_size for p in pair)
            if any(p.is_symlink() or not allowed(p.relative_to(state).as_posix()) for p in pair) or cache_bytes + size > MAX_HTTP_CACHE:
                continue
            cache_paths += pair
            cache_bytes += size
        for path in [state / 'latest-run.json', *cache_paths]:
            if path.is_file() and allowed(path.relative_to(state).as_posix()) and not path.is_symlink():
                target = stage / path.relative_to(state)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(path, target)
        files = [p for p in stage.rglob('*') if p.is_file() and allowed(p.relative_to(stage).as_posix())]
        size = sum(p.stat().st_size for p in files)
        if size > MAX_EXPANDED:
            raise ValueError('CHECKPOINT_EXPANDED_BUDGET_EXCEEDED')
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp = destination.with_suffix('.tmp')
        with tarfile.open(temp, 'w:gz') as archive:
            for path in sorted(files):
                archive.add(path, arcname=path.relative_to(stage).as_posix(), recursive=False)
        if temp.stat().st_size > MAX_COMPRESSED:
            temp.unlink()
            raise ValueError('CHECKPOINT_COMPRESSED_BUDGET_EXCEEDED')
        temp.replace(destination)
    return {'sha256': hashlib.sha256(destination.read_bytes()).hexdigest(), 'bytes': destination.stat().st_size, 'expandedBytes': size}


def pack(state, destination):
    import fcntl
    state = Path(state)
    if not state.is_dir():
        raise ValueError('CHECKPOINT_STATE_MISSING')
    with (state / 'run.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise ValueError('CHECKPOINT_REQUIRES_IDLE_WRITER') from exc
        return _pack(state, destination)


def restore(snapshot, state, expected_sha=None):
    snapshot, state = Path(snapshot), Path(state)
    if snapshot.stat().st_size > MAX_COMPRESSED or (expected_sha and hashlib.sha256(snapshot.read_bytes()).hexdigest() != expected_sha):
        raise ValueError('CHECKPOINT_DIGEST_OR_SIZE_INVALID')
    if state.exists():
        raise ValueError('RESTORE_REQUIRES_FRESH_STATE_DIRECTORY')
    state.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=state.parent) as tmp:
        stage = Path(tmp) / 'state'
        stage.mkdir()
        size, names = 0, set()
        with tarfile.open(snapshot, 'r:gz') as archive:
            for member in archive:
                size += member.size
                if not member.isfile() or not allowed(member.name) or member.name in names or size > MAX_EXPANDED or PurePosixPath(member.name).is_absolute():
                    raise ValueError('UNSAFE_CHECKPOINT_MEMBER')
                names.add(member.name)
                target = stage / member.name
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open('wb') as sink:
                    shutil.copyfileobj(source, sink)
        if 'state.sqlite' not in names:
            raise ValueError('CHECKPOINT_STATE_MISSING')
        for name in ('state.sqlite', 'archive.sqlite'):
            if name in names:
                check_db(stage / name)
        stage.replace(state)  # Never expose a partly restored ledger.


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['pack', 'restore'])
    p.add_argument('--state', type=Path, required=True)
    p.add_argument('--snapshot', type=Path, required=True)
    p.add_argument('--sha256')
    a = p.parse_args()
    if a.command == 'pack':
        print(json.dumps(pack(a.state, a.snapshot)))
    else:
        restore(a.snapshot, a.state, a.sha256)
        print(json.dumps({'status': 'RESTORED'}))


if __name__ == '__main__':
    main()
