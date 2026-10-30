# Technical – Datenvertrag v1 (`technical-screener-contract-1.1.0`)

Stabile Schnittstelle der Technical-Produktwelt für Frontend, `/screener/`, DQ und Tests. Gehört zu [TECHNICAL_COMPLETION_PLAN.md](TECHNICAL_COMPLETION_PLAN.md), AP2 (Kriterien B3, I4).

**Quelle der Wahrheit:** `quant/engines/technical/screener-contract.js`.
- Die Spaltentabelle unten ist daraus erzeugt (`node scripts/technical/contract-doc.mjs`).
- `technical/tests/technical-data-contract.test.mjs` prüft, dass sie aktuell ist.

## Artefakte

| Datei | Schema | Erzeuger | Inhalt |
|---|---|---|---|
| `technical/data/screener-v1.json` | `vu-technical-screener-1.*` | `scripts/technical/world/build-screener.mjs` | `{ schemaVersion, asOf, generatedFrom, versions, benchmark, count, cols }`. Spaltenform: je Spalte ein Array der Länge `count`, Zeile i = Titel `cols.s[i]`. |
| `technical/data/meta.json` | `vu-technical-meta-1.*` | derselbe | Stichtag, Versionen (gleich wie im Screener), Zähler (`rows`, `fresh`, `stale` …), Formationszählung, Quellen |
| `technical/data/index-v1.json` | `vu-technical-index-1.*` | derselbe | Startseite und Chart-Suche: `s`, `n`, Vorlagen (`presets`: Treffer der Abfrage), Fokus. Seit 1.1.0 zusätzlich `templates`: je Strategie-Vorlage `[erfüllt, fast erfüllt, unvollständig]` über Titel mit aktuellem Kurs (`technical/engine/templates.js#counts`, AP8). Jedes Kürzel steht im Screener. |
| `technical/data/formation-evidence.json` | eigener Vertrag | `formation-evidence.mjs` | historische Formations-Evidenz (Test „Formations-Evidenz: Vertrag …“) |
| `technical/data/signal-evidence.json` | `vu-technical-signal-evidence-1.*` | `signal-evidence.mjs` (aus `build-screener.mjs`) | historische Beobachtung zu Indikator-Ereignissen und Kerzenmustern, 20-Tage-Horizont, mit Einordnung `reading` (docs/technical/SIGNAL_EVIDENCE.md; Test „Signal-Evidenz: Vertrag …“) |
| `quant/data/product/technical-signals-v1/<Scherbe>.json.gz` | Materialisierung | `product-intelligence-materialization.yml` | 270 Tagesbars je Titel und Bündel (Features, Chartreihen, Woche/Monat). Grundlage für Chart Studio und Screener. |

## Regeln des Vertrags

1. **Spalten:**
   - Jede Spalte ist im Vertrag beschrieben.
   - Eine unbekannte Spalte ist ein Verstoß. Eine neue Spalte braucht also einen Vertragseintrag und erscheint dadurch hier.
   - Fehlende Pflichtspalten sind ein Verstoß.
   - Optionale Spalten tragen den Vermerk „(optional)“.
2. **Typen:**
   - `bool`: `true`, `false` oder `null`.
   - `num`: endliche Zahl. `pct` ist ein Anteil, 0,05 = 5 %.
   - `int`: ganze Zahl.
   - `date`: `JJJJ-MM-TT` und nie nach dem Stichtag, je Titel nach dessen `asOf`.
   - `enum` und `enumList`: nur Werte aus dem Abfragekatalog (`technical-query.js`), in Listen ohne Dubletten.
3. **`null`** heißt „nicht entscheidbar“: zu kurze Historie, keine Volumendaten, Titel veraltet oder eingefroren (SCREENER_FRESHNESS.md). `null` ist nie „falsch“ oder „0“.
4. **Ereignisse:** „Tage seit“ ist eine ganze Zahl ≥ 0 und kleiner als der zugehörige Prüfraum. Ein belegter Wert ohne Prüfraum ist ein Verstoß.
5. **Aktualität:**
   - `fresh = true` nur, wenn `asOf` = Stichtag des Universums.
   - `frozenSince` belegt ⇒ `fresh = false`.
