# VU AI TOOL ARCHITECTURE

Implementierung: `quant/engines/ai-provider.js`, `quant/engines/ai-tools.js`

## Grundsatz

> **AI ist nicht die Wahrheitsschicht.**

Die AI-Schicht uebersetzt Sprache in Struktur und Struktur in Sprache. Sie berechnet
nichts. Sie kennt keinen Kurs, keinen Score, keine Rendite. Jede Zahl entsteht in einer
deterministischen Engine und erreicht die AI ausschliesslich als Werkzeugergebnis.

## Pipeline

```
Natuerliche Sprache
   -> Intent + Entitaeten           ai-provider.js
   -> Query- / Strategy-AST         ai-provider.js
   -> Schema-Validierung            query.js / strategy.js
   -> registriertes Werkzeug        ai-tools.js
   -> Domain Engine                 die Wahrheitsschicht
   -> Ergebnis + Provenance
   -> Erklaerung                    ai-provider.js, nur aus dem Ergebnis
```

## Sicherheitsgrenze

Die AI besitzt **keinen Datenzugriff**, sondern ausschliesslich das Recht, registrierte
Werkzeuge aufzurufen.

Bewusst nicht vorhanden und nicht nachtraeglich registrierbar:

- kein Werkzeug, das SQL, JavaScript oder einen beliebigen Ausdruck ausfuehrt
- kein Werkzeug, das eine beliebige URL abruft
- kein direkter Datenbank- oder Dateizugriff
- keine Moeglichkeit, eine Kennzahl ohne Werkzeugergebnis zu behaupten

`FORBIDDEN_TOOL_NAMES` laesst die Registrierung solcher Werkzeuge scheitern. Ein
unbekannter Werkzeugname wird abgelehnt — es gibt keinen Fallback und kein dynamisches
Nachladen.

Damit kann eine Prompt Injection hoechstens bewirken, dass ein **registriertes** Werkzeug
mit anderen Argumenten laeuft. Sie kann nie zu einem Zugriff fuehren, den das System
nicht ohnehin erlaubt.

## Argumentpruefung

Jedes Werkzeug deklariert seine Parameter mit Typ und Pflichtstatus. Fehlende
Pflichtargumente und **unbekannte Argumente** fuehren zur Ablehnung — unbekannte
Argumente werden nicht stillschweigend ignoriert.

## Registrierte Werkzeuge

**Discovery** `screenStocks` · `getStockSnapshot` · `compareStocks`
**Quant** `getQuantScore` · `explainQuantScore` · `getFactorHistory` · `rankStocks`
**Strategy** `createStrategy` · `validateStrategy` · `runBacktest` · `compareBacktests` · `getCurrentStrategyHoldings`
**Monitoring** `getWatchlistChanges`
**Meta** `getMethodology` · `listFields`

`screenStocks` nimmt ausschliesslich einen validierten Query-AST entgegen, `runBacktest`
ausschliesslich eine validierte Strategy Definition. Ein String als `definition` wird
abgelehnt: der Satz des Nutzers erreicht die Backtest Engine nie.

## Zugriffsschicht

`createToolRegistry(access)` bekommt Datenzugriffsfunktionen uebergeben. In der Anwendung
ist das `quant/api/client.js`, in Tests ein Stub. Die Registry selbst kennt weder
Datenbank noch Dateisystem — sie kann gar nicht mehr, als ihr uebergeben wurde.

## Halluzinationskontrolle

`explain()` formuliert ausschliesslich aus vorliegenden Werkzeugergebnissen. Liegt keines
vor oder sind alle fehlgeschlagen:

```
dataUnavailable: true
"Dazu liegt kein Ergebnis aus einer berechneten Quelle vor. Vision Universe gibt in
 diesem Fall keine Einschaetzung ab, statt eine plausibel klingende Zahl zu erfinden."
```

Jede Antwort nennt die Werkzeuge, aus denen sie stammt. Ein Test prueft, dass die
Antwort ohne Werkzeugergebnis **keine Zahl** enthaelt.

## Bestaetigung vor Ausfuehrung

Vor jeder Ausfuehrung zeigt die Oberflaeche „So habe ich deine Idee interpretiert“:
Universum, jede einzelne Regel, Sortierung, Limit — bei Strategien zusaetzlich Ranking,
Positionen, Grenzen, Rebalancing und Ausfuehrungsannahmen, dazu die
Interpretationshinweise („‚profitabel‘ wurde als positiver Free Cash Flow interpretiert“).

Ein Backtest laeuft erst nach ausdruecklicher Bestaetigung.

## Strategieaenderung aus Feedback

Auf „Der Drawdown ist mir zu hoch“ sucht die AI **nicht** rueckwirkend nach besseren
Parametern. Sie schlaegt eine begruendete Regelaenderung vor — Volatilitaetsfilter,
niedrigeres Sektorlimit, hoehere Mindestgroesse, Risk als Rankingfaktor — und erzeugt
damit eine neue Strategieversion. Die Vorversion bleibt unveraendert, beide Ergebnisse
bleiben vergleichbar. Ein Test prueft, dass die Kostenannahmen dabei nicht heimlich
guenstiger werden.

## MockAIProvider

Der aktive Provider in V1 ist ein **deterministischer, regelbasierter Parser**. Er ist
ausdruecklich kein Sprachmodell und gibt sich auch nicht als eines aus; sein
`healthCheck()` sagt das explizit.

Sein Zweck: die gesamte Architektur ist ohne API-Key vollstaendig nutzbar und testbar.
Er erkennt acht Intents (screen, strategy, backtest, explain, compare, rank, watchlist,
methodology), Sektoren, Faktoren, Ticker, ausgeschriebene und numerische Zahlwoerter
sowie Flags wie „profitabel“, „wenig Volatilitaet“, „nahe am 52-Wochen-Hoch“.

## Provider-Wechsel

```js
AI_PROVIDER_METHODS = ["interpretQuery", "interpretStrategy", "explain", "healthCheck"]
```

Ein `OpenAIProvider` oder `ClaudeProvider` implementiert dieselben vier Methoden und gibt
dieselben Strukturen zurueck. Tool-Schicht, Validierung und Seiten bleiben unveraendert.
Der Schluessel gehoert serverseitig — er darf nie im Frontend liegen.
