/* =========================================================================
   VU ELLIOTT REGISTRY 1.1 — Kundenprodukt-Sicht (dieselbe Elliott-Ausgabe wie das Chartbild)

   Das Kundenprodukt (Kursstruktur / Chartbild, quant/data/technical-intelligence/v3) rechnet je Titel
   analyzeProduct(series, productOpts(...)): TI.prepare ohne Optionen, Persistenzkette ueber 26 + 26 Bars,
   analyzeAt mit elliottPrevious. Zeitebene: Tagesanalyse, wo das Produkt Tagesdaten nutzt, sonst Woche.
   Dieses Modul ruft GENAU diese Funktionen auf (keine Kopie):
     analyzeProduct            scripts/technical/lib/ti-product.mjs
     workCtx, productOpts      scripts/technical/build-technical-intelligence.mjs
     slim                      dto. (veroeffentlichte Form von pro.elliott)
   Engine, Methodik und Evidenz bleiben unberuehrt.

   productElliottAt(...)   Analyse einer auf die Woche gekuerzten Reihe.
   identityCheck(...)      rechnet veroeffentlichte Titel auf ihren Produktdaten nach und vergleicht pro.elliott
                           Byte fuer Byte mit dem veroeffentlichten Shard. Ohne Gleichheit wird nicht registriert.
   ========================================================================= */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { ROOT, readJson, weeklySeriesFromPoints, dailySeriesFromPayload } from "../lib/ti-data.mjs";
import { analyzeProduct, elliottTransparency } from "../lib/ti-product.mjs";
import { workCtx, productOpts, slim, shardKey } from "../build-technical-intelligence.mjs";
import { projectionElliott, projectionInput, motiveCandidateFor, candidatePool, exploreCandidatesFor, highlightEligibleItems, splitResolutionFor, dataIntegrity, withProductInputs } from "../lib/ti-projection.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";
const Identity = createRequire(import.meta.url)("../../../core/identity.js"); // eine Identitaetsregel (ADR-001)

export const PRODUCT_VIEW_VERSION = "elliott-registry-product-view-1.0.0";
export const PUBLISHED_DIR = join(ROOT, "quant/data/technical-intelligence/v3");
export const MIN_WEEKLY = 160, MIN_DAILY = 300;            // dieselben Schwellen wie build-technical-intelligence.mjs
const sha = (s) => createHash("sha256").update(s).digest("hex");
const dayMs = 864e5;
const fridayOf = (d0) => { const d = new Date(d0 + "T00:00:00Z"), wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() + (4 - wd) * dayMs).toISOString().slice(0, 10); };

/** Veroeffentlichter Produktstand: Zeitebene und Datenstand je Titel, Quellen und Versionen. */
export function publishedProduct(dir = PUBLISHED_DIR) {
  const meta = readJson(join(dir, "meta.json"));
  const idx = JSON.parse(gunzipSync(readFileSync(join(dir, "index.json.gz"))).toString());
  const bySymbol = new Map(idx.rows.map((r) => [r.t, { tf: r.tf, asOf: r.asOf }]));
  /* Tagesquelle des veroeffentlichten Stands: golden-preview (ohne --work-dir) oder kanonische Historie (mit --work-dir) */
  const dailyFromCanonical = !/^golden-preview/.test(String(meta.sources && meta.sources.daily || ""));
  return { dir, meta, bySymbol, dailyFromCanonical, generatedAt: meta.generatedAt, methodologyKey: idx.methodologyKey };
}

/** Kennungen der veroeffentlichten Explore Highlights je Titel (Wochenanalyse; Ticker -> sortierte Schluessel). Liest alle Shards. */
export function publishedHighlights(dir = PUBLISHED_DIR) {
  const out = new Map(), sd = join(dir, "shards");
  for (const f of readdirSync(sd).filter((x) => x.endsWith(".json.gz")).sort()) {
    const ins = JSON.parse(gunzipSync(readFileSync(join(sd, f))).toString()).instruments || {};
    for (const [t, p] of Object.entries(ins)) { const pr = p.projectionWeekly || p.projection; const ks = ((pr && pr.exploreHighlights) || []).map((h) => h.key).sort(); if (ks.length) out.set(t, ks); }
  }
  return out;
}

/** Vollstaendiger Vergleich der Explore Highlights: Register (Produktsicht) gegen den veroeffentlichten Stand.
 *  published: Ticker -> Schluessel (nur Titel mit Highlights); registry: Ticker -> { d: Datum der letzten Bar, keys }; asOfOf: Ticker -> veroeffentlichter Stand.
 *  Ausnahme TIMING: Registry und Produkt rechnen auf verschiedenen Staenden (letzte Bar verschieden) - gezaehlt und ausgewiesen, nicht als Abweichung. */
