# Exakte EMA 200 – Materialisierung (ema-settled-1.0.0)

Stand: 25.10.2026 · Branch `claude/technical-ema200` · **Fachmodelländerung, kein automatischer Merge**

## Worum es geht

Technical zeigt bisher nur die SMA 200. Eine EMA 200, die der Browser auf den 270 Tagesbars des Anzeigefensters rechnet, wird noch stark von ihrem Startwert bestimmt. Am Ende des Fensters wirkt dieser Startwert noch mit 50 % (siehe unten). Dieser Branch rechnet die EMA 20, 50 und 200 im Produzenten auf der vollen, split-bereinigten Historie. Ein Wert wird nur veröffentlicht, wenn er nachweislich nicht mehr vom Startwert abhängt.

Neue Felder, rein additiv:

| Pfad im Shard (`quant/data/product/technical-signals-v1/<XX>.json.gz`) | Inhalt |
|---|---|
| `instruments[T].bundle.featuresAtCutoff.ema200` | EMA 200 am Stichtag, oder `null` bei zu kurzer Historie |
| `instruments[T].bundle.chartSeries.ema20` / `ema50` / `ema200` | Reihen im Anzeigefenster (270 Werte, auf 1e-4 gerundet wie `sma200`), `null` während der Aufwärmphase |
| `instruments[T].bundle.emaSettlement` | Regel, Version `ema-settled-1.0.0`, je Periode `warmupBars`, `minimumBars`, `seedIndex`, `firstSettledIndex`/`-Date`, `barsAfterSeed`, `status` (`SETTLED` oder `INSUFFICIENT_HISTORY`) |

Kein bestehendes Feld ändert sich. `ENGINE_BUNDLE_VERSION`, `featureVersion`, `parametersHash` und `snapshotId` bleiben gleich, ebenso jede Engine-Entscheidung (Trend, Szenarien, Score). Keine Engine liest die neuen Felder.

Code:
- `quant/engines/technical/feature-store.js`: `settledEma`, `emaWarmupBars`, `emaSeedWeight`, `EMA_MAX_SEED_WEIGHT`. Gerechnet wird mit der bestehenden `ema()`, es gibt keine zweite Formel.
- `quant/engines/technical/technical-analysis.js`: füllt die drei Pfade.
- Produzent `scripts/technical/materialize-product-intelligence.mjs` (Workflow `product-intelligence-materialization.yml`) ist **unverändert**. Er projiziert `chartSeries` bereits schlüsselweise ins Anzeigefenster (`product-materialization.js#compactBundle`).
- Workflows, Zeitpläne und Rechte sind unverändert.

## 1. Aufwärmphase

`ema()` startet am Index `p-1` mit dem SMA der ersten `p` Werte und rechnet danach `e_t = e_{t-1} + a·(x_t − e_{t-1})` mit `a = 2/(p+1)`.

Nach `k` weiteren Bars ist der Wert eine gewichtete Summe der echten Kurse plus dem Startwert mit dem Gewicht `(1−a)^k`. Zwei EMA-Läufe mit verschiedenem Start unterscheiden sich am Ende also genau um

    |e_t − e'_t| = (1−a)^k · |Start − Start'|

Das gilt für SMA-Start, Erstwert-Start oder unendliche Historie gleichermaßen.

**Regel:** Ein Wert wird erst veröffentlicht, wenn `(1−a)^k ≤ 1e-3` ist. Davor steht `null` (Missing ≠ Zero). `k` zählt nur endliche Beobachtungen nach dem Startindex.

| Periode | a | k (Startgewicht ≤ 1e-3) | Mindesthistorie p + k | Startgewicht genau |
|---|---|---|---|---|
| EMA 20 | 2/21 | 70 | 90 Bars | 9,07e-4 |
| EMA 50 | 2/51 | 173 | 223 Bars | 9,87e-4 |
| **EMA 200** | 2/201 | **691** | **891 Bars (~3,5 Jahre)** | 9,977e-4 |

Zum Vergleich: Wie weit ist das Startgewicht der EMA 200 auf dem 270-Bar-Fenster abgeklungen?

