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

1. Log des Schritts **„Commit und Push“** lesen.
   - `Konflikt ausserhalb erzeugter Artefakte: <Datei>`: Ein anderer Commit hat dieselbe Datei geändert.
     - Kam der Commit aus einem Feature-PR? Dann den PR korrigieren (generierte Dateien auf den Stand von `main`).
     - War es ein zweiter Datenlauf? Dann einfach wiederholen. Seit ADR-005 checkt jeder Lauf die Spitze aus.
   - `Push nach N Versuchen nicht möglich`: `main` bewegt sich zu schnell. Den Lauf wiederholen.
2. `P0_DATA_PIPELINE_FROZEN` aus dem Schritt `freshness-contract`: Der Marktlauf war grün, die Materialisierung nicht. Den Job `materialize` im selben Lauf ansehen.
3. **Gate A** (vor dem Abruf) rot: Die Regressionssuite ist auf `main` rot. Zuerst den Code reparieren, dann den Abruf wiederholen.
4. **Gate B** (nach dem Abruf) rot: Die neuen Daten verletzen einen Integritätstest. Nichts wurde veröffentlicht. Die Testausgabe lesen.

Wiederholen: Actions → Workflow → „Run workflow“ auf `main`. Für einen Datenlauf ist das idempotent.

## 4. Intraday steht

- `intraday/index.json`: `dataSession.asOf` und `regularComplete`.
- Läuft `intraday-pacemaker.yml`? Schlägt der Wächter (`intraday-delivery-watchdog.yml`) an?
- Nach Börsenschluss holt der Lauf um 21:35 UTC (`intraday-snapshots.yml`) den Schluss und das Universum.
- Ist er gescheitert, holt ein manueller Lauf mit `scope=auto` nach. Das Siegel funktioniert seit 03.10. auch mit Bindestrich-Tickern.

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
