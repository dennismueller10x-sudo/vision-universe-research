# SEC Master Universe & Large-Scale Ingestion — Phase-0-Audit

Stand: 2026-09-08

Ausgangscommit: `0316ac53e5e7765559dcb5318950920eb76c1675` (`origin/main`)

Arbeitsbranch: `codex/sec-master-universe-large`

## Verifizierte Baseline

- Der bestehende SEC-Stack ist keine Wegwerf-Lösung. Er besitzt einen zentralen
  Fair-Access-Client, SEC-Provider, XBRL-Registry, Fiskalkalender,
  Periodenrekonstruktion, Restatement-Timelines, Qualitätsprüfungen, Raw-/Fact-
  Store-Abstraktionen, Checkpoints und die kanonische Grenze zum bestehenden
  `FundamentalDataProvider`.
- Die systemweite PIT-Regel bleibt `availableAt <= decisionTime` in
  `quant/engines/schema.js`. SEC baut keine zweite Backtest- oder Provider-
  Architektur auf.
- Baseline-Tests auf diesem Commit: Python SEC `249/249` erfolgreich (ein Test
  wegen fehlendem optionalem PyYAML übersprungen), Quant-JavaScript `582/582`,
  Academy `8/8`. Insgesamt `839/839` ausgeführte Tests erfolgreich.
- Golden Five: AAPL, MSFT, NVDA, JPM und XOM sind vorhanden. Die fünf Bundles
  enthalten zusammen 4.271 kanonische Fakten, 458 Filing-Records und 604 als
  Restatement markierte Revisionen. Direkte Prüfung der Bundles: 0 fehlende
  `availableAt`, 0 Fakten mit `availableAt < periodEnd`, 0 doppelte kanonische
  Schlüssel. Der committete Primärquellen-Audit enthält 121 direkte Matches,
  40 Matches ohne kanonisches Gegenstück und 0 Abweichungen.
- Gate A und C sind für 5/5 `RUNTIME_VERIFIED` bestanden. Gate B bleibt für 5/5
  FAIL. SEC liefert keinen historischen investierbaren Security Master; PIT und
  Survivorship Bias bleiben getrennte Probleme.

## Wiederverwendbare Komponenten

- `scripts/quant/sec/http_client.py`: zentraler User-Agent, 5 req/s Token Bucket,
  begrenzte Retries, Backoff/Jitter, Timeout, gzip-Disk-Cache und Request-Dedupe.
- `provider.py`, `registry.py`, `fiscal.py`, `normalize.py`, `periods.py` und
  `restatements.py`: CIK-basierter Abruf und deterministische, PIT-fähige
  Normalisierung mit Alias-Prioritäten und Revisionshistorie.
- `model.py`, `canonical.py` und `providers/sec/adapter.js`: bestehende
  kanonische Integrationsgrenze; rückwärtskompatibel zu erweitern.
- `quality.py`, `gates.py`, `coverage.py`: gute Basis für Company-Prüfungen und
  Coverage, aber noch kein vollständiger Scale-Gate-Report.
- `RawStore`, `FactStore`, `CheckpointStore`: geeignete Abstraktionspunkte für
  skalierbarere Implementierungen.

## Nicht skalierbar oder fachlich vor dem 100er-Gate zu beheben

1. **Kein automatisiertes Universe.** `quant/config/sec-universe.json` enthält
   ausschließlich fünf manuell gepflegte Unternehmen. Eine Company-/Security-
   Universe-Schicht und deterministische Gate-Samples fehlen.
2. **Company und Security sind vermischt.** `security_for_company()` erzeugt je
   CIK genau ein Security-Objekt. Mehrere Ticker/Share Classes eines CIK werden
   nicht modelliert; `securityId = sec_<ticker>` ist bei Tickerwechsel instabil.
3. **Unbelegte Security-Aussagen.** Das kanonische Objekt setzt pauschal
   `assetType=equity`, `status=active`, `country=US`, `currency=USD`. Als
   `firstTradingDate` wird das erste strukturierte Fiskalperiodenende verwendet.
   SEC belegt keine dieser Listing-Aussagen zuverlässig.
