# Secrets und Variablen im privaten Repo `vision-universe-backup`

Alles liegt in zwei **Environments**: `backup-test` (nur Test-Bucket, synthetische Daten) und `backup` (Produktion). Auf Repository-Ebene liegt kein Secret.
Jeder Schlüssel gilt nur für einen Zweck und einen Bucket. `vu-key-check.py` prüft vor jedem Lauf die tatsächlichen Rechte und bricht ab, wenn ein Schlüssel mehr darf als vorgesehen.

**Nie im Repo, nie in GitHub:** B2-Master-Key, privater age-Schlüssel, postgres-Passwort der Datenbank, die Lese-Schlüssel des Produktions-Buckets (`vu-backup-reader`) und den Anker-Schlüssel des Produktions-Buckets. Sie gehören in den Passwortmanager, der age-Schlüssel und das restic-Passwort zusätzlich auf Papier.

## Environment `backup-test`

| Name | Art | Inhalt | Rechte |
|---|---|---|---|
| `B2_TEST_ENDPOINT` | Variable | `https://s3.eu-central-003.backblazeb2.com` (aus den Bucket-Details) | – |
| `B2_TEST_BUCKET` | Variable | `vu-backup-test-<6 Zeichen>` | – |
| `VU_DB_TEST_AGE_RECIPIENT` | Variable | öffentlicher age-Schlüssel `age1…` | – |
| `B2_TEST_WRITER_KEY_ID`, `B2_TEST_WRITER_KEY` | Secret | Schlüssel `vu-test-writer` | listBuckets, listFiles, readFiles, writeFiles; nur Test-Bucket; **kein** deleteFiles |
| `B2_TEST_ANCHOR_KEY_ID`, `B2_TEST_ANCHOR_KEY` | Secret | Schlüssel `vu-test-anchor` | zusätzlich writeFileLegalHolds; nur Test-Bucket |
| `B2_TEST_READER_KEY_ID`, `B2_TEST_READER_KEY` | Secret | Schlüssel `vu-test-reader` | listBuckets, listFiles, readFiles; nur Test-Bucket |
| `B2_TEST_DELETER_KEY_ID`, `B2_TEST_DELETER_KEY` | Secret | Schlüssel `vu-test-deleter`, **7 Tage gültig** | deleteFiles, bypassGovernance; nur Test-Bucket; nach `cleanup` in B2 löschen |

Die Test-Schlüssel dürfen ausschließlich den Test-Bucket berühren. Das Abnahme-Skript bricht ab, sobald der Bucketname kein `test` enthält oder fremde Objekte darin liegen.

## Environment `backup`

