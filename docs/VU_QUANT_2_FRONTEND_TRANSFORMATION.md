# Vision Universe® Quant — Frontend-Transformation

Arbeitsdokument. Es wächst mit dem Umbau und hält fest, was **gemessen** wurde,
bevor gebaut wurde — und was die Messung gegen den Entwurf entschieden hat.

Stand: 2026-09-28 · Basis: `2d050f8003` (main nach dem Public-Beta-Launch)

---

## 1. Capability Map — was es gibt, bevor etwas umgezogen wird

Regel des Auftrags: *Redesign bedeutet bessere Nutzung und Erklärung, nicht
Entfernen.* Diese Tabelle ist der Vertrag dafür. Jede Zeile muss nach dem Umbau
erreichbar bleiben, auch wenn sie nicht mehr in der Hauptnavigation steht.

| Route | Seitenfunktion | Dienste (`api.*`) | Nach dem Umbau |
|---|---|---|---|
| `home` | `homePage` | `getHomeIntelligence`, `getMarketRegime`, `getMarketSession` | **HOME** (neu gebaut) |
| `screener` | `screenPage` | `screen`, `getRecipes`, `getStrategyProfiles`, `getUniverse` | **SCREENER** (Einfach/Profi) |
| `strategies` | `strategyPage` | `getStrategyContext`, `getStrategyIndex`, `screen` | **STRATEGIEN** |
| `stocks` | inline | `getUniverse` | **AKTIEN** (Einstieg zur Einzelanalyse) |
| `stock` | `stockPage` | `getStockIntelligence`, `getIntelligenceBrief`, `getFactorEvidenceScreening`, `getHistoricalFundamentals`, `getHistoricalPriceHistory`, `getPatternMatch`, `getSetupObservation`, `getSetupScreenIndex`, `getTechnicalIntelligence` | **AKTIENANALYSE** (Herzstück) |
| `quant` | `quantPage` | `getFactorEvidence`, `getIntelligenceBrief`, `getAssignmentChange`, `getSetupScreenIndex`, `getStockIntelligence`, `getStrategyIndex`, `getStrategyProfiles` | bleibt, aus der Aktienseite verlinkt |
| `explain` | `explainPage` | — | **METHODIK** (ausgebaut) |
| `technical` / `elliott` | `technicalWorkspacePage` | `getTechnicalWorkspace` | bleibt, aus der Aktienseite verlinkt |
| `fundamentals` | `fundamentalsPage` | `getHistoricalFundamentals` | bleibt, verlinkt |
| `compare` | `comparePage` | `getComparison` | bleibt, aus Aktien/Screener verlinkt |
| `watchlist` | `watchlistPage` | `getWatchlistIntelligence`, `getAssignmentChange`, `getFactorEvidenceScreening` | bleibt, verlinkt |
| `signals` | `signalsPage` | `getSignals` | bleibt, verlinkt |
| `radar` | `radarPage` | `getRadarIntelligence`, `getMarketRegime`, `getSetupScreenIndex` | bleibt, verlinkt |
| `atlas` | `atlasPage` | — | bleibt, verlinkt |
| `portfolio` | `portfolioPage` | `getPortfolioIntelligence` | bleibt **erreichbar**, ausdrücklich **nicht** in der Navigation |
| `markets` | `marketsPage` | `getMarketIntelligence` | anderes Produkt — nicht in der Quant-Navigation |
| `discover` | `discoverPage` | `getDiscover`, `getSetupScreenIndex` | anderes Produkt — nicht in der Quant-Navigation |
| `research` | inline-Katalog | — | ersetzt durch die neue Informationsarchitektur |

Dienste ohne eigene Seite, die erhalten bleiben müssen: `searchInstruments`
(Suche), `getMarketDataHealth` (Aktualitätszeile), `getIntraday`,
`getRealtimeCapability` (Live-Kurs), `getStrategyMatch`, `getComparison`,
`workspaces`.

---

## 2. Historische Vergleichsfälle — was wirklich geht

Der Auftrag verlangt drei Ebenen. Gemessen, nicht angenommen:

### Ebene 3 — MARKTWEITE MUSTER · **vorhanden und belastbar**

`pattern-match-v1` liefert je Titel die Muster, die **heute** gelten, und je
Muster die Statistik der Grundgesamtheit: `lift`, `asymmetry`, `support`
(z. B. 9.162 Beobachtungen), `outOfSampleLift`, `medianForwardReturn`,
`medianMaxDrawdownWithinHorizon`, dazu `baseRate` und die **gezählten**
zurückgehaltenen Muster (`INSUFFICIENT_SUPPORT`, `NOT_SIGNIFICANT`,
`IN_SAMPLE_ONLY`, `PARAMETER_SENSITIVE`). Der Artefakt-Caveat sagt bereits
genau das Richtige und wird wörtlich übernommen:

> „Diese Zahlen beschreiben eine Grundgesamtheit in der Vergangenheit. Sie
> werden nicht dadurch zu einer Aussage über diesen Titel, dass sie neben
> seinem Namen stehen."

### Ebenen 1 und 2 — TITEL-EIGENE HISTORIE · **rechenbar, aber nur für ein Drittel**

Die Zutaten liegen alle schon da und sind **keine neue Datenquelle und keine
neue Engine**:

- `quant/data/market/discover-series-long/` — 6.334 Titel, **Wochenschluss,
  MAX-Bereich, SPLIT_ADJUSTED**, NVDA bis 1999, AAPL/JPM bis 1990.
