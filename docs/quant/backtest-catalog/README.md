# Vorgerechneter Backtest-Katalog (interne Vorschau)

Stand 31.10.2026. Der Katalog ist intern, kein Produktartefakt: `productionApproved=false`, nichts ist zertifiziert. Der Katalog ist nicht verdrahtet; eine Anzeige braucht eine eigene Owner-Freigabe.

## Wozu

Die interne Vorschau soll die sechs bestehenden Backtest-Arten ausprobierbar machen. Der Research-Runner läuft nicht auf GitHub Pages (Node, bis 2,5 GB Speicher, private Archive). Deshalb wird ein fest registriertes Raster von Auswahlen in CI vorgerechnet. Die Ansicht schlägt eine Auswahl nach `specHash` nach; was nicht vorgerechnet ist, heißt „nicht vorgerechnet“.

## Bestandteile

| Datei | Inhalt |
|---|---|
| `grid.json` | 21 Auswahlen (Schema `backtest-catalog-grid-1.0.0`) über alle sechs Arten, mit Budgets: 180 s und 4 GB je Lauf, 30 min gesamt, höchstens 40 Einträge |
| `catalog.json` | Index (Schema `backtest-catalog-1.0.0`): je Eintrag Auswahl-Hash, Vorlage, Art, `specHash`, Zustand, Zertifizierungsstatus, Nachweisart, `envelopeHash`, `resultHash`, fehlende Eingaben, Laufzeit, Speicher; dazu `gridHash` und `catalogHash` |
| `results/<specHash>.json` | Runner-Ergebnis (Ergebnisvertrag v2) ohne QA-Block, nur abgeleitete Statistiken |
| `verify-report.json` | unabhängige Python-Gegenrechnung (`verify-backtest-runner.py`) über die vollen Ergebnisse |

**Code:**
- `scripts/quant/research/build-backtest-catalog.cjs`: `plan`, `buildCatalog`, `catalogViolations`, `lookup`.
- `scripts/quant/research/backtest-spec-builder.cjs`: nur registrierte Vorlagen, `validateSpec`, sichere Fehlercodes.

Gerechnet wird ausschließlich mit `runBacktest`; eine zweite Engine gibt es nicht.

## Stand

Lauf **41191910240** (`[v13-archive:catalog]`, privater Archivweg über das Secret):
- 21 Einträge, vollständig: 20 im Zustand A, 1 im Zustand B (Strategy-Profil, Eingaben fehlen).
- Python-Gegenrechnung: 560.140 Prüfungen, 0 Abweichungen.
- Integrität: 0 Verstöße.
- Laufzeit gesamt rund 184 s, Spitze 2,55 GB.
- `catalogHash` `7ea6383e…`.

## Neu rechnen

Ein leerer Commit mit `[v13-archive:catalog]` auf einem `claude/**`-Branch rechnet neu. Danach wird das Artefakt `v13-archive-catalog-<run>` nach `docs/quant/backtest-catalog/` übernommen.

Der Test `backtest-catalog.test.mjs` schlägt fehl, sobald Raster, Spec-Builder oder Vorlagen andere Specs ergeben, ein Ergebnis fehlt oder verändert ist. Ein Budgetbruch stoppt den Bau (fail closed) und steht im Index.

## Grenzen

- Alle Ergebnisse tragen `NO_ALPHA_OR_CERTIFICATION_CLAIM`. Die Nachweisart je Fall (Studie, Simulation, Rekonstruktion) liefert die Vorschau (`display.evidence`).
- Fälle mit privaten Eingaben (Faktorpanel, delistete Reihen) lassen sich nur über den Archivweg neu rechnen.
- Nach einer Umstellung des Security Masters ändern sich `masterHash` und gegebenenfalls Populationen. Dann den Katalog neu rechnen.
