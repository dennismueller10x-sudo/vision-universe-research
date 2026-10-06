# EODHD — Provider-Vorbereitung

> **Status: nicht angeschlossen.** Dieses Verzeichnis enthaelt keinen Laufzeitcode und
> keine Abhaengigkeit. Vision Universe V1 laeuft vollstaendig auf dem MockProvider.

## Zweck in der Architektur

Kandidat fuer **breite internationale Abdeckung** von Kurshistorie und Fundamentaldaten —
insbesondere fuer den spaeteren Ausbau ueber die USA hinaus. Alternative oder Ergaenzung
zu Twelve Data in Schritt 1 und 3.

## Unterstuetzte Datenklassen (zu verifizieren)

- Lange EOD-Kurshistorie (Kandidat fuer `MarketDataProvider`)
- Internationale Referenzdaten (Kandidat fuer `ReferenceDataProvider`)
- Fundamentaldaten (Kandidat fuer `FundamentalDataProvider` — PIT-Eignung zu auditieren)
- Bulk-Zugriff (relevant fuer `getPricePanel` / `getFactPanel`)

## Benoetigte Umgebungsvariablen

```
EODHD_API_KEY=            # serverseitig, niemals im Frontend
EODHD_BASE_URL=           # optional
```

Schluessel gehoeren **ausschliesslich serverseitig**. Kein Schluessel im Repository, kein
Schluessel im Frontend. Ein Acceptance-Test scannt `quant/**` auf Schluesselmuster.

## Mapping-Strategie

Vendor-Felder existieren ausschliesslich in `providers/eodhd/adapter.js`. Oberhalb dieser
Datei gibt es nur das kanonische Modell aus `quant/engines/schema.js`.

Bei internationaler Abdeckung zusaetzlich zu klaeren: Waehrungsbehandlung je Titel,
Boersen-Suffixe im Symbol, Feiertagskalender je Handelsplatz — alle drei beeinflussen die
Faktorberechnung direkt.

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

Der Anbieter trennt Personal- und Commercial-Plaene ausdruecklich; Personal-Plaene sind
fuer ein kommerzielles Produkt nicht ausreichend. Display- und Redistributionsrechte sind
vertragsbezogen zu pruefen. PIT-Eignung der Fundamentaldaten ist zu auditieren.
