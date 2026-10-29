# V12 P3 – Historische Listingreferenz (Strang LISTREF)

Stand 29.10.2026. Evidenzart `SOURCE_EVIDENCE`, `NOT_CERTIFIED`, `productionApproved: false`. Keine Datei unter `*/data`, kein Produktpfad, kein Workflow und keine Engine wurden geändert. Neu ist nur das opt-in-Research-Modul `quant/engines/research-listing-reference.cjs`, das keinen Loader berührt; ohne es aufzurufen, ändert sich nichts.

## Antwort in fünf Sätzen

1. Die öffentliche Tickerliste unseres Kursanbieters ist **selbst überlebensverzerrt**: Für 1995–2008 enthält sie praktisch keine beendeten US-Listings (0–4 je Jahr), für 2009–2014 nur 37–142, ab 2015 dann 248–489. Die EDGAR-Vollindizes zeigen dagegen 380–830 Delisting-Ereignisse operativer Emittenten je Jahr.
2. Gemessen an dieser (für frühe Jahre zu günstigen) Referenz deckt unser Bestand je Jahr nur **52–85 %** der Listings mit Kursreihe ab; im V10/V11-Research-Frame sind es **44–67 %** (Tabelle unten).
3. Die Lücke besteht fast vollständig aus **später delisteten Listings**. Von den Ketten, die in einem Jahr enden, haben wir bis 2023 so gut wie nie eine Reihe (0–1 je Jahr), 2024–2026 sind es 5/18/45. **4.322 delistete Listings**, die der Anbieter weiterhin führt, fehlen uns (davon 2.483 mit CIK). Würden sie nachgeladen, stiege die Abdeckung gegen die Anbieterreferenz auf 0,88–0,98.
4. Kein Jahr und kein Segment erreicht die registrierte P4-Schwelle (Abdeckung ≥ 95 % bei Referenz-Vollständigkeit ≥ 0,80). Nur 19 Zellen erreichen `PARTIAL`, und zwar ausschließlich Größenklassen MID, SMALL und MEGA_LARGE ab 2017, überwiegend 2023–2026. An der unteren Vollständigkeitsschranke bleiben davon 2.
5. Für P4 heißt das: Vor 2013 taugt die Anbieterliste nicht als Referenz; dort braucht es die Fondsmeldungen (Strang INDEXPOP). Für 2015–2026 ist das Nachladen der 4.322 Kandidaten der wirksamste Hebel. Das ist eine Freigabeentscheidung des Owners (Anbieterschlüssel nur in Actions).

## Kernzahlen (alle Segmente, Einheit = Listingkette)

| Jahr | Referenz | mit Reihe % | im Frame % | Enden (Ref.) | davon mit Reihe / mit Lifecycle | EDGAR-Ereignisse | Vollständigkeit unten–oben | NYSE×MEGA_LARGE: n, Abdeckung |
|---|---|---|---|---|---|---|---|---|
| 2000 | 2.477 | 62,4 | 55,4 | 0 | 0 / 0 | 188 | 0 – 0 | – |
| 2005 | 3.267 | 57,9 | 49,7 | 0 | 0 / 0 | 234 | 0 – 0 | – |
| 2009 | 4.057 | 53,5 | 45,2 | 37 | 0 / 0 | 620 | 0,02 – 0,08 | 101, 0,86 |
| 2013 | 4.841 | 52,3 | 43,5 | 131 | 0 / 0 | 446 | 0,12 – 0,33 | 230, 0,87 |
| 2015 | 5.263 | 54,1 | 44,7 | 268 | 0 / 0 | 413 | 0,39 – 0,59 | 282, 0,87 |
| 2018 | 5.439 | 62,0 | 50,1 | 421 | 1 / 0 | 388 | 0,43 – 0,68 | 335, 0,87 |
| 2020 | 5.481 | 69,6 | 56,0 | 248 | 1 / 0 | 382 | 0,39 – 0,62 | 330, 0,91 |
| 2022 | 6.244 | 71,1 | 57,2 | 413 | 0 / 0 | 557 | 0,41 – 0,69 | 399, 0,91 |
| 2024 | 5.953 | 81,6 | 65,5 | 280 | 5 / 0 | 504 | 0,34 – 0,60 | 414, 0,93 |
| 2026 | 6.538 | 84,5 | 63,6 | 267 | 45 / 9 | 267 | 0,43 – 0,65 | 450, 0,93 |

