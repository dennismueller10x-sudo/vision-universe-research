#!/usr/bin/env node
/* Uebernahme-Gate fuer das Produktuniversum (eligibility.json), fail closed.
   Vergleicht den committeten Stand mit einem neuen Lauf von scripts/market/build-us-eligibility.mjs
   und entscheidet COMMIT oder BLOCKED nach core/registry/eligibility-gate.json.

   Aufruf: node scripts/core/eligibility-gate.mjs --prev <eligibility.json> --next <eligibility.json>
             [--prev-universe <universe-ELIGIBLE_US_EQUITY.json>] [--next-universe <...>] [--out bericht.json]
   Exit 0 = COMMIT, 4 = BLOCKED, 2 = Eingabefehler. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function statusMap(doc) {
  const m = new Map();
  for (const d of doc.decisions || []) m.set(d.securityId || d.ticker, d.product_eligibility ?? d.status);
  return m;
}

export function evaluate({ prev, next, prevUniverse, nextUniverse, limits }) {
  const a = statusMap(prev), b = statusMap(next), transitions = {}, samples = {};
  let statusChanges = 0;
  for (const [id, s] of b) {
    const p = a.get(id);
    if (p === undefined || p === s) continue;
    statusChanges++;
    const k = `${p}->${s}`; transitions[k] = (transitions[k] || 0) + 1;
    (samples[k] = samples[k] || []).length < 10 && samples[k].push(id);
  }
  const added = [...b.keys()].filter((id) => !a.has(id)).length, removed = [...a.keys()].filter((id) => !b.has(id)).length;
  const pu = prevUniverse ? prevUniverse.actualSize : prev.counts?.productUniverse;
  const nu = nextUniverse ? nextUniverse.actualSize : next.counts?.productUniverse;
  const deltaPct = pu ? Math.abs(nu - pu) / pu * 100 : 100;
  const counted = { statusChanges, eligibleToExcluded: transitions["ELIGIBLE->EXCLUDED"] || 0,
                    productUniverseDeltaPct: Math.round(deltaPct * 100) / 100, universeMembersChanged: added + removed };
  const failures = [];
  for (const [k, max] of Object.entries(limits)) if (counted[k] > max) failures.push(`${k} ${counted[k]} > ${max}`);
  if ((next.counts?.universeMembers ?? 0) !== (next.decisions || []).length) failures.push("Zaehlung im Kopf != Entscheidungen");
  return { schema: "vu-eligibility-gate-report-1", decision: failures.length ? "BLOCKED" : "COMMIT", failures, counted, limits,
           productUniverse: { before: pu, after: nu }, transitions, samples };
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!o.prev || !o.next) throw Error("--prev und --next sind Pflicht");
  const j = (p) => (p ? JSON.parse(readFileSync(resolve(p), "utf8")) : null);
  const cfg = j(join(ROOT, "core/registry/eligibility-gate.json"));
  const rep = evaluate({ prev: j(o.prev), next: j(o.next), prevUniverse: j(o["prev-universe"]), nextUniverse: j(o["next-universe"]), limits: cfg.limits });
  if (o.out) writeFileSync(o.out, JSON.stringify(rep, null, 2) + "\n");
  console.log(`[eignung] ${rep.decision} · ${JSON.stringify(rep.counted)} · Produktuniversum ${rep.productUniverse.before} -> ${rep.productUniverse.after}`);
  for (const f of rep.failures) console.log(`[eignung] - ${f}`);
  return rep.decision === "COMMIT" ? 0 : 4;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
