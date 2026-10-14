# Betriebshandbuch

## 1. Zuerst messen

```bash
node scripts/core/system-health.mjs                                        # Repository-Stand
node scripts/core/system-health.mjs --site=https://research.visionuniverse.de   # ausgelieferte Seite
node scripts/core/diagnose.mjs NVDA                                        # eine Aktie, Glied für Glied
node scripts/core/data-quality.mjs                                         # Datenqualität
```

Im Browser: `/status/` und `/status/#/NVDA`.

Die Zustände bedeuten:

| Zustand | Bedeutung |
|---|---|
| OK | Frischevertrag erfüllt |
| DEGRADED | über der Warnschwelle, oder weniger Datensätze als erwartet |
| STALE | über der harten Schwelle |
| FAILED | Artefakt nicht lesbar |
| NOT_DELIVERED | wird bewusst nicht ausgeliefert, nur im Repository messbar |

## 2. „Der Kurs von X ist veraltet“

1. `node scripts/core/diagnose.mjs X`. Das erste rote Glied ist die Ursache.

| Erstes rotes Glied | Ursache | Reparatur |
|---|---|---|
| `universe` | Titel nicht im Company Master oder nur inaktiv | Universum neu bauen (`build-us-eligibility.mjs`, `universe-master.yml`). Bei Übernahme oder Delisting ist das korrekt. |
| `eod` FAILED | Keine Reihe. Titel im Ablehnungsregister? Identität? | `classify-rejections.mjs` lesen; `node scripts/core/data-quality.mjs` (DQ-ID-1) |
| `eod` STALE | Refresh rot oder Titel vom Anbieter nicht mehr geliefert | Lauf von `market-data-refresh.yml` prüfen, siehe §3 |
| `payload` STALE | Reihe aktuell, Seite nicht | Discover-Build fehlgeschlagen oder Push verloren (§3) |
| `payload` FAILED (Preis ≠ Reihe) | zweite Preiswahrheit | DQ-PX-5; `build-discover-data.mjs` prüfen |
| `intraday` | Takt steht | §4 |

## 3. Ein Datenlauf ist rot

Ein roter Marktdaten-Refresh oder ein roter Freshness-Monitor öffnet automatisch ein Issue mit dem Label `pipeline-alarm` (`scripts/ci/pipeline-alarm.mjs`): Lauf, fehlgeschlagene Schritte, rote Tests. Der nächste grüne Lauf schließt es. Tests, die erst nach der Veröffentlichung rot werden (Gate C), stehen in einem eigenen Issue `[market-data-refresh · Beobachtung]`.

1. Log des Schritts **„Commit und Push“** lesen.
   - Konflikte in den eigenen Erzeugerpfaden des Refresh (`discover/data` ohne `europe`, `quant/data/technical`, Faktoren, Kursreihen; `PUSH_OWNED_PATHS` im Workflow) löst das Skript seit 10/2026 nach eigenem Stand auf.
   - `Konflikt ausserhalb erzeugter Artefakte: <Datei>`: Ein anderer Commit hat dieselbe Datei geändert.
     - Kam der Commit aus einem Feature-PR? Dann den PR korrigieren (generierte Dateien auf den Stand von `main`).
     - War es ein zweiter Datenlauf? Dann einfach wiederholen. Seit ADR-005 checkt jeder Lauf die Spitze aus.
   - `Push nach N Versuchen nicht möglich`: `main` bewegt sich zu schnell. Den Lauf wiederholen.
2. `P0_DATA_PIPELINE_FROZEN` aus dem Schritt `freshness-contract`: Der Marktlauf war grün, die Materialisierung nicht. Den Job `materialize` im selben Lauf ansehen.
3. **Gate A** (vor dem Abruf) rot: Ein Code-Test des Marktlaufs ist auf `main` rot. Gate A umfasst seit 10/2026 nur Testdateien, die Code aus der Importhülle des Jobs `refresh` prüfen und keinen erzeugten Datenstand lesen (`node scripts/market/run-eod-publish-gates.mjs --explain`). Zuerst den Code reparieren, dann den Abruf wiederholen. Rote Tests anderer Produkte oder am Datenstand des Vorabends halten den Abruf nicht mehr an; sie laufen in Gate C und erscheinen im Beobachtungs-Issue.
4. **Gate B** (nach dem Abruf) rot: Die neuen Daten verletzen einen Integritätstest. Nichts wurde veröffentlicht. Die Testausgabe lesen.

