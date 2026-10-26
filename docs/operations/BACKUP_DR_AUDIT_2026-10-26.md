# Backup- und Disaster-Recovery-Audit (26.10.2026)

Stand: `main` @ `220512da`. Nur geprüft, dokumentiert und geplant. Es wurde nichts an Daten, Deployments, Workflows, Einstellungen oder Zugangsschutz geändert. Es wurden keine Secret-Werte gelesen oder ausgegeben, nur Namen.

Grundlage:
- Code und Workflows dieses Repositorys
- öffentliche GitHub-REST-API (Repo, Branches, Rulesets, Artefakte)
- `git ls-remote`

Nicht einsehbar waren von hier: Actions-Caches, Pages-Einstellungen, Environments, Secrets-Listen, Webhooks, Deploy-Keys, 2FA-Status sowie die Konten bei Cloudflare, Vercel, Brevo und Meta. Diese Punkte stehen als Prüfaufgabe für den Owner in §8.

## 0. Kurzfassung

| # | Befund | Schwere |
|---|---|---|
| 1 | **Es gibt keine unabhängige Sicherung.** Alles liegt bei GitHub, Cloudflare (R2, KV, Durable Objects), Vercel und Brevo, jeweils als einzige Kopie. | kritisch |
| 2 | **`main` hat keinen Branch-Schutz und kein Ruleset.** Jeder der 58 Workflows mit `contents: write` und jeder Token mit Schreibrecht kann `main` per Force-Push überschreiben oder Branches löschen. Das gilt auch für `brevo-newsletter-state` („niemals zurücksetzen“). | hoch |
| 3 | **Der R2-Bucket hat keine Versionierung und keine Sperre.** Ein PUT überschreibt, ein durchgesickerter Schlüssel löscht. Der Löschschutz steckt nur im Client (`s3-driver.mjs`). Darin liegen drei Bestände, die sich nicht neu erzeugen lassen. | hoch |
| 4 | **Ein R2-Schlüsselpaar für alles** (rund 107 Workflow-Referenzen plus Vercel), dazu sechs verschiedene Cloudflare-Token-Namen. Einer davon ist ein Global API Key (`CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`, nur in `cloudflare-probe.yml`). | hoch |
| 5 | **Einzige Kopien außerhalb von Git:** Company-Intelligence-Ledger (R2), Supertrader-Research-Snapshots (R2), Social-Bilder (R2), Approval-Center und Meta-Token (KV), Newsletter-Kontakte (Brevo). | hoch |
| 6 | **Zustand liegt nur in Actions-Caches**, die nach 7 Tagen ohne Zugriff oder ab 10 GB verfallen: `sec-state-`, SEC-, SIC-, Vorsorge- und Tiingo2-Caches. | mittel |
| 7 | **Das Repo ist mit ~15,8 GiB schon über GitHubs Empfehlung** (< 5 GB, deutlich < 10 GB) und wächst um rund 0,25 GiB pro Tag (generierte Daten). Das ist ein Betriebsrisiko für sich, und eine Wiederherstellung dauert länger. | mittel |
| 8 | **Dringend, Frist heute 23:11 UTC:** `company-intelligence-profile-source.yml:250` lädt fest das Artefakt von Lauf `38308985623`. Es läuft am 26.10.2026 um 23:11 UTC ab, danach bricht der Schritt. Eine lesende Kopie liegt im Arbeitsverzeichnis dieser Sitzung (siehe §2.4). Sie verschwindet mit dem Container. | mittel, zeitkritisch |
| 9 | **Kein Wiederherstellungsverfahren dokumentiert.** Das RUNBOOK hat keinen Backup- oder Restore-Abschnitt. Ausnahmen: die Supertrader-Snapshots und der CI-Accepted-State haben eigene, gute Restore-Nachweise. | mittel |

**Empfehlung:**
- Ein **Pull-Backup von einem Rechner außerhalb von GitHub und Cloudflare**, mit restic (verschlüsselt, dedupliziert).
- Ziel ist ein **getrenntes Konto bei einem dritten Anbieter mit Object Lock**.
- Kein Produktivsystem bekommt Zugang zum Backup-Ziel. Deshalb kann eine kompromittierte GitHub-Automation dort nichts löschen.
- Kosten im ersten Jahr: **etwa 0,20–2 € pro Monat Speicher**, plus 0 € (vorhandener Rechner) oder rund 5 € (kleiner VPS) für den Sicherungsrechner.
- Alles braucht eine Freigabe, weil es kostenpflichtige Konten sind (§6).

---

## 1. Inventar

### 1.1 GitHub

