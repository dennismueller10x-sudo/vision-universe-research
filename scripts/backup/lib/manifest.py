"""Manifeste je Quelle: Zaehler, Groessen, Hashes. Keine Inhalte, keine Secrets.

  manifest.py git <mirror-dir> <remote-ref-count> <local-ref-count>
  manifest.py dir <dir>            # Dateien, Bytes, SHA-256 je Datei (sha256sums daneben)
  manifest.py compare <old.json> <new.json> <max-drop-percent>
"""
import hashlib
import json
import os
import subprocess
import sys
import time


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def du(path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            try:
                total += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                pass
    return total


def git_manifest(path, remote_refs, local_refs):
    def git(*args):
        return subprocess.run(["git", "-C", path, *args], capture_output=True, text=True).stdout.strip()

    heads = {}
    for ref in ("refs/heads/main", "refs/heads/master"):
        sha = git("rev-parse", "--verify", "--quiet", ref)
        if sha:
            heads[ref] = sha
    kinds = {}
    for line in git("for-each-ref", "--format=%(refname)").splitlines():
        parts = line.split("/")
        kind = "/".join(parts[:2]) if len(parts) > 1 else line
        kinds[kind] = kinds.get(kind, 0) + 1
    count = git("count-objects", "-v")
    return {
        "kind": "git",
        "createdAt": now(),
        "bytes": du(path),
        "refs": int(local_refs),
        "remoteRefs": int(remote_refs),
        "refKinds": kinds,
        "heads": heads,
        "countObjects": dict(line.split(": ", 1) for line in count.splitlines() if ": " in line),
    }


def dir_manifest(path):
    files, total = 0, 0
    sums = []
    for root, _, names in os.walk(path):
        for name in sorted(names):
            full = os.path.join(root, name)
            h = hashlib.sha256()
            with open(full, "rb") as fh:
                for block in iter(lambda: fh.read(1 << 20), b""):
                    h.update(block)
            size = os.path.getsize(full)
            files += 1
            total += size
            sums.append(f"{h.hexdigest()}  {os.path.relpath(full, path)}")
    with open(os.path.join(os.path.dirname(path.rstrip('/')), os.path.basename(path.rstrip('/')) + ".sha256"), "w") as out:
        out.write("\n".join(sums) + ("\n" if sums else ""))
    return {"kind": "dir", "createdAt": now(), "files": files, "bytes": total}


def compare(old_path, new_path, max_drop):
    """Warnt, wenn eine Quelle gegenueber dem letzten Stand stark schrumpft (Massenloeschung an der Quelle)."""
    try:
        old = json.load(open(old_path))
    except (OSError, ValueError):
        print(json.dumps({"compared": False}))
        return
    new = json.load(open(new_path))
    findings = []
    for key in ("files", "bytes", "refs", "records"):
        if key in old and key in new and old[key]:
            drop = 100.0 * (old[key] - new[key]) / old[key]
            if drop > float(max_drop):
                findings.append(f"{key} -{drop:.1f}% ({old[key]} -> {new[key]})")
    print(json.dumps({"compared": True, "drops": findings}))


if __name__ == "__main__":
    mode = sys.argv[1]
    if mode == "git":
        print(json.dumps(git_manifest(sys.argv[2], sys.argv[3], sys.argv[4]), indent=2))
    elif mode == "dir":
        print(json.dumps(dir_manifest(sys.argv[2]), indent=2))
    elif mode == "compare":
        compare(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        sys.exit(f"unbekannter Modus {mode}")