Wiederholen: Actions → Workflow → „Run workflow“ auf `main`. Für einen Datenlauf ist das idempotent.

## 4. Intraday steht

- `intraday/index.json`: `dataSession.asOf` und `regularComplete`.
- Läuft `intraday-pacemaker.yml`? Schlägt der Wächter (`intraday-delivery-watchdog.yml`) an?
- Nach Börsenschluss holt der Lauf um 21:35 UTC (`intraday-snapshots.yml`) den Schluss und das Universum.
- Ist er gescheitert, holt ein manueller Lauf mit `scope=auto` nach. Das Siegel funktioniert seit 03.10. auch mit Bindestrich-Tickern.

### Im Blick (Intraday) steht oder zeigt „Experimentell/EOD“ statt der Live-Auswahl

- `discover/live/monitor-US_REAL.json`: `plan.lastDueSlot`, `published.slot`, `lastRun`, `error`.
- `node scripts/discover/check-im-blick-live.mjs --site=https://research.visionuniverse.de` nennt den Befund (`RECOMPUTE_OVERDUE` = Lauf nicht gestartet; `DATA_STALE` = Kurse alt, dann Abschnitt 4).
- Keine Läufe von `discover-im-blick-live.yml`: GitHub verwirft Zeitplan-Ereignisse (belegt 12.10.2026). Der Cloudflare-Wecker stößt alle 30 Minuten an; fehlt auch das: Workflow von Hand starten. Details: `docs/DISCOVER_IM_BLICK.md`.
- Nach dem Nachtlauf zeigt `published.eodAsOf` noch die alte Basis (Hinweis `BASIS_NOT_PUBLISHED`, nur Warnung): Job `imblick` im Lauf von `market-data-refresh.yml` ansehen. Er läuft nur, wenn refresh, materialize und freshness-contract grün sind, und macht den Nachtlauf nie rot; ein Fehler steht im Issue `[market-data-refresh]` (Label `pipeline-alarm`) und in `monitor-US_REAL.json` (`error.code` = `NIGHT_CHECK_FAILED`: Datenversion oder Handelsdatum passen nicht; die letzte gültige Auswahl bleibt stehen). Nachholen: `discover-im-blick-live.yml` von Hand starten. Der nächste Slot rechnet ohnehin auf der neuen Basis.
- Wurde die Basis bewusst auf ein **älteres** Datum zurückgesetzt (Revert/Neubau), überspringt Im Blick alle Läufe still (`BASIS_OLDER`, auch mit `--force`): die Basis geht nie rückwärts. Dann `discover/live/im-blick-US_REAL.json` und `monitor-US_REAL.json` löschen und committen, danach `discover-im-blick-live.yml` von Hand starten.

## 5. News sind alt

`update-news.yml` hat keinen Zeitplan. Manuell starten: Actions → „Update VISION UNIVERSE news“.
Die Seite zeigt seit 03.10. selbst an, wenn der Feed älter ist als sein Maximalalter.
**Empfehlung:** einen Zeitplan setzen, zum Beispiel alle 6 Stunden. Das ist eine Owner-Entscheidung, weil der Lauf externe RSS-Quellen abfragt.

## 6. Ein Wertpapier fehlt oder ist falsch zugeordnet

- Identität: `node -e 'console.log(require("./core/identity.js").securityIdForTicker("BRK-B"))'`
- Universum: `quant/data/market/security-master/eligibility.json` (`decisions[]`: `product_eligibility`, `active_status`)
- Company Master: `quant/data/universe/instruments/<shard>.json`, mit Scherbe aus `core/identity.js#shardKey`
- Index: `quant/data/market/index-membership/<INDEX>.json` (`unmatched`)

## 7. Deployment während eines Datenlaufs

