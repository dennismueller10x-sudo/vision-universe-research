# Wertpapierstamm: Gattungsbeleg aus dem Börsenverzeichnis

Stand 09.10.2026 · Regel `exchange-directory-class-1.0.0` · Skript `scripts/market/apply-exchange-directory.mjs`

## Befund

KMPB und OXLCZ standen als `EQUITY_COMMON/ELIGIBLE` im Wertpapierstamm. Beide sind börsennotierte Schuldverschreibungen:

| Ticker | Bezeichnung laut Börsenverzeichnis | vorher | jetzt |
|---|---|---|---|
| KMPB | Kemper Corporation 5.875% Fixed-Rate Reset Junior Subordinated Debentures due 2062 | EQUITY_COMMON/ELIGIBLE | DEBT/EXCLUDED |
| OXLCZ | Oxford Lane Capital Corp. - 5.00% Notes due 2027 | EQUITY_COMMON/ELIGIBLE | DEBT/EXCLUDED |
| AFGC | American Financial Group, Inc. 5.125% Subordinated Debentures due 2059 | EQUITY_COMMON/ELIGIBLE | DEBT/EXCLUDED |

**Die Ursache ist strukturell, kein Einzelfall.**
- Stamm (Tiingo) und Namensschicht (`company-names.json`: Tiingo-Metadaten, SEC `company_tickers`) führen je Ticker nur den Namen des **Emittenten**: KMPB heißt dort „Kemper Corporation“, genau wie die Stammaktie KMPR.
- Die Namensregeln des Klassierers (`us-security-master.js`: DEBT, ETN, ETF, PREFERRED …) haben damit nichts zu greifen.
- Deshalb fällt jede Schuldverschreibung, jeder ETN und jeder ETF ohne Gattungskennzeichen im Ticker durch.
- #366 hatte 22 Anleihen gefunden, deren Firmenname zufällig die Anleihe nannte.

**Ebenso strukturell:** 97 Titel standen als `REVIEW · UNCONFIRMED:LISTING_INACTIVE`, obwohl sie heute gelistet sind. Beispiel: SE („Sea Limited American Depositary Shares“). Der Stamm übernahm ein veraltetes Aktivitätsfeld des Anbieters.

## Beleg und Regel

Das Symbolverzeichnis der Börsen (Nasdaq Trader `nasdaqlisted.txt` und `otherlisted.txt`) ist bereits Quelle in `tiingo2-refresh.mjs`. Es führt je Ticker:
- die Bezeichnung **des Papiers**,
- eine ETF-Kennung,
- eine Testpapier-Kennung.

Die Zuordnung läuft über `core/identity.js`. Der Klassierer und `decideProductEligibility` sind dieselben wie bisher; neu ist nur der Beleg, der vorher fehlte. Je Klasse gilt:

| Klasse | Regel | Standard |
|---|---|---|
| DEBT | Klassierer: CLASSIFIED DEBT (Notes/Debentures due …) | ja |
| ETN | Klassierer: CLASSIFIED ETN | ja |
| PREFERRED | Klassierer: CLASSIFIED PREFERRED **und** kein Hinterlegungsschein auf Ordinary/Preferred-Aktien (ITUB, PBR-A, CIB, AVAL bleiben) | ja |
| WARRANT/RIGHT/UNIT | nur Bestätigung eines bestehenden Verdachts (REVIEW → belegt) | ja |
| ETF | Klassierer: CLASSIFIED ETF **und** ETF-Kennung = Y | **nein** (`--classes`) |
| Aktivität | `UNCONFIRMED:LISTING_INACTIVE` und heute als handelbares Papier gelistet → aktiv; die Gattung bleibt | ja |

Weitere Grundsätze:
- Die Form aus dem Tickerkennzeichen (-P-, W, U, R) steht über dem Namen.
- Testpapiere werden nie umgestuft.
- Keine Umstufung **zur** Stammaktie.

