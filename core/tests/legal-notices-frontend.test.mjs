/* Pflicht-Hinweise (Strang F): Text nur in assets/legal-notices.json, das Frontend trägt eine erzeugte Kopie
   (scripts/legal/sync-legal-notices.mjs). Vor der Freigabe (legalApproved: false) zeigt keine Seite einen Hinweis. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { legalData } from "../../scripts/legal/sync-legal-notices.mjs";

const require = createRequire(import.meta.url);
const json = JSON.parse(readFileSync("assets/legal-notices.json", "utf8"));

test("die Kopie in vu-ui.js und site-navigation.js entspricht assets/legal-notices.json", () => {
  execFileSync(process.execPath, ["scripts/legal/sync-legal-notices.mjs", "--check"], { stdio: "pipe" });
});

test("freigeschaltet (06.11.2026): VUUI.legal liefert jeden Hinweis mit Text", () => {
  const U = require("../../assets/vu-ui.js");
  assert.equal(json.legalApproved, true, "Freischaltung 06.11.2026 (RECHTLICHE_ABNAHME A15)");
  for (const [k, n] of Object.entries(json.notices)) assert.ok(U.legal(k).includes('data-legal="' + k + '"') && U.legalNotice(k).text === n.text, k);
  assert.ok(U.legalNotice("footer"));
});

test("nach der Freigabe trägt jeder Hinweis den Text und die Links der JSON-Datei", () => {
  const d = legalData(Object.assign({}, json, { legalApproved: true }));
  assert.equal(d.approved, true);
  for (const [k, n] of Object.entries(json.notices)) {
    assert.equal(d.notices[k].text, n.text, k);
    assert.deepEqual(d.notices[k].links.map((l) => l[1]), (n.links || []).filter((x) => json.links[x]).map((x) => json.links[x]), k);
  }
  assert.deepEqual(d.notices.backtest.required, json.notices.backtest.required);
});

/* Owner-Entscheidung 07.11.2026 (PLAN §11): In der App kein Seitenfuß, alles im Menü „Rechtliches & Infos“. Der Fuß darf in
   der App nur fehlen, weil jeder seiner Links und sein Satz im Menü stehen – das prüfen die folgenden Tests. */
const NAV = readFileSync("assets/site-navigation.js", "utf8");
function navMenu(approved) {
  const legal = NAV.match(/var LEGAL = (\{.*\});\n/)[1];
  const fn = NAV.slice(NAV.indexOf("function legalMenu"), NAV.indexOf("function legalFooter"));
  const L = JSON.parse(legal); L.approved = approved;
  return new Function("LEGAL", fn + "; return legalMenu();")(L);
}

