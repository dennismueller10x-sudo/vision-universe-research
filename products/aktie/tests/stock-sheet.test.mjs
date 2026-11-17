/* Aktien-Vorschau (assets/vu-stock-sheet.js) und gemeinsame Aktienseite /aktie/ (aktie/app.js) – App-Konzept 2, Prototyp sh-stock / #v-aktie.
   Geprüft wird das Modell (nur belegte Aussagen), das Markup der Vorschau, die Regeln, die es von anderen Seiten übernimmt, und der Seitenrahmen. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const S = require(join(ROOT, "assets", "vu-stock-sheet.js"));
const U = require(join(ROOT, "assets", "vu-ui.js"));
const M = S.model;

const detail = () => ({
  symbol: "TEST", companyName: "Test AG", was: "Baut Prüfstände", asOf: "2026-11-13", price: { value: 100 }, changePercent: { value: -1.5 },
  metrics: { distanceTo52wHigh: -0.19 }, rawValues: { distanceToSMA200: -0.187 },
  geschaeftszahlen: { umsatzWachstum: 0.65 },
  memberships: [{ rowId: "a", title: "LANGFRISTIGE COMPOUNDER", rank: 2, of: 185 }, { rowId: "b", title: "QUALITÄT", rank: 5, of: 300 }, { rowId: "sector-leaders", title: "X", rank: 1, of: 9 }],
  technicalIntelligence: { available: true, layers: { marketStructure: { status: "available", state: { regime: "BULLISH" } },
    supportResistance: { status: "available", nearestSupport: { zoneLow: 80, zoneHigh: 85 }, nearestResistance: { zoneLow: 110, zoneHigh: 120 } } } },
  fundamentals: { asOf: "2026-11-13", latestFiscalYear: 2026,
    health: { available: true, horizon: { years: 10 }, categories: [{ id: "growth", label: "Wachstum", grade: "Sehr stark", value: 0.45, detail: "Umsatz +45 % pro Jahr" }, { id: "profitability", label: "P", grade: "Solide", value: 0.08 }] },
    valuation: { available: true, pe: { value: 31.2 }, ps: { value: 4 }, relative: { stufe: "hoch", peMedian: 20.1 } },
    journey: { available: true, tracks: { revenue: [2023, 2024, 2025, 2026].map((fy, i) => ({ fy, v: 100 * (i + 1) })), net_income: [{ fy: 2025, v: 10 }, { fy: 2026, v: 5 }], free_cash_flow: [{ fy: 2026, v: 1 }] } } },
  discoverNext: { similar: { cards: [{ symbol: "AAA", companyName: "Alpha", performancePath: [{ value: 80 }, { value: 100 }], metrics: { return12M: 0.25 } }, { symbol: "SAP.DE", companyName: "Europa" }] } }
});
const watch = () => ({
  name: "Test AG", price: { state: "AVAILABLE", close: 101.5, currency: "USD", change: 0.02, date: "2026-11-13" },
  quant: { state: "AVAILABLE", asOf: "2026-11-13", factors: [["quality", 43.6], ["growth", 86.1], ["momentum", 52.7], ["value", 61.8], ["profitability", 98.6], ["revisions", null], ["risk", 82.9]].map(([id, score]) => ({ id, state: score == null ? "UNAVAILABLE" : "AVAILABLE", score })) },
  trend: { state: "AVAILABLE", structure: "BEARISH", rsi14: 24.9 }, high52: { state: "AVAILABLE", signal: "NEW_HIGH", distance: 0 },
  supertrader: { state: "AVAILABLE", asOf: "2026-11-13", entries: [{ name: "Methode A", state: "SETUP", stateLabel: "Einstieg vorbereitet", released: false }] },
  funds13f: { state: "AVAILABLE", period: "2026-09-30", holders: 417, newPositions: ["x"] },
  elliott: { state: "UNAVAILABLE", reason: "NOT_COVERED" }
});

/* Quellen der Modulseiten (Klickentwurf 17.11.2026): Technical-Stand, Supertrader-Methoden, Wellen-Index, Verfügbarkeit. */
const tech = (t50 = true, t200 = true) => ({ s: "TEST", asOf: "2026-11-13", frozenSince: null, trend: [t50, t200, true, true] });
const NAMES = { ORDER: Array.from({ length: 13 }, (_, i) => "C" + String(i + 1).padStart(2, "0")), name: (c) => ({ C05: "Weinstein · Trader" }[c] || c) };
const sf = () => ({ asOf: "2026-11-13", views: [{ ticker: "TEST", candidateId: "C05", stage: "CHART_CANDIDATE", met: ["A", "B", "C"], notMet: [], pending: [] }, { ticker: "ANDERE", candidateId: "C01", stage: "MODELED_TRADE_PLAN" }] });
const ew = (rows = []) => ({ applicable: { n: 5052, count: 40, asOf: "2026-11-13", rows } });
const avail = (mods) => ({ schema: "vu-stock-availability-1", modules: Object.fromEntries(mods.map((m) => [m, { US: ["TEST"] }])) });
globalThis.VUCore = globalThis.VUCore || {};
globalThis.VUCore.StockContext = require(join(ROOT, "core", "stock-context.js"));

