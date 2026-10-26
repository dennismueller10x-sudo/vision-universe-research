# Firmeneigene XBRL-Konzepte (geprüfte Erweiterungen)

Stand: 26.10.2026. Konfiguration: `quant/config/sec-issuer-extensions.json`, Code: `scripts/quant/sec/issuer_extensions.py`,
Tests: `scripts/quant/tests/test_issuer_extensions.py`.

## Problem

`companyfacts.zip` enthält nur Standard-Taxonomien (us-gaap, ifrs-full, dei, srt …). Meldet ein Emittent eine Position mit
einem eigenen Konzept, fehlt sie dort vollständig. NVIDIA weist den Investitionsabfluss der Kapitalflussrechnung
(„Purchases related to property and equipment and intangible assets“) in den 10-K für die Geschäftsjahre 2013 bis 2021 nur
als `nvda:PurchasesOfPropertyAndEquipmentAndIntangibleAssets` aus. Damit fehlten Investitionen und freier Cashflow für neun
Jahre (Lücke 2013–2021 in `docs/FUNDAMENTAL_HISTORY_DEPTH.md`).

Die Financial Statement Data Sets helfen hier nicht: sie runden das Periodenende auf das Monatsende, und `fsds.py` ergänzt
deshalb keine Emittenten mit 52/53-Wochen-Kalender (NVIDIA schließt Ende Januar an einem Sonntag ab).

## Regel

Eine Erweiterung ist **keine generische Zuordnung**. Die Metric Registry bleibt unverändert (Mapping 1.7.0) und kennt
weiterhin nur Konzepte, die für jedes Unternehmen dasselbe bedeuten. Eine Erweiterung …

- gilt nur für **ihre CIK** (`MetricRegistry.attach_issuer_rules`, `metrics_for_concept(…, cik=)`), nie für ein anderes
  Unternehmen, auch nicht bei gleichem Konzeptnamen;
- darf keine Standard-Taxonomie umdeuten (`us-gaap`, `ifrs-full`, `dei`, `srt` … werden beim Laden abgewiesen);
- hat eine **niedrigere Priorität als jedes generische Konzept** ihrer Kennzahl (900 gegenüber höchstens 200). Meldet
  dieselbe Meldung ein akzeptiertes Standard-Konzept, gewinnt es;
- wird nur aufgenommen, wenn das Konzept in den Jahren, in denen der Emittent zusätzlich ein generisches Konzept meldet,
  **wertgleich** ist (`evidence.overlap`, im Test geprüft);
- liest Werte aus den **gepinnten Instanzdokumenten** der Meldungen selbst (Accession, Dateiname, SHA-256). Ein Dokument,
  das nicht ladbar ist oder vom Pin abweicht, wird nicht gelesen; die Lücke bleibt, der Datenlauf läuft weiter;
- übernimmt nur Werte ohne Dimension (kein Segment, kein Szenario) in der Einheit der Regel, und nur für Meldungen, die
  companyfacts kennt. Geschäftsjahr, Form und Einreichungsdatum kommen von dort, also dieselbe Point-in-Time-Logik wie
  für jeden anderen Wert;
- behält die Herkunft: der Wert trägt `nvda:…` als Konzept (`conceptsUsed`), das Bündel nennt die ergänzten Meldungen in
  `dataSource.issuerExtensions`.

Nichts wird geschätzt, umbenannt oder aufgefüllt.

## Nachweis für NVIDIA (CIK 0001045810)

| Geschäftsjahr bis | nvda-Konzept | generisches Konzept | generischer Wert (Meldung) |
|---|---|---|---|
| 30.01.2011 | 97,890 Mio. | `PaymentsToAcquirePropertyPlantAndEquipment` | 97,890 Mio. (0001045810-12-000013) |
| 29.01.2012 | 138,735 Mio. | `PaymentsToAcquirePropertyPlantAndEquipment` | 138,735 Mio. (0001045810-12-000013) |
| 30.01.2022 | 976 Mio. | `PaymentsToAcquireProductiveAssets` | 976 Mio. (0001045810-24-000029) |
| 29.01.2023 | 1.833 Mio. | `PaymentsToAcquireProductiveAssets` | 1.833 Mio. (0001045810-24-000029) |

Gepinnt sind die elf 10-K von 2013 bis 2023 (0001045810-13-000008 … 0001045810-23-000017).

