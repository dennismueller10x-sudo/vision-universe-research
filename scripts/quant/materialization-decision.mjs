/* Ist ueberhaupt etwas zu materialisieren? (product-intelligence-materialization.yml)
 *
 * Gleicher Stichtag heisst nicht gleicher Stand. Neu materialisiert wird, wenn
 *  1. manuell erzwungen (force),
 *  2. die Methodik sich geaendert hat (methodology-fingerprint.mjs),
 *  3. die Faktorzeilen NEUER sind als die daraus gerechnete Faktor-Evidenz
 *     (Same-Day-Refresh: 03.10.2026 lieferte der Marktlauf am Stichtag 02.10.
 *     6.745 statt 6.433 Faktorzeilen nach, die Evidenz blieb bei 6.289 -
 *     launch-gates/screener-surface auf main rot), oder
 *  4. Ablage und Produkt auf verschiedenen Stichtagen stehen.
 * Sonst ist der Lauf ein No-Op.
 *
 * CLI: node scripts/quant/materialization-decision.mjs --store=DATE --product=DATE
 *        [--method=TEXT] [--force=true]
 *      -> schreibt "noop=true|false" und "reason=..." auf stdout.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const ms = (iso) => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : null; };

export function decide({ force = false, method = "", store = "", product = "", factorsAt = "", evidenceAt = "" }) {
  if (force) return { noop: false, reason: "FORCE" };
  if (method) return { noop: false, reason: "METHODOLOGY_CHANGED" };
  const f = ms(factorsAt), e = ms(evidenceAt);
  if (f !== null && (e === null || f > e)) return { noop: false, reason: "FACTORS_NEWER_THAN_EVIDENCE" };
  if (store && store === product) return { noop: true, reason: "UP_TO_DATE" };
  return { noop: false, reason: "STORE_AHEAD_OF_PRODUCT" };
}

export function readTimestamps(root = ".") {
  let factorsAt = "", evidenceAt = "";
  try { factorsAt = JSON.parse(readFileSync(`${root}/quant/data/market/factors/factors-FULL_UNIVERSE.json`, "utf8")).generatedAt || ""; } catch {}
  try { evidenceAt = JSON.parse(gunzipSync(readFileSync(`${root}/quant/data/product/factor-evidence-v1/screening.json.gz`))).generatedAt || ""; } catch {}
  return { factorsAt, evidenceAt };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=").slice(1).join("=");
  const ts = readTimestamps();
  const d = decide({ force: arg("force") === "true", method: arg("method"), store: arg("store"), product: arg("product"), ...ts });
  console.error(`Faktorzeilen: ${ts.factorsAt || "unbekannt"} · Faktor-Evidenz: ${ts.evidenceAt || "unbekannt"} · Entscheidung: ${d.reason}`);
  console.log(`noop=${d.noop}`);
  console.log(`reason=${d.reason}`);
}