test("AK-1 · Modell: drei Urteile, Kurs und Module aus den Quellen der Modulseiten; der veröffentlichte Schluss der Übersicht geht vor", () => {
  const v = M.summarize({ ticker: "test", detail: detail(), watch: watch(), tech: tech(), sf: sf(), stNames: NAMES, ew: ew(), avail: avail(["supertrader", "technik"]) });
  assert.equal(v.ticker, "TEST"); assert.equal(v.href, "/aktie/#/TEST"); assert.equal(v.what, "Baut Prüfstände");
  assert.deepEqual(v.price, { value: 101.5, currency: "USD", changePct: 2, date: "2026-11-13" });
  assert.deepEqual([v.business.word, v.business.tone, v.business.sentence], ["Solide", "mid", "Wächst stark und verdient solide. Umsatz +65 % in zwölf Monaten."], "Urteil der Fundamental-Seite: die schwächere Stufe");
  assert.deepEqual([v.chart.word, v.chart.tone], ["Aufwärtstrend intakt", "strong"], "Urteil der Technical-Seite (SMA 50/200), nicht die Marktstruktur der Übersicht");
  assert.deepEqual([v.valuation.word, v.valuation.tone, v.valuation.sentence], ["Teurer als der Markt", "weak", "KGV 31,2, Markt 20,1."]);
  assert.deepEqual(Object.keys(v.modules).sort(), ["discover", "elliott", "fundamental", "hedgefonds", "quant", "supertrader", "technical"]);
  assert.deepEqual([v.modules.fundamental.word, v.modules.fundamental.text], ["Solide", "Wächst stark und verdient solide"]);
  assert.equal(v.modules.technical.word, v.chart.word, "Kachel und „In drei Sätzen“ sagen dasselbe");
  assert.equal(v.modules.quant.word, "3 von 6 stark"); assert.equal(v.modules.quant.profile.profitability, 99);
  assert.equal("revisions" in v.modules.quant.profile, false, "Analysten sind zurückgestellt");
  assert.deepEqual([v.modules.supertrader.word, v.modules.supertrader.count, v.modules.supertrader.total], ["1 von 13 Methoden", 1, 13], "die 13 Methoden der Supertrader-Seite, nicht die alte Signalliste");
  assert.deepEqual(v.modules.supertrader.entries.map((e) => [e.name, e.stageText]), [["Weinstein · Trader", "Muster erkannt"]]);
  assert.equal(v.modules.supertrader.href, "/supertrader/stock/TEST/");
  assert.deepEqual(v.modules.technical.support, { lo: 80, hi: 85, tone: "up" });
  assert.deepEqual([v.modules.elliott.word, v.modules.elliott.countable, v.modules.elliott.share.count], ["Keine Zählung", false, 40], "wie die Elliott-Seite: nicht im Wellen-Index „Heute anwendbar“");
  assert.deepEqual(v.modules.discover.best, { rank: 2, title: "LANGFRISTIGE COMPOUNDER" }); assert.equal(v.modules.discover.rows, 2);
  assert.equal(v.modules.discover.story.business && v.modules.discover.story.business.word, v.modules.fundamental.word, "Discover-Fenster „Geschäft“ = Fundamental-Urteil (wie discover/ui/overview.js#businessVerdict)");
  assert.deepEqual(v.tracks.map((t) => [t.id, t.value, Math.round(t.growthPct)]), [["revenue", 400, 33], ["net_income", 5, -50]], "Cashflow mit einem Jahr entfällt");
  assert.deepEqual(v.similar.map((x) => x.ticker), ["AAA"], "nur US-Kürzel");
  assert.deepEqual(v.pills.map((p) => p.text), ["3 von 6 stark", "1 von 13 Methoden", "Jahreshoch", "1 neue Position"]);
  assert.deepEqual([v.short, v.rest], ["Test", ""]);
});

