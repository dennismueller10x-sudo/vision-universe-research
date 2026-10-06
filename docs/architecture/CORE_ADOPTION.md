# Core-Adoption: Welche Produkte laufen wirklich auf dem Core?

**Stand:** 05.10.2026 (main nach der Merge-Kette), gemessen mit `node scripts/core/adoption-matrix.mjs` (`--json` liefert die Belege je Zelle).
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
| Discover | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – |
| Quant | ✅ Core | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – |
| Markets | – | – | – | – | – | – |
| Screener | ✅ Core | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Supertrader | 🟢 gemeinsam | ⚪ indirekt | ⚪ indirekt | – | – | – |
| Technical | ✅ Core | – | – | – | – | – |
| News | ✅ Core | – | – | – | 🔴 eigen | ✅ Core |
| Company Pages | – | 🟢 gemeinsam | 🟢 gemeinsam | 🟢 gemeinsam | – | – |
| Status | ✅ Core | – | – | – | ✅ Core | ✅ Core |

Eigene Split-Bereinigungen im Repository (Ziel: nur quant/engines/return-series.js):
  providers/tiingo/adapter.js
  quant/engines/mock-generator.js
  quant/engines/return-series.js
  quant/engines/technical/canonical-bars.js
  scripts/market/study-momentum-return-basis.mjs
  scripts/supertrader/validation/lib.mjs

## Was die Zellen bedeuten

| Produkt | Befund |
|---|---|
| **Discover** | Identität über `company-master.js` (dieselbe Regel wie der Core, per Test über alle Titel festgehalten). Kurse über `published-close.js`. Split-Bereinigung über `return-series.js#splitFactors` – im Builder (#388) und im Publisher (#437), bitgleich zur früheren Schleife. |
| **Quant** | Identität über `core/identity.js`, auch im Signal-Vertrag (#394). Kurse und Splits über `return-series.js`, Frische über `freshness.js`/`source-state.js`. |
| **Markets** | liest nur Marktpuls- und Multi-Asset-Artefakte. Movers und Steigend/Fallend kommen seit #400 aus der EOD-Tagesreihe (ADR-002); der Benchmark über `core/identity.js`. Die Matrix sieht nur die Seite, nicht den Erzeuger. |
| **Screener** | Identität über `core/identity.js`. Kurse und Fundamentals indirekt aus den Discover-Seiten und `quant-factor-inputs.json`. |
| **Supertrader** | Identität über `company-master.js#legacySecurityId` (#387), gleich zu `core/identity.js`. Bis 05.10. stand hier „eigen“ – ein Messfehler: das Werkzeug übersah `createRequire(...)("…")` und zählte einen Kommentar zum behobenen Fehler mit. |
| **Technical** | Identität über `core/identity.js`. Die OHLC-Split-Bereinigung bleibt in `canonical-bars.js`; ihre Gleichheit mit der Core-Definition ist festgeschrieben (#410). |
| **News** | liest über `core/client.js#getNews` (#396). Das Datenalter rechnet die Seite noch selbst (Health/DQ „eigen“) – nächster Schritt: `core/health.js`. |
| **Company Pages** | Discover-Detail und Quant-Aktienseite, am Discover-Build. Vortag aus der Tagesreihe (#401, #402). |
| **Status** | vollständig auf dem Core. |

## Parallelwelten, die noch bestehen

| Thema | Wo | Begründung / Weg |
|---|---|---|
| Split-Bereinigung | 6 Stellen (Liste unter der Matrix; vorher 8) | `return-series.js` ist die Definition. `canonical-bars.js`: OHLC und Volumen, Gleichheit festgeschrieben (#410). Supertrader-Validierung: versiegelte Forschung (Gate A), bleibt. `mock-generator.js` und der Tiingo-Adapter erzeugen bzw. normalisieren Rohdaten. `study-momentum-return-basis.mjs` ist eine Studie. |
| `core/client.js` | Status, News, Golden Paths | Discover-Detail (`getLatestPrice`) als reines Refactoring nach #401; Screener (`getPriceSeries`) |
| Datenalter in News | `news/news.js` | auf `core/health.js` umstellen |
| Gesamtrendite | `investorReturn` und `canonical-total-return.js` | Methodik-Version |

## Wächter

- `core/tests/identity-adoption.test.mjs`:
  - Kein Produkt- oder Erzeugercode bildet eine `securityId` selbst.
  - Jede Ausnahme steht mit Grund in der Liste, und eine veraltete Ausnahme lässt den Test ebenfalls scheitern.
- `core/tests/adoption-matrix.test.mjs`:
  - Hält den erreichten Stand fest (Status, Quant, Screener und Technical auf der Core-Identität, Supertrader auf der gemeinsamen Engine, News über `core/client.js`).
  - Lässt keine neue Split-Bereinigung zu, und die Liste der bekannten schrumpft nur: ein Eintrag, der nicht mehr zutrifft, lässt den Test scheitern.
