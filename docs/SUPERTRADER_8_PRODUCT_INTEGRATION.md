# Supertrader 8.0 – Produktintegration der 13 quellentreuen Methoden

Stand 26.10.2026, Datenstand der Messungen 23.10.2026.

Gilt ausnahmslos:
- Alle 13 Strategien bleiben `LIVE_NOT_APPROVED` und `DIAGNOSTIC_NOT_CERTIFIED`.
- `VALIDATED_TRADE_SIGNAL` ist für alle 13 gesperrt (Vertrag 1.0.0, `CONTRACT_LOCK`).
- Es gibt keine Orders, keinen Broker, keine neuen Datenanbieter und keine API-Abrufe.
- Die 83 V4-D1-Sitzungen bleiben in Quarantäne, CC-5 bleibt offen.

Grundlage ist der Produktvertrag [SUPERTRADER_7_PRODUCT_INTEGRATION_CONTRACT.md](SUPERTRADER_7_PRODUCT_INTEGRATION_CONTRACT.md) (`supertrader-sf-product-candidate-1.0.0`). Dieses Dokument beschreibt, was darauf aufbauend gebaut wurde, was es heute leistet und was bewusst offen bleibt.

## 1. Pipeline

```
Aktienuniversum (discover US_REAL ohne ETF/ETN/Fonds)
  → EOD-Datenadapter (technical-signals-v1, split-adjustiert, 270 Sitzungen)
  → Datenqualität je Titel (PASS / CAP / FAIL)
  → Erkennung je Strategie (bestehende Screens und Lifecycle-Adapter, Referenzkonfiguration)
  → Stufe = min(Reichweite der Erkennung, Readiness-Obergrenze, DQ-Obergrenze)
  → Vertragsdatensatz (validateCandidateRecord, ungültig = verworfen) + Analyseansicht
  → Sortierung je Strategie → summary / index / strategy / ticker / records
```

| Modul (`scripts/supertrader/source-faithful/product/`) | Aufgabe |
|---|---|
| `eod-adapter.mjs` | Liest nur committete, kanonische Artefakte und bildet die Research-Form der Engines. Identität über `core/identity.js`; Doppelte, Mock-, nicht adjustierte und widersprüchliche Reihen werden abgelehnt. |
| `data-quality.mjs` | Datenqualitätsvertrag `sf8-data-quality-1.0.0` (§3). |
| `detectors.mjs` | Je Strategie eine dünne Hülle um die bestehende Engine (§2). Keine eigene Handelsregel. |
| `records.mjs` | Stufenlogik, Vertragsdatensatz, Analyseansicht mit Erklärungscodes. |
| `ranking.mjs` | Lexikografische Sortierung je Strategie, kein strategieübergreifender Score. |
| `catalog.mjs` | Namen, Kurzbeschreibungen, deutsche Regel-Labels (keine internen Codes in der Oberfläche). |
| `build-candidates.mjs` | Producer-Entwurf: `--out` Pflicht, `--as-of`, `--previous`, `--stats`. Schreibt nie in committete Bäume. |

Der Producer ist **nicht** registriert und läuft in **keinem** Workflow. Der bestehende Test `SF-PRODUCT-NO-RUN-INTEGRATION` hält das fest und bleibt unverändert. Die Aktivierung ist eine Owner-Entscheidung (§8, O-2).

## 2. Integrationsmatrix der 13 Strategien

Alle Erkennungen laufen auf Tagesbalken bis zum Stichtag, ohne Intraday-Daten und ohne Fundamentaldaten. Engines und Konfigurationen sind die bestehenden Research-Referenzen.

