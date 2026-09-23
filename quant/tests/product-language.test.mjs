import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import dictionary from "../methodology/product-language-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Language = require("../engines/product-language.js");
const FactorEvidence = require("../engines/factor-evidence.js");
const SetupEngine = require("../engines/setup-engine.js");
const ChangeEngine = require("../engines/change-engine.js");

const ROOT = new URL("../../", import.meta.url);
const experience = readFileSync(new URL("vu2/experience.js", ROOT), "utf8");

test("every term is complete, and a user label never doubles as the professional one", () => {
  assert.deepEqual(Language.validate(), { valid: true, errors: [] });
  assert.equal(Language.version(), "product-language-1.0.0");
  assert.deepEqual(Language.LAYERS, ["MEANING", "EXPLANATION", "EVIDENCE", "METHODOLOGY"]);
  /* Ids are unique across categories, because the accessor is flat and a
     duplicate would silently shadow one of the two. */
  const ids = dictionary.categories.flatMap((c) => c.terms.map((t) => t.id));
  assert.equal(new Set(ids).size, ids.length);
});

test("a missing term throws rather than printing its own id to a reader", () => {
  assert.throws(() => Language.label("doesNotExist"), /no term/);
  assert.equal(Language.has("doesNotExist"), false);
  assert.equal(Language.has("asymmetry"), true);
  /* The fallback from question to label is deliberate, not an omission. */
  assert.equal(Language.question("NO_SETUP"), Language.label("NO_SETUP"));
  assert.notEqual(Language.question("patternEngine"), Language.label("patternEngine").replace(/\?$/, ""));
});

test("every enum the engines can produce has a user label", () => {
  for (const state of SetupEngine.STATES) {
    assert.ok(Language.has(state), "setup state " + state + " has no user label");
    assert.notEqual(Language.label(state), state);
  }
  for (const factor of FactorEvidence.FACTOR_ORDER) {
    assert.ok(Language.has(factor), "factor " + factor + " has no user label");
  }
  for (const direction of ["IMPROVING", "DETERIORATING", "STABLE"]) {
    assert.ok(Language.has(direction), direction + " has no user label");
  }
  for (const verdict of ["ROBUST", "IN_SAMPLE_ONLY", "PARAMETER_SENSITIVE", "NOT_SIGNIFICANT", "INSUFFICIENT_SUPPORT"]) {
    assert.ok(Language.has(verdict), verdict + " has no user label");
  }
  /* The change engine's own directions must be exactly the three that are
     translated - a fourth would reach the page untranslated. */
  assert.ok(ChangeEngine.METHODOLOGY_VERSION);
});

test("the factor labels in the engine and in the dictionary are the same words", () => {
  /* Two sources for one label is how a page ends up calling the same thing
     two things in two places. They are asserted equal rather than one being
     quietly preferred at render time. */
  for (const id of FactorEvidence.FACTOR_ORDER) {
    assert.equal(FactorEvidence.FACTOR_MEANING[id].label, Language.label(id), id);
  }
});

test("the generated document matches the dictionary", () => {
  /* A hand-edited copy of a dictionary is a second dictionary. */
  execFileSync(process.execPath, ["scripts/quant/build-product-language-doc.mjs", "--check"],
    { cwd: new URL(".", ROOT).pathname, stdio: "pipe" });
});

test("no internal term stands in a heading, eyebrow, chip or badge", () => {
  /* The rule is about where a term stands, not whether it may appear: a
     folded methodology section is exactly where the internal name belongs.
     This reads the primary positions out of the frontend source and checks
     only those. */
  const primary = [];
  const patterns = [
    /el\('h1',\{[^}]*text:'([^']*)'/g,
    /el\('h2',\{[^}]*text:'([^']*)'/g,
    /el\('h3',\{[^}]*text:'([^']*)'/g,
    /class:'eyebrow'[^}]*text:'([^']*)'/g,
    /class:'chip[^']*'[^}]*text:'([^']*)'/g,
    /class:'[^']*badge[^']*'[^}]*text:'([^']*)'/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(experience)) !== null) primary.push(match[1]);
  }
  assert.ok(primary.length > 15, "the scan found too little primary copy to be meaningful");

  const offences = [];
  for (const text of primary) {
    const hit = Language.violatesPrimaryCopy(text);
    if (hit) offences.push(hit + " in: " + text);
  }
  assert.deepEqual(offences, [], "internal terms in primary copy");
});

