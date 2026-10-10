#!/usr/bin/env node
// Welche Eingangsreihen der Produkte, die das Consumer-Bundle direkt lesen, aendern sich (alt vs. korrigiert)?
//   Supertrader (scripts/supertrader/build.mjs loadSecFundamentals): annual net_income, total_assets, operating_cash_flow,
//     long_term_debt, shares_outstanding, gross_profit, revenue, stockholders_equity; quarterly net_income.
//   Company Intelligence (scripts/company_intelligence/earnings.py METRICS): Quartalsreihen; TTM nie fuer EPS.
//   node product-input-impact.mjs <old-dir> <new-dir> <out.json>
import fs from "node:fs";
import path from "node:path";

const [oldDir, newDir, outPath] = process.argv.slice(2);
const SUPERTRADER = { annual: ["net_income", "total_assets", "operating_cash_flow", "long_term_debt", "shares_outstanding", "gross_profit", "revenue", "stockholders_equity"], quarterly: ["net_income"] };
const CI = { quarterly: ["revenue", "eps_diluted", "net_income", "gross_profit", "operating_income", "free_cash_flow", "operating_cash_flow", "cash_and_equivalents", "total_debt", "capital_expenditures", "shares_outstanding"] };
const TOL = 1e-6;
function changes(a, b, section, metric) {
  const ra = new Map((a[section]?.[metric] || []).map((r) => [r[2], r])); const rb = new Map((b[section]?.[metric] || []).map((r) => [r[2], r]));
  let value = 0, label = 0, added = 0, removed = 0;
  for (const [end, x] of ra) { const y = rb.get(end); if (!y) { removed += 1; continue; } if (Math.abs(x[3] - y[3]) > TOL * Math.max(Math.abs(x[3]), Math.abs(y[3]), 1)) value += 1; if (x[0] !== y[0] || x[1] !== y[1]) label += 1; }
  for (const end of rb.keys()) if (!ra.has(end)) added += 1;
  return { value, label, added, removed };
}
const result = {};
for (const [product, spec] of [["supertrader", SUPERTRADER], ["companyIntelligence", CI]]) {
  const agg = {}; const issuersAny = new Set(); const issuersValue = new Set();
  for (const f of fs.readdirSync(newDir).filter((x) => /^CIK\d+\.json$/.test(x))) {
    if (!fs.existsSync(path.join(oldDir, f))) continue;
    const a = JSON.parse(fs.readFileSync(path.join(oldDir, f), "utf8")); const b = JSON.parse(fs.readFileSync(path.join(newDir, f), "utf8"));
    for (const [section, metrics] of Object.entries(spec)) for (const m of metrics) {
      const c = changes(a, b, section, m); const k = `${section}.${m}`;
      const s = (agg[k] ||= { value: 0, label: 0, added: 0, removed: 0, issuersValue: 0 });
      for (const x of ["value", "label", "added", "removed"]) s[x] += c[x];
      if (c.value) { s.issuersValue += 1; issuersValue.add(f); }
      if (c.value || c.label || c.added || c.removed) issuersAny.add(f);
    }
  }
  result[product] = { issuersWithAnyInputChange: issuersAny.size, issuersWithValueChange: issuersValue.size, bySeries: agg };
}
fs.writeFileSync(outPath, JSON.stringify({ schema: "vu-fundamental-product-input-impact-1.0.0", ...result }, null, 1));
console.log(JSON.stringify(result, null, 1));
