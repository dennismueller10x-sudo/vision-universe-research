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
    "strategyMatchSection(match,strategyIndex,ticker)", "evidenceTrustSection(patterns)"];
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

test("the entry page answers the two headline questions itself", () => {
  /* The measured reason this exists: view=stock is where a person lands,
     and it carried no answer to "how strong is this share" and none to
     "opportunity against risk" - both sat one click away on view=quant.
     Somebody who does not click saw a price and some figures. */
  /* The slice ends at the next top-level function, so factorStrip's own
     body cannot satisfy an assertion about the page that calls it. */
  const from = experience.indexOf("async function stockPage(");
  const stock = experience.slice(from, experience.indexOf("\nfunction ", from));
  assert.ok(stock.length > 500);
  assert.match(stock, /LQ\('factorDna'\)/, "the entry page does not ask the strength question");
  assert.match(stock, /patternBalance\(patterns,ticker\)/, "the entry page carries no opportunity-against-risk answer");
  assert.match(stock, /factorStrip\(evidenceRow\)/, "the entry page does not reuse the shared factor strip");
  /* Reused, not reimplemented: a second set of factor names is exactly the
     double language the dictionary exists to remove. */
  assert.equal(stock.includes("FACTOR_ORDER"), false, "the entry page builds its own factor list");
  /* And the depth stays on the quant page rather than being duplicated. */
  assert.match(stock, /href\('quant',ticker\)/);
});

