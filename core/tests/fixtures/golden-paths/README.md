# Eingefrorener Datenstand für `core/tests/golden-paths.test.mjs`

`data.json.gz` enthält jede Datei unter `data/`, die der Test liest (Dateien, Startseite, Aktienseiten, Reihen, SEC, Quant), eingefroren @ df73f76ec (main, 22.11.2026, nach #2226).
Der Test rechnet darauf statt auf der rotierenden Startseite des Tagesstands (Steuerung 22.11.2026, Muster #2122). Code und Konfiguration kommen aus dem Repository.

- Neu einfrieren (nur auf einem grünen, vollständigen Datenstand; das Skript bricht sonst ab):
  `node scripts/quant/freeze-test-fixture.mjs --test core/tests/golden-paths.test.mjs --out core/tests/fixtures/golden-paths/data.json.gz --source origin/main`
- Gegen den Live-Stand prüfen: `DATA_FIXTURE_LIVE=1 node --test core/tests/golden-paths.test.mjs`.
