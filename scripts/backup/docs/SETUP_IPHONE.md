# Einrichtung am iPhone – in dieser Reihenfolge

Werte (Passwörter, Schlüssel, Tokens) gehören **nur** in den Passwortmanager und in die Secrets des privaten Repos `vision-universe-backup`. Nie in Chats, Notizen oder Screenshots. Die vollständige Liste steht in [SECRETS.md](SECRETS.md).

Zwei Sitzungen: **A** Testumgebung (ca. 40 min), **B** Produktion (ca. 50 min, erst wenn A grün ist).

---

## A1. Backblaze: Test-Bucket (Browser, 5 min)

Buckets → **Create a Bucket**:

| Feld | Wert |
|---|---|
| Name | `vu-backup-test-` + 6 zufällige Kleinbuchstaben/Ziffern |
| Files | **Private** |
| Default Encryption | **Enable** (SSE-B2) |
| Object Lock | **Enable** |

Danach im Bucket:
1. **Object Lock** → Default Retention: **Compliance**, **1 Tag**.
2. **Lifecycle Settings** → Custom → Präfix leer lassen, „Days till hide“ leer, **„Days till delete“ = 1**.
3. Den **Endpoint** notieren, z. B. `s3.eu-central-003.backblazeb2.com`. Steht er nicht auf `eu-central`, sofort melden.

Application Keys → **Add a New Application Key** ist nicht nötig. Nur **Generate New Master Application Key**. Den Master-Key brauchst du nur in A2.

## A2. Cloud Shell: Test-Schlüssel (5 min)

Safari → `shell.cloud.google.com` → ⋮ → **Ephemeral Mode**. Werte nur mit `read -rs` einfügen: unsichtbar, ohne Verlauf.

```bash
git clone -q --depth 1 -b claude/vu-backup-tooling https://github.com/dennismueller10x-sudo/vision-universe-research.git vu && cd vu/scripts/backup
read -rs B2_MASTER_KEY_ID; read -rs B2_MASTER_KEY; export B2_MASTER_KEY_ID B2_MASTER_KEY
T=vu-backup-test-xxxxxx        # dein Test-Bucket
for r in writer anchor reader; do python3 bin/vu-b2-make-key.py --bucket $T --role $r --name vu-test-$r --days 14; done
python3 bin/vu-b2-make-key.py --bucket $T --role test-deleter --name vu-test-deleter --days 7
```

Jede Ausgabe (keyID und applicationKey) direkt in den Passwortmanager übernehmen. **Shell offen lassen**, sie wird in B1 wieder gebraucht. Alternativ schließen und den Master-Key in B1 neu erzeugen.

## A3. GitHub: Environment `backup-test` (10 min)

`vision-universe-backup` → Settings → Environments → **New environment** `backup-test`:

- **Variables**
  - `B2_TEST_ENDPOINT` = `https://` + Endpoint aus A1
  - `B2_TEST_BUCKET` = dein Test-Bucket
- **Secrets**: `B2_TEST_WRITER_KEY_ID`, `B2_TEST_WRITER_KEY`, `B2_TEST_ANCHOR_KEY_ID`, `B2_TEST_ANCHOR_KEY`, `B2_TEST_READER_KEY_ID`, `B2_TEST_READER_KEY`, `B2_TEST_DELETER_KEY_ID`, `B2_TEST_DELETER_KEY`

## A4. Läufe (GitHub-App → vision-universe-backup → Actions → Run workflow)

1. **VU B2-Abnahme** → `now`. Erwartet: grün.
   - geprüft werden Rechte, Löschverbot, Object Lock, Legal Hold, Verschlüsselung, Integrität und Wiederherstellung
   - schick mir die Zusammenfassung
2. Optional: **VU Runner-Probe** (Standardwert lassen). Sie misst jetzt zusätzlich den Durchsatz zu B2. Platz und Klonzeit sind bereits gemessen.
3. Frühestens **2 Tage** später: **VU B2-Abnahme** → `later` (Lifecycle), danach → `cleanup`. Dann in Backblaze den Schlüssel `vu-test-deleter` löschen.

Ab hier nichts Echtes, bevor ich A4.1 als grün bestätigt habe.

---

## B1. Produktions-Bucket und Schlüssel

> **Vorher entscheiden:** Die erste Git-Sicherung ist 17,2 GB groß (Messung 30.10.2026). Ohne Zahlungsart erlaubt B2 nur 10 GB, die Git-Sicherung würde scheitern. Mit Zahlungsart: rund 0,15 USD im ersten Monat, nach einem Jahr 0,55–1,15 USD im Monat ([GIT_STORAGE.md](GIT_STORAGE.md)). Ohne diese Freigabe passen nur Datenbank, R2-Stufe 1 (≤ 3 GB), KV und Konfiguration in den freien Rahmen. Dafür `VU_SOURCES` ohne `git` setzen und `VU_R2_PREFIXES_TIER2` leer lassen. Die Stufe 2 (sonntags, rund 8 GB) passt ebenfalls nicht hinein.

