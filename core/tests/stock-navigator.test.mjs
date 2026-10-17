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

test("Kacheln · Reihenfolge, aktuelle Welt, Fundamental 'In Planung' ohne Link", () => {
  const ctx = SC.fromUs("NVDA");
  const h = NAV.html(ctx, SC.availability(ctx), "quant");
  const c = chips(h);
  assert.equal(c.length, 6);
  assert.deepEqual(c.map((a) => /data-module="(\w+)"/.exec(a)[1]), SC.PRODUCTS);
  assert.match(c[1], /aria-current="page"/);
  assert.match(c[5], /aria-disabled="true"/);
  assert.doesNotMatch(c[5], /href=/);
  assert.match(h, /In Planung/);
  /* Ohne Beleg: neutral, Link bleibt, kein Haken. */
  assert.match(c[4], /href="\/supertrader\/stock\/NVDA\/" /);
  assert.match(c[4], /data-state="unknown"/);
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
  const st = chips(h)[4];
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
