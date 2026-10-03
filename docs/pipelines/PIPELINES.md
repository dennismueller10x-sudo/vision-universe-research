# Pipelines (GitHub Actions)

73 Workflows (Stand 03.10.2026). Commit-Regeln für Datenläufe: [ADR-005](../architecture/ADR-005-pipeline-commit-protocol.md).
Systemzustand der Daten: `node scripts/core/system-health.mjs`.

## Datenläufe nach Zeitplan (UTC)

| Workflow | Zeitplan | schreibt | Concurrency |
|---|---|---|---|
| `market-data-refresh.yml` | Mo–Fr 22:30 | Tageskurse, Faktoren, Technical, Discover, Capabilities; ruft die Materialisierung und den Frischevertrag auf | `market-data-<ref>` |
| `intraday-pacemaker.yml` | Mo–Fr stündlich 13–20 (Takt 5 min) | `intraday/`, Freshness, Capabilities | `intraday-pacemaker-<ref>` |
| `intraday-delivery-watchdog.yml` | Mo–Fr alle 15 min 13–21 | Nachholer über den Taktgeber | `intraday-pacemaker-<ref>` |
| `intraday-snapshots.yml` | Mo–Fr 21:35 | Universums-Tagesverlauf nach Schluss | `intraday-pacemaker-<ref>` |
| `sec-fundamentals-daily.yml` | täglich 06:15 | `quant/data/{fundamentals,universe,sec}` | `sec-backfill-<ref>` |
| `sec-consumer-fundamentals.yml` | Mo 07:30 | `quant/data/sec/consumer*`, Discover | `sec-consumer-<ref>` |
| `supertrader-signals.yml` | Di–Sa 06:17 | `supertrader/` | eigene |
| `index-membership.yml` | Sa 07:20 | Index, Discover | `index-membership-<ref>` |
| `long-series.yml` | 1. Sa im Monat 07:40 | `discover-series-long`, Discover | `long-series-<ref>` |
| `multi-asset-data.yml` | alle 3 h | Multi-Asset, Market Pulse | je Ref |
| `company-intelligence.yml` | alle 6 h | nur Vorschau/S3 | eigene |
| `coverage-metrics.yml` | So 06:00 | Deckungskennzahlen | `market-data-<ref>` |
| `update-analyst-ratings.yml` | So 08:00 | `dashboard/data/analyst_ratings.json` | – |
| `update-sec-fundamentals.yml` | Mo 06:00 | Legacy, ganz `quant/data` | eigene |
| `update-hedgefonds.yml` | quartalsweise | `hedgefonds/data` | – |
| `pages-release.yml` | Push auf main, `workflow_run` der Datenläufe, Mo–Fr */5 13–21 | Auslieferung | `pages-production` |
| `freshness-monitor.yml` | 4×/Tag | – (misst die ausgelieferte Seite) | – |
| `core-ci.yml` | PR/Push, täglich 07:47 | – (Tests, DQ, Health; streng gegen main und die Seite) | je Ref |

**Ohne Zeitplan, nur manuell:** `update-news.yml` (News veralten), `universe-master.yml`, `company-names.yml`, `build-morning.yml`, `market-data.yml` und `update-dashboard.yml` (Twelve-Data-Proben, schreiben nichts), verschiedene Nachweis- und Einmal-Workflows.

## Geändert im Audit (03.10.2026)

| Problem | Beleg | Änderung |
|---|---|---|
| Ein wartender Lauf checkte den Auslöse-Commit aus und lief garantiert in einen Rebase-Konflikt | Lauf 37085599297; Refresh 4/5 rot | 26 committende Workflows: `ref: ${{ github.ref }}` |
| `push-with-retry.sh` schob halb rebaste Stände | Test PR4/PR5 reproduziert | jeder Rebase-Halt wird geprüft |
| Konflikt in `intraday/index.json` warf 5.237 Tagesverläufe weg | Lauf 37083168221 (PR #366 brachte die Datei mit) | Verzeichnis, Status und Ledger unter Erzeugerhoheit (PR6/PR7) |
| 20 Push-Stellen mit `|| true` oder ohne Retry | Audit | `push-with-retry.sh` |
| Concurrency über Branches hinweg | Audit | `-<ref_name>` |
| Script-Injection über `workflow_dispatch`-Eingaben | 12 Workflows | `env:` plus Formatprüfung |
| CI ohne `permissions:` | 6 Workflows | `contents: read` |
| Datenläufe vom Wochenende erreichten die Seite erst am Montag | `pages-release` lauschte auf 6 Läufe | 12 weitere Läufe in `workflow_run` |

## Offene Risiken

1. **Social-Workflows** (eigener Workstream) haben weiter nackte Pushes und interpolierte Eingaben:
   - `social-cloudflare.yml` (3 Stellen)
   - `social-publish-candidate.yml`
   - `social-external-*`
   - `social-orchestrator.yml`
   - `social-resume-verified-web.yml`
2. **`discover/data/`** wird von sechs Workflows in fünf Gruppen geschrieben. `build-discover-data.mjs` löscht und baut das Verzeichnis neu.
   Konflikte enden laut, aber der Lauf ist dann verloren. Ziel: ein einziger Discover-Build am Ende jeder Kette.
3. **Warteschlangen-Semantik:** Je Gruppe gibt es einen laufenden und einen wartenden Lauf. Ein neuer wartender verdrängt den älteren.
   Das ist für Datenläufe mit Wiederholung akzeptabel. Die Kommentare „wartet – kein Abbruch“ in `intraday-*.yml` gelten nur für den laufenden Lauf.
4. **Nicht-atomare Schreibvorgänge:** Nur die `tiingo2-*`-Skripte nutzen Temp-und-Rename.
   Kritisch ist das in Commit-Schritten mit `if: always()`: `tiingo-scale.yml` committet Berichte auch nach einem Teilabbruch.
5. **`run-pacemaker.mjs`** behandelt einen fehlgeschlagenen Push als nicht fatal und committet weiter. Seit dem Fix in `push-with-retry.sh` ist das sicher, aber ein Block kann grün sein, ohne dass etwas ausgeliefert wurde.
6. **Actions nicht auf SHA gepinnt** (241 `uses:`, alle first-party), `npx wrangler@4` ohne feste Version.
7. **Universum ohne geplanten Erzeuger:** `eligibility.json` stand seit 15.09. Übernommene oder delistete Titel bleiben ACTIVE, Neuemissionen fehlen.