### Quellprüfung je 10-K (26.10.2026, Dateien der Meldungen selbst)

Für alle elf gepinnten 10-K (2013–2023) aus der Label-, der Berechnungs- und der Instanzdatei der jeweiligen Meldung:

- **Bezeichnung** (`nvda-*_lab.xml`): durchgehend „Purchases of property and equipment and intangible assets“ (ab 2021 als Zeilentext „Purchases related to property and equipment and intangible assets“). Die Dokumentation ist die Definition des Investitionsabflusses für Sachanlagen und immaterielle Vermögenswerte ohne Goodwill, also dieselbe wie bei `us-gaap:PaymentsToAcquireProductiveAssets`, das die Registry bereits akzeptiert und NVIDIA ab GJ 2022 meldet.
- **Stellung in der Kapitalflussrechnung** (`*_cal.xml`): in jeder Meldung ein direkter Bestandteil von `us-gaap:NetCashProvidedByUsedInInvestingActivities` mit Gewicht −1, also die Investitionszeile des Investitions-Cashflows. In keiner Meldung gibt es daneben eine zweite Sachanlagen- oder Investitionszeile; Doppelzählung oder Auswahl zwischen zwei Zeilen ist damit ausgeschlossen.
- **Rechnerische Gegenprobe** (Instanz): Für jede Meldung und jedes der drei berichteten Geschäftsjahre (33 Perioden) ergibt die Summe aller Bestandteile mit ihren Gewichten exakt den gemeldeten Investitions-Cashflow.
- **Zeitliche Konsistenz** (Consumer-Lauf mit der Erweiterung): Für jedes Geschäftsjahr 2010–2026 gilt Free Cashflow = operativer Cashflow − Investitionen auf den Dollar, mit demselben Periodenende. Jeder Investitionswert nennt seine Meldung (Accession, Einreichungsdatum; Politik „as of latest“: die jüngste Meldung, die das Jahr enthält).

GJ 2008 und 2009 bleiben ohne Investitionen: Dafür gibt es keine gepinnte Meldung (die ersten XBRL-10-K von NVIDIA stammen von 2010/2011, ihre Werte stehen bereits in companyfacts).

## Vorher / Nachher (NVIDIA-Bündel, companyfacts vom 26.10.2026)

Gerechnet mit `build_consumer_bundle(…, with_history=True)`, einmal mit und einmal ohne die gepinnten Dokumente.
Geändert sind **nur** `capital_expenditures` und das daraus abgeleitete `free_cash_flow` (Jahreswerte); Quartale, TTM und
alle anderen Kennzahlen sind identisch. Werte in Mio. USD, Stand „as of latest“ (jüngste Meldung je Jahr).

| GJ | Investitionen vorher | nachher | Free Cashflow vorher | nachher |
|---|---|---|---|---|
| 2010–2012 | 77,6 / 97,9 / 138,7 | unverändert | 410,2 / 577,9 / 770,4 | unverändert |
| 2013 | – | 183,3 | – | 640,9 |
| 2014 | – | 255 | – | 580 |
| 2015 | – | 122 | – | 784 |
| 2016 | – | 86 | – | 1.089 |
| 2017 | – | 176 | – | 1.496 |
| 2018 | – | 593 | – | 2.909 |
| 2019 | – | 600 | – | 3.143 |
| 2020 | – | 489 | – | 4.272 |
| 2021 | – | 1.128 | – | 4.694 |
| 2022–2026 | 976 / 1.833 / 1.069 / 3.236 / 6.042 | unverändert | 8.132 / 3.808 / 27.021 / 60.853 / 96.676 | unverändert |

Abdeckung Jahreswerte: Investitionen und Free Cashflow im Fenster 5 → 12 Jahre, in der Historie davor 3 → 5 Jahre.
GJ 2014 erscheint mit 255 Mio. statt 255,186 Mio., weil die jüngste Meldung dieses Jahres (10-K 2016) auf Millionen rundet.

### Chartwerte in Fundamental (NVIDIA, Jahresansicht)

Gerechnet mit `catalog.js` (`fromHistory`, `attachValuation`, `seriesOf`) aus der ausgelieferten Historie vor und nach der Erweiterung, also genau den Reihen, die die Oberfläche zeigt. Neu belegt sind nur die Jahre 2013–2021 (2022 bei der Wachstumsrate); kein vorher vorhandener Wert ändert sich, keine Quartalsreihe ändert sich.

