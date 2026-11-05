# Strang A – Infrastruktur (Stand 05.11.2026, morgens)

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
- **Produktuniversum mit Gate** (#1376): `security-master-eligibility.yml` und `scripts/core/eligibility-gate.mjs`. Ein Commit gibt es nur bei Gate COMMIT. Heute ist das Gate BLOCKED (siehe Offen). Core auf `main` ist wieder grün: `stock-availability` hatte AAL fest als Beispiel.
- **Bündel-Verzeichnis:** `core/registry/workflow-bundles.json` ordnet allen 141 Workflows eines von 12 Ziel-Bündeln zu. `core/tests/workflow-bundles.test.mjs` verlangt diese Zuordnung für jeden neuen Workflow. Ein Bündel ersetzt seine Quellen erst, wenn sie gelöscht sind. `quant-portfolio-research.yml` (Strang C) ist dem Bündel `research` zugeordnet.

## Offen
- **Insider-Käufe E2:**
  - In #1369 habe ich einen Fehler gefunden und behoben: dieselbe Einreichung wurde unter mehreren CIKs doppelt gezählt.
  - Live-Lauf 03.11.: 820 Einreichungen, 63 Käufe, 3:48 min.
  - Die Einbindung in den SEC-Tageslauf, nur im Datenzweig, steht in #1378 und wird nach #1369 gemergt.
  - **Überschneidung:** `ownership-signals.yml` baut schon wöchentlich Insider-Transaktionen (`quant/data/product/ownership-signals-v1/`). E2 ergänzt die tagesgenaue Point-in-Time-Verfügbarkeit. Empfehlung: Beide wachsen im Bündel `pipeline-weekly`/`pipeline-daily` zu einem Erzeuger zusammen. Bis dahin hat E2 noch keinen Konsumenten.
- **Produktuniversum nachholen:**
  - Gegen den Stamm 1.3.0 ergibt der Erzeuger 473 Statuswechsel, davon 129 ELIGIBLE→EXCLUDED, und ein Produktuniversum von 6.686 auf 6.739.
  - Das geht nur über einen eigenen PR mit Vorher/Nachher je Produkt (Discover, Faktoren, Screener).
  - Danach den Zeitplan einschalten, im Anschluss an den Security-Master-Lauf.
- **Bündelung:**
  - erster Kandidat ist `content` (7 Workflows, alle nur Datei-Commits);
  - danach `monitor`;
  - 14 Workflows sind als Löschkandidaten markiert (Einmal-Läufe, Proben, Altpfade).
- **Datenzweig:** Abnahme News am 11.11. (7 Tage nur `IDENTICAL`).
- Folgearbeiten an 1.3.0 (Strang C): #1119 (H6), optional H7.
- PR-Liste: liegt beim Owner zur Bestätigung, bis dahin wird nichts geschlossen.

## Braucht Owner
- Nichts Neues.
- Hinweis: Vercel meldet auf PRs „Deployment rate limited“, ein roter Status ohne Bezug zum Code. Empfehlung: die Vercel-Integration für dieses Repo abschalten, weil Pages die Seite ausliefert.

## Offene PRs: Vorschlag (noch nichts geschlossen, Bestätigung durch die Steuerungssitzung)

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
