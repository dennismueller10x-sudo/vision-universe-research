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

/* Owner-Entscheidung 10.11.2026: In Browser und App kein Rechtsfuß. Jeder seiner Links und
   sein Satz bleiben im Menü „Rechtliches & Infos“ erreichbar (§ 5 DDG, zwei Schritte). */
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

test("Browser und App ohne Seitenfuß; Menü trägt jeden Fuß-Link und den Fuß-Satz (§ 5 DDG)", () => {
  const d = legalData(json), foot = d.notices.footer;
  assert.equal(json.notices.footer.app, "menu");
  assert.equal(json.notices.footer.web, "menu");
  assert.equal(d.footerInApp, false);
  assert.equal(d.footerOnWeb, false);
  const menu = navMenu(true);
  for (const [label, href] of foot.links) assert.ok(menu.includes('href="' + href + '"'), "Fuß-Link " + label + " fehlt im Menü");
  assert.ok(menu.includes(foot.text), "Software-/Risikosatz fehlt im Menü");
  const fn = NAV.slice(NAV.indexOf("function legalFooter"), NAV.indexOf("  if (typeof document", NAV.indexOf("function legalFooter")));
  for (const app of [false, true]) for (const approved of [false, true]) {
    const writes = [];
    const document = { body: { appendChild: n => writes.push(n) }, querySelector: () => null,
      createElement: tag => { writes.push(tag); return { appendChild() {}, setAttribute() {} }; } };
    new Function("LEGAL", "inApp", "document", fn + "; legalFooter();")({ ...d, approved }, () => app, document);
    assert.deepEqual(writes, [], `Kein Fuß im ${app ? "App" : "Browser"}-Modus, Freigabe ${approved}`);
  }
  assert.match(NAV, /function inApp\(\)[\s\S]{0,200}isNativePlatform[\s\S]{0,120}VUApp\\\/1/, "App-Erkennung bleibt für externe Rechtslinks erhalten");
});

test("Seiten mit eigenem Kopf öffnen dasselbe zentrale Menü", () => {
  for (const file of ["index.html", "scripts/home/index.template.html", "ask/index.html", "preise/index.html", "willkommen/start/index.html"]) {
    const page = readFileSync(file, "utf8");
    assert.match(page, /<vu-navigation menu-only no-dock/, file);
    assert.match(page, /data-vu-menu-toggle/, file);
    assert.match(page, /src="\/assets\/site-navigation.js"/, file);
  }
  assert.match(NAV, /nav\.openMenu\(opener\)/);
});

test("keine ausgelieferte HTML-Seite enthält den Fuß-Satz außerhalb des Menüs oder einen eigenen Rechtsfuß", () => {
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.html"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
  assert.ok(files.includes("index.html") && files.includes("infos/index.html") && files.includes("morning/index.html"));
  for (const file of files) {
    const html = readFileSync(file, "utf8");
    // Das globale Menü wird aus site-navigation.js erzeugt; ein statisches Menü darf den Satz ebenfalls tragen.
    const outsideMenu = html.replace(/<nav\b[^>]*id=["']site-panel["'][^>]*>[\s\S]*?<\/nav>/gi, "");
    const visibleText = outsideMenu.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.doesNotMatch(visibleText, /Vision Universe ist eine Software zur Analyse von Aktien/, file + ": Fuß-Satz außerhalb des Menüs");
    assert.doesNotMatch(outsideMenu, /(?:legalNotice|legal)\(["']footer["']\)|data-legal(?:-source)?=["']footer["']/i, file + ": dynamische Fuß-Kopie");
    // Landing hat eine eigene Domain und eigene Rechtsseiten; deren Layout gehört nicht zu research.
    if (file.startsWith("landing/")) continue;
    for (const footer of html.matchAll(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi)) {
      assert.ok(!(/Impressum/i.test(footer[0]) && /Datenschutz|Risikohinweise/i.test(footer[0])), file + ": eigene Rechtslink-Reihe im Fuß");
    }
  }
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

test("App 08.11.: Rechtstexte auf anderer Herkunft öffnen im System-Browser, weil die App-Hülle im Rahmen nur research zulässt", () => {
  const nav = readFileSync("assets/site-navigation.js", "utf8"), shell = readFileSync("app/www/index.html", "utf8");
  const frameSrc = (shell.match(/frame-src ([^;]+);/) || [])[1] || "";
  assert.deepEqual(frameSrc.trim().split(/\s+/), ["https://research.visionuniverse.de"], "Ändert sich frame-src, diese Regel und scripts/quality/app-legal-menu-qa.mjs prüfen");
  const foreign = (json.appLinks?.always || []).map((x) => json.links[x.key]).filter((h) => h && new URL(h, "https://research.visionuniverse.de").origin !== "https://research.visionuniverse.de");
  assert.ok(foreign.length >= 5, "Impressum, Kontakt, Datenschutz, Nutzungsbedingungen, Risikohinweise liegen auf konto.visionuniverse.de");
  assert.match(nav, /function appExternalLink\(a\) \{[\s\S]*?u\.origin === location\.origin\) return false;\s*a\.target = '_blank'; a\.rel = 'noopener';/);
  assert.match(nav, /if \(typeof document !== 'undefined' && inApp\(\)\) \{\s*document\.addEventListener\('click'/, "nur in der App, im Web unverändert");
});
