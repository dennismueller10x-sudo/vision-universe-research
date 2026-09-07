# VU BACKTEST METHODOLOGY

Konfiguration: `quant/methodology/backtest-v1.json` · Engine `vu-backtest-engine-1.0.0`
Implementierung: `quant/engines/backtest.js`

## Die eine Regel

> Der Backtest simuliert ausschliesslich den Informationsstand, den ein Investor an jedem
> historischen Tag tatsaechlich haette besitzen koennen.

Eine 20 Jahre steil steigende Equity Curve ist trivial zu erzeugen, wenn versehentlich
zukuenftige Information einfliesst. Deshalb ist Integritaet in dieser Engine keine
Option, sondern Konstruktionsprinzip.

## Ablauf je Rebalancing-Termin

```
Entscheidungszeitpunkt = Schluss von T
   |
   v
historisches Universum zu T   getSecurities({asOf: T}) — inkl. spaeter delisteter Titel
   |
   v
Point-in-Time-Fundamentals    getFactPanel({asOf: T}) — nur availableAt <= T
   |
   v
Faktoren + Scores             dieselben Engines wie die heutige Anzeige
   |
   v
Strategiefilter               dieselbe Query Engine wie der Screener
   |
   v
Ranking nach Faktorgewichten
   |
   v
Portfoliokonstruktion         Gewichtung, Positions- und Sektorgrenzen
   |
   v
Ausfuehrung zu T+1            naechste Eroeffnung oder naechster Schluss
   |
   v
Transaktionskosten + Slippage
   |
   v
halten bis zum naechsten Termin
```

## Wie die klassischen Fehler verhindert werden

| Fehler | Massnahme |
|---|---|
| Survivorship Bias | Universum je Stichtag aus dem historischen Security Master; delistete Titel bleiben enthalten |
| Look-Ahead Bias | `availableAt <= decisionTime`, ohne abschaltbaren Parameter |
| Point-in-Time-Fehler | Original und Korrektur als getrennte Revisionen mit eigenem `availableAt` |
| Delisting Bias | Positionen werden zum letzten verfuegbaren Kurs glattgestellt, der Erloes bleibt im Portfolio |
| Index Constituency Bias | `UniverseMembership` mit `validFrom` / `validTo` |
| Corporate Action Error | Renditen auf `adjustedClose`, Splits und Dividenden separat im Ledger |
| Execution Bias | Signal von T handelt fruehestens zu T+1 |
| Transaction Cost Bias | Kosten und Slippage je Order, auf Kauf **und** Verkauf |
| Liquidity Bias | Mindestliquiditaet als **Filter**, nicht als nachtraegliche Korrektur |
| Overfitting | Teilperioden verpflichtend; Trust Score deckelt optimierte Strategien ohne Out-of-Sample |

## Rebalancing

Erlaubt sind `monthly` und `quarterly`. Taegliches oder woechentliches Umschichten ist in
V1 bewusst nicht erlaubt: bei Fundamentalstrategien erzeugt es vor allem Kosten und
Overfitting-Spielraum.

Termine sind die jeweils letzten Handelstage. Ein Termin, dessen Ausfuehrung ausserhalb
des Testzeitraums laege, wird **uebersprungen** — ein Rebalancing ohne moegliche
Ausfuehrung waere ein Look-Ahead-Artefakt.

## Ausfuehrung

| Modus | Preis |
|---|---|
| `next_open` (Standard) | interpolierte Eroeffnung von T+1 |
| `next_close` | Schlusskurs von T+1 |

Gerechnet wird auf der total-return-adjustierten Reihe. Der Eroeffnungskurs des
Mock-Datensatzes ist eine deterministische Interpolation zwischen Vortages- und
Tagesschluss; ein echter Intraday-Verlauf wird nicht modelliert und fuer daily-Strategien
auch nicht benoetigt.

## Portfoliokonstruktion

Gewichtung: `equal`, `score` (proportional zum Rankingscore), `volatility` (proportional
zu 1/Volatilitaet; fehlende Volatilitaet erhaelt den Median, damit eine fehlende Kennzahl
nicht zu einem Extremgewicht fuehrt).

Anschliessend iterativ: Positionsgrenze kappen und Ueberhang umverteilen, danach
Sektorgrenze kappen und umverteilen. Beide Grenzen werden ueber alle Rebalancing-Termine
als Test geprueft.

Standardwerte: max. 8 % je Position, max. 30 % je Sektor, min. 5 Mio. USD Tagesvolumen,
min. 300 Mio. USD Marktkapitalisierung, 5 bps Transaktionskosten, 5 bps Slippage.

## Kennzahlen

CAGR · Gesamtrendite · Benchmark-CAGR und -Gesamtrendite · Excess Return · Volatilitaet ·
maximaler Drawdown · Sharpe · Sortino · Calmar · bestes und schlechtestes Jahr ·
Erholungsdauer · Jahresrenditen · Turnover (einseitig, p. a.) · Trefferquote ·
durchschnittliche Positionszahl · Transaktionskosten gesamt · Drawdown-Reihe.

Risikofreier Zins: 2,0 % p. a. (zentral konfiguriert).

Die Erholungsdauer ist `null`, wenn der Drawdown bis zum Ende nicht aufgeholt wurde —
nicht 0.

## Benchmark

`VUBM_EW`: gleichgewichteter Index aller zum jeweiligen Tag gelisteten Mock-Securities,
**inklusive spaeter delisteter Titel**. Ein Benchmark aus heutigen Ueberlebenden waere
selbst survivorship-biased.

## Reproduzierbarkeit

```
reproductionHash = hash(
  strategyVersionHash, dataSnapshotId, engineVersion,
  methodologyVersion, quantMethodologyVersion,
  executionAssumptions, period, rebalance
)
```

Bewusst **nicht** aus dem Ergebnis abgeleitet — sonst waere er eine Pruefsumme statt eines
Reproduktionsschluessels. Gleiche Eingaben ergeben denselben Hash und dasselbe Ergebnis;
das wird als Test geprueft.

## Grenzen

- Long only, keine Leerverkaeufe, kein Hebel, keine Derivate.
- Keine Steuern; Ergebnisse sind Brutto-Renditen nach Handelskosten.
- Kein Intraday, keine Orderbuchsimulation, kein Market Impact ueber die Slippage hinaus.
- Datenbestand ab 2006-01-02. Ein frueheres Startdatum wird **abgelehnt**, nicht
  stillschweigend verschoben.
- Deflated Sharpe Ratio und Probability of Backtest Overfitting sind nicht implementiert;
  der Trust Score vergibt fuer diesen Block null Punkte, statt die Luecke zu ueberspringen.