6. **Formationsliste:** je Eintrag `[Typ, Zustand, erkannt, Ausbruchstag, Richtung, Kennzeichen]`.
   - Typ aus `FORMATION_TYPES`; Zustand `DETECTED` oder `CONFIRMED` (invalidierte stehen nicht in der Liste).
   - Ausbruchstag ≥ Erkennung und ≤ Stichtag.
   - Richtung `UP`, `DOWN` oder `null`.
   - Kennzeichen aus `B` (bei Erkennung ausgebrochen), `V` (vorläufig), `O` (Richtung offen).
7. **Meta und Index:**
   - `meta.asOf`, `meta.versions` und `meta.counts` passen zum Screener (`rows`, `fresh`, `stale`).
   - `index.asOf` = Stichtag. Jedes Index-Kürzel steht im Screener.

**Durchsetzung:**
- **Erzeuger:** `build-screener.mjs` prüft vor dem Schreiben. Bei einem Verstoß endet er mit Exit 2 und schreibt nichts, der letzte gültige Stand bleibt.
- **Test:** `technical/tests/technical-data-contract.test.mjs` prüft die committeten Artefakte und konstruierte Verstöße.
- **DQ:** DQ-TW-7 (`scripts/core/data-quality.mjs`).

**Versionen:**
- Eine neue optionale Spalte und neue Enum-Werte sind abwärtskompatibel. Sie erhöhen die Nebenversion des Vertrags.
- Ein entfallender Wert bleibt als Altwert gültig, z. B. Marktstruktur `NEUTRAL` seit `technical-query-1.10.0`.
- Eine entfallende Spalte oder ein Bedeutungswechsel braucht eine neue Hauptversion des Schemas und eine Owner-Freigabe.

## Befunde bei der Einführung (28.10.2026)

- **Marktstruktur:** Die Spalte `structure` enthält die Werte von `market-structure.js`: BULLISH, BEARISH, RANGE, MIXED und UNDETERMINED. Der Abfragekatalog bot dagegen BULLISH, BEARISH, RANGE und NEUTRAL an. 690 Titel (MIXED 629, UNDETERMINED 61) waren deshalb nicht auswählbar, und „Neutral“ fand nie einen Titel. Seit `technical-query-1.10.0` sind MIXED („Gemischt“) und UNDETERMINED („Unbestimmt“) wählbar. NEUTRAL bleibt als Altwert gültig, damit gespeicherte Suchen ihr Ergebnis behalten (dort nie ein Treffer), wird aber nicht mehr angeboten.
- **Extreme, aber korrekte Werte:**
  - `atrPct@1M` reicht bis 982.924.676 % (WHLR). Grund ist eine Reverse-Split-Kette: Der Wochenschluss fiel split-bereinigt in 70 Wochen von 402.408 auf 0,357. Eine ATR über 14 Monate im Verhältnis zum heutigen Kurs ist dann legitim riesig.
  - `relVol` ist bei einem Volumen-Median nahe 0 ebenfalls offen.
  - Der Vertrag lässt diese Werte deshalb nach oben offen. Begrenzt sind nur mathematisch begrenzte Größen: RSI, Stochastik, MFI, ADX, Choppiness, Connors RSI (0…100), Williams %R (−100…0), Aroon-Oszillator (−100…100), CMF (−1…1), Elder Impulse (−1, 0, 1), Abstand zum Hoch (−1…0) und Kursänderungen (≥ −1).
