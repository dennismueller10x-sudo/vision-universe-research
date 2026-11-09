#!/usr/bin/env bash
# V13 – einen Archivteil verschlüsseln (einziger Verschlüsselungsweg für build-archive.sh und gen2.mjs regen).
#   seal-part.sh <klartext> <ausgabe.enc> <archive-pub.pem>   → schreibt wrappedKeyB64 auf stdout
# Datenschlüssel: 256 Bit als 64 Hex-Zeichen + LF (65 Byte). `-pass file:` liest bis zum ersten \n bzw. NUL; die
# Hex-Zeile enthält keines davon, die wirksame Passphrase hat damit immer 64 Zeichen (Befund 01.11.2026: 32 Binärbytes
# wurden gekürzt). Format und Rundlauf (Entschlüsseln mit genau diesem Schlüssel, Klartext-SHA-256 gleich) werden vor
# der Ausgabe geprüft. Der Schlüssel liegt nur in einer 600er-Datei unter $TMPDIR und wird danach überschrieben.
set -euo pipefail
IN=$1; OUT=$2; PUB=$3
umask 077
k=$(mktemp "${TMPDIR:-/tmp}/v13seal.XXXXXX")
trap 'shred -u "$k" 2>/dev/null || rm -f "$k"' EXIT
openssl rand -hex 32 > "$k"
[ "$(stat -c %s "$k")" = 65 ] && head -c 64 "$k" | grep -qxE '[0-9a-f]{64}' || { echo "KEY_FORMAT" >&2; exit 1; }
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass file:"$k" -in "$IN" -out "$OUT"
want=$(sha256sum < "$IN" | cut -c1-64)
got=$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass file:"$k" -in "$OUT" | sha256sum | cut -c1-64)
[ "$got" = "$want" ] || { echo "ROUNDTRIP_MISMATCH" >&2; rm -f "$OUT"; exit 1; }
openssl pkeyutl -encrypt -pubin -inkey "$PUB" -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -in "$k" | base64 -w0
