#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/build-market-pulse.mjs

   Baut den deskriptiven Market Pulse aus vorhandenen kanonischen Daten:
     - Multi-Asset-Reihen (Tracker, Renditen, Gold, Oel, Bitcoin)
     - EZB-Referenzkurs EUR/USD (Currency Core)
     - Faktorzeilen des Aktienuniversums (Marktbreite)
     - Intraday-Snapshots der letzten zwei Sitzungen (steigend/fallend, Movers)

   Kein Anbieterabruf, keine neue Pipeline, keine zweite Datenhaltung:
   gelesen wird ausschliesslich, was im Repository liegt.

     node scripts/market/build-market-pulse.mjs            -> quant/data/market/intelligence/market-pulse.json
     node scripts/market/build-market-pulse.mjs --calibrate -> .../market-pulse-calibration.json
     --stdout: nur ausgeben, nichts schreiben
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MP = require(join(root, "quant/engines/multi-asset/market-pulse.js"));
const args = new Set(process.argv.slice(2));
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const CFG = read("quant/config/market-pulse.json");
const OUT_DIR = "quant/data/market/intelligence";

const seriesOf = (sym) => read(`quant/data/market/multi-asset/series/${sym}.json`).points;
function trackerNames() {
  const snap = read("quant/data/market/multi-asset/snapshot.json");
  const n = {};
  for (const c of snap.instruments) if (c.tracker) n[c.instrument.symbol] = c.tracker.displayMarketName;
  return n;
}
function daysBefore(iso, days) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); }
/* Beobachtungen im Kalenderfenster - Krypto hat sieben Tage, Aktien fuenf. */
function obsWithin(points, days) { const from = daysBefore(points[points.length - 1][0], days); return points.filter((p) => p[0] > from).length; }
function write(rel, obj) {
  if (args.has("--stdout")) { console.log(JSON.stringify(obj, null, 1)); return; }
  mkdirSync(join(root, dirname(rel)), { recursive: true });
  writeFileSync(join(root, rel), JSON.stringify(obj, null, 1) + "\n");
  console.log("geschrieben:", rel);
}

/* ------------------------------------------------------------ Kalibrierung */

function percentile(sorted, p) { return sorted[Math.floor((p / 100) * (sorted.length - 1))]; }
const r1 = (x) => Math.round(x * 10) / 10;

