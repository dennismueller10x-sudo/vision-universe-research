# VU HYBRID DATA MODE

Wie das System echte und synthetische Daten nebeneinander betreibt, ohne dass
jemand sie verwechseln kann.

Implementierung: `quant/engines/data-mode.js`, `quant/ui/shell.js`
(`dataOriginBar`, `datasetOriginNote`), Anzeige unter `/quant/markt/`

---

## Die drei Modi

| Modus | Was echt ist | Was synthetisch ist | Wann |
|---|---|---|---|
| `mock` | nichts | alles | Standard. Ohne Anbieterzugang der einzige Zustand. |
| `hybrid` | Tageskurse des Referenzuniversums | alles andere | Sobald ein Zugang konfiguriert ist. |
| `live` | alles, was der Anbieter liefert | nichts | Noch nicht erreichbar — es fehlt der Fundamentalanbieter. |

Gesetzt ueber `VU_DATA_MODE` in der Umgebung. Ein unbekannter Wert faellt auf
`mock` zurueck; das ist der Zustand, in dem nichts Falsches behauptet werden
kann.

## Die Regel, um die es geht

> Wenn Live-Daten ausfallen, darf nicht stillschweigend Mock als echt gezeigt
> werden.

Umgesetzt an drei Stellen, weil eine nicht reicht:

**1. In der Aufloesung** (`resolveSources`). Faellt eine Datenklasse aus, steht
sie in `degraded[]` und traegt eine Meldung. Sie wird zwar auf Demo-Daten
zurueckgesetzt — die Seite soll funktionieren — aber nie unbemerkt.

```js
resolveSources("hybrid", { marketData: { available: false, reason: "requestFailed" } })
// -> sources.marketData === "mock"
// -> degraded === ["marketData"]
// -> classes.marketData.message === "Live-Marktdaten sind derzeit nicht verfuegbar…"
```

**2. Im Text** (`summarize`). Der Satz nennt die synthetischen Klassen
ausdruecklich:

```
Kurse: Tagesschluss · Fundamentaldaten: Demo · synthetisch: fundamentals, corporateActions
```

Nicht: „Live-Daten". Nie.

**3. In der Oberflaeche.** Je Datenklasse ein Abzeichen, nicht eines fuer die
Seite. Ein einzelnes „Live" wuerde alles live aussehen lassen, sobald irgendetwas
live ist — genau die Verkuerzung, die eine Seite mit echten Kursen und
synthetischen Fundamentaldaten unehrlich macht.

## Die Grenze zwischen den Universen

Das ist der Kern des Hybridmodus und der Grund, warum er so und nicht anders
gebaut ist.

| | Modelluniversum | Referenzuniversum |
|---|---|---|
| Kennung | `sec_VU0001` … | `ref_AAPL` … |
| Anzahl | 500 | 15 |
| Unternehmen | erfunden | real |
| Kurse | synthetisch | **echt** |
| Fundamentaldaten | synthetisch, vollstaendig | **keine** |
| Quant Score | ja | **nein** |
| Ranking, Screener, Radar | ja | nein |
| Backtests | ja | nein |

Die beiden Mengen sind disjunkt — kein `securityId`, kein Ticker kommt in
beiden vor. `quant/tests/market-data.test.mjs` (R2) prueft das.

### Warum reale Unternehmen keinen Score bekommen

Es waere technisch einfach, AAPL echte Kurse zu geben und die Fundamentaldaten
aus dem Generator zu ziehen. Das Ergebnis saehe vollstaendig aus und waere eine
Falschaussage ueber ein reales Unternehmen — eine erfundene Eigenkapitalrendite
fuer Apple, mit dem Namen Apple daran.

Das ist die eine Sorte Fehler, die sich nicht durch einen Hinweis heilen laesst.
Ein Warnbanner darueber macht die Zahl nicht weniger falsch; es macht nur den
Betreiber weniger verantwortlich, und das ist nicht dasselbe.

Die zweite Moeglichkeit waere, einen Score nur aus Kursdaten zu rechnen —
Momentum und Risiko. Das waere kein Quant Score, sondern ein Momentum-Signal mit
falschem Namen. Der VU Quant Score ist als Zusammenspiel von sechs Faktoren
definiert; drei davon aus dem Nichts zu ziehen aendert seine Bedeutung, nicht
nur seine Genauigkeit.

