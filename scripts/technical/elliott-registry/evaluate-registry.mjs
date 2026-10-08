#!/usr/bin/env node
/* =========================================================================
   VU MISSION X — Prospektive Auswertung des Registers (nur abgelaufene Horizonte)

   Horizonte: 3 / 6 / 12 / 24 / 36 Monate = 13 / 26 / 52 / 104 / 156 Wochen nach der Registrierungswoche.
   Ein Horizont wird nur ausgewertet, wenn er vollstaendig abgelaufen ist (abgeschlossene Woche ≥ Registrierung + h).
   Vergleich je Ereignis gegen die zeitgleiche Kontrollkohorte aus dem Snapshot der Registrierungswoche:
   Titel ohne dasselbe Setup, (a) alle, (b) gleicher Trend, (c) gleicher RS26-Status, (d) Trend × RS26.
   Das Register selbst wird nie geaendert; Ausgabe ist ein abgeleiteter Bericht.

     node scripts/technical/elliott-registry/evaluate-registry.mjs --weekly-dir DIR --registry DIR [--as-of YYYY-MM-DD] --out FILE
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { readJson } from "../lib/ti-data.mjs";
import { readLedger, verifyChain } from "./ledger.mjs";
import { lastCompletedFriday, fridayOf, cutIndex } from "./register.mjs";

function arg(k, d) { const i = process.argv.indexOf("--" + k); return i >= 0 ? process.argv[i + 1] : d; }
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
export const HORIZONS = { "3M": 13, "6M": 26, "12M": 52, "24M": 104, "36M": 156 };
const addWeeks = (F, w) => new Date(Date.parse(F + "T00:00:00Z") + w * 7 * 864e5).toISOString().slice(0, 10);

/** Rendite und Vielfaches eines Titels zwischen Registrierungsbar und Woche F+h (nur mit abgeschlossenen Wochen). */
function pathOf(cache, dir, sym, regDate, endFriday, latest) {
  if (endFriday > latest) return null;
  let x = cache.get(sym); if (!x) { const f = join(dir, sym + ".json"); if (!existsSync(f)) return null; x = readJson(f); cache.set(sym, x); }
  const pts = x.points || [], k = cutIndex(pts, x.asOf || x.to, endFriday); if (k < 0) return { delistedOrMissing: true };
  const i0 = pts.findIndex((p) => p[0] === regDate); if (i0 < 0 || k <= i0) return null;
  let mx = 1, mn = 1; for (let j = i0 + 1; j <= k; j++) { const m = pts[j][1] / pts[i0][1]; if (m > mx) mx = m; if (m < mn) mn = m; }
  return { ret: pts[k][1] / pts[i0][1] - 1, maxM: mx, mae: mn - 1 };
}