## Ergebnis (angewendet, 09.10.2026)

Das Verzeichnis enthält 13.293 Zeilen; 6.775 von 7.803 Entscheidungen wurden zugeordnet. 301 Entscheidungen haben sich geändert:

| Übergang | Anzahl |
|---|---:|
| EQUITY_COMMON/ELIGIBLE → DEBT/EXCLUDED | 108 |
| EQUITY_COMMON/REVIEW → EQUITY_COMMON/ELIGIBLE (Aktivität) | 85 |
| EQUITY_COMMON/ELIGIBLE → ETN/EXCLUDED | 32 |
| PREFERRED/REVIEW → PREFERRED/SEPARATE_CLASS | 28 |
| EQUITY_COMMON/ELIGIBLE → PREFERRED/SEPARATE_CLASS | 17 |
| TRUST/SEPARATE_CLASS → DEBT/EXCLUDED | 12 |
| RIGHT/REVIEW → RIGHT/EXCLUDED | 5 |
| EQUITY_COMMON/REVIEW → DEBT/EXCLUDED | 4 |
| REIT/SEPARATE_CLASS → DEBT/EXCLUDED | 3 |
| WARRANT/REVIEW → WARRANT/EXCLUDED | 3 |
| TRUST/REIT/ADR → PREFERRED/SEPARATE_CLASS | 4 |

| Zähler | vorher | nachher |
|---|---:|---:|
| ELIGIBLE | 5.922 | 5.850 |
| SEPARATE_CLASS | 779 | 809 |
| REVIEW | 152 | 27 |
| EXCLUDED | 950 | 1.117 |
| **Produktuniversum** | **6.853** | **6.686** (−167: 127 DEBT, 32 ETN, 8 RIGHT/WARRANT) |

Jede Änderung steht mit Bezeichnung, Verzeichnis-Börse, Regel und Version in `eligibility-reconciliation.json`.

## Audit: gefunden, aber bewusst nicht angewendet

Wird der Klassierer mit Verzeichnisbezeichnung auf **alle** Klassen angewendet (Trockenlauf), kommen weitere Fälle hinzu. Sie sind Produktpolicy, nicht Datenfehler, und brauchen jeweils eine eigene Entscheidung:

| Fund | Anzahl | Warum nicht hier |
|---|---:|---|
| ETF als EQUITY_COMMON/ELIGIBLE (u. a. SPY) | 381 (+16 aus TRUST/ADR/SPAC/PREFERRED) | SPY ist Benchmark und wird über das Produktuniversum aufgelöst (`benchmark-reference`); ETFs haben Seiten (`capability-matrix`, z. B. CATG). Die Herausnahme ist eine Policy-Migration mit eigenem PR. |
| ADR als EQUITY_COMMON | 304 (+3 aus REVIEW, z. B. SE) | ADR ist SEPARATE_CLASS; die Umstufung verschiebt ~300 Titel zwischen den Klassen, ohne dass ein Papier falsch im Produkt ist. |
| BDC/CEF als EQUITY_COMMON (ARCC, PSEC, GBDC …) | 20 (+3 aus TRUST) | Das Verzeichnis führt BDCs als „Closed End Fund“. Sie handeln wie Betriebsgesellschaften; die Policy für BDCs ist offen. |
| REIT als EQUITY_COMMON | 7 | REIT ist SEPARATE_CLASS; Policy, kein Fehler im Kursverhalten |
| SPAC/TRUST/REIT → EQUITY_COMMON | 36 | Umstufung **zur** Stammaktie ist ausgeschlossen (Erweiterung des Universums braucht eigene Prüfung). |
| Fehltreffer, die die Regel abfängt | BNS („Pfd 3 Ordinary Shares“), ITUB/PBR-A/CIB/AVAL, Testpapiere CBX/CBO/IGZ | durch Klassenregel bzw. Test-Kennung ausgeschlossen |

