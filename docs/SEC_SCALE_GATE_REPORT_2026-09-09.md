# SEC Master Universe & Large-Scale Ingestion — Gate Report

Stand: 2026-09-09

Ausgangscommit: `0316ac53e5e7765559dcb5318950920eb76c1675` (`origin/main`)

Branch: `codex/sec-master-universe-large`

## Entscheidung

**NOT READY**

Golden Five sind bestanden. Gate 100 ist fehlgeschlagen und wurde entsprechend
der Stop-Regeln beendet. Gate 500, Gate 2.000 und der vollständige Ingest wurden
nicht gestartet.

## Architektur und Änderungen

Der bestehende Pfad wurde erweitert, nicht dupliziert:

`SEC HTTP client -> SECProvider -> RawStore/Cache -> Registry/Normalizer ->`
`PIT/Quality Gates -> FactStore -> Canonical/Provider Adapter`

Neu bzw. erweitert wurden:

- automatisiertes aktuelles SEC-Universe aus
  `company_tickers_exchange.json`, mit separaten Company- und
  Security-Mapping-Records;
- stabile CIK-basierte Company-Identität; Ticker/Exchange bleiben beobachtete
  aktuelle Mappings und werden nicht zu permanenten Security-IDs erklärt;
- deterministische Gate-Samples, Golden-CIK-Overrides und ausdrückliche
  Kennzeichnung `EXTERNAL_SECURITY_MASTER_REQUIRED`;
- ein SQLite-FactStore mit WAL, atomarem Upsert, komprimierten Payloads,
  Inhalts-Digest und ohne große Produktionsdaten in Git;
- stabile Failure-Codes, zentrale Bulk-Stopps, Fortschrittslogs,
  Request-/Cache-/Retry-/HTTP-Zähler und Scale-Reports;
- ein Golden-Regression-Vergleich, der fehlende oder geänderte historische
  Facts/Filings ablehnt, neue SEC-Daten aber zulässt;
- eindeutige Workflow-Run-IDs, damit ein langlebiger Checkpoint neue Filings
  nicht überspringt;
- explizite Behandlung nicht unterstützter IFRS-/20-F-/40-F-Entities;
- Quarantäne quellseitig unmöglicher Future-Period-Facts: Raw bleibt erhalten,
  Canonical übernimmt den Fact nicht, und der Quality Report weist ihn aus;
- programmgesteuerter Sofortstopp bei kanonischer PIT-Verletzung und nach
  wiederholtem 403/429 sowie bei einer Fehlerrate über 25 Prozent.

## Universe

Der am 2026-09-09 von der SEC beobachtete aktuelle Stand enthält:

| Objekt | Anzahl |
|---|---:|
| Companies (distinct CIK) | 8.010 |
| aktuelle Ticker-/Exchange-Mappings | 10.415 |

Dies ist ein `CURRENT_SEC_MAPPING`-Universe, kein historisch investierbares
Aktienuniversum. `active/inactive`, Security-Typ, historische Listings,
Delistings, Tickerwechsel, Merger und Börsenhistorie bleiben `UNKNOWN`, soweit
die SEC-Quelle sie nicht belastbar liefert.

## Golden Five — PASS

Live-Ingest für AAPL, MSFT, NVDA, JPM und XOM:

| Messwert | Ergebnis |
|---|---:|
| Companies | 5/5 |
| Raw Facts | 150.820 |
| normalisierte Beobachtungen | 27.385 |
| Requests | 87 |
| heruntergeladene Bytes | 55.723.098 |
| Retries / 403 / 429 / 5xx | 0 / 0 / 0 / 0 |
| Laufzeit Initial-Ingest | 45,328 s |
| PIT Coverage | 100 % |
| PIT Violations | 0 |
| SQLite-Datei | 946.176 Bytes |
| komprimierte Payloads | 922.148 Bytes |

Golden Regression: **PASS 5/5**. Kein bereits committeter historischer Fact und
kein Filing fehlte oder änderte sich.

