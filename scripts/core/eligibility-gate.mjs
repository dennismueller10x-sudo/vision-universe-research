#!/usr/bin/env node
/* Uebernahme-Gate fuer das Produktuniversum (eligibility.json), fail closed.
   Vergleicht den committeten Stand mit einem neuen Lauf von scripts/market/build-us-eligibility.mjs
   und entscheidet COMMIT oder BLOCKED nach core/registry/eligibility-gate.json.

   Aufruf: node scripts/core/eligibility-gate.mjs --prev <eligibility.json> --next <eligibility.json>
             [--prev-universe <universe-ELIGIBLE_US_EQUITY.json>] [--next-universe <...>] [--out bericht.json]
             [--approved <freigabeliste.json>]
   Freigabeliste (Nachholen, eigener PR mit Vorher/Nachher): exakt gebunden an den Vorstand (sha256 von --prev);
   freigegebene Wechsel zaehlen nicht gegen die Grenzen, das Produktuniversum muss genau der freigegebenen Groesse
   entsprechen, und jeder ungenutzte Eintrag macht das Gate rot (fail closed, wie beim Security Master).
   Exit 0 = COMMIT, 4 = BLOCKED, 2 = Eingabefehler. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);

function statusMap(doc) {
  const m = new Map();
  for (const d of doc.decisions || []) m.set(d.securityId || d.ticker, d.product_eligibility ?? d.status);
  return m;
}

export function evaluate({ prev, next, prevUniverse, nextUniverse, limits, approval = null, prevSha256 = null, successions = null }) {
  const a = statusMap(prev), b = statusMap(next), transitions = {}, samples = {};
  const approved = new Map((approval?.changes || []).map((c) => [c.securityId, `${c.from}->${c.to}`]));
  const used = new Set(), failures = [];
  if (approval && approval.prevSha256 !== prevSha256) failures.push("Freigabeliste gilt fuer einen anderen Vorstand (prevSha256)");
  let statusChanges = 0, approvedChanges = 0;
  for (const [id, s] of b) {
    const p = a.get(id);
    if (p === undefined || p === s) continue;
    if (approved.get(id) === `${p}->${s}`) { used.add(id); approvedChanges++; continue; }
    statusChanges++;
    const k = `${p}->${s}`; transitions[k] = (transitions[k] || 0) + 1;
    (samples[k] = samples[k] || []).length < 10 && samples[k].push(id);
  }
  /* Zugaenge zur Mitgliedschaft (expand-us-universe --only, Steuerung 17.11.2026): nur mit Freigabe je securityId
     (approval.membersAdded); jeder nicht freigegebene Zugang und jeder Abgang zaehlt weiter gegen universeMembersChanged. */
  const membersApproved = new Set(approval?.membersAdded || []);
  const addedIds = [...b.keys()].filter((id) => !a.has(id));
  /* Tickerwechsel (ADR-009, quant/config/ticker-successions.json): geht der Vorgaenger und kommt im selben Lauf
     seine registrierte Nachfolgerin, ist das ein Austausch derselben Aktie und zaehlt nicht gegen
     universeMembersChanged. Jeder andere Abgang und Zugang zaehlt weiter. */
  const replacements = Object.values(successions || {}).filter((e) => a.has(e.from) && !b.has(e.from) && b.has(e.to) && !a.has(e.to))
    .map((e) => ({ from: e.from, to: e.to }));
  const replacedFrom = new Set(replacements.map((r) => r.from)), replacedTo = new Set(replacements.map((r) => r.to));
  const added = addedIds.filter((id) => !membersApproved.has(id) && !replacedTo.has(id)).length;
  const removed = [...a.keys()].filter((id) => !b.has(id) && !replacedFrom.has(id)).length;
  const membersUnused = [...membersApproved].filter((id) => !addedIds.includes(id));
  const pu = prevUniverse ? prevUniverse.actualSize : prev.counts?.productUniverse;
  const nu = nextUniverse ? nextUniverse.actualSize : next.counts?.productUniverse;
  // Mit Freigabeliste zaehlt die Abweichung vom freigegebenen Zielumfang, sonst die vom Vorstand.
  const base = approval ? approval.productUniverseAfter : pu;
  const deltaPct = base ? Math.abs(nu - base) / base * 100 : 100;
  const counted = { statusChanges, eligibleToExcluded: transitions["ELIGIBLE->EXCLUDED"] || 0,
                    productUniverseDeltaPct: Math.round(deltaPct * 100) / 100, universeMembersChanged: added + removed };
  for (const [k, max] of Object.entries(limits)) if (counted[k] > max) failures.push(`${k} ${counted[k]} > ${max}`);
  const unused = [...approved.keys()].filter((id) => !used.has(id));
  if (unused.length) failures.push(`${unused.length} freigegebene Wechsel ungenutzt (z. B. ${unused.slice(0, 5).join(", ")})`);
  if (membersUnused.length) failures.push(`${membersUnused.length} freigegebene Zugaenge fehlen (${membersUnused.slice(0, 5).join(", ")})`);
  if ((next.counts?.universeMembers ?? 0) !== (next.decisions || []).length) failures.push("Zaehlung im Kopf != Entscheidungen");
  return { schema: "vu-eligibility-gate-report-1", decision: failures.length ? "BLOCKED" : "COMMIT", failures, counted, limits,
           productUniverse: { before: pu, after: nu }, transitions, samples, successionReplacements: replacements,
           approval: approval ? { id: approval.id, approved: approved.size, applied: approvedChanges, unused: unused.length,
                                  membersAdded: addedIds.filter((id) => membersApproved.has(id)).length } : null };
}

function main(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!o.prev || !o.next) throw Error("--prev und --next sind Pflicht");
  const j = (p) => (p ? JSON.parse(readFileSync(resolve(p), "utf8")) : null);
  const cfg = j(join(ROOT, "core/registry/eligibility-gate.json"));
  const prevSha256 = createHash("sha256").update(readFileSync(resolve(o.prev))).digest("hex");
  const TS = require(join(ROOT, "core/ticker-succession.js"));
  const successions = TS.tickerSuccessions(j(join(ROOT, "quant/config/ticker-successions.json")));
  const rep = evaluate({ prev: j(o.prev), next: j(o.next), prevUniverse: j(o["prev-universe"]), nextUniverse: j(o["next-universe"]),
                         limits: cfg.limits, approval: j(o.approved), prevSha256, successions });
  if (o.out) writeFileSync(o.out, JSON.stringify(rep, null, 2) + "\n");
  console.log(`[eignung] ${rep.decision} · ${JSON.stringify(rep.counted)} · Produktuniversum ${rep.productUniverse.before} -> ${rep.productUniverse.after}`);
  for (const f of rep.failures) console.log(`[eignung] - ${f}`);
  return rep.decision === "COMMIT" ? 0 : 4;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error("ABBRUCH: " + e.message); process.exitCode = 2; }
}
