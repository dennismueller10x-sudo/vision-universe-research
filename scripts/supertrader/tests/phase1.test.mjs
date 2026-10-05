// Migration Phase 1 (TRUTH + LABELING + VERSION CONSISTENCY): Regressionstests A–F und Freeze.
// A alte Versionsregeln erscheinen bei neuer Version als aktiv
// B eine VU-Regel wird als Originalregel bezeichnet
// C REPLICATION_CLAIM_ALLOWED=true trotz LOW/UNKNOWN oder VU-eigenem Kernbereich
// D Minervini Live behauptet SEPA-Komponenten, die der Live-Code nicht nutzt
// E Darvas erhält TraderFox-Regeln als Darvas-Original
// F Turtle Equity Adaptation wird als Original-Futures-Replikation dargestellt
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRATEGIES } from '../registry.mjs';
import { versionProblems, RULE_STATUS } from '../registry-p1.mjs';
import { PROCESS_CHAIN, CHAIN_CLASSES } from '../process-chain.mjs';
import { FIDELITY } from '../fidelity.mjs';
import { LIVE_ENGINES, productOf } from '../build.mjs';
import { portfolioConfig, PORTFOLIO_SOURCE_TEXT } from '../model-portfolio.mjs';
import { PROVENANCE, PRODUCT_CLASS, CORE_AREAS } from '../fidelity/taxonomy.mjs';
import { PROVENANCE_LABELS, PRODUCT_CLASS_LABELS } from '../fidelity/provenance-labels.mjs';
import { LIVE_CLASSIFICATION } from '../fidelity/product-classes.mjs';
import { build as buildR15 } from '../fidelity/build-r15-artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const LIVE = ['MOMENTUM_BREAKOUT', 'WEINSTEIN_STAGE', 'DARVAS_BOX', 'MINERVINI_VCP', 'DONCHIAN_TURTLE', 'VU_TREND_52W'];
const S = Object.fromEntries(STRATEGIES.map((s) => [s.strategy_id, s]));
const VALID = new Set(Object.values(PROVENANCE));
const ruleOf = (s, id) => s.rules.find((r) => r.rule_id === id);
const cardTexts = (s) => {
  const c = s.rule_cards[0], out = [s.story, s.tagline, ...(s.how_it_thinks || []), ...(s.prohibited_interpretations || []), c.executable.note, c.source_basis.note, c.plan.exitSummary];
  for (const x of [...c.sections, ...c.edge_cases]) out.push(x.text);
  for (const [, v] of Object.entries(s)) if (v && typeof v === 'object' && !Array.isArray(v) && 'evidence' in v && typeof v.text === 'string') out.push(v.text);
  return out.filter((t) => typeof t === 'string');
};

/* ---------------------------------------------------------------- A */
test('M1-A Version-zu-Regel: Regeln früherer Versionen erscheinen bei der laufenden Version nicht als aktiv', () => {
  for (const id of LIVE) {
    const s = S[id], v = s.strategy_version;
    assert.deepEqual(versionProblems(s), [], `${id}: Regelkarte/DNA führt Legacy-Regeln`);
    assert.equal(s.rule_versioning.live_version, v);
    const active = s.rules.filter((r) => r.status === RULE_STATUS.ACTIVE);
    assert.deepEqual(s.rule_versioning.active_rule_ids, active.map((r) => r.rule_id));
    for (const r of s.rules) {
      assert.ok(Object.values(RULE_STATUS).includes(r.status), `${id}/${r.rule_id}: Status fehlt`);
      if (r.legacy_only) assert.equal(r.status, RULE_STATUS.LEGACY, `${id}/${r.rule_id}: legacy_only-Regel darf nicht aktiv sein`);
      if (r.status === RULE_STATUS.ACTIVE) assert.equal(r.active_in_version, v);
      if (r.status === RULE_STATUS.LEGACY) { assert.ok(r.last_active_version && r.last_active_version !== v, `${id}/${r.rule_id}: letzte Version fehlt`); assert.equal(r.active_in_version, null); }
    }
    const counts = s.rule_cards[0].source_basis.ruleCounts;
    assert.equal(counts.active, active.length, `${id}: Zähler zählt nur aktive Regeln`);
    assert.equal(counts.retired, s.rules.filter((r) => r.status === RULE_STATUS.LEGACY).length);
    assert.equal(counts.original + counts.original_interpretation + counts.vu_formalization + counts.vu_own + counts.foreign + counts.unresolved + counts.not_public, active.length, `${id}: Herkunftszähler ≠ aktive Regeln`);
  }
});

