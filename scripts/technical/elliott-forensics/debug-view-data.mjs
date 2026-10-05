#!/usr/bin/env node
/* Daten fuer die Impuls-Debug-Ansicht (Mission VI §30, §67, §68): je geoeffnetem Practitioner-Fall (Holdouts versiegelt)
   Schlusskurse aus den OEFFENTLICHEN VU-Reihen (discover-series-long / multi-asset, bereits im Repository), Pool-Pivots,
   VU-Hauptzaehlung, beste Impulslesart (praktikernah, sonst beste) mit Rangabstand je Komponente, die fuenf besten
   Kandidaten und die Forensik-Zaehler. Keine lizenzierten OHLC-Rohdaten.
   node scripts/technical/elliott-forensics/debug-view-data.mjs */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { openedCases, practitionerClass, caseBars, seriesFrom, runV3, candidateReadings, sourceFamilyOf, ROOT, EV3 } from "./lib.mjs";
import { COMPONENT_CLASS } from "./taxonomy.mjs";

const W = EV3.DEFAULTS.weights, WINDOW = 260;
const out = { schemaVersion: "vu-elliott-impulse-debug-1.0.0", generatedAt: new Date().toISOString(), engine: EV3.ENGINE_VERSION, weights: W, componentClass: COMPONENT_CLASS,
  label: "INTERN · Forschung · PRACTITIONER REFERENCE, NOT OBJECTIVE GROUND TRUTH · Schlusskurse (Produktionseingang)", cases: [] };
for (const r of openedCases().rows) {
  const pc = practitionerClass(r), cb = caseBars(r);
  if (cb.status !== "OK") { out.cases.push({ referenceId: r.referenceId, status: cb.status }); continue; }
  const s = seriesFrom(cb.bars, cb.tf), res = runV3(s, cb.tf, { forensics: true, debugAll: true });
  const from = Math.max(0, cb.bars.length - WINDOW), rd = candidateReadings(res, s), all = res.trace.allCands;
  const pts = (c) => c.pts.map((i) => ({ i: i - from, date: cb.bars[i][0], price: cb.bars[i][1] })).filter((p) => p.i >= 0);
  const cand = (pos, why) => { const c = all[pos], rr = rd[pos]; const gaps = {}; for (const k of Object.keys(W)) if (W[k]) gaps[k] = +(W[k] * ((all[0].c[k] ?? 0.5) - (c.c[k] ?? 0.5))).toFixed(3);
    return { pos, why, type: c.type, complete: c.complete, currentLabel: rr.currentLabel, currentDir: rr.currentDir, points: pts(c), components: Object.fromEntries(Object.entries(c.c).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(3) : v])), gapToTop: gaps,
             subdivisions: c.subs.map((w) => ({ bars: w.to - w.from, status: w.st, pattern: w.p })) }; };
  const like = rd.find((c) => c.type === "IMPULSE" && !c.complete && c.currentLabel === pc.currentWave && c.currentDir === pc.direction), imp = rd.find((c) => c.type === "IMPULSE");
  const F = res.trace.forensics;
  out.cases.push({ referenceId: r.referenceId, split: r._split, sourceFamily: sourceFamilyOf(r.sourceId), sourceUrl: r.sourceUrl, vuSymbol: cb.projection.vuSymbol, timeframe: cb.tf, analysisCutoff: r.analysisCutoff, confidence: r.extraction.confidence,
    practitioner: { pattern: pc.pattern, family: pc.family, currentWave: pc.currentWave, direction: pc.direction, state: pc.state, waveStart: r.primary && r.primary.waveStartDate ? { date: r.primary.waveStartDate, price: r.primary.waveStartPrice } : null,
                    invalidation: r.invalidation || null },
    series: cb.bars.slice(from).map(([d, c]) => [d, c]),
    vu: { pattern: res.primary.pattern, complete: !!res.primary.complete, status: res.status, applicability: res.applicability.level, abstainReasons: res.applicability.reasons || [], alternatives: (res.alternatives || []).map((a) => a.pattern) },
    top: all.slice(0, 5).map((_, k) => cand(k, k === 0 ? "VU-Hauptzaehlung" : "Rang " + (k + 1))),
    impulse: like ? cand(like.pos, "praktikernahe Impulslesart") : imp ? cand(imp.pos, "beste Impulslesart (nicht praktikernah)") : null,
    forensics: { impulse: F.byType.IMPULSE || null, impulsePrerank: F.prerank.IMPULSE || null, impulseScoreDrops: F.scoreDrops.IMPULSE || null, impulseFinal: F.final.IMPULSE ? { bestPos: F.final.IMPULSE.bestPos } : null, anchors: F.anchors, truncated: res.trace.truncated, poolPivots: res.trace.poolPivots } });
}
const dir = join(ROOT, "quant/research/elliott-impulse-debug");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "impulse-debug-data.json"), JSON.stringify(out));
console.log(out.cases.length, "Faelle");
