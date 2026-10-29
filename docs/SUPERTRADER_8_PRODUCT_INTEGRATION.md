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
| C01 | Turtle S1 | `methods/turtle.mjs#entryTrigger` + Filter-Tracker | Ausbruch über das 20-Tage-Hoch am Stichtag (Filter, 55-Tage-Failsafe) | MODELED | 293 (43 / 250 / 0) | nein, Owner-Entscheidung O-1 |
| C02 | Turtle S2 | wie C01 | Ausbruch über das 55-Tage-Hoch am Stichtag | MODELED | 232 (22 / 210 / 0) | nein, O-1 |
| C03 | Darvas | `research/darvas-lifecycle.mjs` (REF) | stehende Box am Hoch des Tagesfensters | MODELED | 237 (237 / 0 / 0) | nur wenn das Allzeithoch mit Tageshochs über die ganze Listing-Historie belegt ist (heute keiner; O-7) |
| C04 | Weinstein Investor | `methods/weinstein.mjs#investorScreen` | Ausbruch aus der Basis in der letzten abgeschlossenen Woche | CHART | 423 (423 / 0 / 0) | – |
| C05 | Weinstein Trader | `#traderScreen` | Fortsetzungsausbruch in der letzten abgeschlossenen Woche | CHART | 380 (380 / 0 / 0) | – |
| C06 | Minervini SEPA/VCP | `methods/minervini.mjs#trendTemplate` + VCP-Proxy | Trend Template 1–7 am Stichtag | CHART | 644 (644 / 0 / 0) | – |
| C07 | Minervini Power Play | `research/minervini-lifecycle.mjs#powerPlaySetupAt` + `entryEligibility` | Flagge nach +100 % in unter 40 Sitzungen | MODELED | 23 (16 / 2 / 5) | Buy-Stop-Limit am Pivot, Struktur-Stop |
| C08 | Kullamägi Breakout | `research/kk-breakout-lifecycle.mjs` (Setup-Konvention CONSOLIDATION_10) + `methods/kullamagi.mjs#momentumRanks` (nur Rangfolge) | Ausbruch am Stichtag | MODELED | 44 (27 / 0 / 17) | nur wenn das beste 1/3/6-Monats-Momentum-Perzentil im Forschungsuniversum ≥ 98 ist. Das ist eine ausdrücklich modellierte Research-Lesart (`MI-SF8-KK-MOMENTUM-P98`, O-6), keine Originalregel und kein Ausschluss. |
| C09 | KK Episodic Pivot | `research/kk-ep-lifecycle.mjs#epChartCandidate` | Gap ≥ 10 % am Stichtag | CHART | 21 (21 / 0 / 0) | – (Katalysator, Intraday DATA_BLOCKED) |
| C10 | KK Parabolic Short | `research/kk-ps-study.mjs#psChartCandidate` | beschleunigte Aufwärtsserie (Handelstag t+1) | CHART | 7 (7 / 0 / 0) | – (Short, Borrow DATA_BLOCKED) |
| C11 | Pocket Pivot | `methods/morales-kacher.mjs#pocketPivotAt` | Volumensignatur am Stichtag | CONFIRMED | 369 (9 / 360 / 0) | – (Stop nicht in der Quelle) |
| C12 | Buyable Gap-Up | `methods/morales-kacher.mjs#gapUpAt` + `research/moka-lifecycle.mjs` | Gap ≥ 0,75 × ATR(40) | MODELED | 176 (137 / 22 / 17) | nächste Eröffnung, Stop Gap-Tag-Tief |
| C13 | Holy Grail | `research/holy-grail-lifecycle.mjs` (W-RAS97) | Rücksetzer an die EMA20 bei ADX > 30 | CONFIRMED | 190 (46 / 144 / 0) | – (Trailing nicht in der Quelle) |

