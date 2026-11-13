# Quant: Abschlussübergabe an die zentrale Entwicklung (Version 1.0.0, Stand 02.11.2026)

> **Einstieg Quant.** Aktuelle Arbeitsregeln: [CLAUDE.md](../../CLAUDE.md); datierte Entscheidungen: [Neustart-Plan](../PLAN_NEUSTART_2026-11.md). Bei Widersprüchen zu historischen Abschnitten gelten diese Quellen. Weitere Seiten sind Fachbelege, keine parallelen Einstiege. [Landkarte](../README.md).


Diese Übergabe beschließt den produktspezifischen Quant-Chat. Ab jetzt steuert ein zentraler Claude-Code-Chat die Entwicklung aller Produktwelten.
- Sie ist ohne Chatverlauf verständlich.
- Die maschinenlesbare Fassung steht in [`quant-handover.json`](quant-handover.json).
- Der Einstieg für alle Welten bleibt [`docs/VISION_UNIVERSE_ARCHITECTURE.md`](../VISION_UNIVERSE_ARCHITECTURE.md), die Arbeitsregeln stehen in [`CLAUDE.md`](../../CLAUDE.md).

**Organisation ab 02.11.2026 (Owner-Entscheidung):**
- Die produktbezogenen Claude-Code-Chats werden aufgelöst.
- Strategie, Planung und alle Produktentscheidungen laufen in **einem zentralen ChatGPT-Chat**.
- Die Umsetzung für alle Produktwelten übernimmt **ein zentraler Claude-Code-Chat**. Er übernimmt die offenen Quant-Arbeitspakete H1–H7 (Abschnitt H) zusammen mit den Aufgaben der anderen Welten.
- Der bisherige Quant-Chat ist mit dieser Übergabe abgeschlossen. Die Freigaberegeln des Owners gelten unverändert.

**Letzte Merges des Quant-Chats (02.11.2026):**

| PR | Inhalt | Merge-Commit |
|---|---|---|
| #1239 | Discover NL5 | `08edec9e59` |
| #1237 | Shell-QA wartet auf eingefahrenes Menü, 44 px unverändert | `cc95376185` |
| #1238 | Hex-Passphrase für neue Archive | `aa0f10ae98` |
| #1243 | diese Abschlussübergabe | siehe Merge-Commit von #1243 |

#1224 ist geschlossen, ersetzt durch #1219.

**Verifikation von `main` @ `aa0f10ae98`** (volle Suiten lokal):

| Suite | Ergebnis |
|---|---|
| Quant | 3857/0 |
| Core | 308/0 |
| Discover/Screener/Supertrader | 1578/0 |
| Technical | 61/0 |
| Python | OK |
| Testisolation | sauber |

**Zustandskennzeichen in diesem Dokument:**
- **ERLEDIGT:** auf `main` und wirksam.
- **DEAKTIVIERT:** implementiert, aber ausgeschaltet.
- **BLOCKIERT:** wartet auf Daten oder eine Owner-Entscheidung.
- **LANGFRISTIG:** spätere Weiterentwicklung.

**Prozessregeln des Owners (gelten weiter):**
- Gemergt wird nur, was ausdrücklich freigegeben ist. Technische Dringlichkeit erweitert den Scope nicht.
- Keine neue Quant-Grundlagenforschung und keine Alpha-Suche.
- Keine Änderung an Zertifizierungsgates.
- Keine neuen kostenpflichtigen Anbieter.
- Keine öffentliche Aktivierung ohne eigene Freigabe.

---

## A. Produktstand

### A1. Live auf research.visionuniverse.de (ERLEDIGT)

Quant ist eine Single-Page-App: `quant/index.html`, Routen in `quant/app/app.js`, Daten über `quant/api/product-services.js` aus `quant/data/product/*`.

| Route | Inhalt | Daten |
|---|---|---|
| `#/` und `#/radar` | Quant Radar: Ereignisse wie Trend, Momentum, Faktorwechsel und Setups | `radar-v1.json.gz`, `radar-home-v1`, `radar-ticker-v1/`, `market-regime-v1.json` |
| `#/screener`, `#/screener/profi` | Faktor-Screener | `factor-evidence-v1/screening.json.gz`, `universe-list-v1.json.gz`, `quant/data/market/factors/` |
| `#/strategien[/<id>]` | Strategieprofile („Wer passt heute?“) | `strategy-index-v1.json.gz` |
| `#/aktien`, `#/aktie/<T>` | Aktienseite: Faktoren, Technical, Setup-Karte, Muster, Chart, Evidenz | `factor-evidence-v1/`, `technical-signals-v1/`, `pattern-match-v1/`, `discover-series[-long]` |
| `#/aktie/<T>/zahlen` | Fundamentaldaten (SEC) | `quant/data/sec/*` |
| `#/backtest[/<id>]` | Backtest-Stand je Art. „Historischer Backtest noch nicht freigegeben“, **ohne Ergebniszahl**, solange nicht zertifiziert | `signal-backtest-v1.json`, `setup-backtest-v1.json`, `backtest-readiness-v2.json`, `backtest-certification-v1.json` |
| `#/methodik`, Evidenzseiten | Methodik und Nachweisstand | `evidence-status-v1.json`, `capabilities-summary-v1.json` |
| `#/vergleich`, `#/chartlagen` | Vergleich, Chartlagen | wie Aktienseite |

