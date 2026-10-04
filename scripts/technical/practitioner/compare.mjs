/* Practitioner Reference Benchmark — Methodenaehnlichkeit (Protokoll §10, Kennzahlen A–K und S).

   Vergleicht eine Praktiker-Referenz mit der blinden VU-Wiedergabe (oder zwei Praktiker-Referenzen miteinander). Misst
   AEHNLICHKEIT DER STRUKTURIERUNG, nicht Richtigkeit: PRACTITIONER REFERENCE ≠ OBJECTIVE GROUND TRUTH.
   Dieses Modul liest KEINE Kurse nach dem Stichtag und importiert outcome.mjs nicht (Trennung Methode/Ergebnis).

   Kennzahlen je Fall (MATCH / MISMATCH / NOT_COMPARABLE):
     A Richtung (directionalBias vs. VU nextMove)       B Musterfamilie (MOTIVE/CORRECTIVE)
     C laufende Welle (normalisiertes Label; VU-Muster abgeschlossen → letztes Label oder naechstes Label des hoeheren Grades)
     D Grad exakt / E Grad ±1 (VU-Grad = NAEHERUNG aus Wellendauer, siehe lib.degreeRankFromDays)
     F Primaerzaehlung gleich (Muster + laufende Welle)  G Primaer- oder Alternativzaehlung gleich (beliebiges Paar)
     H Invalidation: Abstand absolut (nur EXACT), in % des VU-Schlusses und ATR-normiert; gleiche Seite
     I Zielzonen: Ueberlappung (ja/nein, Anteil getroffener Zonen je Seite), Abstand naechster Zentren in % und ATR
     J Anwendbarkeit/Enthaltung (VU-Stufe, abstain)     K laufend vs. bestaetigt
     S strukturelle Szenario-Uebereinstimmung: naechste Bewegung (A) UND Rolle der laufenden Bewegung UND – wo beim
       Praktiker ableitbar – uebergeordnete Richtung.
   Enthaltung ist eine eigene Kategorie: Raten werden mit und ohne enthaltene Faelle berichtet.
   Konfidenzintervalle: Cluster-Bootstrap nach Quelle UND nach Instrument (scripts/technical/lib/validation-stats.cjs);
   massgeblich ist das breitere Intervall. Cohens κ fuer Richtung und Familie (ebenfalls Cluster-Bootstrap).
   Mensch–Mensch-Paare: gleiche vuSymbol, gleicher Zeitrahmen, Veroeffentlichung innerhalb von 5 Handelstagen, verschiedene
   sourceId; je Referenz und fremder Quelle nur die zeitlich naechste Referenz (keine Ueberzaehlung vielposter Quellen). */
import { createRequire } from "node:module";
import { join } from "node:path";
import { ROOT, PATTERN_FAMILY, normalizeWaveLabel, roleOfLabel, vuEffectiveRole, round, publicationLocalDate, chainViews } from "./lib.mjs";
import { sessionDaysBetween, parsePublication } from "./cutoff.mjs";
const require = createRequire(import.meta.url);
const VS = require(join(ROOT, "scripts/technical/lib/validation-stats.cjs"));

export const METRICS_BINARY = ["A", "B", "C", "D", "E", "F", "G", "K", "S"];
const M = "MATCH", X = "MISMATCH", NC = "NOT_COMPARABLE";
const known = (v) => v !== null && v !== undefined && v !== "UNKNOWN";
const eq = (a, b) => (known(a) && known(b) ? (a === b ? M : X) : NC);
const opp = (d) => (d === "UP" ? "DOWN" : d === "DOWN" ? "UP" : null);