Insgesamt 3.039 Kandidaten (2.012 Chart, 988 bestätigt, 39 modelliert, 0 validiert; Lauf mit Stand 23.10.2026, nach Umsetzung von O-1 bis O-7) aus 5.100 Titeln mit Tagesreihe. 118 Titel waren DQ-FAIL:
- 104 mit Kurslücken;
- 7 veraltet;
- 7 inaktiv.

Kein Datensatz wurde vom Vertrag abgelehnt.

Datenbedarf je Strategie (`STRATEGY_DATA_NEEDS`, mindestens 30 bis 252 Sitzungen) liegt vollständig im Tagesfenster von 270 Sitzungen.

### Abweichungen gegenüber den Research-Läufen (bewusst, dokumentiert)

| Abweichung | Wirkung | Behandlung |
|---|---|---|
| Tagesfenster 270 Sitzungen statt Historie ab 2015 | Allzeithoch (Darvas) nicht über die ganze Historie prüfbar, S1-Filterzustand aus dem Fenster | DAR-SF-ATH gilt nur als erfüllt, wenn der Listing-Beginn im Fenster liegt; lange Wochenschlüsse sind nur Gegenbeleg. Sonst höchstens CHART (O-7) |
| Kein Rohkurs / `splitAdj` | Universumsgrenze 5 USD und "ein Cent" auf adjustierter Reihe | als DQ-Detail ausgewiesen |
| Quarantäne-Rückblick 400 Tage > 389 Tage Fenster | Rest des Rückblicks (11 Tage) ohne Tagesbalken | Wochenschlüsse (Relation ≥ 3 oder ≤ 1/3) erkennen bleibende Niveausprünge (nicht erklärte Splits), aber KEINE Spitzen, die sich in derselben Woche umkehren; keine Obermenge der Tagesregel. Fehlt die Reihe, ist sie nicht echt/split-adjustiert oder endet sie vor dem Fenster: CAP CHART |
| "Nächste Sitzung" (Weinstein-Woche, PS-Handelstag) | Engine liest Datum der Folgesitzung | Platzhalter ohne Kurswerte; Test vergleicht mit dem echten Folgebalken und mit "lauten" Platzhalterwerten |
| KK-SF-BO-MOMENTUM "Top 1–2 %" | laut Vertrag Rangfolge (`gate: false`), Schwelle nicht freigegeben | O-6: Perzentil ≥ 98 als eigene, gekennzeichnete Research-Lesart. Die Karte zeigt sie als Interpretation, nicht als Quellregel. Darunter wird der Titel weiter erkannt (Chart-Kandidat mit Begründung), aber nicht ausgeschlossen. Referenzen bleiben unverändert. |
| Turtle-Einstieg intraday am Stichtag | kein Folgesitzungsplan ohne neue Einstiegsregel | O-1: keine neue Einstiegsregel; Turtle bleibt beim bestätigten Research-Setup |

## 3. Datenqualitätsvertrag (`sf8-data-quality-1.1.0`)

Fail closed für die Aussage, nicht für die Plattform:
- `FAIL`: nicht bewertet, Grund gespeichert;
- `CAP`: höchstens bis zu einer Stufe;
- `INFO`: nur Kennzeichnung.