export function compareHighlights(published, registry, asOfOf) {
  const tickers = new Set([...published.keys(), ...[...registry].filter(([, v]) => v.keys.length).map(([t]) => t)]);
  const r = { compared: 0, identical: 0, timing: [], different: [] };
  for (const t of [...tickers].sort()) {
    const pk = published.get(t) || [], row = registry.get(t), rk = row ? row.keys : [];
    if (JSON.stringify(pk) === JSON.stringify(rk)) { r.compared++; r.identical++; continue; }
    const pubAsOf = asOfOf.get(t);
    if (row && pubAsOf && row.d && pubAsOf !== row.d) { r.timing.push({ t, publishedAsOf: pubAsOf, registryBar: row.d, published: pk, registry: rk }); continue; }
    r.compared++; r.different.push({ t, reason: row ? "KEYS_DIFFER" : "NOT_IN_REGISTRY_UNIVERSE", published: pk, registry: rk });
  }
  r.ok = r.different.length === 0;
  return r;
}

/** Datenstand je Titel im veroeffentlichten Produkt (Index: `fr` fehlt = FRESH) und Bezugstag der Richtlinie (meta.projection.freshness.reference; fehlt bei Staenden vor der Richtlinie). */
export function publishedFreshness(dir = PUBLISHED_DIR) {
  const idx = JSON.parse(gunzipSync(readFileSync(join(dir, "index.json.gz"))).toString()), meta = readJson(join(dir, "meta.json"));
  const by = new Map(idx.rows.map((r) => [r.t, { st: r.fr ? r.fr.st : "FRESH", last: r.fr ? r.fr.last : r.asOf }]));
  const f = meta.projection && meta.projection.freshness;
  return { reference: f ? f.reference : null, version: f ? f.version : null, byTicker: by };
}

/** Vollvergleich des Datenstands (letzte Bar, Zustand, damit Sichtbarkeit) ueber ALLE Titel des Produkts.
 *  Weicht der Bezugstag des Produkts vom Registerwoche F ab, rechnen beide auf verschiedenen Staenden: Ausnahme TIMING (gezaehlt, ausgewiesen). Ohne Richtlinie im veroeffentlichten Stand: nicht anwendbar. */
export function compareFreshness(pub, registry, F) {
  const r = { applicable: !!pub.reference, compared: 0, identical: 0, timing: [], different: [], ok: true };
  if (!pub.reference) return r;
  for (const [t, p] of [...pub.byTicker].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const g = registry.get(t);
    if (!g) { r.compared++; r.different.push({ t, reason: "NOT_IN_REGISTRY_UNIVERSE", published: p }); continue; }
    if (g.st === p.st && g.last === p.last) { r.compared++; r.identical++; continue; }
    if (pub.reference !== F) { r.timing.push({ t, published: p, registry: g, publishedReference: pub.reference }); continue; }
    r.compared++; r.different.push({ t, reason: "STATE_DIFFERS", published: p, registry: g });
  }
  r.ok = r.different.length === 0; return r;
}

/** Kontext wie der Produkt-Build (gleiche Evidenztabellen, gleiche Tagesquelle). */
export function productContext(pub, workDir = null) {
  if (pub.dailyFromCanonical && !workDir) return { error: "PRODUCT_DAILY_SOURCE_IS_CANONICAL_HISTORY_BUT_NO_WORK_DIR" };
  const C = workCtx(workDir);
  const daily = new Map();
  if (existsSync(C.dailyDir)) for (const f of readdirSync(C.dailyDir).filter((f) => f.endsWith(".json") && !f.startsWith("_"))) {
    try { const t = readJson(join(C.dailyDir, f)).ticker; if (t) daily.set(t, join(C.dailyDir, f)); } catch { /* wie der Build: unlesbar = keine Tagesdatei */ }
  }
  return { C, daily, dailyDir: C.dailyDir, workDir };
}

/** Kanonischer Fingerabdruck der veroeffentlichten Form (JSON-Rundreise wie im Shard). */
export const elliottSha = (block) => sha(JSON.stringify(block === undefined ? null : JSON.parse(JSON.stringify(block)))).slice(0, 32);

