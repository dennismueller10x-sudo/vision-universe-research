/* Core · Aktien-Navigator (assets/stock-navigator.js, VU3 Stufe 2.2): Kacheln aus StockContext, kein toter Link. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SC = require(join(ROOT, "core", "stock-context.js"));
const NAV = require(join(ROOT, "assets", "stock-navigator.js"));
const chips = (h) => [...h.matchAll(/<a class="vu-snav-chip"([^>]*)>/g)].map((m) => m[1]);

test("Perspektiven · Reihenfolge wie im Redesign (N5), aktuelle Welt; Fundamental wie jede Welt nach Nachweis", () => {
  const ctx = SC.fromUs("NVDA");
  const h = NAV.html(ctx, SC.availability(ctx), "quant");
  const c = chips(h);
  const mod = (a) => /data-module="(\w+)"/.exec(a)[1];
  const at = (list, id) => list.find((a) => mod(a) === id);
  assert.equal(c.length, 7);
  assert.deepEqual(c.map(mod), ["discover", "technical", "fundamental", "quant", "supertrader", "technik", "hedgefonds"]);
  assert.deepEqual([...SC.PRODUCTS].filter((p) => p !== "elliott").sort(), c.map(mod).sort(), "jede Perspektive genau einmal");
  assert.match(at(c, "quant"), /aria-current="page"/);
  assert.deepEqual([...h.matchAll(/<span>([^<]+)<\/span><span class="vu-snav-sr">/g)].map((m) => m[1]), ["Überblick", "Chart", "Zahlen", "Faktoren", "Methoden", "Wellen", "Investoren"]);
  /* Ohne Manifest: Fundamental neutral mit Link wie die anderen Welten, nicht mehr "In Planung". */
  assert.match(at(c, "fundamental"), /href="\/fundamental\/#\/NVDA" /);
  assert.match(at(c, "fundamental"), /data-state="unknown"/);
  assert.match(at(c, "technical"), /href="\/technical\/#\/chart\/NVDA" /);
  assert.doesNotMatch(h, /In Planung|Analysewelten|vu-snav-more/);
  /* Mit Nachweis verfuegbar, ohne SEC-Zahlen (NO_DATA) kein Link. */
  const yes = chips(NAV.html(ctx, SC.availability(ctx, { schema: SC.SCHEMA, modules: { fundamental: { US: ["NVDA"] } } }), "quant"));
  assert.match(at(yes, "fundamental"), /data-state="available"/);
  const no = chips(NAV.html(ctx, SC.availability(ctx, { schema: SC.SCHEMA, modules: { fundamental: { US: [] } } }), "quant"));
  assert.match(at(no, "fundamental"), /aria-disabled="true"/); assert.doesNotMatch(at(no, "fundamental"), /href=/);
  /* Ohne Beleg: neutral, Link bleibt. */
  assert.match(at(c, "supertrader"), /href="\/supertrader\/stock\/NVDA\/" /);
  assert.match(at(c, "supertrader"), /data-state="unknown"/);
});

test("Perspektiven · Elliott-Profiansicht aktiviert „Wellen“ (/elliott/#/<T>)", () => {
  const ctx = SC.fromUs("NVDA");
  const c = chips(NAV.html(ctx, SC.availability(ctx), "elliott"));
  const w = c.find((a) => /data-module="technik"/.test(a));
  assert.match(w, /aria-current="page"/);
  assert.match(w, /href="\/elliott\/#\/NVDA"/);
});

test("Kacheln · Europa: nur Discover verlinkt, die anderen erklaeren die Region", () => {
  const ctx = SC.parse("/discover/#/s/EUROPE/ref_SAP_DE_XETR").ctx;
  const h = NAV.html(ctx, SC.availability(ctx, { schema: SC.SCHEMA, modules: { discover: { EUROPE: ["ref_SAP_DE_XETR"] } } }), "discover");
  const c = chips(h);
  assert.match(c[0], /href="\/discover\/#\/s\/EUROPE\/ref_SAP_DE_XETR"/);
  for (const a of c.slice(1)) { assert.doesNotMatch(a, /href=/); assert.match(a, /aria-disabled="true"/); }
  assert.match(h, /europäisches Listing – Quant analysiert derzeit nur US-Aktien/);
  assert.doesNotMatch(h, /<script|javascript:/i);
});

test("Kacheln · nachweislich fehlende Abdeckung ist kein Link", () => {
  const ctx = SC.fromUs("AAL");
  const h = NAV.html(ctx, SC.availability(ctx, { schema: SC.SCHEMA, modules: { supertrader: { US: [] } } }), "quant");
  const st = chips(h).find((a) => /data-module="supertrader"/.test(a));
  assert.doesNotMatch(st, /href=/);
  assert.match(h, /Supertrader: Für AAL liegt hier keine Abdeckung vor\./);
});

test("Laden · Ausschnitt einmal je Adresse, Fehler bleibt neutral und wird erneut versucht", async () => {
  const ctx = SC.fromUs("ZZZZ");
  let calls = 0;
  const failing = async () => { calls++; return { ok: false }; };
  assert.equal(await NAV.loadShard(ctx, failing), null);
  assert.equal(await NAV.loadShard(ctx, failing), null);
  assert.equal(calls, 2, "ein Fehlschlag wird nicht gecacht");
  const ok = async (url) => { calls++; assert.equal(url, "/core/data/stock-availability/ZZ.json"); return { ok: true, json: async () => ({ schema: SC.SCHEMA, modules: {} }) }; };
  await NAV.loadShard(ctx, ok); await NAV.loadShard(ctx, ok);
  assert.equal(calls, 3);
});