| Fenster nach dem Start | Startgewicht |
|---|---|
| 70 Bars (Ende des 270er-Fensters, Start bei Bar 199) | 0,497 |
| 270 Bars | 0,067 |
| 691 Bars | 0,000998 |

Das bestätigt den Methodik-Satz von bisher: 270 Bars reichen nicht.

**Warum 1e-3?**
1. Der Fehler ist dann kleiner als ein Tausendstel der Startabweichung. An den fünf Golden-Reihen (AAPL, JPM, MSFT, NVDA, XOM, je 2.970 Bars) wurden 850 Fenster mit genau 891 Bars gerechnet, deren Wert jeweils mit der Vollhistorie verglichen wurde. Größte relative Abweichung: **5,9e-5** (JPM). Größter Quotient Fehler/Startabweichung: **9,977e-4**, das ist exakt `(199/201)^691`, die Theorie stimmt also auf die Stelle. Auch die andere Konvention (Erstwert statt SMA als Start) lag höchstens **6,2e-5** daneben. Damit ist der Wert konventionsunabhängig.
2. Bei 1e-2 (661 Bars) würde die Startabweichung noch mit 1 % durchschlagen. Bei einem Titel, dessen 200-Tage-Mittel sich um 30 % von der Start-SMA unterscheidet, wären das 0,3 %. Das ist mehr als der Abstand vieler Titel zur Linie.
3. Bei 1e-4 (1.122 Bars) verlören weitere 164 Titel ihren Wert, ohne dass sich eine Seitenaussage messbar ändert.

Abdeckung am committeten Stand (`technical-signals-v1/summary.json`, 5.655 Bundles):

| Schwelle | Mindesthistorie | Titel mit EMA 200 | ohne |
|---|---|---|---|
| 1e-2 | 661 | 5.153 | 502 |
| **1e-3** | **891** | **4.969** | **686** |
| 1e-4 | 1.122 | 4.805 | 850 |

Bei 198 Titeln (891 bis 1.159 Bars) beginnt die EMA-200-Linie erst innerhalb des 270-Bar-Fensters. Der Chart zeigt sie dann ab ihrem ersten gültigen Tag.

## 2. Preisbereinigungen

- Die EMA rechnet auf **`series.close` der `SPLIT_ADJUSTED`-Reihe**, also auf demselben Array, auf dem `sma200` entsteht. Der Produzent baut sie in `Canonical.fromPriceBars` aus `bar.splitFactor`. Dass diese Split-Definition identisch mit `quant/engines/return-series.js#splitFactors` ist (ADR-002), hält bereits `quant/tests/split-adjust-technical-equivalence.test.mjs` fest. EMA-7 prüft zusätzlich die EMA auf beiden Wegen: Abweichung < 1e-6, also nur die Rundung von `round6`.
- Wirkung eines Splits auf eine lange EMA: Auf Rohkursen bliebe der Kurs vor dem Split noch 691 Bars lang im Wert. Gemessen an den Golden-Reihen läge die Roh-EMA bei AAPL (4:1, 2020) bis zu **4-fach** und bei NVDA (4:1 2021, 10:1 2024) bis zu **40-fach** neben der bereinigten. Auf der bereinigten Reihe gibt es keinen Sprung. EMA-7 prüft das mit einem 1:10-Split bei konstantem wirtschaftlichem Kurs: Die Änderung von Bar 999 auf 1000 ist kleiner als 0,1 %.
- Dividenden werden nicht herausgerechnet, genau wie bei der SMA 200. Technical ist eine Kurs-, keine Gesamtrendite-Sicht. Eine Gesamtrendite-EMA wäre eine eigene Methodikentscheidung.
- Es gibt keine neue Preisableitung und keine Verwendung von `adjClose`.

## 3. Unvollständige Historien

