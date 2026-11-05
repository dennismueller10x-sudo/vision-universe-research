# Strang A – Infrastruktur (Stand 05.11.2026, Tagesende)

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

## Offen
- **Insider, Schritt 2:** nach dem ersten grünen Wochenlauf der Eigentümer-Signale mit gesätem Cache lesen Verbraucher nur noch eine Quelle; die eigene Abholung der Eigentümer-Signale bleibt Lückenfüller (Form 5, Ausfälle).
- **Bündelung, nächste Schritte:**
  - `pipeline-intraday` zusammen mit Plan §3 „ein Cloudflare-Takt statt GitHub-Crons“: Der Wecker startet heute `intraday-pacemaker.yml` und `discover-im-blick-live.yml` per Dateiname und prüft je Datei, ob ein Lauf aktiv ist (`laeuftSchon`). In einem gemeinsamen Workflow hielte ein laufender Watchdog- oder Taktgeber-Lauf die anderen Teile an. Umbau in einem Schritt: `pipeline-intraday.yml` mit Eingabe `teil` und `run-name` je Teil, ohne eigene Zeitpläne; der Wecker startet jeden Teil zu seiner Zeit und filtert Läufe nach `display_title` (Tests in `worker-waker/tests`); `pages-release.yml` lauscht auf den neuen Namen und filtert nach Teil; Ausrollen über `cloudflare-waker-deploy.yml` außerhalb der Sitzung (vor 13 UTC); danach die fünf Dateien löschen.
  - `pipeline-daily` (17 Workflows, `workflow_run`-Ketten nach Namen): zuerst die Kette als Liste mit Auslösern, dann Stufe für Stufe.
  - `ci` (26): eine `ci.yml` mit Auswahl-Job wie `monitor`; `product-contracts.json` zeigt dann auf Jobs statt Dateien.
  - Rest-Kandidaten nach Gate-Umbau: supertrader-delisting-probe; `monitor` noch ohne freshness-monitor, fundamental-sec-freshness, supertrader-live-smoke, company-intelligence-health/-watchdog.
- **Datenzweig:** Abnahme News am 11.11. (7 Tage nur `IDENTICAL`), danach News auf BRANCH_ONLY.
- Folgearbeiten an 1.3.0 (Strang C): #1119 (H6), optional H7.
- **PR-Aufräumen erledigt** (Owner-Bestätigung 05.11.2026 im Chat):
  - 107 PRs mit Kommentar und Grund geschlossen (wiederherstellbar);
  - die drei Europa-PRs #1294, #1295 und #1297 zu #1392 zusammengeführt und gemergt;
  - #1268, #1270, #1273, #1331 und #1340 hatten ihre Stränge vorher selbst erledigt;
  - offen sind danach nur noch die behaltenen PRs und laufende Strang-PRs.

## Roter Stand auf `main` (05.11. mittags)
- Quant: 30 Fälle Mischstand nach der Universumsänderung (Faktoren/Signale/Pattern noch 6.686) → Materialisierung mit `force` läuft, Nachtlauf 22:30; Restmenge morgen früh.
- Fremd: Core „Screener-Feld stMethods“ (#1391, Fixture `core/tests/query-engine-universe` nicht nachgezogen); Discover Test 480 (`ask/index.html` ohne Farbschema-Schalter); Technical L1–L3 (`technical-ap8-l1`, Datensatz vs. Materialisierung). An die Steuerung gemeldet.
- Wartet auf grünes `main`: #1400 (monitor), #1402 (Ausmusterung), #1403 (Vertragstests); CI-Bündel Stufe 1 (12 kleine Prüf-Workflows → `ci.yml`, Auswahl `scripts/ci/select-checks.mjs`, Tests SC-1..6) liegt auf Zweig `claude/bundle-ci-small`.

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
