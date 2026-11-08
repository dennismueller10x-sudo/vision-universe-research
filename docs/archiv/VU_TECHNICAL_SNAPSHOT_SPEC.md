# VU Technical Snapshot Spec

**Module:** `snapshot.js` (`snapshot-1.0.0`, `evidence-1.0.0`), `storage.js`

## AnalysisSnapshot

```
snapshotVersion, snapshotId, contentHash,
instrumentId, analysisTime, dataCutoff,
engineBundleVersion, methodologyVersion, elliottMethodologyVersion,
parametersHash, dataVersion, dataHash, universeVersion,
primaryScenarioId, alternativeScenarioIds[],
signalRefs[]        { engine, engineVersion, parametersHash, state, value }
annotationRefs[]    annotationIds
evidenceRefs[]      evidenceIds
opportunityScore, createdAt, supersedesSnapshotId,
frozen { lastClose, scenarios[] (Entry/Invalidation/Targets/Confidence), tradeSetup, elliott }
```

`snapshotId = snap_<hash(instrument, analysisTime, dataVersion, parametersHash, methodologyVersion)>`.
`contentHash` sichert den Inhalt. Beide sind deterministisch: Snapshot bei T aus dem Präfix ≡
Snapshot bei T aus der vollen Serie mit Cutoff (Test SN3).

## Unveränderlichkeit

* `SnapshotStore.put` lehnt ab, einen vorhandenen `snapshotId` mit anderem `contentHash` zu
  überschreiben; identische Wiederholungen sind idempotent.
* Datenrevision → neue `dataVersion` → neuer `snapshotId` mit `supersedesSnapshotId` (Test SN2).
* Stores: `MemoryStore` (Browser/Tests), `JsonFileStore` (Node/CI, `quant/data/technical/
  snapshots/`). Interface `put · get · list · latestFor · count`; DuckDB/Parquet/PostgreSQL/Object
  Storage später dahinter. Engines kennen kein Storage.

## Evidence Foundation (Projected vs Actual)

`createEvidenceRecord(snapshot, scenario)` → `scenarioClass, snapshot, entry, invalidation,
targets, eventualOutcome=null, timeToTarget, timeToInvalidation, MFE, MAE`.

`evaluateOutcome(record, series)` ist walk-forward (nur Bars **nach** `dataCutoff`):
Entry beim ersten Berühren der Zone; danach `INVALIDATION`, `TARGET1_…`, `ALL_TARGETS`,
`OPEN`, `INVALIDATED_BEFORE_ENTRY`, `TARGET_WITHOUT_ENTRY`. **Same-Bar-Policy**: berührt eine
Daily-Bar Stop und Target, zählt der Stop (Reihenfolge ohne Intraday unbekannt).

`aggregateEvidence(records, minEffectiveSample = 30)`: effektives N zählt überlappende
Snapshots desselben Instruments/Monats einmal. Unter der Mindeststichprobe: `displayable:
false`, keine Quote (Test EV1). Die UI zeigt daher **keine** historischen Trefferquoten.

Ausgeliefert: `quant/data/technical/evidence-walkforward.json` — NVDA/MSFT-Snapshots zu den
Jahresanfängen 2022–2026 mit damaligem Datenstand, Annotationen (AUTO/ELLIOTT) und
walk-forward ausgewertetem Outcome. Das ist die Datenbasis für die spätere Ansicht
„Projection at 2024-01-01 vs. Actual“.

## Experiment Registry (vorgesehen)

`experimentId, hypothesis, parameter space declared before run, datasets, training/validation/
test period, number of attempted variants, metrics, result, decision` — Pflicht, bevor
Parameter (Pivot-Schwellen, Gewichte, Fib-Toleranzen) verändert werden. In V1 sind alle
Parameter Designwerte ohne Optimierung; eine Registry-Datei ist noch nicht angelegt.
