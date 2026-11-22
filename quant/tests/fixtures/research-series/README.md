# Eingefrorene Forschungsreihen (Teil B2c)

Byte-gleiche Kopien der Kursreihen (`discover-series/`, `discover-series-long/`), die die Bereinigung aus dem Repo nimmt
(Freigabeliste `docs/data/security-master/eligibility-cleanup-2026-11-17.json`, 297 Titel, 583 Dateien), Stand main `a491e3216c1d3a5685322c8441d46e80a37b220f`.

Forschungs-Tests (V10-Population, Elliott-Registry M11-P6, backtest-artifact-consistency, backtest-refresh,
real-backtest-read, real-backtest-selection) rechnen auf `researchSeriesRoot()` (`scripts/quant/lib/data-fixture.mjs`):
solange das Repo jede Reihe fuehrt, ist das die Repo-Wurzel; fehlt eine, kommt sie aus diesem Verzeichnis. Gleiche Bytes,
gleicher `sourceBytesHash`. Die private Sicherung fuer Forschungslaeufe liegt in R2 (Teil B2a/B2b).

Neue Bereinigung: `node scripts/quant/freeze-research-series-fixture.mjs --cleanup <Freigabeliste>` vor dem Lauf (vorhandene Kopien bleiben).
