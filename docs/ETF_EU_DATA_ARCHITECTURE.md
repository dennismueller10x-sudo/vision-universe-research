# EU-/UCITS-ETF-Daten: Architektur

Stand: 05.10.2026.

## Ebenen

```
Fonds (Teilfonds, ESMA-Register)  ──  Anteilklasse (ISIN, FIRDS)  ──  Listing (ISIN × Handelsplatz-MIC)
        │ UCITS, Verwalter,                │ Name, CFI, Währung,             │ erster Handelstag, aktiv
        │ Herkunftsstaat, Vertrieb         │ Emittent (Fonds-LEI), Domizil   │
```

- **Anteilklasse** ist der Schlüssel (ISIN). Quelle: ESMA FIRDS, je ISIN über alle
  Handelsplatz-Datensätze zusammengeführt: vollständigster Name, LEI mit GLEIF-Kategorie
  `FUND`, Domizil aus der Fonds-LEI oder – ohne Fonds-LEI – aus dem ISIN-Präfix
  (`domicileBasis = ISIN_PREFIX`).
- **Fonds** kommt aus dem ESMA-Fondsregister. Das Register führt keine ISIN; die
  Zuordnung läuft über den normalisierten Fondsnamen (Wortanfang des Anteilklassennamens,
  mindestens drei Wörter, längster Treffer) und gleiches Domizil. Mehrdeutige Treffer
  werden verworfen. Konfidenz MEDIUM.
- **Listing** = ISIN × MIC aus FIRDS.

## Pipeline (GitHub Actions, Marker `[vorsorge-fundamentals]`)

| Schritt | Skript | Ausgabe | Veröffentlicht |
|---|---|---|---|
| SEC Risk/Return (US-Kosten, Vorstand) | `ingest-sec-rr.mjs` | `data/sources/sec-rr-costs.json` | ja |
| ESMA FIRDS + GLEIF | `ingest-esma-firds.mjs` | `data/eu/etf-eu-index.json` | ja |
| ESMA-Fondsregister | `ingest-esma-funds.mjs` | `data/eu/etf-eu-ucits.json` | ja |
| Xetra-Referenzdaten | `ingest-xetra-refdata.mjs` | `data/sources/xetra-refdata-stats.json` (nur Zahlen); `data/eu/etf-eu-xetra.json` nur mit `VU_PUBLISH_XETRA_REFDATA=1` | Zahlen ja, Werte **nein** |
| ETF-Stamm, Qualität, Änderungen | `build-etf-data.mjs` | `data/etf-index.json`, `data/quality.json`, `data/changes.json`, … | ja |
| Gates | `assert-vorsorge-data.mjs` | – | – |

Prüfläufe ohne Datenübernahme: `[vorsorge-eu-probe]` (`probe-eu-etf-sources.mjs`).

## Gates (Auszug)

- EU-Stamm: gültige ISIN, keine Dubletten, Quellenangabe ESMA.
- Fondsregister: nur ISINs aus dem EU-Stamm, keine Dubletten, Quellenangabe, nicht mehr
  Zeilen als der Stamm.
- Xetra: Wertedatei darf ohne Freigabe nicht existieren
  (`XETRA_VALUES_PUBLISHED_WITHOUT_RELEASE`).
- Adapter-Normalisierung (Tests `vorsorge/tests/eu-sources.test.mjs`): laufende Kosten
  in Prozent → Dezimal, unplausible Werte (> 5 %) und leere Felder bleiben `null`;
  Replikation und Ertragsverwendung kanonisch; WKN nur, wenn gültig.

## Speicher und Auslieferung

- EU-Dateien sind spaltenweise (Felder + Zeilen) und werden erst auf `#/europa` geladen.
- Keine täglichen EU-Jobs, solange keine Kurse/Holdings angebunden sind; FIRDS ändert
  sich wöchentlich, das Register laufend – Aktualisierung zusammen mit dem
  Fundamentals-Lauf.
- Vor täglichen Jobs mit Kursen/Holdings: Historie nicht im Git, sondern als Archiv
  (z. B. R2) mit kleinem aktuellen Stand im Repository.

## Änderungen (Change Intelligence)

- US-Kosten: Vergleich zweier echter Prospektstände derselben Anteilklasse, nur gleich
  definierte Felder (`EXPENSE_RATIO_CHANGED`, `NET_EXPENSE_RATIO_CHANGED`,
  `MANAGEMENT_FEE_CHANGED`); im Monitor gebündelt (`COST_CHANGE`).
- UCITS: Änderungsereignisse (Kosten, Holdings, Fondsvolumen) erst, wenn eine
  veröffentlichbare Quelle zwei Stände liefert; die Change Engine (`etf-changes.js`)
  ist dafür vorbereitet (`ONGOING_CHARGES_CHANGED`, `TER_CHANGED`).
