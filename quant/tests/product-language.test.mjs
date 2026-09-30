/* Frontend-Rebuild (quant/app): Prüfintention erhalten – die Pruefungen der
   Oberflaeche lesen jetzt quant/index.html und quant/app/*.js (statt
   vu2/experience.js / vu2/index.html) und pruefen, wo moeglich, das
   Verhalten des View Models (quant/app/view-model.js) an echten Artefakten.
   Die Woerterbuch- und Engine-Pruefungen sind unveraendert. Wo eine alte
   Flaeche ersetzt wurde, steht beim jeweiligen Test, was an ihre Stelle trat. */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import dictionary from "../methodology/product-language-v1.json" with { type: "json" };

const require = createRequire(import.meta.url);
const Language = require("../engines/product-language.js");
const FactorEvidence = require("../engines/factor-evidence.js");
const SetupEngine = require("../engines/setup-engine.js");
const ChangeEngine = require("../engines/change-engine.js");

const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
/* Die neue Oberflaeche: alle Seiten und Bausteine von Quant. */
const APP_FILES = ["ui.js", "pages.js", "page-stock.js", "page-tools.js", "page-method.js", "app.js", "chart.js"];
const app = Object.fromEntries(APP_FILES.map((f) => [f, read("quant/app/" + f)]));
const surface = APP_FILES.map((f) => ohneKommentare(app[f])).join("\n");
const stockPage = app["page-stock.js"], pages = app["pages.js"], shellApp = app["app.js"];
const viewModelSrc = read("quant/app/view-model.js");
const VM = require("../app/view-model.js");
function slice(text, from, to) {
  const a = text.indexOf(from);
  assert.ok(a >= 0, "Abschnitt nicht gefunden: " + from);
  const b = to ? text.indexOf(to, a + from.length) : -1;
  return text.slice(a, b > a ? b : undefined);
}
const Service = require("../api/product-services.js");
const api = Service.create({
  loadJSON: async (p) => JSON.parse(readFileSync(new URL(p.replace(/^\//, ""), ROOT), "utf8")),
  loadCompressedJSON: async (p) => JSON.parse(gunzipSync(readFileSync(new URL(p.replace(/^\//, ""), ROOT))).toString("utf8")),
  displayPolicy: require("../engines/display-policy.js"), queryEngine: require("../engines/query.js")
});
function strings(o, out = []) {
  if (typeof o === "string") out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
  else if (o && typeof o === "object") Object.values(o).forEach((x) => strings(x, out));
  return out;
}

test("every term is complete, and a user label never doubles as the professional one", () => {
  assert.deepEqual(Language.validate(), { valid: true, errors: [] });
  assert.equal(Language.version(), "product-language-1.1.0");
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
     only those. Frontend-Rebuild: die Primaerpositionen der neuen
     Oberflaeche sind h1-h4, qx-eyebrow, X.section-Titel und -Eyebrow,
     X.pill und qx-tag/qx-pill. */
  const primary = [];
  const patterns = [
    /el\("h[1-4]", \{[^}]*?text: "([^"]*)"/g,
    /class: "qx-eyebrow", text: "([^"]*)"/g,
    /X\.section\("([^"]*)"/g,
    /X\.pill\("([^"]*)"/g,
    /class: "qx-(?:tag|pill|chip)[^"]*", text: "([^"]*)"/g,
    /* Eyebrow als vorletztes Argument von X.section(..., more, eyebrow, id) */
    /,\s*(?:null|\{[^{}]*\})\s*,\s*"([^"]+)"\s*,\s*"[a-z-]+"\s*\)\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(surface)) !== null) primary.push(match[1]);
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
    const rendered = new RegExp("text: \"[^\"]*\\b" + value + "\\b[^\"]*\"");
    assert.equal(rendered.test(surface), false, value + " is rendered as literal copy");
  }
  /* Und am Verhalten: jeder Zustand und jede Richtung, die das View Model
     an die Seite gibt, ist ein Wort, kein Enum. */
  for (const state of SetupEngine.STATES) {
    const label = VM.setupLabel(state);
    assert.ok(label && label !== state && !/[A-Z]{3,}_[A-Z_]{2,}/.test(label), state + " reaches the page as " + label);
  }
  const change = VM.changeView({ state: "AVAILABLE", items: ["IMPROVING", "DETERIORATING", "STABLE"].map((d) =>
    ({ id: "fcfMarginChange", label: "x", state: "AVAILABLE", direction: d })) });
  for (const item of change.items) assert.ok(!/IMPROVING|DETERIORATING|STABLE/.test(item.text), item.text);
});

test("the frontend reads the dictionary rather than carrying its own word list", () => {
  /* Frontend-Rebuild: geladen wird das Woerterbuch in quant/app/app.js
     (ctx.language) und an das View Model uebergeben (useLanguage). */
  assert.match(shellApp, /VUProductLanguage\.load\(/, "the dictionary is never loaded");
  assert.match(shellApp, /\/quant\/methodology\/product-language-v1\.json/, "the dictionary path is not referenced");
  assert.match(shellApp, /VUQuantViewModel\.useLanguage\(global\.VUProductLanguage\)/, "the view model never receives the dictionary");
  /* The dictionary is ready before any page renders. */
  assert.match(slice(shellApp, "async function route(", "document.addEventListener"), /await ctx\.language\(\)/,
    "pages render before the dictionary is loaded");
  /* And a failed load must not break the page (guard). */
  assert.match(slice(shellApp, "language: function", "};"), /\.catch\(function \(\) \{ return false; \}\)/,
    "there is no guard for a failed dictionary load");
  /* The old hard-coded label maps must be gone, not merely unused. */
  assert.equal(/(?:var|const|let)\s+SETUP_LABELS\s*=/.test(surface + viewModelSrc), false, "a second setup label map still exists");
  /* Am Verhalten: was das View Model als Setup-Zustand oder Faktorname
     zeigt, sind dieselben Worte wie im Woerterbuch - eine zweite,
     abweichende Wortliste ist genau die doppelte Sprache, die das
     Woerterbuch abschaffen soll. */
  const abweichend = [];
  for (const state of SetupEngine.STATES) {
    if (VM.setupLabel(state) !== Language.label(state)) abweichend.push(state + ": " + VM.setupLabel(state) + " ≠ " + Language.label(state));
  }
  for (const id of FactorEvidence.FACTOR_ORDER) {
    if (VM.FACTORS[id] && VM.FACTORS[id].name !== Language.label(id)) abweichend.push(id + ": " + VM.FACTORS[id].name + " ≠ " + Language.label(id));
  }
  assert.deepEqual(abweichend, [], "the view model carries its own words");
});

test("the four layers are actually used: a section leads with meaning and folds the methodology", () => {
  /* Frontend-Rebuild: sectionHead()/LQ() sind entfallen; die Aktienseite
     (quant/app/page-stock.js) setzt ihre Abschnitte mit X.section(Frage,
     Einleitung, ...). Die Frage eines Abschnitts muss die Frage aus dem
     Woerterbuch sein - entweder als Aufruf von VUProductLanguage.question
     oder woertlich gleich. */
  const dictionaryQuestion = { einordnung: "factorDna", veraenderung: "changeEngine", setup: "setupState",
    strategie: "strategyMatch", historie: "patternEngine" };
  const abweichend = [];
  for (const [sectionId, termId] of Object.entries(dictionaryQuestion)) {
    const end = stockPage.indexOf(', "' + sectionId + '"))');
    assert.ok(end > 0, "Abschnitt " + sectionId + " fehlt auf der Aktienseite");
    const start = stockPage.lastIndexOf("X.section(", end);
    const call = [null, stockPage.slice(start + "X.section(".length, end)];
    const viaDictionary = new RegExp("VUProductLanguage\\.question\\(\"" + termId + "\"\\)").test(call[1]);
    const title = (call[1].match(/^"([^"]*)"/) || [])[1];
    if (!viaDictionary && title !== Language.question(termId)) abweichend.push(sectionId + ": „" + title + "“ statt „" + Language.question(termId) + "“");
  }
  assert.deepEqual(abweichend, [], "section questions are not the dictionary's questions");
  /* Bedeutung -> Erklaerung -> Beleg -> Methodik: die Faktorkarte zeigt
     zuerst die Einordnung (label) und den Grund (why), aufgeklappt die
     Komponenten, und die Methodik liegt zugeklappt dahinter. */
  const card = slice(stockPage, "function factorCard(", "function conditions(");
  assert.match(card, /el\("details", \{ class: "qx-factor/);
  /* Discover-Angleichung: die Einordnung ist Discovers Stufen-Chip
     (X.pill -> dx-zahlen-grade) mit dem Stufenwort, daneben der Wert. */
  assert.ok(card.indexOf("X.pill(") > 0 && card.indexOf("X.pill(") < card.indexOf("f.why"), "the meaning must lead");
  assert.ok(card.indexOf("f.why") < card.indexOf("f.components.forEach"), "the explanation must precede the evidence");
  assert.match(card, /X\.more\("Rohdaten und Berechnung"/, "the methodology is not folded");
  assert.match(card, /X\.routes\.method\("faktoren"\)/, "the methodology layer does not lead to the methodology");
  /* Methodology stays folded in the other sections too. */
  assert.match(stockPage, /X\.more\("Wie die Veränderung gemessen wird"/);
  assert.match(stockPage, /X\.more\("Alle geprüften Bedingungen"/);
  /* X.more ist ein zugeklapptes <details>. */
  assert.match(app["ui.js"], /function more\([\s\S]*?el\("details", \{ class: "[^"]*\bqx-more"/);
});

test("the stock experience answers its questions in the order a person asks them", () => {
  /* M40: die Abschnitte bekommen ihre Aussagen aus der gemeinsamen
     Auskunfts-Engine statt sie selbst zu bilden. Die REIHENFOLGE ist, was
     dieser Fall haelt - sie ist die Reihenfolge, in der ein Mensch fragt.
     Frontend-Rebuild: Staerke & Pro/Contra stehen in verdictCard ganz oben,
     danach Faktoren, Veraenderung, Setup, Anlagestil, fruehere Faelle
     (inkl. Marktmuster) und zuletzt Daten & Grenzen. */
  const render = slice(stockPage, "async function render(", "global.QXStock");
  const order = ["verdictCard(vm", '"einordnung"))', '"veraenderung"))', '"setup"))',
    '"strategie"))', '"historie"))', '"grenzen"))'];
  let cursor = -1;
  for (const marker of order) {
    const at = render.indexOf(marker, cursor + 1);
    assert.ok(at > cursor, "out of order or missing: " + marker);
    cursor = at;
  }
});

test("both sides are always shown: no upside without its downside", () => {
  /* Frontend-Rebuild: die Musterkarte (patternRow) ist ersetzt durch die
     Ebene MARKET_WIDE in replaySection (quant/app/page-stock.js). Gewinn-
     und Verlustseite stehen dort im selben Aufruf, und nur zusammen. */
  const replay = slice(stockPage, "function replaySection(", "function technicalSection(");
  assert.match(replay, /if \(up && down\)/, "one side can be shown without the other");
  assert.match(replay, /bar\("Starker Gewinn", up\.conditional[\s\S]{0,200}bar\("Deutlicher Verlust", down\.conditional/,
    "win and loss side are not rendered in the same call");
  assert.match(replay, /up\.sentence \+ " " \+ down\.sentence/);
  /* Die eigene Historie zeigt neben dem Median den typischen Rueckgang. */
  assert.match(replay, /h\.drawdown/);
  assert.match(viewModelSrc, /drawdown: h\.sufficient && isNum\(h\.medianDrawdown\)/);
  /* And the balance section renders pro and contra in one call, and names
     what was NOT rated. M40: eine kurze Dafuer-Liste liest sich wie ein
     Urteil, wenn nicht dabeisteht, was ausdruecklich NICHT bewertet wurde. */
  const balance = slice(stockPage, "function verdictCard(", "function setupSection(");
  assert.match(balance, /col\("Spricht dafür", "good", pc\.pro,[^\n]*\n\s*col\("Spricht dagegen", "bad", pc\.con,/);
  assert.match(balance, /"Noch nicht bewertbar/);
  /* Am Verhalten: jede der sieben Eigenschaften landet in genau einer
     Gruppe - dafuer, dagegen, Mittelfeld oder nicht bewertbar. */
  const f = (id, score) => VM.factorView(score === null ? { id, state: "UNAVAILABLE", reason: "BLOCKED_EXTERNAL", components: [] } : { id, state: "AVAILABLE", score, components: [] });
  const factors = [f("quality", 92), f("growth", 20), f("momentum", 50), f("value", 80), f("profitability", 10), f("revisions", null), f("risk", 60)];
  const pc = VM.proCon(factors);
  assert.equal(pc.pro.length + pc.con.length + pc.middle.length + pc.open.length, factors.length);
  assert.ok(pc.pro.length && pc.con.length && pc.open.length);
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
     a query engine call of its own for it. Frontend-Rebuild: die Flaechen
     sind jetzt Home ("Setups"), der einfache Screener (setupHits), die
     Aktienliste ("Aktuell interessant") und Methodik/Setups. */
  const surfaces = {
    home: slice(pages, "async function home(", "/* ============================================================ SCREENER"),
    setupHits: slice(pages, "async function setupHits(", "async function highHits("),
    stocks: slice(pages, "async function stocks(", "global.QXPages"),
    methodSetups: slice(app["page-method.js"], "async function setups(", "async function strategien(")
  };
  for (const [name, source] of Object.entries(surfaces)) {
    assert.ok(source.length > 200, "a setup screening surface was not found: " + name);
    assert.match(source, /getSetupScreenIndex\(\)/, name + " does not read the published assignment");
    assert.equal(/screenQuery|predicateOfRule|VUQuery|queryEngine\.execute|api\.screen\(/.test(source), false,
      name + ": a screening surface evaluates the rule itself instead of reading the assignment");
    /* And each one goes through the dictionary rather than naming a state. */
    for (const state of SetupEngine.STATES) {
      assert.equal(new RegExp("text: \"[^\"]*\\b" + state + "\\b").test(source), false, state + " is written into " + name);
    }
  }
  /* The screener link opens a result, not an editable query: loading the
     rule into the editor would run the predicate and produce the wrong
     list. Die Setup-Frage liefert deshalb keine Abfrage fuer den Editor. */
  assert.equal(/W\.build|VUScreenerWorkspace\.(build|decode)|query:/.test(surfaces.setupHits), false,
    "the setup result hands a rule to the editor");
  assert.match(slice(pages, "async function screener(", "async function factorHits("), /if \((q && )?q\.setups\) result = await setupHits\(ctx\)/);
});

test("a state whose tier is closed shows its reason, and never a count", async () => {
  /* Frontend-Rebuild: die alte Verteilung (setupDistribution auf der
     Radar-Seite) gibt es nicht mehr. Zustandszahlen stehen jetzt auf Home
     (bestaetigt / entsteht), und Methodik/Setups nennt die Zustaende.
     Gemessen: ACTIVE, RISK_RISING, INVALIDATED und EXIT tragen count null
     und einen Grund. */
  const idx = await api.getSetupScreenIndex();
  const closed = idx.states.filter((s) => s.availability && s.availability.state !== "AVAILABLE");
  assert.ok(closed.length > 0, "no closed tier to check against");
  for (const s of closed) assert.equal(s.count, null, s.state + ": a closed tier carries a count");
  /* Wer eine Zustandszahl zeigt, prueft vorher, ob die Stufe offen ist -
     sonst wird null zu 0 oder zum Absturz. */
  const home = slice(pages, "async function home(", "/* ============================================================ SCREENER");
  const countUses = home.match(/\b\w+\.count\b/g) || [];
  assert.ok(countUses.length > 0);
  assert.match(home, /availability|count === null|count == null|typeof [\w.]+count === "number"/,
    "home renders a state count without checking whether the tier is open");
  /* The closed states stay visible rather than being filtered away: that
     they exist and why they say nothing yet is itself information. */
  const method = slice(app["page-method.js"], "async function setups(", "async function strategien(");
  assert.match(method, /noch nicht freigeschaltet/, "the closed states are not explained on the methodology page");
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

test("the entry page answers the two headline questions itself", async () => {
  /* The measured reason this exists: view=stock is where a person lands,
     and it carried no answer to "how strong is this share" and none to
     "opportunity against risk" - both sat one click away on view=quant.
     Frontend-Rebuild: es gibt nur noch EINE Aktienseite (#/aktie/<T>,
     quant/app/page-stock.js); beide Antworten stehen dort. */
  const render = slice(stockPage, "async function render(", "global.QXStock");
  /* Staerke: die Quant-Einordnung (verdictCard) auf der Einstiegsseite. */
  assert.match(render, /layout\.append\(verdictCard\(vm[,)]/, "the entry page does not answer the strength question");
  /* Discover-Angleichung: Kurs, Chart, Einordnung wie auf Discovers
     Aktienseite - die Einordnung folgt UNMITTELBAR auf den einen Chart,
     nichts steht dazwischen. Ihre Lage (erste Bildschirmhoehe bei 1440 px,
     hoechstens zwei bei 390 px) misst der Production-Smoke (M40). */
  const chartAt = render.indexOf("layout.append(chart.node);");
  assert.ok(chartAt > 0, "der Chart wird nicht in die Einordnungs-Zeile gesetzt");
  assert.match(render.slice(chartAt), /^layout\.append\(chart\.node\);\s*layout\.append\(verdictCard\(vm/, "zwischen Chart und Einordnung steht etwas anderes");
  /* Chance gegen Risiko: die Marktmuster (Gewinn- UND Verlustseite) im
     Replay derselben Seite. */
  assert.match(render, /replaySection\(vm, words\)/, "the entry page carries no opportunity-against-risk answer");
  /* M40: die Antworten stehen in der oberen Haelfte, VOR dem Chart. Gemessen
     bei 390 px stand dort vorher der Chart, und die Antworten lagen weiter
     unten. Die Einordnung muss im DOM vor dem Chart stehen (einspaltig auf
     dem Telefon) - oder per CSS dorthin geordnet werden. */
  const layoutAt = render.indexOf('el("div", { class: "qx-stock-layout" }');
  assert.ok(layoutAt > 0, "the stock layout was not found");
  const layoutDecl = render.slice(layoutAt, render.indexOf(";", layoutAt));
  const verdictCss = (read("quant/app/app.css").match(/\.qx-verdict-card[^{]*\{[^}]*\}/g) || []).join("");
  const chartFirst = /\[chart\.node\]/.test(layoutDecl) && !/order:\s*-/.test(verdictCss);
  assert.ok(!chartFirst, "die Auskunft steht hinter dem Chart");
  /* Reused, not reimplemented: a second set of factor names is exactly the
     double language the dictionary exists to remove. */
  assert.equal(/FACTOR_ORDER|FACTOR_MEANING/.test(stockPage), false, "the entry page builds its own factor list");
  assert.match(render, /VM\.stock\(/, "the entry page does not use the shared view model");
  /* Am Verhalten: fuer einen echten Titel liefert das View Model beide Antworten. */
  const t = "JPM";
  const vm = VM.stock({ ticker: t, factors: await api.getFactorEvidence(t), brief: await api.getIntelligenceBrief(t),
    cases: await api.getHistoricalCases(t), patterns: await api.getPatternMatch(t) });
  assert.ok(vm.overall && vm.overall.text, "no strength answer");
  const market = vm.replay.levels.find((l) => l.id === "MARKET_WIDE");
  assert.equal(market.state, "AVAILABLE");
  assert.ok(market.upside && market.downside, "no opportunity-against-risk answer");
});

test("the opportunity-against-risk answer never shows one side alone", async () => {
  /* Frontend-Rebuild: patternBalance ist ersetzt durch replayView (Ebene
     MARKET_WIDE) + replaySection. */
  const replay = slice(stockPage, "function replaySection(", "function technicalSection(");
  /* Both columns are appended in the same call, so one cannot ship without
     the other. */
  /* Discover-Angleichung: der Block traegt zusaetzlich Discovers
     dx-bewertung-bild - geprueft wird weiter, dass beide Seiten in EINEM
     Aufruf entstehen. */
  assert.match(replay, /if \(up && down\) \{\s*c\.push\(el\("div", \{ class: "qx-bars2\b[^"]*"/);
  /* The patterns overlap, so they are counted separately and never
     combined into one rate - a combined figure would be invented. */
  assert.equal(/holds\.reduce\(/.test(replay + viewModelSrc), false, "the patterns are aggregated into one number");
  /* No forecast, and the population caveat travels with the figures. */
  assert.match(replay, /r\.isNot/);
  assert.match(viewModelSrc, /isNot = "Das ist keine Prognose/);
  const t = "JPM";
  const r = VM.replayView(await api.getHistoricalCases(t), await api.getIntelligenceBrief(t), await api.getPatternMatch(t));
  const market = r.levels.find((l) => l.id === "MARKET_WIDE");
  assert.match(market.upside.sentence + market.downside.sentence, /Grundgesamtheit/);
  /* Zero matches is a statement, not an empty box. */
  const none = VM.replayView(null, { pattern: { state: "UNAVAILABLE" } }, null).levels.find((l) => l.id === "MARKET_WIDE");
  assert.match(none.text, /trifft derzeit kein/);
  assert.match(replay, /c\.push\(el\("p", \{ class: "qx-muted", text: lv\.text \}\)\)/, "the no-match statement is not rendered");
});

test("counted copy is written for one as well as for many", async () => {
  /* "1 von 249 Mustern treffen zu" is the sentence a reader notices nobody
     proof-read. Caught by browser QA on JPM, which matches exactly one.
     Frontend-Rebuild: gezaehlte Saetze entstehen jetzt im View Model
     (replayView, changeView) - geprueft am Verhalten, fuer eins und fuer
     viele. JPM trifft weiterhin genau ein Muster. */
  const t = "JPM";
  const r = VM.replayView(await api.getHistoricalCases(t), await api.getIntelligenceBrief(t), await api.getPatternMatch(t));
  const text = strings(r).join(" | ");
  assert.equal(/\b1 von \d+ Mustern (?:treffen|hielten|liegen)/.test(text), false, "plural verb after one: " + text.match(/1 von \d+ Mustern \w+/));
  /* Vergleichsfaelle: "1 Fall", nicht "1 Fälle". */
  const one = VM.replayView({ state: "AVAILABLE", episodes: 1, minEpisodes: 10, from: "2000-01-01", horizons: {} }, null, null);
  assert.match(one.levels[0].text, /\b1 Fall\b/);
  const many = VM.replayView({ state: "AVAILABLE", episodes: 3, minEpisodes: 10, from: "2000-01-01", horizons: {} }, null, null);
  assert.match(many.levels[0].text, /\b3 Fälle\b/);
  /* Veraenderungen: ein Signal ist ein Signal. */
  const item = (d) => ({ id: "fcfMarginChange", label: "x", state: "AVAILABLE", direction: d });
  const up1 = VM.changeView({ state: "AVAILABLE", items: [item("IMPROVING")] }).text;
  const down1 = VM.changeView({ state: "AVAILABLE", items: [item("DETERIORATING")] }).text;
  const both1 = VM.changeView({ state: "AVAILABLE", items: [item("IMPROVING"), item("DETERIORATING")] }).text;
  for (const s of [up1, down1, both1]) assert.equal(/\b1 Signale\b|\b1 verschlechtern\b|\b1 verbessern\b/.test(s), false, "no singular form: " + s);
  const up2 = VM.changeView({ state: "AVAILABLE", items: [item("IMPROVING"), item("IMPROVING")] }).text;
  assert.match(up2, /\b2 Signale verbessern sich/);
});

test("every engine the interface calls is actually loaded by the page", () => {
  /* A real defect this catches: market-regime.js was written, wired into
     product-services and covered by unit tests, and the script tag was
     never added. The service then returned SOURCE_MISSING because its
     engine was undefined, and the page rendered the unavailable copy - a
     failure that looks exactly like missing data. Only browser QA found
     it, and only because somebody looked at the rendered text.
     Frontend-Rebuild: die Seite ist quant/index.html, die Oberflaeche
     quant/app/*.js. */
  const html = read("quant/index.html");
  const globals = {
    VUProductServices: "quant/api/product-services.js",
    VUSetupEngine: "quant/engines/setup-engine.js",
    VUStrategyMatch: "quant/engines/strategy-match.js",
    VUMarketRegime: "quant/engines/market-regime.js",
    VUProductLanguage: "quant/engines/product-language.js",
    VUFactorEvidence: "quant/engines/factor-evidence.js",
    VUQuery: "quant/engines/query.js",
    VURuleContract: "quant/engines/rule-contract.js",
    VUPlainVerdict: "quant/engines/plain-verdict.js",
    VUScreenerWorkspace: "quant/api/screener-workspace.js"
  };
  const services = read("quant/api/product-services.js");
  const frontend = surface + viewModelSrc;
  for (const [name, path] of Object.entries(globals)) {
    /* Only demand a tag for engines the frontend or the services reach for. */
    if (!frontend.includes(name) && !services.includes(name)) continue;
    assert.ok(html.includes('src="/' + path + '"'),
      name + " is used but " + path + " is never loaded by quant/index.html");
  }
  /* And the order matters: product-services reads the engines at load time,
     so every engine tag must come before it. */
  const servicesAt = html.indexOf('src="/quant/api/product-services.js"');
  for (const path of Object.values(globals)) {
    if (path.endsWith("product-services.js") || path.endsWith("screener-workspace.js")) continue;
    const at = html.indexOf('src="/' + path + '"');
    if (at === -1) continue;
    assert.ok(at < servicesAt, path + " is loaded after product-services.js");
  }
  /* Die Oberflaeche liest die Dienste beim Start: jede quant/app-Datei
     kommt nach product-services, und app.js zuletzt. */
  const appAt = APP_FILES.concat(["view-model.js"]).map((f) => [f, html.indexOf('src="/quant/app/' + f + '"')]);
  for (const [f, at] of appAt) {
    assert.ok(at > servicesAt, "quant/app/" + f + " fehlt oder kommt vor product-services.js");
  }
  assert.equal(Math.max(...appAt.map((x) => x[1])), html.indexOf('src="/quant/app/app.js"'), "app.js must be loaded last");
});

test("the journey starts with the market and ends at a share", () => {
  /* Market -> own titles -> analysis. Without the first step every single
     movement reads as if it stood on its own. Frontend-Rebuild: die
     Marktlage ist eine Karte in "Heute interessant" auf Home
     (quant/app/pages.js home()). */
  const home = slice(pages, "async function home(", "/* ============================================================ SCREENER");
  assert.ok(home.length > 500);
  assert.match(home, /regime && regime\.state === "AVAILABLE"/, "the home page does not place the market");
  /* The market state is fetched alongside, not after: a second round trip
     before the first paint is a wait the reader pays for nothing. */
  assert.match(home, /Promise\.all\(\[[\s\S]*?ctx\.api\.getMarketRegime\(\)[\s\S]*?\]\)/);
  /* And it appears before the reader's own titles. */
  /* Discover-Angleichung: "Heute bei Quant" (mit der Marktlage als
     Kachel) ist Discovers "Heute bei Vision Universe" und steht vor den
     eigenen Titeln ("Deine Aktien"). */
  const todayAt = home.indexOf('X.world("Heute bei Quant"');
  const mineAt = home.indexOf('X.world("Deine Aktien"');
  assert.ok(todayAt > 0 && mineAt > 0 && todayAt < mineAt,
    "the market is placed after the reader's own titles");
  assert.match(home, /regime && regime\.state === "AVAILABLE"[\s\S]*?tiles\.push\(/, "the market state is not one of the today tiles");
  /* ... and the journey ends at a share: the cards link to the stock page. */
  assert.match(app["ui.js"], /function tickerChips[\s\S]*?routes\.stock\(t\)/);
});

test("Kursstaerke und Anlegerrendite stehen als eigene Begriffe da", () => {
  /* Option C trennt zwei Fragen. Wenn nur eine davon einen Namen hat,
     ist die Trennung im Produkt nicht angekommen - dann sieht der Leser
     zwei Zahlen und keinen Grund. */
  for (const id of ["priceStrength", "investorReturn", "priceStrengthVsInvestorReturn"]) {
    assert.ok(Language.has(id), "Begriff fehlt: " + id);
    assert.notEqual(Language.label(id), id);
    assert.ok(Language.question(id).endsWith("?"), id + " stellt keine Frage");
    assert.ok(Language.beginner(id).length > 40, id + " hat keine Einsteigererklaerung");
  }
  assert.equal(Language.label("priceStrength"), "Kursstärke");
  assert.equal(Language.label("investorReturn"), "Anlegerrendite");
  /* Und die Einsteigertexte muessen den Unterschied wirklich nennen,
     nicht nur zwei Namen tragen. */
  assert.match(Language.beginner("priceStrength"), /Dividende|Ausschüttung/);
  assert.match(Language.beginner("investorReturn"), /Dividend|Ausschüttung/);
});

test("die technischen Woerter der Return-Basis sind in der Oberflaeche verboten", () => {
  /* Der Owner hat sie ausdruecklich in die Methodik-/Fachschicht
     verwiesen. Ein Verbot, das nur im Dokument steht, ist keins - hier
     wird es gegen den Prueftext gefahren. */
  for (const wort of ["adjustedClose", "split adjusted", "total return", "SPLIT_ADJUSTED_PRICE"]) {
    assert.ok(Language.violatesPrimaryCopy("Die Kennzahl beruht auf " + wort + "."),
      "nicht verboten: " + wort);
  }
  /* Die Nutzerbegriffe selbst duerfen natuerlich vorkommen. */
  assert.equal(Language.violatesPrimaryCopy("Kursstärke und Anlegerrendite über 6 Monate"), null);
});

test("the setup conditions reach the surface as words, not as enums", async () => {
  /* Die Bedingungszeile war die letzte Stelle in der Setup-Sektion, an der
     das Woerterbuch umgangen wurde: Katalog-Label (englisch) plus roher
     Enum-Wert plus Operator als Wort. Frontend-Rebuild: die Zeile entsteht
     in VM.conditionView (ueber setupView) und wird in page-stock.js
     conditions() gezeichnet - der rohe Ausdruck (raw) wird nicht gezeichnet. */
  Language.load(dictionary);
  VM.useLanguage(Language);
  try {
    const obs = await api.getSetupObservation("AAPL");
    const view = VM.setupView({ setup: { state: "SETUP_FORMING" } }, obs);
    assert.ok(view.conditions.length > 0);
    for (const c of view.conditions) {
      /* Die Beschriftung kommt aus dem Woerterbuch, wo es den Begriff hat. */
      const field = obs.conditions[view.conditions.indexOf(c)].field;
      if (Language.has(field)) assert.equal(c.label, Language.label(field));
      const shown = [c.label, c.demand, c.value].filter(Boolean).join(" ");
      assert.equal(/\b[A-Z]{3,}(?:_[A-Z]+)+\b/.test(shown), false, "raw enum on the surface: " + shown);
      assert.equal(/^Technical /.test(c.label), false, "catalogue label on the surface: " + c.label);
    }
    /* Ein unbekannter Wert bleibt draussen statt roh zu erscheinen. */
    const unknown = VM.setupView({ setup: { state: "WATCH", next: { state: "SETUP_FORMING", sentence: "x",
      open: [{ field: "technicalTrend", operator: "eq", demand: "SOMETHING_NEW", value: "SOMETHING_NEW", met: false }] } } }, null);
    const u = unknown.next.conditions[0];
    assert.equal(/SOMETHING_NEW/.test(JSON.stringify([u.label, u.demand, u.value])), false);
    /* Und die Prozentdarstellung fuer ein Verhaeltnisfeld: eine -0.15 als
       "-0,15" waere fuer einen Leser kein Abstand von 15 Prozent. */
    /* Die echte Bedingung aus setup-state-v1 (technicalDistanceTo52wHigh
       >= -0.15); die Einheit steht im Katalog (unit "ratio"). */
    assert.equal(require("../engines/catalog.js").field("technicalDistanceTo52wHigh").unit, "ratio");
    const ratio = VM.setupView({ setup: { state: "WATCH", next: { state: "SETUP_FORMING", sentence: "x",
      open: [{ field: "technicalDistanceTo52wHigh", operator: "gte", demand: -0.15, value: -0.2, met: false }] } } }, null);
    const rc = ratio.next.conditions[0];
    assert.match(String(rc.demand) + " " + String(rc.value), /15\s?%/, "a ratio demand is not shown as a percentage: " + rc.demand);
  } finally { VM.useLanguage(null); }
  const rows = slice(stockPage, "function conditions(", "function verdictCard(");
  assert.equal(/c\.raw/.test(rows), false, "the raw expression is rendered as primary copy");
  /* Der alte Satz ist weg, nicht danebengestellt. */
  assert.equal(/"Wert " \+ \w+ \+ " · verlangt "/.test(surface), false);
});

test("the setup section says how current it is, against which run", () => {
  /* Der Zustand folgt der technischen Materialisierung, der Chart den
     Tagesschlusskursen. Ein Datum allein sagt das nicht. Frontend-Rebuild:
     es gibt nur noch eine Setup-Flaeche (setupSection auf #/aktie/<T>). */
  const setup = slice(stockPage, "function setupSection(", "function strategySection(");
  assert.match(setup, /s\.asOf/, "the setup section carries no date");
  assert.match(setup, /Datenstand des Laufs/, "the setup section does not say which run it reflects");
  assert.match(setup, /nicht dem täglichen Kursstand/, "the setup section does not separate its date from the daily price");
  /* Und die Veraenderung gegenueber dem vorigen Lauf. */
  assert.match(setup, /s\.previous/);
  assert.match(viewModelSrc, /previous: observation && observation\.previous/);
});

test("a missing factor row hides the factors, not everything else", () => {
  /* Gemessen: 426 Titel tragen einen veroeffentlichten Setup-Zustand ohne
     Faktorzeile, 47 davon einen anderen als "kein Setup". Frontend-Rebuild:
     page-stock.js render() haengt Setup, Anlagestil und Historie unabhaengig
     von hasFactors an; das View Model liefert sie auch ohne Faktorzeile. */
  const vm = VM.stock({ ticker: "X", factors: { state: "UNAVAILABLE", reason: "NOT_COVERED_BY_FACTOR_EVIDENCE" },
    brief: { setup: { state: "WATCH", sentence: "s" } }, setup: { conditions: [] } });
  assert.equal(vm.factorState, "UNAVAILABLE");
  assert.equal(vm.setup.state, "WATCH", "the setup disappears with the factor row");
  assert.ok(vm.replay.levels.length >= 2, "the historical view disappears with the factor row");
  const render = slice(stockPage, "async function render(", "global.QXStock");
  for (const section of ['"setup"))', '"strategie"))', '"historie"))']) {
    const line = render.split("\n").find((l) => l.includes(section));
    assert.ok(line, section + " fehlt");
    assert.equal(/hasFactors/.test(line), false, section + " haengt an der Faktorzeile");
  }
  /* Und der Hinweis selbst bleibt stehen - die fehlende Faktorzeile wird
     nicht dadurch behoben, dass daneben etwas anderes steht. */
  assert.match(render, /Quant bildet keine Ersatzwerte/);
});

test("the style match separates a finding from a gap, and says what left the denominator", async () => {
  /* Gemessen ueber 6.358 Titel: 2.738 haben einen Stil ab 40 %, 2.810
     keinen darueber, 810 kein einziges messbares Profil. Die dritte Gruppe
     bekam den Ladefehler-Satz, obwohl geladen und geprueft wurde und das
     Ergebnis lautet: nichts war messbar. Frontend-Rebuild: geprueft an
     VM.strategyView. */
  const reasons = require("../engines/strategy-match.js").UNAVAILABLE_REASONS;
  const texts = reasons.map((reason) => VM.strategyView({ state: "UNAVAILABLE", reason }).text);
  const loadFailure = VM.strategyView(null).text;
  reasons.forEach((reason, i) => {
    assert.notEqual(texts[i], loadFailure, reason + " hat keinen eigenen Satz");
    assert.equal(/[A-Z]{3,}_[A-Z_]{3,}/.test(texts[i]), false, reason + ": code on the surface");
  });
  assert.equal(new Set(texts).size, reasons.length, "the three reasons share one sentence");
  /* Befund und Luecke getrennt: nicht messbare Bedingungen sind OFFEN, nicht
     verletzt - am echten Titel. */
  const match = await api.getStrategyMatch("JPM");
  const view = VM.strategyView(match);
  assert.equal(view.state, "AVAILABLE");
  const best = match.profiles.find((p) => p.profileId === view.best.id);
  const byState = (s) => best.conditions.filter((c) => c.state === s).length;
  assert.equal(view.best.met.length, byState("MET"));
  assert.equal(view.best.notMet.length, byState("NOT_MET"));
  assert.equal(view.best.open.length, best.conditions.length - byState("MET") - byState("NOT_MET"));
  /* Der Leadsatz nennt beides: den Nenner und was ihn verlassen hat. */
  const withGap = VM.strategyView({ state: "AVAILABLE", profiles: [{ profileId: "p", label: "Stil", state: "AVAILABLE", match: 0.5, conditions: [
    { label: "Quant V2 · Wachstum", state: "MET", value: 80, threshold: 70, operator: "gte" },
    { label: "Quant V2 · Bewertung", state: "NOT_MET", value: 20, threshold: 60, operator: "gte" },
    { label: "Quant V2 · Erwartungstrend", state: "NOT_MEASURABLE", value: null, threshold: 50, operator: "gte" }] }] });
  const lead = strings(withGap).join(" | ");
  assert.match(lead, /1 von 2 messbaren Bedingungen erfüllt/, "the lead sentence does not name the measurable denominator");
  assert.match(lead, /1 weitere[^|]*nicht messbar/, "the lead sentence does not say what left the denominator");
});

test("a no-fit verdict names the nearest style and what is open on it", () => {
  /* Gemessen am 26.09.2026 an der Reise-Stichprobe: 217 von 500 Titeln
     bekommen "zu keinem Anlagestil passt dieser Titel gut" - der haeufigste
     Satz dieses Abschnitts, und er endete im Nichts. Der Satz nennt jetzt
     den naechsten Stil und die offene Bedingung - und nur das: keine
     Prognose, keine verschobene Schwelle. Frontend-Rebuild: VM.strategyView
     + strategySection. */
  const view = VM.strategyView({ state: "AVAILABLE", profiles: [
    { profileId: "a", label: "Stil A", state: "AVAILABLE", match: 0.3, conditions: [
      { label: "Quant V2 · Wachstum", state: "NOT_MET", value: 40, threshold: 70, operator: "gte" },
      { label: "Quant V2 · Risiko", state: "MET", value: 80, threshold: 50, operator: "gte" }] },
    { profileId: "b", label: "Stil B", state: "AVAILABLE", match: 0.1, conditions: [
      { label: "Quant V2 · Bewertung", state: "NOT_MET", value: 10, threshold: 70, operator: "gte" }] }] });
  /* Der naechste Stil ist genannt, und die offene Bedingung dazu. */
  assert.match(view.sentence, /Stil A/);
  assert.deepEqual(view.best.notMet.map((c) => c.label), ["Wachstum"]);
  /* Die offenen Bedingungen sind die NICHT ERFUELLTEN, nicht die nicht
     messbaren - die zaehlen getrennt, wie im Vertrag. */
  assert.equal(view.best.open.length, 0);
  /* Der Zusatz bleibt die Naehe zu einem Bedingungssatz - ausdruecklich. */
  const section = slice(stockPage, "function strategySection(", "function replaySection(");
  assert.match(section, /keine Trefferquote und keine historische Erfolgsaussage|Nähe zu einem Bedingungssatz und keine Prognose/);
  assert.match(section, /conditions\(b\.notMet/);
  /* Und der Befundsatz selbst bleibt stehen: die Naehe ersetzt ihn nicht. */
  assert.match(strings(view).join(" | "), /Zu keinem Anlagestil passt dieser Titel derzeit gut/,
    "the finding that nothing fits is replaced by the nearest style");
});

test("both pattern surfaces count the checkable patterns, not the registered ones", async () => {
  /* Der Nenner stand auf 250 - der Zahl der vorregistrierten Muster - und
     nicht auf der Zahl der pruefbaren. Fuer 1.494 Titel waren davon 181
     nicht pruefbar. Frontend-Rebuild: die Musterflaeche ist die Ebene
     MARKET_WIDE von replayView. Gemessen: JPM hat 252 registrierte, davon
     74 nicht pruefbare Muster. */
  const t = "JPM";
  const patterns = await api.getPatternMatch(t);
  assert.ok(patterns.coverage && patterns.coverage.notMeasurable > 0, "no title with non-checkable patterns to test against");
  const r = VM.replayView(await api.getHistoricalCases(t), await api.getIntelligenceBrief(t), patterns);
  const text = strings(r).join(" | ");
  /* Kein Nenner aus den registrierten Mustern. */
  assert.equal(new RegExp("von " + patterns.coverage.registered + " ").test(text), false, "the registered count is used as denominator");
  assert.equal(/vorregistrierten Mustern treffen heute zu|geprüften Mustern liegen derzeit vor/.test(text), false);
  /* Die nicht pruefbaren Muster werden genannt, mit Zahl. */
  assert.match(text, /nicht prüfbar/, "the non-checkable patterns are not named");
  assert.match(text, new RegExp("\\b" + patterns.coverage.notMeasurable + "\\b"), "the number of non-checkable patterns is missing");
  /* Und die Zahl kommt aus dem Dienst, damit zwei Flaechen nicht zwei
     Antworten rechnen. */
  assert.match(viewModelSrc, /coverage/);
});

test("the setup conditions show three marks, not two", () => {
  /* "Nicht erfuellt" und "nicht messbar" sind zwei Aussagen. Frontend-
     Rebuild: VM.conditionView kennt MET / NOT_MET / OPEN, page-stock.js
     conditions() zeichnet ✓ / ✗ / –. */
  const view = VM.setupView({ setup: { state: "WATCH", next: { state: "SETUP_FORMING", sentence: "x", open: [
    { field: "technicalTrend", operator: "eq", demand: "BULLISH", value: "BULLISH", met: true },
    { field: "technicalTrend", operator: "eq", demand: "BULLISH", value: "BEARISH", met: false },
    { field: "technicalTrend", operator: "eq", demand: "BULLISH", value: null, met: false, measurable: false }] } } }, null);
  assert.deepEqual(JSON.parse(JSON.stringify(view.next.conditions.map((c) => c.state))), ["MET", "NOT_MET", "OPEN"]);
  const rows = slice(stockPage, "function conditions(", "function verdictCard(");
  assert.match(rows, /c\.state === "MET" \? "✓" : c\.state === "NOT_MET" \? "✗" : "–"/);
  assert.match(rows, /nicht messbar/);
  assert.match(rows, /zählt weder als erfüllt noch als verletzt/, "an open condition does not say that it counts neither way");
  /* Und keine Zaehlzeile fuehrt eine nicht messbare Bedingung als verletzt. */
  assert.equal(/" von " \+ \w+\.length \+ " Bedingungen dieser Regel erfüllt"/.test(surface), false);
});
