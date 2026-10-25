# Exakte EMA 200 – Materialisierung (ema-settled-1.1.0)

Stand: 25.10.2026 · PR #927 · **Fachmodelländerung**; Owner-Freigabe vom 25.10.2026 nach Prüfung der Aufwärmregel (Abschnitt 1)

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

## 1. Aufwärmphase und Freigaberegel

`ema()` startet am Index `p-1` mit dem SMA der ersten `p` Werte und rechnet danach `e_t = e_{t-1} + a·(x_t − e_{t-1})` mit `a = 2/(p+1)`.
Nach `k` weiteren Bars wirkt der Startwert noch mit dem Gewicht `w_k = (1−a)^k`. Zwei EMA-Läufe mit verschiedenem Start unterscheiden sich am Ende genau um

    |e_t − e'_t| = w_k · |Start − Start'|

### Owner-Prüfung vom 25.10.2026: Warum fehlten 686 Titel?

Die erste Fassung (`ema-settled-1.0.0`) gab einen Wert frei, sobald `w_k ≤ 1e-3` war. Für die EMA 200 heißt das starr 891 Tagesbars, also rund 3,5 Jahre. Die Prüfung zeigt, dass diese Grenze **weder notwendig noch hinreichend** ist. Der Fehler in Kurseinheiten ist `w_k · |Start − Start'|`. Er hängt davon ab, wie weit der heutige Kurs vom Startfenster entfernt liegt, nicht nur von der Zahl der Bars.

**Messung 1: simulierter Börsengang an echten Kursen.** Die fünf Golden-Reihen (AAPL, JPM, MSFT, NVDA, XOM) wurden an jeder fünften Startposition abgeschnitten, so dass vor dem Start mindestens 1.000 Bars Vorlauf liegen. Das ergibt 1.080 Fenster. Verglichen wurde die EMA nach L Bars mit dem Wert aus der Vollhistorie, relativ zum Kurs:

| L Bars | Startgewicht | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| 400 | 0,135 | 0,27 % | 0,78 % | 1,25 % | 1,60 % |
| 500 | 0,050 | 0,09 % | 0,26 % | 0,33 % | 0,38 % |
| 600 | 0,018 | 0,03 % | 0,08 % | 0,12 % | 0,14 % |
| 661 | 0,010 | 0,015 % | 0,04 % | 0,06 % | 0,06 % |
| 891 | 0,001 | 0,001 % | 0,004 % | 0,005 % | 0,006 % |

Bei stabilen Large Caps ist der Wert also schon nach 600 bis 660 Bars auf rund 0,1 % genau, und 891 Bars sperren unnötig lange.

**Messung 2: Gegenbeispiel.** Ein Titel ist seit dem Startfenster auf ein Zwanzigstel gefallen, etwa durch Reverse-Splits nach einem Verfall. Hier wirkt dasselbe Restgewicht 1e-3 mit dem Faktor 20 auf den Kurs, und die alte Regel hätte einen Wert mit rund 2 % Konventionsfehler veröffentlicht (Test EMA-8). Im Universum erreicht die Schranke solcher Titel trotz über 891 Bars Werte bis über 100 % des Kurses. Grob geschätzt sind das rund 220 Titel; die Schätzung ist nur ungefähr, weil Wochenreihe und Tageshistorie bei den meisten Titeln nicht am selben Tag beginnen.

### Regel ab `ema-settled-1.1.0`

Jede Startkonvention, die im Startfenster liegt, weicht vom SMA-Start höchstens um dessen Spanne `R = max − min` der ersten `p` Schlusskurse ab. Das gilt etwa für den ersten Kurs, den SMA oder den Median. Daraus folgt für Tag t die Fehlerschranke

    E_t = w_k · R / Schluss_t

Sie nutzt nur Daten bis t und ist damit frei von Look-ahead.

**Freigabe am Tag t, wenn beide Bedingungen gelten:**
1. `E_t ≤ 0,1 %` des Kurses (`EMA_MAX_REL_ERROR = 1e-3`);
2. `w_k ≤ 5 %` (`EMA_FLOOR_SEED_WEIGHT`). Das ist eine Untergrenze: Der Startwert darf nie mehr als 5 % des Werts ausmachen.

Sonst ist der Wert `null`.