4. **Incremental-Checkpoint-Regressionsrisiko.** `ingest_universe(resume=True)`
   überspringt einen im langlebigen Checkpoint als erledigt markierten CIK, ohne
   dessen aktuelle Filing-Signatur zu prüfen. Der Wochenworkflow verwendet den
   konstanten Run-ID-Default und kann deshalb neue Filings übergehen.
5. **Stop Conditions fehlen auf Bulk-Ebene.** 403/429 werden pro Request
   wiederholt; nach Erschöpfung läuft der Universe-Loop mit der nächsten Company
   weiter. Ein globaler Circuit Breaker für wiederholte 403/429, hohe Fehlerrate,
   Storage-Wachstum, PIT-, Duplicate- und Checkpoint-Fehler fehlt.
6. **Fehlerklassifikation fehlt.** Bulk-Fehler werden nur als `FAILED` plus freie
   Exception-Zeichenkette gespeichert. Die geforderten stabilen Fehlercodes und
   Run-weite Statistiken fehlen.
7. **Foreign Issuers sind nur syntaktisch zugelassen.** 20-F/40-F und Amendments
   passieren den Form-Filter, die Metric Registry enthält aber keine
   `ifrs-full`-Mappings und es gibt keinen Foreign-Issuer-Test. Diese Entities
   würden überwiegend als unmapped erscheinen.
8. **Metric Scope ist unvollständig.** Die Registry kennt bereits mehrere
   Kernkennzahlen, aber die kanonische Exportgrenze veröffentlicht nur 13
   Metrics. Unter anderem Current Assets/Liabilities, Goodwill, Intangibles,
   Inventory, Receivables, Investing/Financing Cash Flow, Repurchases,
   Dividends und Weighted-Average Shares fehlen am Consumer-Grenzmodell.
9. **Storage ist ein Release-Blocker.** Die 18 committeten SEC-Dateien belegen
   6.243.467 Bytes, davon 2.527.101 Bytes Canonical und 3.359.541 Bytes Inspector.
   Das sind 1.248.693 Bytes pro Golden-Company. Eine rein lineare Projektion
   ergibt 124,9 MB / 100, 624,3 MB / 500, 2,50 GB / 2.000 und 12,49 GB / 10.000
   sowie tausende Dateien. Raw-Payloads werden zusätzlich mit geschätzt 10–40 MB
   unkomprimiert pro Company dokumentiert. Der aktuelle Git-/JSON-Ausgabepfad
   darf daher nicht vervielfacht werden.
10. **Scale-Observability fehlt.** Es gibt Request/Cache/Retry-Zähler im Client,
    aber keinen vollständigen Run-Report mit Fortschritt, Statusverteilung,
    403/429/5xx, Cache-Hit-Rate, Throughput, Speicherwachstum und Metric-Coverage.

## Phase-0-Entscheidung

**NOT READY** für das 100er-Gate. Golden Five sind fachlich stabil und werden als
Regression-Baseline wiederverwendet. Vor einem Live-100er-Ingest werden zuerst
Universe/Identity, Incremental-Sicherheit, Bulk-Stop-Conditions, Fehlerklassen,
Run-Reporting und die Massendatenablage erweitert. Gate B bleibt FAIL bzw.
`EXTERNAL SECURITY MASTER REQUIRED` und wird nicht angehoben.

## Nachtrag nach Implementierung und Scale-Versuch (2026-09-09)

Die oben genannten technischen Phase-0-Blocker wurden mit wiederverwendeten
Abstraktionen adressiert. Golden Five bestanden Live-Ingest, Regression,
Idempotenz und Resume. Das anschließend gestartete Gate 100 wurde jedoch bei
23/91 Fehlern (25,27 Prozent) regelkonform gestoppt. Der Status bleibt deshalb
**NOT READY**. Verifizierte Messwerte und Findings stehen in
`docs/SEC_SCALE_GATE_REPORT_2026-09-09.md`.
