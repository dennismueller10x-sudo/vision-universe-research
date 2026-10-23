# Supertrader 3.0 – Strategy Readiness (sechs Dimensionen)

Generiert mit `node scripts/supertrader/source-faithful/completion/build-readiness-sf3.mjs` aus `STRATEGY-COMPLETION-STATUS.json` und den Verträgen. Nicht von Hand bearbeiten. Bericht: [SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md](SUPERTRADER_3_STRATEGY_ADVANCEMENT_REPORT.md).

Grundsätze: a mechanically complete screening component is not a tradable strategy; a historical model assumption is not a source rule; a diagnostic performance is not a certified performance; a proxy (SIC group, universe breadth, VU RS percentile) never unblocks a DATA_BLOCKED rule.

| Kandidat | Strategie | 1 Source Fidelity (exakt/abgel./manuell/Daten/offen) | 2 Mechanik (Engine) | 3 blockierende Daten | 4 Messklasse | 5 manuelle Entscheidungen | 6 Live |
|---|---|---|---|---|---|---|---|
| C01 | `SF_TURTLE_S1` | 7/13/0/2/2 | RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION | TUR-SF-LIMIT-CORR | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | 0 | LIVE_NOT_APPROVED |
| C02 | `SF_TURTLE_S2` | 7/12/0/2/0 | RESEARCH_ENGINE_COMPLETE_WITH_DATA_EXCEPTION | TUR-SF-LIMIT-CORR | FULL_DIAGNOSTIC_STRATEGY_BACKTEST | 0 | LIVE_NOT_APPROVED |
| C03 | `SF_DARVAS_BOX` | 3/10/6/0/1 | MECHANICAL_SCREEN_COMPLETE | – | MECHANICAL_COMPONENT_STUDY | 8 | LIVE_NOT_APPROVED |
| C04 | `SF_WEINSTEIN_INVESTOR` | 1/5/9/2/0 | MECHANICAL_SCREEN_COMPLETE | WEIN-SF-GROUP, WEIN-SF-MARKET | SCREEN_STATISTICS | 14 | LIVE_NOT_APPROVED |
| C05 | `SF_WEINSTEIN_TRADER` | 1/5/8/2/0 | MECHANICAL_SCREEN_COMPLETE | WEIN-SF-GROUP, WEIN-SF-MARKET | SCREEN_STATISTICS | 12 | LIVE_NOT_APPROVED |
| C06 | `SF_MINERVINI_SEPA_VCP` | 0/9/7/1/0 (nur Übersetzung) | MECHANICAL_SCREEN_COMPLETE | MIN-SF-TT-8 | SCREEN_STATISTICS | 11 | LIVE_NOT_APPROVED |
| C07 | `SF_MINERVINI_POWER_PLAY` | 0/5/4/0/0 (nur Übersetzung) | MECHANICAL_SCREEN_COMPLETE | – | SCREEN_STATISTICS | 6 | LIVE_NOT_APPROVED |
| C08 | `SF_KK_BREAKOUT` | 4/1/6/1/0 | MECHANICAL_SCREEN_COMPLETE | – | SCREEN_STATISTICS | 7 | LIVE_NOT_APPROVED |
| C09 | `SF_KK_EPISODIC_PIVOT` | 4/1/3/3/1 | MECHANICAL_COMPONENTS_ONLY | KK-SF-EP-CATALYST, KK-SF-EP-VOLUME, KK-SF-EP-ENTRY | NOT_MEASURABLE | 2 | LIVE_NOT_APPROVED |
| C10 | `SF_KK_PARABOLIC_SHORT` | 3/0/4/3/0 | MECHANICAL_COMPONENTS_ONLY | KK-SF-PS-BORROW, KK-SF-PS-ENTRY, KK-SF-PS-STOP | NOT_MEASURABLE | 4 | LIVE_NOT_APPROVED |
| C11 | `SF_MOKA_POCKET_PIVOT` | 1/3/5/0/1 | MECHANICAL_SCREEN_COMPLETE | – | SCREEN_STATISTICS | 7 | LIVE_NOT_APPROVED |
| C12 | `SF_MOKA_BUYABLE_GAP_UP` | 2/2/6/0/2 | MECHANICAL_SCREEN_COMPLETE | – | SCREEN_STATISTICS | 8 | LIVE_NOT_APPROVED |
| C13 | `SF_RASCHKE_HOLY_GRAIL` | 2/4/2/0/1 | MECHANICAL_COMPONENTS_ONLY | – | NOT_MEASURABLE | 3 | LIVE_NOT_APPROVED |

## Messklassen

- **FULL_DIAGNOSTIC_STRATEGY_BACKTEST**: `SF_TURTLE_S1`, `SF_TURTLE_S2`
- **MECHANICAL_COMPONENT_STUDY**: `SF_DARVAS_BOX`
- **SCREEN_STATISTICS**: `SF_WEINSTEIN_INVESTOR`, `SF_WEINSTEIN_TRADER`, `SF_MINERVINI_SEPA_VCP`, `SF_MINERVINI_POWER_PLAY`, `SF_KK_BREAKOUT`, `SF_MOKA_POCKET_PIVOT`, `SF_MOKA_BUYABLE_GAP_UP`
- **NOT_MEASURABLE**: `SF_KK_EPISODIC_PIVOT`, `SF_KK_PARABOLIC_SHORT`, `SF_RASCHKE_HOLY_GRAIL`

