# M-B6 – Umsatzbelege als Stufe vor dem Bundle

Stand 2026-10-08 · gestapelt auf #505 (M-B5) und #481 (Kern 1.19.0)

```
SEC RAW (companyfacts.zip) -> CORE NORMALIZATION -> REVENUE EVIDENCE -> FUNDAMENTAL BUNDLE (+ PIT) -> CONSUMERS
```

## Stufe `cli.py revenue-evidence` (`scripts/quant/sec/revenue_evidence.py`)

1. **Welche Einreichungen**: genau die, für die der Kern einen Beleg braucht. Dieselbe Normalisierung läuft ohne Belege und meldet jede solche Einreichung als `AMBIGUOUS_AGGREGATE`. Ein Rohfakten-Vorfilter (Revenues kleiner als ein Vertragsumsatz derselben Einreichung, Einheit und Periode) erspart die Normalisierung der übrigen Emittenten. Gemessen 2026-10-08: 346 von 5.146 Emittenten, 2.104 Einreichungen. Der Vorfilter hatte in 400 zufälligen abgelehnten Emittenten 0 falsch-negative Fälle; der Consumer-Lauf prüft das ohnehin selbst.
2. **Fortsetzbar**: vorhandene Entscheidungen bleiben, auch die aus Store 1.1.0. Geholte Einreichungen liegen im Actions-Cache (`actions/cache/restore` und `save` mit `if: always()`). Erster Lauf: 0 offen, 0 SEC-Anfragen, rund 8 Minuten.
3. **Anfragesicher**: der Fair-Access-Client (`SECHttpClient`, ≤ 5/s, Retry, Cache) und `--max-filings` als Budget.
4. **Kein scheinbar vollständiger Store**: ein vorübergehender Fehler (Netz, 403/429/5xx nach Retries, Budget) wird als `build.pending` eingetragen und nie als Entscheidung. Dann gilt `complete=false` und exit 3; der Workflow baut und committet nichts. Ein dauerhaftes 404 oder eine unlesbare Einreichung ist `AMBIGUOUS` (`FILING_NOT_READABLE`). Geschrieben wird atomar (tmp + `os.replace`), auch an Zwischenständen, dort immer mit `complete=false`.
5. **Deterministisch**: sortiert, ohne Laufzähler in der Datei. Gleiche Eingaben ergeben gleiche Bytes (Test). Laufzähler wie Anfragen und Cache-Treffer stehen in stdout und der Step-Summary.

## Prüfung im Consumer-Lauf (`cli.py consumer`, hart)

| Prüfung | Fehlercode |
|---|---|
| Schema `vu-sec-revenue-statement-evidence-2.0.0` | `REVENUE_EVIDENCE_SCHEMA` |
| Builder-Version | `REVENUE_EVIDENCE_BUILDER` |
| Kernversion (`NORMALIZATION_LOGIC_VERSION`) | `REVENUE_EVIDENCE_CORE_VERSION` |
| Registry-Version | `REVENUE_EVIDENCE_REGISTRY_VERSION` |
| Build-Commit: git kennt ihn, Kerncode (`scripts/quant/sec`, Registry) identisch mit HEAD | `REVENUE_EVIDENCE_BUILD_COMMIT` |
| `complete=true`, nichts offen | `REVENUE_EVIDENCE_PARTIAL` |
| Universum (SHA-256 der Namensschicht) | `REVENUE_EVIDENCE_UNIVERSE` |
| Alter 0–14 Tage gegen `--as-of` | `REVENUE_EVIDENCE_FRESHNESS` |
| Laufzeit: jede Einreichung, die der Kern braucht, hat eine Entscheidung | `REVENUE_EVIDENCE_UNIVERSE` (exit 2) |

Inkompatibel bedeutet exit 2, keine Bundles im Commit. Der heute committete Store 1.1.0 wird abgelehnt (SCHEMA), bis die Stufe ihn neu schreibt. `--unverified-evidence-for-local-research` existiert nur für lokale Forschung, wird in `consumer_coverage.json` als `SKIPPED_LOCAL_RESEARCH` vermerkt, und ein Test verbietet es im Workflow.

## Tests

`scripts/quant/tests/test_revenue_evidence_stage.py` (13):
- Belege entstehen vor dem Bundle (Workflow-Reihenfolge).
- Der Datenlauf überspringt das Gate nie.
- Evidence und PIT-Speicher werden mitcommittet.
- Unvollständige, veraltete und inkompatible Stores werden abgelehnt (jede Prüfung einzeln).
- Die richtige Version wird akzeptiert.
- Ein Budget-Abbruch wird im nächsten Lauf fortgesetzt, ohne entschiedene Einreichungen erneut zu holen.
- 404 ist eine Entscheidung, 503 nicht.
- Determinismus.
- Der Build-Commit wird gegen den Checkout geprüft.
