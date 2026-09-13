# VU FUNDAMENTAL DATA CONTRACT

Verbindlicher Handoff der Fundamentalschicht an alle weiteren
Vision-Universe-Workstreams.

Wer Fundamentaldaten braucht, konsumiert **diesen Vertrag** — und baut
keine eigene Fundamentallogik. Der Grund ist nicht Ordnungsliebe: zwei
Implementierungen derselben Kennzahl liefern irgendwann zwei Zahlen, und
dann diskutiert das Team über den Bug statt über das Unternehmen.

Alle Zahlen in diesem Dokument sind **gemessen** (`cli.py reconcile`,
`cli.py coverage-universe`). Wo nichts gemessen wurde, steht das
ausdrücklich und nicht `0`.

---

## 0 — WAS DIESE SCHICHT IST, UND WAS NICHT

| | |
|---|---|
| Sie liefert | kanonische Fundamentalwerte je Emittent, mit Herkunft, Periode und Einreichung |
| Sie liefert **nicht** | Kurse, Intraday, technische Indikatoren, Kennzahlen-Verhältnisse |
| Quelle | ausschließlich SEC/EDGAR XBRL (`ds_sec_edgar_v1`) |
| Identitätsanker | `issuerId` (= CIK), verbunden über `instrumentId` |

**Verhältniskennzahlen gehören nicht hierher.** Margen, ROE, ROA, ROIC,
Wachstum und CAGR rechnet `quant/engines/factors.js`. Diese Schicht
liefert deren *Eingangsgrößen*. `scripts/quant/sec/derived.py` hat diese
Rechnungen früher ebenfalls gemacht und tut es bewusst nicht mehr — eine
zweite Implementierung wäre genau die Parallelarchitektur, die der
Integrations-Audit verbietet.

---

## 1 — IDENTITY CONTRACT

Drei Ebenen, drei Fragen. Wer sie vermischt, zählt Papiere und meint
Unternehmen.

| Feld | Bedeutung | Stabil gegen |
|---|---|---|
| `instrumentId` | ein Listing (`vu_…`) | Kürzelwechsel, Börsenwechsel |
| `masterMemberId` | ein Papier im Wertpapierstamm | Neuaufnahme des Universums |
| `issuerId` | eine Gesellschaft (`iss_cik_<10-stellige CIK>`) | Umbenennung, Tickerwechsel |
| `cik` | die SEC-Kennung, zehnstellig mit führenden Nullen | — |

**Regeln, die nicht verhandelbar sind:**

1. **Das Kürzel ist kein Schlüssel.** Kürzel werden nach einem Delisting
   wiederverwendet. Ein Join darüber hängt irgendwann die Geschäftszahlen
   des Vorbesitzers an ein anderes Unternehmen.
2. **Fundamentaldaten hängen am `issuerId`, nie am Instrument.** Zwei
   Aktienklassen (GOOG/GOOGL) referenzieren **eine** Historie. Sie wird
   nicht kopiert und nicht addiert.
3. **Ohne CIK kein `issuerId`.** Es wird keine geraten. Ein Titel ohne
   Zuordnung steht im Gap Report, nicht im Bestand.

---

## 2 — FUNDAMENTAL CONTRACT

Ein Wert ist ein Satz aus `quant/data/sec/canonical/<TICKER>.json`:

```json
{
  "securityId": "sec_AAPL",
  "metricId": "totalEquity",
  "fiscalPeriod": "Q4",
  "fiscalYear": 2007,
  "periodEnd": "2007-09-29",
  "value": 14532.0,
  "unit": "usd_m",
  "currency": "USD",
  "reportedAt": "2009-10-27",
  "filedAt": "2009-10-27",
  "availableAt": "2009-10-27",
  "revisionId": 0,
  "restatementStatus": "original",
  "sourceFilingId": "0001193125-09-214859",
  "dataSourceId": "ds_sec_edgar_v1"
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `metricId` | ja | kanonische Kennung aus `quant/engines/schema.js` |
| `value` / `unit` / `currency` | ja | Wert mit Einheit; niemals eine nackte Zahl |
| `fiscalPeriod` / `fiscalYear` / `periodEnd` | ja | Periode des **Werts**, nicht der Einreichung |
| `filedAt` / `availableAt` | ja | **ab wann war der Wert öffentlich** |
| `sourceFilingId` | ja | Akzessionsnummer — **woraus** stammt er |
| `restatementStatus` | ja | `original` \| `restated` \| `amended` |
| `revisionId` | ja | 0 = Erstmeldung, aufsteigend je Korrektur |
| `dataSourceId` | ja | Herkunft der Zahl |

`filedAt` **und** `sourceFilingId` sind zusammen die Point-in-Time-Garantie:
das Datum sagt *wann*, die Akzessionsnummer sagt *woraus*. Ohne beides ist
keine Restatement-Kette rekonstruierbar.

---

## 3 — HISTORY CONTRACT

| Reihe | Verfügbar | Regel |
|---|---|---|
| `annual` | ja | eine Zeile je Geschäftsjahr, de-akkumuliert |
| `quarterly` | ja | **echte** Quartale, nicht die gemeldeten YTD-Stände |
| `TTM` | nur bei lückenloser Vier-Quartals-Reihe | eine Lücke im Fenster macht die Summe falsch — dann `null`, nicht geschätzt |
| `PIT` | ja | jeder Wert trägt `availableAt` |

**Die Quartalsregel ist der häufigste Fehler der Branche.** Emittenten
melden Q1, dann YTD2, YTD3 und FY. Wer diese Schlüssel zählt, zählt
Meldungen und nicht vergleichbare Perioden. Diese Schicht de-akkumuliert
sie (`PeriodResolver`).

---

## 4 — DERIVED CONTRACT

Rekonstruiert wird nur, was ein Emittent nicht als Zeile meldet:

| Kennzahl | Formel | Regel |
|---|---|---|
| `free_cash_flow` | `operating_cash_flow − capital_expenditures` | beide Eingangsgrößen nötig |
| `ebitda` | `operating_income + depreciation_and_amortization` | ohne D&A nicht ableitbar |
| `gross_profit` | `revenue − cost_of_revenue` | gemeldete Zeile hat Vorrang |
| `total_debt` | gemeldet, sonst `long_term_debt + short_term_debt` | gemeldete Zeile hat Vorrang |
| `net_debt` | `total_debt − cash_and_equivalents` | |
| `invested_capital` | `total_debt + stockholders_equity − cash_and_equivalents` | |
| `accruals` | `(net_income − operating_cash_flow) / total_assets` | `total_assets = 0` → `DIVISION_BY_ZERO` |

Jeder abgeleitete Wert trägt `source: VISION_UNIVERSE_DERIVED`, seine
`formula_version` und seine Eingangsgrößen. **Seine Verfügbarkeit ist die
späteste seiner Zutaten** — eine rekonstruierte Zahl ist erst bekannt,
wenn ihr letzter Bestandteil veröffentlicht wurde. Fehlt eine
Eingangsgröße, ist das Ergebnis `unavailable` mit Grund und nicht `0`.

**Nicht hier, sondern in `quant/engines/factors.js`:** Margen, ROE, ROA,
ROIC, Wachstumsraten, CAGR, Faktor-Scores.

---

## 5 — AVAILABILITY CONTRACT

Jede Oberfläche muss fünf Zustände unterscheiden können — **gemessen auf
7.004 Produkttitel**:

| Zustand | Titel | Bedeutung |
|---|---:|---|
| `AVAILABLE` | 3.824 | mindestens drei Jahre auflösbare Historie |
| `PARTIAL` | 1.104 | Werte vorhanden, Historie kürzer als drei Jahre |
| `MISSING` | 885 | Einreichungen liegen vor, kein Wert auflösbar |
| `UNAVAILABLE` | 1.191 | kein Factbook |
| `AMBIGUOUS` | 0 | Zuordnung nicht eindeutig — derzeit kein Fall |

`MISSING` und `UNAVAILABLE` sind **nicht dasselbe**: das erste ist unsere
Baustelle, das zweite die der Quelle. Eine Oberfläche, die beides als
„keine Daten" zeigt, verschenkt die einzige Information, die dem Nutzer
sagt, ob es sich lohnt, morgen wiederzukommen.

---

## 6 — WAS DIE SCHICHT HEUTE TRÄGT

Gemessen gegen **7.004 Produkttitel**:

| Universum | Titel | Anteil |
|---|---:|---:|
| `PRODUCT_UNIVERSE` | 7.004 | 100 % |
| `TECHNICAL_UNIVERSE` | 5.378 | 76.7847 % |
| `FUNDAMENTAL_UNIVERSE` | 5.813 | 82.9954 % |
| `PIT_UNIVERSE` | 4.928 | 70.3598 % |
| `BACKTEST_READY_UNIVERSE` | 4.172 | 59.566 % |

**Diese fünf Zahlen sind verschieden, und das ist keine Schwäche, sondern
die Aussage.** Der Satz „Vision Universe hat Fundamentaldaten für 7.004
Aktien" ist falsch und darf in keiner Oberfläche, keinem Report und
keinem Pitch stehen.

Backtestfähig nach Tiefe: **3.319** Titel mit fünf
Jahren, **2.283** mit zehn, **1.694**
mit fünfzehn.

---

## 7 — VERSIONIERUNG

Jeder ausgelieferte Satz trägt `versions`:

| Feld | Heute | Ändert sich, wenn |
|---|---|---|
| `normalization_schema` | 1.0.0 | sich die Satzstruktur ändert |
| `normalization_logic` | 1.6.0 | sich die Periodenauflösung ändert |
| `formula` | 1.1.0 | sich eine Formel in `derived.py` ändert |
| `metric_registry.mapping_version` | 1.1.0 | ein XBRL-Konzept neu gemappt wird |

Ein Konsument, der Werte zwischenspeichert, **muss** auf diese Versionen
prüfen. Eine geänderte `mapping_version` heißt: dieselbe Kennzahl kann
jetzt aus einem anderen Konzept kommen.

---

## 8 — VERBINDLICHE KONSUMENTEN

Diese Schicht ist die gemeinsame Quelle für:

Stock Intelligence · Fundamental History · Quant · Screener · Compare ·
Rankings · Strategy Lab · Backtesting · Portfolio Intelligence · Atlas/AI
· Reports

**Kein Frontend baut eine eigene Fundamentalquelle.** Unterschiedliche UX
ist erwünscht; unterschiedliche Zahlen sind ein Fehler.

---

## 9 — WAS DER VERTRAG NICHT VERSPRICHT

- **Kein überlebensfreies Universum.** SEC/EDGAR führt keinen
  Delisting-Ereignisfeed. Jeder Backtest auf diesem Bestand trägt
  Survivorship Bias — eine Eigenschaft der Quelle, keine Einstellung.
- **Keine Schätzungen, keine Analystenerwartungen, keine Forward
  Metrics.** Die SEC veröffentlicht sie nicht.
- **Keine Garantie auf Vollständigkeit ausländischer Emittenten.** 20-F
  und 40-F sind geführt, ihre IFRS-Taxonomien noch nicht gemappt: 561
  Titel betroffen, als `SEC_RECOVERABLE` klassifiziert.
- **Look-ahead-Freiheit ist möglich, nicht automatisch.** Die Daten
  tragen `availableAt` und `sourceFilingId` für jeden Wert. Ob eine
  Abfrage das nutzt, entscheidet ihre Restatement-Politik
  (`POLICY_AS_OF_LATEST` statt `POLICY_LATEST_KNOWN`).

---

*Gemessen am 2026-09-13. Erzeugt aus
`quant/data/fundamentals/reconciliation.json`,
`gap-classification.json`, `backtest-readiness.json`,
`fundamental-quality.json`.*
