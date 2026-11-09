#!/usr/bin/env node
'use strict';
// Survivorship-Sensitivitaet fuer PATTERN_EVIDENCE und SIGNAL_BACKTEST (P3.1, survivorship-sensitivity-1.0.0).
//
// Was: dieselbe Auswahl zweimal mit dem bestehenden Research-Runner (backtest-runner.cjs, unveraendert):
//   1. Ueberlebende   Profil V10_LIFECYCLE (= V13-Rahmen F0: identity + CA + lifecycle evidence, nur ref_-Listings)
//   2. mit Delisteten Profil V13_DELISTED_F1 (F0 + QUALIFIED-Reihen aus docs/quant-recovery/v13/delisted/register-1.0.0.json),
//                     wahlweise F1C (zusaetzlich zensierte Enden) oder V13B_DELISTED_F1W (Register 1.1.0, letzter Balken neu)
// Beide Laeufe ziehen ihre Population mit derselben Stichprobe (Hash-Reihenfolge ueber die Rahmen-IDs, gleicher Seed,
// gleiche Groesse) aus dem jeweiligen Rahmen. Weil die Reihenfolge nur von der ID abhaengt, sind die Ueberlebenden des
// zweiten Laufs genau die ersten Ueberlebenden des ersten; die delisteten Listings ersetzen die letzten. Der Anteil
// delisteter Titel entspricht damit ihrem Anteil im Rahmen (keine Uebergewichtung). Ausgewiesen werden beide
// Ergebnisse, die Differenzen und die Ereignisse aus delisteten Reihen getrennt.
//
// Was nicht: keine neue Engine, kein neues Gate, keine Aenderung an backtest-runner.cjs (CODE_FILES, Demos bleiben
// aktuell). Das Zertifizierungsgate `survivorship` liest diesen Bericht NICHT (P3.3 braucht P3.2 und die Owner-Freigabe
// FV-5). Ereignisse nach dem letzten Handelstag werden wie im Runner zensiert: weder Totalverlust noch Abfindung.
// Die delisteten Reihen liegen nur im privaten R2-Archiv (Teil v13-derived). Ohne --private-delisted endet der zweite
// Lauf im Runner-Zustand B (PRIVATE_DATA_UNAVAILABLE); der Bericht heisst dann PREPARED_PRIVATE_INPUT_MISSING und
// nennt den Freigabeweg. Er enthaelt nie Kursreihen und nie Ereigniszeilen, nur Zaehlungen, Kennzahlen und Hashes.
//
//   node scripts/quant/research/survivorship-sensitivity.cjs --out <bericht.json>
//        [--template <id> ...] [--spec <spec.json> ...] [--frame F1|F1C|F1W] [--sample <n>] [--seed <text>]
//        [--private-delisted <dir>] [--cache <dir>] [--require-private]
// Ohne --template/--spec: die registrierten Vorlagen pattern-2015-sideways und signal-2020-covid.
// Exit 0 mit Bericht; Exit 1 bei --require-private ohne vollstaendige private Reihen; Exit 2 bei Fehlern.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const R = require('./backtest-runner.cjs');
const B = require('./backtest-spec-builder.cjs');
const MH = require('./backtest-metrics-hash.cjs');
const RB = require('./run-backtest.cjs');