| | Strategie | Engine (unverändert) | erkennt | heute höchstens | Kandidaten 23.10. (Chart / Setup / Modell) | modellierter Ablauf |
|---|---|---|---|---|---|---|
| C01 | Turtle S1 | `methods/turtle.mjs#entryTrigger` + Filter-Tracker | Ausbruch über das 20-Tage-Hoch am Stichtag (Filter, 55-Tage-Failsafe) | MODELED | 293 (44 / 249 / 0) | nein, Owner-Entscheidung O-1 |
| C02 | Turtle S2 | wie C01 | Ausbruch über das 55-Tage-Hoch am Stichtag | MODELED | 232 (23 / 209 / 0) | nein, O-1 |
| C03 | Darvas | `research/darvas-lifecycle.mjs` (REF) | stehende Box am Allzeithoch des Fensters | MODELED | 237 (177 / 12 / 48) | Buy-Stop Top + Bruchteil, Stop Top − Bruchteil |
| C04 | Weinstein Investor | `methods/weinstein.mjs#investorScreen` | Ausbruch aus der Basis in der letzten abgeschlossenen Woche | CHART | 423 (423 / 0 / 0) | – |
| C05 | Weinstein Trader | `#traderScreen` | Fortsetzungsausbruch in der letzten abgeschlossenen Woche | CHART | 380 (380 / 0 / 0) | – |
| C06 | Minervini SEPA/VCP | `methods/minervini.mjs#trendTemplate` + VCP-Proxy | Trend Template 1–7 am Stichtag | CHART | 644 (644 / 0 / 0) | – |
| C07 | Minervini Power Play | `research/minervini-lifecycle.mjs#powerPlaySetupAt` + `entryEligibility` | Flagge nach +100 % in unter 40 Sitzungen | MODELED | 23 (16 / 2 / 5) | Buy-Stop-Limit am Pivot, Struktur-Stop |
| C08 | Kullamägi Breakout | `methods/kullamagi.mjs#momentumRanks` + `research/kk-breakout-lifecycle.mjs` | Top 2 % nach 1/3/6-Monats-Perzentil | MODELED | 222 (24 / 183 / 15) | nächste Eröffnung, Stop Ausbruchstagstief, nur bei Proxy-Ausbruch am Stichtag |
| C09 | KK Episodic Pivot | `research/kk-ep-lifecycle.mjs#epChartCandidate` | Gap ≥ 10 % am Stichtag | CHART | 21 (21 / 0 / 0) | – (Katalysator, Intraday DATA_BLOCKED) |
| C10 | KK Parabolic Short | `research/kk-ps-study.mjs#psChartCandidate` | beschleunigte Aufwärtsserie (Handelstag t+1) | CHART | 7 (7 / 0 / 0) | – (Short, Borrow DATA_BLOCKED) |
| C11 | Pocket Pivot | `methods/morales-kacher.mjs#pocketPivotAt` | Volumensignatur am Stichtag | CONFIRMED | 369 (12 / 357 / 0) | – (Stop nicht in der Quelle) |
| C12 | Buyable Gap-Up | `methods/morales-kacher.mjs#gapUpAt` + `research/moka-lifecycle.mjs` | Gap ≥ 0,75 × ATR(40) | MODELED | 176 (137 / 22 / 17) | nächste Eröffnung, Stop Gap-Tag-Tief |
| C13 | Holy Grail | `research/holy-grail-lifecycle.mjs` (W-RAS97) | Rücksetzer an die EMA20 bei ADX > 30 | CONFIRMED | 190 (48 / 142 / 0) | – (Trailing nicht in der Quelle) |

Insgesamt 3.217 Kandidaten (1.956 Chart, 1.176 bestätigt, 85 modelliert, 0 validiert) aus 5.100 Titeln mit Tagesreihe. 118 Titel waren DQ-FAIL:
- 104 mit Kurslücken;
- 7 veraltet;
- 7 inaktiv.

Kein Datensatz wurde vom Vertrag abgelehnt.

Datenbedarf je Strategie (`STRATEGY_DATA_NEEDS`, mindestens 30 bis 252 Sitzungen) liegt vollständig im Tagesfenster von 270 Sitzungen.

### Abweichungen gegenüber den Research-Läufen (bewusst, dokumentiert)

