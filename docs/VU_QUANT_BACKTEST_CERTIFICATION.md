# Quant Backtest Certification (01.10.2026)

Gemessen in `quant/data/product/backtest-certification-measure-v1.json`: **QUANT_BACKTEST_CERTIFICATION = PASS**.

PASS heißt: Jede Backtest-Art steht in genau einem gemessenen Status. Keine Zertifizierung ist falsch, und das Produkt zeigt den Status korrekt an. Zertifiziert ist heute keine Art. Jede Art nennt ihren Grund und läuft täglich durch den Check.

## Status je Art

Quelle: `quant/data/product/backtest-certification-v1.json`, erzeugt von `scripts/quant/build-backtest-certification.mjs` mit der Engine `quant/engines/backtest-certification.js`.

| Art | Stufe | Status | Hauptgrund | Voraussichtlich genug Historie |
|---|---|---|---|---|
| Rückblick derselben Aktie | beobachtet | LIMITED | überlebt per Konstruktion; prüft keine Regel | – |
| Marktweite Muster | beobachtet | LIMITED | Überlebenden-Effekt nicht quantifiziert; Kursrendite | – |
| Signal-Backtest | getestet | LIMITED | keine Überlebenden-Kontrolle | – |
| Setup-Backtest (veröffentlichte Stände) | getestet | COLLECTING_HISTORY | 4 von 120 Stichtagen; 0 von 100 abgeschlossenen 6-Monats-Ergebnissen | Stichtage ca. 10.03.2027, erste 6-Monats-Ergebnisse ca. 26.03.2027; danach ist eine Owner-Freigabe nötig |
| Strategie-Backtest | getestet | COLLECTING_HISTORY | 1 von 24 Monaten Index-Zugehörigkeit | ca. 08/2028 |
| Faktor-/Ranking-Backtest | getestet | COLLECTING_HISTORY | 1 von 24 Monaten Faktor-Snapshots | ca. 08/2028 |

Die Statusregel:

1. Ein hartes Gate fällt (Point-in-Time, Look-ahead, Datenschutz): **WITHHELD**.
2. Sonst fällt ein Historien-Gate: **COLLECTING_HISTORY**.
3. Sonst ist alles bestanden und das Vertrauen mindestens „belastbar“: **CERTIFIED**. Verlangt der Methodikvertrag eine Freigabe, stattdessen **WITHHELD** mit `OWNER_APPROVAL_REQUIRED`.
4. Sonst gilt **LIMITED**, sofern Ergebnisse veröffentlicht sind.

`certificationViolations()` lehnt jeden Status ab, der nicht aus seinen Gates folgt. Ein Sabotage-Test fälscht eine Zertifizierung und muss dabei rot werden.

## Signal-Backtest v2 (signal-backtest-2.0.0)

| Signal | im Plus (6 M.) | Base Rate derselben Wochen | Δ (95 %, cluster-robust) | ≈ unabhängige Fälle | Lern-/Testzeitraum |
|---|---|---|---|---|---|
| Neues 52-Wochen-Hoch | 55,2 % | 53,8 % | +1,5 Pp (+0,6 bis +2,4) | 10.460 | Richtung hält; im Testzeitraum allein nicht signifikant |
| Momentum verbessert | 52,3 % | 53,8 % | −1,5 Pp (−2,2 bis −0,9) | 21.179 | hält (negativ) |
| Über der langfristigen Linie | 52,6 % | 54,0 % | −1,3 Pp (−1,9 bis −0,8) | 25.977 | hält (negativ) |
| Momentum verschlechtert | 53,7 % | 54,0 % | −0,3 Pp (−0,9 bis +0,3) | 24.125 | kein Vorteil |
| Unter die langfristige Linie | 53,6 % | 53,8 % | −0,2 Pp (−0,7 bis +0,4) | 26.649 | kein Vorteil |

Was dahinter gemessen wird:

- **Base Rate:** der Anteil im Plus aller Titel in derselben Woche über denselben Horizont, passiv und ohne Kosten.
- **Kosten:** Das Signal trägt BASE (30 bps je Runde); LOW (10 bps) und HIGH (60 bps) werden als Sensitivität mitgerechnet.
- **Unabhängigkeit:** Quartale bilden die Cluster. Daraus folgen Design-Effekt und effektive Fallzahl, dazu UNIQUE_TITLES, UNIQUE_PERIODS und INDEPENDENT_CLUSTERS.
- **Robustheit:** Lernen bis 2010, Prüfen 2010–2017, Testen ab 2018, dazu Walk-Forward. Ein Vorteil muss im Testzeitraum mit einem Intervall ohne Null halten (`edgeOutOfSample`).
- **Parameter-Stabilität:** Nachbarparameter, Einstiegsverzug von 0, 1 und 2 Wochen und die Haltedauern.
- **Marktphasen:** werden nicht aufgeteilt. Die Regime-Historie ist nicht zertifiziert (`MARKET_REGIME_TRANSITIONS_GATE = PENDING_HISTORY`), und eine eigene Ersatzeinteilung gibt es nicht.
- **Gesamtrendite:** `weekly-total-return-1.0.0` nimmt den letzten Handelstag jeder Woche aus der bestätigten Tages-Gesamtrendite. Die Pipeline rechnet so (`--work-dir`); lokal entsteht Kursrendite. Die Studie mischt nie zwei Renditebasen.