const VERSION = 'survivorship-sensitivity-1.0.0';
const KINDS = Object.freeze(['PATTERN_EVIDENCE', 'SIGNAL_BACKTEST']);
const SURVIVOR_PROFILE = 'V10_LIFECYCLE';
const FRAMES = Object.freeze({ F1: 'V13_DELISTED_F1', F1C: 'V13_DELISTED_F1C', F1W: 'V13B_DELISTED_F1W' });
const DEFAULT_TEMPLATES = Object.freeze(['pattern-2015-sideways', 'signal-2020-covid']);
const DEFAULT_SAMPLE = 100; // Werkbudgets der Musterstudie (research-studies BUDGETS: 5e7 Rechenschritte, Abgleich Stichtage × Listings × 200)
const DEFAULT_SEED = 'p3.1-survivorship-sensitivity';
const GENERATED = ['quant/data', 'discover/data', 'supertrader/data', 'social/data'];
const FREIGABE = Object.freeze({
  id: 'FV-5/P3.1',
  privateInput: 'v13-derived (R2-Archiv 1.2.0, Manifest docs/quant-recovery/v13/archive/manifest-1.2.0.json), Secret V13_ARCHIVE_PRIVATE_KEY',
  run: 'Wiederherstellung wie [v13-archive:demos] (r2-restore.mjs --mode extract --parts v13-derived), dann dieses Skript mit --private-delisted <Verzeichnis der Reihen> --require-private; Bericht nur als Artefakt des Laufs, nie die Reihen',
  gate: 'Das Gate survivorship liest den Bericht nicht. Erst P3.2 (Tiingo-Rechte) und P3.3 (Owner-Freigabe) duerften es umverdrahten.'
});

function fail(code, detail) { const e = new Error(code + (detail !== undefined ? ':' + detail : '')); e.code = code; throw e; }
const sha = x => crypto.createHash('sha256').update(typeof x === 'string' ? x : R.canonical(x)).digest('hex');
const clone = x => JSON.parse(JSON.stringify(x));
const num = x => (Number.isFinite(x) ? x : null);
const diff = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? b - a : null);

/** Aus einer registrierten Spezifikation die beiden Laufspezifikationen (nur Population und Methoden aendern sich). */
function sensitivitySpecs(base, { frame = 'F1', sample = DEFAULT_SAMPLE, seed = DEFAULT_SEED } = {}) {
  if (!base || !KINDS.includes(base.kind)) fail('KIND_NOT_SUPPORTED', base && base.kind);
  if (!FRAMES[frame]) fail('FRAME_UNKNOWN', frame);
  if (!Number.isSafeInteger(sample) || sample < 1) fail('SAMPLE_INVALID', sample);
  const strip = s => {
    const x = clone(s);
    // Benannte Titel waeren per Konstruktion Ueberlebende: die Population kommt hier immer aus dem Rahmen.
    delete x.methods; delete x.status;
    // Finanzierte Signal-Laeufe behalten delistete Listings nicht (fundedSchedule, D4 offen): nur je Ereignis.
    if (x.kind === 'SIGNAL_BACKTEST' && x.engine) delete x.engine.funded;
    return x;
  };
  const survivors = strip(base), delisted = strip(base);
  survivors.id = (base.id + '-p31-survivors').slice(0, 120);
  delisted.id = (base.id + '-p31-' + frame.toLowerCase()).slice(0, 120);
  survivors.population = { profile: SURVIVOR_PROFILE, sample: { size: sample, seed } };
  delisted.population = { profile: FRAMES[frame], sample: { size: sample, seed }, privateInputs: ['delistedSeries'] };
  for (const s of [survivors, delisted]) s.description = 'P3.1 Survivorship-Sensitivitaet aus ' + base.id + ' (' + s.population.profile + ', Stichprobe ' + sample + ')';
  R.validateSpec(survivors); R.validateSpec(delisted);
  return { survivors, delisted };
}

