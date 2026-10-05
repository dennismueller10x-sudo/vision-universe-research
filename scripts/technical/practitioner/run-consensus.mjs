#!/usr/bin/env node
/* Mission VII — Freeze und Auswertung des Konsens-Datensatzes (Protokoll-Nachtrag 7 h–k).

   node scripts/technical/practitioner/run-consensus.mjs freeze      → freeze/PRACTITIONER_CONSENSUS_V1.{jsonl,manifest.json}
   node scripts/technical/practitioner/run-consensus.mjs benchmark   → benchmark/consensus-benchmark.json (nur nach Freeze)

   Geoeffnete Ausgangsfaelle (DEVELOPMENT/VALIDATION): Konsensklasse, Ebenen, Staerke. Holdout-Ausgangsfaelle: nur Verknuepfungen
   und Referenz-IDs (Pruefsumme), KEINE Auswertung gegen den Ausgangsfall (die Holdout-Zeile wird nie geparst).
   VU (elliott-3.2.2, unveraendert) erst im Schritt "benchmark" und nur fuer geoeffnete Faelle. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PV1, validateSchema, loadReferences, validateReference, effectiveMapping, loadInstrumentMap, loadSourceRegistry, sourceFamily, canonicalJson, detectDuplicates, stripInternal, readJson } from "./lib.mjs";
import { replayProjection, replayOne, EXPECTED_ENGINE_VERSION, ENGINE_VERSION } from "./replay.mjs";
import { compareCase } from "./compare.mjs";
import { classifyConsensus, independentLinks, LEVELS } from "./consensus.mjs";

export const CONS = join(PV1, "consensus"), FREEZE_DIR = join(PV1, "freeze"), VERSION = "PRACTITIONER_CONSENSUS_V1";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const by = (a, f) => a.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});

/** Geoeffnete Ausgangsfaelle aus V1 (Holdout-Zeilen werden vor dem Parsen verworfen). */
export function openedAnchors(v1Path = join(FREEZE_DIR, "PRACTITIONER_REFERENCE_V1")) {
  const man = readJson(v1Path + ".manifest.json"), byCase = man.splits.byCase, open = new Set(Object.keys(byCase).filter((c) => !byCase[c].startsWith("HOLDOUT")));
  const rows = [];
  for (const line of readFileSync(v1Path + ".jsonl", "utf8").split("\n")) {
    const m = /"caseId":"([^"]+)"/.exec(line); if (!m || !open.has(m[1])) continue;
    const r = JSON.parse(line); if (r.viewKind !== "LATER_REVISION") rows.push(Object.assign(r, { _split: byCase[r.caseId] }));
  }
  return { rows, sealedCaseIds: Object.keys(byCase).filter((c) => !open.has(c)).sort(), v1Sha256: man.sha256 };
}

