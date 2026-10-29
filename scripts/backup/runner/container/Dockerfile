# Portables Runner-Image fuer vu-backup (Cloud Run Job, Cloud Batch, jede Container-Laufzeit).
# Damit laesst sich die Sicherung ohne GitHub betreiben (Szenario C/D/I).
#
#   docker build -t vu-backup -f scripts/backup/runner/container/Dockerfile scripts/backup
#
# Werkzeuge mit fester Version und Pruefsumme; Werte bei Einrichtung eintragen.
FROM debian:12-slim

ARG RESTIC_VERSION=0.18.1
ARG RESTIC_SHA256=<aus SHA256SUMS des Releases>
ARG RCLONE_VERSION=1.71.2
ARG RCLONE_SHA256=<aus SHA256SUMS des Releases>

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git python3 python3-boto3 bzip2 unzip gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSLo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 \
 && curl -fsSLo /tmp/restic.bz2 "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/restic_${RESTIC_VERSION}_linux_amd64.bz2" \
 && echo "${RESTIC_SHA256}  /tmp/restic.bz2" | sha256sum -c - \
 && bunzip2 /tmp/restic.bz2 && install -m 0755 /tmp/restic /usr/local/bin/restic \
 && curl -fsSLo /tmp/rclone.zip "https://downloads.rclone.org/v${RCLONE_VERSION}/rclone-v${RCLONE_VERSION}-linux-amd64.zip" \
 && echo "${RCLONE_SHA256}  /tmp/rclone.zip" | sha256sum -c - \
 && unzip -q /tmp/rclone.zip -d /tmp && install -m 0755 /tmp/rclone-v${RCLONE_VERSION}-linux-amd64/rclone /usr/local/bin/rclone \
 && rm -rf /tmp/* /var/lib/apt/lists/*

COPY . /opt/vu-backup
RUN useradd -m -u 10001 backup && mkdir -p /work && chown backup /work
USER backup
ENV VU_WORK=/work/vu-backup-work
# Aktion als Argument: backup | backup-tier2 | verify | drill (siehe entrypoint.sh)
ENTRYPOINT ["/opt/vu-backup/runner/container/entrypoint.sh"]
CMD ["backup"]
