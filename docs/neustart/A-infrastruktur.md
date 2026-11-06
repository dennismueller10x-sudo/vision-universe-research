# Strang A – Infrastruktur (Stand 05.11.2026, ~20:30 UTC)

Plan: [PLAN_NEUSTART_2026-11.md](../PLAN_NEUSTART_2026-11.md). Pfade: `.github/workflows`, `scripts/ci`, `scripts/core`, `core/registry`, dieses Dokument.

## Fertig
- **Security Master 1.3.0 produktiv** ([Freigabevorlage](../data/security-master/SECURITY_MASTER_1_3_0_FREIGABE.md) §4):
  - P1 41877792353: mit der alten Liste BLOCKED (G7 27/25);
  - Liste mit dem Erzeuger neu gebaut und gemergt (#1341), canonical_id 25/25;
  - P2 41884873986 erfüllt;
  - produktiver Lauf C 41885696451, Commit `a8ccf1af0a`, sechs Dateien, Stamm bytegleich mit P2 (`eda08c60…`, 8.056 Zeilen);
  - SF8-Eingangsprüfung jetzt CURRENT bis 03.01.2027 (Namen bis 19.12.2026). Die Sperre am 11.11. entfällt.
- **Quant-CI grün** (#1343): S5 erlaubt öffentliche `vars` nur namentlich (`PUBLIC_VARS`), die Secrets-Prüfung bleibt unverändert. Die übrigen 9 roten Tests (M11, Elliott-Registry) hingen vom Datenstand ab und sind auf aktuellem `main` grün.
- **Zeitpläne und FV-8** (#1344):
  - News 3× täglich;
  - Security Master mittwochs 09:41 UTC, Commit nur bei Gate COMMIT ohne Sonderrechte;
  - Freshness-Monitor zusätzlich nach dem Marktdaten-Refresh, neuer Job `pit` (fehlender Snapshot-Monat → Alarm).
- **Security Master Schritte 6–8 erledigt:**
  - Marktdaten-Lauf 41886133466 nach C, Commit `ff5bbd985b`; Discover zeigt EDVA „Endovia Health Sciences“;
  - Nachprüfung auf `main`: Core 352/0, Quant 3929/0, Discover/Supertrader/Screener 1784/0, Technical 114/0, Python 590 OK;
  - `system-health`: US-Wertpapierstamm OK;
  - Generation 1.3.0 eingefroren (#1347).
- **Datenzweig-Pilot News** (#1348, Phase DUAL_WRITE): `data/live` enthält nur `dashboard/data/news_feed.json`. Der ausgelieferte Pages-Lauf 41890840080 meldet `IDENTICAL 1`, vollständig.
- **Produktuniversum mit Gate** (#1376): `security-master-eligibility.yml` und `scripts/core/eligibility-gate.mjs`. Ein Commit gibt es nur bei Gate COMMIT. Core auf `main` ist wieder grün: `stock-availability` hatte AAL fest als Beispiel.
- **Insider-Käufe E2 in der Tagespipeline:**
  - #1369 geprüft, zwei Fehler behoben:
    - Doppelzählung über mehrere CIKs;
    - eine HTML-Anlage stoppte den Lauf; einzelne nicht lesbare Einreichungen werden jetzt ausgewiesen statt zu stoppen.
  - #1378: eigener Job im SEC-Tageslauf, 90-Tage-Fenster, nur im Datenzweig.
  - Erster Stand in `data/live`: 141 Käufe aus 1.423 Einreichungen (03.–05.11.), 0 abgewiesen.
- **Erstes Bündel `content`** (#1385): News, Analystenbewertungen, Hedgefonds 13F und Morning in einem Workflow, Schritte bytegleich übernommen. 141 → 138 Workflows.
- **Bündel-Verzeichnis** (#1379) mit Vertragstest. Jeder neue Workflow braucht ein Ziel-Bündel.
- **Produktuniversum nachgeholt** (#1388, Commit `c5357718cb` vom Erzeuger):
  - Freigabeliste der 228 Wechsel mit Vorher/Nachher je Produkt (`docs/data/security-master/ELIGIBILITY_CATCHUP_2026-11.md`);
  - 131 ETFs verlassen das Produkt; sie standen bis dahin als Aktie in Discover (123) und Quant (131);
  - 18 Titel kommen dazu;
  - Produktuniversum 6.686 → 6.573;
  - Statusseite „Security Master“ wieder OK, vorher seit 20.10. STALE.
  - Befund dabei: Der Erzeuger allein hätte 147 Anleihen und ETNs als Aktie aufgenommen. Der Workflow läuft jetzt die vollständige Kette (Namensschicht DEBT, Börsenverzeichnis).
  - Ab jetzt läuft der Eignungslauf nach jedem Security-Master-Lauf, mit normalen Grenzen. Die Produkte übernehmen den Stand mit dem nächsten Marktdaten-Lauf.
- **Screener-Spalten Supertrader-Methoden** (#1389, Z5): `stMeth`, `stV1`, `stStage` aus #1377; 1.719 Titel mit Methode, 564 mit V1. Die Oberfläche baut D2.
- **Insider zusammengeführt, Schritt 1** (#1397): Parität vorab an 60 echten Form-4-Einreichungen, E2 (Python) und Eigentümer-Signale (JS) lesen 60/60 identische Käufe. E2 holt jede Form 4 einmal täglich und legt zusätzlich den Cache-Auszug der Eigentümer-Signale in `data/live` (`insider/data/form4/<Monat>.json`, intern, ≈1,4 MB je Monat). `ownership-signals.yml` sät damit seinen Cache und holt nur noch, was fehlt.
- **Bündel `monitor`** (#1400): neun Live-Prüfungen in `monitor.yml`, ein Auswahl-Job bildet die alten Auslöser nach (Dispatch-Wahl, Pages-Lauf → technical, Push-Pfade + Commit-Marke). Nebenbei ADR-005: Eingaben in discover-realtime über `env:`.
- **Ausmusterung** (#1402): neun tote Workflows gelöscht, Liste unter `retired` im Bündel-Verzeichnis. Von den 14 Kandidaten bleiben fünf mit Grund (update-sec-fundamentals aktiv, social-hashtag-capability Reaktivierungspfad, tiingo-scale und social-smoke-publish von Tests gelesen, supertrader-delisting-probe).
- **Umfangsfolgen nach Universumsänderung** (#1401, #1406, #1414): Befund nach dem Nachholen: für die 131 ausgeschiedenen ETFs lagen noch Discover-Reihen (131), lange Reihen (74), Intraday-Snapshots, Discover-Daten (6.686 statt 6.573 Titel) und 25 Technical-Signal-Einträge; die Datenhygiene-Prüfung in ~20 Datenläufen wäre rot geworden, auch im Nachtlauf vor seiner Materialisierung, ohne sich selbst zu heilen. Ursache für die Technical-Signale: die Materialisierung liest `market-capability.json` aus dem Company Master, den sonst erst der SEC-Tageslauf am nächsten Morgen nachzieht. Der Eignungs-Workflow zieht jetzt nach jeder Universumsänderung mit den Erzeugern nach: Company Master + Universums-Indizes, `--prune-only`/`--index-only` für Reihen und Intraday, Discover-Neubau mit Nachprüfung, dann Materialisierung mit `force`. Drei Läufe heute; `main`: Hygiene bis auf die Materialisierung sauber, Discover 594/1 (Rest: `ask/index.html`, anderer Strang). Danach scheiterte die Materialisierung noch an Vertragstests, die COOL (ausgeschiedener ETF) fest als Beispiel nutzten: #1423 wählt den Titel aus den Daten. **Lehre:** Eine Universumsänderung ist erst fertig mit ihrer ganzen Folgekette (Company Master → Reihen → Discover → Materialisierung → Tests mit festen Beispieltiteln); das Nachholen hätte erst mit dieser Kette gemergt werden dürfen. Die Kette läuft jetzt automatisch.
- **Gates → Vertragstests** (#1403): `core/registry/product-contracts.json` + `core/tests/product-contracts.test.mjs` (PC-1 Produktänderung löst Produkt-CI aus, PC-2 Vertragstests laufen, PC-3 Schnittstellen-Schemata, PC-4 kein Pfadverbot mehr). Supertrader Gate A nur noch Bericht; Discover-Engine-Regel und das Pfadverbot in Company Intelligence `validate` entfernt; CLAUDE.md nachgezogen.

- **Bündel `ci`, Stufe 1** (#1465, #1471): zwölf kleine Prüfungen (ask, brevo, ci-config, creative-job-guard, etf-dashboard, fundamental, hedgefonds-dashboard, landing, research-access, screener, vorsorge, willkommen) als Jobs von `ci.yml`; Auswahl über `scripts/ci/select-checks.mjs` + `scripts/ci/ci-checks.json` (PR: Dateiliste der API; Push: Compare-API `before...after`; ohne vollständige Liste alle in Frage kommenden). #1471 behob, dass die Push-Auswahl auf `main` an fehlenden Commit-Feldern scheiterte. Screener-Vertrag zeigt auf `ci.yml`. Workflow-Dateien heute 138 → 114.
- **Vertragstest Folgekette** (#1457, UF-1..4): nur `security-master-eligibility.yml` schreibt `eligibility.json`; jedes Verzeichnis, das die Hygieneprüfung am Produktumfang misst, gehört dem Umfangsfolgen-Schritt oder wird über die Materialisierung nachgezogen. CLAUDE.md nennt die geltenden Vertragstests (PC, WB, UF, DB).
- **Vorsorge nach den Umfangsfolgen** (#1467, #1468, #1469, #1478): 121 ETFs, die Tiingo nicht als ETF listet, hatten ihre Vorsorge-Reihe aus den Discover-Reihen und wären im Nachtlauf verschwunden (Vorsorge-CI seit ~17 Uhr rot). Der Vorsorge-Ingest fragt sie jetzt selbst ab (Zusatz-ETFs `CONFIRMED_NON_EQUITY:ETF`), Teillauf `nur_zusatz` holt alles noch nicht Aufgenommene, `universe.json` schrumpft nicht mehr. Läufe 42095775542 (120/121) und 42101119919 (+97 neu gelistete, CAM). Namensregel in `etf-master.js` (ANV, DINE, LMNX, LQ, PTNT) und ein Listing je aktivem ETF (CAM). Sichtbar 6.072 → 6.133; PCL ohne Tiingo-Kurse „keine Kursreihe“. Vorsorge-Neubau auf `main` reproduzierbar. **Lehre:** die Folgekette braucht auch Verbraucher außerhalb der Hygieneprüfung (Vorsorge las Discover-Reihen für ETFs).

## Offen
- **Insider, Schritt 2:** nach dem ersten grünen Wochenlauf der Eigentümer-Signale mit gesätem Cache lesen Verbraucher nur noch eine Quelle; die eigene Abholung der Eigentümer-Signale bleibt Lückenfüller (Form 5, Ausfälle).
- **Bündelung, nächste Schritte:**
  - `pipeline-intraday` zusammen mit Plan §3 „ein Cloudflare-Takt statt GitHub-Crons“: Der Wecker startet heute `intraday-pacemaker.yml` und `discover-im-blick-live.yml` per Dateiname und prüft je Datei, ob ein Lauf aktiv ist (`laeuftSchon`). In einem gemeinsamen Workflow hielte ein laufender Watchdog- oder Taktgeber-Lauf die anderen Teile an. Umbau in einem Schritt: `pipeline-intraday.yml` mit Eingabe `teil` und `run-name` je Teil, ohne eigene Zeitpläne; der Wecker startet jeden Teil zu seiner Zeit und filtert Läufe nach `display_title` (Tests in `worker-waker/tests`); `pages-release.yml` lauscht auf den neuen Namen und filtert nach Teil; Ausrollen über `cloudflare-waker-deploy.yml` außerhalb der Sitzung (vor 13 UTC); danach die fünf Dateien löschen.
  - `pipeline-daily` (17 Workflows, `workflow_run`-Ketten nach Namen): zuerst die Kette als Liste mit Auslösern, dann Stufe für Stufe.
  - `ci` Stufe 2: die großen Produkt-CIs (quant, discover, technical, supertrader, core, account) nach einer Woche Betrieb von Stufe 1.
  - Rest-Kandidaten nach Gate-Umbau: supertrader-delisting-probe; `monitor` noch ohne freshness-monitor, fundamental-sec-freshness, supertrader-live-smoke, company-intelligence-health/-watchdog.
- **Datenzweig:** Abnahme News am 11.11. (7 Tage nur `IDENTICAL`), danach News auf BRANCH_ONLY.
- Folgearbeiten an 1.3.0 (Strang C): #1119 (H6), optional H7.
- **PR-Aufräumen erledigt** (Owner-Bestätigung 05.11.2026 im Chat):
  - 107 PRs mit Kommentar und Grund geschlossen (wiederherstellbar);
  - die drei Europa-PRs #1294, #1295 und #1297 zu #1392 zusammengeführt und gemergt;
  - #1268, #1270, #1273, #1331 und #1340 hatten ihre Stränge vorher selbst erledigt;
  - offen sind danach nur noch die behaltenen PRs und laufende Strang-PRs.

## Stand `main` 06.11. ~10:00 UTC
- **Grün auf `main`** (lokal, nach Materialisierung aef8d68): Quant 3.942/0, Core 380/0, Technical 114/0, Datenhygiene sauber, Vorsorge reproduzierbar.
- **Eignungs-Bereinigung übernommen** (#1508 Freigabeliste, Lauf 42178798946): 269 belegte ETFs aus dem Produkt, Produktuniversum 6.577 → 6.308. Im Probelauf: Quant −269, Discover −267, Technical −30, Fundamental −11, Hedgefonds −7, Elliott −6, Supertrader 0; Pages-Probe CLEAN 164/164.
- **Folgekette, Befunde dieses Laufs:**
  - Materialisierung brach in der Reise-Messung mit Speicherüberlauf ab (480/500, 4 GB) → #1514 (6 GB), zweiter Lauf grün.
  - Der Vorsorge-Ingest lief gleichzeitig mit der Materialisierung und scheiterte an deren Rest in den Technical-Signalen → #1512: nur dieser Rest gilt als Warnung.
  - Die SF8-Research-Ansichten nannten 6 ausgeschiedene ETFs (DQ-SF8-8) → Kandidatenlauf manuell neu, mit Fingerabdruck veröffentlicht.
  - **Lehre:** Weitere Verbraucher außerhalb der Hygieneprüfung sind SF8-Kandidaten und die Reise-Messung (Speicher). Die SF8-Neuveröffentlichung ist noch nicht automatisch Teil der Folgekette, weil der Autoweg eine neuere Sitzung verlangt.
- **Technical/Quant-QA:**
  - #1509: Rot/Grün-Regel mit Ausnahme für die Tagesveränderung, die Pfeil und Zahl tragen muss; Signalkarten auf 360/390 px; Supertrader-Link nach `build.json`.
  - #1510: „Radar verfügbar“ kommt aus dem Radar-Zustand, nicht aus der Karte; NVDA steht im Radar, hat aber kein Ereignis.
- **Analysten** (#1492, #1495, #1496, #1511, aktiv):
  - Drei Läufe täglich zu je ~2.200 Titeln.
  - Erster voller Lauf: 0×429 bei 55/min; 3.200 Titel abgefragt, 2.349 mit Einstufung, Median 12 Analysten.
  - Kursziele noch 0, weil das FMP-Tageskontingent erschöpft ist.
  - Seite `/analysten/`, Fundamental `?ansicht=analysten`.
- **Offen – Neuabnahme `test_canonical_market.py`:**
  - #1516: Bezug aus dem Commit der Messung (26fd422, 6.686).
  - Im Lauf 42196818498 sind noch 18 Titel unerklärt. Sie hatten am Stichtag 10.10. laut heutiger Reihe 300–302 Bars, galten damals aber als zu kurz (Schwelle 300). Alle Reihen beginnen am 28.–31.07.2025; vermutlich lag der letzte Datentag der Messung vor dem 10.10.
  - Die Bilanz geht noch nicht auf: Technik 5.644 − 7 = 5.637 gegenüber gemessenen 5.655, Chart 6.683 − 396 = 6.287 gegenüber gemessenen 6.305.
  - Entscheidung für C-Quant: Grenzfälle über den letzten Datentag der Messung zählen statt über den Stichtag, dann neu abnehmen. Die Klassifikation wird nicht nebenbei geändert.

## Übernommen von Strang B (05.11.2026, [B-supertrader.md](B-supertrader.md))
- **Bis 15.12.2026 (Frist 04.01.2027):** Papierhandel F1–F3 (Forward-Namensraum befüllen) und ein Core-PR, der `supertrader-paper-2027-log` in `core/registry/domains.json` mit JSONL-Leser auf `ACTIVATING` stellt. Ohne beides zeichnet `supertrader-paper-2027.yml` ab 04.01. auf, ohne dass Core die Daten kennt.
- **Security Master vor ca. 04.01.2027 auffrischen** (SF8-Grenze 60 Tage ab Stand 05.11.): Der Mittwochslauf (`security-master-weekly.yml`, 09:41 UTC) committet nur bei Gate COMMIT. Bis 16.12. prüfen, dass mindestens ein Lauf übernommen wurde; sonst mit Freigabeliste nachholen wie am 05.11.
- **Erste Nachtläufe beobachten (06./07.11.):** `supertrader-signals.yml`: `private-state pull` meldet erst `MIGRATED_FROM_REPOSITORY`, ab dem zweiten Lauf `PRIVATE`; Kandidatenlauf veröffentlicht Stand 05.11. ohne Pläne; DQ-SF8-4 in der Core-CI grün.
- **Alt-PRs:** #1262, #1263 (C09-Entwürfe) und #1267 geschlossen (Forschung ruht, Verweis auf B-supertrader.md). #1141 (Inhalts-Fingerabdruck des Security Masters für die Backtest-Freshness) geschlossen; Plan bleibt in `docs/SECURITY_MASTER_CONTENT_HASH.md`, wird vor der Dezember-Auffrischung neu bewertet, weil diese alle Backtest-Snapshots als veraltet markiert. #1156 übernommen: Alarm-Job in `sec-consumer-fundamentals.yml`.

## Braucht Owner
- Nichts Neues.
- Hinweis: Vercel meldet auf PRs „Deployment rate limited“, ein roter Status ohne Bezug zum Code. Empfehlung: die Vercel-Integration für dieses Repo abschalten, weil Pages die Seite ausliefert.

## Offene PRs: Liste vom 04.11. (umgesetzt am 05.11.2026)

Stand 04.11.2026, 18:45 UTC: 131 offene PRs (Strang A: keine). Vorschlag: **21 behalten, 3 zusammenführen zu 1, 107 schließen**. Geschlossene PRs bleiben wiederherstellbar (Plan §6 Nr. 9).

### Behalten (21)

| PR | Inhalt | Strang | Grund |
|---|---|---|---|
| #630 | Cookie-Banner, Rechtstexte vorbereitet | D / Owner | Recht, Owner-Abnahme |
| #631 | Brevo: Domain-Authentifizierung | A | Newsletter-Start |
| #624 | Brevo-Doku: Import belegt | A | nur Doku, mergen oder in BREVO.md übernehmen |
| #1119 | SEC-Delisting → active_status (132 Zeilen) | C | H6, direkt nach 1.3.0 |
| #1141 | Security Master: Inhalts-Fingerabdruck | A/C | nach 1.3.0 neu aufsetzen |
| #1156 | SEC-Consumer-Lauf: Alarm | A | Betrieb, rebasen |
| #1241 | V13-Archiv Generation 2.0.0 | C | H3 |
| #1258 | Konto-UX „Mein Dashboard“ | D | Produkt |
| #1259 | Musterstudie Gesamtrendite (FV-5) | C | Backtest |
| #1262, #1263, #1267 | Supertrader C09, FP-ST-03 | B | Fachmodell-PRs |
| #1268, #1270, #1273 | Papierhandel SF6-PAPER-2027 | B (+A für #1273) | Frist 31.12. |
| #1300 | Betrieb: Healthcheck Chartbild | A | Betrieb |
| #1308, #1309 | App-Anmeldeschiene | App | nach dem Web-Start |
| #1331, #1340 | Redesign Shell/Vorlage | D | laufend |
| #1337 | Strang-B-Stand | B | laufend |

### Zusammenführen (3 → 1)

| PR | Vorschlag |
|---|---|
| #1294, #1295, #1297 | Europa (XPAR-Identität, Lizenzprüfung, Lückenbericht): ein Europa-PR, sonst schließen. Kein Produktpfad, nur Belege. |

### Schließen (107)

| Gruppe | PRs | Grund |
|---|---|---|
| Frühe Einzel-PRs (Sept.) | #44, #53, #59, #62, #63 | Basis zwei Monate alt, Inhalte anders umgesetzt |
| VU2-Entwürfe (Sept.) | #64–#92 (29 PRs, lückenlos) | Vorschau-Linie abgelöst, Basis veraltet |
| Autoren-Einreichungen | #95, #97, #98, #101, #102, #103, #104, #106, #108, #110, #112, #116, #170, #179, #188, #197, #204, #219, #240, #245, #254, #255, #258, #296, #303, #320, #332, #337, #351, #360, #380 (31) | `VU-AUTHORING-REQUEST`-Probeläufe und Einreichungen eines abgelösten Wegs; Reels laufen über `docs/studio/` |
| Marketstack/Tiingo 2.0/Europa (Okt.) | #324, #328, #330, #334, #341, #346, #353, #404, #432, #457, #458, #461, #469, #470, #479, #529 (16) | Entwürfe ohne Fortsetzung; Europa-Stand liegt in #1294–#1297 |
| Fundamentals-Stapel „nicht mergen“ | #481, #504, #505, #510 | BLOCKED seit 10.10.; Anliegen (TTM-Etikett, AS_REPORTED) als Aufgabe an Strang C |
| Kapitalmaßnahmen-Forschung | #721, #737, #758, #763 | NOT_READY-Entwürfe; Lizenzfrage FP-ST-01 läuft getrennt |
| Supertrader-Forschung (Okt.) | #471, #475, #588, #589, #632, #643, #677, #705, #709, #722 | abgelöst durch SUPERTRADER_9 und V1 Top 5 |
| Technical/Discover/Quant-UI alt | #426, #476, #509, #778 | abgelöst (Technical 46/54, Redesign) |
| Doku-Übergaben | #1192, #1284, #1303 | keine neuen Übergabe-/Fortschrittsdokumente (CLAUDE.md); Stand steht im Plan |
| Doppelt | #1325 | ersetzt durch #1343 (Test statt Umbenennung) |

Nach dem Aufräumen: 21 + 1 = 22 offen; Ziel unter 15 erreicht, sobald die laufenden Strang-PRs gemergt sind.

## Umbau Plan §3: Konzept und Pilot

**Ziel:** Erzeuger schreiben nicht mehr nach `main`; `main` trägt Code, Tests, Doku. Pages baut aus `main` und legt die Daten darüber.

**Weg in drei Phasen je Datenart** (Steckbrief `core/registry/data-branch.json`):
1. `DUAL_WRITE`: Erzeuger schreibt wie bisher nach `main` und zusätzlich in den Datenzweig `data/live` (`scripts/ci/push-data-branch.sh`). Pages legt den Zweig über die Seite (`scripts/ci/overlay-data-branch.mjs`) und meldet je Pfad `IDENTICAL`. Abnahme: 7 Tage nur `IDENTICAL`, kein `MISSING`.
2. `BRANCH_ONLY`: Erzeuger schreibt nur noch in den Zweig. Die Kopie in `main` bleibt eingefroren als Rückfall. Pages meldet `OVERLAID`; ist der Zweig kaputt, älter oder leer, bleibt der Rückfall (`KEPT_MAIN`), fehlt ein Pfad ganz, bricht der Bau ab.
3. Aufräumen: Kopie aus `main` entfernen (kein Löschen von Daten: sie liegen im Zweig, später R2). `system-health` und Tests lesen den Zweig.

**Vertragstests statt Pfad-Gates:** `core/tests/data-branch-pilot.test.mjs` prüft Steckbrief, Reihenfolge Bau → Datenzweig → Rauchtest, Monotonie, fail closed bei ungültigen Daten und einen echten Git-Lauf. Je Datenart kommt ein Vertrag (Schema, Mindestzahl, Zeitstempel aus `domains.json`) dazu; die Pfad-Gates fallen, sobald ihre Welt Verträge hat.

**Pilot:** News (`dashboard/data/news_feed.json`, eine Datei, ein Erzeuger, unkritisch). Nächste Kandidaten: Analyst Ratings, Market Pulse, danach Discover (größter Commit-Anteil).

**Workflows bündeln (Ziel ca. 12):** `pipeline-daily` (Marktdaten-Refresh, Materialisierung, Discover, Supertrader-Signale, Freshness), `pipeline-intraday` (Taktgeber, Snapshots, Im Blick), `pipeline-weekly` (Security Master, Universum, lange Reihen), `content` (News, Ratings, Morning), `ci` (Core, Quant, Discover, Supertrader, Technical als Matrix), `deploy` (Pages), `social`, `account`, `app`, `research` (manuelle Studien), `alarm`, `maintenance`. Reihenfolge: erst Datenzweig je Datenart, dann den Erzeuger in den Sammel-Workflow verschieben; ein Workflow pro PR.
