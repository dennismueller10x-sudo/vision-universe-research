#!/usr/bin/env node
/* =========================================================================
   VU MISSION X — ELLIOTT PROSPECTIVE REGISTRY: Registrierung (ohne Zukunftswissen)

   Je Lauf (eine abgeschlossene ISO-Woche):
     1. Woche W* = letzte abgeschlossene ISO-Woche (Freitag < Stichtag) und je Reihe Daten-Stand ≥ Freitag von W*.
        Reihen werden VOR der Analyse auf W* gekuerzt → kein Blick in spaetere Kurse.
     2. Je Titel: eingefrorene Engine (TI-Record fuer Marktstruktur, Elliott mit ausgabeneutralen Forensik-Haken),
        Trend, RS26-Rang im Querschnitt, Setup-Klassifikation (setup-library.mjs), Forschungskohorte Welle 3.
     3. SNAPSHOT aller Titel (Kontrollkohorte: Trend, RS, Marktstruktur, Elliott-Zustand) — unveraenderlich je Woche.
     4. EVENT fuer jedes NEU qualifizierte Setup (Titel × Setup × Elliott-Zaehlung) und jeden neuen
        RESEARCH_ONLY_INTERNAL_WAVE3-Kandidaten; REVISION fuer offene Ereignisse (Bestaetigung, Invalidation,
        Ziel, erweiterte Projektion, Umdeutung). Nichts Bestehendes wird geaendert.

   Ab Registry 1.1.0 zusaetzlich die KUNDENPRODUKT-SICHT (product-view.mjs): dieselbe Elliott-Ausgabe wie das Chartbild
   (analyzeProduct mit Persistenzkette, Produkt-Zeitebene, Produkt-Optionen), eigene Kohorten CUSTOMER_PRODUCT_*.
   Vor jedem Lauf wird die Identitaet mit den veroeffentlichten Produktdaten geprueft; ohne Gleichheit wird nichts geschrieben.
   Die zustandslose Sicht (Kohorten von 1.0.0) laeuft unveraendert weiter: Sie ist die Sicht der historischen Evidenz.

   Betrieb: ohne --week werden fehlende abgeschlossene Wochen nach dem letzten Lauf der Reihe nach nachgeholt
   (hoechstens --max-weeks je Aufruf). Ein Lauf mit deutlich weniger Titeln als der vorige bricht vor dem Schreiben ab.

     node scripts/technical/elliott-registry/register.mjs --weekly-dir DIR --registry DIR [--as-of YYYY-MM-DD] [--week FREITAG]
          [--workers N] [--limit N] [--max-weeks N] [--min-coverage 0.9] [--product-input-dir DIR] [--identity-sample N]
     node scripts/technical/elliott-registry/register.mjs --registry DIR --pending [--as-of YYYY-MM-DD]   (nur anzeigen, was faellig ist)
   ========================================================================= */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { ROOT, readJson, weeklySeriesFromPoints } from "../lib/ti-data.mjs";
import * as Core from "../hsab/lib/replay-core.mjs";
import { PRODUCT_METHODOLOGY } from "../lib/ti-product.mjs";
import { classify, researchInternalWave3, SPEC_SHA256, LIBRARY_VERSION, SPEC } from "../elliott-setups/setup-library.mjs";
import { readLedger, append, verifyChain, eventId, LEDGER_VERSION } from "./ledger.mjs";
import { Projection, registryProjection, PROJECTION_VERSION } from "../lib/ti-projection.mjs";
import { publishedProduct, productContext, productElliottAt, identitySample, identityOne, summarizeIdentity, PRODUCT_VIEW_VERSION } from "./product-view.mjs";

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const SC = require(join(ROOT, "quant/engines/technical/ti/scenario.js"));
export const REGISTRY_VERSION = "elliott-registry-1.4.0";   // 1.4.0: Kohorte CUSTOMER_PRODUCT_EXPLORE_ELLIOTT (Projection Engine 1.2.0, Explore Elliott; nur angezeigte Lesarten)
                                                        // 1.3.0: Kohorte CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE (Projection Engine 1.1.0, Produkt-Sichtbarkeit); productVisible der Forschungskohorte wahrheitsgemaess   // 1.2.0: Projektionsthese (elliott-projection-1.0.0) an neuen Kundenprodukt-Ereignissen, Revisionen PROJECTION_*
export const VIEWS = Object.freeze({ STATELESS: "STATELESS_ENGINE", PRODUCT: "CUSTOMER_PRODUCT" });
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sha = (s) => createHash("sha256").update(s).digest("hex");
function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const MIN_BARS = 160, TERMINAL = new Set(["INVALIDATED", "TARGET_REACHED_AND_CLOSED", "EXPIRED"]), TRACK_WEEKS = 156;

/* ---------- Kalender: abgeschlossene ISO-Wochen ---------- */
const dayMs = 864e5;
export function fridayOf(dateStr) { const d = new Date(dateStr + "T00:00:00Z"), wd = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() + (4 - wd) * dayMs).toISOString().slice(0, 10); }
/** Letzte abgeschlossene Woche zum Stichtag: Freitag strikt vor dem Stichtag. */
export function lastCompletedFriday(asOf) { const d = new Date(asOf + "T00:00:00Z"); for (let k = 1; k <= 7; k++) { const x = new Date(d.getTime() - k * dayMs); if (x.getUTCDay() === 5) return x.toISOString().slice(0, 10); } return null; }
/** Index der letzten Bar der Reihe, die zur Woche mit Freitag F gehoert; nur wenn der Daten-Stand der Reihe ≥ F ist. */
export function cutIndex(points, seriesAsOf, F) {
  if (!seriesAsOf || seriesAsOf < F) return -1;
  let k = -1; for (let i = 0; i < points.length; i++) { if (fridayOf(points[i][0]) <= F) k = i; else break; }
  return k >= 0 && fridayOf(points[k][0]) === F ? k : -1;
}

