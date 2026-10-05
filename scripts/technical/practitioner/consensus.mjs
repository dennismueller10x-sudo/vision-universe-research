/* Mission VII — Konsens mehrerer Praktiker (Protokoll-Nachtrag 7). PRACTITIONER CONSENSUS REFERENCE, NOT GROUND TRUTH.

   Reine Logik (ohne Datei-IO): Zeitrahmen-Beziehung, paarweise Ebenen L1–L6, Konsensklasse A/B/C/D, offene Staerke (k/n je Ebene),
   Impuls-Konsens. Keine Mehrheitsentscheidung: alle Lesarten bleiben erhalten; Klassen verlangen Einigkeit ALLER Paare. */
import { practitionerView, compareViews } from "./compare.mjs";

export const TF_ORDER = ["1D", "1W", "1M"];
/** SAME | PARENT_CHILD (verschiedene, aber benachbarte oder verschachtelbare Zeitrahmen) | INCOMPATIBLE */
export function tfRelation(a, b) {
  if (a === b && TF_ORDER.includes(a)) return "SAME";
  if (TF_ORDER.includes(a) && TF_ORDER.includes(b)) return "PARENT_CHILD";
  return "INCOMPATIBLE";
}
const M = "MATCH", X = "MISMATCH", NC = "NOT_COMPARABLE";
const MOTIVE_PATTERNS = ["IMPULSE", "LEADING_DIAGONAL", "ENDING_DIAGONAL"];

/** Ebenen eines Praktiker-Paars. ctx: { close, atr } im VU-Massstab des frueheren Stichtags; mapping je Referenz. */
export function pairLevels(a, b, ma, mb, ctx = {}) {
  const tf = tfRelation(a.timeframe, b.timeframe);
  const A = practitionerView(a, ma, ctx), B = practitionerView(b, mb, ctx);
  const r = compareViews(A, B, Object.assign({ absoluteComparable: ma.mappingQuality === "EXACT" && mb.mappingQuality === "EXACT" }, ctx));
  const out = { timeframeRelation: tf, L1_family: NC, L2_scenario: NC, L3_pattern: NC, L4_currentWave: NC, L5_degreeExact: NC, L5_degreePm1: NC, L6_invalidation: NC, L6_targets: NC };
  /* Nachtrag 8: nur gleicher Zeitrahmen wird beurteilt; Eltern/Kind ist TIMEFRAME_DIVERGENT (weder Konsens noch Widerspruch) */
  if (tf !== "SAME") return out;
  out.L1_family = r.metrics.B;
  /* L2 = Richtung ab jetzt; SIDEWAYS ist zwischen Praktikern normal vergleichbar */
  out.L2_scenario = A.currentMove && B.currentMove ? (A.currentMove === B.currentMove ? M : X) : NC;
  out.L3_pattern = A.pattern && B.pattern ? (A.pattern === B.pattern ? M : X) : NC;
  out.L4_currentWave = r.metrics.C;
  out.L5_degreeExact = r.metrics.D; out.L5_degreePm1 = r.metrics.E;
  if (r.H && r.H.result === "COMPUTED") out.L6_invalidation = (Number.isFinite(r.H.atr) && r.H.atr <= 2) || r.H.pct <= 5 ? M : X;
  if (r.I && r.I.result === "COMPUTED") out.L6_targets = r.I.anyOverlap ? M : X;
  return out;
}
export const LEVELS = ["L1_family", "L2_scenario", "L3_pattern", "L4_currentWave", "L5_degreeExact", "L5_degreePm1", "L6_invalidation", "L6_targets"];

/** members: [{ ref, mapping, family, role: "ANCHOR"|"LINKED" }], nur INCLUDED; ctx wie pairLevels. */
export function classifyConsensus(members, ctx = {}) {
  const fams = members.map((m) => m.family);
  if (new Set(fams).size !== fams.length) throw new Error("Konsensfall mit doppelter Quellenfamilie: " + fams.join(","));
  const pairs = [];
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++)
    pairs.push(Object.assign({ a: members[i].ref.referenceId, b: members[j].ref.referenceId, families: [members[i].family, members[j].family] }, pairLevels(members[i].ref, members[j].ref, members[i].mapping, members[j].mapping, ctx)));
  const strength = { sourceFamilies: members.length };
  for (const L of LEVELS) { const c = pairs.filter((p) => p[L] !== NC); strength[L] = c.length ? `${c.filter((p) => p[L] === M).length}/${c.length}` : "n/a"; }
  /* Nachtrag 8: Klassen nur ueber Mitglieder mit dem Zeitrahmen des Ausgangsfalls */
  const anchor = members.find((m) => m.role === "ANCHOR") || members[0];
  const same = pairs.filter((p) => p.timeframeRelation === "SAME" && members.some((m) => m.ref.timeframe === anchor.ref.timeframe && (m.ref.referenceId === p.a || m.ref.referenceId === p.b)));
  strength.sameTimeframeFamilies = members.filter((m) => m.ref.timeframe === anchor.ref.timeframe).length;
  strength.timeframeDivergentPairs = pairs.filter((p) => p.timeframeRelation !== "SAME").length;
  let cls;
  if (members.length < 2) cls = "D_SINGLE";
  else if (strength.sameTimeframeFamilies < 2) cls = "E_TIMEFRAME_ONLY";
  else if (same.some((p) => p.L2_scenario === X)) cls = "C_DISAGREEMENT";
  else if (same.some((p) => p.L2_scenario === NC)) cls = "UNDETERMINED";
  else if (same.every((p) => p.L1_family === M)) cls = "A_STRONG";
  else cls = "B_PARTIAL";
  const motive = members.filter((m) => MOTIVE_PATTERNS.includes(m.ref.primary && m.ref.primary.pattern) || (m.ref.primary && m.ref.primary.family === "MOTIVE"));
  const motiveFams = new Set(motive.map((m) => m.family));
  /* Impuls-Konsens nur auf gleichem Zeitrahmen (Nachtrag 8) */
  const motiveSameTf = motive.filter((m) => m.ref.timeframe === anchor.ref.timeframe);
  const motivePairsAgreeL2 = motiveSameTf.length >= 2 && pairs.filter((p) => motiveSameTf.some((m) => m.ref.referenceId === p.a) && motiveSameTf.some((m) => m.ref.referenceId === p.b)).every((p) => p.L2_scenario === M);
  const impulse = { motiveFamilies: motiveFams.size, motiveFamiliesSameTimeframe: new Set(motiveSameTf.map((m) => m.family)).size, consensusImpulse: new Set(motiveSameTf.map((m) => m.family)).size >= 2 && motivePairsAgreeL2,
                    anchorMotive: members.some((m) => m.role === "ANCHOR" && motive.includes(m)) };
  return { consensusClass: cls, strength, pairs, impulse };
}
/** Unabhaengigkeit: hoechstens eine Referenz je Familie, nie die Familie des Ausgangsfalls. */
export function independentLinks(anchorFamily, links) {
  const seen = new Set([anchorFamily]), out = [], rejected = [];
  for (const l of links) { if (seen.has(l.family)) { rejected.push(Object.assign({ reason: l.family === anchorFamily ? "SAME_FAMILY_AS_ANCHOR" : "FAMILY_ALREADY_LINKED" }, l)); continue; } seen.add(l.family); out.push(l); }
  return { links: out, rejected };
}