**Anzeigeregeln:**
- `quant/engines/display-policy.js` und `quant/config/development-preview.json` (Owner-Entscheidung 13.09.2026) erlauben die öffentliche Anzeige der Tiingo-Kurse des Produktuniversums.
- Die gesamte Quant-Oberfläche ist byte-gesperrt: Basis `docs/quant-recovery/v51/ui-protection.json`, Revisionen in `docs/quality/ui-protection-revisions.json` (PR #1236).
  Seit 11.11.2026 (Owner) gilt die Sperre nur noch für zahlenerzeugende Dateien; entsperrt (Revisionen `kind: "unlock"` in `docs/quality/ui-protection-revisions/quant-darstellung-frei-*.json`) sind `quant/app/{app,stock,chartbild}.css`, `quant/ui/{quant,technical-chart}.css`, `quant/index.html`, `quant/app/ui.js`, `quant/ui/legacy-redirect.js`. `view-model.js`, `page-*.js`, `pages.js`, `app.js`, `shell.js`, Chart-Module und Tests bleiben gesperrt, weil sie sortieren, Anteile bilden oder Daten laden.

### A2. Implementiert, aber nicht aktiviert (DEAKTIVIERT)

| Funktion | Ort | Schalter |
|---|---|---|
| **Interne Backtest-Vorschau** mit 21 vorgerechneten Auswahlen | Seite `/konto/admin/backtests/`, Worker `workers/vu-account/src/backtests.mjs`, Bundle `workers/vu-account/data/backtest-review-bundle.json` | `VU_BACKTEST_REVIEW_ENABLED = "false"` (`wrangler.toml`), Rolle `backtest_reviewer` nicht vergeben. Aktivierung: PR #1227 |
| Research-Adapter (Runner-Ergebnisse in Produktdiensten) | `quant/api/backtest-research-adapter.js` | `DISABLED`, solange nicht `options.enabled` |
| Vorschau-Dienst (Node) | `quant/api/backtest-preview-service.cjs` | standardmäßig `DISABLED` |
| Backtest-Ergebniszahlen auf `#/backtest` | Zertifizierungsartefakt | `productionApproved=false`, `CERTIFIED_KINDS=[]` |

### A3. Sechs Backtest-Arten und sieben Zusatzmethoden

Quelle: `quant/engines/backtest-kinds.cjs`, `scripts/quant/research/backtest-runner.cjs` (`METHOD_FIT`).

**Zertifizierung neu gefasst (Owner-Lesart 13.11.2026):** „Zertifiziert“ heißt methodisch geprüft – nachvollziehbar rückwärts gerechnet und die für die Art zulässigen Robustheitsprüfungen bestanden (`quant/methodology/backtest-method-certification-v1.json`, Status je Art in `backtest-research-v1.json` → `certification`), nicht profitabel; der bisherige Prüfstand `backtest-certification-v1.json` bleibt unverändert als „Vorwärts-Nachweis“ und liefert harte Gates und Offenlegungen. Stand 13.11.: 5 von 6 Arten zertifiziert, Setup eingeschränkt (Rekonstruktion ist kein Beleg auf späteren Testfenstern).

**Lücken der Arten, die noch Daten sammeln (geprüft 13.11.2026):**
- *Profil-Strategie* (`strategy-profile-prepared`): Historische Faktorstände je Stichtag liegen im privaten V10-PIT-Panel (monatliche Rangtage, R2) und lassen sich als `factorSnapshots` an `buildProfileTargets` geben. Zwei Dinge fehlen trotzdem: (1) `research-portfolio` lässt Profil-Ziele nur mit beobachteter Herkunft zu (Gesamtrendite, Identitäts-, Bestands-, Kapitalmaßnahmen-, Lebenslauf- und Lizenz-Nachweis); das TR-Register deckt 8 Titel ab, 2016–2018 lückenlos nur IBM, JPM, MSFT, WMT. (2) Mit TR-Register bricht monatliches Umschichten an `DECISION_BEFORE_EVENT_INFORMATION` ab (Probe: JPM-Dividende 06.01.2017, Entscheidung 30.12.2016), weil die Ereigniszeitpunkte des Registers nach der Entscheidung liegen. Nächster Schritt ist ein eigener PR zu Fachmodell und Register (Ereignis-Bekanntgabezeitpunkte, breiteres TR-Register), nicht der Runner.
- *Setup*: späterer Testfenster-Beleg erst messbar ab 2028-01-08 (A1–A6); keine delisteten Titel.
- *Faktor-Rang*: Panel hält nur `ref_`-Listings (keine delisteten); Revisions-Faktor ohne lizenzierte PIT-Konsensquelle nicht rekonstruierbar; Vollpopulation sprengt das Rechenbudget der Fensterreinigung (Stichprobe 250 Titel).

| Art | Was sie rechnet | Echte historische Ergebnisse heute | Zertifizierung | Einschränkung |
|---|---|---|---|---|
| SAME_STOCK_REPLAY | feste Regel auf einer Aktie oder echter Wochen-Ledger | ja (Katalog A) | LIMITED | genau ein Listing; Ledger ohne delistete Titel |
| PATTERN_EVIDENCE | Musterereignisse gegen Kontrollen vom selben Datum | ja (A) | LIMITED | keine zertifizierte Renditebasis |
| SIGNAL_BACKTEST | fünf Signalregeln je Ereignis, optional finanziert | ja (A) | LIMITED | finanziert: im Fenster delistete Titel fallen heraus |
| SETUP_BACKTEST | auf rekonstruierten Setup-Ständen | ja (A, Nachweisart Rekonstruktion) | COLLECTING_HISTORY | Setup-OOS nicht messbar (A1–A6 entschieden 04.11.2026, messbar frühestens um 2028-01-08); keine delisteten Titel |
| STRATEGY_BACKTEST | Portfolio mit festen Gewichten oder Dividenden-TR | ja (A); Profil-Variante B | COLLECTING_HISTORY | Profil: Faktorstände je Stichtag gibt es (V10-Panel), es fehlen beobachtete Gesamtrendite und Ereigniszeitpunkte (siehe Lücken unten) |
| FACTOR_RANKING_BACKTEST | Faktorstudie auf dem privaten V10-PIT-Panel | ja (A, nur mit privatem Panel) | COLLECTING_HISTORY | nur `ref_`-Listings; frühestens 2028 zertifizierbar |

**Zusatzmethoden:**

| Methode | Arten | Wirkung |
|---|---|---|
| MONTE_CARLO | Replay, Strategie, Signal | Block-Bootstrap bzw. Trade-Resampling |
| WALK_FORWARD, OUT_OF_SAMPLE | alle außer Strategie | Faltung ohne Anpassung; Setup-OOS `NOT_RUN` |
| MARKET_REGIME | alle | Trend- und Volatilitätsregime gegen SPY |
| PARAMETER_SENSITIVITY | Replay, Pattern, Signal, Strategie | registriertes Raster |
| EVENT_DRIVEN | alle | Ereignisstudie (Quelle: TR-Dividendenregister) |
| PORTFOLIO_REBALANCING | Strategie, Signal | finanzierter Ledger |

### A4. Grundsätzliche Grenzen (gelten weiter)

- **0/6 Arten zertifiziert.** Kein Ergebnis darf als zertifiziert oder als Handelsempfehlung erscheinen.
- **Forschungsbefund V10–V13c:** kein robuster Überschuss gegen SPY nach Holm-Korrektur (siehe B5).
- **Delistete Titel:** Ereignisse nach dem letzten Handelstag werden zensiert. Weder ein Totalverlust noch ein Abfindungswert wird angesetzt.

---

## B. Daten und Forschung

### B1. Datenanbieter und Nutzungsrechte (ERLEDIGT)

- **Tiingo**, kommerzielle Lizenz (Owner-Erklärungen 13.09. und 31.10.2026, `quant/config/provider-profiles.json`, `docs/data/TIINGO_LICENSE_REVIEW.md` 2.0):
  - gedeckt: Berechnung, öffentliche Anzeige von Kursen und Charts, Veröffentlichung abgeleiteter Kennzahlen und Backtests, delistete Kurse aus den Archiven;
  - **nicht** belegt: herunterladbare Rohdatensätze;
  - KI-Nutzung: unbekannt.
- **SEC EDGAR:** öffentlich und frei (Fundamentaldaten, Firmennamen, CIK).
- **Twelve Data:** Free. Sharadar, Intrinio, EODHD, FMP und Polygon sind nur recherchiert, nicht angebunden.

### B2. Security Master und Generationen

| Generation | Status | Datei | Bindung |
|---|---|---|---|
| `us-security-master-1.1.0` (`26c82617…`) | **ERLEDIGT**: produktiv und eingefroren | Produkt `quant/data/market/security-master/us-security-master.json`, Kopie `quant/frozen/security-master/us-security-master-1.1.0.json` (gleicher Git-Blob) | V7–V13c, Demos, Katalog-Generation 1, Vorschau-Bundle |
| `us-security-master-1.3.0` | **BLOCKIERT**: Owner-Freigabe | erst nach dem produktiven Lauf | neue Research-Generationen, nur ausdrücklich |

- **Register** `quant/config/security-master-generations.json`, Auflösung über `quant/engines/security-master-generation.cjs` (fail closed). Tests MG-1…6, SMF, MCH.
- Research-Loader mit Evidenz-Optionen lesen immer 1.1.0. Der Produkt-Adapter (`weekly-real-adapter.cjs`) bleibt bytegleich und liest den Produktstamm.
- **Aufholungslauf 11.11.2026:** Der Stamm stand seit 04.11. (Anbieterbewegung über G7); die Freigabeliste `docs/data/security-master/refresh-approved-changes-2026-11-11.json` (Erzeuger `build-security-master-approval-list.mjs`) nimmt 389 Deaktivierungen und 235 Eignungswechsel auf, 3 Titel (TCGL, WBD, REE) waren zunächst nicht von der Gate-Zählung ausgenommen und sind nachgeprüft (WBD vollständig belegt, REE und TCGL nur noch im Freiverkehr, kein Gegenbeleg; Stand `refresh-hold-2026-11-11.json`). „Zurückgehalten“ heißt nur: nicht aus der Zählung genommen, die Deaktivierung steht im Stamm. Regel: ein konstanter fortgeschriebener Anbieterkurs nach dem Ende ist Anbieter-Fortschreibung und kein Handel, nur eine sich bewegende Reihe blockiert (gleich im SEC-Delisting-Register); Dispatch `security-master-weekly.yml` mit `freigabe=<Datei>`.
- **V10 und INM (11.11.2026):** Der Anbieter hat im Stamm-Lauf (Commit 39f2075) die inaktive Altzeile `tiingo:NASDAQ:INM:2020-11-12` fallen lassen (`HISTORICAL_ROW_DROPPED`), INM hat damit im Produktstamm nur noch eine Zeile und ist nicht mehr mehrdeutig. `quant/tests/v10-population.test.mjs` führt dafür eine ausdrückliche Ausnahmeliste (`AMBIGUITY_RESOLVED`, genau `ref_INM`); der V10-Satz bleibt unverändert und ist bei der nächsten V10-Überarbeitung als „aufgelöst“ zu bewerten.
- Gate, Freigabeliste und Ablauf stehen in `docs/data/SECURITY_MASTER_WEEKLY.md`, `docs/data/security-master/SECURITY_MASTER_GENERATIONS.md` und in der Freigabevorlage (PR #1240).

### B3. PIT-Identitäten, Survivorship, Delistings, Kapitalmaßnahmen (ERLEDIGT)

- **Identität** nur über `core/identity.js` (ADR-001): `securityId` `ref_<TICKER>`, `instrumentId`, `issuerId`.
- **Ticker-Wiederverwendung:** `quant/config/ticker-reuse-quarantine.json` mit 13 Titeln, unter denen heute ein ETF handelt.
  - Sie sind in Discover, Screener, Supertrader, Quant (Verzeichnis, Faktoren, Radar, Suche), Technical und Watchlist ohne alte Identität.
  - Gespeicherte Watchlist-Einträge werden nie nach Ticker neu zugeordnet.
  - EDVA wird als Umfirmierung geführt (Register `security-master-duplicate-resolution.json`).
- **Evidenz-Register** im Research-Loader: Identität (V10/V12/V13), Kapitalmaßnahmen (`research-ca-evidence.cjs`), Lebenszyklus.
- **Eine Preiswahrheit** (ADR-002): Split-Faktoren aus `return-series.js#splitFactors`.
- **Delistete Titel** (`docs/archiv/quant/BACKTEST_DELISTED_INTEGRATION.md`):
  - Register `v13/delisted/register-1.0.0.json` mit 1.675 QUALIFIED, `v13b/hist/register-1.1.0.json` mit 1.688;
  - Reihen hashgebunden im privaten Archiv;
  - Profile `V13_DELISTED_F1`, `F1C`, `V13B_DELISTED_F1W`;
  - Schritte D1–D7 sind LANGFRISTIG.

### B4. Historische Populationen und Abdeckung

- **Profile** in `scripts/quant/research/research-population.cjs`: `PRODUCT_DEFAULT` (Produktstamm) sowie V10_PRIMARY bis V13B (1.1.0).
- **Abdeckung je Lauf** steht im Ergebnis: `population`, `dataQuality.coverage`, `inputHashes`.

- **Deckungskennzahlen, Neuabnahme 06.11.2026:** Produkttitel 6.686 → 6.308, darstellbar 6.683 → 6.305, technisch bereit 5.644 → 5.655 (R2-Reihen 7.802 unverändert); jede Abweichung je Titel erklärt (`coverage-delta.mjs`, Lauf 42201411281). Entscheidung Steuerung 06.11. nach dokumentierter Empfehlung: Grenzfälle der 300-Bar-Schwelle zählen über den letzten Datentag der Messung (aus der Messung abgeleitet, hier 06.10.2026), nicht über den Stichtag. Konstanten in `scripts/quant/tests/test_canonical_market.py#ABGENOMMEN`.

### B5. Forschungsergebnisse V10–V13c (ERLEDIGT, nicht wiederholen)

| Studie | Befund |
|---|---|
| V10 (`docs/quant-recovery/BACKTEST_V10_FINAL.md`) | Daten und Studien erweitert, 0/6 zertifiziert |
| V11 (`ALPHA_DISCOVERY_V11.md`) | keine robuste Kante über SPY nach Holm |
| V12 (`DATA_QUALITY_V12_FINAL.md`) | frühere Überrendite war ein Survivorship- und Gleichgewichtungseffekt |
| V13 (`DATA_QUALITY_V13_FINAL.md`) | Delistings ab 2010 ändern die Ergebnisse um Zehntelprozentpunkte |
| V13b / V13c (`HANDOVER_V13.md` §10.4) | Hauptergebnisse unverändert; 0 SPY-Zellen signifikant |

Alle Ergebnisse unter `docs/quant-recovery/**` sind eingefroren (Freeze-Manifest `docs/data/security-master/v130-quant-freeze.json`, Test SMF-1).

### B6. Privates V13-Archiv

Siehe **Abschnitt F**: Stand der Archivgeneration und Wiederherstellung.

---

## C. Technik

### C1. Runner und Ergebnisvertrag (ERLEDIGT)

- **Runner:** `scripts/quant/research/backtest-runner.cjs` (backtest-runner-1.0.0). Spec `backtest-runner-spec-1.0.0`, Ergebnis `backtest-runner-result-1.0.0`.
- **Umschlag:** `backtest-result-2.0.0` (`quant/engines/backtest-result-contract.cjs`, Doku `docs/quant/BACKTEST_RESULT_CONTRACT_V2.md`, `BACKTEST_RUNNER.md`).
- **Unabhängige Gegenrechnung:** `scripts/quant/verify-backtest-runner.py`.
- **Zertifizierung:** `scripts/quant/build-backtest-certification.mjs` → `quant/data/product/backtest-certification-v1.json`, geprüft von `quant/engines/backtest-certification.js`.

### C2. Katalog und Vorschau

- **Katalog-Generation 1** (`docs/quant/backtest-catalog/`, ERLEDIGT):
  - 21 Auswahlen: 20 im Zustand A, 1 im Zustand B; alle `NOT_CERTIFIED`;
  - `catalogHash` `7ea6383e…`, an 1.1.0 gebunden;
  - Python-Gegenrechnung 560.140/0;
  - wird nie überschrieben und mischt keine Generationen.
- **Spec-Builder:** `scripts/quant/research/backtest-spec-builder.cjs` (Vorlagen, Kostenvorgaben, sichere Fehlercodes).
- **Demos:** `docs/quant/backtest-demos/` (16 Fälle). Aktualitätswächter `check-backtest-demo-freshness.cjs --strict` in Quant CI.
- **Vorschau-Bundle:** `scripts/quant/research/export-backtest-review-bundle.cjs --check`, `bundleHash` `aefb5942…`.
  - Nach jedem Neubau von Demos oder Lesemodell wird das Bundle im selben PR neu exportiert.
- **Abnahmeprotokoll:** `scripts/account/backtest-review-acceptance.mjs` (61 Prüfungen).

### C3. Wichtige Workflows und Secrets (nur Namen)

| Workflow | Auslöser | Zweck | Secrets |
|---|---|---|---|
| `quant-ci.yml` | Push/PR auf Quant-Pfade | Tests, Demo-Aktualität | `TIINGO_API_KEY`, `VU_HISTORY_S3_*` |
| `research.yml (Teil v13-archiv, vormals quant-v13-archive.yml)` | Commit-Marke `[v13-archive:<modus>]` | privates Archiv (put/get/verify/keycheck/restore/demos/catalog …) | `V13_ARCHIVE_PRIVATE_KEY`, `VU_HISTORY_S3_*` |
| `security-master-weekly.yml` | nur manuell | Stamm-Neubau, Gate, optional Commit | – |
| `market-data-refresh.yml` | täglich 22:30 UTC, manuell | Kurse, Faktoren, Discover, Nachtkette (Technical, Supertrader, Im Blick) | `TIINGO_API_KEY`, `VU_HISTORY_S3_*` |
| `long-series.yml` | Zeitplan, manuell | lange Wochenreihen | `VU_HISTORY_S3_*` |
| `technical-world.yml` | Nachtkette, Rückfall-Zeitplan, manuell | Technical-Screener | – |
| `product-intelligence-materialization.yml` | Nachtkette | Setup-/Signal-Backtests, Zertifizierung, Evidenz | – |
| `account-ci.yml`, `account-production-auto.yml` | `konto/**`, `workers/vu-account/**` | Tests, Browser-QA; automatisches Ausrollen von Worker und Migrationen nach `main` | `VU_ACCOUNT_SUPABASE_*` u. a. |
| `pages-release.yml` | nach `main` | Auslieferung; schließt `workers/*/data/`, `docs/`, `scripts/` aus | – |

### C4. Integrität, Freeze, Reproduzierbarkeit

- **Freeze und Generationen:** `security-master-v130-freeze` (SMF-1…7), `security-master-generations` (MG-1…6), `security-master-content-hash` (MCH).
- **Katalog und Vorschau:** `backtest-catalog`, `backtest-preview`, `backtest-review-bundle`, `workers/vu-account/tests/backtests.test.mjs`, `konto/tests/backtest-review.test.mjs`.
- **UI-Sperre:** `backtest-consolidation-boundary` und `ui-protection-revisions` (UIP-1/2, nach #1236).
- **Isolation:** `node scripts/quality/check-test-isolation.mjs`.
- **Volle Suiten:** siehe `CLAUDE.md`. Stand `main` am 02.11.: Quant 3857/0, Core 308/0, Technical 61/0, Discover grün nach #1239.

### C5. Offene PRs

Liste mit Abhängigkeiten in `quant-handover.json` (`openPullRequests`). Wichtig:
- **#1227** Aktivierung der Vorschau: nur nach Owner-Freigabe.
- **#1242** iPhone-Layout der Vorschau: empfohlen vor dem Praxistest.
- **#1236** NVDA-Browser-QA mit versionierter UI-Sperre.
- **#1240** Freigabevorlage 1.3.0.
- Archiv-Generation 2: siehe F.
- **#1119** Statuskorrekturen: erst nach 1.3.0.
- **#1203** Sitzungsübergaben.
- Supertrader-PRs (`*-jnejw3`): gehören dem bisherigen Supertrader-Chat, nicht überschreiben.

---

## D. Produktintegration

**Direkt integrierbar, über bestehende Schnittstellen:**
1. **Backtest-Ergebnisse auf `#/backtest`:**
   - Weg: Research-Adapter (`quant/api/backtest-research-adapter.js`) bzw. Vorschau-Dienst, Ergebnisvertrag v2.
   - Daten: Katalog (vorgerechnet, hashgebunden).
   - Darstellung: `QXBacktest` und `QXEvidence` aus `quant/app/page-backtest.js` und `page-evidence.js`.
   - Hürde: Diese Dateien sind byte-gesperrt. Änderungen nur als eigener PR mit Owner-Freigabe und einer Revision in `docs/quality/ui-protection-revisions.json`.
2. **Die interne Vorschau** ist der Probelauf dieser Integration; dieselben Daten und dieselbe Darstellung der Nachweisart.

**Noch Daten oder Entwicklung nötig:**
- Zertifizierung je Art (Gates in `backtest-certification.js`): Setup-OOS-Segmentierung A1–A6 entschieden 04.11.2026 (Zeit bis etwa 2028-01), Faktor-Historie bis frühestens 2028.
- Delistete Titel in finanzierten Signal- und Strategie-Läufen (D4, D5) sowie im Faktorpanel (D7).
- Rechnen auf Abruf: heute nicht vorhanden. Alles nicht Vorgerechnete heißt „nicht vorgerechnet“.

**Für eine öffentliche Produktfreigabe tatsächlich erforderlich:**
1. Owner-Praxistest der Vorschau (Abschnitt G).
2. Entscheidung, welche Arten mit welcher Kennzeichnung öffentlich sichtbar werden. Ohne Zertifizierung nur als „Forschung, nicht zertifiziert“, wie in der Vorschau.
3. UI-Integration in `#/backtest` (gesperrte Dateien, eigener PR mit Revision).
4. Lizenz: Für abgeleitete Ergebnisse ist sie gedeckt; Rohdaten-Downloads sind ausgeschlossen.
5. Eigene Owner-Freigabe der Veröffentlichung.

---

## E. Offene Entscheidungen des Owners

| Entscheidung | Stand | Vorbereitung |
|---|---|---|
| Security Master 1.3.0 produktiv | BLOCKIERT, Freigabe nötig | #1240; Arbeitspaket H1 |
| V13-Archivgeneration 2.0.0 übernehmen (#1241), Leser umstellen, danach Löschung von 1.2.0 | BLOCKIERT, Freigabe nötig | F |
| Interne Aktivierung der Vorschau | BLOCKIERT, Freigabe nötig | #1227, Abschnitt G |
| Öffentliche Backtesting-Integration | LANGFRISTIG, nach Praxistest | D |
| Setup-OOS A1–A6 | ENTSCHIEDEN 04.11.2026, umgesetzt (methodology 1.1.0) | `docs/quant/SETUP_OOS_DECISION_A1_A6.md`, `SETUP_OOS_EVALUATION.md` |
| #1119 (132 SEC-Statuskorrekturen) | zurückgestellt bis nach 1.3.0 | – |
| #1236 merge, #1242 merge | Freigabe nötig | geprüft |
| SF8-Tageslauf einschalten | Supertrader-Welt | – |

**Produktfremde Fehler (nicht Quant, für die zentrale Koordination):**
- **Discover Frontend Quality Gates**, rot seit 30.10.:
  - `browser-qa-direct`: Die Europa-Route Rheinmetall (`/discover/#/s/EUROPE/ref_RHM_DE_XETR`) zeigt „Europa noch nicht verfügbar“. Zu klären ist, ob Europa bewusst gesperrt ist (dann ist die QA-Erwartung veraltet) oder ob ein Datenfehler vorliegt.
  - WebKit 390 dark: „Range context missing“.
- **Supertrader Production Smoke:** Research-Kandidaten ohne veröffentlichten Stand.
- **Social CI:** rot seit 30.10.

---

## F. Privates V13-Archiv: Generation und Wiederherstellung

**Befund (02.11.2026):** Die frühere Schlüsselerzeugung (`openssl rand -out … 32` und `-pass file:`) kürzte die Passphrase am ersten `\n` bzw. NUL. Die Erzeugung für neue Archive ist seit #1238 auf `main` behoben (Hex-Passphrase).

**Schlüsselprüfung aller Teile** (Läufe 41398544194 und 41399813949). Ausgegeben wurden nur Längen, nie Schlüsselbytes.

| Generation | in R2 | Teile | schwach (< 32 B) | betroffen |
|---|---|---:|---:|---|
| 1.0.0 | nie hochgeladen | 6 | 1 | v13b-hist (3 B) |
| 1.1.0 | nie hochgeladen | 7 | 2 | v13b-hist (31 B), v13b-f1w (16 B) |
| **1.2.0** | **ja**, aktuell gelesen | 8 | 1 | v13-raw (18 B, also 144 Bit) |
| **2.0.0** | **ja**, neu | 8 | **0** | alle 64 Zeichen |

Kein hochgeladener Teil hatte je eine leere Passphrase.

**Neue Generation 2.0.0** (PR **#1241**, nicht gemergt):
- **Erzeugung, Lauf 41398712451:**
  - 1.2.0 aus R2 wiederhergestellt und jede Datei gegen Manifest 1.2.0 geprüft;
  - mit Hex-Schlüsseln neu verschlüsselt (`seal-part.sh` mit Rundlaufprüfung);
  - nur unter dem neuen Präfix `research-snapshots/quant-v13/archive-2.0.0/` hochgeladen;
  - vor jedem Upload per HEAD geprüft, ob das Objekt existiert, dann Abbruch. Kein Objekt wurde überschrieben, der alte Präfix nur gelesen.
- **Unabhängige Wiederherstellung, Lauf 41399476800**, auf einem anderen Runner:
  - 8/8 Teile, 11.616 Dateien;
  - bytegleich zum Inhalt von 1.2.0;
  - alle Schlüssel 64 Zeichen.
- **Manifest:** `docs/quant-recovery/v13-archive-gen2/manifest-2.0.0.json`, in einem neuen Verzeichnis, weil SMF-1 neue Dateien in eingefrorenen Verzeichnissen verbietet.
- **Secrets:** nur die vorhandenen Namen (`V13_ARCHIVE_PRIVATE_KEY`, `VU_HISTORY_S3_*`). Es sind keine neuen Schlüssel oder Rechte nötig.

**Alte Generation 1.2.0 bleibt unverändert erhalten.** Für eine spätere Löschung sind nötig:
1. #1241 mergen;
2. die Lesemodi (`restore`, `demos`, `catalog`) in einem eigenen PR auf 2.0.0 umstellen und prüfen;
3. die Owner-Entscheidung zur Löschung, als eigener Schritt; der Speichertreiber blockiert Löschungen.

**Speicher:** Der Bucket liegt bei etwa 7,78 GB von 8 GB kostenfrei. Eine weitere vollständige Generation passt erst nach der Löschung von 1.2.0.

**Wiederherstellungsweg:** Commit-Marke `[v13-archive:get|restore]` bzw. `[v13-archive:verify2]` für 2.0.0, siehe `docs/quant-recovery/v13/archive/README.md`. Der private Schlüssel liegt nur im Actions-Secret `V13_ARCHIVE_PRIVATE_KEY`.

---

## G. Praxistest der Backtesting-Vorschau (Owner)

**Stand 02.11.: technisch vollständig vorbereitet.**

**Echter Browserdurchgang aller 21 Auswahlen** auf Desktop (1440 px) und iPhone (390 px) in der lokalen Simulation:
- Alle sechs Arten werden dargestellt.
- Jede Auswahl zeigt ihre Nachweisart: Studie, Simulation, Rekonstruktion bzw. „Nicht gerechnet“ für den Zustand B.
- Abschnitte je Ergebnis: Rendite, Risiko und Drawdown, Kosten, Benchmark, Datenqualität und Abdeckung, historische Population, Einschränkungen, Grenzen, Zertifizierung.
- Überall „nicht zertifiziert“, nirgends eine Zertifizierungsbehauptung.
- „nicht vorgerechnet“ für andere Kombinationen.
- Ohne Rolle gesperrt, ohne Daten.
- Desktop: keine Konsolenfehler, kein seitliches Scrollen.
- **iPhone-Befund:** Lange Codes verbreiterten die Seite. Behoben in **#1242**, die Prüfung ist jetzt Teil der Browser-QA.

**Zugang:** live geprüft.
- Worker 404 ohne Schalter, auch mit gefälschtem Token; fremde Herkunft 403; `no-store`.
- Bundle über Pages nicht erreichbar (404).
- Seite `noindex` und nicht verlinkt.

**Einfachster sicherer Weg zum Praxistest (nach Owner-Freigabe):**
1. #1242 mergen.
2. Ein eigenes Prüfkonto registrieren und bestätigen (nicht das Konto mit `pricing_admin`).
3. Rolle `backtest_reviewer` per SQL nur für dieses Konto vergeben (`docs/accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md` in #1227).
4. #1227 mergen. Der Worker wird automatisch ausgerollt.
5. Auf iPhone und Desktop `https://research.visionuniverse.de/konto/admin/backtests/` öffnen und die Prüfliste in #1227, Abschnitt 7, durchgehen.
6. Danach die Rolle entziehen oder den Schalter per PR zurücksetzen.

Eine zweite Engine oder Anwendung gibt es nicht. Die Seite liest nur den hashgebundenen Katalog.

---

## H. Arbeitspakete für den zentralen Entwicklungs-Chat

| Nr. | Paket | Voraussetzung | Ausführbar |
|---|---|---|---|
| H1 | **Security Master 1.3.0** am selben Tag: Probelauf (`commit=false`), Freigabeliste neu erzeugen, Gate lokal, volle Suiten auf dem Folgestand mit Discover-Neubau, Owner-Freigabe, `commit=true`, sofort Marktdaten-Lauf, Generation 1.3.0 eintragen (Pin-Skript), Nachprüfung | Owner-Datum | ja, Schritte in #1240 |
| H2 | Interne Aktivierung und Praxistest | Owner-Freigabe | ja, G |
| H3 | Archivgeneration 2.0.0: #1241 mergen, Leser umstellen, dann Löschentscheidung 1.2.0 | Owner-Freigabe | ja, F |
| H4 | Öffentliche Backtest-Integration in `#/backtest` | Praxistest, Owner-Freigabe, UI-Revision | Planung |
| H5 | Setup-OOS A1–A6 umsetzen | erledigt 04.11.2026 | |
| H6 | #1119 nach 1.3.0 | H1 | |
| H7 | Katalog-Generation 2 gegen 1.3.0 (neues Verzeichnis) | H1 | optional |

**Zuständig für H1–H7:** der zentrale Claude-Code-Chat. Jede Ausführung braucht weiterhin die ausdrückliche Owner-Freigabe; eine Freigabe für ein Paket erweitert nicht den Scope eines anderen.

**Offene Quant-PRs als Folgearbeiten:**

| PR | Inhalt | gehört zu | Zustand |
|---|---|---|---|
| #1227 | Aktivierung der internen Vorschau (Schalter Produktion, Testkonto, Prüfliste) | H2 | Draft, nur nach Owner-Freigabe |
| #1242 | iPhone-Layout der Vorschau, Browser-QA mobil mit Ergebnis | H2, vor #1227 | bereit, Owner-Freigabe |
| #1236 | NVDA-Browser-QA, versionierte UI-Sperre (Basis eingefroren) | Qualität | bereit, Owner-Freigabe |
| #1240 | Freigabevorlage Security Master 1.3.0 (Liste am Lauftag neu) | H1 | Draft, Owner-Datum |
| #1241 | V13-Archiv Generation 2.0.0 (Prüfung, neue Generation, unabhängige Wiederherstellung) | H3 | Draft, Owner-Freigabe |
| #1119 | SEC-Delisting-Regel, nachgebessert (11.11.): QRTEB/TRINL (Emittenten- statt Klassenbeleg), FITBI (Börsenwechsel), SHLT (Kurse nach Delisting) an den Quelldaten bestätigt; Register jetzt 0 statt 133 Einträge, kein INACTIVE aus der SEC-Regel; die 132 Statuskorrekturen entfallen | H6 | Code und Register in eigenem PR; Stamm-Übernahme weiter nach H1 |
| #1203 | Sitzungsübergaben 3.0.0–5.0.0 (historisch) | – | optional, nur Doku |

**Arbeitsstände, die nie verloren gehen dürfen:**
- `docs/quant-recovery/**`: eingefrorene Forschung.
- `quant/frozen/` und `quant/config/security-master-generations.json`.
- `docs/quant/backtest-catalog/`.
- Die Archiv-Manifeste unter `docs/quant-recovery/v13/archive/`.
- Die offenen PRs aus C5 und aus `quant-handover.json`.
- Das R2-Archiv (privat, nur mit `V13_ARCHIVE_PRIVATE_KEY` lesbar).

---

## Master Completion 3.0 (Stand 02.11.2026)

Teil Quant Q1/Q2, umgesetzt vom zentralen Claude-Code-Chat ohne Änderung an Gates, Schwellen, Strategien, Security Master, eingefrorenen Daten, gesperrter UI oder `quant/data/**`.
- **Q1 Coverage-Matrix:** [BACKTEST_COVERAGE_MATRIX.md](BACKTEST_COVERAGE_MATRIX.md), erzeugt von `scripts/quant/research/backtest-coverage-matrix.cjs` (6 Arten × 7 Methoden, 21 Katalog-Auswahlen, Gates mit Lösungsweg je Art, Abdeckung, nicht unterstützte Fälle, PIT-Historien, Freigabevorlagen FV-1 bis FV-8). Test `quant/tests/backtest-coverage-matrix.test.mjs` erzwingt `--check`. Befund: 0/6 zertifiziert.
- **P0.5:** `run-backtest.cjs --help`; Ausgabe wird vor dem Schreiben gegen den Ergebnisvertrag geprüft, fail closed.
- **P0.7:** laufzeitfreier Kennzahlen-Hash `scripts/quant/research/backtest-metrics-hash.cjs`; Runner, Demos, Katalog und Bundle bytegleich (`check-backtest-demo-freshness.cjs --strict` CURRENT, Bundle `aefb5942…` unverändert). Runner-Feld: FV-2.
- **P2.1/P2.2:** `scripts/quant/research/pit-snapshot-integrity.cjs --out`: Integrität PASS; frühestens Strategy/Factor 2028-08, Setup 2028-04 (FV-1).
- **Gegenrechnung:** 16 öffentliche Katalogfälle lokal neu gerechnet, Python 16.451 Prüfungen/0 Abweichungen, Kennzahlen 16/16 gleich. Die 5 privaten Fälle brauchen das R2-Archiv (FV-4).

## Master Completion 3.1 (Stand 02.11.2026): P2 Zertifizierungsdefizite

Bericht, Freigabe-Runbooks und FV-1-Analyse: [BACKTEST_P2_DEFIZITE.md](../archiv/quant/BACKTEST_P2_DEFIZITE.md). Keine Änderung an Gates, Schwellen, Runner (`CODE_FILES`), Security Master, `quant/data/**`, eingefrorenen Ständen oder gesperrter UI. Zahlen nur als Research unter `docs/quant/research/`, nicht im Produkt.
- **P3.1:** `scripts/quant/research/survivorship-sensitivity.cjs` (F0 gegen F1 über den unveränderten Runner, gleiche Stichprobe). Der committete Bericht ist `PREPARED_PRIVATE_INPUT_MISSING`, weil die Reihen nur im R2-Archiv liegen. Lauf mit Secret: Runbook R2.
- **P4.1:** `scripts/quant/research/pattern-total-return.mjs` (Gesamtrendite `canonical-total-return-1.0.0` neben Kursrendite, Parität mit dem Runner). Research auf der Golden-Preview: 4/5 Titel, 62 Ereignispaare, Ausschüttungen im Mittel +0,75 Pp je 13-Wochen-Ereignis. Das Gate `returnBasis` liest den Bericht nicht (P4.2, FV-5).
- **FV-4:** `catalog-private-recheck.cjs` (Erwartung der 5 privaten Fälle, Auswertung des Laufartefakts, Abbruchkriterien); `[v13-archive:catalog]` nicht ausgeführt.
- **FV-1:** `setup-independence-readings.cjs`. Unter Lesart A (Monate) ist Setup frühestens 2028-04 möglich, unter B (ISO-Wochen) 2027-03-26. Empfehlung: A beibehalten und das Feld umbenennen, Unabhängigkeit über N_eff als eigene Entscheidung, B nicht.
- **FV-8:** `pit-snapshot-integrity.cjs --fail-on-missing-month --alarm-detail`. Offen ist nur der Workflow-Schritt.
- **Coverage-Matrix** neu gebaut, mit Abschnitt I (Research-Nachweise) und einer Spalte „Research-Nachweis“. Befund unverändert 0/6. Pattern hat jetzt 0 „heute technisch“ und 3 Owner-Blocker.

## PIT-, Identitäts- und Provenienzvertrag (Strang U, Teil 1, 10.11.2026)

Reine Schattenprüfung, Forschung, nicht zertifiziert. Keine Änderung an Engines, Scores, Strategien, Golden-Hashes oder Forschungssperren; keine Holdout-Läufe, keine Anbieterabfragen. Gepinnt in `quant/tests/pit-contract.test.mjs` (18 Vertragsfälle PIT-01…18, drei Befund-Tests PIT-F1…F3, nur synthetische Fixtures). Prüfregel in jedem Fall: eine nur künftige Information verändert keine frühere Entscheidung.

**Vertragsmatrix.** Evidenzklasse: B = belegt (Quelle trägt den Zeitpunkt), R = rekonstruiert (aus Belegen abgeleitet), A = angenommen (Modellregel ohne Beleg).

| Modul | Sichtbar, wenn | effectiveAt | knownAt | observedAt | Listing-Intervall | Herkunft | Evidenz |
|---|---|---|---|---|---|---|---|
| `quant/engines/pit-fundamental-history.js` | `filed <= asOf` (Stichtag **inklusive**), je Geschäftsjahr die jüngste Einreichung ≤ asOf | Geschäftsjahresende (`end`) | Einreichungsdatum `filed` (nur Tag, keine Uhrzeit) | keines | keines | SEC-Consumer-Bundle `annual` | B (filed), A (Tagesgranularität) |
| `quant/engines/portfolio-pit-factors.cjs` | `filed < Entscheidungstag` (asOf = Vortag, **strikt davor**); Frische ≤ 548 Tage | wie oben | wie oben, um einen Tag konservativ | keines | keines | PIT-Modul + Panel-Rohschluss | R (Rekonstruktion, nicht Live-Evidenz) |
| `core/industry-classification.js` | `knownAt <= cutoff`; Datum-asOf endet 16:00 ET (DST ab 1987 kodiert), asOf mit Zeit exakt | nicht belegt (`validFrom/validTo = null`) | frühester belegter öffentlicher Zeitpunkt (UTC, mit Präzision) | `datasetObservedThrough` | über `resolveIssuer` (`validFrom/validTo` je Kandidat) | SEC FSDS/Filing-Header, je CIK | B (Beobachtung), A (Fortschreibung, deklarationspflichtig) |
| `core/identity.js` | nie zeitabhängig | keines | keines | keines | **keines**: `securityId = ref_<TICKER>` | Ticker | A (Ticker ist kein stabiler Schlüssel) |
| `portfolio-backtest.cjs#decide` | Kurs zu t, Historie ≥ riskWindow, `terminal.lastIdx >= t`, Branche gesetzt | Wochenschluss t | Wochenschluss t | keines | `terminal`/erste Beobachtung des Panels | Panel (heutige Dateimenge + V13-Ketten) | R/A |

Lesart der Abweichung „inklusive“ gegen „strikt“: Das PIT-Modul liest am Einreichungstag, die Portfolio-Faktoren erst am Folgetag. Das ist keine Verletzung, sondern eine konservative Variante (Uhrzeit der Einreichung ist im Bundle nicht belegt; `core/industry-classification.js` kennt sie und würde dasselbe Filing am selben Handelstag vor 16:00 ET sehen).

**Befunde (nur gemeldet, nichts repariert; Fachmodell-Änderung = eigener PR mit Vorher/Nachher).**

| ID | Befund | Wirkung | Einordnung |
|---|---|---|---|
| PIT-F1 | **Behoben (11.11.2026, `pit-fundamental-history-1.1.0`).** `visibleAnnual` löste zwei Einreichungen desselben Geschäftsjahres am selben `filed`-Tag nach Eingabereihenfolge auf. Jetzt feste Ordnung: späterer `filed`-Tag, dann lexikografisch größere `accn`, dann größerer Wert. | Vorher/Nachher auf den 5262 Consumer-Bündeln (833.516 Jahreszeilen): 0 Gleichstände, 0 abweichende Werte, also keine Faktor- oder Golden-Hash-Wirkung; nur synthetische oder künftige Eingaben ändern sich (Test PIT-F1). | Determinismus hergestellt, kein Lookahead betroffen. |
| PIT-F2 | **Angeschlossen, opt-in (11.11.2026).** Das Panel trägt optional `sectorAt` (Branche je Woche aus `core/industry-classification.js`, `knownAt <= Wochenschluss 16:00 ET`); `portfolio-backtest.cjs#decide` nimmt `sectorAt[t]` statt der heutigen `sector`. Fortschreibung deklariert: höchstens 1100 Tage (Entscheidung 11.11.2026, `PIT_SECTOR_MAX_AGE_DAYS`); alles außer `OBSERVED` bleibt unbekannt und der Titel fällt an dem Tag heraus. Aktivierung: `buildPanel({ pitSector: true })` bzw. `model-portfolios.cjs --pit-sector`. Ohne Opt-in unverändert (eingefrorene Läufe, Golden-Hashes, Holdout). | Vorher/Nachher auf dem Panel 2012–2026 (5168 Titel, Preisrendite, Stichtage 2013-06, 2017-06, 2021-07, 2025-06; 14.101 Titel-Stichtage): 12.908 gleiche Branche, **503 andere Branche (296 Titel)**, **690 unbekannt**. Scores und Faktoren **unverändert** (die Branche geht nicht ein); Wirkung nur über Zulässigkeit und Branchengrenze: Ø Universum 3117 → 2968 (−4,8 %). Forschungsläufe (Forschung, nicht zertifiziert, RISK_PARITY): quality-compounder CAGR 2,92 % → 2,48 %, MDD −35,2 % → −37,3 %; momentum-leader 0,67 % → 0,89 %, −41,3 % → −39,7 %; garp 2,98 % → 3,13 %, −39,8 % → −39,0 %. | **Entscheidung (Steuerung, 11.11.2026): `pitSector` bleibt opt-in; das Einschalten ist eine Forschungsentscheidung und gehört in den nächsten Research-Lauf, nicht in einen Nebenbei-PR.** Verletzung für `pitSector: true` behoben. Offen: Der Panel-Bau verlangt weiter eine heutige SIC (Titel ohne heutige SIC fehlen im Universum), und die FF12-Zuordnung ist die bestehende. Die Engine-Version bleibt `portfolio-backtest-1.1.0`, weil der Standardpfad unverändert ist. |
| PIT-F3 | **Teilweise umgesetzt, rückwärtskompatibel (11.11.2026, `core-listing-register-1.0.0`).** ADR-001 Ergänzung A1: stabile Entität = Emittent (CIK), Listing = (Emittent, Ticker, von, bis), Übersetzungsregister `createListingRegister` in `core/listing-register.js` (`OK`/`UNKNOWN`/`AMBIGUOUS`), optionales `listing` je Panel-Titel (Kandidatenfilter, Kollisionsprüfung). `securityId`, Shards und Artefaktschlüssel unverändert. | Schattenprüfung (`scripts/quant/pit-listing-shadow.mjs`): 6461 Listings, 6461 aktive `securityId` lösen auf den richtigen Emittenten auf, 0 falsch, 0 mehrdeutig; 613 Emittenten mit mehreren `securityId`; 0 Ticker-Wiederverwendung im heutigen Stamm. Keine Wirkung auf Faktoren oder Golden-Hashes (kein Panel trägt `listing`). | Builder befüllt `listing` opt-in (`--listing`; 5165/5168 Titel, 0,11 % der Titelwochen außerhalb, Ø Universum 3117,0 → 3115,8); Einschalten ist eine Forschungsentscheidung für den nächsten Research-Lauf. Offen (ADR): Panel-Kette über Tickerwechsel (Schatten: 0 Kandidaten im heutigen Panel), Migration der Artefaktschlüssel, vollständige Historie beendeter Titel (Survivorship bleibt `POPULATION_IS_TODAYS_FILES…`). |

Nicht verletzt (durch Test belegt): verspätetes Filing (PIT-01), Restatement (PIT-03/04), Aktienzahl und Frischegrenze (PIT-05), Split nach t (PIT-06; Marktkapitalisierung nimmt den Rohschluss, ADR-002), Filing ohne Datum (PIT-07), SIC-Wechsel und Handelsschluss in Winter- und Sommerzeit (PIT-08/09), Fortschreibung nur deklariert (PIT-11), Delisting nach t (PIT-16), Kurse nach t (PIT-15), Fundamentaldaten nach t im Panel (PIT-17).
## Wochen-Ledger gegen unabhängiges Orakel (Strang U, Teil 2, 10.11.2026)

Reine Schattenprüfung, Forschung, nicht zertifiziert; Engines, Scores und Golden-Hashes unverändert. Das Orakel (`scripts/quant/oracle/ledger_oracle.py`, exakte Bruchrechnung, geschlossene statt bisektierte Lösung der Kostengleichung) buchte 14 synthetische Fälle (W01–W14: Kauf/Halten, Kosten je Seite, Umschichtung, Vollausstieg, Dividende mit Zahltag, Kauf am Ex-Tag, Split 2:1 und 1:5, Split ohne Bestand, Delisting mit Wiedererlös 0,7, Delisting mit Wiederanlage, Dividende ohne Zahltag, Teilinvestition, offene Forderung blockiert Vollinvestition) unabhängig von `research-portfolio.cjs`. Ergebnis: **0 Abweichungen** bei Cash, Equity, Stück, Gebühren, Slippage, Umsatz, Gesamtrendite und Maximum Drawdown (`backtest-metrics.cjs`) bis 1e-9; `UNSETTLED_CASH_NOT_INVESTABLE` stimmt überein. Test: `scripts/quant/tests/test_ledger_oracle.py`. Die Tagesbalken- und Supertrader-Seite samt Abweichungsmatrix, den Befunden U2-F1/F2 und deren Opt-in-Korrektur steht im [Supertrader-Handover](../SUPERTRADER_9_HANDOVER.md) §7.2.

Erlaubte Varianten (kein Fehler): Der halbe Spread wird in `portfolio-backtest.cjs` als proportionaler Abschlag auf den Portfoliowert am Handelstag gebucht; am Handelstag gleicher Wert wie eine Abbuchung je Fill, danach schrumpft der Abschlag auch die Positionen. Differenz = Spread · Positionsertrag / Portfoliowert (bei 10 % Folgerendite und 500 USD Spread auf 1 Mio. USD: 45 USD, 0,45 bp), konservativ. Stops im Wochen-Ledger (`WEEKLY_CLOSE_STOP`) werden auf den Wochenschluss geprüft und zum nächsten Schluss ausgeführt, nie intrawoche; das ist eine andere, bewusst gröbere Semantik als die Tagesbalken-Stops. Der Erlös delisteter Titel ist eine vorregistrierte Annahme je Klasse (`terminalRecovery`).

## Datenstand-Abnahme des Produktuniversums (Strang AK, 13.11.2026)

Entscheidung (Steuerung, 13.11.2026): Die Prüfungen, die die Zahlen des Live-Produktuniversums festschreiben (`scripts/quant/tests/test_canonical_market.py`, sieben Methoden mit `@nur_datenstand`, und der Test der V10-Identitätsbindung gegen den Produktstamm in `quant/tests/v10-population.test.mjs`, Ausnahme `ref_INM`), blockieren keinen Code-PR mehr, weil sie bei jedem Eignungslauf rot wurden (11.11.: drei PRs und main); der Abnahmewert steht in `quant/config/product-universe-acceptance.json`, die Prüfung läuft täglich als Job `abnahme` in `quant-produktionscheck.yml` (`VU_DATENSTAND_ABNAHME=1`), eine Abweichung öffnet am selben Tag ein Alarm-Issue (`[quant-produktionscheck]`), und eine neue Abnahme ist ein PR auf diese Konfig mit Herleitung je Titel.

## Quant-Frontend: Budget und Befund (Strang AK, 13.11.2026)

Budget je Route in `quant/config/frontend-budget.json` (Messwert vom 13.11. + 25 % KB / + 8 Anfragen / 5 s), geprüft täglich im Quant-Produktionscheck (Überschreitung = Alarm-Issue, kein roter Code-PR). Messung (Übertragungs-KB, kalter Cache): Start 751, Aktie 1010, Chartbild 997, Screener 1183, Technische Lagen 1035, Methodik 618; `release-bundle.js` (296 KB gz) liegt auf 13 von 16 Routen und ist 40–60 % davon. Befund: Die Daten (Namensliste, Screening) werden vom Router schon je Ansicht geladen; ein Paket „Seiten" für `pages.js` (42 KB gz) würde nur sechs Routen um 4–7 % entlasten und fasst Router und Paketweiche an, deshalb nicht umgesetzt. Der größere Hebel liegt im Auslieferungsweg: GitHub Pages liefert alles mit `cache-control: max-age=600` (auch die versionierten `?v=`-Dateien) und gzip statt Brotli und ist nicht konfigurierbar; ein Cloudflare-Proxy mit Cache-Regel (Browser-TTL für `?v=`-URLs) oder die Auslieferung über Cloudflare Pages (`_headers`) ersparte Wiederkehrern das Bündel ganz. Das ist eine Ops-Entscheidung (DNS/Hosting), kein Code.

## Fachbelege und weiterführende Dokumentation

Die folgenden Quellen werden verlinkt, nicht zusammenkopiert. Bei datierten Berichten bezeichnet „gültig“ ihren Referenzwert; daraus folgt keine neue Freigabe.

- [VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md](../../VISION_UNIVERSE_QUANT_AI_PROJECT_MASTER.md)
- [VU_BACKTEST_EVIDENCE_PROVIDER_SPEC.md](../archiv/VU_BACKTEST_EVIDENCE_PROVIDER_SPEC.md)
- [VU_BACKTEST_METHODOLOGY.md](../archiv/VU_BACKTEST_METHODOLOGY.md)
- [VU_BACKTEST_TRUST_SCORE.md](../archiv/VU_BACKTEST_TRUST_SCORE.md)
- [VU_QUANT_2_FACTOR_EVIDENCE.md](../archiv/VU_QUANT_2_FACTOR_EVIDENCE.md)
- [VU_QUANT_2_FRONTEND_TRANSFORMATION.md](../archiv/VU_QUANT_2_FRONTEND_TRANSFORMATION.md)
- [VU_QUANT_2_LOST_WORK_REGISTER.md](../archiv/VU_QUANT_2_LOST_WORK_REGISTER.md)
- [VU_QUANT_2_METHODOLOGY.md](../archiv/VU_QUANT_2_METHODOLOGY.md)
- [VU_QUANT_2_METHODOLOGY_NAMESPACES.md](../archiv/VU_QUANT_2_METHODOLOGY_NAMESPACES.md)
- [VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md](../VU_QUANT_2_MOMENTUM_RETURN_BASIS_STUDY.md)
- [VU_QUANT_2_ORCHESTRATOR_STATE.md](../VU_QUANT_2_ORCHESTRATOR_STATE.md)
- [VU_QUANT_2_PATTERN_RESEARCH.md](../archiv/VU_QUANT_2_PATTERN_RESEARCH.md)
- [VU_QUANT_2_PRODUCT_CONSTITUTION.md](../archiv/VU_QUANT_2_PRODUCT_CONSTITUTION.md)
- [VU_QUANT_2_PRODUCT_LANGUAGE.md](../VU_QUANT_2_PRODUCT_LANGUAGE.md)
- [VU_QUANT_2_SETUP_OBSERVATION.md](../archiv/VU_QUANT_2_SETUP_OBSERVATION.md)
- [VU_QUANT_2_TOTAL_DEBT_CENSUS.md](../VU_QUANT_2_TOTAL_DEBT_CENSUS.md)
- [VU_QUANT_2_ZERO_FACTOR_CLASSIFICATION.md](../archiv/VU_QUANT_2_ZERO_FACTOR_CLASSIFICATION.md)
- [VU_QUANT_BACKTEST_CERTIFICATION.md](../VU_QUANT_BACKTEST_CERTIFICATION.md)
- [VU_QUANT_BACKTEST_SIGNAL_INTELLIGENCE.md](../archiv/VU_QUANT_BACKTEST_SIGNAL_INTELLIGENCE.md)
- [VU_QUANT_BAND_SEMANTICS.md](../archiv/VU_QUANT_BAND_SEMANTICS.md)
- [VU_QUANT_DAILY_USEFULNESS.md](../archiv/VU_QUANT_DAILY_USEFULNESS.md)
- [VU_QUANT_FINAL_PRODUCT_READINESS.md](../archiv/VU_QUANT_FINAL_PRODUCT_READINESS.md)
- [VU_QUANT_FRONTEND_REBUILD.md](../VU_QUANT_FRONTEND_REBUILD.md)
- [VU_QUANT_METHODOLOGY.md](../archiv/VU_QUANT_METHODOLOGY.md)
- [VU_QUANT_PRODUCT_POSITIONING.md](../VU_QUANT_PRODUCT_POSITIONING.md)
- [VU_QUANT_SHARE_COUNT_AUDIT.md](../archiv/VU_QUANT_SHARE_COUNT_AUDIT.md)
- [accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md](../accounts/BACKTEST_VORSCHAU_AKTIVIERUNG.md)
- [marketstack-europe/QUANT_POPULATION.md](../archiv/marketstack-europe/QUANT_POPULATION.md)
- [neustart/C-quant.md](../archiv/neustart/C-quant.md)
- [quant-recovery/ALPHA_DISCOVERY_V11.md](../quant-recovery/ALPHA_DISCOVERY_V11.md)
- [quant-recovery/BACKTEST_V10_CERTIFICATION_READINESS.md](../quant-recovery/BACKTEST_V10_CERTIFICATION_READINESS.md)
- [quant-recovery/BACKTEST_V10_DATA_RECOVERY.md](../quant-recovery/BACKTEST_V10_DATA_RECOVERY.md)
- [quant-recovery/BACKTEST_V10_EVIDENCE_MATRIX.md](../quant-recovery/BACKTEST_V10_EVIDENCE_MATRIX.md)
- [quant-recovery/BACKTEST_V10_FINAL.md](../quant-recovery/BACKTEST_V10_FINAL.md)
- [quant-recovery/BACKTEST_V10_REAL_STUDIES.md](../quant-recovery/BACKTEST_V10_REAL_STUDIES.md)
- [quant-recovery/BACKTEST_V10_VALIDATION.md](../quant-recovery/BACKTEST_V10_VALIDATION.md)
- [quant-recovery/BACKTEST_V51.md](../quant-recovery/BACKTEST_V51.md)
- [quant-recovery/BACKTEST_V51_HANDOFF.md](../quant-recovery/BACKTEST_V51_HANDOFF.md)
- [quant-recovery/BACKTEST_V6_CERTIFICATION_MATRIX.md](../quant-recovery/BACKTEST_V6_CERTIFICATION_MATRIX.md)
- [quant-recovery/BACKTEST_V6_DATA_GAPS.md](../quant-recovery/BACKTEST_V6_DATA_GAPS.md)
- [quant-recovery/BACKTEST_V6_FINAL.md](../quant-recovery/BACKTEST_V6_FINAL.md)
- [quant-recovery/BACKTEST_V6_MONTE_CARLO.md](../quant-recovery/BACKTEST_V6_MONTE_CARLO.md)
- [quant-recovery/BACKTEST_V6_VALIDATION.md](../quant-recovery/BACKTEST_V6_VALIDATION.md)
- [quant-recovery/BACKTEST_V7_DATA_RECOVERY.md](../quant-recovery/BACKTEST_V7_DATA_RECOVERY.md)
- [quant-recovery/BACKTEST_V7_EVIDENCE_MATRIX.md](../quant-recovery/BACKTEST_V7_EVIDENCE_MATRIX.md)
- [quant-recovery/BACKTEST_V7_FINAL.md](../quant-recovery/BACKTEST_V7_FINAL.md)
- [quant-recovery/BACKTEST_V7_METHODOLOGY_DECISIONS.md](../quant-recovery/BACKTEST_V7_METHODOLOGY_DECISIONS.md)
- [quant-recovery/BACKTEST_V7_REAL_STUDIES.md](../quant-recovery/BACKTEST_V7_REAL_STUDIES.md)
- [quant-recovery/BACKTEST_V7_VALIDATION.md](../quant-recovery/BACKTEST_V7_VALIDATION.md)
- [quant-recovery/BACKTEST_V7_WORKLOG.md](../quant-recovery/BACKTEST_V7_WORKLOG.md)
- [quant-recovery/BACKTEST_V8_DATA_RECOVERY.md](../quant-recovery/BACKTEST_V8_DATA_RECOVERY.md)
- [quant-recovery/BACKTEST_V8_EVIDENCE_MATRIX.md](../quant-recovery/BACKTEST_V8_EVIDENCE_MATRIX.md)
- [quant-recovery/BACKTEST_V8_FINAL.md](../quant-recovery/BACKTEST_V8_FINAL.md)
- [quant-recovery/BACKTEST_V8_METHOD_VALIDATION.md](../quant-recovery/BACKTEST_V8_METHOD_VALIDATION.md)
- [quant-recovery/BACKTEST_V8_REAL_STUDIES.md](../quant-recovery/BACKTEST_V8_REAL_STUDIES.md)
- [quant-recovery/BACKTEST_V8_VALIDATION.md](../quant-recovery/BACKTEST_V8_VALIDATION.md)
- [quant-recovery/BACKTEST_V9_DATA_RECOVERY.md](../quant-recovery/BACKTEST_V9_DATA_RECOVERY.md)
- [quant-recovery/BACKTEST_V9_EVIDENCE_MATRIX.md](../quant-recovery/BACKTEST_V9_EVIDENCE_MATRIX.md)
- [quant-recovery/BACKTEST_V9_FINAL.md](../quant-recovery/BACKTEST_V9_FINAL.md)
- [quant-recovery/BACKTEST_V9_METHOD_VALIDATION.md](../quant-recovery/BACKTEST_V9_METHOD_VALIDATION.md)
- [quant-recovery/BACKTEST_V9_REAL_STUDIES.md](../quant-recovery/BACKTEST_V9_REAL_STUDIES.md)
- [quant-recovery/BACKTEST_V9_VALIDATION.md](../quant-recovery/BACKTEST_V9_VALIDATION.md)
- [quant-recovery/DATA_QUALITY_V12_FINAL.md](../quant-recovery/DATA_QUALITY_V12_FINAL.md)
- [quant-recovery/DATA_QUALITY_V12_PLAN.md](../quant-recovery/DATA_QUALITY_V12_PLAN.md)
- [quant-recovery/DATA_QUALITY_V13_FINAL.md](../quant-recovery/DATA_QUALITY_V13_FINAL.md)
- [quant-recovery/methodology-v1/QUANT_BACKTEST_CERTIFICATION_METHODOLOGY_V1.md](../quant-recovery/methodology-v1/QUANT_BACKTEST_CERTIFICATION_METHODOLOGY_V1.md)
- [quant-recovery/methodology-v1/README.md](../quant-recovery/methodology-v1/README.md)
- [quant-recovery/v10/corporate-actions/README.md](../quant-recovery/v10/corporate-actions/README.md)
- [quant-recovery/v10/engine-fixes/README.md](../quant-recovery/v10/engine-fixes/README.md)
- [quant-recovery/v10/factor/README.md](../quant-recovery/v10/factor/README.md)
- [quant-recovery/v10/population/README.md](../quant-recovery/v10/population/README.md)
- [quant-recovery/v10/setup/README.md](../quant-recovery/v10/setup/README.md)
- [quant-recovery/v10/studies/README.md](../quant-recovery/v10/studies/README.md)
- [quant-recovery/v11/decomposition/README.md](../quant-recovery/v11/decomposition/README.md)
- [quant-recovery/v11/discovery/README.md](../quant-recovery/v11/discovery/README.md)
- [quant-recovery/v11/winners/README.md](../quant-recovery/v11/winners/README.md)
- [quant-recovery/v12/indexpop/README.md](../quant-recovery/v12/indexpop/README.md)
- [quant-recovery/v12/largecap/README.md](../quant-recovery/v12/largecap/README.md)
- [quant-recovery/v12/listref/README.md](../quant-recovery/v12/listref/README.md)
- [quant-recovery/v12/mcap/README.md](../quant-recovery/v12/mcap/README.md)
- [quant-recovery/v12/requal/README.md](../quant-recovery/v12/requal/README.md)
- [quant-recovery/v12/spxpop/README.md](../quant-recovery/v12/spxpop/README.md)
- [quant-recovery/v13/archive/README.md](../quant-recovery/v13/archive/README.md)
- [quant-recovery/v13/largecap/README.md](../quant-recovery/v13/largecap/README.md)
- [quant-recovery/v13/studies/README.md](../quant-recovery/v13/studies/README.md)
- [quant-recovery/v13b/f1w/README.md](../quant-recovery/v13b/f1w/README.md)
- [quant-recovery/v13b/hist/README.md](../quant-recovery/v13b/hist/README.md)
- [quant-recovery/v13b/largecap-strict/README.md](../quant-recovery/v13b/largecap-strict/README.md)
- [quant-recovery/v13c/README.md](../quant-recovery/v13c/README.md)
- [quant-recovery/v6/portfolio.md](../quant-recovery/v6/portfolio.md)
- [quant-recovery/v6/studies.md](../quant-recovery/v6/studies.md)
- [quant-recovery/v6/validation-methods.md](../quant-recovery/v6/validation-methods.md)
- [quant-recovery/v9-followups/ca-registry/README.md](../quant-recovery/v9-followups/ca-registry/README.md)
- [quant-recovery/v9-followups/identity/README.md](../quant-recovery/v9-followups/identity/README.md)
- [quant-recovery/v9/events/README.md](../quant-recovery/v9/events/README.md)
- [quant-recovery/v9/identity/README.md](../quant-recovery/v9/identity/README.md)
- [quant/BACKTEST_COVERAGE_MATRIX.md](BACKTEST_COVERAGE_MATRIX.md)
- [quant/BACKTEST_DELISTED_INTEGRATION.md](../archiv/quant/BACKTEST_DELISTED_INTEGRATION.md)
- [quant/BACKTEST_P2_DEFIZITE.md](../archiv/quant/BACKTEST_P2_DEFIZITE.md)
- [quant/BACKTEST_PREVIEW.md](BACKTEST_PREVIEW.md)
- [quant/BACKTEST_PRODUCT_READINESS_PLAN.md](BACKTEST_PRODUCT_READINESS_PLAN.md)
- [quant/BACKTEST_RESULT_CONTRACT_V2.md](BACKTEST_RESULT_CONTRACT_V2.md)
- [quant/BACKTEST_RUNNER.md](BACKTEST_RUNNER.md)
- [quant/DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md](../archiv/quant/DECISIONS_SETUP_OOS_STRATEGY_FACTOR.md)
- [quant/PORTFOLIO_STANDARD.md](PORTFOLIO_STANDARD.md)
- [quant/RESEARCH_POPULATION_AND_PORTFOLIO.md](RESEARCH_POPULATION_AND_PORTFOLIO.md)
- [quant/SETUP_OOS_DECISION_A1_A6.md](SETUP_OOS_DECISION_A1_A6.md)
- [quant/SETUP_OOS_EVALUATION.md](SETUP_OOS_EVALUATION.md)
- [quant/backtest-catalog/README.md](backtest-catalog/README.md)
- [quant/backtest-demos/REBUILD_2026-10-30.md](backtest-demos/REBUILD_2026-10-30.md)
- [quant/backtest-demos/REBUILD_2026-10-31.md](backtest-demos/REBUILD_2026-10-31.md)
- [quant/research/portfolio-v1/MODEL_PORTFOLIOS.md](research/portfolio-v1/MODEL_PORTFOLIOS.md)
- [vu2/phases/06-quant-workspace.md](../archiv/vu2/phases/06-quant-workspace.md)
- [vu2/phases/33-backtest-readiness-evidence.md](../archiv/vu2/phases/33-backtest-readiness-evidence.md)
- [vu2/phases/35-backtest-rule-eligibility-preflight.md](../archiv/vu2/phases/35-backtest-rule-eligibility-preflight.md)
- [vu2/release/QUANT2_RELEASE.md](../archiv/vu2/release/QUANT2_RELEASE.md)

### Historische Arbeitsstände

Abgelöste Übergaben und Statusberichte; zur Nachvollziehbarkeit erhalten. Maßgeblich sind der Einstieg und der aktuelle Plan.

- [VU_QUANT_2_MASTER_REMATCH_REPORT.md](../archiv/2026/VU_QUANT_2_MASTER_REMATCH_REPORT.md)
- [VU_QUANT_2_PUBLIC_BETA_LAUNCH_REPORT.md](../archiv/2026/VU_QUANT_2_PUBLIC_BETA_LAUNCH_REPORT.md)
- [BACKTEST_V10_HANDOFF.md](../quant-recovery/BACKTEST_V10_HANDOFF.md)
- [BACKTEST_V6_HANDOFF.md](../quant-recovery/BACKTEST_V6_HANDOFF.md)
- [BACKTEST_V7_HANDOFF.md](../quant-recovery/BACKTEST_V7_HANDOFF.md)
- [BACKTEST_V8_HANDOFF.md](../quant-recovery/BACKTEST_V8_HANDOFF.md)
- [BACKTEST_V9_HANDOFF.md](../quant-recovery/BACKTEST_V9_HANDOFF.md)
- [HANDOVER_V13.md](../quant-recovery/HANDOVER_V13.md)
- [SESSION_HANDOVER_2026-10-30.md](../archiv/2026/quant-recovery/SESSION_HANDOVER_2026-10-30.md)
- [BACKTEST_ENGINEERING_HANDOVER_V1.md](../archiv/2026/quant/BACKTEST_ENGINEERING_HANDOVER_V1.md)

Unveränderliche Provenienzmanifeste und gepinnte historische Fachbelege behalten ihre ursprünglichen Quellpfade und Prüfsummen. Die oben verlinkten Archivdateien sind die lesbaren Nachfolger; alte Pfadnamen im historischen Nachweis ändern dessen Zeitpunkt oder Freigabestatus nicht.