## SPY als Benchmark-Referenz (Owner-Entscheid 02.10.2026)

SPY liegt als `BENCHMARK_REFERENCE` in der kanonischen Historie und dient nur dem Vergleich in Backtests. SPY gehört nicht zum Produktuniversum: Er erscheint nicht im Screener, bekommt keine Strategie-Treffer, wird nicht gerankt und steht in keiner Aktienliste. Das sichert `quant/tests/benchmark-reference.test.mjs`.

- **Abruf:** `scripts/market/refresh-benchmark-history.mjs` holt die ganze Reihe ab 1990 in einer Anfrage. Es nutzt denselben Adapter, dieselbe Qualitätsprüfung, dieselbe Prüfung der Bereinigungssemantik und dieselbe Arbeitsablage wie der Gate-Lauf.
  - Ein voller Abruf statt Anhängen ist nötig, weil gespeicherte Bars die adjustedClose-Skala ihres Abruftags behalten. Jede spätere Ausschüttung wäre sonst verloren.
  - Kommt eine Ausschüttung in der bereinigten Spalte nicht an, bricht der Abruf ab und der Cache bleibt unverändert.
- **Ablage:** `sync-history-store` und `preflight-zero-cost` führen SPY für `FULL_UNIVERSE` mit (`scripts/market/benchmark-reference.mjs`). Das Gate-Universum und das Produktuniversum bleiben unverändert.
- **Kein Leck in die Titelreihen:** `publish-long-series` schreibt SPY nie nach `discover-series-long`. Die Signal-Studie schließt SPY zusätzlich selbst aus.
- **Signal-Studie:** Gesamtrendite gilt nur, wenn alle drei Bedingungen erfüllt sind:
  - Mindestens 95 % der Titel haben Gesamtrendite.
  - Die SPY-Gesamtrendite trägt auf derselben Wochenachse jede Woche, in der SPY als Kurs vorliegt, ohne Lücke und bis zum Stichtag (`source.spyTotalReturn`).
  - Es wird nie gemischt; fehlt eine Seite, bleibt die ganze Studie bei Kursrendite.
- **Vorher/Nachher:** Im Gesamtrendite-Modus stehen dieselben Regeln über dieselben Titel auch mit Kursrendite im Artefakt (`returnBasisComparison`).
- **Vertrauen:** Eine bestandene Renditebasis hebt keine Regel über „eingeschränkt“, solange die Überlebenden-Kontrolle fehlt.
- **Relative Stärke in den Technik-Bundles:** Sie bleibt in diesem Schritt unverändert. Sie einzuschalten würde die Technik- und Setup-Zustände ändern und braucht eine eigene Entscheidung.

## Setup-Backtest

Quelle sind nur die veröffentlichten Stände in `setup-observation-history`. Jeder Stand wird gegen seinen `contentHash` geprüft, ein veränderter Stand bricht den Lauf ab.

Die Wiederholung (`setup-replay-v1`) zeigt, dass die Engine 20 von 20 veröffentlichten Ständen exakt nachrechnet. Sie liefert ausdrücklich **keine** Ergebnisse.

Der Vertrag (`quant/methodology/setup-backtest-contract-v1.json`):

- **Einstieg:** zum Schluss des Folgetags (Standard), zum Vergleich zum Schluss des Stichtags. Weichen die beiden Varianten im 6-Monats-Median um mehr als 1 Pp ab, entscheidet der Owner.
- **Ausstieg:** In dieser Rangfolge zählt der Schluss unter der Invalidierung, der Schluss an der ersten Zielzone, der veröffentlichte Abstieg und schließlich das Ende nach 126 Handelstagen. Eine zweite Zielzone gibt es nicht, weil sie nicht veröffentlicht ist.
- **Lücken:** Gehandelt wird zum Schluss, Lücken werden nicht geglättet.
- **Kosten:** LOW, BASE und HIGH.
- **Delisting:** Ein Fall, dessen Kursreihe vorher endet, wird als INCOMPLETE gezählt und nie weggelassen.

Gemessen heute: 4 Stände über 18 Tage, 1.009 Wechsel und noch kein abgeschlossenes Ergebnis.

## Strategie- und Faktor-Backtest