| Abweichung | Wirkung | Behandlung |
|---|---|---|
| Tagesfenster 270 Sitzungen statt Historie ab 2015 | Allzeithoch (Darvas) nur im Fenster, S1-Filterzustand aus dem Fenster | Darvas: zusätzlich alle langen Wochenschlüsse; ohne lange Reihe ist DAR-SF-ATH nicht erfüllt (fail closed) |
| Kein Rohkurs / `splitAdj` | Universumsgrenze 5 USD und "ein Cent" auf adjustierter Reihe | als DQ-Detail ausgewiesen |
| Quarantäne-Rückblick 400 Tage > 389 Tage Fenster | Rest des Rückblicks ohne Tagesbalken | Wochenschlüsse (Relation ≥ 3 oder ≤ 1/3); fehlt die Reihe: CAP CHART |
| "Nächste Sitzung" (Weinstein-Woche, PS-Handelstag) | Engine liest Datum der Folgesitzung | Platzhalter ohne Kurswerte; Test vergleicht mit dem echten Folgebalken und mit "lauten" Platzhalterwerten |
| KK-SF-BO-MOMENTUM "Top 1–2 %" | Schwelle für mechanische Prüfung | Lesart: bestes Perzentil ≥ 98 (äußere Grenze der Quelle) |
| Turtle-Einstieg intraday am Stichtag | kein Folgesitzungsplan ohne neue Einstiegsregel | Stufe höchstens CONFIRMED, Owner-Entscheidung O-1 |

## 3. Datenqualitätsvertrag (`sf8-data-quality-1.0.0`)

Fail closed für die Aussage, nicht für die Plattform:
- `FAIL`: nicht bewertet, Grund gespeichert;
- `CAP`: höchstens bis zu einer Stufe;
- `INFO`: nur Kennzeichnung.

