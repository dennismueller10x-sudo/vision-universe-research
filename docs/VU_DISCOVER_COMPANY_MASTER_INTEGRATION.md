# DISCOVER V3 — Integration des kanonischen Company Masters

Stand: So 13.09.2026 · Branch `claude/vision-universe-discover-v3` · nicht gemergt, nicht veröffentlicht.
Auftrag: den vorhandenen Company Master aus `claude/tiingo-us-equity-discovery-k5j4bc`
(Commit `2e22a2e`, `us-security-master-1.1.0`, 7 004 Titel) als kanonische
Universumsquelle in den Discover-V3-Workstream übernehmen — ohne neues
Universum, ohne zweite Company-Master-Architektur, ohne SEC-Pipeline, ohne
Discover-Redesign, ohne visuelle Änderung der V3-Experience.

## 1. Was übernommen wurde — und was nicht

| Übernommen (per `git checkout 2e22a2e -- …`, unverändert) | Nicht übernommen |
|---|---|
| `quant/data/market/security-master/` (eligibility.json mit 7 803 Entscheidungen, us-security-master.json, reconciliation, summary, expansion, backfill-estimate, finding-fifth-letter-suffix) | SEC-Pipeline (der bestehende SEC-Bestand von 5 Titeln bleibt, wie er ist) |
| `quant/engines/us-security-master.js`, `quant/engines/coverage-metrics.js` + ihre Tests (77 Tests, grün) | ein neues Universum oder eine zweite Universumsdatei |
| `scripts/market/build-us-security-master.mjs`, `build-us-eligibility.mjs`, `expand-us-universe.mjs`, `build-coverage-metrics.mjs` | ein zweiter MarketStore, eine zweite Chart-Engine, ein zweiter Symbol-Resolver |
| `quant/data/market/scale/universe-FULL_UNIVERSE.json` (jetzt 7 803 Mitglieder, Stand des Masters) | visuelle Änderungen an Discover (Karten, Hero, Aktienseite, CSS unverändert) |

Die Kette ist unverändert die des Full-Market-Passes, nur die Quelle am Anfang ist jetzt der Master:

```
Company Master (7 004)  →  Provider Mapping (providerSymbols.tiingo)
   →  Tiingo Coverage (ingest-tiingo.mjs, inkrementell, Request-Budget je Lauf)
   →  Historical Coverage (discover-series, ≥ 250 Bars)
   →  Intraday Coverage (ingest-intraday.mjs, 5 min IEX, Sitzungs-Snapshots)
   →  Quant Eligibility (build-market-factors.mjs --product-universe)
   →  Discover (build-discover-data.mjs)  →  Stock Detail (discover/data/stocks)
```

## 2. Verdrahtung

* **`scripts/market/universe-source.mjs`** — `resolveProductUniverse(root)` liest
  `security-master/eligibility.json`; Regel „alles außer EXCLUDED" (INCLUDED + REVIEW),
  Zählungen werden gegen die Quelle nachgerechnet, SHA-256 der Datei wird mitgeführt.
  Der Übergabepunkt (`HANDOVER`: Branch, Commit, Version, erwartete Zählungen
  7 803 / 7 004 / 6 477 / 308 / 219 / 799) steht jetzt auf `INTEGRATED`.
  **Der Fallback auf `universe-FULL_UNIVERSE.json` (5 684) ist entfernt**: fehlt der
  Master, bricht die Auflösung mit „Company Master fehlt" ab. Es gibt kein
  Produktuniversum ohne ihn.
* **`scripts/market/preview-scope.mjs`** — der freigegebene Umfang folgt der
  Universumsquelle (7 004 Titel + Benchmark SPY = 7 005).
* **`scripts/market/ingest-tiingo.mjs`** — unverändert inkrementell über den
  Umfang; neu: der Checkpoint wird am neuen Tag und nach einem vollständigen
  Lauf zurückgesetzt (vorher hätte ein alter Checkpoint alle Titel als „erledigt"
  übersprungen), abgelehnte Reihen werden 7 Tage lang nicht erneut geholt.
