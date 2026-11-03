# Chartbild-Produkt (v3) hinterher? Healthcheck, begrenzte Netzwerkbefehle, gezielte Auslösung

Stand 03.11.2026. Anlass: Lauf 41666053466 (Chartbild-Neubau v3), Issue-Kette #1292/#1296.
Elliott bleibt experimentell; dieser PR ändert kein Fachmodell, keine Datenqualitätsregel, keine Freigabesperre.

## Befund (Nachweis)

| Beobachtung | Beleg |
|---|---|
| Normaler Neubau dauert 68–97 min | Läufe von `technical-intelligence-build.yml` der letzten Wochen |
| Am 03.11. ging ein fertiger Neubau (76 min) verloren | Push abgewiesen (Wettlauf), danach hing `git fetch` 61 min bis „early EOF“; Job beendet, Daten verworfen |
| Wartender Neubau wurde „cancelled“ | `workflow_run` ohne Branch-Filter: übersprungene `claude/**`-Läufe von `long-series.yml` belegten die Concurrency-Gruppe und verdrängten den wartenden Lauf (GitHub hält nur einen wartenden Lauf) |
| Rückfall verzögert | Schedule `35 5 * * *` startete 5–6 h spät |
| Keine Sichtbarkeit | Kein Health-Eintrag verglich v3 mit den Langreihen |

Abhängigkeitskette: `long-series.yml` (monatlich/manuell) → `workflow_run` → `technical-intelligence-build.yml` → `quant/data/technical-intelligence/v3` → Chartbild/Elliott-Ansicht.

## Maßnahme 1: Healthcheck „Nachziehen“

- Neue Frische-Art `follows` in `core/health.js`: ein Artefakt darf hinter seinem Vorgänger herhinken, aber nur begrenzt.
- Neue Domäne `technicalIntelligenceV3` in `core/registry/domains.json` (Erzeuger `scripts/technical/build-technical-intelligence.mjs`, Workflow `technical-intelligence-build.yml`), Referenz: Index der Langreihen.
- Schwellen: **OK** solange v3 nicht älter als der Vorgänger ist **oder** der Rückstand ≤ 4 h (normales Fenster 68–97 min plus ein Wiederholungsversuch). **DEGRADED** > 4 h („über dem normalen Verarbeitungsfenster“). **STALE** > 26 h (eine verpasste Nachtlauf-Runde). Fehlende Zeitstempel ergeben **UNKNOWN**, nie stilles OK.
- Die Domäne ist nicht kritisch (`critical: false`): sie färbt die Gesamtlage höchstens auf DEGRADED, bricht aber keine CI. Bewusst keine zeitabhängige FAIL-Regel in `data-quality.mjs` (würde PR-CI zufällig rot färben).
- Tests: `core/tests/health.test.mjs` (7 neue: Fenster 0,5/1,6/3,9 h OK, 4,1 h DEGRADED, 26,5 h STALE, Grenzwerte, UNKNOWN-Fälle, Registry).
- Beleg: `node scripts/core/system-health.mjs` zeigt „Chartbild / Elliott (Produktdaten v3)“.

## Maßnahme 2: Begrenzte fetch-/push-Versuche (`scripts/ci/push-with-retry.sh`)

- `PUSH_FETCH_TIMEOUT` (Standard 300 s), `PUSH_PUSH_TIMEOUT` (600 s), `PUSH_FETCH_TRIES` (3), Wartezeit 5 s·n zwischen fetch-Versuchen; ungültige Werte verweigern den Start (Exit 2).
- Ein abgewiesener Push bleibt: Rebase, neuer Versuch (bestehende Schleife, Erzeugerhoheit unverändert).
- Scheitert das Neu-Aufsetzen endgültig, endet der Lauf laut mit „NICHT veröffentlicht“ (kein stilles Gelingen).
- Standardwerte sind weit über normalen Laufzeiten (fetch: Sekunden; Push mit tausenden Dateien: < 1 min), berühren normale Läufe also nicht. Fehlt `timeout`, läuft der Befehl wie bisher mit Warnung.
- Nebenwirkung: 45 Workflows nutzen das Skript. Die bestehenden Tests PR1–PR11 laufen unverändert grün; neu PR12–PR16 (echtes lokales Remote, `git`-Vorsatz hängt/bricht ab, Gegenproben).

## Maßnahme 3: Gezielte Auslösung

- `workflow_run` bekommt `branches: [main]` (Vorbild `technical-world.yml`): kein Lauf mehr für fremde Zweige, also keine Verdrängung.
- Concurrency-Gruppe `technical-intelligence-build-${{ github.ref_name }}` (ADR-005).
- Unverändert: Job-Bedingung `conclusion == 'success' && head_branch == 'main'`, Fingerabdruck-Idempotenz (unveränderte Eingaben → kein Neubau), Schedule als Rückfall, Push nur über `push-with-retry.sh`.
- Test PR17 prüft alle vier Punkte.

## Nicht geändert

Quant-/Technical-/Elliott-Modelle, Datenqualitätsregeln, Freigabesperren, generierte Artefakte, andere Workflows, Apple/TestFlight.
