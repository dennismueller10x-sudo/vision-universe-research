/* Vision Universe — ask/tests/atlas-answer.test.mjs
   Atlas-Antwort nach dem Konzept mein-bereich-2026-11 (Screens a-home, a-screen, a-answer):
   Regel-Chips aus der Übersetzung, Screener-Link mit genau diesen Regeln, „Erklären“ aus der SEC-Jahresreihe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { translate } from "../../workers/vu-ask/src/translate.mjs";

const require = createRequire(import.meta.url);
const Ask = require("../engine.js");

const find = translate({ kind: "screen", understood: "Kleine Firmen, günstig, ohne Netto-Schulden", tickers: [], show: ["pe", "marketCap", "netCash"], sort: { field: "pe", dir: "asc" }, limit: 25, missing: [], notes: [],
  filters: [{ field: "marketCap", op: "between", value: 3e8, value2: 2e9, values: [], flag: null }, { field: "pe", op: "lt", value: 15, value2: null, values: [], flag: null },
    { field: "netCash", op: "gt", value: 0, value2: null, values: [], flag: null }],
  supertrader: { strategy: "NONE", mode: "none" } });

test("Finden: je Regel ein Chip, „alle drei“, Screener-Link trägt genau die Regeln", () => {
  const rules = Ask.rules(find);
  assert.equal(rules.length, 3);
  assert.ok(rules.every((r) => r.kind === "filter" && r.text && r.id));
  assert.match(rules.map((r) => r.text).join(" | "), /KGV/);
  assert.equal(Ask.allOf(rules.length), "alle drei");
  assert.equal(Ask.allOf(1), "die Regel");
  const url = Ask.screenerUrl(find);
  assert.match(url, /^\/screener\/\?/);
  for (const f of ["marketCap%3Abetween%3A300000000%3A2000000000", "pe%3Alt%3A15", "netCash%3Agt%3A0"]) assert.ok(url.includes(f), f);
  const withMethod = translate({ kind: "screen", understood: "", tickers: [], show: [], limit: 25, missing: [], notes: [], filters: [], supertrader: { strategy: "WEINSTEIN_STAGE", mode: "require" } });
  assert.deepEqual(Ask.rules(withMethod).map((r) => r.kind), ["strategy"]);
});

test("Erklären: Jahresreihe aus den SEC-Berichten der Aktiendatei, letzter Wert zum Vorjahr", () => {
  const file = { fundamentals: { asOf: "2026-11-08", journey: { tracks: { free_cash_flow: [2021, 2022, 2023, 2024, 2025, 2026].map((fy, i) => ({ fy, v: [1, 8.1, 3.8, 27.0, 60.9, 96.7][i] * 1e9 })) } } } };
  assert.equal(Ask.secTrack(["fcfGrowth", "pe"]), "free_cash_flow");
  assert.equal(Ask.secTrack(["pe"]), null);
  const e = Ask.explain(file, "free_cash_flow", 4);
  assert.deepEqual([e.fromFy, e.toFy, e.bars.length, e.label], [2023, 2026, 4, "Free Cashflow"]);
  assert.ok(Math.abs(e.lastChange - (96.7 / 60.9 - 1)) < 1e-12);
  assert.match(e.formula, /operativer Cashflow − Investitionen/);
  assert.equal(Ask.explain({ fundamentals: { journey: { tracks: {} } } }, "free_cash_flow"), null, "ohne Reihe keine erfundene Antwort");
  assert.equal(Ask.explain(file, "free_cash_flow", 4).asOf, "2026-11-08");
});

test("Seite: ein Status-Satz, Was die KI kann, Oft gefragt, Grenzen in einem „?“, Knöpfe der Antwort", () => {
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  for (const s of ["Frag in deinen Worten.", "Was die KI kann", "Oft gefragt", "Finden", "Vergleichen", "Erklären", "So hat die KI übersetzt", "So hat Vision Universe gerechnet", "im Screener", "Regel ändern", "Weiter fragen", "keine Empfehlung"]) assert.ok(src.includes(s), s);
  assert.match(src, /href: Ask\.screenerUrl\(r\)/, "Alle N im Screener über das vorhandene screenerUrl");
  assert.doesNotMatch(src, /Noch gesperrt'\)\)|Atlas fragt diese Welten|Probier zum Beispiel|ak-trust/, "zwei Zustände, Welten-Kacheln und Hinweisblöcke entfallen");
  assert.match(src, /U\.q\(/, "Grenzen in einem „?“");
  // Owner 16.11.2026: „Vision Universe KI“ – „Vision Universe“ klein als Dachzeile, „KI“ groß; Beta bleibt; kein sichtbares „Atlas“
  assert.match(src, /h\('span', \{ class: 'vu-ltag', text: 'Vision Universe' \}\), h\('span', \{ class: 'ak-beta', text: 'Beta' \}\)/);
  assert.match(src, /h\('h1', \{ class: 'ak-h1' \}, \[h\('span', \{ class: 'vu-visually-hidden', text: 'Vision Universe ' \}\), 'KI'\]\)/);
  assert.equal((src.match(/'[^'\n]*'/g) || []).filter((x) => /Atlas/.test(x)).length, 0, "kein sichtbarer Text mit „Atlas“");
  // KI-Knopf im Kopf öffnet /ask/?fokus=1: Fokus auf der Eingabe
  assert.match(src, /if \(params\.get\('fokus'\) === '1'\) \{ try \{ input\.focus\(\{ preventScroll: true \}\); \}/);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<title>Vision Universe KI<\/title>/);
  const legal = JSON.parse(readFileSync(new URL("../../assets/legal-notices.json", import.meta.url), "utf8"));
  const visible = (src.match(/'[^'\n]*'/g) || []).filter((x) => !/^'\//.test(x)).join(" ") /* Pfade zählen nicht */.replace(/\bkeine?n? [\wäöüß-]+( oder [\wäöüß-]+)?/gi, " ").replace(/kaufen oder verkaufen sollst/g, "").toLowerCase();
  const avoid = legal.wording.flatMap((w) => String(w.avoid || "").replace(/\([^)]*\)/g, "").split(/,| \/ /)).map((a) => a.trim().toLowerCase()).filter((a) => a.length > 3);
  for (const a of avoid) assert.ok(!visible.includes(a), "vermeiden: " + a);
});

