# Ereignisfilter im Technical-Screener (Audit B12, Fachmodell)

Stand 26.10.2026. Fachmodell-PR, wird erst nach Owner-Freigabe gemergt.

## Was neu ist

Acht Felder der Art „Handelstage seit dem letzten Ereignis“. Sie stehen in der Gruppe **Ereignisse** und gelten für den Zeitrahmen Tag.

- `0` heißt: am Stichtag.
- Leer heißt: im prüfbaren Fenster nicht vorgekommen.

| Feld | Ereignis | Quelle |
|---|---|---|
| `goldenCrossDays` | SMA 50 kreuzt SMA 200 aufwärts | `chartSeries.sma50/sma200` |
| `deathCrossDays` | SMA 50 kreuzt SMA 200 abwärts | ebenso |
| `crossAboveSma200Days` | Schluss kreuzt SMA 200 aufwärts | Tagesbars + `chartSeries.sma200` |
| `crossBelowSma200Days` | Schluss kreuzt SMA 200 abwärts | ebenso |
| `rsiExitOversoldDays` | RSI 14 steigt über 30 | `chartSeries.rsi14` |
| `rsiExitOverboughtDays` | RSI 14 fällt unter 70 | ebenso |
| `newHigh52wDays` | Tageshoch ≥ Hoch der 251 Vorbars (wie `newHigh52w`) | Tagesbars, prüfbar nur für die letzten 18 Bars des 270-Bar-Fensters |
| `formationNewDays` | jüngste aktive Formations-Erkennung | `formations[].detectedAt` |

**Kreuzung an Bar i:** Am Vortag ist die Linie nicht darüber (`≤`), an Bar i darüber (`>`). Für abwärts gilt dasselbe umgekehrt. Ein Gleichstand allein ist keine Kreuzung.

**Linien:** SMA 50/200 und RSI kommen aus `bundle.chartSeries`. Das sind je Bar exakte Werte aus der Vollhistorie der Materialisierung, nicht aus den 270 Bars neu gerechnet. Fehlt `chartSeries` oder passt die Länge nicht, sind die Felder leer.

**Fenster:** Das Fenster umfasst 270 Handelstage. Ein Ereignis, das länger zurückliegt, ergibt einen leeren Wert. Für Filter wie „≤ 5“ oder „≤ 20“ spielt das keine Rolle.

## Suche in Worten (`query-text` 1.5.0)

**Neue Ausdrücke:**
- „Golden Cross“, „goldenes Kreuz“, „Death Cross“, „Todeskreuz“
- „Kurs steigt über die SMA 200“
- „RSI ist über 30 gestiegen“ und „RSI verlässt überverkauft“; ebenso für 70 und „überkauft“
- „neue Formation“

**Zeitangaben:**
- „in den letzten N Tagen“, „innerhalb von N Tagen“, „binnen N Tagen“, „seit höchstens N Tagen“
- „heute“ (0) und „gestern“ (≤ 1), auch mitten im Satz
- ohne Angabe: ≤ 5 Handelstage

**Änderung der Bedeutung:** „Golden Cross“ und „Death Cross“ bedeuteten bisher den *Zustand* „SMA 50 über/unter SMA 200“. Jetzt meinen sie das *Ereignis*, wie im üblichen Sprachgebrauch. Der Zustand bleibt erreichbar über „SMA 50 über SMA 200“.

## Vorher/Nachher

Grundlage: Stand 23.10.2026, Neubau mit dem Erzeuger.

**Bestehende Spalten:** Bei den 5.649 gemeinsamen Titeln hat sich kein einziger Wert geändert. Zusätzlich kommen 6 Vorzugsaktien aus #950 dazu, die der Erzeuger seitdem mitnimmt.

**Neue Spalten:**

| Feld | belegt | = 0 (heute) | ≤ 5 | ≤ 20 |
|---|---|---|---|---|
| `goldenCrossDays` | 3.120 | 10 | **48** | 209 |
| `deathCrossDays` | 3.687 | 39 | **181** | 562 |
| `crossAboveSma200Days` | 4.731 | 55 | 467 | 1.104 |
| `crossBelowSma200Days` | 4.910 | 95 | 432 | 1.207 |
| `rsiExitOversoldDays` | 4.869 | 120 | 750 | 2.025 |
| `rsiExitOverboughtDays` | 4.984 | 149 | 321 | 683 |
| `newHigh52wDays` | 558 | 195 | 356 | 558 |
| `formationNewDays` | 4.188 | 342 | 1.650 | 2.981 |

**Gegenprobe:** Eine eigene, vom Screener unabhängige Zählung direkt aus den Shards ergibt für Golden Cross ≤ 5 genau 48 und für Death Cross ≤ 5 genau 181 Titel.

**Suche in Worten (Goldsatz):**

| | Vorher | Nachher |
|---|---|---|
| unterstützte Fälle | 80 | **88**, exakt 88/88 |
| bisher „nicht abbildbar“, jetzt abbildbar | – | 2 (B12): „Golden Cross in den letzten 5 Tagen“, „RSI ist gestern über 30 gestiegen“ |
| nicht abbildbare Fälle | 14 | 12, davon 0 stille Fehlgriffe |
| „Golden Cross“-Fälle | Zustand | Ereignis, mit Vermerk im Goldsatz |

## Tests

- `quant/tests/technical-events.test.mjs`, 6 Tests:
  - Kreuzung am Stichtag, nach 7 Tagen und ohne Kreuzung.
  - Gleichstand ist keine Kreuzung; die jüngste Kreuzung gewinnt.
  - SMA 200 und RSI 30/70.
  - Prüfgrenze des 52-Wochen-Hochs.
  - Leere Werte ohne bzw. mit falsch langem `chartSeries`.
  - Katalog und Suche in Worten.
- `technical-query-text.test.mjs` und der Goldsatz sind an die neue Bedeutung von „Golden Cross“ angepasst.