test('M1-A2 Bekannte Altregeln sind je Version als „nicht mehr aktiv“ geführt (Befunde R15-T05 … T10, T33, T43)', () => {
  const legacy = {
    WEINSTEIN_STAGE: ['WEIN-TRAIL-VU', 'WEIN-ST2-01', 'WEIN-VOL-01', 'WEIN-VOL-03', 'WEIN-STOP-VU', 'WEIN-RS-01', 'LC-CONFIRM-CLOSE'],
    MINERVINI_VCP: ['MIN-LOW-01', 'MIN-ENTRY-D1', 'MIN-STOP-VU', 'MIN-EXIT-VU-01', 'MIN-WARN-01'],
    MOMENTUM_BREAKOUT: ['KK-BO-ENTRY-D1', 'KK-BO-GAP-01', 'KK-BO-STOP-D1', 'KK-BO-TRAIL-01', 'KK-BO-TREND-01', 'LC-CONFIRM-CLOSE'],
    DARVAS_BOX: ['DAR-ENTRY-D1', 'DAR-STOP-02', 'LC-CONFIRM-CLOSE'],
    DONCHIAN_TURTLE: ['DON-ENTRY-D1', 'DON-STOP-01', 'DON-EXIT-01', 'LC-CONFIRM-CLOSE'],
  };
  for (const [id, ids] of Object.entries(legacy)) for (const rid of ids) assert.equal(ruleOf(S[id], rid)?.status, RULE_STATUS.LEGACY, `${id}/${rid}`);
  // Minervini kauft per Schlusskurs: LC-CONFIRM-CLOSE gilt dort weiter
  assert.equal(ruleOf(S.MINERVINI_VCP, 'LC-CONFIRM-CLOSE').status, RULE_STATUS.ACTIVE);
  assert.equal(ruleOf(S.MINERVINI_VCP, 'MIN-LOW-02').status, RULE_STATUS.ACTIVE);
  assert.equal(ruleOf(S.MINERVINI_VCP, 'MIN-ENTRY-D2').status, RULE_STATUS.ACTIVE);
  // Weinstein 3.x darf Regeln haben, die 4.0.0 nicht hat; die Version 4.0.0 führt den Nachzieh-Stop nicht als aktiv
  assert.ok(!S.WEINSTEIN_STAGE.rule_versioning.active_rule_ids.includes('WEIN-TRAIL-VU'));
  assert.ok(S.WEINSTEIN_STAGE.rule_versioning.not_implemented_rule_ids.includes('WEIN-TRAIL-ORIG'));
  assert.ok(!/nachgezogen|nachziehen/i.test(S.WEINSTEIN_STAGE.rule_cards[0].plan.exitSummary.replace(/kein nachgezogener Stop/i, '')), 'Weinstein-Exit behauptet einen nachgezogenen Stop');
  assert.match(S.WEINSTEIN_STAGE.rule_cards[0].sections.find((x) => x.id === 'hold').text, /keinen nachgezogenen Stop/);
});

test('M1-A3 Die Versionsprüfung schlägt an, wenn eine Legacy-Regel als aktive Regel in die Regelkarte gelangt (synthetisch)', () => {
  const s = structuredClone(S.WEINSTEIN_STAGE);
  assert.deepEqual(versionProblems(s), []);
  s.rule_cards[0].sections.find((x) => x.id === 'hold').rules.push('WEIN-TRAIL-VU');
  assert.match(versionProblems(s).join('\n'), /Legacy-Regeln WEIN-TRAIL-VU/);
  s.trailing_stop.rules = ['WEIN-TRAIL-VU'];
  assert.match(versionProblems(s).join('\n'), /DNA\.trailing_stop/);
});

