# Supertrader 2.0 – Datenvertrag: historische Branchengruppen (PIT-SIC) für Turtle und Weinstein

Stand: 20. Oktober 2026. Status: **Datenbasis gebaut (eigener Quant/SEC-PR), Adapter vorbereitet, keine Ebene und keine Schwelle gesetzt.** Nachtrag unten: „Stand nach dem PIT-SIC-Fundament“.
- Freigabe des Owners: Die Verfügbarkeit gezielt prüfen und einen Vertrag vorbereiten.
- Nicht freigegeben: eine neue Datenpipeline, kostenpflichtige Anbieter und eigene Zuordnungen „eng“/„lose“.

Maschinenlesbar: `STRATEGY-DATA-DEPENDENCIES.json`, Eintrag `PIT_INDUSTRY_GROUPS`.

## Wofür

| Regel | Methode | Bedarf |
|---|---|---|
| TUR-LIMIT6 / TUR-LIMIT10 (`TUR-SF-LIMIT-CORR`) | Turtle S1/S2 | Höchstens 6 Units je Richtung in eng korrelierten, 10 in lose korrelierten Märkten. Die Engine-Mechanik ist umgesetzt (`methods/turtle.mjs#correlationLimitBreach`); es fehlt die Gruppenzugehörigkeit zum Zeitpunkt. |
| WEIN-GROUP (`WEIN-SF-GROUP`) | Weinstein Investor/Trader | Kein Long-Kauf in einer negativen Branchengruppe, Gruppen-Stage zuerst prüfen. Braucht die Zugehörigkeit **und** einen Gruppenchart. |

## Geprüfte Verfügbarkeit

Gezielte Stichprobe am 20.10.2026: etwa 20 Abrufe mit dem SEC-User-Agent des Repositorys, 4 Emittenten, 12 Filing-Header und ein Quartal der Financial Statement Data Sets.

1. **`data.sec.gov/submissions/CIK##########.json`** enthält nur die **aktuelle** SIC. Als Historie ist diese Quelle ungeeignet.
2. **Filing-Header** (`Archives/edgar/data/<cik>/<accession>.hdr.sgml`) halten die SIC **zum Einreichungszeitpunkt** fest.

   | Emittent | Erstes 10-K | Mittleres 10-K | Letztes 10-K |
   |---|---|---|---|
   | Amazon | 1998 (10-K405): **2731** (Buchverlag) | 2012: 5961 | 2026: 5961 (aktuell) |
   | Apple | 3571 | 3571 | 3571 |
   | Netflix | 7841 | 7841 | 7841 |
   | IBM | 3570 | 3570 | 3570 |

   Die historische SIC weicht also von der heutigen ab und ist rekonstruierbar.
   - `ACCEPTANCE-DATETIME` steht in den Stichproben ab 2003, nicht aber 1994/1998. Dort ist das Einreichungsdatum der früheste bekannte Zeitpunkt (Tagesgenauigkeit).
3. **SEC Financial Statement Data Sets** (`www.sec.gov/files/dera/data/financial-statement-data-sets/<yyyy>q<n>.zip`, quartalsweise ab 2009q2).
   - `sub.txt` enthält je XBRL-Filing: `adsh, cik, sic, form, filed, accepted`.
   - Das ist eine Bulk-PIT-Quelle für alle 10-K/10-Q-Einreicher im Snapshot-Fenster 2016–2026.
   - Ein Quartal hat gezippt etwa 100 MB; das winzige Quartal 2009q2 wurde zur Formatprüfung geladen.
4. **CIK je Snapshot-Listing:** Die bestehende Zuordnung `scripts/supertrader/validation/sec-pit.mjs` hat im Lauf 39392734794 6.148 von 9.211 Segmenten eine SEC-Historie zugeordnet, delistet 2.101 von 3.226.

Alle Quellen sind öffentlich (SEC, gemeinfrei) und kostenlos. Die SEC-Fair-Access-Regeln (deklarierter User-Agent, Ratenbegrenzung) gelten.

## Grenzen (deklariert)