/** Kennzahlen eines Runner-Ergebnisses ohne Ereigniszeilen und ohne Reihen. */
function summarizeRun(result, certification) {
  const env = result.envelope, m = env.metrics || {}, ev = env.events || {};
  const violations = RB.checkResult(result, null, certification);
  const out = { profile: result.spec.population.profile, state: result.state, contractViolations: violations,
    specHash: result.specHash, inputHash: result.inputHash, resultHash: result.resultHash, envelopeHash: result.envelopeHash, metricsHash: MH.metricsHash(result) };
  if (result.state !== 'RESEARCH_EXECUTED') {
    out.missing = (result.population && result.population.missing) || (env.limitations || []).filter(l => /^MISSING_INPUT:/.test(l));
    return out;
  }
  const pop = result.population || {};
  const ids = Array.isArray(pop.listings) ? pop.listings.map(l => l.securityId) : null;
  const qa = (result.qa && result.qa.events) || [];
  const dlEvents = qa.filter(e => String(e.securityId).startsWith('dl_'));
  const dlCompleted = dlEvents.filter(e => e.state === 'OBSERVED' && Number.isFinite(e.netReturn));
  out.population = { frameSize: pop.frameSize, listings: ids ? ids.length : (pop.listings && pop.listings.count) || null,
    delistedListings: ids ? ids.filter(x => x.startsWith('dl_')).length : null, idsHash: ids ? sha(ids) : (pop.listings && pop.listings.idsHash) || null,
    excluded: Array.isArray(pop.excluded) ? pop.excluded.length : (pop.excluded && pop.excluded.count) || 0, survivorship: env.dataQuality && env.dataQuality.survivorship ? env.dataQuality.survivorship.state : null,
    terminal: env.dataQuality && env.dataQuality.terminal ? env.dataQuality.terminal.state : null };
  out.events = { occurrences: ev.occurrences ?? null, completed: ev.completed ?? null, immature: ev.immature ?? null, censored: ev.censored ?? null, ineligible: ev.ineligible ?? null, titles: ev.titles ?? null };
  out.perEvent = { n: m.perEvent ? m.perEvent.n : null, mean: m.perEvent ? num(m.perEvent.mean) : null, median: m.perEvent ? num(m.perEvent.median) : null,
    hitRate: num(m.hitRate), meanExcessVsBenchmark: m.excess ? num(m.excess.meanExcess) : null, interval95: env.uncertainty && Array.isArray(env.uncertainty.interval) ? env.uncertainty.interval : null };
  out.fromDelistedSeries = { occurrences: dlEvents.length, completed: dlCompleted.length, censored: dlEvents.filter(e => e.state === 'CENSORED').length,
    meanNetReturn: dlCompleted.length ? dlCompleted.reduce((s, e) => s + e.netReturn, 0) / dlCompleted.length : null };
  return out;
}

function compare(a, b) {
  if (a.state !== 'RESEARCH_EXECUTED' || b.state !== 'RESEARCH_EXECUTED') return null;
  return { meanNetReturn: diff(a.perEvent.mean, b.perEvent.mean), medianNetReturn: diff(a.perEvent.median, b.perEvent.median), hitRate: diff(a.perEvent.hitRate, b.perEvent.hitRate),
    meanExcessVsBenchmark: diff(a.perEvent.meanExcessVsBenchmark, b.perEvent.meanExcessVsBenchmark), completedEvents: diff(a.events.completed, b.events.completed),
    censoredEvents: diff(a.events.censored, b.events.censored), direction: 'mit Delisteten minus nur Ueberlebende' };
}

/** Ein Fall: beide Laeufe, Zusammenfassung, Differenz. options wie runBacktest (privateDirs, cacheDir, deps). */
function runCase(base, cfg = {}, options = {}) {
  const { survivors, delisted } = sensitivitySpecs(base, cfg);
  const certification = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
  const a = summarizeRun(R.runBacktest(survivors, options), certification);
  const b = summarizeRun(R.runBacktest(delisted, options), certification);
  const state = a.state === 'RESEARCH_EXECUTED' && b.state === 'RESEARCH_EXECUTED' ? 'RESEARCH_EXECUTED'
    : (b.missing || []).some(x => /PRIVATE_DATA_(UNAVAILABLE|INCOMPLETE)|PRIVATE_DIR/.test(String(x))) ? 'PREPARED_PRIVATE_INPUT_MISSING' : 'PREPARED_DATA_LIMITED';
  return { template: base.id, kind: base.kind, window: base.window, asOf: base.asOf, costs: base.costs, benchmark: base.benchmark, state,
    survivors: a, withDelisted: b, delta: compare(a, b) };
}