Also: reale Titel bekommen echte Kurse und werden als das gezeigt, was sie sind
— Kursreihen. Auf `/quant/markt/` steht das ausdruecklich als eigener Hinweis.

### Was die Deckungslogik von selbst tut

Die Faktorabdeckung aus Phase 1 braucht dafuer keine Sonderregel. Ein Titel
ohne Quality-, Value- und Growth-Daten erreicht die Mindestabdeckung nicht und
bekommt `INCOMPLETE` statt einer Zahl. Das war bereits richtig gebaut; der
Hybridmodus musste nur nichts daran vorbeischleusen.

## Auswirkung auf Backtests

`backtestEligibility()` beantwortet eine Frage, die sonst untergeht: taugt ein
Backtest aus diesen Quellen als **Beleg**?

```js
backtestEligibility(hybridMitEchtenKursen)
// -> { allowed: true, realEvidence: false, note: "…" }
```

`allowed: true` — der Backtest laeuft. `realEvidence: false` — er belegt die
Funktionsweise der Engine, nicht die historische Tragfaehigkeit der Strategie.

Und zwar auch dann nicht, wenn die Kurse echt sind. Eine Mischung aus echten
Kursen und synthetischen Fundamentaldaten ist als Evidenz nicht belastbarer als
der reine Demo-Modus: die Auswahlentscheidungen der Strategie stammen aus den
Fundamentaldaten, und die sind erfunden. Echte Kurse machen das Ergebnis
genauer aussehend, nicht richtiger.

Der Trust Score aus Phase 1 kappt entsprechend, und die Kappungen aus dem
Phase-2-Audit (`neverInvested`, `mostlyCash`) kommen hinzu.

## Herkunftszustaende

| Zustand | Bedeutung | Wo er entsteht |
|---|---|---|
| `live` | Echtzeit | Anbieter, Realtime-Plan |
| `delayed` | verzoegert (typisch 15 min) | Anbieter, Free/Basic |
| `endOfDay` | Schlusskurs des letzten Handelstags | die Vorberechnung |
| `stale` | letzter erfolgreicher Wert nach Ausfall | `market-client.js` |
| `mock` | synthetisch | der Generator |
| `unavailable` | keine Quelle vorhanden | fehlende Datenklasse |
| `capabilityMissing` | der Zugang kann das grundsaetzlich nicht | `capabilities.js` |

Die letzten beiden sind absichtlich getrennt. „Der Wert fehlt gerade" und „der
Anbieter liefert das nie" sind verschiedene Aussagen, verlangen verschiedene
Formulierungen, und nur die zweite laesst sich durch einen Plan- oder
Anbieterwechsel loesen.

## Was der Nutzer sieht

**Im Mock-Modus:** das Demo-Banner aus Phase 1. Unveraendert, es sagt bereits
alles.

**Im Hybridmodus, auf Ranking / Screener / Radar / Backtests:** ein Hinweis,
dass diese Seite auf dem Modelluniversum rechnet, dass echte Kurse fuer *n*
Referenztitel vorliegen und dass sie hier **nicht** einfliessen — mit Verweis
auf `/quant/markt/`.

Das ist die genaue Formulierung, weil die naheliegende falsch waere: diesen
Seiten „Kurse: Tagesschluss" anzuheften, nur weil das System an anderer Stelle
echte Kurse geladen hat, waere eine Aussage ueber Daten, die auf dieser Seite
gar nicht vorkommen.

**Auf `/quant/markt/`:** die vollstaendige Herkunftsleiste, das
Referenzuniversum mit Ladezustand je Titel, die Faehigkeiten des Zugangs und
die Betriebszahlen des letzten Abrufs.

## Betrieb

```bash
# Ohne Zugang — schreibt nur den Statusbericht, beendet sich mit 0
node scripts/market/fetch-market-data.mjs

# Mit Zugang, ohne zu schreiben
TWELVE_DATA_API_KEY=… node scripts/market/fetch-market-data.mjs --dry-run

# Vollstaendig
TWELVE_DATA_API_KEY=… VU_DATA_MODE=hybrid node scripts/market/fetch-market-data.mjs
```

`quant/data/market/status.json` wird **immer** geschrieben — auch ohne Zugang.
Es ist die einzige Datei, die das Frontend zur Bestimmung der Herkunft braucht.
Fehlt sie, faellt die Oberflaeche auf den reinen Mock-Modus zurueck, und das ist
richtig so.