`pages-release.yml` baut immer vom Kopf von `main` und hat eine eigene Concurrency-Gruppe (`pages-production`).
Ein Deployment mitten in einem Datenlauf liefert den letzten vollständig gepushten Stand. Teilstände gibt es nicht, weil der Push den Commit atomar setzt.
Nach dem Datenlauf löst `workflow_run` das nächste Deployment aus.

## 8. `core` ist rot, aber der PR hat nichts damit zu tun

1. Welcher Test? Schritt „Zustandstests (Querverträge über erzeugte Daten)“ im Job `core`: steht dort „Datenbefund, nicht dieser PR“, ist es kein Fehler des PR (Warnung, Check bleibt grün). Rot ist der Check nur, wenn der PR einen Eingang des Tests berührt (`core/tests/state/manifest.json`, `blockingWhenPrTouches`).
2. Zustandstests (`core/tests/state/`) prüfen nicht Code, sondern ob die **erzeugten Daten zweier Produkte** zueinander passen (z. B. jedes Supertrader-Signal hat eine Discover-Seite, sonst toter Link). Sie bleiben verbindlich: auf `main`, im täglichen Zeitplan und per Dispatch von `core-ci.yml` (Job `live`) sind sie immer streng.
3. Abhilfe steht in der Warnung: den Erzeuger der veralteten Seite laufen lassen. Beispiel 13.10.2026: der Nachtlauf entfernte QRVO aus dem Discover-Universum, `supertrader-signals.yml` lief wegen der Zeitplan-Verspätung (323–428 Minuten, 15 von 15 Läufen) erst Stunden später. Vor einem manuellen Start prüfen: Nachtlauf und Materialisierung fertig, der Lauf schreibt nur `supertrader/`, die Integritätstests im Lauf bleiben bindend.
4. Neue Zustandstests: Datei in `core/tests/state/` ablegen **und** im Manifest führen (Erzeuger, Abhilfe, berührte Pfade). Eine nicht geführte Datei ist immer streng. Code-Tests bleiben in `core/tests/*.test.mjs` und blockieren jeden PR.

## 9. Supertrader steht auf dem Vortag oder zeigt einen toten Link

1. Befund: `node scripts/ci/supertrader-chain.mjs check --root=.` (oder der Job `supertrader` im Freshness-Monitor). `SUPERTRADER_LATE` (> 4 h) und `SUPERTRADER_STALE` (> 9 h, FAIL) heißen: die validierten Produktdaten tragen die letzte Sitzung, Supertrader nicht. `DEAD_TICKER_REFS`: Signale auf Titel ohne Discover-Seite und ohne `discoverAvailability`-Ausweis (der nächste Lauf weist sie aus).
2. Kette: Der Nachtlauf (`market-data-refresh.yml`) stößt in der letzten Stufe `supertrader` den Workflow `supertrader-signals.yml` per `workflow_dispatch` an, aber nur wenn refresh, materialize und freshness-contract grün sind und `measure-pipeline-freshness` (QUANT_CURRENT = PASS) sowie das Discover-Universum dieselbe letzte Sitzung tragen. Der Zeitplan 06:17 UTC in `supertrader-signals.yml` bleibt als Rückfall (er kam im Schnitt 5–7 Stunden zu spät).
3. Ursache finden: Job `supertrader` im Nachtlauf ansehen (`SKIP/UP_TO_DATE`, `SKIP/ALREADY_QUEUED`, `REFUSE/DATA_NOT_VALIDATED` oder Dispatch abgewiesen: Issue `[market-data-refresh]` mit Fehlertext). Lief der Supertrader-Lauf und ist rot, bleiben die Signale unverändert (Integritätstests vor dem Commit): den Lauf in den Actions ansehen.
4. Nachholen: `supertrader-signals.yml` von Hand starten. Vorher prüfen: Nachtlauf und Materialisierung fertig, der Lauf schreibt nur `supertrader/`, seine Integritätstests bleiben bindend. Ein Wiederholungslauf ist idempotent (keine neuen Handelstage, keine Minutenabrufe, kein Commit) und kostet nur Laufzeit (rund 2,5 Minuten).