/* ---------- Analyse eines Titels (Worker) ---------- */
function analyzeSymbol(file, F, W) {
  const x = readJson(file), sym = file.split("/").pop().replace(/\.json$/, "");
  const pts = x.points || [], k = cutIndex(pts, x.asOf || x.to, F);
  if (k < 0) return { s: sym, skip: "NO_COMPLETED_BAR_FOR_WEEK" };
  if (k + 1 < MIN_BARS) return { s: sym, skip: "TOO_SHORT" };
  const used = pts.slice(0, k + 1), series = weeklySeriesFromPoints(used, x.ticker || sym), t = series.length - 1;
  const P = Core.prepareSeries(series);
  const rec = Core.recordAt(P, series, t, { symbol: sym, cohort: "REGISTRY" });
  const E = EV3.analyzeElliottV3({ series, features: P.main.features, pivots: P.main.pivots, asOfIndex: t, barsPerYear: P.main.profile.barsPerYear, previous: null, methodology: PRODUCT_METHODOLOGY, forensics: true, debugAll: true });
  const c = series.close, atr = P.main.features.columns.atr[t];
  /* einfacher Trend wie panel.mjs (40-Wochen-Durchschnitt mit Steigung ueber 4 Wochen) */
  let trend = 0; if (t >= 43) { const sma = (j) => { let s = 0; for (let q = j - 39; q <= j; q++) s += c[q]; return s / 40; }; const m = sma(t), m4 = sma(t - 4); trend = c[t] > m && m > m4 ? 1 : c[t] < m && m < m4 ? -1 : 0; }
  return { s: sym, d: series.timestamps[t], i: t, px: c[t], atr: r4(atr), ret26: t >= 26 && c[t - 26] > 0 ? c[t] / c[t - 26] - 1 : null, trend, ms: rec.v ? rec.v.STRUCTURE ?? null : null,
           ew: rec.ew ? { p: rec.ew.p, w: rec.ew.w, ab: rec.ew.ab, d: rec.ew.d, key: rec.ew.key, app: rec.ew.app } : null, outlook: rec.o, clarity: rec.cl,
           E: E && E.primary ? { primary: E.primary, alternatives: (E.alternatives || []).slice(0, 1), applicability: E.applicability, higherDegree: E.higherDegree ? { current: E.higherDegree.current, pattern: E.higherDegree.pattern } : null } : null,
           rw3: researchInternalWave3(E, c, t), rw3Start: (() => { const q = researchInternalWave3(E, c, t); return q ? series.timestamps[q.pivotIdx[0]] : null; })(), dataSha: sha(JSON.stringify(used)).slice(0, 16), seriesAsOf: x.asOf || x.to,
           pv: W && W.ctx ? productRow(sym, used, x.ticker || sym, F, W, x.corporateActions || null) : null, inAgree: W && W.productInputDir ? inputAgreement(sym, used, F, W.productInputDir) : null };
}

/* Kundenprodukt-Sicht: exakt die Produktfunktion (product-view.mjs). Kurs und ATR aus der Produktrechnung selbst. */
function productRow(sym, used, ticker, F, W, corporateActions) {
  const r = productElliottAt(sym, used, ticker, F, W.ctx, W.pub, corporateActions);
  if (r.skip) return { skip: r.skip, tf: r.tf };
  return { ...r.view, tfRule: r.tfRule, E: r.E && r.E.primary ? { primary: r.E.primary, alternatives: (r.E.alternatives || []).slice(0, 1), applicability: r.E.applicability,
           higherDegree: r.E.higherDegree ? { current: r.E.higherDegree.current, pattern: r.E.higherDegree.pattern } : null } : null, px: r.px, atr: r4(r.atr), projIn: r.projIn || null, motiveIn: r.motiveIn || null, exploreIn: r.exploreIn || null };
}

/* Stimmen die frisch gebauten Wochenschluesse mit den Eingangsdaten des veroeffentlichten Produkts ueberein?
   Verglichen werden die abgeschlossenen Wochen, die beide abdecken (die letzte, ggf. angebrochene Produktwoche nicht). */
function inputAgreement(sym, used, F, dir) {
  const f = join(dir, sym + ".json"); if (!existsSync(f)) return null;
  const y = readJson(f), lim = fridayOf(y.asOf || y.to || "0000-01-01"), mine = new Map(used.map((p) => [p[0], p[1]]));
  const cmp = (y.points || []).filter((p) => fridayOf(p[0]) < lim && p[0] <= F); if (!cmp.length) return null;
  return cmp.every((p) => mine.has(p[0]) && Math.abs(mine.get(p[0]) - p[1]) <= 1e-9 * Math.max(1, Math.abs(p[1])));
}