- **Chart ↔ Screener:** RSI 14 und ADX im Chart (aus 270 Bars) stimmen mit dem Screener (aus der Vollhistorie) bis auf Rundung überein: Median 0,003, 95. Perzentil 0,005 über 5.657 Titel. Alle Ausreißer sind eingefrorene Reihen (SCREENER_FRESHNESS.md, #1077).

## Spalten

<!-- contract:columns:start -->
technical-screener-contract-1.1.0, 160 Spalten.

| Spalte | Typ | null | Werte | Bedeutung |
|---|---|---|---|---|
| `aboveCloud` | bool | ja |  | Kurs über der Ichimoku-Wolke |
| `aboveEma20` | bool | ja |  | Kurs über EMA 20 |
| `aboveEma200` | bool | ja |  | Kurs über EMA 200 |
| `aboveEma50` | bool | ja |  | Kurs über EMA 50 |
| `aboveSma150` | bool | ja |  | Kurs über SMA 150 |
| `aboveSma200` | bool | ja |  | Kurs über SMA 200 |
| `aboveSma200@1M` | bool | ja |  | Kurs über 10-Monats-Linie |
| `aboveSma200@1W` | bool | ja |  | Kurs über 40-Wochen-Linie |
| `aboveSma50` | bool | ja |  | Kurs über SMA 50 |
| `aboveSma50@1M` | bool | ja |  | Kurs über 5-Monats-Linie |
| `aboveSma50@1W` | bool | ja |  | Kurs über 10-Wochen-Linie |
| `adx` | num | ja | 0 … 100 | ADX 14 (Trendstärke) |
| `adx@1M` | num | ja | 0 … 100 | ADX 14 (Monat) |
| `adx@1W` | num | ja | 0 … 100 | ADX 14 (Woche) |
| `aroonOsc` | num (ganzzahlig) | ja | −100 … 100 | Aroon-Oszillator 25 (−100 bis 100) |
| `asOf` | date | nein |  | letzter Bar des Titels |
| `atrPct` | pct | ja | 0 … ∞ | ATR 14 in % des Kurses |
| `atrPct@1M` | pct | ja | 0 … ∞ | ATR 14 (Monat) in % des Kurses |
| `atrPct@1W` | pct | ja | 0 … ∞ | ATR 14 (Woche) in % des Kurses |
| `bars` | int | nein | 1 … ∞ | Tagesbars im Analysefenster |
| `bbPctB` | num | ja | endlich | Bollinger %B (20, 2) |
| `bbSqueeze` | bool | ja |  | Bollinger-Enge (Breite im unteren 20-%-Perzentil) |
| `candleBearDays` | int, Prüfraum `candleWindow` | ja | 0 … ∞ | Tage seit einem bärischen Kerzenmuster |
| `candleBearish` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bärisches Kerzenmuster am Stichtag |
| `candleBearish@1M` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bärisches Kerzenmuster (Monatskerze) |
| `candleBearish@1W` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bärisches Kerzenmuster (Wochenkerze) |
| `candleBullDays` | int, Prüfraum `candleWindow` | ja | 0 … ∞ | Tage seit einem bullischen Kerzenmuster |
| `candleBullish` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bullisches Kerzenmuster am Stichtag |
| `candleBullish@1M` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bullisches Kerzenmuster (Monatskerze) |
| `candleBullish@1W` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Bullisches Kerzenmuster (Wochenkerze) |
| `candleNeutral` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Neutrales Kerzenmuster am Stichtag (Unentschlossenheit) |
| `candleNeutral@1M` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Neutrales Kerzenmuster (Monatskerze) |
| `candleNeutral@1W` | enumList | ja | doji, dragonflyDoji, gravestoneDoji, longLeggedDoji, hammer, hangingMan, invertedHammer, shootingStar, marubozu, spinningTop, engulfing, harami, haramiCross, piercing, darkCloudCover, tweezer, kicking, morningStar, eveningStar, morningDojiStar, eveningDojiStar, abandonedBaby, threeWhiteSoldiers, threeBlackCrows, threeInside, threeOutside, threeMethods | Neutrales Kerzenmuster (Wochenkerze) |
| `candleWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `cci20` | num | ja | endlich | CCI 20 |
| `chg1d` | pct | ja | −1 … ∞ | Tagesänderung |
| `choppiness14` | num | ja | 0 … 100 | Choppiness Index 14 (unter 38,2 Trend, über 61,8 seitwärts) |
| `close` | num | ja | 0 … ∞ | Schlusskurs (USD) |
| `cmf20` | num | ja | −1 … 1 | Chaikin Money Flow 20 (−1 bis 1) |
| `connorsRsi` | num | ja | 0 … 100 | Connors RSI (3/2/100) |
| `crossAboveSma200Days` | int, Prüfraum `sma200CrossWindow` | ja | 0 … ∞ | Tage seit Schluss über SMA 200 gekreuzt |
| `crossAboveSma200Days@1M` | int, Prüfraum `sma200CrossWindow@1M` | ja | 0 … ∞ | Monate seit Schluss über die 10-Monats-Linie gekreuzt |
| `crossAboveSma200Days@1W` | int, Prüfraum `sma200CrossWindow@1W` | ja | 0 … ∞ | Wochen seit Schluss über die 40-Wochen-Linie gekreuzt |
| `crossBelowSma200Days` | int, Prüfraum `sma200CrossWindow` | ja | 0 … ∞ | Tage seit Schluss unter SMA 200 gekreuzt |
| `crossBelowSma200Days@1M` | int, Prüfraum `sma200CrossWindow@1M` | ja | 0 … ∞ | Monate seit Schluss unter die 10-Monats-Linie gekreuzt |
| `crossBelowSma200Days@1W` | int, Prüfraum `sma200CrossWindow@1W` | ja | 0 … ∞ | Wochen seit Schluss unter die 40-Wochen-Linie gekreuzt |
| `deathCrossDays` | int, Prüfraum `smaCrossWindow` | ja | 0 … ∞ | Tage seit Death Cross (SMA 50 kreuzt SMA 200 abwärts) |
| `distChandelierLong` | pct | ja | −1 … ∞ | Abstand zum Chandelier-Stop (lang, 22/3) |
| `distEma200` | pct | ja | −1 … ∞ | Abstand zur EMA 200 |
| `distHigh200w` | pct | ja | −1 … 0 | Abstand zum 200-Wochen-Schlusshoch |
| `distHigh52w` | pct | ja | −1 … 0 | Abstand zum 52-Wochen-Hoch |
| `distHigh52w@1M` | pct | ja | −1 … 0 | Abstand zum 12-Monats-Schlusshoch |
| `distHigh52w@1W` | pct | ja | −1 … 0 | Abstand zum 52-Wochen-Schlusshoch |
| `distLow52w` | pct | ja | 0 … ∞ | Abstand über dem 52-Wochen-Tief (Tagestief) |
| `distSma150` | pct | ja | −1 … ∞ | Abstand zur SMA 150 |
| `distSma200` | pct | ja | −1 … ∞ | Abstand zur SMA 200 |
| `distSma200@1M` | pct | ja | −1 … ∞ | Abstand zur 10-Monats-Linie |
| `distSma200@1W` | pct | ja | −1 … ∞ | Abstand zur 40-Wochen-Linie |
| `distSma50` | pct | ja | −1 … ∞ | Abstand zur SMA 50 (nur Anzeige) |
| `elderImpulse` | num (ganzzahlig) | ja | −1 … 1 | Elder Impulse (+1 grün, 0 blau, −1 rot) |
| `formationActive` | enumList | ja | SYMMETRICAL_TRIANGLE, ASCENDING_TRIANGLE, DESCENDING_TRIANGLE, BULL_FLAG, BEAR_FLAG, BULL_PENNANT, BEAR_PENNANT, RISING_WEDGE, FALLING_WEDGE, DOUBLE_TOP, DOUBLE_BOTTOM, HEAD_AND_SHOULDERS, INVERSE_HEAD_AND_SHOULDERS, RECTANGLE, CUP_WITH_HANDLE, SUPPORT_TRENDLINE, RESISTANCE_TRENDLINE, ASCENDING_CHANNEL, DESCENDING_CHANNEL, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_UP, GAP_DOWN | Formation erkannt oder bestätigt |
| `formationConfirmed` | enumList | ja | SYMMETRICAL_TRIANGLE, ASCENDING_TRIANGLE, DESCENDING_TRIANGLE, BULL_FLAG, BEAR_FLAG, BULL_PENNANT, BEAR_PENNANT, RISING_WEDGE, FALLING_WEDGE, DOUBLE_TOP, DOUBLE_BOTTOM, HEAD_AND_SHOULDERS, INVERSE_HEAD_AND_SHOULDERS, RECTANGLE, CUP_WITH_HANDLE, SUPPORT_TRENDLINE, RESISTANCE_TRENDLINE, ASCENDING_CHANNEL, DESCENDING_CHANNEL, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_UP, GAP_DOWN | Formation bestätigt |
| `formationConfirmedDown` | enumList | ja | SYMMETRICAL_TRIANGLE, ASCENDING_TRIANGLE, DESCENDING_TRIANGLE, BULL_FLAG, BEAR_FLAG, BULL_PENNANT, BEAR_PENNANT, RISING_WEDGE, FALLING_WEDGE, DOUBLE_TOP, DOUBLE_BOTTOM, HEAD_AND_SHOULDERS, INVERSE_HEAD_AND_SHOULDERS, RECTANGLE, CUP_WITH_HANDLE, SUPPORT_TRENDLINE, RESISTANCE_TRENDLINE, ASCENDING_CHANNEL, DESCENDING_CHANNEL, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_UP, GAP_DOWN | Formation bestätigt, Ausbruch nach unten |
| `formationConfirmedUp` | enumList | ja | SYMMETRICAL_TRIANGLE, ASCENDING_TRIANGLE, DESCENDING_TRIANGLE, BULL_FLAG, BEAR_FLAG, BULL_PENNANT, BEAR_PENNANT, RISING_WEDGE, FALLING_WEDGE, DOUBLE_TOP, DOUBLE_BOTTOM, HEAD_AND_SHOULDERS, INVERSE_HEAD_AND_SHOULDERS, RECTANGLE, CUP_WITH_HANDLE, SUPPORT_TRENDLINE, RESISTANCE_TRENDLINE, ASCENDING_CHANNEL, DESCENDING_CHANNEL, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_UP, GAP_DOWN | Formation bestätigt, Ausbruch nach oben |
| `formationNewDays` | int, Prüfraum `formationWindow` | ja | 0 … ∞ | Tage seit der jüngsten Formations-Erkennung |
| `formationOpen` | enumList | ja | SYMMETRICAL_TRIANGLE, ASCENDING_TRIANGLE, DESCENDING_TRIANGLE, BULL_FLAG, BEAR_FLAG, BULL_PENNANT, BEAR_PENNANT, RISING_WEDGE, FALLING_WEDGE, DOUBLE_TOP, DOUBLE_BOTTOM, HEAD_AND_SHOULDERS, INVERSE_HEAD_AND_SHOULDERS, RECTANGLE, CUP_WITH_HANDLE, SUPPORT_TRENDLINE, RESISTANCE_TRENDLINE, ASCENDING_CHANNEL, DESCENDING_CHANNEL, RANGE_BREAKOUT, RESISTANCE_BREAKOUT, VOLATILITY_CONTRACTION, GAP_UP, GAP_DOWN | Formation offen (noch ohne Ausbruch) |
| `formationWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `formations` | formations | ja |  | aktive Formationen [Typ, Zustand, erkannt, Ausbruchstag, Richtung, Kennzeichen] |
| `fresh` | bool | nein |  | Kursstand aktuell |
| `frozenSince` | date | ja |  | erster Tag des unveränderten Schlusskurses im Fenster der Tagesbars (Datenqualitätshinweis, ab screen-row 1.10.0) (optional) |
| `goldenCrossDays` | int, Prüfraum `smaCrossWindow` | ja | 0 … ∞ | Tage seit Golden Cross (SMA 50 kreuzt SMA 200 aufwärts) |
| `hasVolume` | bool | nein |  | Volumendaten vorhanden |
| `high52wWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `histVol20` | pct | ja | 0 … ∞ | Historische Volatilität 20 Tage (annualisiert) |
| `hmaRising` | bool | ja |  | Hull MA 20 steigt |
| `insideBar` | bool | ja |  | Inside Bar (Hoch und Tief innerhalb des Vortags) |
| `insideBar@1M` | bool | ja |  | Inside Month (Hoch und Tief innerhalb des Vormonats) |
| `insideBar@1W` | bool | ja |  | Inside Week (Hoch und Tief innerhalb der Vorwoche) |
| `macdPositive` | bool | ja |  | MACD-Histogramm positiv |
| `macdPositive@1M` | bool | ja |  | MACD-Histogramm positiv (Monat) |
| `macdPositive@1W` | bool | ja |  | MACD-Histogramm positiv (Woche) |
| `mfi14` | num | ja | 0 … 100 | Money Flow Index 14 |
| `n` | string | ja |  | Name |
| `newHigh200w` | bool | ja |  | Neues 200-Wochen-Hoch (Wochenschluss) |
| `newHigh20d` | bool | ja |  | Schluss über dem 20-Tage-Hoch (Donchian-Ausbruch) |
| `newHigh52w` | bool | ja |  | Neues 52-Wochen-Hoch (Tageshoch) |
| `newHigh52w@1M` | bool | ja |  | 12-Monats-Hoch (Monatsschluss) |
| `newHigh52w@1W` | bool | ja |  | 52-Wochen-Hoch (Wochenschluss) |
| `newHigh52wDays` | int, Prüfraum `high52wWindow` | ja | 0 … ∞ | Tage seit neuem 52-Wochen-Hoch (prüfbar 18 Tage) |
| `newLow20d` | bool | ja |  | Schluss unter dem 20-Tage-Tief (Donchian-Ausbruch) |
| `newLow52w` | bool | ja |  | Neues 52-Wochen-Tief: Tagestief auf dem tiefsten Tagestief der letzten 52 Wochen |
| `newLow52w@1M` | bool | ja |  | 12-Monats-Schlusstief: Monatsschluss auf dem tiefsten Monatsschluss der letzten 12 Monate |
| `newLow52w@1W` | bool | ja |  | 52-Wochen-Schlusstief: Wochenschluss auf dem tiefsten Wochenschluss der letzten 52 Wochen |
| `nr7` | bool | ja |  | NR7 (engste Tagesspanne der letzten 7 Tage) |
| `nr7@1M` | bool | ja |  | NR7 (engste Monatsspanne der letzten 7 Monate) |
| `nr7@1W` | bool | ja |  | NR7 (engste Wochenspanne der letzten 7 Wochen) |
| `obvRising` | bool | ja |  | OBV steigt (20 Tage) |
| `psarUp` | bool | ja |  | Parabolic SAR unter dem Kurs (aufwärts) |
| `relVol` | num | ja | 0 … ∞ | Relatives Volumen (zum 20-Tage-Median) |
| `relVol@1M` | num | ja | 0 … ∞ | Relatives Monatsvolumen (zum 20-Monats-Median) |
| `relVol@1W` | num | ja | 0 … ∞ | Relatives Wochenvolumen (zum 20-Wochen-Median) |
| `roc126` | pct | ja | −1 … ∞ | Kursänderung 126 Tage (ROC, 6 Monate) |
| `roc126@1M` | pct | ja | −1 … ∞ | Kursänderung 6 Monate (ROC) |
| `roc126@1W` | pct | ja | −1 … ∞ | Kursänderung 26 Wochen (ROC) |
| `roc21` | pct | ja | −1 … ∞ | Kursänderung 21 Tage (ROC) |
| `roc21@1M` | pct | ja | −1 … ∞ | Kursänderung 1 Monat (ROC) |
| `roc21@1W` | pct | ja | −1 … ∞ | Kursänderung 4 Wochen (ROC) |
| `roc252` | pct | ja | −1 … ∞ | Kursänderung 252 Tage (ROC, 12 Monate) |
| `roc252@1M` | pct | ja | −1 … ∞ | Kursänderung 12 Monate (ROC) |
| `roc252@1W` | pct | ja | −1 … ∞ | Kursänderung 52 Wochen (ROC) |
| `roc63` | pct | ja | −1 … ∞ | Kursänderung 63 Tage (ROC, 3 Monate) |
| `roc63@1M` | pct | ja | −1 … ∞ | Kursänderung 3 Monate (ROC) |
| `roc63@1W` | pct | ja | −1 … ∞ | Kursänderung 13 Wochen (ROC) |
| `rs3m` | pct | ja | endlich | Relative Stärke 3 Monate ggü. S&P 500 (SPY) |
| `rs6m` | pct | ja | endlich | Relative Stärke 6 Monate ggü. S&P 500 (SPY) |
| `rsPositive` | bool | ja |  | Positive relative Stärke (6 Monate) |
| `rsRank` | num | ja | 0 … 100 | RS-Rang 6 Monate (0 = schwächster, 100 = stärkster Titel) |
| `rsi14` | num | ja | 0 … 100 | RSI 14 |
| `rsi14@1M` | num | ja | 0 … 100 | RSI 14 (Monat) |
| `rsi14@1W` | num | ja | 0 … 100 | RSI 14 (Woche) |
| `rsiEventWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `rsiEventWindow@1M` | int | ja | 1 … ∞ | Prüfraum in Monaten |
| `rsiEventWindow@1W` | int | ja | 1 … ∞ | Prüfraum in Wochen |
| `rsiExitOverboughtDays` | int, Prüfraum `rsiEventWindow` | ja | 0 … ∞ | Tage seit RSI 14 von oben unter 70 |
| `rsiExitOverboughtDays@1M` | int, Prüfraum `rsiEventWindow@1M` | ja | 0 … ∞ | Monate seit Monats-RSI 14 von oben unter 70 |
| `rsiExitOverboughtDays@1W` | int, Prüfraum `rsiEventWindow@1W` | ja | 0 … ∞ | Wochen seit Wochen-RSI 14 von oben unter 70 |
| `rsiExitOversoldDays` | int, Prüfraum `rsiEventWindow` | ja | 0 … ∞ | Tage seit RSI 14 von unten über 30 |
| `rsiExitOversoldDays@1M` | int, Prüfraum `rsiEventWindow@1M` | ja | 0 … ∞ | Monate seit Monats-RSI 14 von unten über 30 |
| `rsiExitOversoldDays@1W` | int, Prüfraum `rsiEventWindow@1W` | ja | 0 … ∞ | Wochen seit Wochen-RSI 14 von unten über 30 |
| `s` | string | nein |  | Kürzel (eindeutig) |
| `sid` | string | nein |  | securityId (core/identity.js) |
| `sma150AboveSma200` | bool | ja |  | SMA 150 über SMA 200 |
| `sma200CrossWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `sma200CrossWindow@1M` | int | ja | 1 … ∞ | Prüfraum in Monaten |
| `sma200CrossWindow@1W` | int | ja | 1 … ∞ | Prüfraum in Wochen |
| `sma200Rising` | bool | ja |  | SMA 200 steigt (gegenüber vor einem Monat) |
| `sma200Slope21` | pct | ja | −1 … ∞ | Veränderung der SMA 200 über einen Monat |
| `sma50AboveSma150` | bool | ja |  | SMA 50 über SMA 150 |
| `sma50AboveSma200` | bool | ja |  | SMA 50 über SMA 200 |
| `sma50AboveSma200@1M` | bool | ja |  | 5- über 10-Monats-Linie |
| `sma50AboveSma200@1W` | bool | ja |  | 10- über 40-Wochen-Linie |
| `smaCrossWindow` | int | ja | 1 … ∞ | Prüfraum in Handelstagen |
| `spark` | spark | nein |  | letzte ≤ 60 Schlüsse, 0..99 normiert |
| `stochK` | num | ja | 0 … 100 | Stochastik %K (14, 3) |
| `stochK@1M` | num | ja | 0 … 100 | Stochastik %K (14, 3, Monat) |
| `stochK@1W` | num | ja | 0 … 100 | Stochastik %K (14, 3, Woche) |
| `structure` | enum | ja | BULLISH, BEARISH, RANGE, MIXED, UNDETERMINED, NEUTRAL | Marktstruktur (Swings) |
| `supertrendUp` | bool | ja |  | Supertrend (10, 3) aufwärts |
| `suspectJumpAt` | date | ja |  | jüngster Kurssprung mit Datenverdacht (60 Bars) |
| `ulcer14` | pct | ja | 0 … ∞ | Ulcer Index 14 (Rückschlagsrisiko) |
| `volAboveAvg` | bool | ja |  | Volumen über Durchschnitt |
| `volAboveAvg@1M` | bool | ja |  | Monatsvolumen über Durchschnitt |
| `volAboveAvg@1W` | bool | ja |  | Wochenvolumen über Durchschnitt |
| `volSpike` | bool | ja |  | Volumenspitze (≥ 2× Median) |
| `volSpike@1M` | bool | ja |  | Volumenspitze im Monat (≥ 2× Median) |
| `volSpike@1W` | bool | ja |  | Volumenspitze in der Woche (≥ 2× Median) |
| `vortexBull` | bool | ja |  | Vortex: VI+ über VI− (14) |
| `weeks` | int | nein | 0 … ∞ | Wochenschlüsse (lange Reihe) |
| `williamsR` | num | ja | −100 … 0 | Williams %R 14 (−100 bis 0) |
| `zScore20` | num | ja | endlich | Z-Score 20 (Abstand zum 20-Tage-Mittel in Standardabweichungen) |
<!-- contract:columns:end -->
