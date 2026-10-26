# Fundamental – Reichweite der Historie („Max“)

Stand: 25.10.2026. Untersuchung, warum „Max“ bei Apple, NVIDIA und anderen Unternehmen nur bis etwa 2014 reichte, und was dagegen umgesetzt ist.

## Ursache

| Stufe | Reichweite | Begrenzung |
|---|---|---|
| SEC companyfacts (Originalquelle, XBRL) | ab GJ 2006–2009 | **Quelle:** maschinenlesbare XBRL-Daten gibt es ab 2009 (XBRL-Pflicht). Die ersten 10-K enthalten Vorjahresspalten, deshalb reichen Werte bis 2006/2007 zurück. Ältere Jahresberichte gibt es nur als HTML oder Text. |
| Normalisierung (`scripts/quant/sec/normalize.py`, Faktenbuch) | alle Jahre der Quelle | keine; alle Jahre werden gleich geprüft |
| **Verbraucherdateien** (`quant/data/sec/consumer/CIK*.json`) | **letzte 13 Geschäftsjahre** | **Technisch:** `consumer.py#DEFAULT_ANNUAL_YEARS = 13` schneidet bei der Ausgabe ab (gedacht für zehn Vergleiche). Quartale: letzte 8 (`DEFAULT_QUARTERS`). |
| Kanonischer Faktenspeicher (`quant/data/sec/canonical`) | 12 Jahre, 5 Unternehmen | technisch (`--annual-years 12`); von Fundamental nicht gelesen |
| Fundamental-Release (`scripts/fundamental/build-history.mjs`) | wie Verbraucherdatei | keine eigene Begrenzung |
| Frontend (`fundamental/app.js`, `engine/catalog.js`) | alle gelieferten Jahre | keine; „Max“ zeigt alles, „10J“ bleibt fest 10 Jahre |
| Kursreihe (`discover-series-long`) | AAPL, MSFT, XOM ab 1990, NVDA ab 1999, TSLA ab 2010 | keine Begrenzung für die Bewertung |
| Datum des Jahresberichts (SIC-Verlauf, SEC Financial Statement Data Sets) | ab 2009 | **Quelle:** die Data Sets beginnen mit 2009q1; ein 10-K ohne XBRL steht nicht darin |

Die Grenze „2014“ ist also das 13-Jahres-Fenster der Verbraucherdateien, keine Quelllücke. Dieselbe Normalisierung liefert 5 bis 8 Jahre mehr.

## Umsetzung (dieser PR)

- **Ältere Jahre in eigener Datei:** Der Erzeuger schreibt die Geschäftsjahre vor dem Fenster nach `quant/data/sec/consumer-history/NN.json.gz` (`consumer.py#build_consumer_bundle(with_history=True)`, Schema `vu-consumer-history-1.0.0` je Emittent; 64 gzip-Scherben nach CIK mod 64, Schema `vu-consumer-history-shard-1.0.0`, byte-reproduzierbar).
  - Gleiche Normalisierung, gleiche Politik (`as_of_latest`), gleiches Zeilenformat mit Meldung je Wert.
  - Die Verbraucherdateien bleiben byte-gleich (getestet). Discover, Quant, Supertrader und Company Intelligence lesen weiter genau ihr Fenster.
  - Die Datei hat kein Laufdatum und keinen Zeitstempel. Sie ändert sich nur, wenn sich ein altes Jahr ändert, das Repository behält also eine Kopie.
- **Fundamental-Release:** `build-history.mjs#withConsumerHistory` legt die älteren Jahre vor die Jahresreihen und prüft sie wie das Fenster.
  - Passt eine Historie nicht genau zur Verbraucherdatei (CIK, Lauf, Politik, Einheit, Jahr im Fenster), bleibt es beim Fenster.
  - Eine ungültige Zeile verwirft die Kennzahl, nicht still einen Teil davon.