## Research-Komponenten und Stellvertreter je Kandidat

### C01 `SF_TURTLE_S1` (Vertrag 1.2.0)

- Messung: diagnostic run WITH DATA EXCEPTION (TUR-SF-LIMIT-CORR not enforced in reference runs)
- Research-Komponenten: TUR-SF-LIMIT-CORR <- turtle-correlation.mjs#createCorrelationGroupProvider
- Stellvertreter (heben keine Datensperre auf): TUR-SF-LIMIT-CORR: equity model assumption, never SOURCE_EXACT
- quellenoffen: TUR-SF-S1-OPEN-BREAKOUT, TUR-SF-FAILSAFE-EXIT; Modellannahmen: MA-TUR-INTRABAR-ORDER, MA-TUR-HELD-BAR-ORDER, MA-TUR-S1-OPEN-BREAKOUT, MA-TUR-FAILSAFE-EXIT

### C02 `SF_TURTLE_S2` (Vertrag 1.2.0)

- Messung: diagnostic run WITH DATA EXCEPTION (TUR-SF-LIMIT-CORR not enforced in reference runs)
- Research-Komponenten: TUR-SF-LIMIT-CORR <- turtle-correlation.mjs#createCorrelationGroupProvider
- Stellvertreter (heben keine Datensperre auf): TUR-SF-LIMIT-CORR: equity model assumption, never SOURCE_EXACT
- quellenoffen: –; Modellannahmen: MA-TUR-INTRABAR-ORDER, MA-TUR-HELD-BAR-ORDER

### C03 `SF_DARVAS_BOX` (Vertrag 1.3.0)

- Messung: mechanical signals with their mechanical exit, equal weight, no selection or sizing; not a method return
- Research-Komponenten: DAR-SF-SELECTION <- context-evidence.mjs#withContextEvidence; DAR-SF-SELECTION <- darvas-lifecycle.mjs#DARVAS_ADAPTER; DAR-SF-MARKET <- context-evidence.mjs#withContextEvidence; DAR-SF-SIZING <- lifecycle-engine.mjs#plannedShares; DAR-SF-REENTRY <- lifecycle-engine.mjs#runResearchLifecycle
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: DAR-SF-BOTTOM-START; Modellannahmen: –

### C04 `SF_WEINSTEIN_INVESTOR` (Vertrag 1.2.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: WEIN-SF-GROUP <- industry-strength.mjs#withIndustryEvidence; WEIN-SF-MARKET <- market-breadth.mjs#buildMarketBreadth; WEIN-SF-INV-SIZE <- weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER; WEIN-SF-INV-STOP <- weinstein-lifecycle.mjs#weinsteinWeeklySetups; WEIN-SF-INV-TRAIL <- weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER; WEIN-SF-VOL5 <- weinstein-lifecycle.mjs#WEINSTEIN_INVESTOR_ADAPTER
- Stellvertreter (heben keine Datensperre auf): WEIN-SF-GROUP: VU_PROXY_OF_WEINSTEIN_GROUP_CHART; WEIN-SF-MARKET: proxy, not NYSE breadth
- quellenoffen: –; Modellannahmen: –

### C05 `SF_WEINSTEIN_TRADER` (Vertrag 1.2.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: WEIN-SF-GROUP <- industry-strength.mjs#withIndustryEvidence; WEIN-SF-MARKET <- market-breadth.mjs#buildMarketBreadth; WEIN-SF-TR-SIZE <- weinstein-lifecycle.mjs#WEINSTEIN_TRADER_ADAPTER; WEIN-SF-TR-STOP <- weinstein-lifecycle.mjs#weinsteinWeeklySetups; WEIN-SF-TR-TRAIL <- weinstein-lifecycle.mjs#WEINSTEIN_TRADER_ADAPTER
- Stellvertreter (heben keine Datensperre auf): WEIN-SF-GROUP: VU_PROXY_OF_WEINSTEIN_GROUP_CHART; WEIN-SF-MARKET: proxy, not NYSE breadth
- quellenoffen: –; Modellannahmen: –

