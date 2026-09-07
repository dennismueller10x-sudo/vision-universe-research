# VU PROVIDER ARCHITECTURE

Implementierung: `quant/engines/provider.js` · Adapter: `quant/engines/mock-provider.js`

## Grundsatz

> Vision Universe besitzt sein eigenes kanonisches Financial Data Model.
> Ein Adapter ist der einzige Ort, an dem ein Vendor-Payload vorkommen darf.

```
Vendor-Payload
   -> Provider-Adapter        einziger Ort mit Vendor-Kenntnis
   -> Validierung
   -> Kanonisches Schema
   -> Domain Engine
   -> Product API
   -> UI
```

Das verbotene Muster:

```js
stock.price = twelveDataResponse.data.someVendorSpecificField   // niemals oberhalb des Adapters
```

`Provider.findVendorLeakage()` sucht Vendor-Marker in Objekt-Keys; ein Acceptance-Test
scannt zusaetzlich den Quelltext von Product Layer und UI auf Vendor-Feldzugriffe.

## Sieben Interfaces

| Interface | Methoden |
|---|---|
| `ReferenceDataProvider` | `getSecurities`, `getSecurity`, `getExchanges`, `getUniverse`, `getUniverseMembership`, `healthCheck` |
| `MarketDataProvider` | `getPriceBars`, `getLatestPrice`, `getBenchmarkBars`, `getPricePanel`, `healthCheck` |
| `FundamentalDataProvider` | `getFacts`, `getFilings`, `getFactPanel`, `healthCheck` |
| `EstimateDataProvider` | `getEstimates`, `getRevisionHistory`, `healthCheck` |
| `CorporateActionsProvider` | `getCorporateActions`, `healthCheck` |
| `MacroDataProvider` | `getIndicator`, `getIndicators`, `healthCheck` |
| `NewsDataProvider` | `getNews`, `healthCheck` |

`getPricePanel` und `getFactPanel` sind Bulk-Varianten. Cross-Sectional-Quant ueber 500
Titel und 20 Jahre laesst sich nicht ueber Einzelabrufe bedienen; echte Anbieter stellen
dafuer ebenfalls Bulk-/Parquet-Zugriffe bereit. Die Bulk-Methoden unterliegen exakt
denselben Point-in-Time-Regeln.

## Vertragspruefung zur Laufzeit

`registry.register(iface, impl)` akzeptiert nur Objekte, die **alle** Methoden ihres
Interfaces implementieren. Ein unvollstaendiger Adapter scheitert bei der Registrierung,
nicht spaeter bei einem Aufruf mitten in einem Backtest.

## Ergebnis-Huelle

```js
Provider.ok(data, provenance)         // { available: true,  data, provenance, reason: null }
Provider.unavailable(reason)          // { available: false, data: null, reason }
```

Fehlende Daten kommen als `unavailable` **mit Begruendung** zurueck, nie als erfundener
Wert und nie als stilles `null`, das weiter oben zu 0 wird.

In V1 sind das `EstimateDataProvider`, `MacroDataProvider` und `NewsDataProvider`. Ihre
Begruendungen erscheinen sichtbar in der Oberflaeche.

## Point-in-Time als Vertragsbestandteil

`getFacts()` und `getFactPanel()` liefern ohne `asOf` den heutigen Stand, mit `asOf`
ausschliesslich das, was zu diesem Zeitpunkt verfuegbar war. Es gibt **keinen Parameter,
der diese Regel abschaltet** — der einzige Effekt waere Look-Ahead Bias.

Auch Corporate Actions unterliegen ihr: eine erst 2020 angekuendigte Massnahme war 2019
nicht bekannt.

## Provider-Gesundheit

`healthCheck()` liefert `ok` / `degraded` / `unavailable` / `not_configured` mit
Zeitstempel und Faehigkeiten. Ein Ausfall wird angezeigt, nicht ueberdeckt.

## Adapter anschliessen

1. `providers/<vendor>/README.md` ausfuellen: Zweck, Daten, ENV-Variablen, Mapping,
   Lizenz- und PIT-Pruefpunkte.
2. Adapter schreiben, der die Interfaces implementiert und **nur dort** Vendor-Felder kennt.
3. `Provider.registry.registerAll(adapter)` — die Vertragspruefung greift.
4. Tests laufen unveraendert: sie pruefen Verhalten gegen das kanonische Modell, nicht
   gegen den Mock.

Keine Zeile in Quant Engine, Screener, Backtester, AI oder UI aendert sich dabei.

## Data Quality Registry (vorbereitet, nicht implementiert)

Mehrere Provider zu besitzen heisst nicht „Provider A fehlt, dann nimm B“ — Finanzdaten
unterscheiden sich in ihren Definitionen. Vorgesehen ist je Kennzahl: primaerer Anbieter,
Fallback, Definitionsversion, Waehrungsregel, Frische-Limit, Toleranz und
Konfliktrichtlinie. Eine Abweichung ueber der Toleranz gehoert in Quarantaene, nicht
stillschweigend in die Historie. Ein Providerwechsel darf einen historischen Faktor nicht
unbemerkt veraendern.

## Lizenzen

Ein API-Key ist keine Erlaubnis zur Anzeige. Details in `VU_API_INTEGRATION_GUIDE.md`.