// ------------------------------------------------------------------ Sichten (gleiche Form fuer Praktiker und VU)
/** Praktiker-Sicht; Niveaus in VU-Einheiten (levelScale), nur wenn vergleichbar. */
export function practitionerView(ref, mapping) {
  const p = ref.primary || {};
  const pattern = known(p.pattern) ? p.pattern : null;
  const family = known(p.family) ? p.family : pattern ? PATTERN_FAMILY[pattern] || null : null;
  const label = normalizeWaveLabel(p.currentWave);
  const roleFromLabel = roleOfLabel(label, pattern);
  const role = known(p.currentWaveRole) ? p.currentWaveRole : known(roleFromLabel) ? roleFromLabel : null;
  const state = known(p.state) ? p.state : null;
  const direction = known(ref.directionalBias) ? ref.directionalBias : null;
  /* uebergeordnete Richtung nur, wo eindeutig: laufende Motivwelle eines Motivmusters laeuft MIT dem Trend; laufende A/C-Welle
     eines Korrekturmusters GEGEN den Trend; sonst unbekannt. */
  let impliedTrend = null;
  if (state !== "CONFIRMED_COMPLETE" && role === "MOTIVE" && (direction === "UP" || direction === "DOWN")) impliedTrend = family === "MOTIVE" ? direction : family === "CORRECTIVE" ? opp(direction) : null;
  const scale = mapping && mapping.levelsComparable ? mapping.levelScale : null;
  const sc = (v) => (Number.isFinite(v) && Number.isFinite(scale) ? v * scale : null);
  return {
    actor: "PRACTITIONER", pattern, family, label, completeLabel: state === "CONFIRMED_COMPLETE" ? label : null, inferredNext: null,
    role, state, direction, impliedTrend, degreeRank: Number.isInteger(p.degreeRank) ? p.degreeRank : null,
    invalidation: ref.invalidation && sc(ref.invalidation.price) !== null ? { price: sc(ref.invalidation.price), direction: ref.invalidation.direction || null } : null,
    targets: Number.isFinite(scale) ? (ref.targetZones || []).map((z) => ({ low: sc(Math.min(z.low, z.high)), high: sc(Math.max(z.low, z.high)) })) : [],
    alternatives: (ref.alternatives || []).map((a) => ({ pattern: known(a.pattern) ? a.pattern : null, label: normalizeWaveLabel(a.currentWave), direction: known(a.directionalBias) ? a.directionalBias : null })),
    levelsComparable: Number.isFinite(scale), abstain: false
  };
}
/** VU-Sicht aus einem Replay-Datensatz (nur VU-Felder). */
export function vuView(rec) {
  const v = rec && rec.vu, c = v && v.primary;
  if (!c) return null;
  const h = v.higherDegree;
  return {
    actor: "VU", pattern: c.pattern, family: c.family, label: c.complete ? null : c.currentWave.normLabel, completeLabel: c.complete ? c.currentWave.normLabel : null,
    inferredNext: c.complete && h ? h.nextLabel : null, role: vuEffectiveRole(c, h), roleInferred: c.complete, state: c.complete ? "CONFIRMED_COMPLETE" : "DEVELOPING",
    direction: c.nextMove || null, impliedTrend: c.impliedTrend || null, degreeRank: c.degree ? c.degree.rank : null,
    invalidation: c.invalidation ? { price: c.invalidation.price, direction: c.invalidation.direction } : null,
    targets: (c.targets || []).map((z) => ({ low: Math.min(z.low, z.high), high: Math.max(z.low, z.high) })),
    alternatives: (v.alternatives || []).map((a) => ({ pattern: a.pattern, label: a.complete ? null : a.currentWave.normLabel, completeLabel: a.complete ? a.currentWave.normLabel : null, direction: a.nextMove })),
    levelsComparable: true, abstain: !!v.applicability.abstain, applicability: v.applicability.level, status: v.status
  };
}

// ------------------------------------------------------------------ Kennzahlen
function waveMatch(a, b) {
  if (known(a.label) && known(b.label)) return a.label === b.label ? M : X;
  const la = a.label || a.completeLabel, lb = b.label || b.completeLabel;
  if (!known(la) || !known(lb)) return NC;
  if (a.completeLabel && b.completeLabel) return a.completeLabel === b.completeLabel ? M : X;
  if (a.completeLabel && known(b.label)) return b.label === a.inferredNext ? M : X;
  if (b.completeLabel && known(a.label)) return a.label === b.inferredNext ? M : X;
  return NC;
}
function countMatch(a, b) {
  if (!known(a.pattern) || !known(b.pattern)) return NC;
  if (a.pattern !== b.pattern) return X;
  const w = waveMatch(a, b);
  return w === NC ? NC : w;
}
const zoneIntersects = (z, w) => Math.max(z.low, w.low) <= Math.min(z.high, w.high);
const center = (z) => (z.low + z.high) / 2;
/**
 * Alle Kennzahlen zwischen zwei Sichten. ctx: {close, atr, absoluteComparable}. Niveaus beider Sichten in VU-Einheiten.
 */
