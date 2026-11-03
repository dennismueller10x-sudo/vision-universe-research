#!/usr/bin/env bash
# Erzeugt auf IHREM Rechner (Windows: Git Bash; Linux; macOS) mit OpenSSL den privaten Schluessel, die Zertifikatsanforderung (CSR)
# und die .p12-Datei fuer ein Apple-Distribution-Zertifikat. Kein Mac noetig. Es wird nichts hochgeladen und nichts gesendet.
#   bash make-signing-request.sh csr  <Apple-ID-E-Mail>
#   bash make-signing-request.sh p12  <heruntergeladene.cer>
#   bash make-signing-request.sh clean                       (loescht den Arbeitsordner sicher, nachdem alles in GitHub liegt)
# Arbeitsordner: $VU_SIGNING_DIR oder ~/vu-signing (AUSSERHALB jedes Git-Repositorys und ausserhalb von Cloud-Ordnern wie OneDrive/iCloud/Dropbox).
# Nie in ein Repository, in Chat oder PR legen: vu-dist.key, vu-dist.p12, das Passwort, die Base64-Werte.
set -euo pipefail
mode="${1:-}"; dir="${VU_SIGNING_DIR:-$HOME/vu-signing}"; umask 077

guard_dir() {
  mkdir -p "$dir"
  if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "ABBRUCH: $dir liegt in einem Git-Repository."; exit 1; fi
  case "$(cd "$dir" && pwd)" in
    *OneDrive*|*iCloud*|*Dropbox*|*"Google Drive"*|*"Creative Cloud"*) echo "ABBRUCH: $dir liegt in einem Cloud-Ordner. VU_SIGNING_DIR auf einen lokalen Ordner setzen."; exit 1 ;;
  esac
}
copy_clip() {  # in die Zwischenablage statt in eine Datei; gibt 0 zurueck, wenn es ging
  if command -v clip.exe >/dev/null 2>&1; then clip.exe; elif command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard; else return 1; fi
}

case "$mode" in
  csr)
    email="${2:?E-Mail-Adresse des Apple-Kontos}"; guard_dir
    openssl genrsa -out "$dir/vu-dist.key" 2048
    openssl req -new -key "$dir/vu-dist.key" -out "$dir/vu-dist.csr" -subj "/emailAddress=$email/CN=Vision Universe Distribution/C=DE"
    echo "Fertig. Ordner: $dir"
    echo "  vu-dist.csr  -> bei Apple hochladen (ist nicht geheim)"
    echo "  vu-dist.key  -> GEHEIM, bleibt in diesem Ordner"
    ;;
  p12)
    cer="${2:?Pfad zur heruntergeladenen .cer-Datei}"; guard_dir
    [ -f "$dir/vu-dist.key" ] || { echo "vu-dist.key fehlt in $dir (zuerst: csr)"; exit 1; }
    read -r -s -p "Neues Passwort fuer die .p12-Datei (mindestens 16 Zeichen, im Passwortmanager speichern): " pw; echo
    [ "${#pw}" -ge 16 ] || { echo "Passwort zu kurz."; exit 1; }
    openssl x509 -inform DER -in "$cer" -out "$dir/vu-dist.pem"
    openssl pkcs12 -export -inkey "$dir/vu-dist.key" -in "$dir/vu-dist.pem" -out "$dir/vu-dist.p12" -passout "pass:$pw"
    echo "Fertig: $dir/vu-dist.p12"
    echo "Pruefsumme des Zertifikats (SHA-1, zum Abgleich spaeter, kein Geheimnis):"
    openssl x509 -in "$dir/vu-dist.pem" -noout -fingerprint -sha1
    echo "Naechster Schritt: Base64 in die Zwischenablage und direkt als GitHub-Geheimnis IOS_DIST_P12_BASE64 einfuegen:  bash $0 clip"
    ;;
  clip)
    guard_dir; [ -f "$dir/vu-dist.p12" ] || { echo "vu-dist.p12 fehlt"; exit 1; }
    if base64 < "$dir/vu-dist.p12" | tr -d '\n' | copy_clip; then echo "Base64 der .p12 liegt in der Zwischenablage. Jetzt in GitHub einfuegen, danach die Zwischenablage leeren."
    else echo "Keine Zwischenablage gefunden. Windows: in PowerShell  [Convert]::ToBase64String([IO.File]::ReadAllBytes(\"$dir/vu-dist.p12\")) | Set-Clipboard"; exit 1; fi
    ;;
  clean)
    guard_dir
    echo "Loescht $dir (Schluessel, CSR, p12). Nur ausfuehren, wenn Passwortmanager-Sicherung UND GitHub-Geheimnisse vorhanden sind."
    read -r -p "Wirklich loeschen? Tippen Sie LOESCHEN: " a; [ "$a" = "LOESCHEN" ] || { echo "Abgebrochen."; exit 1; }
    rm -rf "$dir" && echo "Geloescht."
    ;;
  *) echo "Aufruf: $0 csr <E-Mail> | p12 <datei.cer> | clip | clean"; exit 2 ;;
esac
