#!/usr/bin/env bash
# V13 – verschlüsselte Archivteile mit vorsignierten URLs übertragen (außerhalb von Actions).
#   transfer.sh put <artefakt-dir> <archive-priv.pem> <dir-mit-*.tar.enc> <manifest.json>
#   transfer.sh get <artefakt-dir> <archive-priv.pem> <ziel-dir>
# <artefakt-dir> enthält urls.json.enc und k.bin.enc aus dem Workflow quant-v13-archive.yml (Modus put bzw. get).
# Die URLs werden nur im Speicher entschlüsselt und nie ausgegeben.
set -euo pipefail
MODE=$1; ART=$2; PRIV=$3; DIR=$4; MANIFEST=${5:-}
k=$(mktemp); u=$(mktemp); trap 'shred -u "$k" "$u" 2>/dev/null || true' EXIT
openssl pkeyutl -decrypt -inkey "$PRIV" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$ART/k.bin.enc" -out "$k"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass file:"$k" -in "$ART/urls.json.enc" -out "$u"
mkdir -p "$DIR"
python3 -I - "$MODE" "$u" "$DIR" "$MANIFEST" <<'EOF'
import json, sys, subprocess, hashlib, os
mode, ufile, d, manifest = sys.argv[1:5]
objs = json.load(open(ufile))["objects"]
for o in objs:
    name = o["key"].rsplit("/", 1)[1]
    path = manifest if name == "manifest.json" and mode == "put" else os.path.join(d, name)
    for attempt in range(4):
        if mode == "put":
            r = subprocess.run(["curl", "-sS", "-f", "-o", "/dev/null", "-w", "%{http_code}", "-T", path, o["url"]], capture_output=True, text=True)
        else:
            r = subprocess.run(["curl", "-sS", "-f", "-o", path, "-w", "%{http_code}", o["url"]], capture_output=True, text=True)
        if r.returncode == 0:
            break
    else:
        print(f"{name}: FAILED (HTTP {r.stdout.strip() or '-'})"); sys.exit(1)
    if o.get("sha256"):
        h = hashlib.sha256(open(path, "rb").read()).hexdigest()
        if h != o["sha256"]:
            print(f"{name}: SHA256_MISMATCH"); sys.exit(1)
    print(f"{name}: {mode.upper()} OK ({os.path.getsize(path)} B)")
EOF