* **`scripts/market/build-market-factors.mjs --product-universe`** — Faktorzeilen
  für das Produktuniversum aus dem Master, nicht mehr aus der Gate-Datei.
* **`scripts/discover/build-discover-data.mjs`** — Universum aus
  `resolveProductUniverse`; die Faktordatei `factors-FULL_UNIVERSE.json` ist Pflicht
  (kein stiller Rückfall auf GATE_500); `factorCoverage` im Meta trägt Universum,
  Faktorzeilen und `partial`.
* **Hygiene** — 282 kompakte Reihen und 9 Intraday-Snapshots von Titeln, die der
  Master als EXCLUDED führt (Warrants, Units), wurden aus den ausgelieferten
  Artefakten entfernt (`publish-discover-series.mjs --prune-only`,
  Intraday-Pruning beim Schreiben des Verzeichnisses). Der Hygiene-Guard prüft
  weiter, dass nur Titel des freigegebenen Umfangs ausgeliefert werden.
* **Workflows** — `market-data-refresh.yml` und `intraday-snapshots.yml` laufen
  gegen den Master; beide bauen am Ende die Capability Matrix und committen sie.
  `golden-five-market-data.yml` ist gelöscht.

## 3. Capability Matrix je Instrument

`scripts/market/build-capability-matrix.mjs` schreibt
`quant/data/market/capabilities/matrix.json` (eine Zeile je Master-Entscheidung)
und `summary.json` (Zählungen, Lückengründe, Stichprobe). Jede Spalte ist aus
einem ausgelieferten Artefakt gemessen, keine ist vermutet:

| Capability | wahr, wenn |
|---|---|
| `HAS_PROVIDER_MAPPING` | der Master ein Tiingo-Symbol führt |
| `HAS_MARKET_DATA` | der Ingest die Tageskurse geholt und die Qualitätsprüfung bestanden hat (oder eine kompakte Reihe ausgeliefert ist) |
| `HISTORICAL_QUALITY_ACCEPTED` | Ingest `ok` oder veröffentlichte Reihe (nur nach bestandener Prüfung) |
| `HAS_HISTORICAL` | kompakte Jahresreihe mit ≥ 30 Punkten und ≥ 250 Bars in der Quelle |
| `HAS_INTRADAY` | Snapshot der jüngsten Sitzung (5-Minuten-Bars, IEX) im Verzeichnis |
| `HAS_LIVE` | `HAS_INTRADAY` **und** im Discover-Live-Umfang (Snapshot-Refresh während der Sitzung; kein Strom, `isLive:false`) |
| `HAS_FACTORS` | Faktorzeile in `factors-FULL_UNIVERSE.json` |
| `HAS_FUNDAMENTALS` | Ticker im bestehenden SEC `canonical_index` |
| `HAS_NAME` | Firmenname im Discover-Suchindex |
| `DISCOVER_ELIGIBLE` | Eintrag im Suchindex und nicht als nicht handelbar ausgewiesen |
| `HAS_STOCK_PAGE` | Aktienseite unter `discover/data/stocks/US_REAL/` |

Tests: `quant/tests/capability-matrix.test.mjs` (CM1–CM4: Zeilenzahl = Master,
Zählungen konsistent, Lückengründe nur aus dem Katalog, Stichprobe der 15 Titel).

## 4. Kennzahlen, Lücken, Stichprobe

### 4.1 Kennzahlen (gemessen, Matrix capability-matrix-1.0.0, Stand 2026-09-13 21:06 UTC)

