# Twelve Data — Provider-Vorbereitung

> **Status: nicht angeschlossen.** Dieses Verzeichnis enthaelt keinen Laufzeitcode und
> keine Abhaengigkeit. Vision Universe V1 laeuft vollstaendig auf dem MockProvider.

## Zweck in der Architektur

Vorgesehen fuer den **Live- und Product-Layer**: aktuelle Kurse, Charts, Referenzdaten,
Corporate Actions und die Anzeige aktueller Fundamentaldaten. Kandidat fuer Schritt 1 der
Integrationsreihenfolge.

## Unterstuetzte Datenklassen (zu verifizieren)

- Globale Markt- und Referenzdaten (Kandidat fuer `MarketDataProvider`, `ReferenceDataProvider`)
- Corporate Actions (Kandidat fuer `CorporateActionsProvider`)
- Income Statement, Balance Sheet, Cash Flow (Kandidat fuer `FundamentalDataProvider` — PIT-Eignung zu auditieren)
- Earnings/Revenue Estimates, EPS-Trends und -Revisionen (Kandidat fuer `EstimateDataProvider` — PIT-Eignung zu auditieren)

## Benoetigte Umgebungsvariablen

```
TWELVE_DATA_API_KEY=      # serverseitig, niemals im Frontend
TWELVE_DATA_BASE_URL=     # optional, Standard-Endpunkt des Anbieters
```

Schluessel gehoeren **ausschliesslich serverseitig**. Kein Schluessel im Repository, kein
Schluessel im Frontend. Ein Acceptance-Test scannt `quant/**` auf Schluesselmuster.

## Mapping-Strategie

Vendor-Felder existieren ausschliesslich in `providers/twelve-data/adapter.js`. Oberhalb dieser
Datei gibt es nur das kanonische Modell aus `quant/engines/schema.js`.

Zu klaeren: Symbol-Mapping auf `SecurityIdentifier`, Behandlung von Symbolwechseln,
Zeitzonen der Handelstage, Trennung von bereinigten und unbereinigten Kursen.

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

„Historisch abrufbar“ ist nicht dasselbe wie „survivorship-bias-freier bitemporaler
Point-in-Time-Datensatz“. Vor Auswahl fuer historische Backtests ist ein
Vendor-Due-Diligence-Test noetig. Fuer die reine Live-/Anzeigeschicht ist diese Frage
weniger kritisch.
