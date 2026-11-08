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

## Prüfraum: kein Ereignis ist nicht dasselbe wie fehlende Historie (Owner-Vorgabe)

Jede Ereignisfamilie hat eine eigene Spalte mit dem **Prüfraum W**: die Zahl der Handelstage vom Stichtag rückwärts, an denen das Ereignis entscheidbar war (Tage 0 bis W−1).

| Familie | Fensterspalte |
|---|---|
| Golden/Death Cross | `smaCrossWindow` |
| Schluss kreuzt SMA 200 | `sma200CrossWindow` |
| RSI 30/70 | `rsiEventWindow` |
| 52-Wochen-Hoch | `high52wWindow` |
| Formation | `formationWindow` |

**Lesart:**

| Ereignisfeld | Fenster | Bedeutung |
|---|---|---|
| Zahl d | W | Ereignis vor d Handelstagen |
| leer | W | kein Ereignis in den letzten W Handelstagen |
| leer | leer | nicht prüfbar (unzureichende Historie), ein fehlender Wert |

Die Abfrage entscheidet ein leeres Ereignis mit Fenster nur, wo es sicher folgt:
- „≤ N“ ist sicher nein, wenn N < W.
- „> N“ ist sicher ja, wenn W > N.
- Sonst bleibt der Wert unbekannt und wird im Trichter als „ohne Wert“ gezählt. Er wird nie als „kein Ereignis“ geraten.

Zeiträume zählen Bars, also Handelstage; Wochenenden und Feiertage zählen nicht (Test). Jede Prüfung an Bar i nutzt nur Bars bis i, es gibt also keinen Vorgriff. Das prüft ein Test: Ein am Stichtag k abgeschnittener Datensatz ergibt dieselben Werte.

## Gespeicherte Suchen behalten ihre Bedeutung (Owner-Vorgabe)

**Schnellfilter und Filter-Baukasten** speichern Feld-IDs. Die Pille „SMA 50 über SMA 200“ (`trend=kreuz`) bleibt der Zustand `sma50AboveSma200`. Hier ändert sich nichts.

**Gespeicherte Suchen in Worten** (`q=…`) werden bei jedem Öffnen neu gelesen. Damit sie ihre Bedeutung nicht unbemerkt ändern:
- Gespeicherte Suchen ohne Bedeutungsstand `qv` stammen von vor 1.5.0. Sie werden einmalig und ausdrücklich umgeschrieben: „Golden Cross“ → „SMA 50 über SMA 200“, „Death Cross“ → „SMA 50 unter SMA 200“. Danach erhalten sie `qv=2`.
- Die Liste der gespeicherten Suchen zeigt den Hinweis „angepasst: … (gleiche Bedeutung)“.
- Importierte alte Exporte werden genauso behandelt.
- Neue Speicherungen tragen `qv=2` und werden nie umgeschrieben.

Tests: `technical/tests/technical-saved-migration.test.mjs`.

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

**Bestehende Spalten:** Gegen `main` mit #966 (B8) hat sich bei allen 5.655 Titeln kein einziger Wert geändert. Versionen: `screen-row` 1.6.0, `technical-query` 1.6.0.

**Prüfräume** (Stand 23.10.2026):

| Feld | Ereignis | kein Ereignis | nicht prüfbar | Fenster (Median / Minimum) |
|---|---|---|---|---|
| `goldenCrossDays` | 3.120 | 2.535 | 0 | 269 / 100 |
| `deathCrossDays` | 3.687 | 1.968 | 0 | 269 / 100 |
| `crossAboveSma200Days` | 4.731 | 924 | 0 | 269 / 100 |
| `crossBelowSma200Days` | 4.910 | 745 | 0 | 269 / 100 |
| `rsiExitOversoldDays` | 4.869 | 786 | 0 | 269 / 269 |
| `rsiExitOverboughtDays` | 4.984 | 671 | 0 | 269 / 269 |
| `newHigh52wDays` | 558 | 5.097 | 0 | 19 / 19 |
| `formationNewDays` | 4.188 | 1.467 | 0 | 270 / 270 |

Ein SMA-Fenster unter 269 Tagen heißt: Bei jüngeren Titeln existiert die SMA 200 erst seit weniger Bars.

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
