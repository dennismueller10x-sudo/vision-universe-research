#!/usr/bin/env node
/* =========================================================================
   VU Technical Intelligence — Audit des Explore-Kandidatenpools und der Kuratierung (beschreibend)

   Liest den JSONL-Dump des Builds (node scripts/technical/build-technical-intelligence.mjs --out DIR --dump-candidates DATEI)
   und rechnet OHNE Zukunftsdaten und OHNE Renditen:
     1. Pool: alle zulaessigen Explore-Kandidaten (Filter unveraendert), Verteilung nach Wellentyp, Richtung, Rang, Grad
     2. Matrix verfehlter Leitplanken (G2 allein … 3+) mit Wellentyp-Mix, Rangverteilung und Abdeckung der bisherigen breiten Auswahl
     3. Welle-3-Audit: alle laufenden, regelkonformen Welle-3-Lesarten des Pools (unabhaengig von Rang und Leitplanken)
     4. Kuratierung (explore-curation.js) auf dem Pool: Highlights, Candidate Explorer, Abdeckung, Verteilungen, Projektionsgroessen-Buckets
     5. Referenztitel (QA)
   Die Projektionsgroesse wird nur BESCHRIEBEN (Buckets), nie zur Auswahl benutzt.

   node scripts/technical/explore-curation-audit.mjs DUMP.jsonl [--out DIR] [--titles SE,OSCR,...] [--policy JSON]
   ========================================================================= */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/ti-data.mjs";

const require = createRequire(import.meta.url);
const Cur = require(join(ROOT, "quant/engines/technical/projection/explore-curation.js"));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; };
const file = process.argv[2], OUT = arg("out", null), TITLES = (arg("titles", "SE,OSCR,VTEX,XPEV,CGC") || "").split(",").filter(Boolean);
const policy = arg("policy", null) ? JSON.parse(arg("policy")) : Cur.POLICY;
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const add = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => (typeof b[1] === "number" ? b[1] - a[1] : 0)));
const quant = (arr, q) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return Math.round(a[Math.min(a.length - 1, Math.floor(q * a.length))] * 1000) / 1000; };
const rankPctOf = (c) => (c.rank + 1) / c.pool;
const rankBucket = (p) => (p <= 0.1 ? "<=10%" : p <= 0.25 ? "10-25%" : "25-50%");
const moveBucket = (v) => (v < 0.5 ? "<50%" : v < 1 ? "50-100%" : v < 2.5 ? "100-250%" : v < 5 ? "250-500%" : v < 10 ? "500-1000%" : ">1000%");
const zoneMid = (c, tier) => { const z = c.zones.find((x) => x.tier === tier); return z ? (z.low + z.high) / 2 : null; };
const w1Bucket = (w) => (w < 26 ? "<26 Wochen" : w < 52 ? "26-51 Wochen" : w < 104 ? "52-103 Wochen" : ">=104 Wochen");
const setOf = (c) => c.failed.slice().sort().join("+");
const setKey = (c) => (c.failed.length >= 3 ? "3+ Leitplanken" : setOf(c));

const R = { generatedFrom: file, titles: rows.length };
const withPool = rows.filter((r) => r.pool > 0);
R.pool = { titlesWithPool: withPool.length, titlesWithEligible: rows.filter((r) => r.cands.length).length, eligibleTotal: rows.reduce((n, r) => n + r.cands.length, 0), reasons: {} };
rows.forEach((r) => { if (r.reason) add(R.pool.reasons, r.reason); });
R.pool.reasons = sortObj(R.pool.reasons);

/* ---- Vorher: breite Auswahl (Explore Elliott 1.0.0), wie sie veroeffentlicht war */
const legacyTitles = rows.filter((r) => (r.legacyShown || []).length);
R.before = { titlesWithExplore: legacyTitles.length, shareOfTitles: pct(legacyTitles.length, rows.length), theses: legacyTitles.reduce((n, r) => n + r.legacyShown.length, 0),
             perTitle: {}, byType: {}, byDirection: {} };