Alle Jahre und Segmente: [coverage-matrix-1.0.2.json](coverage-matrix-1.0.2.json). P4-Tabelle (maschinenlesbar): [coverage-by-year-segment.json](coverage-by-year-segment.json). Vollständigkeit je Jahr, Börse und Größe: [reference-completeness-1.0.2.json](reference-completeness-1.0.2.json).

## Quellen und Verfahren

- **Tiingo `supported_tickers.zip`**: einmal geladen, nur privat (SHA-256 `bb357943…b938b53`, 109.155 Zeilen). Im Repo stehen nur Zählungen und Ticker als Kennungen.
- **EDGAR-Vollindizes**: `form.gz` 1994Q1–2026Q4, also 132 Quartale. `form.gz` ist `form.idx` in gzip-Form, mit denselben Zeilen wie `company.idx`. 108 Dateien kamen aus dem V10-Cache, 24 wurden neu geladen.
- **Bestand**: 6.190 Wochenreihen, Loader `{identityEvidence, corporateActionEvidence, listingLifecycleEvidence}`: 4.526 QUALIFIED, Frame 4.329. Dazu der Security Master, die V10-Lifecycle- und Identitätsregister, die SEC-Tickerliste vom 13.09.2026 und der Public Float (`dei:EntityPublicFloat`) aus der privaten companyfacts.zip.
- **Referenzregel** ([Protokoll 1.0.0](protocol-1.0.0.json)): Tiingo `assetType=Stock`, USD, Börse NYSE/NASDAQ/NYSE MKT/AMEX, Common-Symbolregel. Damit sind 16.261 Zeilen in Scope, 11.065 bleiben nach der Symbolregel. Ausschlussgründe gezählt: [reference-summary-1.0.2.json](reference-summary-1.0.2.json).
- **Nachträge nach Sicht** (offengelegt):
  - [1.0.1](protocol-amendment-1.0.1.json):
    - Anbieter-Neustarts (Lücke ≤ 5 Tage) bilden eine Kette: 320 Paare, 10.745 Ketten.
    - Effektives Ende = belegter letzter Handelstag bzw. abgeleitetes SEC-Ende, weil Tiingo delistete Titel mit eingefrorenem Enddatum weiterführt (Beispiele ALE, ALOT, AVNS, BAYA, BGFV): 27 + 65 Enden korrigiert.
    - Index-Verknüpfungen nur nach Bestätigung durch die EDGAR-Volltextsuche.
    - Die Vollständigkeit wird als Intervall berichtet.
    - Nach einem Rauchtest mit 20 Abfragen kamen die Formulare 20-F/6-K/F-1 hinzu.
  - [1.0.2](protocol-amendment-1.0.2.json): Die Vollständigkeit wird je Börse (Einreicher des 25-NSE) und je Größenklasse berechnet. Dieser Nachtrag entstand, bevor 1.0.1-Ergebnisse vorlagen.
- **Tickerwiederverwendung**: 215 Ticker mit zeitlich getrennten Intervallen (217 Paare). Bei Wiederverwendung entscheidet die CIK-Verknüpfung, ob es derselbe Emittent ist.
- **CIK-Verknüpfung** (Güte):
  - `HIGH_CURRENT_MAP` 5.826 und `HIGH_V10_REGISTER` 197.
  - `MEDIUM_FTS_CONFIRMED` 1.740: eindeutiger Namensabgleich mit 25/25-NSE/15-12B im Endfenster, Ticker im Volltext der CIK gefunden.
  - `MEDIUM_FTS_DISCOVERED` 833: Volltexttreffer und Delisting-Formular, davon 73 eingefrorene Enden.
  - Unverknüpft 2.149: 186 Indextreffer ohne Bestätigung, 102 mehrdeutig, 1.585 ohne Treffer, 276 „aktiv“, aber nicht in der SEC-Liste.