export function compareViews(a, b, ctx = {}) {
  const m = {};
  m.A = eq(a.direction, b.direction);
  m.B = eq(a.family, b.family);
  m.C = waveMatch(a, b);
  m.D = Number.isInteger(a.degreeRank) && Number.isInteger(b.degreeRank) ? (a.degreeRank === b.degreeRank ? M : X) : NC;
  m.E = Number.isInteger(a.degreeRank) && Number.isInteger(b.degreeRank) ? (Math.abs(a.degreeRank - b.degreeRank) <= 1 ? M : X) : NC;
  m.F = countMatch(a, b);
  const ca = [a, ...a.alternatives], cb = [b, ...b.alternatives];
  const gRes = ca.flatMap((x) => cb.map((y) => countMatch(Object.assign({ alternatives: [] }, x), Object.assign({ alternatives: [] }, y))));
  m.G = gRes.includes(M) ? M : gRes.includes(X) ? X : NC;
  m.K = eq(a.state, b.state);
  const role = eq(a.role, b.role), trend = known(a.impliedTrend) && known(b.impliedTrend) ? eq(a.impliedTrend, b.impliedTrend) : NC;
  m.S = m.A === NC || role === NC ? NC : m.A === M && role === M && trend !== X ? M : X;
  const sDetail = { nextMove: m.A, role, impliedTrend: trend, strict: m.A === M && role === M && trend === M };
  // H Invalidation
  let H = { result: NC };
  if (a.invalidation && b.invalidation && a.levelsComparable && b.levelsComparable && Number.isFinite(ctx.close)) {
    const d = Math.abs(a.invalidation.price - b.invalidation.price);
    H = { result: "COMPUTED", absolute: ctx.absoluteComparable ? round(d, 4) : null, pct: round(d / ctx.close * 100, 3), atr: Number.isFinite(ctx.atr) && ctx.atr > 0 ? round(d / ctx.atr, 3) : null,
          sameSide: a.invalidation.direction && b.invalidation.direction ? a.invalidation.direction === b.invalidation.direction : null };
  }
  // I Zielzonen
  let I = { result: NC };
  if (a.targets.length && b.targets.length && a.levelsComparable && b.levelsComparable && Number.isFinite(ctx.close)) {
    const hitA = a.targets.filter((z) => b.targets.some((w) => zoneIntersects(z, w))).length, hitB = b.targets.filter((z) => a.targets.some((w) => zoneIntersects(z, w))).length;
    let best = Infinity; for (const z of a.targets) for (const w of b.targets) best = Math.min(best, Math.abs(center(z) - center(w)));
    I = { result: "COMPUTED", anyOverlap: hitA > 0, shareOfFirstZonesHit: round(hitA / a.targets.length, 3), shareOfSecondZonesHit: round(hitB / b.targets.length, 3),
          nearestCenterPct: round(best / ctx.close * 100, 3), nearestCenterAtr: Number.isFinite(ctx.atr) && ctx.atr > 0 ? round(best / ctx.atr, 3) : null };
  }
  return { metrics: m, sDetail, H, I };
}

/** VU vs. Praktiker fuer einen Fall. rec = Replay-Datensatz derselben Referenz. */
export function compareCase(ref, mapping, rec, extra = {}) {
  const row = { referenceId: ref.referenceId, caseId: ref.caseId, sourceId: ref.sourceId, vuSymbol: mapping.vuSymbol, timeframe: ref.timeframe, viewKind: ref.viewKind || "ORIGINAL_PUBLISHED",
                mappingQuality: mapping.mappingQuality, split: extra.split || ref.split || "UNASSIGNED", confidence: ref.extraction && ref.extraction.confidence, year: String(ref.analysisCutoff).slice(0, 4) };
  const v = rec && rec.status === "OK" ? vuView(rec) : null;
  row.replayStatus = rec ? rec.status : "MISSING";
  row.J = { vuStatus: rec && rec.vu ? rec.vu.status : rec ? rec.status : null, vuApplicability: v ? v.applicability : null, vuAbstain: v ? v.abstain : null, vuHasCount: !!v };
  if (!v) { row.category = rec && rec.status === "OK" ? "VU_NO_COUNT" : row.replayStatus; return row; }
  row.category = v.abstain ? "VU_ABSTAINED" : "VU_APPLICABLE";
  const P = practitionerView(ref, mapping);
  const r = compareViews(P, v, { close: rec.market.closeAtCutoff, atr: rec.market.atr14Close, absoluteComparable: mapping.mappingQuality === "EXACT" });
  Object.assign(row, r, { vuDegree: rec.vu.primary.degree, practitionerDegreeRank: P.degreeRank });
  return row;
}

