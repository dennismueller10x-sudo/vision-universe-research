/* =========================================================================
   VISION UNIVERSE — scripts/quality/chart-parity.mjs

   ZEIGT DIESELBE AKTIE IN JEDER PRODUKTWELT DENSELBEN KURS?

   Anlass: Meldung 22.10.2026, die Charts seien zwischen Quant, Discover
   und Supertrader verschieden. Dieses Skript vergleicht je Aktie die
   Kursreihen, die die Welten tatsaechlich zeichnen (Bestandsaufnahme:
   docs/charts/CHART_STANDARD.md), Tag fuer Tag an identischen Stichtagen:

     DS  discover-series (270 Tagesschluesse)  Discover, Screener, Quant-Seite (ausser Golden-5)
     DL  discover-series-long (Wochenschluss)  5J/Max in Discover und Quant, Weinstein-Chart Supertrader
     TS  technical-signals-v1 (OHLCV, 270)     Supertrader-Seite und Methodenchart, Quant-Technik
     GP  golden-preview/daily (volle Historie) Quant-Seite fuer AAPL, MSFT, NVDA, JPM, XOM (RAW x splitFactor)
     TI  technical/instruments                 Discover-Detail fuer dieselben fuenf Titel
     EW  technical-intelligence/v3             Elliott/Chartbild (Wochenschluss am asOf)

   Toleranz je Paar aus der Praezision der Quellen, nicht pauschal:
     DS, DL veroeffentlicht mit roundClose (Cent ab 1 $, 4 gueltige Stellen darunter),
     TS, TI Anbieterwert (bis 4 Nachkommastellen), GP rekonstruiert (ungerundet),
     EW auf 4 Nachkommastellen gerundet.
     |a - b| <= (Einheit(a) + Einheit(b)) / 2 + 1e-9.
   Eine Woche wird nur mit demselben Handelstag verglichen (Feiertage, Luecken).

   Liest nur committete Artefakte, ruft keinen Anbieter, schreibt nur mit --out.

     node scripts/quality/chart-parity.mjs                    Matrix auf der Konsole
     node scripts/quality/chart-parity.mjs --out=PFAD.json    voller Bericht
     node scripts/quality/chart-parity.mjs --only=NVDA,AMTD   nur diese Titel
     node scripts/quality/chart-parity.mjs --strict           Exit 2 bei Datenabweichung
   ========================================================================= */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { ausgabePfad } from "./out-path.mjs";

const require = createRequire(import.meta.url);
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const Identity = require(join(REPO_ROOT, "core", "identity.js"));
const DQ = require(join(REPO_ROOT, "core", "data-quality.js"));
const History = require(join(REPO_ROOT, "core", "chart-history.js"));
const RS = require(join(REPO_ROOT, "quant", "engines", "return-series.js"));
const TSn = require(join(REPO_ROOT, "quant", "engines", "realtime", "trading-session.js"));

/* Einheit einer Quelle fuer einen Wert. */
const PROVIDER_UNIT = 0.0001;
const UNIT = { DS: DQ.closeUnit, DL: DQ.closeUnit, TS: () => PROVIDER_UNIT, TI: () => PROVIDER_UNIT, GP: () => 0, EW: (v) => Math.max(DQ.closeUnit(v), PROVIDER_UNIT) };
export function tolerance(srcA, a, srcB, b) { return (UNIT[srcA](a) + UNIT[srcB](b)) / 2 + 1e-9; }

/** Zwei Reihen [[datum, schluss]] an identischen Stichtagen im gemeinsamen Fenster.
 *  Ergebnis: verglichene Tage, Wertabweichungen, fehlende Stichtage je Seite, Niveaufaktor. */
