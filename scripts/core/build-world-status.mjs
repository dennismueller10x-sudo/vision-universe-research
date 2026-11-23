#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE CORE — build-world-status.mjs
   Datenart worldStatus: je Aktie, was jede Produktwelt sagt (core/world-status.js).

   Liest nur veroeffentlichte Artefakte, rechnet nichts neu und bewertet nichts:
     fundamental   discover/data/stocks/US_REAL/<T>.json            (fundamentals.health)
     quant         quant/data/product/factor-evidence-v1/profile-mean/ranking.json.gz  (Platz im Gesamtwert)
     technical     technical/data/stock/<Schluessel>.json            (trend, frozenSince)
     hedgefonds    hedgefonds/data/stocks/<0..31>.json               (buyers, sellersCount je Wertpapier)
     supertrader   supertrader/data/sf-candidates/index.json         (Stufe je Methode)
   Fehlt eine Quelle, sagt diese Welt fuer alle Aktien nichts (sources.<welt>.state = UNAVAILABLE); geraten wird nicht.
   Aktienkreis: die Discover-Aktiendateien (US_REAL), dieselben Titel wie auf /aktie/.

   Schreibt nur mit --out (Release-Bau: core/data/world-status-v1.json, nie im Repository).
   Aufruf: node scripts/core/build-world-status.mjs --out DATEI [--root DIR]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WS = require(join(ROOT, "core/world-status.js"));
const Identity = require(join(ROOT, "core/identity.js"));
const Sheet = require(join(ROOT, "assets/vu-stock-sheet.js"));

export const SCHEMA = "vu-world-status-artifact-1.0.0";
export const DOMAIN_ID = "worldStatus";
export const ARTIFACT = "core/data/world-status-v1.json";

const json = (p) => JSON.parse(readFileSync(p, "utf8"));
const tryRead = (fn) => { try { return fn(); } catch (e) { return null; } };

/** Quellen laden; jede Quelle einzeln, ein Ausfall betrifft nur ihre Welt. */
export function loadSources(root = ROOT) {
  const src = {};
  /* Quant: Platz im Gesamtwert */
  src.quant = tryRead(() => {
    const r = JSON.parse(gunzipSync(readFileSync(join(root, "quant/data/product/factor-evidence-v1/profile-mean/ranking.json.gz"))).toString("utf8"));
    const place = r.fields.indexOf("place");
    if (place < 0 || !r.rows || !(r.total >= 5)) return null;
    return { asOf: r.asOf || null, version: r.methodologyVersion || null, of: r.total, placeOf: (t) => (r.rows[t] ? r.rows[t][place] : null) };
  });
  /* Technical: Stand je Aktie, Scherbe = core/identity.js#shardKey */
  src.technical = tryRead(() => {
    const dir = join(root, "technical/data/stock"), cache = new Map();
    if (!existsSync(dir)) return null;
    const meta = tryRead(() => json(join(root, "technical/data/meta.json")));
    return { asOf: (meta && meta.asOf) || null, of: (t) => {
      const k = Identity.shardKey(t);
      if (!cache.has(k)) cache.set(k, tryRead(() => json(join(dir, k + ".json"))));
      const sh = cache.get(k);
      return (sh && sh.stocks && sh.stocks[t]) || null;
    } };
  });
  /* Hedgefonds: Fondsbewegung je Kuerzel (mehrere Wertpapiere eines Kuerzels werden zusammengezaehlt) */
  src.hedgefonds = tryRead(() => {
    const dir = join(root, "hedgefonds/data/stocks"), by = new Map();
    for (const f of readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
      for (const rec of Object.values(json(join(dir, f)))) {
        if (!rec || typeof rec.ticker !== "string" || !rec.ticker) continue;
        const e = by.get(rec.ticker) || { buyers: 0, sellers: 0 };
        e.buyers += Number(rec.buyers) || 0; e.sellers += Number(rec.sellersCount) || 0; by.set(rec.ticker, e);
      }
    }
    if (!by.size) return null;
    const head = tryRead(() => json(join(root, "hedgefonds/data/hedgefonds.json")));
    return { asOf: (head && head.latestPeriod) || null, of: (t) => by.get(t) || null };
  });
  /* Supertrader: Stufen je Kuerzel ueber alle Methoden */
  src.supertrader = tryRead(() => {
    const idx = json(join(root, "supertrader/data/sf-candidates/index.json")), by = new Map();
    if (!Array.isArray(idx.candidates)) return null;
    for (const c of idx.candidates) { if (!c || !c.t || !c.s) continue; const a = by.get(c.t); if (a) a.push(c.s); else by.set(c.t, [c.s]); }
    return { asOf: idx.asOf || null, of: (t) => by.get(t) || null };
  });
  /* Fundamental: Discover-Aktiendatei je Kuerzel */
  src.fundamental = tryRead(() => {
    const dir = join(root, "discover/data/stocks/US_REAL");
    if (!existsSync(dir)) return null;
    return { asOf: null, of: (t) => tryRead(() => json(join(dir, t + ".json"))) };
  });
  return src;
}