test('M1-A4 Oberfläche trennt aktive und frühere Regeln und zählt nur aktive Regeln', () => {
  const js = fs.readFileSync(path.join(root, 'supertrader/assets/supertrader.js'), 'utf8');
  assert.match(js, /function rulesBlock/);
  assert.match(js, /Nicht mehr aktiv – Regeln früherer Versionen/);
  assert.ok(!/Alle Regeln mit Herkunft \(' \+ s\.rules\.length/.test(js), 'UI darf nicht mehr alle Regeln als eine Liste führen');
  assert.match(js, /r\.status \|\| 'ACTIVE'/);
});

/* ---------------------------------------------------------------- B */
test('M1-B Keine VU-Regel gilt als Originalregel: Klasse folgt Flag, Quelle und Herkunft', () => {
  for (const id of LIVE) for (const r of S[id].rules) {
    assert.ok(VALID.has(r.provenance_class), `${id}/${r.rule_id}: ${r.provenance_class}`);
    const refs = r.source_reference || [];
    if (r.VU_formalization_flag && r.provenance_class === PROVENANCE.ORIGINAL) assert.fail(`${id}/${r.rule_id}: VU-Regel als Original`);
    if (['VU_FORMALIZATION', 'VU_EXTENSION'].includes(r.evidence_status)) assert.notEqual(r.provenance_class, PROVENANCE.ORIGINAL, `${id}/${r.rule_id}`);
    if (refs.length && refs.every((x) => x === 'SRC-INTERNAL-VU')) assert.ok([PROVENANCE.VU_OWN, PROVENANCE.VU_FORMALIZATION, PROVENANCE.FOREIGN_RULE].includes(r.provenance_class), `${id}/${r.rule_id}: nur VU-Quelle, aber ${r.provenance_class}`);
    if (refs.some((x) => /^SRC-TF-/.test(x))) assert.notEqual(r.provenance_class, PROVENANCE.ORIGINAL, `${id}/${r.rule_id}: TraderFox-Quelle als Original`);
  }
  // Einzelfälle aus R15
  const cls = (id, rid) => ruleOf(S[id], rid).provenance_class;
  assert.equal(cls('WEINSTEIN_STAGE', 'WEIN-EXIT-01'), PROVENANCE.VU_FORMALIZATION);
  assert.equal(cls('WEINSTEIN_STAGE', 'WEIN-SIZE-VU'), PROVENANCE.FOREIGN_RULE);
  assert.equal(ruleOf(S.WEINSTEIN_STAGE, 'WEIN-SIZE-VU').foreign_from, 'Kullamägi');
  assert.equal(cls('MINERVINI_VCP', 'MIN-ENTRY-D2'), PROVENANCE.FOREIGN_RULE);
  assert.equal(cls('MINERVINI_VCP', 'MIN-EXIT-02'), PROVENANCE.UNRESOLVED);
  assert.equal(cls('MINERVINI_VCP', 'MIN-BE-01'), PROVENANCE.ORIGINAL);
  assert.equal(cls('DONCHIAN_TURTLE', 'TUR-RANK-ALPHA'), PROVENANCE.VU_OWN);
  assert.equal(cls('MOMENTUM_BREAKOUT', 'LC-COOLDOWN-01'), PROVENANCE.VU_OWN);
});

test('M1-B2 Abschnitts-Kennzeichen sind nie „Original“, wenn eine Methodenregel VU-eigen, fremd oder ungeklärt ist', () => {
  const rank = (k) => ['UNRESOLVED', 'FOREIGN_RULE', 'VU_OWN', 'NOT_PUBLIC', 'VU_FORMALIZATION', 'ORIGINAL_INTERPRETATION', 'ORIGINAL'].indexOf(k);
  for (const id of LIVE) {
    const c = S[id].rule_cards[0], byId = new Map(S[id].rules.map((r) => [r.rule_id, r]));
    for (const x of [...c.sections, ...c.edge_cases]) {
      if (x.provenance === 'NONE') continue;
      const method = x.rules.map((rid) => byId.get(rid)).filter((r) => r.status === RULE_STATUS.ACTIVE && r.rule_kind !== 'MECHANICS');
      for (const r of method) assert.ok(rank(x.provenance) <= rank(r.provenance_class), `${id}/${x.id}: Kennzeichen ${x.provenance} milder als ${r.rule_id} (${r.provenance_class})`);
    }
  }
  assert.equal(S.DARVAS_BOX.rule_cards[0].sections.find((x) => x.id === 'execution').provenance, PROVENANCE.FOREIGN_RULE, 'Marktampel gehört zum Ausführungsabschnitt');
  assert.equal(S.MINERVINI_VCP.rule_cards[0].sections.find((x) => x.id === 'exit').provenance, PROVENANCE.UNRESOLVED);
});

test('M1-B3 Prozesskette: Schritte mit Klasse ORIGINAL nennen keine VU-, TraderFox- oder O’Neil-Herkunft; alle Klassen sind R15-Klassen', () => {
  for (const [id, chain] of Object.entries(PROCESS_CHAIN)) for (const st of chain.steps) {
    assert.ok(CHAIN_CLASSES.includes(st.cls), `${id}/${st.step}: Klasse ${st.cls}`);
    if (st.cls === 'ORIGINAL') { assert.ok(!/\bVU\b|TraderFox|O.Neil/.test(st.source + (st.step === 'Quelle' ? '' : ' ' + st.rule)), `${id}/${st.step}: ORIGINAL trotz fremder/VU-Herkunft`); assert.ok(!st.from); }
    if (st.cls === 'FOREIGN_RULE') assert.ok(st.from, `${id}/${st.step}: Fremdregel ohne Herkunft`);
  }
  assert.equal(PROCESS_CHAIN.WEINSTEIN_STAGE.steps.find((x) => x.step === 'Positionsgröße').cls, 'FOREIGN_RULE');
  assert.equal(PROCESS_CHAIN.WEINSTEIN_STAGE.steps.find((x) => x.step === 'Nachziehen des Stops').cls, 'MISSING');
  assert.equal(PROCESS_CHAIN.MINERVINI_VCP.steps.find((x) => x.step === 'Ausstieg').cls, 'UNRESOLVED');
});

test('M1-B4 Jeder Registry-Text über das Original einer Regel stimmt mit ihrer Klasse überein (Registry ↔ Herkunftsklassen ↔ Labels)', () => {
  assert.deepEqual(Object.keys(PROVENANCE_LABELS).sort(), Object.values(PROVENANCE).sort());
  assert.equal(PROVENANCE_LABELS[PROVENANCE.ORIGINAL].label, 'Original');
  for (const k of Object.values(PROVENANCE)) if (k !== PROVENANCE.ORIGINAL) assert.notEqual(PROVENANCE_LABELS[k].label, 'Original');
});

/* ---------------------------------------------------------------- C */
test('M1-C Replication-Anspruch: nur bei HIGH in allen Kernbereichen; heute für keine Live-Version', () => {
  for (const id of LIVE) {
    const p = productOf(S[id]);
    assert.equal(p.replication_claim_allowed, false, id);
    assert.notEqual(p.product_class, PRODUCT_CLASS.REPLICATION, id);
    const core = [p.entry_fidelity, p.exit_fidelity, p.position_sizing_fidelity, p.portfolio_fidelity, p.risk_fidelity];
    assert.ok(core.some((x) => x !== 'HIGH') || p.hard_gate.blocking_portfolio_fields.length > 0, `${id}: Gate ohne Begründung`);
    assert.equal(p.live_version, S[id].strategy_version);
    for (const k of ['entry_fidelity', 'exit_fidelity', 'position_sizing_fidelity', 'portfolio_fidelity', 'fundamental_fidelity', 'market_fidelity']) assert.ok(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'].includes(p[k]), `${id}/${k}`);
  }
  assert.equal(productOf(S.MOMENTUM_BREAKOUT).product_class, PRODUCT_CLASS.VU_ADAPTATION);
  assert.equal(productOf(S.DONCHIAN_TURTLE).product_class, PRODUCT_CLASS.VU_ADAPTATION);
  assert.equal(productOf(S.VU_TREND_52W).product_class, PRODUCT_CLASS.VU_NATIVE);
});

test('M1-C2 Der Hard Gate schlägt an, sobald ein Replication-Anspruch trotz LOW/UNKNOWN oder VU-eigenem Kernbereich gesetzt wird (synthetisch)', () => {
  for (const [id, mutate] of [
    ['WEINSTEIN_STAGE', (c) => { c.replicationClaimAllowed = true; }],
    ['MOMENTUM_BREAKOUT', (c) => { c.replicationClaimAllowed = true; }],
    ['DONCHIAN_TURTLE', (c) => { c.replicationClaimAllowed = true; c.productClass = PRODUCT_CLASS.REPLICATION; }],
  ]) {
    const c = LIVE_CLASSIFICATION[id], before = { ...c };
    try { mutate(c); assert.throws(() => buildR15(), /widerspricht dem Hard Gate/, id); } finally { Object.assign(c, before); }
  }
  // Auch alle Kernbereiche HIGH genügen nicht, wenn ein Portfoliofeld VU-eigen ist (Kullamägi: Höchstzahl, Hebel)
  const c = LIVE_CLASSIFICATION.MOMENTUM_BREAKOUT, before = structuredClone(c);
  try { c.replicationClaimAllowed = true; c.productClass = PRODUCT_CLASS.REPLICATION; for (const k of ['entry', 'portfolio', 'sizing', 'exit']) c.fidelity[k] = 'HIGH'; assert.throws(() => buildR15(), /Hard Gate/); } finally { Object.assign(c, before); c.fidelity = before.fidelity; }
  const m = buildR15().matrix.strategies;
  for (const v of Object.values(m)) assert.equal(v.REPLICATION_CLAIM_ALLOWED, false);
  assert.ok(CORE_AREAS.includes('portfolio'));
});

test('M1-C3 Namen: keine Live-Version trägt „Replication“ im Namen; Produktklasse steht im Strategienamen', () => {
  const expected = {
    MOMENTUM_BREAKOUT: 'VU Adaptation – Kullamägi Breakout', WEINSTEIN_STAGE: 'VU Adaptation – Weinstein Stage Analysis', DARVAS_BOX: 'VU Adaptation – Darvas',
    MINERVINI_VCP: 'VU Adaptation – Minervini', DONCHIAN_TURTLE: 'VU Equity Adaptation – Turtle Trading', VU_TREND_52W: 'VU Native – Trendfolge 52W',
  };
  for (const [id, name] of Object.entries(expected)) { assert.equal(S[id].strategy_name, name); assert.equal(LIVE_CLASSIFICATION[id].displayName, name); assert.ok(!/replic|replik/i.test(name + ' ' + S[id].originator + ' ' + S[id].tagline), id); }
  for (const k of Object.keys(PRODUCT_CLASS_LABELS)) assert.ok(PRODUCT_CLASS_LABELS[k].label);
});

/* ---------------------------------------------------------------- D */
const SEPA_CLAIM = [/bildet\s+(minervinis\s+)?sepa\s+(vollständig\s+)?ab/i, /sepa[- ](fundamental)?\w*\s+(wird|werden)\s+(angewandt|angewendet|geprüft|umgesetzt)/i, /(prüft|filtert|nutzt|verwendet)\s+(zeitpunktgenaue\s+)?(eps|umsatz|gewinn|margen|fundamentaldaten)(?!\s*\))/i, /mit\s+sepa(-fundamental)?filter/i, /sepa\s+vollständig/i];
const claimsSepa = (t) => SEPA_CLAIM.some((re) => re.test(t) && !/\b(nicht|keine?n?|ohne|weder)\b/i.test(t));

test('M1-D Minervini Live: keine SEPA-Komponente wird behauptet, die der Live-Code nicht nutzt; der tatsächliche Stand ist exakt dargestellt', () => {
  const s = S.MINERVINI_VCP, chain = PROCESS_CHAIN.MINERVINI_VCP;
  const texts = [...cardTexts(s), ...chain.steps.flatMap((x) => [x.rule, x.source]), chain.finding, ...FIDELITY.MINERVINI_VCP.rules.flatMap((r) => [r.code, r.note || ''])];
  for (const t of texts) assert.ok(!claimsSepa(t), `Minervini-Text behauptet SEPA: ${t.slice(0, 120)}`);
  // Live-Code: kein fund im Live-Kontext, keine Gewinnprüfung in 2.0.0
  const live = LIVE_ENGINES.find((e) => e.id === 'MINERVINI_VCP');
  assert.equal(live.version, '2.0.0');
  for (const f of ['engine/strategies/minervini-v2.mjs', 'engine/strategies/minervini.mjs']) assert.ok(!/earnings|ctx\.fund/i.test(fs.readFileSync(path.join(root, 'scripts/supertrader', f), 'utf8').replace(/\/\/.*$/gm, '')), `${f} nutzt Fundamentaldaten`);
  assert.ok(!/const ctxOf = [^\n]*fund/.test(fs.readFileSync(path.join(root, 'scripts/supertrader/build.mjs'), 'utf8')));
  assert.equal(ruleOf(s, 'MIN-FUND-HYBRID').status, RULE_STATUS.NOT_IMPLEMENTED);
  assert.ok(!s.rule_versioning.active_rule_ids.includes('MIN-FUND-HYBRID'));
  // exakter Stand laut Auftrag
  const fund = s.fundamental_filters.text;
  for (const must of ['keine Fundamentaldaten', 'EPS', 'Umsatz', 'Forschungsversion 3.0.0', 'Margen', 'Analystenschätzungen', 'Überraschungen', 'institutionelle', 'Branchenrang']) assert.ok(fund.includes(must), `fundamental_filters nennt „${must}“ nicht`);
  assert.ok(!/keine Fundamentaldaten (vorhanden|verfügbar)|besitzt keine Fundamentaldaten/i.test(fund + chain.steps.map((x) => x.rule).join(' ')), 'Falsch: „Vision Universe besitzt keine Fundamentaldaten“');
  assert.match(chain.steps.find((x) => x.step === 'Fundamentaldaten (SEPA)').rule, /liegen vor/);
  assert.equal(chain.steps.find((x) => x.step === 'Fundamentaldaten (SEPA)').cls, 'MISSING');
  assert.match(s.story, /verwendet es nicht/);
});

test('M1-D2 Der SEPA-Prüfer erkennt die falsche Aussage und lässt die korrekte zu (synthetisch)', () => {
  assert.equal(claimsSepa('Vision Universe bildet Minervinis SEPA vollständig ab.'), true);
  assert.equal(claimsSepa('Das Modell prüft Gewinn und Umsatz zum Stichtag.'), true);
  assert.equal(claimsSepa('Live 2.0.0 verwendet keine Fundamentaldaten (weder Filter noch Anzeige).'), false);
  assert.equal(claimsSepa('Die Forschungsversion 3.0.0 nutzt Teile davon und ging nicht live.'), false);
});

/* ---------------------------------------------------------------- E */
test('M1-E Darvas: TraderFox-Regeln und VU-Zahlen stehen nicht als Darvas-Original', () => {
  const s = S.DARVAS_BOX, cls = (id) => ruleOf(s, id).provenance_class;
  assert.equal(cls('PORT-MARKET-200'), PROVENANCE.FOREIGN_RULE); assert.equal(ruleOf(s, 'PORT-MARKET-200').foreign_from, 'TraderFox');
  assert.equal(cls('DAR-BOX-01'), PROVENANCE.FOREIGN_RULE); assert.equal(cls('DAR-BOX-02'), PROVENANCE.FOREIGN_RULE);
  assert.equal(cls('DAR-STOP-03'), PROVENANCE.VU_OWN, '1-%-Stop ist kein Darvas-Original');
  assert.equal(cls('DAR-SIZE-VU'), PROVENANCE.FOREIGN_RULE); assert.equal(ruleOf(s, 'DAR-SIZE-VU').foreign_from, 'Kullamägi');
  assert.ok(!s.rules.some((r) => r.status === RULE_STATUS.ACTIVE && /^SRC-TF/.test((r.source_reference || []).join(',')) && [PROVENANCE.ORIGINAL, PROVENANCE.ORIGINAL_INTERPRETATION].includes(r.provenance_class)));
  const chain = PROCESS_CHAIN.DARVAS_BOX.steps;
  const ampel = chain.find((x) => x.step === 'Marktampel'); assert.equal(ampel.cls, 'FOREIGN_RULE'); assert.equal(ampel.from, 'TraderFox');
  assert.notEqual(chain.find((x) => x.step === 'Ausstieg').cls, 'ORIGINAL');
  assert.equal(chain.find((x) => x.step === 'Positionsgröße').cls, 'FOREIGN_RULE');
  for (const st of chain.filter((x) => x.cls === 'ORIGINAL')) assert.ok(!/Marktampel|100\s?%|Dreitage|3-Tage|1\s?%/.test(st.rule), `ORIGINAL-Schritt „${st.step}“ nennt eine Nicht-Darvas-Regel`);
  // Quellentrennung: Darvas / TraderFox / VU Adaptation / Trend52
  assert.equal(S.VU_TREND_52W.strategy_name, 'VU Native – Trendfolge 52W');
  const darvasTexts = cardTexts(s).concat(chain.flatMap((x) => [x.rule]));
  for (const t of darvasTexts) if (/100\s?%\s*seit/i.test(t)) assert.match(t, /TraderFox|nicht|Trendfolge/, `100-%-Regel ohne Abgrenzung: ${t.slice(0, 100)}`);
  assert.match(s.initial_stop.text, /VU/); assert.match(s.market_regime.text, /TraderFox/);
  assert.ok(S.DARVAS_BOX.prohibited_interpretations.some((t) => /1-%-Stop/.test(t)) && S.DARVAS_BOX.prohibited_interpretations.some((t) => /Marktampel/.test(t)) && S.DARVAS_BOX.prohibited_interpretations.some((t) => /100-%-Regel/.test(t)));
  assert.ok(!S.DARVAS_BOX.rule_versioning.active_rule_ids.includes('DAR-ENTRY-D1'), 'Schlusskurs-Einstieg ist nicht mehr aktiv');
  assert.doesNotMatch(ruleOf(s, 'DAR-ENTRY-01').plain_language_explanation, /Live wird DAR-ENTRY-D1/);
});

/* ---------------------------------------------------------------- F */
const FUTURES_REPLICATION = /(vollständige|originalgetreue|echte)\s+replikation|replikation\s+des\s+(original-?)?(futures|turtle)|original-?turtle-?system\s+(wird|läuft)|bildet\s+das\s+(original-?)?turtle/i;
test('M1-F Turtle: Live-Version ist eine Equity Adaptation und wird nirgends als Futures-Replikation dargestellt', () => {
  const s = S.DONCHIAN_TURTLE, p = productOf(s);
  assert.equal(p.product_class, PRODUCT_CLASS.VU_ADAPTATION); assert.match(p.display_name, /Equity Adaptation/); assert.equal(p.replication_claim_allowed, false);
  const chain = PROCESS_CHAIN.DONCHIAN_TURTLE;
  const texts = [...cardTexts(s), ...chain.steps.flatMap((x) => [x.rule, x.source]), chain.finding, s.strategy_name, s.originator];
  for (const t of texts) if (FUTURES_REPLICATION.test(t)) assert.match(t, /keine\s+Replikation|nicht/i, `Turtle-Text stellt eine Replikation dar: ${t.slice(0, 120)}`);
  assert.match(s.story, /keine Replikation/); assert.match(chain.steps[0].rule, /keine Replikation/);
  // VU-Regeln des Lebenszyklus sind benannt und VU-eigen (3 %, 6 %, 10 Sitzungen), ebenso Alphabet-Auswahl und Portfolio
  const joined = [s.rule_cards[0].edge_cases.find((x) => x.id === 'lifecycle').text, chain.steps.find((x) => x.step === 'VU-Lebenszyklus').rule].join(' ');
  for (const must of ['3 %', '6 %', '10 Sitzungen', 'verloren']) assert.ok(joined.includes(must), `Lebenszyklus-Text nennt „${must}“ nicht`);
  for (const rid of ['DON-NEAR-VU', 'DON-INV-02', 'TUR-RANK-ALPHA', 'TUR-PORT-VU']) assert.equal(ruleOf(s, rid).provenance_class, PROVENANCE.VU_OWN, rid);
  assert.match(PORTFOLIO_SOURCE_TEXT.DONCHIAN_TURTLE, /alphabetische Auswahl/); assert.match(PORTFOLIO_SOURCE_TEXT.DONCHIAN_TURTLE, /Futures/);
  assert.ok(!/keine Rangregel in der Quelle/.test(fs.readFileSync(path.join(root, 'scripts/supertrader/model-portfolio.mjs'), 'utf8').replace(/\/\/.*$/gm, '')), 'falscher Text „keine Rangregel in der Quelle“');
  for (const rid of ['TUR-RANK-ORIG', 'TUR-ADD-ORIG', 'TUR-LIMITS-ORIG']) assert.equal(ruleOf(s, rid).status, RULE_STATUS.NOT_IMPLEMENTED);
});

test('M1-F2 Der Replikations-Prüfer erkennt die falsche Turtle-Aussage und lässt die korrekte zu (synthetisch)', () => {
  assert.ok(FUTURES_REPLICATION.test('Vision Universe bietet eine vollständige Replikation des Turtle-Futures-Systems.'));
  assert.ok(!FUTURES_REPLICATION.test('Die Live-Version ist eine VU Equity Adaptation von System 1, keine Replikation.'));
});

/* ----------------------------------------------------------- Freeze */
test('M1-G Phase 1 ändert keine Strategie: Versionen, Parameter und Portfolio-Konfiguration der Live-Engines sind eingefroren', () => {
  const KEYS = ['initialEquity', 'riskPerTrade', 'maxPositionPct', 'maxPositions', 'maxExposure', 'priority', 'progressive', 'turtleNotional'];
  const snap = LIVE_ENGINES.map((e) => { const c = portfolioConfig(e); return { id: e.id, version: e.version, variant: e.variant, params: JSON.parse(JSON.stringify(e.PARAMS)), portfolio: Object.fromEntries(KEYS.map((k) => [k, c[k] ?? null]).concat([['marketFilter', !!c.marketFilter]])) }; });
  assert.deepEqual(snap.map((x) => `${x.id}@${x.version}`), ['MOMENTUM_BREAKOUT@3.2.0', 'WEINSTEIN_STAGE@4.0.0', 'DARVAS_BOX@3.0.2', 'MINERVINI_VCP@2.0.0', 'DONCHIAN_TURTLE@2.0.2']);
  // Wert gilt bis zu einer bewusst freigegebenen neuen Version (Migration Phase 5/6); dann wird er mit der neuen Version aktualisiert.
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(snap)).digest('hex'), '1b89b7bb767ba2549af6b079ed06a0ab0cc52cebbd3e1819c75f7ff7b8b6f433');
});