// ------------------------------------------------------------------ Statistik
function wideCi(a, b) { if (a.lo === null || b.lo === null) return a.lo === null ? b : a; return (a.hi - a.lo) >= (b.hi - b.lo) ? a : b; }
function bootRate(rows, valueFn, seed) {
  const v = rows.filter((r) => valueFn(r) === M || valueFn(r) === X);
  const sums = (r) => [valueFn(r) === M ? 1 : 0, 1], stat = (s) => (s[1] ? s[0] / s[1] : null);
  const bySource = VS.clusterBoot(v, (r) => r.sourceId, sums, stat, 1000, seed), byInstrument = VS.clusterBoot(v, (r) => r.vuSymbol, sums, stat, 1000, seed + 1);
  const w = wideCi(bySource, byInstrument);
  return { n: v.length, match: v.filter((r) => valueFn(r) === M).length, rate: bySource.est, ci95: [w.lo, w.hi], ciBy: w === bySource ? "SOURCE" : "INSTRUMENT",
           ciSource: [bySource.lo, bySource.hi], ciInstrument: [byInstrument.lo, byInstrument.hi], clustersSource: bySource.clusters, clustersInstrument: byInstrument.clusters };
}
/** Cohens κ aus Paaren [a, b] (Kategorien ohne Unbekannt). */
export function cohenKappa(pairs, cats) {
  cats = cats || [...new Set(pairs.flat())].sort();
  const k = cats.length, n = pairs.length;
  if (!n || k < 1) return null;
  const mtx = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const [a, b] of pairs) mtx[cats.indexOf(a)][cats.indexOf(b)]++;
  return kappaFromMatrix(mtx.flat(), k);
}
function kappaFromMatrix(flat, k) {
  let n = 0, po = 0; for (const x of flat) n += x;
  if (!n) return null;
  const ra = new Array(k).fill(0), rb = new Array(k).fill(0);
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const x = flat[i * k + j]; ra[i] += x; rb[j] += x; if (i === j) po += x; }
  po /= n; let pe = 0; for (let i = 0; i < k; i++) pe += (ra[i] / n) * (rb[i] / n);
  return pe >= 1 ? (po === 1 ? 1 : null) : (po - pe) / (1 - pe);
}
function bootKappa(rows, getA, getB, cats, seed) {
  const v = rows.filter((r) => cats.includes(getA(r)) && cats.includes(getB(r))), k = cats.length;
  const sums = (r) => { const a = new Array(k * k).fill(0); a[cats.indexOf(getA(r)) * k + cats.indexOf(getB(r))] = 1; return a; }, stat = (s) => kappaFromMatrix(Array.from(s), k);
  if (!v.length) return { n: 0, kappa: null, ci95: [null, null] };
  const bs = VS.clusterBoot(v, (r) => r.sourceId, sums, stat, 1000, seed), bi = VS.clusterBoot(v, (r) => r.vuSymbol, sums, stat, 1000, seed + 1), w = wideCi(bs, bi);
  return { n: v.length, kappa: bs.est, ci95: [w.lo, w.hi], ciBy: w === bs ? "SOURCE" : "INSTRUMENT", categories: cats };
}
const median = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] + (a.length % 2 ? 0 : (a[a.length / 2] - a[a.length / 2 - 1]) / 2) : null; };
function levelSummary(rows) {
  const H = rows.filter((r) => r.H && r.H.result === "COMPUTED"), I = rows.filter((r) => r.I && r.I.result === "COMPUTED");
  return { H: { n: H.length, medianPct: round(median(H.map((r) => r.H.pct)), 3), medianAtr: round(median(H.map((r) => r.H.atr)), 3), sameSideShare: H.length ? round(H.filter((r) => r.H.sameSide).length / H.length, 3) : null },
           I: { n: I.length, anyOverlap: bootRate(I, (r) => (r.I.anyOverlap ? M : X), 101), medianNearestCenterAtr: round(median(I.map((r) => r.I.nearestCenterAtr)), 3), medianNearestCenterPct: round(median(I.map((r) => r.I.nearestCenterPct)), 3) } };
}
/** Aggregat ueber Fallzeilen (VU vs. Praktiker): je Kennzahl mit und ohne enthaltene Faelle. */
export function aggregate(rows) {
  const withCount = rows.filter((r) => r.metrics), nonAbst = withCount.filter((r) => r.category === "VU_APPLICABLE");
  const cat = {}; for (const r of rows) cat[r.category] = (cat[r.category] || 0) + 1;
  const metrics = {};
  METRICS_BINARY.forEach((k, i) => { metrics[k] = { includingAbstained: bootRate(withCount, (r) => r.metrics[k], 200 + i * 3), excludingAbstained: bootRate(nonAbst, (r) => r.metrics[k], 300 + i * 3) }; });
  return {
    cases: rows.length, categories: cat,
    J: { vuAbstainShare: withCount.length ? round(withCount.filter((r) => r.J.vuAbstain).length / withCount.length, 3) : null, applicability: countBy(withCount, (r) => r.J.vuApplicability) },
    metrics,
    levels: { includingAbstained: levelSummary(withCount), excludingAbstained: levelSummary(nonAbst) },
    kappa: { direction: bootKappa(withCount, (r) => r._pDir, (r) => r._vDir, ["DOWN", "SIDEWAYS", "UP"], 401), family: bootKappa(withCount, (r) => r._pFam, (r) => r._vFam, ["CORRECTIVE", "MOTIVE"], 403) },
    degreeNote: "D/E: VU-Grad ist eine Naeherung aus der Wellendauer (approximate)."
  };
}
const countBy = (a, f) => a.reduce((o, x) => { const k = String(f(x)); o[k] = (o[k] || 0) + 1; return o; }, {});