Nicht zugeordnet: 1.028 Entscheidungen haben keinen Eintrag im heutigen Verzeichnis (überwiegend delistete oder ausgeschlossene Papiere). Sie bleiben unverändert.

## Folgeartefakte und Migrationsplan

Eine Gattungskorrektur verkleinert den Veröffentlichungsumfang (`preview-scope` liest `eligibility.json`). Jede veröffentlichte Reihe eines ausgeschlossenen Titels verletzt danach die Datenhygiene. Deshalb wird dieser PR **nicht** zusammen mit der Elliott-Arbeit gemergt.

Offline mit dem jeweiligen Erzeuger neu gebaut (im PR enthalten):
1. `build-company-master.mjs`, `build-universe-indexes.mjs`, `verify-company-master.mjs` (683/683)
2. `build-company-names.mjs` (ohne Abruf, Kandidaten aus der Datei)
3. `cli.py reconcile`
4. `publish-discover-series.mjs --prune-only` (Tagesreihen außerhalb des Umfangs)
5. `publish-long-series.mjs --prune-only` (neu: 148 Wochenreihen außerhalb des Umfangs)

Ebenfalls offline (Stand 10.10.2026, Verzeichnis vom 09.10.2026, Ergebnis identisch zur ersten Fassung):
6. `ingest-intraday.mjs --index-only`: 152 Intraday-Schnappschüsse ausgeschlossener Titel entfernt (der Erzeuger bereinigt so bei jedem Lauf).
7. Fundamental-Berichte aus den Emittenten-Scherben (Erzeugerpfad von `daily-downstream`: `reports_from_records` + `_write_universe_reports`), danach `cli.py reconcile`.
8. `build-capability-matrix.mjs` und `vu2/build-product-capabilities.mjs` (Produktuniversum 6.686).

Mit dem CI-Erzeuger auf diesem Zweig:
9. `product-intelligence-materialization.yml` (force), Lauf 38035577319: technical-signals, factor-evidence (DEBT7), Radar, Muster, Suche ohne die ausgeschlossenen Titel. Vertrags- und Regressionstests des Laufs grün, Datenhygiene grün. Modelle und Rankings unverändert, nur die Grundgesamtheit.

Nach dem Merge auf `main`, in dieser Reihenfolge:
10. `long-series.yml`: Wochenreihen im neuen Umfang, danach `build-discover-data.mjs` (Discover-Daten; lokal belegt: danach 338/338 Discover-Tests grün). Discover-Daten gehören nicht in diesen PR (Discover-Gate).
11. `technical-intelligence-build.yml` (startet nach 10 von selbst): Chartbild/Explore gegen das korrigierte Universum.
12. Pages-Auslieferung.
13. `coverage-metrics.yml`: Neuabnahme der Deckungskennzahlen. **Blocker:** Der Lauf committet nur bei grüner Regressionssuite. Auf `main` sind 6 Quant-Tests unabhängig hiervon rot (CTR18 und Golden Five: JPM-Dividende im Golden Preview; zwei Total-Return-Verifikationen; SG1; AL-2).

Bis Schritt 13 steht `test_der_abgleich_trifft_den_neu_abgenommenen_stand` absichtlich rot. Die eigene Rechnung (6.686 / 6.683 / 5.643) weicht vom abgenommenen Messstand (6.853 / 6.850 / 5.780) um genau die belegten 167 bzw. 137 Titel ab. Der Test `test_der_verzeichnisbeleg_erklaert_den_rest_je_titel` prüft diese Herleitung je Titel. Ein neuer Nenner entsteht erst mit der Messung (§4).

## Folge für Elliott (G6)

Die Wertpapierart-Leitplanke G6 der Elliott-Produktschicht liest `eligibility.json`. Mit diesem PR fallen KMPB und OXLCZ aus den Motiv-Alternativen und aus „Weitere Elliott-Lesarten“. SE wird `ELIGIBLE` (vorher REVIEW wegen falscher Inaktivität).