- **Größenklasse**: Public Float des verknüpften Emittenten (≥ 10 Mrd./2 Mrd./300 Mio. USD). Unverknüpfte und Emittenten ohne XBRL-Float zählen als `UNKNOWN`. Float > 5e12 gilt als Skalenverdacht (102 Ketten-Jahre) und wird nicht korrigiert (Strang P1). Gibt es für dieselbe Periode mehrere Werte, gilt die spätere Meldung (Präzisierung, nachdem die Gegenprüfung die offene Reihenfolge aufgedeckt hatte).

## Delisting-Register und Gründe

[delisting-register-1.0.2.json.gz](delisting-register-1.0.2.json.gz) enthält 12.161 Ereignisse aus 25/25-NSE (ab 2001) und 15-12B. Je CIK werden Formulare innerhalb von 180 Tagen zu einem Ereignis zusammengefasst. Erfasst sind operative Emittenten, deren CIK heute nicht mehr an NYSE/Nasdaq/NYSE American notiert ist. Jedes Ereignis trägt Akzessionsnummern und die verknüpften Referenzketten.

Für die Gründe ([delisting-reasons-1.0.2.json.gz](delisting-reasons-1.0.2.json.gz)) wurden die 8-K-Item-Codes aus der EDGAR-Volltextsuche gelesen, also Metadaten und keine Dokumente. Das betrifft die 2.354 verknüpften Ereignisse ab 23.08.2004:

| Grund | Anzahl |
|---|---|
| Fusion/Übernahme vollzogen (2.01) | 1.593 |
| Mitteilung 3.01 (Börsenregel/Transfer/SPAC) | 225 |
| Insolvenz (1.03) | 59 |
| Fusionsprozess im Index (DEFM14A, SC 14D9, SC TO-T …) | 164 |
| freiwillig (nur Form 25 des Emittenten) | 25 |
| unbekannt | 288 |

Die 9.807 unverknüpften Ereignisse haben nur Indexsignale. Die Anbieterreferenz enthält überwiegend Fusionen. Delistings aus wichtigem Grund fehlen dort häufig, vermutlich weil der Anbieter solche Titel unter einem OTC-Label weiterführt, das außerhalb der Referenz liegt.

**Stichprobe gegen Originale** ([verification-sample-1.0.2.json](verification-sample-1.0.2.json), [Adjudikation](verification-adjudication-1.0.2.json)): 60 Fälle mit 162 Dokumenten (Form-25-Filing-Index und Hauptdokument, entscheidendes 8-K), Zitate ≤ 300 Zeichen mit SHA-256.

- Alle 44 Item-Behauptungen sind im Text bestätigt.
- Fusionen tragen 21/21 die Regel 12d2-2(a)(3), Insolvenzen 8/8 die Regel (b).
- Item 3.01 ist eine Mischklasse: 7 von 14 Fällen sind SPAC-Liquidationen ((a)(1)).
- Alle 60 Ticker-Verknüpfungen sind nach Namensprüfung plausibel.
- Wertpapierklasse: 50 Common, 3 Warrants/Units, 7 ohne Angabe.

## Unabhängige Python-Gegenprüfung

`python3 -I scripts/quant/v12/listref/check_listref.py` ist eine eigene Implementierung. Sie liest die Tiingo-Datei direkt aus der zip-Datei, parst die rohen `form.gz`- und Volltext-Antworten aus dem Cache selbst und verwendet eigene Symbol-, Affinitäts- und Kettenregeln. Ergebnis: **16/16 MATCH** ([independent-check-1.0.2.json](independent-check-1.0.2.json)). Geprüft wurden Zeilen-, Ketten- und Wiederverwendungszahlen, die Indexdatei-Hashes (132/132), CIK-Verknüpfung und effektives Ende je Kette (10.745/10.745), die Abdeckungsmatrix (all/Börse/Größe), die Börsenzuordnung der Einreicher, die Vollständigkeit je Jahr, Börse und Größe, die P4-Bereitschaft (all) und die Gründezählung.

Der erste Lauf ergab 55 Größenabweichungen, weil die Reihenfolge doppelter Float-Werte nicht festgelegt war. Die Regel wurde präzisiert (spätere Meldung gilt) und in beiden Implementierungen umgesetzt. Grenze der Prüfung: Die Volltext- und Item-Antworten sind dieselben gecachten SEC-Antworten, unabhängig ist nur deren Auswertung.

