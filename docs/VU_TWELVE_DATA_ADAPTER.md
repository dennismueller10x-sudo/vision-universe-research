# VU TWELVE DATA ADAPTER

Implementierung: `providers/twelve-data/adapter.js` · Abruf:
`scripts/market/fetch-market-data.mjs` · Bewertung:
`scripts/market/evaluate-provider.mjs`

---

## Warum dieser Anbieter zuerst

Twelve Data war bereits im Repository in Gebrauch
(`scripts/dashboard/fetch_market_data.py`, Secret `TWELVE_DATA_API_KEY`). Der
Zugang existiert also, und der Free Plan reicht fuer den Zweck dieser Phase:
Tageskurse fuer ein kleines Referenzuniversum.

Er ist **nicht** als endgueltige Wahl gesetzt. Die gesamte Providerschicht ist
anbieterneutral; dieser Adapter ist eine Implementierung davon, keine Annahme
darin. Was Twelve Data fuer die naechste Ausbaustufe fehlt, steht unten unter
„Grenzen".

## Betrieb

Node-only. Der Adapter benutzt `require` und registriert sich **nicht** global —
er ist absichtlich nicht browserfaehig. `quant/tests/secrets.test.mjs` (S3)
prueft, dass keine HTML-Seite ihn einbindet.

```js
const TwelveData = require("./providers/twelve-data/adapter.js");

const provider = TwelveData.createTwelveDataProvider({
  apiKey: process.env.TWELVE_DATA_API_KEY,     // nur serverseitig
  capabilities: TwelveData.freePlanCapabilities(),
  symbolRegistry: registry,
  fetchImpl: (url, init) => fetch(url, init)
});

const res = await provider.getDailyBars("ref_AAPL", { outputsize: 400 });
```

Ohne `apiKey` stellt der Adapter **keine Anfrage** und liefert
`{ available: false, reason: "notConfigured", data: null }`. Er faellt
ausdruecklich nicht auf Demo-Daten des Anbieters zurueck: ein Demo-Kurs, der wie
ein echter aussieht, ist schlimmer als gar keiner.

## Methoden

| Methode | Endpunkt | Free Plan |
|---|---|---|
| `getDailyBars(id, {outputsize, from, to})` | `time_series` | ja |
| `getHistoricalBars(id, opts)` | `time_series` | ja (`outputsize: 5000`) |
| `getIntradayBars(id, {interval})` | `time_series` | ja, Historie begrenzt |
| `getQuote(id)` | `quote` | ja, verzoegert |
| `getMarketStatus(id)` | `market_state` | ja |
| `getSymbolSearch(query)` | `symbol_search` | ja |
| `getCorporateActions(id)` | `splits`, `dividends` | **nein** → `providerCapabilityMissing` |
| `healthCheck()`, `stats()`, `quota()` | — | immer |

## Die Bereinigungsfrage

Das ist der Punkt, an dem dieser Adapter am meisten Sorgfalt braucht.

Die Engine rechnet Renditen auf total-return-bereinigten Kursen. Wer
unbereinigte Schlusskurse als `adjustedClose` einspeist, erzeugt an jedem Split
einen Scheinverlust: NVDA faellt am 10. Juni 2024 von 1 208 auf 121 USD, und die
Engine liest daraus ein Minus von 90 %.

Der Adapter kennt deshalb drei Zustaende:

| `adjustmentStatus` | Bedeutung | `adjustedClose` | Verwendbar fuer |
|---|---|---|---|
| `adjusted` | Splits **und** Dividenden bereinigt | Zahl | Total Return, Backtests |
| `splitAdjusted` | nur Splits bereinigt | `null` | Charts, Momentum |
| `unadjusted` | keine Bereinigung | `null` | nur Anzeige |

Eine ungepruefte Faehigkeit faellt auf den strengeren Zustand zurueck. Im
Zweifel wird lieber zu wenig behauptet.

### Was der Free Plan liefert

`adjustedPrices` ist **`false`** deklariert: es gibt kein `adjusted_close`-Feld,
und eine Total-Return-Bereinigung ist nicht Teil des kostenlosen Zugangs.

`splitAdjustedPrices` ist **`null`** — ungeprueft, mit einem empirischen
Hinweis: in den bereits im Repository liegenden Reihen
(`dashboard/data/market_data.json`, ueber denselben Endpunkt geholt) steht NVDA
am 16. Juli 2021 bei 18,16 USD. Das ist der um 4:1 (2021) und 10:1 (2024)
bereinigte Kurs; unbereinigt waeren es rund 726 USD. Die Tageshistorie kommt
also sehr wahrscheinlich splitbereinigt.

Zugesichert ist das nirgends, deshalb `null` statt `true`. Wer es verifiziert:

```js
TwelveData.freePlanCapabilities({
  market: { ...TwelveData.freePlanCapabilities().sets.market, splitAdjustedPrices: true }
})
```

