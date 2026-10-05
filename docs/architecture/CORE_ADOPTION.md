# Core-Adoption: Welche Produkte laufen wirklich auf dem Core?

**Stand:** 03.10.2026, gemessen mit `node scripts/core/adoption-matrix.mjs` (`--json` liefert die Belege je Zelle).
Die Matrix entsteht aus dem Code und wird nicht eingeschätzt. Gelesen werden:
- die Skripte, die jede Produktseite tatsächlich lädt (`<script src>`),
- die Erzeuger-Skripte des Produkts mit ihren Importen.

| Zeichen | Bedeutung |
|---|---|
| ✅ Core | nutzt ein Modul aus `core/` (`identity.js`, `health.js`, `client.js`) |
| 🟢 gemeinsam | nutzt die gemeinsame Engine in `quant/engines/` (z. B. `company-master.js`, `return-series.js`, `freshness.js`) |
| 🟡 gemischt | gemeinsame Engine und daneben eine eigene Ableitung |
| 🔴 eigen | eigene Ableitung ohne gemeinsame Grundlage |
| ⚪ indirekt | liest fertige Artefakte eines anderen Erzeugers, rechnet nicht selbst |
| – | Bereich nicht berührt |

## Matrix

| Bereich | Security Identity | Prices | Fundamentals | Corporate Actions | Health/DQ | Core Client |
|---|---|---|---|---|---|---|
| Discover | 🟢 gemeinsam | 🟡 gemischt | 🟢 gemeinsam | 🔴 eigen | 🟢 gemeinsam | – |
| Quant | ✅ Core | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – |
| Markets | – | – | – | – | – | – |
| Screener | ✅ Core | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Supertrader | 🔴 eigen | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Technical | ✅ Core | – | – | – | – | – |
| News | – | – | – | – | 🔴 eigen | – |
| Company Pages | – | 🟡 gemischt | 🟢 gemeinsam | 🔴 eigen | – | – |
| Status | ✅ Core | – | – | – | ✅ Core | ✅ Core |

Eigene Split-Bereinigungen im Repository (Ziel: nur quant/engines/return-series.js):
  providers/tiingo/adapter.js
  quant/engines/mock-generator.js
  quant/engines/return-series.js
  quant/engines/technical/canonical-bars.js
  scripts/discover/build-discover-data.mjs
  scripts/market/publish-discover-series.mjs
  scripts/market/study-momentum-return-basis.mjs
  scripts/supertrader/validation/lib.mjs

## Was die Zellen bedeuten

| Produkt | Befund |
|---|---|
| **Discover** | Identität über `company-master.js` (dieselbe Regel wie der Core, per Test über alle 5.982 Titel festgehalten). Kurse über `published-close.js`. Die Split-Bereinigung ist noch eine eigene Schleife; die Umstellung auf `return-series.js#splitFactors` liegt in **#388** (bitgleich, 0 geänderte Datendateien). |
| **Quant** | Identität über `core/identity.js`, seit diesem PR auch im Signal-Vertrag. Vorher bekamen 25 Share-Class-Titel (BRK-A, BF-B, MOG-A …) eine falsche `securityId`. Kurse und Splits über `return-series.js`, Frische über `freshness.js`/`source-state.js`. |
| **Markets** | liest nur Marktpuls- und Multi-Asset-Artefakte. Die Tagesänderung der Movers ist eine eigene Definition (IEX statt EOD, ADR-002, offen). |
| **Screener** | Identität über `core/identity.js` (seit diesem PR). Kurse und Fundamentals aus den Discover-Seiten und `quant-factor-inputs.json`, also indirekt. |
| **Supertrader** | eigene ID-Bildung im Erzeuger `scripts/supertrader/build.mjs`. Die Umstellung liegt in **#387** (Supertrader-Gate A verlangt einen eigenen PR). |
| **Technical** | Identität über `core/identity.js` (seit diesem PR). Die OHLC-Split-Bereinigung liegt in einer eigenen Engine (`quant/engines/technical/canonical-bars.js`), siehe unten. |
| **News** | rechnet das Datenalter selbst (`news/news.js`). Kandidat für `core/client.js#getNews` und `core/health.js`. |
| **Company Pages** | Discover-Detail und Quant-Aktienseite. Sie hängen am Discover-Build (siehe Discover). |
| **Status** | vollständig auf dem Core. |

## Parallelwelten, die noch bestehen

| Thema | Wo | Weg |
|---|---|---|
| Split-Bereinigung | Liste unter der Matrix (8 Stellen; Ziel: nur `return-series.js`) | Discover: #388. Technical `canonical-bars.js`: OHLC und Volumen, eigener Vorher/Nachher-Nachweis. Supertrader-Validierung: semantisch identisch, versiegelte Forschung, bleibt. `mock-generator.js` und der Tiingo-Adapter erzeugen bzw. normalisieren Rohdaten und sind keine Produktableitung. |
| `core/client.js` | nur `/status/` | Kandidaten in dieser Reihenfolge: News (`getNews`), Discover-Detail (`getLatestPrice`), Screener (`getPriceSeries`) |
| 52-Wochen-Hoch | 4 Definitionen | eigener PR mit Methodik-Version |
| Tagesänderung Markets | IEX statt EOD | eigener PR (ADR-002) |
| Gesamtrendite | `investorReturn` und `canonical-total-return.js` | Methodik-Version |

## Wächter

- `core/tests/identity-adoption.test.mjs`:
  - Kein Produkt- oder Erzeugercode bildet eine `securityId` selbst.
  - Jede Ausnahme steht mit Grund in der Liste, und eine veraltete Ausnahme lässt den Test ebenfalls scheitern.
- `core/tests/adoption-matrix.test.mjs`:
  - Hält den erreichten Stand fest (Status, Quant, Screener und Technical auf der Core-Identität).
  - Lässt keine neue Split-Bereinigung zu.
