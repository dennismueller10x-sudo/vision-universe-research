# TIINGO FREE LIMITS

Die Grenzen des kostenlosen Zugangs — als Entwicklungsgrenze behandelt, nicht
als Fußnote.

Durchgesetzt in: `quant/engines/market-client.js`
Deklariert in: `providers/tiingo/adapter.js` → `FREE_LIMITS`

---

## Die Zahlen

| Grenze | Wert | Rolle |
|---|---|---|
| Anfragen pro Minute | 20 | selten bindend |
| **Anfragen pro Stunde** | **50** | **der eigentliche Engpass** |
| Anfragen pro Tag | 1 000 | bindend erst ab ~1 000 Titeln |
| Bandbreite pro Monat | 2 GB | großzügig, siehe unten |
| Gleichzeitige Anfragen | 1 | eigene Setzung, nicht Anbietervorgabe |

Die 50 pro Stunde sind der Punkt, an dem Planung anfängt. Wer nur die 1 000 pro
Tag sieht, plant einen Erstimport von 500 Titeln als „halbes Tagesbudget" und
stellt dann fest, dass er zehn Stunden dauert.

## Gemessener Verbrauch

Aus dem Importlauf gegen die echte API (GitHub Actions, zwölf Titel,
2015-01-02 bis 2026-09-04):

| | |
|---|---|
| Anfragen | 12 — genau eine je Titel |
| Bars je Titel | 2 936 |
| Übertragen | 8,9 MB gesamt |
| Je Titel | ~725 KB für 11,7 Jahre |
| Je Bar | ~253 Byte |

Zwei Beobachtungen daraus:

**Die volle Historie kostet eine Anfrage.** Tiingo liefert den gesamten
angefragten Zeitraum in einer Antwort; es gibt keine Seitenaufteilung, an der
sich das Kontingent aufreibt. Das ist der Unterschied zwischen einem
Erstimport von 500 Anfragen und einem von mehreren tausend.

**Splits und Dividenden kosten nichts extra.** `splitFactor` und `divCash`
stehen in der Kursreihe. Wo andere Anbieter einen zweiten Endpunkt verlangen,
fällt hier keine zusätzliche Anfrage an.

## Die Bandbreite ist nicht der Engpass

2 GB im Monat entsprechen etwa **2 890 vollen Erstimporten eines Titels**. Ein
Erstimport von 500 Titeln über elf Jahre verbraucht 354 MB, also 17 % des
Monatsbudgets. Der laufende Betrieb — eine Bar je Titel und Tag — ist
demgegenüber vernachlässigbar.

Das Byte-Budget wird trotzdem mitgezählt (`market-client.js`, `monthBytes`).
Nicht weil es knapp wäre, sondern weil ein Kontingent, das niemand zählt, im
Zweifel überschritten wird, ohne dass jemand es merkt.

## Was daraus für den Betrieb folgt

| Universumsgröße | Erstimport | Täglich | Machbar im Free-Tarif? |
|---|---|---|---|
| 12 (Testset) | 12 Anfragen, <1 h | 12/Tag | ja, im Vorbeigehen |
| 100 | 2 h | 100/Tag | ja |
| 500 | 10 h | 500/Tag | als Nachtlauf, ja |
| 1 000 | 20 h | 1 000/Tag | am Anschlag |
| >1 000 | — | über der Tagesgrenze | nein |

Die harte Obergrenze des Free-Tarifs liegt bei etwa 1 000 täglich
aktualisierten Titeln, und schon dort ist die Stundengrenze das Nadelöhr: 20
Stunden Wanduhrzeit für einen vollständigen Durchlauf.

## Wie die Grenzen durchgesetzt werden

`market-client.js` führt drei rollende Fenster (Minute, Stunde, Tag) und einen
Monatszähler für Bytes. Vor jeder Anfrage wird geprüft, welches Fenster bindet;
`msUntilSlot()` gibt das Maximum der Wartezeiten zurück, nicht die erste
gefundene.

Ein `429` des Anbieters füllt das Stundenfenster mit auf. Der Client hat sich
dann verschätzt, und die verlässlichere Auskunft ist die des Anbieters.

**Ein erschöpftes Kontingent ist kein Fehler.** Der Import bricht ab, schreibt
seinen Prüfpunkt und meldet `quotaExceeded`. Der nächste Lauf nimmt die Liste
dort auf, wo sie liegen geblieben ist. Ein Abbruch ohne Prüfpunkt wäre bei 500
Titeln der Unterschied zwischen „morgen weiter" und „alles noch einmal".

## Der kostenpflichtige Tarif

`COMMERCIAL_LIMITS` steht im Adapter, ist aber **nicht geprüft**: es besteht
kein kostenpflichtiger Zugang, und die Konditionen wurden weder in der
Anbieterdokumentation noch vertraglich nachgesehen. Das Objekt trägt deshalb
`verified: false` und eine Notiz — die Kennzeichnung gehört in die Daten und
nicht nur in einen Kommentar, denn ein Kommentar wird nicht mitgeliefert, wenn
jemand das Objekt ausgibt.

Wer den Tarif in Betrieb nimmt, ersetzt die Zahlen durch die zugesagten.
Der Adapter ändert sich dabei nicht — siehe `TIINGO_SCALING_PLAN.md`.