| Kennzahl | Wert | Definition / Quelle |
|---|---:|---|
| Company Master gesamt | 7.803 | Entscheidungen in `security-master/eligibility.json` (us-security-master-1.1.0) |
| Produktuniversum (alles außer EXCLUDED) | 7.004 | INCLUDED + REVIEW; Regel aus `universe-source.mjs` |
| Aktive Equities | 6.477 | Produktuniversum ∧ `active === true` im Master |
| Tiingo aufgelöst (Provider Mapping) | 7.004 | `providerSymbols.tiingo` im Master vorhanden |
| Tiingo nicht aufgelöst | 0 | Produktuniversum ohne Tiingo-Symbol |
| Marktdaten geholt (mindestens ein Ingest-Ergebnis) | 7.003 | Ingest-Status `ok` oder ausgelieferte Reihe, oder ein benannter Ingest-Grund (`commercial/status.json`) |
| Historical verfügbar (Jahresreihe ≥ 250 Bars) | 5.696 | kompakte Reihe `discover-series/<id>.json` mit ≥ 30 Punkten und `sourceBarCount ≥ 250` |
| Historical qualitätsgeprüft angenommen | 6.636 | Ingest-Validierung `ok` oder eine veröffentlichte kompakte Reihe (wird nur nach bestandener Prüfung geschrieben) |
| Intraday verfügbar (letzte Sitzung 2026-09-11) | 5.188 | `intraday/index.json` → `available[<session>]` |
| Live-/Near-live-fähig | 227 | Intraday ∧ Discover-Live-Umfang (`live-scope/US_REAL.json`, 289 Symbole) |
| Factor eligible | 6.514 | Zeile in `factors/factors-FULL_UNIVERSE.json` |
| Fundamentals (SEC canonical_index) | 5 | nur der bestehende SEC-Bestand; keine SEC-Pipeline übernommen |
| Discover eligible | 6.406 | Eintrag im Discover-Suchindex und nicht als nicht handelbar ausgewiesen |
| Stock pages verfügbar | 6.514 | `discover/data/stocks/US_REAL/<ticker>.json` |
| Fehlende Firmennamen | 6.499 | Suchindex-Eintrag ohne Namen (`n`); Quellen: quant/config, dashboard/config/universe.json, SEC inspector_index, `discover/config/company-names.json` |
| Fehlende Provider Mappings | 0 | = Tiingo nicht aufgelöst |

Discover-Build: 6.514 Titel im realen Universum, Faktorabdeckung 6514/7004 (partial: false), Live-Umfang 289 Symbole. Universumsquelle laut Meta: SECURITY_MASTER, Übergabe INTEGRATED.

### 4.2 Gründe für Coverage-Lücken (je Titel können mehrere gelten)

| Grund | Titel | Bedeutung |
|---|---:|---|
| `NO_FUNDAMENTALS` | 6.999 | kein SEC-Bestand im bestehenden canonical_index (SEC-Pipeline war nicht Teil des Auftrags) |
| `NAME_MISSING` | 6.499 | der Company Master führt keinen Firmennamen; Namen kommen nur aus Config/Dashboard/SEC/kuratierter Liste |
| `NOT_IN_LIVE_SCOPE` | 4.961 | Intraday vorhanden, aber nicht im Discover-Live-Umfang (Snapshot-Refresh während der Sitzung nur für Startseiten-Titel) |
| `NO_IEX_BARS` | 1.816 | Tiingo IEX liefert für diese Sitzung keine 5-Minuten-Bars (illiquide/OTC-nahe Titel) |
| `INSUFFICIENT_HISTORY` | 857 | Reihe vorhanden, aber < 250 Bars (junge Listings) |
| `NO_DISCOVER_CARD` | 490 | keine Karte/Reihe im Discover-Build (meist: keine Faktorzeile, s. u.) |
| `NO_STOCK_PAGE` | 490 | keine Aktienseite (folgt NO_DISCOVER_CARD) |
| `NO_FACTOR_ROW:SOURCE_MISSING` | 369 | Ingest lieferte keine verwertbare Reihe (Quelle leer) |
| `QUALITY_REJECTED:adjustmentContradicted: adjustment_status_contradicted` | 362 | Tageskurse widersprechen der Adjustierung; Reihe abgelehnt (Wiederholung nach 7 Tagen) |
| `INACTIVE` | 120 | im Master `active=false` (delisted/ruhend), bleibt im Produktuniversum, wird nicht bezogen |
| `NO_FACTOR_ROW:FAIL` | 117 | Faktor-Engine lehnt ab, fast immer `insufficient_history` (< 250 Bars) |
| `NOT_TRADING:STALE_SERIES` | 108 | letzter Kurs älter als die Stale-Grenze |
| `NO_COMPACT_SERIES` | 83 | Tageskurse geholt und angenommen, aber zu wenige Bars für eine kompakte Jahresreihe (junge Listings) |
| `QUALITY_REJECTED:too_few_bars` | 5 | Anbieter liefert weniger Bars als die Mindestzahl der Qualitätsprüfung |
| `NO_FACTOR_ROW` | 3 | keine Faktorzeile ohne näheren Grund |
| `NOT_INGESTED_YET` | 1 | noch kein Tageskurs-Ingest (Request-Budget je Lauf; wird in Folgeläufen nachgeholt) |
| `NO_FACTOR_ROW:NO_MARKET_DATA` | 1 | keine Faktorzeile, weil noch keine Tageskurse geholt wurden |

