#!/usr/bin/env bash
# V13 – verschlüsseltes Research-Archiv bauen (lokal, ohne Netz).
# Je Teil: tar (ohne Kompression; die meisten Rohdaten sind schon gzip) → AES-256-CBC (PBKDF2, 100.000 Iterationen,
# zufälliger 256-Bit-Datenschlüssel je Teil) → Datenschlüssel mit RSA-OAEP-SHA256 an den Archivschlüssel gebunden.
# Öffentliches Manifest: nur Teilnamen, Größen, SHA-256 von Klar- und Chiffretext, Dateizahlen und gewickelte Schlüssel.
# Inventar (Pfade und SHA-256 jeder Datei) liegt verschlüsselt im jeweiligen Teil (_inventory.tsv).
#
#   build-archive.sh <scratchpad> <out-dir> <archive-pub.pem> <manifest.json>
set -euo pipefail
SP=$1; OUT=$2; PUB=$3; MANIFEST=$4
mkdir -p "$OUT"
# Teil-Name | Basisverzeichnis | Pfade relativ zur Basis (Schlüsselverzeichnisse sind nie enthalten)
PARTS=(
  "v13-raw|$SP/v13-private|raw"
  "v13-derived|$SP/v13-private|series largecap register-partial.json register-smoke.json coverage-smoke.json series-smoke"
  "v13-studies|$SP/v13-studies|private"
  "v13b-hist|$SP/v13b-private|http-cache crash spx series-1.1.0 request-ledger.jsonl tiingo-fetch-spec.json work tools docs cache extra-caches.txt"
  "v13b-f1w|$SP/v13b-f1w|private"
  "v12-listref|$SP/v12-private/listref|work full raw http-cache probe out-draft"
  "v13c-study|$SP/v13c-private|."
)
entries=()
for spec in "${PARTS[@]}"; do
  IFS='|' read -r name base paths <<<"$spec"
  tmp="$OUT/$name.tar"
  ( cd "$base"
    existing=(); for p in $paths; do [ -e "$p" ] && existing+=("$p"); done
    find "${existing[@]}" -type f -print0 | sort -z | xargs -0 sha256sum > "$OUT/$name.inventory.tsv"
    cp "$OUT/$name.inventory.tsv" ./_inventory.tsv
    tar --sort=name --owner=0 --group=0 --numeric-owner --mtime='2026-10-29 00:00Z' -cf "$tmp" _inventory.tsv "${existing[@]}"
    rm -f ./_inventory.tsv )
  files=$(wc -l < "$OUT/$name.inventory.tsv")
  plain_sha=$(sha256sum "$tmp" | cut -c1-64); plain_size=$(stat -c %s "$tmp")
  openssl rand -out "$OUT/$name.key" 32
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass file:"$OUT/$name.key" -in "$tmp" -out "$OUT/$name.tar.enc"
  wrapped=$(openssl pkeyutl -encrypt -pubin -inkey "$PUB" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$OUT/$name.key" | base64 -w0)
  shred -u "$OUT/$name.key"; rm -f "$tmp"
  enc_sha=$(sha256sum "$OUT/$name.tar.enc" | cut -c1-64); enc_size=$(stat -c %s "$OUT/$name.tar.enc")
  inv_sha=$(sha256sum "$OUT/$name.inventory.tsv" | cut -c1-64)
  entries+=("{\"part\":\"$name\",\"object\":\"$name.tar.enc\",\"files\":$files,\"plainSha256\":\"$plain_sha\",\"plainBytes\":$plain_size,\"cipherSha256\":\"$enc_sha\",\"cipherBytes\":$enc_size,\"inventorySha256\":\"$inv_sha\",\"wrappedKeyB64\":\"$wrapped\"}")
  echo "$name: $files Dateien, $plain_size B klar, $enc_size B verschlüsselt"
done
pubfp=$(openssl pkey -pubin -in "$PUB" -outform DER | sha256sum | cut -c1-64)
{ printf '{"schemaVersion":"v13-research-archive-manifest-1.1.0","createdAt":"%s","cipher":"openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt (key file 32 B)","keyWrap":"RSA-4096 OAEP SHA-256","archivePublicKeySha256Der":"%s","parts":[' "$(date -u +%FT%TZ)" "$pubfp"
  (IFS=,; printf '%s' "${entries[*]}")
  printf ']}\n'; } > "$MANIFEST"
