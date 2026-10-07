#!/usr/bin/env node
// Welche Ground-Truth-Fakten aendern ihren Quant-Status durch E2-R (Kern 1.12.0 -> 1.13.0)?
// Die GT bleibt unveraendert (Praeregistrierung). Faelle, in denen die GT Revenues waehlt, obwohl dieselbe
// Einreichung einen groesseren Umsatzwert unter einem anderen Konzept meldet, werden gesondert ausgewiesen:
// dort ist die GT-Regel "Revenues zuerst" selbst die Annahme, die E2-R widerlegt.
//   node e2r-gt-check.mjs <cmp-before.json> <cmp-after.json> <out.json>
import fs from "node:fs";

const [beforePath, afterPath, outPath] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
const key = (r) => `${r.cik}|${r.concept}|${r.end}`;
const prior = new Map(before.map((r) => [key(r), r]));
const changed = [];
for (const r of after) {
  const p = prior.get(key(r));
  const a = r.pipes?.QUANT; const b = p?.pipes?.QUANT;
  if (!a || !b) continue;
  if (a.status === b.status && a.got?.value === b.got?.value) continue;
  const gt = r.gt || {};
  const others = Object.entries(gt.multiTagValues || {}).filter(([tag]) => tag !== gt.tag).map(([, v]) => v);
  const gtIsPartialAggregate = gt.tag === "Revenues" && others.some((v) => typeof v === "number" && v > gt.value * 1.005);
  changed.push({
    ticker: r.ticker, concept: r.concept, end: r.end,
    gt: { value: gt.value, tag: gt.tag, multiTagValues: gt.multiTagValues, accn: gt.accn },
    before: { status: b.status, value: b.got?.value, concept: b.got?.concept },
    after: { status: a.status, value: a.got?.value, concept: a.got?.concept },
    class: gtIsPartialAggregate ? "GT_REVENUES_SMALLER_THAN_OTHER_CONCEPT_IN_SAME_FILING" : "OTHER",
  });
}
const summary = {};
for (const c of changed) {
  const k = `${c.concept}|${c.before.status}->${c.after.status}|${c.class}`;
  summary[k] = (summary[k] || 0) + 1;
}
fs.writeFileSync(outPath, JSON.stringify({ schema: "vu-fundamental-e2r-gt-check-1.0.0", changed: changed.length, summary, facts: changed }, null, 1));
console.log(JSON.stringify({ changed: changed.length, summary }, null, 1));
