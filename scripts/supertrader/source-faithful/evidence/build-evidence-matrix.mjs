#!/usr/bin/env node
/**
 * Supertrader Master Completion 3.0 – Erzeuger des Evidenznachweises der 13 Methoden (C01–C13).
 *
 * Liest ausschließlich committete Quellen des Repositorys und erzeugt docs/SUPERTRADER_13_METHODS_EVIDENCE.md:
 *  - Readiness-Artefakt  scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json (CC-1–CC-8, Dimensionen)
 *  - Readiness-Matrix    docs/SUPERTRADER_9_CERTIFICATION_READINESS.md (Blocker je Methode; SHA-256 gegen den Pin des TOP5-Plans)
 *  - TOP5-Plan           scripts/supertrader/source-faithful/certification/CERT-PREP-TOP5-PLAN.json (gepinnt, unverändert)
 *  - Golden Cases        scripts/supertrader/source-faithful/artifacts/STRATEGY-GOLDEN-CASE-RESULTS.json
 *  - Paper-Protokoll     completion/sf6-paper-protocol-2027.mjs, historische Infrastruktur research/st9-hist-*.mjs
 *  - Kandidatenstand     supertrader/data/sf-candidates/summary.json, Stammdaten-Zeitstempel unter quant/data/market/…
 *  - Betrieb             docs/SUPERTRADER_9_HANDOVER.md §4 und §8.1, docs/SUPERTRADER_9_DAILY_OPERATIONS.md (C1–C7),
 *                        core/registry/domains.json (C7), Testtitel unter scripts/supertrader/tests/
 *
 * Es wird nichts bewertet, was die Quellen nicht belegen: Die Status folgen festen Ableitungsregeln (Abschnitt 7 des
 * Dokuments). Keine Methode wird zertifiziert; ZERTIFIZIERT = JA verlangt den Beleg im Readiness-Artefakt.
 *
 * Ort: unter source-faithful/, weil der Erzeuger Module und Artefakte dieses Baums liest. Außerhalb davon dürfte keine
 * Datei auf source-faithful/ verweisen (Isolationsprüfung SF2-LEGACY-ISOLATION in sf-completion.test.mjs).
 *
 * Aufruf:
 *   node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs                     # Dokument auf stdout
 *   node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs --out <datei.md>    # schreibt nur mit --out
 *   node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs --check <datei.md>  # Vergleich, Exit 0 / 1
 *
 * Der Abschnitt „Datenstand“ hängt am täglich erzeugten Kandidatenstand und an den Stammdaten. Er steht zwischen festen
 * Markern. `--check` meldet MATCH bei Gleichheit, DATA_STATE_NEWER, wenn nur dieser Abschnitt abweicht und die Quellen
 * neuer sind als der dokumentierte Stand (Neuerzeugung empfohlen, kein Fehler), sonst MISMATCH (Exit 1).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..', '..', '..');
export const GENERATOR_VERSION = 'st-mc3-evidence-matrix-1.1.0'; // 1.1.0: Klassen 1–4 der Blocker, Auswertung vorhandener Nachweise, Branch-Nachweise, OFFEN ohne technischen Anteil = BLOCKIERT
export const DOC_PATH = 'docs/SUPERTRADER_13_METHODS_EVIDENCE.md';
export const BLOCK_BEGIN = '<!-- st-mc3:datenstand:begin';
export const BLOCK_END = '<!-- st-mc3:datenstand:end -->';

export const PATHS = Object.freeze({
  readiness: 'scripts/supertrader/source-faithful/artifacts/STRATEGY-SF6-READINESS.json',
  golden: 'scripts/supertrader/source-faithful/artifacts/STRATEGY-GOLDEN-CASE-RESULTS.json',
  plan: 'scripts/supertrader/source-faithful/certification/CERT-PREP-TOP5-PLAN.json',
  planChecker: 'scripts/supertrader/source-faithful/certification/cert-prep-top5.mjs',
  planTests: 'scripts/supertrader/tests/sf-cert-prep-top5.test.mjs',
  matrixDoc: 'docs/SUPERTRADER_9_CERTIFICATION_READINESS.md',
  handover: 'docs/SUPERTRADER_9_HANDOVER.md',
  dailyOps: 'docs/SUPERTRADER_9_DAILY_OPERATIONS.md',
  histDoc: 'docs/SUPERTRADER_9_HISTORICAL_BACKTEST_INFRASTRUCTURE.md',
  v13Doc: 'docs/SUPERTRADER_9_V13_DELISTED_REUSE.md',
  paperDoc: 'docs/SUPERTRADER_6_PAPER_VALIDATION_PROTOCOL_2027.md',
  holdoutDoc: 'docs/SUPERTRADER_6_VALIDATION_AND_HOLDOUT.md',
  execDoc: 'docs/SUPERTRADER_7_EXECUTION_VALIDATION.md',
  caDocs: ['docs/SUPERTRADER_6_V4D1_CONTAINMENT.md', 'docs/SUPERTRADER_7_EDGAR_CA_CHECK.md', 'docs/SUPERTRADER_7_TIINGO_SPLITS_PROBE.md', 'docs/SUPERTRADER_7_OWNER_DECISIONS_E7.md'],
  dataGaps: 'docs/SUPERTRADER_2_DATA_GAPS.md',
  activation: 'docs/SUPERTRADER_8_ACTIVATION_READINESS.md',
  paper: 'scripts/supertrader/source-faithful/completion/sf6-paper-protocol-2027.mjs',
  criteria: 'scripts/supertrader/source-faithful/completion/sf6-readiness-criteria.mjs',
  histUniverse: 'scripts/supertrader/source-faithful/research/st9-hist-universe.mjs',
  histExecution: 'scripts/supertrader/source-faithful/research/st9-hist-execution.mjs',
  registration: 'scripts/supertrader/source-faithful/research/st9-v13-delisted-registration-1.0.0.json',
  detectors: 'scripts/supertrader/source-faithful/product/detectors.mjs',
  inputGate: 'scripts/supertrader/source-faithful/product/input-gate.mjs',
  publication: 'scripts/supertrader/source-faithful/product/publication-contract.mjs',
  publicationTests: 'scripts/supertrader/tests/sf-sf9-publication.test.mjs',
  summary: 'supertrader/data/sf-candidates/summary.json',
  domains: 'core/registry/domains.json',
  dataQuality: 'core/data-quality.js',
  causalityTests: 'scripts/supertrader/tests/sf-mc3-causality.test.mjs',
  wordingTests: 'scripts/supertrader/tests/sf-mc3-product-wording.test.mjs',
  evidenceTests: 'scripts/supertrader/tests/sf-mc3-evidence-matrix.test.mjs',
  turtleTests: 'scripts/supertrader/tests/sf-turtle.test.mjs',
  sf8Tests: 'scripts/supertrader/tests/sf-sf8-candidates.test.mjs',
  sf7ExecTests: 'scripts/supertrader/tests/sf-sf7-execution-validation.test.mjs',
  histUniverseTests: 'scripts/supertrader/tests/sf-st9-hist-universe.test.mjs',
  histExecutionTests: 'scripts/supertrader/tests/sf-st9-hist-execution.test.mjs',
  readinessTests: 'scripts/supertrader/tests/sf-sf6-readiness.test.mjs',
  psr709: 'scripts/supertrader/source-faithful/evidence/PSR709-EVIDENCE-EXTRACT.json',
});

/** Nachweise aus offenen Draft-PRs (Übergabe §8.1); „auf main“ erkennt der Erzeuger am Repository-Stand, nie an einer Liste. */
export const BRANCH_PATHS = Object.freeze({
  all13Plan: 'scripts/supertrader/source-faithful/certification/CERT-PREP-ALL13-PLAN.json',
  v13Workflow: '.github/workflows/supertrader-st9-v13-study.yml',
});

export const STATUS = Object.freeze({ BELEGT: 'BELEGT', TEILWEISE: 'TEILWEISE', OFFEN: 'OFFEN', BLOCKIERT: 'BLOCKIERT' });
export const OWNER = 'Owner', TECH = 'technisch lösbar', DATA = 'Daten-Zeit';

/** Klassen eines nicht technisch lösbaren Blockers (Einordnung der BLOCKIERT-Punkte). */
export const BLOCK_CLASSES = Object.freeze({
  1: 'Owner-Fachentscheidung',
  2: 'fehlende lizenzierte Daten',
  3: 'vorhandener, noch nicht ausgewerteter Nachweis',
  4: 'historische Voraussetzung heute nicht erfüllbar',
});
/** Art eines technisch lösbaren Blockers (kein BLOCKIERT-Grund). */
export const TECH_KINDS = Object.freeze({
  AUF_BRANCH: 'Nachweis auf Branch, noch nicht gemergt',
  AUF_MAIN_NICHT_AUSGEWERTET: 'auf main, im Erzeuger noch nicht ausgewertet',
  EIGENER_PR: 'eigener Fach- bzw. Produkt-PR mit Vorher/Nachher nötig (hier nicht)',
  STUDIENLAUF: 'vorregistriert, wird mit dem Studienlauf berichtet',
});

export const DIMENSIONS = Object.freeze([
  { id: 'D1', name: 'Quellen-/Regeltreue' },
  { id: 'D2', name: 'Parameter/Grenzfälle' },
  { id: 'D3', name: 'reproduzierbare Berechnung' },
  { id: 'D4', name: 'Ein-/Ausstieg' },
  { id: 'D5', name: 'Stopps/Slippage/Kosten' },
  { id: 'D6', name: 'Corporate Actions' },
  { id: 'D7', name: 'Delistings/Survivorship' },
  { id: 'D8', name: 'historische Datenabdeckung' },
  { id: 'D9', name: 'OOS/Walk-Forward' },
  { id: 'D10', name: 'statistische Aussagekraft' },
]);

export const STATUS_DIMENSIONS = Object.freeze(['IMPLEMENTIERT', 'GETESTET', 'FACHLICH VALIDIERT', 'ZERTIFIZIERT', 'PRODUKTREIF', 'DEAKTIVIERT', 'BLOCKIERT', 'ZURÜCKGESTELLT']);

// ------------------------------------------------------------------------------------------------ Quellen lesen

const rel = (p) => path.join(ROOT, p);
const readText = (p) => fs.readFileSync(rel(p), 'utf8');
const readJson = (p) => JSON.parse(readText(p));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const fileSha256 = (p) => sha256(fs.readFileSync(rel(p)));

