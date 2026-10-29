# Wiederherstellung

Grundregel: **Erst in eine isolierte Umgebung zurücklesen und prüfen, dann bewusst einspielen.**
Kein Befehl schreibt in Produktion ohne ausdrückliches Ziel und `--yes`.

## Voraussetzungen, unabhängig von GitHub

| Was | Wo |
|---|---|
| restic-Passwort | Passwortmanager und Papier |
| B2-Leseschlüssel (oder Schreibschlüssel) | Passwortmanager |
| Bucket-Name, Endpunkt | Passwortmanager |
| diese Skripte | in jeder Sicherung (Quelle `tooling`) und im öffentlichen Repository; restic und rclone sind frei herunterladbar |
| eine Linux-Umgebung | Google Cloud Shell (kostenlos, im Browser, auch am iPhone; für kleine Wiederherstellungen) oder ein Cloud-Run-/Batch-Job mit dem Runner-Image (für den Git-Mirror). Kein eigener Rechner nötig. |

Start in jeder Umgebung:

```bash
export RESTIC_REPOSITORY=s3:https://s3.eu-central-003.backblazeb2.com/<bucket>/restic
export RESTIC_PASSWORD=...              # aus dem Tresor einfügen, nicht in Dateien
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
restic snapshots --compact              # Überblick
restic dump latest --tag src:tooling /tmp/vu-backup-work/... > ...   # Skripte, falls GitHub fehlt
```

## Szenarien

| | Fall | Vorgehen | Dauer (realistisch) |
|---|---|---|---|
| A | Branch versehentlich gelöscht | `vu-restore.sh get git-research /tmp/r` → `vu-restore.sh git-branch <mirror> <branch> b.bundle` → im Repo `git fetch b.bundle refs/heads/<branch>:refs/heads/<branch>` und pushen. Alternative ohne Backup: GitHub hält gelöschte Branches kurz in PR-Refs vor (`refs/pull/*/head`, ist im Mirror). | 30–60 min (Mirror-Download ~17 GiB) |
| B | Git-Historie beschädigt (Force-Push, kaputte Commits) | Snapshot **vor** dem Schaden wählen (`restic snapshots --tag src:git-research`), zurücklesen, `git fsck`, betroffene Refs vergleichen (`manifests/*.refs`). Einzelne Refs wieder pushen; nie blind `--mirror` auf das bestehende Repo. | 1–2 h |
| C | GitHub-Konto kompromittiert | 1. Sperren lassen (GitHub Support) bzw. Passwort, 2FA und Sessions zurücksetzen. 2. Alle Secrets aus GitHub rotieren (Liste im vertraulichen Bericht, Reihenfolge nach Kritikalität). 3. Backup-Zustand prüfen: `vu-verify.sh sample`; fehlen Snapshots → `vu-pit-recover.py --at <vor dem Angriff>` in ein neues Verzeichnis oder einen zweiten Bucket. 4. B2-Schreibschlüssel und GitHub-Lesetoken neu ausstellen. 5. Weiter wie D, falls das Konto verloren bleibt. | Sperren: Stunden. Wiederanlauf: 1–3 Tage |
| D | Repository oder ganzes GitHub-Konto verloren | Neues Konto bzw. neue Organisation mit Hardware-2FA. Mirror zurücklesen. `vu-restore.sh git-push <mirror> <neue-url> --yes` (Branches und Tags; `--with-pull-refs` legt PR-Stände unter `refs/archive/pull/*` ab). Issues und PRs liegen als JSON vor (`github-meta`). Secrets aus dem Tresor neu setzen, Workflows einzeln aktivieren, Pages und DNS umstellen. Kein GitHub nötig, um an die Daten zu kommen. | Code: 2–4 h. Website: ≤ 1 Tag. Datenläufe: 1–3 Tage |
| E | R2-Bucket verloren | Neuen Bucket mit neuem Schreibtoken anlegen. Je Präfix: `vu-restore.sh get r2-<name> /tmp/r` → `vu-restore.sh r2-upload <dir> <ziel> --yes --last index.json` (Pointer-Dateien zuletzt). Stufe 2 (neu erzeugbar) aus dem letzten Wochenstand, Rest liefern die Datenläufe nach. | Stufe 1: 1–2 h. Stufe 2: 2–4 h plus Datenläufe |
| F | KV-Daten verloren | `vu-restore.sh get cf-kv /tmp/r` → aus `social.jsonl` eine Datei für `wrangler kv bulk put` erzeugen (Vorlage im vertraulichen Bericht). OAuth-Tokens **nicht** zurückspielen, sondern neu verbinden. | 30 min |
| G | Datenbank verloren oder beschädigt | Neues, leeres Supabase-Projekt (Testprojekt zuerst!). Schema über die Migrationen, dann `pg_restore --no-owner --data-only -d <uri> db.dump`. Prüfen, dann umstellen. Ältere Stände: Snapshot wählen. | 1–2 h |
| H | Kritischer API-Schlüssel verloren oder rotiert | Beim Dienst neu ausstellen (Inventar: Dienst, Ort, Schritte), im Runner bzw. als Repository-Secret setzen, Worker-Secrets per `wrangler secret put` neu setzen, betroffene Workflows einmal von Hand starten. | 15–60 min je Schlüssel |
| I | Backup-Runner ausgefallen (GitHub down, Minuten verbraucht) | Ersatz-Runner Cloud Run Job mit demselben Image und denselben Secrets. Bis dahin: Sicherungen bleiben unverändert, der Totmannschalter meldet nach 4 Tagen. | 0 min (eingerichtet) bis 2 h (neu) |
| J | Zugang zum Backup-Speicher verloren | Schlüssel weg: im B2-Konto neue Schlüssel ausstellen (Konto-Login + 2FA aus dem Tresor). Konto-Login weg: B2-Support mit Kontonachweis; deshalb Wiederherstellungscodes offline. restic-Passwort weg: **Sicherung unbrauchbar**, deshalb zweifach offline. | Schlüssel: 10 min. Konto: Tage |

## Restore-Probe (monatlich, isoliert)

Aktion `drill` im Backup-Repository. Sie liest jede Quelle in ein leeres Verzeichnis des Runners zurück und prüft:

- Git: `fsck`, Refs gleich Manifest, Klon aus dem Mirror
- R2: SHA-256 je Datei
- JSON-Exporte: lesbar
- Datenbank: `pg_restore --list`

Sie hat keine Zugangsdaten zu Produktionssystemen, nur zum Backup-Bucket. Ergebnis: `drill-report.txt` in der Laufzusammenfassung.

Einmal im Quartal zusätzlich: die Datenbank in ein **leeres** Supabase-Testprojekt einspielen und den Mirror in ein Wegwerf-Repository pushen. Beides nur in Testzielen.