function calibrate() {
  const spy = seriesOf(CFG.risk.benchmark);
  const vols = [];
  for (let i = 21; i < spy.length; i++) {
    const s = MP.seriesSignals(spy.slice(i - 21, i + 1));
    if (s && s.vol20 !== null) vols.push({ date: spy[i][0], v: s.vol20 });
  }
  const sorted = vols.map((x) => x.v).sort((a, b) => a - b);
  const vol20 = {
    calibratedFrom: vols[0].date, calibratedTo: vols[vols.length - 1].date, samples: vols.length,
    median: r1(percentile(sorted, 50)), p75: r1(percentile(sorted, 75)), p90: r1(percentile(sorted, 90)), p95: r1(percentile(sorted, 95))
  };

  /* Historische Zustaende an gemeinsamen Handelstagen aller Tracker (woechentlich). */
  const syms = CFG.trackers.symbols;
  const all = Object.fromEntries(syms.map((s) => [s, seriesOf(s)]));
  const idx = Object.fromEntries(syms.map((s) => [s, new Map(all[s].map((p, i) => [p[0], i]))]));
  const riskCfg = { vol20: { ...CFG.risk.vol20, elevated: vol20.p75, high: vol20.p90 }, drawdown: CFG.risk.drawdown };
  function stateAt(date) {
    const sigs = {};
    for (const s of syms) {
      const i = idx[s].get(date);
      if (i === undefined || i < 260) return null;
      sigs[s] = MP.seriesSignals(all[s].slice(i - 260, i + 1));
    }
    return {
      trend: MP.trend(sigs, {}, CFG.trend).state,
      momentum: MP.momentum(sigs, {}).state,
      risk: MP.risk(sigs[CFG.risk.benchmark], riskCfg, "").state
    };
  }
  const dates = all[syms[0]].map((p) => p[0]).filter((d) => syms.every((s) => idx[s].has(d)));
  const freq = { trend: {}, momentum: {}, risk: {} };
  let n = 0;
  for (let i = 0; i < dates.length; i += 5) {
    const st = stateAt(dates[i]);
    if (!st) continue;
    n++;
    for (const k of Object.keys(freq)) freq[k][st[k]] = (freq[k][st[k]] || 0) + 1;
  }
  const share = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round((1000 * v) / n) / 10]));

  /* Plausibilitaet in bekannten Phasen - Pruefung, keine Optimierung. */
  const PHASES = [
    { date: "2002-10-09", phase: "Tief des Baerenmarkts 2000-2002", expect: { trend: "NEGATIVE" } },
    { date: "2008-10-15", phase: "Finanzkrise", expect: { trend: "NEGATIVE", risk: "HIGH" } },
    { date: "2009-03-09", phase: "Tief der Finanzkrise", expect: { trend: "NEGATIVE", risk: "HIGH" } },
    { date: "2010-01-15", phase: "Erholung nach der Finanzkrise", expect: { trend: "POSITIVE" } },
    { date: "2013-11-15", phase: "Ruhiger Aufwaertstrend", expect: { trend: "POSITIVE", risk: "NORMAL" } },
    { date: "2017-06-15", phase: "Niedrige Volatilitaet", expect: { trend: "POSITIVE", risk: "NORMAL" } },
    { date: "2018-12-24", phase: "Korrektur Q4 2018", expect: { trend: "NEGATIVE", risk: "HIGH" } },
    { date: "2020-03-20", phase: "Corona-Crash", expect: { trend: "NEGATIVE", risk: "HIGH" } },
    { date: "2020-08-31", phase: "Erholung 2020", expect: { trend: "POSITIVE" } },
    { date: "2021-11-15", phase: "Hoch 2021", expect: { trend: "POSITIVE", risk: "NORMAL" } },
    { date: "2022-06-16", phase: "Baerenmarkt 2022", expect: { trend: "NEGATIVE", risk: "HIGH" } },
    { date: "2023-12-15", phase: "Erholung 2023", expect: { trend: "POSITIVE" } }
  ];
  const phases = PHASES.map((ph) => {
    const d = dates.find((x) => x >= ph.date);
    const st = d ? stateAt(d) : null;
    const checks = Object.entries(ph.expect).map(([k, v]) => ({ dimension: k, expected: v, observed: st ? st[k] : null, pass: !!st && st[k] === v }));
    return { ...ph, observedOn: d || null, observed: st, pass: checks.every((c) => c.pass), checks };
  });

  return {
    schemaVersion: "vu-market-pulse-calibration-1.0.0", methodVersion: MP.METHOD_VERSION,
    generatedFrom: Object.fromEntries(syms.map((s) => [s, { from: all[s][0][0], to: all[s][all[s].length - 1][0] }])),
    purpose: "Plausibilisierung und Kalibrierung, keine Optimierung auf Rendite. Keine Vorwaertsrenditen, keine Prognose.",
    risk: { vol20, drawdown: CFG.risk.drawdown },
    stateFrequency: { sampledEvery: "5 Handelstage", samples: n, from: dates.find((d) => stateAt(d)), to: dates[dates.length - 1],
                      trend: share(freq.trend), momentum: share(freq.momentum), risk: share(freq.risk) },
    phases, phasesPassed: phases.filter((p) => p.pass).length, phasesTotal: phases.length,
    factorOverlap: [
      { between: ["TREND", "MOMENTUM"], note: "Lage zur 200-Tage-Linie und 6-Monats-Rendite sind stark korreliert. MOMENTUM fliesst deshalb nicht in die Schlagzeile ein." },
      { between: ["TREND", "RISK"], note: "Der Abstand zum 52-Wochen-Hoch (RISK) haengt mit der Trendlage zusammen; RISK ergaenzt die Schlagzeile nur bei erhoehter Stufe." },
      { between: ["BREADTH", "TREND"], note: "Unabhaengige Grundgesamtheit (Einzelaktien statt Tracker); gleiche Methode (gleitende Durchschnitte) - Richtungen koennen und sollen auseinanderlaufen." }
    ],
    breadth: { state: "NOT_CALIBRATED", reason: CFG.breadth.calibrationNote }
  };
}

