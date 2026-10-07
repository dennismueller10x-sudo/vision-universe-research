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

     node scripts/technical/elliott-registry/register.mjs --weekly-dir DIR --registry DIR [--as-of YYYY-MM-DD] [--workers N] [--limit N]
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

const require = createRequire(import.meta.url);
const EV3 = require(join(ROOT, "quant/engines/technical/elliott/elliott-v3.js"));
const SC = require(join(ROOT, "quant/engines/technical/ti/scenario.js"));
export const REGISTRY_VERSION = "elliott-registry-1.0.0";
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
function analyzeSymbol(file, F) {
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
           rw3: researchInternalWave3(E, c, t), dataSha: sha(JSON.stringify(used)).slice(0, 16), seriesAsOf: x.asOf || x.to };
}
if (!isMainThread) { const out = workerData.files.map((f) => { try { return analyzeSymbol(f, workerData.F); } catch (e) { return { s: f, error: String(e && e.message || e) }; } }); parentPort.postMessage(out); }

async function analyzeAll(files, F, workers) {
  const parts = Array.from({ length: workers }, () => []); files.forEach((f, k) => parts[k % workers].push(f));
  const res = await Promise.all(parts.filter((p) => p.length).map((p) => new Promise((ok, ko) => { const w = new Worker(fileURLToPath(import.meta.url), { workerData: { files: p, F } }); w.on("message", ok); w.on("error", ko); })));
  return res.flat();
}

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

function codeVersion() {
  let commit = process.env.GITHUB_SHA || null; try { if (!commit) commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* ohne Git */ }
  return { commit, registry: REGISTRY_VERSION, ledger: LEDGER_VERSION, library: LIBRARY_VERSION, setupSpecSha256: SPEC_SHA256, setupVersion: SPEC.setupVersion,
           engine: { elliott: EV3.ENGINE_VERSION, scenario: SC.ENGINE_VERSION } };
}

