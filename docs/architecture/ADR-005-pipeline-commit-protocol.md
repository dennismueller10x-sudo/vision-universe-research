# ADR-005: Commit-Protokoll für Datenläufe

**Status:** angenommen, 03.10.2026

## Kontext

Generierte Daten werden von GitHub Actions nach `main` committet. Gemessen am 03.10.2026:

- Der Marktdaten-Refresh scheiterte in 4 von 5 geplanten Läufen. Bei Lauf 37085599297 checkte ein wartender Lauf den **Auslöse-Commit** aus.
  Er hatte also den Push des Vorläufers nicht und lief garantiert in einen Rebase-Konflikt.
- `push-with-retry.sh` löste nur den ersten Rebase-Halt. Bei mehreren eigenen Commits schob es einen halb rebasten HEAD und meldete Erfolg.
- 20 Push-Stellen nutzten `git pull --rebase … || true` oder nackte `git push`. Ein hängender Rebase blieb grün und unbemerkt.
- Lauf 37083168221 verwarf 5.237 Intraday-Tagesverläufe aus 6.876 Anfragen, wegen eines Konflikts in `intraday/index.json`.
  Diese Datei hatte ein Feature-PR (#366) mitgebracht.
- Concurrency-Gruppen waren nicht nach Branch getrennt. Läufe auf `claude/**` standen in der Warteschlange von `main`.

## Entscheidung

1. **Spitze auschecken.** Jeder committende Job checkt `ref: ${{ github.ref }}` aus, nicht `github.sha`.
2. **Ein Push-Werkzeug.** Alle Datenläufe pushen über `scripts/ci/push-with-retry.sh <branch>`. Das Skript:
   - holt den Branch und rebased mit Autostash;
   - prüft **jeden** Rebase-Halt;
   - löst Konflikte nur in Dateien unter Erzeugerhoheit (`ERZEUGT`) zugunsten des eigenen Laufs;
   - bricht bei jedem anderen Konflikt laut ab;
   - wiederholt mit Backoff;
   - endet mit Exit 1, wenn nichts ankam.

   `commit-and-push.sh` bleibt für Messberichte, bei denen der Lauf gewinnt.
3. **Erzeugerhoheit nur für Dateien, die jeder Lauf vollständig neu baut.** Dazu gehören Capability-Matrix und -Projektion, Freshness sowie das Intraday-Verzeichnis, sein Status und sein Ledger.
   **Nie** dazu gehören Kursreihen, Sitzungsordner oder Discover-Daten. Die Tests PR1–PR7 in `quant/tests/push-with-retry.test.mjs` halten das fest.
4. **Kein `|| true` auf Pull oder Push.**
5. **Concurrency je Branch:** `group: <name>-${{ github.ref_name }}`.
   Achtung: GitHub hält je Gruppe höchstens einen laufenden und einen wartenden Lauf. Eine neue wartende Anfrage verdrängt die ältere wartende.
6. **Eingaben über `env:`.** `workflow_dispatch`-Eingaben werden nie direkt in `run:` interpoliert.
7. **Feature-PRs bringen keine pipeline-eigenen Artefakte mit.** Ausnahme: Der PR baut sie bewusst neu. `core-ci.yml` warnt bei solchen PRs.
8. **Auslieferung:** Jeder Datenlauf, der auf `main` committet, steht in der `workflow_run`-Liste von `pages-release.yml`. Pushes mit dem `GITHUB_TOKEN` lösen keinen Lauf aus.

## Bewusst offen

- Die Social-Workflows (eigener Workstream) nutzen weiter nackte Pushes und direkte Eingabeinterpolation. Siehe `docs/pipelines/PIPELINES.md`.
- `discover/data/` wird von sechs Workflows in fünf Concurrency-Gruppen geschrieben, und `build-discover-data.mjs` baut das Verzeichnis komplett neu.
  Konflikte enden dort laut statt still. Die strukturelle Lösung ist ein einziger Discover-Build am Ende jeder Kette.
- Generierte JSON-Dateien werden fast überall ohne Temp-und-Rename geschrieben. Der Commit-Schritt sieht nur fertige Dateien, außer in Schritten mit `if: always()`.
