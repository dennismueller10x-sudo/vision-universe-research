# Wochenkerzen und Wochenformationen (Completion 2.0 D, E4/D5)

Stand 30.10.2026 · screen-row 1.14.0 · technical-query 1.13.0 · Formations-Engine unverändert (technical-formations 1.4.0)

## 1. Was gebaut ist

| Baustein | Umsetzung |
|---|---|
| Echte Wochen-OHLC | `multi-timeframe.js#completedSeries(series, "1W")`: `timeframe.js#aggregate` (ISO-Woche). Eröffnung = erster Handelstag, Hoch/Tief = Extrem der Woche, Schluss = letzter Handelstag, Volumen = Summe. |
| Nur abgeschlossene Wochen | Gleiche Regel wie die bestehenden Wochenkennzahlen (`STICHTAG_FREITAG`, `compute()`): Ist der Stichtag kein Freitag, fällt die laufende Woche weg. Ein Freitagsfeiertag kostet eine Woche (konservativ, wie bisher). |
| Wochenindikatoren | Unverändert aus der Materialisierung (multi-timeframe 1.2.0, rund 30 Felder `@1W`, siehe `MULTI_TIMEFRAME.md`). |
| Wochenformationen im Screener | Neue Spalten `formationActive@1W` und `formationConfirmed@1W`: dieselbe Formations-Engine wie im Tageschart, mit Zustandsmodell DETECTED, CONFIRMED und INVALIDATED. Dazu `weeklyFormationBars`. Unter 26 Wochen bleibt der Wert `null` („keine Aussage“). |
| Abfrage | `formationActive` und `formationConfirmed` gelten für Tag und Woche (`tf: "1W"` bzw. Zeitrahmen der Abfrage), nicht für den Monat. Im Screener-Zustand mit `tf=1W` bleibt der Musterfilter erhalten, statt wie bisher wegzufallen. |
| Chart Studio | Neuer Bereich **„1J·W“**: Wochenkerzen aus denselben Tagesbars, SMA 10/40 W und Formationslinien, gezeichnet wie im Tageschart (`formationLayers`). Eine Zeile nennt die Zahl der abgeschlossenen Wochen, den Stand, die ausgelassene laufende Woche und die aktiven Wochenformationen. |

**Identische Definition in Screener und Chart:** Beide rufen `completedSeries` auf denselben veröffentlichten 270 Tagesbars auf (`technical-signals-v1`) und dann `Formations.analyzeAt`. Ein Test hält fest, dass die Screener-Spalten genau die Engine-Ausgabe auf diesen Wochen sind. Geprüft im Browser für NVDA: Chart „Wochenformationen: Doppeltop“, Screener `formationActive@1W = ["DOUBLE_TOP"]`.

**Kausal:** Die Tage der laufenden Woche ändern das Ergebnis nicht (Test: Freitag gegen den folgenden Dienstag). Die Formations-Engine liest nur bestätigte Pivots bis zum Stichtag; das ist der bestehende Vergiftungstest.

## 2. Vorher/Nachher (gleicher Datenstand, asOf 2026-10-29)

| | vorher (1.13.0) | nachher (1.14.0) |
|---|---|---|
| Spalten | 162 | 165 (+ `formationActive@1W`, `formationConfirmed@1W`, `weeklyFormationBars`) |
| bestehende Spalten | – | alle 162 **bytegleich** |
| abgeschlossene Wochen je Titel | – | 56 (Median), 56–59 |
| Titel ohne Aussage (`null`) | – | 232 (eingefroren oder zu wenige Wochen) |
| Titel mit aktiver / bestätigter Wochenformation | – | 3.398 / 1.956 |

Häufigste aktive Wochenformationen:

| Formation | Titel |
|---|---|
| Widerstandslinie | 1.408 |
| Unterstützungslinie | 983 |
| Doppeltop | 442 |
| fallender Kanal | 402 |
| Widerstands-Ausbruch | 381 |
| absteigendes Dreieck | 325 |
| SKS | 270 |
| steigender Kanal | 270 |
| Doppelboden | 211 |
| Rechteck | 209 |