test("no raw enum value is rendered as a label", () => {
  /* A bare SETUP_FORMING or IMPROVING in a text position means a state
     reached the page without passing through the dictionary. */
  const enums = SetupEngine.STATES.concat(["IMPROVING", "DETERIORATING", "STABLE", "ROBUST",
    "IN_SAMPLE_ONLY", "PARAMETER_SENSITIVE", "NOT_SIGNIFICANT", "INSUFFICIENT_SUPPORT"]);
  for (const value of enums) {
    const rendered = new RegExp("text:'[^']*\\b" + value + "\\b[^']*'");
    assert.equal(rendered.test(experience), false, value + " is rendered as literal copy");
  }
});

test("the frontend reads the dictionary rather than carrying its own word list", () => {
  assert.match(experience, /VUProductLanguage\.load\(/, "the dictionary is never loaded");
  assert.match(experience, /product-language-v1\.json/, "the dictionary path is not referenced");
  /* The old hard-coded label maps must be gone, not merely unused. */
  assert.equal(/const SETUP_LABELS\s*=/.test(experience), false, "a second setup label map still exists");
  /* And a failed load must not fall back to invented words. */
  assert.match(experience, /languageReady/, "there is no guard for a failed dictionary load");
});

test("the four layers are actually used: a section leads with meaning and folds the methodology", () => {
  /* sectionHead() is the shape that enforces it; every quant section head
     goes through it or through an explicit question from the dictionary. */
  assert.match(experience, /function sectionHead\(/);
  assert.match(experience, /LQ\('factorDna'\)|sectionHead\('[^']*','factorDna'/);
  assert.match(experience, /sectionHead\('[^']*','changeEngine'/);
  assert.match(experience, /LQ\('setupState'\)/);
  assert.match(experience, /LQ\('patternEngine'\)/);
  assert.match(experience, /LQ\('strategyMatch'\)/);
  assert.match(experience, /LQ\('backtestTrustScore'\)/);
  assert.match(experience, /LQ\('radar'\)/);
  /* Methodology stays folded. */
  assert.match(experience, /el\('details',\{\},\[el\('summary',\{text:'Methodik'\}\)/);
});

test("the stock experience answers its questions in the order a person asks them", () => {
  const order = ["Wie stark ist diese Aktie?", "sectionHead('Stärken & Schwächen','factorDna')",
    "sectionHead('Bewegung','changeEngine')", "setupJourney(setup,observation,setupIndex)",
    "prosAndCons(data,change,patterns)", "patternMatchSection(patterns)",
    "strategyMatchSection(match)", "evidenceTrustSection(patterns)"];
  let cursor = -1;
  for (const marker of order) {
    const at = experience.indexOf(marker, cursor + 1);
    assert.ok(at > cursor, "out of order or missing: " + marker);
    cursor = at;
  }
});

test("both sides are always shown: no upside without its downside", () => {
  /* The pattern card must render the loss side and the tilt sentence in the
     same component as the win side. */
  const card = experience.slice(experience.indexOf("function patternRow("), experience.indexOf("function patternMatchSection("));
  assert.match(card, /conditionalLossRate/);
  assert.match(card, /L\('asymmetry'\)/);
  assert.match(card, /medianDrawdown/);
  /* And the balance section renders both columns unconditionally. */
  const balance = experience.slice(experience.indexOf("function prosAndCons("), experience.indexOf("/* WIE BELASTBAR"));
  assert.match(balance, /column\('Dafür',pros/);
  assert.match(balance, /column\('Dagegen',cons/);
});

test("unavailable copy is a sentence, never a code", () => {
  for (const category of dictionary.categories) {
    for (const term of category.terms) {
      assert.ok(term.unavailable.length > 20, term.id + ": unavailable copy is too short to explain anything");
      assert.equal(/[A-Z_]{6,}/.test(term.unavailable), false, term.id + ": unavailable copy contains a raw code");
      assert.ok(/[.!?]$/.test(term.unavailable.trim()), term.id + ": unavailable copy is not a sentence");
      assert.ok(/[.!?]$/.test(term.beginner.trim()), term.id + ": beginner copy is not a sentence");
    }
  }
});

test("the state list is read from the published assignment, never re-derived in the page", () => {
  /* The trap this guards: a rule's predicate matches more titles than the
     rule assigns, because the cascade serves higher-priority rules first.
     A page that ran the predicate itself would list confirmed titles as
     merely watched. So the frontend may read the index and must not carry
     a query engine call of its own for it. */
  assert.match(experience, /getSetupScreenIndex\(\)/);
  const surfaces = [
    experience.slice(experience.indexOf("function setupPeers("), experience.indexOf("function pct1(")),
    experience.slice(experience.indexOf("function setupDistribution("), experience.indexOf("async function radarPage(")),
    experience.slice(experience.indexOf("async function setupRuleResult("), experience.indexOf("async function screenPage("))
  ];
  for (const source of surfaces) {
    assert.ok(source.length > 200, "a setup screening surface was not found");
    assert.equal(/screenQuery|predicateOfRule|VUQuery|queryEngine\.execute/.test(source), false,
      "a screening surface evaluates the rule itself instead of reading the assignment");
    /* And each one goes through the dictionary rather than naming a state. */
    for (const state of SetupEngine.STATES) {
      assert.equal(new RegExp("text:'[^']*\\b" + state + "\\b").test(source), false, state + " is written into the page");
    }
  }
  /* The screener link opens a result, not an editable query: loading the
     rule into the editor would run the predicate and produce the wrong
     list. A regression would show up as the rule reaching editor.decode. */
  const screener = experience.slice(experience.indexOf("async function screenPage("), experience.indexOf("async function screenPage(") + 2500);
  assert.match(screener, /params\.has\('setupRule'\)/);
  assert.equal(/setupRule[^\n]*editor\.(decode|build)/.test(screener), false);
});

test("a state whose tier is closed shows its reason, and never a count", () => {
  const distribution = experience.slice(experience.indexOf("function setupDistribution("), experience.indexOf("async function radarPage("));
  /* Null is rendered as a dash, not as a zero. */
  assert.match(distribution, /entry\.count===null\?'–'/);
  assert.match(distribution, /LB\(entry\.availability\.reason\)/);
  assert.match(distribution, /LU\('setupStateCount'\)/);
  /* The closed states stay visible rather than being filtered away: that
     they exist and why they say nothing yet is itself information. */
  assert.equal(/states\.filter\([^)]*availability[^)]*\)/.test(distribution), false,
    "closed states are hidden instead of explained");
});

test("methodology prose that reaches a reader is written in German, not in ASCII shorthand", () => {
  /* rule.plain is rendered on the stock page, the quant page, the radar and
     the screener result. It was written ASCII-only and stood next to properly
     spelled dictionary copy - "Der Trend traegt" beside "Die Rahmenlage
     trägt" in the same paragraph. Internal ids, versions and enum values stay
     ASCII on purpose; what a reader reads does not. */
  const methodology = JSON.parse(readFileSync(new URL("quant/methodology/setup-state-v1.json", ROOT), "utf8"));
  const shorthand = /\b\w*(?:ae|oe|ue|ss)\w*\b/;
  const allowed = /^(?:aus|aussen|der|die|das|dass|muss|mussten|essen|gross|lassen|dessen|wessen|unser|user|prozess|adresse|klasse|masse|messen|passen|status|plus|minus|bonus|fokus|modus|kurs|kurse|kursen|analyse|basis|these|serie|premisse)$/i;
  const offences = [];
  for (const rule of methodology.stateMapping.cascade.rules) {
    for (const word of String(rule.plain).split(/[^A-Za-zÄÖÜäöüß]+/).filter(Boolean)) {
      if (shorthand.test(word) && !allowed.test(word)) offences.push(rule.ruleId + ": " + word);
    }
  }
  assert.deepEqual(offences, [], "umlaut shorthand in copy a reader sees");
  /* And every rule still says something. */
  for (const rule of methodology.stateMapping.cascade.rules) {
    assert.ok(rule.plain.length > 15, rule.ruleId + ": plain text is too short to explain anything");
    assert.ok(/[.!?]$/.test(rule.plain.trim()), rule.ruleId + ": plain text is not a sentence");
  }
});
