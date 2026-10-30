# Einrichtung am iPhone – in dieser Reihenfolge

Danach läuft alles automatisch. Du wirst nur aktiv, wenn eine E-Mail kommt.
Werte (Passwörter, Schlüssel, Tokens) gehören **nur** in den Passwortmanager und in die GitHub-Secrets des privaten Repos. Nie in Chats, Notizen oder Screenshots.

Dauer: etwa 90 Minuten, in zwei Sitzungen.

## 1. Meldedienst (5 min)

`healthchecks.io` → kostenloses Konto mit eigener E-Mail und 2FA.

1. **Add Check**: Name „VU Backup täglich“, Period **1 day**, Grace **2 hours** (Meldung nach 26 h ohne Erfolg).
2. Integrations: E-Mail an dich.
3. Die **Ping-URL** in den Passwortmanager.

Die Meldung kommt auch dann, wenn GitHub oder GitHub Actions ausfallen. Der Dienst wartet auf einen Erfolgs-Ping und meldet, wenn er ausbleibt.

## 2. Backblaze (15 min, ohne Zahlungsart)

1. Konto anlegen: **Region EU Central**, eigene E-Mail. Danach 2FA einschalten und keine Zahlungsart hinterlegen.
2. Zwei private Buckets anlegen, beide mit SSE-B2 und **Object Lock**:

| Bucket | Default Retention | Lifecycle |
|---|---|---|
| `vu-backup-test-<6 Zeichen>` | Compliance **1 Tag** | `daysFromHidingToDeleting = 1` |
| `vu-backup-<6 Zeichen>` | Compliance **30 Tage** | `daysFromHidingToDeleting = 400` |

3. Den S3-Endpunkt notieren (Bucket-Details, z. B. `s3.eu-central-003.backblazeb2.com`).
4. Application Keys → **Master Application Key** erzeugen. Er wird nur in Schritt 3 gebraucht.

## 3. Cloud Shell: Schlüssel, Abnahme, Datenbank (30 min)

Safari → `shell.cloud.google.com` → ⋮ → **Ephemeral Mode**. Eingaben nur mit `read -rs`: ohne Anzeige, ohne Verlauf.

```bash
sudo apt-get install -y -qq age postgresql-client restic >/dev/null && pip install -q boto3
git clone -q --depth 1 -b claude/vu-backup-tooling https://github.com/dennismueller10x-sudo/vision-universe-research.git vu && cd vu/scripts/backup
read -rs B2_MASTER_KEY_ID; read -rs B2_MASTER_KEY; export B2_MASTER_KEY_ID B2_MASTER_KEY
T=vu-backup-test-xxxxxx; P=vu-backup-xxxxxx
for r in writer anchor reader; do python3 bin/vu-b2-make-key.py --bucket $T --role $r --name vu-test-$r --days 14; done
python3 bin/vu-b2-make-key.py --bucket $T --role test-deleter --name vu-test-deleter --days 7
python3 bin/vu-b2-make-key.py --bucket $P --role writer --name vu-backup-writer --days 365
python3 bin/vu-b2-make-key.py --bucket $P --role anchor --name vu-backup-anchor
python3 bin/vu-b2-make-key.py --bucket $P --role reader --name vu-backup-reader
unset B2_MASTER_KEY B2_MASTER_KEY_ID
```

Jede Ausgabe in den Passwortmanager übernehmen. Danach in Backblaze den **Master-Key neu erzeugen**, dann ist der eben benutzte ungültig.

**Abnahme mit synthetischen Daten** (Test-Schlüssel per `read -rs`, siehe `B2_PHASE2_IPHONE.md` Teil D):

```bash
python3 tests/b2-acceptance.py now --bucket $T
```

Die Ausgabe an Claude geben. **Erst wenn sie grün ist**, geht es mit echten Daten weiter.

**age-Schlüssel und restic-Passwort:**

```bash
umask 077; age-keygen -o /tmp/k.txt 2>/dev/null; age-keygen -y /tmp/k.txt; cat /tmp/k.txt; shred -u /tmp/k.txt
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'     # restic-Passwort
```

- Den öffentlichen Teil `age1…` brauchst du für GitHub.
- Den privaten Teil und das restic-Passwort in den Passwortmanager **und** auf Papier.

**Passwort der Leserolle** (die Rolle `vu_backup_ro` existiert schon):
1. `read -rs PGURL` (postgres-URI aus Supabase → Connect → Session pooler)
2. `psql "$PGURL"`, darin `\password vu_backup_ro` und `\q`
3. `unset PGURL`
4. Test mit der URI der Leserolle: `psql "$ROURL" -Atc "select current_user, current_setting('default_transaction_read_only')"`. Erwartet: `vu_backup_ro|on`.

