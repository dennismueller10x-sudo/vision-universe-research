#!/usr/bin/env node
/* Nachholen des Produktuniversums: Freigabeliste + Wirkungsbericht je Produkt (Strang A, 05.11.2026).
   Liest den committeten Stand (--prev) und einen Probelauf der vollstaendigen Erzeugerkette (--next:
   build-us-eligibility -> apply-name-layer-class DEBT -> apply-exchange-directory), schreibt
     --out-json  Freigabeliste fuer scripts/core/eligibility-gate.mjs --approved (jeder Wechsel einzeln)
     --out-md    Vorher/Nachher je Produkt (Discover, Quant, Technical, Supertrader, Fundamental, Hedgefonds;
                 Screener folgt dem Discover-Index) und die vollstaendige Liste der Ab- und Zugaenge.
   Kein Produktartefakt wird geschrieben; die Uebernahme macht der Erzeuger im Workflow. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectEvidence } from "./stock-availability.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRODUCT = new Set(["ELIGIBLE", "SEPARATE_CLASS", "REVIEW"]);

export function catchup({ prev, next, prevSha256, prevUniverse, nextUniverse, evidence, id, sourceRun }) {
  const pm = new Map(prev.decisions.map((d) => [d.securityId, d]));
  const changes = [], out = [], inn = [];
  for (const d of next.decisions) {
    const p = pm.get(d.securityId);
    if (!p || p.product_eligibility === d.product_eligibility) continue;
    changes.push({ securityId: d.securityId, ticker: d.ticker, from: p.product_eligibility, to: d.product_eligibility,
                   reasonBefore: p.product_eligibility_reason, reasonAfter: d.product_eligibility_reason });
    const a = PRODUCT.has(p.product_eligibility), b = PRODUCT.has(d.product_eligibility);
    if (a && !b) out.push(d); if (!a && b) inn.push(d);
  }
  const sets = Object.fromEntries(Object.entries(evidence).map(([k, r]) => [k, new Set(r.US || [])]));
  const products = Object.keys(sets).sort();
  const impact = Object.fromEntries(products.map((k) => [k, {
    before: sets[k].size, removed: out.filter((d) => sets[k].has(d.ticker)).length, addedWithPage: inn.filter((d) => sets[k].has(d.ticker)).length }]));
  const reasons = (L, f) => L.reduce((o, d) => { const r = f(d); o[r] = (o[r] || 0) + 1; return o; }, {});
  return {
    schema: "vu-eligibility-catchup-1", id, prevSha256, sourceRun,
    productUniverseBefore: prevUniverse.actualSize, productUniverseAfter: nextUniverse.actualSize,
    counts: { changes: changes.length, leaveProduct: out.length, enterProduct: inn.length },
    leaveReasons: reasons(out, (d) => d.product_eligibility_reason), enterReasons: reasons(inn, (d) => `${d.product_eligibility} <- ${pm.get(d.securityId).product_eligibility_reason}`),
    impact, changes,
    leave: out.map((d) => ({ ticker: d.ticker, securityId: d.securityId, reason: d.product_eligibility_reason, products: products.filter((k) => sets[k].has(d.ticker)) })),
    enter: inn.map((d) => ({ ticker: d.ticker, securityId: d.securityId, status: d.product_eligibility, before: pm.get(d.securityId).product_eligibility_reason }))
  };
}

export function markdown(c) {
  const L = [];
  L.push(`# Produktuniversum nachholen (${c.id})`, "");
  L.push(`Freigabeliste fuer \`scripts/core/eligibility-gate.mjs --approved\`, erzeugt von \`scripts/core/eligibility-catchup.mjs\` aus dem Probelauf ${c.sourceRun}. Gebunden an den Vorstand sha256 \`${c.prevSha256.slice(0, 12)}…\`.`, "");
  L.push(`Produktuniversum: **${c.productUniverseBefore} → ${c.productUniverseAfter}**. Wechsel gesamt ${c.counts.changes}, davon ${c.counts.leaveProduct} aus dem Produkt, ${c.counts.enterProduct} ins Produkt.`, "");
  L.push("## Vorher/Nachher je Produkt", "", "| Produkt | Titel heute | verlieren den Titel | neue Titel mit Seite |", "|---|---:|---:|---:|");
  for (const [k, v] of Object.entries(c.impact)) L.push(`| ${k} | ${v.before} | ${v.removed} | ${v.addedWithPage} |`);
  L.push("", "Screener liest das Produktuniversum ueber den Discover-Index; neue Titel erscheinen in Discover, Quant und Screener erst nach dem naechsten Marktdaten-Lauf.", "");
  L.push("## Gruende", "", "Aus dem Produkt:", ...Object.entries(c.leaveReasons).map(([r, n]) => `- ${r}: ${n}`), "", "Ins Produkt:", ...Object.entries(c.enterReasons).map(([r, n]) => `- ${r}: ${n}`), "");
  L.push("## Aus dem Produkt (vollstaendig)", "", "| Ticker | Grund | heute sichtbar in |", "|---|---|---|");
  for (const d of c.leave) L.push(`| ${d.ticker} | ${d.reason} | ${d.products.join(", ") || "–"} |`);
  L.push("", "## Ins Produkt (vollstaendig)", "", "| Ticker | neu | vorher |", "|---|---|---|");
  for (const d of c.enter) L.push(`| ${d.ticker} | ${d.status} | ${d.before} |`);
  return L.join("\n") + "\n";
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  for (const k of ["prev", "next", "prev-universe", "next-universe", "out-json", "out-md", "id", "source-run"]) if (!o[k]) throw Error(`--${k} fehlt`);
  const j = (p) => JSON.parse(readFileSync(resolve(p), "utf8"));
  const prevSha256 = createHash("sha256").update(readFileSync(resolve(o.prev))).digest("hex");
  const c = catchup({ prev: j(o.prev), next: j(o.next), prevSha256, prevUniverse: j(o["prev-universe"]), nextUniverse: j(o["next-universe"]),
                      evidence: collectEvidence(ROOT).evidence, id: o.id, sourceRun: o["source-run"] });
  writeFileSync(o["out-json"], JSON.stringify(c, null, 1) + "\n");
  writeFileSync(o["out-md"], markdown(c));
  console.log(`[nachholen] ${c.counts.changes} Wechsel, ${c.productUniverseBefore} -> ${c.productUniverseAfter}`);
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