| Komponente | Bestand | Wo sonst noch? |
|---|---|---|
| Repositories | `dennismueller10x-sudo/vision-universe-research`, **öffentlich**, angelegt am 25.08.2026, ~15,8 GiB (API-Feld `size`). Weiteres Repo laut `landing-pages-publish.yml`: `vision-universe-landing-pages` (Branch `gh-pages`); es ist dieser Sitzung nicht zugänglich und wurde nicht geprüft. | nirgends; keine Forks |
| Branches | **849**: `claude/*` 517, `codex/*` 58, `fix/*` 55, `authoring/*` 36, `workstream/*` 33, `feat*` 47, `integration/*` 13 und weitere. Fachlich besonders: `brevo-newsletter-state` (CAS-Register), `backup/instagram-20261015-1624`, `backup/instagram-20261020-1637`, `data/discover-europe-full-history`, `rollback/quant2-prelaunch-20260917`, `evidence/*` | nur GitHub; ungemergte Branches sind Entwicklungsarbeit ohne zweite Kopie |
| Tags, Releases, LFS, Git Notes | keine | – |
| Commits | `main`: 5.350 | – |
| Pull Requests | 961 (`refs/pull/*/head` 961). Beschreibungen, Reviews und Kommentare liegen **nicht in Git**. | nur GitHub |
| Issues | rund 120 offen, darunter `pipeline-alarm`. Inhalte nicht in Git. | nur GitHub |
| Wiki | aktiviert, aber kein Wiki-Repo gefunden | – |
| Workflows | 118 in `.github/workflows`; 58 mit `contents: write`; 10 mit `workflow_run`; keiner mit `pull_request_target`; nur Erstanbieter-`actions/*` (per Tag gepinnt, 9 per SHA) | im Repo |
| Actions-Artefakte | **4.758 Stück, 157 GB**, keins abgelaufen. Größte Posten: `quant2-release-candidate` 85 GB (13 Tage), `github-pages` 20 GB, Browser-Evidence (89 Tage) | nur GitHub, verfallen automatisch |
| Actions-Caches als Zustandsspeicher | `.market-cache`, `tiingo2-encrypted-v1-*`, `ownership-signals-*`, `sec-fundamentals-*`, `sec-cache-*`, **`sec-state-*`**, `sic-history-raw-*`, `vorsorge-ingest-*`, Pages-Public-Cache | nur GitHub (7 Tage, 10 GB) |
| Secrets (37 Namen) und Variablen (16) | Namen siehe §1.4; Werte sind bei GitHub nicht auslesbar | **nur so gut wie die Kopie im Passwortmanager des Owners** |
| GitHub Pages | Deployment über `pages-release.yml`; CNAME `research.visionuniverse.de` | baut aus `main` neu |
| GitHub App | Für `vu-intraday-waker` (`GITHUB_APP_ID`, Private Key als Worker-Secret) | Private Key nur in Cloudflare und beim Owner |
| Collaborators | 1 (Owner, admin) | – |

### 1.2 Cloudflare

| Komponente | Inhalt | Neu erzeugbar? |
|---|---|---|
| **R2-Bucket** (`VU_HISTORY_S3_*`) | siehe Tabelle unten | teilweise **nein** |
| Worker `vision-universe-social` + **KV `VU_SOCIAL_KV`** | `meta:connection:v1` (Meta-OAuth-Token), `approval:queue:v1`, `approval:decision:<id>`, `approval:manual-run:v1`, `reel:index:v1`, Claims, Smoke-State | **nein** (Entscheidungen); Token nur über erneuten OAuth-Flow |
| Worker `vu-ask` + DO `AskGate` | Salt, Rate- und Kostenzähler, Antwort-Cache, Log (5.000 Einträge) | Zähler und Log gehen verloren; tolerierbar |
| Worker `vu-live` + DO `VuLive` | kein dauerhafter Zustand | ja |
| Worker `vu-intraday-waker` (Cron) | kein Zustand | ja, solange der Private Key der GitHub App vorliegt |
| Worker-Secrets | `TIINGO_API_KEY`, `META_APP_SECRET`, `VU_SOCIAL_ADMIN_KEY`, `ANTHROPIC_API_KEY`, `TURNSTILE_SECRET`, `VU_ASK_*`, `GITHUB_APP_PRIVATE_KEY` | nur aus dem Owner-Tresor |
| DNS `visionuniverse.de` (vermutlich Cloudflare, `BREVO_CLOUDFLARE_DNS_TOKEN`) | Zone, Records, Turnstile | Zonen-Export fehlt |

**R2, Präfixe und Neubaubarkeit:**

| Präfix | Inhalt | Neu erzeugbar? | Stufe |
|---|---|---|---|
| `v1/company-intelligence/state/<ns>/` | SQLite-Ledger-Checkpoints (2 Slots + Pointer) und Accepted-Anker `accepted-20261006-21cc611a…` (30,9 MB) | **nein**, über Wochen gesammelter Crawl-Zustand | 1 |
| `research-snapshots/supertrader/sts1*/` | byte-genaue, write-once Backtest-Eingaben, ≤ 3 Generationen, ≤ 3 GB | **nein**, absichtlich der Reproduzierbarkeitsanker | 1 |
| `social/assets/<sha2>/<sha256>.*` | KI-generierte Originalbilder | **nein** | 1 |
| `v1/tiingo/daily/US/*`, `_index` | rund 5.700 EOD-Historien, ~7,5 GB | ja, aber teuer, kontingent- und lizenzgebunden | 2 |
| `v1/tiingo-delisted/`, `v1/tiingo-holdout/` | Backtest-Reihen | nur teilweise (Delistings) | 1 |
| `v1/sec/fundamentals/*` | SEC-Companyfacts und Daily-State | ja, von der SEC | 2 |
| `v1/company-intelligence/consumer/`, `v1/market/private.json.gz`, `v1/ecb/`, `v1/_usage/` | abgeleitet | ja | 3 |

