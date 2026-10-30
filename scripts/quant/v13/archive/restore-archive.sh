#!/usr/bin/env bash
# V13 – verschlüsseltes Research-Archiv wiederherstellen und prüfen.
#   restore-archive.sh <manifest.json> <dir-mit-*.tar.enc> <archive-priv.pem> <ziel-dir> [teil ...]
# Prüft je Teil: SHA-256 des Chiffretexts, des Klartexts (tar) und jeder Datei gegen das mitgelieferte Inventar;
# bricht beim ersten Fehler ab (Exit 1). Ohne Teilnamen werden alle Teile wiederhergestellt.
set -euo pipefail
MANIFEST=$1; SRC=$2; PRIV=$3; DEST=$4; shift 4
mkdir -p "$DEST"
parts=$(python3 -I -c 'import json,sys;print(" ".join(p["part"] for p in json.load(open(sys.argv[1]))["parts"]))' "$MANIFEST")
[ $# -gt 0 ] && parts="$*"
for name in $parts; do
  read -r enc plain wrapped < <(python3 -I -c 'import json,sys;p=[x for x in json.load(open(sys.argv[1]))["parts"] if x["part"]==sys.argv[2]][0];print(p["cipherSha256"],p["plainSha256"],p["wrappedKeyB64"])' "$MANIFEST" "$name")
  f="$SRC/$name.tar.enc"
  [ "$(sha256sum "$f" | cut -c1-64)" = "$enc" ] || { echo "$name: CIPHER_SHA256_MISMATCH"; exit 1; }
  k=$(mktemp); trap 'shred -u "$k" 2>/dev/null || true' EXIT
  echo "$wrapped" | base64 -d | openssl pkeyutl -decrypt -inkey "$PRIV" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -out "$k"
  t="$DEST/$name.tar"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass file:"$k" -in "$f" -out "$t"
  shred -u "$k"
  [ "$(sha256sum "$t" | cut -c1-64)" = "$plain" ] || { echo "$name: PLAIN_SHA256_MISMATCH"; exit 1; }
  mkdir -p "$DEST/$name" && tar -xf "$t" -C "$DEST/$name" && rm -f "$t"
  ( cd "$DEST/$name" && sha256sum --quiet -c _inventory.tsv ) || { echo "$name: FILE_SHA256_MISMATCH"; exit 1; }
  echo "$name: OK ($(wc -l < "$DEST/$name/_inventory.tsv") Dateien)"
done
