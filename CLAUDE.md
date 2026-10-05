# Vision Universe Research – Arbeitsregeln

Einstieg: [docs/VISION_UNIVERSE_ARCHITECTURE.md](docs/VISION_UNIVERSE_ARCHITECTURE.md). Betrieb: [docs/operations/RUNBOOK.md](docs/operations/RUNBOOK.md).

Statische Seite (GitHub Pages, `research.visionuniverse.de`), Node 22 ohne Abhängigkeiten, UMD-Engines (`globalThis` + `module.exports`), Python für SEC.
Daten entstehen in GitHub-Actions-Läufen und werden nach `main` committet.

## Vor jeder Änderung

- **Fachmodelle nicht nebenbei ändern.** Quant-Scores, Rankings, Supertrader-Strategien, Regime und Technical-Modelle ändern sich nur in einem eigenen PR mit Vorher/Nachher-Vergleich.
- **Kein generiertes Artefakt von Hand ändern oder „mitbringen“.** Dateien unter `quant/data`, `discover/data`, `supertrader/data` und `social/data` gehören ihrem Erzeuger (`core/registry/domains.json`, Feld `producer`). Ein PR, der sie mitbringt, lässt Datenläufe in Konflikte laufen (`core-ci.yml` warnt). Ausnahme: ein Gate verlangt den Neubau (Discover-Reproduzierbarkeit, Währungsschulden-Register). Dann mit dem Erzeuger neu bauen, nie editieren.
- **Identität nur über `core/identity.js`** (`securityIdForTicker`, `shardKey`, `matchKey`). Keine eigenen `"ref_" + ticker`-Bildungen (ADR-001).
- **Eine Preiswahrheit (ADR-002):** Split-Faktoren aus `quant/engines/return-series.js#splitFactors`, veröffentlichte Schlüsse über `quant/engines/published-close.js`. Keine neue Ableitung daneben.

## Gates, die PRs aufteilen

Mehrere Produkte haben Isolations-Gates. Ein PR, der ihre Pfade berührt, darf nur ihre Welt ändern:

| Gate | Auslöser | Regel |
|---|---|---|
| Supertrader Gate A (`scripts/supertrader/guard-protected-paths.mjs`) | `supertrader/**`, `scripts/supertrader/**`, `docs/SUPERTRADER_*.md`, `.github/workflows/supertrader-*.yml` | nur diese Pfade im PR |
| Company Intelligence `validate` | `company-intelligence/**`, `scripts/company_intelligence/**`, ihr Workflow | keine Quant-, Discover-, Market-, API-Pfade |
| Discover „verändert keine bestehende Engine“ | `discover/**`, `scripts/discover/**` | kein `quant`, `scripts/market`, `scripts/technical` … |
| Discover Frontend Budget (`scripts/discover/browser-qa.mjs`) | Discover-Views | `discover/(app|home|detail|themes).(js|css)` ≤ 180.000 Byte decoded, ≤ 12 Requests |

Gates werden nicht abgeschwächt. Eine Querschnittsänderung wird in produkteigene PRs aufgeteilt.

## Tests

```bash
node --test "core/tests/*.test.mjs"           # ~5 s
node --test "quant/tests/*.test.mjs"
node --test "discover/tests/*.test.mjs" "scripts/supertrader/tests/*.test.mjs" "screener/tests/*.test.mjs"
python3 -m unittest discover -s scripts/quant/tests -p 'test_*.py'
node scripts/quality/check-test-isolation.mjs  # ein Test darf keine Produktionsdaten schreiben
```

Skripte, die von Tests aufgerufen werden, bekommen `--out`, statt in ein committetes Artefakt zu schreiben.

## Workflows

Regeln für Workflows, die committen (ADR-005):
- Checkout mit `ref: ${{ github.ref }}`.
- Push nur über `scripts/ci/push-with-retry.sh`.
- Concurrency-Gruppe mit `-${{ github.ref_name }}`.
- Workflow-Eingaben nur über `env:` in `run`-Blöcke, nie `${{ inputs.* }}` im Shell-Text.
- Prüf-Workflows bekommen `permissions: contents: read`.
- Diff-Gates in flachen Checkouts dürfen bei einem Git-Fehler nicht still „0 Dateien“ melden: `set -euo pipefail` und eine erreichbare Basis.

## Diagnose

```bash
node scripts/core/system-health.mjs           # Zustand je Datenart
node scripts/core/diagnose.mjs NVDA           # Warum ist diese Aktie falsch oder veraltet?
node scripts/core/data-quality.mjs            # DQ-Regeln über die Artefakte
```

Im Browser: `/status/` und `/status/#/NVDA`.
