# Konten-Datenbank: verschlüsselte Sicherung nach Backblaze B2 (Option B)

**Grundsatz:** Echte Datenbankexporte entstehen nie als Actions-Artefakt im öffentlichen Repository. Dort kann jede angemeldete GitHub-Person Artefakte laden.

Die Sicherung läuft im **privaten** Backup-Repository `vision-universe-backup`:

```
vu-db-backup.yml (privates Repo, Environment "backup")
  1 vu-key-check: B2-Schreibschlüssel darf NICHT löschen          (sonst Abbruch)
  2 Anmeldung als vu_backup_ro, Prüfung: Sitzung read-only, keine Schreibrechte (sonst Abbruch)
  3 pg_dump 17 | age -r <öffentlicher Schlüssel>   → nur verschlüsselt auf der Platte
  4 Upload nach B2: db/accounts/JJJJ/MM/vu-accounts-<zeit>.dump.age + .json (Manifest)
    mit Content-MD5 und SHA-256; Bucket mit Object Lock (Compliance 30 Tage)
  5 Rückprüfung: Objekt aus B2 zurücklesen, SHA-256 vergleichen
  kein Artefakt, im Log nur Größe, Objektname, Prüfsumme
```

**Wiederherstellen ohne GitHub:** `bin/vu-db-restore-drill.sh --from-s3 latest erwartet.txt`

- Läuft in jeder Linux-Shell, z. B. in der Cloud Shell.
- Braucht nur den B2-Leseschlüssel und den privaten age-Schlüssel aus dem Passwortmanager.
- Spielt in eine Wegwerf-Datenbank Postgres 17 ein, **nie** in Supabase.

## Getestet (synthetisch)

| Test | Prüft |
|---|---|
| `tests/db-export-test.sh` (D01–D11) | Export in einen Bucket mit Object Lock; kein Klartext und keine Zugangsdaten in der Ausgabe. Abgewiesen werden: privilegierter Benutzer, Rolle mit Schreibrechten, falsches Projekt, kaputter Schlüssel; dann wird nichts hochgeladen. Wiederherstellung direkt aus dem Ziel: Prüfsumme gleich Manifest, Zeilenzahlen stimmen, Quelle unverändert |
| `tests/backup-role-test.sh` (R01–R10) | Leserolle: Anlage, vollständiger Dump inkl. RLS- und fremder `auth`-Tabellen, kein Schreiben |
| `tests/account-backup-restore-test.sh` (A01–A16) | Restore-Werkzeug mit Supabase-Rollen und Erweiterungen |

## Owner-Schritte

### 0. Sofort: öffentliche Sicherung stilllegen (1 min)

`account-backup.yml` im öffentlichen Repo würde, sobald die Variable `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` gesetzt ist, mit dem **privilegierten** Migrationszugang exportieren. Das Ergebnis wäre ein **öffentliches** Artefakt.

- GitHub-App oder Safari: Actions → „Konten — Datenbank-Sicherung (verschlüsselt)“ → ⋯ → **Disable workflow**. Jederzeit umkehrbar.
- Die Variable `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` im öffentlichen Repo **nicht** anlegen. Falls sie schon existiert: löschen.

Endgültig entfernt wird der Workflow mit einem vorbereiteten PR, nach dem ersten erfolgreich geprüften Lauf im privaten Repo.

### 1. Backblaze (ca. 30 min, kostenlos)

Nach `docs/B2_PHASE2_IPHONE.md`, Abschnitte A–E:
- Konto **EU Central**, 2FA, **ohne Zahlungsart**
- Test-Bucket und Abnahme T-B2-1 bis T-B2-9

Danach den Sicherungs-Bucket wie den Test-Bucket anlegen, nur mit diesen Abweichungen:
- Name `vu-backup-<6 Zufallszeichen>`, privat, SSE-B2 an
- Object Lock **Compliance 30 Tage**
- Lifecycle `daysFromHidingToDeleting = 400`

Ohne Zahlungsart bleibt das Konto im kostenlosen Rahmen von 10 GB. Ein Dump hat heute ~1 MB; ein Jahr täglicher Stände belegt unter 1 GB.

Schlüssel in der Cloud Shell mit `bin/vu-b2-make-key.py`:

