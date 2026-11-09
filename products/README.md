# products/ – ein Ordner je Produkt

Plan Neustart §3: `products/<id>/{module.json, producer/, tests/}`. Die **Seite** eines Produkts bleibt unter `/<id>/` im Repo-Root, weil GitHub Pages sie dort ausliefert. Keine öffentliche URL ändert sich; Browser-Engines (`<id>/engine/`, `<id>/app.js`) bleiben neben der Seite.

- `module.json`: der Steckbrief (Route, Menü, Zugang free/pro/intern, Status, Datenarten, Erzeuger, Tests). Daraus entstehen Menü, `core/registry/modules.json`, `/status/` und `system-health` (`node scripts/core/build-modules.mjs`, Vertragstest `core/tests/module-manifest.test.mjs`).
- `producer/`: Erzeuger, die Daten für das Produkt schreiben (in Workflows aufgerufen; `domains.json` nennt sie als `producer`).
- `tests/`: Node-Tests laufen in Core-CI (`products/*/tests/*.test.mjs`), Python-Tests in der Produkt-CI.

## Stand je Produkt

| Produkt | Steckbrief | Erzeuger unter products/ | Tests unter products/ | Bleibt am Ort, weil |
|---|---|---|---|---|
| analysten | ✓ | ✓ | ✓ | – |
| news | ✓ | ✓ | – | keine Tests |
| morning | ✓ | ✓ | – | keine Tests |
| hedgefonds | ✓ | ✓ | ✓ | – |
| fundamental | ✓ | ✓ | ✓ | – |
| screener | ✓ | ✓ | – | `screener/tests`: Die Regressionsklassifikation der Company Intelligence führt `screener/` als geschützten Pfad |
| company-intelligence | ✓ | – | – | Ein Umzug von `scripts/company_intelligence/` löst die Regressionsklassifikation der eigenen CI aus |
| academy, budget, dashboard, elliott, etf, guide, macro, magazin, portfolios, reports, status | ✓ | – | – | reine Web-Produkte ohne eigenen Erzeuger (Status: `scripts/core/`, Elliott: technische Intelligenz) |
| ask | ✓ | – | – | kein eigener Erzeuger; `ask/tests` ruft auch `company-intelligence.yml` auf, und die Company-Intelligence-Workflows bleiben unangetastet (Auftrag Steuerung) |
| social | ✓ | ✓ | ✓ | – (08.11.2026: `scripts/social` → `producer/`, `social/tests` → `tests/`; Engines, Daten und Seite bleiben unter `/social/`) |
| vorsorge | ✓ | ✓ | ✓ | – (08.11.2026: `scripts/vorsorge` → `producer/`, `vorsorge/tests` → `tests/`; Engines und Daten bleiben unter `/vorsorge/`) |
| technical | ✓ | – | – | `scripts/technical` und `quant/engines/technical` werden auch von Quant erzeugt und gelesen |
| quant, supertrader, discover | ✓ | – | – | Erzeuger und Tests sind an Freeze-Listen, Fingerabdrücke und erzeugte Belege gebunden (`backtest-generation-freeze.cjs`, Supertrader-Fingerabdrücke, Discover-Reproduzierbarkeit); ein Umzug wäre eine Fachmodell-nahe Änderung mit eigenem Vorher/Nachher |
