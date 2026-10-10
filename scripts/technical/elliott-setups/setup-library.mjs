/* =========================================================================
   VU MISSION X — ELLIOTT SETUP LIBRARY V1 (Klassifikator)

   Eine Implementierung fuer Historie UND prospektives Register: liest nur die Ausgabe der eingefrorenen
   Elliott-Engine (elliott-3.2.2) und drei unabhaengige Bestaetigungen (Trend, RS26, Marktstruktur).
   Definitionen: ELLIOTT_SETUP_SPEC.json (vor jeder Ergebnisauswertung festgelegt). Keine Gewichte.
   ========================================================================= */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = join(HERE, "ELLIOTT_SETUP_SPEC.json");
export const SPEC = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
export const SPEC_SHA256 = createHash("sha256").update(readFileSync(SPEC_PATH)).digest("hex");
export const LIBRARY_VERSION = "elliott-setup-library-1.0.0";
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sgn = (s) => (s === "UP" ? 1 : s === "DOWN" ? -1 : 0);

/** Zustand der Primaerzaehlung → Setup-Familie (oder null). */
export function familyOf(p) {
  if (!p) return null;
  const lab = p.currentWave ? String(p.currentWave.label) : null;
  if (!p.complete && (p.pattern === "IMPULSE" || p.pattern === "LEADING_DIAGONAL") && (lab === "2" || lab === "3")) return "S1_EARLY_WAVE3";
  if (!p.complete && /^(IMPULSE|LEADING_DIAGONAL|ENDING_DIAGONAL)$/.test(p.pattern) && lab === "4") return "S2_WAVE4_TO_5";
  if (p.complete && /^(ZIGZAG|FLAT|DOUBLE_ZIGZAG|TRIPLE_ZIGZAG|WXY)$/.test(p.pattern)) return "S3_CORRECTION_COMPLETE";
  if (p.complete && p.pattern === "TRIANGLE") return "S4_TRIANGLE_THRUST";
  return null;
}
/** Schnellfilter auf dem kompakten Elliott-Record von replay-core (ew: p, w) — gleiche Logik ohne Wellenpreise. */
export function familyOfSummary(ew) {
  if (!ew || !ew.p) return null;
  const done = ew.w === "done";
  return familyOf({ pattern: ew.p, complete: done, currentWave: { label: done ? "done" : ew.w } });
}
const PHASE = { S1_EARLY_WAVE3: "3", S2_WAVE4_TO_5: "5", S3_CORRECTION_COMPLETE: "AFTER_CORRECTION", S4_TRIANGLE_THRUST: "THRUST" };

/** Niveaus eines Setups aus den Wellenpreisen der Primaerzaehlung (Spec: confirmation/invalidation). */
function levelsOf(fam, p) {
  const W = p.waves || [], at = (k) => (W[k] && isNum(W[k].toPrice) ? W[k].toPrice : null), n = W.length;
  const engInv = p.invalidation && isNum(p.invalidation.price) ? p.invalidation.price : null;
  if (fam === "S1_EARLY_WAVE3") return { dir: sgn(p.direction), conf: at(0), inv: engInv };
  if (fam === "S2_WAVE4_TO_5") return { dir: sgn(p.direction), conf: at(2), inv: engInv };
  if (fam === "S3_CORRECTION_COMPLETE") return { dir: sgn(p.nextMove), conf: n >= 2 ? at(n - 2) : null, inv: n >= 1 ? at(n - 1) : null };
  if (fam === "S4_TRIANGLE_THRUST") return { dir: sgn(p.nextMove), conf: at(3), inv: at(4) };
  return null;
}

/** Projektionszonen der Setup-Phase jenseits des Kurses: primaer = hoechstes Gewicht (Gleichstand: naechste), erweitert = fernste. */
export function projectionsOf(fam, p, px, dir) {
  const zs = ((p.projection && p.projection.zones) || []).filter((z) => z.phase === PHASE[fam] && z.kind === "TARGET" && isNum(z.zoneLow) && isNum(z.zoneHigh))
    .filter((z) => (dir > 0 ? z.zoneLow > px : z.zoneHigh < px));
  if (!zs.length) return null;
  const near = (z) => Math.abs((dir > 0 ? z.zoneLow : z.zoneHigh) - px);
  const prim = zs.slice().sort((a, b) => b.weight - a.weight || near(a) - near(b))[0];
  const ext = zs.slice().sort((a, b) => near(b) - near(a))[0];
  const z = (x) => ({ low: r4(x.zoneLow), high: r4(x.zoneHigh), weight: x.weight, relations: x.relations || [] });
  return { primary: z(prim), extended: z(ext), basis: SPEC.families.find((f) => f.id === fam).projection.basis };
}

