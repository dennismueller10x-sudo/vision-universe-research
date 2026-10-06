# TIINGO INTEGRATION

Wie Tiingo an das bestehende System angeschlossen ist — und was dafür **nicht**
gebaut wurde.

Adapter: `providers/tiingo/adapter.js`
Import: `scripts/market/ingest-tiingo.mjs`
Nachweis: `scripts/market/verify-tiingo-runtime.mjs`

---

## Der Grundsatz

Keine Parallelarchitektur. Tiingo ist ein weiterer Adapter hinter derselben
Schnittstelle, die Phase 2 für Twelve Data eingeführt hat. Der Beweis dafür
ist negativ und deshalb aussagekräftig: **an `factors.js`, `quant-score.js`,
`strategy.js` oder `backtest.js` wurde für diese Phase keine Zeile geändert.**

Echte Kurse laufen durch dieselbe Technical-, Quant- und Backtest-Logik wie
das Modelluniversum. Zwei Rechenwege für dieselbe Kennzahl wären keine
Integration, sondern eine zweite Insel — und sie würden auseinanderlaufen.

## Die Bausteine

| Datei | Aufgabe |
|---|---|
| `providers/tiingo/adapter.js` | Anbieterspezifisches. Endet hier. |
| `quant/engines/market-client.js` | Kontingente, Wiederholungen, Cache — anbieterneutral |
| `quant/engines/market-store.js` | Arbeitsstand und veröffentlichter Ausschnitt |
| `quant/engines/market-quality.js` | Qualitätsprüfung eingehender Reihen |
| `quant/engines/panel-builder.js` | Die Brücke von Bars in das Panelformat der Engines |
| `quant/engines/chart-ranges.js` | Zeitraum und Quelle für die Darstellung |
| `quant/engines/display-policy.js` | Wer darf was sehen |

### Der Adapter

Er tut drei Dinge und sonst nichts:

1. Er übersetzt Tiingos Antwortform in das kanonische Modell. `adjClose`,
   `divCash`, `splitFactor` verlassen diese Datei nicht.
2. Er deklariert seine Fähigkeiten in drei Zuständen — `true` zugesichert,
   `false` ausdrücklich nicht vorhanden, `null` ungeprüft.
3. Er reicht den Schlüssel im `Authorization`-Header weiter, nicht in der URL.

Der dritte Punkt ist ein echter Vorteil gegenüber Twelve Data, das den
Schlüssel als URL-Parameter erwartet: eine geloggte URL verrät ihn nicht.
Ein Test hält das fest.

### Die Brücke in die Engines

`panel-builder.js` baut aus gespeicherten Bars genau die Panelform, die
`factors.js` und `backtest.js` bereits erwarten:

```
{ tradingDays, dayIndex, series: { id: {close, adjustedClose, startIndex, endIndex} },
  benchmark, volumeAt, sharesAtIndex }
```

Drei Entscheidungen darin sind Absicht:

- **Reihen unterhalb der geforderten Bereinigungsstufe kommen nicht ins
  Panel.** Ein Panel aus Reihen unbekannter Bereinigung wäre kein
  unvollständiges, sondern ein falsches Ergebnis.
- **Die Panelstufe ist die niedrigste enthaltene Reihe.** Eine Auswertung über
  alle Titel kann nicht belastbarer sein als ihre schwächste.
- **Handelstage werden vereinigt, Lücken fortgeschrieben.** Eine Null wäre ein
  Kurssturz auf null und würde jede Kennzahl zerstören.

## Die Fähigkeitsmatrix hebt sich selbst nicht an

Der Adapter behauptet nichts. Er liest `quant/data/market/tiingo-runtime-verification.json`
— den Bericht eines Laufs in GitHub Actions, wo der Schlüssel liegt — und hebt
genau die Fähigkeiten an, die darin belegt sind. Jede Anhebung hinterlässt
einen Beleg mit Lauf, Commit, Zeitpunkt und den Zahlen, an denen die
Entscheidung hängt.

Fehlt die Datei, steht alles wieder auf `null`. Das System läuft dann mit
weniger Zusagen, nicht mit falschen.

Warum nicht einfach `true` hineinschreiben: weil genau das der Fehler ist, den
Phase 3 abgestellt hat. Eine Zusage ohne Beleg ist eine Behauptung, und sie
hält sich, weil niemand sie nachprüfen kann.

## Was der Import tut

```
node scripts/market/ingest-tiingo.mjs            # inkrementell
node scripts/market/ingest-tiingo.mjs --initial  # Erstimport
node scripts/market/ingest-tiingo.mjs --dry-run  # nichts abrufen
node scripts/market/ingest-tiingo.mjs --publish  # Ausschnitt veröffentlichen
```

Je Titel: abrufen → Qualität prüfen → Bereinigung gegenprüfen → mit dem
Vorstand zusammenführen → Prüfpunkt schreiben. Ein erschöpftes Kontingent
bricht die Schleife ab; der nächste Lauf setzt am Prüfpunkt auf.

Ohne `TIINGO_API_KEY` ruft das Skript nichts ab und **fällt ausdrücklich nicht
auf Demo-Daten zurück**. Es schreibt einen Statusbericht, der sagt, dass kein
Zugang vorliegt. Das ist kein Fehlerzustand, sondern der Normalzustand jeder
Installation ohne Schlüssel.

## Was der Import gefunden hat

Der erste Lauf gegen die echte API hat vier von zwölf Titeln verworfen: AAPL,
NVDA, AMZN und TSLA — alle vier mit Split im Zeitraum, alle vier mit tadellos
bereinigter Reihe daneben.

Die Ursache war eine Annahme aus Phase 2, die mit einer Spalte richtig war und
mit zweien falsch wird: die Stetigkeitsprüfung lief auf der **rohen** Spalte,
und die springt an einem Split. Das ist ihre Aufgabe, nicht ihr Fehler.

Keiner der damals 310 Tests hatte das gefunden, weil keiner beide Spalten mit
einem echten Split kannte. Der Befund ist der eigentliche Ertrag des
Importlaufs — er ist der Unterschied zwischen „der Code übersetzt" und „der Weg
trägt".

## Wo der Schlüssel ist

In genau einem GitHub-Secret, `TIINGO_API_KEY`, und im Speicher des
Action-Runners.

Er erreicht den Browser nicht, weil der Browser nichts beim Anbieter abruft.
Die Seite wird statisch von GitHub Pages ausgeliefert; alles, was sie lädt, ist
öffentlich lesbar. Ein Schlüssel dort wäre kein Risiko, sondern eine
Veröffentlichung. Siehe `TIINGO_LIVE_ARCHITECTURE.md`.
