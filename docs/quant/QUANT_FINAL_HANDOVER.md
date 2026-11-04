# Quant: Abschlussübergabe an die zentrale Entwicklung (Version 1.0.0, Stand 02.11.2026)

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

### A2. Implementiert, aber nicht aktiviert (DEAKTIVIERT)

| Funktion | Ort | Schalter |
|---|---|---|
| **Interne Backtest-Vorschau** mit 21 vorgerechneten Auswahlen | Seite `/konto/admin/backtests/`, Worker `workers/vu-account/src/backtests.mjs`, Bundle `workers/vu-account/data/backtest-review-bundle.json` | `VU_BACKTEST_REVIEW_ENABLED = "false"` (`wrangler.toml`), Rolle `backtest_reviewer` nicht vergeben. Aktivierung: PR #1227 |
| Research-Adapter (Runner-Ergebnisse in Produktdiensten) | `quant/api/backtest-research-adapter.js` | `DISABLED`, solange nicht `options.enabled` |
| Vorschau-Dienst (Node) | `quant/api/backtest-preview-service.cjs` | standardmäßig `DISABLED` |
| Backtest-Ergebniszahlen auf `#/backtest` | Zertifizierungsartefakt | `productionApproved=false`, `CERTIFIED_KINDS=[]` |

### A3. Sechs Backtest-Arten und sieben Zusatzmethoden

Quelle: `quant/engines/backtest-kinds.cjs`, `scripts/quant/research/backtest-runner.cjs` (`METHOD_FIT`).

| Art | Was sie rechnet | Echte historische Ergebnisse heute | Zertifizierung | Einschränkung |
|---|---|---|---|---|
| SAME_STOCK_REPLAY | feste Regel auf einer Aktie oder echter Wochen-Ledger | ja (Katalog A) | LIMITED | genau ein Listing; Ledger ohne delistete Titel |
| PATTERN_EVIDENCE | Musterereignisse gegen Kontrollen vom selben Datum | ja (A) | LIMITED | keine zertifizierte Renditebasis |
| SIGNAL_BACKTEST | fünf Signalregeln je Ereignis, optional finanziert | ja (A) | LIMITED | finanziert: im Fenster delistete Titel fallen heraus |
| SETUP_BACKTEST | auf rekonstruierten Setup-Ständen | ja (A, Nachweisart Rekonstruktion) | COLLECTING_HISTORY | Setup-OOS nicht messbar (A1–A6 entschieden 04.11.2026, messbar frühestens um 2028-01-08); keine delisteten Titel |
| STRATEGY_BACKTEST | Portfolio mit festen Gewichten oder Dividenden-TR | ja (A); Profil-Variante B | COLLECTING_HISTORY | Profil braucht PIT-Faktor-Snapshots |
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
- Gate, Freigabeliste und Ablauf stehen in `docs/data/SECURITY_MASTER_WEEKLY.md`, `docs/data/security-master/SECURITY_MASTER_GENERATIONS.md` und in der Freigabevorlage (PR #1240).

### B3. PIT-Identitäten, Survivorship, Delistings, Kapitalmaßnahmen (ERLEDIGT)

- **Identität** nur über `core/identity.js` (ADR-001): `securityId` `ref_<TICKER>`, `instrumentId`, `issuerId`.
- **Ticker-Wiederverwendung:** `quant/config/ticker-reuse-quarantine.json` mit 13 Titeln, unter denen heute ein ETF handelt.
  - Sie sind in Discover, Screener, Supertrader, Quant (Verzeichnis, Faktoren, Radar, Suche), Technical und Watchlist ohne alte Identität.
  - Gespeicherte Watchlist-Einträge werden nie nach Ticker neu zugeordnet.
  - EDVA wird als Umfirmierung geführt (Register `security-master-duplicate-resolution.json`).
- **Evidenz-Register** im Research-Loader: Identität (V10/V12/V13), Kapitalmaßnahmen (`research-ca-evidence.cjs`), Lebenszyklus.
- **Eine Preiswahrheit** (ADR-002): Split-Faktoren aus `return-series.js#splitFactors`.
- **Delistete Titel** (`docs/quant/BACKTEST_DELISTED_INTEGRATION.md`):
  - Register `v13/delisted/register-1.0.0.json` mit 1.675 QUALIFIED, `v13b/hist/register-1.1.0.json` mit 1.688;
  - Reihen hashgebunden im privaten Archiv;
  - Profile `V13_DELISTED_F1`, `F1C`, `V13B_DELISTED_F1W`;
  - Schritte D1–D7 sind LANGFRISTIG.

### B4. Historische Populationen und Abdeckung

- **Profile** in `scripts/quant/research/research-population.cjs`: `PRODUCT_DEFAULT` (Produktstamm) sowie V10_PRIMARY bis V13B (1.1.0).
- **Abdeckung je Lauf** steht im Ergebnis: `population`, `dataQuality.coverage`, `inputHashes`.

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
| `quant-v13-archive.yml` | Commit-Marke `[v13-archive:<modus>]` | privates Archiv (put/get/verify/keycheck/restore/demos/catalog …) | `V13_ARCHIVE_PRIVATE_KEY`, `VU_HISTORY_S3_*` |
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
| #1119 | 132 SEC-Statuskorrekturen | H6 | zurückgestellt bis nach H1 |
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

Bericht, Freigabe-Runbooks und FV-1-Analyse: [BACKTEST_P2_DEFIZITE.md](BACKTEST_P2_DEFIZITE.md). Keine Änderung an Gates, Schwellen, Runner (`CODE_FILES`), Security Master, `quant/data/**`, eingefrorenen Ständen oder gesperrter UI. Zahlen nur als Research unter `docs/quant/research/`, nicht im Produkt.
- **P3.1:** `scripts/quant/research/survivorship-sensitivity.cjs` (F0 gegen F1 über den unveränderten Runner, gleiche Stichprobe). Der committete Bericht ist `PREPARED_PRIVATE_INPUT_MISSING`, weil die Reihen nur im R2-Archiv liegen. Lauf mit Secret: Runbook R2.
- **P4.1:** `scripts/quant/research/pattern-total-return.mjs` (Gesamtrendite `canonical-total-return-1.0.0` neben Kursrendite, Parität mit dem Runner). Research auf der Golden-Preview: 4/5 Titel, 62 Ereignispaare, Ausschüttungen im Mittel +0,75 Pp je 13-Wochen-Ereignis. Das Gate `returnBasis` liest den Bericht nicht (P4.2, FV-5).
- **FV-4:** `catalog-private-recheck.cjs` (Erwartung der 5 privaten Fälle, Auswertung des Laufartefakts, Abbruchkriterien); `[v13-archive:catalog]` nicht ausgeführt.
- **FV-1:** `setup-independence-readings.cjs`. Unter Lesart A (Monate) ist Setup frühestens 2028-04 möglich, unter B (ISO-Wochen) 2027-03-26. Empfehlung: A beibehalten und das Feld umbenennen, Unabhängigkeit über N_eff als eigene Entscheidung, B nicht.
- **FV-8:** `pit-snapshot-integrity.cjs --fail-on-missing-month --alarm-detail`. Offen ist nur der Workflow-Schritt.
- **Coverage-Matrix** neu gebaut, mit Abschnitt I (Research-Nachweise) und einer Spalte „Research-Nachweis“. Befund unverändert 0/6. Pattern hat jetzt 0 „heute technisch“ und 3 Owner-Blocker.
