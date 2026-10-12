#!/usr/bin/env node
/* Bestandsaufnahme des Datenstands im Produktuniversum (Datenstand-Richtlinie data-freshness-1.0.0). Nur lesend.
     node scripts/technical/audit-data-freshness.mjs [--reference YYYY-MM-DD] [--out DATEI.json]
   Liest Index, Shards, Wertpapierstamm und die kompakten Tagesreihen; zaehlt je Zustand und Altersgruppe die sichtbaren Thesen.
   Ursachen: nur was die Daten belegen (inaktiv laut Stamm; Anbieter lieferte nach der letzten Bar nichts; Aktualisierung endete); sonst "nicht bestimmbar". */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { ROOT } from "./lib/ti-data.mjs";
import { Freshness, loadMaster, shardBlock } from "./lib/ti-freshness.mjs";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; };
const V3 = join(ROOT, "quant/data/technical-intelligence/v3");
const idx = JSON.parse(gunzipSync(readFileSync(join(V3, "index.json.gz"))).toString());
const meta = JSON.parse(readFileSync(join(V3, "meta.json"), "utf8"));
const reference = arg("reference", null) || (meta.projection && meta.projection.freshness && meta.projection.freshness.reference) || Freshness.lastCompletedSession(meta.generatedAt);
const master = loadMaster();
const sk = (t) => (t.toUpperCase() + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");
const shards = new Map();
const refreshed = (t) => { try { const u = JSON.parse(readFileSync(join(ROOT, "quant/data/market/discover-series", "ref_" + t.replace(/[^A-Z0-9]/g, "_") + ".json"), "utf8")).sourceUpdatedAt; return u ? String(u).slice(0, 10) : null; } catch { return null; } };
const BUCKETS = [["0-3", 3], ["4-5", 5], ["6-10", 10], ["11-20", 20], ["21-40", 40], [">40", 1e9]];
const bucketOf = (a) => BUCKETS.find(([, hi]) => a <= hi)[0];
const zero = () => ({ titles: 0, tiScenario: 0, projectionConsumerVisible: 0, primary: 0, alternative: 0, motiveAlternative: 0, exploreHighlights: 0, exploreCandidates: 0, anyTi: 0 });
const out = { policy: Freshness.POLICY, reference, generatedFrom: meta.generatedAt, titles: idx.rows.length, states: {}, ageDistribution: {}, buckets: {}, byState: {}, reasons: {}, reasonsKnown: 0, nonFresh: [] };
for (const r of idx.rows) {
  const t = r.t; let sh = shards.get(sk(t)); if (!sh) { sh = JSON.parse(gunzipSync(readFileSync(join(V3, "shards", sk(t) + ".json.gz"))).toString()).instruments; shards.set(sk(t), sh); }
  const p = sh[t], mm = master.get(t) || {};
  const lastBar = p.freshness ? p.freshness.lastBar : r.asOf;
  const base = { lastBar, reference, venue: mm.venue || null, active: mm.active };
  let f = Freshness.classify(base); if (f.state !== "FRESH") f = Freshness.classify(Object.assign({}, base, { refreshedAt: refreshed(t) }));
  const pr = p.projectionWeekly || p.projection || {};
  const has = { tiScenario: (p.scenarios || []).length > 0 ? 1 : 0, projectionConsumerVisible: (p.projection && p.projection.consumerVisible) || (p.projectionWeekly && p.projectionWeekly.consumerVisible) ? 1 : 0, primary: !!pr.primary, alternative: !!pr.alternative, motiveAlternative: !!pr.motiveAlternative, exploreHighlights: (pr.exploreHighlights || []).length, exploreCandidates: (pr.exploreCandidates || []).length, anyTi: p.withheld ? 0 : 1 };
  out.states[f.state] = (out.states[f.state] || 0) + 1;
  out.ageDistribution[f.ageTradingDays] = (out.ageDistribution[f.ageTradingDays] || 0) + 1;
  const b = (out.buckets[bucketOf(f.ageTradingDays)] ||= zero()), s = (out.byState[f.state] ||= zero());
  for (const a of [b, s]) { a.titles++; a.tiScenario += has.tiScenario; a.projectionConsumerVisible += has.projectionConsumerVisible; a.primary += +has.primary; a.alternative += +has.alternative; a.motiveAlternative += +has.motiveAlternative; a.exploreHighlights += has.exploreHighlights; a.exploreCandidates += has.exploreCandidates; a.anyTi += has.anyTi; }
  if (f.state !== "FRESH") {
    if (f.reason) { out.reasons[f.reason.code] = (out.reasons[f.reason.code] || 0) + 1; if (f.reason.known) out.reasonsKnown++; }
    out.nonFresh.push({ t, tf: r.tf, state: f.state, lastBar, ageTradingDays: f.ageTradingDays, exchange: mm.venue || null, masterActive: mm.active, refreshedAt: refreshed(t), reason: f.reason && f.reason.code, reasonKnown: !!(f.reason && f.reason.known), visibleBeforePolicy: has });
  }
}
out.nonFresh.sort((a, b) => b.ageTradingDays - a.ageTradingDays || (a.t < b.t ? -1 : 1));
const o = arg("out", null); if (o) writeFileSync(o, JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ reference, titles: out.titles, states: out.states, buckets: out.buckets, reasons: out.reasons }, null, 1));
