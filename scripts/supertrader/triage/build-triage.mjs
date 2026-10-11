#!/usr/bin/env node
// Portfolio Triage: erzeugt die strukturierten Artefakte aus Dossiers, Standardmessung (nur oeffentliche Klassen) und Tier-Entscheidungen.
// Reine Ableitung, keine Messung, keine Live-Aenderung. Nutzung: node build-triage.mjs [--out DIR] (Standard: dieses Verzeichnis)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = arg('--out', here);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const prereg = readJson(path.join(here, 'PREREGISTRATION-TRIAGE.json'));
const std = readJson(path.join(here, 'STANDARD-FRAME-PUBLIC.json'));
const dec = readJson(path.join(here, 'TIER-DECISIONS.json'));
const W = prereg.tieringRules.weights;

const dossiers = Object.fromEntries(fs.readdirSync(path.join(here, 'dossiers')).filter((f) => f.endsWith('.json')).map((f) => { const d = readJson(path.join(here, 'dossiers', f)); return [d.strategy_id, d]; }));

export const MAP = {
  rating: { HIGH: 1, MEDIUM: 0.6, LOW: 0.25, NOT_REPRODUCIBLE: 0 },
  signal: { POSITIVE: 1, NEUTRAL: 0.5, NEGATIVE: 0, UNKNOWN: null },
  portfolio: { ABOVE: 1, SIMILAR: 0.6, BELOW: 0.2 },
  drawdown: { SHALLOWER: 1, SIMILAR: 0.6, DEEPER: 0.2 },
};
// Amendment A2 (nach Ergebnis): NEGATIVE = 0, NEUTRAL = 0,3 pauschal (Vorzeichen der Segmente oeffentlich unbekannt, kein belegtes stabiles Vorzeichen), POSITIVE = Konsistenzanteil.
export function robustness(m) { if (!m) return null; if (m.signalEdge63 === 'NEGATIVE' || m.signalEdge63 === 'UNKNOWN') return 0; if (m.signalEdge63 === 'NEUTRAL') return 0.3; return m.regimeSegmentsN30 ? m.regimeConsistentN30 / m.regimeSegmentsN30 : 0; }
export function components(d, m) {
  const src = MAP.rating[d.source_audit?.source_fidelity], impl = MAP.rating[d.implementation_fidelity?.rating];
  const fidelity = (src + impl) / 2 - (d.implementation_fidelity?.shared_default_penalty ? 0.1 : 0);
  return {
    signalQuality: m ? MAP.signal[m.signalEdge63] : null,
    portfolioEvidence: m ? MAP.portfolio[m.portfolioVsSpy] : null,
    robustness: m ? robustness(m) : null,
    fidelity: Math.max(0, fidelity),
    dataQuality: MAP.rating[d.data?.sufficiency],
    riskProfile: m ? MAP.drawdown[m.drawdownVsSpy] : null,
    productPotential: MAP.rating[d.product_potential?.rating],
  };
}
export function score(c) {
  let s = 0, w = 0; for (const [k, wt] of Object.entries(W)) { if (c[k] == null) continue; s += wt * c[k]; w += wt; }
  return { score: w ? Math.round((s / w) * 1000) / 1000 : null, weightCovered: Math.round(w * 100) / 100, basis: w >= 0.999 ? 'FULL' : 'PARTIAL_NO_MEASUREMENT_RENORMALIZED' };
}

const rows = [];
for (const [id, t] of Object.entries(dec.methods)) {
  const d = dossiers[id]; if (!d) throw new Error(`Dossier fehlt: ${id}`);
  const m = std.methods[id] || null, c = components(d, m), sc = score(c);
  rows.push({ id, name: d.method_name, group: d.group, engineStatus: d.engine?.status, liveVersion: d.engine?.live_version,
    sourceFidelity: d.source_audit?.source_fidelity, implementationFidelity: d.implementation_fidelity?.rating, sharedDefaultPenalty: !!d.implementation_fidelity?.shared_default_penalty,
    dataSufficiency: d.data?.sufficiency, fundamentalDependency: d.data?.fundamental_dependency,
    measured: !!m, standardMeasurement: m ? { signalEdge63: m.signalEdge63, portfolioVsSpy: m.portfolioVsSpy, drawdownVsSpy: m.drawdownVsSpy, exposureClass: m.exposureClass, regime: `${m.regimeConsistentN30}/${m.regimeSegmentsN30}`, trades: m.takenTrades } : null,
    criticalImplementationErrors: d.critical_implementation_errors || [], provenance: d.provenance,
    components: c, internalScore: sc, tier: t.tier, confidence: t.confidence, deepDive: t.deepDive, forwardPriority: t.forwardPriority, validationClass: t.validationClass,
    productRecommendation: t.productRecommendation, distinctEdge: t.distinctEdge, reasons: t.reasons, dossierPreliminaryTier: d.preliminary_tier, seenData: true });
}
const tiers = Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, rows.filter((r) => r.tier === k).map((r) => r.id)]));
const common = { generatedBy: 'build-triage.mjs', prereg: prereg.schema, standardRun: { run: std.run, commit: std.commit, dataFingerprint: std.dataFingerprint, window: std.window, seenData: true }, note: 'Research/Triage. Kein Live-Eingriff. Alle Perioden gesehen (SEEN DATA). Teilkomponenten bleiben sichtbar; der interne Score ist ein Ranginstrument.' };
const write = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify({ schema: `supertrader-triage-${name.replace(/^SUPERTRADER-|\.json$/g, '').toLowerCase()}-1.0.0`, ...common, ...obj }, null, 2) + '\n');

