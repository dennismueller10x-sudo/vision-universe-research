# VU PRICE ADJUSTMENT SEMANTICS

Was eine Kursreihe bedeutet — und welche Kennzahl aus welcher Reihe berechnet
werden darf.

Definition: `quant/methodology/price-adjustment-v1.json`
Zugriff: `quant/engines/price-semantics.js` (JS) · `scripts/dashboard/price_semantics.py` (Python)

---

## Der Anlass

Der Auditbefund MEDIUM-7 aus Phase 2 war kein Rechenfehler. Beide Systemteile
rechneten richtig:

| | rechnet auf | nennt das Ergebnis |
|---|---|---|
| Quant-Bereich | total-return-bereinigten Kursen | „Rendite" |
| Dashboard | splitbereinigten Kursen | „Rendite" |

Jede Zahl für sich ist korrekt. Nebeneinandergestellt sind sie irreführend,
und nichts im System sagte das. Ein solcher Unterschied erzeugt keinen Fehler,
keine Warnung und keine auffällige Zahl — nur zwei Werte, die nebeneinander
stehen und nicht nebeneinander gehören.

Der Zweck dieser Semantik ist deshalb nicht Genauigkeit, sondern
**Vergleichbarkeit**.

## Die vier Stufen

| Stufe | Was bereinigt ist | Was sie beantwortet |
|---|---|---|
| `RAW` | nichts | „Was stand an dem Tag auf der Tafel?" |
| `SPLIT_ADJUSTED` | Splits | „Wie hat sich der Anteil entwickelt?" |
| `TOTAL_RETURN` | Splits **und** Dividenden | „Was hat der Anleger verdient?" |
| `UNKNOWN` | unbekannt | nichts |

### Warum UNKNOWN strenger ist als RAW

Es liegt im Rang **unter** RAW, nicht darüber. Bei RAW weiß man, was fehlt und
kann es einrechnen. Bei UNKNOWN weiß man nicht, was die Zahlen bedeuten — und
eine Zahl, deren Bedeutung offen ist, ist nicht ein bisschen weniger nützlich,
sondern gar nicht nützlich.

Der Zustand ist ausdrücklich vorgesehen, damit niemand gezwungen ist, zwischen
RAW und TOTAL_RETURN zu raten. Er ist der Zustand, in dem die meisten
Datenreihen tatsächlich ankommen.

### Warum SPLIT_ADJUSTED der gefährlichere Zwischenzustand ist

Eine unbereinigte Reihe verrät sich: an jedem Split steht ein Sprung von 50,
75 oder 90 Prozent, und die Qualitätsprüfung findet ihn. Eine splitbereinigte
Reihe sieht sauber aus. Der Fehler — die fehlenden Dividenden — ist gleichmäßig
über die Zeit verteilt und fällt nirgends auf.

Über zehn Jahre summiert er sich bei einem Dividendenzahler auf mehrere
Prozentpunkte pro Jahr. Immer in dieselbe Richtung: die Rendite wird
unterschätzt.

## Welche Kennzahl welche Stufe braucht

| Kennzahl | Mindeststufe | Warum |
|---|---|---|
| Ordergröße, Volumenanalyse | `RAW` | Der rückgerechnete Kurs wurde nie gehandelt |
| Momentum, Volatilität, Drawdown | `SPLIT_ADJUSTED` | Ein Split erzeugt sonst ein Signal, das es nie gab |
| Gleitender Durchschnitt, Ausbruch | `SPLIT_ADJUSTED` | wie oben |
| Kursrendite | `SPLIT_ADJUSTED` | — |
| **Gesamtrendite, CAGR** | `TOTAL_RETURN` | Ohne Dividenden ist es keine Rendite |
| **Backtest als Nachweis** | `TOTAL_RETURN` | Und drei weitere Bedingungen, siehe unten |

TOTAL_RETURN ist nicht überall besser. Für die Frage „zu welchem Kurs hätte
ich gekauft" ist sie die falsche Stufe: der rückgerechnete Kurs von 1998 wurde
nie gehandelt. Die Methodikdatei führt `order_sizing` und
`volume_analysis_by_price` deshalb ausdrücklich unter `TOTAL_RETURN.forbids`.

## Die Sprachregel

> Das Wort „Rendite" ohne Zusatz ist ausschließlich für `TOTAL_RETURN`
> zulässig. Auf jeder niedrigeren Stufe heißt es „Kursrendite".

