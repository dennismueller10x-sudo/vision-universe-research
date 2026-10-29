# Konten-Datenbank: Sicherung einrichten und wiederherstellen

Gilt für `.github/workflows/account-backup.yml`. Der Workflow braucht zwei Einstellungen.
Fehlt eine, bricht er bewusst ab („fail closed“). Es wird nie unverschlüsselt gesichert.
Am Workflow selbst ist nichts zu ändern.

| Art | Name | Inhalt |
|---|---|---|
| Repository-**Variable** | `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` | öffentlicher age-Schlüssel `age1…` (nicht geheim) |
| Repository-**Secret** | `VU_ACCOUNT_BACKUP_DB_URL` | Session-Pooler-URI der **Leserolle** `vu_backup_ro` (empfohlen) oder von `postgres` |

## Warum eine eigene Leserolle

`postgres` darf in Supabase alles ändern. Liegt dessen Passwort in einem GitHub-Secret, reicht ein kompromittierter Workflow, um die Konten-Datenbank zu verändern.
`sql/vu_backup_ro.sql` legt deshalb eine Rolle an, die alles lesen, aber nichts schreiben kann:

- `pg_read_all_data`: Lesen auf alle Tabellen, auch auf die `auth`-Tabellen, die `postgres` nicht weitergeben darf
- `BYPASSRLS`: `pg_dump` braucht das bei Tabellen mit Row Level Security
- keine Schreib-, Anlege- oder Rollenrechte
- `default_transaction_read_only = on` als zweite Sperre
- höchstens 2 Verbindungen

Getestet mit `tests/backup-role-test.sh` (R01–R10, synthetisch):
- Anlegen als Nicht-Superuser
- vollständiger Dump, inkl. fremder `auth`-Tabellen und RLS
- jede Schreibart verweigert, auch ohne die Lesesperre
- Daten unverändert

## Einrichtung am iPhone (Safari, ca. 20 min)

Alles in **Google Cloud Shell**: `shell.cloud.google.com` → Menü (⋮) → **Ephemeral Mode**. Nach dem Schließen bleibt nichts gespeichert.
Passwörter und Schlüssel werden nur mit `read -rs` eingegeben: ohne Anzeige, ohne Shell-Verlauf.

### 1. Werkzeuge

```bash
sudo apt-get install -y -qq age postgresql-client >/dev/null
git clone -q --depth 1 -b claude/vu-backup-tooling https://github.com/dennismueller10x-sudo/vision-universe-research.git vu
cd vu/scripts/backup
```

### 2. age-Schlüsselpaar

```bash
umask 077; age-keygen -o /tmp/k.txt 2>/dev/null
age-keygen -y /tmp/k.txt     # öffentlicher Teil age1…  → später GitHub-Variable
cat /tmp/k.txt               # privater Teil (3 Zeilen) → NUR Passwortmanager + Papier
shred -u /tmp/k.txt
```

Im Passwortmanager einen Eintrag „VU Konten-Backup age“ anlegen: alle drei Zeilen und das Datum.

### 3. Passwort der Leserolle setzen

Die Rolle `vu_backup_ro` ist bereits angelegt (29.10.2026, ohne Passwort, damit nicht anmeldefähig).
Du setzt nur das Passwort, verdeckt. psql überträgt dabei lediglich einen Prüfwert (SCRAM), nie den Klartext.

1. Im Passwortmanager ein neues Passwort erzeugen: 32 Zeichen, nur Buchstaben und Ziffern. Speichern als „VU Konten-Backup DB-Rolle“.
2. In Supabase: Projekt → **Connect** → **Session pooler** → URI kopieren. Das ist die `postgres`-URI; dein Datenbankpasswort einsetzen.
3. In der Cloud Shell:
   ```bash
   read -rs PGURL                                   # postgres-URI einfügen, Enter (unsichtbar)
   psql "$PGURL"                                    # öffnet die Datenbank-Konsole
   ```
   In der Konsole `\password vu_backup_ro` eingeben, das neue Passwort zweimal einfügen, dann `\q`. Danach:
   ```bash
   unset PGURL
   ```

(Falls die Rolle noch fehlt, z. B. in einem neuen Projekt: vorher `psql "$PGURL" -v ON_ERROR_STOP=1 -f sql/vu_backup_ro.sql`.)

### 4. Verbindung der Leserolle prüfen

Die URI der Leserolle gleicht der postgres-URI, nur Benutzer und Passwort ändern sich:
`postgresql://vu_backup_ro.<projekt-ref>:<passwort>@<pooler-host>:5432/postgres`

```bash
read -rs ROURL                                   # URI der Leserolle einfügen
psql "$ROURL" -Atc "select current_user, current_setting('default_transaction_read_only'), has_table_privilege('public.profiles','INSERT')"
```

Erwartet: `vu_backup_ro|on|f`.
- Meldet der Pooler einen Fehler bei der Anmeldung: Schritt 5 mit der postgres-URI einrichten und mir Bescheid geben (Ausweichweg, weniger streng).
- Danach `unset ROURL`.

### 5. GitHub eintragen

GitHub-App oder Safari → Repository → **Settings** → **Secrets and variables** → **Actions**:
- **Variables** → New repository variable: `VU_ACCOUNT_BACKUP_AGE_RECIPIENT` = `age1…` aus Schritt 2
- **Secrets** → New repository secret: `VU_ACCOUNT_BACKUP_DB_URL` = URI der Leserolle aus Schritt 4

### 6. Erster Lauf

Actions → **„Konten — Datenbank-Sicherung (verschlüsselt)“** → **Run workflow** (Branch `main`).
- Erwartet: grün, Artefakt `vu-accounts-backup`.
- `pg_dump` liest in einer reinen Lesetransaktion. Mit der Leserolle ist Schreiben zusätzlich technisch ausgeschlossen.

## Wiederherstellungsprobe (isoliert, Postgres 17)

1. Actions → Lauf → Artifacts → `vu-accounts-backup` herunterladen.
2. In der Cloud Shell hochladen: Menü → Upload. Dann:
   ```bash
   unzip -o vu-accounts-backup.zip
   bin/vu-db-restore-drill.sh vu-accounts-*.dump.age erwartet.txt
   ```
3. Den privaten Schlüssel (Zeile `AGE-SECRET-KEY-1…`) einfügen, wenn gefragt. Die Eingabe bleibt unsichtbar und wird danach gelöscht.

Das Skript:
- startet eine **Wegwerf**-Datenbank (Docker `postgres:17`, nur lokal erreichbar)
- legt die Supabase-Rollen und Erweiterungen an
- spielt die Sicherung ein
- vergleicht die Zeilenzahlen mit `erwartet.txt`

`erwartet.txt` (nur Tabellennamen und Zahlen) erstellt Claude direkt vor dem Lauf per Lese-Abfrage.

**Nie** in die Produktionsdatenbank zurückspielen. Das wäre eine eigene Entscheidung mit vorheriger Sicherung des Ist-Zustands.
Hinweis zum Schema `auth` bei einer echten Wiederherstellung in ein neues Supabase-Projekt: Das Projekt bringt eigene `auth`-Tabellen mit, deshalb dort nur `--data-only` und vorher im Testprojekt üben.

## Getestet

| Test | Prüft |
|---|---|
| `tests/account-backup-restore-test.sh` (A01–A16) | Workflow-Schritt unverändert, synthetische DB mit RLS-Richtlinie und Erweiterung, Wegwerf-Schlüssel, Verschlüsselung, Wiederherstellung, Quelle unverändert, Gegenproben |
| `tests/backup-role-test.sh` (R01–R10) | Leserolle |