| Prüfung | FAIL | CAP |
|---|---|---|
| Identität | kein `EQUITY_COMMON`, inaktiv | nicht im Security Master, Reihe im Rückblick nach Listing-Unterbrechung neu begonnen, SPAC-Namenshinweis (CHART) |
| Aktualität | letzter Balken ≠ Marktstichtag | – |
| OHLCV | nicht endlich, High < Low, Schluss außerhalb der Spanne | – |
| Handelstage (XNYS) | mehr als 5 fehlende Sitzungen, Balken an Nicht-Sitzung | 1–5 fehlende Sitzungen (CHART) |
| Adjustierung (ADR-002) | Abgleich ≠ PASS, nicht adjustiert | Abgleich unbekannt (CHART) |
| V4-D1-Quarantäne | – | DQ-K5/DQ-K3 im 400-Tage-Rückblick (CHART) |
| Rückblicksabdeckung | – | Wochenreihe fehlt oder springt (CHART) |
| Liquidität (#705-Universum) | – | unter 5 USD oder 1 Mio. USD Tagesumsatz: kein Plan (CONFIRMED) |
| Historie je Strategie | zu kurz für die Engine: keine Erkennung | – |

ADR-Listings werden nur gekennzeichnet (INFO). Es wird ausschließlich die US-Reihe verwendet und nie mit einem Heimatlisting kombiniert.

## 4. Stufen, Erklärungen, Sortierung

**Stufen.** Die Reichweite einer Erkennung ist:
- **CHART**, wenn das Muster erkannt ist;
- **CONFIRMED**, wenn jede mechanische Setup-, Filter- und Einstiegsregel des Strategievertrags erfüllt ist;
- **MODELED**, wenn zusätzlich der Research-Lifecycle eine Order für die Folgesitzung bildet.

Die veröffentlichte Stufe ist das Minimum aus Reichweite, Readiness-Obergrenze und DQ-Obergrenze. Jeder Datensatz besteht `validateCandidateRecord` gegen das committete Readiness-Artefakt.

**Erklärungen** (maschinenlesbar in `view`):
- `met` / `notMet`: Regel-IDs;
- `why`: Codes wie `STRATEGY_CEILING`, `DATA_QUARANTINE_V4_D1`, `PLAN_NOT_MODELLED`;
- `planBlockers`;
- `dataQuality.notPass`;
- `blockReasons` aus dem Vertrag.

Die Oberfläche übersetzt die Codes über `RULE_LABELS` und eigene Texte.

**Sortierung** je Strategie: Stufe → Datenqualität → strategieeigener Schlüssel → Ticker. Die strategieeigenen Schlüssel sind:
- Pivot-Abstand: Darvas, Weinstein, Power Play, Holy Grail;
- VCP-Proxy, dann Pivot-Abstand: SEPA;
- Volumen: Turtle, EP, Pocket Pivot, BGU;
- Momentum: KK Breakout;
- Serienlänge: PS.

Es gibt keine Gewichte, keine Gewinnwahrscheinlichkeit und keinen globalen Score. Die Oberfläche kann nach jedem Schlüssel umsortieren.

## 5. Produktdaten (Ausgabe des Producers)

| Datei | Inhalt | Größe 23.10. (roh / gzip) |
|---|---|---|
| `summary.json` | Zählungen, Strategien, Regel-Labels, je Strategie die ersten fünf, `tickerShards` | 125 KB / 38 KB |
| `index.json` | alle Kandidaten kompakt | 577 KB / 138 KB |
| `strategy/<Cxx>.json` | Analyseansichten einer Strategie | 14 KB – 1,2 MB / ≤ 131 KB |
| `ticker/<shard>.json` | Ansichten je `core/identity.js#shardKey` (495 Dateien) | Median 9 KB, max. 83 KB |
| `records/<Cxx>.json` | Vertragsdatensätze (Audit; die Oberfläche lädt sie nicht) | 10,9 MB gesamt |

Die Ausgabe ist bitgleich reproduzierbar:
- keine Uhrzeit im Ergebnis;
- kanonische Reihenfolge;
- Test `SF8-DETERMINISTIC`.

`--previous` vergleicht mit einem früheren Lauf (neu, entfallen, umgestuft). Ohne historisierte Läufe zeigt die Oberfläche keine Veränderungen an.

## 6. Oberfläche

Neue Ansichten in den bestehenden Seiten. Es gibt keine neue Shell, keine Menü- oder Dock-Änderung und keinen Chart-Austausch:
- **Start** (`/supertrader/`): "Heute erkannte Aktien" nach dem Hero. Enthält Kennzahlen, Filter nach Stufe und Methode, die ersten sechs Kandidaten und die Stufenerklärung (aufklappbar).
- **Methoden** (`/supertrader/strategies/`): Abschnitt "Quellentreue Methoden (13)" mit einer Karte je Methode.
- **Strategieansicht** (`/supertrader/strategies/?sf=C03`): Kurzbeschreibung, Kennzahlen, Suche, Sortierung, Stufenfilter und Karten mit Schlüsselzahlen. Gründe und Grenzen stehen aufklappbar.
- **Aktienanalyse** (Aktienseite, `#sf`): Methoden-Chips mit Stufe und Chart (bestehendes `STChart`). Der Chart zeigt Pivot, Modell-Einstieg und -Stop sowie die Darvas-Box. Die Karte zeigt Gründe, fehlende Bedingungen und den modellierten Ablauf, diesen nur in MODELED.

`supertrader.js` lädt `sf-research.js` und `sf-research.css` erst bei Bedarf. Fehlen die Daten (heute, Lauf nicht freigeschaltet), zeigt jede Ansicht einen gekennzeichneten Leerzustand. Sprache:
- Stufen heißen "Chart-Kandidat", "Bestätigtes Setup" und "Modellierter Ablauf".
- Die oberste Stufe heißt nur "gesperrt".
- "Signal", "Kauf" und "validiert" kommen nicht vor; ausgenommen ist der Standardhinweis "keine Kauf- oder Verkaufsempfehlung".

## 7. Qualität

**Tests (lokal):**

| Suite | Ergebnis |
|---|---|
| Supertrader (inkl. 30 neuer SF8-Tests) | alle grün, siehe PR |
| Core | 239 / 0 |
| Test-Isolation SF8 | keine Produktionsdatei verändert |

**Neue Prüfungen** in `sf-sf8-data-adapter.test.mjs` und `sf-sf8-candidates.test.mjs`:
- Golden Cases auf 20 eingefrorenen echten Reihen und Golden-Marken der modellierten Abläufe;
- Negativfälle: veraltet, Lücken, SPAC, Quarantäne;
- jeder Datensatz besteht den Vertrag; Stufe ≤ Obergrenze; VALIDATED nie;
- kein Plan außerhalb MODELED;
- Determinismus bei anderer Eingabereihenfolge;
- Platzhalter der Folgesitzung gleich dem echten Folgebalken;
- `--as-of` unabhängig von späteren Balken;
- Ranking reproduzierbar;
- Producer verweigert committete Pfade;
- Research-Artefakte und Readiness (`4f9808aa…`) unverändert;
- Wortwahl.

**Referenzschutz.** Kein Engine-, Vertrags-, Readiness-, Ledger- oder Variantenpfad wurde geändert. Die bestehenden Pin-Tests für Engine-Hashes, Golden Cases, Readiness und Varianten laufen unverändert grün.

**Browser-QA** (`scripts/supertrader/browser-qa.mjs`, Chromium; iPhone 14 emuliert und Desktop 1280):
- mit Vorschaudaten: 62 Aufrufe, 0 Fehler;
- ohne Datenlauf: 62 Aufrufe, 0 Fehler.

Neue Prüfungen:
- Stufenabzeichen je Karte;
- kein Plan außerhalb MODELED;
- keine unzulässige Sprache;
- Research-Chart gezeichnet;
- Leerzustand ohne Daten.

Der 404 auf `sf-candidates/` gilt nur dann als erwartet, wenn die Daten fehlen. WebKit ist in der Build-Umgebung nicht installiert; das iPhone wird mit Chromium-Geräteemulation geprüft.

**Performance:**
- Startseite +38 KB (gzip) und ca. +45 ms;
- Strategieansicht ≤ 131 KB (gzip);
- Aktienanalyse ca. 5 KB;
- neuer Code `sf-research.js` 28,6 KB (9,5 KB gzip) und `sf-research.css` 7,7 KB.

**Lauf:**
- 25 s für 5.100 Titel und 13 Strategien (14 s Laden, 10,5 s Rechnen);
- 0 Netzwerkanfragen, 0 API-Kosten.

## 8. Owner-Entscheidungen

| | Entscheidung | Warum offen |
|---|---|---|
| O-1 | Turtle: Folgesitzungs-Einstieg (nächste Eröffnung) analog D-KK-ENTRY als Modellannahme freigeben? | Die Quelle steigt intraday am Ausbruchstag ein. Ohne Freigabe bleibt Turtle bei CONFIRMED. |
| O-2 | Producer aktivieren: Workflow `supertrader-*.yml` nach ADR-005, Domain in `core/registry/domains.json`, DQ-Regeln, Status-Seite (Vertrag §5.1–5.5) | Der Test SF-PRODUCT-NO-RUN-INTEGRATION verbietet die Anbindung bewusst. Seine Anpassung gehört in einen eigenen, freigegebenen PR. |
| O-3 | Wortlaut der Disclaimer-Codes und Stufennamen in der Oberfläche | Vertrag §5.6: Produktentscheidung. Der Entwurf steht in `sf-research.js`. |
| O-4 | Anzeige je Stufe und Strategie, insbesondere Minervini (nur übersetzte Quellen), EP und PS als Chart-Modelle | Vertrag §5.7 |
| O-5 | SPAC-Kennzeichnung über den Namen als vorläufige Datenregel bestätigen oder durch ein Stammdatenfeld ersetzen | Heuristik; der Security Master klassifiziert SPACs nicht. |
| O-6 | Lesart "Top 1–2 %" = Perzentil ≥ 98 für KK-SF-BO-MOMENTUM | Schwelle aus dem Regeltext, keine Ergebnisoptimierung. |

## 9. Aktualisierung und Kosten

Die Eingaben entstehen bereits täglich in bestehenden Läufen:
- `technical-signals-v1` (Tagesschluss);
- `discover-series-long`;
- Security Master.

Ein Kandidatenlauf würde nach deren Commit einmal je Handelstag rechnen und kostet etwa 25 s CPU. Er fragt keinen Anbieter an. Die Ausgabe ist ohne Audit-Datensätze rund 13 MB roh; täglich ändern sich vor allem `summary`, `index` und die betroffenen Shards. Ein Scheduler ist nicht aktiviert (O-2).
