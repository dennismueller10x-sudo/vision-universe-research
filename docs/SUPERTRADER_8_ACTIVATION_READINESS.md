# Supertrader 8.0 – technische Aktivierungsvoraussetzungen V1–V4

Stand 27.10.2026, 19:30 UTC. Integrationsstand `main` mit 1527253 (Merge #993). Ziel ist, die tägliche Research-Kandidatenerkennung technisch vorzubereiten, **ohne sie zu aktivieren**.

Gilt unverändert:
- Alle 13 Strategien sind `LIVE_NOT_APPROVED`; `VALIDATED_TRADE_SIGNAL` ist gesperrt.
- Keine Zertifizierung, keine Orders, kein Broker, keine neuen Anbieter, keine Abrufe.
- Die 83 Quarantänefälle und CC-5 bleiben unverändert.
- Der Tageslauf #973 bleibt Draft und abgeschaltet.
- V5 (visuelle Abnahme, Safari/WebKit) ist separat; V6 (Aktivierung) ist gesperrt.

## Übersicht

| | Voraussetzung | Status | PR |
|---|---|---|---|
| V1 | Datenpipeline und Aktualität | **teilweise erfüllt** – Fehlererkennung belegt, Stabilitätsschwelle noch nicht erreicht, Security Master ohne Erzeuger | – (Beobachtung) |
| V2 | Core-Registrierung | **erfüllt, Merge offen** | #1025 → #1027 |
| V3 | Datenqualitätsregeln | **erfüllt, Merge offen** | #1027 (+ Anwendung in #973) |
| V4 | Zentraler Preisabgleich | **erfüllt, Merge offen** | #1026 |

## V1 – Datenpipeline und Aktualität

Belege aus echten Laufprotokollen (GitHub Actions, nur gelesen; kein Lauf ausgelöst).

### Eingaben des Kandidatenlaufs und ihre Erzeuger

| Eingabe | Artefakt | Erzeuger |
|---|---|---|
| Tagesbalken | `quant/data/product/technical-signals-v1` | `market-data-refresh.yml`, Job `materialize` |
| Veröffentlichter Schluss (V4) | `quant/data/market/discover-series` | `market-data-refresh.yml`, Job `refresh` |
| Universum, Kontinuität, SEC-SIC | `discover/data/stock-index/US_REAL.json`, `listing-continuity-v1.json`, `sic-peer-taxonomy-v1.json` | `market-data-refresh.yml` |
| Wochenreihen | `quant/data/market/discover-series-long` | `long-series.yml` |
| Benchmark SPY | `quant/data/market/multi-asset/series/SPY.json` | `multi-asset-data.yml` |
| Security Master | `us-security-master.json` | **kein Workflow** (Registry `workflow: null`) |
| Firmennamen | `company-names.json` | `company-names.yml`, **ohne Zeitplan** |

### Laufbilanz (Stichprobe 13.–27.10.2026)

**`market-data-refresh.yml`:** 8 von 9 geplanten Nachtläufen grün (15.–24.10.), jeweils mit genau einem „Materialize …“-Commit je Sitzung.
- Der einzige rote Lauf ist **40433301246** (27.10., Sitzung 26.10.). Der marktabhängige Vertragstest `product-services.test.mjs:155` (NVDA-6-Monats-Momentum < 0) hielt die Materialisierung an, wie vorgesehen:
  - Commit und Fingerprint wurden übersprungen;
  - `freshness-contract` meldete `P0_DATA_PIPELINE_FROZEN`;
  - Alarm-Issue #986 wurde eröffnet;
  - der Supertrader-Anstoß wurde zurückgehalten.
- Behoben durch #988. Danach war ein **manueller** Dispatch nötig: 40459929703 → `c04c7a5`.

**`long-series.yml`:** 10/10 grün, darunter die Reparaturläufe 24.10. und 27.10.; DQ-PX-4 = 0.

**SEC:**
- `sec-fundamentals-daily.yml`: 11/11 grün (17.–27.10.).
- `sec-consumer-fundamentals.yml`: nach #963 4/4 grün, darunter **ein geplanter Lauf** (40339879235, 26.10.).
- Der vorherige Fehlschlag 40294140924 war `spawnSync ENOBUFS` in der Test-Isolation.

**Nachgelagert:** `supertrader-signals.yml` 13/13 grün seit 17.10. Am 22.10. war SPY eine Sitzung zurück; der Supertrader-Anstoß wurde zurückgehalten und gemeldet (#841, am Folgetag automatisch geschlossen).

**Läufe nach 1527253:** noch keiner. Der erste geplante Nachtlauf wird am 28.10. zwischen 00:30 und 03:00 UTC erwartet. Der neue Job `supertrader-prune` (#993) ist noch nie real gelaufen.

### Zustand am 27.10.2026 (lokal gemessen)

- **Frische:** `measure-pipeline-freshness`: Marktsitzung, Ablage und Produkt stehen auf 26.10., Rückstand 0, `QUANT_CURRENT` PASS.
- **`system-health`:**
  - Security Master STALE (1.021 h, `OLDER_THAN_840H`);
  - Intraday und News STALE, ohne Bezug zu SF8;
  - alle SF8-Eingaben OK.
- **`data-quality`:** kein ERROR. WARN DQ-PX-2: 93 Reihen ohne die letzte Sitzung, davon 90 delistet oder ausgesetzt. WARN DQ-PX-3: 302 Tagessprünge über 60 %. Der Kandidatenlauf behandelt beides selbst (FRESHNESS-FAIL, Quarantäne).
- **Eingangsprüfung** des Tageslaufs (#973, lokal): `CURRENT` am 27.10.; am 12.11. `STALE` mit Exit 3, weil der Security Master älter als 60 Tage ist.

### Fehlererkennung

- **Belegt:**
  - Ein roter Materialisierungsschritt färbt den Lauf rot.
  - Der Frischevertrag meldet P0, und es entsteht ein Alarm-Issue.
  - Ein nicht aktueller Supertrader-Eingang wird zurückgehalten und gemeldet.
  - Es wurde kein Lauf gefunden, der grün war und veraltete Daten veröffentlicht hat.
- **Schwach:** `freshness-monitor` öffnet fast jeden Abend ein STALE-Issue, weil zwischen Börsenschluss und Nachtlauf eine Lücke liegt. Diese Alarme sind erwartbar und schließen sich selbst, können aber einen echten Ausfall verdecken.

### Freigabeschwelle V1

Abgeleitet aus den beobachteten Fehlerarten:
- marktabhängige Tests, die die Materialisierung anhalten;
- eine Nebenquelle eine Sitzung zurück;
- Test-Infrastruktur;
- 2–7 h verspätete Zeitpläne;
- Quellen ohne Erzeuger.

| # | Kriterium | Stand 27.10. |
|---|---|---|
| S1 | **Fünf aufeinanderfolgende geplante Nachtläufe** von `market-data-refresh.yml` auf `main` **nach 1527253** grün (`refresh`, `materialize`, `freshness-contract`), je ein „Materialize …“-Commit mit Produktrückstand 0. Das ist eine volle Handelswoche einschließlich eines Wechsels vom Freitags- zum Montagslauf. | 0 von 5 |
| S2 | In diesen fünf Läufen kein manueller Eingriff, also kein Heil-Dispatch der Materialisierung. | offen |
| S3 | #993 belegt: `supertrader-prune` einmal real gelaufen **oder** ausdrücklich festgehalten, dass der Fall nicht eintrat; NL5 auf `main` grün. | offen (NL5 auf `main` nach c8aa7b0 grün, lokal) |
| S4 | Nebenquellen: Wochenreihen-Reparatur grün und ein Samstags-Volllauf grün; SPY an jedem Lauftag auf der letzten Sitzung; SIC und Kontinuität nächtlich frisch. | Wochenreihen grün; Samstag 31.10. offen |
| S5 | SEC-Consumer: zwei aufeinanderfolgende **geplante** Montagsläufe grün mit erklärter Abdeckung. | 1 von 2 (26.10.) |
| S6 | Security Master und Firmennamen: Erzeuger mit Zeitplan **oder** Owner-Entscheidung zum Turnus; Alter mindestens 14 Tage unter der Grenze der Eingangsprüfung (60 bzw. 45 Tage). | **nicht erfüllt** (Master 46 Tage alt, kein Erzeuger) |
| S7 | `system-health` OK für alle SF8-Eingaben; `data-quality` ohne ERROR; DQ-PX-2/PX-3 höchstens auf dem Niveau vom 27.10. | erfüllt außer Security Master |

Offene Beobachtungen, die keine anderen Arbeiten blockieren:
- S1–S3 und S5 brauchen nur reguläre Läufe; es wird **kein** zusätzlicher Produktivlauf ausgelöst.
- S6 braucht eine Owner-Entscheidung: entweder einen Erzeuger mit Zeitplan für den Security Master in einem eigenen Quant-PR oder eine manuelle Erneuerung mit festem Turnus. Ohne sie blockiert die Eingangsprüfung den Tageslauf ab dem **11.11.2026** und wegen der Firmennamen ab etwa dem **26.11.2026**. Das ist bewusst fail closed.
- Ein künftiger Zeitplan des Tageslaufs (V6) muss an das tatsächliche Ende von Materialisierung und Signalkette gekoppelt sein, über `needs` oder Dispatch, nicht an eine feste Uhrzeit. Die beobachtete Verspätung beträgt bis zu 7 h.

## V2 – Core-Registrierung (#1025, #1027)

- **#1025 (Gate A):** `registry-guard.mjs` öffnet `SF-PRODUCT-NO-RUN-INTEGRATION` und `SF2-LEGACY-ISOLATION` nur für genau einen Registry-Eintrag mit festgeschriebenen Feldern und `activation.state PREPARED_DISABLED`; Gegenproben in `SF8-REGISTRY-GUARD`.
- **#1027 (Core):**
  - Eintrag `supertrader-sf8-candidates` mit `activation.state PREPARED_DISABLED` und `pendingWorkflow: PR #973`.
  - `health.js`: kein Artefakt → DISABLED/NOT_ACTIVATED; Artefakt vorhanden → FAILED/PUBLISHED_WITHOUT_ACTIVATION.
  - Die Register-Tests verlangen, dass das Artefakt einer vorbereiteten Datenart **nicht** existiert.
  - Warnliste in `core-ci.yml` ergänzt.
- Es wurde keine Core-Schutzregel pauschal gelockert. Die einzige Ausnahme ist ein fehlender Workflow mit dokumentiertem offenem PR, und das nur für vorbereitete Datenarten.

## V3 – Datenqualitätsregeln (#1027)

DQ-SF8-1..8, alle ERROR und fail closed über den Aktivierungszustand:

| Regel | Prüfung |
|---|---|
| DQ-SF8-1 | Frische |
| DQ-SF8-2 | Identität |
| DQ-SF8-3 | Stufensperren |
| DQ-SF8-4 | keine Order-/Stopmarken unter MODELED |
| DQ-SF8-5 | Quarantäne und DQ-Grenzen |
| DQ-SF8-6 | Ergebnisverträge, einschließlich `records/` |
| DQ-SF8-7 | Budget |
| DQ-SF8-8 | Preisabgleich |

- Golden Case und adversariale Gegenproben je Regel.
- Echter Lauf vom 26.10. (3.001 Kandidaten): alle PASS; mit `records/` rot.
- #973 wendet die Regeln vor Upload und Commit an.

## V4 – Zentraler Preisabgleich (#1026)

Details: [SUPERTRADER_8_PRICE_PARITY_V4.md](SUPERTRADER_8_PRICE_PARITY_V4.md).
- Der Abgleich läuft gegen `published-close.js`: Identität, Sitzung und Schluss ohne Toleranz.
- Legitim ist nur die Rundung split-adjustierter Werte vor einem Split.
- Ungeklärt am Stichtag → FAIL; ungeklärter Verlauf → CAP CHART.
- Vorher/Nachher: 3.001 Kandidaten unverändert, alle auf den Cent gleich.

## Auswirkungen auf #973

Angepasst, Sicherheitsmechanismen erhalten:
- kein Zeitplan, nur `workflow_dispatch`;
- Job nur mit `vars.SF8_CANDIDATES_ENABLED == 'true'`;
- Commit nur mit `commit=true`;
- Eingangsprüfung mit Exit 3.

Neu:
- öffentliche Teile in einem eigenen Verzeichnis;
- DQ-SF8-1..8 vor Upload und Commit; rot, wenn die Regeln fehlen;
- Commit nur, wenn der Registry-Eintrag existiert **und** freigegeben ist.

Solange `PREPARED_DISABLED` gilt, ist ein Commit doppelt ausgeschlossen: Der Workflow bricht ab, und Core-Tests, DQ und Health würden ein Artefakt melden. `main`, #1025 und #1026 sind eingemergt. E2E-Probe lokal: CURRENT → 3.001 Kandidaten → DQ 8/8 PASS → Commit gesperrt.

## Unabhängiges Review (27.10.2026)

Das Review lief rein lesend, mit eigenen Gegenproben auf dem echten Lauf vom 26.10. Ergebnis: kein BLOCKING, 3 HIGH, 3 MEDIUM, 2 LOW.

| Befund | Behandlung | PR |
|---|---|---|
| HIGH 1: DQ-SF8-4 übernahm nur die Liste des Erzeugers; `closeVsGapLow` (C12) und Turtle `N` unterhalb von MODELED | Die Core-Regel ist jetzt unabhängig: festgeschriebene Strukturmarken und Chartmarkenarten je Methode, keine Zahl unter Order-, Stop-, Limit- oder Einstiegsnamen (Wortteile). `closeVsGapLow` bleibt (Abstand zur Strukturmarke `GAP_DAY_LOW`, gleich `pivot.distance`), ebenso `N` (Volatilitätseinheit, ohne Einstiegsmarke kein Stop); begründet in `SUPERTRADER_8_PRICE_PARITY_V4.md`. | #1027, #1026 |
| HIGH 2: Inhaltsregeln sahen nur `strategy/`, nicht `ticker/`, `index.json`, `summary.top` und keine fremde `C14.json` | Alle Ansichten und Kurzzeilen werden geprüft. Scherben müssen der Strategieansicht gleichen, `index.json` ist Pflicht. Die sechs Mutationen des Reviews sind auf echten Daten jetzt alle ERROR. | #1027 |
| HIGH 3: `SF8-GATE-AUX` sicherte künftige Daten des Repositorys zu (Zeitbombe ab ca. 10.11.) | Der Test läuft jetzt auf einer Fixture mit festen Erzeugungsdaten (Grenze, Folgetag, undatiert). | #973 |
| MEDIUM 4: Merge-Reihenfolge nicht erzwungen | `core-ci` führt die Registry-Schutztests mit aus. | #1027 |
| MEDIUM 5: V6 ohne roten Zwischenstand unmöglich | Neuer Zustand `ACTIVATING` in Health, Register-Tests, DQ und Commit-Sperre; Ablauf siehe unten. | #1027, #973 |
| MEDIUM 6: Ausnahme für `domains.json` breiter als ein Verweis | Schlüsselsatz festgeschrieben; nur `artifact` und `producer` dürfen den Pfad nennen. Das Muster umfasst die Altmodule und ignoriert Groß-/Kleinschreibung. | #1025 |
| LOW 7: Rundungsfenster bis 0,99 Cent | Nur genau ½ Einheit (gemessen 1.330 von 1.330); Kandidaten unverändert. | #1026 |
| LOW 8: `instrumentId` in DQ-SF8-8, unlesbare Referenz als MISSING, fremde Datei als „keine Daten“ | Alle drei behoben. | #1027, #1026 |

Ohne Befund: Gate A, Test-Isolation, `missingArtifact` gegen die echten Fehlertexte, Registry-Schutz gegen die echte Registry, Preisabgleich ohne Toleranz am Stichtag sowie ADR-005 und die Abschaltung des Tageslaufs.

## Merge-Reihenfolge

1. **#1025** (Schutztests): zuerst. Erzwungen: `core-ci` von #1027 führt die Registry-Schutztests mit aus und bleibt rot, bis #1025 auf `main` ist; danach `main` in #1027 mergen.
2. **#1026** (V4): unabhängig von #1025 und #1027, vor #973.
3. **#1027** (Core): nach #1025.
4. **#973** (Tageslauf, abgeschaltet): zuletzt. Der Merge aktiviert nichts. Davor ist `main` erneut einzumergen; `pendingWorkflow` in #1027 entfällt dann in einem kleinen Core-Nachtrag oder im Aktivierungs-PR.

## Offen für die tatsächliche Aktivierung

- V1: S1–S3, S5 (reguläre Läufe abwarten) und S6 (Owner-Entscheidung Security Master und Firmennamen).
- V5: Owner-Abnahme der befüllten Vorschau sowie Safari/WebKit (separat).
- V6, ausdrücklich gesperrt. Jeder Schritt ist ein eigener, vom Owner gemergter PR; jeder Zwischenstand ist grün, und kein PR bringt Daten mit:
  1. Supertrader-PR: `registry-guard.mjs` akzeptiert `ACTIVATING`.
  2. Core-PR: `activation.state` → `ACTIVATING`. Health zeigt DISABLED/AWAITING_FIRST_RUN, DQ prüft ohne Daten nichts, der Commit-Schritt ist freigegeben.
  3. Variable `SF8_CANDIDATES_ENABLED=true`, erster Lauf mit `commit=false`, DQ-Bericht und CI-Artefakt prüfen.
  4. Lauf mit `commit=true`.
  5. Supertrader-PR, der `activation` nicht mehr verlangt, dann Core-PR, der das Feld entfernt. Ab dann ist ein fehlendes Artefakt FAILED.
  6. Zeitplan in einem weiteren PR, gekoppelt an das Ende der Kette.

## Owner-Freigabevorlage

```
Freigabe Supertrader 8.0 – technische Voraussetzungen (keine Aktivierung)
[ ] #1025 Schutztests (Gate A) gemergt                       am ____
[ ] #1026 Preisabgleich V4 (DQ-Vertrag 1.1.0) gemergt         am ____
[ ] #1027 Core-Registrierung V2 + DQ-SF8 V3 gemergt           am ____
[ ] #973  Tageslauf (abgeschaltet) gemergt, main eingemergt   am ____

Aktivierung Tageslauf (V6, später, eigener PR)
[ ] V1 S1 fünf geplante Nachtläufe nach 1527253 grün: Läufe ______________________
[ ] V1 S2 ohne manuellen Eingriff     [ ] S3 supertrader-prune/NL5    [ ] S4 Nebenquellen
[ ] V1 S5 zweiter geplanter SEC-Consumer-Lauf grün: Lauf ______
[ ] V1 S6 Security Master / Firmennamen: Erzeuger oder Turnus entschieden: ______
[ ] V5 Vorschau (Inhalt, Darstellung, Safari/WebKit) freigegeben am ____
[ ] V6 PR #____: activation entfernt, registry-guard angepasst
[ ] V6 Variable SF8_CANDIDATES_ENABLED=true; erster Lauf commit=false geprüft: Lauf ______
[ ] V6 Zeitplan per eigenem PR #____ (an Ende der Kette gekoppelt, nicht an Uhrzeit)
Entscheidung: aktivieren / nicht aktivieren        Datum, Name: ______
```