Idempotenz: **PASS**. Zwei Wiederholungen ergaben jeweils fünf `UNCHANGED`,
82 Cache Hits, 0 Netzrequests und denselben Store-Digest
`01fc5fa1c275f68d4897482f6303f40e39fd90f6a2d2c8a11b718cd3d7493a9b`.

Resume: **PASS**. Ein Lauf wurde nach zwei Companies beendet. Derselbe Run-ID-
Checkpoint setzte bei `[3/5]` fort; die ersten zwei wurden nicht erneut geladen,
am Ende waren 5/5 Companies ohne Duplikate vorhanden und die Golden Regression
bestand erneut.

## Gate 100 — FAIL, automatisch gestoppt

Der erste kontrollierte Lauf erkannte bei CIK `0001575793` einen im SEC-Raw-
Payload enthaltenen Future-Period-Fact. Der Lauf wurde beendet, der Fact
untersucht und eine explizite Raw-Quarantäne implementiert und getestet. Nach
Resume bestand das kanonische Factbook dieser Company mit 2.636 normalisierten
Beobachtungen; der eine unmögliche Raw Fact blieb als Quality Finding erhalten.

Der fortgesetzte Lauf stoppte danach regelkonform bei 23 Fehlern unter 91
untersuchten Entities (25,27 Prozent). Ursache ist die noch zu breite
SEC-Ticker-Stichprobe: Sie enthält Fonds/Trusts und weitere Entities ohne
unterstützte periodische Company-Facts. Die Fehlerschwelle wurde nicht gelockert.

| Messwert | Ergebnis |
|---|---:|
| angefordert / resolved | 100 / 100 |
| erfolgreich gespeichert | 68 |
| klassifizierte Fehler am Stopp | 23 |
| beim Stopp noch nicht verarbeitet | 9 |
| Failure-Codes | 17 `NO_FILINGS`, 4 `NO_COMPANY_FACTS`, 2 `NETWORK_ERROR` (404) |
| Raw Facts der 68 erfolgreichen Companies | 779.177 |
| normalisierte Beobachtungen | 154.157 |
| Durchschnitt / erfolgreiche Company | 2.267,01 |
| PIT Coverage | 100 % |
| kanonische PIT Violations | 0 |
| Duplikate entfernt | 0 |
| 403 / 429 / 5xx im abschließenden Teilrun | 0 / 0 / 0 |
| SQLite-Datei | 5.459.968 Bytes |
| komprimierte Payloads | 5.383.591 Bytes |

Der ursprüngliche Teilrun wurde wegen der PIT-Stop-Condition interaktiv beendet,
bevor sein Abschlussmanifest geschrieben wurde. Deshalb wird keine erfundene
Gesamtzahl für Requests, Cache-Hit-Rate oder Gesamtlaufzeit über beide
Teilsegmente berichtet. Der abschließende Resume-Teil allein hatte 29 Requests,
35,56 Prozent Cache-Hit-Rate, 0 Retries und 14,969 s Laufzeit.

Wichtige Metric Coverage unter den 68 erfolgreichen Companies:

| Metric | Coverage |
|---|---:|
| Shares Outstanding | 94,12 % |
| Net Income | 91,18 % |
| Total Assets | 91,18 % |
| Cash | 88,24 % |
| Equity | 88,24 % |
| Operating Cash Flow | 88,24 % |
| Revenue | 77,94 % |
| Capex | 75,00 % |
| Operating Income | 73,53 % |
| Cost of Revenue | 58,82 % |
| Gross Profit | 48,53 % |
| Dividends Paid | 42,65 % |

Current Assets/Liabilities, Goodwill, Intangibles, Inventory, Receivables,
Investing/Financing Cash Flow und Share Repurchases sind im derzeitigen Registry-
Scope nicht kanonisch abgedeckt (je 0 Prozent). Das ist ein `HIGH` Finding und
kein Missing-Data-PASS.

## Storage

