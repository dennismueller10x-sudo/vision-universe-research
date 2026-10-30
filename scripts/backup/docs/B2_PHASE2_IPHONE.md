# Phase 2: Backblaze-Konto und Test-Bucket am iPhone

Ziel: belegen, dass die Schlüssel- und Sperrarchitektur bei Backblaze so funktioniert wie im Emulator. **Nur synthetische Daten**, nur im kostenlosen Kontingent (10 GB).
Dauer: etwa 30 Minuten, dazu ein zweiter Termin von 10 Minuten zwei Tage später.

Werte (Passwörter, Schlüssel) gehören nur in den Passwortmanager. Nicht in Notizen, nicht in Chats, nicht in Screenshots.

## A. Konto anlegen (Safari, 5 min)

1. `backblaze.com` → **B2 Cloud Storage** → **Sign up** (kostenlos, keine Kreditkarte nötig).
2. E-Mail: eine eigene Adresse für das Backup (nicht das GitHub-Login), Passwort aus dem Passwortmanager generieren.
3. **Region: EU Central** wählen. Die Region gilt für das ganze Konto und lässt sich nachträglich nicht ändern.
4. E-Mail bestätigen.
5. **Two-Factor Authentication** einschalten (My Settings → Security): Authenticator-App oder Passkey. Wiederherstellungscodes in den Passwortmanager.
6. **Für die Testphase keine Zahlungsart hinterlegen.** Ohne Zahlungsart bleibt das Konto im kostenlosen Rahmen (10 GB). Für die echte Git-Sicherung reicht das nicht (17,2 GB), siehe [GIT_STORAGE.md](GIT_STORAGE.md).

## B. Test-Bucket anlegen (3 min)

1. **Buckets** → **Create a Bucket**
   - Name: `vu-backup-test-<6 Zufallszeichen>` (muss weltweit eindeutig sein; muss „test“ enthalten)
   - Files in Bucket: **Private**
   - Default Encryption: **Enable** (SSE-B2)
   - **Object Lock: Enable**
2. Beim Bucket **Object Lock** → Default Retention: **Compliance, 1 Tag**. Nur im Test 1 Tag, später im Produktions-Bucket 30 Tage.
3. **Lifecycle Settings** → **Use custom lifecycle rules** → Prefix leer, `daysFromHidingToDeleting = 1`, `daysFromUploadingToHiding` leer.
   - Nur im Test 1 Tag, später 400.
4. Den Endpunkt notieren (Bucket-Übersicht, „Endpoint“, Form `s3.eu-central-00X.backblazeb2.com`).

## C. Schlüssel für den Test (10 min)

Die Weboberfläche kennt nur grobe Zugriffsarten. Die exakten Rechte setzt das Skript `bin/vu-b2-make-key.py` über die API. Dafür einmalig eine Wegwerf-Shell öffnen:

1. In Safari `shell.cloud.google.com` öffnen.
   - Google-Konto nötig.
   - Im Menü **Ephemeral Mode** wählen: nichts bleibt gespeichert.
2. In B2: **Application Keys** → **Master Application Key** → **Generate New Master Application Key**.
   - Nur für diesen Schritt.
   - keyID und Key in die Zwischenablage bzw. den Passwortmanager.
3. In der Shell:
   ```bash
   git clone --depth 1 -b claude/vu-backup-tooling https://github.com/dennismueller10x-sudo/vision-universe-research.git vu && cd vu/scripts/backup
   read -rs B2_MASTER_KEY_ID; read -rs B2_MASTER_KEY; export B2_MASTER_KEY_ID B2_MASTER_KEY
   B=vu-backup-test-xxxxxx
   python3 bin/vu-b2-make-key.py --bucket $B --role writer       --name vu-test-writer  --days 14
   python3 bin/vu-b2-make-key.py --bucket $B --role anchor       --name vu-test-anchor  --days 14
   python3 bin/vu-b2-make-key.py --bucket $B --role reader       --name vu-test-reader  --days 14
   python3 bin/vu-b2-make-key.py --bucket $B --role test-deleter --name vu-test-deleter --days 7
   unset B2_MASTER_KEY B2_MASTER_KEY_ID
   ```
   - `read -rs` nimmt den Wert ohne Anzeige und ohne Eintrag in die Shell-Historie an.
   - Jede Ausgabe einzeln in den Passwortmanager übernehmen. Der applicationKey wird nur einmal angezeigt.