export function evaluateRegistry(o) {
  const lines = readLedger(o.registry), chk = verifyChain(lines, null); if (!chk.ok) throw new Error("Ledger beschaedigt");
  const latest = lastCompletedFriday(o.asOf || new Date().toISOString().slice(0, 10));
  const events = lines.filter((e) => e.type === "EVENT"), revs = lines.filter((e) => e.type === "REVISION");
  const cache = new Map(), snaps = new Map();
  const snapOf = (F) => { if (!snaps.has(F)) { const f = join(o.registry, "snapshots", F + ".jsonl.gz"); snaps.set(F, existsSync(f) ? gunzipSync(readFileSync(f)).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []); } return snaps.get(F); };
  const out = { schemaVersion: "elliott-registry-evaluation-1.0.0", asOfCompletedWeek: latest, events: events.length, revisions: revs.length, horizons: {}, pending: {} };
  const groups = new Map();
  for (const ev of events) {
    /* Bestand des ersten Laufs getrennt von Neuzugaengen (nur Neuzugaenge sind „erstes Auftreten“) */
    const p = ev.payload, g = (p.initialStock ? "STOCK|" : "NEW|") + p.cohort + "|" + p.setupType + "|" + (p.dir > 0 ? "UP" : "DOWN");
    for (const [hn, h] of Object.entries(HORIZONS)) {
      const end = addWeeks(p.registeredWeek, h);
      if (end > latest) { const k = g + "|" + hn; out.pending[k] = out.pending[k] || { events: 0, firstEvaluableWeek: end }; out.pending[k].events++; if (end < out.pending[k].firstEvaluableWeek) out.pending[k].firstEvaluableWeek = end; continue; }
      const own = pathOf(cache, o.weeklyDir, p.symbol, p.registeredBarDate, end, latest); if (!own || own.delistedOrMissing) continue;
      /* zeitgleiche Kontrollkohorte aus dem Snapshot der Registrierungswoche */
      /* Kundenprodukt-Ereignisse: Kontrolle ohne dasselbe Setup in der Produktsicht (pv), sonst in der zustandslosen Sicht */
      const setupOf = (u) => (p.view === "CUSTOMER_PRODUCT" ? u.pv && u.pv.setup : u.setup);
      const snap = snapOf(p.registeredWeek).filter((u) => u.s !== p.symbol && !(setupOf(u) && setupOf(u).id === p.setupType && setupOf(u).status === "QUALIFIED"));
      const rsTop = (u) => (p.dir > 0 ? u.rsQ >= 0.8 : u.rsQ <= 0.2), myT = p.confirmationsAtRegistration.trend, myRS = p.dir > 0 ? p.confirmationsAtRegistration.rs26Top20 : p.confirmationsAtRegistration.rs26Bottom20;
      const cell = (f) => { const v = snap.filter(f).map((u) => pathOf(cache, o.weeklyDir, u.s, u.d, end, latest)).filter((x) => x && !x.delistedOrMissing); return v.length ? { n: v.length, ret: v.reduce((a, x) => a + Math.min(x.ret, 4), 0) / v.length, k2: v.filter((x) => x.maxM >= 2).length / v.length } : null; };
      const rec = { dir: p.dir, ret: own.ret, maxM: own.maxM, mae: own.mae, ALL: cell(() => true), TREND: cell((u) => u.trend === myT), RS: cell((u) => rsTop(u) === myRS), TREND_RS: cell((u) => u.trend === myT && rsTop(u) === myRS) };
      let G = groups.get(g + "|" + hn); if (!G) groups.set(g + "|" + hn, (G = [])); G.push(rec);
    }
  }
  for (const [k, G] of groups) {
    /* richtungsbereinigt: fuer Abwaerts-Setups zaehlt der Rueckgang (dir × Rendite) */
    const ex = (c) => { const v = G.filter((x) => x[c]).map((x) => x.dir * (Math.min(x.ret, 4) - x[c].ret)); return v.length ? r4(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    out.horizons[k] = { n: G.length, meanDirectionalReturnCapped4x: r4(G.reduce((a, x) => a + x.dir * Math.min(x.ret, 4), 0) / G.length), medianReturn: r4(G.map((x) => x.ret).sort((a, b) => a - b)[Math.floor(G.length / 2)]),
      rate2x: G[0].dir > 0 ? r4(G.filter((x) => x.maxM >= 2).length / G.length) : null, excessVsAll: ex("ALL"), excessVsTrend: ex("TREND"), excessVsRs: ex("RS"), excessVsTrendRs: ex("TREND_RS"),
      note: "prospektiv, unbereinigt um Mehrfachtests; Statistik erst ab ausreichender Zahl je Gruppe" };
  }
  /* Szenario-Status aus Revisionen (Bestaetigung/Invalidation/Ziel), je Kohorte und Setup */
  const st = {}; for (const ev of events) { const k = ev.payload.cohort + "|" + ev.payload.setupType; const s = (st[k] = st[k] || { events: 0, CONFIRMED: 0, INVALIDATED: 0, TARGET_REACHED: 0, EXTENDED_PROJECTION_REACHED: 0, RELABELED: 0, EXPIRED: 0 }); s.events++;
    for (const r of revs.filter((x) => x.ref === ev.id)) s[r.payload.type] = (s[r.payload.type] || 0) + 1; }
  out.scenarioStatus = st;
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = evaluateRegistry({ weeklyDir: arg("weekly-dir"), registry: arg("registry"), asOf: arg("as-of", null) });
  mkdirSync(dirname(arg("out")), { recursive: true }); writeFileSync(arg("out"), JSON.stringify(r, null, 1) + "\n");
  console.log(`[elliott-registry evaluate] Stand ${r.asOfCompletedWeek}: ${r.events} Ereignisse, ${Object.keys(r.horizons).length} auswertbare Gruppen, ${Object.keys(r.pending).length} wartend`);
}