- **Datum des Jahresberichts nur aus dem Bericht dieses Geschäftsjahres** (`publicationDates`).
  - Bisher galt: das erste 10-K innerhalb von 400 Tagen nach dem GJ-Ende. Fehlte das eigene 10-K, war das der Bericht des Folgejahres, und die Bewertung kombinierte einen veralteten Gewinn mit einem späteren Kurs.
  - Jetzt gilt zusätzlich: spätestens am nächsten Geschäftsjahresende (nach Datum, nicht nach Beschriftung).
  - Auswirkung im heutigen Bestand: 39 von 41.939 Daten entfallen, keines wird verschoben, überwiegend ausländische Berichterstatter (BNS, TD, RY, BMO, NVS …). Mit längerer Historie wäre es z. B. Apple GJ 2008 gewesen.

Die Daten entstehen erst im nächsten Lauf von `sec-consumer-fundamentals.yml` nach dem Merge (montags oder per `workflow_dispatch`). Dieser PR bringt keine Daten mit.

## Vorher / Nachher

Gerechnet mit dem Release-Code (Projektion, Kennzahlkatalog und geprüfte Bewertung: Kurs nach dem 10-K, Split-Belege, Gegenproben). Datenstand: Verbraucherdateien vom 25.10.2026; companyfacts vom 25.10.2026 für die Historie. „Quelle“ = erstes Jahr mit Wert, das die bestehende Normalisierung aus SEC companyfacts gewinnt (bei Bewertung: begrenzt durch Gewinn je Aktie bzw. Aktienzahl und Datum des Jahresberichts).

| Unternehmen | Kennzahl | Quelle | bisher | nachher | Grund für die verbleibende Grenze |
|---|---|---|---|---|---|
| Apple | KGV | 2009 (EPS ab 2007, 10-K-Datum ab 2009) | 2014 | **2009** | GJ 2007–2008: kein Datum des Jahresberichts (10-K vor XBRL, nicht in den Data Sets) |
| Apple | KUV | 2009 | 2014 | **2009** | 2006–2007 keine Aktienzahl, 2008 kein 10-K-Datum |
| Apple | Umsatz | 2007 | 2014 | **2007** | vor 2007 nur nicht maschinenlesbare Berichte |
| Apple | Free Cashflow | 2007 | 2014 | **2007** | wie Umsatz |
| Apple | Marktkapitalisierung | 2009 | 2014 | **2009** | wie KUV |
| NVIDIA | KGV | 2011 | 2015 | **2011** | GJ 2008–2009: Gegenprobe Gewinn je Aktie ↔ Nettogewinn ÷ Aktien besteht nicht; GJ 2010: Aktienbasis springt um Faktor ≈ 1.000 (alte Meldung in Tausend) |
| NVIDIA | Umsatz | 2008 | 2015 | **2008** | Quelle |
| NVIDIA | Free Cashflow | 2010 | 2022 | **2010** (Lücke 2013–2021) | Investitionen 2012–2021 nur als NVIDIA-eigenes XBRL-Konzept, das companyfacts nicht enthält |
| NVIDIA | Nettogewinn | 2008 | 2015 | **2008** | Quelle |
| Microsoft | KGV | 2010 | 2014 | **2010** | GJ 2008–2009: kein 10-K-Datum (Bericht vor XBRL) |
| Microsoft | Umsatz | 2008 | 2014 | **2008** | Quelle |
| Microsoft | operative Marge | 2008 | 2014 | **2008** | Quelle |
| Tesla | Umsatz | 2009 | 2014 | **2009** | Börsengang 2010 |
| Tesla | operativer Cashflow | 2009 | 2014 | **2009** | wie Umsatz |
| Tesla | Free Cashflow | 2009 | 2014 | **2009** | wie Umsatz |
| Tesla | KGV | 2020 | 2020 | 2020 | Verlust bis 2019 (kein KGV bei Verlust). Für KUV und Börsenwert fehlt 2010–2014 die verwässerte Aktienzahl: Tesla meldete sie unter `WeightedAverageNumberOfShareOutstandingBasicAndDiluted`, das die Registry nicht abbildet |
| ExxonMobil | Umsatz | 2009 | 2014 | **2009** | vor 2009 kein Wert unter einem abgebildeten Umsatzkonzept |
| ExxonMobil | Nettogewinn | 2007 | 2014 | **2007** | Quelle |
| ExxonMobil | operativer Cashflow | 2007 | 2014 | **2007** | Quelle |
| ExxonMobil | Free Cashflow | 2007 | 2014 | **2007** | Quelle |