function report(cases, cfg) {
  const states = cases.map(c => c.state);
  const cert = JSON.parse(fs.readFileSync(path.join(ROOT, R.CERTIFICATION_PATH), 'utf8'));
  const body = { schemaVersion: VERSION, runner: R.VERSION, certificationAsOf: cert.asOf, evidenceKind: 'RESEARCH_SENSITIVITY', certification: 'NOT_CERTIFIED', productionApproved: false,
    gateInput: false, claim: 'NO_ALPHA_OR_CERTIFICATION_CLAIM', design: { survivorProfile: SURVIVOR_PROFILE, delistedProfile: FRAMES[cfg.frame || 'F1'], sample: cfg.sample || DEFAULT_SAMPLE, seed: cfg.seed || DEFAULT_SEED,
      rule: 'gleiche Spezifikation, gleiche Hash-Stichprobe aus dem jeweiligen Rahmen; benannte Titel, Methoden und die finanzierte Variante entfallen; Ereignisse nach dem letzten Handelstag zensiert' },
    state: states.every(s => s === 'RESEARCH_EXECUTED') ? 'RESEARCH_EXECUTED' : states.includes('PREPARED_PRIVATE_INPUT_MISSING') ? 'PREPARED_PRIVATE_INPUT_MISSING' : 'PREPARED_DATA_LIMITED',
    cases, freigabe: FREIGABE };
  return { ...body, reportHash: sha(body) };
}

function parse(argv) {
  const o = { templates: [], specs: [] };
  const one = { '--out': 'out', '--frame': 'frame', '--sample': 'sample', '--seed': 'seed', '--private-delisted': 'delisted', '--cache': 'cache' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--require-private') { o.requirePrivate = true; continue; }
    if ((a === '--template' || a === '--spec') && argv[i + 1]) { o[a === '--template' ? 'templates' : 'specs'].push(argv[++i]); continue; }
    const k = one[a];
    if (!k || !argv[i + 1] || o[k] !== undefined) fail('INVALID_ARGUMENTS', a);
    o[k] = argv[++i];
  }
  if (!o.out) fail('OUT_REQUIRED');
  const rel = path.relative(ROOT, path.resolve(o.out));
  if (!rel.startsWith('..') && GENERATED.some(g => rel === g || rel.startsWith(g + path.sep))) fail('OUT_INSIDE_GENERATED_DATA', rel);
  if (o.sample !== undefined) { o.sample = Number(o.sample); if (!Number.isSafeInteger(o.sample) || o.sample < 1) fail('SAMPLE_INVALID'); }
  o.frame = o.frame || 'F1';
  if (!FRAMES[o.frame]) fail('FRAME_UNKNOWN', o.frame);
  return o;
}

function main(argv = process.argv.slice(2), io = { log: s => console.log(s) }) {
  const o = parse(argv);
  const templates = B.loadTemplates();
  const bases = [];
  for (const id of (o.templates.length || o.specs.length ? o.templates : DEFAULT_TEMPLATES)) { const t = templates.get(id); if (!t) fail('TEMPLATE_UNKNOWN', id); bases.push(t); }
  for (const f of o.specs) bases.push(JSON.parse(fs.readFileSync(f, 'utf8')));
  const delistedDir = o.delisted || process.env.VU_PRIVATE_DELISTED_SERIES || null;
  const cfg = { frame: o.frame, sample: o.sample || DEFAULT_SAMPLE, seed: o.seed || DEFAULT_SEED };
  const options = { privateDirs: delistedDir ? { delistedSeries: delistedDir } : {}, cacheDir: o.cache || null };
  const rep = report(bases.map(b => runCase(b, cfg, options)), cfg);
  const tmp = o.out + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(rep, null, 1) + '\n'); fs.renameSync(tmp, o.out);
  io.log('[survivorship-sensitivity] ' + rep.state + ' · ' + rep.cases.map(c => c.template + '=' + c.state).join(', ') + ' · ' + o.out);
  return o.requirePrivate && rep.state !== 'RESEARCH_EXECUTED' ? 1 : 0;
}
if (require.main === module) { try { process.exitCode = main(); } catch (e) { console.error('ABBRUCH: ' + e.message); process.exitCode = 2; } }
module.exports = { VERSION, KINDS, SURVIVOR_PROFILE, FRAMES, DEFAULT_TEMPLATES, DEFAULT_SAMPLE, DEFAULT_SEED, FREIGABE, sensitivitySpecs, summarizeRun, runCase, report, parse, main };
