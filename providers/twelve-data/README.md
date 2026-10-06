# Twelve Data — Provider-Adapter

> **Status: gebaut, nicht scharf geschaltet.** `adapter.js` ist ein
> vollstaendiger, getesteter Adapter. Er stellt ohne `TWELVE_DATA_API_KEY`
> keine einzige Anfrage und meldet `notConfigured` — er faellt ausdruecklich
> **nicht** auf Demo-Daten des Anbieters zurueck.
>
> Vision Universe laeuft weiterhin vollstaendig auf dem MockProvider. Der
> Adapter ist Node-only und wird von keiner ausgelieferten Seite geladen;
> `quant/tests/secrets.test.mjs` (S3) prueft das.
>
> Vollstaendige Beschreibung: **`docs/VU_TWELVE_DATA_ADAPTER.md`**.
> Faehigkeiten und ihre Belege: **`docs/VU_PROVIDER_CAPABILITIES.md`**.

## Was seit Phase 2 gebaut ist

| Datei | Inhalt |
|---|---|
| `adapter.js` | Adapter mit sieben Methoden, Free-Plan-Faehigkeiten, Fehlererkennung bei HTTP 200 |
| `../../scripts/market/fetch-market-data.mjs` | Abruf, Qualitaetspruefung, JSON-Ausgabe |
| `../../scripts/market/evaluate-provider.mjs` | Pruefstand — `node scripts/market/evaluate-provider.mjs twelve-data` |
| `../../.github/workflows/market-data.yml` | taeglicher Abruf, Secret nur im Runner |

Bewertungsstand (ohne Zugang, rein deklariert):

```
Kursdaten             29 %  eingeschraenkt
Fundamental-Backtest   0 %  UNGEEIGNET  (fehlt: pointInTime, delistedSecurities)
Schaetzungen           0 %  ungeprueft
Referenzdaten         60 %  geeignet
```

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

Schluessel gehoeren **ausschliesslich serverseitig**. Kein Schluessel im
Repository, kein Schluessel im Frontend. Seit Phase 2 pruefen das acht Tests
ueber das **gesamte** Repository (`quant/tests/secrets.test.mjs`) statt nur
`quant/**`, dazu eine letzte Pruefung vor dem Commit
(`scripts/market/assert-no-secrets.mjs`).

Vorlage ohne Werte: `.env.example` im Wurzelverzeichnis.

## Mapping-Strategie

Vendor-Felder existieren ausschliesslich in `providers/twelve-data/adapter.js`. Oberhalb dieser
Datei gibt es nur das kanonische Modell aus `quant/engines/schema.js`.

Umgesetzt: Symbol-Mapping ueber `quant/engines/symbol-mapping.js` — ein
mehrdeutiges Kuerzel wird gemeldet, nicht geraten. Bereinigte und unbereinigte
Kurse sind getrennt (`adjustmentStatus`: `adjusted` / `splitAdjusted` /
`unadjusted`); `adjustedClose` traegt nur bei zugesicherter
Total-Return-Bereinigung einen Wert.

Zu klaeren bleibt: Behandlung von Symbolwechseln, Zeitzonen der Handelstage
ausserhalb der US-Boersen.

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
