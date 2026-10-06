# SEC Live Validation — Ergebnisbericht

**Stand: 2026-09-08. Normalisierungslogik 1.3.0. GitHub-Actions-Lauf #12 auf
`claude/sec-financial-data-core-qiizhj`.**

> **Nachtrag, Release-Audit (Lauf #15, Logik 1.5.0).** Das anschließende
> Release-Audit hat vier weitere Fehler gefunden und behoben; die Zahlen unten
> galten für Lauf #12 und haben sich dadurch verändert:
>
> | | Lauf #12 | Lauf #15 |
> | --- | --- | --- |
> | kanonische Fakten | 4 216 | **4 271** |
> | PIT-Beobachtungen | 27 231 | **27 385** |
> | Restatements | 602 | **604** |
> | unterdrückte Zellen | 30 | **5** |
> | Tests | 492 | **512** |
>
> Am wichtigsten: NVDAs Geschäftsjahre 2011–2014 waren um ein Jahr zu niedrig
> beschriftet, weil das `fy`-Feld des Jahresabschlusses ungeprüft als Label
> übernommen wurde. Das war die Ursache der meisten NVDA-Unterdrückungen, die
> dieser Bericht noch als „dünne frühe XBRL-Jahre" einordnet. Gate-Ergebnisse und
> Coverage-Startjahre sind unverändert. Vollständig in
> **`docs/SEC_RELEASE_AUDIT.md`**.

Zwölf Läufe gegen `data.sec.gov`, in denen elf Fehler gefunden wurden; Lauf #12
ist der Bestätigungslauf, dessen Artefakte hier zitiert werden. Jede Zahl in
diesem Dokument stammt aus committeten Artefakten unter `quant/data/sec/` und ist
mit dem erzeugenden Lauf reproduzierbar. Nichts ist geschätzt, nichts ist aus
Dokumentation zitiert, und kein Gate wurde nachträglich angehoben.

Die Entwicklungsumgebung erreicht `data.sec.gov` nicht (Egress-Policy, HTTP 403
auf CONNECT). Deshalb lief die gesamte Validierung in GitHub Actions. Der einzige
dafür nach `main` gemergte Inhalt war die Workflow-Datei (PR #47) — der
Phase-4-Code selbst liegt weiterhin ausschließlich auf dem Feature-Branch.

---

## 1. Konnten alle fünf Unternehmen erfolgreich geladen werden?

**Ja, alle fünf.** 5 von 5 ingestiert, 0 Fehlschläge, Retry-Queue leer.

In den ersten Läufen sind zwei davon *nicht* durchgelaufen, und beides waren
echte Befunde, keine Infrastrukturprobleme:

- **JPM** brach nach acht Sekunden Download in zehn Minuten Stille ab. Ursache
  war quadratisches Verhalten in `get_filing_metadata`: JPM hat 71
  Submissions-Seiten mit rund 100 000 Filings, und die Spaltenzuordnung wurde pro
  Zeile neu berechnet. Nach dem Hochziehen aus der Schleife: 17,0 s → 0,061 s bei
  50 000 Zeilen.
- **XOM** stoppte an einer CIK-Abweichung. Das war kein Tippfehler (siehe Frage 13).

## 2. Welche SEC-Endpunkte wurden tatsächlich verwendet?

Drei, alle über `scripts/quant/sec/provider.py`:

| Endpunkt | Wofür |
| --- | --- |
| `https://www.sec.gov/files/company_tickers.json` | Ticker → CIK, gegen die SEC selbst statt gegen die Konfiguration |
| `https://data.sec.gov/submissions/CIK##########.json` | Identität, SIC, Geschäftsjahresende, Filing-Index; paginierte Historie inklusive (`CIK…-submissions-NNN.json`) |
| `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` | sämtliche XBRL-Fakten des Unternehmens |

Implementiert, aber in diesem Lauf **nicht** benutzt: `companyconcept` (für
Einzelkonzept-Nachfragen) und der `companyfacts.zip`-Bulk-Pfad (ab ~500
Unternehmen die günstigere Route). Beide sind im Provider vorhanden und getestet;
für fünf Unternehmen ist der Einzelabruf schneller.

Fair-Access-Verhalten: deklarierter User-Agent mit Kontaktadresse,
Token-Bucket auf 5 req/s, exponentielles Backoff mit Jitter,
Request-Deduplizierung und gzip-Plattencache. Keine Rate-Limit-Antwort in zwölf
Läufen.

## 3. Wie weit reicht die gemessene Historie je Unternehmen zurück?

Aus `quant/data/sec/coverage_matrix.json`:

| Unternehmen | Erstes STRUCTURED-Jahr | Erstes nutzbares Jahr | Filings in EDGAR |
| --- | --- | --- | --- |
| NVDA | 2008 | 2008 | 1999–2026 |
| AAPL | 2007 | 2007 | 1993–2026 |
| MSFT | 2008 | 2008 | 1993–2026 |
| JPM  | 2007 | 2007 | 1993–2026 |
| XOM  | 2008 | 2007 | 1993–2026 |

**Ein Backtest auf diesem Universum kann im Geschäftsjahr 2008 beginnen**, für
vier der fünf schon 2007.

Zwei Ergebnisse, die vorher offen waren:

- Die strukturierte Abdeckung reicht **weiter zurück als das XBRL-Mandat**. Das
  Mandat lief ab Mitte 2009 an, die Messung liefert FY2007/FY2008 als
  STRUCTURED. Grund sind Vergleichsperioden: ein 10-K von 2010 trägt zwei
  Vorjahre als getaggte Comparatives. Gemessene Reichweite: etwa zwei Jahre vor
  dem ersten eigenen XBRL-Filing.
- **NVDA 1995 ist MISSING, nicht FILING_ONLY**, weil NVDAs erstes periodisches
  Filing von 1999 stammt (Börsengang 1999). Genau dafür existiert die
  Unterscheidung: 1995 ist auch durch späteres Dokumenten-Parsing nicht
  rekonstruierbar, 1995–2005 bei den anderen vier dagegen schon.

## 4. Welche kanonischen Fundamentalkennzahlen sind je Unternehmen verfügbar?

Aus `quant/data/sec/canonical_index.json` (4216 kanonische `FundamentalFact`-Sätze
insgesamt):

| Unternehmen | Fakten | Kennzahlen | Unterdrückte Zellen |
| --- | --- | --- | --- |
| MSFT | 998 | 13 | 0 |
| AAPL | 962 | 13 | 0 |
| XOM  | 846 | 11 | 1 |
| NVDA | 791 | 13 | 29 |
| JPM  | 619 | 7  | 0 |

Die 13: `revenue`, `grossProfit`, `operatingIncome`, `netIncome`,
`interestExpense`, `totalAssets`, `totalEquity`, `sharesOutstanding`, `capex`,
`freeCashFlow`, `netDebt`, `investedCapital`, `accruals`.

## 5. Welche Kennzahlen fehlen?

Die Antwort trennt zwei Gründe, die nicht dasselbe sind:

**JPM (7 statt 13)**

- `NOT_APPLICABLE_FOR_SECTOR` mit Regel-ID: `cost_of_revenue`, `gross_profit`,
  `total_debt`. Eine Bank hat keine Umsatzkosten, also existiert kein
  Bruttogewinn — weder gemeldet noch rekonstruierbar. Die Sektorregel blockiert
  zusätzlich die Schuldenaggregation, statt Komponenten zu summieren, die auf
  einer Bankbilanz etwas anderes bedeuten.
- `MISSING_XBRL_CONCEPT`: `capital_expenditures`, `long_term_debt`,
  `operating_income`. Diese Konzepte könnten existieren, sind aber in JPMs
  getaggten Daten nicht vorhanden.

**XOM (11 statt 13)**: ausschließlich `MISSING_XBRL_CONCEPT` —
`gross_profit`, `cost_of_revenue` und `operating_income` sind in XOMs Filings
nicht getaggt. Ein Ölkonzern berichtet eine andere GuV-Struktur; das ist keine
Sektorregel, sondern ein fehlendes Konzept.

Kein fehlender Wert ist eine Null und keiner verschwindet stillschweigend: jede
Zelle trägt `available: false` plus Grundcode, und der Data Inspector rendert sie
mitsamt Begründung. Das Gate `NO_INVENTED_VALUES` prüft genau das und meldet für
alle fünf Unternehmen „alle 81 ausgewerteten Kennzahlen sind entweder verfügbar
oder explizit null mit Grundcode".

## 6. Welche PIT-Abdeckung wurde tatsächlich erreicht?

**27 231 Beobachtungen geprüft, 100 % PIT-korrekt** (`PIT_NO_FUTURE_DATA_LEAK`
PASS für alle fünf):

| Unternehmen | Geprüfte Beobachtungen | Quartalsbeobachtungen |
| --- | --- | --- |
| MSFT | 6 528 | 2 332 |
| AAPL | 6 286 | 2 163 |
| NVDA | 5 822 | 2 063 |
| XOM  | 4 535 | 960 |
| JPM  | 4 060 | 1 044 |

Zusätzlich für alle fünf PASS: `PROVENANCE_COMPLETE` (jede Beobachtung trägt
Concept, Accession, Formular, Einreichungsdatum und Verfügbarkeitszeitpunkt),
`PERIOD_INTEGRITY` (jede Quartalsbeobachtung umfasst genau ein Quartal),
`UNIT_INTEGRITY`, `NO_INVENTED_VALUES`, `DERIVED_SEPARATION`.

Die Zugriffsregel ist eine einzige und stammt aus dem bestehenden Quant-Kern
(`quant/engines/schema.js`, `latestKnownFact`): `availableAt <= decisionTime`.
Der SEC-Adapter implementiert keine zweite.

## 7. Wurden Restatements gefunden und korrekt behandelt?

**Ja — 602 restatete Fakten über die fünf Unternehmen**, jeweils mit vollständiger
Revisionskette (`revisionId`, `restatementStatus`, Accession je Revision):

| Unternehmen | Restatete Fakten |
| --- | --- |
| XOM | 177 |
| JPM | 169 |
| AAPL | 109 |
| NVDA | 74 |
| MSFT | 73 |

Drei Beispiele mit vollständiger Kette. Werte, Daten und Accessions sind
gemessen; die Spalte „vermutlicher Anlass" ist eine Einordnung anhand von
Zeitpunkt und Richtung, keine aus den Daten ableitbare Tatsache:

| Fall | Erstmeldung | Korrektur | Vermutlicher Anlass |
| --- | --- | --- | --- |
| AAPL revenue FY2008 Q4 | 7 895 (2009-10-27, `0001193125-09-214859`) | 12 907 (2010-01-25, `0001193125-10-012091`) | rückwirkende Umstellung der iPhone-Abgrenzung (ASU 2009-13) |
| JPM revenue FY2012 Q1 | 26 712 (2012-05-10, `0000019617-12-000213`) | 26 052 (2012-08-09, `0000019617-12-000262`) | die Restatement des ersten Quartals 2012 („London Whale") |
| MSFT revenue FY2017 Q1 | 20 453 (2016-10-20, `0001193125-16-742796`) | 21 928 (2017-10-26, `0001564590-17-020171`) | ASC-606-Umstellung mit voller Rückwirkung |

Dass die Erstmeldungen und die Korrekturen jeweils aus verschiedenen Filings mit
verschiedenen Accessions stammen, ist der eigentliche Beleg: die Kette bildet
Einreichungen ab, nicht nachträglich erzeugte Varianten.

Behandlung: Erstmeldung und Korrektur liegen **beide** im Store, jede mit ihrem
eigenen Verfügbarkeitszeitpunkt. Ein Stichtag vor der Korrektur liefert die
Erstmeldung, ein Stichtag danach die Korrektur. Genau das prüft Gate A (Frage 8),
und zwar mit realen Daten je Unternehmen.

## 8. Ergebnis Gate A (`GATE_A_RESTATEMENT`)

**PASSED, 5 von 5.** Gemessen von `quant/engines/gate-tests.js` — der bestehenden
Qualifikationsinstanz, unverändert, gegen den SEC-Adapter:

| Unternehmen | Früher Stichtag | Später Stichtag |
| --- | --- | --- |
| AAPL | 14 532 (original, 2009-10-27) | 14 531 (restated, 2010-01-25) |
| JPM  | 3 973,01 (original, 2010-02-24) | 4 104,93 (restated, 2010-05-10) |
| MSFT | 8 653,57 (original) | 8 668 (restated) |
| NVDA | 616,03 (original) | 612,19 (restated) |
| XOM  | 8 019 (original) | 4 747,28 (restated) |

Die Korrektur wirkt in keinem Fall rückwärts. `verificationLevel:
RUNTIME_VERIFIED` für alle fünf.

## 9. Ergebnis Gate B (`GATE_B_DELISTING`)

**FAILED, 5 von 5 — und das bleibt so.**

Der Grund ist eine Eigenschaft der Quelle, kein Defekt: SEC/EDGAR hat kein
Security Master und keinen Delisting-Event-Feed.
`https://www.sec.gov/files/company_tickers.json` enthält nur Emittenten mit
*aktuell* zugeteiltem Ticker. Ein 2013 delistetes Unternehmen steht nicht darin,
und es existiert kein SEC-Endpunkt, der einen historischen Ticker auf eine CIK
abbildet.

Was SEC dagegen **kann**: jedes je eingereichte Filing bleibt per CIK dauerhaft
abrufbar, auch nach dem Delisting. `delisted_by_cik: true`,
`delisted_by_ticker: false`.

`providers/sec/adapter.js` gibt für `getUniverseAsOf` bewusst `unavailable`
zurück, statt das heutige Universum als historisches auszugeben — ein PASS wäre
nur durch eine Lüge zu haben. Das Provider-Profil trägt
`survivorshipBiasControls: false` als ausdrücklichen Ausschluss, nicht als
„ungeprüft".

**Konsequenz:** Fundamentaldaten je Unternehmen sind PIT-korrekt, das *Universum*
ist es nicht. Ein Backtest allein auf SEC-Basis trägt weiterhin
Survivorship-Bias in der Zusammensetzung. Was die Lücke schließen würde (eine
Point-in-Time-Indexhistorie oder eine Listing-/Delisting-Historie je CIK), steht
mit Kosten in `docs/SEC_COVERAGE_REPORT.md` §5.

## 10. Ergebnis Gate C (`GATE_C_AVAILABILITY`)

**PASSED, 5 von 5.** 3 583 Kennzahlen geprüft, alle mit Verfügbarkeitszeitpunkt,
keine nach dem Stichtag veröffentlichte darunter:

| Unternehmen | Datensätze | Ohne Zeitstempel | Nach Stichtag verfügbar |
| --- | --- | --- | --- |
| MSFT | 925 | 0 | 0 |
| AAPL | 853 | 0 | 0 |
| NVDA | 714 | 0 | 0 |
| XOM  | 642 | 0 | 0 |
| JPM  | 449 | 0 | 0 |

## 11. Coverage je Unternehmen

| Geschäftsjahr | NVDA | AAPL | MSFT | JPM | XOM |
| --- | --- | --- | --- | --- | --- |
| 2025 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2020 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2015 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2010 | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED | STRUCTURED |
| 2005 | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |
| 2000 | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |
| 1995 | **MISSING** | FILING_ONLY | FILING_ONLY | FILING_ONLY | FILING_ONLY |

Quartalsraster: AAPL, JPM, XOM ab Geschäftsjahr 2007, MSFT und NVDA ab 2008,
jeweils lückenlos bis zum aktuellen Geschäftsjahr. Details in
`docs/SEC_COVERAGE_REPORT.md`.

## 12. Gefundene Datenqualitätsprobleme

Die Qualitätsengine markiert, sie korrigiert nie. Befunde aus Lauf #12
(WARNING/INFO stehen im nicht-committeten Factbook, ERROR-Befunde reisen seit
Lauf #12 mit der Inspector-Ansicht mit):

| Unternehmen | ERROR | WARNING | INFO |
| --- | --- | --- | --- |
| NVDA | 5 | 461 | 21 590 |
| XOM  | 0 | 969 | 16 088 |
| JPM  | 0 | 425 | 44 172 |
| MSFT | 0 | 340 | 24 761 |
| AAPL | 0 | 329 | 17 971 |

Nach Code:

- **`UNKNOWN_CONCEPT` (INFO, 124 582)** — XBRL-Konzepte, die die Registry nicht
  abbildet. Das ist die Normallage: ein Unternehmen taggt Tausende Konzepte, das
  kanonische Modell braucht 13. Informativ, kein Problem.
- **`CONCEPT_DISAGREEMENT` (WARNING, 2 074)** — zwei akzeptierte Konzepte im
  selben Filing für dieselbe Zelle mit abweichenden Werten. Die Priorität der
  Registry entscheidet, die Abweichung wird gemeldet, nichts wird gemittelt. XOM
  führt mit 918, weil es historisch parallele Umsatzkonzepte taggt.
- **`RESTATEMENT_CONFLICT` (WARNING, 434)** — eine Korrektur bewegt einen Wert
  über die Schwelle. Das ist ein Befund, kein Fehler: die Kette bleibt vollständig.
- **`FUTURE_DATA_LEAK` (ERROR, 5, nur NVDA)** — Rohfakten, deren Periodenende
  **nach ihrem eigenen Einreichungsdatum** liegt. Seit Lauf #12 stehen die
  Befunde selbst in `quant/data/sec/inspector/NVDA.json`, und damit ist die
  Einordnung nachprüfbar statt vermutet:

  | Concept | Periodenende | Eingereicht |
  | --- | --- | --- |
  | `EntityPublicFloat` | 2011-08-01 | 2011-05-27 |
  | `AcceleratedShareRepurchasesSettlementPaymentOrReceipt` | 2013-07-28 | 2013-05-22 |
  | `CommonStockDividendsPerShareDeclared` | 2014-01-26 | 2013-11-19 |
  | `StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount` | 2014-01-26 | 2013-11-19 |
  | `StockRepurchasedDuringPeriodShares` | 2014-04-27 | 2014-03-13 |

  **Keines dieser fünf Konzepte bildet die Registry auf eine kanonische Kennzahl
  ab.** Sie erreichen die kanonische Schicht nie, weshalb das PIT-Gate dort
  besteht — das ist überprüfbar an der Konzeptliste, keine Annahme über die
  Auflösung. Inhaltlich sind es überwiegend zukunftsgerichtete Angaben (eine
  erklärte, später zahlbare Dividende; die Restautorisierung eines
  Rückkaufprogramms), bei denen ein in der Zukunft liegendes Periodenende
  normale SEC-Praxis ist. Die Regel prüft Rohfakten und meldet korrekt, was sie
  sieht; die Fakten werden markiert und nicht verändert. Die Zahl ist über alle
  vier Normalisierungsversionen (1.0.0 bis 1.3.0) konstant 5 geblieben, also
  eine Eigenschaft der SEC-Daten und nicht unserer Verarbeitung.
- **`FISCAL_PERIOD_CONFLICT` (WARNING, 6, nur NVDA)** und
  **`UNPLACEABLE_PERIOD` (WARNING, 10)** — die dünnen frühen XBRL-Jahre, in denen
  der gelernte Fiskalkalender Perioden nicht eindeutig zuordnen kann. Genau diese
  Zellen erscheinen als die 30 unterdrückten (siehe Frage 4).

**30 unterdrückte Zellen** (NVDA 29, XOM 1): dort lieferte dieselbe Kombination
aus Kennzahl, Geschäftsjahr und Quartal mehr als ein Periodenende. Ein
Fiskalquartal hat genau ein Enddatum, also wird die Zelle nicht veröffentlicht,
sondern unter `periodEndConflicts` mit Grund `AMBIGUOUS_PERIOD_END` gemeldet. Eine
Lücke mit sichtbarem Befund statt einer mehrdeutigen Zahl.

## 13. Gefundene Bugs

Elf Fehler in zwölf Live-Läufen — alle nur durch echte SEC-Daten sichtbar, keiner
durch die Fixtures.

1. **`get_filing_metadata` quadratisch.** JPMs 71 Submissions-Seiten mit rund
   100 000 Filings ließen den Lauf nach acht Sekunden Download zehn Minuten still
   stehen. Die Spaltenzuordnung wurde pro Zeile neu berechnet.
2. **XOM-CIK-Abweichung.** Die SEC-Tickerkarte bildet `XOM` auf CIK 0002115436
   ab (ExxonMobil Holdings Corp, ein einziges 10-Q von 2026-06-30); die gesamte
   Filing-Historie von 1993 bis 2026 liegt auf CIK 0000034088, das keinen Ticker
   mehr trägt. Kein Tippfehler, sondern eine Reorganisation.
3. **FY-Zeilen kollidieren mit Q4-Zeilen.** Der schwerwiegendste Fund: der
   kanonische Zugriff (`latestKnownFact`) schlüsselt auf `metricId` +
   `periodEnd` — `fiscalPeriod` ist **nicht** Teil des Schlüssels. Damit landeten
   ein Zwölfmonatsumsatz und ein Dreimonatsumsatz in derselben Zelle. Ein
   Backtest hätte je nach Auflösungsreihenfolge um den Faktor vier danebengelegen.
4. **Revisionsstand pro Schleifendurchlauf statt pro Zelle.** Die erste
   Beobachtung einer neuen Periode wurde als `revisionId 1 / "restated"`
   ausgegeben, dazu konsekutive Dubletten.
5. **Exportfenster zu eng.** Sechs Quartalsjahre, während die Coverage bis 2007
   zurückreicht.
6. **Quartalsrekonstruktion aus falsch geordneten Kumulativperioden.** NVDA
   `operatingIncome` erschien für 2010-10-31 gleichzeitig als FY2010 Q3 (103 783)
   und FY2010 Q4 (−174 914). `Q4 = FY − YTD3` hatte einen Jahreswert von einem
   Neunmonatswert abgezogen, der *später* endet.
7. **Cover-Date-Instants falsch zugeordnet.** `dei:EntityCommonStockSharesOutstanding`
   trägt das Deckblattdatum des Filings, nicht den Bilanzstichtag. Die Frage „in
   welches Quartal fällt der 16. Oktober" liefert das *folgende* Quartal. 86 von
   113 mehrdeutigen Zellen.
8. **Versionsstempel nicht erhöht.** Die Korrektur aus (7) wurde ausgeliefert,
   jeder Workflow-Schritt meldete Erfolg — und nichts wurde neu normalisiert,
   weil `pipeline._is_current` den unveränderten Stempel als aktuell las. Die Zahl
   unterdrückter Zellen blieb exakt bei 113; genau das machte den Fehler sichtbar.
9. **Checkpoint überstimmt Versionsstempel.** Zweite, tiefere Schicht desselben
   Fehlers: `ingest_universe` übersprang jedes im Checkpoint als COMPLETED
   markierte Unternehmen und sprang damit über `_is_current` hinweg. Der
   Checkpoint beantwortet „habe ich das in diesem Lauf schon gemacht", nicht „ist
   das Ergebnis noch gültig".
10. **CIK als Ticker.** Die kanonische Security für Exxon trug
    `ticker: "0000034088"` — ein erfundener Bezeichner in einer Pipeline, deren
    erste Regel lautet, dass es keine gibt. `_ticker_of` fiel still auf die CIK
    zurück, weil die SEC auf diesem Registranten keinen Ticker mehr führt.
11. **Zwei Gate-Fehler aus Lauf #10**, beide von den Gates selbst gefunden:
    - **NVDA `PIT_NO_FUTURE_DATA_LEAK` FAIL, 4 Beobachtungen.** Die
      Periodenende-Übernahme aus (7) nahm die häufigste beobachtete Endkennung
      der Zelle, auch wenn diese *nach* dem Deckblattdatum lag. In NVDAs frühen
      Jahren stand dort ein Datum ein volles Jahr später — ein Filing vom
      2009-08-20 schien eine Bilanz vom 2010-08-01 zu kennen.
    - **MSFT `DERIVED_SEPARATION` FAIL.** Das Gate nahm an, jeder Eintrag aus
      `derived.reconstruct` sei eine Berechnung. Ist er nicht: wo ein Unternehmen
      den Bruttogewinn selbst berichtet — MSFT tut das — wird die gemeldete Zeile
      durchgereicht. Ein korrekt als SEC-Fakt gekennzeichneter SEC-Fakt ist das
      *Ziel* dieses Gates, nicht sein Verstoß.

## 14. Welche Bugs wurden behoben?

**Alle elf, jeder mit Regressionstest.** Die Korrekturen im Einzelnen:

| # | Korrektur | Test |
| --- | --- | --- |
| 1 | Spaltenzuordnung aus der Schleife gehoben | `test_http_and_provider.py` |
| 2 | Deklarierter CIK-Override mit Pflicht-Begründung ≥ 40 Zeichen; ein versehentlich falscher CIK stoppt den Lauf weiterhin | `test_universe_resolution.py` (15 Tests) |
| 3 | Kanonischer Export ausschließlich quartalsweise; FY-Zeilen entfallen | `sec-adapter.test.mjs` |
| 4 | Revisionsstand pro (Kennzahl, Periodenende)-Zelle | `sec-adapter.test.mjs` |
| 5 | Volle Historie als Standard (`quarterly_years=None`) | `test_pipeline_and_store.py` |
| 6 | Rekonstruktion prüft vor jeder Differenz, dass die längere Kumulativperiode später endet; sonst ehrliche Lücke mit Warnung | `test_normalize_periods.py` |
| 7 | `FiscalCalendar.assign_cover_date` platziert Deckblattdaten auf der zuletzt *abgeschlossenen* Periode | `test_normalize_periods.py` (`CoverDateInstantTests`) |
| 8 | `NORMALIZATION_SOURCE_DIGEST` — sha256 über die Module, die Normalisierungssemantik definieren; eine Änderung ohne Versionserhöhung lässt die Suite fehlschlagen und nennt den erwarteten Digest | `test_version_discipline.py` |
| 9 | Resume-Abkürzung verlangt zusätzlich einen passenden Versionsstempel (lokal, kostet keine Anfrage); Gegenprobe sichert, dass ein unveränderter Stempel die Abrufe weiterhin spart | `test_pipeline_and_store.py` |
| 10 | SEC-Ticker zuerst, sonst der deklarierte, sonst keiner. Für die kanonische Ausgabe ist „keiner" ein Abbruch mit Begründung statt eines Platzhalters; veraltete Exportdateien werden entfernt | `test_universe_resolution.py` |
| 11a | `period_end_for_cover_date` — nur ein Enddatum ≤ Deckblattdatum kommt in Frage, davon das späteste; bleibt keines, steht das Deckblattdatum und die Zelle wird als mehrdeutig gemeldet | `test_normalize_periods.py`, getestet mit den gemessenen NVDA-Werten |
| 11b | `derived.PASS_THROUGH_METRICS` benennt die zwei Kennzahlen, die ein Filer selbst berichten kann (`gross_profit`, `total_debt`); nur für sie ist eine SEC-Quelle zulässig, jede andere bleibt ein FAIL | `test_quality_and_gates.py` |

Zusätzlich behoben, ohne eigenen Bug-Eintrag: die Coverage-Matrix beschriftete
ihre Spalten weiterhin mit der CIK, weil `build_matrix` die Beschriftung selbst
ableitet — dieselbe Ursache wie (10), anderes Modul.

Wirkung der Korrekturen (7)–(11a) in Zahlen, Lauf für Lauf:

| Lauf | Logik | Kanonische Fakten | Unterdrückte Zellen |
| --- | --- | --- | --- |
| #8  | 1.1.0 (nicht angewandt) | 3 997 | 113 |
| #9  | 1.1.0 (angewandt) | 3 865 | 163 |
| #10 | 1.2.0 | 4 223 | 27 |
| #11 | 1.3.0 | 4 216 | 30 |
| #12 | 1.3.0 | 4 216 | 30 |

Lauf #9 machte es schlimmer, bevor es besser wurde: die richtige Zuordnung des
Deckblattdatums brachte Cover-Date- und Bilanz-Instant erst in dieselbe Zelle und
damit zwei Enddaten unter ein Quartalslabel. Lauf #10 behob das, Lauf #11 nahm
drei Zellen zurück, für die kein Enddatum ≤ Deckblattdatum existiert — ehrliche
Lücken statt geborgter Daten. Alle 136 `sharesOutstanding`-Konflikte sind weg.

## 15. Aktuelle Gesamtzahl aller Tests

**492**

| Suite | Tests |
| --- | --- |
| Python (`python3 scripts/quant/cli.py test`) | 217 |
| JavaScript (`node --test "quant/tests/*.test.mjs"`) | 267 |
| Academy (`node --test academy/engines/financial-model-engine.test.mjs`) | 8 |

Davon in dieser Phase neu: 217 Python (die gesamte SEC-Suite) und 34 JS
(`quant/tests/sec-adapter.test.mjs`).

## 16. Sind alle bestehenden Tests weiterhin grün?

**Ja, 492 von 492.** Keine bestehende Testdatei wurde gelöscht, keine Assertion
abgeschwächt, kein Test übersprungen oder als „bekannt fehlschlagend" markiert.

Ein Fall verdient Erwähnung, weil er die Grenze markiert: `DERIVED_SEPARATION`
(Bug 11b) musste geändert werden, aber der bestehende Test
`test_derived_separation_gate_catches_a_mislabelled_metric` — ein als SEC-Fakt
getarntes „roe" — fällt weiterhin durch. Die Korrektur benennt eine explizite
Liste zulässiger Durchreich-Kennzahlen, statt die Prüfung generell aufzuweichen.

Der Workflow lässt beide Suiten **vor** dem Ingest laufen; ein roter Test bricht
den Lauf ab, bevor eine einzige SEC-Anfrage gestellt wird.

## 17. Welche produktiven Dateien wurden durch den Lauf erzeugt/geändert?

Der Workflow darf ausschließlich `quant/data/` verändern; ein Scope-Guard-Schritt
bricht ab, wenn etwas anderes im Arbeitsverzeichnis auftaucht.

Erzeugt und committet (rund 4,6 MB):

| Datei | Inhalt |
| --- | --- |
| `quant/data/sec/canonical/{AAPL,MSFT,NVDA,JPM,XOM}.json` | die kanonische `FundamentalFact`/`Filing`/`Security`-Schicht, die der JS-Adapter ausliefert |
| `quant/data/sec/canonical_index.json` | Index mit Faktenzahl, Kennzahlen, unterdrückten Zellen je Unternehmen |
| `quant/data/sec/coverage_matrix.json` | die gemessene Coverage-Matrix |
| `quant/data/sec/pit_gates.json` | Gate A/B/C plus die sechs Ingest-Prüfungen, je Unternehmen und provider-weit |
| `quant/data/sec/inspector/*.json`, `inspector_index.json` | die Ansicht des Data Inspectors, inklusive ERROR-Befunden |
| `quant/data/sec/universe_resolution.json` | Diagnose: worauf jeder konfigurierte Ticker in der SEC-Tickerkarte zeigt |

**Nicht** im Repository, per `.gitignore` und zusätzlich per Scope-Guard geprüft:
`quant/data/sec/raw/` (die SEC-Rohpayloads), `quant/data/sec/facts/` (die
Factbooks) und `.sec-cache/` (der HTTP-Cache). Der Guard bricht außerdem bei
jedem generierten Artefakt über 2 MB ab.

Keine Secrets: der Workflow braucht keine, weil die SEC keine Authentifizierung
verlangt. Der einzige personenbezogene Wert ist die Kontaktadresse im
User-Agent, die die SEC-Fair-Access-Policy ausdrücklich fordert.

## 18. Ist die SEC-Pipeline nach dem Live-Test bereit für die Integration in Quant?

**Ja, für Fundamentaldaten.** Die Integration ist bereits vollzogen, nicht
geplant: `providers/sec/adapter.js` implementiert das bestehende
`FundamentalDataProvider`-Interface aus `quant/engines/provider.js` und registriert
sich in derselben Registry wie die sechs vorhandenen Provider. Es gibt keine
zweite Provider-Abstraktion, keine zweite PIT-Regel, keine zweite Gate-Instanz und
keinen zweiten Backtester. Der SEC-Adapter fügt einen Provider hinzu; er verändert
den Kern nicht.

Was ihn tragfähig macht, ist gemessen und nicht behauptet: 27 231 Beobachtungen
PIT-geprüft, 602 Restatements mit vollständiger Revisionskette, Gate A und C für
alle fünf Unternehmen bestanden, vollständige Provenance auf jedem einzelnen
Fakt.

**Nein, für Universumskonstruktion** — dazu Gate B (Frage 9) und Frage 19.

## 19. Welche Einschränkungen bestehen weiterhin?

1. **Survivorship-Bias im Universum.** SEC allein kann kein historisches
   Universum konstruieren. Gate B bleibt FAIL. Ein Backtest braucht dafür eine
   Point-in-Time-Indexhistorie aus anderer Quelle.
2. **Keine Kursdaten.** Kein OHLCV, keine Marktkapitalisierung, keine Renditen —
   damit kein Value- und kein Momentum-Faktor aus dieser Quelle. Das bleibt
   Aufgabe des `MarketDataProvider`. `MARKET_DATA_AVAILABLE` steht deshalb auf
   NOT_APPLICABLE, nicht auf FAIL.
3. **Keine Corporate Actions und keine Split-Historie.** Kennzahlen je Aktie über
   Splits hinweg brauchen eine externe Quelle.
4. **Keine Analystenschätzungen.** Kein Forward-KGV, keine Surprise-Faktoren.
5. **Strukturierte Daten erst ab 2007/2008.** 1993–2006 liegt als FILING_ONLY
   vor: die Zahlen existieren, aber nur im Dokument. Rückgewinnung wäre
   Dokumenten-Parsing, geschätzt rund 14 Jahre je Unternehmen.
6. **30 unterdrückte Zellen** in den frühen XBRL-Jahren (NVDA 2010–2013, XOM 1).
   Bekannt, benannt, mit Grund gemeldet — kein stiller Verlust.
7. **5 `FUTURE_DATA_LEAK`-Rohfakten bei NVDA**, deren Periodenende nach dem
   eigenen Einreichungsdatum liegt — durchweg auf Konzepten, die die Registry
   nicht abbildet (Dividendenerklärungen, Rückkaufautorisierungen, Public
   Float). Markiert, nicht korrigiert; sie erreichen die kanonische Schicht
   nicht. Die ERROR-Severity ist für zukunftsgerichtete Angaben streng
   angesetzt — bewusst nicht abgesenkt, weil eine Regel nicht nachjustiert wird,
   damit eine Zahl besser aussieht.
8. **Nur fünf Unternehmen gemessen.** Die Architektur ist nicht nach Ticker
   parametrisiert und der Bulk-Pfad für ~500+ Unternehmen ist implementiert und
   getestet — aber *gemessen* ist der Durchsatz bei fünf. Der nächste
   Skalierungsschritt ist ein Lauf über ein größeres Universum, nicht eine
   Codeänderung.
9. **`ebitda` und `dividendPerShare`** stehen als `UNSUPPORTED_METRICS`: sie
   lassen sich aus den vorhandenen XBRL-Konzepten nicht verlustfrei ableiten.
   Explizit ausgeschlossen statt näherungsweise berechnet.

## 20. Klare Empfehlung

**READY FOR PR.**

Begründung:

- Alle fünf Unternehmen laden fehlerfrei, zwölf Läufe, keine offenen Fehlschläge.
- Jeder durch echte SEC-Daten gefundene Fehler ist analysiert, minimal behoben
  und durch einen Regressionstest abgesichert — elf Stück.
- 492 Tests grün, keiner gelöscht, keiner abgeschwächt.
- Gate A und C: 5 von 5 PASS mit `RUNTIME_VERIFIED`. Die sechs Ingest-Prüfungen:
  5 von 5 PASS.
- Gate B: 5 von 5 FAIL — **ehrlich, dokumentiert und beabsichtigt**. Es
  entspricht einer Eigenschaft der Quelle, nicht einem Mangel der
  Implementierung, und es wurde kein PASS erfunden, um die Bilanz zu verbessern.
- Keine erfundenen Daten, keine stillen Fallbacks, kein einziger
  unternehmensspezifischer Sonderweg im Code. Die einzige Ausnahme für XOM ist
  eine *deklarierte* Konfiguration mit gemessener Begründung, die eine allgemeine
  Regel durchsetzt.
- Keine Secrets und keine Rohdatensätze im öffentlichen Repository, durch
  `.gitignore` **und** einen Workflow-Guard abgesichert.

Was der PR *nicht* beansprucht: ein survivorship-freies Universum, Kursdaten,
strukturierte Historie vor 2007, oder mehr als fünf gemessene Unternehmen. Diese
Grenzen stehen in den Artefakten selbst — als FAIL, als NOT_APPLICABLE oder als
`null` mit Grundcode — und nicht nur in dieser Dokumentation.

---

## Reproduktion

```bash
# Vollständige Kette, wie sie der Workflow ausführt:
python3 scripts/quant/cli.py resolve      # Ticker -> CIK gegen die SEC
python3 scripts/quant/cli.py ingest       # Live-Abruf und Normalisierung
python3 scripts/quant/cli.py coverage     # gemessene Coverage-Matrix
python3 scripts/quant/cli.py canonical    # kanonische FundamentalFact-Schicht
python3 scripts/quant/cli.py gates        # Ingest-Prüfungen
node scripts/quant/run-sec-gates.mjs      # Gate A/B/C aus gate-tests.js
python3 scripts/quant/cli.py export       # Data-Inspector-Ansichten
```

Nur `resolve`, `ingest` und `update` erreichen `data.sec.gov`; alles andere
arbeitet offline gegen bereits Ingestiertes.