/* ---------------------------------------------- Alle 56 Live-Aussagen */
const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out)); return out; };

test('M1-H Alle 56 geprüften Live-Aussagen aus R15 sind aufgelöst (korrigiert oder unverändert bestätigt) und im Phase-1-Dokument aufgeführt', () => {
  const audit = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/fidelity/audit/live-text-audit.json'), 'utf8'));
  const res = JSON.parse(fs.readFileSync(path.join(root, 'scripts/supertrader/fidelity/audit/phase1-statements.json'), 'utf8'));
  const doc = fs.readFileSync(path.join(root, 'docs/SUPERTRADER_MIGRATION_PHASE1.md'), 'utf8');
  assert.equal(audit.statements.length, 56);
  assert.deepEqual(res.statements.map((x) => x.id), audit.statements.map((x) => x.id));
  for (const x of res.statements) {
    assert.ok(Object.keys(res.statuses).includes(x.status), x.id);
    assert.ok(x.where && x.resolution, `${x.id}: Auflösung fehlt`);
    assert.ok(doc.includes(x.id), `${x.id} fehlt im Phase-1-Dokument`);
    // Aussagen, die vor Phase 1 vom Code oder von der Live-Version abwichen, müssen korrigiert sein
    if (x.matchedCodeBefore === false || x.matchedVersionBefore === false) assert.equal(x.status, 'CORRECTED', `${x.id}: Abweichung ohne Korrektur`);
  }
  const n = (st) => res.statements.filter((x) => x.status === st).length;
  assert.equal(n('CORRECTED') + n('VERIFIED_UNCHANGED') + n('VERIFIED_LABELS_REFINED'), 56);
  assert.match(doc, new RegExp(`${n('CORRECTED')} korrigiert`));
});