test("AK-2 · Fehlt eine Quelle, entfällt ihr Teil – nichts wird ergänzt", () => {
  const only = M.summarize({ ticker: "TEST", detail: detail() });
  assert.equal(only.price.value, 100); assert.equal(only.price.changePct, -1.5);
  assert.equal(only.chart, undefined, "ohne Technical-Stand kein Kurs-Urteil (keine Ersatzquelle mit anderer Lesart)");
  assert.deepEqual(Object.keys(only.modules).sort(), ["discover", "fundamental"]);
  assert.deepEqual(only.pills, []);
  const none = M.summarize({ ticker: "TEST", name: "Nur Name" });
  assert.equal(none.name, "Nur Name"); assert.equal(none.price, undefined); assert.equal(none.business, undefined);
  assert.deepEqual(none.modules, {}); assert.deepEqual(none.tracks, []); assert.deepEqual(none.similar, []); assert.deepEqual(none.news, []);
  const w = watch(); w.quant.state = "STALE"; w.high52.signal = "BELOW";
  const stale = M.summarize({ ticker: "TEST", watch: w, hedge: { fundCount: 417, starCount: 33, buyers: 198, sellersCount: 193 } });
  assert.equal(stale.modules.quant, undefined, "veraltete Eigenschaften werden nicht gezeigt");
  assert.equal(stale.modules.supertrader, undefined, "die alte Signalliste der Übersicht zählt nicht mehr");
  assert.equal(stale.modules.elliott, undefined, "ohne Wellen-Index keine Elliott-Aussage");
  assert.deepEqual(stale.pills.map((p) => p.text), ["198 Käufe"], "keine Pille für 0 Methoden und kein Jahreshoch");
  assert.deepEqual([stale.modules.hedgefonds.word, stale.modules.hedgefonds.tone], ["Ausgeglichen", "mid"]);
  /* Supertrader ohne Treffer: Kachel „Keine der 13“ nur mit belegter Seite; ohne Beleg keine Kachel. */
  const noHit = { asOf: "2026-11-13", views: [] };
  assert.equal(M.summarize({ ticker: "TEST", sf: noHit, stNames: NAMES, avail: avail(["supertrader"]) }).modules.supertrader.word, "Keine der 13");
  assert.equal(M.summarize({ ticker: "TEST", sf: noHit, stNames: NAMES, avail: avail([]) }).modules.supertrader, undefined);
  assert.equal(M.summarize({ ticker: "TEST", sf: sf(), stNames: NAMES, avail: avail([]) }).modules.supertrader.href, "/supertrader/stock/?s=TEST", "Treffer ohne eigene Seite: die Seite mit ?s=");
  /* Elliott zählbar: Welle aus dem Index, Muster in Worten der Elliott-Seite. */
  const ewM = require(join(ROOT, "elliott", "engine", "home-model.js"));
  const e = M.summarize({ ticker: "TEST", ew: ew([{ t: "TEST", el: "ZIGZAG:C", dir: "BEARISH", st: "DOWNTREND_ADVANCING", inv: 5.25, cur: "USD" }]), ewModel: ewM }).modules.elliott;
  assert.deepEqual([e.countable, e.word, e.pattern, e.direction], [true, "Welle C", "Zickzack", "DOWN"]);
  assert.equal(M.summarize({ ticker: "TEST", ew: ew([{ t: "TEST", el: "IMPULSE:done" }]), ewModel: ewM }).modules.elliott.word, "Impuls abgeschlossen");
  /* Technical: ruhender Kurs ohne Aussage; jede Lage wie die Technical-Seite. */
  assert.equal(M.summarize({ ticker: "TEST", tech: { ...tech(), frozenSince: "2026-10-01" } }).chart.word, "Keine Aussage zum Trend");
  assert.equal(M.summarize({ ticker: "TEST", tech: tech(false, false) }).modules.technical.word, "Abwärtstrend");
});

