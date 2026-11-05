/* Core · Eine Aktienadresse /aktie/<T> (core/stock-address.js, Redesign 2027 Z2). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const A = require(join(ROOT, "core", "stock-address.js"));
const SC = require(join(ROOT, "core", "stock-context.js"));

test("Z2-1 · jede Perspektive führt auf genau eine Welt-Adresse aus StockContext.href", () => {
  const want = {
    ueberblick: "/discover/#/s/US_REAL/NVDA", chart: "/technical/#/chart/NVDA", zahlen: "/fundamental/#/NVDA",
    faktoren: "/quant/#/aktie/NVDA", methoden: "/supertrader/stock/NVDA/", wellen: "/elliott/#/NVDA", investoren: "/hedgefonds/#/aktie/NVDA"
  };
  for (const [p, href] of Object.entries(want)) {
    const r = A.resolve("/aktie/NVDA", "?p=" + p, "");
    assert.equal(r.state, "OK", p);
    assert.equal(r.href, href, p);
    assert.equal(r.href, SC.href(SC.fromUs("NVDA"), A.PERSPECTIVES[p]));
  }
});

test("Z2-2 · ohne p: Herkunftswelt bestimmt die Perspektive, sonst Überblick", () => {
  assert.equal(A.resolve("/aktie/NVDA", "", "https://research.visionuniverse.de/quant/#/").perspective, "faktoren");
  assert.equal(A.resolve("/aktie/NVDA/", "", "/elliott/#/W").perspective, "wellen");
  assert.equal(A.resolve("/aktie/NVDA", "", "/fundamental/").perspective, "zahlen");
  assert.equal(A.resolve("/aktie/NVDA", "", "https://google.com/").perspective, "ueberblick");
  assert.equal(A.resolve("/aktie/NVDA", "?p=quatsch", "").perspective, "ueberblick");
  assert.equal(A.resolve("/aktie/", "?t=nvda&p=zahlen", "").href, "/fundamental/#/NVDA", "Seitenform /aktie/?t=");
});

test("Z2-3 · ungültige Kürzel und fremde Pfade erzeugen keine Adresse", () => {
  assert.equal(A.resolve("/aktie/", "", "").state, "NOT_A_STOCK");
  assert.equal(A.resolve("/quant/", "", "").state, "NOT_A_STOCK");
  for (const bad of ["/aktie/..%2Fx", "/aktie/SAP.DE", "/aktie/%E0%A4%A", "/aktie/<script>"]) assert.equal(A.resolve(bad, "", "").state, "INVALID", bad);
});

test("Z2-4 · kanonische Adresse aus jeder Welt-Adresse (alte Adressen bekommen eine neue)", () => {
  assert.equal(A.fromWorldUrl("/quant/#/aktie/NVDA"), "/aktie/NVDA?p=faktoren");
  assert.equal(A.fromWorldUrl("/discover/#/s/US_REAL/NVDA"), "/aktie/NVDA");
  assert.equal(A.fromWorldUrl("/quant/#/aktie/NVDA/chartbild"), "/aktie/NVDA?p=wellen");
  assert.equal(A.fromWorldUrl("/elliott/#/NVDA?ansicht=profi"), "/aktie/NVDA?p=wellen");
  assert.equal(A.fromWorldUrl("/supertrader/stock/BRK-B/"), "/aktie/BRK-B?p=methoden");
  assert.equal(A.fromWorldUrl("/discover/#/s/EUROPE/ref_SAP_DE_XETR"), null, "Europa: nur Discover, keine Aktienadresse");
  assert.equal(A.canonical("NVDA", "quant"), "/aktie/NVDA?p=faktoren");
  /* Hin und zurück: kanonisch -> Welt -> kanonisch. */
  for (const p of Object.keys(A.PERSPECTIVES)) {
    const c = A.canonical("NVDA", p), [path, q] = c.split("?");
    assert.equal(A.fromWorldUrl(A.resolve(path, q ? "?" + q : "", "").href), c, p);
  }
});

test("Z2-5 · 404.html und /aktie/ laden den Auflöser in der richtigen Reihenfolge", () => {
  for (const f of ["404.html", "aktie/index.html"]) {
    const s = readFileSync(join(ROOT, f), "utf8");
    const i = s.indexOf("/core/identity.js"), c = s.indexOf("/core/stock-context.js"), a = s.indexOf("/core/stock-address.js");
    assert.ok(i > 0 && i < c && c < a, f);
    assert.match(s, /StockAddress\.resolve\(location\.pathname, ?location\.search, ?document\.referrer\)/, f);
  }
});