let W = null;
function workerContext(d) {
  if (W) return W;
  W = { productInputDir: d.productInputDir || null };
  if (d.productView) { W.pub = publishedProduct(d.publishedDir || undefined); const ctx = productContext(W.pub, d.workDir || null); if (ctx.error) throw new Error(ctx.error); W.ctx = ctx; }
  return W;
}
if (!isMainThread && workerData && workerData.role === "elliott-registry") {
  const w = workerContext(workerData);
  const out = workerData.kind === "identity"
    ? workerData.items.map((s) => { try { return identityOne(s, w.ctx, w.pub, workerData.productInputDir); } catch (e) { return { s, status: "ERROR", error: String(e && e.message || e) }; } })
    : workerData.items.map((f) => { try { return analyzeSymbol(f, workerData.F, w); } catch (e) { return { s: f, error: String(e && e.message || e) }; } });
  parentPort.postMessage(out);
}

async function pool(kind, items, workers, data) {
  const parts = Array.from({ length: Math.max(1, workers) }, () => []); items.forEach((f, k) => parts[k % parts.length].push(f));
  const res = await Promise.all(parts.filter((p) => p.length).map((p) => new Promise((ok, ko) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { role: "elliott-registry", kind, items: p, ...data } });
    w.on("message", ok); w.on("error", ko); w.on("exit", (code) => { if (code !== 0) ko(new Error("Worker beendet mit " + code)); });
  })));
  return res.flat();
}

/** Identitaet Registry ↔ veroeffentlichtes Kundenprodukt (Byte-Gleichheit von pro.elliott). */
export async function checkProductIdentity(o) {
  const pub = publishedProduct(o.publishedDir || undefined), ctx = productContext(pub, o.workDir || null);
  if (ctx.error) return { ok: false, error: ctx.error, version: PRODUCT_VIEW_VERSION };
  const syms = o.identitySymbols || identitySample(pub, o.identitySample || 120);
  const rows = await pool("identity", syms, o.workers || 4, { productView: true, productInputDir: o.productInputDir, workDir: o.workDir || null, publishedDir: o.publishedDir || null });
  return summarizeIdentity(rows, pub, ctx);
}

/** Abgeschlossene Wochen, die nach dem letzten registrierten Lauf noch fehlen (aelteste zuerst). */
export function pendingWeeks(lines, asOf, max = 1) {
  const latest = lastCompletedFriday(asOf), runs = lines.filter((e) => e.type === "RUN").map((e) => e.week).sort();
  if (!runs.length) return [latest];
  const out = []; for (let F = addDays(runs[runs.length - 1], 7); F <= latest; F = addDays(F, 7)) out.push(F);
  return out.slice(0, Math.max(1, max));
}
const addDays = (F, n) => new Date(Date.parse(F + "T00:00:00Z") + n * dayMs).toISOString().slice(0, 10);

/* ---------- Revisionen offener Ereignisse aus Kursen NACH der Registrierung ---------- */
export function revisionsFor(ev, closes, dates, currentKey, already) {
  const p = ev.payload, out = [], dir = p.dir, has = (t) => already.has(t);
  if (!p.levels || !isNum(p.levels.invalidation)) return out;
  const near = (z) => (z ? (dir > 0 ? z.low : z.high) : null), t1 = near(p.projection && p.projection.primary), t2 = near(p.projection && p.projection.extended);
  for (let j = 0; j < closes.length; j++) {
    const c = closes[j], d = dates[j]; if (d <= p.registeredBarDate) continue;
    if (!has("CONFIRMED") && isNum(p.levels.confirmation) && p.levels.confirmationState === "PENDING" && (dir > 0 ? c > p.levels.confirmation : c < p.levels.confirmation)) { out.push({ type: "CONFIRMED", barDate: d, close: c }); already.add("CONFIRMED"); }
    if (!has("INVALIDATED") && (dir > 0 ? c < p.levels.invalidation : c > p.levels.invalidation)) { out.push({ type: "INVALIDATED", barDate: d, close: c }); already.add("INVALIDATED"); break; }
    if (!has("TARGET_REACHED") && isNum(t1) && (dir > 0 ? c >= t1 : c <= t1)) { out.push({ type: "TARGET_REACHED", barDate: d, close: c }); already.add("TARGET_REACHED"); }
    if (!has("EXTENDED_PROJECTION_REACHED") && isNum(t2) && (dir > 0 ? c >= t2 : c <= t2)) { out.push({ type: "EXTENDED_PROJECTION_REACHED", barDate: d, close: c }); already.add("EXTENDED_PROJECTION_REACHED"); }
  }
  if (p.persistenceKey && currentKey !== undefined && currentKey !== p.persistenceKey && !has("RELABELED") && !has("INVALIDATED")) { out.push({ type: "RELABELED", barDate: dates[dates.length - 1], newKey: currentKey }); already.add("RELABELED"); }
  return out;
}

/* Registry 1.2.0: Revisionen der eingefrorenen Projektionsthese (nur Ereignisse, die eine tragen; aeltere Eintraege bleiben unberuehrt).
   Gleiche Kursbasis wie revisionsFor (Wochenschluesse nach der Registrierung). */
export function projectionRevisionsFor(ev, closes, dates, already) {
  const th = ev.payload.projectionThesis && ev.payload.projectionThesis.thesis, out = [];
  if (!th || !th.zones || !th.zones.length) return out;
  const s = th.direction === "UP" ? 1 : -1, has = (t) => already.has(t), inv = th.invalidation;
  for (let j = 0; j < closes.length; j++) {
    const c = closes[j], d = dates[j]; if (d <= ev.payload.registeredBarDate) continue;
    if (inv && isNum(inv.price) && !has("PROJECTION_INVALIDATED") && (inv.direction === "below" ? c < inv.price : c > inv.price)) { out.push({ type: "PROJECTION_INVALIDATED", barDate: d, close: c }); already.add("PROJECTION_INVALIDATED"); break; }
    for (const z of th.zones) {
      const t = "PROJECTION_" + z.tier + "_REACHED";
      if (z.state !== "OPEN" || has(t) || has("PROJECTION_INVALIDATED")) continue;
      if (s > 0 ? c >= z.low : c <= z.high) { out.push({ type: t, barDate: d, close: c }); already.add(t); }
    }
  }
  return out;
}

