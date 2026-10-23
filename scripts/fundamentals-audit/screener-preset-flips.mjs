#!/usr/bin/env node
// Screener-Voreinstellungen (screener/engine/fields.js presets, unveraendert) alt vs. korrigiert: wie viele Titel kippen
// zwischen "erfuellt" und "nicht erfuellt"? Feldwerte ueber dieselben Wege wie scripts/screener/build-universe.mjs:
//   revGrowth = unternehmen.umsatzWachstum (f_revenueGrowthTTM), Margen = Fundamentals.latest().derived,
//   eps = latest.ttm.eps_diluted ?? latest.annual.eps_diluted, epsGrowth = journey-Spur eps_diluted (nur positives Vorjahr).
//   node screener-preset-flips.mjs <old-dir> <new-dir> <out.json>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const Fund = require(path.join(root, "discover/engines/fundamentals.js"));
const Unt = require(path.join(root, "discover/engines/unternehmen.js"));
const Fields = require(path.join(root, "screener/engine/fields.js"));
const [oldDir, newDir, outPath] = process.argv.slice(2);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const growth = (a, b) => (fin(a) && fin(b) && b > 0 ? a / b - 1 : null);

function fields(doc) {
  const model = Fund.fromBundle(doc);
  const latest = Fund.latest(model); const journey = Fund.journey(model);
  const u = Unt.ausConsumerBundle(model, { preis: 100 });
  const eps = (journey.tracks?.eps_diluted || []).filter((p) => fin(p.v));
  const d = latest.derived || {};
  return {
    revenueGrowth: fin(u.umsatzWachstum) ? u.umsatzWachstum : null,
    epsGrowth: eps.length >= 2 ? growth(eps.at(-1).v, eps.at(-2).v) : null,
    grossMargin: fin(d.grossMargin) ? d.grossMargin : null,
    operatingMargin: fin(d.operatingMargin) ? d.operatingMargin : null,
    netMargin: fin(d.netMargin) ? d.netMargin : null,
    eps: fin(latest.ttm?.eps_diluted?.v) ? latest.ttm.eps_diluted.v : (fin(latest.annual?.eps_diluted?.v) ? latest.annual.eps_diluted.v : null),
  };
}
const list = Array.isArray(Fields.FIELDS) ? Fields.FIELDS : Object.values(Fields.FIELDS || Fields);
const presets = {};
for (const f of list) if (f && f.presets && ["revenueGrowth", "epsGrowth", "grossMargin", "operatingMargin", "netMargin", "eps"].includes(f.id)) presets[f.id] = f.presets;
const test = (v, [, op, a, b]) => fin(v) && (op === "gt" ? v > a : op === "gte" ? v >= a : op === "lt" ? v < a : op === "between" ? v >= a && v <= b : false);
const out = {};
for (const [id, ps] of Object.entries(presets)) for (const p of ps) out[`${id} ${p[0]}`] = { passOld: 0, passNew: 0, gained: 0, lost: 0, examplesLost: [], examplesGained: [] };
for (const f of fs.readdirSync(newDir).filter((x) => /^CIK\d+\.json$/.test(x)).sort()) {
  if (!fs.existsSync(path.join(oldDir, f))) continue;
  const a = JSON.parse(fs.readFileSync(path.join(oldDir, f), "utf8")); const b = JSON.parse(fs.readFileSync(path.join(newDir, f), "utf8"));
  const fa = fields(a); const fb = fields(b); const t = (b.tickers || [])[0] || b.cik;
  for (const [id, ps] of Object.entries(presets)) for (const p of ps) {
    const k = `${id} ${p[0]}`; const x = test(fa[id], p); const y = test(fb[id], p);
    out[k].passOld += x; out[k].passNew += y;
    if (x && !y) { out[k].lost += 1; if (out[k].examplesLost.length < 6) out[k].examplesLost.push({ t, old: fa[id], new: fb[id] }); }
    if (!x && y) { out[k].gained += 1; if (out[k].examplesGained.length < 6) out[k].examplesGained.push({ t, old: fa[id], new: fb[id] }); }
  }
}
fs.writeFileSync(outPath, JSON.stringify({ schema: "vu-fundamental-screener-preset-flips-1.0.0", presets: out }, null, 1));
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(28), `pass ${v.passOld} -> ${v.passNew}  lost ${v.lost}  gained ${v.gained}`);