legacyTitles.forEach((r) => { add(R.before.perTitle, r.legacyShown.length); r.legacyShown.forEach((x) => { add(R.before.byType, x.type); add(R.before.byDirection, x.dir); }); });

/* ---- 1 Pool-Verteilungen */
const all = [], tagged = [];
rows.forEach((r) => r.cands.forEach((c) => { const x = Object.assign({ t: r.t, trend: r.trend && r.trend.state, rs: r.rs, vote: r.structureVote, close: r.close, inLegacy: (r.legacy || []).includes(c.rank) }, c); all.push(x); }));
R.candidates = { total: all.length, byType: {}, byDirection: {}, byPattern: {}, rankPct: {}, w1: {}, failedCount: {} };
all.forEach((c) => { add(R.candidates.byType, c.type); add(R.candidates.byDirection, c.direction); add(R.candidates.byPattern, c.pattern); add(R.candidates.rankPct, rankBucket(rankPctOf(c))); add(R.candidates.w1, w1Bucket(c.w1Weeks)); add(R.candidates.failedCount, String(c.failed.length)); });

/* ---- 2 Matrix verfehlter Leitplanken */
const KEYS = ["G2", "G3", "G4", "G5", "G2+G3", "G2+G4", "G2+G5", "G3+G4", "G3+G5", "G4+G5", "3+ Leitplanken"];
R.matrix = Object.fromEntries(KEYS.map((k) => [k, { candidates: 0, shareOfPool: 0, waveType: {}, direction: {}, rankPct: { median: null, p25: null, p75: null, le10: 0, le25: 0 }, inBroadExplore: 0, titles: 0 }]));
const perKeyTitles = Object.fromEntries(KEYS.map((k) => [k, new Set()])), perKeyRanks = Object.fromEntries(KEYS.map((k) => [k, []]));
all.forEach((c) => { const k = setKey(c), m = R.matrix[k]; if (!m) return; m.candidates++; add(m.waveType, c.type); add(m.direction, c.direction); const p = rankPctOf(c); perKeyRanks[k].push(p); if (p <= 0.1) m.rankPct.le10++; if (p <= 0.25) m.rankPct.le25++; if (c.inLegacy) m.inBroadExplore++; perKeyTitles[k].add(c.t); });
KEYS.forEach((k) => { const m = R.matrix[k]; m.shareOfPool = pct(m.candidates, all.length); m.titles = perKeyTitles[k].size; m.rankPct.median = quant(perKeyRanks[k], 0.5); m.rankPct.p25 = quant(perKeyRanks[k], 0.25); m.rankPct.p75 = quant(perKeyRanks[k], 0.75); });

/* ---- 3 Welle-3-Audit (alle laufenden regelkonformen Welle-3-Lesarten des Pools) */
const w3 = [];
rows.forEach((r) => (r.wave3 || []).forEach((c) => w3.push(Object.assign({ t: r.t, trend: r.trend && r.trend.state, rs: r.rs, vote: r.structureVote, status: r.status, splitRes: r.splitRes }, c))));
R.wave3 = { runningValid: w3.length, titles: new Set(w3.map((c) => c.t)).size, byDirection: {}, shownAsPrimaryOrAlternative: w3.filter((c) => c.shown).length, rankBucket: {}, failedSet: {}, inTop25: w3.filter((c) => rankPctOf(c) <= 0.25).length, inTop25NoFailedGate: w3.filter((c) => rankPctOf(c) <= 0.25 && !c.failed.length && !c.shown).length };
w3.forEach((c) => { add(R.wave3.byDirection, c.direction); add(R.wave3.rankBucket, rankPctOf(c) <= 0.1 ? "<=10%" : rankPctOf(c) <= 0.25 ? "10-25%" : rankPctOf(c) <= 0.5 ? "25-50%" : ">50%"); add(R.wave3.failedSet, c.failed.length ? setKey(c) : "keine"); });