/* ------------------------------------------------------------ Marktbreite */

function breadthInput(expectedAsOf) {
  const f = read("quant/data/market/factors/factors-FULL_UNIVERSE.json");
  const types = new Set(CFG.breadth.universe.instrumentTypes);
  const rows = f.securities.filter((s) => types.has(s.instrumentType));
  const cnt = (field, pred) => {
    let matched = 0, evaluated = 0;
    for (const s of rows) {
      const v = s.values && s.values[field];
      if (v === null || v === undefined || (s.fieldStatus && s.fieldStatus[field] && s.fieldStatus[field] !== "CALCULATED")) continue;
      evaluated++;
      if (pred(v)) matched++;
    }
    return { matched, evaluated };
  };
  const asOfCount = {};
  for (const s of rows) asOfCount[s.asOf] = (asOfCount[s.asOf] || 0) + 1;
  const asOf = Object.entries(asOfCount).sort((a, b) => b[1] - a[1])[0][0];
  const lows = cnt("distanceTo52wLow", (v) => v <= 0);
  return {
    rows,
    input: {
      universe: { label: CFG.breadth.universe.label, size: rows.length, source: "quant/data/market/factors/factors-FULL_UNIVERSE.json", generatedAt: f.generatedAt },
      asOf, expectedAsOf,
      above50: cnt("priceAboveSMA50", (v) => v === true),
      above200: cnt("priceAboveSMA200", (v) => v === true),
      newHighs: (() => { const c = cnt("newHigh52w", (v) => v === true); return { count: c.matched, evaluated: c.evaluated }; })(),
      newLows: { count: lows.matched, evaluated: lows.evaluated }
    }
  };
}

/* ------------------------------------------- Intraday: steigend/fallend, Movers */

function lastRegular(snap) {
  const pts = (snap.points || []).filter((p) => Array.isArray(p) && typeof p[1] === "number" && p[1] > 0);
  return pts.length ? pts[pts.length - 1][1] : null;
}
function intradayMoves(factorRows) {
  const ix = read("quant/data/market/intraday/index.json");
  const sessions = Object.keys(ix.sessions || {}).sort();
  if (sessions.length < 2) return null;
  const cur = sessions[sessions.length - 1], prev = sessions[sessions.length - 2];
  const discover = new Set(read("discover/data/stock-index/US_REAL.json").symbols);
  let adv = 0, dec = 0, unch = 0, complete = 0, asOf = null;
  const moves = [];
  for (const s of factorRows) {
    const pa = join(root, "quant/data/market/intraday", prev, s.securityId + ".json");
    const ca = join(root, "quant/data/market/intraday", cur, s.securityId + ".json");
    if (!existsSync(pa) || !existsSync(ca)) continue;
    const p = JSON.parse(readFileSync(pa, "utf8")), c = JSON.parse(readFileSync(ca, "utf8"));
    if (!p.regularComplete || p.dataMode !== "real" || c.dataMode !== "real") continue;
    const a = lastRegular(p), b = lastRegular(c);
    if (!a || !b) continue;
    const ch = 100 * (b / a - 1);
    if (ch > 0) adv++; else if (ch < 0) dec++; else unch++;
    if (c.regularComplete) complete++;
    if (!asOf || c.asOf > asOf) asOf = c.asOf;
    if (discover.has(s.ticker)) moves.push({ ticker: s.ticker, change: ch, last: b });
  }
  const evaluated = adv + dec + unch;
  /* Liquiditaet aus den Discover-Titeln (Dollarumsatz 20 Tage). */
  const M = CFG.movers;
  const liquid = moves.filter((m) => m.last >= M.minPrice).map((m) => {
    const p = join(root, "discover/data/stocks/US_REAL", m.ticker + ".json");
    if (!existsSync(p)) return null;
    const d = JSON.parse(readFileSync(p, "utf8"));
    const dv = d.qualification && d.qualification.avgDollarVolume20d;
    if (!(dv >= M.minAvgDollarVolume20d)) return null;
    return { symbol: m.ticker, name: d.companyName || m.ticker, changePercent: Math.round(m.change * 100) / 100 };
  }).filter(Boolean);
  liquid.sort((x, y) => y.changePercent - x.changePercent || (x.symbol < y.symbol ? -1 : 1));
  return {
    advDecl: { advancers: adv, decliners: dec, unchanged: unch, evaluated, session: cur, previousSession: prev,
               complete: evaluated > 0 && complete / evaluated >= 0.9, asOf },
    movers: {
      session: cur, previousSession: prev, complete: evaluated > 0 && complete / evaluated >= 0.9, asOf,
      universe: M.universe, filter: { minAvgDollarVolume20d: M.minAvgDollarVolume20d, minPrice: M.minPrice }, eligible: liquid.length,
      gainers: liquid.slice(0, M.count),
      losers: liquid.slice(-M.count).reverse(),
      method: M.note
    }
  };
}

