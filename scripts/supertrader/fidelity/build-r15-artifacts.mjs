#!/usr/bin/env node
// Supertrader R15 – erzeugt die R15-Artefakte reproduzierbar aus den kanonischen Regelbüchern (canonical/*.json),
// den expliziten Portfolio-Policies, den geteilten Regeln, den Produktklassen und den Audit-Eingaben (audit/*.json).
//   node scripts/supertrader/fidelity/build-r15-artifacts.mjs
// Ausgabe: scripts/supertrader/fidelity/R15-{CANONICAL-RULES,RULE-PROVENANCE,FIDELITY-MATRIX,STRATEGY-GAPS}.json
// (R15-MIGRATION-PLAN.json wird von Hand gepflegt und hier nur auf Vollständigkeit geprüft.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVENANCE, CORE_AREAS, CLAIM_BLOCKING, PRODUCT_CLASS } from './taxonomy.mjs';
import { PORTFOLIO_POLICIES, blockingFields } from './portfolio-policy.mjs';
import { SHARED_RULES, SHARED_RULE_PROVENANCE } from './shared-rules.mjs';
import { LIVE_CLASSIFICATION } from './product-classes.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
export const RULEBOOKS = Object.freeze({ MOMENTUM_BREAKOUT: 'kullamagi', WEINSTEIN_STAGE: 'weinstein', DARVAS_BOX: 'darvas', MINERVINI_VCP: 'minervini', DONCHIAN_TURTLE: 'turtle' });
const SCHEMA = 'supertrader-r15-1.0.0';

// Alle Regeln eines Regelbuchs, unabhängig davon, ob es nach Systemen, Setups oder Produkten gegliedert ist.
export function rulesOf(book) {
  const out = [];
  if (Array.isArray(book.rules)) for (const r of book.rules) out.push({ subsystem: 'MAIN', ...r });
  for (const key of ['systems', 'setups', 'products']) if (book[key]) for (const [sub, v] of Object.entries(book[key])) {
    const rs = Array.isArray(v) ? v : v?.rules; if (Array.isArray(rs)) for (const r of rs) out.push({ subsystem: sub, ...r });
  }
  return out;
}
// Live-Herkunft je Regelbuch (Darvas gliedert nach System).
export function liveProvenanceOf(book, id) {
  const lp = book.liveProvenance;
  if (Array.isArray(lp)) return lp;
  if (lp && typeof lp === 'object') { const k = Object.keys(lp).find((x) => x.startsWith(id === 'VU_TREND_52W' ? 'VU_TREND' : id)); return k ? lp[k] : []; }
  return [];
}
// Zusammengesetzte Angaben (z. B. „ORIGINAL (0,5 %) / VU_OWN (10 Plätze)“) → strengste enthaltene Klasse; Detail bleibt erhalten.
const STRICT = ['UNRESOLVED', 'FOREIGN_RULE', 'VU_OWN', 'NOT_PUBLIC', 'VU_FORMALIZATION', 'ORIGINAL_INTERPRETATION', 'ORIGINAL'];
export function normClass(c) {
  const s = String(c || '');
  const alias = { DARVAS_ORIGINAL: 'ORIGINAL', TRADERFOX: 'FOREIGN_RULE', OTHER: 'FOREIGN_RULE', VU: 'VU_OWN' };
  if (alias[s]) return alias[s];
  const tokens = s.replace(/VU-Bedingung/g, 'VU_FORMALIZATION').match(/ORIGINAL_INTERPRETATION|VU_FORMALIZATION|FOREIGN_RULE|NOT_PUBLIC|UNRESOLVED|VU_OWN|ORIGINAL/g) || [];
  for (const k of STRICT) if (tokens.includes(k)) return k;
  return 'UNRESOLVED';
}