| Name | Art | Inhalt | Rechte / Herkunft |
|---|---|---|---|
| `B2_ENDPOINT` | Variable | wie oben | – |
| `B2_BUCKET` | Variable | `vu-backup-<6 Zeichen>` | – |
| `B2_WRITER_KEY_ID`, `B2_WRITER_KEY` | Secret | Schlüssel `vu-backup-writer`, 365 Tage | wie Test-Writer, nur Produktions-Bucket; **kein** deleteFiles, keine Retention-/Legal-Hold-/Bucket-/Key-Rechte |
| `RESTIC_REPOSITORY` | Secret | `s3:https://<endpunkt>/<B2_BUCKET>/restic` | – |
| `RESTIC_PASSWORD` | Secret | 32+ Zeichen, zufällig | auch im Passwortmanager und auf Papier |
| `VU_DB_PROJECT` | Variable | `qiytbnpoqvldsatpfkeh` | – |
| `VU_DB_AGE_RECIPIENT` | Variable | öffentlicher age-Schlüssel `age1…` | – |
| `VU_DB_BACKUP_RO_URL` | Secret | `postgresql://vu_backup_ro.qiytbnpoqvldsatpfkeh:<passwort>@<pooler-host>:5432/postgres` | Rolle nur lesend (`default_transaction_read_only=on`); Export prüft das vor jedem Lauf |
| `VU_GITHUB_READ_TOKEN` | Secret | Fine-grained PAT `vu-backup-read`, 90 Tage | nur die gesicherten Repos; Contents, Metadata, Issues, Pull requests, Actions: **Read** |
| `VU_GIT_REPOS` | Variable | `research=https://github.com/dennismueller10x-sudo/vision-universe-research.git` (+ ` landing=https://github.com/dennismueller10x-sudo/vision-universe-landing-pages.git`, falls vorhanden) | – |
| `VU_GITHUB_REPOS` | Variable | `dennismueller10x-sudo/vision-universe-research` (+ ` dennismueller10x-sudo/vision-universe-landing-pages`) | – |
| `VU_R2_ENDPOINT` | Secret | `https://<cloudflare-account-id>.r2.cloudflarestorage.com` | – |
| `VU_R2_BUCKET` | Secret | Name des R2-Buckets | – |
| `VU_R2_READ_KEY_ID`, `VU_R2_READ_KEY` | Secret | R2-API-Token „Object Read only“ | nur dieser Bucket, nur lesen |
| `VU_R2_PREFIXES_TIER1` | Variable | `ci-state=v1/company-intelligence/state/ research-snapshots=research-snapshots/ social-assets=social/assets/ tiingo-delisted=v1/tiingo-delisted/ tiingo-holdout=v1/tiingo-holdout/` | täglich |
| `VU_R2_PREFIXES_TIER2` | Variable | `price-history=v1/tiingo/daily/ sec=v1/sec/fundamentals/` | sonntags |
| `VU_CF_READ_TOKEN` | Secret | Cloudflare-API-Token `vu-backup-read` | Workers KV Storage: Read, Workers Scripts: Read, Zone DNS: Read |
| `VU_CF_ACCOUNT_ID` | Variable | Cloudflare-Account-ID (Dashboard, rechte Spalte) | nicht geheim |
| `VU_CF_KV_NAMESPACES` | Variable | `social=582accaa66bf471a833b3813a6d2a45b` | aus `workers/vision-universe-social` |
| `VU_CF_ZONE_IDS` | Variable | `visionuniverse=<zone-id>` (Dashboard → Domain → rechte Spalte) | nicht geheim |
| `VU_HEALTHCHECK_URL` | Secret | Ping-URL von healthchecks.io | – |
| `VU_BREVO_ENABLED`, `VU_BREVO_BACKUP_KEY` | Variable / Secret | erst nach Datenschutz-Freigabe: `true` und eigener Brevo-Schlüssel „backup“ | – |
| `VU_BACKUP_ENABLED` | Variable | **erst nach bestandenen echten Tests** `true`; bis dahin nicht anlegen | schaltet den Zeitplan ein |

## Wer legt was an

| Schritt | Wer | Warum |
|---|---|---|
| Inhalt des Repos, Workflows, Anleitungen | Claude | Schreibzugriff auf das private Repo besteht |
| nicht geheime Variablen | Claude, wenn die GitHub-API es zulässt; sonst du (Werte stehen oben) | |
| B2-Buckets, Object Lock, Lifecycle, Master-Key | du (Browser) | Konto-Anmeldung mit 2FA |
| B2-Schlüssel mit eingeschränkten Rechten | du (Cloud Shell, `vu-b2-make-key.py`) | braucht den Master-Key; der darf nie zu Claude oder GitHub |
| age-Schlüssel, restic-Passwort, Passwort der Leserolle | du (Cloud Shell) | private Werte bleiben bei dir |
| GitHub-, R2-, Cloudflare-Lesetokens, healthchecks.io | du (Browser) | Konto-Anmeldung |
| Secrets eintragen | du (GitHub-App oder Safari) | Claude soll keine Secret-Werte sehen |
| Selbsttest, Runner-Probe | Claude oder du | keine Secrets nötig |
| B2-Abnahme, synthetische Läufe, echte Läufe, Zeitplan | du startest, Claude wertet aus | |