| Fall | Verhalten | Test |
|---|---|---|
| IPO / kurze Historie (< 891 Bars) | `featuresAtCutoff.ema200 = null`, `chartSeries.ema200` ganz `null`, `emaSettlement…status = "INSUFFICIENT_HISTORY"`. EMA 20/50 bleiben, solange 90/223 Bars vorhanden sind. Das Produkt verlangt ohnehin mindestens 300 Bars, also sind EMA 20/50 am Stichtag immer gesetzt. | EMA-8, EMA-9 |
| Genau 890 / 891 Bars | 890 ergibt `null`, 891 ergibt einen Wert am letzten Bar | EMA-8 |
| Fehlende Beobachtung (NaN) nach dem Start | Der Wert wird fortgetragen und zählt **nicht** als Abklingschritt. Die Aufwärmphase verlängert sich um diese Bar. | EMA-8 |
| Fehlende Beobachtung vor dem Start | Der SMA-Start braucht `p` lückenlose Werte. Der Start rückt hinter die Lücke, und die Aufwärmphase beginnt dort. | EMA-8 |
| Kalenderlücken (Handelsaussetzung, dünner Handel) | Die EMA läuft je **vorhandener** Bar, wie SMA 200, RSI und alle Tagesindikatoren. Es werden keine Bars erfunden. Die Kalenderprüfung des Produzenten (`validateTechnicalCalendar`, letzte 270 Bars) gilt unverändert. | – |

## 4. Zeitrahmen

- **Tag:** Hier materialisiert, siehe oben.
- **Woche:** Der Wochenchart in `technical/app.js` (5J/Max) liest `quant/data/market/discover-series-long/<securityId>.json`. Das sind Wochenschlüsse, split-bereinigt und nur Schlusskurse. Er zeigt SMA 10 W und SMA 40 W, im Browser gerechnet. `ti/context.js` (1W) rechnet EMA 10/20 auf Wochenbars. **Dieser Branch ändert den Wochenpfad nicht.** Eine „EMA 40 W“ ist nicht dasselbe wie eine EMA 200 D: Sie glättet Wochenschlüsse mit `a = 2/41` und kennt die Tage dazwischen nicht. Sie bräuchte nach derselben Regel 40 + 138 = 178 Wochen. Wird sie gewünscht, gehört sie in einen eigenen PR. Die Rechnung kann im Browser bleiben, weil die lange Reihe vollständig ausgeliefert wird.
- **Monat:** unverändert.

## 5. Signalwirkungen

Was sich durch diesen Branch ändert:
- **Chart Studio** (`technical/app.js`): Die Schicht „EMA 20/50/200“ zeigt EMA 20/50 aus der Vollhistorie, wenn das Bundle sie trägt. Sonst bleibt es wie bisher bei der Rechnung im Fenster. Die EMA 200 erscheint gestrichelt in der Farbe der SMA 200, aber nur, wenn das Bundle mindestens einen gültigen Wert trägt. Der Methodik-Satz „EMA 200 wird bewusst nicht gezeigt …“ ist ersetzt.

Was sich **nicht** ändert, mit Absicht:
- Screener (`screen-row.js`): Er hat `aboveEma20`/`aboveEma50`, aber **kein** `aboveEma200`. Das Feld wäre eine Zeile (`row.aboveEma200 = isNum(f.ema200) ? c > f.ema200 : null`), ändert aber das Screener-Artefakt und seine Filterliste. Dafür gehört es in einen eigenen PR mit Vorher/Nachher.
- Marktregime (`build-market-regime.mjs#above200`), Home-Karte „Über die 200-Tage-Linie gestiegen“ und Signals (`priceTo200dma`) bleiben bei der SMA 200.
- Trend, Szenarien, Opportunity Score und Elliott lesen die neuen Felder nicht.

**Zählung am committeten Stand** (`node scripts/technical/measure-ema200-signal-effect.mjs`, Stichtag 23.10.2026). Die committeten Shards tragen noch keine `ema200`. Das Skript **schätzt** sie deshalb: Es rechnet eine Wochen-EMA über `discover-series-long` vor dem Fenster und dann Tag für Tag über die 270 Bars. Ein Fehler des Wochenvorlaufs wirkt am Stichtag nur mit 0,067. Je Titel wird eine Unsicherheit `u = max(3·0,067·|EMA_Woche − EMA_Tag|/EMA_Tag, 1e-3)` gemessen, und Titel mit `|Schluss/EMA − 1| ≤ u` gelten als nicht entscheidbar. Zur Validierung wurde der Schätzer an den fünf Golden-Titeln mit dem exakten Wert verglichen: 0,4e-4 bis 4,3e-4 relativ daneben. EMA-11 prüft das an XOM.