export function build() {
  const books = Object.fromEntries(Object.entries(RULEBOOKS).map(([id, f]) => [id, read(`canonical/${f}.json`)]));
  const textAudit = read('audit/live-text-audit.json'), fund = read('audit/fundamentals-matrix.json');

  // 1 Kanonische Regeln
  const canonical = { schema: SCHEMA, kind: 'CANONICAL_RULES', note: 'Layer A (kanonisch) und B (Formalisierung) je Methode; Herkunftsklassen nach fidelity/taxonomy.mjs. Bücher ohne Abruf: Belegstärke höchstens MEDIUM.', strategies: {} };
  for (const [id, b] of Object.entries(books)) {
    const rules = rulesOf(b);
    const byClass = {}; for (const r of rules) byClass[r.provenanceClass] = (byClass[r.provenanceClass] || 0) + 1;
    canonical.strategies[id] = { rulebookVersion: b.rulebookVersion, file: `scripts/supertrader/fidelity/canonical/${RULEBOOKS[id]}.json`, ruleCount: rules.length, byProvenanceClass: byClass, rules };
  }
  const t52 = books.DARVAS_BOX.systems?.VU_TREND_52W;
  if (t52) canonical.strategies.VU_TREND_52W = { rulebookVersion: 'vu-trend-52w-canonical-1.0.0', file: 'scripts/supertrader/fidelity/canonical/darvas.json#systems.VU_TREND_52W', ruleCount: (t52.rules || []).length, rules: (t52.rules || []).map((r) => ({ subsystem: 'VU_TREND_52W', ...r })) };

  // 2 Regelherkunft der Live-Versionen (Signal-Komponenten + Portfolio-Policy + geteilte Regeln)
  const provenance = { schema: SCHEMA, kind: 'RULE_PROVENANCE', strategies: {} };
  for (const id of [...Object.keys(books), 'VU_TREND_52W']) {
    const book = id === 'VU_TREND_52W' ? books.DARVAS_BOX : books[id];
    const comps = liveProvenanceOf(book, id).map((c) => ({ layer: 'A/B', component: c.component, provenance: normClass(c.classification), classificationDetail: c.classification, codeLocation: c.codeLocation, note: c.note || null }));
    const pol = PORTFOLIO_POLICIES[id];
    if (pol) for (const [k, v] of Object.entries(pol.fields)) comps.push({ layer: 'C', component: `portfolio.${k}`, provenance: v.provenance, value: v.value, source: v.source, note: v.note, implicitDefault: (pol.implicitDefaults || []).includes(k) });
    const sh = SHARED_RULE_PROVENANCE[id];
    if (sh) for (const r of SHARED_RULES) comps.push({ layer: 'C', component: `shared.${r.id}`, provenance: sh[r.id].provenance, module: r.module, rule: r.rule, note: sh[r.id].note });
    const counts = {}; for (const c of comps) counts[c.provenance] = (counts[c.provenance] || 0) + 1;
    provenance.strategies[id] = { liveVersion: LIVE_CLASSIFICATION[id]?.version, components: comps, counts, foreignOrUnresolved: comps.filter((c) => c.provenance === PROVENANCE.FOREIGN_RULE || c.provenance === PROVENANCE.UNRESOLVED).map((c) => c.component) };
  }

  // 3 Fidelity-Matrix mit Hard Gate (R15 Abschnitt 29)
  const matrix = { schema: SCHEMA, kind: 'FIDELITY_MATRIX', note: 'Interner, nicht marketingfähiger Score. REPLICATION_CLAIM_ALLOWED nur, wenn Entry/Exit/Sizing/Portfolio/Risk (bei Fundamentalmethoden zusätzlich Fundamental) HIGH sind und kein Kernbereich eine Fremd-/VU-/ungeklärte Regel enthält.', strategies: {} };
  const fundamentalMethods = new Set(['MINERVINI_VCP', 'DARVAS_BOX']);
  for (const [id, c] of Object.entries(LIVE_CLASSIFICATION)) {
    const f = c.fidelity, risk = f.exit === 'HIGH' && f.sizing === 'HIGH' ? 'HIGH' : f.exit === 'LOW' || f.sizing === 'LOW' ? 'LOW' : 'MEDIUM';
    const areas = { ...f, risk };
    const need = [...CORE_AREAS, ...(fundamentalMethods.has(id) ? ['fundamental'] : [])];
    const block = (PORTFOLIO_POLICIES[id] ? blockingFields(id) : []).filter((b) => CLAIM_BLOCKING.has(b.provenance));
    const gateFails = need.filter((a) => areas[a] !== 'HIGH');
    const allowed = c.productClass === PRODUCT_CLASS.REPLICATION && !gateFails.length && !block.length;
    if (allowed !== c.replicationClaimAllowed) throw new Error(`${id}: Claim-Flag widerspricht dem Hard Gate`);
    matrix.strategies[id] = { liveVersion: c.version, productClass: c.productClass, displayName: c.displayName, fidelity: areas, originalFidelityOverall: c.overall, overallNote: c.overallNote, hardGate: { required: need, notHigh: gateFails, blockingPortfolioFields: block }, REPLICATION_CLAIM_ALLOWED: allowed };
  }

  // 4 Lücken je Strategie
  const gaps = { schema: SCHEMA, kind: 'STRATEGY_GAPS', strategies: {}, liveText: textAudit.summary, fundamentals: { datasets: fund.datasets.map((d) => ({ id: d.id, path: d.path, pointInTime: d.pointInTime ?? null, usedBy: d.usedBy ?? d.usedByStrategies ?? null, live: d.live ?? null })), sepaCoverage: fund.sepaCoverage, summary: fund.summary } };
  for (const [id, b] of Object.entries(books)) {
    const rules = rulesOf(b);
    gaps.strategies[id] = {
      answers: b.answers,
      critical: rules.filter((r) => r.severity === 'CRITICAL').map((r) => ({ ruleId: r.ruleId, rule: r.rule, deviation: r.deviation, decision: r.decision })),
      high: rules.filter((r) => r.severity === 'HIGH').map((r) => ({ ruleId: r.ruleId, rule: r.rule, deviation: r.deviation, decision: r.decision })),
      missingInCode: rules.filter((r) => r.vuImplementation === 'nein' && (r.provenanceClass === PROVENANCE.ORIGINAL || r.provenanceClass === PROVENANCE.ORIGINAL_INTERPRETATION)).map((r) => r.ruleId),
      foreignRules: rules.filter((r) => r.provenanceClass === PROVENANCE.FOREIGN_RULE).map((r) => ({ ruleId: r.ruleId, rule: r.rule })),
      liveTextMismatches: textAudit.statements.filter((s) => s.method === id && (s.matchesCode === false || s.matchesLiveVersion === false)).map((s) => ({ id: s.id, file: s.file, severity: s.severity, text: s.text })),
    };
  }
  return { canonical, provenance, matrix, gaps };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const out = build();
  const w = (name, obj) => fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 1) + '\n');
  w('R15-CANONICAL-RULES.json', out.canonical); w('R15-RULE-PROVENANCE.json', out.provenance); w('R15-FIDELITY-MATRIX.json', out.matrix); w('R15-STRATEGY-GAPS.json', out.gaps);
  console.log('R15-Artefakte geschrieben:', Object.fromEntries(Object.entries(out.canonical.strategies).map(([k, v]) => [k, v.ruleCount])));
}