export function buildConsensus({ anchors, refs, links, registry = null, map = loadInstrumentMap(), replay = (r, m) => replayOne(replayProjection(r, m)) }) {
  const refById = new Map(refs.map((r) => [r.referenceId, r]));
  const fam = (id) => sourceFamily(id, registry);
  const dups = detectDuplicates(refs.concat(anchors));
  const cases = [];
  for (const a of anchors) {
    const raw = (links[a.caseId] || []).map((l) => Object.assign({}, l, { family: fam(l.sourceId) }));
    const ind = independentLinks(fam(a.sourceId), raw);
    const linked = ind.links.map((l) => ({ link: l, ref: refById.get(l.referenceId) })).filter((x) => x.ref);
    const included = linked.filter((x) => x.ref.status === "INCLUDED" && !dups.isDuplicate(x.ref.referenceId));
    const ma = effectiveMapping(a, map), rec = a.status === "INCLUDED" ? replay(a, ma) : null;
    const ctx = rec && rec.status === "OK" ? { close: rec.market.closeAtCutoff, atr: rec.market.atr14Close } : {};
    const members = [{ ref: a, mapping: ma, family: fam(a.sourceId), role: "ANCHOR" }].concat(included.map((x) => ({ ref: x.ref, mapping: effectiveMapping(x.ref, map), family: x.link.family, role: "LINKED" })));
    const c = classifyConsensus(members, ctx);
    const ref = (m) => ({ referenceId: m.ref.referenceId, role: m.role, sourceId: m.ref.sourceId, sourceFamily: m.family, sourceUrl: m.ref.sourceUrl, publication: m.ref.publication.timestamp,
      timeframe: m.ref.timeframe, confidence: m.ref.extraction && m.ref.extraction.confidence, evidenceLocators: (m.ref.evidence || []).slice(0, 3).map((e) => e.locator),
      reading: { pattern: m.ref.primary && m.ref.primary.pattern, family: m.ref.primary && m.ref.primary.family, currentWave: m.ref.primary && m.ref.primary.currentWave, direction: m.ref.directionalBias, degreeRank: m.ref.primary ? m.ref.primary.degreeRank ?? null : null } });
    cases.push({ consensusCaseId: "cc_" + a.referenceId.replace(/^pr_/, ""), anchorCaseId: a.caseId, anchorSplit: a._split, asset: a.instrument.vuSymbol, instrument: a.instrument.asShown, timeframe: a.timeframe,
      referenceDateWindow: { anchorPublication: a.publication.timestamp, windowTradingDays: Math.max(0, ...raw.map((l) => l.windowTradingDays || 0)) || null, lags: linked.map((x) => x.link.lag) },
      practitionerReferences: members.map(ref), linkedNotIncluded: linked.filter((x) => !included.includes(x)).map((x) => ({ referenceId: x.ref.referenceId, status: x.ref.status, duplicate: dups.isDuplicate(x.ref.referenceId) })),
      rejectedLinks: ind.rejected.map((l) => ({ referenceId: l.referenceId, reason: l.reason })), independentSourceFamilyCount: members.length,
      consensusClass: c.consensusClass, strength: c.strength, pairs: c.pairs, impulse: c.impulse,
      agreement: Object.fromEntries(LEVELS.map((L) => [L, c.strength[L]])), note: "PRACTITIONER CONSENSUS REFERENCE, NOT GROUND TRUTH" });
  }
  return cases;
}