Die Liste ist eine Häufigkeit und keine Bewertung. Für Wochenformationen gibt es noch keine Evidenz (S4) und deshalb keine Trefferquoten.

## 3. Grenzen

- **Fenster rund ein Jahr (56 Wochen).** Formationen, die länger als etwa ein Jahr brauchen, z. B. mehrjährige Basen, sind auf Wochenbasis nicht erkennbar. Die Wochenkerzen gibt es deshalb nur im Bereich „1J·W“. „5J“ und „Max“ bleiben Linien aus Wochenschlüssen.
- **Lange Wochen-OHLC-Reihen werden nicht veröffentlicht** (siehe §4). Die Materialisierung hat die volle Tageshistorie (R2) und rechnet daraus schon die Wochenkennzahlen. Wochenformationen über die volle Historie wären technisch dort möglich (`completedSeries` auf der vollen Reihe), sind aber nicht freigeschaltet: Sie brauchten im Chart die lange OHLC-Reihe, und Screener und Chart sähen sonst verschiedene Fenster.
- **Wochenlücken (Gap Up/Down)** vergleichen die Eröffnung einer Woche mit der Spanne der Vorwoche. Bei einem Tagessprung innerhalb der Woche entsteht keine Wochenlücke.
- **Befunde unter dem Chart** („Aktive Signale“, Niveaus) bleiben die des Tagescharts.

## 4. Lizenzprüfung

| Frage | Befund | Folge |
|---|---|---|
| Kurzfristige Wochenkerzen | Werden aus den **bereits veröffentlichten** Tagesbars (`technical-signals-v1`, 270 Tage) im Browser gebildet. Es entsteht keine neue Datei und keine neue Kursreihe. | freigegeben, umgesetzt |
| Wochenformationen im Screener | Abgeleitete Werte (Formationstypen); keine Kurse. Die Owner-Erklärung vom 13.09.2026 (`publishBasis` der Reihen, `docs/VU_MULTI_ASSET_DATA_CORE.md`) nennt „Tageskurse, abgeleitete Werte und Kursverläufe“. | umgesetzt |
| Lange Wochen-OHLC (5 Jahre, Max) | Wäre eine **neue öffentliche Kursreihe** mit Eröffnung, Hoch, Tief und Volumen. Heute veröffentlicht sind nur Wochenschlüsse („Kein Intraday, keine Volumina, keine OHLC“). Der Vertragstext liegt dem Repository nicht vor (`docs/SUPERTRADER_BACKTEST_DATA_FEASIBILITY.md`, `VU_PROVIDER_LICENSE_CHECKLIST.md`). Eine Tiingo-Lizenzprüfung liegt als Entwurf einer anderen Session vor (#1179, `docs/data/TIINGO_LICENSE_REVIEW.md`, nicht gemergt). | **zurückgehalten**, bis die Owner-Entscheidung zur Redistribution vorliegt |

Intern prüfbar sind lange Wochen-OHLC schon heute: `completedSeries` arbeitet auf jeder Tagesreihe, also auch auf der vollen R2-Historie in der Materialisierung. Für eine Veröffentlichung braucht es:
1. die Owner-Freigabe zur Redistribution von Wochen-OHLC;
2. danach ein eigenes Artefakt, etwa `quant/data/market/weekly-ohlc/` beim Marktdaten-Erzeuger, nicht in Technical, mit `publishBasis`;
3. dann Wochenformationen auf der langen Reihe in Screener und Chart aus derselben Quelle.

## 5. Tests

- `quant/tests/technical-weekly-formations.test.mjs` (5):
  - `completedSeries` folgt derselben Regel wie `compute`;
  - echte OHLC;
  - Screener-Spalten = Engine auf denselben Wochen;
  - Kausalität und Mindestlänge;
  - Abfrage für Woche gültig, für Monat nicht.
- `technical/tests/technical-world.test.mjs`: Der Screener-Zustand mit `tf=1W` behält den Musterfilter.
- DQ-TW-1..8 PASS. Technical browser-qa 60/60. Chart „1J·W“ geprüft bei 390 px hell und 360 px dunkel, ohne horizontales Scrollen.
