# vu-backup – unabhängige, verschlüsselte Sicherung

Stand: Entwurf (Phase 1). **Nichts davon ist eingerichtet oder aktiv.**
Es gibt hier keinen Workflow unter `.github/workflows`, kein Backup-Ziel und keine Zugangsdaten.

Zielbild: Der Owner startet die Sicherung alle 2–3 Tage vom iPhone. Ein kurzlebiger Cloud-Runner
liest alle Quellen nur lesend, verschlüsselt mit restic und schreibt in einen eigenen
Backblaze-B2-Bucket mit Object Lock. Danach prüft er die Sicherung, berichtet und beendet sich.
Wiederherstellen geht ohne GitHub: Nötig sind nur der B2-Bucket, das restic-Passwort und diese Skripte.
Eine Kopie der Skripte liegt in jeder Sicherung.

```
scripts/backup/
  bin/vu-backup.sh        Sicherungslauf (alle Quellen, Prüfung, Bericht)
  bin/vu-verify.sh        restic check: quick | sample | full
  bin/vu-maintain.sh      Aufbewahrung: plan | apply (getrennt vom Sicherungslauf)
  bin/vu-restore.sh       list | drill | get | git-branch | git-push | r2-upload
  bin/vu-pit-recover.py   Zustand zu einem Zeitpunkt aus Objektversionen (nach Angriff/Fehler)
  bin/vu-anchor-lock.py   Legal Hold auf die Erstsicherung (nur mit Anker-Schlüssel)
  bin/vu-key-check.py     prüft vor jedem Lauf, dass der B2-Schlüssel NICHT löschen darf
  bin/vu-db-export.sh     Konten-DB: Leserolle, age vor dem Upload, direkt nach B2 (kein Artefakt)
  bin/vu-db-restore-drill.sh  Restore-Probe der verschlüsselten Konten-DB (Datei oder --from-s3) in eine Wegwerf-Datenbank
  bin/vu-cost-estimate.py Speicher- und Kostenhochrechnung (liest nur die öffentliche Repo-Größe)
  bin/vu-b2-make-key.py   legt B2-Schlüssel mit genau den Rechten einer Rolle an (einmalig, Wegwerf-Shell)
  bin/vu-status.py        Statusbericht (Markdown, JSON, Kurzfassung für Benachrichtigung)
  sources/                git (Bundle-Kette oder Mirror), api_export.py (GitHub-Metadaten, Artefakte,
                          Cloudflare KV/DNS/Worker, Brevo), r2 (rclone), supabase (pg_dump)
  config/backup.env.example   alle Einstellungen, ohne Werte
  runner/github-actions/  Workflow-Vorlagen für ein separates privates Backup-Repository (Sicherung, Konten-DB, Runner-Probe)
  sql/vu_backup_ro.sql    Leserolle für den Datenbankexport
  runner/container/       portables Image (Cloud Run Job, Cloud Batch, jede Container-Laufzeit)
  runner/cloud-run/       Job-Vorlage für den Ersatz-Runner
  tests/                  Ende-zu-Ende-Test mit synthetischen Daten und lokalen Emulatoren
  docs/                   Owner-Einrichtung, Bedienung am iPhone, Wiederherstellung, Testplan
```

## Grundsätze

- **Nur lesend an den Quellen.** Jede Quelle bekommt einen eigenen Lese-Zugang. Produktive Schlüssel werden nicht wiederverwendet.
- **Verschlüsselt vor dem Upload.** restic (AES-256, Poly1305-MAC). Das Passwort liegt nur im Runner-Secret und im Passwortmanager.
- **Der Schreibschlüssel kann nicht löschen.**
  - B2-Schlüssel ohne `deleteFiles`, `bypassGovernance`, Retention- und Bucket-Rechte. `vu-key-check.py` bricht sonst ab.
  - restic kann Dateien damit nur verbergen (hide). Verborgene Versionen entfernt erst die Lifecycle-Regel des Buckets nach einer langen Frist. Object Lock und Legal Hold verhindern das zusätzlich.
- **Ein Abbruch beschädigt nichts.** restic schreibt einen Snapshot erst, wenn alle Daten oben sind. Jede Quelle ist unabhängig; eine fehlende Quelle macht den Lauf rot, die anderen werden trotzdem gesichert.
- **Keine Werte in Logs.** Alle Ausgaben laufen durch `lib/redact.py`. Berichte enthalten nur Zähler, Größen und Zeitpunkte.

## Lokaler Test (synthetische Daten)

```bash
python3 -m venv /tmp/vu-venv && /tmp/vu-venv/bin/pip install 'moto[server]==5.1.4' boto3
VU_TEST_PYTHON=/tmp/vu-venv/bin/python scripts/backup/tests/synthetic-test.sh
```

Der Test braucht `restic`, `rclone`, `git` und `python3`. Er startet einen lokalen S3-Emulator mit Versionierung und Object Lock sowie einen API-Fake. Er stellt keine Verbindung zu echten Diensten her.

Einrichtung: **[docs/SETUP_IPHONE.md](docs/SETUP_IPHONE.md)**, Secrets und Variablen: [docs/SECRETS.md](docs/SECRETS.md). Git-Speicher und Grenzen: [docs/GIT_STORAGE.md](docs/GIT_STORAGE.md). Weitere Anleitungen: [docs/OWNER_SETUP.md](docs/OWNER_SETUP.md), [docs/MOBILE.md](docs/MOBILE.md), [docs/RESTORE.md](docs/RESTORE.md), [docs/TESTPLAN.md](docs/TESTPLAN.md), [docs/B2_PHASE2_IPHONE.md](docs/B2_PHASE2_IPHONE.md), [docs/ACCOUNT_DB_BACKUP.md](docs/ACCOUNT_DB_BACKUP.md).