- **Vertrag:** `quant/methodology/strategy-backtest-contract-v1.json`. Er regelt monatliches Rebalancing, Auswahl ohne Ersatzwerte, höchstens 30 Positionen, Gleichgewicht, Gleichstände nach Kürzel, Cash, Gesamtrendite, Delisting, fehlende Kurse, LOW/BASE/HIGH und den SPY als Benchmark.
- **Engine:** `quant/engines/profile-backtest.js` liest Stände nur strikt vor dem Termin. Ohne frische Zugehörigkeit bricht sie ab (`MEMBERSHIP_STALE`) und greift nie auf das heutige Universum zurück.
- **Belege:** Sabotage-Tests zeigen das. Ein Snapshot aus der Zukunft ändert nichts, ein veralteter Stand bricht den Lauf ab.

## Überlebende (survivorship-control-1.0.0, 02.10.2026)

Zwei Begriffe, zwei Zustände (`quant/engines/survivorship-control.js`):

| Begriff | Bedeutung | Stand |
|---|---|---|
| SURVIVORSHIP_GATE | Schutz: keine Auswertung ohne Kontrolle steht über „eingeschränkt“. Löst das Problem nicht (`solvesSurvivorship: false`). | PASS |
| SURVIVORSHIP_CONTROL | Historische Nicht-Überlebende sind in einer Studie tatsächlich enthalten. | `PARTIAL`, sobald die Sensitivität delistete Titel enthält; sonst `NOT_AVAILABLE`. Nie PASS, solange die Hauptstudie nur heutige Titel enthält. |

**Identität:** Eine Kursreihe gehört einem Listing nur, wenn ihr Zeitraum im Listing-Fenster liegt (Kennung `tiingo:BÖRSE:KÜRZEL:Start`). Es gibt keinen Join über das Kürzel. Die 191 inaktiven Stammaktien des Security Masters werden so klassifiziert (`quant/data/product/survivorship-control-v1.json`):

| Klasse | Bedeutung | Anzahl |
|---|---|---|
| A | delistet, Historie bis zum Listing-Ende | 0 |
| B | delistet, Historie unvollständig | 0 |
| C | delistet, keine Historie | 1 |
| D | Kürzel neu vergeben, die Reihe gehört dem späteren Listing | 183 |
| E | Übernahme/Fusion belegt | 0 (lokal kein Beleg) |
| F | Identität unsicher (Reihe läuft über das Listing-Ende hinaus, z. B. COHR) | 7 |

Eine CIK wird keinem früheren Listing zugeordnet: die CIK-Karte gilt dem heutigen Emittenten eines Kürzels.

**Delistete Titel ab 2015:** Der interne Delisting-Abruf (privater Speicher `tiingo-delisted`, Owner-Freigabe 01.10.2026 für interne Auswertung) liefert Kursreihen beendeter Listings ab 2015. `scripts/quant/build-survivorship-control.mjs` liest sein Manifest, klassifiziert jedes Listing (A–F), erkennt Kürzelwechsel (letzte Kerze = Kerze eines heutigen Titels → kein Delisting) und baut ein runner-privates Wochenbündel. Öffentlich erscheinen nur Zähler.

**Ausgang eines Delistings:** lokal unbelegt (Insolvenz, Barabfindung, Aktientausch, Rückzug). Reicht ein Horizont über das Reihenende, wird der Fall **zensiert** und gezählt, nie pauschal mit 0 % oder −100 % gewertet. Die Variante „letzter Kurs“ ist eine ausgewiesene Annahme, kein Ergebnis.

**Sensitivität (Signal-Studie, ab 2016):** dieselben Regeln, dieselbe Renditebasis, dieselbe Wochenachse in zwei Universen – `CURRENT_SURVIVORS_ONLY` und `HISTORICAL_ELIGIBLE_SUBSET` (jedes delistete Listing in den Wochen, in denen es gehandelt wurde). Die Base Rate wird je Variante über genau deren Universum gerechnet. Ausgewiesen werden Fälle, unabhängige Fälle, Anteil im Plus, Base Rate, Abstand, Median, Rückgang und Zensierungen. Die Hauptstudie bleibt unverändert, und aus der Sensitivität folgt keine Zertifizierung.

**Grenzen:** Vor 2016 gibt es keine delisteten Reihen. Alt-Listings später neu vergebener Kürzel sind nicht abrufbar (Klasse D).

## Gesamtrendite-Vertrag (total-return-contract-1.0.0)