function codeVersion() {
  let commit = process.env.GITHUB_SHA || null; try { if (!commit) commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* ohne Git */ }
  return { commit, registry: REGISTRY_VERSION, ledger: LEDGER_VERSION, library: LIBRARY_VERSION, setupSpecSha256: SPEC_SHA256, setupVersion: SPEC.setupVersion,
           engine: { elliott: EV3.ENGINE_VERSION, scenario: SC.ENGINE_VERSION }, projection: PROJECTION_VERSION };
}

/** Registriert eine Woche (o.week) oder holt fehlende Wochen nach (hoechstens o.maxWeeks, aelteste zuerst). */
export async function register(o) {
  const today = new Date().toISOString().slice(0, 10);
  if (o.week) return registerWeek(o, o.week);
  const weeks = pendingWeeks(readLedger(o.registry), o.asOf || today, o.maxWeeks || 1);
  /* Identitaet einmal je Aufruf pruefen (gleicher Code, gleiche veroeffentlichte Daten fuer alle nachgeholten Wochen) */
  if (o.productView !== false && !o.identity && weeks.length > 1) o = { ...o, identity: await checkProductIdentity({ ...o, productInputDir: o.productInputDir || o.weeklyDir }) };
  /* Scheitert eine spaetere Woche, bleiben die frueheren Wochen registriert (sie sind fertig und geprueft);
     das Ergebnis traegt dann incomplete + Fehler, die Kommandozeile endet mit Code 3. */
  const results = [];
  for (const F of weeks) {
    try { results.push(await registerWeek(o, F)); }
    catch (e) { if (!results.length) throw e; return { ...results[results.length - 1], catchUp: results, incomplete: true, failedWeek: F, error: String(e && e.message || e) }; }
  }
  const last = results[results.length - 1];
  return results.length === 1 ? last : { ...last, catchUp: results };
}

