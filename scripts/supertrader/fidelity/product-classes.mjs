// Supertrader R15 – Produktklassen und Replication-Claim je Live-Version (Metadaten; UI folgt später).
// Benennung künftiger Versionen: <methode>-<klasse>-<semver>, z. B. minervini-replication-1.0.0,
// turtle-futures-replication-1.0.0, turtle-equity-adaptation-1.0.0. Eine Version ist nie zugleich Original und VU-Optimierung.
import { PRODUCT_CLASS as C, FIDELITY as F } from './taxonomy.mjs';

export const NAMING = Object.freeze({
  pattern: /^(minervini|weinstein|darvas|kullamaegi-breakout|kullamaegi-ep|turtle-futures|turtle-equity|vu-trend-52w)-(replication|adaptation|native)-\d+\.\d+\.\d+$/,
  examples: ['minervini-replication-1.0.0', 'minervini-adaptation-1.0.0', 'weinstein-replication-1.0.0', 'turtle-futures-replication-1.0.0', 'turtle-equity-adaptation-1.0.0', 'vu-trend-52w-native-1.0.0'],
});

// Einstufung der heutigen Live-Versionen nach R15 (Belege: docs/SUPERTRADER_R15_CANONICAL_RECONSTRUCTION.md, R15-FIDELITY-MATRIX.json).
export const LIVE_CLASSIFICATION = Object.freeze({
  MOMENTUM_BREAKOUT: { version: '3.2.0', productClass: C.VU_ADAPTATION, displayName: 'VU Adaptation – Kullamägi Breakout', replicationClaimAllowed: false, overall: F.MEDIUM, overallNote: 'Breakout-Kern quellennah (Stop, Teilverkauf, SMA-Ausstieg, Risiko); EP/PS fehlen',
    fidelity: { entry: F.MEDIUM, exit: F.HIGH, sizing: F.HIGH, portfolio: F.LOW, fundamental: F.HIGH, marketRegime: F.LOW } },
  WEINSTEIN_STAGE: { version: '4.0.0', productClass: C.VU_ADAPTATION, displayName: 'VU Adaptation – Weinstein Stage Analysis', replicationClaimAllowed: false, overall: F.LOW, overallNote: 'nur Einstiegsidee; Größe Fremdregel, Stop/Ausstieg VU',
    fidelity: { entry: F.MEDIUM, exit: F.LOW, sizing: F.LOW, portfolio: F.LOW, fundamental: F.HIGH, marketRegime: F.MEDIUM } },
  DARVAS_BOX: { version: '3.0.2', productClass: C.VU_ADAPTATION, displayName: 'VU Adaptation – Darvas', replicationClaimAllowed: false, overall: F.LOW, overallNote: 'Kauforder über Box + Stop knapp darunter original; Zahlen, Filter, Marktampel VU/TraderFox',
    fidelity: { entry: F.MEDIUM, exit: F.MEDIUM, sizing: F.LOW, portfolio: F.MEDIUM, fundamental: F.LOW, marketRegime: F.LOW } },
  MINERVINI_VCP: { version: '2.0.0', productClass: C.VU_ADAPTATION, displayName: 'VU Adaptation – Minervini', replicationClaimAllowed: false, overall: F.LOW, overallNote: 'Trend Template + VU-VCP ohne SEPA und ohne Verkauf in die Stärke',
    fidelity: { entry: F.MEDIUM, exit: F.LOW, sizing: F.MEDIUM, portfolio: F.MEDIUM, fundamental: F.LOW, marketRegime: F.MEDIUM } },
  DONCHIAN_TURTLE: { version: '2.0.2', productClass: C.VU_ADAPTATION, displayName: 'VU Equity Adaptation – Turtle Trading', replicationClaimAllowed: false, overall: F.LOW, overallNote: 'System-1-Signale nah am Original; Anlageklasse, Units, Portfolio fremd',
    fidelity: { entry: F.MEDIUM, exit: F.HIGH, sizing: F.LOW, portfolio: F.LOW, fundamental: F.HIGH, marketRegime: F.HIGH } },
  VU_TREND_52W: { version: '1.0.0', productClass: C.VU_NATIVE, displayName: 'VU Native – Trendfolge 52W', replicationClaimAllowed: false, overall: F.MEDIUM, overallNote: 'keine Trader-Methode; Treue gemessen an öffentlichen TraderFox-Regeln',
    fidelity: { entry: F.MEDIUM, exit: F.MEDIUM, sizing: F.MEDIUM, portfolio: F.MEDIUM, fundamental: F.HIGH, marketRegime: F.MEDIUM } },
});
