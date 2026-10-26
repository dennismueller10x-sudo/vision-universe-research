/* =========================================================================
   scripts/technical/eval-query-text.mjs
   Offline-Bewertung der Suche in Worten gegen das Gold-Set
   (quant/tests/fixtures/technical-query-gold.json). Kein Netz, kein Modell.

     node scripts/technical/eval-query-text.mjs            Bericht
     node scripts/technical/eval-query-text.mjs --json     Bericht als JSON
     node scripts/technical/eval-query-text.mjs --out=P    zusaetzlich als Datei

   Kennzahlen: exakte Treffer der abbildbaren Faelle, Teiltreffer (Filter-
   Praezision/-Vollstaendigkeit) und "stille Fehlgriffe" (nicht abbildbare
   Saetze, die ohne Hinweis eine Abfrage liefern). Ziel: 100 % / 0.
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const P = require("../../quant/engines/technical/query-text.js");
const GOLD = fileURLToPath(new URL("../../quant/tests/fixtures/technical-query-gold.json", import.meta.url));

const key = (f) => JSON.stringify(f.op === "between" ? [f.field, f.op, f.value, f.value2] : [f.field, f.op, f.value]);
export function normalize(query) { return { tf: query.timeframe, groups: query.groups.map((g) => g.filters.map(key).sort()) }; }
export function expected(e) { return { tf: e.tf, groups: e.groups.map((g) => g.map((x) => JSON.stringify(x)).sort()) }; }

export function evaluate(gold) {
  const out = { textVersion: P.TEXT_VERSION, supported: 0, exact: 0, filterTp: 0, filterFp: 0, filterFn: 0, unsupported: 0, silent: 0, misses: [], silents: [] };
  for (const c of gold.cases) {
    const r = P.parse(c.q);
    if (c.expect) {
      out.supported++;
      const got = normalize(r.query), want = expected(c.expect);
      if (r.ok && JSON.stringify(got) === JSON.stringify(want)) { out.exact++; out.filterTp += want.groups.flat().length; continue; }
      const g = new Set(got.groups.flat()), w = new Set(want.groups.flat());
      for (const x of g) (w.has(x) ? out.filterTp++ : out.filterFp++);
      for (const x of w) if (!g.has(x)) out.filterFn++;
      out.misses.push({ q: c.q, ok: r.ok, unknown: r.unknown, got, want });
    } else {
      out.unsupported++;
      if (r.ok && !(r.unknown || []).length) { out.silent++; out.silents.push({ q: c.q, reason: c.unsupported, got: normalize(r.query) }); }
    }
  }
  out.exactRate = out.supported ? out.exact / out.supported : null;
  out.precision = out.filterTp + out.filterFp ? out.filterTp / (out.filterTp + out.filterFp) : null;
  out.recall = out.filterTp + out.filterFn ? out.filterTp / (out.filterTp + out.filterFn) : null;
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = evaluate(JSON.parse(readFileSync(GOLD, "utf8")));
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  if (outArg) writeFileSync(outArg.slice(6), JSON.stringify(res, null, 2) + "\n");
  if (process.argv.includes("--json")) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`Suche in Worten ${res.textVersion}: exakt ${res.exact}/${res.supported} (${(res.exactRate * 100).toFixed(1)} %), ` +
      `Filter-Praezision ${(res.precision * 100).toFixed(1)} %, Vollstaendigkeit ${(res.recall * 100).toFixed(1)} %, stille Fehlgriffe ${res.silent}/${res.unsupported}`);
    for (const m of res.misses) console.log("  daneben:", m.q, JSON.stringify(m.got), "statt", JSON.stringify(m.want), m.unknown && m.unknown.length ? "unbekannt: " + m.unknown : "");
    for (const s of res.silents) console.log("  still:", s.q, "(" + s.reason + ")", JSON.stringify(s.got));
  }
  process.exit(res.exact === res.supported && res.silent === 0 ? 0 : 1);
}
