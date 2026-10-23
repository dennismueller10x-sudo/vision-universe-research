/**
 * Supertrader 6.0 – public facts of the snapshot runs (counts and hashes copied from the public run output; the metrics
 * stay sealed). Filled after each run; null = run not yet recorded (the matrix then reports NOT_EVIDENCED).
 */
export const SF6_RUN_FACTS = Object.freeze({
  integrity: null,
  validation: null,
  holdout: null,
});