/** Aktienkreis: Kuerzel der Discover-Aktiendateien. */
export function universe(root = ROOT) {
  const dir = join(root, "discover/data/stocks/US_REAL");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[A-Z0-9.-]{1,12}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort();
}

/** Reines Artefakt aus Kuerzeln und Quellen (testbar ohne Dateien). */
export function build(tickers, src, now = new Date()) {
  const cols = { s: [], sid: [], w: [], stated: [], strong: [], weak: [] };
  const byStrong = {}, byWorld = Object.fromEntries(WS.WORLDS.map((w) => [w, { strong: 0, mid: 0, weak: 0, none: 0 }]));
  for (const t of tickers) {
    const status = WS.statusOf({
      detail: src.fundamental ? src.fundamental.of(t) : null,
      quant: src.quant ? { place: src.quant.placeOf(t), of: src.quant.of } : null,
      tech: src.technical ? src.technical.of(t) : null,
      hedge: src.hedgefonds ? src.hedgefonds.of(t) : null,
      stages: src.supertrader ? src.supertrader.of(t) : null
    }, Sheet.model);
    const c = WS.count(status);
    cols.s.push(t); cols.sid.push(Identity.securityIdForTicker(t)); cols.w.push(WS.encode(status));
    cols.stated.push(c.stated); cols.strong.push(c.strong); cols.weak.push(c.weak);
    byStrong[c.strong] = (byStrong[c.strong] || 0) + 1;
    for (const w of WS.WORLDS) byWorld[w][status[w] || "none"]++;
  }
  return {
    schema: SCHEMA, rules: WS.VERSION, generatedAt: now.toISOString(),
    worlds: WS.WORLDS, encoding: "w: ein Zeichen je Welt in der Reihenfolge von worlds; s = stark, m = mittel, w = schwach, - = keine Aussage",
    ruleText: WS.RULES,
    claim: "beschreibend: fasst zusammen, was jede Welt nach ihrer eigenen Regel zu der Aktie ausweist; kein Gesamturteil, keine Gewichtung, keine Empfehlung",
    sources: Object.fromEntries(WS.WORLDS.map((w) => [w, src[w] ? { state: "AVAILABLE", asOf: src[w].asOf || null } : { state: "UNAVAILABLE", asOf: null }])),
    counts: { total: tickers.length, byStrong, byWorld }, cols
  };
}

export function run({ root = ROOT, out, now } = {}) {
  const res = build(universe(root), loadSources(root), now);
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(res) + "\n"); }
  return res;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const out = arg("--out");
  if (!out) { console.error("Aufruf: node scripts/core/build-world-status.mjs --out DATEI [--root DIR]"); process.exit(2); }
  const r = run({ root: arg("--root") ? resolve(arg("--root")) : ROOT, out: resolve(out) });
  console.log(JSON.stringify({ total: r.counts.total, byStrong: r.counts.byStrong, sources: r.sources }));
  console.log(JSON.stringify(r.counts.byWorld));
}