function loadInputs() {
  const { rows: refs } = loadReferences(join(CONS, "references.jsonl"));
  const links = existsSync(join(CONS, "links.json")) ? readJson(join(CONS, "links.json")) : {};
  const sealedLinks = existsSync(join(CONS, "sealed/links-sealed.json")) ? readJson(join(CONS, "sealed/links-sealed.json")) : {};
  return { refs: refs.map(stripInternal), links, sealedLinks };
}
export function freeze({ outDir = FREEZE_DIR, now = new Date().toISOString() } = {}) {
  const registry = loadSourceRegistry(), { rows: anchors, sealedCaseIds, v1Sha256 } = openedAnchors(), { refs, links, sealedLinks } = loadInputs();
  const invalid = refs.filter((r) => r.status === "INCLUDED").map((r) => [r.referenceId, validateReference(r, { registry }).errors]).filter(([, e]) => e.length);
  if (invalid.length) throw new Error("Ungueltige Konsens-Referenzen:\n" + invalid.map(([id, e]) => id + ": " + e.join("; ")).join("\n"));
  for (const k of Object.keys(links)) if (sealedCaseIds.includes(k)) throw new Error("Holdout-Ausgangsfall in links.json (gehoert nach sealed/): " + k);
  /* Schutz: eine verknuepfte Referenz, die dieselbe Fundstelle wie ein VERSIEGELTER V1-Fall ist (gleiche Quelle|Symbol|Datum),
     wuerde dessen Label ueber den Konsens offenlegen → aus dem geoeffneten Konsens entfernen (nur gezaehlt). */
  const sealedSet = new Set(sealedCaseIds), refById = new Map(refs.map((r) => [r.referenceId, r]));
  const sealedLeak = [];
  for (const k of Object.keys(links)) links[k] = links[k].filter((l) => { const r = refById.get(l.referenceId); const hit = r && sealedSet.has(r.caseId); if (hit) sealedLeak.push(l.referenceId); return !hit; });
  const cases = buildConsensus({ anchors, refs, links, registry });
  const schema = readJson(join(PV1, "schema/consensus-case-1.0.0.json"));
  const bad = cases.map((c) => [c.consensusCaseId, validateSchema(c, schema, schema, "$", [], false)]).filter(([, e]) => e.length);
  if (bad.length) throw new Error("Konsensfall verletzt Schema consensus-case-1.0.0:\n" + bad.map(([id, e]) => id + ": " + e.map((x) => x.path + " " + x.error).join("; ")).join("\n"));
  const lines = cases.sort((a, b) => a.consensusCaseId.localeCompare(b.consensusCaseId)).map(canonicalJson), content = lines.join("\n") + "\n";
  const sealedContent = canonicalJson(Object.fromEntries(Object.keys(sealedLinks).sort().map((k) => [k, sealedLinks[k].map((l) => l.referenceId).sort()])));
  const refsContent = refs.map(canonicalJson).sort().join("\n") + "\n";
  const man = { version: VERSION, file: VERSION + ".jsonl", sha256: sha(content), referencesSha256: sha(refsContent), sealedLinksSha256: sha(sealedContent), basedOn: { version: "PRACTITIONER_REFERENCE_V1", sha256: v1Sha256 },
    createdAt: now, label: "PRACTITIONER CONSENSUS REFERENCE, NOT GROUND TRUTH", protocol: "PRACTITIONER_PROTOCOL.md Nachtrag 7",
    openedCases: cases.length, consensusClasses: by(cases, (c) => c.consensusClass), independentFamiliesHist: by(cases, (c) => c.independentSourceFamilyCount),
    consensusImpulseSet: cases.filter((c) => c.impulse.consensusImpulse).map((c) => c.consensusCaseId),
    sourceFamilies: by(cases.flatMap((c) => c.practitionerReferences), (r) => r.sourceFamily), timeframes: by(cases, (c) => c.timeframe), assets: by(cases, (c) => c.asset),
    confidence: by(cases.flatMap((c) => c.practitionerReferences), (r) => r.confidence), windows: by(cases, (c) => c.referenceDateWindow.windowTradingDays),
    referencesTotal: refs.length, referencesByStatus: by(refs, (r) => r.status),
    removedBecauseSameItemAsSealedV1Case: sealedLeak.length,
    sealed: { anchorCases: sealedCaseIds.length, anchorsWithLinks: Object.keys(sealedLinks).length, linkedReferences: Object.values(sealedLinks).reduce((s, l) => s + l.length, 0), note: "Keine Auswertung gegen versiegelte Ausgangsfaelle." } };
  mkdirSync(outDir, { recursive: true });
  const f = join(outDir, VERSION + ".jsonl"), mf = join(outDir, VERSION + ".manifest.json");
  if (existsSync(mf) && readJson(mf).sha256 !== man.sha256) throw new Error(VERSION + " existiert bereits mit anderem Inhalt – nur als neue Version (V1.1)");
  writeFileSync(f, content); writeFileSync(mf, JSON.stringify(man, null, 1) + "\n");
  return { manifest: man, cases };
}

