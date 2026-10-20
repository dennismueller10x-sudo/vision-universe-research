# Supertrader – Strategy Backtest Readiness

Generiert aus `scripts/supertrader/source-faithful/artifacts/` mit `node scripts/supertrader/source-faithful/build-docs.mjs`. Nicht von Hand bearbeiten. Quelle: Draft-PR #709 @ `8b766fa` (hash-geprüft). Alle Ergebnisse `DIAGNOSTIC_NOT_CERTIFIED`; keine Methode ist live oder handelbar.

Bindung: Snapshot `sts1-134d4d62eb88b6ff8d98fe6e56b12a6d`, Abrechnung `RESEARCH_V1`, Zertifizierung `DIAGNOSTIC_NOT_CERTIFIED`.

| Kandidat | Strategie | Status | Daten | Ausführung | Backtest | vollautomatisierbar | Blocker produktive Freigabe |
|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | PARTIAL_DATA_BLOCKED | PARTIAL | RESEARCH_EXECUTABLE | DIAGNOSTIC_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: TUR-SF-LIMIT-CORR, TUR-SF-SHORT |
| C02 | `SF_TURTLE_S2` | PARTIAL_DATA_BLOCKED | PARTIAL | RESEARCH_EXECUTABLE | DIAGNOSTIC_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: TUR-SF-LIMIT-CORR, TUR-SF-SHORT |
| C03 | `SF_DARVAS_BOX` | PARTIAL_MANUAL_REVIEW | PARTIAL | MANUAL_REVIEW_SCREEN | COMPONENT_SIGNAL_STUDY_ONLY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required |
| C04 | `SF_WEINSTEIN_INVESTOR` | PARTIAL_DATA_BLOCKED | PARTIAL | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: WEIN-SF-GROUP, WEIN-SF-MARKET; manual review layer required; no diagnostic method backtest possible |
| C05 | `SF_WEINSTEIN_TRADER` | PARTIAL_DATA_BLOCKED | PARTIAL | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: WEIN-SF-GROUP, WEIN-SF-MARKET; manual review layer required; no diagnostic method backtest possible |
| C06 | `SF_MINERVINI_SEPA_VCP` | PARTIAL_DATA_BLOCKED | PARTIAL | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: MIN-SF-TT-8; manual review layer required; no diagnostic method backtest possible |
| C07 | `SF_MINERVINI_POWER_PLAY` | PARTIAL_MANUAL_REVIEW | READY | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required; no diagnostic method backtest possible |
| C08 | `SF_KK_BREAKOUT` | PARTIAL_MANUAL_REVIEW | READY | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required; no diagnostic method backtest possible |
| C09 | `SF_KK_EPISODIC_PIVOT` | PARTIAL_DATA_BLOCKED | BLOCKED | COMPONENTS_ONLY_DATA_BLOCKED | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: KK-SF-EP-CATALYST, KK-SF-EP-VOLUME, KK-SF-EP-ENTRY; manual review layer required; no diagnostic method backtest possible |
| C10 | `SF_KK_PARABOLIC_SHORT` | PARTIAL_DATA_BLOCKED | BLOCKED | COMPONENTS_ONLY_DATA_BLOCKED | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); DATA_BLOCKED: KK-SF-PS-ENTRY, KK-SF-PS-STOP, KK-SF-PS-BORROW; manual review layer required; no diagnostic method backtest possible |
| C11 | `SF_MOKA_POCKET_PIVOT` | PARTIAL_MANUAL_REVIEW | READY | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required; no diagnostic method backtest possible |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | PARTIAL_MANUAL_REVIEW | PARTIAL | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required; no diagnostic method backtest possible |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | PARTIAL_MANUAL_REVIEW | READY | MANUAL_REVIEW_SCREEN | NOT_READY | nein | no owner release (research only, Draft PRs); measurement not certified (#705 NOT_CERTIFIED, V4-D1 open); manual review layer required; no diagnostic method backtest possible |

## Was diagnostisch gemessen werden darf

- **C01 SF_TURTLE_S1:** full mechanical equity adaptation (long only, no correlation limits) on the snapshot with research-v1, five scenarios
- **C02 SF_TURTLE_S2:** full mechanical equity adaptation (long only, no correlation limits) on the snapshot with research-v1, five scenarios
- **C03 SF_DARVAS_BOX:** component signal study only: ATH-gated box breakouts with their mechanical stop exits, equal weight, no selection or sizing
- **C04 SF_WEINSTEIN_INVESTOR:** none (stage, volume, stop and group judgments are manual or data-blocked); forward review log only
- **C05 SF_WEINSTEIN_TRADER:** none (stage, stop and group judgments are manual or data-blocked); forward review log only
- **C06 SF_MINERVINI_SEPA_VCP:** none (manual relative priority by design, IBD RS blocked); screen counts only
- **C07 SF_MINERVINI_POWER_PLAY:** none (entry / stop manual, thresholds translation-unverified); screen counts only
- **C08 SF_KK_BREAKOUT:** none (breakout level manual, exits are preferences); stop-acceptance statistics for reviewer-set levels only
- **C09 SF_KK_EPISODIC_PIVOT:** none (catalyst and intraday data missing)
- **C10 SF_KK_PARABOLIC_SHORT:** none (intraday and borrow data missing)
- **C11 SF_MOKA_POCKET_PIVOT:** none (no mechanical exit; fixed horizons would be invented); signal counts only
- **C12 SF_MOKA_BUYABLE_GAP_UP:** none (no mechanical exit); signal counts only
- **C13 SF_RASCHKE_HOLY_GRAIL:** none (stop and order sequence not disclosed); signal counts only

## Gemeinsame Blocker

- V4-D1 (#705): undeclared reverse splits in the canonical price core; a Quant PR with causal detection and a new calibration generation is required before any certification
- V4-D2 (#705): EW universe share-class audit open
- no live activation, no order routing, no portfolio change in this work (mandate section 17)
- Draft PRs SF-1 .. SF-9 need the owner's merge decision; #709 / #712 remain drafts