### 4.3 Stichprobe bekannter Titel (aus `summary.json → spotCheck`)

| Titel | Ticker | im Master | Mapping | Markt | Historie | Intraday | Live | Faktoren | Fundam. | Name | Discover | Seite | Lücken |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Apple | AAPL | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Microsoft | MSFT | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| NVIDIA | NVDA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Amazon | AMZN | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| Alphabet | GOOGL | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | NOT_IN_LIVE_SCOPE, NO_FUNDAMENTALS |
| Meta | META | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | ✓ | ✓ | ✓ | NOT_IN_LIVE_SCOPE, NO_FUNDAMENTALS |
| Tesla | TSLA | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| AMD | AMD | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| Palantir | PLTR | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | – | ✓ | ✓ | NOT_IN_LIVE_SCOPE, NO_FUNDAMENTALS, NAME_MISSING |
| Broadcom | AVGO | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| Eli Lilly | LLY | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| Walmart | WMT | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |
| JPMorgan | JPM | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Visa | V | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | – | – | ✓ | ✓ | NOT_IN_LIVE_SCOPE, NO_FUNDAMENTALS, NAME_MISSING |
| Micron | MU | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ | ✓ | ✓ | NO_FUNDAMENTALS |


### 4.4 Fehlende Firmennamen und Provider Mappings

* **Provider Mappings**: 0 fehlen. Jeder Titel des Produktuniversums trägt im
  Master ein Tiingo-Symbol; das ist die Voraussetzung dafür, dass Ingest,
  Intraday und Faktoren ihn überhaupt anfassen.
* **Firmennamen**: der Company Master führt keinen Namen (us-security-master.json
  hat kein Namensfeld; Tiingos Symbolliste auch nicht). Discover kennt Namen nur
  aus `quant/config`, `dashboard/config/universe.json`, dem SEC-Inspector-Index
  und der kuratierten Liste `discover/config/company-names.json` (512 Einträge).
  Alle anderen Titel werden — wie bisher — ehrlich mit `companyNameStatus:
  SOURCE_MISSING` und dem Ticker als Titel ausgeliefert. In der Stichprobe
  betrifft das Palantir (PLTR) und Visa (V). Eine Namensquelle je Titel (z. B.
  Tiingo `/tiingo/daily/<ticker>` Meta, ein Request je Titel) ist ein eigener,
  kleiner Datenpass und war nicht Teil dieses Auftrags.

## 5. Discover-Collections gegen das neue Universum

