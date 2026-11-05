#!/usr/bin/env bash
# Erzeugt auf IHREM Rechner (Windows: Git Bash; Linux; macOS) mit OpenSSL den Upload-Schluessel fuer Google Play als .p12-Keystore.
# Kein Java noetig. Es wird nichts hochgeladen und nichts gesendet.
#   bash make-android-upload-key.sh create     (erzeugt Schluessel + Zertifikat + Keystore, fragt ein neues Passwort)
#   bash make-android-upload-key.sh clip       (Base64 des Keystores in die Zwischenablage, fuer das GitHub-Geheimnis)
#   bash make-android-upload-key.sh clean      (loescht den Arbeitsordner, nachdem Passwortmanager UND GitHub alles haben)
# Arbeitsordner: $VU_SIGNING_DIR oder ~/vu-android-signing (AUSSERHALB jedes Git-Repositorys und ausserhalb von Cloud-Ordnern wie OneDrive/iCloud/Dropbox).
# Nie in ein Repository, in Chat oder PR legen: vu-android-upload.p12, das Passwort, die Base64-Werte.
# Hintergrund: Google signiert die App fuer die Nutzer selbst (Play App Signing). Dieser "Upload-Schluessel" beweist nur, dass ein Upload von Ihnen stammt;
# geht er verloren, kann Google ihn zuruecksetzen (Zertifikat vu-android-upload-cert.pem aufbewahren, es ist nicht geheim).
set -euo pipefail
mode="${1:-}"; dir="${VU_SIGNING_DIR:-$HOME/vu-android-signing}"; umask 077
alias_name="upload"

guard_dir() {
  mkdir -p "$dir"
  if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "ABBRUCH: $dir liegt in einem Git-Repository."; exit 1; fi
  case "$(cd "$dir" && pwd)" in
    *OneDrive*|*iCloud*|*Dropbox*|*"Google Drive"*|*"Creative Cloud"*) echo "ABBRUCH: $dir liegt in einem Cloud-Ordner. VU_SIGNING_DIR auf einen lokalen Ordner setzen."; exit 1 ;;
  esac
}
copy_clip() {
  if command -v clip.exe >/dev/null 2>&1; then clip.exe; elif command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard; else return 1; fi
}

case "$mode" in
  create)
    guard_dir
    [ ! -e "$dir/vu-android-upload.p12" ] || { echo "ABBRUCH: $dir/vu-android-upload.p12 existiert schon. Nicht ueberschreiben (zuerst 'clean', falls Sie neu anfangen wollen)."; exit 1; }
    read -r -s -p "Neues Passwort fuer den Keystore (mindestens 16 Zeichen, im Passwortmanager speichern): " pw; echo
    [ "${#pw}" -ge 16 ] || { echo "Passwort zu kurz."; exit 1; }
    # Gueltigkeit ca. 27 Jahre (Google verlangt eine Gueltigkeit bis mindestens 2033).
    openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes -keyout "$dir/vu-android-upload.key" -out "$dir/vu-android-upload-cert.pem" \
      -subj "/CN=Vision Universe Upload/O=RAM Consulting UG (haftungsbeschraenkt)/C=DE"
    openssl pkcs12 -export -inkey "$dir/vu-android-upload.key" -in "$dir/vu-android-upload-cert.pem" -name "$alias_name" \
      -out "$dir/vu-android-upload.p12" -passout "pass:$pw"
    rm -f "$dir/vu-android-upload.key"   # der Schluessel steckt jetzt nur noch im Keystore
    echo "Fertig. Ordner: $dir"
    echo "  vu-android-upload.p12       GEHEIM: Keystore (Alias: $alias_name)"
    echo "  vu-android-upload-cert.pem  nicht geheim: Zertifikat, fuer einen spaeteren Schluessel-Reset aufbewahren"
    echo "Pruefsumme des Zertifikats (SHA-256, kein Geheimnis):"
    openssl x509 -in "$dir/vu-android-upload-cert.pem" -noout -fingerprint -sha256
    echo "Naechster Schritt: Keystore in den Passwortmanager (Datei-Anhang) sichern, dann:  bash $0 clip"
    ;;
  clip)
    guard_dir; [ -f "$dir/vu-android-upload.p12" ] || { echo "vu-android-upload.p12 fehlt (zuerst: create)"; exit 1; }
    if base64 < "$dir/vu-android-upload.p12" | tr -d '\n' | copy_clip; then echo "Base64 liegt in der Zwischenablage. Jetzt als GitHub-Geheimnis ANDROID_UPLOAD_KEYSTORE_BASE64 einfuegen, danach die Zwischenablage leeren."
    else echo "Keine Zwischenablage gefunden. Windows PowerShell:  [Convert]::ToBase64String([IO.File]::ReadAllBytes(\"$dir/vu-android-upload.p12\")) | Set-Clipboard"; exit 1; fi
    ;;
  clean)
    guard_dir
    echo "Loescht $dir (Keystore, Zertifikat). Nur ausfuehren, wenn Passwortmanager-Sicherung UND GitHub-Geheimnisse vorhanden sind."
    read -r -p "Wirklich loeschen? Tippen Sie LOESCHEN: " a; [ "$a" = "LOESCHEN" ] || { echo "Abgebrochen."; exit 1; }
    rm -rf "$dir" && echo "Geloescht."
    ;;
  *) echo "Aufruf: $0 create | clip | clean"; exit 2 ;;
esac
