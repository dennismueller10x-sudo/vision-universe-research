#!/usr/bin/env bash
# Werkzeuge fuer die Backup-Laeufe auf einem GitHub-Runner (ubuntu-24.04), feste Versionen,
# Pruefsummen aus den signierten SHA256SUMS der Releases (Stand 30.10.2026). Fail closed.
#   setup-tools.sh [restic] [rclone] [pg] [age] [py]
set -euo pipefail
RESTIC_VERSION=0.18.1
RESTIC_SHA256=680838f19d67151adba227e1570cdd8af12c19cf1735783ed1ba928bc41f363d
RCLONE_VERSION=1.71.2
RCLONE_SHA256=ab9fa5877cee91c64fdfd61a27028a458cf618b39259e5c371dc2ec34a12e415
cd "${RUNNER_TEMP:-/tmp}"
[ $# -gt 0 ] || set -- restic rclone pg age py
for t in "$@"; do
  case "$t" in
    restic)
      curl -fsSLo restic.bz2 "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2"
      echo "${RESTIC_SHA256}  restic.bz2" | sha256sum -c --quiet -
      bunzip2 -f restic.bz2 && chmod +x restic && sudo mv restic /usr/local/bin/restic ;;
    rclone)
      curl -fsSLo rclone.zip "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip"
      echo "${RCLONE_SHA256}  rclone.zip" | sha256sum -c --quiet -
      unzip -qo rclone.zip && sudo mv "rclone-v${RCLONE_VERSION}-linux-amd64/rclone" /usr/local/bin/rclone ;;
    pg)
      sudo install -d /usr/share/postgresql-common/pgdg
      sudo curl -fsSLo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
      echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
        | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
      sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-client-17 >/dev/null ;;
    age) sudo apt-get install -y -qq age >/dev/null ;;
    py) pip install --quiet boto3==1.40.0 ;;
  esac
done