/**
 * Setup-Klassifikation an einem Zeitpunkt.
 * @param {object} E   Ausgabe analyzeElliottV3 (eingefroren)
 * @param {{px:number, atr:number, trend:number, rsQ:number|null, msVote:number|null}} ctx  Bestaetigungen kausal bis t
 * @returns {object|null} Setup-Instanz (Status, Niveaus, Projektionen, Varianten) oder null
 */
export function classify(E, ctx) {
  const p = E && E.primary; const fam = familyOf(p); if (!fam) return null;
  const L = levelsOf(fam, p); if (!L || !L.dir) return { setupId: fam, status: "NO_DIRECTION" };
  const { px, atr } = ctx, dir = L.dir;
  const out = { setupId: fam, setupVersion: SPEC.setupVersion, dir, pattern: p.pattern, wave: p.complete ? "done" : String(p.currentWave.label), degree: p.degree || null,
                persistenceKey: p.persistenceKey || null, displayed: !(E.applicability && E.applicability.abstain), applicability: E.applicability ? E.applicability.level : null,
                alternative: E.alternatives && E.alternatives[0] ? { pattern: E.alternatives[0].pattern, wave: E.alternatives[0].complete ? "done" : String(E.alternatives[0].currentWave.label), nextMove: E.alternatives[0].nextMove || null } : null,
                levels: { confirmation: r4(L.conf), invalidation: r4(L.inv) } };
  if (!isNum(L.inv) || (dir > 0 ? !(L.inv < px) : !(L.inv > px))) { out.status = "ALREADY_INVALID_OR_UNDEFINED"; return out; }
  out.levels.confirmationState = !isNum(L.conf) ? "UNDEFINED" : (dir > 0 ? px > L.conf : px < L.conf) ? "ALREADY_CONFIRMED" : "PENDING";
  const proj = projectionsOf(fam, p, px, dir);
  if (!proj) { out.status = "NO_PROJECTION_BEYOND_PRICE"; return out; }
  out.projection = proj;
  out.status = "QUALIFIED";
  out.higherDegreeDirection = E.higherDegree && E.higherDegree.current ? E.higherDegree.current.direction : null;
  applyConfirmations(out, ctx);
  out.geometry = isNum(atr) && atr > 0 ? { kT: r4(Math.abs((dir > 0 ? proj.primary.low : proj.primary.high) - px) / atr), kI: r4(Math.abs(px - L.inv) / atr),
    kC: out.levels.confirmationState === "PENDING" ? r4(Math.abs(L.conf - px) / atr) : null, kT2: r4(Math.abs((dir > 0 ? proj.extended.low : proj.extended.high) - px) / atr) } : null;
  return out;
}

/** Bestaetigungen und Varianten (logisches UND, keine Gewichte). Auch nachtraeglich mit RS-Rang aufrufbar (historische Stufe B). */
export function applyConfirmations(out, ctx) {
  const dir = out.dir, hd = out.higherDegreeDirection;
  const trendOk = ctx.trend === dir, rsOk = isNum(ctx.rsQ) ? (dir > 0 ? ctx.rsQ >= 0.8 : ctx.rsQ <= 0.2) : false, msOk = isNum(ctx.msVote) ? Math.sign(ctx.msVote) === dir : false;
  out.confirmations = { trend: trendOk, rs26: rsOk, rs26Rank: r4(ctx.rsQ), marketStructure: msOk, volume: "NOT_AVAILABLE", higherDegreeAligned: hd === dir, higherDegreeDirection: hd };
  out.variants = { ENGINE_PRIMARY: true, PURE: out.displayed, PURE_RS: out.displayed && rsOk, CONFIRMED: out.displayed && trendOk && rsOk && msOk, PURE_HD: out.displayed && hd === dir };
  return out;
}

/** Forschungskohorte RESEARCH_ONLY_INTERNAL_WAVE3 (Mission IX earlyUp) aus den ausgabeneutralen Forensik-Haken. */
export function researchInternalWave3(E, close, t) {
  const tr = (E && E.trace) || {}, all = tr.allCands || [];
  const k = all.findIndex((c) => c.type === "IMPULSE"); if (k < 0) return null;
  const c = all[k], end = c.pts[c.pts.length - 1], dir = Math.sign(close[end] - close[c.pts[0]]), waves = c.pts.length - 1;
  const q = dir === 1 && !c.complete && (waves === 2 || waves === 3) && t - end <= 4;
  return { cohort: "RESEARCH_ONLY_INTERNAL_WAVE3", qualifies: q, dir, waves, complete: !!c.complete, rankInSearch: k, lastMarkAgeBars: t - end,
           pivotIdx: c.pts, pivotPrice: c.pts.map((i) => r4(close[i])) };
}