| | Anzahl |
|---|---|
| Bundles | 5.655 |
| Schluss > SMA 200 (exakt, alle Bundles) | 2.035 (36,0 %) |
| mit EMA 200 (≥ 891 Bars) | 4.969 |
| davon ohne Wochenreihe vor dem Fenster (nicht schätzbar) | 20 |
| davon nicht entscheidbar (Schluss im Unsicherheitsband) | 45 |
| **entschieden** | **4.904** |
| davon Schluss > SMA 200 | 1.818 |
| davon Schluss > EMA 200 | 1.802 |
| **SMA und EMA uneinig** | **228 (4,6 %)** |
| · über SMA, unter EMA | 122 |
| · unter SMA, über EMA | 106 |

Abstand EMA 200 zu SMA 200 (relativ, n = 4.904): 5 % −8,3 % · 25 % −2,3 % · Median −0,08 % · 75 % +3,6 % · 95 % +24,6 %. Die EMA reagiert schneller. Bei Titeln mit starkem Rückgang liegt sie oberhalb der SMA, bei Aufwärtstrends darunter.

Sobald die Daily-Materialisierung mit diesem Code gelaufen ist, zählt dasselbe Skript **exakt** (Modus `EXACT`, ohne Schätzung).

## 6. Vorher/Nachher

Die Vollhistorie (R2) liegt nur im Runner. Lokal wurde der Produzent deshalb auf den fünf Golden-Reihen (`quant/data/market/golden-preview/daily`, 2.970 Bars, Splits bei AAPL und NVDA) zweimal gefahren, mit gleichem `--now` und in ein Scratch-Verzeichnis. Einmal mit dem Code von `origin/main` (b7f787f), einmal mit diesem Branch. Danach wurde verglichen mit:

    node scripts/technical/compare-ema-materialization.mjs <vorher> <nachher>

Ergebnis: `verdict: PASS`.
- 5/5 Instrumente sind **bitgleich**, nachdem genau die fünf neuen Pfade entfernt wurden (JSON-Serialisierung Byte für Byte).
- Es gibt keinen weiteren neuen Schlüssel. `signals-5/20/60.json.gz` sind byte-identisch, `summary.json` ist bis auf die Größenangaben identisch.
- Größe, 5 Golden-Shards: roh +40.002 B (+8,0 KB je Titel), gzip +17.675 B (**+3,5 KB je Titel, +7,8 %**).
- Kosten je Pfad (roh, 5 Titel): `chartSeries.ema20/50/200` je ~12,0 KB, `emaSettlement` 3,7 KB, `featuresAtCutoff.ema200` 0,1 KB.
- Hochgerechnet auf 5.655 Bundles: gzip rund **+20 MB** auf 237,9 MB Shards (+8,4 %), roh rund +45 MB auf 1,56 GB (+2,9 %). Titel unter 891 Bars tragen `null`-Reihen und kosten weniger. Die Aktienseite lädt im Release je Titel ein Dokument und damit ~8 KB decodiert mehr. Das Budget `stock` (3.300.000 B) hat dafür Luft.
- Wer gzip sparen will: `chartSeries.ema20/50` sind zwei Drittel des Zuwachses. Der Browser kann sie im Fenster nachrechnen; nach der Aufwärmphase sind sie praktisch gleich. Sie stehen hier, weil der Auftrag Konsistenz mit der EMA 200 verlangt. Weglassen wäre eine Zeile in `technical-analysis.js`.

Reproduzieren in Scratch-Verzeichnissen. Nichts unter `quant/data` wird geschrieben. Ein Lauf dauert etwa 1 s, weil alle anderen Titel `SOURCE_MISSING` sind:

