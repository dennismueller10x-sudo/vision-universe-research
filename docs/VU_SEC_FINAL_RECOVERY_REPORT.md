# SEC Fundamentals — Abschlussbericht des Recovery-Zyklus (§25 / §26)

Erzeugt 2026-09-13T18:28:25+00:00 aus den Artefakten unter `quant/data/fundamentals/`. **Jede Zahl ist gelesen, keine getippt.** Vorher = `baseline-before-final-recovery.json` (Lauf 34749245361), Nachher = aktueller Stand (Normalisierung 1.9.0, Registry 1.5.0).

## 1 — Luecken nach Loesbarkeit (Produktuniversum 7.004)

| Kennzahl | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `SEC_RECOVERABLE` | 384 | 161 | -223 |
| `EXTERNAL_PROVIDER_CANDIDATE` | 111 | 60 | -51 |
| `RESOLVES_WITH_TIME` | 821 | 910 | +89 |
| `BY_DESIGN` | 312 | 312 | +0 |
| `REQUIRES_REVIEW` | 389 | 389 | +0 |

## 2 — Die SEC_RECOVERABLE-Faelle, einzeln begruendet (§5)

Nenner: 161 Faelle, 161 zugeordnet, 0 ohne Grund. Davon nach Konsequenz: {"RESOLVES_WITH_TIME": 40, "REQUIRES_REVIEW": 42, "EXTERNAL_PROVIDER_CANDIDATE": 16, "NOT_APPLICABLE": 62, "INDUSTRY_LAYER": 1}; noch SEC-loesbar: **0** (vorher 72).

| Feinursache | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `SPECIAL_PURPOSE_ENTITY` | 48 | 48 | +0 |
| `REQUIRES_REVIEW` | 54 | 42 | -12 |
| `VERY_YOUNG_LISTING` | n/a | 40 |  |
| `SPAC_BLANK_CHECK` | 171 | 14 | -157 |
| `NO_XBRL_FACTS` | n/a | 13 |  |
| `NO_XBRL_FINANCIALS` | n/a | 3 |  |
| `BANK` | 3 | 1 | -2 |
| `ASSET_MANAGER` | 7 | n/a |  |
| `IFRS_REMAINING` | 3 | n/a |  |
| `PERIOD_MAPPING` | 9 | n/a |  |
| `TRUE_MISSING_TAG_MAPPING` | 32 | n/a |  |
| `BALANCE_SHEET_ONLY` | 28 | n/a |  |
| `INSUFFICIENT_DISCLOSURE` | 29 | n/a |  |

## 3 — Titelzustaende (§12)

| Zustand | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `AVAILABLE` | 4.987 | 5.172 | +185 |
| `PARTIAL` | 483 | 521 | +38 |
| `MISSING` | 343 | 58 | -285 |
| `NOT_APPLICABLE` | n/a | 62 |  |
| `REQUIRES_REVIEW` | n/a | 0 |  |
| `UNAVAILABLE` | 1.191 | 1.191 | +0 |

## 4 — Point-in-Time und Kernkennzahlen (Technical-Universum 5.963)

| Kennzahl | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `PIT_READY` | 5.470 | 5.693 | +223 |
| `PIT_R2_AND_TECHNICAL` | 5.139 | 5.152 | +13 |
| `PIT_R2_TECHNICAL_AND_CORE_FUNDAMENTALS` | 4.480 | 4.480 | +0 |
| `TECHNICAL_WITH_REVENUE` | 4.485 | 4.485 | +0 |
| `TECHNICAL_WITH_NET_INCOME` | 5.134 | 5.134 | +0 |
| `TECHNICAL_WITH_ASSETS` | 5.132 | 5.145 | +13 |
| `TECHNICAL_WITH_EQUITY` | 5.102 | 5.113 | +11 |
| `TECHNICAL_WITH_OPERATING_CASH_FLOW` | 5.120 | 5.120 | +0 |
| `TECHNICAL_WITH_FCF` | 4.593 | 4.593 | +0 |
| `TECHNICAL_WITH_EPS` | 4.876 | 4.876 | +0 |
| `TECHNICAL_WITH_DEBT` | 2.897 | 2.897 | +0 |

## 5 — Backtest-Bereitschaft ohne Look-ahead (§20)

| Stufe | Vorher | Nachher | Δ |
|---|---:|---:|---:|
| `BACKTEST_PRICE_READY` | 6.997 | 6.997 | +0 |
| `BACKTEST_PRICE_TECHNICAL_READY` | 5.963 | 5.963 | +0 |
| `BACKTEST_PIT_FUNDAMENTAL_READY` | 5.139 | 5.152 | +13 |
| `BACKTEST_5Y_READY` | 4.424 | 4.593 | +169 |
| `BACKTEST_10Y_READY` | 3.017 | 3.240 | +223 |
| `BACKTEST_15Y_READY` | 2.242 | 2.350 | +108 |

Look-ahead-Regel: PIT_READY verlangt Veroeffentlichungsdatum UND Akzessionsnummer fuer JEDEN aufgeloesten Wert.

## 6 — Persistenz (§3, §21)

| Kennzahl | Wert |
|---|---:|
| `PERSISTED_ISSUERS` | 5.437 |
| `PERSISTED_ANNUAL_HISTORIES` | 5.299 |
| `PERSISTED_QUARTERLY_HISTORIES` | 5.333 |
| `PERSISTED_PIT_HISTORIES` | 5.333 |
| `PERSISTED_METADATA` | 5.356 |
| `PERSISTED_STORAGE_BYTES` | 639.656.471 |
| `PERSISTENCE_LOCATION` | r2:vision-universe-history/v1/sec/fundamentals/ |
| `byNormalizationVersion` | `{"1.9.0": 5437}` |
| `witness.keysOutsidePrefix` | 0 |
| `witness.priceStoreUntouched` | True |
| `RELOAD_WITHOUT_SEC_REFETCH` | **PASS** (8/8, networkBlocked=True) |