```bash
python3 bin/vu-b2-make-key.py --bucket <sicherungs-bucket> --role writer --name vu-db-writer --days 365   # → privates Repo
python3 bin/vu-b2-make-key.py --bucket <sicherungs-bucket> --role reader --name vu-db-reader               # → nur Passwortmanager
```

### 2. Schlüssel und Leserolle (Cloud Shell, Ephemeral Mode, ca. 10 min)

```bash
sudo apt-get install -y -qq age postgresql-client >/dev/null
git clone -q --depth 1 -b claude/vu-backup-tooling https://github.com/dennismueller10x-sudo/vision-universe-research.git vu && cd vu/scripts/backup
umask 077; age-keygen -o /tmp/k.txt 2>/dev/null
age-keygen -y /tmp/k.txt     # öffentlicher Teil age1…  → Variable im privaten Repo
cat /tmp/k.txt               # privater Teil → NUR Passwortmanager + Papier
shred -u /tmp/k.txt
```

**Passwort der Leserolle setzen.** Die Rolle `vu_backup_ro` existiert bereits, ohne Passwort.
1. Im Passwortmanager 32 Zeichen erzeugen, nur Buchstaben und Ziffern.
2. Weiter in der Cloud Shell:
   ```bash
   read -rs PGURL            # postgres-URI (Supabase → Connect → Session pooler), unsichtbar
   psql "$PGURL"             # darin:  \password vu_backup_ro   (zweimal einfügen)   dann  \q
   unset PGURL
   read -rs ROURL            # postgresql://vu_backup_ro.<projekt-ref>:<passwort>@<pooler-host>:5432/postgres
   psql "$ROURL" -Atc "select current_user, current_setting('default_transaction_read_only')"   # erwartet: vu_backup_ro|on
   unset ROURL
   ```

Lehnt der Pooler die Anmeldung ab: Bescheid geben. Dann prüfen wir die direkte Verbindung oder den IPv4-Pooler.

### 3. Privates Repository (ca. 10 min)

1. Neues **privates** Repo `vision-universe-backup` anlegen.
2. Inhalt aus der Cloud Shell hineinlegen:
   - `scripts/backup/`
   - `runner/github-actions/vu-db-backup.yml` und `vu-runner-probe.yml` nach `.github/workflows/`
3. Settings → Actions → General → Workflow permissions: **Read repository contents**.
4. Settings → Environments:

| Environment | Secrets | Variables |
|---|---|---|
| `backup-test` | `B2_TEST_WRITER_KEY_ID`, `B2_TEST_WRITER_KEY` | `B2_TEST_ENDPOINT`, `B2_TEST_BUCKET`, `VU_DB_TEST_AGE_RECIPIENT` (= derselbe `age1…`) |
| `backup` | `B2_WRITER_KEY_ID`, `B2_WRITER_KEY`, `VU_DB_BACKUP_RO_URL` (URI der Leserolle) | `B2_ENDPOINT`, `B2_BUCKET`, `VU_DB_PROJECT` (= Projekt-Ref), `VU_DB_AGE_RECIPIENT` (`age1…`) |

### 4. Läufe

1. Actions → „VU Konten-DB-Backup“ → Run workflow → **synthetic**. Erwartet: grün, Tabelle „Konten-Datenbank gesichert“ mit einem Objekt unter `vu-acceptance/db-accounts/`. Die Zusammenfassung an Claude geben.
2. Claude erhebt die Zeilenzahlen per Lese-Abfrage und erstellt `erwartet.txt`.
3. Run workflow → **real**. Erwartet: grün, Objekt unter `db/accounts/…`.
4. Wiederherstellungsprobe in der Cloud Shell, mit dem **Leseschlüssel**:
   ```bash
   pip install -q boto3
   export VU_S3_ENDPOINT=https://s3.eu-central-00X.backblazeb2.com VU_S3_BUCKET=<sicherungs-bucket>
   read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   bin/vu-db-restore-drill.sh --from-s3 latest erwartet.txt    # fragt verdeckt nach dem privaten age-Schlüssel
   ```

   Die Ausgabezeilen gehen an Claude: nur Tabellennamen und Zahlen, keine Inhalte.
5. Claude vergleicht die Schreibzähler der Produktion vor und nach dem Lauf.
6. Erst dann: täglichen Zeitplan im privaten Workflow einschalten, PR „öffentliche Sicherung entfernen“ freigeben.
