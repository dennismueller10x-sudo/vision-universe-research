# Test- und Abnahmeplan

## Stufe 1: synthetisch, lokal (vorhanden)

`tests/synthetic-test.sh` arbeitet ausschließlich mit erfundenen Daten. Es gibt keine Verbindung zu echten Diensten:

- S3 mit Versionierung, Object Lock und Legal Hold: der Emulator moto, lokal
- GitHub-, Cloudflare-, Brevo- und B2-Auth-APIs: `tests/fake_api.py`
- Git: lokale Repositories

| Test | Prüft |
|---|---|
| T01–T06 | Init auf gesperrtem Bucket, erster Lauf aller Quellen, Bericht, keine Secret-Werte in Ausgaben, Anker-Markierung |
| T07–T08 | inkrementeller Git-Mirror (nur neue Objekte werden hochgeladen) |
| T09–T14 | Restore-Probe, Refs gegen Manifest, Prüfsummen, einzelner Branch (A), Push in neues Repository (D), `--yes`-Sperre |
| T15–T17 | abgebrochener Upload beschädigt nichts, nächster Lauf gelingt |
| T18–T21 | falsches Passwort (nichts gestartet), fehlende Zugangsdaten (Teilerfolg), Quelle nicht erreichbar, Massenlöschung an der Quelle wird gemeldet |
| T22–T25 | Aufbewahrung, Anker bleibt, `prune` auf gesperrtem Bucket, Versionen bleiben physisch erhalten |
| T26–T30 | Angriff mit Schreibschlüssel (alles verborgen), Löschen gesperrter Versionen verweigert, Point-in-Time-Wiederherstellung, vollständige Prüfung |
| T31–T32 | Legal Hold ohne Ablaufdatum |
| T33–T35 | Schlüsselprüfung lehnt Löschrecht und fehlende Bucket-Beschränkung ab |
| T36 | Redaktion von Secrets |
| T37–T39 | Schlüssel-Anlage mit exakten Rechten; Löschschlüssel nur für Test-Buckets; Schreibschlüssel nur bei Object Lock |

Zusätzlich: `tests/account-backup-restore-test.sh` (A01–A13) prüft die Konten-Datenbanksicherung mit dem unveränderten Workflow-Schritt, synthetischen Daten und einem Wegwerf-Schlüssel, bis zur Wiederherstellung in eine leere Datenbank.

**Grenze:** Der Emulator bildet S3-Semantik nach, nicht Backblaze. Die B2-spezifischen Punkte prüft Stufe 2.

## Stufe 2: echter Test-Bucket bei Backblaze, nur synthetische Daten (nach Freigabe)

Ausführung: `tests/b2-acceptance.py now` und zwei Tage später `later` (Anleitung: [B2_PHASE2_IPHONE.md](B2_PHASE2_IPHONE.md)).
Ein **eigener Test-Bucket** im Backup-Konto, getrennt vom späteren Produktions-Bucket. Er liegt im Freikontingent von 10 GB und enthält nur Daten aus `tests/`.

| ID | Prüft | Erwartung | Warum offen |
|---|---|---|---|
| T-B2-1 | Schlüssel mit genau `listBuckets,listFiles,readFiles,writeFiles` anlegen (`b2 key create --bucket <test> vu-test-writer listBuckets,listFiles,readFiles,writeFiles`); `vu-key-check.py writer` | Exit 0 | Doku nennt für S3 DeleteObject „writeFiles und deleteFiles“, für hide nur writeFiles |
| T-B2-2 | restic init/backup/forget/prune mit diesem Schlüssel | läuft; Löschen erzeugt hide-Marker | restic muss Lock-Dateien entfernen können; ohne deleteFiles nur über hide |
| T-B2-3 | S3 DeleteObject **mit** VersionId mit diesem Schlüssel | verweigert | Kernversprechen „kann nicht löschen“ |
| T-B2-4 | PutObject in Bucket mit Object Lock (Default Compliance 1 Tag, nur im Test) | ohne Content-MD5-Fehler | AWS verlangt bei Object Lock Content-MD5 oder Prüfsumme; B2 ungeprüft |
| T-B2-5 | Lifecycle `daysFromHidingToDeleting=1` im Test: verborgene, gesperrte Version | bleibt bis Sperrende, dann entfernt | Wechselwirkung Lifecycle und Lock |
| T-B2-6 | Legal Hold per S3-API mit Anker-Schlüssel; Delete mit VersionId | verweigert, auch nach Ablauf der Retention | — |
| T-B2-7 | `vu-pit-recover.py` gegen B2 | Zustand vor dem hide wiederhergestellt | B2-Versionen-Listing über S3 |
| T-B2-8 | Durchsatz und Dauer: 5 GB synthetisch hoch und runter vom Runner | Messwerte für die Laufzeitplanung | — |
| T-B2-9 | Aufräumen: Test-Bucket leeren | Retention 1 Tag abwarten | — |
| T-B2-10 | Wiederherstellung aus B2: jede Datei per SHA-256 gleich der Quelle | sofort | — |
| T-B2-11 | kein Klartext in den Objekten (restic), SSE-B2 auf jedem Objekt | sofort | — |
| T-B2-12 | neue Objekte ohne Zutun gesperrt (Compliance) | sofort | — |

Erst wenn T-B2-1 bis T-B2-7 grün sind, wird der Produktions-Bucket angelegt.

## Stufe 3: Erstsicherung mit echten Daten (nach Freigabe)

1. `dry-run` → `init` → `backup-tier2`. Messen: Dauer, Volumen je Quelle, freier Plattenplatz auf dem Runner.
2. `drill` grün.
3. Anker setzen, `vu-anchor-lock.py status` = alle Objekte.
4. Zweiter Lauf zwei Tage später: das Neu-Volumen des Git-Mirrors muss klein sein (inkrementell).

## Laufende Abnahme

- monatlich: `verify-full`, `drill`
- quartalsweise: Datenbank in ein leeres Testprojekt einspielen, Mirror in ein Wegwerf-Repository pushen
- jährlich: Planspiel „GitHub-Konto verloren“ nach RESTORE.md, Szenario D, mit Zeitmessung
