/* FX-Bootstrap mit mitgelieferten Reihen (options.preload, FX-Paket der Quant-Aktienseite):
   dieselbe Umrechnung wie mit geholten Reihen, aber ohne Abruf von Verzeichnis und Reihe. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);
const SCRIPTS = ["fx-provider-registry", "fx-rates", "fx-freshness", "currency-registry", "currency-class",
  "currency-engine", "money-format", "currency-preference", "currency-contract", "bootstrap"];
const ecb = JSON.parse(readFileSync(new URL("quant/data/market/fx/ecb/EURUSD.json", ROOT)));
const license = JSON.parse(readFileSync(new URL("quant/config/fx-license.json", ROOT)));

function context() {
  const calls = [];
  const mem = { m: {}, getItem(k) { return this.m[k] || null; }, setItem(k, v) { this.m[k] = String(v); } };
  const ctx = { console, localStorage: mem, calls,
    fetch(url) { calls.push(url); return Promise.reject(new Error("kein Netz im Test: " + url)); } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const n of SCRIPTS) vm.runInContext(readFileSync(new URL("quant/engines/fx/" + n + ".js", ROOT), "utf8"), ctx, { filename: n + ".js" });
  return ctx;
}

test("preload: kein Abruf von Lizenz, Verzeichnis oder Reihe; USD gilt als geladen", async () => {
  const ctx = context();
  const layer = await ctx.VUFx.Bootstrap.boot({ license, preload: [ecb], storage: ctx.localStorage });
  assert.ok(layer, "Vertrag steht");
  assert.deepEqual(ctx.calls, [], "kein Netzabruf");
  assert.equal(ctx.VUFx.Bootstrap.hasCurrency("USD"), true);
  assert.deepEqual(Array.from(ctx.VUFx.Bootstrap.attributions()), [ecb.attribution].filter(Boolean));
});

test("preload rechnet wie die geholte Reihe: jeder Tag mit seinem EZB-Kurs", async () => {
  const ctx = context();
  const layer = await ctx.VUFx.Bootstrap.boot({ license, preload: [ecb], storage: ctx.localStorage });
  const rates = new Map(ecb.points);
  const r = layer.series([["2025-01-02", 100], ["2026-10-22", 100]], "USD");
  assert.equal(r.available, true);
  assert.equal(r.displayCurrency, "EUR");
  assert.ok(Math.abs(r.points[0].display - 100 / rates.get("2025-01-02")) < 1e-9);
  assert.ok(Math.abs(r.points[1].display - 100 / rates.get("2026-10-22")) < 1e-9);
});

test("ohne preload bleibt der bisherige Weg: Lizenz und Verzeichnis werden geholt", async () => {
  const ctx = context();
  await ctx.VUFx.Bootstrap.boot({ storage: ctx.localStorage });
  assert.ok(ctx.calls.some((u) => /fx-license\.json$/.test(u)), "Lizenz geholt");
  assert.ok(ctx.calls.some((u) => /fx\/ecb\/index\.json$/.test(u)), "Verzeichnis geholt");
});