export function benchmark({ freezeDir = FREEZE_DIR, outFile = join(PV1, "benchmark/consensus-benchmark.json"), taxonomyFile = join(PV1, "../elliott-forensics/impulse-taxonomy.json"), now = new Date().toISOString() } = {}) {
  const mf = join(freezeDir, VERSION + ".manifest.json");
  if (!existsSync(mf)) throw new Error("Konsens-Datensatz nicht eingefroren");
  const man = readJson(mf), content = readFileSync(join(freezeDir, man.file), "utf8");
  if (sha(content) !== man.sha256) throw new Error("SHA-256 des Konsens-Freezes stimmt nicht");
  if (ENGINE_VERSION !== EXPECTED_ENGINE_VERSION) throw new Error("Engine ist nicht " + EXPECTED_ENGINE_VERSION);
  const cases = content.trim().split("\n").map((l) => JSON.parse(l)), map = loadInstrumentMap(), registry = loadSourceRegistry();
  const { refs } = loadInputs(), { rows: anchors } = openedAnchors(), all = new Map(refs.concat(anchors).map((r) => [r.referenceId, r]));
  const tax = existsSync(taxonomyFile) ? new Map(readJson(taxonomyFile).rows.map((r) => [r.referenceId, r])) : new Map();
  const rows = cases.map((c) => {
    const anchorId = c.practitionerReferences.find((r) => r.role === "ANCHOR").referenceId;
    const vs = c.practitionerReferences.map((p) => { const r = all.get(p.referenceId), m = effectiveMapping(r, map), rec = replayOne(replayProjection(r, m)); const cmp = compareCase(r, m, rec, { registry });
      return { referenceId: p.referenceId, role: p.role, family: p.sourceFamily, vuStatus: rec.status, vuAbstain: cmp.J ? cmp.J.vuAbstain : null, vuPattern: rec.vu && rec.vu.primary ? rec.vu.primary.pattern : null,
               A1: cmp.metrics ? cmp.metrics.A1 : "NOT_COMPARABLE", B: cmp.metrics ? cmp.metrics.B : "NOT_COMPARABLE", S: cmp.metrics ? cmp.metrics.S : "NOT_COMPARABLE" }; });
    const t = tax.get(anchorId) || null;
    return { consensusCaseId: c.consensusCaseId, consensusClass: c.consensusClass, families: c.independentSourceFamilyCount, consensusImpulse: c.impulse.consensusImpulse,
             vu: vs, vuAbstainAll: vs.every((v) => v.vuAbstain !== false), anchorImpulseForensics: t ? { category: t.category, practitionerLikeImpulse: t.practitionerLikeImpulse, candidatePos: t.candidatePos, winner: t.winner, dominantGap: t.dominantGap } : null };
  });
  const rate = (a, k) => { const x = a.flatMap((r) => r.vu).filter((v) => v[k] === "MATCH" || v[k] === "MISMATCH"); return x.length ? `${x.filter((v) => v[k] === "MATCH").length}/${x.length}` : "n/a"; };
  const groups = { D_SINGLE: rows.filter((r) => r.consensusClass === "D_SINGLE"), A_STRONG: rows.filter((r) => r.consensusClass === "A_STRONG"), B_PARTIAL: rows.filter((r) => r.consensusClass === "B_PARTIAL"),
                   C_DISAGREEMENT: rows.filter((r) => r.consensusClass === "C_DISAGREEMENT"), CONSENSUS_IMPULSE_SET: rows.filter((r) => r.consensusImpulse) };
  const pairs = cases.flatMap((c) => c.pairs), hh = Object.fromEntries(LEVELS.map((L) => { const x = pairs.filter((p) => p[L] !== "NOT_COMPARABLE"); return [L, x.length ? `${x.filter((p) => p[L] === "MATCH").length}/${x.length}` : "n/a"]; }));
  const famPairs = {}; for (const p of pairs) { const k = p.families.slice().sort().join("+"); const o = famPairs[k] = famPairs[k] || { n: 0, L2: 0, L1: 0 }; o.n++; if (p.L2_scenario === "MATCH") o.L2++; if (p.L1_family === "MATCH") o.L1++; }
  const out = { schemaVersion: "vu-consensus-benchmark-1.0.0", generatedAt: now, label: "PRACTITIONER CONSENSUS REFERENCE, NOT GROUND TRUTH — INTERN", engine: ENGINE_VERSION, freeze: { version: man.version, sha256: man.sha256 },
    humanHuman: { pairs: pairs.length, levels: hh, byFamilyPair: famPairs, timeframeRelation: by(pairs, (p) => p.timeframeRelation) },
    vuByGroup: Object.fromEntries(Object.entries(groups).map(([k, a]) => [k, { cases: a.length, vuAbstainAll: a.filter((r) => r.vuAbstainAll).length, A1: rate(a, "A1"), B: rate(a, "B"), S: rate(a, "S"),
      anchorImpulse: by(a.filter((r) => r.anchorImpulseForensics), (r) => r.anchorImpulseForensics.category + (r.anchorImpulseForensics.practitionerLikeImpulse ? "+LIKE" : "")) }])),
    rows };
  writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cmd = process.argv[2];
  if (cmd === "freeze") { const r = freeze(); console.log(JSON.stringify(Object.assign({}, r.manifest, { consensusImpulseSet: r.manifest.consensusImpulseSet.length }), null, 1)); }
  else if (cmd === "benchmark") { const r = benchmark(); console.log(JSON.stringify({ humanHuman: r.humanHuman, vuByGroup: r.vuByGroup }, null, 1)); }
  else { console.error("freeze | benchmark"); process.exit(2); }
}
