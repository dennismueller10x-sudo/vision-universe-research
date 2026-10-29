# Einrichtung durch den Owner (Schritt für Schritt)

Alles hier erst nach Freigabe. Jeder Schritt geht im Browser am iPhone. Ein Laptop ist nicht nötig, am iPad oder Desktop ist es bequemer.
Werte (Passwörter, Schlüssel) kommen **nur** in den Passwortmanager und in die Runner-Secrets, nie in ein Repository, eine Notiz-App oder einen Chat.

## 0. Passwortmanager vorbereiten (einmalig, 15 min)

Einen Tresor „Vision Universe – Notfall“ anlegen. Er muss ohne GitHub erreichbar sein (z. B. 1Password, Bitwarden oder Apple-Passwörter mit Notfallkontakt).
Einträge (Vorlage im vertraulichen Bericht, Abschnitt Secrets):

- `restic-Passwort` (neu erzeugen: 40 Zeichen, zufällig). Zusätzlich auf Papier im Safe.
- `B2 – Konto` (Login, 2FA-Wiederherstellungscodes)
- `B2 – Schreibschlüssel` (keyID + applicationKey)
- `B2 – Anker-Schlüssel`
- `B2 – Leseschlüssel`
- `GitHub – Recovery-Codes`
- je produktivem Secret: Dienst, Zweck, wo neu ausstellen

## 1. Backblaze-Konto und Bucket (10 min)

1. Konto anlegen. Eigene E-Mail-Adresse, **nicht** mit GitHub-Login verknüpft. Region **EU Central** wählen. Die Region wird beim Anlegen des Kontos festgelegt und lässt sich danach nicht ändern.
2. 2FA einschalten, Wiederherstellungscodes in den Tresor.
3. Bucket anlegen:
   - Name frei, privat
   - **Object Lock: aktivieren** (bei der Erstellung)
   - Standard-Aufbewahrung: Compliance, 30 Tage
   - Verschlüsselung SSE-B2 an (zusätzlich zu restic)
4. Lifecycle-Regel des Buckets: **„Keep prior versions for this number of days: 400“** (`daysFromHidingToDeleting = 400`).
   - **Nicht** „Keep only the last version“ wählen. Das ist die restic-Empfehlung für Platzersparnis, würde aber den Schutz gegen gestohlene Schreibschlüssel aufheben.

## 2. Drei Anwendungsschlüssel (5 min)

App Keys → Add a New Application Key. Jeder Schlüssel nur für **diesen Bucket**:

| Name | Rechte | Liegt wo |
|---|---|---|
| `vu-backup-writer` | Read and Write. Danach prüft `vu-key-check.py writer`: kein `deleteFiles`. Gibt die Oberfläche bei „Read and Write“ `deleteFiles` mit, den Schlüssel per CLI/API mit genau `listBuckets,listFiles,readFiles,writeFiles` anlegen (Anleitung im Testplan T-B2-1). | Runner-Secret + Tresor |
| `vu-backup-anchor` | `listBuckets,listFiles,readFiles,readFileLegalHolds,writeFileLegalHolds` | **nur Tresor** |
| `vu-backup-reader` | Read Only | Tresor (für Wiederherstellung ohne Runner) |

Einen Schlüssel mit `deleteFiles` gibt es nicht. Endgültig gelöscht wird nur durch die Lifecycle-Regel.

## 3. Lese-Zugänge zu den Quellen (20 min)

| Quelle | Neu anlegen | Rechte |
|---|---|---|
| GitHub | Fine-grained PAT `vu-backup-read`, Ablauf 90 Tage, nur die beiden Repos | Contents, Metadata, Issues, Pull requests, Actions: **Read**; optional Administration, Secrets, Variables: **Read** (nur Namen und Einstellungen) |
| Cloudflare R2 | R2 → API-Token „Object Read only“, nur den Produktions-Bucket | lesen |
| Cloudflare API | Token `vu-backup-read` | Workers KV Storage: Read, Workers Scripts: Read, Zone DNS: Read |
| Supabase | SQL-Rolle `vu_backup_ro` mit SELECT auf die gesicherten Schemata (Vorlage im vertraulichen Bericht) | nur lesen |
| Brevo | erst nach Datenschutz-Freigabe: eigener API-Schlüssel `backup` | Brevo-Schlüssel haben volle Rechte → nur im Runner-Secret |

## 4. Runner einrichten (15 min)

Empfohlen: privates Repository `vision-universe-backup`.

1. Neues privates Repo anlegen. Inhalt: `scripts/backup/` aus diesem Branch, `runner/github-actions/vu-backup.yml` nach `.github/workflows/`.
2. In der Workflow-Datei die Prüfsummen von restic und rclone eintragen, aus den SHA256SUMS der Releases. Die Datei ist so gebaut, dass sie ohne Prüfsummen abbricht.
3. Settings → Environments → `backup` anlegen. Dort alle Secrets und Variablen aus `config/backup.env.example` eintragen.
4. Settings → Actions → General → „Workflow permissions: Read repository contents“.

## 5. Erster Lauf (30–90 min Laufzeit)

1. `dry-run`: prüft Ziel, Passwort und Schlüsselrechte, sichert nichts.
2. Aktion `init`: legt das verschlüsselte restic-Repository an. restic verweigert `init`, wenn schon ein Repository existiert, deshalb ist ein versehentlicher zweiter Aufruf harmlos.
3. `backup-tier2`: erste Vollsicherung inklusive großer Bestände.
4. `drill`: Restore-Probe. Erst wenn sie grün ist, weiter.
5. **Anker setzen:** in Google Cloud Shell oder lokal einmalig `vu-anchor-lock.py apply` mit dem Anker-Schlüssel aus dem Tresor. Danach `status` → alle Objekte mit Legal Hold.
6. Healthcheck anlegen (kostenloser Tarif): Periode 3 Tage, Kulanz 1 Tag, Mail an den Owner.

## 6. Danach

Siehe [MOBILE.md](MOBILE.md) für den Alltag.

- alle 2–3 Tage `backup`
- sonntags `backup-tier2`
- monatlich `verify-full` und `drill`, danach `maintain-plan` und `maintain-apply`
- PAT nach 90 Tagen erneuern (Kalendererinnerung)