- `quant/engines/pattern-research.js` exportiert `featuresAt()` und
  `outcomeAfter()` — dieselbe Funktion, mit der die marktweite Studie gerechnet
  wurde, mit geprüftem Leckage-Vertrag.
- Die 29 Begriffe der Studie lassen sich aus den Findings als Wörterbuch
  ableiten: **14 PRICE** (aus Wochenschlüssen rechenbar) und **15 FUNDAMENTAL**
  (brauchen Point-in-Time-Fundamentaldaten je Woche — die gibt es je Titel
  nicht). Ebene 1/2 bleibt deshalb auf **Preisbedingungen** beschränkt und muss
  das sagen.

Gemessene Abdeckung (Stichprobe 300 Titel, gleichverteilt über das Verzeichnis):

| | Titel | Anteil |
|---|---:|---:|
| gemessen (Langreihe **und** Pattern-Shard vorhanden) | 247 | 82,3 % |
| mit ≥ 1 abgeschlossenem 12-Monats-Fall | 218 | 72,7 % |
| mit ≥ 5 abgeschlossenen 12-Monats-Fällen | 145 | 48,3 % |
| **mit ≥ 10 abgeschlossenen 12-Monats-Fällen** | **101** | **33,7 %** |
| mit ≥ 20 abgeschlossenen 12-Monats-Fällen | 52 | 17,3 % |

### Der Befund, der gegen das Mockup entscheidet

Das Mockup zeigt auf der **NVIDIA**-Seite:
„Ø Performance nach 3 Monaten **+12,8 %**, in **8 von 10** Fällen positiv".

Gemessen an NVIDIAs eigener Historie mit den Preisbedingungen, die heute für
NVDA gelten (`near-52w-high`, `at-all-time-high`, `above-40w-line`,
`trend-stacked`, `quiet-range`):

```
NVDA · 1.445 Wochen (1999–2026) · 7 Treffer → 3 Episoden
         → 1 abgeschlossener 12-Monats-Fall
```

**Ein** Fall. Die Zahl aus dem Mockup ist für genau den Titel, an dem sie
gezeigt wird, nicht belegbar. Sie wird nicht gebaut. Stattdessen greift die
Regel, die der Auftrag selbst vorgibt: *„Zu wenige historische Vergleichsfälle
für eine belastbare Aussage."* — und daneben steht weiterhin die marktweite
Ebene, die für NVDA reich ist (13 robuste Muster gelten).

Weitere gemessene Beispiele (Episoden = zusammenhängende Trefferwochen, zu
einem Fall zusammengefasst):

| Titel | Wochen | Episoden | 3M (n · Median) | 12M (n · Median) |
|---|---:|---:|---|---|
| JPM | 1.917 | 58 | 58 · +3,2 % | 57 · +6,9 % |
| GOOGL | 1.154 | 53 | 52 · +6,5 % | 51 · +24,4 % |
| AAPL | 1.917 | 32 | 31 · +5,5 % | 29 · +13,8 % |
| AACG | 974 | 31 | 30 · +3,9 % | 30 · −1,6 % |
| ACGL | 1.620 | 28 | 27 · +1,5 % | 26 · +22,5 % |
| **MSFT** | 1.917 | **6** | 6 · +1,7 % | 6 · −4,6 % |
| **NVDA** | 1.445 | **3** | 1 · −49,6 % | **1** · −32,6 % |
| **AACI** | 172 | **1** | 1 | 1 |

MSFT zeigt, warum eine reine Zahl ohne Stichprobengröße gefährlich wäre: ein
Median von −4,6 % aus sechs überlappenden Episoden ist keine Eigenschaft von
Microsoft, sondern ein Rauschwert.

### Der Vertrag, der daraus folgt: `historical-cases-1.0.0`

- **Quelle**: die veröffentlichte Wochenreihe des Titels (SPLIT_ADJUSTED, MAX).
- **Rechenweg**: `PatternResearch.featuresAt` / `outcomeAfter`, unverändert.
- **Fall**: eine zusammenhängende Folge von Trefferwochen zählt als **eine**
  Episode. Ohne diese Bündelung stünden bei ACGL 945 „Fälle" statt 28 — eine
  Zahl, die nur Überlappung misst.
- **Mindestmenge**: eine Kennzahl (Median, Positivanteil, Rückschlag) erscheint
  erst ab **10 abgeschlossenen Episoden** im jeweiligen Zeitfenster. Darunter
  wird die Anzahl genannt und ausdrücklich gesagt, dass sie zu klein ist.
- **Kein Einzelfall als Beweis**: der „letzte vergleichbare Fall" erscheint nur
  zusätzlich zur Verteilung, nie allein.
- **Offene Fälle**: Episoden, deren Zeitfenster noch nicht abgelaufen ist,
  werden gezählt und nicht gewertet.
- **Genannte Grenzen**: Wochenraster (Rückschläge innerhalb der Woche sind
  nicht sichtbar), überlappende Zeitfenster, nur Preisbedingungen, und der
  Umstand, dass ein Titel mit langer Historie per Konstruktion einer ist, der
  überlebt hat.
- **Keine Prognose.** Sprachlich: „Historische Vergleichsfälle" und „Was geschah
  danach?" — nie „wird wahrscheinlich".

Das ist **keine neue Quant-Engine**: es ist die veröffentlichte Studienlogik,
auf die eigene Reihe eines Titels angewandt, mit eigener Versionsnummer für die
Darstellungs- und Schwellenregeln.