| Zurueckgeladen | Dokument identisch | kanonische Fakten | identisch | Waehrung | Jahre | Restatements | PIT vollstaendig |
|---|---|---:|---|---|---:|---:|---|
| 0000072971 | True | 587 | True | USD | 21 | 156 | True |
| 0000093410 | True | 1.045 | True | USD | 20 | 260 | True |
| 0000217410 | True | 49 | True | EUR | 12 | 12 | True |
| 0000320193 | True | 1.043 | True | USD | 21 | 116 | True |
| 0000756894 | True | 69 | True | USD | 14 | 15 | True |
| 0000820027 | True | 828 | True | USD | 21 | 234 | True |
| 0000932787 | True | 133 | True | USD | 20 | 43 | True |
| 0001279704 | True | 606 | True | USD | 25 | 55 | True |

## 7 — Branchenschicht (§10)

| Branche | Emittenten | mit Branchenkennzahl | Anteil | Kennzahlen |
|---|---:|---:|---:|---|
| INSURER | 131 | 113 | 86.3 % | available_for_sale_debt_securities (96), benefits_and_claims_incurred (91), benefits_losses_and_expenses (81), claims_liability (96), deferred_policy_acquisition_costs (92), net_investment_income (90), premiums_earned (100), total_investments (94), unearned_premiums (84) |
| REIT | 175 | 174 | 99.4 % | dividends_declared_per_share (148), impairment_of_real_estate (112), real_estate_accumulated_depreciation (145), real_estate_gross (143), real_estate_net (131), secured_debt (111) |
| BANK | 362 | 330 | 91.2 % | allowance_for_loan_losses (288), available_for_sale_debt_securities (294), cash_and_due_from_banks (274), deposits (305), interest_and_dividend_income (296), interest_and_fee_income_loans (279), interest_expense_deposits (260), loans_and_leases_net (285), net_interest_income (316), net_interest_income_after_provision (303), noninterest_expense (302), noninterest_income (303), provision_for_credit_losses (269), time_deposits (290) |

## 8 — Anbieterfrage (§22)

Kandidatenprofil: 60 Titel, davon 8 auslaendische Emittenten, 52 sonstige. Entscheidung: **OFFEN (§15).** Ein Anbieter schliesst nur, was die SEC nicht fuehrt: Emittenten ohne XBRL-Abschluesse (40-F-Befreiung, leeres companyfacts) und Titel ohne CIK.

## 9 — Bestaetigungen (§26)

| Bestaetigung | Beleg |
|---|---|
| Vollstaendiger produktiver SEC-Lauf ueber alle Emittenten des Produktuniversums | coverage-report.json: ISSUERS_INGESTED_TOTAL |
| Echte SEC/EDGAR-Daten, keine Attrappen im Bestand | persistence.json: driver s3, sha256 je Objekt; Tests laufen gegen synthetische Fixtures, nie gegen den Speicher |
| Vollstaendige Neu-Normalisierung unter NORMALIZATION_LOGIC_VERSION | reconciliation.json: versions.normalization_logic; persistence.json: byNormalizationVersion |
| Dauerhaft persistiert (R2, v1/sec/fundamentals/), nicht Runner-Disk oder Cache | persistence.json: PERSISTED_* und PERSISTENCE_LOCATION |
| Ohne SEC-Refetch zurueckgeladen und byte-gleich verglichen, Netz gesperrt | reload-verification.json: RELOAD_WITHOUT_SEC_REFETCH, networkBlocked |
| Join gegen den kanonischen R2-Marktdatenstand erneut gelaufen | reconciliation.json: overlap gegen 7.004 / 6.997 / 5.963 |
| Keine kuenstliche Coverage: kein Wert ohne gemeldeten Fakt, kein MISSING als Null | fundamental-quality.json: byState fuehrt MISSING und NOT_APPLICABLE getrennt |
| Keine Fremdwaehrung als USD ausgewiesen; nichts umgerechnet | reload-verification.json: currencies je Emittent (EUR bleibt EUR) |
| Kein SPAC-Treuhandvermoegen als Bilanzsumme, kein Treuhandertrag als Umsatz | sec-metric-registry.json: sector_rules BLANK_CHECK_SPAC; kein Mapping von AssetsHeldInTrust |
| Point-in-Time erhalten: jeder Wert traegt filed, availableAt, sourceFilingId | reload-verification.json: everyFactHasFilingAndAccession |
| Kein Look-ahead: Backtest-Stufen zaehlen nur PIT-datierbare Werte | backtest-readiness.json: lookAheadControl |
| Restatements erhalten: Revisionen je Zelle, keine Ueberschreibung | reload-verification.json: restated je Emittent |
| R2-Preisspeicher unveraendert | persistence.json: witness.priceStoreUntouched, keysOutsidePrefix = 0 |
| Eligibility unveraendert, Marktdaten nur gelesen | quant/data/market/history/CANONICAL_SOURCE.json: readOnly, r2Writes 0 |
| Kein Frontend angefasst | git diff: keine Aenderung unter app/ oder public/ |
| Kein neuer Anbieter, keine neue Speicherloesung | external-provider-candidates.json: providerDecision OFFEN; Ablage ueber den bestehenden R2-Treiber |

## 10 — Versionen

```json
{
  "normalization_schema": "1.0.0",
  "normalization_logic": "1.9.0",
  "formula": "1.2.0",
  "provider_adapter": "sec-edgar-1.0.0",
  "quality_rules": "1.0.0",
  "metric_registry": {
    "schema_version": 1,
    "mapping_version": "1.5.0"
  }
}
```
