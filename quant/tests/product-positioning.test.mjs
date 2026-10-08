/* Produktpositionierung (Owner-Auftrag 04.10.2026, docs/VU_QUANT_PRODUCT_POSITIONING.md).
   Quant wird nicht mit einem Score verkauft, sondern mit einer Situation:
   was neu ist, warum es zaehlt, was frueher geschah - gegen den Markt -, und
   wie belastbar das ist. Diese Tests halten Claim, Versprechen, Reihenfolge
   und Abgrenzung fest. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const pages = read("quant/app/pages.js"), stock = read("quant/app/page-stock.js"), method = read("quant/app/page-method.js");
const backtest = read("quant/app/page-backtest.js"), evidence = read("quant/app/page-evidence.js"), doc = read("docs/VU_QUANT_PRODUCT_POSITIONING.md");
const slice = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, "fehlt: " + from); const b = src.indexOf(to, a + from.length); return src.slice(a, b < 0 ? undefined : b); };
const str = (name) => { const m = pages.match(new RegExp("var " + name + " = \"([^\"]+)\"")); assert.ok(m, name + " fehlt"); return m[1]; };

test("Der vollständige Claim bleibt erhalten, die Hero-Überschrift ist kurz", () => {
  const claim = str("CLAIM");
  assert.equal(claim, "Quant zeigt dir jeden Tag, bei welchen Aktien sich etwas verändert – und wie oft das früher besser lief als der Markt.");
  assert.ok(doc.includes(claim), "Dokument und Seite sagen nicht dasselbe");
  const title = str("HERO_TITLE");
  assert.equal(title, "Jeden Tag sehen, was sich verändert.");
  assert.ok(title.split(/\s+/).length <= 10, "Hero-Überschrift zu lang");
  assert.match(title, /Jeden Tag/);
  assert.match(title, /verändert/);
  assert.match(pages, /class: "q-hero-lead qx-lead vu-product-lead", text: CLAIM/, "der tägliche Nutzen und Marktvergleich fehlen im Hero");
  assert.match(pages, /class: "q-intro-note", text: CLAIM_LEAD/, "die fachliche Beschreibung fehlt im Hero");
  /* Kein Fachwort, keine Note, kein Gewinnversprechen im ersten Satz. */
  for (const w of ["Score", "Faktor", "Quantitative", "Edge", "Base Rate", "Backtest", "Rendite", "Gewinn", "kaufen"]) assert.ok(!claim.includes(w), "Claim enthaelt " + w);
  assert.ok(claim.split(/\s+/).length <= 22, "Claim zu lang fuer den ersten Bildschirm");
  assert.match(claim, /jeden Tag/, "der taegliche Nutzen fehlt");
  assert.match(claim, /Markt/, "der Vergleich mit dem Markt fehlt");
  for (const w of ["Score", "Base Rate", "Edge"]) assert.ok(!str("CLAIM_LEAD").includes(w), "Untertitel enthaelt " + w);
});