function cutDaily(j, F) {
  const bars = j.bars || [], last = j.last || (bars.length ? bars[bars.length - 1].date : null);
  if (!last || last < F) return null;
  let k = -1; for (let i = 0; i < bars.length; i++) { if (bars[i].date <= F) k = i; else break; }
  if (k < 0 || fridayOf(bars[k].date) !== F) return null;
  return Object.assign({}, j, { bars: bars.slice(0, k + 1) });
}

/** Zeitebene wie das Produkt: veroeffentlichte Zeitebene des Titels; fuer neue Titel die Build-Regel (Tagesdatei mit ≥ 300 Bars). */
export function productTimeframe(sym, ctx, pub) {
  const p = pub.bySymbol.get(sym);
  if (p) return { tf: p.tf, rule: "PUBLISHED" };
  if (ctx.daily.has(sym)) { try { if ((readJson(ctx.daily.get(sym)).bars || []).length >= MIN_DAILY) return { tf: "1D", rule: "BUILD_RULE" }; } catch { /* Wochenanalyse */ } }
  return { tf: "1W", rule: "BUILD_RULE" };
}

/** Produktanalyse auf der gekuerzten Reihe. weeklyUsed = Wochenpunkte bis W* (schon gekuerzt); F = Freitag von W*; ticker = Produktschluessel. */
export function productElliottAt(sym, weeklyUsed, ticker, F, ctx, pub, corporateActions = null) {
  /* Das Produkt fuehrt Titel unter dem Ticker (Index, Shards, Tagesdateien), nicht unter der Datei-ID ref_<T> */
  const T = ticker || String(sym).replace(/^ref_/, "");
  const tf = productTimeframe(T, ctx, pub);
  let series, kind;
  if (tf.tf === "1D") {
    const f = ctx.daily.get(T); if (!f) return { skip: "PRODUCT_DAILY_DATA_MISSING", tf: tf.tf };
    const j = cutDaily(readJson(f), F); if (!j) return { skip: "PRODUCT_DAILY_DATA_NOT_COVERING_WEEK", tf: tf.tf };
    series = dailySeriesFromPayload(j, j.ticker); kind = "daily";
    if (series.length < MIN_DAILY) return { skip: "PRODUCT_TOO_SHORT", tf: tf.tf };
  } else {
    series = weeklySeriesFromPoints(weeklyUsed, ticker); kind = "weekly"; series.corporateActions = corporateActions;
    if (series.length < MIN_WEEKLY) return { skip: "PRODUCT_TOO_SHORT", tf: tf.tf };
  }
  const res = Object.assign(analyzeAndSummarize(series, kind, T, ctx), { tfRule: tf.rule });
  /* Motiv-Alternative wie im Produkt: Wochen zuerst. Tagestitel zeigen sie aus der Wochenanalyse (projectionWeekly). */
  /* Explore Elliott (Registry 1.4.0) ebenso aus der Wochenanalyse */
  let weeklyIn = null;
  if (kind === "weekly") weeklyIn = res.projIn;
  else {
    const ws = weeklySeriesFromPoints(weeklyUsed, ticker); ws.corporateActions = corporateActions;
    weeklyIn = ws.length >= MIN_WEEKLY ? analyzeAndSummarize(ws, "weekly", T, ctx).projIn : null;
  }
  res.motiveIn = weeklyIn && weeklyIn.E && weeklyIn.E.hiddenMotive ? weeklyIn : null;
  res.exploreIn = weeklyIn && weeklyIn.E && weeklyIn.E.explore ? weeklyIn : null;
  return res;
}

function analyzeAndSummarize(series, kind, ticker, ctx) {
  const out = analyzeProduct(series, productOpts(kind, ctx.C, ticker));
  const S = slim(out.res), E = out.res.methods.elliott, pub = S.pro.elliott, T = elliottTransparency(out.res, out.replay);
  const p = E && E.primary, t = series.length - 1, atr = out.P.main.features.columns.atr[t];
  /* Elliott Projection Engine (Registry 1.2.0): dieselbe Eingabe wie das Produkt (veroeffentlichte Form, 260 Chart-Bars wie chartOf);
     die Relative Staerke setzt der Hauptthread aus dem Querschnitt der Woche. */
  const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v), from = Math.max(0, series.length - 260);
  const splitRes = splitResolutionFor(series, out), pool = candidatePool(series, out, PRODUCT_METHODOLOGY), mc = motiveCandidateFor(series, out, PRODUCT_METHODOLOGY, pool);
  const xc = exploreCandidatesFor(series, out, PRODUCT_METHODOLOGY, pool, mc, dataIntegrity(series, out, splitRes));
  const projE = withProductInputs(projectionElliott(pub), { motiveCandidate: mc, exploreCandidates: Object.assign({}, xc, { items: highlightEligibleItems(xc.items) }), dataQuality: splitRes.items.length ? { splitResolution: splitRes } : null });
  const projIn = { E: projE, ctx: projectionInput(Object.assign({}, S, { chart: { timestamps: series.timestamps.slice(from), close: series.close.slice(from).map(r4) } }), null) };
  return { tf: series.timeframe, d: series.timestamps[t], E, px: series.close[t], atr: Number.isFinite(atr) ? atr : null, projIn,
           view: { tf: series.timeframe, d: series.timestamps[series.length - 1], p: p ? p.pattern : null, w: p ? (p.complete ? "done" : p.currentWave && p.currentWave.label) : null,
                   ab: !!(E && E.applicability && E.applicability.abstain), key: p ? p.persistenceKey || null : null, app: E && E.applicability ? E.applicability.level : null,
                   relabelRisk: T && T.relabeling ? T.relabeling.risk : null, sha: elliottSha(pub) } };
}