/* ------------------------------------------------------------------ Build */

function build() {
  const names = trackerNames();
  const syms = CFG.trackers.symbols;
  const sigs = Object.fromEntries(syms.map((s) => [s, MP.seriesSignals(seriesOf(s))]));
  const expectedAsOf = sigs[CFG.risk.benchmark].asOf;

  const ca = {};
  for (const [k, a] of Object.entries(CFG.crossAsset.assets)) {
    const pts = a.path ? read(a.path).points : seriesOf(a.symbol);
    const k1 = obsWithin(pts, CFG.crossAsset.horizonCalendarDays);
    const win = obsWithin(pts, 365 * CFG.crossAsset.windowYears);
    ca[k] = MP.moveRatio(pts, k1, a.kind, win);
    if (ca[k]) ca[k].symbol = a.symbol;
  }

  const br = breadthInput(expectedAsOf);
  const intra = intradayMoves(br.rows);
  if (intra) br.input.advDecl = intra.advDecl;

  const dims = {
    TREND: MP.trend(sigs, names, CFG.trend),
    BREADTH: MP.breadth(br.input),
    MOMENTUM: MP.momentum(sigs, names),
    RISK: MP.risk(sigs[CFG.risk.benchmark], CFG.risk, names[CFG.risk.benchmark] ? names[CFG.risk.benchmark] + "-Tracker " + CFG.risk.benchmark : CFG.risk.benchmark),
    CROSS_ASSET: MP.crossAsset(ca, CFG.crossAsset)
  };
  return {
    schemaVersion: "vu-market-pulse-1.0.0",
    methodVersion: MP.METHOD_VERSION,
    configVersion: CFG.schemaVersion,
    generatedAt: new Date().toISOString(),
    kind: "DESCRIPTIVE_MARKET_PULSE",
    notes: {
      quantMarketRegime: "FAIL_CLOSED - nicht verwendet, nicht imitiert",
      macroRegime: "NOT_CERTIFIED",
      score: "Kein Gesamtscore. Jede Aussage entsteht aus einer dokumentierten Regel.",
      forecast: "Beschreibung des beobachteten Zustands, keine Prognose, keine Anlageberatung."
    },
    headline: MP.headline(dims),
    dimensions: dims,
    dimensionStates: Object.fromEntries(Object.entries(dims).map(([k, d]) => [k, d.state])),
    movers: intra ? intra.movers : { state: "UNAVAILABLE", reason: "Weniger als zwei Intraday-Sitzungen im Core." },
    sectors: CFG.sectors,
    inputs: {
      trackers: Object.fromEntries(syms.map((s) => [s, { asOf: sigs[s].asOf, observations: sigs[s].observations, path: `/quant/data/market/multi-asset/series/${s}.json` }])),
      crossAsset: Object.fromEntries(Object.entries(ca).map(([k, v]) => [k, v ? { symbol: v.symbol, asOf: v.to, horizon: v.horizon, samples: v.samples } : null])),
      breadth: { asOf: br.input.asOf, expectedAsOf, universeSize: br.input.universe.size, source: br.input.universe.source },
      intraday: intra ? { session: intra.advDecl.session, previousSession: intra.advDecl.previousSession, asOf: intra.advDecl.asOf } : null
    }
  };
}

if (args.has("--calibrate")) write(join(OUT_DIR, "market-pulse-calibration.json"), calibrate());
else write(join(OUT_DIR, "market-pulse.json"), build());
