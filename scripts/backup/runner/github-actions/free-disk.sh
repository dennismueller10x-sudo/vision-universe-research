#!/usr/bin/env bash
# Platz auf einem GitHub-Runner schaffen und das Arbeitsverzeichnis auf das Dateisystem mit dem
# meisten freien Platz legen (VU_WORK ueber GITHUB_ENV). Entfernt nur vorinstallierte Werkzeuge,
# die die Sicherung nicht braucht. Ausgabe: Markdown-Tabelle.
set -euo pipefail
sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache/CodeQL \
  /usr/share/swift /usr/local/share/powershell /usr/local/share/chromium /opt/microsoft /opt/google 2>/dev/null || true
sudo docker image prune -af >/dev/null 2>&1 || true
best=$(df -Pk / /mnt 2>/dev/null | awk 'NR > 1 {print $4, $6}' | sort -rn | head -1 | cut -d' ' -f2)
work="${best%/}/vu-backup-work"
sudo mkdir -p "$work" && sudo chown "$USER" "$work"
[ -n "${GITHUB_ENV:-}" ] && echo "VU_WORK=$work" >> "$GITHUB_ENV"
echo "| Dateisystem | frei |"; echo "|---|---|"
df -Pk / /mnt 2>/dev/null | awk 'NR > 1 {printf "| %s | %.1f GB |\n", $6, $4 / 1048576}' | sort -u
echo "| Arbeitsverzeichnis | $work |"
