/* Konzept Elliott, Hedgefonds, Vorsorge (docs/design/elliott-hedgefonds-vorsorge-2026-11/HANDOVER.md), Wortwahl.
   Kein Begriff aus assets/legal-notices.json → wording[].avoid im sichtbaren Text der umgebauten Welten; dazu je Welt die Wörter, die das
   Konzept streicht (Elliott: keine Ziele und Handlungssätze, kein eigener „Technischer Ausblick“). Hedgefonds und Vorsorge kommen mit ihren PRs dazu. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const legal = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === "data" || f === "tests" || f === "img") return [];
    return statSync(p).isDirectory() ? walk(p) : /\.(js|html)$/.test(f) ? [p] : [];
  });
}
/* Sichtbarer Text = Zeichenkettenliterale nach Entfernen der Kommentare (HTML: Text außerhalb der Tags). */
function strings(src, file) {
  if (file.endsWith(".html")) return [src.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")];
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"\\])\/\/.*$/gm, "$1");
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(code))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
/* Verneinungen sind die geforderte Einordnung („keine Anlageempfehlung“, „Beispiele, keine Empfehlung“). */
/* Fachlich zulässig: Garantien eines bestehenden Riester-/Bestandsvertrags sind eine Vertragseigenschaft, kein Versprechen von Vision Universe. */
const neg = (s) => (/Bestandsvertrag|Riester|Beitragsgarantie/.test(s) ? s.replace(/garantiert\p{L}*/gu, "") : s).replace(/\bkeine?\s+[\p{L}]+-Empfehlung(en)?/giu, "").replace(/\bkeine?\s+(Anlage|Kauf|Handlungs)?empfehlung(en)?/gi, "").replace(/\bkein(e|en)?\s+Kursziel(e)?/gi, "").replace(/\bkeine?\s+Kauf- oder Verkaufs(signale?|empfehlung)/gi, "");
const NOT_A_TERM = {
  "2": "Rest von „Ziel 1/2“", "Ziel 1": "eigener Test je Welt", Chance: "nur als „Chance/Risiko“ verboten", Risiko: "Fachwort; nur „Chance/Risiko“ ist verboten",
  Signal: "eigener Test je Welt", sicher: "steckt in „unsicher“, „Sicherheit“ (Zählung) ist Fachwort; geprüft wird „100 % sicher“",
  kaufen: "Ereignisse Dritter („Fonds haben gekauft“, 13F) sind erlaubt (WORTWAHL.md)", verkaufen: "wie „kaufen“",
  "Kauf / Verkauf": "Ereignisse Dritter (13F, Form 4)", "Kauf": "wie oben", "Verkauf": "wie oben"
};
const TERMS = [];
for (const w of legal.wording) for (const part of w.avoid.replace(/\([^)]*\)/g, "").split(/[,/]/)) {
  const t = part.replace(/[„“"…]/g, "").trim();
  if (t && !(t in NOT_A_TERM)) TERMS.push(t);
}
TERMS.push("Chance/Risiko", "100 % sicher");
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hitsOf(files, re) {
  const hits = [];
  for (const f of files) for (const s of strings(readFileSync(f, "utf8"), f)) {
    const v = neg(s), r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = r.exec(v))) hits.push(f + ": „" + m[0] + "“ … " + v.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30));
  }
  return hits;
}
const avoidHits = (files) => TERMS.flatMap((t) => hitsOf(files, new RegExp("(^|[^\\p{L}])" + esc(t) + "(?![\\p{L}])", "iu")));

const ELLIOTT = walk("elliott");
test("Elliott: kein wording[].avoid-Begriff im sichtbaren Text", () => {
  assert.ok(ELLIOTT.includes("elliott/app.js") && ELLIOTT.includes("elliott/engine/home-model.js"));
  assert.ok(TERMS.includes("Kaufempfehlung") && TERMS.includes("Kursziel"));
  assert.deepEqual(avoidHits(ELLIOTT), []);
});
test("Elliott: keine Ziele, keine Handlungssätze, kein zweiter technischer Ausblick (Entscheidung 4)", () => {
  assert.deepEqual(hitsOf(ELLIOTT, /Zielbereich|Ziel\s*[12]\b|Zone\s*[12]\b|abwarten|Technischer Ausblick|Welche Wellen laufen gerade/iu), []);
});