test('M1-H2 Suche in allen Live-Texten: „Originalmethode“, „Replikation“ und „reproduziert“ erscheinen nur verneint; keine Behauptung „wie in den Originalquellen beschrieben“', () => {
  const texts = [...strings(STRATEGIES.filter((s) => LIVE.includes(s.strategy_id)).map((s) => ({ ...s, rules: s.rules.map((r) => r.plain_language_explanation) }))), ...strings(PROCESS_CHAIN), ...strings(FIDELITY)];
  const js = fs.readFileSync(path.join(root, 'supertrader/assets/supertrader.js'), 'utf8');
  const all = [...texts, ...(js.match(/'[A-ZÄÖÜ0-9][^'\n]{29,}'/g) || [])].filter((t) => !/[A-Z]{2,}_[A-Z_]{2,}/.test(t)); // Code-Bezeichner sind keine Kundentexte
  for (const t of all) for (const sent of t.split(/(?<=[.!?])\s+/)) {
    if (/originalmethode|traderfox[^.]{0,40}reproduziert|replikation|replication/i.test(sent) && !/\b(nicht|kein|keine|keiner|weder|ohne|Ist heute|heute erfüllt|zulässig|Zustand|Anspruch|Replication-Bezeichnung)\b/i.test(sent)) assert.fail(`Behauptung ohne Verneinung: ${sent.slice(0, 140)}`);
  }
  assert.ok(!/wie in den Originalquellen beschrieben/.test(js));
  assert.ok(!/Dieselben Regeln wie live, an echten vergangenen Kursen nachgespielt/.test(js));
});

test('M1-I Kundentexte (Regelkarte, DNA, Prozesskette, Portfolio-Quelle) enthalten keine internen Regelcodes (Browser-QA prüft dasselbe auf der Seite)', () => {
  const re = /\b(?:DON|KK|DAR|MIN|WEIN?|LC|PILOT|TUR|TR52|PORT)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
  const prose = [];
  for (const id of LIVE) {
    const s = S[id], c = s.rule_cards[0];
    prose.push(...cardTexts(s), ...(c.executable.gaps || []));
  }
  for (const chain of Object.values(PROCESS_CHAIN)) prose.push(chain.finding, ...chain.steps.flatMap((x) => [x.rule, x.source]));
  prose.push(...Object.values(PORTFOLIO_SOURCE_TEXT));
  for (const t of prose) assert.deepEqual(t.match(re) || [], [], `interner Code im Kundentext: ${t.slice(0, 100)}`);
});