| Periode | Untergrenze k | frühester Wert |
|---|---|---|
| EMA 20 | 30 | ab 50 Bars |
| EMA 50 | 75 | ab 125 Bars |
| **EMA 200** | **300** | **ab 500 Bars**; tatsächlich, sobald die Schranke hält |

**Empirischer Nachweis der Schranke** (Test EMA-12, dazu eine Vollmessung über alle Bars):
- Auf 747.360 Messpunkten der fünf Golden-Reihen lag der tatsächliche Fehler gegen die Vollhistorie **kein einziges Mal** über `E_t`.
- Wo die Regel einen Wert freigibt, liegt der tatsächliche Fehler bei höchstens **0,02 %**.
- Freigegeben wird im Median nach 749 Bars, frühestens nach 636 und spätestens nach 835 Bars, statt starr nach 891.
- Die Konventionsunabhängigkeit prüft EMA-5: Jeder veröffentlichte Wert liegt höchstens 0,1 % neben dem Erstwert-Start.

**Wirkung:**
- Junge, ruhige Titel erhalten ihren Wert früher. Unter den 190 Titeln mit 500 bis 890 Bars, deren Wochenreihe die ganze Historie abdeckt, gewinnen 6 einen Wert, darunter SPACs um 10 USD.
- Stark gefallene Titel bleiben trotz langer Historie gesperrt.
- Genaue Zahlen entstehen erst im ersten Datenlauf, weil die Tageshistorien nur dort vorliegen. Je Titel stehen dann in `emaSettlement.periods[]` die Felder `status`, `firstSettledDate`, `errorBoundAtCutoff` und `seedRange`. Das Chart Studio zeigt sie unter „Datenqualität und Herkunft“.

Die reine Gewichtsregel bleibt als Modus erhalten: `settledEma(values, p, 1e-3)` liefert weiter 891 Bars, für Handwerte und Vergleiche.

## 2. Preisbereinigungen

- Die EMA rechnet auf **`series.close` der `SPLIT_ADJUSTED`-Reihe**, also auf demselben Array, auf dem `sma200` entsteht. Der Produzent baut sie in `Canonical.fromPriceBars` aus `bar.splitFactor`. Dass diese Split-Definition identisch mit `quant/engines/return-series.js#splitFactors` ist (ADR-002), hält bereits `quant/tests/split-adjust-technical-equivalence.test.mjs` fest. EMA-7 prüft zusätzlich die EMA auf beiden Wegen: Abweichung < 1e-6, also nur die Rundung von `round6`.
- Wirkung eines Splits auf eine lange EMA: Auf Rohkursen bliebe der Kurs vor dem Split noch 691 Bars lang im Wert. Gemessen an den Golden-Reihen läge die Roh-EMA bei AAPL (4:1, 2020) bis zu **4-fach** und bei NVDA (4:1 2021, 10:1 2024) bis zu **40-fach** neben der bereinigten. Auf der bereinigten Reihe gibt es keinen Sprung. EMA-7 prüft das mit einem 1:10-Split bei konstantem wirtschaftlichem Kurs: Die Änderung von Bar 999 auf 1000 ist kleiner als 0,1 %.
- Dividenden werden nicht herausgerechnet, genau wie bei der SMA 200. Technical ist eine Kurs-, keine Gesamtrendite-Sicht. Eine Gesamtrendite-EMA wäre eine eigene Methodikentscheidung.
- Es gibt keine neue Preisableitung und keine Verwendung von `adjClose`.

## 3. Unvollständige Historien