```bash
W=$(mktemp -d); mkdir -p $W/work/tiingo/daily $W/main
cp quant/data/market/golden-preview/daily/*.json $W/work/tiingo/daily/
# Code "vorher" = origin/main, nur die Pfade, die der Produzent braucht
git archive origin/main quant/engines quant/api quant/config quant/methodology \
  quant/data/universe/market-capability.json scripts/technical/materialize-product-intelligence.mjs core | tar -x -C $W/main
NOW=2026-10-25T00:00:00.000Z
node $W/main/scripts/technical/materialize-product-intelligence.mjs --work-dir $W/work --out $W/vorher --now $NOW
node scripts/technical/materialize-product-intelligence.mjs --work-dir $W/work --out $W/nachher --now $NOW
node scripts/technical/compare-ema-materialization.mjs $W/vorher $W/nachher   # verdict PASS, Exit 0
```

So gelaufen am 25.10.2026: 5/5 Instrumente bitgleich. Alle 646 Shards und die drei Signaldateien waren ansonsten unverändert, `verdict: PASS`.

## 7. Reproduzierbarkeit (Referenztests)

`quant/tests/technical-ema200-materialization.test.mjs`, 11 Tests:

| Test | Prüft |
|---|---|
| EMA-1 | `k = 691/173/70`. Minimalität: `(1−a)^k ≤ 1e-3 < (1−a)^(k−1)` |
| EMA-2 | Handwerte: p = 3, Reihe 2,4,6,8,10,12 ergibt Start 4, dann 6, 8, 10. Erster veröffentlichter Wert erst nach 3 Bars |
| EMA-3 | Handwert EMA 200 auf einer Rampe: genau `x_t − 99,5` (Nachlauf `(1−a)/a`) ab Bar 890. Konstante Reihe bleibt konstant |
| EMA-4 | Gleich einer unabhängigen naiven EMA (rel. < 1e-12) und **bitgleich** zur bestehenden `ema()` |
| EMA-5 | Konventionsunabhängigkeit an NVDA/JPM: Fehler ≤ 1e-3 × Startabweichung. Erstwert-Start rel. < 1e-4 |
| EMA-6 | Kausalität: Der Wert an t ist mit und ohne spätere Bars bitgleich, auch über `analyzeAsOf` |
| EMA-7 | Splits: gleich dem Weg über `return-series#splitAdjustedColumn`, kein Sprung, Roh-EMA wäre falsch |
| EMA-8 | Unvollständige Historien (890/891 Bars, Lücken vor/nach dem Start, leere Reihe) |
| EMA-9 | Bundle: `chartSeries` = gerundete Feature-Werte, erste gültige Indizes 89/222/890, `INSUFFICIENT_HISTORY`, Determinismus (gleiche Bytes) |
| EMA-10 | Produzent end-to-end in `os.tmpdir()`: Shard trägt die Felder, zwei Läufe sind byte-identisch, Vergleicher erkennt jede nicht-additive Änderung |
| EMA-11 | Schätzer für alte Shards trifft die exakte EMA 200 auf < 1e-3 |

## Offene Punkte und Risiken

- **Erstausrollung:** Technical-Engines stehen nicht im Methodik-Fingerabdruck. Die neuen Felder entstehen deshalb beim nächsten regulären Lauf mit neuem Datenstand. Die committeten Shards werden hier bewusst nicht mitgebracht.
- **Gerechnet nur lokal auf 5 Titeln:** Bitgleichheit ist auf den Golden-Reihen belegt, nicht auf dem Vollbestand. Der Code ändert keinen bestehenden Rechenweg. Nach dem ersten Lauf auf `main` sollte trotzdem `compare-ema-materialization.mjs` gegen den Vortag gefahren werden; Datenänderungen des Tages sind dabei herauszurechnen. Alternativ: Workflow-Lauf mit `--out` auf einem Branch.
- **Artefaktgröße:** etwa +20 MB gzip. Wenn das zu viel ist, `chartSeries.ema20/50` weglassen (−⅔).
- **Screener-Feld `aboveEma200`:** bewusst nicht enthalten, eigener PR.
- **Wochen-EMA:** bewusst nicht enthalten, siehe Abschnitt 4.