export function comparePair(srcA, a, srcB, b) {
  if (!a.length || !b.length) return { status: "NOT_COMPARABLE", reason: "leer" };
  const from = a[0][0] > b[0][0] ? a[0][0] : b[0][0];
  const to = a[a.length - 1][0] < b[b.length - 1][0] ? a[a.length - 1][0] : b[b.length - 1][0];
  if (from > to) return { status: "NOT_COMPARABLE", reason: "kein gemeinsamer Zeitraum" };
  const mb = new Map(b), ma = new Map(a);
  let compared = 0; const bad = [], ratios = [], onlyA = [], onlyB = [];
  for (const [d, v] of a) {
    if (d < from || d > to) continue;
    if (!mb.has(d)) { onlyA.push(d); continue; }
    const w = mb.get(d); compared++;
    if (Math.abs(v - w) > tolerance(srcA, v, srcB, w)) { bad.push([d, v, w]); ratios.push(v / w); }
  }
  for (const [d] of b) if (d >= from && d <= to && !ma.has(d)) onlyB.push(d);
  let level = null;
  if (ratios.length >= Math.max(2, Math.ceil(compared * 0.8))) {
    const s = ratios.slice().sort((x, y) => x - y), med = s[Math.floor(s.length / 2)];
    if (Math.abs(med - 1) > 0.05 && ratios.every((r) => Math.abs(r / med - 1) < 0.03)) level = Number(med.toPrecision(4));
  }
  const ok = !bad.length && !onlyA.length && !onlyB.length;
  return { status: ok ? "IDENTICAL" : "DEVIATION", from, to, compared, valueMismatches: bad.length, sample: bad.slice(0, 3),
           missingInB: onlyA.slice(0, 5), missingInBCount: onlyA.length, missingInA: onlyB.slice(0, 5), missingInACount: onlyB.length,
           levelFactor: level, lastA: a[a.length - 1][0], lastB: b[b.length - 1][0] };
}

/* Woche gegen Tag: nur die Wochenpunkte, deren Tag in der Tagesreihe steht (DQ-PX-4-Logik),
   fehlende Stichtage sind hier kein Befund (Woche ist eine Auswahl). */
function compareSeam(dl, ds) {
  const c = DQ.compareDailyWeekly({ points: ds }, { points: dl });
  return c.status === "MISMATCH" ? { status: "DEVIATION", kind: c.kind, ratio: c.ratio, factor: c.factor, worst: c.worst, compared: c.compared }
    : { status: c.status === "NO_OVERLAP" ? "NOT_COMPARABLE" : "IDENTICAL", compared: c.compared };
}

const RANGES = ["1T", "1W", "1M", "1J", "5J", "MAX"];
/* Verfuegbarkeit nach Datenlage (nicht nach UI): 1T = Intraday-Snapshot der juengsten Sitzung,
   1W = mindestens 3 Tagesschluesse in 7 Tagen, 1M/1J/5J = 95-%-Abdeckung (core/chart-history.js),
   MAX = irgendeine Reihe. "SHORT" = die Aktie ist juenger als der Zeitraum (kein Fehler). */
function rangeAvailability({ daily, long, intraday, listedSince, asOf }) {
  const out = {};
  out["1T"] = intraday ? "OK" : "MISSING";
  const w = daily.filter((p) => Date.parse(p[0]) >= Date.parse(asOf) - 7 * 864e5);
  out["1W"] = w.length >= 3 ? "OK" : (daily.length ? "MISSING" : "MISSING");
  const full = long && long.length ? mergeWeekly(long, daily) : daily;
  for (const [r, k] of [["1M", "1M"], ["1J", "1Y"], ["5J", "5Y"]]) {
    if (History.available(full, k)) { out[r] = "OK"; continue; }
    const need = History.days[k] * 0.95 * 864e5;
    out[r] = listedSince && Date.parse(asOf) - Date.parse(listedSince) < need ? "SHORT" : "MISSING";
  }
  out.MAX = full.length >= 5 ? "OK" : "MISSING";
  return out;
}
function mergeWeekly(weekly, daily) {
  if (!daily.length) return weekly;
  return weekly.filter((p) => p[0] < daily[0][0]).concat(daily);
}