- **SIC ist keine Korrelationsmessung.** Sie ist die Klassifikation des Registranten durch die SEC (4 Stellen). „Closely / loosely correlated markets“ der Turtle-Regeln sind Futures-Marktgruppen. Die Abbildung auf SIC-Ebenen ist eine **Ableitung ohne Quellenzahl**.
- **Abdeckung:**
  - ETFs, Listings ohne CIK-Zuordnung und frühe Zeiträume ohne Filing haben keine Gruppe.
  - Ausländische 20-F-Einreicher sind in den Financial Statement Data Sets erst ab etwa 2017 enthalten (XBRL); davor bleiben nur die Filing-Header.
  - `groupsOf` liefert für sie `null`. Der Lauf zählt sie (`correlationGroupMissing`) und ist dann als `ENFORCED_PARTIAL_GROUP_COVERAGE` gekennzeichnet, nie als vollständig durchgesetzt.
- **Kein Back-fill:** Vor dem ersten gesehenen Filing ist die Gruppe unbekannt.
- **Weinstein:** Die Zugehörigkeit allein reicht nicht. WEIN-GROUP verlangt die Stage des Gruppencharts. Ein daraus gebildeter Mitgliederindex ist eine eigene Konstruktion und eine eigene Owner-Entscheidung.

## Vertrag

```
sicHistory(cik) -> [{ sic, effectiveFrom, accession, form, source }]
  effectiveFrom = Acceptance-Zeitpunkt des Filings (FSDS `accepted` bzw. Header ACCEPTANCE-DATETIME),
                  sonst Einreichungsdatum (Tagesgenauigkeit); eine SIC gilt bis zum nächsten abweichenden Filing
  source        = 'FSDS_SUB' | 'FILING_HEADER'

sicAt(cik, t) -> sic | null        // letzte effectiveFrom <= t; null vor dem ersten Filing

groupsOf(securityId, priorSessionDate) -> { closely, loosely } | null
  securityId -> cik über die bestehende Zuordnung (sec-pit.mjs); ohne CIK: null
  closely / loosely = level(sicAt(cik, priorSessionDate))  mit OWNER-GEWÄHLTER Ebenenzuordnung
  // Die Engine fragt mit dem Datum der VORHERIGEN Sitzung (methods/turtle.mjs, Review SF2-R2-06)
```

**Abnahmeprüfungen für die spätere Pipeline:**
- Hash-gepinnte Rohdateien.
- PIT-Test: Die SIC eines Filings ist vor seinem Acceptance-Zeitpunkt unsichtbar.
- Abdeckungsbericht je Snapshot-Segment.
- Stichprobenabgleich FSDS gegen Filing-Header.
- Keine Werte aus der aktuellen Submissions-API in historischen Zeitpunkten.

## Offene Owner-Entscheidungen

Bewusst **nicht** umgesetzt:

1. Welche SIC-Ebene gilt als „eng“, welche als „lose korreliert“? Kandidaten: 4-stellige Industry, 3-stellige Industry Group, 2-stellige Major Group, Division.
2. Verwendet Weinsteins „Gruppe“ dieselbe Ebene? Wie wird der Gruppenchart gebildet?
3. Bau der Pipeline als eigener Quant/SEC-PR (Bulk-Abruf von etwa 70 Quartalsdateien plus Header für Nicht-XBRL-Fälle).

Bis dahin bleibt `TUR-SF-LIMIT-CORR` `DATA_BLOCKED`. Die Turtle-Engine bleibt `RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION`.

## Stand nach dem PIT-SIC-Fundament (20.10.2026)

Bericht: `docs/HISTORICAL_SIC_PIT_REPORT.md`. Daten: `quant/data/sec/sic-history` (Erzeuger `scripts/quant/cli.py sic-history`). Abfrage: `core/industry-classification.js#getIndustryClassification`.