test("Vier Kernversprechen, jedes mit einem Weg zu der Funktion, die es einloest", () => {
  const block = slice(pages, "var PROMISES = [", "];");
  const titles = [...block.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(titles, ["Sehen, was heute neu ist", "Verstehen, warum es zählt", "Prüfen, ob es früher ein Vorteil war", "Wissen, wie belastbar das ist"]);
  for (const r of ["X.routes.radar()", "X.routes.stocks()", "X.routes.backtest()", "X.routes.method()"]) assert.ok(block.includes(r), "Versprechen ohne Weg: " + r);
  for (const t of titles) assert.ok(doc.includes(t), "Versprechen fehlt im Dokument: " + t);
});

test("Home: erst Claim und Suche, dann was heute neu ist, dann eigene Aktien, dann Werkzeuge", () => {
  const home = slice(pages, "async function home(", "/* ============================================================ SCREENER");
  const at = (s) => { const i = home.indexOf(s); assert.ok(i >= 0, "fehlt auf Home: " + s); return i; };
  const hero = at('el("h1", { class: "q-claim vu-product-title", text: HERO_TITLE })'), search = at("onclick: ctx.openSearch"), promises = at("promiseList()");
  const today = at('X.world("Heute bei Quant"'), mine = at('X.world("Deine Aktien"'), rails = at("page.append(rails)");
  const proof = at('X.world("Warum Quant mehr ist als ein Screener"'), tools = at('X.section("Selbst suchen"'), trust = at('"Warum kann ich dem vertrauen?"');
  assert.ok(hero < search && search < promises && promises < today, "der erste Bildschirm ist nicht Claim → Suche → Versprechen");
  assert.ok(today < mine && mine < rails && rails < proof && proof < tools && tools < trust, "Reihenfolge: heute → deine Aktien → neue Treffer → Beleg → Werkzeuge → Methodik");
  /* Keine Werkzeugtour und kein Slogan mehr, keine statischen Demo-Aktien. */
  for (const alt of ["Neuer Aufbau von Quant", "Quick Access", '"Mehr" }', "Was möchtest du heute analysieren"]) assert.ok(!home.includes(alt), "alter Inhalt: " + alt);
  assert.ok(!/KNOWN\b/.test(home), "Home zeigt feste Demo-Aktien");
});

test("Beweis statt Behauptung: das Beispiel kommt aus dem Radar und traegt die Markt-Quote", () => {
  const fn = slice(pages, "function proofCard(", "\n  }\n");
  assert.match(fn, /e\.backtest\.state === "AVAILABLE" && Array\.isArray\(e\.backtest\.deltaCi\)/, "nur ein getestetes Signal mit Band ist ein Beleg");
  assert.match(fn, /E\.signalEvidence\(ev\.backtest/, "der Beleg zeigt nicht Signal gegen Markt");
  assert.ok(!/\d+,\d+ %/.test(fn), "der Beleg ist ein fester Text statt einer Messung");
  assert.match(fn, /if \(!ev\) return null/, "ohne getestetes Signal erfindet die Seite kein Beispiel");
});

test("Radar: Bedeutung, naechste Bedingung, Vergleich mit dem Markt - und keine Kaufempfehlung", () => {
  const head = slice(pages, "async function radar(", "var r = await ctx.api.getQuantRadar()");
  for (const w of ["was passiert ist", "was als Nächstes fehlt", "besser lief als der Markt", "Keine Kaufempfehlung"]) assert.ok(head.includes(w), "Radar-Kopf ohne: " + w);
  /* Die zwei festen Fachsaetze der Szenario-Engine werden uebersetzt - und
     die Uebersetzung bricht nicht still, wenn die Engine sie aendert. */
  const engine = read("quant/engines/technical/scenario-engine.js");
  const map = slice(pages, "var PLAIN_TRIGGER = {", "};");
  const keys = [...map.matchAll(/"(Kurs [^"]+)":/g)].map((m) => m[1]);
  assert.equal(keys.length, 2);
  for (const k of keys) assert.ok(engine.includes(k), "Engine-Satz geaendert, Uebersetzung greift nicht mehr: " + k);
  for (const v of [...map.matchAll(/": "([^"]+)"/g)].map((m) => m[1])) for (const w of ["Entry", "Higher", "Lower", "haelt"]) assert.ok(!v.includes(w), "Fachwort in der Uebersetzung: " + w);
  assert.match(pages, /plainTrigger\(tr\.trigger\)/);
});

test("Aktie: 'Was ist jetzt wichtig?' trennt getestet (mit Markt) von beobachtet (ohne Markt)", () => {
  const now = slice(stock, "function nowContent(", "function lifecycleLabel(");
  const tested = now.indexOf("Historisch getestet"), observed = now.indexOf("Bei dieser Aktie beobachtet");
  assert.ok(tested > 0 && observed > tested, "getestet steht nicht vor beobachtet");
  assert.match(now, /der Markt " \+ E\.share1\(b\.basePositiveShare\)/, "die getestete Quote steht ohne Markt");
  assert.match(now, /E\.edgeSentence\(b\)/);
  assert.match(now, /ohne Marktvergleich/, "die beobachtete Quote sagt nicht, dass ein Vergleich fehlt");
  assert.ok(!now.includes("Früher in derselben Kurslage:"), "nackte Trefferquote ohne Stufe");
});

test("Quant vs. Screener vs. Discover: getrennt und benannt", () => {
  const roles = slice(method, 'X.section("Quant, Screener, Discover – was ist was?"', "So arbeitet Quant");
  for (const w of ["Quant", "Quant Screener", "Discover", "deine Bedingungen", "im ganzen Markt", "Keine Regeln, keine Backtests", "/discover/"]) assert.ok(roles.includes(w), "Abgrenzung ohne: " + w);
  const scr = slice(pages, "async function screener(", "if (pro) return screenerPro");
  assert.match(scr, /Der Screener findet Aktien nach /);
  assert.match(scr, /X\.routes\.radar\(\)/, "der Screener verweist nicht auf den Radar");
  assert.ok(!scr.includes("kein separates Produkt"));
  /* Discover bleibt unveraendert: Quant verlinkt nur hinueber. */
  assert.ok(!/discover\/(ui|app)\//.test(method.slice(method.indexOf("Quant, Screener, Discover"), method.indexOf("So arbeitet Quant"))));
});

test("Strategien und Backtesting: 'passt heute' ist nicht 'getestet'; Backtesting fragt nach dem Vorteil", () => {
  assert.match(pages, /„Passt heute“ heißt: die Bedingungen sind heute erfüllt\. Wie sich ein Stil historisch entwickelt hat, ist noch nicht getestet und nicht zertifiziert/);
  assert.match(backtest, /el\("h1", \{ class: "qx-h1", text: "Hatte ein Signal früher wirklich einen Vorteil\?" \}\)/);
  assert.match(backtest, /wie oft der ganze Markt in denselben Wochen/);
});

test("Beobachten hat einen erklaerten Nutzen - auf der Aktienliste, auf Home und an der Aktie", () => {
  const wv = slice(pages, "var WATCH_VALUE = [", "];");
  for (const w of ["Setup-Wechsel", "historische Evidenz", "Strategie", "Risiken", "Signale"]) assert.ok(wv.includes(w), "Nutzen fehlt: " + w);
  assert.match(pages, /WATCH_VALUE\.map\(function \(w\) \{ return el\("li"/, "die Aktienliste nennt den Nutzen nicht");
  assert.match(pages, /Quant verfolgt für dich Setup-Wechsel, neue Evidenz, Strategie-Wechsel und Risiken/);
  assert.match(evidence, /verfolgt Quant für dich Setup-Wechsel, neue historische Evidenz, Strategie-Wechsel, Risiken und neue Signale/);
  assert.match(pages, /Kein Depot: keine Stückzahl, kein Einstand\./);
});
