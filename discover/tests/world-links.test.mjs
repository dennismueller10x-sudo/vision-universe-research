/* Discover-Aktienseite: Block "Dieselbe Aktie in ..." (discover/ui/stock-head.js#worlds).
   Ein Link nur fuer Welten, die den Titel belegt fuehren (Verfuegbarkeits-Ausschnitt des Navigators, derselbe Abruf);
   Kennung ueber core/identity.js (ADR-001); europaeische Listings (zugelassen oder gesperrt) bekommen keinen Link. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(root, p), "utf8");

/* Kleinstes DOM fuer den Block: Klassen-Selektoren und ":scope > .klasse". */
function el(tag) {
  const n = {
    tagName: tag.toUpperCase(), className: "", textContent: "", children: [], parentNode: null, attrs: {}, href: "",
    get isConnected() { let x = n; while (x.parentNode) x = x.parentNode; return x.root === true; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return k in n.attrs ? n.attrs[k] : null; },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = n; const i = ref ? n.children.indexOf(ref) : -1; if (i < 0) n.children.push(c); else n.children.splice(i, 0, c); return c; },
    all() { return n.children.flatMap((c) => [c, ...c.all()]); },
    querySelector(sel) {
      const scope = sel.startsWith(":scope > "), cls = sel.replace(":scope > ", "").replace(/^\./, "");
      const pool = scope ? n.children : n.all();
      return pool.find((c) => c.className.split(" ").includes(cls)) || null;
    },
    querySelectorAll(sel) { return n.all().filter((c) => c.className.split(" ").includes(sel.replace(/^\./, ""))); }
  };
  return n;
}

function load() {
  const ctx = { console, URLSearchParams, location: { hash: "", pathname: "/discover/" }, document: { createElement: (t) => { const n = el(t); if (t === "a") Object.defineProperty(n, "href", { get() { return n.attrs.href || ""; }, set(v) { n.attrs.href = v; } }); return n; } } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["core/identity.js", "core/stock-context.js", "assets/stock-navigator.js", "discover/ui/stock-head.js"]) vm.runInContext(src(f), ctx, { filename: f });
  return ctx;
}

function page() {
  const doc = el("html"); doc.root = true;
  const p = doc.appendChild(el("article")); p.className = "dv2-stock";
  const next = p.appendChild(el("section")); next.className = "dv2-stock-next dx-chapter";
  const onward = next.appendChild(el("a")); onward.className = "dx-btn";
  return { p, next, onward };
}

const SCHEMA = "vu-stock-availability-1";
function fetcher(shards, calls) {
  return async (url) => { calls.push(url); const k = url.split("/").pop().replace(".json", ""); return shards[k] ? { ok: true, json: async () => shards[k] } : { ok: false, json: async () => null }; };
}
const ALL = (key) => ({ US: [key] });
const NV = { schema: SCHEMA, shard: "NV", modules: { discover: ALL("NVDA"), quant: ALL("NVDA"), technical: ALL("NVDA"), technik: ALL("NVDA"), elliott: ALL("NVDA"), supertrader: ALL("NVDA"), fundamental: ALL("NVDA"), hedgefonds: ALL("NVDA") } };
/* Wie der veroeffentlichte Ausschnitt RH: RH ohne Supertrader-Seite. */
const RH = { schema: SCHEMA, shard: "RH", modules: { discover: { US: ["RH"], EUROPE: ["ref_RHM_DE_XETR"] }, quant: { US: ["RH"], EUROPE: ["ref_RHM_DE_XETR"] }, technical: { US: ["RH"] }, supertrader: { US: ["RHI"] }, fundamental: { US: ["RH"] } } };
const links = (box) => box.children[1].children.map((li) => li.children[0]);
/* Ergebnisse aus dem vm-Kontext (anderes Realm) als reine Daten vergleichen. */
const plain = (x) => JSON.parse(JSON.stringify(x));

test("US mit allen Welten (NVDA): vier Links in fester Reihenfolge, Ziele wie die Router", async () => {
  const w = load(), { p, next, onward } = page(), calls = [];
  const box = await w.VUDiscover.StockHead.worlds(p, { symbol: "NVDA", region: "US", companyName: "NVIDIA" }, { fetch: fetcher({ NV }, calls) });
  assert.ok(box, "Block fehlt");
  assert.equal(box.children[0].textContent, "Dieselbe Aktie in …");
  assert.deepEqual(links(box).map((a) => [a.getAttribute("data-world"), a.href]), [
    ["quant", "/quant/#/aktie/NVDA"],
    ["technical", "/technical/#/chart/NVDA"],
    ["fundamental", "/fundamental/#/NVDA"],
    ["supertrader", "/supertrader/stock/NVDA/"]
  ]);
  assert.equal(next.children.indexOf(box), next.children.indexOf(onward) - 1, "Block steht vor \"Weiter swipen\"");
  assert.deepEqual(calls, ["/core/data/stock-availability/NV.json"]);
});

