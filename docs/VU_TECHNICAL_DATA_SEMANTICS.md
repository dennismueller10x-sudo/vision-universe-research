# VU Technical Data Semantics

**Modul:** `quant/engines/technical/canonical-bars.js`, `timeframe.js` · **Methodik:** `quant/methodology/technical-v1.json` (`priceSeries`, `timeframes`) · Version `canonical-bars-1.0.0`, `tf-agg-1.0.0`

## 1. Drei Kurswelten

| Serie | Inhalt | Technical Intelligence nutzt sie für |
|---|---|---|
| **RAW** | tatsächlich gedruckte Kurse | Corporate-Action-Audit, Execution-Replay, Prüfung „Split ≠ Crash“ |
| **SPLIT_ADJUSTED** | multiplikativ um Splits normiert, Dividenden nicht | **primäre technische Serie**: Pivots, Struktur, S/R, Fibonacci, Elliott, alle Preislevel, Scenarios |
| **TOTAL_RETURN** | Splits + Dividenden reinvestiert | Performance, Total-Return-Momentum, Quant — **nie** für Preislevel |

Der Orchestrator (`technical-analysis.js`) lehnt jede andere Serie als SPLIT_ADJUSTED ab
(`analyze` wirft). Die Semantikstufen und ihre Rechte kommen unverändert aus
`price-semantics.js` / `price-adjustment-v1.json` (Phase 3).

## 2. Ableitung aus dem bestehenden PriceBar

`schema.js` liefert `close` = RAW und `adjustedClose` = TOTAL_RETURN. Die SPLIT_ADJUSTED-Serie
entsteht in `fromPriceBars(bars, corporateActions)`:

```
factor_t   = Π ratio(split)  für alle Splits mit exDate > date_t
price_t'   = price_t / factor_t      (open, high, low, close)
volume_t'  = volume_t × factor_t
flags_t    = ["SPLIT"] am Ex-Tag (bleibt sichtbar), ["DIVIDEND"], …
```

Ein 4:1-Split verschwindet damit aus der Preisgeometrie (Test C2/C3 mit der Mock-Fixture
VUF011), bleibt aber als Corporate-Action-Flag und im `adjustmentFactor` je Bar nachvollziehbar.
TOTAL_RETURN-OHL werden proportional aus `adjustedClose/close` abgeleitet und als
`meta.ohlcDerived = true` markiert.

Deklarierte Fremdreihen (z. B. der Dashboard-Marktdatenbestand) werden über `fromRows(rows,
spec)` importiert; die Stufe wird **deklariert, nie geraten** (`spec.priceSeriesType`).

## 3. CanonicalBar

Pflichtfelder (`BAR_FIELDS`): `instrumentId, exchange, timestamp, timeframe, open, high, low,
close, volume, currency, sessionType, priceSeriesType, source, sourceRevision, adjustmentFactor,
corporateActionFlags, dataVersion`. Serien sind spaltenorientiert (`timestamps[]`, `open[]`, …);
`toBars()` liefert Zeilen. Keine Vendor-Felder außerhalb der Adapter — der bestehende
Vendor-Leakage-Guard gilt unverändert.

## 4. Datenversion und Hash

* `dataHash` = FNV-1a über Spalten + Semantik (hash.js, kanonisches JSON).
* `dataVersion` = `sourceRevision` des Providers oder `dv_<hash>`.
* `slice(series, cutoff)` behält `dataVersion` (gleiche Revision) und berechnet `dataHash` neu →
  Walk-Forward-Analysen tragen `dataCutoff` + `dataVersion` + `dataHash`.
* `revise(series, patches, sourceRevision)` erzeugt eine **neue** `dataVersion`
  (`meta.revisedFrom` zeigt auf die alte). Alte Snapshots bleiben unverändert (siehe
  `VU_TECHNICAL_SNAPSHOT_SPEC.md`).

## 5. Timeframes

Unterstützt: `1m 5m 15m 30m 1h 4h 1D 1W 1M`. **Foundation V1 ist 1D (EOD).**

Aggregation (`timeframe.aggregate`) ist kalenderbewusst:

* `1W`: Bucket = ISO-Woche, Bar-Timestamp = **letzter enthaltener Handelstag** (der Zeitpunkt,
  an dem die Bar bekannt war), nicht der Kalenderfreitag.
* `1M`: Bucket = Kalendermonat, Timestamp = letzter Handelstag des Monats.
* Intraday → Intraday: Session-Policy `XNYS-regular-v1` (09:30–16:00 Exchange-Lokalzeit).
  **4h ist nicht UTC-verankert**: Bars 09:30–13:30 und 13:30–16:00 (Teilbar bis Session-Ende,
  `meta.partialLastBucket`). Pre-/After-Market ist `EXTENDED` und nur auf Wunsch enthalten.
* Die letzte aggregierte Bar ist `DEVELOPING`, solange der Aufrufer nicht `closed: true`
  erklärt (`meta.lastBarStatus`).
* Versioniert: `meta.aggregation = { from, to, version, policyId, sourceHash }`.

Multi-Timeframe-Rollen (§31): `roles("1D") → { context: "1W", setup: "1D", trigger: "4h" }` —
höherer Timeframe = Regime, Setup-Timeframe = Struktur, tieferer = Trigger. Kein Timeframe ist
ein eigener Vote.

## 6. Kalender

`createCalendar(tradingDays)` liefert exakte Offsets innerhalb der Historie. Für Zeitpunkte nach
dem letzten bekannten Tag (Projektionsachse) werden Werktage fortgeschrieben — eine
dokumentierte Näherung ohne Feiertage; sie dient nur der Darstellung projizierter Objekte.

## 7. displayWindow ≠ analysisLookback

Ein sichtbarer 5Y-Chart bedeutet nicht, dass die Analyse fünf Jahre kennt. Der Orchestrator
rechnet immer über die gesamte übergebene Historie (`bundle.analysisLookback`); das Build-Skript
liefert für den Chart nur die letzten ~1.320 Bars (`bundle.display`). Mock-Titel tragen 20 Jahre
Analysehistorie bei 5,2 Jahren Anzeige.