// ------------------------------------------------------------------ Mensch–Mensch
/**
 * Paare: gleiche vuSymbol, gleicher Zeitrahmen, |Handelstage| <= 5 zwischen den Veroeffentlichungsdaten (Markt des Instruments),
 * verschiedene sourceId. Je Referenz und fremder Quelle nur die zeitlich naechste (Gleichstand: kleinere referenceId).
 */
export function pairHumanHuman(refs, mappingOf, maxSessions = 5) {
  const items = refs.filter((r) => mappingOf(r).vuSymbol).map((r) => ({ r, d: publicationLocalDate(r), t: parsePublication(r.publication).instantMs, m: mappingOf(r) }));
  const pairs = new Map();
  for (const a of items) {
    const best = new Map();
    for (const b of items) {
      if (a === b || a.r.sourceId === b.r.sourceId || a.m.vuSymbol !== b.m.vuSymbol || a.r.timeframe !== b.r.timeframe) continue;
      const s = Math.abs(sessionDaysBetween(a.d, b.d, a.m.market));
      if (s > maxSessions) continue;
      const cur = best.get(b.r.sourceId), dt = Math.abs(a.t - b.t);
      if (!cur || dt < cur.dt || (dt === cur.dt && b.r.referenceId < cur.b.r.referenceId)) best.set(b.r.sourceId, { b, dt, s });
    }
    for (const { b, s } of best.values()) {
      const [x, y] = a.r.referenceId < b.r.referenceId ? [a, b] : [b, a];
      const key = x.r.referenceId + "|" + y.r.referenceId;
      if (!pairs.has(key)) pairs.set(key, { a: x, b: y, sessionsApart: s });
    }
  }
  return [...pairs.values()].sort((p, q) => (p.a.r.referenceId + p.b.r.referenceId).localeCompare(q.a.r.referenceId + q.b.r.referenceId));
}
/** Kennzahlen zwischen zwei Praktikern. Niveaus beide in VU-Einheiten; Schluss/ATR aus der VU-Wiedergabe der frueheren Referenz. */
export function compareHumanPair(pair, replayOf) {
  const { a, b } = pair, first = a.t <= b.t ? a : b, rec = replayOf(first.r.referenceId);
  const A = practitionerView(a.r, a.m), B = practitionerView(b.r, b.m);
  const ctx = rec && rec.status === "OK" ? { close: rec.market.closeAtCutoff, atr: rec.market.atr14Close, absoluteComparable: a.m.mappingQuality === "EXACT" && b.m.mappingQuality === "EXACT" } : {};
  const r = compareViews(A, B, ctx);
  const agreement = r.metrics.A === NC ? "NOT_COMPARABLE" : r.metrics.A === M && r.metrics.S === M ? "HIGH_PRACTITIONER_AGREEMENT" : "AMBIGUITY";
  return { referenceIds: [a.r.referenceId, b.r.referenceId], sources: [a.r.sourceId, b.r.sourceId], sourceId: [a.r.sourceId, b.r.sourceId].sort().join("+"), vuSymbol: a.m.vuSymbol,
           timeframe: a.r.timeframe, sessionsApart: pair.sessionsApart, agreement, _pDir: A.direction, _vDir: B.direction, _pFam: A.family, _vFam: B.family, ...r };
}
export function aggregateHuman(rows) {
  const metrics = {}; METRICS_BINARY.forEach((k, i) => { metrics[k] = bootRate(rows, (r) => r.metrics[k], 500 + i * 3); });
  return { pairs: rows.length, agreementDistribution: countBy(rows, (r) => r.agreement), metrics, levels: levelSummary(rows),
           kappa: { direction: bootKappa(rows, (r) => r._pDir, (r) => r._vDir, ["DOWN", "SIDEWAYS", "UP"], 601), family: bootKappa(rows, (r) => r._pFam, (r) => r._vFam, ["CORRECTIVE", "MOTIVE"], 603) },
           note: "Keine Mehrheitsentscheidung als Wahrheit; gespeichert wird die Verteilung." };
}