## Folgerung für P4

Die maschinenlesbare Entscheidungsgrundlage ist [coverage-by-year-segment.json](coverage-by-year-segment.json). Sie enthält je Jahr und Segment (all, exchange, sizeClass, listingAge, exchange×size, exchange×age) die Referenzzahl, die Abdeckung, die Delistings, beide Vollständigkeitsschranken, die Bereitschaft und die Quelle der Vollständigkeit.

- **1995–2012: nicht studienfähig gegen eine Referenz.** Die Anbieterliste fehlt dort fast vollständig an Delistings; jede Abdeckungsquote ist nach oben verzerrt. Für Large Caps kommt nur die PIT-Indexmitgliedschaft (INDEXPOP) als Referenz in Frage.
- **2013–2026: teilweise.** Die beste Lage haben NYSE-Large- und Mid-Caps sowie Mid- und Small-Caps mit Float, mit Abdeckung 0,82–0,94 und Vollständigkeit (oben) um 0,80. Die Lücke besteht dort fast nur aus delisteten Titeln. Titel mit unbekannter Größe (häufig unverknüpft, oft später delistet) sind am schlechtesten abgedeckt (0,33–0,70).
- **Junge Listings** sind schlechter abgedeckt als ältere (2018: < 5 Jahre 0,52, 5–10 Jahre 0,54, ≥ 10 Jahre 0,64–0,77).
- **Hebel:** Nachladen der [4.322 Kandidaten](fetch-candidates-1.0.2.json) über den bestehenden Anbieter. Das ist eine reine Freigabevorlage; es wurde nichts abgerufen.

## Grenzen

- Börse = letztes Anbieterlabel; Börsenwechsel sind unsichtbar.
- ADRs sind nur über das 20-F/40-F-Merkmal verknüpfter Emittenten erkennbar (Segment `issuerType` in der Matrix).
- Einige vierbuchstabige NYSE-Symbole sind Anleihen oder Vorzüge. Grob geschätzt 70 Ketten in 2024 ohne Reihe teilen die CIK mit einem kürzeren Stammticker; die Referenz ist dadurch um etwa 1 % aufgebläht.
- Die Vollständigkeit misst nur gegen EDGAR-Ereignisse operativer Emittenten. Vor 2001 gibt es keine elektronischen Form 25, vor 2006 keine 25-NSE; Nasdaq-Titel vor 2006 erscheinen kaum (12(g)).
- Ereignisse von Emittenten, die später neu an NYSE/Nasdaq notieren, sind ausgeschlossen.
- Public Float liegt unter der Marktkapitalisierung (ohne Verbundene) und ist erst ab etwa 2009/2011 als XBRL verfügbar.

## Reproduktion

Private Daten liegen unter `…/scratchpad/v12-private/listref/`. Die Skripte unter `scripts/quant/v12/listref/` werden in dieser Reihenfolge ausgeführt:

1. `fetch_indices.py`
2. `export_holdings.cjs --out`
3. `extract_float.py --out`
4. `resolve_agents.py --out`
5. `build_reference.cjs --emit-queries`
6. `fts_links.py`, mehrfach, bis keine Abfragen mehr offen sind (`purge_error_bodies.py` entfernt gecachte Fehlerantworten)
7. `build_reference.cjs --fts … --out-dir`
8. `fetch_reasons.py`
9. `reasons.cjs`
10. `verify_sample.py`
11. `check_listref.py`

Tests: `node --test quant/tests/v12-listref.test.mjs`.

SEC-Abrufe dieses Strangs, alle über `scripts/quant/sec/http_client.py` mit 2/s und User-Agent `VisionUniverseResearch info@visionuniverse.de`:

| Abruf | Anzahl |
|---|---|
| Indexdateien | 24 |
| Volltextsuche | 5.020 |
| 8-K-Item-Metadaten | 2.366 |
| Einreicher-Entitäten | 7 |
| Dokumente der Stichprobe (Filing-Indizes + Primärdokumente) | 162 |
| Probeabrufe | 20 |
| **Summe** | **≈ 7.600** |

Hinzu kam 1 Abruf der Tiingo-Datei.
