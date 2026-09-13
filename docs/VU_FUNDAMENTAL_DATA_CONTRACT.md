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
| `securityId` | **dasselbe Papier im Market Data Contract** | — |
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
4. **`securityId` (Market Data Contract) ist identisch mit
   `masterMemberId`.** Das ist die einzige Brücke zwischen den beiden
   kanonischen Verträgen — geprüft über alle 7.004 Produkttitel, ohne
   Abweichung (`scripts/quant/tests/test_canonical_market.py`). Die
   Marktdatenschicht bleibt ein eigener Vertrag; dieser kopiert keine
   Kurslogik und rechnet keine Deckung nach.

Die Kette eines Joins lautet damit vollständig:

```
securityId  ==  masterMemberId  →  issuerId (= iss_cik_<CIK>)  →  CIK
 (Market)         (Universum)          (Fundamentals)            (SEC)
```

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

### 2.1 — Währung

`currency` ist die **gemeldete** Währung, nicht USD. Unilever meldet in
EUR, Canadian National in CAD; ihre Werte tragen `eur_m` bzw. `cad_m`.
**Umgerechnet wird nichts**: ein Kurs von heute auf eine Periode von 2012
wäre geraten und zerstörte die Point-in-Time-Eigenschaft. Eine abgeleitete
Kennzahl trägt die Währung ihrer Eingangsgrößen; Eingangsgrößen
verschiedener Währungen ergeben **keine Zahl**, sondern den Grund
`MIXED_CURRENCY`. Ein Konsument, der über Emittenten vergleicht, muss
`currency` lesen.

### 2.2 — Zustände: was eine fehlende Zahl bedeutet

Eine Zelle ohne Wert ist nie einfach leer. Sie trägt einen Grund, und die
Gründe sind nicht austauschbar:

| Zustand | Bedeutung | Beispiel |
|---|---|---|
| `AVAILABLE` | Wert vorhanden, datierbar, mit Quelle | Apple, Umsatz FY2023 |
| `PARTIAL` | Werte vorhanden, aber nicht jeder Kernkennzahl | Biotech mit Bilanz, ohne Umsatz |
| `MISSING` | Emittent bekannt, kein auflösbarer Wert, Ursache **noch nicht** entschieden | Emittent mit Konzepten, die die Registry nicht kennt |
| `NOT_APPLICABLE` | Die Kennzahl ist für diesen Emittenten **strukturell undefiniert** | SPAC ohne Umsatz, Bank ohne Herstellkosten, geschlossener Fonds |
| `REQUIRES_REVIEW` | Ein Mensch muss entscheiden | Emittent ohne SIC und ohne erkennbares Merkmal |
| `UNAVAILABLE` | Keine SEC-Quelle für diesen Titel | Titel ohne CIK |

Innerhalb der Pipeline steht dieselbe Unterscheidung am einzelnen Wert:
`NOT_APPLICABLE_FOR_SECTOR` mit Regel-ID (Registry `sector_rules`),
`MISSING_INPUT`, `MIXED_CURRENCY`, `NOT_YET_AVAILABLE`. **`MISSING` und
`NOT_APPLICABLE` sind nicht dasselbe.** Ein SPAC hat keinen Umsatz — das
ist keine Lücke, die jemand schließt. Eine Null steht nirgends, wo kein
Wert gemeldet wurde: **richtiger Wert > NOT_APPLICABLE > MISSING >
erfundener Wert.**

### 2.3 — Die Branchenschicht (`industrySpecificMetrics`)

Eine Bank hat keinen Umsatz im Sinne von `revenue`, sie hat Zinserträge;
ein Versicherer hat Prämien; ein REIT hat Mieten. Diese Größen werden
**nicht** in den Kernvertrag gebogen. Das kanonische Bündel eines
Emittenten, dessen SIC eine Branche der Registry (`industries`) trifft,
trägt einen eigenen Block:

```json
"industrySpecificMetrics": {
  "industry": "BANK",
  "metricIds": ["netInterestIncome", "deposits"],
  "facts": [ ...Sätze mit derselben Form wie in `facts`... ]
}
```

Die Sätze haben dieselben Pflichtfelder wie in §2, ihre `metricId`s
kommen **nie** in `facts` vor, und ein Emittent außerhalb der Branche
bekommt den Block nicht — auch wenn er dieselben Konzepte taggt. Welche
Kennzahlen eine Branche trägt, sagt `industry_metrics` in der Registry;
jedes Konzept dort ist am Bestand **gemessen**, nicht erinnert.
Verbotene Abbildungen bleiben verboten: Treuhandvermögen eines SPAC ist
keine Bilanzsumme, Treuhandertrag kein Umsatz, aufgeschobene
Emissionskosten kein operativer Aufwand.

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
| `AVAILABLE` | 4.447 | mindestens drei Jahre auflösbare Historie |
| `PARTIAL` | 481 | Werte vorhanden, Historie kürzer als drei Jahre |
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
| `MARKET_UNIVERSE` (R2) | 6.997 | 99,9 % |
| `TECHNICAL_UNIVERSE` | 5.963 | 85,14 % |
| `FUNDAMENTAL_UNIVERSE` | 5.813 | 83,00 % |
| `PIT_UNIVERSE` | 4.928 | 70,36 % |
| `BACKTEST_READY_UNIVERSE` | 4.633 | 66,15 % |

**Diese sechs Zahlen sind verschieden, und das ist keine Schwäche, sondern
die Aussage.** Der Satz „Vision Universe hat Fundamentaldaten für 7.004
Aktien" ist falsch und darf in keiner Oberfläche, keinem Report und
keinem Pitch stehen.

Backtestfähig nach Tiefe: **3.955** Titel mit fünf
Jahren, **2.846** mit zehn, **2.192**
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
  und 40-F sind geführt; 31 gemessene `ifrs-full`-Konzepte sind gemappt
  (Registry ≥ 1.2.0), Werte bleiben in ihrer Meldewährung. Was ein
  IFRS-Filer nicht taggt, bleibt eine Lücke mit Grund.
- **Look-ahead-Freiheit ist möglich, nicht automatisch.** Die Daten
  tragen `availableAt` und `sourceFilingId` für jeden Wert. Ob eine
  Abfrage das nutzt, entscheidet ihre Restatement-Politik
  (`POLICY_AS_OF_LATEST` statt `POLICY_LATEST_KNOWN`).

---

*Gemessen am 2026-09-13. Erzeugt aus
`quant/data/fundamentals/reconciliation.json`,
`gap-classification.json`, `backtest-readiness.json`,
`fundamental-quality.json`.*
