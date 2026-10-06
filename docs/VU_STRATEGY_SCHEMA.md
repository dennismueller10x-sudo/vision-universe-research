# VU STRATEGY SCHEMA

Implementierung: `quant/engines/strategy.js` · Schema-Version `1.0`

## Grundsatz

Eine Strategie ist eine **vollstaendige, versionierte, unveraenderliche Regelbeschreibung**.
Der manuelle Strategy Builder und die AI erzeugen exakt dasselbe Objekt und benutzen
denselben Validator — es gibt nur eine Strategy Engine.

`POST /v1/backtests` akzeptiert **niemals natuerliche Sprache**, sondern ausschliesslich
ein Objekt, das die Validierung bestanden hat.

## Aufbau

```json
{
  "schemaVersion": "1.0",
  "universe":  { "universeId": "US_EQUITIES", "region": "US", "assetType": "equity" },
  "filters":   [ { "field": "roic", "operator": "gte", "value": 10, "scale": "raw" } ],
  "ranking":   { "factors": [ { "factor": "quality", "weight": 0.5 },
                              { "factor": "momentum", "weight": 0.5 } ] },
  "portfolio": { "positions": 25, "weighting": "equal",
                 "maxPositionWeight": 0.06, "maxSectorWeight": 0.30,
                 "minDollarVolumeM": 5, "minMarketCapM": 1000 },
  "rebalance": "monthly",
  "execution": { "timing": "next_open", "transactionCostsBps": 5, "slippageBps": 5 }
}
```

`filters` verwendet **exakt dieselbe Struktur wie der Screener** und wird ueber denselben
Validator geprueft. Eine Uebersetzung zwischen Screener- und Strategiefiltern gibt es
nicht — sie waere die wahrscheinlichste Quelle dafuer, dass Screener-Ergebnis und
Backtest-Universum auseinanderlaufen.

## Validierung

- `ranking.factors`: Gewichte summieren auf 1,0; keine Dubletten; nur verfuegbare Faktoren.
  `revisions` wird mit Begruendung abgelehnt, solange keine PIT-Estimates lizenziert sind.
- `portfolio`: 5–200 Positionen; `positions × maxPositionWeight ≥ 1` (sonst waere das
  Portfolio nicht voll investierbar); `maxSectorWeight ≥ maxPositionWeight`.
- `rebalance`: `monthly` oder `quarterly`.
- `execution`: erlaubte Zeitpunkte, Kosten und Slippage innerhalb der Grenzen.
- **Unbekannte Top-Level-Felder werden abgelehnt** — sonst wandern still Vendor- oder
  Ad-hoc-Felder in gespeicherte Strategien.

Warnung (kein Fehler) bei Kosten **und** Slippage von 0: das ueberzeichnet realistische
Ergebnisse und wird zusaetzlich vom Trust Score bestraft.

## Versionierung

Strategien sind unveraenderlich. Eine Aenderung ueberschreibt V1 nicht, sie erzeugt V2:

```
StrategyVersion {
  strategyId, version, parentVersion, changeReason,
  createdAt, definitionHash, definition
}
```

- Eine **identische** neue Version wird abgelehnt.
- Eine Version **ohne Begruendung** wird abgelehnt — sonst laesst sich spaeter nicht
  nachvollziehen, warum sie existiert.
- `definitionHash` ist stabil gegenueber der Feldreihenfolge (kanonische Serialisierung).

## Lineage

`parentVersion` erlaubt Verzweigungen, nicht nur eine Kette:

```
V1  Basis
├── V2  Defensiver          (Parent V1)
├── V3  Mehr Wachstum       (Parent V1)
└── V4  Weniger Turnover    (Parent V2)
```

`Strategy.lineage()` liefert den Baum, `Strategy.diff()` benennt die exakten
Feldaenderungen zwischen zwei Versionen.

## Bibliotheksstrategien (V1)

Definiert in `quant/methodology/strategies-v1.json`, jede mit Thesis und benanntem
Hauptrisiko:

| Strategie | Ranking | Positionen | Rebalancing |
|---|---|---:|---|
| VU Quality Compounders | Quality 70 · Growth 30 | 30 | quartalsweise |
| VU Momentum Leaders | Momentum 100 | 25 | monatlich |
| VU Quality Momentum | Quality 50 · Momentum 50 | 25 | monatlich |
| VU GARP | Growth 40 · Quality 35 · Value 25 | 30 | quartalsweise |
| VU Future Leaders | Growth 45 · Momentum 35 · Quality 20 | 20 | monatlich |

## Persistenz

Eigene Strategien liegen im `localStorage` des Browsers (`vu.quant.strategies.v1`).
Es gibt in V1 kein Nutzerkonto — das ist ein bewusster Scope-Schnitt, kein Versehen.
