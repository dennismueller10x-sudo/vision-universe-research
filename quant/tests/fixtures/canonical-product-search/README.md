# Eingefrorener Datenstand für `quant/tests/canonical-product-search.test.mjs`

`data.json.gz` enthält jede Datei unter `data/`, die der Test liest (21 Dateien), im Stand eines grünen, vollständigen Datenlaufs.
Der Test rechnet darauf statt auf dem Tagesstand (Steuerung 18.11.2026, Muster #1991). Methodik, Konfiguration und Code kommen weiter aus dem Repository.

- Quelle: Commit und Zeitpunkt stehen im Bündel (`meta.sourceCommit`, `meta.frozenAt`).
- Neu einfrieren, wenn sich ein Artefakt-Schema ändert oder der Test neue Dateien liest:
  `node scripts/quant/freeze-test-fixture.mjs --test quant/tests/canonical-product-search.test.mjs --out quant/tests/fixtures/canonical-product-search/data.json.gz --source origin/main`
  (nur auf einem Stand, auf dem der Test live grün ist; das Skript bricht sonst ab).
- Gegen den Live-Stand prüfen: `DATA_FIXTURE_LIVE=1 node --test quant/tests/canonical-product-search.test.mjs`.
- Die Breite des Live-Stands (Universum > 6000, ein Universum für alle Artefakte) meldet `DQ-PQ-11` in `core/product-quality.js`.
