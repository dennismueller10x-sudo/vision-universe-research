# ADR-002: Eine Preiswahrheit

**Status:** angenommen, 03.10.2026

## Kontext

Discover, Screener, Supertrader und Technical lesen dieselbe Tiingo-EOD-Ablage, leiten daraus aber an mehreren Stellen eigene Werte ab:

- Die Split-Bereinigung existiert fünfmal (`return-series.js`, `publish-discover-series.mjs`, `build-discover-data.mjs`, `technical/canonical-bars.js`, `supertrader/validation/lib.mjs`).
- Das 52-Wochen-Hoch ist viermal unterschiedlich definiert.
- Die Gesamtrendite ist zweimal definiert: `canonical-total-return.js` und die Anbieterspalte in `market-factors.js#investorReturn`.
- Die Tagesänderung ist dreimal definiert: EOD/EOD in Discover, IEX/IEX in Markets, IEX gegen EOD auf der Detailseite.
- Beide Publisher rundeten auf Cent. Daraus wurden Kurse von 0 (CPTAF, DMN), und 367 Reihen unter 1 $ verloren Präzision.

## Entscheidung

1. **Quelle:** Tiingo EOD. Rohe OHLC, `splitFactor` und `divCash` je Balken, gehalten in `.market-cache` und dauerhaft in R2.
2. **Produktbasis:** die **split-bereinigte Tagesreihe** `quant/data/market/discover-series/<securityId>.json` (1J, täglich).
   Dazu die Wochenreihe `discover-series-long/` (MAX) aus derselben Ablage und mit derselben Bereinigung.
3. **Kurs und Tagesänderung** eines Titels sind der letzte und der vorletzte Punkt dieser Reihe (`core/client.js#getLatestPrice`).
   Karte, Aktienseite und API zeigen denselben Wert. `DQ-PX-4` (Tag gegen Woche), `DQ-PX-5` (Seite gegen Reihe) und die Golden-Path-Tests prüfen das.
4. **Gesamtrendite:** `canonical-total-return.js`. Die Anbieterspalte dient nur zur Gegenprobe.
5. **Rundung:** `published-close.js#roundClose`. Ab 1 $ wird auf Cent gerundet, darunter auf vier signifikante Stellen. Ein Kurs ≤ 0 wird verworfen.
6. **Intraday** (IEX, 5 Minuten) ist eine Ergänzung während der Sitzung. Nach Schluss gilt der EOD-Schluss.
   Ein Intraday-Stand, der nicht live ist, trägt Datum und Uhrzeit und heißt nie „heute“ (`source-state.js`, `quant/app/chart.js`).

## Bewusst offen

- Markets-Movers (`build-market-pulse.mjs:201`) rechnen mit IEX-Letztkurs gegen IEX-Letztkurs des Vortags statt mit dem EOD-Schluss.
- Am Split-Tag nimmt `ingest-intraday.mjs` den `previousClose` aus der Reihe des Vortags, die den Split noch nicht kennt.
  **Abgesichert seit 03.10.2026:** `intraday-snapshot.js#previousCloseCheck` hält den Vortagesschluss zurück, wenn er zum ersten Sitzungskurs in einem üblichen Split-Verhältnis steht (`previousCloseWithheld: "SPLIT_SUSPECTED"`).
  Die strukturelle Lösung bleibt offen: ein Register angekündigter Corporate Actions vor Sitzungsbeginn.
- `market-factors.js#investorReturn` nutzt noch die Anbieterspalte. Die Umstellung verändert veröffentlichte Faktorwerte und braucht deshalb einen eigenen Methodik-Versionssprung.
- Die fünf Split-Bereinigungen sind nicht zusammengeführt. Ziel ist `return-series.js#splitAdjustedColumn` als einzige Implementierung.
  Der Umbau braucht einen Vorher/Nachher-Vergleich je Produkt.