und Datum plus Beleg in `docs/VU_PROVIDER_CAPABILITIES.md` eintragen. Die
Reihen sind dann als `splitAdjusted` gekennzeichnet — was fuer Charts und
Momentum reicht, fuer Total Return weiterhin nicht.

**Die Dividendenluecke bleibt so oder so.** Sie ist unauffaelliger als ein
unbereinigter Split und deshalb gefaehrlicher: die Reihe sieht sauber aus, aber
die Rendite eines Dividendenwerts wird ueber zehn Jahre um mehrere Prozentpunkte
pro Jahr unterschaetzt. `market-quality.js` gibt dafuer den eigenen Befund
`split_adjusted_only` aus.

## Kontingent

Der Free Plan erlaubt laut Anbieter 8 Anfragen pro Minute und 800 pro Tag.
Der Adapter setzt das als Standard:

```js
DEFAULT_LIMITS = {
  requestsPerMinute: 8, requestsPerDay: 800,
  concurrency: 1, maxRetries: 3, baseBackoffMs: 800
}
```

`concurrency: 1` ist bewusst strenger als noetig: bei acht Anfragen pro Minute
bringt Parallelitaet nichts ausser dem Risiko, das Fenster zu ueberschreiten.

Ein voller Lauf ueber 15 Referenztitel kostet 15 Anfragen und dauert wegen des
Minutenfensters knapp zwei Minuten. Das ist fuer einen taeglichen Workflow
unproblematisch.

**Diese Zahlen koennen sich aendern.** Sie stehen als Standardwert im Code und
als Kontingentanzeige in `status.json`; sie sind keine Vertragsgrundlage. Vor
einer Ausweitung: beim Anbieter nachsehen, nicht dieser Datei glauben.

## Fehler mit HTTP 200

Twelve Data beantwortet einen Teil der Fehler mit Status 200 und einem
Fehlerobjekt im Rumpf:

```json
{ "code": 429, "message": "You have run out of API credits", "status": "error" }
```

Wer nur `response.ok` prueft, haelt das fuer eine gueltige, leere Antwort und
schreibt eine Reihe mit null Bars. Der Adapter uebergibt dem Transport deshalb
eine `detectError`-Funktion, die den Rumpf ansieht. `quant/tests/market-data.test.mjs`
(A5) prueft diesen Fall.

## Schluesselbehandlung

Der Schluessel steht bei diesem Anbieter als URL-Parameter
(`?apikey=…`) — unvermeidlich, das ist die API. Daraus folgen drei Vorkehrungen:

1. Die Anfrage-URL erscheint in **keiner** Rueckgabe, keiner Diagnose, keinem
   Statusbericht. `stats()`, `health()` und `quota()` tragen sie nicht.
2. Fehlermeldungen des Anbieters werden nicht durchgereicht, wenn sie den
   Schluessel spiegeln koennten. `quant/tests/secrets.test.mjs` (S8) baut genau
   diesen Fall nach: der Anbieter antwortet mit `"Invalid API key: <key>"`, und
   der Test prueft, dass der Schluessel in der Antwort an den Aufrufer fehlt.
3. `scripts/market/assert-no-secrets.mjs` prueft vor dem Commit die frisch
   geschriebenen Dateien gegen den Wert der Umgebungsvariablen.

## Grenzen

Was dieser Zugang **nicht** kann, mit Folge fuer das System:

| Fehlt | Folge |
|---|---|
| Total-Return-Bereinigung | keine belastbaren Renditekennzahlen aus diesen Reihen |
| Split- und Dividendenereignisse | keine eigene Bereinigung moeglich |
| Point-in-Time-Fundamentaldaten | kein historischer Fundamental-Backtest |
| Delistete Unternehmen | Survivorship Bias — ein Backtest misst nur die Ueberlebenden |
| Historische Indexzugehoerigkeit | kein rekonstruierbares Anlageuniversum |
| Restatements | Erstmeldung und Korrektur nicht unterscheidbar |

Die letzten vier sind nicht eine Frage des Plans, sondern der Ausrichtung des
Anbieters. Fuer Point-in-Time-Fundamentaldaten fuehrt der Weg zu einem anderen
Haus — siehe `docs/VU_PROVIDER_CAPABILITIES.md`, Abschnitt „Naechster Anbieter".

Aktueller Stand der Bewertung (`node scripts/market/evaluate-provider.mjs twelve-data`):

```
Kursdaten             29 %  eingeschraenkt
Fundamental-Backtest   0 %  UNGEEIGNET  (fehlt: pointInTime, delistedSecurities)
Schaetzungen           0 %  ungeprueft
Referenzdaten         60 %  geeignet
```

Fuer den Zweck dieser Phase — Tageskurse fuer 15 liquide Titel, sichtbar
gemacht und ehrlich beschriftet — reicht das. Fuer alles darueber hinaus nicht.