Der Discover-Build (`build-discover-data.mjs`) lief in CI gegen den Master:
Universum, Faktorzeilen, kompakte Reihen, Live-Umfang, Startseite, Reihen,
Suchindex und Aktienseiten sind gegen die 7 004 Titel neu berechnet. Titel ohne
Faktorzeile (noch nicht geholt, abgelehnt, zu kurz) erhalten keine Karte und keine
Seite — sie sind in der Matrix als `NO_DISCOVER_CARD` / `NO_STOCK_PAGE` mit dem
vorgelagerten Grund ausgewiesen. Es gibt keine Karte ohne echte Reihe und keinen
Tagesverlauf ohne Snapshot.

## 6. Läufe, Tests, Nachrechnung, QA (gemessen)

### 6.1 CI-Läufe auf dem Master (Branch, Push-Marke / Dispatch)

| Lauf | Ergebnis |
|---|---|
| `market-data-refresh.yml` auf fcbcb409 (erster Lauf mit Master) | 7 005 Titel angefragt, 1 534 neu geholt, 367 abgelehnt (Qualität), 5 104 unverändert übersprungen, 1 901 Anfragen (Stundenkontingent 7 500); 6 555 kompakte Reihen; 6 514 Faktorzeilen (490 übersprungen: 370 ohne Reihe, 120 zu kurz); Discover 6 514 Titel; alle Regressionen grün; Commit faa1b949 |
| `intraday-snapshots.yml` scope=universe (Dispatch) | Sitzung 2026-09-11 (CLOSED), 7 005 angefragt, 4 339 unveränderlich übersprungen, 850 neu geschrieben, 1 816 ohne IEX-Bars, 2 666 Anfragen, 26 min; Commit 3c877ae5 |
| `market-data-refresh.yml` (Dispatch, nach der Sektor-Korrektur) | 7 005 Titel angefragt, 6 638 inkrementell geprüft (keine neuen Bars, 13 KB), 367 abgelehnt übersprungen (7-Tage-Sperre); 6 555 kompakte Reihen; 6 514 Faktorzeilen, jetzt mit `universeSource: SECURITY_MASTER` und kuratiertem Sektor; Discover 6 514 Titel, 9 kuratierte Sektoren, 21 Startseiten-Stücke, Live-Umfang 289; Matrix neu gerechnet; Regressionen grün; Commit 194209af |

### 6.2 Nachrechnung und Tests (lokal auf den CI-Daten)

| Prüfung | Ergebnis |
|---|---|
| `node --test quant/tests/*.test.mjs` | 793 Tests, 0 Fehler (inkl. US1–US6 Universumsquelle, CM1–CM4 Capability Matrix, 77 Tests des übernommenen Security-Master-Codes) |
| `node --test discover/tests/*.test.mjs` | 167 Tests, 0 Fehler (SC1–SC7 Skalierung, LH1–LH7 Live-Hub, Daten-/V3-Verträge) |
| `scripts/technical/verify-technical-data.mjs` | 18 Instrumente gegen die Engines nachgerechnet, keine Abweichung |
| `scripts/discover/verify-discover-data.mjs` | keine Abweichung zwischen Daten und Engines |
| `scripts/market/assert-public-data-hygiene.mjs` | grün: nur der deklarierte Umfang, keine Rohbars des Anbieters in ausgelieferten Pfaden |
| `scripts/market/assert-no-secrets.mjs` | 10 951 Dateien unter `quant/data/market`, keine Zugangsdaten |
| `scripts/market/build-capability-matrix.mjs --dry-run` | lokal neu gerechnet: alle 16 Zählungen identisch mit der in CI committeten `summary.json` |
| `scripts/market/universe-source.mjs` | 7 004 Titel, Zählung 7 803 / 7 004 / 6 477 / 308 / 219 / 799 gegen die Quelle bestätigt, Company Master INTEGRATED |

### 6.3 Browser-QA (Chromium, lokaler Server auf den ausgelieferten Daten)