// ------------------------------------------------------------------ Dynamik
/** Revisionsrate je Quelle: Anteil der Faelle (Ketten) mit mindestens einer spaeteren Fassung. */
export function revisionRateBySource(chains) {
  const o = {};
  for (const list of chains.values()) {
    const s = list[0].sourceId; o[s] = o[s] || { cases: 0, revisedCases: 0, revisions: 0 };
    o[s].cases++; if (list.length > 1) o[s].revisedCases++; o[s].revisions += list.length - 1;
  }
  for (const s of Object.keys(o)) o[s].rate = round(o[s].revisedCases / o[s].cases, 3);
  return o;
}
/** VU-Neuzuordnung im Replay: Wechsel des Persistenzschluessels zwischen aufeinanderfolgenden Stichtagen ab dem Stichtag. */
export function vuRelabel(rec) {
  const pts = rec && rec.dynamics && rec.dynamics.status === "OK" ? rec.dynamics.points.filter((p) => p.offsetBars >= 0) : [];
  if (pts.length < 2) return null;
  let changes = 0; for (let i = 1; i < pts.length; i++) if (pts[i].key !== pts[i - 1].key) changes++;
  return { bars: pts.length - 1, changes, relabeled: changes > 0, per100Bars: round(changes / (pts.length - 1) * 100, 2) };
}
/** Erkennungslatenz: erster Stichtag im Fenster, an dem VU dasselbe strukturelle Szenario (S) zeigt; Bars relativ zum Stichtag. */
export function detectionLatency(ref, mapping, rec) {
  const pts = rec && rec.dynamics && rec.dynamics.status === "OK" ? rec.dynamics.points : null;
  if (!pts || !pts.length) return { status: "NO_TRAJECTORY" };
  const P = practitionerView(ref, mapping);
  if (!known(P.direction) || !known(P.role)) return { status: "NOT_COMPARABLE" };
  const hit = pts.find((p) => p.nextMove === P.direction && p.role === P.role && (!known(P.impliedTrend) || p.impliedTrend === P.impliedTrend));
  return hit ? { status: "FOUND", offsetBars: hit.offsetBars, date: hit.date, window: [pts[0].offsetBars, pts[pts.length - 1].offsetBars] }
             : { status: "NOT_IN_WINDOW", window: [pts[0].offsetBars, pts[pts.length - 1].offsetBars] };
}
export function dynamicsSummary(chains, latencyRows, relabelRows) {
  const lat = latencyRows.filter((x) => x.status === "FOUND").map((x) => x.offsetBars), rel = relabelRows.filter(Boolean);
  return { practitionerRevisionRateBySource: revisionRateBySource(chains),
           vuRelabel: { cases: rel.length, relabeledShare: rel.length ? round(rel.filter((x) => x.relabeled).length / rel.length, 3) : null, medianPer100Bars: round(median(rel.map((x) => x.per100Bars)), 2) },
           detectionLatency: { cases: latencyRows.length, found: lat.length, medianOffsetBars: median(lat), vuEarlierOrSame: lat.filter((x) => x <= 0).length, statusCounts: countBy(latencyRows, (x) => x.status) },
           note: "Revisionsrate (Praktiker, ganze Archivspanne) und VU-Neuzuordnungsrate (Replay-Fenster) haben verschiedene Horizonte – nur qualitativ vergleichen." };
}
export { chainViews };
/** Fuer κ: Kategorien der Zeile ablegen (intern, mit '_' beginnend). */
export function attachKappaFields(row, ref, mapping, rec) {
  const P = practitionerView(ref, mapping), V = rec && rec.status === "OK" ? vuView(rec) : null;
  return Object.assign(row, { _pDir: P.direction, _vDir: V ? V.direction : null, _pFam: P.family, _vFam: V ? V.family : null });
}
export const stripPrivate = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith("_")));
