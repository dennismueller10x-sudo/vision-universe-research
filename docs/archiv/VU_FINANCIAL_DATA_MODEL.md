# VU FINANCIAL DATA MODEL

Definiert in `quant/engines/schema.js`. Jede Entitaet hat eine deklarative
Feldspezifikation und einen Laufzeitvalidator. Ohne Build-Step gibt es kein TypeScript —
an den Systemgrenzen (Provider-Ingest, Query- und Strategy-Eingaben) ist eine
Laufzeitpruefung ohnehin belastbarer als reine Compile-Zeit-Typen.

## Grundsatz

> Vision Universe besitzt sein eigenes kanonisches Financial Schema.
> Kein Vendor besitzt die interne Architektur.

Oberhalb der Provider-Adapter existieren ausschliesslich diese Entitaeten. Der Validator
lehnt **unbekannte Felder** ausdruecklich ab — so schleichen sich vendor-spezifische
Felder nicht unbemerkt ins Modell.

## Entitaeten

**Reference Data** — `Security`, `SecurityIdentifier`, `Exchange`, `Sector`, `Industry`
**Market Data** — `PriceBar`, `CorporateAction`
**Fundamentals** — `Filing`, `FundamentalFact`, `EstimateSnapshot`
**Quant** — `FactorDefinition`, `FactorSnapshot`, `QuantScoreSnapshot`
**Universe** — `Universe`, `UniverseMembership`
**Strategy** — `StrategyDefinition`, `StrategyVersion`
**Backtest** — `BacktestRun`, `BacktestPosition`, `BacktestTrade`, `BacktestMetric`
**Portfolio** — `Portfolio`, `PortfolioHolding`, `Watchlist`, `IntelligenceEvent`
**Provenance** — `DataSource`, `DataProvenance`

## Die Zeitdimensionen sind der Kern des Modells

`FundamentalFact` traegt fuenf verschiedene Zeitpunkte. Das ist kein Ueberbau, sondern
die Voraussetzung dafuer, dass ein Backtest ueberhaupt etwas wert ist:

| Feld | Bedeutung |
|---|---|
| `periodEnd` | Ende der Berichtsperiode (31.03.2018) |
| `reportedAt` | Veroeffentlichung durch das Unternehmen (02.05.2018) |
| `filedAt` | Einreichung des Filings (04.05.2018) |
| **`availableAt`** | **ab wann Vision Universe den Wert nutzen darf (05.05.2018)** |
| `ingestedAt` | wann Vision Universe den Datensatz aufgenommen hat |

Dazu `revisionId` (0 = Original, 1..n = Korrekturen) und `restatementStatus`
(`original` / `restated` / `preliminary`).

Der Backtest fragt deshalb nie:

```
Umsatz Q1 2018
```

sondern:

```
letzter bekannter Umsatz fuer Q1 2018, Stand 2018-05-07
```

## Der einzige Zugriffsweg

```js
Schema.latestKnownFact(facts, metricId, decisionDate, opts)
Schema.latestKnownSeries(facts, metricId, decisionDate, count)
Schema.latestKnownPeriods(periods, decisionDate, count)   // Bulk-Variante
```

Regel: `availableAt <= decisionDate`. Unter mehreren zulaessigen Revisionen gewinnt die
zuletzt verfuegbar gewordene; bei gleichem `availableAt` die hoehere `revisionId`.

Es gibt **keinen Parameter, der diese Filterung abschaltet**. Ein `pointInTime: false`
haette genau einen Effekt — Look-Ahead Bias — und existiert deshalb nicht.

## Bulk-Repraesentation

`FundamentalPeriod` kodiert mehrere Facts derselben Periode und Revision kompakt.
500 Titel × 80 Quartale × 15 Kennzahlen sind 600.000 Einzelobjekte, und
Cross-Sectional-Quant braucht sie am Stueck. `Schema.expandPeriodToFacts()` beweist die
Aequivalenz zur kanonischen Form und wird genau dafuer getestet.

## Preise

`PriceBar` traegt sowohl `close` (unbereinigter Handelskurs, das was ein Anleger gesehen
haette) als auch `adjustedClose` (total-return-bereinigt um Splits und Dividenden).
Renditerechnungen laufen ausnahmslos auf `adjustedClose`, die Anzeige auf `close`.

## Historische Universumszugehoerigkeit

`UniverseMembership` mit `validFrom` / `validTo` / `exitReason`. `Schema.wasListed()`
beantwortet, ob ein Titel an einem Stichtag handelbar war. Ohne diese Entitaet waere
jeder Backtest survivorship-biased — er wuerde ein Universum aus heutigen Ueberlebenden
testen.

## Provenance

Jede Provider-Antwort traegt eine `DataProvenance`:
`provider`, `source`, `asOf`, `availableAt`, `ingestedAt`, `methodologyVersion`,
`dataSnapshotId`, `isMock`.

Jeder Score traegt zusaetzlich `methodologyVersion`, `coverage`, `confidence` und
`dataSnapshotId`. Damit ist jede angezeigte Zahl bis auf Quelle, Zeitpunkt und Methode
zurueckfuehrbar.
