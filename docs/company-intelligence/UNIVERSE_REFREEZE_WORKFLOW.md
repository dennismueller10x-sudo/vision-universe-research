# Re-Freeze per Workflow (`mode=refreeze`)

Baut auf `universe-release.mjs refreeze` und `frozen-refreeze.mjs` (PR #694, gemergt) auf. Dieses Dokument beschreibt nur die Auslösung in `.github/workflows/company-intelligence-universe-release.yml`.

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

## Voraussetzungen (zeitunabhängig)

- `refreeze` braucht eine ausgelieferte `company-intelligence-delivery.json`, die dem Legacy-GOOD entspricht (Gate offen, 46 Titel / 45 Emittenten), und ein Legacy-GOOD mit neuerem `generatedAt` als der bestehende Freeze. Ist das Gate geschlossen oder das GOOD zurückgerollt, schlägt der Befehl fail-closed fehl; das ist erwünscht.
- `ALREADY_CURRENT` schreibt nichts und verlängert den Verfall (`manifest.generatedAt` + 7 Tage, `CONSUMER_EXPIRED`) nicht.
- `refreeze` funktioniert auch nach Ablauf des alten Freeze. `rollback`, `restore46`, `recover_full_scope` und das Öffnen des Gates (`setProductionGate('AVAILABLE')` liest das aktive GOOD zurück) scheitern bei abgelaufenem aktivem GOOD bis dahin mit `CONSUMER_EXPIRED`.

## Betrieb

- Concurrency unverändert (`company-intelligence-continuous-production`, kein Abbruch laufender Läufe), Berechtigungen unverändert (`contents: read`, `actions: write`).
- Der eingefrorene Rollback verfällt sieben Tage nach `generatedAt`; Re-Freeze alle 3 bis 5 Tage, solange das Universum nicht aktiv ist. Ein Zeitplan ist bewusst nicht Teil dieser Änderung (Eigentümerentscheidung).
- Der Test liest den Workflow-Text strukturell (ohne YAML-Parser, kein PyYAML im `validate`-Job) und hat Wächter-Assertions, dass die erwarteten Schritte gefunden wurden.
- Tests: `scripts/company_intelligence/tests/universe-release-workflow.test.mjs` (Bedingungen je Modus, keine `inputs.*` in `run:`, Mutationen).
