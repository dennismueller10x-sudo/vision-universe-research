# Vision Universe® — Market Data Infrastructure Contract

**Stand:** 2026-09-12 · **Engine:** `market-data-contract-1.0.0`
**Gilt fuer:** jedes gegenwaertige und kuenftige Vision-Universe-Frontend

Historical, Intraday und Realtime sind **eine** Infrastruktur. Dieses
Dokument ist ihr Vertrag. Wer ein Frontend baut, konsumiert ihn — und
baut nichts davon neu.

---

## 1. Was ein Frontend NICHT bauen darf

| Nicht neu bauen | Sondern benutzen |
|---|---|
| eigener Historical Store | `/api/history` → Cloudflare R2 |
| eigener Live-Provider | `/api/intraday` → Tiingo |
| eigener Realtime Relay | `/api/realtime` → Tiingo (SSE) |
| eigene Symbol-Whitelist | `quant/data/proof/product-tickers.json` |
| eigene Eligibility-Logik | `security-master` + `eligibility.json` |
| eigene Zustandsnamen | `quant/engines/market-data-contract.js` |
| eigene Tick→Kerzen-Faltung | `quant/engines/realtime/bar-merge.js` |

Unterschiedlich duerfen sein: **UI und Experience**. Die
Dateninfrastruktur bleibt gemeinsam.

## 2. Zugriffswege

```
Browser → VU Backend → /api/history   → Cloudflare R2      (Tagesschluss)
Browser → VU Backend → /api/intraday  → api.tiingo.com     (1T, 5T)
Browser → VU Relay   → /api/realtime  → wss://api.tiingo.com/iex
```

Der Browser verbindet sich **nie** direkt mit R2 oder Tiingo. Es gibt
**keine** Provider-Credentials in JavaScript, HTML, URLs, Logs oder
Source Maps. `MD32` und `CH1`/`CH2` pruefen das am Quelltext jeder Datei,
die der Browser laedt; `H5` prueft es an den Live-Antworten.

Ein Chart-Load aus R2 erzeugt **0** Tiingo-Requests
(`providerRequests: 0` in jeder Antwort).

## 3. Umfang

**7.004 Product Titles.** Dieselbe Menge fuer Historical, Intraday und
Realtime — zwei verschiedene Titelmengen waeren zwei Infrastrukturen.

Keine Golden-Five-Beschraenkung, keine AAPL-Sonderlogik. Die Liste steht
in `quant/data/proof/product-tickers.json` und entsteht im Bau aus der
Eignungsschicht. Ist sie nicht lesbar, faellt jede Funktion auf die
**engere** Freigabe zurueck — nie auf eine weitere.

## 4. Der Zustandsvertrag

Zehn Zustaende, geschlossen. `quant/engines/market-data-contract.js`,
Feld `contractState` in jeder Antwort.

| Achse | Zustaende |
|---|---|
| Berechtigung | `NOT_ELIGIBLE` · `SYMBOL_NOT_SUPPORTED` |
| Historical | `HISTORICAL_AVAILABLE` · `HISTORICAL_UNAVAILABLE` |
| Intraday | `INTRADAY_AVAILABLE` · `INTRADAY_UNAVAILABLE` |
| Realtime | `REALTIME_AVAILABLE` · `REALTIME_UNAVAILABLE` · `MARKET_CLOSED` |
| Anbieter | `PROVIDER_UNAVAILABLE` |

Sie sind **keine Rangfolge**. `HISTORICAL_AVAILABLE` und
`REALTIME_UNAVAILABLE` zugleich ist der Normalfall.

### 4.1 `MARKET_CLOSED` ≠ `REALTIME_UNAVAILABLE`

Nachts kommen keine Kurse, und das ist kein Fehler.

| Handel | Verbindung | Zustand |
|---|---|---|
| zu | steht | `MARKET_CLOSED` |
| zu | steht nicht | `MARKET_CLOSED` |
| laeuft | steht | `REALTIME_AVAILABLE` |
| laeuft | steht nicht | `REALTIME_UNAVAILABLE` |
| unbekannt | steht nicht | `REALTIME_UNAVAILABLE` |

Die letzte Zeile ist Absicht: eine unbekannte Boersenlage darf keinen
Ausfall verstecken (`MD10b`).

### 4.2 `TECHNICAL_INSUFFICIENT_HISTORY` ≠ `HISTORICAL_UNAVAILABLE`

`MTNE` hat 57 Handelstage. Der Chart zeichnet sie (ab **2** Bars), die
Technik rechnet nicht (ab **300**). Beides ist wahr.

