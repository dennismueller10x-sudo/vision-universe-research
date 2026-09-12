# Vision Universe® — Live Market Data: Übergabe an das Frontend

> **Diese Infrastruktur wird angeschlossen, nicht neu gebaut.**
>
> Keine zweite Symbolliste. Keine parallele Echtzeit-Architektur. Kein
> separater Live-Chart.

Stand: 2026-09-12 · Zweig `claude/full-universe-proof-y8ncfa` ·
geschützte Vorschau, keine öffentliche Auslieferung.

---

## 1. Die Grenze: woher die Symbole kommen

Es gibt genau **eine** Stelle, an der entschieden wird, ob ein Titel
bedient wird: `api/_scope.js`. Beide Serverfunktionen fragen dort.

| | |
| --- | --- |
| Quelle | `quant/data/market/security-master/eligibility.json` (`us-security-master-1.1.0`) |
| Projektion | `quant/data/market/realtime/product-symbols.json` |
| Gebaut von | `scripts/realtime/build-product-symbols.mjs` (rechnet gegen die Quelle nach, bricht bei Abweichung ab) |
| Regel | Produktuniversum = alle Entscheidungen außer `EXCLUDED` |
| Größe | **7.004** (ELIGIBLE 6.477 · SEPARATE_CLASS 308 · REVIEW 219) |

**Wer eine neue Symbolliste anlegt, hat die Grenze verdoppelt.** Genau
daran ist dieser Workstream einmal hängengeblieben: die fünf Titel, mit
denen er angefangen hat, wurden später für die Produktgrenze gehalten.
`RS1` schlägt an, sobald im produktiven Pfad wieder ein Ticker oder eine
feste Titelliste steht — unter beliebigem Variablennamen.

---

## 2. `GET /api/intraday/`

```
/api/intraday/?ticker=<TICKER>&freq=5min&days=3
```

| Parameter | Default | Grenze |
| --- | --- | --- |
| `ticker` | — | Pflicht |
| `freq` | `5min` | `1min` `5min` `15min` `30min` `1hour` |
| `days` | `2` | max. `5` (`intraday.maxDays`) |

**Antwort (HTTP 200; nur `INVALID_IDENTITY` und `INVALID_FREQUENCY` → 400):**

```jsonc
{
  "state": "INTRADAY_AVAILABLE",   // s. Zustandstabelle
  "ticker": "AAPL",
  "eligibility": "ELIGIBLE",
  "realtime": "REALTIME_AVAILABLE", // getrennt von state!
  "marketStatus": "CLOSED",         // OPEN | EXTENDED_HOURS | CLOSED
  "session": { "phase": "CLOSED", "closedReason": "weekend", ... },
  "bars": [{ "date": "...", "open": …, "high": …, "low": …, "close": …, "volume": … }],
  "barCount": 234,
  "first": "2026-09-09T13:30:00.000Z",
  "last":  "2026-09-11T19:55:00.000Z",
  "source": "tiingo/iex",
  "priceTypeConfirmed": false
}
```

`eligibility`, `realtime`, `marketStatus` und `session` stehen in **jeder**
Antwort — auch in den Fehlzuständen. Das ist Absicht: der Zweig „der
Anbieter kennt das Symbol nicht" ist genau der, in dem das Frontend
wissen muss, dass der Titel trotzdem echtzeitfähig ist.

---

## 3. `GET /api/realtime/` (Server-Sent Events)

```
/api/realtime/?tickers=<A>,<B>
```

Höchstens **4** Titel je Verbindung (`realtime.maxSymbolsPerConnection`).
Was darüber hinausgeht, kommt als `rejected`-Eintrag mit
`state: "CONNECTION_LIMIT"` zurück — es wird nicht stillschweigend
weggeschnitten. Das Fenster schließt sich nach **50 s**
(`realtime.streamWindowMs`); das Frontend verbindet neu, solange der
Nutzer im 1T-Zeitraum steht.

**Ereignisse:**

| `event:` | wann | wichtigste Felder |
| --- | --- | --- |
| `status` | Verbindung auf, Anbieterfehler, Einrichtung fehlt | `state`, `marketStatus`, `expectsUpdates`, `session`, `priceLabel`, `rejected[]` |
| `subscribed` | Anbieter bestätigt das Abo | `tickers[]`, `capability` |
| `tick` | **nur bei einem Abschluss** | `ticker`, `kind: "TRADE"`, `price`, `size`, `at`, `receivedAt`, `latencyMs`, `seq`, `seqForSymbol`, `priceTypeConfirmed: false` |
| `summary` | Fenster zu Ende / Abbau | `updates`, `duplicates`, `quotes`, `perSymbol{}`, `marketStatus`, `expectsUpdates`, `verdict` |

`verdict` ∈ `TICKS_OBSERVED` · `MARKET_CLOSED_NO_TICKS_EXPECTED` ·
`CONNECTED_NO_TICKS` · `NOT_CONNECTED`.

### Was den Preis-Chart bewegt

**Nur Abschlüsse.** Quotes werden gezählt (`summary.quotes`) und belegen
damit, dass der Strom läuft — aber sie erzeugen kein `tick` und bekommen
keinen Kurs.

Die erste Fassung hat ihnen einen gegeben: die Mitte zwischen Geld und
Brief, notfalls selbst gerechnet. Zu diesem Kurs hat nie jemand
gehandelt. Er wäre in dieselbe Kerze geflossen wie echte Abschlüsse, und
hinterher hätte das niemand mehr auseinandersortieren können. `RS8b`
misst das an der Wirkung: zwei Quotes und ein Abschluss ergeben genau
ein Kursereignis.

### Abonnement-Lebenszyklus

