# Intrinio — Provider-Vorbereitung

> **Status: nicht angeschlossen.** Dieses Verzeichnis enthaelt keinen Laufzeitcode und
> keine Abhaengigkeit. Vision Universe V1 laeuft vollstaendig auf dem MockProvider.

## Zweck in der Architektur

Vorgesehen als **US Point-in-Time Fundamental Core**: der Anbieter dokumentiert
standardisierte und as-reported US-Finanzdaten direkt aus SEC-Filings inklusive
Filing-Zeitpunkten. Damit ist er der aussichtsreichste Kandidat fuer Schritt 2 — den
Datenbestand, von dem die Integritaet aller Backtests abhaengt.

## Unterstuetzte Datenklassen (zu verifizieren)

- Standardisierte und as-reported Fundamentaldaten (Kandidat fuer `FundamentalDataProvider`)
- Filings mit Einreichungszeitpunkten (Kandidat fuer die `Filing`-Entitaet)
- Aktive und delistete Securities (Kandidat fuer `ReferenceDataProvider` inkl. historischem Security Master)
- Corporate Actions (Kandidat fuer `CorporateActionsProvider`)

## Benoetigte Umgebungsvariablen

```
INTRINIO_API_KEY=         # serverseitig, niemals im Frontend
INTRINIO_BASE_URL=        # optional
```

Schluessel gehoeren **ausschliesslich serverseitig**. Kein Schluessel im Repository, kein
Schluessel im Frontend. Ein Acceptance-Test scannt `quant/**` auf Schluesselmuster.

## Mapping-Strategie

Vendor-Felder existieren ausschliesslich in `providers/intrinio/adapter.js`. Oberhalb dieser
Datei gibt es nur das kanonische Modell aus `quant/engines/schema.js`.

Der entscheidende Teil des Mappings ist die Zeitachse: `period_end`, `filing_date` und
der Zeitpunkt der Verfuegbarkeit muessen sauber auf `periodEnd`, `filedAt` und
`availableAt` abgebildet werden. Original und Korrektur muessen als getrennte
`revisionId` erhalten bleiben — sie duerfen einander nicht ueberschreiben.

## Offene Lizenz-Pruefpunkte

Ein API-Key ist keine Erlaubnis zur Anzeige. Vor Vertragsabschluss zu beantworten
(vollstaendige Matrix in `docs/VU_API_INTEGRATION_GUIDE.md`):

- [ ] Internal Use — duerfen die Daten intern verarbeitet werden?
- [ ] Display — duerfen Rohwerte Endkunden gezeigt werden?
- [ ] Redistribution — duerfen Daten ueber eine eigene API weitergegeben werden?
- [ ] **Derived Data** — duerfen daraus eigene Scores berechnet, gespeichert und
      kommerziell dargestellt werden? (Entscheidend fuer den VU Quant Score.)
- [ ] Historical Storage — duerfen historische Werte dauerhaft gespeichert werden?
- [ ] Caching — in welchem Umfang und wie lange?
- [ ] AI Usage — duerfen Daten in einen LLM-Kontext gegeben werden?
- [ ] Model Training — ausgeschlossen oder erlaubt?
- [ ] Retention nach Vertragsende
- [ ] Boersen-spezifische Displayrechte

**Keine Preisangaben in diesem Dokument.** Preise aendern sich; sie gehoeren in ein
datiertes Vertragsdokument, nicht in ein Repository.

## Offene Point-in-Time-Pruefpunkte

- [ ] Liefert der Anbieter `filedAt` bzw. `availableAt` je Kennzahl — oder nur `periodEnd`?
- [ ] Sind Originalmeldung und Korrektur **getrennt** abrufbar, oder wird rueckwirkend ueberschrieben?
- [ ] Enthaelt das Universum delistete und uebernommene Titel inklusive Delisting-Renditen?
- [ ] Gibt es historische Index- bzw. Universumszugehoerigkeit?
- [ ] Sind Corporate Actions als eigenes Ledger verfuegbar, nicht nur als bereinigte Kurse?
- [ ] Wie weit reicht die Historie tatsaechlich — und ab wann ist sie vollstaendig?
- [ ] Gibt es Bulk-Zugriff fuer `getPricePanel` / `getFactPanel`?

Verifikation mit den drei Mock-Faellen an echten Daten: `MOCK_RESTATEMENT`,
`MOCK_DELISTED`, `MOCK_FUTURE_DATA_LEAK` (siehe `docs/VU_MOCK_DATA.md`).

## Bekannte Einschraenkungen

Primaer US-Fokus. Fuer europaeische Titel ist ein zweiter Anbieter noetig. Die
Anbieterangabe zur Point-in-Time-Faehigkeit ist vor Vertragsabschluss technisch mit
Testfaellen zu verifizieren.