/** Abschnitt eines Markdown-Dokuments ab einer Überschrift (Präfix) bis zur nächsten Überschrift derselben Ebene. */
function section(text, headingPrefix) {
  const lines = text.split('\n'), level = headingPrefix.match(/^#+/)[0].length;
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start < 0) throw new Error(`SECTION_NOT_FOUND:${headingPrefix}`);
  let end = lines.length;
  for (let k = start + 1; k < lines.length; k++) { const m = lines[k].match(/^(#+)\s/); if (m && m[1].length <= level) { end = k; break; } }
  return lines.slice(start, end);
}
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** Blocker-Tabellen je Methode aus der Readiness-Matrix (Abschnitte „## Cxx – …“). */
export function parseMatrixBlockers(text) {
  const out = {};
  for (let n = 1; n <= 13; n++) {
    const cid = `C${String(n).padStart(2, '0')}`;
    const lines = section(text, `## ${cid} – `);
    const rows = [];
    let inTable = false, inline = null;
    for (const l of lines) {
      if (/^\| Blocker \| Schließender Beleg \|/.test(l)) { inTable = true; continue; }
      if (inTable && /^\|---/.test(l)) continue;
      if (inTable && l.startsWith('|')) { const [blocker, closes] = cells(l); rows.push({ blocker, closes }); continue; }
      if (inTable && !l.startsWith('|')) inTable = false;
      const m = l.match(/^\*\*Blocker:\*\*\s*(.+)$/); if (m) inline = m[1];
    }
    out[cid] = { rows, inline };
  }
  // „Blocker: wie Cxx, dazu …“ (ohne Tabelle) und Zeilen „wie Cxx“ werden gegen die genannte Methode aufgelöst
  for (const [cid, b] of Object.entries(out)) {
    if (!b.rows.length && b.inline) {
      const ref = b.inline.match(/^wie (C\d\d)/)?.[1];
      if (!ref || !out[ref]?.rows.length) throw new Error(`MATRIX_BLOCKERS_UNRESOLVED:${cid}`);
      b.rows = out[ref].rows.map((r) => ({ blocker: r.blocker, closes: r.closes, via: ref }));
      b.note = b.inline;
    }
    if (!b.rows.length) throw new Error(`MATRIX_BLOCKERS_MISSING:${cid}`);
  }
  for (const b of Object.values(out)) {
    b.rows = b.rows.flatMap((r) => {
      const ref = r.closes.match(/^wie (C\d\d)\b(.*)$/);
      if (r.blocker === 'Rest' && ref) return out[ref[1]].rows.map((x) => ({ blocker: x.blocker, closes: x.closes, via: ref[1] }));
      if (ref) {
        const base = out[ref[1]].rows.find((x) => x.blocker === r.blocker || x.blocker.startsWith(r.blocker));
        return [{ blocker: r.blocker, closes: base ? `${base.closes}${ref[2] ? ` (${ref[2].replace(/^[,;]\s*/, '')})` : ''}` : r.closes, via: ref[1] }];
      }
      return [r];
    });
  }
  return out;
}

/** Zuordnung einer Matrix-Blockerzeile zu Prüfdimensionen und Zuständigkeit (fail closed bei unbekanntem Schlüssel). */
export function matrixRowDimensions(blocker) {
  const b = blocker.trim();
  if (/^CC-1 und CC-2$/.test(b)) return { dims: ['D1', 'D4'], who: [OWNER] };
  if (/^CC-1$|^CC-3$/.test(b)) return { dims: ['D1'], who: [OWNER] };
  if (/^CC-4$/.test(b)) return { dims: ['D8'], who: [OWNER] };
  if (/^CC-5$/.test(b)) return { dims: ['D6'], who: [OWNER, DATA] };
  if (/^CC-8$|^OOS$/.test(b)) return { dims: ['D9'], who: [DATA, OWNER] };
  if (/^Stop$/.test(b)) return { dims: ['D4'], who: [OWNER] };
  if (/^Datenlücke ATH$|^Katalysator$/.test(b)) return { dims: ['D8'], who: [OWNER] };
  if (/^Volumen und Ausführung$|^Borrow$|^Ausführung$/.test(b)) return { dims: ['D5'], who: [OWNER] };
  if (/^Reproduzierbarkeit$/.test(b)) return { dims: ['D3'], who: [OWNER, DATA] };
  throw new Error(`MATRIX_BLOCKER_KEY_UNKNOWN:${b}`);
}

/** Zuordnung eines TOP5-Plan-Blockers (ID-Suffix) zu einer Prüfdimension. */
export function planBlockerDimension(id) {
  const s = id.replace(/^C\d\d-/, '');
  if (/^CC1|^CC3$|^MOMENTUM-SPLIT$|^LEDGER$/.test(s)) return 'D1';
  if (/^RULE-CONFORMANCE$/.test(s)) return 'D2';
  if (/^PRODUCT-PLAN$|^ORH$/.test(s)) return 'D4';
  if (/^COSTS$|^ENTRY-BAR$/.test(s)) return 'D5';
  if (/^CC5$/.test(s)) return 'D6';
  if (/^(XS-)?SURV$/.test(s)) return 'D7';
  if (/^CC4$|^MEGACAP$|^ATH$/.test(s)) return 'D8';
  if (/^CC8$/.test(s)) return 'D9';
  if (/^SAMPLE$/.test(s)) return 'D10';
  throw new Error(`PLAN_BLOCKER_UNMAPPED:${id}`);
}
const CLASS_WHO = Object.freeze({ a: [TECH], b: [OWNER], c: [OWNER, DATA], d: [OWNER] });
const planWho = (b) => (/-CC8$/.test(b.id) ? [DATA, OWNER] : CLASS_WHO[b.class] ?? [OWNER]);

/** Tabelle §4 (S1–S7) der Übergabe. */
export function parseV1(text) {
  const lines = section(text, '## 4. ');
  const head = lines.find((l) => l.startsWith('| |'));
  const rows = lines.filter((l) => /^\| S\d/.test(l)).map(cells);
  if (!head || rows.length !== 7) throw new Error('V1_TABLE_NOT_FOUND');
  return { head: cells(head), rows };
}

/** Offene PRs §8.1 der Übergabe. */
export function parseOpenPrs(text) {
  const lines = section(text, '### 8.1');
  return lines.filter((l) => /^\| #\d+/.test(l)).map(cells).map(([pr, branch, content, deps]) => ({ pr, branch, content, deps }));
}

/** Veröffentlichungsvertrag C1–C7 aus den Betriebsdokumenten. */
export function parseContract(text) {
  const lines = section(text, '## Veröffentlichungsvertrag');
  const rows = lines.filter((l) => /^\| C\d \|/.test(l)).map(cells).map(([id, check, why]) => ({ id, check, why }));
  if (rows.length !== 7) throw new Error('CONTRACT_TABLE_NOT_FOUND');
  return rows;
}

/** Testtitel einer Datei (test('…')). */
export function testTitles(file) {
  const t = readText(file), out = [];
  for (const m of t.matchAll(/^\s*test\((['`])(.+?)\1/gm)) out.push(m[2]);
  return out;
}

/** Erklärte Abdeckung der Kausalitätstests (Zeile MC3_COVERED in der Testdatei; MC3-COVERAGE prüft sie dort). */
export function causalCoverage() {
  const m = readText(PATHS.causalityTests).match(/^const MC3_COVERED = Object\.freeze\(\{ causal: (\[[^\]]*\]), deterministic: (\[[^\]]*\]) \}\);$/m);
  if (!m) throw new Error('MC3_COVERED_NOT_FOUND');
  const list = (x) => JSON.parse(x.replace(/'/g, '"'));
  return { causal: list(m[1]), deterministic: list(m[2]) };
}

/** Prüf-IDs einer Testdatei: wörtliche Titel-Präfixe und die erklärte MC3-Abdeckung. */
export function testIdsOf(file) {
  // IDs vor dem ersten Doppelpunkt, auch mehrere je Titel („GC-A / GC-B: …“)
  const ids = new Set(testTitles(file).flatMap((t) => t.split(':')[0].match(/[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+/g) ?? []));
  if (file === PATHS.causalityTests) { const c = causalCoverage(); for (const x of c.causal) ids.add(`MC3-CAUSAL-${x}`); for (const x of c.deterministic) ids.add(`MC3-DETERMINISTIC-${x}`); }
  return ids;
}

export async function loadSources(root = ROOT) {
  if (root !== ROOT) throw new Error('ROOT_FIXED');
  const readiness = readJson(PATHS.readiness), golden = readJson(PATHS.golden), plan = readJson(PATHS.plan), summary = readJson(PATHS.summary);
  const domains = readJson(PATHS.domains), registration = readJson(PATHS.registration);
  const matrixText = readText(PATHS.matrixDoc), handoverText = readText(PATHS.handover), opsText = readText(PATHS.dailyOps);
  const { SF6_PAPER_PROTOCOL, sf6PaperProtocolSha256 } = await import(path.join(ROOT, PATHS.paper));
  const { AUX_MAX_AGE_DAYS, lastCompletedSession } = await import(path.join(ROOT, PATHS.inputGate));
  const { createCalendar, SOURCES } = await import(path.join(ROOT, 'scripts/supertrader/source-faithful/product/eod-adapter.mjs'));
  const { PUBLICATION_CONTRACT } = await import(path.join(ROOT, PATHS.publication));
  const { requirementsOf } = await import(path.join(ROOT, PATHS.histUniverse));
  const histExecSrc = readText(PATHS.histExecution);
  const master = readJson(path.join(SOURCES.master)), names = readJson(path.join(SOURCES.names));
  const { referenceCodeFingerprints } = await import(path.join(ROOT, PATHS.planChecker));
  const refCode = await referenceCodeFingerprints();
  const merged = { all13: fs.existsSync(rel(BRANCH_PATHS.all13Plan)), turtleStops: HIST_COVERAGE.V1_1.test(histExecSrc), v13Workflow: fs.existsSync(rel(BRANCH_PATHS.v13Workflow)) };
  return {
    refCode, merged,
    readiness, golden, plan, summary, domains, registration, matrixText, handoverText, opsText,
    paper: { protocol: SF6_PAPER_PROTOCOL, sha256: sf6PaperProtocolSha256() },
    inputGate: { AUX_MAX_AGE_DAYS, lastCompletedSession }, calendar: createCalendar(), SOURCES,
    publicationContract: PUBLICATION_CONTRACT, requirementsOf, histExecSrc,
    master: { generatedAt: master.generatedAt, version: master.version, file: SOURCES.master },
    names: { generatedAt: names.generatedAt, version: names.version, file: SOURCES.names },
  };
}

// ------------------------------------------------------------------------------------------------ Modell

const PASSG = new Set(['PASS', 'PASS_WITH_DECLARED_LIMITS']);
const ccKeys = (c) => Object.keys(c.certificationCriteria);
const ccOk = (c, n) => c.certificationCriteria[ccKeys(c).find((k) => k.startsWith(`CC-${n}-`))] === true;
const ccList = (c, ok) => ccKeys(c).filter((k) => c.certificationCriteria[k] === ok).map((k) => k.match(/^CC-(\d)/)[1]);
const grade = (c, d) => c.dimensions[d]?.grade ?? null;
const ev = (c, d) => c.dimensions[d]?.evidence ?? null;
const testRef = (file, id) => ({ kind: 'test', file, id });
const fileRef = (file) => ({ kind: 'file', file });
const runRef = (id, what) => ({ kind: 'run', id, what });
const prRef = (pr, what) => ({ kind: 'pr', id: pr, what });
const textRef = (text) => ({ kind: 'text', text });

const STUDY_KEY = Object.freeze({ C01: 'TURTLE_S1', C02: 'TURTLE_S2', C03: 'DARVAS', C04: 'WEINSTEIN_INVESTOR', C05: 'WEINSTEIN_TRADER', C06: 'MINERVINI_SEPA', C07: 'MINERVINI_POWER_PLAY', C08: 'KK_BREAKOUT', C09: 'KK_EPISODIC_PIVOT', C11: 'POCKET_PIVOT', C12: 'BUYABLE_GAP_UP', C13: 'HOLY_GRAIL_W_RAS97' });

/** Schlüssel der Methoden in der eingefrorenen V13-Studienregistrierung (primär und sekundär, „KEY (Cxx)“). */
function registeredStudyMethods(registration) {
  const all = [...(registration.methods.primary ?? []), ...(registration.methods.secondary ?? [])];
  return new Map(all.map((s) => { const m = s.match(/^(\S+) \((C\d\d)\)$/); if (!m) throw new Error(`REGISTRATION_METHOD_FORMAT:${s}`); return [m[2], m[1]]; }));
}

/** Prüfabdeckung verpasster Stopps im historischen Ausführungsaudit, abgeleitet aus dem Code (auditRun). */
export const HIST_COVERAGE = Object.freeze({
  // st9-hist-execution 1.0.x (main): Turtle-Einheitsstopps ungeprüft
  V1_0: /missedStopCheck: lc \? 'SF5_CHECK_LIFECYCLE_RUN' : stops \? 'MINERVINI_EVENT_PATH' : 'NOT_CHECKED_LEVEL_UNKNOWN'/,
  // st9-hist-execution 1.1.0 (#1233): unabhängige Turtle-Einheitsstopps
  V1_1: /missedStopCheck: lc \? 'SF5_CHECK_LIFECYCLE_RUN' : key\.startsWith\('MINERVINI_'\) \? 'MINERVINI_EVENT_PATH' : key\.startsWith\('TURTLE_'\) \? 'TURTLE_INDEPENDENT_N_UNIT_STOPS' : 'NOT_CHECKED_LEVEL_UNKNOWN'/,
});
function missedStopCoverage(src, cid, studyKey) {
  const v11 = HIST_COVERAGE.V1_1.test(src);
  if (!v11 && !HIST_COVERAGE.V1_0.test(src)) throw new Error('HIST_EXECUTION_COVERAGE_CHANGED');
  if (/^TURTLE_/.test(studyKey ?? '')) return v11 ? 'TURTLE_INDEPENDENT_N_UNIT_STOPS' : 'NOT_CHECKED_LEVEL_UNKNOWN';
  if (/^MINERVINI_/.test(studyKey ?? '')) return 'MINERVINI_EVENT_PATH';
  return studyKey ? 'SF5_CHECK_LIFECYCLE_RUN' : null;
}

function dimension(id) { return { id, name: DIMENSIONS.find((d) => d.id === id).name, status: null, evidence: [], blockers: [], basis: [] }; }
/** Status-Regel: BELEGT nie mit offenem Blocker; ein offener Blocker senkt BELEGT auf TEILWEISE. */
function finalize(d, status) {
  d.ruleStatus = status;
  d.status = status === STATUS.BELEGT && d.blockers.length ? STATUS.TEILWEISE : status;
  return d;
}

// ------------------------------------------------------------------------------------------------ Einordnung (1.1.0)

const tech = (kind, why, extra = {}) => ({ klass: null, tech: kind, why, ...extra });
const cls = (klass, why) => ({ klass, tech: null, why });
const CA_WHY = 'lizenzierte, faktortragende CA-Quelle (E7-1); die Quarantäne erfüllt CC-5 nie (E1)';

/**
 * Einordnung eines offenen Blockers: technisch lösbar (tech) oder Klasse 1, 2 oder 4. Klasse 3 (vorhandener, noch nicht
 * ausgewerteter Nachweis) wird nicht vergeben, sondern in evaluate() ausgewertet; ein ausgewerteter Blocker ist geschlossen.
 * Feste Regeln über die Blocker-ID und den schließenden Beleg; ein unbekannter Blocker bricht ab (fail closed).
 */
export function classifyBlocker(cid, dimId, b, ctx) {
  const id = b.id, closes = String(b.closes ?? '');
  const onBranch = (key, pr) => (ctx.merged[key]
    ? tech('AUF_MAIN_NICHT_AUSGEWERTET', `${pr} ist auf main; Auswertung im Erzeuger nachziehen`, { pr })
    : tech('AUF_BRANCH', `${pr} auf Branch, noch nicht gemergt`, { pr }));
  if (/-HIST-UNIT-STOPS$/.test(id)) return onBranch('turtleStops', ctx.prs.turtleStops);
  if (/-(CERT-PREP|BOUNDARY)$/.test(id)) return onBranch('all13', ctx.prs.all13);
  if (/-V13-RUN$/.test(id)) return ctx.merged.v13Workflow ? cls(1, `Workflow ${ctx.prs.v13} auf main; der Lauf auf echten Daten braucht die Owner-Freigabe (Secrets bestätigen, auslösen)`) : onBranch('v13Workflow', ctx.prs.v13);
  if (/^PS-C\d\d-CONFORMANCE$/.test(id)) {
    const r = ctx.refCode[cid];
    if (r?.state === 'HEAD_DIFFERS_FROM_PINNED_REFERENCE_FINGERPRINT') return cls(1, 'Engine-Fingerabdruck weicht vom gepinnten Referenzwert ab: Referenzentscheidung des Owners');
    return cls(1, 'kein Referenz-Fingerabdruck dieser Engine gepinnt; ihn festzulegen ändert das gepinnte SF6-PAPER-2027 (Owner)');
  }
  if (/-PRODUCT-PLAN$/.test(id)) return tech('EIGENER_PR', 'eigener Produkt-PR: ändert die Produktausgabe (supertrader/data), Vorher/Nachher');
  if (/-LEDGER$/.test(id)) return tech('EIGENER_PR', 'eigener PR für source-ledger.json (berührt den Legacy-Build)');
  if (/-(COSTS|ENTRY-BAR)$/.test(id)) return tech('STUDIENLAUF', 'Kostenstufen bzw. Varianten sind vorregistriert und werden mit dem Studienlauf vollständig berichtet');
  if (/-(X-)?CC-?5$/.test(id)) return cls(2, /Owner-Entscheidung/.test(closes) ? `${CA_WHY}; laut Matrix zusätzlich eine Owner-Entscheidung` : CA_WHY);
  if (/-(X-)?CC-?8$/.test(id)) return cls(4, 'kein unberührtes historisches Fenster; SF6-PAPER-2027 beginnt am 01.01.2027 (250 Sitzungen), Owner-Aktivierung davor');
  if (/-OOS(-SCOPE)?$/.test(id)) return cls(4, 'kein zweites historisches Fenster (IEX-Minuten erst ab 2017), nicht in SF6-PAPER-2027; ein Forward-Protokoll nur mit Owner-Freigabe');
  if (/-(XS-)?SURV$/.test(id)) return cls(2, 'Delistings vor 2009 und Delisting-Renditen fehlen; V13-Reihen nur privat (nicht veröffentlichbar)');
  if (/-(CAUSALITY|Reproduzierbarkeit)$/.test(id)) return cls(2, 'eingefrorene Minuten fehlen (privater IEX-Cache; konsolidierte Minuten nur mit Lizenz)');
  if (/-(Borrow|Ausführung|Volumen-und-Ausführung|ORH)$/.test(id)) return cls(2, 'konsolidierte Minuten bzw. Borrow- und Gebührenhistorie nur mit Lizenz');
  if (/-ROBUSTNESS$/.test(id)) {
    if (ctx.notMeasurable) return ctx.sourceBlocked ? cls(1, 'nicht messbar, weil die Quelle die Regeln nicht vollständig liefert (Owner)') : cls(2, 'nicht messbar: nur IEX-Venue-Minuten (1–5 % des Volumens); konsolidierte Minuten nur mit Lizenz');
    return ctx.inPaper ? cls(4, 'Kennzahlen versiegelt (E6); das einzige unberührte Fenster ist SF6-PAPER-2027 ab 01.01.2027') : cls(1, 'nicht in SF6-PAPER-2027 (E5); ein eigenes Forward-Protokoll braucht die Owner-Freigabe');
  }
  if (/^C0[12]-CC4$/.test(id)) return cls(1, 'Owner-Entscheidung E7-5 (A mit E4-Revision oder B GICS-Historie)');
  if (/-(CC-?4|CC-4-OPEN|MEGACAP|ATH)$/.test(id)) {
    if (/lizen|Security Master|vor 2015/i.test(closes)) return cls(2, `Daten fehlen: ${short(closes, 120)}`);
    if (/Owner/.test(closes)) return cls(1, short(closes, 120));
  }
  if (/-Katalysator$/.test(id)) return cls(1, 'die Bewertung „unerwartet und signifikant“ bleibt manuell (Owner); dazu ein PIT-Katalysatorkalender');
  if (/-(SAMPLE|ENTRY-EXIT-MODEL|STOP-MODEL|Stop|MOMENTUM-SPLIT)$/.test(id)) return cls(1, 'Modellannahme statt Quellenregel bzw. Wahl der Referenz: Quellenbeleg oder Owner-Entscheidung');
  if (/-CC-?1|-CC-?3|-CC-1-und-CC-2/.test(id)) return cls(1, 'Quellenstelle, Ermessensfragen oder Übersetzungsbelege: Owner-Entscheidung (eine Neudefinition wäre keine Quellentreue)');
  throw new Error(`BLOCKER_CLASS_UNKNOWN:${cid}:${dimId}:${id}`);
}

/** Ursache eines BLOCKIERT-Punkts: der Blocker, der die Ableitungsregel der Dimension auslöst. */
const CAUSE = Object.freeze({
  D1: /-CC-?1|-CC-?3/, D4: /-ENTRY-EXIT-MODEL$|-Stop$|-CC-1-und-CC-2$/, D5: /-(Borrow|Ausführung|Volumen-und-Ausführung)$/, D6: /-(X-)?CC-?5$/,
  D7: /-(XS-)?SURV$/, D8: /-(CC-?4|CC-4-OPEN|Katalysator|ATH|MEGACAP)$/, D9: /-(X-)?CC-?8$|-OOS(-SCOPE)?$/, D10: /-ROBUSTNESS$/,
});
export function blockedCause(d) {
  const withClass = d.blockers.filter((b) => b.klass);
  return withClass.find((b) => CAUSE[d.id]?.test(b.id)) ?? withClass[0] ?? null;
}

/**
 * Auswertung vorhandener Nachweise und Einordnung; der Status nach den Regeln 1.0.0 bleibt als statusBase erhalten.
 *  E-REFCODE  PS-C01/C02-CONFORMANCE: Engine-Fingerabdruck auf dem Stand = gepinnter Referenzwert SF6-PAPER-2027; die
 *             Regeltreue-Tests laufen in MC3-EV-REFCODE auf genau diesem Stand (MET). Blocker geschlossen.
 *  E-SAMPLE   statistische Aussagekraft: Stichprobe (Trades), Trade-Stabilität unter Quarantäne und COST-50 und
 *             numerische Reproduzierbarkeit (Hash-Gleichheit) stehen im Readiness-Artefakt: OFFEN → TEILWEISE.
 *  RECLASS    OFFEN ohne technisch lösbaren Blocker → BLOCKIERT (ohne Owner, Lizenzdaten oder Zeitablauf nicht schließbar).
 */
function evaluate(cid, D, c, ctx, evaluations) {
  for (const d of Object.values(D)) { d.statusBase = d.status; d.resolved = []; }
  const ref = ctx.refCode[cid];
  const rc = D.D1.blockers.findIndex((b) => b.id === `PS-${cid}-CONFORMANCE`);
  if (rc >= 0 && ref?.state === 'HEAD_EQUALS_PINNED_REFERENCE_FINGERPRINT') {
    const [b] = D.D1.blockers.splice(rc, 1);
    D.D1.resolved.push({ ...b, by: 'E-REFCODE' });
    D.D1.evidence.push(textRef(`${ref.fingerprint} ${ref.head.slice(0, 12)}… = ${ref.pinnedIn}`), testRef(PATHS.evidenceTests, 'MC3-EV-REFCODE'));
    evaluations.push({ cid, dim: 'D1', id: 'E-REFCODE', text: `${b.id}: Engine-Fingerabdruck = gepinnter Referenzwert (${ref.pinnedIn}); Regeltreue-Tests auf diesem Stand MET (MC3-EV-REFCODE). Der Plan bleibt unverändert (evidenceState gepinnt).` });
  }
  const e6 = c.dimensions.BACKTEST_REPRODUCIBILITY?.e6 ?? null, ts = e6?.tradeStability;
  if (D.D10.status === STATUS.OFFEN && ts && typeof ts === 'object' && /HASH_IDENTICAL/.test(e6.numericalReproducibility ?? '')) {
    const n = String(ts.underQuarantine).match(/of (\d+) trades/)?.[1] ?? '–';
    D.D10.evidence.push(textRef(`Stichprobe ${n} Trades; numerische Reproduzierbarkeit ${e6.numericalReproducibility}`));
    D.D10.basis.push('Stichprobe, Trade-Stabilität und Reproduzierbarkeit ausgewiesen (E-SAMPLE)');
    D.D10.status = STATUS.TEILWEISE;
    evaluations.push({ cid, dim: 'D10', id: 'E-SAMPLE', text: `Stichprobe ${n} Trades, Trade-Stabilität (Quarantäne ${ts.underQuarantine}; COST-50 ${ts.underCost50}), ${e6.numericalReproducibility}; Kennzahlen bleiben versiegelt (E6)` });
  }
  for (const d of Object.values(D)) {
    for (const b of d.blockers) Object.assign(b, classifyBlocker(cid, d.id, b, ctx));
    if (d.status === STATUS.TEILWEISE && !d.blockers.length && d.ruleStatus === STATUS.BELEGT) d.status = STATUS.BELEGT;
    if (d.status === STATUS.OFFEN && d.blockers.length && d.blockers.every((b) => b.klass)) { d.status = STATUS.BLOCKIERT; d.reclassified = 'OFFEN → BLOCKIERT'; }
    if (d.status === STATUS.BLOCKIERT) { const cause = blockedCause(d); if (!cause) throw new Error(`BLOCKED_WITHOUT_CLASS:${cid}:${d.id}`); d.blockClass = cause.klass; d.cause = cause; }
  }
}

export function buildModel(src) {
  const { readiness, golden, plan, summary, registration } = src;
  const matrix = parseMatrixBlockers(src.matrixText);
  const openPrs = parseOpenPrs(src.handoverText);
  const prFor = (re, label) => { const p = openPrs.find((x) => re.test(x.content)); if (!p) throw new Error(`OPEN_PR_NOT_FOUND:${label}`); return p; };
  const prAll13 = prFor(/ALL13/, 'ALL13'), prTurtleStops = prFor(/Turtle-Einheitsstopps/, 'Turtle-Einheitsstopps'), prV13 = prFor(/supertrader-st9-v13-study\.yml/, 'V13-Workflow');
  const regMethods = registeredStudyMethods(registration);
  const cover = causalCoverage();
  const gcBy = {};
  for (const c of golden.cases) for (const s of c.strategyIds) { const g = (gcBy[s] ??= { n: 0, pass: 0, files: new Set() }); g.n++; if (c.result === 'PASS') g.pass++; g.files.add(c.test.split(':')[0]); }
  const catalog = new Map(summary.strategies.map((s) => [s.candidateId, s]));
  const certified = new Set(readiness.summary.certificationCandidates ?? []);
  const evaluations = [];
  const prs = { all13: prAll13.pr, turtleStops: prTurtleStops.pr, v13: prV13.pr };

  const methods = readiness.candidates.map((c) => {
    const cid = c.candidateId, p = plan.methods.find((m) => m.candidateId === cid) ?? null, prod = catalog.get(cid) ?? null;
    const gc = gcBy[c.strategyId] ?? { n: 0, pass: 0, files: new Set() };
    const D = Object.fromEntries(DIMENSIONS.map((x) => [x.id, dimension(x.id)]));
    const sourceBlocked = c.primaryState === 'SOURCE_BLOCKED', validationBlocked = c.primaryState === 'VALIDATION_BLOCKED';
    const notMeasurable = c.measurementClass === 'NOT_MEASURABLE';
    const studyKey = regMethods.get(cid) ?? null;

    // Blocker aus Plan (TOP5) bzw. Matrix (übrige acht)
    if (p) {
      for (const b of p.blockers) {
        const dim = planBlockerDimension(b.id);
        if (b.status === 'DONE') { D[dim].evidence.push(textRef(`${b.id} DONE (TOP5-Plan)`)); continue; }
        const x = plan.crossCuttingBlockers.find((y) => y.id === b.closes);
        D[dim].blockers.push({ id: b.id, text: b.text, closes: x ? `${x.id}: ${x.closes}` : b.closes, status: b.status, who: planWho(b), source: `${PATHS.plan} (${b.id}, Klasse ${b.class})` });
      }
    } else {
      for (const r of matrix[cid].rows) {
        const m = matrixRowDimensions(r.blocker);
        for (const dim of m.dims) D[dim].blockers.push({ id: `${cid}-${r.blocker.replace(/\s+/g, '-')}`, text: r.blocker, closes: r.closes, status: 'OPEN', who: m.who, source: `${PATHS.matrixDoc} (${cid}, Blocker${r.via ? `, wie ${r.via}` : ''})` });
      }
    }

    // D1 Quellen-/Regeltreue: CC-1, CC-3, Regeltreue-Nachweis
    D.D1.basis.push(`SOURCE_FIDELITY ${grade(c, 'SOURCE_FIDELITY')}; CC-1 ${ccOk(c, 1) ? 'erfüllt' : 'offen'}; CC-3 ${ccOk(c, 3) ? 'erfüllt' : 'offen'}`);
    D.D1.evidence.push(fileRef(PATHS.readiness), fileRef(PATHS.psr709), textRef(ev(c, 'SOURCE_FIDELITY')));
    if (p) {
      const st = p.studies.find((s) => s.id === `PS-${cid}-CONFORMANCE`);
      D.D1.evidence.push(fileRef(PATHS.plan), fileRef(PATHS.planChecker));
      if (st && st.evidenceState !== 'REFERENCE_COMMIT_PASSED') D.D1.blockers.push({ derived: true, id: st.id, text: `Regeltreue nur auf dem PR-Head belegt (evidenceState ${st.evidenceState})`, closes: `${PATHS.planChecker} --run-tests auf dem Commit, der die Referenz rechnet (Abnahme INTEGRITY)`, status: st.status, who: [TECH], source: `${PATHS.plan} (${st.id})` });
    } else {
      D.D1.blockers.push({ derived: true, id: `${cid}-CERT-PREP`, text: `Regeltreue-Vorbereitung nur im Draft ${prAll13.pr} (${prAll13.content})`, closes: prAll13.deps, status: 'OPEN_DRAFT_PR', who: [TECH, OWNER], source: `${PATHS.handover} §8.1` });
    }
    finalize(D.D1, sourceBlocked ? STATUS.BLOCKIERT : ccOk(c, 1) && ccOk(c, 3) ? STATUS.BELEGT : ccOk(c, 1) || ccOk(c, 3) || p ? STATUS.TEILWEISE : STATUS.OFFEN);

    // D2 Parameter/Grenzfälle: Golden Cases, TOP5-Parameterabgleich und Regeltreue-Tests
    D.D2.basis.push(`Golden Cases ${gc.pass}/${gc.n} PASS`);
    D.D2.evidence.push(fileRef(PATHS.golden), ...[...gc.files].sort().map(fileRef));
    if (p) {
      D.D2.basis.push(`${p.params.length} Parameter gegen Code und #709 abgeglichen, ${p.conformanceTests.length} Regeltreue-Tests`);
      D.D2.evidence.push(...p.conformanceTests.map((t) => { const [f, id] = t.split(': '); return testRef(f, id); }));
    } else {
      D.D2.blockers.push({ derived: true, id: `${cid}-BOUNDARY`, text: `Grenzfalltests mit Gegenproben nur im Draft ${prAll13.pr}`, closes: prAll13.deps, status: 'OPEN_DRAFT_PR', who: [TECH, OWNER], source: `${PATHS.handover} §8.1` });
    }
    finalize(D.D2, gc.n > 0 && gc.pass === gc.n ? STATUS.BELEGT : STATUS.OFFEN);

    // D3 reproduzierbare Berechnung: CC-6, Läufe, Determinismus- und Kausalitätstests
    D.D3.basis.push(`BACKTEST_REPRODUCIBILITY ${grade(c, 'BACKTEST_REPRODUCIBILITY')}; CC-6 ${ccOk(c, 6) ? 'erfüllt' : 'offen'}`);
    D.D3.evidence.push(textRef(ev(c, 'BACKTEST_REPRODUCIBILITY')));
    if (ccOk(c, 6)) D.D3.evidence.push(runRef(readiness.runs.integrity, 'Integrität'), runRef(readiness.runs.validation, 'Validierung DEV'), runRef(readiness.runs.holdout, 'Holdout'));
    const causal = [...(cover.causal.includes(cid) ? [`MC3-CAUSAL-${cid}`] : []), ...(cover.deterministic.includes(cid) ? [`MC3-DETERMINISTIC-${cid}`] : [])].map((id) => testRef(PATHS.causalityTests, id));
    if (causal.length) D.D3.evidence.push(...causal);
    else if (/^C0[12]$/.test(cid)) D.D3.evidence.push(testRef(PATHS.turtleTests, 'SF-TUR-TEMPORAL'));
    else D.D3.blockers.push({ derived: true, id: `${cid}-CAUSALITY`, text: 'Kausalität der Entscheidung an der Eröffnung der Folgesitzung (IEX-Minuten) nicht auf Tagesbalken prüfbar', closes: 'eingefrorene Minuten im Snapshot (siehe Matrix, Reproduzierbarkeit)', status: 'OPEN', who: [DATA, OWNER], source: `${PATHS.causalityTests} (Kopf)` });
    D.D3.evidence.push(testRef(PATHS.sf8Tests, 'SF8-DETERMINISTIC'), testRef(PATHS.sf8Tests, 'SF8-PIT-ASOF'));
    finalize(D.D3, ccOk(c, 6) ? STATUS.BELEGT : PASSG.has(grade(c, 'BACKTEST_REPRODUCIBILITY')) ? STATUS.TEILWEISE : STATUS.OFFEN);

    // D4 Ein-/Ausstieg: CC-2, Einstieg/Ausstieg
    D.D4.basis.push(`ENTRY ${grade(c, 'ENTRY_COMPLETENESS')}, EXIT ${grade(c, 'EXIT_COMPLETENESS')}, Phasen ${c.executablePhases ?? 'nicht messbar'}/9; CC-2 ${ccOk(c, 2) ? 'erfüllt' : 'offen'}`);
    D.D4.evidence.push(textRef(ev(c, 'ENTRY_COMPLETENESS')), fileRef(PATHS.detectors));
    if (!PASSG.has(grade(c, 'ENTRY_COMPLETENESS')) || !PASSG.has(grade(c, 'EXIT_COMPLETENESS'))) {
      D.D4.blockers.push({ derived: true, id: `${cid}-ENTRY-EXIT-MODEL`, text: `Einstieg/Ausstieg nur als ${[grade(c, 'ENTRY_COMPLETENESS'), grade(c, 'EXIT_COMPLETENESS')].filter((g) => !PASSG.has(g)).join(' / ')} (Modellannahme statt Quellenregel)`, closes: 'Quellenbeleg oder Owner-Entscheidung; eine Neudefinition wäre keine Quellentreue', status: 'OPEN', who: [OWNER], source: `${PATHS.readiness} (dimensions)` });
    }
    finalize(D.D4, !ccOk(c, 2) && (sourceBlocked || validationBlocked) ? STATUS.BLOCKIERT : ccOk(c, 2) ? STATUS.BELEGT : STATUS.OFFEN);

    // D5 Stopps/Slippage/Kosten: CC-7, Stop, Ausführungsrealismus, historische Ausführungsprüfung
    const msc = missedStopCoverage(src.histExecSrc, cid, studyKey);
    D.D5.basis.push(`STOP ${grade(c, 'STOP_COMPLETENESS')}, EXECUTION_REALISM ${grade(c, 'EXECUTION_REALISM')}; CC-7 ${ccOk(c, 7) ? 'erfüllt' : 'offen'}; verpasste Stopps im hist. Audit: ${msc ?? 'nicht in der Studie'}`);
    D.D5.evidence.push(textRef(ev(c, 'EXECUTION_REALISM')), fileRef(PATHS.execDoc), fileRef(PATHS.sf7ExecTests), fileRef(PATHS.histExecution), fileRef(PATHS.histExecutionTests));
    if (!PASSG.has(grade(c, 'STOP_COMPLETENESS'))) D.D5.blockers.push({ derived: true, id: `${cid}-STOP-MODEL`, text: `Stop nur als ${grade(c, 'STOP_COMPLETENESS')}`, closes: 'Quellenbeleg der Stopregel oder Owner-Entscheidung', status: 'OPEN', who: [OWNER], source: `${PATHS.readiness} (STOP_COMPLETENESS)` });
    if (msc === 'TURTLE_INDEPENDENT_N_UNIT_STOPS') D.D5.evidence.push(fileRef('scripts/supertrader/tests/sf-st9-hist-turtle-stops.test.mjs'));
    if (msc === 'NOT_CHECKED_LEVEL_UNKNOWN') D.D5.blockers.push({ derived: true, id: `${cid}-HIST-UNIT-STOPS`, text: 'verpasste Turtle-Einheitsstopps im historischen Ausführungsaudit nicht geprüft (NOT_CHECKED_LEVEL_UNKNOWN)', closes: `${prTurtleStops.pr} (${prTurtleStops.content}); ${prTurtleStops.deps}`, status: 'OPEN_DRAFT_PR', who: [TECH, OWNER], source: `${PATHS.histExecution} (auditRun), ${PATHS.handover} §8.1` });
    finalize(D.D5, grade(c, 'EXECUTION_REALISM') === 'BLOCKED' ? STATUS.BLOCKIERT : ccOk(c, 7) ? STATUS.BELEGT : STATUS.OFFEN);

    // D6 Corporate Actions: CC-5 (E1: die Quarantäne erfüllt CC-5 nie)
    D.D6.basis.push(`CORPORATE_ACTION_INTEGRITY ${grade(c, 'CORPORATE_ACTION_INTEGRITY')}; CC-5 ${ccOk(c, 5) ? 'erfüllt' : 'offen'}`);
    D.D6.evidence.push(textRef(ev(c, 'CORPORATE_ACTION_INTEGRITY')), ...PATHS.caDocs.map(fileRef));
    finalize(D.D6, ccOk(c, 5) ? STATUS.BELEGT : STATUS.BLOCKIERT);

    // D7 Delistings/Survivorship: PIT-Universum, Delisting-Ausgänge (synthetisch belegt), kein Lauf auf echten Daten
    const req = studyKey ? src.requirementsOf(studyKey) : null;
    D.D7.basis.push(`PIT_DATA_INTEGRITY ${grade(c, 'PIT_DATA_INTEGRITY')}; V13-Studie: ${studyKey ? `registriert (${studyKey}${req?.flag ? `, ${req.flag}` : ''})` : 'nicht registriert'}`);
    D.D7.evidence.push(textRef(ev(c, 'PIT_DATA_INTEGRITY')), fileRef(PATHS.histUniverse), fileRef(PATHS.histUniverseTests), fileRef(PATHS.registration), fileRef(PATHS.v13Doc));
    if (!D.D7.blockers.length) D.D7.blockers.push({ derived: true, id: `${cid}-SURV`, text: 'Delistings vor 2009 fehlen, keine Delisting-Renditen; V13-Reihen nur privat', closes: 'Snapshot-Generation mit V13-Reihen bzw. Lauf der V13-Vergleichsstudie', status: 'OPEN', who: [OWNER, DATA], source: `${PATHS.plan} (X-SURV)` });
    if (studyKey && !req?.excluded) D.D7.blockers.push({ derived: true, id: `${cid}-V13-RUN`, text: 'kein Lauf der V13-Vergleichsstudie auf echten Daten (alle Tests synthetisch)', closes: `${prV13.pr} (${prV13.content}); ${prV13.deps}`, status: 'OPEN_DRAFT_PR', who: [OWNER, DATA], source: `${PATHS.histDoc} §3, ${PATHS.handover} §8.1` });
    finalize(D.D7, studyKey && !req?.excluded ? STATUS.TEILWEISE : STATUS.OFFEN);

    // D8 historische Datenabdeckung: CC-4, PIT-Daten
    D.D8.basis.push(`CC-4 ${ccOk(c, 4) ? 'erfüllt' : 'offen'}; Datenbedarf ${prod ? `${prod.dataNeeds.interval}, min. ${prod.dataNeeds.minBars} Balken, Intraday ${prod.dataNeeds.intraday}` : '–'}`);
    D.D8.evidence.push(fileRef(PATHS.readiness), fileRef(PATHS.dataGaps), textRef(ev(c, 'PIT_DATA_INTEGRITY')));
    finalize(D.D8, ccOk(c, 4) ? (PASSG.has(grade(c, 'PIT_DATA_INTEGRITY')) ? STATUS.BELEGT : STATUS.TEILWEISE) : STATUS.BLOCKIERT);

    // D9 OOS/Walk-Forward: CC-8, nur SF6-PAPER-2027 zählt
    const inPaper = grade(c, 'OUT_OF_SAMPLE_EVIDENCE') !== 'NOT_EVIDENCED';
    D.D9.basis.push(`CC-8 ${ccOk(c, 8) ? 'erfüllt' : 'offen'}; SF6-PAPER-2027 ${inPaper ? 'enthält die Referenz' : 'enthält die Methode nicht'} (${src.paper.protocol.status}, ab ${src.paper.protocol.window.start})`);
    D.D9.evidence.push(fileRef(PATHS.paper), fileRef(PATHS.paperDoc), fileRef(PATHS.readinessTests), textRef(ev(c, 'OUT_OF_SAMPLE_EVIDENCE')));
    if (!inPaper && !D.D9.blockers.length) D.D9.blockers.push({ derived: true, id: `${cid}-OOS-SCOPE`, text: 'nicht in SF6-PAPER-2027 (E5)', closes: 'eigenes Forward-Protokoll mit Owner-Freigabe', status: 'OPEN', who: [OWNER, DATA], source: `${PATHS.paper} (notInScope)` });
    finalize(D.D9, ccOk(c, 8) ? STATUS.BELEGT : STATUS.BLOCKIERT);

    // D10 statistische Aussagekraft: E6 (Kennzahlen versiegelt, Robustheit nicht belegt)
    const e6 = c.dimensions.BACKTEST_REPRODUCIBILITY?.e6 ?? null;
    D.D10.basis.push(`Messklasse ${c.measurementClass}; Robustheit ${e6?.robustness?.split(' ')[0] ?? 'nicht ausgewiesen'}`);
    if (e6?.tradeStability?.underQuarantine) D.D10.evidence.push(textRef(`Trade-Stabilität: Quarantäne ${e6.tradeStability.underQuarantine}; COST-50 ${e6.tradeStability.underCost50}`));
    D.D10.evidence.push(textRef(ev(c, 'OUT_OF_SAMPLE_EVIDENCE')), fileRef(PATHS.holdoutDoc));
    D.D10.blockers.push({ derived: true, id: `${cid}-ROBUSTNESS`, text: notMeasurable ? `nicht messbar (${c.measurementClass})` : 'Kennzahlen versiegelt und nicht bewertet; Robustheit nicht belegt (E6); kein unberührtes historisches Fenster', closes: notMeasurable ? 'messbare Referenz (Quelle bzw. Daten), danach wie die übrigen' : 'Auswertung nach SF6-PAPER-2027 über Verteilungen (E6), Öffnen der Kennzahlen nur nach Protokoll', status: 'OPEN', who: [OWNER, DATA], source: `${PATHS.readiness} (e6)` });
    finalize(D.D10, notMeasurable ? STATUS.BLOCKIERT : STATUS.OFFEN);

    // Querschnittsblocker, wo weder Plan noch Matrix einen nennen; danach hat jede nicht belegte Dimension einen Blocker
    const xb = (id) => plan.crossCuttingBlockers.find((b) => b.id === id);
    if (D.D6.status !== STATUS.BELEGT && !D.D6.blockers.length) { const b = xb('X-CC5'); D.D6.blockers.push({ derived: true, id: `${cid}-X-CC5`, text: b.text, closes: b.closes, status: 'OPEN', who: [OWNER, DATA], source: `${PATHS.plan} (X-CC5)` }); }
    if (D.D9.status !== STATUS.BELEGT && !D.D9.blockers.length) { const b = xb('X-CC8'); D.D9.blockers.push({ derived: true, id: `${cid}-X-CC8`, text: b.text, closes: b.closes, status: 'OPEN', who: [DATA, OWNER], source: `${PATHS.plan} (X-CC8)` }); }
    if (D.D8.status !== STATUS.BELEGT && !D.D8.blockers.length) D.D8.blockers.push({ derived: true, id: `${cid}-CC-4-OPEN`, text: `CC-4 offen (${ev(c, 'PIT_DATA_INTEGRITY')})`, closes: 'Owner-freigegebene PIT- bzw. Lizenzdatenquelle', status: 'OPEN', who: [OWNER], source: `${PATHS.readiness} (CC-4)` });
    for (const d of Object.values(D)) if (d.status !== STATUS.BELEGT && !d.blockers.length) throw new Error(`UNBLOCKED_NON_BELEGT:${cid}:${d.id}`);
    evaluate(cid, D, c, { merged: src.merged, refCode: src.refCode, prs, notMeasurable, sourceBlocked, inPaper }, evaluations);
    for (const d of Object.values(D)) if (d.status !== STATUS.BELEGT && !d.blockers.length) throw new Error(`UNBLOCKED_NON_BELEGT:${cid}:${d.id}`);

    // getrennte Statusdimensionen
    const allCc17 = [1, 2, 3, 4, 5, 6, 7].every((n) => ccOk(c, n)), allCc = allCc17 && ccOk(c, 8);
    const robust = e6?.robustness && !/^NOT_ESTABLISHED/.test(e6.robustness);
    const isCertified = c.certification !== 'DIAGNOSTIC_NOT_CERTIFIED' && certified.has(cid) && allCc;
    const st = {
      IMPLEMENTIERT: c.technicallyComplete && prod ? `JA (${prod.engine.engineVersion})` : 'NEIN',
      GETESTET: gc.n && gc.pass === gc.n ? `JA (Golden Cases ${gc.pass}/${gc.n}${p ? `, Regeltreue ${p.conformanceTests.length}` : ''}${causal.length ? ', MC3-Kausalität' : ''})` : 'NEIN',
      'FACHLICH VALIDIERT': allCc17 && robust ? 'JA' : `NEIN (offen: CC-${ccList(c, false).filter((n) => n !== '8').join(', CC-') || '–'}${robust ? '' : '; Robustheit nicht belegt'})`,
      ZERTIFIZIERT: isCertified ? 'JA' : `NEIN (${c.certification})`,
      PRODUKTREIF: c.liveReadiness !== 'LIVE_NOT_APPROVED' ? 'JA' : `NEIN (${c.liveReadiness}; Kandidatenstufe höchstens ${prod?.ceiling ?? '–'}, Stufe 4 gesperrt)`,
      DEAKTIVIERT: prod ? 'NEIN (im Kandidatenprodukt; keine Orders)' : 'JA (nicht im Kandidatenprodukt)',
      BLOCKIERT: sourceBlocked || validationBlocked ? `JA (${c.primaryState})` : `NEIN (${c.primaryState}); Zertifizierung blockiert: CC-${ccList(c, false).join(', CC-')}`,
      'ZURÜCKGESTELLT': inPaper ? 'NEIN' : 'JA (nicht in SF6-PAPER-2027, E5)',
    };
    return { cid, strategyId: c.strategyId, name: prod?.name ?? c.strategyId, primaryState: c.primaryState, measurementClass: c.measurementClass, ccMet: ccList(c, true), ccOpen: ccList(c, false), top5: !!p, status: st, dims: DIMENSIONS.map((x) => D[x.id]) };
  });
  if (methods.length !== 13) throw new Error(`EXPECTED_13_METHODS:${methods.length}`);
  return { methods, openPrs, evaluations, merged: src.merged, prs: { all13: prAll13, turtleStops: prTurtleStops, v13: prV13 } };
}

// ------------------------------------------------------------------------------------------------ Datenstand (veränderlich)

const isoDay = (s) => String(s).slice(0, 10);
const addDaysIso = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

/** Erstes Laufdatum, an dem die letzte abgeschlossene Sitzung mehr als `lag` Sitzungen hinter asOf liegt. */
export function firstRunDateBehind(calendar, lastCompletedSession, asOf, lag) {
  for (let d = addDaysIso(asOf, 1), k = 0; k < 40; k++, d = addDaysIso(d, 1)) {
    const exp = lastCompletedSession(calendar, d); if (!exp) continue;
    const behind = calendar.sessionsBetween(asOf, exp).length - 1;
    if (behind > lag) return { runDate: d, expectedSession: exp, behind };
  }
  throw new Error('FRESHNESS_HORIZON');
}

/** Letztes Laufdatum, an dem eine Nebenquelle die Altersgrenze der Eingangsprüfung noch einhält (age ≤ maxDays). */
export function lastRunDateWithin(generatedAt, maxDays) {
  let d = isoDay(generatedAt);
  for (let k = 0; k < 400; k++) {
    const next = addDaysIso(d, 1);
    if ((Date.parse(`${next}T00:00:00Z`) - Date.parse(generatedAt)) / 864e5 > maxDays) return { lastOk: d, firstStale: next };
    d = next;
  }
  throw new Error('AGE_HORIZON');
}

export function dataState(src) {
  const s = src.summary, cal = src.calendar, lcs = src.inputGate.lastCompletedSession;
  const behind1 = firstRunDateBehind(cal, lcs, s.asOf, 0), dqRed = firstRunDateBehind(cal, lcs, s.asOf, 2);
  const m = lastRunDateWithin(src.master.generatedAt, src.inputGate.AUX_MAX_AGE_DAYS.master);
  const n = lastRunDateWithin(src.names.generatedAt, src.inputGate.AUX_MAX_AGE_DAYS.names);
  return {
    meta: { asOf: s.asOf, master: src.master.generatedAt, names: src.names.generatedAt },
    asOf: s.asOf, nextSession: s.nextSession, counts: s.counts, dq: s.dataQuality, inputsSha256: s.inputs?.inputsSha256 ?? null, status: s.status,
    perMethod: s.strategies.map((x) => ({ cid: x.candidateId, name: x.name, ceiling: x.ceiling, ...x.counts.byStage, detected: x.counts.detected })),
    behind1, dqRed, master: { ...src.master, maxDays: src.inputGate.AUX_MAX_AGE_DAYS.master, ...m }, names: { ...src.names, maxDays: src.inputGate.AUX_MAX_AGE_DAYS.names, ...n },
  };
}

// ------------------------------------------------------------------------------------------------ Ausgabe

const esc = (s) => String(s ?? '–').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const fmtDate = (d) => { const [y, mo, da] = d.split('-'); return `${da}.${mo}.${y}`; };
const fmtInt = (n) => (Number.isFinite(n) ? n.toLocaleString('de-DE') : '–');
function fmtRef(r) {
  if (r.kind === 'file') return `\`${r.file}\``;
  if (r.kind === 'test') return `\`${path.basename(r.file)}\`: ${r.id}`;
  if (r.kind === 'run') return `Lauf ${r.id} (${r.what})`;
  if (r.kind === 'pr') return `${r.id} (${r.what})`;
  return esc(r.text);
}

/** Nachweise; Tests derselben Datei in einer Zeile. */
function fmtRefs(refs) {
  const out = [], byFile = new Map();
  for (const r of refs) {
    if (r.kind !== 'test') { out.push(fmtRef(r)); continue; }
    if (!byFile.has(r.file)) { byFile.set(r.file, []); out.push({ file: r.file }); }
    byFile.get(r.file).push(r.id);
  }
  return out.map((x) => (typeof x === 'string' ? x : `\`${path.basename(x.file)}\`: ${byFile.get(x.file).join(', ')}`));
}

export const MAIN_ORDER = Object.freeze(['D1', 'D4', 'D5', 'D8', 'D2', 'D3', 'D7', 'D10', 'D6', 'D9']);
const short = (t, n = 220) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** Hauptblocker: erster CC-Blocker außer CC-5/CC-8, sonst erster nicht abgeleiteter Blocker (Plan oder Matrix), sonst der erste. */
export function mainBlocker(m) {
  const all = MAIN_ORDER.flatMap((id) => { const d = m.dims.find((x) => x.id === id); return d.blockers.map((b) => ({ d, b })); });
  const cross = (b) => /-CC-?[58]$/.test(b.id), isCc = (b) => /-CC-?\d/.test(b.id);
  return all.find(({ b }) => !b.derived && isCc(b) && !cross(b)) ?? all.find(({ b }) => !b.derived && !cross(b)) ?? all.find(({ b }) => !cross(b)) ?? all[0] ?? null;
}

/** Zählung: Status jetzt, Ausgangsstand nach den Regeln 1.0.0 und Klassen der BLOCKIERT-Punkte. */
export function countModel(model) {
  const pts = model.methods.flatMap((m) => m.dims.map((d) => ({ cid: m.cid, d })));
  const by = (f) => Object.fromEntries(Object.values(STATUS).map((s) => [s, pts.filter((x) => f(x.d) === s).length]));
  const classes = (list) => Object.fromEntries(Object.keys(BLOCK_CLASSES).map((k) => [k, list.filter((x) => String(x.d.blockClass) === k).length]));
  const blocked = pts.filter((x) => x.d.status === STATUS.BLOCKIERT), blockedBase = blocked.filter((x) => x.d.statusBase === STATUS.BLOCKIERT);
  return { now: by((d) => d.status), base: by((d) => d.statusBase), classesNow: classes(blocked), classesBase: classes(blockedBase), blocked, blockedBase, pts };
}
const blockerTag = (b) => (b.klass ? `Klasse ${b.klass}` : `technisch lösbar: ${TECH_KINDS[b.tech]}${b.pr ? ` (${b.pr})` : ''}`);

export function render(model, state, src) {
  const L = [];
  const push = (...x) => L.push(...x);
  const sumStatus = (s) => model.methods.reduce((a, m) => a + m.dims.filter((d) => d.status === s).length, 0);
  const cnt = countModel(model);
  const fmtCounts = (c) => Object.values(STATUS).map((s) => `${s} ${c[s]}`).join(', ');
  const fmtClasses = (c) => Object.entries(c).map(([k, v]) => `Klasse ${k} ${v}`).join(', ');
  push(
    '# Supertrader – Evidenznachweis der 13 Methoden (C01–C13)',
    '',
    `> **Erzeugt, nicht von Hand ändern.** Erzeuger \`scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs\` (\`${GENERATOR_VERSION}\`). Neu erzeugen: \`node scripts/supertrader/source-faithful/evidence/build-evidence-matrix.mjs --out ${DOC_PATH}\`. Prüfen: \`--check ${DOC_PATH}\` (Test \`sf-mc3-evidence-matrix.test.mjs\`).`,
    '',
    'Teil von Master Completion 3.0 (Supertrader S2/S4). Grundlage sind nur committete Quellen des Repositorys (Abschnitt 8). Es werden keine Handelsregeln, Parameter, Engines, Registrierungen, gepinnten Pläne, Zertifizierungskriterien (CC-1–CC-8) oder Veröffentlichungsgates geändert. Eine Methode ist nicht deshalb zertifiziert, weil sie implementiert und getestet ist.',
    '',
    `**Heute ist keine Methode zertifiziert** (\`certification: ${src.readiness.certification}\`, \`certificationCandidates: [${(src.readiness.summary.certificationCandidates ?? []).join(', ')}]\`, \`liveReadiness: ${src.readiness.liveReadiness}\`). \`VALIDATED_TRADE_SIGNAL\` ist für alle 13 gesperrt.`,
    '',
    `Prüfdimensionen gesamt (13 × 10 = 130): BELEGT ${sumStatus(STATUS.BELEGT)}, TEILWEISE ${sumStatus(STATUS.TEILWEISE)}, OFFEN ${sumStatus(STATUS.OFFEN)}, BLOCKIERT ${sumStatus(STATUS.BLOCKIERT)}. Ausgangsstand nach den Regeln 1.0.0: ${fmtCounts(cnt.base)}. BLOCKIERT nach Klassen (Abschnitt 9): ${fmtClasses(cnt.classesNow)}; davon die ${cnt.blockedBase.length} Punkte des Ausgangsstands: ${fmtClasses(cnt.classesBase)}.`,
    '',
    '---',
    '',
    '## 1. Statusdimensionen je Methode',
    '',
    'Getrennt geführt: Eine implementierte und getestete Methode ist weder fachlich validiert noch zertifiziert noch produktreif.',
    '',
    `| | Methode | ${STATUS_DIMENSIONS.join(' | ')} |`,
    `|---|---|${STATUS_DIMENSIONS.map(() => '---').join('|')}|`,
    ...model.methods.map((m) => `| ${m.cid} | ${esc(m.name)} | ${STATUS_DIMENSIONS.map((k) => esc(m.status[k])).join(' | ')} |`),
    '',
    '## 2. Prüfdimensionen im Überblick',
    '',
    `| | Methode | Zustand | CC erfüllt | ${DIMENSIONS.map((d) => d.name).join(' | ')} |`,
    `|---|---|---|---|${DIMENSIONS.map(() => '---').join('|')}|`,
    ...model.methods.map((m) => `| ${m.cid} | ${esc(m.name)} | ${m.primaryState} | ${m.ccMet.join(',') || '–'} | ${m.dims.map((d) => d.status).join(' | ')} |`),
    '',
    `Hauptblocker je Methode: der erste Quellen- oder Matrix-Blocker in der Reihenfolge ${MAIN_ORDER.map((id) => DIMENSIONS.find((d) => d.id === id).name).join(', ')}; die Querschnittsblocker CC-5 (Corporate Actions) und CC-8 (Paper 2027) gelten für alle 13 und stehen nur in Abschnitt 3.`,
    '',
    ...model.methods.map((m) => {
      const first = mainBlocker(m);
      return `- **${m.cid} ${esc(m.name)}:** ${first ? `${first.d.name} – ${esc(short(first.b.closes ? `${first.b.text}: ${first.b.closes}` : first.b.text))} (${first.b.who.join(' + ')})` : 'kein offener Blocker'}`;
    }),
    '',
    '## 3. Je Methode: Status, Nachweis, verbleibender Blocker',
    '',
  );
  for (const m of model.methods) {
    push(`### ${m.cid} – ${esc(m.name)} (\`${m.strategyId}\`)`, '', `Zustand \`${m.primaryState}\`, Messklasse \`${m.measurementClass}\`, CC erfüllt ${m.ccMet.join(', ') || '–'}, offen ${m.ccOpen.join(', ') || '–'}. ${m.top5 ? 'TOP5-Vorbereitung (#1196, auf `main`).' : model.merged.all13 ? `ALL13-Vorbereitung (${model.prs.all13.pr}) auf \`main\`, im Erzeuger noch nicht ausgewertet.` : `ALL13-Vorbereitung nur auf Branch (${model.prs.all13.pr}, noch nicht gemergt; siehe Blocker).`}`, '');
    push('| Dimension | Status | Grundlage | Nachweis | Verbleibender Blocker | Zuständigkeit |', '|---|---|---|---|---|---|');
    for (const d of m.dims) {
      const blk = d.blockers.length ? d.blockers.map((b) => `${esc(b.text)} → ${esc(b.closes)} [${esc(b.source)}] {${esc(blockerTag(b))}}`).join('<br>') : '–';
      const who = [...new Set(d.blockers.flatMap((b) => b.who))].join(' + ') || '–';
      const st = `**${d.status}**${d.status !== d.statusBase ? ` (1.0.0: ${d.statusBase})` : ''}${d.blockClass ? `, Klasse ${d.blockClass}` : ''}`;
      push(`| ${d.name} | ${st} | ${esc(d.basis.join('; '))} | ${fmtRefs(d.evidence).join('<br>')} | ${blk} | ${who} |`);
    }
    push('');
  }

  // 4. geschlossene Prüfdefizite
  const cov = causalCoverage(), wt = testTitles(PATHS.wordingTests);
  push(
    '## 4. In Master Completion 3.0 geschlossene Prüfdefizite (nur Tests, keine Fachmodelländerung)',
    '',
    '| Defizit vorher | Geschlossen durch | Methoden |',
    '|---|---|---|',
    `| Kausalität der Research-Adapter (\`prepare\` muss „causal bar by bar“ sein, \`research/lifecycle-engine.mjs\`) war nur für Turtle (SF-TUR-TEMPORAL), Teile der Minervini-Ausstiege und die SF8-Pipeline (SF8-PIT-ASOF) belegt | \`${PATHS.causalityTests}\`: ${cov.causal.length} Tests MC3-CAUSAL-* auf den eingefrorenen echten Reihen der SF8-Fixture (je Schnitt ganze Reihe gegen Balken 0..i), Gegenprobe MC3-CAUSAL-PROBE, Abdeckung MC3-COVERAGE | ${[...cov.causal].sort().join(', ')} |`,
    `| Determinismus und Eingabetreue der Vorbereitung je Methode nicht einzeln geprüft | \`${PATHS.causalityTests}\`: ${cov.deterministic.length} Tests MC3-DETERMINISTIC-*; C06/C07 im jeweiligen MC3-CAUSAL-Test | ${[...cov.deterministic, 'C06', 'C07'].sort().join(', ')} |`,
    '| Kausalität von C09/C10 (Entscheidung an der Eröffnung der Folgesitzung auf IEX-Minuten) | **nicht geschlossen**: auf Tagesbalken nicht prüfbar, braucht eingefrorene Minuten | C09, C10 |',
    `| Sprachprüfung nur für \`supertrader.js\`, Registry und SF8-Katalog; Seiten, \`sf-research.js\`, \`st-chart.js\` und veröffentlichte Kandidatendateien ungeprüft | \`${PATHS.wordingTests}\`: ${wt.map((t) => t.split(':')[0]).join(', ')} | alle 13 (Produkttexte) |`,
    `| kein nachvollziehbarer, erzeugter Evidenznachweis über alle 13 Methoden | dieses Dokument mit Erzeuger und Test \`${path.basename(PATHS.evidenceTests)}\` | alle 13 |`,
    `| Regeltreue der TOP5 nur auf dem PR-Head belegt (\`PR_HEAD_ONLY_REFERENCE_COMMIT_OPEN\`) | E-REFCODE: Engine-Fingerabdruck auf dem Stand = gepinnter Referenzwert in SF6-PAPER-2027; Regeltreue-Tests auf diesem Stand MET (\`${path.basename(PATHS.evidenceTests)}\`: MC3-EV-REFCODE). Für die SF5-Lebenszyklen ist kein Referenzwert gepinnt: nicht geschlossen | ${[...new Set(model.evaluations.filter((e) => e.id === 'E-REFCODE').map((e) => e.cid))].join(', ') || '–'} |`,
    `| statistische Aussagekraft ohne ausgewertete Belege | E-SAMPLE: Stichprobe, Trade-Stabilität (Quarantäne, COST-50) und numerische Reproduzierbarkeit aus dem Readiness-Artefakt ausgewertet; Kennzahlen bleiben versiegelt (E6) | ${model.evaluations.filter((e) => e.id === 'E-SAMPLE').map((e) => e.cid).join(', ') || '–'} |`,
    '',
    'Nicht geschlossen (bräuchte Daten, eine Engine-Ausgabe oder einen Draft-PR): siehe Blocker in Abschnitt 3 und Freigabevorlagen in Abschnitt 5.',
    '',
  );

  // 5. Freigabevorlagen
  push('## 5. Freigabevorlagen (Fachmodell-, Vertrags- oder Owner-Entscheidung nötig; hier nicht umgesetzt)', '', '| ID | Methoden | Art | Inhalt | Vorschlag / schließender Beleg | Quelle |', '|---|---|---|---|---|---|');
  for (const f of src.plan.findings) push(`| ${f.id} | ${f.methods.join(', ')} | Befund ${f.kind}, modelChange ${f.modelChange} | ${esc(f.text)} | ${esc(f.proposal ?? f.suggestion ?? '–')} | \`${PATHS.plan}\` |`);
  for (const m of src.plan.methods) for (const b of m.blockers.filter((x) => x.status === 'OPEN_SEPARATE_PR')) push(`| ${b.id} | ${m.candidateId} | eigener PR (Klasse ${b.class}) | ${esc(b.text)} | ${esc(b.closes)} | \`${PATHS.plan}\` |`);
  for (const m of src.plan.methods) for (const s of m.studies.filter((x) => x.status === 'BLOCKED_OWNER')) push(`| ${s.id} | ${m.candidateId} | Owner-Entscheidung | ${esc(s.question)} | ${esc(s.acceptance.map((a) => `${a.metricKind}: ${a.criterion}`).join('; '))} | \`${PATHS.plan}\` |`);
  push(`| ${model.openPrs.map((p) => p.pr).join(', ')} | siehe Inhalt | Draft-PRs, Owner-Freigabe | ${esc(model.openPrs.map((p) => `${p.pr}: ${p.content}`).join(' · '))} | ${esc(model.openPrs.map((p) => `${p.pr}: ${p.deps}`).join(' · '))} | \`${PATHS.handover}\` §8.1 |`, '');

  // 6. Produktreife (S4)
  const v1 = parseV1(src.handoverText), contract = parseContract(src.opsText), pubTitles = testTitles(PATHS.publicationTests);
  const domain = src.domains.domains.find((d) => d.id === 'supertrader-sf8-candidates');
  const pubTestFor = (cid) => pubTitles.filter((t) => new RegExp(`\\b${cid}\\b`).test(t)).map((t) => t.split(' · ')[0]);
  push(
    '## 6. Produktreife (S4, lesend geprüft)',
    '',
    `### 6.1 Veröffentlichungsvertrag \`${src.publicationContract}\` (C1–C7)`,
    '',
    `Quelle der Prüfungen: \`${PATHS.dailyOps}\`; Code \`${PATHS.publication}\`; Tests \`${PATHS.publicationTests}\`. Ob ein Lauf veröffentlicht, entscheidet der Vertrag im Lauf selbst; dieses Dokument prüft nur den Stand des Repositorys.`,
    '',
    '| | Prüfung | Tests | Stand im Repository |',
    '|---|---|---|---|',
    ...contract.map((r) => `| ${r.id} | ${esc(r.check)} | ${pubTestFor(r.id).join(', ') || '–'} | ${r.id === 'C7' ? (domain && !('activation' in domain) ? 'Registry-Eintrag ohne `activation` (Dauerbetrieb), `core/registry/domains.json`' : 'Registry-Eintrag trägt `activation`') : 'wird je Lauf geprüft'} |`),
    '',
    '### 6.2 V1-Kriterien S1–S7',
    '',
    `Unverändert aus \`${PATHS.handover}\` §4 übernommen (Definitionen: \`${PATHS.activation}\`). Nur echte Lauf-IDs zählen; nichts ist vorweggenommen.`,
    '',
    `| ${v1.head.join(' | ')} |`,
    `|${v1.head.map(() => '---').join('|')}|`,
    ...v1.rows.map((r) => `| ${r.join(' | ')} |`),
    '',
  );
  const st = state;
  push(
    '### 6.3 Datenstand, Frische und Fristen',
    '',
    `${BLOCK_BEGIN} ${JSON.stringify(st.meta)} -->`,
    '',
    `Dieser Abschnitt folgt dem täglich erzeugten Kandidatenstand (\`${PATHS.summary}\`) und den Stammdaten. Weicht nur er ab und sind die Quellen neuer, meldet \`--check\` \`DATA_STATE_NEWER\`.`,
    '',
    `- **Kandidatenstand:** Stichtag \`asOf\` ${fmtDate(st.asOf)}, nächste Sitzung laut Stand ${fmtDate(st.nextSession)}. ${fmtInt(st.counts.candidates)} Kandidaten (CHART ${fmtInt(st.counts.byStage.CHART_CANDIDATE)}, CONFIRMED ${fmtInt(st.counts.byStage.CONFIRMED_RESEARCH_SETUP)}, MODELED ${fmtInt(st.counts.byStage.MODELED_TRADE_PLAN)}), \`validatedTradeSignal\` ${st.counts.validatedTradeSignal}, verworfene Datensätze ${st.counts.rejectedRecords}. Titel ${fmtInt(st.dq.securities)}: PASS ${fmtInt(st.dq.PASS)}, CAP ${fmtInt(st.dq.CAP)}, FAIL ${fmtInt(st.dq.FAIL)}. \`inputsSha256\` \`${String(st.inputsSha256).slice(0, 12)}…\`.`,
    `- **Status im Stand:** ${Object.entries(st.status).map(([k, v]) => `\`${k}: ${v}\``).join(', ')}.`,
    `- **Frische:** Der Stand ist für Laufdaten bis ${fmtDate(addDaysIso(st.behind1.runDate, -1))} aktuell (letzte abgeschlossene Sitzung = Stichtag). Ab Laufdatum ${fmtDate(st.behind1.runDate)} liegt er eine Sitzung zurück (erwartet ${fmtDate(st.behind1.expectedSession)}); ab Laufdatum ${fmtDate(st.dqRed.runDate)} mehr als zwei Sitzungen (${st.dqRed.behind} gegen ${fmtDate(st.dqRed.expectedSession)}), dann ist DQ-SF8-1 rot (\`${PATHS.dataQuality}#sf8Freshness\`, \`maxLag\` 2). Grund: \`SF8_AUTO_PUBLISH\` ist nicht gesetzt (Übergabe §3.3).`,
    `- **Security Master** (\`${st.master.file}\`, \`${st.master.version}\`, erzeugt ${st.master.generatedAt}): Altersgrenze der Eingangsprüfung ${st.master.maxDays} Tage (\`${PATHS.inputGate}\`, \`AUX_MAX_AGE_DAYS.master\`). **Letztes zulässiges Laufdatum ${fmtDate(st.master.lastOk)}; ab ${fmtDate(st.master.firstStale)} meldet die Eingangsprüfung STALE und jeder Kandidatenlauf endet mit Exit 3.** Zuständig: Quant (H1, Security Master 1.3.0, Freigabevorlage #1240, Owner-Datum).`,
    `- **Firmennamen** (\`${st.names.file}\`, erzeugt ${st.names.generatedAt}): Grenze ${st.names.maxDays} Tage, letztes zulässiges Laufdatum ${fmtDate(st.names.lastOk)}, STALE ab ${fmtDate(st.names.firstStale)}.`,
    '',
    '| | Methode | Obergrenze | CHART | CONFIRMED | MODELED | erkannt |',
    '|---|---|---|---|---|---|---|',
    ...st.perMethod.map((x) => `| ${x.cid} | ${esc(x.name)} | ${x.ceiling} | ${fmtInt(x.CHART_CANDIDATE)} | ${fmtInt(x.CONFIRMED_RESEARCH_SETUP)} | ${fmtInt(x.MODELED_TRADE_PLAN)} | ${fmtInt(x.detected)} |`),
    '',
    BLOCK_END,
    '',
  );

  // 7. Ableitungsregeln
  push(
    '## 7. Ableitungsregeln',
    '',
    '- **Allgemein:** BELEGT nur ohne offenen Blocker in der Dimension; ein offener Blocker senkt BELEGT auf TEILWEISE. BLOCKIERT heißt: ohne Owner-Entscheidung, Lizenzdaten oder Zeitablauf nicht schließbar.',
    '- **Quellen-/Regeltreue:** BLOCKIERT bei `SOURCE_BLOCKED`; BELEGT bei CC-1 und CC-3; TEILWEISE bei einem der beiden oder mit TOP5-Regeltreue-Tests; sonst OFFEN. Der Regeltreue-Nachweis auf dem Referenz-Commit (TOP5) bzw. die ALL13-Vorbereitung (Draft) ist ein offener Blocker.',
    '- **Parameter/Grenzfälle:** BELEGT, wenn alle Golden Cases der Methode PASS sind; offene Grenzfalltests (ALL13 im Draft) senken auf TEILWEISE.',
    '- **reproduzierbare Berechnung:** BELEGT bei CC-6 (eingefrorener Snapshot, research-v1, Läufe der Readiness); dazu Kausalitäts- und Determinismustests.',
    '- **Ein-/Ausstieg:** BELEGT bei CC-2; BLOCKIERT bei offenem CC-2 und `SOURCE_BLOCKED`/`VALIDATION_BLOCKED`; Einstieg oder Ausstieg als Modellannahme ist ein Owner-Blocker.',
    '- **Stopps/Slippage/Kosten:** BLOCKIERT bei `EXECUTION_REALISM BLOCKED`; BELEGT bei CC-7; Stop als Modellannahme und ungeprüfte verpasste Einheitsstopps sind Blocker.',
    '- **Corporate Actions:** BELEGT nur bei CC-5; sonst BLOCKIERT (Owner-Entscheidung E1: die Quarantäne erfüllt CC-5 nie).',
    '- **Delistings/Survivorship:** TEILWEISE für Methoden der eingefrorenen V13-Studienregistrierung (Infrastruktur auf `main`, synthetisch geprüft, kein Lauf auf echten Daten); sonst OFFEN.',
    '- **historische Datenabdeckung:** BELEGT bei CC-4 und PIT-Datenintegrität PASS*; TEILWEISE bei CC-4 mit Teilbefund; sonst BLOCKIERT.',
    '- **OOS/Walk-Forward:** BELEGT nur bei CC-8 (nur SF6-PAPER-2027 zählt); sonst BLOCKIERT.',
    '- **statistische Aussagekraft:** BLOCKIERT bei Messklasse `NOT_MEASURABLE`; sonst OFFEN, solange die Kennzahlen versiegelt und die Robustheit nicht belegt ist (E6).',
    '- **Statusdimensionen:** IMPLEMENTIERT = `technicallyComplete` und Engine im Produktkatalog; GETESTET = alle Golden Cases PASS; FACHLICH VALIDIERT = CC-1–CC-7 erfüllt und Robustheit belegt; ZERTIFIZIERT = Readiness weist die Methode als zertifiziert aus (`certification` ≠ `DIAGNOSTIC_NOT_CERTIFIED`, in `certificationCandidates`, CC-1–CC-8); PRODUKTREIF = `liveReadiness` ≠ `LIVE_NOT_APPROVED`; DEAKTIVIERT = nicht im Kandidatenprodukt; BLOCKIERT = Zustand `SOURCE_BLOCKED`/`VALIDATION_BLOCKED`; ZURÜCKGESTELLT = nicht im Paper-Protokoll 2027.',
    '- **Einordnung (1.1.0):** Jeder offene Blocker ist entweder technisch lösbar (Nachweis auf Branch, auf main noch nicht ausgewertet, eigener Fach- oder Produkt-PR, Studienlauf) oder trägt eine Klasse: 1 Owner-Fachentscheidung, 2 fehlende lizenzierte Daten, 4 historische Voraussetzung heute nicht erfüllbar. Klasse 3 (vorhandener, noch nicht ausgewerteter Nachweis) wird nicht als Rest geführt, sondern ausgewertet (E-REFCODE, E-SAMPLE); ein belegter Blocker ist geschlossen. Ein OFFEN-Punkt ohne technisch lösbaren Blocker ist BLOCKIERT. Die Klasse eines BLOCKIERT-Punkts ist die des Blockers, der seine Ableitungsregel auslöst (CC-5, CC-8, CC-4, Messbarkeit, Quelle, Ausführung, Survivorship). Der Status nach den Regeln 1.0.0 steht in Abschnitt 3 in Klammern.',
    '- **Branch-Nachweise:** Nachweise aus Draft-PRs zählen erst auf `main`. Ob sie dort sind, liest der Erzeuger am Repository (ALL13-Plan vorhanden, Turtle-Einheitsstopps in `auditRun`, V13-Workflow vorhanden), nie an einer Liste.',
    '- **Zuständigkeit:** TOP5-Plan Klasse a = technisch lösbar, b = Owner (Quant, Security Master), c = Owner + Daten-Zeit, d = Owner; CC-8 = Daten-Zeit + Owner. Matrix-Blocker: CC-1/CC-3/Stop/CC-4/Lizenzdaten = Owner, CC-5 = Owner + Daten-Zeit, CC-8/OOS = Daten-Zeit + Owner.',
    '',
  );

  // 8. Quellen
  const srcs = [PATHS.readiness, PATHS.golden, PATHS.plan, PATHS.matrixDoc];
  const pinOk = fileSha256(PATHS.matrixDoc) === src.plan.dependsOn.sha256;
  push(
    '## 8. Quellen',
    '',
    '| Datei | SHA-256 |',
    '|---|---|',
    ...srcs.map((f) => `| \`${f}\` | \`${fileSha256(f).slice(0, 16)}…\` |`),
    `| \`${PATHS.paper}\` (SF6-PAPER-2027 ${src.paper.protocol.version}, Inhalts-Hash) | \`${src.paper.sha256.slice(0, 16)}…\` |`,
    '',
    `- Readiness-Matrix: SHA-256 ${pinOk ? 'gleich' : '**ungleich**'} dem Pin \`dependsOn.sha256\` des TOP5-Plans (${pinOk ? 'unverändert' : 'Plan ungültig'}).`,
    `- Readiness-Artefakt: Kriterien \`${src.readiness.criteriaVersion}\`, Läufe Integrität ${src.readiness.runs.integrity}, Validierung ${src.readiness.runs.validation}, Holdout ${src.readiness.runs.holdout}.`,
    `- Weitere gelesene Quellen: \`${PATHS.handover}\` (§4, §8.1), \`${PATHS.dailyOps}\` (C1–C7), \`${PATHS.domains}\`, \`${PATHS.registration}\`, \`${PATHS.histExecution}\`, \`${PATHS.histUniverse}\`, \`${PATHS.summary}\`, \`${src.master.file}\`, \`${src.names.file}\`, Testtitel unter \`scripts/supertrader/tests/\`.`,
    '',
  );

  // 9. Einordnung und Bearbeitung (1.1.0)
  const dimName = (id) => DIMENSIONS.find((d) => d.id === id).name;
  const ptsWith = (f) => cnt.pts.filter((x) => f(x.d));
  const label = (x) => `${x.cid} ${dimName(x.d.id)}`;
  push(
    '## 9. Einordnung der Prüfpunkte und Bearbeitung (Klassen 1–4)',
    '',
    `Erzeugt nach den Regeln in Abschnitt 7 (Einordnung 1.1.0). Ausgangsstand ist der Status nach den Regeln 1.0.0 (Fassung von #1247 vor dieser Einordnung).`,
    '',
    '| Status | Ausgangsstand (1.0.0) | jetzt |',
    '|---|---|---|',
    ...Object.values(STATUS).map((s) => `| ${s} | ${cnt.base[s]} | ${cnt.now[s]} |`),
    '',
    '### 9.1 BLOCKIERT nach Klassen',
    '',
    '| Klasse | Bedeutung | Ausgangsstand | jetzt | Punkte (jetzt) |',
    '|---|---|---|---|---|',
    ...Object.entries(BLOCK_CLASSES).map(([k, v]) => `| ${k} | ${v} | ${cnt.classesBase[k]} | ${cnt.classesNow[k]} | ${cnt.blocked.filter((x) => String(x.d.blockClass) === k).map(label).join(', ') || (k === '3' ? 'keiner offen: vorhandene Nachweise sind in 9.3 ausgewertet' : '–')} |`),
    '',
    `Klasse 3 unter den ${cnt.blockedBase.length} BLOCKIERT-Punkten des Ausgangsstands: geprüft wurden die Readiness-Belege zu CC-4, CC-5, CC-8, Messbarkeit und Ausführung sowie die TOP5-Studien. Keiner belegt einen dieser Punkte; die vorhandenen, bisher nicht ausgewerteten Nachweise betreffen OFFEN- und TEILWEISE-Punkte und sind in 9.3 ausgewertet.`,
    '',
    '| Punkt | Klasse | Ursache (Blocker) | Begründung | schließender Beleg | Herkunft |',
    '|---|---|---|---|---|---|',
    ...cnt.blocked.map((x) => `| ${label(x)} | ${x.d.blockClass} | ${esc(x.d.cause.id)} | ${esc(x.d.cause.why)} | ${esc(short(String(x.d.cause.closes), 160))} | ${x.d.reclassified ? 'aus OFFEN neu eingeordnet' : 'BLOCKIERT seit 1.0.0'} |`),
    '',
    '### 9.2 OFFEN-Punkte des Ausgangsstands',
    '',
    '| Punkt | Ergebnis | Grund |',
    '|---|---|---|',
    ...ptsWith((d) => d.statusBase === STATUS.OFFEN).map((x) => {
      const ev = model.evaluations.find((e) => e.cid === x.cid && e.dim === x.d.id);
      const why = ev ? `${ev.id}: ${ev.text}` : x.d.reclassified ? `kein technisch lösbarer Blocker: ${x.d.blockers.map((b) => `${b.id} (Klasse ${b.klass})`).join(', ')}` : `technisch lösbar, offen: ${x.d.blockers.filter((b) => !b.klass).map((b) => `${b.id} – ${TECH_KINDS[b.tech]}${b.pr ? ` ${b.pr}` : ''}`).join('; ')}`;
      return `| ${label(x)} | ${x.d.status}${x.d.blockClass ? ` (Klasse ${x.d.blockClass})` : ''} | ${esc(why)} |`;
    }),
    '',
    '### 9.3 Ausgewertete vorhandene Nachweise',
    '',
    '| Punkt | Auswertung | Status 1.0.0 → jetzt |',
    '|---|---|---|',
    ...model.evaluations.map((e) => { const d = model.methods.find((m) => m.cid === e.cid).dims.find((y) => y.id === e.dim); return `| ${e.cid} ${dimName(e.dim)} | ${esc(e.text)} | ${d.statusBase} → ${d.status} |`; }),
    '',
    '### 9.4 Technisch lösbare Anteile (TEILWEISE und OFFEN)',
    '',
    '| Punkt | Blocker | Art | Stand |',
    '|---|---|---|---|',
    ...ptsWith((d) => d.status === STATUS.TEILWEISE || d.status === STATUS.OFFEN).flatMap((x) => x.d.blockers.filter((b) => !b.klass).map((b) => `| ${label(x)} (${x.d.status}) | ${esc(b.id)} | ${TECH_KINDS[b.tech]} | ${esc(b.why)} |`)),
    '',
    `Die übrigen Blocker der TEILWEISE-Punkte tragen eine Klasse (1, 2 oder 4) und sind in Abschnitt 3 je Blocker markiert. TEILWEISE nach Klassen der Blocker: ${Object.keys(BLOCK_CLASSES).filter((k) => k !== '3').map((k) => `Klasse ${k} in ${ptsWith((d) => d.status === STATUS.TEILWEISE && d.blockers.some((b) => String(b.klass) === k)).length} Punkten`).join(', ')}; ohne technisch lösbaren Anteil ${ptsWith((d) => d.status === STATUS.TEILWEISE && d.blockers.every((b) => b.klass)).length} Punkte.`,
    '',
    '### 9.5 Nachweise auf Branches (noch nicht gemergt)',
    '',
    '| PR | Inhalt | auf main | betroffene Punkte |',
    '|---|---|---|---|',
    ...[['turtleStops', 'turtleStops'], ['v13', 'v13Workflow'], ['all13', 'all13']].map(([k, mk]) => {
      const pr = model.prs[k], hits = ptsWith((d) => d.blockers.some((b) => b.pr === pr.pr));
      return `| ${pr.pr} | ${esc(pr.content)} | ${model.merged[mk] ? 'ja' : 'nein, auf Branch, noch nicht gemergt'} | ${hits.map(label).join(', ') || '–'} |`;
    }),
    '',
  );
  return L.join('\n');
}

export async function buildDocument() {
  const src = await loadSources();
  const model = buildModel(src), state = dataState(src);
  return { text: render(model, state, src), model, state, src };
}

// ------------------------------------------------------------------------------------------------ Prüfung

/** Trennt den Datenstand-Block (mit Metadaten) vom festen Teil. */
export function splitDocument(text) {
  const b = text.indexOf(BLOCK_BEGIN), e = text.indexOf(BLOCK_END);
  if (b < 0 || e < b) return { fixed: text, block: null, meta: null };
  const head = text.slice(b, text.indexOf('-->', b) + 3), json = head.slice(BLOCK_BEGIN.length, -3).trim();
  let meta = null; try { meta = JSON.parse(json); } catch { meta = null; }
  return { fixed: text.slice(0, b) + text.slice(e + BLOCK_END.length), block: text.slice(b, e + BLOCK_END.length), meta };
}

export function checkDocument(docText, built) {
  if (docText === built.text) return { status: 'MATCH' };
  const a = splitDocument(docText), g = splitDocument(built.text);
  if (a.fixed !== g.fixed) {
    const al = a.fixed.split('\n'), gl = g.fixed.split('\n'); let k = 0; while (k < al.length && al[k] === gl[k]) k++;
    return { status: 'MISMATCH', line: k + 1, documented: al[k] ?? null, generated: gl[k] ?? null };
  }
  const m = a.meta, n = g.meta;
  if (m && n && m.asOf <= n.asOf && m.master <= n.master && m.names <= n.names) return { status: 'DATA_STATE_NEWER', documented: m, current: n };
  return { status: 'MISMATCH', reason: 'DATA_BLOCK', documented: m, current: n };
}

async function main() {
  const args = process.argv.slice(2), arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const built = await buildDocument();
  if (arg('--check')) {
    const r = checkDocument(fs.readFileSync(path.resolve(arg('--check')), 'utf8'), built);
    console.log(JSON.stringify(r));
    process.exit(r.status === 'MISMATCH' ? 1 : 0);
  }
  if (arg('--out')) { fs.writeFileSync(path.resolve(arg('--out')), built.text); console.error(`geschrieben: ${arg('--out')}`); return; }
  process.stdout.write(built.text);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
