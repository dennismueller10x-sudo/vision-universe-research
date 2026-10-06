# MockProvider (aktiv) — Provider-Vorbereitung

> **Status: nicht angeschlossen.** Dieses Verzeichnis enthaelt keinen Laufzeitcode und
> keine Abhaengigkeit. Vision Universe V1 laeuft vollstaendig auf dem MockProvider.

## Zweck in der Architektur

Der einzige in V1 aktive Adapter. Er erzeugt ein deterministisches synthetisches Universum
und erfuellt alle sieben Provider-Interfaces. Die gesamte Anwendung — Screener, Quant
Scores, Radar, Strategien, Backtests, AI — laeuft ohne API-Key, ohne Netzwerk und ohne
Vertrag auf diesem Adapter.

Implementierung: `quant/engines/mock-provider.js` und `quant/engines/mock-generator.js`.

## Unterstuetzte Datenklassen (zu verifizieren)

Alle sieben Interfaces sind implementiert. `EstimateDataProvider`, `MacroDataProvider`
und `NewsDataProvider` geben bewusst `unavailable` mit Begruendung zurueck, statt
synthetische Konsens-, Makro- oder Nachrichtendaten zu erfinden.

## Benoetigte Umgebungsvariablen

```
keine
```

Schluessel gehoeren **ausschliesslich serverseitig**. Kein Schluessel im Repository, kein
Schluessel im Frontend. Ein Acceptance-Test scannt `quant/**` auf Schluesselmuster.

## Mapping-Strategie

Vendor-Felder existieren ausschliesslich in `providers/mock/adapter.js`. Oberhalb dieser
Datei gibt es nur das kanonische Modell aus `quant/engines/schema.js`.

Der Adapter kennt die kompakte interne Speicherform des Generators und expandiert sie in
kanonische Objekte — genau die Grenze, an der auch ein echter Vendor uebersetzen wuerde.

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

Synthetische Daten. Keine realen Unternehmen, keine realen Marktdaten, keine reale
Wertentwicklung. Details und bewusste Vereinfachungen in `docs/VU_MOCK_DATA.md`.