test("AK-3 · News: nur Artikel, die das Kürzel führen", () => {
  const v = M.summarize({ ticker: "TEST", detail: detail(), articles: [{ titel: "A", href: "/insights/a/", ticker: ["TEST"], rubrik: "Tagesthema" }, { titel: "B", href: "/insights/b/", ticker: ["ANDERE"] }] });
  assert.deepEqual(v.news.map((n) => n.title), ["A"]);
});

test("AK-4 · Übernommene Regeln stimmen mit ihren Quellen: Wörter der Eigenschaften, Stark-Schwelle, Fonds-Bewegung, Trendwörter", () => {
  for (const k of M.PROFILE_KEYS) assert.equal(M.PROFILE_LABEL[k], U.PROFILE.label[k], k);
  assert.deepEqual(M.PROFILE_KEYS, U.PROFILE.keys.slice(0, 6));
  assert.equal(U.PROFILE.strong(M.STRONG), true); assert.equal(U.PROFILE.strong(M.STRONG - 1), false);
  const hf = read("hedgefonds/app.js");
  assert.match(hf, /if \(r >= 0\.6\) return \{ kind: "strong", text: "Mehr Käufer"/); assert.match(hf, /if \(r <= 0\.4\) return \{ kind: "weak", text: "Mehr Verkäufer"/);
  assert.deepEqual(M.balance(6, 4), ["Mehr Käufer", "strong"]); assert.deepEqual(M.balance(4, 6), ["Mehr Verkäufer", "weak"]); assert.deepEqual(M.balance(5, 5), ["Ausgeglichen", "mid"]); assert.equal(M.balance(0, 0), null);
  assert.match(read("hedgefonds/app.js"), /var STOCK_SHARDS = 32;/); assert.match(read("aktie/app.js"), /var HEDGE_SHARDS = 32;/);
  assert.match(read("konto/watchlist.js"), /BULLISH: 'Aufwärtstrend', BEARISH: 'Abwärtstrend', MIXED: 'Gemischt', RANGE: 'Seitwärts'/);
  assert.deepEqual(Object.fromEntries(Object.entries(M.TREND).map(([k, v]) => [k, v[0]])), { BULLISH: "Aufwärtstrend", BEARISH: "Abwärtstrend", MIXED: "Gemischt", RANGE: "Seitwärts" });
  assert.match(read("discover/app.js"), /WATCH_KEY='vu-discover-watchlist-v1'/); assert.match(read("assets/vu-stock-sheet.js"), /WATCH_KEY = "vu-discover-watchlist-v1"/);
});

test("AK-5 · Vergleich: nur Eigenschaften, die beide tragen; keine Gesamtnote", () => {
  const c = M.compare({ profitability: 99, growth: 86, quality: null, momentum: 53, value: 63, risk: 83 }, { profitability: 65, growth: 79, quality: 64, momentum: 93, value: 35, risk: 56 });
  assert.equal(c.of, 5); assert.equal(c.aWins, 4); assert.equal(c.bWins, 1);
  assert.equal(M.compare(null, {}), null); assert.equal(M.compare({ growth: null }, { growth: 5 }), null);
  const html = S.html.compare({ ticker: "AAA", name: "Alpha" }, { ticker: "BBB", name: "Beta <b>" }, c);
  assert.match(html, /AAA vorn: 4 von 5/); assert.match(html, /href="\/quant\/#\/vergleich\/AAA,BBB"/); assert.doesNotMatch(html, /<b>"/); assert.match(html, /keine Empfehlung/);
});

test("AK-6 · Vorschau wie im Prototyp: Kopf, Herz, Chartfläche, drei Urteile, Pillen, „Ganz öffnen“; „Vergleichen“ nur mit Partner", () => {
  const v = M.summarize({ ticker: "TEST", detail: detail(), watch: watch(), tech: tech(), sf: sf(), stNames: NAMES });
  const html = S.html.preview(v, { saved: true, compare: true, values: [1, 2, 3] });
  for (const re of [/class="k-lg b"/, /<h2 class="k-h2" style="font-size:24px">Test AG<\/h2>/, /data-vsk-heart="TEST" aria-pressed="true"/, /data-vsk-chart/, /In diesen Modulen/, /href="\/aktie\/#\/TEST" data-vsk-open>Ganz öffnen/, /data-vsk-compare>Vergleichen/]) assert.match(html, re);
  assert.equal((html.match(/class="k-f1 k-card"/g) || []).length, 3);
  assert.equal((html.match(/class="k-pill dk k-tap"/g) || []).length, 4);
  assert.doesNotMatch(S.html.preview(v, {}), /data-vsk-compare/);
  const bare = S.html.preview(M.summarize({ ticker: "TEST", name: "X" }), {});
  assert.doesNotMatch(bare, /In diesen Modulen|k-card/);
  assert.match(S.html.preview(M.summarize({ ticker: "TEST", name: '<img src=x onerror=1>' }), {}), /&lt;img src=x/);
});

test("AK-7 · Tagesbewegung: neongrün bei Plus, rot bei Minus (Owner 15.11.2026, wie assets/stock-navigator.css)", () => {
  assert.match(S.draw.move(1.234, true), /k-move--up k-move--big.*▲ \+1,23 %/s); assert.match(S.draw.move(-4.34), /k-move--down.*▼ −4,34 %/s);
  assert.match(S.draw.move(0), /k-move--flat/); assert.equal(S.draw.move(null), "");
  const css = read("assets/vu-stock-sheet.css"), nav = read("assets/stock-navigator.css");
  assert.match(css, /\.k-move--down\{background:#c4281c;color:#fff\}/); assert.match(nav, /data-direction=down\] \.vu-shead-change\{background:#c4281c;color:#fff\}/);
  assert.match(css, /\.k-move--up\{background:#c8f531;color:#101318\}/);
});

test("AK-8 · Grafiken zeichnen nur übergebene Werte", () => {
  assert.equal(S.draw.line([5], 100, 40), ""); assert.equal(S.draw.bars([1], 100, 40), ""); assert.equal(S.draw.radar([1, 2], 96), "");
  const l = S.draw.line([1, 3, 2], 100, 40, { fill: true, base: true, zones: [{ lo: 1, hi: 1.5, tone: "up" }, null] });
  assert.match(l, /M0\.0 36\.0L50\.0 4\.0L100\.0 20\.0/); assert.equal((l.match(/<rect class="k-zone /g) || []).length, 1);
  assert.equal((S.draw.bars([1, 2, 4], 90, 40).match(/<rect/g) || []).length, 3);
  assert.match(S.draw.ring(50, 66, 8, "6/12"), /6\/12/);
  assert.equal(S.fmt.compact(215938000000, "USD"), "215,9 Mrd. $"); assert.equal(S.fmt.money(162.85, "USD"), "162,85 $"); assert.equal(S.fmt.dateShort("2026-11-13"), "13.11.");
});

test("AK-9 · Die Vorschau installiert nur VUStockSheet und fasst den Rahmen nicht an; open() lehnt Nicht-US-Kürzel ab", async () => {
  assert.deepEqual(Object.keys(S).sort(), ["CONTEXT_MODULES", "VERSION", "aktieHref", "bind", "data", "draw", "fmt", "html", "model", "moduleContext", "open", "ui"]);
  const src = read("assets/vu-stock-sheet.js");
  assert.equal((src.match(/root\.[A-Za-z]+ = /g) || []).join(), "root.VUStockSheet = ");
  assert.doesNotMatch(src, /site-navigation/);
  assert.equal(await S.open("SAP.DE"), false); assert.equal(await S.open(""), false);
  assert.equal(S.data.seriesPath ? typeof S.data.seriesPath : "", "function");
  assert.match(src, /securityIdForTicker\(ticker\)/, "Kursreihe nur über core/identity.js (ADR-001)");
  assert.doesNotMatch(src + read("aktie/app.js"), /"ref_" ?\+/);
});

test("AK-10 · Seite /aktie/: Steckbrief, Auflöser Z2 bleibt, Skripte in Reihenfolge, Module-Fenster je Kachel", () => {
  const m = JSON.parse(read("products/aktie/module.json"));
  assert.equal(m.route, "/aktie/"); assert.equal(m.access, "free"); assert.equal(m.navigation, null, "Menü und Wechsler gehören dem Rahmen");
  const html = read("aktie/index.html"), order = ["/core/identity.js", "/core/stock-context.js", "/core/stock-address.js", "/core/watchlist-view.js", "/assets/vu-ui.js", "/assets/vu-stock-sheet.js", "/aktie/app.js"].map((s) => html.indexOf(s));
  assert.ok(order.every((x, i) => x > 0 && (!i || x > order[i - 1])), "Skript-Reihenfolge");
  assert.match(html, /if \(\/\^#\\\/\.\/\.test\(location\.hash\)\)/, "mit Kürzel im Hash zeichnet die Seite, sonst gilt die Aktienadresse Z2");
  assert.match(html, /<main id="ak-main" class="vsk ak"/);
  const app = read("aktie/app.js");
  for (const id of ["fundamental", "quant", "technical", "supertrader", "hedgefonds", "elliott", "discover", "hinweise"]) assert.match(app, new RegExp("\\n    " + id + ": function \\(v\\)"), id);
  for (const p of ['"/fundamental/#/"', '"/quant/#/aktie/"', '"/technical/#/chart/"', '"/supertrader/stock/"', '"/hedgefonds/#/aktie/"', '"/elliott/#/"', '"/discover/#/s/US_REAL/"']) assert.ok(read("assets/vu-stock-sheet.js").includes(p), "Weg ins Modul " + p);
  assert.ok(existsSync(join(ROOT, "aktie/app.css")));
});

test("AK-11 · Wortwahl (docs/legal/WORTWAHL.md): kein Signal, keine Empfehlung als Aussage, kein Kursziel, kein Gesamtscore", () => {
  const text = read("assets/vu-stock-sheet.js") + read("aktie/app.js");
  const shown = (text.match(/"[^"\n]*"|'[^'\n]*'/g) || []).join("\n").replace(/[Kk]eine Empfehlung/g, "");
  for (const re of [/Signal/, /Empfehlung/, /Kursziel/, /Gesamtscore/, /für dich/i, /\bkaufen\b/i, /\bverkaufen\b/i]) assert.doesNotMatch(shown, re, String(re));
});

/* ------------------------------------------------------------------ Klickentwurf „Modul-Aktienseiten“ (Owner 17.11.2026) */
/** Funktion aus einer Moduldatei lesen (Text bis zur schließenden Klammer auf gleicher Einrückung) und ausführen. */
function fnFrom(file, name) {
  const src = read(file), at = src.indexOf("function " + name + "(");
  assert.ok(at > 0, name + " in " + file);
  const indent = src.slice(src.lastIndexOf("\n", at) + 1, at), end = src.indexOf("\n" + indent + "}", at);
  return new Function("isNum", "return (" + src.slice(at, end + indent.length + 2) + ")")((v) => typeof v === "number" && isFinite(v));
}
/** Einzeilige Tabelle (Objekt oder Liste) aus einer Moduldatei: `<decl> = {…};` */
function objFrom(file, decl) {
  const src = read(file), at = src.indexOf(decl + " = ");
  assert.ok(at >= 0, decl + " in " + file);
  const line = src.slice(at + decl.length + 3, src.indexOf("\n", at));
  return new Function("return " + line.slice(0, line.lastIndexOf(";")))();
}

test("AK-12 · Gleiche Aussagen: die Lesarten sind die der Modulseiten (Regeln aus den Moduldateien gelesen)", () => {
  /* Technical: technical/app.js#chartSummary(c, s50, s200) gegen die Lesart aus dem Technical-Stand (trend[0], trend[1]). */
  const cs = fnFrom("technical/app.js", "chartSummary");
  for (const [c, s50, s200] of [[10, 9, 8], [10, 11, 8], [10, 9, 12], [10, 11, 12]]) assert.deepEqual(M.chartSummary(c > s50, c > s200), cs(c, s50, s200), [c, s50, s200].join());
  assert.deepEqual(M.chartSummary(null, true), cs(NaN, 1, 1));
  assert.deepEqual(objFrom("technical/engine/stock-summary.js", "var TREND").slice(0, 2), ["aboveSma50", "aboveSma200"], "trend[0]/trend[1] des Technical-Stands");
  /* Fundamental: Stufen, Wörter und Regel der Seite (fundamental/app.js#business). */
  assert.deepEqual(M.F_GRADE, objFrom("fundamental/app.js", "var GRADE_KIND")); assert.deepEqual(M.F_GROW, objFrom("fundamental/app.js", "var GROW_TXT")); assert.deepEqual(M.F_PROF, objFrom("fundamental/app.js", "var PROF_TXT"));
  const src = read("fundamental/app.js"), body = src.slice(src.indexOf("  function business(raw) {"), src.indexOf("  function ttmGrowth"));
  const business = new Function("GRADE_KIND", "GROW_TXT", "PROF_TXT", body + "; return business;")(M.F_GRADE, M.F_GROW, M.F_PROF);
  for (const [g, p] of [["Stark", "Negativ"], ["Sehr stark", "Solide"], ["Rückläufig", "Sehr stark"], ["Flach", "Knapp"]]) {
    const raw = { fundamentals: { health: { available: true, categories: [{ id: "growth", grade: g }, { id: "profitability", grade: p }] } } };
    assert.deepEqual(M.businessVerdict(raw), business(raw), g + "/" + p);
  }
  assert.deepEqual(M.businessVerdict({ fundamentals: { health: { available: true, categories: [{ id: "growth", grade: "Stark" }, { id: "profitability", grade: "Negativ" }] } } }), { text: "Wächst und macht Verlust", kind: "weak", label: "Negativ" }, "TTWO: Modul „▼ Negativ / Wächst und macht Verlust“");
  /* Supertrader: Stufen und Wörter der Aktienseite der 13 Methoden, dieselbe Quelle. */
  assert.deepEqual(M.ST_STAGES, objFrom("supertrader/assets/st-redesign.js", "var STAGES")); assert.deepEqual(M.ST_STAGE_TXT, objFrom("supertrader/assets/st-redesign.js", "var STAGE_TXT"));
  assert.ok(read("supertrader/assets/st-redesign.js").includes("X.getJSON('sf-candidates/ticker/' + shard + '.json')"), "dieselbe Quelle");
  assert.ok(read("assets/vu-stock-sheet.js").includes('"/supertrader/data/sf-candidates/ticker/"'));
  assert.equal(require(join(ROOT, "supertrader", "assets", "st-names.js")).ORDER.length, 13);
  /* Elliott: „Zählbar“ = Einstufung „Heute anwendbar“ des Wellen-Index; sonst das Wort der Seite. */
  const cb = read("quant/app/page-chartbild.js");
  assert.ok(cb.includes("dieselbe Einstufung wie „Heute anwendbar“ auf der Elliott-Startseite"));
  assert.ok(cb.includes('ewVerdict("none", "Keine Zählung")'));
  assert.ok(read("elliott/engine/home-model.js").includes('var INDEX_PATH = "/quant/data/technical-intelligence/v3/elliott-home.json";'));
  assert.ok(read("assets/vu-stock-sheet.js").includes('var EW_INDEX = "/quant/data/technical-intelligence/v3/elliott-home.json";'));
});

test("AK-13 · Modul-Kontext: Adresse /aktie/#/<T>/<modul>; „Ganz öffnen“ hängt das Modul der Seite an (Zuordnung des Rahmens)", () => {
  assert.equal(S.aktieHref("ttwo", "supertrader"), "/aktie/#/TTWO/supertrader");
  assert.equal(S.aktieHref("TTWO", "discover"), "/aktie/#/TTWO", "Discover ist der Einstieg der Aktienseite: kein Kontext");
  assert.equal(S.aktieHref("TTWO"), "/aktie/#/TTWO");
  assert.deepEqual(S.CONTEXT_MODULES, ["quant", "technical", "fundamental", "hedgefonds", "elliott", "supertrader"]);
  const keep = globalThis.VUNavigation;
  try {
    for (const [id, want] of [["quant", "quant"], ["supertrader", "supertrader"], ["elliott", "elliott"], ["technical", "technical"], ["discover", null], ["screener", null], ["mein", null], [null, null]]) {
      globalThis.VUNavigation = { product: () => id };
      assert.equal(S.moduleContext(), want, String(id));
    }
    globalThis.VUNavigation = undefined; assert.equal(S.moduleContext(), null, "ohne Rahmen kein Kontext");
  } finally { globalThis.VUNavigation = keep; }
  assert.ok(read("assets/site-navigation.js").includes("product: () => { const p = PRODUCTS.find(x => x.match(location.pathname, location)); return p ? p.id : null; },"));
  const app = read("aktie/app.js");
  assert.ok(app.includes('var SHEET_IDS = ["fundamental", "quant", "technical", "supertrader", "hedgefonds", "elliott", "discover"];'));
  for (const id of S.CONTEXT_MODULES) assert.ok(app.includes('"' + id + '"'), id);
  const re = new RegExp(app.match(/\.exec\(root\.location\.hash/) && /var m = \/(.+)\/\.exec\(root\.location\.hash/.exec(app)[1]);
  assert.deepEqual([..."#/TTWO".match(re)].slice(1), ["TTWO", undefined], "alte Adresse bleibt gültig");
  assert.deepEqual([..."#/TTWO/quant".match(re)].slice(1), ["TTWO", "quant"]);
  assert.deepEqual([..."#/BRK-B/supertrader/".match(re)].slice(1), ["BRK-B", "supertrader"]);
  assert.equal("#/TTWO/quant/x".match(re), null);
  assert.ok(app.includes('root.history.replaceState(root.history.state, "", root.location.pathname + root.location.search + "#/" + ticker)'), "Schließen führt ohne neuen Verlaufseintrag auf #/<T>");
  /* Die Hash-Form passt zum Seitenrahmen: mit Kürzel im Hash zeichnet die Seite (kein Umweg über die Aktienadresse Z2). */
  assert.ok(read("aktie/index.html").includes("if (/^#\\/./.test(location.hash))"));
});

test("AK-14 · Kurzname: Aktienseite und Modul-Aktienkopf benutzen dieselbe Regel", () => {
  const N = require(join(ROOT, "assets", "stock-navigator.js"));
  for (const n of ["Take-Two Interactive Software Inc", "Meta Platforms Class A", "Bank of America Corp", "NVIDIA", "Alphabet Class C", "Cisco Systems", "Coca-Cola Co (The)", "Advanced Micro Devices"]) assert.equal(M.shortName(n), N.shortName(n), n);
  assert.equal(M.shortName("Take-Two Interactive Software"), "Take-Two"); assert.equal(M.nameRest("Take-Two Interactive Software", "Take-Two"), "Interactive Software");
  assert.deepEqual(N.subLine("Take-Two Interactive Software", "Take-Two", "TTWO", "NASDAQ"), ["Interactive Software", "TTWO", "NASDAQ"]);
});