/* ---- 4 Kuratierung */
const toInput = (r, c, k) => {
  const dir = c.direction === "UP" ? 1 : -1, tr = r.trend && r.trend.state, ext = zoneMid(c, "EXTENDED") || zoneMid(c, "BASE");
  return { id: r.t + "#" + k, t: r.t, type: c.type, pattern: c.pattern, variant: c.variant, direction: c.direction, failed: c.failed, rank: c.rank, pool: c.pool, w1Weeks: c.w1Weeks, mid: ext,
           zones: c.zones, close: c.close, invalidation: c.invalidation,
           ctx: { trendAligned: tr === "UP" || tr === "DOWN" ? (tr === "UP") === (dir > 0) : null,
                  structureAligned: typeof r.structureVote === "number" ? (r.structureVote * dir >= 0.5 ? true : r.structureVote * dir <= -0.5 ? false : null) : null } };
};
const sim = (pol) => {
  const out = { titlesWithHighlights: 0, highlights: 0, perTitle: { 0: 0, 1: 0, 2: 0 }, byType: {}, byDirection: {}, failedSet: {}, rankPct: { "<=10%": 0, "10-25%": 0, "25-50%": 0 }, w1: {}, contextAgreement: {}, extended: {}, extreme: {}, candidatesTotal: 0, titlesWithCandidates: 0, titlesCandidatesOnly: 0, candidatesPerTitle: {}, list: [] };
  rows.forEach((r) => {
    const inputs = r.cands.map((c, k) => toInput(r, c, k)), cur = Cur.curate(inputs, pol);
    out.perTitle[cur.highlights.length]++;
    if (cur.highlights.length) out.titlesWithHighlights++;
    cur.highlights.forEach((h) => {
      out.highlights++; add(out.byType, h.type); add(out.byDirection, h.direction); add(out.failedSet, Cur.failedSet(h)); add(out.rankPct, rankBucket(Cur.rankPct(h))); add(out.w1, w1Bucket(h.w1Weeks)); add(out.contextAgreement, String(Cur.contextAgreement(h)));
      const m = (tier) => { const z = h.zones.find((x) => x.tier === tier); return z ? Math.abs((z.low + z.high) / 2 / h.close - 1) : null; }, e = m("EXTENDED"), x = m("EXTREME");
      if (e !== null) add(out.extended, h.direction + " " + moveBucket(e)); if (x !== null) add(out.extreme, h.direction + " " + moveBucket(x));
      out.list.push({ t: h.t, type: h.type, direction: h.direction, failed: h.failed.join("+"), rank: h.rank + 1, pool: h.pool, w1: h.w1Weeks });
    });
    if (cur.candidates.length) { out.titlesWithCandidates++; out.candidatesTotal += cur.candidates.length; add(out.candidatesPerTitle, cur.candidates.length); if (!cur.highlights.length) out.titlesCandidatesOnly++; }
  });
  out.shareOfTitles = pct(out.titlesWithHighlights, rows.length); out.meanPerTitleWithHighlight = out.titlesWithHighlights ? Math.round((out.highlights / out.titlesWithHighlights) * 100) / 100 : 0;
  out.medianPerTitle = 0;
  return out;
};
R.policy = policy;
R.curated = sim(policy);