| Fall | Verhalten | Test |
|---|---|---|
| IPO / kurze Historie (< 500 Bars oder Schranke über 0,1 %) | `featuresAtCutoff.ema200 = null`, `chartSeries.ema200` ganz `null`, `emaSettlement…status = "INSUFFICIENT_HISTORY"`. EMA 20/50 bleiben, solange 90/223 Bars vorhanden sind. Das Produkt verlangt ohnehin mindestens 300 Bars, also sind EMA 20/50 am Stichtag immer gesetzt. | EMA-8, EMA-9 |
| Unter der Untergrenze (499 Bars) | immer `null` | EMA-8, EMA-9 |
| Einbruch nach dem Start (Kurs ÷ 20) | `null` trotz langer Historie, Schranke im Status sichtbar | EMA-8 |
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
| mit EMA 200 nach der alten Regel (≥ 891 Bars; diese Zählung stammt aus `ema-settled-1.0.0`) | 4.969 |
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
- Hochgerechnet auf 5.655 Bundles: gzip rund **+20 MB** auf 237,9 MB Shards (+8,4 %), roh rund +45 MB auf 1,56 GB (+2,9 %). Titel ohne freigegebene EMA 200 tragen `null`-Reihen und kosten weniger. Die Aktienseite lädt im Release je Titel ein Dokument und damit ~8 KB decodiert mehr. Das Budget `stock` (3.300.000 B) hat dafür Luft.
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
| EMA-1 | Untergrenzen `k = 300/75/30` (Startgewicht 5 %) und Gewichtsregel `k = 691` (1e-3), jeweils minimal |
| EMA-2 | Handwerte: p = 3, Reihe 2,4,6,8,10,12 ergibt Start 4, dann 6, 8, 10. Erster veröffentlichter Wert erst nach 3 Bars |
| EMA-3 | Rampe: genau `x_t − 99,5` ab dem unabhängig gerechneten ersten Tag mit Schranke ≤ 0,1 % (vor Bar 890). Konstante Reihe ab der Untergrenze (Bar 499). Gewichtsregel weiter Bar 890 |
| EMA-4 | Gleich einer unabhängigen naiven EMA (rel. < 1e-12) und **bitgleich** zur bestehenden `ema()`; jeder veröffentlichte Wert erfüllt die Regel |
| EMA-5 | An NVDA/JPM, Fensterlängen 520 bis 891: Fehler gegen die Vollhistorie ≤ Schranke, Abstand zum Erstwert-Start ≤ 0,1 % des Kurses |
| EMA-6 | Kausalität: Der Wert an t ist mit und ohne spätere Bars bitgleich, auch über `analyzeAsOf` |
| EMA-7 | Splits: gleich dem Weg über `return-series#splitAdjustedColumn`, kein Sprung, Roh-EMA wäre falsch |
| EMA-8 | Unvollständige Historien (Untergrenze 499/500, Lücken vor/nach dem Start, Einbruch sperrt, ruhiger Titel ab 500 Bars, leere Reihe) |
| EMA-12 | Fehlerschranke empirisch an allen Golden-Reihen nie kleiner als der tatsächliche Fehler |
| EMA-9 | Bundle: `chartSeries` = gerundete Feature-Werte; erste gültige Indizes = `firstSettledIndex`; NVDA vor Bar 890 freigegeben; `INSUFFICIENT_HISTORY` unter 500 Bars; Determinismus (gleiche Bytes) |
| EMA-10 | Produzent end-to-end in `os.tmpdir()`: Shard trägt die Felder, zwei Läufe sind byte-identisch, Vergleicher erkennt jede nicht-additive Änderung |
| EMA-11 | Schätzer für alte Shards trifft die exakte EMA 200 auf < 1e-3 |

## Offene Punkte und Risiken

- **Erstausrollung:** Technical-Engines stehen nicht im Methodik-Fingerabdruck. Die neuen Felder entstehen deshalb beim nächsten regulären Lauf mit neuem Datenstand. Die committeten Shards werden hier bewusst nicht mitgebracht.
- **Gerechnet nur lokal auf 5 Titeln:** Die Abdeckungszahlen nach `ema-settled-1.1.0` liegen erst nach dem ersten Datenlauf exakt vor; je Titel stehen Status und Schranke in `emaSettlement`. Bitgleichheit ist auf den Golden-Reihen belegt, nicht auf dem Vollbestand. Der Code ändert keinen bestehenden Rechenweg. Nach dem ersten Lauf auf `main` sollte trotzdem `compare-ema-materialization.mjs` gegen den Vortag gefahren werden; Datenänderungen des Tages sind dabei herauszurechnen. Alternativ: Workflow-Lauf mit `--out` auf einem Branch.
- **Artefaktgröße:** etwa +20 MB gzip. Wenn das zu viel ist, `chartSeries.ema20/50` weglassen (−⅔).
- **Screener-Feld `aboveEma200`:** bewusst nicht enthalten, eigener PR.
- **Wochen-EMA:** bewusst nicht enthalten, siehe Abschnitt 4.
