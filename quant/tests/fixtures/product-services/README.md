# Eingefrorener Datenstand für `quant/tests/product-services.test.mjs`

`data.json.gz` enthält jede Datei unter `data/`, die der Test liest (105 Dateien), im Stand eines grünen, vollständigen Datenlaufs.
Der Test rechnet darauf statt auf dem Tagesstand (Steuerung 18.11.2026, Muster #1991). Methodik, Konfiguration und Code kommen weiter aus dem Repository.

- Quelle: Commit und Zeitpunkt stehen im Bündel (`meta.sourceCommit`, `meta.frozenAt`).
- Neu einfrieren, wenn sich ein Artefakt-Schema ändert oder der Test neue Dateien liest:
  `node scripts/quant/freeze-test-fixture.mjs --test quant/tests/product-services.test.mjs --out quant/tests/fixtures/product-services/data.json.gz --source origin/main`
  (nur auf einem Stand, auf dem der Test live grün ist; das Skript bricht sonst ab).
- Gegen den Live-Stand prüfen: `DATA_FIXTURE_LIVE=1 node --test quant/tests/product-services.test.mjs`.
- Die Deckung des Live-Stands (Universum > 6000, Technical und Signale > 5000, ein Universum für alle Artefakte) meldet `DQ-PQ-11` in `core/product-quality.js`.
- 22.11.2026 (quant-v2.5.0): neu eingefroren nach einem lokalen Neubau mit den Erzeugern `build-factor-evidence.mjs` und `build-strategy-index.mjs` auf Code-Stand ac9af71744 (Eingänge @ 085b8f9c72); `meta.sourceCommit` nennt diesen Code-Stand. Die Produktdaten selbst bringt die Materialisierung auf dem Zweig.