### C06 `SF_MINERVINI_SEPA_VCP` (Vertrag 1.2.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: MIN-SF-TT-8 <- minervini-components.mjs#createRsPercentileProxy; MIN-SF-FUNDAMENTALS <- minervini-components.mjs#fundamentalEvidence; MIN-SF-VCP <- minervini-components.mjs#vcpContractions; MIN-SF-VCP <- minervini-lifecycle.mjs#sepaSetupFromTrendTemplate; MIN-SF-PIVOT <- minervini-components.mjs#pivotBreakout; MIN-SF-PIVOT <- minervini-lifecycle.mjs#entryEligibility; MIN-SF-PIVOT <- minervini-lifecycle.mjs#fillBuyOrder; MIN-SF-STOP <- minervini-components.mjs#sellEvidence; MIN-SF-STOP <- minervini-execution.mjs#runMinerviniLifecycle; MIN-SF-SIZE <- minervini-components.mjs#positionSize; MIN-SF-SIZE <- minervini-execution.mjs#runMinerviniLifecycle; MIN-SF-SELL <- minervini-components.mjs#sellEvidence; MIN-SF-SELL <- minervini-execution.mjs#runMinerviniLifecycle
- Stellvertreter (heben keine Datensperre auf): MIN-SF-TT-8: VU percentile of the PIT research universe; not the IBD rating, never a gate
- quellenoffen: –; Modellannahmen: –

### C07 `SF_MINERVINI_POWER_PLAY` (Vertrag 1.3.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: MIN-SF-PP-ENTRY <- minervini-components.mjs#powerPlayClassify; MIN-SF-PP-ENTRY <- minervini-lifecycle.mjs#entryEligibility; MIN-SF-PP-STOP <- minervini-execution.mjs#runMinerviniLifecycle; MIN-SF-PP-SIZE <- minervini-execution.mjs#runMinerviniLifecycle; MIN-SF-PP-EXIT <- minervini-execution.mjs#runMinerviniLifecycle
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: –; Modellannahmen: –

### C08 `SF_KK_BREAKOUT` (Vertrag 1.2.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: KK-SF-PRIORITY <- context-evidence.mjs#withContextEvidence; KK-SF-SIZE <- lifecycle-engine.mjs#plannedShares; KK-SF-BO-SETUP <- kk-breakout-lifecycle.mjs#kkBreakoutSetupAt; KK-SF-BO-ENTRY <- kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER; KK-SF-BO-PARTIAL <- kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER; KK-SF-BO-TRAIL <- kk-breakout-lifecycle.mjs#KK_BREAKOUT_ADAPTER
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: –; Modellannahmen: –

### C09 `SF_KK_EPISODIC_PIVOT` (Vertrag 1.1.0)

- Messung: the essential entry or stop is data- or source-blocked; no daily-bar substitute; setup counts are evidence only
- Research-Komponenten: KK-SF-PRIORITY <- context-evidence.mjs#withContextEvidence
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: KK-SF-EP-EXIT; Modellannahmen: –

### C10 `SF_KK_PARABOLIC_SHORT` (Vertrag 1.1.0)

- Messung: the essential entry or stop is data- or source-blocked; no daily-bar substitute; setup counts are evidence only
- Research-Komponenten: KK-SF-PRIORITY <- context-evidence.mjs#withContextEvidence
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: –; Modellannahmen: –

### C11 `SF_MOKA_POCKET_PIVOT` (Vertrag 1.3.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: MOKA-SF-PP-CONTEXT <- context-evidence.mjs#withContextEvidence; MOKA-SF-PP-SIZE <- lifecycle-engine.mjs#plannedShares; MOKA-SF-EXIT-MA <- moka-lifecycle.mjs#sellGuideSeries; MOKA-SF-EXIT-VIOLATION <- lifecycle-engine.mjs#protectiveHit; MOKA-SF-EXIT-CONTEXT <- context-evidence.mjs#withContextEvidence
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: MOKA-SF-EXIT-VIOLATION; Modellannahmen: –

### C12 `SF_MOKA_BUYABLE_GAP_UP` (Vertrag 1.3.0)

- Messung: machine screen with manual layer: counts and coverage of candidates; a forward price change after a screen is a screen statistic, not a strategy return
- Research-Komponenten: MOKA-SF-BGU-CONTEXT <- context-evidence.mjs#withContextEvidence; MOKA-SF-BGU-SELLGUIDE <- lifecycle-engine.mjs#protectiveHit; MOKA-SF-BGU-SIZE <- lifecycle-engine.mjs#plannedShares; MOKA-SF-EXIT-MA <- moka-lifecycle.mjs#sellGuideSeries; MOKA-SF-EXIT-VIOLATION <- lifecycle-engine.mjs#protectiveHit; MOKA-SF-EXIT-CONTEXT <- context-evidence.mjs#withContextEvidence
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: MOKA-SF-BGU-VOLWINDOW, MOKA-SF-EXIT-VIOLATION; Modellannahmen: –

### C13 `SF_RASCHKE_HOLY_GRAIL` (Vertrag 1.2.0)

- Messung: the essential entry or stop is data- or source-blocked; no daily-bar substitute; setup counts are evidence only
- Research-Komponenten: RAS-SF-ENTRY <- holy-grail-lifecycle.mjs#HOLY_GRAIL_RESEARCH_ADAPTER; RAS-SF-STOP <- holy-grail-lifecycle.mjs#holyGrailSetupSeries
- Stellvertreter (heben keine Datensperre auf): –
- quellenoffen: RAS-SF-ENTRY, RAS-SF-STOP, RAS-SF-SIZE; Modellannahmen: –

