# Automatischer Re-Freeze (alle vier Tage)

Workflow `.github/workflows/company-intelligence-refreeze-auto.yml`, Preflight `scripts/company_intelligence/refreeze-auto-guard.mjs`, Tests `scripts/company_intelligence/tests/refreeze-auto.test.mjs`. Baut auf `universe-release.mjs refreeze` und `frozen-refreeze.mjs` (#694) auf; die manuelle Auslösung (`mode=refreeze`, #696) bleibt unverändert, siehe `UNIVERSE_REFREEZE_WORKFLOW.md`.

## Zweck

Der eingefrorene 46er-Rollback (`eligible-rollback-top46-v1`) verfällt sieben Tage nach `manifest.generatedAt` (`CONSUMER_EXPIRED`). Solange das Universum nicht aktiv ist, wird er alle vier Tage auf den aktuell ausgelieferten, verifizierten Legacy-GOOD (46 Titel / 45 Emittenten) neu aufgesetzt. Der Workflow darf das Gate nie öffnen oder schließen, Pages nie auslösen und nichts an der Produktion ändern.

## Zeitplan

- Cron `23 5 */4 * *` (UTC): Tag 1, 5, 9, 13, 17, 21, 25, 29 jedes Monats um 05:23 UTC. Minute 23 liegt bewusst nicht auf :00/:30. Größter Abstand zweier Läufe: 4 Tage (an Monatswechseln 1 bis 3 Tage), also deutlich unter der Obergrenze von 6 Tagen.
- **Erster planmäßiger Lauf: Samstag, 2026-10-17, 05:23 UTC**, sofern der PR bis dahin auf `main` ist (Zeitpläne laufen nur von der Default-Branch; GitHub kann Cron-Läufe um Minuten verzögern). Danach 2026-10-21, 2026-10-25, 2026-10-29, 2026-11-01. Der manuelle Re-Freeze vom 2026-10-15 verfällt rund 2026-10-22; ein Merge bis spätestens 2026-10-21 05:23 UTC deckt das ab, sonst manuell `mode=refreeze` auslösen.
- Zusätzlich `workflow_dispatch` (ohne Eingaben), mit denselben Prüfungen.

## Ablauf

1. Checkout (`ref: ${{ github.ref }}`, Tiefe 1), Node 22.
2. **Preflight** (`refreeze-auto-guard.mjs preflight`): rein lesend. Der R2-Treiber wird auf `get` reduziert, es gibt keinen Schreibpfad. Entscheidung `REFREEZE`, `SKIP` oder `BLOCKED`.
3. **Re-Freeze** nur bei `REFREEZE`: genau eine schreibende Aktion, `universe-release.mjs refreeze --expect-generation <geprüfte Generation>`. Die Generation kommt als Step-Output und wird nur über `env:` und mit Hex-Prüfung weitergegeben.
4. **Nachprüfung** (`refreeze-auto-guard.mjs verify`): Ergebnis `REFROZEN` oder `ALREADY_CURRENT`; `privateStateModified`, `activationModified`, `gateModified`, `universeGoodModified` exakt `false`; Generation wie geprüft; Archiv des vorherigen Zeigers vorhanden und hash-konsistent; neuer Freeze gültig (`generatedAt` + 7 Tage liegt in der Zukunft). Schlägt der Re-Freeze selbst fehl, läuft die Nachprüfung trotzdem und belegt, dass der Rollback-Zeiger byte-identisch zum Stand vor dem Lauf ist (kein Teilzustand).
5. Artefakt `refreeze-auto-<runId>` (30 Tage): `preflight.json`, `postcheck.json` (maschinenlesbares Verdikt, `kind: REFREEZE_AUTO_VERDICT`) und `release.json`.

## Preflight-Prüfungen (alle müssen gelten, sonst kein Re-Freeze)

| Id | Prüfung | Fehlerursachen (Auszug) |
|---|---|---|
| `gate-open` | CI verfügbar, Gate offen: live `company-intelligence-delivery.json` HTTP 200, `PASS`, 46/45; `company-intelligence/data/index.json` Status `PREVIEW` oder `AVAILABLE`, nicht `DISABLED`; `rollout.js` nicht `productionOff`, Stufe 1; R2-`gate.json` `AVAILABLE` (nur lesend über `readGateState`) | `DELIVERY_HTTP_*`, `INDEX_STATE_DISABLED`, `ROLLOUT_PRODUCTION_OFF`, `GATE_NOT_AVAILABLE` |
| `refresh-fresh` | Letzter Refresh erfolgreich und frisch: `lastSuccessfulGoodRefresh` nicht älter als die vorhandene Health-Grenze `FRESHNESS_HOURS.critical` (12 h), nicht in der Zukunft | `LAST_REFRESH_STALE`, `LAST_REFRESH_MISSING`, `LAST_REFRESH_IN_FUTURE` |
| `health` | Neuberechnung mit `productionObservation` und `evaluateHealth` (keine neuen Provider-Abfragen): `status` HEALTHY, `productionState` VERIFIED, `gateState` AVAILABLE, `refreshSLO`/`buildSLO`/`publicationSLO` HEALTHY (8-h-Warnschwelle), kein `failureStage`/`failureCode` im GOOD | `HEALTH_WARNING`, `PRODUCTION_MISMATCH/...`, `PUBLICATIONSLO_WARNING` |
| `generation-unanimous` | `delivery.json` = `index.json` = `servedGeneration` = `rollout.js` (`expectedGeneration`) = `company-intelligence-refresh.json` = `observed.json` = Legacy-GOOD, jeweils 24 Hex | `GENERATION_MIXED:<Quelle>=<Wert>`, `GENERATION_UNKNOWN` |
| `artifacts` | `delivery.json`, `index.json`, `refresh.json` (Status PASS, Manifest-Hashes und Ticker gleich dem GOOD), `observed.json` vorhanden | `REFRESH_JSON_UNAVAILABLE`, `MANIFEST_HASHES_DIFFER`, `OBSERVED_MISSING` |
| `rollback-archivable` | Rollback-Namespace lesbar und im 46/45-Scope, Universum nicht aktiv (Aktivierung fehlt oder `ROLLBACK_46`), Archiv-Schlüssel (`refreezeArchiveKey`) frei oder byte-identisch (idempotent) | `ROLLBACK_NAMESPACE_UNREADABLE`, `UNIVERSE_ACTIVE`, `ARCHIVE_COLLISION` |

Danach: Ist der Legacy-GOOD nicht neuer (`generatedAt`) als der aktuelle Freeze, lautet die Entscheidung `SKIP` (Notice, kein Fehler). Das ist auch der Fall nach einem erfolgreichen Lauf (gleiche Generation) und bei wiederholter Ausführung. `ALREADY_CURRENT` schreibt nichts und **verlängert den Verfall nicht**; ein `SKIP` bei Restlaufzeit unter 48 h ist deshalb nicht heilbar und wird zu `BLOCKED` (`FREEZE_EXPIRING_NOT_HEALABLE`).

Ein bereits abgelaufener Freeze blockiert nicht: `refreeze` funktioniert auch dann (der alte Freeze wird nur archiviert, nicht heruntergeladen). `rollback`, `restore46` und das Öffnen des Gates scheitern bis dahin mit `CONSUMER_EXPIRED`. Das Verdikt weist `freeze.expired` aus.

## Fehlerstatus

- **Job rot** bei `BLOCKED` (Exit 1), fehlgeschlagener Nachprüfung (Exit 1) und Absturz der Prüfung (Exit 2). `SKIP` und `REFREEZE` sind grün.
- **Annotationen:** je fehlgeschlagener Prüfung eine Zeile mit Ursache. `::warning::` bei Restlaufzeit des Freeze ab 48 h, `::error::` bei weniger als 48 h, bereits abgelaufen oder nicht bestimmbar (Verdikt `urgent: true`).
- **`GITHUB_STEP_SUMMARY`:** Entscheidung, Freeze-Verfall, Tabelle mit Ergebnis und Ursache je Prüfung.
- Bei `BLOCKED` und Absturz wird nichts geschrieben; der Re-Freeze-Schritt läuft nicht.

## Sonderfall LEGACY_FALLBACK (kein GOOD)

Ist der Legacy-GOOD-Zeiger auf `LEGACY_FALLBACK` gesetzt (z. B. Doppel-Rollback am 2026-10-15; `goodState` liefert null, Health: Generation null, Gate DISABLED, `GATE_CLOSED`, delivery.json 404), endet der Preflight mit `BLOCKED` und den Ursachen `LEGACY_GOOD_MISSING` und `GATE_CLOSED` (Feld `causes` im Verdikt). Es wird nicht eingefroren (`refreeze` würde an `assertLegacyScope` ohnehin scheitern). Läuft der Freeze in weniger als 48 h ab, ist die Meldung `::error::`.

## Betrieb

- Rechte `contents: read`, kein `actions: write`. Secrets (R2) wie im Universe-Release-Workflow, nur auf Job-Ebene.
- Concurrency-Gruppe `company-intelligence-continuous-production`, `cancel-in-progress: false`: gleiche Gruppe wie Refresh und Universe-Release, nie parallel zu einem schreibenden Lauf. Ein wartender Lauf wartet, bricht aber nichts ab.
- Rot am Lauftag: Ursache im Summary lesen, Voraussetzung beheben (meist Refresh/Health), danach den Workflow manuell per `workflow_dispatch` oder den manuellen `mode=refreeze` ausführen. Bei `urgent` zeitnah, der Freeze läuft sonst ab.
- Wird das Universum aktiv geschaltet, meldet `rollback-archivable` bewusst `UNIVERSE_ACTIVE` (der Befehl `refreeze` verweigert sich dort). Dann den Zeitplan an die Eigentümerentscheidung anpassen.
- Der Workflow enthält weder `enable`/`disable`/`stage`/`rollback`/`restore46`/`recover`/`activate` noch `gh workflow run`; der Test `refreeze-auto.test.mjs` erzwingt das strukturell (inklusive Mutationstests, die jede Prüfung einzeln entfernen).
- Diagnose lokal ohne Schreibzugriff: `node scripts/company_intelligence/refreeze-auto-guard.mjs preflight --out /tmp/preflight.json` (R2-Variablen nötig).
