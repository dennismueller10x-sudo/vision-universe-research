# SEC-COVERAGE-MAXIMIERUNG — VORHER / NACHHER

Maximierung der fundamentalhistorischen Coverage **ausschließlich aus den
bereits verfügbaren SEC/EDGAR-Daten**. Kein neuer Provider, keine
Frontend-Arbeit, keine R2-Änderung, keine geratenen Werte.

Beide Seiten sind **gemessen**: der Vorher-Stand in
`baseline-before-ifrs.json` (Registry 1.1.0, Normalisierung 1.6.0), der
Nachher-Stand aus Lauf `34744796159` (Registry 1.2.0, Normalisierung
1.7.0).

---

## 0 — WAS DIE LÜCKE WIRKLICH WAR

Gemessen mit `cli.py concepts` (Lauf 34743708708), nicht vermutet. Hinter
den 926 `SEC_RECOVERABLE`-Fällen standen **zwei** Sperren, und beide
trafen dieselben Titel:

1. **Die Registry kannte nur `us-gaap`.** Für einen 20-F-Einreicher gab
   es gar nichts zu mappen. Im Bestand liegen 1.495.276
   `ifrs-full`-Fakten; bei den Emittenten ohne eine einzige auflösbare
   Zeitreihe waren 180.190 von 212.800 unbekannten Fakten IFRS.
2. **35 Kennzahlen ließen nur `USD` zu.** Unilever meldet in EUR,
   Canadian National in CAD. Ein korrekt gemapptes Konzept wäre trotzdem
   an der Einheit gescheitert — mit einem `UNIT_MISMATCH`, der aussieht
   wie ein Datenfehler und einer ist, den wir gebaut haben.

Ergänzt wurden **31 gemessene Konzepte** (Revenue bei 52 Emittenten,
ProfitLoss bei 63, Assets bei 62, …) plus die Bilanzidentität
`LiabilitiesAndStockholdersEquity`, von 4.828 Emittenten gemeldet und nie
gemappt. Keines stammt aus dem Gedächtnis.

**Umgerechnet wurde nichts.** Ein Kurs von heute auf eine Periode von
2012 wäre geraten und zerstörte genau die Point-in-Time-Eigenschaft, die
diese Schicht trägt. Der Wert behält seine Währung, und die Währung steht
daneben.

---

## 1 — KENNZAHLEN (Nenner 7.004 Produkttitel)

| Kennzahl | vorher | nachher | Δ |
|---|---:|---:|---:|
| `revenue` | 3.987 | 4.400 | **+413** |
| `net_income` | 4.537 | 5.036 | **+499** |
| `eps_diluted` | 4.276 | 4.756 | **+480** |
| `operating_cash_flow` | 4.525 | 5.018 | **+493** |
| `capital_expenditures` | 4.075 | 4.522 | **+447** |
| `free_cash_flow` | 4.073 | 4.512 | **+439** |
| `total_assets` | 4.591 | 5.087 | **+496** |
| `total_debt` | 2.480 | 2.823 | **+343** |
| `stockholders_equity` | 4.555 | 5.057 | **+502** |

## 2 — UNIVERSEN UND OVERLAP

| | vorher | nachher | Δ |
|---|---:|---:|---:|
| `PRODUCT_TITLES` | 7.004 | 7.004 | **0** |
| `PIT_READY` | 4.928 | 5.470 | **+542** |
| `PIT_R2_AND_TECHNICAL` | 4.633 | 5.139 | **+506** |
| `PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS` | 4.056 | 4.481 | **+425** |

`COMPANY_FACTS_AVAILABLE` (5.406) und `TECHNICAL_AND_FUNDAMENTAL` (5.215)
bleiben unverändert — **richtig so**: es kamen keine Emittenten dazu. Was
sich änderte, ist, wie viele von ihnen tatsächlich auswertbare Zahlen
liefern.

## 3 — BACKTEST-READINESS

| Stufe | vorher | nachher | Δ |
|---|---:|---:|---:|
| `BACKTEST_PRICE_READY` | 6.997 | 6.997 | **0** |
| `BACKTEST_PRICE_TECHNICAL_READY` | 5.963 | 5.963 | **0** |
| `BACKTEST_PRICE_FUNDAMENTAL_READY` | 4.633 | 5.139 | **+506** |
| `BACKTEST_PIT_FUNDAMENTAL_READY` | 4.633 | 5.139 | **+506** |
| `BACKTEST_5Y_READY` | 3.955 | 4.424 | **+469** |
| `BACKTEST_10Y_READY` | 2.846 | 3.017 | **+171** |
| `BACKTEST_15Y_READY` | 2.192 | 2.242 | **+50** |