ExxonMobil-Bewertung: Die verwässerte Aktienzahl steht in companyfacts nur für 2013. Mit Historie gibt es KGV, KUV und Börsenwert für GJ 2011–2013, sonst nicht (Quelllücke).

## Performance

- **Auslieferung:** +25 % je Unternehmen (gzip, gemessen an den fünf Unternehmen: 3,6 → 4,4 KB). Gemessen am ganzen Universum (26.10.2026): `fundamental/data/history` 10,1 → 11,8 MB (+1,7 MB, Budget 40 MB). Eine Aktienseite lädt weiterhin genau eine Scherbe. `consumer-history` selbst wird nicht ausgeliefert.
- **Diagramme:** höchstens rund 20 Jahrespunkte je Reihe; keine messbare Wirkung.
- **Repository:** Der erste Lauf nach #935 schrieb 2.444 Einzeldateien je CIK, 19,3 MB. Damit fiel `consumer-history` ins 8-MB-Basisbudget von `quant/data/sec` (`test_the_committed_footprint_is_within_budget` rot). Seit der Umstellung auf 64 gzip-Scherben sind es 1,7 MB bei gleichem Inhalt und byte-gleicher Auslieferung, mit eigenem Budget von 3 MB (`test_the_consumer_history_stays_within_its_own_budget`). Eine Scherbe ändert sich nur, wenn sich ein altes Jahr eines ihrer Emittenten ändert, einmal jährlich ein Jahr aus dem Fenster in die Historie wandert oder sich die Normalisierungsversion ändert.
- **SEC-Lauf:** keine zweite Normalisierung, nur die Abfrage der älteren Jahre aus dem schon gebauten Faktenbuch.

## Nicht in diesem PR (Vorschläge, jeweils eigener PR)

1. **Datum des Jahresberichts vor 2009:** Die SEC-Einreichungsliste (`submissions`, kostenlos) nennt jedes 10-K mit Datum, auch ohne XBRL. Über die vorhandene Lückenfüllung des SIC-Verlaufs (`cli.py sic-history plan-gapfill`) ergäbe das Bewertungen für die Jahre mit Gewinn und Aktienzahl, z. B. Apple GJ 2007–2008 und Microsoft GJ 2008–2009.
2. **Registry:** `WeightedAverageNumberOfShareOutstandingBasicAndDiluted` als Konzept der verwässerten Aktienzahl, z. B. für Tesla 2010–2014. Das ist eine Änderung am Quant-Fachmodell und braucht einen eigenen Vorher/Nachher-Vergleich.
3. **Quartale:** Die Verbraucherdateien halten 8 Quartale. Alle Quartale ab 2009 wären etwa viermal so viele Zeilen wie die Jahreshistorie; sinnvoll nur mit bedarfsgerechtem Laden (eigene Datei je Unternehmen, erst beim Wechsel auf „Quartalsweise · Alle“).
4. **NVIDIA-Investitionen 2012–2021:** stehen nur im eigenen Konzept des Unternehmens und damit in den Financial Statement Data Sets (`num.txt`), nicht in companyfacts. Abbildbar nur mit einer geprüften Regel für Firmenkonzepte. Umgesetzt als geprüfte Erweiterung nur für NVIDIA: `docs/SEC_ISSUER_EXTENSIONS.md` (GJ 2013–2021, gepinnte 10-K-Instanzdokumente).