test("Pflicht-Links der App: jeder Link aus appLinks.always steht im Menü unter „Rechtliches & Infos“, unabhängig von der Freigabe", () => {
  const data = legalData(json), keys = json.appLinks.always.map((l) => l.key);
  assert.deepEqual([...keys].sort(), ["bedingungen", "datenschutz", "impressum", "kontakt", "quellen", "risikohinweise"]);
  assert.equal(json.appLinks.menuTitle, "Rechtliches & Infos");
  assert.equal(data.appLinks.length, keys.length);
  for (const [label, href] of data.appLinks) { assert.ok(label); assert.match(href, /^https:\/\/(konto|research)\.visionuniverse\.de\//); }
  assert.match(NAV, /\$\{legalMenu\(\)\}<\/nav>/, "Rechtliches im Menü-Panel (Menü → Rechtliches & Infos: zwei Schritte)");
  for (const approved of [false, true]) {
    const html = navMenu(approved);
    assert.match(html, /<h2[^>]*>Rechtliches &amp; Infos<\/h2>/);
    for (const [label, href] of data.appLinks) assert.ok(html.includes('href="' + href + '"') && html.includes(label.replace(/&/g, "&amp;")), label + " fehlt im Menü (Freigabe " + approved + ")");
  }
});

test("App ohne Seitenfuß nur, wenn das Menü jeden Fuß-Link und den Fuß-Satz trägt (§ 5 DDG, Plan §11)", () => {
  const d = legalData(json), foot = d.notices.footer;
  assert.equal(json.notices.footer.app, "menu");
  assert.equal(d.footerInApp, false);
  const menu = navMenu(true);
  for (const [label, href] of foot.links) assert.ok(menu.includes('href="' + href + '"'), "Fuß-Link " + label + " fehlt im Menü");
  assert.ok(menu.includes(foot.text), "Software-/Risikosatz fehlt im Menü");
  const fn = NAV.slice(NAV.indexOf("function legalFooter"), NAV.indexOf("const dockBus"));
  assert.match(fn, /LEGAL\.footerInApp === false && inApp\(\)/, "Fuß entfällt nur in der App");
  assert.match(NAV, /function inApp\(\)[\s\S]{0,200}isNativePlatform[\s\S]{0,120}VUApp\\\/1/, "App-Erkennung: Capacitor oder User-Agent VUApp/1");
  /* Im Browser bleibt der Fuß: das JSON beschreibt ihn weiter für research.visionuniverse.de. */
  assert.match(json.notices.footer.where, /Browser/);
});

test("Datenquellen & Methodik: /infos/ nennt die Anbieter, die Produktseiten nicht mehr", () => {
  const page = readFileSync("infos/index.html", "utf8");
  assert.ok(json.links.quellen.endsWith("/infos/#quellen"));
  assert.match(page, /id="quellen"/);
  for (const name of ["Tiingo", "IEX", "SEC", "Marketstack", "FRED", "Europäische Zentralbank", "ESMA", "TraderFox", "/supertrader/sources/"]) assert.ok(page.includes(name), name);
  for (const k of ["impressum", "kontakt", "datenschutz", "bedingungen", "risikohinweise"]) assert.ok(page.includes(json.links[k]), k);
  const U = require("../../assets/vu-ui.js");
  assert.equal(U.neutralSourceText("Fremdregel: TraderFox / Sekundärrekonstruktion"), "Fremdregel: Sekundärrekonstruktion");
  assert.equal(U.neutralSourceText("Marktampel SPY > GD 200 stammt aus einer TraderFox-Variante, nicht von Darvas."), "Marktampel SPY > GD 200 stammt aus einer Drittvariante, nicht von Darvas.");
  const reg = JSON.parse(readFileSync("supertrader/data/registry.json", "utf8"));
  assert.doesNotMatch(JSON.stringify(U.neutralSources(reg)), /traderfox/i, "Supertrader-Seiten zeigen keinen Anbieternamen");
  for (const [f, re] of [["quant/app/page-stock.js", /"Tiingo|SEC EDGAR, bis/], ["quant/app/app.js", /Daten: SEC EDGAR, Tiingo/], ["quant/app/pages.js", /Daten: SEC EDGAR, Tiingo/], ["portfolios/portfolios.js", /\(Tiingo, split/], ["supertrader/assets/supertrader.js", /Dateninfrastruktur \(Tiingo/]])
    assert.doesNotMatch(readFileSync(f, "utf8"), re, f);
});

test("Folgeauftrag 07.11.: Fundamental-Kapitel, Quant „Zahlen“, Vorsorge-ETF-Texte ohne Anbieternamen; Darvas mit einem Hinweissatz", () => {
  const fu = readFileSync("fundamental/app.js", "utf8"), cut = fu.indexOf("F05 Methodik */"), page = fu.slice(0, cut);
  assert.match(page, /'Meldungen & Downloads', 'Meldungen je Jahr, Daten als CSV'/, "Downloads bleiben, Titel ohne Anbieter");
  assert.match(page, /Jahreswerte als CSV herunterladen/);
  for (const re of [/Quellen & Downloads/, /SEC-Meldungen je Jahr/, /öffnet sec\.gov/, /Alle Meldungen bei der SEC/, /'SEC EDGAR Companyfacts'/, /Branche \(SEC\)/, /SEC-Branchencode/]) assert.doesNotMatch(page, re, String(re));
  const tools = readFileSync("quant/app/page-tools.js", "utf8");
  assert.doesNotMatch(tools, /SEC EDGAR|SEC-Daten im Dateninspektor|aus den SEC-Berichten/);
  for (const f of ["vorsorge/ui/etf.js", "vorsorge/ui/plan.js", "vorsorge/ui/portfolio.js"]) assert.doesNotMatch(readFileSync(f, "utf8").replace(/^\s*(\/\/|\/\*|\*).*$/gm, ""), /SEC-Daten|SEC N-PORT|Tiingo/, f);
  const st = readFileSync("supertrader/assets/st-redesign.js", "utf8");
  assert.doesNotMatch(st, /note\('Modellsignale einer regelbasierten Nachbildung/, "nur foot() trägt den Hinweissatz");
});