- **Regel:** Eine Reihe gilt nur dann als Gesamtrendite, wenn jede Ausschüttung und jeder Split in der bereinigten Spalte angekommen ist. Ein Ex-Tag ohne Faktorsprung, ein Faktorsprung außerhalb 0,6–1,4 × der gemeldeten Ausschüttung oder ein nicht bereinigter Split ist eine Ablehnung, keine Warnung.
- **Ein Vertrag:** `quant/engines/market-quality.js totalReturnVerdict` – dieselbe Funktion für SPY (`refresh-benchmark-history.mjs`), Signal- und Setup-Studie (`scripts/quant/lib/daily-prices.mjs`) und die Reparatur.
- **Ursache der Ablehnungen:** Der tägliche Anhang behält die adjustedClose-Skala des Abruftags; jede spätere Ausschüttung fehlt in der Spalte. `scripts/market/repair-total-return-history.mjs` holt für abgelehnte Reihen die ganze Historie in einer Anfrage (wie SPY), höchstens 1.500 je Lauf, jüngste Lücke zuerst. Übernommen wird **nur die Gesamtrendite-Spalte auf den gespeicherten Tagen** (Rohkurs, Volumen, Ausschüttung, Split und die Menge der Tage bleiben bitgleich), und nur, wenn die Reihe danach den Vertrag besteht und die Rohschlüsse übereinstimmen. Die erste Fassung ersetzte die ganze Reihe; im Marktlauf 37013170985 verschob das Faktor-Perzentile, und Discover lehnte eine Karte an der 90-%-Grenze ab (PRHIZ). Solche Reihen werden aus der dauerhaften Ablage zurückgeholt, bevor sie spaltenweise repariert werden.
- **Kein Mischen:** Unter 95 % bestätigter Titel rechnet die Signal-Studie ganz in Kursrendite, die Setup-Studie ebenso. Darüber fallen abgelehnte Titel heraus und werden gezählt (`quant/data/product/total-return-quality-v1.json`).

## Methodikwechsel bei gleichem Stichtag

`scripts/quant/methodology-fingerprint.mjs` fasst Methodik, Evidenz-Engines, Benchmark-Vertrag und Gesamtrendite-Vertrag in einen Fingerabdruck. Die Idempotenz-Stufe der Materialisierung rechnet neu, sobald er vom zuletzt materialisierten (`quant/data/product/methodology-fingerprint-v1.json`) abweicht – ohne `force`. Festgeschrieben wird er erst nach einem vollständigen Lauf.

## Produkt

- **Radar-Karten und Aktienseite:** Sie zeigen „Historisch beobachtet / getestet / zertifiziert“ mit Status. Jede Trefferquote steht zusammen mit Base Rate, Differenz, Intervall, Fällen, effektiver Fallzahl, Median und typischem Rückgang. Hält der Abstand im jüngsten Testzeitraum nicht (`edgeOutOfSample = false`), steht dort ausdrücklich „Im jüngsten Testzeitraum nicht robust genug bestätigt.“
- **`#/backtest`:** Die Übersicht nennt offen „Zertifiziert: 0 von 6 Backtest-Arten“. Gate und Kontrolle stehen dort getrennt. Die Kontrolle heißt „teilweise“ oder „nicht vorhanden“; ein PASS erscheint nur für das Gate. Jede Regel zeigt die acht Vertrauensbausteine einzeln (Gesamtrendite, Point-in-Time, kein Blick in die Zukunft, Überlebende, Test außerhalb des Lernzeitraums, Walk-Forward, Stichprobe, unabhängige Fälle), dazu die Hinweise „Historisch getestet“, „Evidenz eingeschränkt“ und „Überlebenden-Effekt nicht vollständig kontrolliert“ sowie den Vergleich mit und ohne delistete Titel.
- **Alert-Vertrag 3.0.0:**
  - `effectiveAt`, `validUntil` (7 Tage), `baseRate` und `isNew`.
  - Das Ledger sorgt dafür, dass derselbe `dedupeKey` nur einmal alarmiert. Ein Eintrag merkt sich den Radar-Stichtag der ersten Erkennung; ein wiederholter Lauf zum selben Stichtag meldet seine Alerts weiter als neu (`Radar.markSeen`, Regressionstest mit Sabotage).
  - Ein Ereignis mit Evidenz, aber ohne Base Rate, verletzt den Vertrag.
- **Beobachtete Aktien:** Sie haben einen Verlauf über 90 Tage (`radar-history/events`).
- **`#/backtest`:** Die Seite zeigt die Zertifizierungsübersicht, den Setup-Fortschritt und die Signal-Regeln. Die Kachel mit der Base-Rate-Differenz steht dort vor allen anderen Zahlen.
- **Laden:** Die kleine Evidenz-Ansicht (`page-evidence.js`) lädt auf Startseite, Radar und Aktienseite, Engines und Diagramme nur auf `#/backtest`.

## Offene Owner-Gates

- Setup-Backtest: Freigabe der Setup-Methodik (`backtestCertification`), sobald die Historien-Gates bestehen.
- Setup-Einstiegsvariante, falls die Abweichung 1 Pp übersteigt.
