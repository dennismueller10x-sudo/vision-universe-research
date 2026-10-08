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
import { projectionElliott, projectionInput, motiveCandidateFor } from "../lib/ti-projection.mjs";
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
export function productElliottAt(sym, weeklyUsed, ticker, F, ctx, pub) {
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
    series = weeklySeriesFromPoints(weeklyUsed, ticker); kind = "weekly";
    if (series.length < MIN_WEEKLY) return { skip: "PRODUCT_TOO_SHORT", tf: tf.tf };
  }
  return Object.assign(analyzeAndSummarize(series, kind, T, ctx), { tfRule: tf.rule });
}

function analyzeAndSummarize(series, kind, ticker, ctx) {
  const out = analyzeProduct(series, productOpts(kind, ctx.C, ticker));
  const S = slim(out.res), E = out.res.methods.elliott, pub = S.pro.elliott, T = elliottTransparency(out.res, out.replay);
  const p = E && E.primary, t = series.length - 1, atr = out.P.main.features.columns.atr[t];
  /* Elliott Projection Engine (Registry 1.2.0): dieselbe Eingabe wie das Produkt (veroeffentlichte Form, 260 Chart-Bars wie chartOf);
     die Relative Staerke setzt der Hauptthread aus dem Querschnitt der Woche. */
  const r4 = (v) => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v), from = Math.max(0, series.length - 260);
  const projE = projectionElliott(pub), mc = motiveCandidateFor(series, out, PRODUCT_METHODOLOGY);
  if (projE && mc.count) projE.hiddenMotive = mc;
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
    const j = readJson(f); series = weeklySeriesFromPoints(j.points || [], j.ticker); kind = "weekly";
  }
  if (series.timestamps[series.length - 1] !== P.asOf) return { s: sym, status: "INPUT_NEWER_OR_OLDER", inputAsOf: series.timestamps[series.length - 1], publishedAsOf: P.asOf };
  const shard = JSON.parse(gunzipSync(readFileSync(join(pub.dir, "shards", shardKey(sym) + ".json.gz"))).toString()).instruments[sym];
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
