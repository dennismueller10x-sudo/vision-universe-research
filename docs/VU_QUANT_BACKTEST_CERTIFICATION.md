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

## Überlebende

| Kennzahl | Wert |
|---|---|
| SURVIVORSHIP_GATE | PASS |
| SURVIVORSHIP_CONTROL | FAIL |
| DELISTED_IDENTIFIED | 191 |
| DELISTED_WITH_HISTORY | 0 |
| DELISTED_BACKTEST_ELIGIBLE | 0 |

186 Kürzel inaktiver Titel haben eine Kursreihe, die weiterläuft. Das Kürzel wurde neu vergeben; die Reihe ist keine Historie des delisteten Titels. Vorwärts gesammelte Stände (Setup-Historie, Index-Zugehörigkeit) sind überlebensfrei, solange kein Fall weggelassen wird.

## Produkt

- **Radar-Karten und Aktienseite:** Sie zeigen „Historisch beobachtet / getestet / zertifiziert“ mit Status. Jede Trefferquote steht zusammen mit Base Rate, Differenz, Intervall und effektiver Fallzahl.
- **Alert-Vertrag 3.0.0:**
  - `effectiveAt`, `validUntil` (7 Tage), `baseRate` und `isNew`.
  - Das Ledger sorgt dafür, dass derselbe `dedupeKey` nur einmal alarmiert.
  - Ein Ereignis mit Evidenz, aber ohne Base Rate, verletzt den Vertrag.
- **Beobachtete Aktien:** Sie haben einen Verlauf über 90 Tage (`radar-history/events`).
- **`#/backtest`:** Die Seite zeigt die Zertifizierungsübersicht, den Setup-Fortschritt und die Signal-Regeln. Die Kachel mit der Base-Rate-Differenz steht dort vor allen anderen Zahlen.
- **Laden:** Die kleine Evidenz-Ansicht (`page-evidence.js`) lädt auf Startseite, Radar und Aktienseite, Engines und Diagramme nur auf `#/backtest`.

## Offene Owner-Gates

- Setup-Backtest: Freigabe der Setup-Methodik (`backtestCertification`), sobald die Historien-Gates bestehen.
- Setup-Einstiegsvariante, falls die Abweichung 1 Pp übersteigt.