write('SUPERTRADER-METHOD-MATRIX.json', { methods: rows.map((r) => ({ id: r.id, name: r.name, fidelity: { source: r.sourceFidelity, implementation: r.implementationFidelity, sharedDefaultPenalty: r.sharedDefaultPenalty }, signalEdge: r.standardMeasurement?.signalEdge63 || 'NOT_MEASURED', portfolio: r.standardMeasurement?.portfolioVsSpy || 'NOT_MEASURED', risk: r.standardMeasurement?.drawdownVsSpy || 'NOT_MEASURED', exposure: r.standardMeasurement?.exposureClass || 'NOT_MEASURED', robustness: r.standardMeasurement?.regime || 'UNKNOWN', data: r.dataSufficiency, confidence: r.confidence, tier: r.tier, components: r.components, internalScore: r.internalScore })) });
write('SUPERTRADER-TIERING.json', { tierCounts: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.length])), tiers, rules: dec.rules, methods: rows.map((r) => ({ id: r.id, tier: r.tier, confidence: r.confidence, validationClass: r.validationClass, productRecommendation: r.productRecommendation, reasons: r.reasons, dossierPreliminaryTier: r.dossierPreliminaryTier })), redTeam: dec.redTeam || null, amendmentA2: dec.amendmentA2 || null });
write('SUPERTRADER-DEEP-DIVE-CANDIDATES.json', { tierA: tiers.A, statement: tiers.A.length ? 'Tier-A-Kandidaten vorhanden.' : 'Kein Tier-A-Kandidat: keine Methode zeigt im gemeinsamen Rahmen einen datenbasierten Vorteil bei bestandenen Qualitaetsgates. Bedingte Kandidaten sind Beobachtungs-/Klaerungsfragen, keine Empfehlungen.', conditionalCandidates: rows.filter((r) => r.deepDive === 'CONDITIONAL' || r.deepDive === 'BLOCKED_BY_DATA').map((r) => ({ id: r.id, deepDive: r.deepDive, forwardPriority: r.forwardPriority, distinctEdge: r.distinctEdge, why: r.reasons })), lowPriority: rows.filter((r) => r.tier === 'C' || r.tier === 'D').map((r) => ({ id: r.id, tier: r.tier, why: r.reasons })) });
write('SUPERTRADER-FIDELITY-SUMMARY.json', { methods: rows.map((r) => ({ id: r.id, provenance: r.provenance, sourceFidelity: r.sourceFidelity, implementationFidelity: r.implementationFidelity, sharedDefaultPenalty: r.sharedDefaultPenalty, criticalImplementationErrors: r.criticalImplementationErrors })) });
write('SUPERTRADER-METHOD-OVERLAP.json', { window: std.window, pairs: std.pairs, classThresholds: { overlap: prereg.publicClassThresholds.overlapClass, returnCorrelation: prereg.publicClassThresholds.returnCorrelationClass }, caveats: std.interpretationLimits, redundancy: 'NICHT BESTIMMBAR. Alle 15 Paare LOW, aber der Jaccard ist durch das Groessenverhaeltnis der Signalmengen begrenzt (fuer 9 von 15 Paaren LOW erzwungen, HIGH fuer 14 von 15 unmoeglich); die Depotkorrelation ist ausreisserempfindlich. Auch ein echtes LOW waere kein Diversifikationsbeleg ohne Edge.' });
console.log(JSON.stringify({ tierCounts: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.length])), ranking: rows.filter((r) => r.measured).sort((a, b) => b.internalScore.score - a.internalScore.score).map((r) => [r.id, r.internalScore.score]) }));
