#!/usr/bin/env bash
# Erzeugt auf JEDEM Rechner mit OpenSSL (Linux, Windows mit Git Bash/WSL, macOS) den privaten Schluessel und die Zertifikatsanforderung (CSR)
# fuer ein Apple-Distribution-Zertifikat. Kein Mac noetig. Der private Schluessel verlaesst den Rechner nur als .p12 in ein GitHub-Geheimnis.
#   bash make-signing-request.sh csr  <E-Mail> [Ordner]          -> vu-dist.key (GEHEIM), vu-dist.csr (an Apple hochladen)
#   bash make-signing-request.sh p12  <heruntergeladene.cer> [Ordner]  -> vu-dist.p12 (+ Base64-Datei fuer das Geheimnis)
# Nie in ein Repository, in Chat oder PR legen: vu-dist.key, vu-dist.p12, das Passwort.
set -euo pipefail
mode="${1:-}"; dir="${3:-./vu-signing}"; mkdir -p "$dir"; umask 077
case "$mode" in
  csr)
    email="${2:?E-Mail-Adresse des Apple-Kontos}"
    openssl genrsa -out "$dir/vu-dist.key" 2048
    openssl req -new -key "$dir/vu-dist.key" -out "$dir/vu-dist.csr" -subj "/emailAddress=$email/CN=Vision Universe Distribution/C=DE"
    echo "Fertig: $dir/vu-dist.csr bei Apple hochladen. $dir/vu-dist.key sicher aufbewahren (geheim)."
    ;;
  p12)
    cer="${2:?Pfad zur heruntergeladenen .cer-Datei}"
    [ -f "$dir/vu-dist.key" ] || { echo "vu-dist.key fehlt in $dir"; exit 1; }
    read -r -s -p "Passwort fuer die .p12-Datei (neu waehlen, merken): " pw; echo
    openssl x509 -inform DER -in "$cer" -out "$dir/vu-dist.pem"
    openssl pkcs12 -export -inkey "$dir/vu-dist.key" -in "$dir/vu-dist.pem" -out "$dir/vu-dist.p12" -passout "pass:$pw"
    base64 < "$dir/vu-dist.p12" | tr -d '\n' > "$dir/vu-dist.p12.base64"
    echo "Fertig: Inhalt von $dir/vu-dist.p12.base64 wird das Geheimnis IOS_DIST_P12_BASE64, das Passwort IOS_DIST_P12_PASSWORD."
    ;;
  *) echo "Aufruf: $0 csr <E-Mail> [Ordner] | $0 p12 <datei.cer> [Ordner]"; exit 2 ;;
esac
