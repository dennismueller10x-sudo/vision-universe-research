/* =========================================================================
   VISION UNIVERSE — benchmark-reference.mjs

   Die Benchmark (SPY) als BENCHMARK_REFERENCE in der kanonischen Historie -
   und nur dort. Owner-Entscheid 02.10.2026.

   SPY steht bewusst NICHT im Gate-Universum (universe-<GATE>.json) und
   nicht im Produktuniversum (security-master eligibility). Die dauerhafte
   Ablage fuehrt ihn trotzdem, damit Backtests ihn als Gesamtrendite
   vergleichen koennen. Diese Datei ist die einzige Stelle, die ihn den
   Mitgliedern der Ablage hinzufuegt; alles, was Titel aufzaehlt
   (Screener, Rangliste, Strategie-Treffer, Aktienlisten), liest weiter
   die unveraenderten Universumslisten.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BENCHMARK_ROLE = "BENCHMARK_REFERENCE";
/* Nur die volle Ablage fuehrt die Benchmark. Test- und Teil-Gates bleiben,
   wie sie sind - ein Gate-Lauf ueber 100 Titel braucht keinen Vergleich. */
export const BENCHMARK_GATES = ["FULL_UNIVERSE"];

export function benchmarkSpec(scale) {
  const s = scale || JSON.parse(readFileSync(join(root, "quant", "config", "tiingo-scale.json"), "utf8"));
  const b = s.benchmark;
  if (!b || typeof b.symbol !== "string" || typeof b.securityId !== "string" || !b.symbol || !b.securityId) return null;
  return { ticker: b.symbol, securityId: b.securityId, role: BENCHMARK_ROLE };
}

/** Mitglieder der Ablage: das Gate-Universum, fuer FULL_UNIVERSE plus Benchmark. */
export function withBenchmark(gate, members, scale) {
  const bm = benchmarkSpec(scale);
  if (!bm || !BENCHMARK_GATES.includes(gate)) return members;
  if (members.some((m) => m.securityId === bm.securityId || m.ticker === bm.ticker)) return members;
  return members.concat([bm]);
}