export async function register(o) {
  const today = new Date().toISOString().slice(0, 10), latest = lastCompletedFriday(o.asOf || today);
  const F = o.week || latest;
  if (fridayOf(F) !== F) throw new Error("--week muss ein Freitag sein: " + F);
  if (F > lastCompletedFriday(today)) throw new Error("Woche " + F + " ist noch nicht abgeschlossen (heute " + today + ")");
  const reg = o.registry; mkdirSync(join(reg, "snapshots"), { recursive: true });
  const lines = readLedger(reg), head = existsSync(join(reg, "HEAD.json")) ? JSON.parse(readFileSync(join(reg, "HEAD.json"), "utf8")) : null;
  const chk = verifyChain(lines, head); if (!chk.ok) throw new Error("Ledger beschaedigt: " + chk.errors.slice(0, 3).join("; "));
  if (lines.some((e) => e.type === "RUN" && e.week === F)) return { week: F, skipped: "WEEK_ALREADY_REGISTERED" };
  if (lines.some((e) => e.type === "RUN" && e.week > F)) throw new Error("Woche " + F + " liegt vor einem bereits registrierten Lauf — Register nur vorwaerts");
  let files = readdirSync(o.weeklyDir).filter((f) => f.startsWith("ref_") && f.endsWith(".json")).sort().map((f) => join(o.weeklyDir, f));
  if (o.limit) files = files.slice(0, o.limit);
  const t0 = Date.now();
  const rows = await analyzeAll(files, F, o.workers || 4);
  const ok = rows.filter((r) => !r.skip && !r.error);
  /* RS26-Rang im Querschnitt der Woche */
  const rs = ok.filter((r) => isNum(r.ret26)).sort((a, b) => a.ret26 - b.ret26); rs.forEach((r, k) => { r.rsQ = rs.length > 1 ? k / (rs.length - 1) : 0.5; });
  /* Setup-Klassifikation (gleiche Implementierung wie die Historie) */
  for (const r of ok) { r.setup = r.E ? classify(r.E, { px: r.px, atr: r.atr, trend: r.trend, rsQ: isNum(r.rsQ) ? r.rsQ : null, msVote: r.ms }) : null; }
  /* Snapshot (Kontrollkohorte) */
  const snap = ok.map((r) => ({ s: r.s, d: r.d, px: r.px, atr: r.atr, trend: r.trend, rsQ: r4(r.rsQ), ms: r4(r.ms), ew: r.ew, setup: r.setup ? { id: r.setup.setupId, status: r.setup.status, displayed: r.setup.displayed, variants: r.setup.variants || null } : null,
                                rw3: r.rw3 ? r.rw3.qualifies : false, dataSha: r.dataSha }));
  const snapBody = gzipSync(Buffer.from(snap.map((x) => JSON.stringify(x)).join("\n"))), snapFile = join(reg, "snapshots", F + ".jsonl.gz");
  if (existsSync(snapFile)) throw new Error("Snapshot existiert bereits: " + snapFile);
  writeFileSync(snapFile, snapBody);
  const recordedAt = new Date().toISOString(), entries = [];
  entries.push({ type: "RUN", id: "RUN-" + F, week: F, recordedAt, payload: { week: F, asOf: o.asOf || null, code: codeVersion(), universe: { files: files.length, analysed: ok.length, skipped: rows.filter((r) => r.skip).length, errors: rows.filter((r) => r.error).length },
    snapshot: { file: "snapshots/" + F + ".jsonl.gz", sha256: sha(snapBody), rows: snap.length }, data: { source: o.dataSource || "weekly closes (discover-series-long format)", seriesAsOfMin: ok.reduce((m, r) => (r.seriesAsOf < m ? r.seriesAsOf : m), "9999"), seriesAsOfMax: ok.reduce((m, r) => (r.seriesAsOf > m ? r.seriesAsOf : m), "0000") } } });
  /* EVENTS: neu qualifizierte Setups und neue Forschungskandidaten */
  const registered = new Set(lines.filter((e) => e.type === "EVENT").map((e) => e.payload.dedupeKey));
  for (const r of ok) {
    const base = { symbol: r.s, timeframe: "1W", registeredWeek: F, registeredBarDate: r.d, price: r.px, atr: r.atr, dataVersion: { seriesAsOf: r.seriesAsOf, sha256_16: r.dataSha }, codeVersion: { library: LIBRARY_VERSION, specSha256: SPEC_SHA256, engine: EV3.ENGINE_VERSION },
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
    if (r.rw3 && r.rw3.qualifies) {
      const dk = [r.s, "RESEARCH_ONLY_INTERNAL_WAVE3", r.rw3.pivotIdx[0]].join("|");
      if (!registered.has(dk)) { registered.add(dk);
        const pp = r.rw3.pivotPrice, L1 = Math.abs(pp[1] - pp[0]), base3 = r.rw3.waves === 2 ? pp[2] : pp[2];
        const proj = [1.0, 1.618, 2.618].map((x) => r4(base3 + L1 * x));
        const payload = { ...base, cohort: "RESEARCH_ONLY_INTERNAL_WAVE3", dedupeKey: dk, setupType: "RESEARCH_ONLY_INTERNAL_WAVE3", dir: 1, internal: r.rw3,
          levels: { invalidation: r4(pp[0]), confirmation: r4(pp[1]), confirmationState: r.px > pp[1] ? "ALREADY_CONFIRMED" : "PENDING" },
          projection: { primary: { low: proj[1], high: proj[1] }, extended: { low: proj[2], high: proj[2] }, all: proj, basis: "Welle 3 = 1,0 / 1,618 / 2,618 × Welle 1 ab Ende Welle 2 (patterns.js-Proportionen); Invalidation = Ursprung Welle 1" },
          productVisible: false, displayedPrimary: r.ew, setupStatus: "OPEN" };
        entries.push({ type: "EVENT", id: eventId(payload), week: F, recordedAt, payload }); }
    }
  }
  /* REVISIONS fuer offene Ereignisse aus allen frueheren Laeufen */
  const byS = new Map(ok.map((r) => [r.s, r]));
  const revs = new Map(); for (const e of lines.filter((x) => x.type === "REVISION")) { const s = revs.get(e.ref) || new Set(); s.add(e.payload.type); revs.set(e.ref, s); }
  for (const ev of lines.filter((x) => x.type === "EVENT")) {
    const done = revs.get(ev.id) || new Set(); if (done.has("INVALIDATED") || done.has("EXPIRED")) continue;
    const x = readJson(join(o.weeklyDir, ev.payload.symbol + ".json")), k = cutIndex(x.points || [], x.asOf || x.to, F); if (k < 0) continue;
    const pts = (x.points || []).slice(0, k + 1).filter((p) => p[0] > ev.payload.registeredBarDate);
    const cur = byS.get(ev.payload.symbol), curKey = ev.payload.cohort === "RESEARCH_ONLY_INTERNAL_WAVE3" ? undefined : cur && cur.ew ? cur.ew.key : undefined;
    const rv = revisionsFor(ev, pts.map((p) => p[1]), pts.map((p) => p[0]), curKey, done);
    if (pts.length >= TRACK_WEEKS && !done.has("INVALIDATED")) rv.push({ type: "EXPIRED", barDate: pts[pts.length - 1][0], note: "Beobachtung nach 156 Wochen beendet" });
    for (const v of rv) entries.push({ type: "REVISION", id: eventId({ ref: ev.id, ...v }), ref: ev.id, week: F, recordedAt, payload: { ...v, eventSetupType: ev.payload.setupType, symbol: ev.payload.symbol } });
  }
  const written = append(reg, lines, entries);
  const count = (t, c) => written.filter((e) => e.type === t && (!c || e.payload.cohort === c)).length;
  return { week: F, analysed: ok.length, skipped: rows.length - ok.length, events: count("EVENT"), product: count("EVENT", "PRODUCT_SETUP"), enginePrimary: count("EVENT", "ENGINE_PRIMARY_UNDISPLAYED"),
           research: count("EVENT", "RESEARCH_ONLY_INTERNAL_WAVE3"), revisions: count("REVISION"), seconds: Math.round((Date.now() - t0) / 1000) };
}

if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  register({ weeklyDir: arg("weekly-dir"), registry: arg("registry"), asOf: arg("as-of", null), week: arg("week", null), workers: +arg("workers", "4"), limit: +arg("limit", "0"), dataSource: arg("data-source", null) })
    .then((r) => console.log("[elliott-registry] " + JSON.stringify(r))).catch((e) => { console.error(e); process.exit(1); });
}