/* App-Konzept 2 (Owner 14.11.2026): nur Darstellung. Bausteine aus assets/vu-ui.js statt eigener; der Frageweg bleibt, wie er war. */
test("Darstellung App-Konzept 2: Schiene und Kacheln am Start, neongrüne Übersetzungskarte, Gerüst beim Laden, „Weiter“-Karte; Frageweg unverändert", () => {
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8"), css = readFileSync(new URL("../ask.css", import.meta.url), "utf8"), html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const UI = require("../../assets/vu-ui.js");
  assert.match(src, /U\.rail\(CAN\.map\(/, "„Was die KI kann“ als Schiene");
  assert.match(src, /U\.tap\([^\n]*\n?[^\n]*cls: 'ak-can-card', attrs: \{ 'data-ak-ask': c\.q \}/, "Kachel je Beispiel");
  assert.match(src, /cls: 'ak-often-q', attrs: \{ 'data-ak-ask': q \}/, "„Oft gefragt“ als Kacheln");
  assert.match(src, /if \(b && startEl\.contains\(b\)\) ask\(b\.getAttribute\('data-ak-ask'\), true\)/, "Kacheln stellen die Frage über ask(q, true) wie zuvor");
  assert.match(src, /class: 'ak-ans ak-ans--lime'/, "Übersetzung als neongrüne Karte");
  assert.ok(src.indexOf("class: 'ak-count'") < src.indexOf("class: 'ak-rcs' }, rules.map"), "die große Zahl steht vor den Regeln");
  assert.match(src, /U\.skeleton\('rows'\)/, "Laden zeigt das Gerüst der Antwort");
  const screener = JSON.parse(readFileSync(new URL("../../products/screener/module.json", import.meta.url), "utf8")).navigation;
  assert.ok(src.includes(`U.next({ title: '${screener.label}', sub: '${screener.claim}', href: '${screener.href}' })`), "„Weiter“-Karte mit Name und Satz aus dem Steckbrief des Screeners");
  /* Frageweg: genau ein Aufruf je Endpunkt, Beispiele und feste Fragen wörtlich wie zuvor */
  assert.equal((src.match(/fetch\(ENDPOINT \+ '\/v1\/ask'/g) || []).length, 1);
  assert.equal((src.match(/fetch\(ENDPOINT \+ '\/v1\/quota/g) || []).length, 1);
  for (const q of ["Kleine Firmen, günstig, ohne Schulden", "NVIDIA gegen AMD und Broadcom", "Wie stark ist der Free Cashflow bei NVIDIA gewachsen?", "Welche Aktien stehen auf einem neuen Jahreshoch?", "Welche Aktien stehen im Weinstein-Stage-2?", "Wie hoch ist die Marge bei Apple?"]) assert.ok(src.includes(`'${q}'`), q);
  /* Farben: nur Schwarz, Weiß, Graustufen, Neongrün, das Nachtschwarz der Bausteine und die Töne des Prototyps
     (prototyp/quelle/kit.js, shell.js); Rot nur für die Tagesbewegung im Minus (Owner 15.11.2026). */
  const PROTOTYP = ["c8f531", "0e1013", "f4f5f1", "a1a7af", "c3c7cc", "2a2a2d", "151516", "202022", "232325", "101318", "55595f", "08080a", "c4281c"];
  for (const hex of css.match(/#[0-9a-f]{3,8}\b/gi) || []) {
    const h = hex.slice(1).toLowerCase(), full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    assert.ok(PROTOTYP.includes(full) || (full.slice(0, 2) === full.slice(2, 4) && full.slice(2, 4) === full.slice(4, 6)), "Farbe außerhalb der Palette: " + hex);
  }
  assert.match(css, /\.ak-app \.vu-chg--down\{background:#c4281c;color:#fff\}/, "Minus als rote Pille (Owner 15.11.2026)");
  assert.ok(html.includes(`/assets/vu-ui.css?v=${UI.VERSION}`) && html.includes(`/assets/vu-ui.js?v=${UI.VERSION}`), "Marke der Bausteine");
  /* App-Konzept 2 nach Prototyp (Owner 16.11.2026): der Rahmen wie jede Seite statt eines eigenen Kopfs, dunkel als Standard */
  assert.match(html, /<body class="ak vu-ui">\n<vu-navigation theme="dark" theme-switch><\/vu-navigation>/, "Rahmen wie jede Seite");
  assert.doesNotMatch(html, /menu-only|class="ak-hd"/, "kein eigener Kopf mehr");
  assert.match(html, /<meta name="theme-color" content="#08080a">/);
  /* Vorlage Fenster „suche“: Suchpille mit Lupe, Satz in der neongrünen Karte, schwarzer Knopf darin, „Aktien“ als Zeilen */
  assert.match(src, /h\('span', \{ class: 'ak-find-ic' \}, \[icon\('search'\)\]\), input/, "Lupe in der Suchpille");
  assert.match(src, /h\('h2', \{ class: 'ak-count' \}/, "Satz als h2 wie im Prototyp");
  assert.match(src, /translated\(r, res, drop, tips, h\('a', \{ class: 'vu-btn vu-btn--ink ak-btn2 ak-btn-all', href: Ask\.screenerUrl\(r\)/, "Knopf „Alle N im Screener“ in der Karte");
  assert.match(src, /'<div class="ak-eb">Aktien<\/div><div class="ak-list">'/);
  /* Aktien führen auf die gemeinsame Aktienseite; Kurse nur über published-close.js (ADR-002) */
  assert.match(src, /href="\/aktie\/#\/' \+ encodeURIComponent\(sym\) \+ '" data-vu-stock="/);
  assert.doesNotMatch(src, /\/discover\/#\/s\/US_REAL\/' \+ encodeURIComponent\((row|s)\.symbol\) \+ '"/, "Trefferzeilen nicht mehr nach Discover");
  assert.match(src, /Close\.lastPoint\(series, today\)/);
  assert.ok(html.indexOf('/quant/engines/published-close.js') > 0 && html.indexOf('/quant/engines/published-close.js') < html.indexOf('/ask/app.js'));
  /* Owner 22.11.2026: der Pflicht-Hinweis „ai“ steht im Fenster „Daten & Hinweise“ (Menü), nicht mehr am Seitenende */
  assert.doesNotMatch(src, /main\.appendChild\(markup\(U\.legal\('ai'\)\)\)|class: 'ak-end'/);
  assert.match(src, /Nav\.hinweis\('ai'\)/);
});