Das Abo wird **bei Bedarf** geöffnet — beim Klick auf `1T`/`5T`, nicht
beim Laden der Aktienseite. Es endet über zehn Pfade im Browser
(Zeitraumwechsel, neue Auswahl, `pagehide`, `visibilitychange`,
Anbieterfehler, Fensterende, Neustart, Fehlerfall) und sechs im Server
(`req.on("close")`, `req.on("aborted")`, Fensterablauf, Socketfehler,
Socketschluss, Anbieterabweisung). `stromStarten()` beendet immer zuerst
die laufende Verbindung — nie zwei für denselben Titel.

---

## 4. Der gemeinsame Hauptchart

Die Zeitraumleiste steht bereits vollständig in
`quant/engines/chart-ranges.js` und entspricht dem Ziel eins zu eins:

| Zeitraum | Quelle | Status |
| --- | --- | --- |
| `1T` `5T` | Intraday + Realtime | **angeschlossen** |
| `1M` `3M` `6M` `YTD` `1J` `3J` `5J` `10J` `MAX` | EOD aus der Auslieferung | steht; **R2 ist noch nicht angebunden** |

Das Frontend baut **keinen** zweiten Chart. Die Brücke
(`vu2-bridge/experience.js`) fängt nur `1D`/`5D` ab und zeichnet in
denselben Host, über dieselbe `VUChartRanges.selectRange()`. Alle
anderen Zeiträume fallen unverändert an den eingebauten Zeichner durch.

Achse und Werte sind **absolute Kurse in Dollar** — keine ±-Delta-Skala.
Ein Tick setzt `letzte.close = tick.price`; es wird nichts zwischen zwei
Kurse gerechnet.

---

## 5. Zustände, die auseinandergehalten werden

Diese Unterscheidungen sind der Grund, warum es so viele Namen gibt —
sie führen zu verschiedenen nächsten Schritten und dürfen nicht
zusammengefasst werden:

| nicht dasselbe wie | |
| --- | --- |
| `MARKET_CLOSED` | `REALTIME_UNAVAILABLE` |
| `INTRADAY_UNAVAILABLE` | `HISTORICAL_UNAVAILABLE` |
| `TECHNICAL_INSUFFICIENT_HISTORY` | `CHART_UNAVAILABLE` |

Im Code: `Scope.verdictFor()` trennt „geschlossen" von „nicht
verbunden"; `chart-ranges.js` trennt `noIntradayData` von `noData`;
`market-factors.js` führt `INSUFFICIENT_HISTORY` als Feldstatus, der
einzelne Kennzahlen leer lässt, ohne den Chart zu unterdrücken.

**Vollständiges Vokabular:** `INTRADAY_AVAILABLE` ·
`INTRADAY_UNAVAILABLE` · `PROVIDER_UNAVAILABLE` · `REALTIME_AVAILABLE` ·
`MARKET_CLOSED` · `SYMBOL_NOT_SUPPORTED` · `NOT_ELIGIBLE` ·
`NOT_CONFIGURED` · `SCOPE_UNREADABLE` · `INVALID_IDENTITY` ·
`INVALID_FREQUENCY` · `CONNECTION_LIMIT`.

---

## 6. Kursbezeichnung

Der Anbieter nennt die Kursart nicht (`priceType` bleibt
`UNSPECIFIED`). Bis zu seiner Bestätigung steht nirgends *Last Trade*,
*offizieller letzter Handel*, *Bid*, *Ask*, *Mid* oder *NBBO*.

Neutral: **„Kursaktualisierung"**. Die Bezeichnung steht in
`quant/config/realtime-preview-scope.json` → `priceSemantics.label`,
damit sie an einer Stelle geändert wird und nicht an dreien. Jede
Nachricht trägt `priceTypeConfirmed: false`.

---

## 7. Sicherheit

| Regel | Wo sie gehalten wird |
| --- | --- |
| Kein Tiingo-Key im Client | eine einzige Lesestelle: `Scope.schluessel()` in `api/_scope.js` |
| Keine direkte Browser-Verbindung zu Tiingo | Browser ruft nur `/api/intraday/` und `/api/realtime/` |
| Keine Credentials in URL/JS/HTML/Source Maps | `RS3`, `OP3`, `O9`; keine `.map`-Dateien im ausgelieferten Baum |
| Providerzugriff nur im Backend | die Anbieteradresse steht in keiner browserseitigen Datei und in keinem SSE-Feld |

---

## 8. Was noch offen ist

**Tick-Evidenz während einer aktiven US-Handelssitzung.** Verbindung und
Abonnement sind nachgewiesen (`CONNECTED` + `SUBSCRIBED`, mehrfach, über
mehrere Verbindungen). Was am Wochenende nicht zu messen war:

```
OBSERVED_TICK_COUNT  > 0
VISIBLE_PRICE_UPDATED = true
ACTIVE_BAR_UPDATED    = true
```

Der Lauf dafür steht fertig bereit:

```
node scripts/proof/measure-symbol-matrix.mjs --base <preview-url>
node scripts/proof/measure-live-chart.mjs --window-ms 75000
```

Nächste Sitzung: Montag 2026-09-14, 08:00 UTC (vorbörslich) bzw.
13:30 UTC (regulär). Null Ticks außerhalb der Handelszeit ist per
Definition `WAIT_FOR_ACTIVE_SESSION` — kein Fehlschlag, und ausdrücklich
kein Anlass, einen Tick zu simulieren.

**Nicht Teil dieser Infrastruktur:** die R2-Historienanbindung für die
großen Zeiträume. Sie war in diesem Workstream außerhalb des Umfangs;
die Zeiträume zeichnen derzeit aus der ausgelieferten EOD-Reihe.
