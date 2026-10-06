# ADR-003: Trennung von Core und Produkten

**Status:** angenommen, 03.10.2026

## Kontext

Produkte wie Discover, Quant, Supertrader und Screener kennen heute Speicherpfade, bauen eigene Universen und verknüpfen Daten per Ticker.
Ein neues Produkt (Portfolio, Retirement, App) müsste diese Kenntnis ein weiteres Mal kopieren.

## Entscheidung

```
PRODUKTE  ──liest nur über──▶  VERTRÄGE (core/client.js, quant/api/product-services.js, api/*.js)
                                   │
                                   ▼
CORE  core/identity.js · core/registry/domains.json · quant/engines/** · Datenartefakte
```

1. **`core/` ist die Plattformschicht.** Sie enthält:
   - `identity.js`: Identität.
   - `client.js`: Datenverträge.
   - `health.js`: Systemzustand.
   - `data-quality.js`: Datenqualität.
   - `diagnose.js`: Selbstdiagnose.
   - `registry/domains.json`: Source of Truth je Datenart.

   Alle Module sind UMD, rein und ohne I/O außer einem übergebenen Loader. Damit laufen sie unverändert in Browser, Node, Worker und künftig in einer App.
2. **Speicherpfade kennt nur der Vertrag.** `core/client.js#PATHS` ist die einzige Pfadquelle im Core. Neue Produktfunktionen lesen über den Client.
3. **Jede Antwort ist ein Umschlag:** `{state: AVAILABLE|UNAVAILABLE, reason, source, asOf, data}`. Nie ein stilles `null`, nie ein Ersatzwert.
4. **Jede Datenart steht in der Registry,** bevor ein Produkt sie liest.
5. **Fachlogik bleibt getrennt.** Strategien wie CANSLIM, Minervini, Darvas, Weinstein oder Turtle nutzen gemeinsame Daten aus dem Core. Ihre Regeln bleiben in ihren eigenen Modulen. Der Core rechnet keine Strategie.

## Migration

- **Schritt 1 (erledigt):** Core-Module, Registry, Health, Diagnose und Status-Seite. `core/diagnose.js` liest über `core/client.js`.
- **Schritt 2:** Neue Produktfunktionen lesen über `core/client.js`. Bestehende Produkte werden migriert, wenn sie ohnehin angefasst werden, nicht in einem Big Bang.
- **Schritt 3:** Der Client spricht gegen `/v1/...` statt gegen statische Dateien. Erst wenn eine App das braucht (ADR-004).

## Abgrenzung zu `quant/api/product-services.js`

Die Quant-2.0-Produktdienste bleiben die Anwendungsschicht für Quant (Workspaces, Evidenz, Setups).
Sie sollen ihre Rohdaten künftig über die Core-Verträge beziehen. Die eigene Pfadliste in `compressedJSON()` wird dann zur Allowlist auf Core-Pfade.