## 4. Lese-Zugänge anlegen (15 min, im Browser)

| Wo | Was | Rechte |
|---|---|---|
| GitHub → Settings → Developer settings → Fine-grained tokens | `vu-backup-read`, 90 Tage, Repos `vision-universe-research` und `vision-universe-landing-pages` | Contents, Metadata, Issues, Pull requests, Actions: **Read** |
| Cloudflare → R2 → API Tokens | „Object Read only“, nur der Produktions-Bucket | lesen |
| Cloudflare → My Profile → API Tokens | `vu-backup-read` | Workers KV Storage: Read, Workers Scripts: Read, Zone DNS: Read |
| Brevo (optional, Datenschutz) | eigener API-Schlüssel „backup“ | – |

## 5. Privates Repository (10 min)

1. GitHub → **+** → New repository → `vision-universe-backup`, **Private**, leer.
2. Mir „Repo angelegt“ schreiben. Ich spiele den vorbereiteten Inhalt ein. Geht das von meiner Seite nicht: in der Cloud Shell `git push` aus dem bereitgestellten Paket, ich gebe dir dann die genauen zwei Befehle.
3. Settings → Actions → General → Workflow permissions: **Read repository contents**.
4. Settings → **Environments**:

| Environment | Secrets | Variables |
|---|---|---|
| `backup-test` | `B2_TEST_WRITER_KEY_ID`, `B2_TEST_WRITER_KEY` | `B2_TEST_ENDPOINT`, `B2_TEST_BUCKET`, `VU_DB_TEST_AGE_RECIPIENT` (`age1…`) |
| `backup` | `B2_WRITER_KEY_ID`, `B2_WRITER_KEY`, `RESTIC_PASSWORD`, `RESTIC_REPOSITORY` (`s3:https://<endpunkt>/<P>/restic`), `VU_DB_BACKUP_RO_URL`, `VU_GITHUB_READ_TOKEN`, `VU_R2_ENDPOINT`, `VU_R2_BUCKET`, `VU_R2_READ_KEY_ID`, `VU_R2_READ_KEY`, `VU_CF_READ_TOKEN`, `VU_HEALTHCHECK_URL`, optional `VU_BREVO_BACKUP_KEY` | `B2_ENDPOINT`, `B2_BUCKET`, `VU_DB_PROJECT`, `VU_DB_AGE_RECIPIENT`, `VU_GIT_REPOS`, `VU_GITHUB_REPOS`, `VU_R2_PREFIXES_TIER1`, `VU_R2_PREFIXES_TIER2`, `VU_CF_ACCOUNT_ID`, `VU_CF_KV_NAMESPACES`, `VU_CF_ZONE_IDS` |

Die Werte der Variablen (Repos, R2-Präfixe, KV-Namespace, Zone) gebe ich dir passend vor. Sie sind nicht geheim.

## 6. Erste Läufe (GitHub-App → Actions → Run workflow)

1. **VU Runner-Probe**: Reicht der Plattenplatz? Ergebnis an mich.
2. **VU Konten-DB-Backup** → `synthetic`: grün? Dann → `real`.
3. **VU Backup taeglich** → `init`, dann `backup-tier2`. Das ist die erste Vollsicherung.
4. **VU Backup taeglich** → `drill`: Restore-Probe von Git und R2 im Runner.
5. Datenbank-Restore-Probe in der Cloud Shell: `bin/vu-db-restore-drill.sh --from-s3 latest erwartet.txt`, mit Leseschlüssel und deinem privaten age-Schlüssel. `erwartet.txt` gebe ich dir.
6. **Anker setzen**, einmalig in der Cloud Shell mit dem Anker-Schlüssel: `python3 bin/vu-anchor-lock.py apply`.
7. Variable `VU_BACKUP_ENABLED` = `true` im privaten Repo. Ab jetzt läuft alles täglich.

Zwei Tage nach Schritt 3 die Abnahme abschließen: `tests/b2-acceptance.py later` und dann `cleanup`.

## Danach

| Was | Wer |
|---|---|
| Täglich Sicherung, Prüfung, Meldung | automatisch |
| Sonntags große Bestände | automatisch |
| Monatlich vollständige Datenprüfung | automatisch |
| Quartalsweise Datenbank-Restore-Probe (braucht deinen privaten Schlüssel, 10 min) | du |
| Alle 90 Tage den GitHub-Lesetoken erneuern | du; die Fehler-Mail erinnert dich |
| E-Mail von healthchecks.io | ausstehende oder fehlerhafte Sicherung: Lauf in der GitHub-App ansehen, mich fragen |