async function registerWeek(o, F) {
  const today = new Date().toISOString().slice(0, 10);
  if (fridayOf(F) !== F) throw new Error("--week muss ein Freitag sein: " + F);
  if (F > lastCompletedFriday(today)) throw new Error("Woche " + F + " ist noch nicht abgeschlossen (heute " + today + ")");
  const reg = o.registry; mkdirSync(join(reg, "snapshots"), { recursive: true });
  const lines = readLedger(reg), head = existsSync(join(reg, "HEAD.json")) ? JSON.parse(readFileSync(join(reg, "HEAD.json"), "utf8")) : null;
  const chk = verifyChain(lines, head); if (!chk.ok) throw new Error("Ledger beschaedigt: " + chk.errors.slice(0, 3).join("; "));
  if (lines.some((e) => e.type === "RUN" && e.week === F)) return { week: F, skipped: "WEEK_ALREADY_REGISTERED" };
  if (lines.some((e) => e.type === "RUN" && e.week > F)) throw new Error("Woche " + F + " liegt vor einem bereits registrierten Lauf — Register nur vorwaerts");
  let files = readdirSync(o.weeklyDir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().map((f) => join(o.weeklyDir, f));
  if (o.limit) files = files.slice(0, o.limit);
  const t0 = Date.now(), productView = o.productView !== false;
  /* 1) Identitaet mit dem veroeffentlichten Kundenprodukt — vor jeder Schreiboperation */
  let identity = null;
  if (productView) {
    identity = o.identity || await checkProductIdentity({ ...o, productInputDir: o.productInputDir || o.weeklyDir });
    if (!identity.ok) throw new Error("Produkt-Identitaet nicht bestaetigt (" + (identity.error || identity.different + " abweichend, " + identity.compared + " verglichen") + ") — nichts registriert");
  }
  const rows = await pool("analyze", files, o.workers || 4, { F, productView, productInputDir: o.productInputDir || null, workDir: o.workDir || null, publishedDir: o.publishedDir || null });
  const ok = rows.filter((r) => !r.skip && !r.error);
  /* 2) Abdeckung: deutlich weniger Titel als im vorigen Lauf heisst veraltete oder unvollstaendige Daten → nicht registrieren */
  const prevRun = lines.filter((e) => e.type === "RUN").pop(), minCov = isNum(o.minCoverage) ? o.minCoverage : 0.9;
  if (prevRun && ok.length < minCov * prevRun.payload.universe.analysed)
    throw new Error("Abdeckung zu gering: " + ok.length + " Titel gegen " + prevRun.payload.universe.analysed + " im Lauf " + prevRun.week + " (Schwelle " + minCov + ") — nichts registriert");
  if (productView) {
    const pvOk = ok.filter((r) => r.pv && !r.pv.skip).length;
    if (pvOk < minCov * ok.length) throw new Error("Produktsicht fuer zu wenige Titel: " + pvOk + " von " + ok.length + " — nichts registriert");
  }
  /* RS26-Rang im Querschnitt der Woche */
  const rs = ok.filter((r) => isNum(r.ret26)).sort((a, b) => a.ret26 - b.ret26); rs.forEach((r, k) => { r.rsQ = rs.length > 1 ? k / (rs.length - 1) : 0.5; });
  /* Setup-Klassifikation (gleiche Implementierung wie die Historie) */
  for (const r of ok) { r.setup = r.E ? classify(r.E, { px: r.px, atr: r.atr, trend: r.trend, rsQ: isNum(r.rsQ) ? r.rsQ : null, msVote: r.ms }) : null; }
  /* Kundenprodukt-Sicht: dieselbe Klassifikation auf der Produkt-Elliott-Ausgabe (Trend, RS, Marktstruktur wie oben) */
  for (const r of ok) if (r.pv && !r.pv.skip) r.pv.setup = r.pv.E ? classify(r.pv.E, { px: r.pv.px, atr: r.pv.atr, trend: r.trend, rsQ: isNum(r.rsQ) ? r.rsQ : null, msVote: r.ms }) : null;
  /* Snapshot (Kontrollkohorte) */
  const snap = ok.map((r) => ({ s: r.s, d: r.d, px: r.px, atr: r.atr, trend: r.trend, rsQ: r4(r.rsQ), ms: r4(r.ms), ew: r.ew, setup: r.setup ? { id: r.setup.setupId, status: r.setup.status, displayed: r.setup.displayed, variants: r.setup.variants || null } : null,
                                rw3: r.rw3 ? r.rw3.qualifies : false, dataSha: r.dataSha,
                                ...(productView ? { pv: !r.pv ? null : r.pv.skip ? { skip: r.pv.skip, tf: r.pv.tf } : { tf: r.pv.tf, d: r.pv.d, p: r.pv.p, w: r.pv.w, ab: r.pv.ab, key: r.pv.key, app: r.pv.app, relabelRisk: r.pv.relabelRisk, sha: r.pv.sha,
                                  setup: r.pv.setup ? { id: r.pv.setup.setupId, status: r.pv.setup.status, displayed: r.pv.setup.displayed, variants: r.pv.setup.variants || null } : null } } : {}) }));
  const snapBody = gzipSync(Buffer.from(snap.map((x) => JSON.stringify(x)).join("\n"))), snapFile = join(reg, "snapshots", F + ".jsonl.gz");
  /* Eine Snapshot-Datei ohne RUN-Eintrag stammt aus einem abgebrochenen Lauf (nie committet, nicht in der Kette) und wird ersetzt. */
  writeFileSync(snapFile, snapBody);
  const recordedAt = new Date().toISOString(), entries = [];
  /* Erster Lauf: erfasst den BESTAND bereits qualifizierter Setups (moeglicherweise seit Wochen). Spaetere Laeufe nur Neuzugaenge.
     Fuer eine saubere Auswertung wird der Bestand markiert und getrennt betrachtet. */
  const initialStock = !lines.some((e) => e.type === "RUN");
  /* Bestand der Kundenprodukt-Sicht: erster Lauf, der diese Sicht fuehrt */
  const initialStockProduct = !lines.some((e) => e.type === "RUN" && (e.payload.views || []).includes(VIEWS.PRODUCT));
  /* Bestand der Motiv-Alternativen: erster Lauf mit Registry >= 1.3.0 */
  /* Bestand von Explore Elliott: erster Lauf mit Registry >= 1.4.0 */
  const initialStockExplore = !lines.some((e) => e.type === "EVENT" && e.payload.cohort === "CUSTOMER_PRODUCT_EXPLORE_ELLIOTT") && !lines.some((e) => { if (e.type !== "RUN") return false; const v = /^elliott-registry-(\d+)\.(\d+)/.exec(e.payload.code && e.payload.code.registry || ""); return !!v && (+v[1] > 1 || +v[2] >= 4); });
  const initialStockMotive = !lines.some((e) => e.type === "EVENT" && e.payload.cohort === "CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE") && !lines.some((e) => { if (e.type !== "RUN") return false; const v = /^elliott-registry-(\d+)\.(\d+)/.exec(e.payload.code && e.payload.code.registry || ""); return !!v && (+v[1] > 1 || +v[2] >= 3); });
  const skipReasons = {}; for (const r of rows) if (r.skip || r.error) { const k = r.skip || "ERROR"; skipReasons[k] = (skipReasons[k] || 0) + 1; }
  const pvStats = productView ? (() => { const s = { analysed: 0, timeframes: {}, skipReasons: {}, inputAgreement: { compared: 0, equal: 0 } };
    for (const r of ok) { if (r.pv && !r.pv.skip) { s.analysed++; s.timeframes[r.pv.tf] = (s.timeframes[r.pv.tf] || 0) + 1; } else { const k = r.pv ? r.pv.skip : "NOT_RUN"; s.skipReasons[k] = (s.skipReasons[k] || 0) + 1; }
      if (r.inAgree !== null && r.inAgree !== undefined) { s.inputAgreement.compared++; if (r.inAgree) s.inputAgreement.equal++; } }
    return s; })() : null;
  entries.push({ type: "RUN", id: "RUN-" + F, week: F, recordedAt, payload: { week: F, asOf: o.asOf || null, code: codeVersion(), universe: { files: files.length, analysed: ok.length, skipped: rows.filter((r) => r.skip).length, errors: rows.filter((r) => r.error).length, skipReasons }, initialStockRun: initialStock,
    views: productView ? [VIEWS.STATELESS, VIEWS.PRODUCT] : [VIEWS.STATELESS], registrationLagDays: Math.round((Date.parse(recordedAt.slice(0, 10)) - Date.parse(F)) / dayMs),
    ...(productView ? { productView: { version: PRODUCT_VIEW_VERSION, initialStockRun: initialStockProduct, identity, ...pvStats } } : {}),
    snapshot: { file: "snapshots/" + F + ".jsonl.gz", sha256: sha(snapBody), rows: snap.length }, data: { source: o.dataSource || "weekly closes (discover-series-long format)", seriesAsOfMin: ok.reduce((m, r) => (r.seriesAsOf < m ? r.seriesAsOf : m), "9999"), seriesAsOfMax: ok.reduce((m, r) => (r.seriesAsOf > m ? r.seriesAsOf : m), "0000") } } });
  /* EVENTS: neu qualifizierte Setups und neue Forschungskandidaten */
  const registered = new Set(lines.filter((e) => e.type === "EVENT").map((e) => e.payload.dedupeKey));
  for (const r of ok) {
    const base = { initialStock, symbol: r.s, timeframe: "1W", registeredWeek: F, registeredBarDate: r.d, price: r.px, atr: r.atr, dataVersion: { seriesAsOf: r.seriesAsOf, sha256_16: r.dataSha }, codeVersion: { library: LIBRARY_VERSION, specSha256: SPEC_SHA256, engine: EV3.ENGINE_VERSION },
                   confirmationsAtRegistration: { trend: r.trend, rs26Rank: r4(r.rsQ), rs26Top20: isNum(r.rsQ) ? r.rsQ >= 0.8 : null, rs26Bottom20: isNum(r.rsQ) ? r.rsQ <= 0.2 : null, marketStructureVote: r4(r.ms), volume: "NOT_AVAILABLE" } };
    if (r.setup && r.setup.status === "QUALIFIED") {
      const S = r.setup, dk = [r.s, S.setupId, S.persistenceKey].join("|");
      if (!registered.has(dk)) { registered.add(dk);
        const payload = { ...base, cohort: S.displayed ? "PRODUCT_SETUP" : "ENGINE_PRIMARY_UNDISPLAYED", dedupeKey: dk, setupType: S.setupId, setupVersion: S.setupVersion, dir: S.dir, pattern: S.pattern, wave: S.wave,
          persistenceKey: S.persistenceKey, degree: S.degree, applicability: S.applicability, displayed: S.displayed, primaryCount: { pattern: r.E.primary.pattern, complete: r.E.primary.complete, currentWave: r.E.primary.currentWave, direction: r.E.primary.direction, nextMove: r.E.primary.nextMove,
            waves: (r.E.primary.waves || []).map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status })) },
          alternative: S.alternative, higherDegree: r.E.higherDegree, levels: S.levels, projection: S.projection, geometry: S.geometry, confirmations: S.confirmations, variants: S.variants, setupStatus: "OPEN" };
        entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload }); }
    }
    if (productView && r.pv && !r.pv.skip && r.pv.setup && r.pv.setup.status === "QUALIFIED") {
      const S = r.pv.setup, dk = [r.s, S.setupId, S.persistenceKey, VIEWS.PRODUCT].join("|");
      if (!registered.has(dk)) { registered.add(dk);
        const payload = { ...base, initialStock: initialStockProduct, view: VIEWS.PRODUCT, cohort: S.displayed ? "CUSTOMER_PRODUCT_SETUP" : "CUSTOMER_PRODUCT_PRIMARY_UNDISPLAYED", dedupeKey: dk,
          timeframe: r.pv.tf, productBarDate: r.pv.d, productTimeframeRule: r.pv.tfRule, productPrice: r.pv.px, productAtr: r.pv.atr, productElliottSha: r.pv.sha, productRelabelRisk: r.pv.relabelRisk,
          setupType: S.setupId, setupVersion: S.setupVersion, dir: S.dir, pattern: S.pattern, wave: S.wave,
          persistenceKey: S.persistenceKey, degree: S.degree, applicability: S.applicability, displayed: S.displayed, primaryCount: { pattern: r.pv.E.primary.pattern, complete: r.pv.E.primary.complete, currentWave: r.pv.E.primary.currentWave, direction: r.pv.E.primary.direction, nextMove: r.pv.E.primary.nextMove,
            waves: (r.pv.E.primary.waves || []).map((w) => ({ label: w.label, fromTime: w.fromTime, toTime: w.toTime, fromPrice: w.fromPrice, toPrice: w.toPrice, status: w.status })) },
          alternative: S.alternative, higherDegree: r.pv.E.higherDegree, levels: S.levels, projection: S.projection, geometry: S.geometry, confirmations: S.confirmations, variants: S.variants, setupStatus: "OPEN",
          ...(r.pv.projIn ? { projectionThesis: registryProjection(Projection.build(r.pv.projIn.E, { ...r.pv.projIn.ctx, rs: isNum(r.rsQ) ? { rank: r.rsQ, rankPrev: null, universe: rs.length } : null })), projectionEngine: PROJECTION_VERSION } : {}) };
        entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload }); }
    }
    /* Registry 1.3.0: angezeigte Motiv-Alternative der Kundenprodukt-Sicht (Welle 3, nicht Hauptlesart), eigene Kohorte, eingefroren */
    /* angezeigte Motiv-Alternative der Produktsicht (Wochenanalyse, auch fuer Tagestitel) — dieselbe Pruefung wie im Produkt */
    const mvProj = productView && r.pv && !r.pv.skip && r.pv.motiveIn ? Projection.build(r.pv.motiveIn.E, { ...r.pv.motiveIn.ctx, rs: isNum(r.rsQ) ? { rank: r.rsQ, rankPrev: null, universe: rs.length } : null }) : null;
    if (mvProj && mvProj.motiveAlternative) {
      const proj = mvProj, m = proj.motiveAlternative;
      if (m) {
        const dk = [r.s, "MOTIVE_ALTERNATIVE", m.key, VIEWS.PRODUCT].join("|");
        if (!registered.has(dk)) { registered.add(dk);
          const reg = registryProjection(Object.assign({}, proj, { primary: m, alternative: null, consumerVisible: true }));
          const payload = { ...base, initialStock: initialStockMotive, view: VIEWS.PRODUCT, cohort: "CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE", dedupeKey: dk, setupType: "MOTIVE_ALTERNATIVE_WAVE3",
            timeframe: proj.timeframe, productBarDate: r.pv.d, productPrice: r.pv.px, productAtr: r.pv.atr, productElliottSha: r.pv.sha, interpretation: "ALTERNATIVE", primaryShownAs: r.pv.p, primaryAbstained: r.pv.ab,
            dir: m.direction === "UP" ? 1 : -1, pattern: m.pattern, wave: m.target, degree: m.degree, persistenceKey: m.key, pool: m.pool, highUpside: !!m.highUpside,
            projectionThesis: reg, projectionEngine: PROJECTION_VERSION, setupStatus: "OPEN" };
          entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload }); }
      }
    }
    /* Registry 1.4.0: angezeigte Explore-Lesarten der Produktsicht (Wochenanalyse), eigene Kohorte, eingefroren, nur anhaengen */
    const exProj = productView && r.pv && !r.pv.skip && r.pv.exploreIn ? Projection.build(r.pv.exploreIn.E, { ...r.pv.exploreIn.ctx, rs: isNum(r.rsQ) ? { rank: r.rsQ, rankPrev: null, universe: rs.length } : null }) : null;
    for (const th of (exProj && exProj.explore) || []) {
      const dk = [r.s, "EXPLORE", th.key, VIEWS.PRODUCT].join("|");
      if (registered.has(dk)) continue; registered.add(dk);
      const payload = { ...base, initialStock: initialStockExplore, view: VIEWS.PRODUCT, cohort: "CUSTOMER_PRODUCT_EXPLORE_ELLIOTT", dedupeKey: dk, setupType: "EXPLORE_ELLIOTT_" + th.type,
        timeframe: exProj.timeframe, productBarDate: r.pv.d, productPrice: r.pv.px, productAtr: r.pv.atr, productElliottSha: r.pv.sha, role: "EXPLORE", interpretation: "EXPLORE",
        primaryShownAs: r.pv.p, primaryAbstained: r.pv.ab, dir: th.direction === "UP" ? 1 : -1, pattern: th.pattern, waveType: th.type, wave: th.target, degree: th.degree, persistenceKey: th.key,
        rank: th.pool.rank, poolSize: th.pool.size, slot: th.slot, failedGates: th.qualityGates.failed, gateResults: th.qualityGates.results, hardRules: th.hardRules.status,
        dataQuality: { status: exProj.guardrails.flags.some((f) => f.code === "SPLIT_SUSPICION_RESOLVED") ? "CLEAN_AFTER_SPLIT_RESOLUTION" : "CLEAN", flags: exProj.guardrails.flags.map((f) => f.code) },
        projectionThesis: registryProjection(Object.assign({}, exProj, { primary: th, alternative: null, consumerVisible: true })), projectionEngine: PROJECTION_VERSION,
        versions: { engine: exProj.engine.elliott, ruleSet: exProj.engine.ruleSet, projection: PROJECTION_VERSION, visibility: th.visibility }, setupStatus: "OPEN" };
      entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload });
    }
    if (r.rw3 && r.rw3.qualifies) {
      const dk = [r.s, "RESEARCH_ONLY_INTERNAL_WAVE3", r.rw3.pivotIdx[0]].join("|");
      if (!registered.has(dk)) { registered.add(dk);
        const pp = r.rw3.pivotPrice, L1 = Math.abs(pp[1] - pp[0]), base3 = r.rw3.waves === 2 ? pp[2] : pp[2];
        const proj = [1.0, 1.618, 2.618].map((x) => r4(base3 + L1 * x));
        const payload = { ...base, cohort: "RESEARCH_ONLY_INTERNAL_WAVE3", dedupeKey: dk, setupType: "RESEARCH_ONLY_INTERNAL_WAVE3", dir: 1, internal: r.rw3,
          levels: { invalidation: r4(pp[0]), confirmation: r4(pp[1]), confirmationState: r.px > pp[1] ? "ALREADY_CONFIRMED" : "PENDING" },
          projection: { primary: { low: proj[1], high: proj[1] }, extended: { low: proj[2], high: proj[2] }, all: proj, basis: "Welle 3 = 1,0 / 1,618 / 2,618 × Welle 1 ab Ende Welle 2 (patterns.js-Proportionen); Invalidation = Ursprung Welle 1" },
          /* 1.3.0: wahrheitsgemaess — seit der Motiv-Alternative (Projection Engine 1.1.0) kann derselbe Kandidat im Produkt sichtbar sein */
          productVisible: !!(mvProj && mvProj.motiveAlternative && mvProj.motiveAlternative.key.indexOf("IMPULSE|" + r.rw3Start + "|1|") === 0),
          displayedPrimary: r.ew, setupStatus: "OPEN" };
        entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload }); }
    }
  }
  /* REVISIONS fuer offene Ereignisse aus allen frueheren Laeufen */
  const byS = new Map(ok.map((r) => [r.s, r]));
  const revs = new Map(); for (const e of lines.filter((x) => x.type === "REVISION")) { const s = revs.get(e.ref) || new Set(); s.add(e.payload.type); revs.set(e.ref, s); }
  for (const ev of lines.filter((x) => x.type === "EVENT")) {
    const done = revs.get(ev.id) || new Set();
    /* Ereignisse ohne Projektionsthese (alle bis 1.1.0): unveraendert. Mit These laeuft nur deren Verfolgung weiter, bis sie selbst ungueltig ist. */
    const projOnly = (done.has("INVALIDATED") || done.has("EXPIRED")) && !!ev.payload.projectionThesis && !done.has("EXPIRED") && !done.has("PROJECTION_INVALIDATED");
    if ((done.has("INVALIDATED") || done.has("EXPIRED")) && !projOnly) continue;
    const x = readJson(join(o.weeklyDir, ev.payload.symbol + ".json")), k = cutIndex(x.points || [], x.asOf || x.to, F); if (k < 0) continue;
    const pts = (x.points || []).slice(0, k + 1).filter((p) => p[0] > ev.payload.registeredBarDate);
    const cur = byS.get(ev.payload.symbol);
    /* Umdeutung je Sicht: Produkt-Ereignisse gegen die Produkt-Primaerzaehlung, zustandslose gegen die zustandslose */
    const curKey = ev.payload.cohort === "RESEARCH_ONLY_INTERNAL_WAVE3" ? undefined
      : ev.payload.view === VIEWS.PRODUCT ? (cur && cur.pv && !cur.pv.skip ? cur.pv.key : undefined)
      : cur && cur.ew ? cur.ew.key : undefined;
    const rv = (projOnly ? [] : revisionsFor(ev, pts.map((p) => p[1]), pts.map((p) => p[0]), curKey, done)).concat(projectionRevisionsFor(ev, pts.map((p) => p[1]), pts.map((p) => p[0]), done));
    if (!projOnly && pts.length >= TRACK_WEEKS && !done.has("INVALIDATED")) rv.push({ type: "EXPIRED", barDate: pts[pts.length - 1][0], note: "Beobachtung nach 156 Wochen beendet" });
    for (const v of rv) entries.push({ type: "REVISION", id: eventId({ ref: ev.id, ...v }), ref: ev.id, week: F, recordedAt, payload: { ...v, eventSetupType: ev.payload.setupType, symbol: ev.payload.symbol } });
  }
  const written = append(reg, lines, entries);
  const count = (t, c) => written.filter((e) => e.type === t && (!c || e.payload.cohort === c)).length;
  return { week: F, analysed: ok.length, skipped: rows.length - ok.length, events: count("EVENT"), product: count("EVENT", "PRODUCT_SETUP"), enginePrimary: count("EVENT", "ENGINE_PRIMARY_UNDISPLAYED"),
           research: count("EVENT", "RESEARCH_ONLY_INTERNAL_WAVE3"), motiveAlternative: count("EVENT", "CUSTOMER_PRODUCT_MOTIVE_ALTERNATIVE"), explore: count("EVENT", "CUSTOMER_PRODUCT_EXPLORE_ELLIOTT"), customerProduct: count("EVENT", "CUSTOMER_PRODUCT_SETUP"), customerProductUndisplayed: count("EVENT", "CUSTOMER_PRODUCT_PRIMARY_UNDISPLAYED"),
           productAnalysed: pvStats ? pvStats.analysed : null, identity: identity ? { compared: identity.compared, identical: identity.identical } : null, revisions: count("REVISION"), seconds: Math.round((Date.now() - t0) / 1000) };
}

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--pending")) {
    /* Nur anzeigen: welche Woche waere faellig? (Ausgabe "pending=YYYY-MM-DD" oder "pending=") */
    const lines = readLedger(arg("registry")), asOf = arg("as-of", null) || new Date().toISOString().slice(0, 10);
    const runs = new Set(lines.filter((e) => e.type === "RUN").map((e) => e.week)), w = pendingWeeks(lines, asOf, 52).filter((F) => !runs.has(F));
    console.log("pending=" + (w[0] || "")); console.log("count=" + w.length);
  } else {
    const num = (k) => (arg(k, null) === null ? undefined : +arg(k));
    register({ weeklyDir: arg("weekly-dir"), registry: arg("registry"), asOf: arg("as-of", null), week: arg("week", null), workers: +arg("workers", "4"), limit: +arg("limit", "0"), dataSource: arg("data-source", null),
               maxWeeks: num("max-weeks") || 1, minCoverage: num("min-coverage"), productInputDir: arg("product-input-dir", null), identitySample: num("identity-sample"), workDir: arg("work-dir", null),
               productView: !process.argv.includes("--no-product-view") })
      .then((r) => { console.log("[elliott-registry] " + JSON.stringify(r)); if (r.incomplete) { console.error("[elliott-registry] Woche " + r.failedWeek + " nicht registriert: " + r.error); process.exit(3); } })
      .catch((e) => { console.error(e); process.exit(1); });
  }
}
