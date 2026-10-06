# TIINGO SCALING PLAN

Was sich beim Wechsel auf den kostenpflichtigen Zugang ändert — und was
ausdrücklich nicht.

---

## Der Anspruch

Der Wechsel auf einen kommerziellen Tarif darf **keinen Rewrite** auslösen. Er
muss eine Konfigurationsänderung sein, keine Umbaumaßnahme.

Ob das gelingt, entscheidet sich nicht beim Wechsel, sondern jetzt: an der
Frage, welche Annahmen über den Free-Tarif in den Code gewandert sind.

## Was sich ändert: eine Zahlengruppe

```js
const COMMERCIAL_LIMITS = { requestsPerMinute, requestsPerHour,
                            requestsPerDay, bytesPerMonth, concurrency, ... };
```

`market-client.js` liest diese Zahlen und setzt sie durch. Er kennt keinen
Anbieter und keinen Tarif — er kennt rollende Fenster und einen Monatszähler.
Der Wechsel ist deshalb: anderes Limitobjekt beim Erzeugen des Providers, sonst
nichts.

> **Die Zahlen in `COMMERCIAL_LIMITS` sind Platzhalter.** Es besteht kein
> kostenpflichtiger Zugang; die Konditionen wurden weder in der
> Anbieterdokumentation noch vertraglich geprüft. Das Objekt trägt deshalb
> `verified: false` und eine Notiz, und ein Test hält das fest. Wer den Tarif in
> Betrieb nimmt, ersetzt die Zahlen durch die zugesagten. Eine Annahme, auf die
> man ein Kontingent stützt, ist ein Ausfall mit Ansage.

## Was sich nicht ändert

| | Warum nicht |
|---|---|
| `providers/tiingo/adapter.js` | Die Antwortform ist dieselbe. |
| `market-store.js` | Speicherung ist von der Bezugsquelle unabhängig. |
| `market-quality.js` | Ein Datenfehler wird nicht dadurch harmlos, dass man zahlt. |
| `panel-builder.js` | Das Panelformat ist tarifunabhängig. |
| `factors.js`, `quant-score.js`, `backtest.js` | Wurden für Phase 4A nicht angefasst und werden es hier auch nicht. |
| Die Fähigkeitsmatrix | Ein höheres Kontingent macht aus einer ungeprüften Fähigkeit keine geprüfte. |

Der letzte Punkt ist der wichtigste und der am leichtesten zu übersehende.
`commercialPlanCapabilities()` übernimmt heute bewusst dieselben Fähigkeiten wie
der Free-Tarif — mit dem Vermerk, dass sie für diesen Tarif **erneut zu prüfen**
sind. Ein bezahlter Zugang liefert womöglich mehr; das ist eine Vermutung, bis
jemand nachgesehen hat.

## Die Skalierungsrechnung

Gemessen: ein Titel mit 11,7 Jahren Historie kostet **eine Anfrage** und
**725 KB**.

| Universum | Erstimport (Anfragen) | Bei 50/h | Bei 5 000/h¹ | Täglich |
|---|---|---|---|---|
| 12 | 12 | Minuten | Minuten | 12 |
| 100 | 100 | 2 h | Minuten | 100 |
| 500 | 500 | 10 h | ~6 min | 500 |
| 1 000 | 1 000 | 20 h | ~12 min | 1 000 (Anschlag) |
| 5 000 | 5 000 | nicht möglich² | ~1 h | 5 000 |

¹ Platzhalterwert, siehe oben. ² Über der Tagesgrenze von 1 000.

Die Bandbreite ist in keinem dieser Fälle das Nadelöhr: ein Erstimport von 500
Titeln verbraucht 354 MB, also 17 % des monatlichen Free-Budgets.

**Die harte Grenze des Free-Tarifs liegt bei etwa 1 000 täglich aktualisierten
Titeln.** Das reicht für ein US-Large-Cap-Universum und nicht für ein globales.

## Was am Free-Tarif hängt und mitwachsen muss

Drei Stellen sind auf das kleine Kontingent hin gebaut. Sie funktionieren
weiter, aber sie sind dann nicht mehr optimal:

**Sequenzieller Abruf (`concurrency: 1`).** Bei 5 000 Titeln und erlaubter
Parallelität ist ein Titel nach dem anderen Verschwendung. `market-client.js`
kennt das Feld bereits; genutzt wird es noch nicht. Das ist der einzige Punkt,
an dem der Wechsel echte Arbeit bedeutet — begrenzt auf eine Datei.

**Der Prüfpunkt je Titel.** Bei zwölf Titeln ist ein Schreibvorgang je Titel
belanglos; bei 5 000 ist er messbar. Ein Prüfpunkt alle *n* Titel wäre die
naheliegende Anpassung.

**`PUBLISHED_BAR_LIMIT = 400`.** Der veröffentlichte Ausschnitt ist auf 400 Bars
gekürzt, damit die statische Auslieferung klein bleibt. Das ist eine Entscheidung
über die Seite, nicht über den Tarif — sie ändert sich unabhängig davon.

## Was ein höheres Kontingent nicht löst

Der Reihe nach, weil die Verwechslung naheliegt:

- **Die Lizenzfrage.** Ein bezahlter Zugang beantwortet sie womöglich anders,
  aber nicht automatisch. `licensing.status` bleibt
  `LEGAL_REVIEW_REQUIRED`, bis jemand mit der Befugnis dazu etwas anderes
  einträgt.
- **Die drei Gates der Backtest-Evidenz.** Restatement, Delisting,
  Verfügbarkeitszeitpunkt stehen für Tiingo auf UNKNOWN. Sie hängen an
  Fundamentaldaten und an einem historischen Wertpapierstamm, nicht an der
  Anzahl erlaubter Anfragen.
- **Fundamentaldaten.** Ungeprüft. Ein höheres Kontingent macht daraus keine
  geprüfte Fähigkeit.
- **Echtzeit im Browser.** Bleibt unmöglich, solange die Seite statisch
  ausgeliefert wird — das ist eine Frage der Auslieferung, nicht des Tarifs.

## Der Weg zu echtem Live

Sollte er später gebraucht werden, führt er über einen Proxy: ein kleiner
Dienst, der den Schlüssel hält, die Kontingente durchsetzt und dem Browser
Antworten ohne Zugangsdaten liefert. Was dafür schon vorhanden ist:

- Die Kontingentlogik (`market-client.js`) ist serverfähig — sie ist reines
  JavaScript ohne Browserabhängigkeit.
- Die Anzeigerichtlinie kennt `audience: "public"` bereits als eigenen Fall.
- Der Adapter braucht keine Änderung; er spricht ohnehin nur HTTP.

Was fehlt, ist der Betrieb: ein Dienst, der läuft, überwacht wird und Kosten
verursacht. Das ist eine Entscheidung über das Produkt, nicht über den
Datenanbieter — und sie steht in dieser Phase nicht an.