| Prüfung | FAIL | CAP |
|---|---|---|
| Identität | kein `EQUITY_COMMON`, inaktiv | Typ oder Status nicht im Security Master, Reihe im Rückblick nach Listing-Unterbrechung neu begonnen, SEC-SIC 6770 "Blank Checks" (Mantelgesellschaft, CHART; O-5). Ein SPAC-Name allein ist nur ein unsicherer Hinweis (INFO), kein Ausschluss |
| Aktualität | letzter Balken ≠ Marktstichtag | – |
| OHLCV | nicht endlich, High < Low, Tief ≤ 0, Eröffnung oder Schluss außerhalb der Spanne, Datum nicht streng aufsteigend | – |
| Handelstage (XNYS) | mehr als 5 fehlende Sitzungen, Balken an Nicht-Sitzung | 1–5 fehlende Sitzungen (CHART) |
| Adjustierung (ADR-002) | Abgleich ≠ PASS, nicht adjustiert | Abgleich unbekannt (CHART) |
| Preisabgleich V4 (ADR-002, ab `sf8-data-quality-1.1.0`) | Schluss am Stichtag ≠ veröffentlichter Schluss (`published-close.js`, nach `roundClose`, ohne Toleranz), Referenzreihe fehlt, vertragswidrig, veraltet oder neuer, Identität (securityId, Ticker, US-Listing, USD) abweichend | Verlauf ungeklärt: Abweichung, die keine Rundung vor einem Split ist, oder Sitzung nur in einer Reihe (CHART). Rundung vor einem Split ist INFO |
| V4-D1-Quarantäne | – | DQ-K5/DQ-K3 im 400-Tage-Rückblick (CHART) |
| Rückblicksabdeckung | – | Wochenreihe fehlt oder springt (CHART) |
| Liquidität (#705-Universum) | – | unter 5 USD oder 1 Mio. USD Tagesumsatz: kein Plan (CONFIRMED) |
| Historie je Strategie | zu kurz für die Engine: keine Erkennung | – |

Der Preisabgleich steht in [SUPERTRADER_8_PRICE_PARITY_V4.md](SUPERTRADER_8_PRICE_PARITY_V4.md), mit Vorher/Nachher-Vergleich.

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

**Beta seit 29.10.2026 (Owner-Freigabe, kontrollierter Livegang der Oberfläche).** `supertrader.js` lädt `sf-research.js` und `sf-research.css` auf Start, Methoden und Aktienseite ohne Vorschau-Schalter; `?sfPreview` gibt es nicht mehr. Jede Ansicht mit Daten trägt die Zeile „Beta · Research, keine Empfehlung · Datenstand …“; liegt die auf den Stand folgende Sitzung zurück, heißt sie „nicht aktuell, kein Hinweis für heute“ (in Warnfarbe). Die Überschriften sagen „Erkannte Aktien“ und „am Stichtag“, nie „heute“. Kurse sind als „Tiingo, Inc.“ ausgewiesen (Lizenzbedingung, Owner-Erklärung vom 13.09.2026). Ohne veröffentlichten Datenlauf zeigt jede Ansicht den Leerzustand „Research-Kandidaten folgen“; die Daten selbst bleiben an die Freigabe des Tageslaufs gebunden (Registry `PREPARED_DISABLED`, Variable `SF8_CANDIDATES_ENABLED`, Commit-Sperre).

**Zugriffsschutz.** Der Schalter ist keine Zugriffskontrolle (ein URL-Parameter kann das nicht sein; siehe auch `docs/RESEARCH_ACCESS_GATE.md`: Daten- und Asset-Dateien sind direkt abrufbar). Geschützt ist nur, was nicht ausgeliefert wird. Deshalb liegt in keinem der PRs eine Kandidatendatei unter `supertrader/data/sf-candidates/`, und `scripts/vu2/build-release.mjs` übernimmt nur Dateien, die git verfolgt. Die Branch-Vorschau auf Cloudflare zeigt deshalb nur den Leerzustand. Die befüllte Vorschau lief lokal und isoliert. Ein Commit von Kandidaten wäre eine Veröffentlichung und ist an die Freigaben des Tageslaufs gebunden (`docs/SUPERTRADER_8_DAILY_RUN.md`). Fehlen bei eingeschalteter Vorschau die Daten, zeigt jede Ansicht einen gekennzeichneten Leerzustand.

Je Kandidat sichtbar: erfüllte und nicht erfüllte Regeln, ausstehende Lesarten, Gründe der Stufe, bei MODELED die durch Modellannahmen ersetzten Regeln, aufklappbar die offenen Ermessensregeln und die Sperrgründe der höheren Stufen. Einstiegs- und Stop-Marken erscheinen nur im modellierten Ablauf. Sprache:
- Die Stufen heißen nach O-3: 1 "Chart-Kandidat", 2 "Bestätigtes Research-Setup", 3 "Modellierter Handelsablauf", 4 "Geprüfte Handelsfreigabe" (gesperrt). Jede Stufe hat eine Kurzerklärung. Die Bezeichnungen kommen aus `catalog.mjs#STAGE_LABELS` über `summary.json`.
- Nach O-4 erscheinen alle 13 Strategien. Minervini (C06), Episodic Pivot (C09) und Parabolic Short (C10) tragen ihre Modell- und Datengrenzen hervorgehoben. Katalysatoren, Borrow-Daten und Originalregeln werden nicht erfunden.
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

**Visuelle QA der befüllten Vorschau** (`scripts/supertrader/sf8-visual-qa.mjs`, echte Kandidaten vom 23.10., lokal und isoliert): 8 Ansichten × iPhone 14/Desktop × Dunkel/Hell, das sind 32 Aufrufe ohne Fehler und ohne horizontales Scrollen. Geprüft wurden:
- keine internen Codes, keine unzulässige Sprache;
- kompakte iPhone-Karte höchstens 363 px hoch (Grenze 380 px);
- Details aufklappbar, Dock, Chart, Vorschau-Hinweis, Datenherkunft und vierstufige Legende vorhanden;
- hervorgehobene Grenzen bei C06 und C10;
- Leerzustände.

Die Aufnahmen liegen als private Galerie vor; sie werden nicht über die Seite ausgeliefert. **WebKit/Safari ist offen:** In der Umgebung gibt es nur Chromium. Die Safari-Freigabe ist nicht erteilt.

**Browser-QA** (`scripts/supertrader/browser-qa.mjs`, Chromium; iPhone 14 emuliert und Desktop 1280):
- mit Vorschaudaten: 62 Aufrufe, 0 Fehler;
- ohne Datenlauf: 62 Aufrufe, 0 Fehler.

Neue Prüfungen:
- Stufenabzeichen je Karte;
- kein Plan außerhalb MODELED;
- keine unzulässige Sprache;
- Research-Chart gezeichnet;
- Leerzustand ohne Daten.

Ohne Vorschaudaten prüft die QA, dass keine Seite die Research-Ansicht zeigt oder ihre Dateien anfragt. Interne Codes werden in der Research-Ansicht über `textContent` gesucht, also auch in zugeklappten Details. WebKit ist in der Build-Umgebung nicht installiert; das iPhone wird mit Chromium-Geräteemulation geprüft.

**Performance:**
- mit eingeschalteter Vorschau: Startseite +38 KB (gzip) und ca. +45 ms; ohne Schalter 0 Byte und keine Anfrage;
- Strategieansicht ≤ 131 KB (gzip);
- Aktienanalyse ca. 5 KB;
- neuer Code `sf-research.js` 28,6 KB (9,5 KB gzip) und `sf-research.css` 7,7 KB.

**Lauf:**
- 25 s für 5.100 Titel und 13 Strategien (14 s Laden, 10,5 s Rechnen);
- 0 Netzwerkanfragen, 0 API-Kosten.

**Unabhängiges Review** (rein lesend, eigene Gegenproben): 2 HIGH, 5 MEDIUM, 6 LOW. Alle sind behoben oder als Owner-Entscheidung festgehalten:

| Befund | Behandlung |
|---|---|
| H1 Frontend trotz offener Freigaben | Vorschau-Schalter, Standard aus; Test `research-preview` und Browser-QA |
| H2 KK-Momentum als Ausschluss mit nicht freigegebener Schwelle | O-6: Perzentil ≥ 98 nur als gekennzeichnete Research-Lesart; kein Ausschluss (Test `KK-MOMENTUM`) |
| M1 OHLCV ließ Eröffnung außerhalb der Spanne, Tief ≤ 0, doppelte oder vertauschte Balken durch | strengere Prüfung mit Tests |
| M2 Order-Marken außerhalb MODELED | nur Chartmarke, Plan-Marken nur in MODELED |
| M3 keine Offenlegung je Kandidat | Modellannahmen, offene Regeln, Sperrgründe je Karte |
| M4 Allzeithoch auf Wochenschlüssen, Wochenreihe ungeprüft, "Obermenge" falsch | ATH fail closed (O-7), Metadatenprüfung, Kommentar korrigiert |
| M5 interne Codes sichtbar, QA-Muster zu eng | Texte bereinigt, QA erweitert |
| L1–L6 | Failsafe nicht als erfüllt angezeigt, stille Pässe entfernt, `--out` nur außerhalb des Repositorys, Lookahead-Test mit künftigem Wochenschluss, Referenzkurs bei Eröffnungs-Einstieg; `price.close` gegen `published-close.js` bleibt Aktivierungsvoraussetzung (Vertrag §5.4) |

Der Vorschlag des Reviews, den Isolationstest `SF-PRODUCT-NO-RUN-INTEGRATION` auf `sf-candidates|STResearch` zu erweitern, ist nicht umgesetzt: Er würde die abgeschaltete Vorschau selbst verbieten. Mit O-3/O-4 bleibt die Vorschau im Code. Der Schutz besteht darin, dass keine Daten ausgeliefert werden, siehe Abschnitt 6. Für den deaktivierten Tageslauf ist der Test genau für dessen Workflow geöffnet (`SF8-DAILY-DISABLED`).

**Zweites unabhängiges Review** (26.10.2026, rein lesend, auf dem ganzen Stapel A–D):
- Gegenproben: voller Lauf mit 3.039 Kandidaten (bitgleich wiederholt), Eingangsprüfung STALE/CURRENT, `--out` im Repository verweigert.
- Die Bereiche Stufen-Obergrenzen, Lookahead, Quarantäne (80 Ansichten mit V4-D1-Sitzungen, keine über CHART), Referenzschutz, Strategie-Identitäten, O-1 bis O-7, Ranking, Datenverträge, Vorschau-Schalter und Budgets sind ohne Befund.

| Befund | Behandlung | Nachweis |
|---|---|---|
| BLOCKING: Die Ansicht trug unterhalb von MODELED `levels.trigger`/`stopReference` (Turtle, Darvas, Weinstein, Holy Grail, BGU, Power Play) | Unterhalb von MODELED geht nur Chartstruktur in die Ansicht (`records.mjs#chartMarks`, `STRUCTURE_LEVELS`). Kennzahlen, aus denen sich Order oder Stop zurückrechnen ließen, entfallen (`ORDER_DERIVED_FEATURES`). | Test `SF8-NO-ORDER-LEVELS-BELOW-MODEL`, rot auf dem alten Stand. Voller Lauf: 0 von 2.012 + 988 Ansichten mit Order- oder Stopmarke; Zahlen unverändert. |
| HIGH: Als "Pivot" angezeigte Einstiegsorder (C01/C02, C03, C04/C05, C13) | Die Marke ist jetzt die Struktur (Boxoberkante, Wochenwiderstand). Für Turtle und Holy Grail gibt es unterhalb von MODELED keine Marke. In der Oberfläche heißt sie "Chartmarke". | wie oben; Browser-QA und visuelle QA grün |
| MEDIUM: Commit ohne Registrierung in `domains.json` möglich | Der Workflow bricht vor dem Commit ab, solange der Pfad nicht registriert ist. | `SF8-DAILY-DISABLED` mit Gegenprobe |
| MEDIUM: Eingangsprüfung nur für Tagesbalken | Höchstalter für Wochenreihen, Kontinuität, SIC, Namen und Stammdaten (`AUX_MAX_AGE_DAYS`) | `SF8-GATE-AUX` |
| LOW: veraltete Plan-Texte, O-6-Zeile unter "Warum erkannt" auch unter p98, interne Version in der Herkunft, `Cxx` als Ersatzname | behoben (C) | visuelle QA: 0 Codes |
| LOW: `--as-of` schneidet keine Stammdaten | dokumentiert (`SUPERTRADER_8_DAILY_RUN.md`, "Bekannte Grenze"); betrifft den Tageslauf nicht | – |
| LOW: C10 nennt nur "ADR 20" als erfüllte Regel | Bleibt so. Die Beschleunigung (`KK-SF-PS-ACCEL`) ist im Vertrag keine mechanische Regel; sie als erfüllt auszuweisen, würde den Datensatz ungültig machen (Gegenprobe: C10 fiel heraus). Das Muster heißt in der Karte "beschleunigte Aufwärtsserie". | Golden-Test |

### C08 Kullamägi Breakout: Nachweis der 17 modellierten Abläufe (Stand 23.10.2026)

**Warum vorher 44 / 0 / 0 und jetzt 27 / 0 / 17.** Im Produktvertrag ist `KK-SF-BO-MOMENTUM` die einzige mechanische Setup-Regel von C08 (`ruleClasses`). Alle übrigen Regeln (Größe, Setup, Einstieg, Teilausstieg, Trailing) sind Ermessensregeln, die im Plan durch die Modellannahmen der Referenz ersetzt werden.

Solange O-6 offen war, galt die Momentum-Regel nie als erfüllt, deshalb war C08 höchstens Chart-Kandidat. Mit O-6 gilt sie als erfüllt, wenn das beste 1/3/6-Monats-Perzentil im Forschungsuniversum mindestens 98 ist. Das ist eine gekennzeichnete Research-Lesart (`MI-SF8-KK-MOMENTUM-P98`), keine Originalregel. Darunter bleibt der Titel Chart-Kandidat und wird nicht ausgeschlossen. Keine Strategieregel und keine Referenz wurde dafür geändert.

**Prüfung gegen die Vorgaben:**

| Prüfpunkt | Befund |
|---|---|
| 7.0-Readiness | Die Obergrenze von C08 ist `MODELED_TRADE_PLAN`. Die Sperren gelten nur für `VALIDATED_TRADE_SIGNAL`. |
| Zulässige mechanische Regeln | Nur `KK-SF-BO-MOMENTUM` ist mechanisch. Die Setup-Erkennung ist die deklarierte Modellannahme `MA-KK-SETUP-PROXY` (CONSOLIDATION_10) der Referenz: Schluss über dem Hoch der 10 Vortage, Vorlauf mindestens 30 % aus dem Tief der 63 Sitzungen davor, 10- und 20-Tage-Linie steigend. |
| Plan | Er stammt unverändert aus `KK_BREAKOUT_ADAPTER.eligibility` mit der 7.0-Referenz `REF`: Einstieg zur nächsten Eröffnung (Owner-Entscheidung 23.10.2026, `STRATEGY-SF5-LIFECYCLE.json`), Stop am Tief des Ausbruchstags, höchster geplanter Verlust ADR20. |
| O-6 | Momentum ≥ 98 entscheidet nur über die Stufe. In der Research-Simulation der Referenz wurde Momentum nie zur Auswahl benutzt (`sf5-lifecycle-matrix`: Rangfolge). Die Produktstufe verlangt die Regel, weil der Vertrag sie als einzige mechanische Setup-Regel führt. |
| Drei Stufengrenzen | Reichweite der Erkennung: MODELED (Regel erfüllt, Plan vorhanden). Readiness: MODELED. DQ: alle 17 PASS, alle im Forschungsuniversum #705, keine Quarantäne-Sitzung. |
| Universum | Es gilt dieselbe Konvention wie im Lifecycle für Einstiege zur Eröffnung: Mitgliedschaft am Schluss des Signaltags (`eligibleAtPriorSession(bars, i + 1)`). |
| Unabhängige Nachrechnung aus den Tagesbalken | Alle 17 mit eigenen Formeln nachgerechnet: Ausbruch, Vorlauf, steigende Durchschnitte, Momentum-Perzentil (höchstens 0,003 Punkte Abweichung), Stop = Tief, höchster Verlust = ADR20. Von den 27 Chart-Kandidaten haben alle das Setup, keiner erreicht 98, und 4 liegen außerhalb des Universums. |

**Korrigiert (Darstellung, nicht Stufe):** Die Referenzregel führt die Eröffnung nur aus, wenn sie über dem Stop und höchstens bei Stop × (1 + ADR20) liegt (`NOT_EXECUTED_PLANNED_LOSS_ABOVE_MAX`). Für 5 der 17 (ZS, ESTC, TENB, REPX, NABL) liegt der Schlusskurs schon über dieser Grenze; zu diesem Kurs wäre der Ablauf nicht ausführbar. Die Karte zeigte das bisher nicht.

Jetzt nennen Plan und Karte das Ausführungsfenster (`fillWindow`, `referenceInFillWindow`), und die Karte sagt ausdrücklich „Zum Schlusskurs nicht ausführbar“. Die Stufe bleibt, weil die Referenz die Order zum Signalschluss genau so bildet und erst an der Eröffnung entscheidet. Diese Prüfung auf den Schlusskurs vorzuziehen wäre eine neue Regel. Tests: `SF8-C08-FILL-WINDOW`, `SF8-C08-STAGE`.

**Auffälliger Fall BOLT:** Gap von 4,19 auf 6,98 $ bei dem 454-fachen Volumen. Erst der Signaltag hebt den Titel über die 5-$-Grenze und die Umsatzgrenze des Universums. Das folgt mechanisch aus der Referenzkonvention und ist keine Sonderbehandlung. Fachlich ähnelt es eher einem Episodic Pivot, wird hier aber nicht umgedeutet.

**Grenzfall PCOR:** Das beste Perzentil ist genau 98,00 (1-Monats-Rang). Die Schwelle gilt inklusive.

| Titel | Schluss | Konsolidierungshoch (10 T.) | Vorlauf | bestes Momentum-Perzentil | Stop = Tief Ausbruchstag | Risiko ab Schluss | ADR20 = höchster geplanter Verlust | Schluss im Ausführungsfenster | Volumen ggü. 50 T. |
|---|---|---|---|---|---|---|---|---|---|
| BOLT | 6,27 | 4,68 | 32,6 % | 99,80 | 5,99 | 4,47 % | 9,73 % | ja | 454,5× |
| NTWK | 7,86 | 7,83 | 48,2 % | 99,73 | 7,57 | 3,69 % | 7,48 % | ja | 2,1× |
| APPN | 52,35 | 51,38 | 82,8 % | 99,60 | 50,66 | 3,23 % | 6,30 % | ja | 1,7× |
| AMPL | 17,42 | 17,11 | 108,5 % | 99,50 | 16,76 | 3,79 % | 4,66 % | ja | 1,2× |
| TTAN | 87,06 | 86,79 | 37,0 % | 99,37 | 84,23 | 3,25 % | 5,19 % | ja | 0,6× |
| RPD | 14,91 | 14,77 | 58,4 % | 99,27 | 14,52 | 2,62 % | 6,70 % | ja | 1,8× |
| PAYC | 274,59 | 273,37 | 69,8 % | 99,13 | 269,10 | 2,00 % | 2,97 % | ja | 0,8× |
| RSKD | 9,15 | 9,09 | 72,8 % | 98,97 | 8,77 | 4,21 % | 5,11 % | ja | 0,5× |
| ZS | 255,15 | 241,19 | 69,3 % | 98,93 | 234,19 | 8,21 % | 5,06 % | **nein** (bis 246,04) | 1,3× |
| HURN | 195,69 | 194,25 | 55,3 % | 98,73 | 193,89 | 0,92 % | 3,66 % | ja | 3,2× |
| ASAN | 12,02 | 11,64 | 56,1 % | 98,70 | 11,51 | 4,20 % | 6,08 % | ja | 0,7× |
| ESTC | 102,43 | 101,39 | 75,2 % | 98,63 | 97,00 | 5,30 % | 4,33 % | **nein** (bis 101,20) | 0,9× |
| INTA | 47,99 | 47,45 | 55,0 % | 98,53 | 46,49 | 3,14 % | 3,85 % | ja | 1,6× |
| TENB | 44,59 | 42,69 | 51,2 % | 98,53 | 41,67 | 6,56 % | 5,69 % | **nein** (bis 44,04) | 1,2× |
| REPX | 54,18 | 51,58 | 39,5 % | 98,50 | 51,14 | 5,62 % | 3,43 % | **nein** (bis 52,89) | 2,0× |
| NABL | 5,12 | 4,96 | 55,4 % | 98,07 | 4,83 | 5,66 % | 4,43 % | **nein** (bis 5,04) | 0,4× |
| PCOR | 63,00 | 62,89 | 37,0 % | 98,00 | 61,73 | 2,02 % | 3,93 % | ja | 1,2× |

## 8. Owner-Entscheidungen (26.10.2026)

| | Entscheidung | Umsetzung |
|---|---|---|
| O-1 | Keine neue verbindliche Next-Open-Einstiegsregel für Turtle. | C01/C02 bleiben höchstens beim bestätigten Research-Setup; kein Plan. |
| O-2 | Tageslauf als eigener, standardmäßig deaktivierter PR. Aktivierung erst, wenn die SEC-/Quant-Consumer-Pipeline nachweislich stabil ist und der Owner freigibt. | PR D mit `supertrader-sf8-candidates.yml` und `docs/SUPERTRADER_8_DAILY_RUN.md`. |
| O-3 | Die 4 Stufen des 7.0-Vertrags bleiben, mit deutschen Namen und Kurzerklärung. Keine Aufwertung zu Kauf- oder Verkaufssignalen. | `STAGE_LABELS`, Legende mit gesperrter Stufe 4. |
| O-4 | Alle 13 Strategien dürfen erscheinen. Minervini, Episodic Pivot und Parabolic Short zeigen ihre Grenzen deutlich. | `limits` je Strategie, hervorgehoben für C06/C09/C10. |
| O-5 | Name-basierte SPAC-Erkennung nur als unsicherer Hinweis; verlässliche Stammdaten bevorzugt. | SEC-SIC 6770 setzt die Obergrenze CHART, ein Namenstreffer ist nur INFO. |
| O-6 | Momentum-Perzentil ≥ 98 als eigene, ausdrücklich modellierte Research-Lesart, nicht als Originalregel und nicht als Ausschluss. | `KK_MOMENTUM_INTERPRETATION`; 17 modellierte C08-Abläufe. |
| O-7 | Nur vorhandene Kurs- und Listinghistorie. Allzeithoch-Prüfung nur, wenn sie vollständig ohne Bezahlabruf möglich ist. | Befund: Lange Tageshochs gibt es im Repository nur für 5 Titel und erst ab 2015. Vollständig prüfbar ist das Allzeithoch nur, wenn das Listing im Tagesfenster beginnt (umgesetzt). Sonst bleibt Darvas CHART; es gibt keine Näherung. |

## 9. Aktualisierung und Kosten

Die Eingaben entstehen bereits täglich in bestehenden Läufen:
- `technical-signals-v1` (Tagesschluss);
- `discover-series-long`;
- Security Master.

Ein Kandidatenlauf würde nach deren Commit einmal je Handelstag rechnen und kostet etwa 25 s CPU. Er fragt keinen Anbieter an. Die Ausgabe ist ohne Audit-Datensätze rund 13 MB roh; täglich ändern sich vor allem `summary`, `index` und die betroffenen Shards. Ein Scheduler ist nicht aktiviert. Der Tageslauf ist vorbereitet und deaktiviert (O-2, `docs/SUPERTRADER_8_DAILY_RUN.md`). Zum Consumer-Blocker: Der letzte SEC-Consumer-Lauf (40307188633, 26.10.2026 nach #963) war erfolgreich, und der Footprint-Test auf `main` ist grün. Ein einzelner Lauf ist aber kein Stabilitätsnachweis, deshalb bleibt die Aktivierung gesperrt.