const HEDGE = walk("hedgefonds");
const hedgeSrc = readFileSync("hedgefonds/app.js", "utf8");
test("Hedgefonds: kein wording[].avoid-Begriff, kein „Smart Money“ im sichtbaren Text (Entscheidung 7)", () => {
  assert.ok(HEDGE.includes("hedgefonds/app.js"));
  assert.deepEqual(avoidHits(HEDGE), []);
  assert.deepEqual(hitsOf(HEDGE, /Smart Money|Smart-Money/u), []);
  for (const f of ["products/hedgefonds/module.json", "assets/site-navigation.js", "core/registry/modules.json"]) assert.doesNotMatch(readFileSync(f, "utf8"), /Smart Money/, f);
});
test("Hedgefonds: Leiste „Gruppen-Käufe“, alte Adresse #/smart-money leitet weiter", () => {
  assert.match(hedgeSrc, /if \(page === "smart-money"\) \{ location\.replace\(parts\[1\] === "einstiege" \? "#\/gruppen-kaeufe" : "#\/gruppen-kaeufe\/insider"\); return; \}/);
  assert.match(hedgeSrc, /intro\("Gruppen-Käufe", "Viele Fonds, gleiche Aktie\. "/);
  assert.match(readFileSync("assets/site-navigation.js", "utf8"), /\['gruppen','Gruppen-Käufe','\/hedgefonds\/#\/gruppen-kaeufe','signals'\]/);
});
test("Hedgefonds: Quartalsband auf dem Start (gezeigt · gemeldet bis · nächste Meldungen, Entscheidung 6)", () => {
  const home = hedgeSrc.slice(hedgeSrc.indexOf("function renderHome() {"), hedgeSrc.indexOf("function mvRow("));
  assert.match(home, /qband\(\)/);
  for (const t of ['col("Gezeigt"', 'col("Gemeldet bis"', 'col("Nächste Meldungen"', '"Depots am "', '"45 Tage später"']) assert.ok(hedgeSrc.includes(t), t);
  const pd = new Function(hedgeSrc.match(/function periodDeadline[\s\S]*?\n  \}\n/)[0] + "return periodDeadline;")();
  const d = (x) => x.toISOString().slice(5, 10);
  assert.equal(pd("2026-06-30").getMonth(), 7); assert.equal(pd("2026-06-30").getDate(), 14);
  assert.equal(pd("2026-03-31").getMonth(), 4); assert.equal(pd("2026-12-31").getFullYear(), 2027);
  assert.match(hedgeSrc, /function otherQ\(f\)/, "Karten mit anderem Quartal sagen es");
  void d;
});
test("Hedgefonds: Fondsnamen aufbereitet, Rohname bleibt in Quellen (Entscheidung 10)", () => {
  const fn = new Function(hedgeSrc.match(/function prettyIssuer[\s\S]*?\n  \}\n/)[0] + hedgeSrc.match(/function fundName[\s\S]*?\n  \}\n/)[0] + "return fundName;")();
  assert.equal(fn("Builder Investment Group Inc /adv"), "Builder Investment Group");
  assert.equal(fn("Pershing Square Capital Management"), "Pershing Square");
  assert.equal(fn("Fisher Asset Management"), "Fisher Asset Management");
  assert.equal(fn("Geode Capital Management, Llc"), "Geode Capital Management");
  assert.equal(fn("BlackRock, Inc."), "BlackRock");
  assert.equal(fn("D. E. Shaw & Co."), "D. E. Shaw & Co");
  assert.match(hedgeSrc, /d\.secName/, "SEC-Name bleibt in der Meldung sichtbar");
});
test("Hedgefonds: Investor und Aktie mit Quartalsband, drei Sätzen und Kapiteln (Entscheidungen 6, 8, 9)", () => {
  const fund = hedgeSrc.slice(hedgeSrc.indexOf("function renderFund(slug) {"), hedgeSrc.indexOf("/* ------------------------------------------------------------ Routing */"));
  const stock = hedgeSrc.slice(hedgeSrc.indexOf("function renderStock(cusip, ticker) {"), hedgeSrc.indexOf("/* --------------------------------------------------------- H06"));
  for (const [src, name] of [[fund, "Investor"], [stock, "Aktie"]]) assert.match(src, /qband\(/, name + ": Quartalsband");
  for (const t of ['story("Das Quartal in drei Sätzen"', '"Größte Position"', '"Gekauft"', '"Verkauft"', '"Größte Positionen"', '/positionen", "Alle "', '"Depotwert im Verlauf"', '"Werte je Quartal"', "plain.slice(0, 6)"]) assert.ok(fund.includes(t), "Investor: " + t);
  for (const t of ['story("Investoren in drei Sätzen · "', '"Fonds"', '"Bewegung"', '"Insider"', "starsByValue.slice(0, 4)", '"Insider-Käufe und -Verkäufe"', '"Alle 13F-Melder"', "inkl. Banken, Versicherer, ETF-Anbieter"]) assert.ok(stock.includes(t), "Aktie: " + t);
  assert.match(stock, / Hedgefonds halten /, "Hedgefonds und alle 13F-Melder nie mit demselben Wort");
  assert.doesNotMatch(stock, /"Fonds halten "/);
});

const VORSORGE = walk("vorsorge");
const vPlan = readFileSync("vorsorge/ui/plan.js", "utf8"), vApp = readFileSync("vorsorge/app.js", "utf8");
test("Vorsorge: kein wording[].avoid-Begriff im sichtbaren Text", () => {
  assert.ok(VORSORGE.includes("vorsorge/ui/plan.js") && VORSORGE.includes("vorsorge/app.js"));
  assert.deepEqual(avoidHits(VORSORGE), []);
});
test("Vorsorge: ein Weg in drei Schritten, Bereiche je Schritt, keine „Wo stehst du?“/„Mehr in Vorsorge“ (Entscheidung 11)", () => {
  const home = vPlan.slice(vPlan.indexOf("VS.views.home = function"), vPlan.indexOf("/* ============================================================== PLANER */"));
  assert.match(home, /Dein Weg in drei Schritten/);
  assert.doesNotMatch(vPlan + vApp, /Wo stehst du\?|Mehr in Vorsorge/);
  const way = new Function("var VS = {};" + vApp.match(/VS\.WAY = [\s\S]*?\]\]\]\];/)[0] + "return VS.WAY;")();
  assert.deepEqual(way.map((w) => w[0]), ["Ziel rechnen", "Sparplan bauen", "Auf Kurs bleiben"]);
  const areas = way.flatMap((w) => w[3].map((n) => n[0]));
  for (const a of ["plan", "foerderung", "etfs", "portfolio", "vergleichen", "monitor", "wissen"]) assert.ok(areas.includes(a), a + " gehört zu einem Schritt");
  for (const t of ["Mit 10&nbsp;€ im Monat anfangen", "Beispielrechnung", "Was der Staat ab 2027 dazulegt", "Die großen Indizes"]) assert.ok(home.includes(t), t);
});
test("Vorsorge: große Indizes mit Hinweis Marktabbild/UCITS und Kursdatum (Entscheidung 13)", () => {
  assert.match(vPlan, /"Gemessen an US-Fonds als Marktabbild" \+ \(last \? ", Kurse bis " \+ F\.date\(last\) : ""\) \+ "\. Kaufbar in der EU sind UCITS-ETFs auf denselben Index\."/);
});