test("Kennung ueber core/identity.js: Ausschnitt aus securityIdForTicker, nicht aus dem Kuerzel gebaut", () => {
  const w = load(), SC = w.VUCore.StockContext, I = w.VUCore.Identity;
  const ctx = SC.fromUs("BRK-B");
  assert.equal(ctx.securityId, I.securityIdForTicker("BRK-B"));
  assert.equal(SC.availabilityUrl(ctx), "/core/data/stock-availability/" + I.shardKey(ctx.securityId.slice(4)) + ".json");
  assert.match(src("discover/ui/stock-head.js"), /stockContext\(SC, detail\)/);
  assert.doesNotMatch(src("discover/ui/stock-head.js"), /"ref_"\s*\+/);
});

test("Welt ohne den Titel: kein Link (RH ohne Supertrader-Seite)", async () => {
  const w = load(), { p } = page();
  const box = await w.VUDiscover.StockHead.worlds(p, { symbol: "RH", region: "US" }, { fetch: fetcher({ RH }, []) });
  assert.deepEqual(links(box).map((a) => a.getAttribute("data-world")), ["quant", "technical", "fundamental"]);
});

test("ohne Beleg kein Link: fehlender Ausschnitt (404) oder Modul nicht im Manifest", async () => {
  const w = load(), SH = w.VUDiscover.StockHead, SC = w.VUCore.StockContext;
  const a = page();
  assert.equal(await SH.worlds(a.p, { symbol: "ZZZZ", region: "US" }, { fetch: fetcher({}, []) }), null);
  assert.equal(a.p.querySelector("dv2-worlds"), null);
  /* Modul fehlt -> "unknown": der Navigator zeigt es neutral, dieser Block gar nicht. */
  const partial = { schema: SCHEMA, modules: { quant: { US: ["NVDA"] } } };
  assert.deepEqual(plain(SH.worldLinks(SC, SC.fromUs("NVDA"), partial)).map((l) => l.product), ["quant"]);
  assert.equal(SH.worldLinks(SC, SC.fromUs("NVDA"), { schema: "fremd", modules: NV.modules }).length, 0);
  assert.equal(SH.worldLinks(SC, SC.fromUs("NVDA"), null).length, 0);
});

test("Europa zugelassen (Rheinmetall RHM.DE): kein Block, kein Abruf - auch wenn ein Ausschnitt anderes behauptet", async () => {
  const w = load(), { p } = page(), calls = [];
  const detail = { symbol: "RHM.DE", region: "EUROPE", securityId: "ref_RHM_DE_XETR", companyName: "Rheinmetall Aktiengesellschaft" };
  assert.equal(await w.VUDiscover.StockHead.worlds(p, detail, { fetch: fetcher({ RH }, calls) }), null);
  assert.deepEqual(calls, []);
  const SC = w.VUCore.StockContext;
  assert.equal(w.VUDiscover.StockHead.worldLinks(SC, SC.fromEurope({ securityId: "ref_RHM_DE_XETR", ticker: "RHM.DE" }), RH).length, 0);
});

test("Europa gesperrt (LVMH MC.PA, publicationBlocked): kein Block, kein Abruf", async () => {
  const w = load(), { p } = page(), calls = [];
  const detail = { symbol: "MC.PA", region: "EUROPE", securityId: "ref_MC_PA_XPAR", publicationBlocked: true };
  assert.equal(await w.VUDiscover.StockHead.worlds(p, detail, { fetch: fetcher({}, calls) }), null);
  assert.deepEqual(calls, []);
});

test("verlassene Seite: kein Block nach dem Abruf", async () => {
  const w = load(), { p } = page();
  p.parentNode = null;
  assert.equal(await w.VUDiscover.StockHead.worlds(p, { symbol: "NVDA", region: "US" }, { fetch: fetcher({ NV }, []) }), null);
});

test("detail.js ruft den Block auf; Frontend-Budget der vier Dateien bleibt unter 180.000 Byte", () => {
  assert.match(src("discover/detail.js"), /SH\.worlds\(page, detail\)/);
  const bytes = ["app.js", "home.js", "detail.js", "themes.js", "app.css", "home.css", "detail.css"].reduce((n, f) => n + Buffer.byteLength(src("discover/" + f)), 0);
  assert.ok(bytes <= 180000, "Budget ueberschritten: " + bytes);
});

test("Platz: vor der Knopfleiste .dx-cta (\"Einzeln weiter entdecken\")", async () => {
  const w = load(), { p, next, onward } = page();
  onward.className = "dx-cta";
  const box = await w.VUDiscover.StockHead.worlds(p, { symbol: "NVDA", region: "US" }, { fetch: fetcher({ NV }, []) });
  assert.equal(next.children.indexOf(box) + 1, next.children.indexOf(onward));
});