Die bisherige committete Golden-JSON-/Inspector-Struktur belegt 6.243.467 Bytes
für fünf Companies. Eine lineare Vervielfachung ergäbe rund 12,49 GB für 10.000
Companies und wäre für Git ungeeignet.

Der neue SQLite-Store benötigt im partiellen Gate 100 5.459.968 Bytes für 68
Companies. Linear projiziert:

| Companies | Projektion SQLite |
|---|---:|
| 100 | 8.029.365 Bytes |
| 500 | 40.146.824 Bytes |
| 2.000 | 160.587.294 Bytes |
| 10.000 | 802.936.471 Bytes |

Die Projektion umfasst den normalisierten Store, nicht den separat verwalteten
Raw Cache. Produktionsdaten, Raw Responses, Checkpoints und Reports liegen unter
`.sec-data/`, `.sec-cache/` bzw. `.quant-state/` und werden nicht committet.

## Findings

### CRITICAL

Keine offene, bestätigte Datenkorruption. Die entdeckte Source-Anomalie wird
Raw erhalten, kanonisch quarantänisiert und bleibt sichtbar.

### HIGH

1. Gate 100 ist wegen 25,27 Prozent Fehlerquote fehlgeschlagen. Vor einem neuen
   Gate-100-Lauf braucht die aktuelle SEC-Mappingliste eine belastbare,
   automatisierte Operating-Company-Eligibility-/Profil-Enrichment-Stufe.
2. Der geforderte Metric Scope ist unvollständig; mehrere Bilanz- und Cashflow-
   Metrics haben noch keine Registry-/Alias-Abdeckung.
3. `ifrs-full` besitzt noch keine belastbar validierte Normalisierung. Foreign
   Issuers werden jetzt sichtbar als `UNSUPPORTED_ENTITY` behandelt, aber nicht
   vollständig ingestiert.
4. Der vollständige Raw-Cache-Bedarf ist noch nicht mit einem erfolgreichen
   100er-Gate und späteren Gates vermessen.

### MEDIUM

1. Das aktuelle SEC-Universe enthält keine verlässliche Größenklassifikation;
   eine echte Small-/Mid-/Large-Cap-Stratifizierung ist aus dieser Quelle allein
   nicht belegbar.
2. Quality-Error-Counts enthalten auch explizit quarantänisierte SEC-Source-
   Anomalien und benötigen für Release-Entscheidungen eine getrennte Darstellung
   von Raw-Source- und Canonical-Fehlern.

## Nicht gestartete Gates

- Gate 500: **NOT STARTED**
- Gate 2.000: **NOT STARTED**
- Full Universe: **NOT STARTED**

## Tests

| Zeitpunkt | Python SEC | Quant Node | Academy | Gesamt |
|---|---:|---:|---:|---:|
| Baseline auf `0316ac5` | 249 | 582 | 8 | 839 |
| finaler PR-Stand auf `origin/main @ b182e6f` | 276 | 614 | 8 | 898 |

Alle 898 ausgeführten Tests waren erfolgreich; ein zusätzlicher Python-Test für
das optionale, lokal nicht installierte PyYAML blieb wie in der Baseline
übersprungen. Der Secret-Scan fand keine Zugangsdaten.

## Survivorship und Security Master

- Survivorship-Bias-Status: **FAIL / UNKNOWN, nicht gelöst**
- Security-Master-Status: **EXTERNAL SECURITY MASTER REQUIRED**
- Gate B: bleibt **FAIL 5/5**

PIT-PASS bedeutet weiterhin ausdrücklich nicht Survivorship-PASS.

## Empfehlung

**NOT READY**

Nächster zulässiger Schritt ist nicht Gate 500, sondern die Verbesserung der
automatisierten Gate-100-Eligibility, die Erweiterung des Metric-/IFRS-Scopes und
ein erneuter Gate-100-Lauf. Erst ein vollständig bestandenes Gate 100 erlaubt
Gate 500.
