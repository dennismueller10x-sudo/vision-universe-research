# Konten-Datenbank: Sicherung einrichten und wiederherstellen

Gilt für `.github/workflows/account-backup.yml`. Der Workflow braucht zwei Einstellungen.
Fehlt eine, bricht er bewusst ab („fail closed“). Es wird nie unverschlüsselt gesichert.

## Voraussetzungen

| Art | Name | Inhalt |
|---|---|---|
| Repository-**Variable** | `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` | öffentlicher age-Schlüssel `age1…`; nicht geheim |
| Repository-**Secret** | `VU_ACCOUNT_BACKUP_DB_URL` | Session-Pooler-URI der Produktionsdatenbank (enthält das DB-Passwort) |

Am Workflow selbst ist dafür nichts zu ändern.

## Schlüssel erzeugen, ohne Laptop (10 min)

Der private Schlüssel entsteht in einer Wegwerf-Shell und landet nur im Passwortmanager.

1. Safari → `shell.cloud.google.com` → Menü → **Ephemeral Mode**.
2. In der Shell:
   ```bash
   sudo apt-get install -y -qq age >/dev/null
   umask 077; age-keygen -o /tmp/vu-accounts.key 2>/dev/null
   age-keygen -y /tmp/vu-accounts.key        # öffentlicher Teil age1…  -> GitHub-Variable
   cat /tmp/vu-accounts.key                  # privater Teil AGE-SECRET-KEY-1… -> Passwortmanager
   shred -u /tmp/vu-accounts.key
   ```
3. Im Passwortmanager einen Eintrag „VU Konten-Backup age-Schlüssel“ anlegen:
   - die drei Zeilen der Schlüsseldatei
   - Datum
   - Hinweis „nur für Wiederherstellung“
4. Zweite Kopie offline: auf Papier oder als Ausdruck im Safe.
   - Der private Schlüssel ist kurz (74 Zeichen).
   - Ohne ihn sind alle Sicherungen unlesbar.
5. Shell schließen. Im Ephemeral Mode bleibt nichts zurück.

Nie: den privaten Schlüssel in GitHub, in ein Repository, in einen Chat, in eine Notiz-App oder in einen Screenshot.

## Eintragen (5 min, GitHub-App oder Safari)

1. Repository → Settings → Secrets and variables → Actions.
2. **Variables** → New: `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` = `age1…`.
3. **Secrets** → New: `VU_ACCOUNT_BACKUP_DB_URL`.
   - Wert aus Supabase: Projekt → **Connect** → **Session pooler** (Port 5432, nicht der Transaction-Pooler 6543).
   - Das Datenbank-Passwort einsetzen.
   - Die URI muss die Projektkennung enthalten. Der Workflow prüft das.
4. Actions → „Konten — Datenbank-Sicherung“ → **Run workflow** (main). Erwartet: grün, Artefakt `vu-accounts-backup` (30 Tage).

## Wiederherstellung (immer zuerst isoliert)

1. Artefakt herunterladen. Nach Phase 2 liegt es zusätzlich verschlüsselt im Backup-Bucket.
2. In einer Wegwerf-Shell: privaten Schlüssel aus dem Passwortmanager in eine Datei mit Rechten 600 einfügen.
   `age -d -i key.txt -o db.dump vu-accounts-….dump.age`, danach `shred -u key.txt`.
3. **Zuerst in eine leere Testdatenbank** spielen:
   - ein leeres Supabase-Projekt oder ein lokales/Container-Postgres 17
   - `pg_restore --no-owner -d <test-uri> db.dump`
   - oder wie in `docs/accounts/PRODUCTION.md`: Schema über die Migrationen, dann `--data-only`
4. Zeilenzahlen prüfen. **Nie** direkt in die Produktionsdatenbank.
   Eine Wiederherstellung in Produktion ist eine eigene Owner-Entscheidung mit vorheriger Sicherung des Ist-Zustands.

Hinweis zum Schema `auth`: Ein neues Supabase-Projekt bringt eigene `auth`-Tabellen und -Migrationen mit.
Nutzerdaten aus `auth` deshalb nur mit `--data-only` und nur für die Tabellen zurückspielen, die fehlen; vorher im Testprojekt üben.

## Getestet

`scripts/backup/tests/account-backup-restore-test.sh` nimmt den Schritt **unverändert** aus dem Workflow. Nur das Docker-Image wird durch ein lokales `pg_dump` ersetzt. Der Test läuft mit synthetischen Daten und einem Wegwerf-Schlüssel und prüft:

- Verschlüsselung
- kein Klartext in der Sicherung
- Entschlüsseln
- vollständige Wiederherstellung in eine leere Datenbank, in beiden Varianten
- Quelle unverändert
- Gegenproben: fehlender Empfänger, falsches Projekt, ungültiger Schlüssel, Datenbank nicht erreichbar