Der Grund ist nicht Pedanterie. Der Leser kann den Unterschied nicht sehen —
er sieht eine Prozentzahl. Wenn zwei Prozentzahlen im selben Produkt
Verschiedenes bedeuten und beide „Rendite" heißen, ist die Beschriftung die
einzige Stelle, an der sich das noch trennen ließe.

`returnLabel(level)` gibt die zulässige Bezeichnung zurück; ein Test hält
fest, dass keine niedrigere Stufe sich „Gesamtrendite" nennen darf.

## Zwei Stacks, eine Definition

Zwischen dem Quant-Bereich (JavaScript, UMD) und dem Dashboard (Python) gibt
es keine gemeinsame Bibliothek — und es soll auch keine geben, dafür ist die
Kopplung zu teuer. Eine gemeinsame **Definition** genügt:

```
quant/methodology/price-adjustment-v1.json   ← die Wahrheit
   ├── quant/engines/price-semantics.js       liest sie
   └── scripts/dashboard/price_semantics.py   liest dieselbe Datei
```

Beide Module bilden dieselben vier Stufen, dieselbe Rangfolge und dieselben
Mindestanforderungen ab. Ein Test (`P12`) hält fest, dass die Python-Seite
tatsächlich auf `quant/methodology/` zeigt und nicht auf eine Kopie —
eine Kopie wäre nach dem ersten Änderungszyklus keine mehr.

## Was daraus im Betrieb folgt

Die nachgelagerten Skripte **verweigern die Berechnung**, wenn die Stufe fehlt
oder zu niedrig ist:

```
$ python3 scripts/dashboard/backtest_technicals.py
Abbruch: Die Bereinigungsstufe der Reihe ist nicht bekannt.
  'price_return' setzt mindestens Splitbereinigt voraus.
```

Das ist der eigentliche Punkt. Vorher wäre eine Zahl entstanden — eine
richtige Zahl mit unbekannter Bedeutung, was schlechter ist als keine.

## Die Migration der Alt-Pipeline

Das committete `dashboard/data/market_data.json` trug keine Kennzeichnung.
`scripts/dashboard/migrate_adjustment_semantics.py` hat sie ergänzt, **ohne
eine Zahl zu ändern** — und prüft die Einstufung vorher an den Daten selbst
nach:

| Titel | Splittag | Verhältnis | Beobachtet | Ergebnis |
|---|---|---|---|---|
| NVDA | 2021-07-20 | 4:1 | 1,009 | bereinigt |
| NVDA | 2024-06-10 | 10:1 | 0,993 | bereinigt |
| AMZN | 2022-06-06 | 20:1 | 0,980 | bereinigt |

Stünde an einem dieser Tage ein Sprung nahe dem Splitfaktor, bräche die
Migration ab, statt eine falsche Zusicherung in die Datei zu schreiben.

Der Beleg ist ein Indiz und kein Beweis — ein fehlender Sprung kann auch
heißen, dass der Split außerhalb des Zeitraums lag. Für die Gegenrichtung
reicht er: ein **vorhandener** Sprung widerlegt die Behauptung sofort.

`backtest_results.json` trägt seither:

```json
"return_semantics": {
  "adjustment": "SPLIT_ADJUSTED",
  "meaning": "Kursrendite",
  "field": "average_return_pct",
  "note": "Nicht mit der Gesamtrendite des Quant-Bereichs vergleichbar: …"
}
```

## Was bewusst nicht geändert wurde

Die Dashboard-Oberfläche (`dashboard/v2.js`) zeigt `average_return_pct` **nicht
an** — die Zahl ist ein Datenartefakt. Angezeigt werden Momentum- und
Timing-Scores sowie ein Kurschart, und beides ist auf `SPLIT_ADJUSTED`
zulässig.

Es bestand deshalb kein Anlass, an einer funktionierenden Oberfläche zu
arbeiten. Sollte die Zahl später angezeigt werden, gibt `return_semantics`
die richtige Beschriftung bereits her.

## Eine Stufe höher kommt man nur mit Daten

```
RAW  ──(Splitereignisse)──▶  SPLIT_ADJUSTED  ──(Dividendenereignisse)──▶  TOTAL_RETURN
```

Nicht mit einer Zusicherung, nicht mit einer Annahme, nicht mit einem
pauschalen Aufschlag. Genau deshalb steht in der Fähigkeitsmatrix jedes
Anbieters, ob Splits und Dividenden **als Ereignisse** abrufbar sind — ohne sie
lässt sich eine Reihe nicht selbst hochstufen.