Bucket wie A1, aber Name `vu-backup-` + 6 Zeichen, Object Lock **Compliance 30 Tage**, Lifecycle „Days till delete“ **400**.

In der Cloud Shell:

```bash
P=vu-backup-xxxxxx
python3 bin/vu-b2-make-key.py --bucket $P --role writer --name vu-backup-writer --days 365   # -> GitHub
python3 bin/vu-b2-make-key.py --bucket $P --role anchor --name vu-backup-anchor             # -> nur Passwortmanager
python3 bin/vu-b2-make-key.py --bucket $P --role reader --name vu-backup-reader             # -> nur Passwortmanager
unset B2_MASTER_KEY B2_MASTER_KEY_ID
umask 077; age-keygen -o /tmp/k.txt 2>/dev/null; age-keygen -y /tmp/k.txt; cat /tmp/k.txt; shred -u /tmp/k.txt
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'     # restic-Passwort
```

- Danach in Backblaze den **Master-Key neu erzeugen**. Damit ist der benutzte ungültig. Den neuen nicht notieren.
- Privater age-Schlüssel (`AGE-SECRET-KEY-…`) und restic-Passwort: Passwortmanager **und** Papier.

Falls `age-keygen` fehlt: `sudo apt-get install -y -qq age`.

**Passwort der Leserolle** (die Rolle `vu_backup_ro` gibt es schon):

```bash
sudo apt-get install -y -qq postgresql-client >/dev/null
read -rs PGURL        # postgres-URI: Supabase → Connect → Session pooler
psql "$PGURL"         # darin:  \password vu_backup_ro   (Passwort aus dem Passwortmanager, 32 Zeichen, nur Buchstaben/Ziffern)   dann  \q
unset PGURL
read -rs ROURL        # postgresql://vu_backup_ro.qiytbnpoqvldsatpfkeh:<passwort>@<pooler-host>:5432/postgres
psql "$ROURL" -Atc "select current_user, current_setting('default_transaction_read_only')"   # erwartet: vu_backup_ro|on
unset ROURL
```

## B2. Lesetokens und Meldedienst (Browser, 15 min)

| Wo | Was |
|---|---|
| healthchecks.io | Konto mit 2FA → Check „VU Backup täglich“, Period **1 day**, Grace **2 hours**, E-Mail an dich → Ping-URL |
| GitHub → Settings → Developer settings → Fine-grained tokens | `vu-backup-read`, 90 Tage, nur die zu sichernden Repos, Contents/Metadata/Issues/Pull requests/Actions: **Read** |
| Cloudflare → R2 → Manage API Tokens | „Object Read only“, nur der Produktions-Bucket |
| Cloudflare → My Profile → API Tokens | `vu-backup-read`: Workers KV Storage Read, Workers Scripts Read, Zone DNS Read |

## B3. GitHub: Environment `backup`

Namen und Inhalte stehen in [SECRETS.md](SECRETS.md), Abschnitt `backup`. Die nicht geheimen Variablen lege ich an, wenn GitHub es mir erlaubt. Sonst trägst du sie aus der Tabelle ein. `VU_BACKUP_ENABLED` legst du noch **nicht** an.

In `backup-test` zusätzlich die Variable `VU_DB_TEST_AGE_RECIPIENT` = dein `age1…`.

## B4. Erste echte Läufe, in dieser Reihenfolge

1. **VU Konten-DB-Backup** → `synthetic`, dann → `real`.
2. **VU Backup taeglich** → `init`, dann → `backup-tier2`. Das ist die erste Vollsicherung.
3. **VU Backup taeglich** → `drill`: Restore-Probe von Git und R2.
4. Datenbank-Restore-Probe in der Cloud Shell mit dem Leseschlüssel und deinem privaten age-Schlüssel. Das sind die Befehle aus [ACCOUNT_DB_BACKUP.md](ACCOUNT_DB_BACKUP.md), Abschnitt 4. Die Datei `erwartet.txt` gebe ich dir.
5. Einmalig den Anker setzen, in der Cloud Shell mit dem Anker-Schlüssel: `python3 bin/vu-anchor-lock.py apply`.
6. Erst wenn ich alles als grün bestätigt habe: Variable `VU_BACKUP_ENABLED` = `true`. Ab dann läuft alles täglich.

## Danach

| Was | Wer |
|---|---|
| täglich Sicherung, Prüfung, Meldung; sonntags große Bestände; monatlich Vollprüfung | automatisch |
| Selbsttest bei jeder Änderung der Werkzeuge | automatisch |
| quartalsweise Datenbank-Restore-Probe (10 min, privater Schlüssel) | du |
| alle 90 Tage GitHub-Lesetoken erneuern | du; ist er abgelaufen, kommt die Fehler-Mail |
| E-Mail von healthchecks.io | Lauf in der GitHub-App ansehen, mich fragen |