| Suite | Umfang | Ergebnis |
|---|---|---|
| `browser-qa-live.mjs` (echte Uhr, Sonntag → „Letzter Handelstag · Freitag") | Desktop 1440 px + iPhone 390 px: Sitzungslabel, Hub (Verzeichnis einmal, kein Polling außerhalb der Sitzung, Abo-Zyklus, verstecktes Fenster), Karten/Hero/Aktienseite 1T aus Snapshots, keine Konsolenfehler | 29/29 |
| `browser-qa-v3.mjs` | Startseite (21 Stücke nachgeladen), Lazy Loading (ein Titel, ein Abruf), Suche, Aktienseite, Mobil ohne horizontalen Überlauf | 38/38 |
| `browser-qa.mjs` (Legacy, datengetrieben) | Reihen, Sektorkacheln, Kategorieseite, Suche, Aktienseite (Zeiträume, Werkzeuge, Nachbarn), Elliott-Ehrlichkeit, Konsolen | 63/63 |

Alle Suiten liefen gegen die in CI committeten Daten (194209af) auf einem lokalen statischen Server. Screenshots (Desktop/iPhone: Startseite, Karten, Aktienseite; Stichprobe AAPL, MU, PLTR, Suche „Micron") liegen der Abgabe bei.

### 6.4 Performance (Startseite, Initial-Load, unkomprimiert)

| Messung | Desktop 1440 px | iPhone 390 px |
|---|---|---|
| Anfragen bis networkidle | 67 | 55 |
| Volumen (unkomprimiert) | 1 104 KB | 1 042 KB |
| davon JS / JSON / CSS | 437 / 221 / 125 KB | 437 / 221 / 125 KB |
| davon Intraday-Snapshots / Kursreihen | 13 (103 KB) / 14 (89 KB) | 9 (92 KB) / 6 (38 KB) |
| Live-Hub | Verzeichnis 1×, 12 Snapshots, 1 Abonnent, kein Polling, 0 Fehler | Verzeichnis 1×, 8 Snapshots, 1 Abonnent, kein Polling, 0 Fehler |
| Reihen-Cache | 14 Anfragen = 14 im Cache, 0 Fehler | 6 = 6, 0 Fehler |
| DOM-Knoten | 1 627 | 1 649 |

Gegenüber dem abgenommenen Full-Universe-Pass (67 / 55 Anfragen, 1 112 / 1 051 KB) unverändert: das größere Universum (6 514 statt 5 339 Titel mit Karte) kostet den Initial-Load nichts, weil die Startseite weiterhin nur ihre 179 Karten und deren Reihen lädt.

## 7. Was diese Integration nicht getan hat

* kein neues Universum, keine zweite Company-Master-Architektur; der Master ist unverändert übernommen
* keine SEC-Pipeline; `HAS_FUNDAMENTALS` misst nur den vorhandenen Bestand
* keine visuelle Änderung an der V3-Experience (Karten, Hero, Aktienseite, CSS, Client-Skripte unverändert)
* keine Fake-Charts, keine synthetischen oder interpolierten Daten: jede Karte ohne Reihe bleibt ohne Chart, jeder Tagesverlauf kommt aus einem Snapshot einer echten Sitzung
* nicht nach `main` gemergt, nicht veröffentlicht

## 8. Empfehlung

Die Datenintegration ist abgeschlossen und nachgerechnet. Vor der
Veröffentlichung steht — wie vom Eigentümer angekündigt — der separate
Visual-Experience-/Netflix-Polish-Pass. Offene Datenlücken, die keinen Code
brauchen, sondern Läufe: die tägliche Refresh-Kette schließt `NOT_INGESTED_YET`
und rechnet abgelehnte Reihen nach 7 Tagen erneut; die erste echte Sitzung
(Montag) füllt `HAS_LIVE` für den Discover-Umfang. Die 6 499 fehlenden
Firmennamen brauchen eine Namensquelle je Titel (eigener kleiner Pass).