function readJson(p) { return JSON.parse(readFileSync(p, "utf8")); }
function readGz(p) { return JSON.parse(gunzipSync(readFileSync(p)).toString("utf8")); }

export function audit({ root = REPO_ROOT, only = null, now = new Date() } = {}) {
  const P = (...x) => join(root, ...x);
  const calendar = readJson(join(REPO_ROOT, "quant", "config", "market-calendar.json"));
  const session = TSn.resolve(now, { calendar });
  const expected = session.lastCompletedSession ? session.lastCompletedSession.sessionDate : null;
  const lag = (d) => { if (!d || !expected || d >= expected) return 0; let x = d, n = 0; while (x < expected && n < 60) { x = TSn.nextTradingDay(x, { calendar }); if (!x) return null; n++; } return n; };

  /* Supertrader- und Quant-Technik-Bars (nur Schluesse, sonst sprengt es den Speicher). */
  const TS = new Map();
  const tsDir = P("quant", "data", "product", "technical-signals-v1");
  if (existsSync(tsDir)) for (const f of readdirSync(tsDir).filter((n) => n.endsWith(".json.gz"))) {
    const j = readGz(join(tsDir, f));
    for (const [sym, inst] of Object.entries(j.instruments || {})) {
      if (only && !only.has(sym)) continue;
      const b = inst.bars || {};
      TS.set(sym, { securityId: inst.securityId, type: inst.priceSeriesType, points: (b.timestamps || []).map((t, i) => [String(t).slice(0, 10), b.close[i]]).filter((p) => p[1] > 0) });
    }
  }
  /* Elliott/Chartbild: Wochenschluss am asOf. */
  const EW = new Map();
  const ewDir = P("quant", "data", "technical-intelligence", "v3", "shards");
  if (existsSync(ewDir)) for (const f of readdirSync(ewDir).filter((n) => n.endsWith(".json.gz"))) {
    const j = readGz(join(ewDir, f));
    for (const [sym, x] of Object.entries(j.instruments || {})) {
      if (only && !only.has(sym)) continue;
      if (x && x.asOf && x.price && x.price.close > 0) EW.set(sym, { asOf: x.asOf, close: x.price.close, timeframe: x.timeframe, type: x.dataQuality && x.dataQuality.priceSeriesType });
    }
  }
  const intra = existsSync(P("quant", "data", "market", "intraday", "index.json")) ? readJson(P("quant", "data", "market", "intraday", "index.json")) : null;
  const intraSession = intra && intra.dataSession && intra.dataSession.sessionDate;
  const intraAll = new Set(intra && intraSession && intra.available && intra.available[intraSession] || []);
  const intraEntries = new Set(Object.keys((intra && intra.entries) || {}));

  const stockDir = P("discover", "data", "stocks", "US_REAL");
  const tickers = readdirSync(stockDir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter((t) => !only || only.has(t)).sort();
  const rows = [];
  for (const ticker of tickers) {
    const row = { ticker, checks: {}, sources: [], issues: [] };
    rows.push(row);
    let id; try { id = Identity.securityIdForTicker(ticker); } catch (e) { row.issues.push("IDENTITY"); continue; }
    row.securityId = id;
    const payload = readJson(join(stockDir, ticker + ".json"));
    const ser = payload.series || {};
    /* 1 Identitaet: jeder ausgelieferte Pfad zeigt auf die kanonische securityId. */
    const paths = [ser.path, ser.long && ser.long.path].filter(Boolean).filter((p) => /discover-series/.test(p));
    const idOk = paths.every((p) => p.endsWith("/" + id + ".json")) && (!TS.has(ticker) || TS.get(ticker).securityId === id);
    row.checks.identity = idOk ? "OK" : "DEVIATION";
    if (!idOk) row.issues.push("IDENTITY");

    const ds = existsSync(P("quant", "data", "market", "discover-series", id + ".json")) ? readJson(P("quant", "data", "market", "discover-series", id + ".json")) : null;
    const dl = existsSync(P("quant", "data", "market", "discover-series-long", id + ".json")) ? readJson(P("quant", "data", "market", "discover-series-long", id + ".json")) : null;
    const ts = TS.get(ticker) || null;
    const gpPath = P("quant", "data", "market", "golden-preview", "daily", id + ".json");
    const gp = existsSync(gpPath) ? readJson(gpPath) : null;
    const ti = ser.source === "technical-instrument" && ser.path && existsSync(P(ser.path.slice(1))) ? readJson(P(ser.path.slice(1))) : null;
    const ew = EW.get(ticker) || null;
    const D = ds ? ds.points : [], L = dl ? dl.points : [];
    for (const [k, v] of [["DS", ds], ["DL", dl], ["TS", ts], ["GP", gp], ["TI", ti], ["EW", ew]]) if (v) row.sources.push(k);
    if (!ds && !ts) { row.issues.push("NO_CHART"); row.ranges = rangeAvailability({ daily: [], long: L, intraday: false, listedSince: null, asOf: expected || "2000-01-01" }); continue; }

    /* 2 Kursdefinition */
    const types = [ds && ds.priceSeriesType, dl && dl.priceSeriesType, ts && ts.type, ti && ti.priceSeriesType, ew && ew.type].filter(Boolean);
    const cur = [ds && ds.currency, dl && dl.currency].filter(Boolean);
    row.checks.definition = types.every((t) => t === "SPLIT_ADJUSTED") && cur.every((c) => c === "USD") ? "OK" : "DEVIATION";
    if (row.checks.definition !== "OK") row.issues.push("DEFINITION");

    /* 3-5 Zeitstempel, Werte, Bereinigung je Paar */
    const pairs = {};
    if (ds && ts) pairs["DS~TS"] = comparePair("DS", D, "TS", ts.points);
    if (ds && gp) { const adj = RS.splitAdjustedColumn(gp.bars, "close"); pairs["DS~GP"] = comparePair("DS", D, "GP", gp.bars.map((b, i) => [b.date, adj[i]])); }
    if (ds && ti) { const b = ti.bars; pairs["DS~TI"] = comparePair("DS", D, "TI", b.timestamps.map((t, i) => [String(t).slice(0, 10), b.close[i]])); }
    /* 7 Nahtstelle Tag/Woche */
    if (ds && dl) pairs["DL~DS"] = compareSeam(L, D);
    if (dl && ts) pairs["DL~TS"] = compareSeam(L, ts.points);
    /* Elliott: Schluss am asOf gegen die Reihe derselben Aufloesung - Wochenmodus gegen die
       Wochenreihe, Tagesmodus (Golden-5) gegen die Tagesreihe. */
    const ewDaily = ew && ew.timeframe === "1D";
    if (ew && (ewDaily ? ds : dl)) {
      const key = ewDaily ? "EW~DS" : "EW~DL", ref = ewDaily ? "DS" : "DL";
      const w = new Map(ewDaily ? D : L).get(ew.asOf);
      pairs[key] = w === undefined ? { status: "NOT_COMPARABLE", reason: "asOf " + ew.asOf + " nicht in der Reihe" }
        : Math.abs(ew.close - w) <= tolerance("EW", ew.close, ref, w) ? { status: "IDENTICAL", compared: 1 }
        : { status: "DEVIATION", asOf: ew.asOf, elliott: ew.close, reference: w, ratio: Number((w / ew.close).toPrecision(4)) };
    }
    row.pairs = pairs;
    for (const [k, c] of Object.entries(pairs)) {
      if (c.status !== "DEVIATION") continue;
      if (c.levelFactor || c.kind === "LEVEL" || (k.startsWith("EW~") && Math.abs(c.ratio - 1) > 0.05)) row.issues.push("CORPORATE_ACTION:" + k);
      else if (c.valueMismatches || c.kind === "POINT" || k.startsWith("EW~")) row.issues.push("VALUE:" + k);
      else row.issues.push("TIMESTAMPS:" + k);
    }
    /* 6/8 Zeitraeume nach Datenlage, je Welt */
    const asOf = (ds && ds.to) || (ts && ts.points.length && ts.points[ts.points.length - 1][0]);
    const listedSince = (dl && dl.from) || (gp && gp.first) || (ds && ds.from);
    const longest = gp ? gp.bars.map((b) => [b.date, b.close]) : D;
    /* Datenlage gemeinsam (was irgendeine Welt aus vorhandenen Artefakten zeichnen koennte) und je Welt,
       wie sie heute laedt: Supertrader nur die 270 Bars des Shards, 1T nur ueber entries (supertrader.js#intradaySnap). */
    row.ranges = {
      data: rangeAvailability({ daily: longest, long: L, intraday: intraAll.has(ticker) || intraEntries.has(ticker), listedSince, asOf }),
      discover: rangeAvailability({ daily: ti ? D : D, long: L, intraday: intraAll.has(ticker) || intraEntries.has(ticker), listedSince, asOf }),
      quant: rangeAvailability({ daily: longest, long: L, intraday: intraAll.has(ticker) || intraEntries.has(ticker), listedSince, asOf }),
      supertrader: ts ? rangeAvailability({ daily: ts.points, long: null, intraday: intraEntries.has(ticker), listedSince, asOf }) : null
    };
    if (Object.values(row.ranges.data).includes("MISSING")) row.issues.push("RANGES");
    /* 9 Aktualitaet */
    row.lag = lag(asOf);
    if (row.lag !== null && row.lag >= 2) row.issues.push("STALE");
    if (!ts) row.issues.push("NOT_IN_SUPERTRADER");
  }
  return summarize(rows, { expected, intraSession, intraAll: intraAll.size, intraEntries: intraEntries.size, root });
}

function summarize(rows, meta) {
  const has = (r, p) => r.issues.some((i) => i.startsWith(p));
  /* Kursfehler: falscher Wert, falsches Niveau, falsche Identitaet oder Definition.
     Datenluecke: gleiche Kurse, aber ein Handelstag fehlt in einer Quelle (sichtbar kaum, trotzdem Befund). */
  const dataDev = rows.filter((r) => has(r, "VALUE") || has(r, "CORPORATE_ACTION") || has(r, "IDENTITY") || has(r, "DEFINITION"));
  const gaps = rows.filter((r) => has(r, "TIMESTAMPS") && !dataDev.includes(r));
  const cross = rows.filter((r) => r.pairs && Object.values(r.pairs).some((c) => c.status !== "NOT_COMPARABLE"));
  const parity = cross.filter((r) => !dataDev.includes(r) && !gaps.includes(r));
  const nonComparable = rows.filter((r) => !cross.includes(r) && !has(r, "NO_CHART"));
  const count = (f) => rows.filter(f).length;
  const pairStats = {};
  for (const r of rows) for (const [k, c] of Object.entries(r.pairs || {})) {
    const s = pairStats[k] ||= { compared: 0, identical: 0, deviation: 0, notComparable: 0 };
    s.compared++; s[c.status === "IDENTICAL" ? "identical" : c.status === "DEVIATION" ? "deviation" : "notComparable"]++;
  }
  const rangeStats = {};
  for (const r of rows) for (const [world, rr] of Object.entries(r.ranges || {})) {
    if (!rr || typeof rr !== "object" || !("1T" in rr)) continue;
    const w = rangeStats[world] ||= {};
    for (const [k, v] of Object.entries(rr)) { w[k] ||= { OK: 0, SHORT: 0, MISSING: 0 }; w[k][v]++; }
  }
  const nonCompCauses = {};
  for (const r of nonComparable) {
    const why = !r.sources.includes("TS") && !r.sources.includes("DL") ? "nur Tagesreihe (kein Supertrader-Bundle, keine Wochenreihe)" : "keine gemeinsame Zeitspanne";
    nonCompCauses[why] = (nonCompCauses[why] || 0) + 1;
  }
  return {
    schemaVersion: "chart-parity-1.0.0",
    meta,
    matrix: {
      total: rows.length,
      fullParity: parity.length,
      dataDeviations: dataDev.length,
      dataGaps: gaps.length,
      missingRanges: count((r) => has(r, "RANGES")),
      noChart: count((r) => has(r, "NO_CHART")),
      corporateActionErrors: count((r) => has(r, "CORPORATE_ACTION")),
      nonComparable: nonComparable.length,
      nonComparableCauses: nonCompCauses,
      stale: count((r) => has(r, "STALE")),
      notInSupertrader: count((r) => has(r, "NOT_IN_SUPERTRADER"))
    },
    pairs: pairStats,
    ranges: rangeStats,
    deviations: dataDev.concat(gaps).map((r) => ({ ticker: r.ticker, issues: r.issues, pairs: Object.fromEntries(Object.entries(r.pairs || {}).filter(([, c]) => c.status === "DEVIATION")) })),
    rows: rows.map((r) => ({ ticker: r.ticker, sources: r.sources, issues: r.issues, lag: r.lag, ranges: r.ranges }))
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (n, f) => { const h = argv.find((a) => a.startsWith(n + "=")); return h ? h.slice(n.length + 1) : f; };
  const root = arg("--root", REPO_ROOT);
  const onlyArg = arg("--only", "");
  const only = onlyArg ? new Set(onlyArg.split(",").map((t) => t.trim().toUpperCase())) : null;
  const r = audit({ root, only, now: arg("--now", null) ? new Date(arg("--now")) : new Date() });
  const m = r.matrix;
  console.log(`Chart-Paritaet (${r.meta.expected ? "Sitzung " + r.meta.expected : "ohne Kalender"})\n`);
  console.log("| Kennzahl | Ergebnis |\n|---|---|");
  for (const [k, v] of [["Aktien insgesamt", m.total], ["Aktien mit vollständiger Chart-Parität", m.fullParity], ["Aktien mit Kursabweichungen", m.dataDeviations], ["Aktien mit Datenlücken (fehlender Handelstag)", m.dataGaps],
    ["Aktien mit fehlenden Zeiträumen (Datenlage)", m.missingRanges], ["Aktien ohne verfügbare Charts", m.noChart], ["Corporate-Action-Fehler", m.corporateActionErrors],
    ["Nicht vergleichbare Aktien", m.nonComparable + " " + JSON.stringify(m.nonComparableCauses)], ["Veraltet (≥ 2 Sitzungen)", m.stale], ["Ohne Supertrader-Bars", m.notInSupertrader]]) console.log(`| ${k} | ${v} |`);
  console.log("\nPaare:"); for (const [k, s] of Object.entries(r.pairs)) console.log(`  ${k.padEnd(6)} ${JSON.stringify(s)}`);
  console.log("\nZeitraeume nach Datenlage:"); for (const [w, s] of Object.entries(r.ranges)) console.log(`  ${w.padEnd(11)} ` + RANGES.map((k) => `${k} ${s[k] ? s[k].OK + "/" + s[k].SHORT + "/" + s[k].MISSING : "-"}`).join("  ") + "   (OK/kurz/fehlt)");
  if (r.deviations.length) { console.log("\nAbweichungen:"); for (const d of r.deviations.slice(0, 40)) console.log(`  ${d.ticker.padEnd(8)} ${d.issues.join(" ")}`); }
  const out = ausgabePfad(root, arg("--out", null));
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), ...r }, null, 1) + "\n"); }
  if (argv.includes("--strict") && m.dataDeviations) process.exit(2); /* Datenluecken allein blockieren nicht */
}