## 4 — TITELZUSTÄNDE

| Zustand | vorher | nachher | Δ |
|---|---:|---:|---:|
| `AVAILABLE` | 4.447 | 4.987 | **+540** |
| `PARTIAL` | 481 | 483 | **+2** |
| `MISSING` | 885 | 343 | **-542** |
| `UNAVAILABLE` | 1.191 | 1.191 | **0** |

## 5 — LÜCKEN

| Gruppe | vorher | nachher | Δ |
|---|---:|---:|---:|
| `SEC_RECOVERABLE` | 926 | 384 | **-542** |
| `EXTERNAL_PROVIDER_CANDIDATE` | 132 | 111 | **-21** |
| `RESOLVES_WITH_TIME` | 798 | 821 | **+23** |
| `BY_DESIGN` | 312 | 312 | **0** |
| `REQUIRES_REVIEW` | 389 | 389 | **0** |

**`SEC_RECOVERABLE` fiel um 542 Titel (−59 %).** Der IFRS-Block ging von
561 auf **25** zurück — 96 % geschlossen.

---

## 6 — WAS VON DEN 926 ÜBRIG IST

| Block | Titel | Formulare |
|---|---:|---|
| `IFRS_OR_FOREIGN_TAXONOMY` | 25 | {"20-F": 22, "40-F": 2, "20-F/A": 1} |
| `MISSING_CANONICAL_TAG_MAPPING` | 208 | {"10-Q": 206, "10-Q/A": 2} |
| `PERIOD_MAPPING` | 12 | {"10-Q": 12} |
| `OTHER_SEC_RECOVERABLE` | 139 | {"KEINE_EINREICHUNG": 136, "10-Q": 3} |

### Warum hier Schluss ist

Von den 320 Emittenten ohne einen einzigen auflösbaren Wert sind
**156 SIC 6770 — „Blank Checks", also SPACs**, dazu vorumsatzliche
Pharmatitel (SIC 2834) und Explorationsbergbau. Ihre häufigsten
ungemappten Konzepte sind `AssetsHeldInTrustNoncurrent`,
`DeferredOfferingCosts`, `TemporaryEquityAccretionToRedemptionValue` und
`ProceedsFromIssuanceInitialPublicOffering` — das Vokabular einer
Mantelgesellschaft.

**Ein SPAC hat keinen Umsatz.** Das Treuhandvermögen auf `total_assets`
zu mappen wäre keine Deckung, sondern eine erfundene Zahl: eine einzelne
Bilanzzeile als Bilanzsumme auszugeben. Genau das ist die künstliche
Coverage, die ausgeschlossen war. Die Lücke bleibt deshalb stehen und
trägt ihren Grund.

In der IFRS-Liste taucht **kein einziges** Konzept mehr auf — die
Taxonomie der verbleibenden Lücke ist zu 100 % `us-gaap`.

---

## 7 — NEBENBEFUND: EINE FALSCHE ETIKETTE

Mit den Fremdwährungen entstand ein Fehler, den es vorher nicht geben
konnte: `derived.py` stempelte jede abgeleitete Größe als `USD`. Der
freie Cashflow von Unilever wäre damit aus EUR-Eingangsgrößen gerechnet
und als USD-Betrag ausgewiesen worden.

Abgeleitete Größen tragen jetzt die Währung ihrer Eingangsgrößen, und
Operanden verschiedener Währungen ergeben **keine Zahl**, sondern
`MIXED_CURRENCY` mit Grund. Lieber keine Zahl als eine falsche.

---

## 8 — WAS NICHT GETAN WURDE

- Kein Provider integriert, keiner ausgewählt.
- Keine Frontend-Arbeit, keine R2-Änderung, null Kursanfragen.
- Keine Werte geraten, keine Lücke mit `null` gleichgesetzt.
- Die Point-in-Time-Eigenschaft blieb vollständig erhalten: jeder Wert
  trägt weiter `filedAt` und `sourceFilingId`.

---

*Vorher: `baseline-before-ifrs.json`. Nachher: Lauf `34744796159`,
gemessen am 2026-09-13.*