Gesamtgröße geschätzt **10–12 GB** (Tiingo 7,5 GB, Snapshots ≤ 3 GB, Rest klein). Exakt misst es der vorhandene, nur lesende `r2-audit.yml`. Der Lauf ist eine Owner-Entscheidung.

### 1.3 Weitere Dienste

| Dienst | Bestand | Einzige Kopie? |
|---|---|---|
| **Brevo** | Kontakte, Listen 4/5/6, Kampagnen, DOI-Status. Der Import-Payload liegt nur als Secret `BREVO_IMPORT_PAYLOAD`. | **ja**, außer der privaten Original-CSV beim Owner. Personenbezogen, DSGVO. |
| Vercel | 3 Funktionen (`api/*`) und Umgebungsvariablen (u. a. R2-Zugang) | Code im Repo, Env nur bei Vercel |
| Meta/Instagram | Posts und Metriken; Teilsicherung über `social-ig-check.yml` (Branch `backup/instagram-*` und 90-Tage-Artefakt) | teilweise |
| HeyGen, Higgsfield | erzeugte Videos und Bilder bei den Anbietern; Endprodukte teils im Repo (`brand-media/`, `studio/`) | Originale nur beim Anbieter |
| Tiingo, FMP, Finnhub, TwelveData, OpenFIGI, SEC, EZB, Anthropic, YouTube | reine Upstream-APIs | – |
| Supabase, Dropbox | im Code nicht verwendet | – |

### 1.4 Secret-Inventar (nur Namen)

Diese Liste muss im Owner-Tresor vollständig mit Wert, Herkunft und Rotationsweg geführt sein. Ohne sie ist eine Wiederherstellung nach Kontoverlust nicht möglich.