test("the opportunity-against-risk answer never shows one side alone", () => {
  const balance = experience.slice(experience.indexOf("function patternBalance("), experience.indexOf("async function stockPage("));
  assert.ok(balance.length > 500);
  /* Both columns are appended in the same call, so one cannot ship without
     the other. */
  assert.match(balance, /class:'balance-side'/);
  assert.match(balance, /class:'balance-side is-down'/);
  /* The patterns overlap, so they are counted separately and never
     combined into one rate - a combined figure would be invented. */
  assert.match(balance, /NICHT zu einer Zahl verrechnet/);
  assert.equal(/holds\.reduce\(/.test(balance), false, "the patterns are aggregated into one number");
  /* No forecast, and the population caveat travels with the figures. */
  assert.match(balance, /keine Prognose/);
  assert.match(balance, /Grundgesamtheit/);
  /* Zero matches is a statement, not an empty box. */
  assert.match(balance, /trifft heute keines auf diesen Titel zu/);
  assert.match(balance, /kein fehlender Wert/);
});

test("counted copy is written for one as well as for many", () => {
  /* "1 von 249 Mustern treffen zu" is the sentence a reader notices nobody
     proof-read. Caught by browser QA on JPM, which matches exactly one. */
  const balance = experience.slice(experience.indexOf("function patternBalance("), experience.indexOf("async function stockPage("));
  assert.match(balance, /holds\.length===1/, "the lead sentence has no singular form");
  assert.match(balance, /trifft heute zu/);
  assert.match(balance, /treffen heute zu/);
  /* The two column captions decline too. */
  assert.match(balance, /favourable\.length===1/);
  assert.match(balance, /adverse\.length===1/);
});

test("every engine the interface calls is actually loaded by the page", () => {
  /* A real defect this catches: market-regime.js was written, wired into
     product-services and covered by unit tests, and the script tag was
     never added. The service then returned SOURCE_MISSING because its
     engine was undefined, and the page rendered the unavailable copy - a
     failure that looks exactly like missing data. Only browser QA found
     it, and only because somebody looked at the rendered text. */
  const html = readFileSync(new URL("vu2/index.html", ROOT), "utf8");
  const globals = {
    VUProductServices: "quant/api/product-services.js",
    VUSetupEngine: "quant/engines/setup-engine.js",
    VUStrategyMatch: "quant/engines/strategy-match.js",
    VUMarketRegime: "quant/engines/market-regime.js",
    VUProductLanguage: "quant/engines/product-language.js",
    VUFactorEvidence: "quant/engines/factor-evidence.js",
    VUQuery: "quant/engines/query.js",
    VURuleContract: "quant/engines/rule-contract.js"
  };
  const services = readFileSync(new URL("quant/api/product-services.js", ROOT), "utf8");
  for (const [name, path] of Object.entries(globals)) {
    /* Only demand a tag for engines the frontend or the services reach for. */
    if (!experience.includes(name) && !services.includes(name)) continue;
    assert.ok(html.includes('src="/' + path + '"'),
      name + " is used but " + path + " is never loaded by vu2/index.html");
  }
  /* And the order matters: product-services reads the engines at load time,
     so every engine tag must come before it. */
  const servicesAt = html.indexOf('src="/quant/api/product-services.js"');
  for (const path of Object.values(globals)) {
    if (path.endsWith("product-services.js")) continue;
    const at = html.indexOf('src="/' + path + '"');
    if (at === -1) continue;
    assert.ok(at < servicesAt, path + " is loaded after product-services.js");
  }
});

test("the journey starts with the market and ends at a share", () => {
  /* Market -> own titles -> analysis. Without the first step every single
     movement reads as if it stood on its own, and the home page carried the
     heading "Märkte einordnen" without placing the market anywhere. */
  const from = experience.indexOf("async function homePage(");
  const home = experience.slice(from, experience.indexOf("\nasync function ", from + 10));
  assert.ok(home.length > 500);
  assert.match(home, /marketRegimeSection\(regime\)/, "the home page does not place the market");
  /* The market state is fetched alongside, not after: a second round trip
     before the first paint is a wait the reader pays for nothing. */
  assert.match(home, /Promise\.all\(\[api\.getHomeIntelligence/);
  /* And it appears before the watchlist and the curated companies. */
  const regimeAt = home.indexOf("marketRegimeSection(regime)");
  for (const later of ["Unternehmen, die dich interessieren", "Märkte einordnen"]) {
    const at = home.indexOf(later);
    if (at === -1) continue;
    assert.ok(regimeAt < at, "the market is placed after '" + later + "'");
  }
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

test("the setup conditions reach the surface as words, not as enums", () => {
  /* Die Bedingungszeile war die letzte Stelle in der Setup-Sektion, an der
     das Woerterbuch umgangen wurde: Katalog-Label (englisch) plus roher
     Enum-Wert plus Operator als Wort. Hier steht, dass sie es nicht mehr
     tut - und dass der rohe Wert nur noch in der eingeklappten
     Methodikzeile auftaucht, wo interne Namen erlaubt sind. */
  assert.match(experience, /function setupFieldTerm\(condition\)\{/);
  assert.match(experience, /const id=condition\.field\?condition\.field\+'\.'\+value:null/);
  assert.match(experience, /if\(id&&VUProductLanguage\.has\(id\)\)return L\(id\)/);
  assert.match(experience, /class:'setup-internal'/);
  /* Der alte Satz ist weg, nicht danebengestellt. */
  assert.equal(/text:'Wert '\+value\+' · verlangt '/.test(experience), false);
  /* Und die Prozentdarstellung fuer ein Verhaeltnisfeld steht in derselben
     Funktion - eine -0.15 als "-0,15" waere fuer einen Leser kein
     Abstand von 15 Prozent. */
  assert.match(experience, /field\.unit==='ratio'/);
});

test("the setup section says how current it is, against which run", () => {
  /* Der Zustand folgt der technischen Materialisierung, der Chart den
     Tagesschlusskursen. Ein Datum allein sagt das nicht. */
  assert.match(experience, /function setupCurrency\(observation\)\{/);
  assert.match(experience, /Datenstand des Laufs/);
  assert.match(experience, /nicht dem täglichen Kursstand/);
  /* Beide Flaechen zeigen es - die Aktienseite und die Quant-Seite. */
  assert.equal((experience.match(/setupCurrency\(observation\)\)/g) || []).length, 2);
  assert.equal((experience.match(/setupChange\(observation\)\)/g) || []).length, 2);
});

test("a missing factor row hides the factors, not everything else", () => {
  /* Gemessen: 426 Titel tragen einen veroeffentlichten Setup-Zustand ohne
     Faktorzeile, 47 davon einen anderen als "kein Setup". Die Quant-Seite
     endete fuer sie nach dem Hinweis, waehrend die Aktienseite dieselbe
     Situation zeigte - zwei Antworten auf eine Frage, je nach Einstieg. */
  const zweig = experience.slice(experience.indexOf("Für diesen Titel liegt keine Faktor-Evidenz vor"));
  const bisReturn = zweig.slice(0, zweig.indexOf("\n  return;"));
  for (const abschnitt of ["setupJourney(setup,observation,setupIndex)",
                           "patternMatchSection(patterns)",
                           "strategyMatchSection(match,strategyIndex,ticker)"]) {
    assert.ok(bisReturn.includes(abschnitt), abschnitt + " fehlt im Zweig ohne Faktor-Evidenz");
  }
  /* Und der Hinweis selbst bleibt stehen - die fehlende Faktorzeile wird
     nicht dadurch behoben, dass daneben etwas anderes steht. */
  assert.ok(bisReturn.includes("keine Ersatzwerte gebildet"));
});

test("the style match separates a finding from a gap, and says what left the denominator", () => {
  /* Gemessen ueber 6.358 Titel: 2.738 haben einen Stil ab 40 %, 2.810
     keinen darueber, 810 kein einziges messbares Profil. Die dritte Gruppe
     bekam den Ladefehler-Satz ("konnten nicht geladen oder nicht geprueft
     werden"), obwohl geladen und geprueft wurde und das Ergebnis lautet:
     nichts war messbar. Und 1.049 Titel bekamen einen Leadsatz, dessen
     Nenner stillschweigend kleiner war als die Regel. */
  assert.match(experience, /NO_EVIDENCE:'Zu den Eigenschaften, die diese Profile verlangen/);
  assert.match(experience, /INSUFFICIENT_MEASURABLE_CONDITIONS:'Für jedes Profil sind zu wenige Bedingungen messbar/);
  assert.match(experience, /INSUFFICIENT_MEASURABLE_WEIGHT:'Die messbaren Bedingungen tragen in jedem Profil zu wenig Gewicht/);
  /* Der Leadsatz nennt beides: den Nenner und was ihn verlassen hat. */
  assert.match(experience, /messbaren Bedingungen erfüllt'/);
  assert.match(experience, /weitere '\+\(ohne===1\?'ist':'sind'\)\+' für diesen Titel nicht messbar/);
  /* Und die drei Gruende stehen dort, wo der Zustand sie traegt - nicht als
     vierter, unerreichbarer Zweig weiter unten. */
  const reasons = require("../engines/strategy-match.js").UNAVAILABLE_REASONS;
  for (const reason of reasons) assert.ok(experience.includes(reason + ":'"), reason + " hat keinen eigenen Satz");
});

test("both pattern surfaces count the checkable patterns, not the registered ones", () => {
  /* Der Nenner stand auf 250 - der Zahl der vorregistrierten Muster - und
     nicht auf der Zahl der pruefbaren. Fuer 1.494 Titel waren davon 181
     nicht pruefbar. */
  assert.match(experience, /prüfbaren Mustern treffen heute zu/);
  assert.match(experience, /prüfbaren Mustern liegen derzeit vor/);
  assert.match(experience, /nicht prüfbar/);
  assert.match(experience, /weil keine Geschäftszahlen vorliegen/);
  /* Die alten Formulierungen sind ersetzt, nicht ergaenzt. */
  assert.equal(/vorregistrierten Mustern treffen heute zu/.test(experience), false);
  assert.equal(/geprüften Mustern liegen derzeit vor/.test(experience), false);
  /* Und die Zahl kommt aus dem Dienst, damit zwei Flaechen nicht zwei
     Antworten rechnen. */
  assert.match(experience, /patterns\.coverage/);
});

test("the setup conditions show three marks, not two", () => {
  /* "Nicht erfuellt" und "nicht messbar" sind zwei Aussagen. Der Strategy
     Match unterscheidet sie seit langem mit '–'; die Setup-Bedingungen
     zeigten fuer beides '○'. */
  assert.match(experience, /const messbar=condition\.measurable!==false;/);
  assert.match(experience, /text:!messbar\?'–':condition\.met\?'✓':'○'/);
  assert.match(experience, /nicht messbar · zählt weder als erfüllt noch als verletzt/);
  /* Und der Nenner der Zaehlzeile verliert sie, statt sie als verletzt zu
     fuehren. */
  assert.match(experience, /messbaren Bedingungen dieser Regel erfüllt/);
  assert.match(experience, /ohne auswertbaren Wert/);
  assert.equal(/' von '\+conditions\.length\+' Bedingungen dieser Regel erfüllt'/.test(experience), false);
});