test("Einbau · Quant laedt Navigator nach identity/stock-context und Stil; Menue und Dock unveraendert", () => {
  const html = readFileSync(join(ROOT, "quant", "index.html"), "utf8");
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('src="/core/identity.js"') < pos('src="/core/stock-context.js"'));
  assert.ok(pos('src="/core/stock-context.js"') < pos('src="/assets/stock-navigator.js"'));
  assert.ok(pos('src="/assets/stock-navigator.js"') < pos('src="/quant/app/page-stock.js"'));
  assert.ok(pos('href="/assets/stock-navigator.css"') > 0);
  assert.match(html, /<vu-navigation theme="dark" theme-switch no-preview><\/vu-navigation>/);
  const sprite = readFileSync(join(ROOT, "assets", "product-icons.svg"), "utf8");
  for (const m of Object.values(NAV.MODULES)) assert.match(sprite, new RegExp('id="' + m.icon + '"'), m.icon);
});

test("Kopf · Name aus dem Ausschnitt unter dem Kuerzel (nicht unter dem Kontext-Schluessel)", () => {
  const ctx = SC.fromUs("PLTR");
  assert.notEqual(SC.key(ctx), "PLTR", "der Kontext-Schluessel ist nicht das Kuerzel - genau daran scheiterte die erste Fassung");
  const shard = { schema: SC.SCHEMA, modules: {}, names: { PLTR: "Palantir Technologies Class A" } };
  assert.equal(NAV.shardName(ctx, shard), "Palantir Technologies Class A");
  assert.equal(NAV.shardName(SC.fromUs("ZZZZ"), shard), null);
  assert.equal(NAV.shardName(ctx, { schema: SC.SCHEMA, modules: {} }), null);
  assert.equal(NAV.shardName(ctx, null), null);
});

test("Kopf (Klickentwurf 17.11.2026) · Pillen „Diese Aktie in anderen Modulen“: nur belegte Module, ohne das eigene, Elliott als Wellenbild, dazu „Aktienseite“", () => {
  const ctx = SC.fromUs("TTWO");
  const mf = { schema: SC.SCHEMA, modules: Object.fromEntries(["discover", "quant", "technical", "technik", "elliott", "fundamental", "hedgefonds"].map((m) => [m, { US: ["TTWO"] }]).concat([["supertrader", { US: [] }]])) };
  const h = NAV.othersHtml(ctx, SC.availability(ctx, mf), "quant");
  assert.match(h, /<h2 class="vu-sothers-h">Diese Aktie in anderen Modulen<\/h2>/);
  assert.deepEqual([...h.matchAll(/data-module="([a-z]+)"/g)].map((m) => m[1]), ["discover", "technical", "fundamental", "hedgefonds", "technik", "aktie"], "Reihenfolge wie im Klickentwurf; Supertrader ohne Beleg entfällt; das eigene Modul fehlt");
  assert.match(h, /href="\/elliott\/#\/TTWO" data-module="technik">.*Elliott<\/a>/);
  assert.match(h, /href="\/aktie\/#\/TTWO" data-module="aktie">.*Aktienseite<\/a>/);
  assert.doesNotMatch(NAV.othersHtml(ctx, SC.availability(ctx, mf), "elliott"), /data-module="technik"/, "Elliott-Profiansicht ist dasselbe Modul");
  assert.deepEqual([...NAV.othersHtml(ctx, [], "quant").matchAll(/data-module="([a-z]+)"/g)].map((m) => m[1]), ["aktie"], "ohne Ausschnitt nur die Aktienseite");
});

test("Kopf (Klickentwurf 17.11.2026) · großer Kurs mit Pille, darunter die Schlusskurs-Zeile; Kurzname und Rest des Namens", () => {
  const p = NAV.priceHtml({ value: 227.82, currency: "USD", changePct: 0.38, changeLabel: "zum Vortag", kind: "close", at: "13.11.2026" });
  assert.match(p, /<b class="vu-shead-value">227,82 \$<\/b><span role="img" aria-label="Plus 0,38 Prozent zum Vortag" class="vu-shead-change">▲ \+0,38 %<\/span>/);
  assert.match(p, /<p class="vu-shead-when">Schlusskurs 13\.11\.2026 · zum Vortag<\/p>/);
  assert.match(NAV.priceHtml({ value: 10, changePct: -1, kind: "close", at: "13.11." }), /data-direction="down"/);
  assert.equal(NAV.priceHtml(null), "");
  assert.equal(NAV.shortName("Take-Two Interactive Software Inc"), "Take-Two");
  assert.deepEqual(NAV.subLine("Take-Two Interactive Software Inc", "Take-Two", "TTWO", "NASDAQ"), ["Interactive Software", "TTWO", "NASDAQ"]);
  assert.deepEqual(NAV.subLine("NVIDIA Corp", "NVIDIA", "NVDA"), ["NVDA"]);
  const css = readFileSync(join(ROOT, "assets", "stock-navigator.css"), "utf8");
  assert.match(css, /:root:not\(\[data-theme=dark\]\) \.vu-shead--k2/, "helles Design");
  assert.match(css, /\.vu-shead--k2\.vu-shead--k2 \.vu-shead-price\[data-direction=down\] \.vu-shead-change\{background:#c4281c;color:#fff\}/, "Minus rot (Owner 06.11.2026)");
  const src = readFileSync(join(ROOT, "assets", "stock-navigator.js"), "utf8");
  assert.match(src, /aria-label="Zurück zur Aktienseite"/); assert.match(src, /return ctx\.region === "US" \? "\/aktie\/#\/" \+ encodeURIComponent\(ctx\.ticker\)/);
  assert.doesNotMatch(src.slice(src.indexOf("function head(")), /vu-shead-nav/, "keine Reiterleiste im Kopf");
});
