# EMA 20/50 im Screener nur freigegeben (screen-row 1.15.0)

Stand: 04.11.2026 · **Fachmodelländerung**, braucht die Owner-Freigabe · Ergänzt [EMA200_MATERIALIZATION.md](EMA200_MATERIALIZATION.md)

## Auslöser

Der Lauf `technical-world.yml` 41777061045 (Stichtag 03.11.2026) scheiterte im eigenen Test `technical/tests/technical-e2e-consistency.test.mjs` („Trefferzeile = Chart Studio“) mit `KXIN aboveEma50 chart=false screener=true`. Der Screener blieb deshalb beim Stand 02.11.2026.

## Ursache

1. **Das Testorakel war veraltet.** Seit `ema-settled` (EMA200_MATERIALIZATION.md, Abschnitt 5) zeichnet Chart Studio EMA 20/50 aus `bundle.chartSeries`, also aus der Vollhistorie. Nur ohne diese Reihe rechnet es im 270-Bar-Fenster (`technical/app.js`: `X.cs.ema50 || X.ind.ema50`). Der Test rechnete weiter im Fenster.
   - Bei KXIN liegen die ersten 50 Fensterschlüsse nach den Reverse-Splits zwischen 46,50 und 810 USD, heute steht der Kurs bei 2,25 USD. Die Fenster-EMA 50 trägt deshalb noch den Startwert: 2,2578 statt 2,2491. Der Schluss von 2,25 liegt dazwischen.
   - Über alle 5.439 nicht eingefrorenen Titel weicht die Fenster-EMA 50 bei 53 Titeln um mehr als 0,1 % ab, bei 20 Titeln um mehr als 1 % (WOK: 51 %). Die Seite kippte bisher nur bei KXIN.
   - Die Fenster-EMA 20 weicht höchstens um 0,06 % ab und kippt bei keinem Titel.
   - Der Screener-Wert für KXIN war richtig.
2. **Das korrigierte Orakel zeigt eine echte Abweichung.** Nach Regel 1.1.0 kann auch die EMA 50 am Stichtag `INSUFFICIENT_HISTORY` sein, wenn ein Titel seit dem Startfenster stark gefallen ist. Der Satz „EMA 20/50 am Stichtag immer gesetzt“ in EMA200_MATERIALIZATION.md, Abschnitt 3, gilt nur für die alte Gewichtsregel. In diesem Fall zeigt Chart Studio keine Linie. Der Screener verglich trotzdem mit `featuresAtCutoff.ema50`, einem Wert, der noch vom Startwert abhängt. Ein Beispiel ist WOK: Die Vollhistorien-EMA 50 liegt bei 19,13, der Kurs bei 1,17, und die Fehlerschranke beträgt 1.280 %.

## Änderung

- `quant/engines/technical/screen-row.js` 1.15.0: `aboveEma20` und `aboveEma50` werden nur gesetzt, wenn `chartSeries.emaP` am Stichtag einen Wert trägt. Sonst bleiben sie `null`, wie `aboveEma200`. Ohne `chartSeries.emaP`, also bei älteren Bündeln, bleibt es beim Wert aus `featuresAtCutoff`. Es gibt keine neue EMA-Rechnung und keine neue Preisableitung (ADR-002).
- Das Testorakel folgt `technical/app.js`. Liegt der Schluss innerhalb der Rundung von `chartSeries` (1e-4) auf der Linie, kann das Bild die Seite nicht zeigen, und der Vergleich entfällt. Ein Quelltextanker prüft, dass `app.js` die EMA weiterhin so zeichnet.
- Neue Tests: `quant/tests/technical-screener-ema-release.test.mjs`.

## Vorher/Nachher

Beide Läufe mit dem Erzeuger `build-screener.mjs --out` auf `technical-signals-v1` vom 03.11.2026, 5.664 Zeilen:

| Spalte | geändert |
|---|---|
| `aboveEma50` | 15 Werte werden `null`: 14 `false`, 1 `true` (CURX). Betroffen: CDT, CURX, DAIC, DKI, INLF, KIDZ, KWM, NIVF, PFSA, RBNE, SMU, TDIC, VWAV, WOK, YMT |
| `aboveEma20` und alle übrigen Spalten | 0, bitgleich |
| `spark-v1.json`, `index-v1.json` | bitgleich |
| `meta.json` | nur `versions.row` |

Mit dem Nachher-Datensatz laufen `technical/tests/*.test.mjs` grün (96/96), ebenso `quant/tests/technical-ap8-l*.test.mjs`.
