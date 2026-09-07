# TIINGO DATA SEMANTICS

Was eine Tiingo-Kursreihe bedeutet, gemessen statt geglaubt.

Nachweis: `quant/data/market/tiingo-runtime-verification.json`
Prüfung: `quant/engines/market-quality.js` → `validateAdjustmentConsistency()`
Vokabular: `quant/methodology/price-adjustment-v1.json`

---

## Der Anlass

Phase 3 hat sechs Anbieter beurteilt, ohne einen einzigen davon abrufen zu
können — der Egress-Proxy blockierte die Anbieterdomains. Alle Befunde standen
auf `DOCUMENTATION_VERIFIED` oder darunter, und die wichtigste Frage blieb
offen: liefert überhaupt jemand eine Kursreihe, aus der sich eine **Rendite**
berechnen lässt und nicht nur eine Kursveränderung?

Für Tiingo liegt jetzt ein Zugang vor. Damit ist die Frage keine
Rechercheaufgabe mehr, sondern eine Messung.

## Die Messung

Ausgeführt in GitHub Actions, Lauf `34136349043`, sechs Anfragen von 50 pro
Stunde. Der Schlüssel liegt dort und nirgendwo sonst.

| Was | Wo gemessen | Befund |
|---|---|---|
| Zugang und Stammdaten | AAPL | Apple Inc, NASDAQ, Historie ab 1980-12-12 |
| Historientiefe | AAPL ab 1990-01-01 | 1517 Bars ab 1990-01-02 |
| Splitbereinigung | NVDA 4:1 am 2021-07-20 | roh springt 4,036× — bereinigt 0,957× |
| Splitkennzeichnung | NVDA | `splitFactor = 4` am Splittag |
| Dividendenbereinigung | KO, Ex-Tag 2024-03-14 | bereinigt 55,5092 gegen roh 59,69 |
| Ausschüttungen | KO 2024 | vier Zahlungen zu je 0,485 USD |
| Sonderzeichen im Ticker | BRK-B | 25 Bars, keine Sonderbehandlung nötig |
| Intraday | AAPL über IEX | 78 Bars |

## Der entscheidende Befund

Am Ex-Tag einer Dividende liegt der bereinigte Kurs des Vortags **unter** dem
unbereinigten: 55,5092 gegen 59,69, Verhältnis 0,92996. Genau das ist die
Signatur einer Dividendenbereinigung — die Ausschüttung ist in die Reihe
eingerechnet.

Nach `price-adjustment-v1.json` ist `adjClose` damit **TOTAL_RETURN**.

Das ist der erste zur Laufzeit belegte Total-Return-Bestand im Projekt, und er
kostet nichts. Zum Vergleich: Twelve Data liefert im Free-Tarif kein
`adjusted_close`; die Reihe ist splitbereinigt und damit für Momentum und
Charts brauchbar, für Renditeaussagen nicht.

### Was daraus folgt

| Kennzahl | Mindeststufe | Aus Tiingo Free? |
|---|---|---|
| Kursverlauf, Charts | `RAW` | ja |
| Momentum, Volatilität, Drawdown | `SPLIT_ADJUSTED` | ja |
| Rendite, CAGR | `TOTAL_RETURN` | ja |
| Backtest-Evidenz (Kursseite) | `TOTAL_RETURN` | ja |

Die Kursseite eines Backtests ist damit abgedeckt. Die Fundamentalseite ist es
nicht, und daran ändert sich in dieser Phase nichts: Gate A (Restatement),
Gate B (Delisting) und Gate C (Verfügbarkeitszeitpunkt) stehen für Tiingo
unverändert auf UNKNOWN. Ein Anbieter mit gemessenen Kursen ist noch keine
Evidenzquelle.

## Die Felder

Tiingo liefert je Handelstag beide Spalten nebeneinander:

```
date, open, high, low, close, volume,
adjOpen, adjHigh, adjLow, adjClose, adjVolume,
divCash, splitFactor
```

`splitFactor` ist an einem gewöhnlichen Tag 1, `divCash` ist 0. Ein Ereignis
steht also in der Kursreihe selbst und braucht keinen zweiten Abruf — deshalb
kostet der Nachweis für Splits und Dividenden zusammen null zusätzliche
Anfragen.

Die Zuordnung in das kanonische Modell macht `providers/tiingo/adapter.js`.
Nichts Anbieterspezifisches verlässt diese Datei; `adjClose` wird nur dann in
`adjustedClose` geschrieben, wenn die Bereinigungsstufe das trägt.

## Die Gegenprobe

Zwei Spalten nebeneinander erlauben etwas, das vorher nicht ging: die
behauptete Bereinigungsstufe **an den Daten zu prüfen**.

Der gefährliche Fall ist nicht die fehlende Bereinigung. Er ist die
behauptete — eine Spalte, die `adjClose` heißt und in Wahrheit die Rohwerte
kopiert, sieht sauber aus und erzeugt trotzdem falsche Renditen. Nichts fehlt,
also fällt nichts auf.

`validateAdjustmentConsistency()` bildet den kumulierten Faktor
`bereinigt / roh` je Tag. Er steht zwischen den Ereignissen still und bewegt
sich an Split- und Ausschüttungstagen. Daran lässt sich messen, was die Spalte
einrechnet:

- **Split belegt**: die rohe Reihe springt, die bereinigte nicht.
- **Dividende belegt**: der Faktor macht am Ex-Tag einen Schritt in der Größe
  der Ausschüttung.
- **Widerlegt**: ein Ereignis liegt im Zeitraum, und der Faktor steht still.

Drei Eigenschaften sind Absicht:

1. **Sie hebt nie an.** Eine Reihe, die sich besser verhält als deklariert,
   bleibt deklariert. Anheben darf nur der Laufzeitnachweis — eine
   Plausibilitätsprüfung an vierzig Bars ist keine Zusicherung.
2. **Ohne Ereignis lautet die Antwort UNKNOWN.** Eine ruhige Reihe beweist
   nichts, auch nicht das Gegenteil. Wer hier RAW ableitet, verwechselt
   fehlende Beobachtung mit Beobachtung des Fehlens.
3. **RAW folgt nur aus einer Beobachtung**, nie aus der bloßen Anwesenheit
   eines Ereignisses im Kalender.

Der Import lehnt eine widersprochene Reihe ab, statt sie zu speichern. Eine
falsch ausgezeichnete Reihe im Bestand ist schlimmer als eine fehlende: alles
Nachgelagerte nimmt sie für bare Münze.

## Was nicht gemessen wurde

| Frage | Stand | Warum |
|---|---|---|
| Delistete Wertpapiere | UNKNOWN | Es fehlt ein Titel mit gesichertem Delisting-Datum. Ohne ihn bleibt Gate B offen — das ist ein Ergebnis, kein Versäumnis. |
| Fundamentaldaten | UNKNOWN | Endpunkte existieren, waren nicht Gegenstand dieser Phase. |
| Meldezeitpunkte (`availableAt`) | UNKNOWN | Setzt Fundamentaldaten voraus. |
| Echtzeit, WebSocket | UNKNOWN | Nicht abgerufen; die Lizenzfrage ist ohnehin vorgelagert. |
| Intraday-Historie | UNKNOWN | Nur der laufende Tag wurde geprüft. |

`UNKNOWN` heißt nicht „kann Tiingo nicht". Es heißt, dass niemand nachgesehen
hat. Der Unterschied ist der Kern der Faehigkeitsmatrix seit Phase 2, und er
gilt hier genauso.