- GitHub Actions:
  - R2: `VU_HISTORY_S3_{ENDPOINT,BUCKET,REGION,ACCESS_KEY_ID,SECRET_ACCESS_KEY}`
  - Datenanbieter: `TIINGO_API_KEY`, `FMP_API_KEY`, `TWELVE_DATA_API_KEY`, `FINNHUB_API_KEY`, `OPENFIGI_API_KEY`, `YOUTUBE_API_KEY`, `SEC_USER_AGENT`
  - Cloudflare: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TOKEN`, `CLOUDFLARE_API`, `CF_API_TOKEN`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_ACCOUNT_ID`, `LANDING_CLOUDFLARE_API_TOKEN`, `BREVO_CLOUDFLARE_DNS_TOKEN`
  - Brevo: `BREVO_API_KEY`, `BREVO_NEWSLETTER_CONFIG`, `BREVO_NEWSLETTER_CONTENT`, `BREVO_IMPORT_PAYLOAD`, `BREVO_IMPORT_REVIEW`, `BREVO_DOI_TEST_EMAIL`
  - Workers: `VU_SOCIAL_ADMIN_KEY`, `VU_SOCIAL_WORKER_URL`, `VU_ASK_ADMIN_KEY`, `VU_ASK_ACCESS_PASSWORD`, `TURNSTILE_SECRET`
  - Sonstige: `RESEARCH_ACCESS_PASSWORD`, `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `HIGGSFIELD_API_KEY`, `LANDING_PAGES_DEPLOY_KEY`
- Außerhalb von GitHub:
  - `GITHUB_APP_PRIVATE_KEY` (Worker)
  - `META_APP_SECRET`
  - Vercel-Env
  - Meta-OAuth-Token (KV)
  - `VU_ASK_SALT` (DO)
- Variablen: `COMPANY_INTELLIGENCE_*`, `LANDING_*`, `BREVO_*`, `VU_DATA_MODE`, `VU_ASK_PER_USER_DAILY`, `CLOUDFLARE_ACCOUNT_ID`

## 2. Sicherungslücken

### 2.1 Was heute ausschließlich auf GitHub existiert

1. **Die gesamte Git-Historie mit allen 849 Branches.** Die Entwicklungsarbeit auf ungemergten Branches gibt es nur dort. Lokale Klone, auch die der Cloud-Sitzungen, sind flach (`--depth`) und kurzlebig.
2. PR-Beschreibungen, Review-Threads, Issues und Alarm-Historie.
3. `brevo-newsletter-state` und `backup/instagram-*`: Branches ohne Schutz vor Löschung oder Force-Push.
4. Actions-Caches mit Ingest-Zustand (`sec-state-*` u. a.). Sie verfallen von selbst.
5. Actions-Artefakte. Überwiegend Evidence, die ersetzt werden kann. Ausnahme: fest referenzierte Artefakte (§2.4).
6. Secrets und Variablen. Bei GitHub sind sie nicht auslesbar; wenn der Tresor lückenhaft ist, sind sie verloren.

### 2.2 Was ausschließlich in einem einzelnen externen Dienst existiert

- R2 (Stufe 1): Company-Intelligence-Ledger, Supertrader-Snapshots, Social-Assets, Delisted- und Holdout-Reihen
- Cloudflare KV: Approval-Center und Meta-Token
- Cloudflare DNS: Zone und Records
- Brevo: Kontakte und Listen
- Vercel: Umgebungsvariablen
- Worker-Secrets, die nicht aus GitHub kommen

### 2.3 Strukturelle Lücken

- Kein Backup-Ziel, keine Versionierung, keine Löschsperre, keine Integritätsprüfung über alle Bestände.
- Keine Ausfallmeldung für Sicherungen. `pipeline-alarm` deckt nur Datenläufe ab und sitzt selbst auf GitHub.
- Kein Restore-Verfahren und kein Restore-Test, außer bei Supertrader-Snapshots und CI-Accepted-State. Beide sind vorbildlich, aber nur innerhalb von R2.
- Alle Restore-Pfade setzen GitHub und Cloudflare voraus. Fällt eins der beiden Konten aus, gibt es keinen Weg zurück.

### 2.4 Zeitkritisch: Artefakt `38308985623`

- `company-intelligence-profile-source.yml:250` lädt `company-intelligence-profile-source-38308985623`. Dieses Artefakt läuft **am 26.10.2026 um 23:11 UTC** ab.
- Inhalt: 760 Dateien, 98,8 MB; `candidate-qa.json` und Browser-Screenshots je Ticker.
- Diese Sitzung hat eine lesende Kopie gezogen: SHA-256 `406fe2ff3783163bd5cdd345edea8be717c2109f1338e8cf1839aae120b1edd2`, Zip geprüft. Der Container ist flüchtig, die Kopie also nicht dauerhaft.
- **Owner-Aktion:** das Artefakt heute über die Actions-Oberfläche des Laufs herunterladen und privat ablegen.
- Den Workflow-Schritt korrigiert der zuständige Company-Intelligence-PR (eigenes Gate). Er liegt außerhalb dieses Audits.

## 3. GitHub-Sicherheit und Risiko kompromittierter Automationen

| # | Befund | Folge im Kompromittierungsfall | Empfehlung (Owner-Freigabe nötig) |
|---|---|---|---|
| G1 | `main` ungeschützt, `rulesets` leer | Ein Workflow-Token mit `contents: write` (58 Workflows) oder ein PAT kann `main` per Force-Push umschreiben und jeden Branch löschen | Ruleset „Schutz vor Verlust“ auf `main`, `brevo-newsletter-state`, `backup/**`, `rollback/**`, `data/**`: **Force-Push blockieren, Löschen blockieren**. Normale Pushes der Datenläufe bleiben erlaubt, die Push-Kette (`push-with-retry.sh`) bleibt unberührt. Pflicht-Checks oder Reviews **nicht** im selben Schritt einführen, sonst brechen die Datenläufe. |
| G2 | Repo öffentlich | Code, Daten, Issues und Workflow-Logs sind öffentlich; dazu der Hash `VU_ASK_ACCESS_HASH` in `workers/vu-ask/wrangler.toml` (SECURITY_REVIEW L1) | Owner-Entscheidung. Für das Backup gilt: Die Sicherung muss Private-Inhalte (Issues, Secrets-Inventar) privat halten. |
| G3 | Ein R2-Schlüsselpaar für Leser und Schreiber, auch in Vercel | Ein Leck in einem der Verbraucher reicht, um alle R2-Bestände zu überschreiben oder zu löschen | Getrennte R2-Tokens: *Object Read* für Vercel und reine Leser, *Read & Write* nur für Erzeuger. Für `research-snapshots/` und `v1/company-intelligence/state/accepted-*` R2-**Bucket-Locks** (präfixbasierte Aufbewahrung) prüfen. |
| G4 | Sechs Cloudflare-Token-Namen, darunter ein **Global API Key** (`cloudflare-probe.yml`) | Der Global Key hat volle Kontorechte: DNS, R2, Worker, KV | Global Key widerrufen, wenn ihn kein Lauf mehr braucht. Tokens je Zweck mit kleinstem Recht anlegen und Namen vereinheitlichen. |
| G5 | `GITHUB_TOKEN` hat in 58 Workflows Schreibrecht | Ein manipulierter Schritt (z. B. eine kompromittierte npm-Abhängigkeit in einem Lauf) kann committen und force-pushen | G1 deckt den Totalverlust ab. `permissions:` je Job statt je Workflow schrittweise in den Produkt-PRs. |
| G6 | 2FA, Sitzungen, PATs, OAuth-Apps und Deploy-Keys des Owner-Kontos sind von hier nicht prüfbar | Kontoübernahme bedeutet Verlust aller GitHub-Daten | Checkliste §8 |
| G7 | Social-Admin-Key wird als `?key=` akzeptiert (SECURITY_REVIEW M3) | Key landet in Logs | bekannt, offen |
| G8 | Actions: nur Erstanbieter, per Tag gepinnt; npx-Werkzeuge exakt gepinnt | geringes Supply-Chain-Risiko | in Ordnung |
| G9 | Keine `pull_request_target`-Workflows | keine Ausführung fremder PR-Codes mit Secrets | in Ordnung |

**Schlussfolgerung für das Backup:** Die Sicherung darf keinen Pfad haben, über den GitHub- oder Cloudflare-Automationen sie erreichen. Deshalb Pull-Modell: Der Sicherungsrechner holt die Daten. Kein Workflow kennt Zugangsdaten zum Backup-Ziel.

## 4. Empfohlene Backup-Architektur

```
 GitHub ──┐ (read-only PAT)
 R2 ──────┤ (R2-Token: Object Read, nur dieser Bucket)       Backup-Ziel
 CF KV ───┤ (API-Token: Workers KV Storage Read)   ──restic──▶ (getrenntes Konto,
 CF DNS ──┤ (API-Token: Zone DNS Read)              verschlüsselt  Object Lock,
 Brevo ───┘ (API-Key, nur auf diesem Rechner)                  EU-Region)
        ▲                                                         │
   Sicherungsrechner (außerhalb GitHub/Cloudflare)                ▼
   - systemd-Timer / launchd, täglich 03:30 Europe/Berlin    zweite Kopie: restic copy
   - Totmannschalter-Ping nach Erfolg                        auf lokale Platte des Owners
```

### 4.1 Bausteine

| Baustein | Wahl | Begründung |
|---|---|---|
| Werkzeug | **restic** (Open Source) | AES-256 clientseitig, Deduplizierung, `forget`-Policy, `check --read-data` |
| Sicherungsrechner | **A:** vorhandener, ständig laufender Rechner oder NAS des Owners (0 €). **B:** kleiner VPS bei einem dritten Anbieter (~4–5 €/Monat) | Läuft nicht bei GitHub und nicht bei Cloudflare. Hält einen **dauerhaften `git clone --mirror`**: Täglich kommen nur neue Packs dazu, nach dem ersten Lauf werden also nur wenige hundert MB übertragen. |
| Ziel | **Backblaze B2, Region EU-Central**, eigenes Konto mit eigener E-Mail und Hardware-2FA. Bucket mit **Object Lock** (Governance, 30 Tage Standard) und Versionierung. | 10 GB frei, danach pay-per-GB; Object Lock macht Versionen im Sperrfenster unlöschbar. Alternative: Hetzner Storage Box BX11 (1 TB, Pauschalpreis, DE), mit Storage-Box-Snapshots als Sperrschicht. |
| Zugangsdaten am Ziel | **Zwei Schlüssel:** `backup-writer` (list/read/write, **ohne deleteFiles**) liegt auf dem Sicherungsrechner. `backup-pruner` (mit delete) liegt **nur offline im Owner-Tresor** und wird monatlich für `prune` benutzt. | Ein gestohlener Writer-Schlüssel kann nichts löschen. Object Lock schützt zusätzlich gegen einen gestohlenen Pruner im Sperrfenster. |
| Quell-Zugänge | GitHub: fine-grained PAT nur für dieses Repo (Contents, Metadata, Issues, Pull requests: *read*), 90 Tage, Kalender-Erinnerung zur Rotation. R2: neues Token *Object Read only*, nur dieser Bucket. Cloudflare: Token *Workers KV Storage: Read* + *Zone DNS: Read*. Brevo: eigener API-Key „backup“ (Brevo kennt keine Nur-Lese-Keys, deshalb nur auf dem Sicherungsrechner, nie in GitHub). | kleinstes Recht; keine bestehenden Schlüssel wiederverwenden |
| restic-Passwort | 32 Byte zufällig, zweimal offline (Tresor + Papier im Safe) | Ohne Passwort ist die Sicherung wertlos |
| Ausfallmeldung | Totmannschalter, z. B. healthchecks.io (kostenloser Tarif) oder ein Ping per Mail des Rechners: **keine Erfolgsmeldung binnen 26 h ⇒ Mail an den Owner**. Zusätzlich Fehler-Ping mit Exit-Code und Schrittname, ohne Secrets und ohne Pfade mit Personendaten. | Meldet auch, wenn der Rechner selbst ausfällt |

### 4.2 Was gesichert wird

| Stufe | Bestand | Takt | Methode |
|---|---|---|---|
| 1 | Git: `git clone --mirror` (alle Branches; `refs/pull/*` mitnehmen), danach `git fsck --connectivity-only` | täglich | Mirror-Verzeichnis per restic. `gc.auto=0` auf dem Mirror, damit die Packs stabil bleiben und dedupliziert werden. |
| 1 | GitHub-Metadaten: Issues, PRs, Reviews, Kommentare, Labels, Rulesets, Workflow-Liste, Secret- und Variablen-**Namen** als JSON (REST, paginiert) | täglich | JSON-Dateien → restic |
| 1 | R2 Stufe-1-Präfixe (Company-Intelligence-State, Research-Snapshots, Social-Assets, Delisted/Holdout) | täglich | `rclone sync --read-only` aus R2 in ein lokales Spiegelverzeichnis → restic. Manifest: Schlüssel, Größe, ETag, SHA-256. |
| 1 | KV `VU_SOCIAL_KV`: alle Schlüssel und Werte | täglich | Cloudflare-API (list + get) → JSON → restic. Enthält den Meta-Token, deshalb nur verschlüsselt ablegen. |
| 1 | Brevo: Kontakte, Listen, Attribute, Kampagnen-Metadaten | täglich | Brevo-API → JSON → restic (personenbezogen, §4.5) |
| 1 | Cloudflare DNS-Zonenexport, Worker-Liste mit Bindings und Crons | wöchentlich | API → restic |
| 2 | R2 `v1/tiingo/`, `v1/sec/` | wöchentlich (So) | wie Stufe 1. Neu erzeugbar, deshalb nicht täglich. |
| 3 | abgeleitete R2-Präfixe, Actions-Artefakte, Actions-Caches | nicht | neu erzeugbar. Caches bekommen eine eigene Folgeaufgabe (§7, Schritt 9). |
| – | Secret-**Werte** | nicht automatisch | gehören in den Owner-Tresor (z. B. Passwortmanager mit Notfallzugang), nicht in ein automatisches Backup |

### 4.3 Aufbewahrung

```
restic forget --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --group-by host,tags
```

- Läuft täglich mit dem Writer-Schlüssel. Die Policy markiert nur Snapshots, sie löscht keine Daten.
- `restic prune` läuft monatlich und manuell mit dem Pruner-Schlüssel vom Owner-Rechner. Das Object-Lock-Fenster (30 Tage) muss kürzer sein als die kürzeste Aufbewahrung, deren Daten `prune` entfernen soll. Gesperrte Packs entfernt `prune` erst nach Ablauf der Sperre.
- Die Policy gilt für jede Stufe getrennt (`--tag tier1|tier2`). Stufe 2 bekommt nur wöchentliche Snapshots, also 8 wöchentliche und 12 monatliche.

### 4.4 Integrität

| Prüfung | Takt |
|---|---|
| Quelle: `git fsck` auf dem Mirror; Ref-Anzahl und Ref-SHAs gegen `git ls-remote`; R2-Manifest gegen Listing (Anzahl, Bytes, ETag); KV-Schlüsselanzahl; Brevo-Kontaktanzahl gegen API-Zähler. Weicht etwas um mehr als 1 % von gestern ab ⇒ **Warnung** (fängt auch Massenlöschungen an der Quelle ab). | täglich |
| `restic check` (Struktur) | täglich |
| `restic check --read-data-subset=5%` | wöchentlich |
| `restic check --read-data` (vollständig) | monatlich |
| Restore-Probe in isolierter Umgebung (§5.1) | monatlich und nach jeder Änderung am Backup |

Ein Bericht je Lauf wird nur auf dem Sicherungsrechner und im Repo des Ziels gespeichert. Er enthält Zähler, Größen, Hashes und Dauer, aber keine Werte, Tokens oder E-Mail-Adressen.

### 4.5 Datenschutz (Brevo)

- Brevo-Kontakte sind personenbezogen.
- Das Backup ist dafür verschlüsselt, liegt in der EU und wird nach 12 Monaten gelöscht.
- In das Verarbeitungsverzeichnis aufnehmen: Gelöschte Kontakte bleiben bis zu 12 Monate in alten Sicherungsständen. Bei einer Wiederherstellung werden Abmeldungen und Löschungen aus der Abmeldeliste erneut angewendet.

## 5. Wiederherstellung

### 5.1 Restore-Probe (isoliert)

Die Probe läuft in einer Wegwerf-VM oder einem Container ohne Produktiv-Zugangsdaten und ohne Netzzugang zu GitHub-Schreib-APIs, R2-Schreibzugriff oder Cloudflare.

1. `restic restore latest --target /restore`
2. Git: `git clone /restore/mirror.git work`. HEAD-SHA mit dem Bericht des Laufs vergleichen. Danach `node --test "core/tests/*.test.mjs"` im Klon.
3. R2: Manifest-Hashes der Stufe 1 nachrechnen. Den Company-Intelligence-Anker nach `docs/COMPANY_INTELLIGENCE_ACCEPTED_STATE_RECOVERY.md` in ein **neues** Verzeichnis entpacken, `PRAGMA integrity_check` ausführen und die Zeilen der 6 Tabellen zählen. Einen Supertrader-Snapshot mit dem vorhandenen Restore-Verifier prüfen, offline gegen das lokale Verzeichnis.
4. KV und Brevo: JSON-Schema prüfen und Anzahlen vergleichen. **Nichts zurückschreiben.**
5. Ergebnis als Bericht (bestanden/fehlgeschlagen je Schritt) an den Owner.

### 5.2 Verlust des GitHub-Kontos

Ziel: Website in ≤ 1 Tag wieder erreichbar, Datenläufe in ≤ 3 Tagen. RPO ≤ 24 h.

1. **Sperren:** Ist das Konto kompromittiert, GitHub Support kontaktieren. Alle Schlüssel rotieren, die in GitHub-Secrets lagen: R2-Schreibtoken, Cloudflare-Tokens, Brevo, Datenanbieter, Anthropic. Grund: Der Angreifer kennt sie potenziell. Reihenfolge laut Tresor-Inventar.
2. **Neues Zuhause:** neues GitHub-Konto oder neue Organisation (alternativ GitLab oder Codeberg als Übergang). Hardware-2FA von Anfang an.
3. **Code:** `restic restore` des letzten Mirrors. Danach `git push --mirror` ohne `refs/pull/*`; `refs/pull/*` wird zusätzlich als `archive/pr-<n>` geschoben, wenn die Arbeit daraus gebraucht wird.
4. **Secrets und Variablen:** aus dem Tresor neu anlegen. Die Namensliste kommt aus dem Metadaten-Backup.
5. **Automationen:** neue GitHub App für `vu-intraday-waker` anlegen und `GITHUB_REPO` sowie `GITHUB_APP_*` im Worker setzen. Deploy-Key für das Landing-Repo neu erzeugen.
6. **Website:** Pages im neuen Repo aktivieren und `pages-release.yml` von Hand starten. DNS-CNAME `research` auf die neue Pages-Domain umstellen. Übergangsweise geht auch eine statische Auslieferung aus dem Mirror über Vercel oder Cloudflare Pages.
7. **Datenläufe:** Workflows stufenweise aktivieren. Zuerst Prüf-Workflows, dann `market-data-refresh`, dann die Produkte. Caches und Artefakte fehlen; die Läufe bauen sie neu (Kosten: Anbieterkontingente, insbesondere Tiingo).
8. **Issues und PRs:** bleiben als JSON-Archiv lesbar und werden nur bei Bedarf neu angelegt.

### 5.3 Verlust des Cloudflare-Kontos oder R2-Datenverlust

1. Neues Konto und neuen Bucket anlegen. Stufe-1-Präfixe aus restic mit einem **neuen** Schreibtoken hochladen; Pointer-Dateien jeweils zuletzt, wie bei `sync-state.mjs`.
2. Stufe 2 aus dem Wochen-Snapshot hochladen; die nächsten Läufe holen den Rest nach.
3. KV aus JSON einspielen (Approval-Entscheidungen). Den Meta-Token besser neu per OAuth verbinden als aus dem Backup einspielen.
4. Worker neu deployen (`cloudflare-*-deploy.yml`, `social-cloudflare.yml`), Secrets aus dem Tresor setzen, DNS-Zone aus dem Export einspielen.

### 5.4 Verlust von Brevo

Neues Konto anlegen. Kontakte **nur mit DOI-Status** aus dem letzten JSON-Stand importieren, Abmeldungen beachten. `brevo-newsletter-state` bleibt in Git und wird nicht zurückgesetzt.

## 6. Speicherbedarf und Kosten

### 6.1 Volumen

| Bestand | Heute | Wachstum | Nach 12 Monaten (dedupliziert) |
|---|---|---|---|
| Git-Mirror (alle Refs) | ~15,8 GiB | ~0,25 GiB/Tag (15,8 GiB in 62 Tagen) | ~105–110 GiB, weil Git-Historie nur wächst |
| GitHub-Metadaten (JSON) | < 0,2 GB | gering | < 1 GB |
| R2 Stufe 1 | ~3,5 GB | Snapshots begrenzt (≤ 3 GB), Assets klein | ~5–10 GB |
| R2 Stufe 2 | ~8 GB | Historien werden jede Woche neu geschrieben | **erwartet** ~15–25 GB, wenn restic die zstd-Dateien weitgehend dedupliziert. **Ungünstigster Fall** ~160 GB (20 voll verschiedene Stände à 8 GB). Wird in Phase 1 gemessen; danach ggf. Stufe 2 auf 4 wöchentliche + 3 monatliche Stände kürzen. |
| KV, Brevo, DNS | < 0,1 GB | gering | < 1 GB |
| **Summe** | **~28 GB** | | **erwartet ~130–150 GB, ungünstig ~280 GB** |

Die lokale Zweitkopie beim Owner braucht gleich viel Platz; eine 1-TB-Platte reicht.

Das Wachstum des Repos selbst (0,25 GiB/Tag) ist der größte Kostentreiber und ein eigenes Risiko für GitHub-Limits. Generierte Artefakte aus der Git-Historie auszulagern wäre ein eigenes Vorhaben und gehört nicht in diesen Audit.

### 6.2 Monatliche Kosten

Richtwerte; Preise vor Buchung beim Anbieter prüfen.

| Posten | Monat 1 | nach 12 Monaten |
|---|---|---|
| Backblaze B2, ~6–7 USD/TB/Monat, 10 GB frei | ~0,15 € | ~0,90 € (ungünstig ~1,80 €) |
| B2-Abruf für Restore-Proben (frei bis 3 × gespeichertes Volumen) | 0 € | 0 € |
| Sicherungsrechner Option A (vorhandener Rechner) | 0 € (Strom) | 0 € |
| Sicherungsrechner Option B (kleiner VPS) | ~4–5 € | ~4–5 € |
| Totmannschalter (kostenloser Tarif) | 0 € | 0 € |
| Lokale 1-TB-Platte (einmalig) | ~50 € | – |
| **Laufend gesamt** | **~0,15 € (A) / ~5 € (B)** | **~1–2 € (A) / ~6–7 € (B)** |

Alternative Hetzner Storage Box BX11 (1 TB): Pauschal ~3–4 €/Monat, unbegrenzter Traffic, deckt auch den ungünstigen Fall ab.

**Keiner dieser Dienste wurde aktiviert.**

## 7. Implementierungsplan

Jeder Schritt braucht eine ausdrückliche Owner-Freigabe. Alles Neue liegt außerhalb der bestehenden Workflows, Daten und Zugangsschutz-Architektur.

| Schritt | Inhalt | Wer | Freigabe |
|---|---|---|---|
| 0 (heute) | Artefakt `38308985623` sichern (§2.4). Tresor-Inventar aller Secrets gegen §1.4 abgleichen. 2FA-Check (§8). | Owner | – |
| 1 | Ruleset „Schutz vor Verlust“ (G1): nur *Block force pushes* + *Restrict deletions* auf `main`, `brevo-newsletter-state`, `backup/**`, `rollback/**`, `data/**`, `evidence/**`. Danach einen Datenlauf beobachten. | Owner (Settings → Rules) | **ja** |
| 2 | Konto beim Backup-Ziel anlegen (eigene E-Mail, Hardware-2FA), Bucket mit Object Lock + Versionierung in der EU, Schlüssel `backup-writer` (ohne delete) und `backup-pruner` (offline). | Owner | **ja** (Kosten) |
| 3 | Sicherungsrechner wählen (A/B). restic + rclone installieren. Quell-Tokens nur lesend neu anlegen (§4.1); **keine bestehenden Tokens wiederverwenden**. | Owner + Claude-Anleitung | **ja** |
| 4 | Backup-Skript `vu-backup.sh` mit den Schritten aus §4.2–4.4, `set -euo pipefail`, Secrets nur aus Datei oder Keychain, `--quiet`-Logs ohne Werte. Wird als Vorlage in diesem Repo unter `docs/operations/backup/` geliefert und vom Owner auf den Rechner kopiert. Kein Workflow. | Claude (PR, nur Doku) | Review |
| 5 | Erstlauf, Messung von Dauer und Volumen je Stufe. Danach Stufe-2-Policy festlegen (§6.1). | Owner | – |
| 6 | Totmannschalter einrichten; Fehlerfall einmal absichtlich auslösen (Netz trennen) und die Meldung prüfen. | Owner | **ja** (Dienstkonto) |
| 7 | Erste Restore-Probe in isolierter VM nach §5.1. Ergebnis als Bericht. | Owner + Claude | – |
| 8 | Zweitkopie: `restic copy` monatlich auf die lokale Platte des Owners. | Owner | – |
| 9 | Folge-PRs je Produkt (Gates beachten): R2-Tokens trennen (G3), Global API Key ablösen (G4); Actions-Cache-Zustände (`sec-state-*`) nach R2 spiegeln wie bei `history-store-sync.yml`; fest referenziertes Artefakt im Company-Intelligence-Workflow ersetzen; R2-Bucket-Locks für Stufe-1-Präfixe prüfen. | Claude, je Produkt eigener PR | **ja**, je PR |
| 10 | RUNBOOK um den Abschnitt „Backup und Wiederherstellung“ ergänzen und auf diesen Bericht verweisen. Restore-Probe monatlich im Kalender. Jahrestest des Szenarios „GitHub-Kontoverlust“ als Planspiel. | Claude (Doku-PR) | Review |

## 8. Prüfaufgaben für den Owner (von hier nicht einsehbar)

- [ ] GitHub: 2FA mit Hardware-Schlüssel oder Passkey. Recovery-Codes offline. Aktive Sitzungen, PATs (classic und fine-grained), OAuth-Apps, installierte GitHub Apps, SSH- und Deploy-Keys, Webhooks durchsehen und Unbekanntes entfernen.
- [ ] GitHub: Actions-Einstellungen → *Workflow permissions* auf „Read repository contents“ als Standard. Workflows mit eigenem `permissions:` sind nicht betroffen, also vorher prüfen, ob jeder schreibende Workflow `permissions:` setzt. *Allow GitHub Actions to create and approve pull requests* aus.
- [ ] GitHub: Secret-Scanning und Push-Protection aktiv (bei öffentlichen Repos kostenlos).
- [ ] Cloudflare: 2FA. API-Tokens mit Rechten und Ablauf auflisten. Global API Key rotieren oder nicht mehr verwenden. R2-Tokens je Verbraucher.
- [ ] Vercel, Brevo, Meta, Backblaze/Hetzner: 2FA; Mitglieder und API-Keys prüfen.
- [ ] Tresor: Für jeden Namen aus §1.4 Wert, Herkunft, Rotationsweg und Notfallzugang (zweite Vertrauensperson oder versiegelter Umschlag).
- [ ] Domain-Registrar `visionuniverse.de`: 2FA, Transfer-Lock, Kontakt-E-Mail nicht auf derselben Domain.

## 9. Was dieser Audit nicht geändert hat

Keine Workflows, keine Daten, keine Deployments, keine Einstellungen, keine Secrets, keine Dienste, nichts am Login und am Passwortschutz.

Einzige Aktion außerhalb dieses Dokuments: Das ablaufende Artefakt `38308985623` wurde lesend heruntergeladen (§2.4).