const vEtf = readFileSync("vorsorge/ui/etf.js", "utf8");
test("Vorsorge: Seite je Index mit UCITS aus dem EU-Register, Beispiele mit ISIN und Beschriftung (Entscheidungen 12, 15)", () => {
  const VS = {};
  new Function("VS", vEtf.match(/VS\.INDEXES = \[[\s\S]*?\n  \];/)[0] + vEtf.match(/VS\.ucitsOnIndex = function[\s\S]*?\n  \};/)[0])(VS);
  assert.deepEqual(VS.INDEXES.map((x) => x.us), ["URTH", "SPY", "EEM", "QQQ", "FEZ", "IWM"], "dieselben US-Fonds wie die großen Indizes");
  const u = JSON.parse(readFileSync("vorsorge/data/eu/etf-eu-ucits.json", "utf8"));
  const reg = { rows: u.rows.map((r) => Object.fromEntries(u.fields.map((f, i) => [f, r[i]]))) };
  for (const ix of VS.INDEXES) {
    assert.match(ix.id, /^[a-z0-9-]+$/);
    for (const isin of ix.ex) assert.match(isin, /^[A-Z]{2}[A-Z0-9]{9}\d$/, ix.id + " " + isin);
    const r = VS.ucitsOnIndex(reg, ix);
    assert.ok(r.count > 0, ix.id + ": UCITS-ETFs im Register");
    assert.equal(r.examples.length, 2, ix.id + ": beide Beispiele stehen im Register");
  }
  assert.match(vEtf, /VS\.UCITS_EXAMPLE_LABEL = "Beispiele, keine Empfehlung";/);
  assert.match(vEtf, /ESMA-Register, Stand ' \+ F\.date\(reg\.runDate\) \+ '\. ' \+ VS\.UCITS_EXAMPLE_LABEL/);
  assert.match(vEtf, /if \(ixr && r\.query\.fonds !== "1" && !r\.query\.tab && !r\.query\.play\) \{ global\.location\.replace\("#\/index\/" \+ ixr\.id\); return; \}/, "#/etf/URTH leitet auf die Index-Seite");
  assert.match(readFileSync("docs/legal/EINORDNUNG.md", "utf8"), /UCITS-Beispiele auf der Index-Seite[\s\S]*Beispiele, keine Empfehlung/, "Absatz für die Anwaltsmappe");
});