| GJ | Investitionen | Free Cashflow | FCF-Marge | Investitionsquote | FCF je Aktie | FCF-Rendite | FCF-Wachstum |
|---|---|---|---|---|---|---|---|
| 2013 | 183,3 Mio. | 640,9 Mio. | 15,0 % | 4,3 % | 1,03 | 8,2 % | −16,8 % |
| 2014 | 255,0 Mio. | 580,0 Mio. | 14,0 % | 6,2 % | 0,98 | 5,7 % | −9,5 % |
| 2015 | 122,0 Mio. | 784,0 Mio. | 16,7 % | 2,6 % | 1,39 | 6,3 % | +35,2 % |
| 2016 | 86,0 Mio. | 1.089,0 Mio. | 21,7 % | 1,7 % | 1,91 | 6,0 % | +38,9 % |
| 2017 | 176,0 Mio. | 1.496,0 Mio. | 21,6 % | 2,5 % | 2,31 | 2,6 % | +37,4 % |
| 2018 | 593,0 Mio. | 2.909,0 Mio. | 29,9 % | 6,1 % | 4,60 | 2,0 % | +94,5 % |
| 2019 | 600,0 Mio. | 3.143,0 Mio. | 26,8 % | 5,1 % | 5,03 | 3,3 % | +8,0 % |
| 2020 | 489,0 Mio. | 4.272,0 Mio. | 39,1 % | 4,5 % | 1,73 | 2,4 % | +35,9 % |
| 2021 | 1.128,0 Mio. | 4.694,0 Mio. | 28,1 % | 6,8 % | 1,87 | 1,5 % | +9,9 % |
| 2022 | unverändert | unverändert | unverändert | unverändert | unverändert | unverändert | neu +73,2 % |

Vorher stand in allen Feldern 2013–2021 „keine Angabe“. Free Cashflow je Aktie folgt wie der Gewinn je Aktie der gemeldeten Aktienzahl ohne Split-Bereinigung (4:1-Split 2021: GJ 2019 → 2020; die Oberfläche kennzeichnet Splits wie bisher).

### Andere Produktwelten (Neubau vorher/nachher am selben Stand, nur Zeitstempel ausgenommen)

- **Discover:** von 7.116 Dateien ändert sich nur `stocks/US_REAL/NVDA.json` – die 10-Jahres-Vergleichszeile „Free Cashflow“ (GJ 2016 → 2026) erscheint, die FCF-Spur im Zeitverlauf beginnt GJ 2015 statt 2022. Ranglisten, Reihen und alle anderen Titel unverändert.
- **Capability-Matrix, Product-Capabilities:** inhaltlich unverändert.
- **Quant Factor Evidence:** alle 642 Scherben inhaltlich unverändert (Faktoren nutzen TTM und die letzten drei Jahre).
- **Supertrader:** liest weder Investitionen noch Free Cashflow (`scripts/supertrader/build.mjs`, `keepA`) – unverändert.
- **Company Intelligence:** nutzt Quartale/TTM, die sich nicht ändern.

## Wirkung auf andere Leser

Das Consumer-Bündel lesen Discover, Quant, Supertrader und Company Intelligence. Für jedes andere Unternehmen bleiben alle
Werte gleich (Test `test_without_extension_facts_the_bundle_is_unchanged`: ohne Erweiterungsfakten ist das Bündel mit und
ohne Regeln identisch). Geändert ist dort nur der Versionsstempel `versions.normalization_logic` 1.12.0 → 1.13.0: normalize.py
hat sich geändert, und die Versionsdisziplin (`test_version_discipline.py`) verlangt den Sprung, damit gespeicherte
Factbooks neu normalisiert werden. Für NVIDIA erscheinen im Fenster die Jahre 2015–2021 neu bei Investitionen und Free
Cashflow, in der Historie 2013–2014.

## Eine weitere Erweiterung aufnehmen

1. Konzept in den Instanzdokumenten messen, nicht aus dem Gedächtnis übernehmen.
2. Überschneidung mit einem generischen Konzept nachweisen (mindestens zwei wertgleiche Jahre) und in `evidence.overlap`
   eintragen.
3. Meldungen mit Accession, Dokument und SHA-256 pinnen.
4. Vorher/Nachher-Vergleich im PR; eigener PR (Fachmodell-Regel aus `CLAUDE.md`).