/* ---- Empfindlichkeit (nur Zaehlungen, nie Auswahlkriterium): was aendert sich, wenn ein einzelner Baustein gelockert wird? */
const variant = (mut) => { const p = JSON.parse(JSON.stringify(policy)); mut(p); return p; };
const brief = (s) => ({ titles: s.titlesWithHighlights, shareOfTitles: s.shareOfTitles, highlights: s.highlights, perTitle: s.perTitle });
R.sensitivity = {
  base: brief(R.curated),
  rankMax_25_all: brief(sim(variant((p) => { p.highlight.rankMax = { WAVE_3: 0.25, WAVE_5: 0.25, WAVE_C: 0.25 }; }))),
  rankMax_10_all: brief(sim(variant((p) => { p.highlight.rankMax = { WAVE_3: 0.10, WAVE_5: 0.10, WAVE_C: 0.10 }; }))),
  rankMax_50_all: brief(sim(variant((p) => { p.highlight.rankMax = { WAVE_3: 0.5, WAVE_5: 0.5, WAVE_C: 0.5 }; }))),
  plusG3Only: brief(sim(variant((p) => { p.highlight.allowedFailedSets = p.highlight.allowedFailedSets.concat(["G3"]); }))),
  plusG4Only: brief(sim(variant((p) => { p.highlight.allowedFailedSets = p.highlight.allowedFailedSets.concat(["G4"]); }))),
  plusG2G5: brief(sim(variant((p) => { p.highlight.allowedFailedSets = p.highlight.allowedFailedSets.concat(["G2+G5"]); }))),
  onlyG5: brief(sim(variant((p) => { p.highlight.allowedFailedSets = ["G5"]; }))),
  onlyG2: brief(sim(variant((p) => { p.highlight.allowedFailedSets = ["G2"]; })))
};

/* ---- 5 Referenztitel */
R.reference = {};
for (const t of TITLES) {
  const r = rows.find((x) => x.t === t); if (!r) { R.reference[t] = null; continue; }
  const inputs = r.cands.map((c, k) => toInput(r, c, k)), cur = Cur.curate(inputs, policy);
  R.reference[t] = { close: r.close, trend: r.trend && r.trend.state, rs: r.rs, status: r.status, primary: r.primary, alternative: r.alternative, motive: r.motive, pool: r.pool, eligible: r.cands.length, reason: r.reason,
    highlights: cur.highlights.map((h) => ({ type: h.type, dir: h.direction, failed: h.failed, rankPct: Math.round(Cur.rankPct(h) * 1000) / 10, rank: h.rank + 1 })),
    candidates: cur.candidates.map((h) => ({ type: h.type, dir: h.direction, failed: h.failed, rankPct: Math.round(Cur.rankPct(h) * 1000) / 10, rank: h.rank + 1, why: cur.decisions[h.id].why })),
    wave3: (r.wave3 || []).map((c) => ({ dir: c.direction, rank: c.rank + 1, pool: c.pool, rankPct: Math.round(rankPctOf(c) * 1000) / 10, failed: c.failed, shown: c.shown, w1: c.w1Weeks, inv: c.invalidation, zones: c.zones.map((z) => [z.tier, Math.round(z.low * 100) / 100, Math.round(z.high * 100) / 100]) })).sort((a, b) => a.rank - b.rank).slice(0, 8),
    broadExplore: r.legacyShown || [] };
}

if (OUT) {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "explore-curation-audit.json"), JSON.stringify(R, null, 1));
  /* Welle-3-Tabelle: jede laufende regelkonforme Welle-3-Lesart im oberen Viertel des Pools (alle anderen stehen nur in den Summen) */
  const head = "symbol,direction,wave,pattern,w1Weeks,rankPct,rank,pool,failed,close,base,extended,extreme,invalidation,trend,rs26,structureVote,shown,splitResolution\n";
  const z = (c, t) => { const x = c.zones.find((q) => q.tier === t); return x ? x.low + ".." + x.high : ""; };
  writeFileSync(join(OUT, "wave3-top-quartile.csv"), head + w3.filter((c) => rankPctOf(c) <= 0.25).sort((a, b) => a.t.localeCompare(b.t) || a.rank - b.rank)
    .map((c) => [c.t, c.direction, c.wave, c.pattern, c.w1Weeks, Math.round(rankPctOf(c) * 1000) / 10, c.rank + 1, c.pool, c.failed.join("+"), c.close, z(c, "BASE"), z(c, "EXTENDED"), z(c, "EXTREME"), c.invalidation, c.trend, c.rs === null || c.rs === undefined ? "" : Math.round(c.rs * 1000) / 1000, c.vote, c.shown, c.splitRes || ""].join(",")).join("\n") + "\n");
}
console.log(JSON.stringify(R, null, 1));
