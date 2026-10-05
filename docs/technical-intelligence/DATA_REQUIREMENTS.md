# Datenanforderungen und Datenlage

| Modul | benötigt | vorhanden (lokal / Repository) | vorhanden (CI, R2) | Verhalten bei Fehlen |
|---|---|---|---|---|
| Pivots, Struktur, Elliott, Szenarien | splitbereinigte OHLC | Tages-OHLCV 5 Titel (`golden-preview`); Wochenschluss 6.348 Titel (`discover-series-long`, 1993–2026) | Tages-OHLCV ≈ 5.900 Titel (kanonische Historie) | Wochenschluss: O=H=L=C, funktioniert; Kerzen fehlen |
| Volumen, AVWAP, Volumenprofil, Wyckoff-Bestätigung | Tagesvolumen | 5 Titel | ganzes Universum | `UNAVAILABLE` mit Grund; Wyckoff „nicht volumenbestätigt" |
| Lücken (Gap-Zonen) | echte OHLC | Tagesdaten | ja | bei Wochenschluss keine Gap-Zonen |
| Split-Bereinigung | Rohkurs + `splitFactor` | ja (golden) / bereits bereinigt (Wochen) | ja | Analyse verweigert andere Kursbasis als SPLIT_ADJUSTED |
| Dividenden / Gesamtrendite | `divCash`/`dividend` | ja (golden) | ja | Backtest misst Kursrendite (konservativ für Long) |
| Delistete Titel | Listing-Ende + Kurse | nein | privates Delisting-Bündel (Wochen, ab 2015) | **Survivorship-Bias offen**, dokumentiert |
| Historische Indexmitgliedschaft | Stichtagslisten | 2 Stichtage, keine offizielle Historie | nein | Universum = heute gelistete Titel |
| Marktregime | Breite oder Index | SPY Tagesschluss ab 1995 | ja | SPY-26-Wochen-Trend; vor 1995 „UNKNOWN" |
| Sektor | Klassifikation | SIC-Division (Momentaufnahme) | gleich | nur aktuelle Zuordnung (kein Point-in-Time) |
| Marktkapitalisierung | Aktien × Kurs PIT | nicht flächendeckend | nein | Segment nicht ausgewertet (Lücke) |
| Liquidität / Spreads | Volumen, Bid/Ask | Volumen nur Tagesdaten; keine Spreads | Volumen | Consumer-Reihen auf Indexmitglieder ≥ 5 $ begrenzt |
| Intraday | Minutenbars historisch | nur 2 Tagesschnappschüsse | nein | Intraday-Zeitebene `UNAVAILABLE` |
| Earnings-Termine | Kalender | nicht im Repository verbunden | — | Hinweis „Ereignisrisiko" noch nicht umgesetzt (Roadmap) |

## Elliott und OHLC (Mission VI)

* **Eingang:** Die Elliott-Engine (`elliott-3.2.2`) ist eine **Schlusskurs-Methode**. Sie liest nur `close`, auch bei vorhandenem OHLC.
* **OHLC ist keine Voraussetzung:** Die Studie OHLC_ELLIOTT_STUDY.md zeigt keinen Gewinn durch Hoch/Tief oder Tagesauflösung bei der Impulserkennung. OHLC wird deshalb **nicht** zur formalen Voraussetzung.
* **Verfügbarkeit:** Tages-OHLC für US-Titel liegt runner-privat in der kanonischen Historie, US-ETFs und BTC über den bestehenden Anbieter.
  * Weitergabe: LEGAL_REVIEW_REQUIRED.
  * International: nicht vorhanden.
* **Künftiger OHLC-Pfad:** nur versioniert, mit gemeinsam bereinigtem O/H/L/C, ausschließlich abgeschlossenen Bars und offengelegter Annahme zur Intraday-Reihenfolge.

## Datenqualitätsregeln im Code

* `TI.prepare()` lehnt alles außer `SPLIT_ADJUSTED` ab.
* Tagesdaten: Splits werden aus Rohkurs + `splitFactor` rekonstruiert (`Canonical.fromPriceBars`); die bereinigte Spalte des Anbieters wird nicht gelesen (siehe `VU_TECHNICAL_DATA_SEMANTICS.md`).
* Reihen < 160 Wochen bzw. < 300 Tage: keine Analyse („mindestens drei Jahre").
* `dataQuality` im Ergebnis: Bars, closeOnly, hasVolume, Kursbasis, Datenversion, Quelle.
* Öffentliche Ausgabe: max. 260 Bars Chartdaten je Titel (wie bestehende Technical-Produktdaten); `assert-public-data-hygiene.mjs` geprüft.