**Korrekturen an der Verfuegbarkeitspruefung oben:**
- FSDS `sub.txt` ist nicht durchgaengig verlaesslich. In 2013q3 bis 2014q2 tragen Zeilen falsche SIC-Werte: 233 von 3.017 Paaren widersprechen dem Filing-Header, alle in diesem Fenster. Werte aus dem Fenster gelten deshalb nur mit Header-Bestaetigung.
- FSDS `accepted` ist auf die Minute gerundet. `knownAt` ist deshalb das Ende der Minute.
- Die `acceptanceDateTime` der Submissions-API liegt um den UTC-Offset zu spaet und wird nicht verwendet.
- Ohne Acceptance-Zeit (alte Header) gilt das Ende des spaeteren Tags aus Einreichungsdatum und Header-Erzeugungstag.

**Adapter:** `scripts/supertrader/source-faithful/adapters/industry-groups.mjs` (sf-industry-groups-1.1.0), Tests `tests/sf-industry-groups.test.mjs`. Pruefergebnis Turtle und Entscheidungsvorlage Weinstein: `SUPERTRADER_2_INDUSTRY_GROUP_DECISIONS.md`.

| Funktion | liefert | verlangt |
|---|---|---|
| `cikCandidatesFromSegments(segs, secPit)` | securityId -> CIK, begrenzt auf das Segmentfenster, mit Evidenzklasse (`CURRENT_TICKER_MAPPING`, `NAME_EXACT_XBRL_IN_LISTING_WINDOW`, `UNSPECIFIED`) | `secPit` = Ausgabe von `validation/sec-pit.mjs` (`{ cik, how }` je Listing) |
| `makeTurtleGroupsOf({ classification, cikCandidates, decision })` | `groupsOf(id, priorSessionDate)` fuer `runTurtle`; `conformance(runResult)` mit `ruleConformance: NOT_ESTABLISHED` | `decision = { ref, basis: 'SIC_PROXY', closely, loosely, maxAgeDays, acceptedIdentityEvidence }` |
| `makeWeinsteinGroupMembership(...)` | `groupOf`, `rosterAt` (nur Zugehoerigkeit; `groupStage: DATA_BLOCKED`) | `decision = { ref, level, maxAgeDays, acceptedIdentityEvidence }` |

Verhalten:
- Ohne Entscheidung wirft der Adapter `MODEL_ASSUMPTION_REQUIRED`; es gibt keine Voreinstellung.
- Unbekannte Zustaende liefern `null`, gezaehlt mit Grund (`UNKNOWN_NOT_INDEPENDENT`).
- Eine heutige Ticker-Zuordnung zaehlt nur, wenn die Entscheidung `CURRENT_TICKER_MAPPING` ausdruecklich annimmt.
- Der Research-Runner ist nicht verdrahtet. `TUR-SF-LIMIT-CORR` und `WEIN-SF-GROUP` bleiben `DATA_BLOCKED`.

**Pruefergebnis Turtle (20.10.2026):** W-TUR (gedruckte S. 16) bestimmt eng und lose korrelierte Maerkte nur durch Futures-Beispiele. Es gibt weder Mass noch Fenster noch Schwelle. Eine Umsetzung ueber historische Kurskorrelation ist damit nicht quellengedeckt; die Limits bleiben blockiert.

**Fuer die Freigabe noch offen (Owner):**
1. Ob TUR-LIMIT6/10 ueberhaupt mit einer deklarierten VU-Modellannahme belegt werden (SIC-Stellvertreter oder Kurskorrelation mit benannten Parametern). Beides ist keine Originalregel.
2. `maxAgeDays`: wie alt die letzte SIC-Beobachtung hoechstens sein darf. In der Messung stammen 86 % der beobachteten Punkte aus den letzten 100 Tagen (docs/historical-sic/COVERAGE.json).
3. Weinstein: Gruppenebene und Gruppenchart, siehe Entscheidungsvorlage. Dazu, welche Identitaetsbelege gelten.
4. Danach in einem eigenen PR mit Vorher/Nachher-Vergleich:
   - Runner-Verdrahtung;
   - Statuswechsel in `STRATEGY-SOURCE-CONTRACTS.json` / `STRATEGY-DATA-DEPENDENCIES.json`;
   - Lauf auf dem Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`.
