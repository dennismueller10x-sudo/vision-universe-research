# Vision Universe – Regeln für Codex und andere Agenten

Es gelten **dieselben Regeln wie für Claude**: zuerst [CLAUDE.md](CLAUDE.md) lesen, dann den aktuellen Plan
[docs/PLAN_NEUSTART_2026-11.md](docs/PLAN_NEUSTART_2026-11.md). Bei Widerspruch gilt CLAUDE.md.

## Wer arbeitet wo (Stand 04.11.2026)

Parallel arbeiten Claude-Sitzungen mit festen Bereichen. Fass deren Pfade nicht an:

| Strang | Bereich |
|---|---|
| A Infrastruktur (Claude) | `.github/workflows`, `scripts/ci`, `scripts/core`, `core/registry`, Security Master, Gate-Skripte |
| B Supertrader (Claude) | `supertrader/`, `scripts/supertrader/`, `docs/SUPERTRADER_*.md` |
| C Quant (Claude) | `quant/engines`, `quant/api`, `quant/tests`, `scripts/quant`, `konto/admin/backtests` |
| D2 Frontend (Claude) | Shell, Navigation, alle Seiten-Designs nach `docs/design/redesign-2027/` |
| **E Codex** | nur die Aufgaben aus Plan §8, in neuen Pfaden; Stand in `docs/neustart/E-codex.md` |

## Kurzfassung der Regeln

- Keine Fachmodelle, Scores, Rankings, Strategien ändern. Keine generierten Daten-Artefakte von Hand ändern.
- Ein PR pro Ergebnis, Branch-Präfix `codex/`, Tests aus CLAUDE.md laufen lassen.
- Keine neuen Workflows anlegen: Strang A bündelt gerade alle Workflows. Neue Erzeuger liefern ein Skript mit `--out` und Tests; A bindet sie ein.
- Owner-Freigabe nur für Geld, Recht, öffentliche Renditeaussagen und endgültiges Löschen.
