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

test("App 08.11.: Rechtstexte auf anderer Herkunft öffnen im System-Browser, weil die App-Hülle im Rahmen nur research zulässt", () => {
  const nav = readFileSync("assets/site-navigation.js", "utf8"), shell = readFileSync("app/www/index.html", "utf8");
  const frameSrc = (shell.match(/frame-src ([^;]+);/) || [])[1] || "";
  assert.deepEqual(frameSrc.trim().split(/\s+/), ["https://research.visionuniverse.de"], "Ändert sich frame-src, diese Regel und scripts/quality/app-legal-menu-qa.mjs prüfen");
  const foreign = (json.appLinks?.always || []).map((x) => json.links[x.key]).filter((h) => h && new URL(h, "https://research.visionuniverse.de").origin !== "https://research.visionuniverse.de");
  assert.ok(foreign.length >= 5, "Impressum, Kontakt, Datenschutz, Nutzungsbedingungen, Risikohinweise liegen auf konto.visionuniverse.de");
  assert.match(nav, /function appExternalLink\(a\) \{[\s\S]*?u\.origin === location\.origin\) return false;\s*a\.target = '_blank'; a\.rel = 'noopener';/);
  assert.match(nav, /if \(typeof document !== 'undefined' && inApp\(\)\) \{\s*document\.addEventListener\('click'/, "nur in der App, im Web unverändert");
});

/* Konzept Quant „Ein Profil je Aktie“ (docs/design/quant-2026-11, Entscheidung 5): die Quant-Oberfläche sagt „Zone laut Methode“
   und „Ungültig-Marke laut Methode“, zeigt keine Ziele und keinen „dafür/dagegen“-Satz. Die Begriffe kommen aus wording[].avoid;
   verneinte Hinweise („kein Kursziel“, „keine Kaufempfehlung“) bleiben erlaubt. Kommentare und die Übersetzungstabelle QX.say
   (quant/app/ui.js, SAY) zählen nicht: dort steht, was übersetzt wird. */
test("Quant-Oberfläche: keine Begriffe aus wording[].avoid (Einstieg, Stopp, Ziel) in quant/app und im Chart", () => {
  const { readdirSync } = require("node:fs");
  const avoid = json.wording.flatMap((w) => w.avoid.replace(/\(.*?\)/g, "").split(/,|\s\/\s/)).map((t) => t.replace(/[„“"]/g, "").trim()).filter(Boolean);
  for (const must of ["Einstiegszone", "Einstiegsmarke", "Kaufzone", "Stop-Loss", "Stopp", "Ziel 1/2", "Chance/Risiko", "Kursziel", "Interessant ab"]) assert.ok(avoid.includes(must), must + " fehlt in wording[].avoid");
  const terms = avoid.flatMap((t) => (t === "Ziel 1/2" ? ["Ziel 1", "Ziel 2"] : [t]))
    .concat(["Stopp-Marke", "Zielzone", "Zielbereich", "Was spricht dafür"]) /* Entscheidung 5, Konzept Quant 2026-11 */
    .filter((t) => !/^(kaufen|verkaufen|sicher|Signal|Empfehlung)$/i.test(t)); /* Alltagswörter: nur als Aufforderung verboten, nicht prüfbar per Wortliste */
  const files = readdirSync("quant/app").filter((f) => /\.(js|css)$/.test(f)).map((f) => "quant/app/" + f).concat(["quant/ui/ti-chart.js"]);
  const hits = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/var SAY = \[[\s\S]*?\]\];/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
    for (const t of terms) {
      const re = new RegExp("(^|[^A-Za-zÄÖÜäöüß-])(" + t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + ")(?![a-zäöüß])", "g");
      let m; while ((m = re.exec(src))) {
        const before = src.slice(Math.max(0, m.index - 14), m.index + m[1].length);
        if (/\bkeine?[nrs]?\s*$|\bohne\s*$/i.test(before)) continue; /* „kein Kursziel“, „keine Kaufempfehlung“ */
        hits.push(f + ": " + t + " … " + src.slice(m.index, m.index + 60).replace(/\s+/g, " "));
      }
    }
  }
  assert.deepEqual(hits, []);
});