```
HISTORICAL_AVAILABLE            + TECHNICAL_INSUFFICIENT_HISTORY
```

Die Technikeignung ist **kein** Datenzustand, sondern eine eigene Achse
(`technicalHistory()`). Sie nie als `HISTORICAL_UNAVAILABLE` zu
verkleiden ist der ganze Punkt: sonst verschweigt die Oberflaeche genau
die Daten, die dastehen.

Ebenso: ein nicht erreichbarer Speicher ist `PROVIDER_UNAVAILABLE`, nicht
`HISTORICAL_UNAVAILABLE` — die Reihe ist da, der Weg nicht (`MD13`).

## 5. Der Chart-Vertrag

Ein Hauptchart. Keine getrennten Historical-/Intraday-Charts.

| Zeitraum | Quelle |
|---|---|
| `1T`, `5T` | Intraday + Realtime |
| `1M` `3M` `6M` `YTD` `1J` `3J` `5J` `10J` `MAX` | Historical aus R2 |

Absolute Kurse, keine Delta-Darstellung. Ein Zeitraum, den die Reihe
nicht hergibt, wird **abgeblendet mit Grund** — nicht entfernt.

### 5.1 Was Realtime bewegen darf

Realtime aktualisiert **letzten Kurs, letzten Punkt, aktive Kerze**.

> **Nur ausgefuehrte Handel bewegen den Preis-Chart.**
> Eine Quote-Mitte ist ein *Angebot*, kein Kurs. Sie als Kurspunkt zu
> zeichnen behauptet einen Handel, den es nicht gegeben hat.

Der Relay liefert `kind: "TRADE"` oder `kind: "QUOTE"`. Nur `TRADE`
erreicht die Reihe (`MD20`); die Quote steht in der Statuszeile,
ausdruecklich als Quote-Mitte beschriftet.

Die Faltung macht `bar-merge.js#applyTick`: der erste Abschluss einer
Periode eroeffnet ihre Kerze, jeder weitere faltet hinein — high/low/
close/Volumen der **laufenden** Kerze, und niemals eine bereits
abgeschlossene (`MD21`). Faellt die Engine aus, **steht der Chart**
statt selbst zu falten (`MD22`): zwei Fassungen derselben Regel waeren
schlimmer als keine Bewegung.

### 5.2 Kursart

Die Beschriftung bleibt **"Kursaktualisierung"**. Der Anbieter meldet
`UNSPECIFIED`; solange das so ist, wird kein "letzter Handelskurs" und
kein anderer Kurstyp behauptet. `priceTypeConfirmed: false` steht in
jeder Antwort.

## 6. Realtime-Subscription

**On demand.** Es werden nicht 7.004 Titel gestreamt — die Subscription
wird geoeffnet, wenn ein Titel tatsaechlich live gebraucht wird, und
umfasst hoechstens fuenf Ticker je Verbindung.

`thresholdLevel` wird **nicht** gesendet. Der Anbieter hat sowohl `5`
als auch `0` mit *"thresholdLevel not valid for your subscription tier"*
abgewiesen; wer eine Stufe nennt, die sein Tarif nicht kennt, wird
abgewiesen. Der Anbieter setzt die Stufe des Kontos (`MD30`).

Der Provider-Key bleibt ausschliesslich serverseitig.

## 7. Antwortform

```jsonc
{
  "state":         "AVAILABLE",        // endpunktnah, gewachsen
  "contractState": "HISTORICAL_AVAILABLE",  // der gemeinsame Wortschatz
  "marketSession": { "phase": "REGULAR", "tradingOpen": true },
  "priceTypeConfirmed": false,
  "providerRequests": 0
}
```

Frontends lesen **`contractState`**. `state` bleibt fuer
endpunktspezifische Diagnose erhalten.

## 8. Nachweise

| Prueflauf | Umfang |
|---|---|
| `market-data-contract.test.mjs` (MD01–MD33) | 16/16 |
| `r2-chart-integration.test.mjs` (CH1–CH13) | 13/13 |
| `verify-history-endpoint.mjs` (H1–H8, echtes R2) | 26/26, `R2_READ_STATUS: OK` |
| `verify-owner-preview.mjs` (O1–O10, Browser 1440 + 390 px) | am ausgelieferten System |

Gesamtsuite: 943 Tests, 941 bestanden. Die beiden Roten sind `PD8`/`PP5`
— vorbestehend, am unveraenderten Vorschauzweig nachgerechnet.