4. In B2 den Master-Schlüssel danach **neu erzeugen**. Das macht den eben benutzten ungültig.

## D. Abnahme ausführen (10 min)

In derselben Shell:

```bash
sudo apt-get install -y -qq restic >/dev/null && pip install -q boto3
export VU_S3_ENDPOINT=https://s3.eu-central-00X.backblazeb2.com
read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY   # writer
read -rs VU_TEST_ANCHOR_KEY_ID; read -rs VU_TEST_ANCHOR_KEY; export VU_TEST_ANCHOR_KEY_ID VU_TEST_ANCHOR_KEY
read -rs VU_TEST_DELETER_KEY_ID; read -rs VU_TEST_DELETER_KEY; export VU_TEST_DELETER_KEY_ID VU_TEST_DELETER_KEY
read -rs VU_TEST_READER_KEY_ID; read -rs VU_TEST_READER_KEY; export VU_TEST_READER_KEY_ID VU_TEST_READER_KEY
python3 tests/b2-acceptance.py now --bucket $B
```

- Die Ausgabe ist eine Zeile je Test (PASS, FAIL oder n/a).
- `b2-acceptance-now.json` (ohne Schlüssel) per Copy-and-paste an Claude geben.
- **`b2-acceptance-state.json` herunterladen** (Menü → Download) oder ihren Inhalt in den Passwortmanager legen. Phase „later“ braucht sie; sie enthält nur Testkennungen und ein Wegwerf-Passwort für die synthetischen Daten.

## E. Zwei Tage später (10 min)

Shell öffnen, Repo klonen, Variablen wie oben setzen, die State-Datei wieder hochladen, dann:

```bash
python3 tests/b2-acceptance.py later --bucket $B
```

Danach aufräumen:
1. Legal Hold der Probe mit dem Anker-Schlüssel aufheben.
2. Den Bucket leeren.
3. Den Schlüssel `vu-test-deleter` in B2 löschen.

## F. Privates Backup-Repository und Runner-Probe (15 min)

1. GitHub-App oder Safari → **+** → **New repository** → Name `vision-universe-backup`, **Private**, ohne Vorlage.
2. Inhalt übernehmen. Am einfachsten in der Cloud Shell, mit einem Token, das nur dieses neue Repo schreiben darf:
   ```bash
   git clone https://github.com/<owner>/vision-universe-backup.git vub && cd vub
   mkdir -p scripts .github/workflows && cp -r ../vu/scripts/backup scripts/
   cp scripts/backup/runner/github-actions/vu-runner-probe.yml .github/workflows/
   git add . && git commit -m "vu-backup Werkzeuge und Runner-Probe" && git push
   ```
3. Settings → Environments → **New environment** `backup-test`.
   - Secrets: `B2_TEST_WRITER_KEY_ID`, `B2_TEST_WRITER_KEY`.
   - Variables: `B2_TEST_ENDPOINT`, `B2_TEST_BUCKET`.
   - Optional für ein privates Quell-Repo: `VU_GITHUB_READ_TOKEN` (fine-grained, nur lesen).
4. Settings → Actions → General → Workflow permissions: **Read repository contents**.
5. Actions → „VU Runner-Probe“ → **Run workflow**. `repo_url`: `https://github.com/dennismueller10x-sudo/vision-universe-research.git`.
   Ergebnis in der Zusammenfassung:
   - Urteil für Folgeläufe und für den Erstlauf
   - Mirror-Größe und -Dauer
   - Durchsatz zu B2

## Was nicht passieren darf

- keine echten Projektdaten in den Test-Bucket
- keine Zahlungsart
- kein Schlüssel mit Löschrecht außerhalb des Test-Buckets
- den Master-Schlüssel nie in GitHub oder in einen Runner eintragen