/** Deterministische Stichprobe veroeffentlichter Titel (alle Tagestitel + jeder k-te Wochentitel). */
export function identitySample(pub, n = 120) {
  const all = [...pub.bySymbol.keys()].sort(), daily = all.filter((s) => pub.bySymbol.get(s).tf === "1D"), weekly = all.filter((s) => pub.bySymbol.get(s).tf !== "1D");
  const step = Math.max(1, Math.floor(weekly.length / n));
  return daily.concat(weekly.filter((_, k) => k % step === 0).slice(0, n));
}

/** Rechnet einen veroeffentlichten Titel auf den Produkt-Eingangsdaten nach (ungekuerzt bis zum veroeffentlichten Stand). */
export function identityOne(sym, ctx, pub, productInputDir) {
  const P = pub.bySymbol.get(sym); if (!P) return { s: sym, status: "NOT_PUBLISHED" };
  let series, kind;
  if (P.tf === "1D") {
    const f = ctx.daily.get(sym); if (!f) return { s: sym, status: "NO_INPUT" };
    const j = readJson(f); series = dailySeriesFromPayload(j, j.ticker); kind = "daily";
  } else {
    const f = join(productInputDir, Identity.securityIdForTicker(sym) + ".json"); if (!existsSync(f)) return { s: sym, status: "NO_INPUT" };
    const j = readJson(f); series = weeklySeriesFromPoints(j.points || [], j.ticker); kind = "weekly"; series.corporateActions = j.corporateActions || null;
  }
  if (series.timestamps[series.length - 1] !== P.asOf) return { s: sym, status: "INPUT_NEWER_OR_OLDER", inputAsOf: series.timestamps[series.length - 1], publishedAsOf: P.asOf };
  const shard = JSON.parse(gunzipSync(readFileSync(join(pub.dir, "shards", shardKey(sym) + ".json.gz"))).toString()).instruments[sym];
  /* Datenstand-Richtlinie: ein zurueckgehaltener Titel traegt keine Elliott-Zaehlung im Produkt; seine Identitaet ist der Datenstand (compareFreshness) */
  if (shard && shard.withheld) return { s: sym, tf: P.tf, status: "WITHHELD" };
  const mine = analyzeAndSummarize(series, kind, sym, ctx);
  const theirs = elliottSha(shard && shard.pro ? shard.pro.elliott : null);
  return { s: sym, tf: P.tf, status: mine.view.sha === theirs ? "IDENTICAL" : "DIFFERENT", mine: mine.view.sha, published: theirs };
}

/** Zusammenfassung der Identitaetspruefung. ok nur, wenn mindestens ein Titel verglichen wurde und keiner abweicht. */
export function summarizeIdentity(rows, pub, ctx) {
  const count = (st) => rows.filter((r) => r.status === st).length;
  const compared = count("IDENTICAL") + count("DIFFERENT");
  return { version: PRODUCT_VIEW_VERSION, published: { generatedAt: pub.generatedAt, methodologyKey: pub.methodologyKey, dailySource: pub.meta.sources && pub.meta.sources.daily, weeklySource: pub.meta.sources && pub.meta.sources.weekly },
           registryDailySource: ctx.workDir ? "kanonische Tageshistorie (work-dir)" : "golden-preview", sampled: rows.length, compared, identical: count("IDENTICAL"), different: count("DIFFERENT"),
           notComparable: rows.length - compared, differences: rows.filter((r) => r.status === "DIFFERENT").slice(0, 20), ok: compared > 0 && count("DIFFERENT") === 0 };
}
