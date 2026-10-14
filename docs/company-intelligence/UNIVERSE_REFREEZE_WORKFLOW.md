# Re-Freeze per Workflow (`mode=refreeze`)

Setzt auf PR #694 auf (`universe-release.mjs refreeze`, `frozen-refreeze.mjs`); der Befehl existiert erst nach dessen Merge. Dieses Dokument beschreibt nur die Auslösung in `.github/workflows/company-intelligence-universe-release.yml`.

## Eingaben

| Eingabe | refreeze | activate |
|---|---|---|
| `mode` | `refreeze` | `activate` (Default) |
| `scaling_run` | nicht nötig (Formular: optional) | Pflicht: numerische Run-ID, erster Schritt bricht sonst ab |
| `expect_generation` | optional, 24 Hex-Zeichen, wird als `--expect-generation` über `env:` übergeben | ungenutzt |

## Schritte pro Modus

`refreeze` läuft nur über: Checkout (`ref: github.ref`, Tiefe 1, nur `main`), Node-Setup, `universe-release.mjs refreeze`, strikte Auswertung, Artefakt-Upload (`evidence/release.json`). Übersprungen werden: Browser-/Playwright-Suite, Identitäts-Checkout, Scale-Receipt-Verifikation, Audit, Pages-Dispatch samt Wait (der Wait erwartet `release.json.generation == ausgeliefert` und würde scheitern, sobald das Legacy-GOOD weiterrückt) und die Live-QA.

Auswertung: `status` ist `REFROZEN` oder `ALREADY_CURRENT`, und `privateStateModified`, `activationModified`, `gateModified`, `universeGoodModified` sind exakt `false`. Fehlt ein Feld oder ist es `true`, schlägt der Job fehl.

## Fehlerverhalten

Der Schritt „Fail closed to immutable 46 scope“ ist für `refreeze` ausgenommen (`inputs.mode != 'refreeze'`). Ein Fehlschlag von `refreeze` löst weder `restore46` noch einen Pages-Dispatch aus und fasst Gate, Aktivierung und Produktion nicht an. Das Rollback-Namespace-Verhalten bei Teilfehlern (Zeiger byte-genau zurück) liegt im Befehl selbst (#694).

## Betrieb

- Concurrency unverändert (`company-intelligence-continuous-production`, kein Abbruch laufender Läufe), Berechtigungen unverändert (`contents: read`, `actions: write`).
- Der eingefrorene Rollback verfällt sieben Tage nach `generatedAt`; Re-Freeze alle 3 bis 5 Tage, solange das Universum nicht aktiv ist. Ein Zeitplan ist bewusst nicht Teil dieser Änderung (Eigentümerentscheidung).
- Tests: `scripts/company_intelligence/tests/universe-release-workflow.test.mjs` (Bedingungen je Modus, keine `inputs.*` in `run:`, Mutationen).
