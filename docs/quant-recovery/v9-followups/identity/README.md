# V9 Folgearbeit – Research-Identitätsregister (opt-in)

Status: **Research-Option, standardmäßig aus**. `productionApproved=false`. Kein Produktiv-Aufrufer schaltet sie ein.

## Inhalt

- `quant/engines/research-identity-evidence.cjs` (`research-identity-evidence-1.0.0`): genau die fünf V9-Dossier-Bindungen
  BGC, COHR, DCOM, SGI, TRAK (Owner-Entscheid 2026-10-28; die 132 Bindungen mehrdeutiger IDs aus dem V9-Vorschlag sind **nicht** enthalten).
  Erzeugt mit `scripts/quant/v9-followups/identity/build-identity-registry.cjs` aus `docs/quant-recovery/v9/identity/identity-evidence-proposal.json` (PR #1028).
- `weekly-real-adapter.cjs#createLoader(root, options)`: generisches Options-Objekt, jede Option opt-in, unbekannte Schlüssel → `INVALID_LOADER_OPTIONS`.
  - `identityEvidence: true` – wendet Bindungen mit `evidenceLevel = SEC_SAME_DAY_PRICE_AND_COVER` an (BGC, COHR, DCOM, SGI).
  - `identityEvidenceAllowCoverPageOnly: true` – zusätzlich `COVER_PAGE_ONLY` (TRAK). TRAK hat keinen SEC-Preisbeleg; die Identität stützt sich nur auf Cover/Ticker/Börse. Deshalb die strengere Variante: eigene, ausdrückliche Freigabe.
- Ohne Option wird das Register nicht einmal geladen; `createLoader(root)` ist unverändert.

## Prüfungen im gebundenen Zweig (fail closed)

| Prüfung | Fehler |
|---|---|
| jede ersetzte Master-Zeile (`replacesCanonicalIds`) vorhanden | `IDENTITY_EVIDENCE_MASTER_ROW_MISSING` |
| keine weitere Master-Zeile an der Baseline-ID, Ticker gleich, kanonische ID nicht geteilt | `IDENTITY_EVIDENCE_MASTER_ROWS_CHANGED` |
| `sha256(JSON.stringify(points ∈ [checkedFrom, checkedTo]))` = `historyGuard.pointsSha256` (Adapter-`hash()`) | `IDENTITY_EVIDENCE_HISTORY_GUARD_MISMATCH` |
| `asOf − lastConfirmedCover.filingDate ≤ 400 Tage` | `IDENTITY_EVIDENCE_EXPIRED:<Tage>` |
| Reihe auf `[validFrom, validTo]` geschnitten, danach unveränderte `validate()` | deren Codes |

Rückgabe: zusätzliche Warnungen `SOURCE_RESOLVED_IDENTITY_BINDING`, `SERIES_RESTRICTED_TO_SOURCED_INTERVAL` und Objekt `identityEvidenceBinding`
(CIK, Emittent, kanonische ID, ersetzte Zeilen, MIC, Klasse, Evidenzstufe, Intervall, letzter Cover-Beleg, Cover-Alter, Registry-Hash).
Das bestehende Feld `identityEvidence` (String-Provenienz aus `validate()`) behält seinen Typ.

## Dateien

| Datei | Inhalt |
|---|---|
| `before-after.json` | Paritätsbeweis Default-Pfad (alle 6.190 IDs, Basis-Adapter vs. neuer Adapter), Zählungen default / opt-in / opt-in + Cover, Gründe je gebundener ID |
| `independent-check.json` | unabhängige Python-Prüfung (stdlib) aus Reihen, Master und Register, inkl. 40/40 Quell-Hashes gegen den privaten SEC-Cache |

Reproduktion:

```bash
git show <base>:quant/engines/weekly-real-adapter.cjs > <private>/weekly-real-adapter.base.cjs
node scripts/quant/v9-followups/identity/before-after.cjs --baseline-adapter <private>/weekly-real-adapter.base.cjs --baseline-ref <base> --out docs/quant-recovery/v9-followups/identity/before-after.json
python3 -I scripts/quant/v9-followups/identity/check_identity_registry.py --root . --before-after docs/quant-recovery/v9-followups/identity/before-after.json --cache <private>/v9-private/identity/http-cache --out docs/quant-recovery/v9-followups/identity/independent-check.json
```

## Ergebnis (main `07dfe5dd55`)

| Modus | QUALIFIED |
|---|---|
| Basis-Adapter (main) | 4.449 |
| neuer Adapter, Default | 4.449 (6.190/6.190 Ausgaben byte-identisch) |
| `{ identityEvidence: true }` | 4.453 (+BGC, COHR, DCOM, SGI) |
| `{ identityEvidence: true, identityEvidenceAllowCoverPageOnly: true }` | 4.454 (+TRAK) |

Alle 180 `AMBIGUOUS_LISTING_IDENTITY` bleiben in jedem Modus bestehen.

## Grenzen

- Kein Eingriff in den Security-Master, in Produkte oder veröffentlichte Werte. Die Bindungen gelten nur für Offline-Research.
- Der History-Guard deckt nur `[checkedFrom, checkedTo]` ab; neuere Wochen sind über den Cover-Ablauf (400 Tage) begrenzt.
- Jede Änderung von `weekly-real-adapter.cjs` ändert dessen Code-Hash: bereits materialisierte Backtest-Generationen melden danach
  `STALE_INPUT_SNAPSHOT` mit `CALCULATION_CODE`, bis sie neu materialisiert werden (Finanzwerte unverändert, siehe Parität).
