#!/usr/bin/env node
/* =========================================================================
   VISION UNIVERSE — scripts/market/validate-market-pulse.mjs

   Historische Validierung der Markt-Einordnung. Liest nur, was im
   Repository liegt; ruft keinen Anbieter ab. Schreibt:
     docs/market-validation/market-pulse-validation.json   (intern)
     quant/data/market/validation/market-pulse-evidence.json (Auszug fuer die Seite)
   (unter docs/: gehoert nicht zur veroeffentlichten Seite, siehe
   scripts/vu2/build-release.mjs permitted())

   Status: NOT_CERTIFIED. Die Ergebnisse sind eine interne Pruefung der
   Aussagekraft, keine Renditeaussage und keine Produktanzeige.

   Datengrundlagen (jede nur, wenn vorhanden):
     A  Tracker im Repository (SPY, QQQ, DIA, IWM; Kurs ohne Ausschuettungen), ab 2001
     B  Kenneth-French-Datenbibliothek (US-Gesamtmarkt und Portfolios inkl.
        Ausschuettungen, Branchen-Breite als Naeherung), ab 1926
     C  Makro-Zusatzpruefung (Zinskurve aus dem Repository, Sahm-Regel in
        Echtzeit aus FRED) - verbessert eine Makro-Bedingung die Einordnung?

     node scripts/market/validate-market-pulse.mjs [--stdout]
   ========================================================================= */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pointInTimeStates, forwardOutcomes, evaluate, exposureIllustration, frequencies, MP, PR, round } from "./lib/market-validation.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = new Set(process.argv.slice(2));
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const abs = (p) => (p.startsWith("/") ? p : join(root, p));
const readOptional = (p) => (existsSync(abs(p)) ? JSON.parse(readFileSync(abs(p), "utf8")) : null);
const CFG = read("quant/config/market-pulse.json");
const LEVELS = CFG.environment.levels.map((l) => l.label);
const OUT = "docs/market-validation/market-pulse-validation.json";
/* Rohquellen liegen nur lokal bzw. im Runner (docs/market-validation/sources
   ist per .gitignore ausgeschlossen): das Repository ist oeffentlich, und die
   French-Daten beruhen auf lizenzierten CRSP-Daten. Eingecheckt wird nur die
   aggregierte Auswertung. */
const SRC = process.env.MV_SOURCES || "docs/market-validation/sources";

const HORIZONS = [21, 63, 126];
const HORIZON_LABEL = { 21: "1 Monat", 63: "3 Monate", 126: "6 Monate" };

/* ------------------------------------------------ A: Tracker im Repository */
function studyRepository() {
  const syms = CFG.trackers.symbols;
  const trackers = Object.fromEntries(syms.map((s) => [s, read(`quant/data/market/multi-asset/series/${s}.json`).points]));
  const states = pointInTimeStates({ trackers, benchmark: CFG.risk.benchmark, cfg: CFG, volFrom: CFG.risk.vol20.calibratedFrom });
  const bench = trackers[CFG.risk.benchmark];
  const outcomes = forwardOutcomes(bench, HORIZONS, 1);
  return {
    id: "A_REPOSITORY_TRACKERS",
    title: "Tracker im Repository, ab " + states[0].date.slice(0, 4),
    data: {
      trackers: syms, benchmark: CFG.risk.benchmark, priceType: "Kurs ohne Ausschüttungen (split-bereinigt)",
      source: "quant/data/market/multi-asset/series/*.json (Tiingo, lizenzierter Pfad)", breadth: "nicht rekonstruierbar – Stufe 4 kommt nicht vor"
    },
    from: states[0].date, to: states[states.length - 1].date,
    frequencies: frequencies(states, LEVELS),
    evaluation: evaluate(states, outcomes, { horizons: HORIZONS, levels: LEVELS, periods: [
      { id: "2001-2009", from: "2001-01-01", to: "2009-12-31" }, { id: "2010-2019", from: "2010-01-01", to: "2019-12-31" },
      { id: "2020-heute", from: "2020-01-01", to: "2099-12-31" }] }),
    illustration: [1, 2].map((minLevel) => exposureIllustration(states, bench, { minLevel })),
    _states: states
  };
}

/* ------------------------------------------------ B: Kenneth-French-Daten */
function studyFrench() {
  const f = readOptional(`${SRC}/french-daily.json`);
  if (!f) return { id: "B_FRENCH_1926", state: "DATA_MISSING", note: "Quelldaten fehlen – Workflow »Markt-Validierung: Quelldaten« ausführen." };
  /* Gesamtmarkt (inkl. Ausschuettungen) in der Rolle von SPY und als
     Referenz fuer RISK; drei Groessen-/Stil-Portfolios in den Rollen der
     uebrigen drei Tracker (Naeherung, siehe data.roles). Die Regel "drei
     von vier" bleibt damit unveraendert. */
  const roles = Object.entries(f.trackerRoles || {});
  if (roles.length !== CFG.trackers.symbols.length - 1 || roles.some(([, key]) => !Array.isArray(f.series[key])))
    throw new Error("french-daily.json: trackerRoles muss " + (CFG.trackers.symbols.length - 1) + " Reihen aus series benennen");
  const use = { MARKET: f.series.MARKET, ...Object.fromEntries(roles.map(([role, key]) => [role, f.series[key]])) };
  const breadthIdx = f.industryBreadth ? new Map(f.industryBreadth.map((b) => [b.date, b])) : null;
  const breadthAt = breadthIdx ? (d) => { const b = breadthIdx.get(d); if (!b) return null;
    return b.above50Pct > 50 && b.above200Pct > 50 ? "BROAD" : b.above50Pct < 50 && b.above200Pct < 50 ? "NARROW" : "MIXED"; } : null;
  const run = (withBreadth) => pointInTimeStates({ trackers: use, benchmark: "MARKET", cfg: CFG, volFrom: f.series.MARKET[0][0], minVolSamples: 756,
                                                  breadthAt: withBreadth ? breadthAt : null });
  const cashDaily = f.riskFreeDaily ? new Map(f.riskFreeDaily) : null;
  const outcomes = forwardOutcomes(f.series.MARKET, HORIZONS, 1);
  const periods = [
    { id: "1927-1945", from: "1927-01-01", to: "1945-12-31" }, { id: "1946-1972", from: "1946-01-01", to: "1972-12-31" },
    { id: "1973-2000 (vor Regelentwurf-Daten)", from: "1973-01-01", to: "2000-12-31" }, { id: "2001-heute", from: "2001-01-01", to: "2099-12-31" }];
  const variants = [false, true].filter((b) => !b || breadthAt).map((withBreadth) => {
    const states = run(withBreadth);
    return {
      variant: withBreadth ? "MIT_BRANCHEN_BREITE" : "OHNE_BREITE",
      from: states[0].date, to: states[states.length - 1].date,
      frequencies: frequencies(states, LEVELS),
      evaluation: evaluate(states, outcomes, { horizons: HORIZONS, levels: LEVELS, periods }),
      illustration: [1, 2].map((minLevel) => exposureIllustration(states, f.series.MARKET, { minLevel, cashDaily })),
      outOfSample: evaluate(states.filter((s) => s.date < "2001-01-01"), outcomes, { horizons: HORIZONS, levels: LEVELS }).byHorizon,
      /* Dieselbe Veranschaulichung nur ab 2001 - damit die Seite nicht nur
         den guenstigen Gesamtzeitraum zeigt. */
      recentIllustration: [1, 2].map((minLevel) => exposureIllustration(states.filter((s) => s.date >= "2001-01-01"), f.series.MARKET, { minLevel, cashDaily })),
      _states: states
    };
  });
  return {
    id: "B_FRENCH_1926", title: "Kenneth-French-Datenbibliothek, US-Markt ab 1926",
    data: { source: f.source, citation: f.citation, retrievedAt: f.retrievedAt, roles: f.trackerRoleNotes,
            priceType: "Gesamtrendite inklusive Ausschüttungen", breadth: f.industryBreadthNote },
    note: "Die Regeln wurden 2026 in Kenntnis der Jahre ab 2001 formuliert (nicht auf Rendite optimiert). Die Jahre vor 2001 sind für sie echte Außer-Stichproben-Daten.",
    variants,
    _bench: f.series.MARKET
  };
}

/* ------------------------------------------------ C: Makro-Zusatzpruefung */
function studyMacro(base, states, bench, suffix) {
  const outcomes = forwardOutcomes(bench, HORIZONS, 1);
  const tests = [];
  /* C1 Zinskurve 10J-2J aus dem Repository (US-Treasury, Marktdaten, nicht revidiert). */
  const y10 = readOptional("quant/data/market/multi-asset/series/US10Y.json"), y2 = readOptional("quant/data/market/multi-asset/series/US2Y.json");
  if (y10 && y2) {
    const m2 = new Map(y2.points);
    const curve = new Map(y10.points.filter((p) => m2.has(p[0])).map((p) => [p[0], p[1] - m2.get(p[0])]));
    tests.push(macroCondition("ZINSKURVE_INVERTIERT", "Zinskurve 10 Jahre minus 2 Jahre unter null (US-Treasury, Tageswert)", states, outcomes,
      lastKnown(curve), (v) => v < 0, "quant/data/market/multi-asset/series/US10Y.json, US2Y.json"));
  }
  /* C2 Sahm-Regel in Echtzeit (FRED SAHMREALTIME: aus der jeweils veroeffentlichten Arbeitslosenquote). */
  const sahm = readOptional(`${SRC}/fred-sahmrealtime.json`);
  if (sahm) {
    /* Monatswert gilt erst nach Veroeffentlichung: konservativ ab dem 10. des Folgemonats. */
    const avail = new Map(sahm.points.map(([d, v]) => { const t = new Date(d + "T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() + 1); t.setUTCDate(10); return [t.toISOString().slice(0, 10), v]; }));
    tests.push(macroCondition("SAHM_REGEL", "Sahm-Regel in Echtzeit mindestens 0,5 (steigende Arbeitslosigkeit)", states, outcomes,
      lastKnown(avail), (v) => v >= 0.5, "FRED SAHMREALTIME (https://fred.stlouisfed.org/series/SAHMREALTIME), verfügbar ab dem 10. des Folgemonats angenommen"));
  }
  /* C3 Zinskurve 10J-3M aus FRED (laengere Historie). */
  const t10y3m = readOptional(`${SRC}/fred-t10y3m.json`);
  if (t10y3m) {
    tests.push(macroCondition("ZINSKURVE_10J_3M_INVERTIERT", "Zinskurve 10 Jahre minus 3 Monate unter null (FRED T10Y3M, Tageswert)", states, outcomes,
      lastKnown(new Map(t10y3m.points)), (v) => v < 0, "FRED T10Y3M (https://fred.stlouisfed.org/series/T10Y3M)"));
  }
  /* Mehrfachtests ueber alle Bedingungen und Stufen dieser Studie. */
  const all = tests.flatMap((t) => t.perLevel.filter((l) => l.p !== null));
  const bh = PR.benjaminiHochberg(all.map((l) => l.p), 0.05);
  all.forEach((l, i) => { l.significantAfterBH = !!bh.passing[i]; });
  return { id: "C_MACRO_" + suffix, correction: "Benjamini-Hochberg bei 5 % über " + all.length + " Vergleiche (Stufe × Bedingung, deutlicher Rückgang)", title: "Makro-Zusatzprüfung auf Grundlage " + base, basis: base,
           question: "Unterscheiden sich die Folgephasen innerhalb derselben Einordnungsstufe, je nachdem ob die Makro-Bedingung erfüllt ist? Nur dann trägt Makro zusätzliche Information.",
           tests, missing: [!sahm && "FRED SAHMREALTIME", !t10y3m && "FRED T10Y3M"].filter(Boolean) };
}

/* Wert, der am Tag d bekannt war (letzter Eintrag <= d). */
function lastKnown(map) {
  const keys = [...map.keys()].sort();
  return (d) => { let lo = 0, hi = keys.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (keys[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans < 0 ? null : map.get(keys[ans]); };
}

function macroCondition(id, label, states, outcomes, valueAt, cond, source) {
  const h = 63;
  const withFlag = states.map((s, i) => { const v = valueAt(s.date); return { ...s, i, flag: v === null ? null : cond(v), out: outcomes.get(s.date) }; }).filter((s) => s.flag !== null);
  const group = (rs) => {
    const all = rs.filter((r) => r.out && r.out[h]);
    const ind = all.filter((r) => r.i % h === 0);
    const dd = ind.filter((r) => r.out[h].worst <= -10).length;
    return { days: all.length, independent: ind.length, meanReturn: round(all.reduce((a, r) => a + r.out[h].ret, 0) / (all.length || 1)),
             drawdownShareIndependent: ind.length ? round((100 * dd) / ind.length, 1) : null, _dd: dd, _n: ind.length };
  };
  const perLevel = LEVELS.map((lab, l) => {
    const on = group(withFlag.filter((r) => r.env === l && r.flag)), off = group(withFlag.filter((r) => r.env === l && !r.flag));
    const p = on._n && off._n ? PR.twoProportionP(on._dd, on._n, off._dd, off._n) : null;
    const strip = ({ _dd, _n, ...x }) => x;
    return { level: l, label: lab, conditionMet: strip(on), conditionNotMet: strip(off), p: round(p, 4) };
  }).filter((x) => x.conditionMet.days + x.conditionNotMet.days > 0);
  return { id, label, source, horizon: h, horizonLabel: HORIZON_LABEL[h], coverageFrom: withFlag[0] ? withFlag[0].date : null,
           daysWithCondition: withFlag.filter((r) => r.flag).length, perLevel };
}

/* ------------------------------------------------------------------ Lauf */
const A = studyRepository();
const B = studyFrench();
const macro = [studyMacro(A.id, A._states, read(`quant/data/market/multi-asset/series/${CFG.risk.benchmark}.json`).points, "A")];
/* Auf der langen Grundlage (ab 1926) mit Branchen-Breite, wenn vorhanden. */
const bLong = B.variants && (B.variants.find((v) => v.variant === "MIT_BRANCHEN_BREITE") || B.variants[0]);
if (bLong) macro.push(studyMacro(B.id + " / " + bLong.variant, bLong._states, B._bench, "B"));
/* --------------------------------------------- Veroeffentlichter Auszug
   Die Seite "Maerkte" zeigt die Pruefung fuer Anleger (Entscheidung des
   Eigentuemers vom 28.09.2026). Nur aggregierte Kennzahlen aus Studie B,
   Variante ohne Breite (die Branchen-Breite ist nur eine Naeherung der
   Produkt-Breite; "Konstruktiv" steht hier fuer beide oberen Stufen).
   Keine Rohreihen - die bleiben im Runner. */
function evidence(B) {
  const v = B.variants && B.variants.find((x) => x.variant === "OHNE_BREITE");
  if (!v) return null;
  const e = v.evaluation, h = 63;
  const lv = (t) => t.levels.filter((x) => x.days > 0).map((x) => ({ level: x.level, label: x.label,
    drawdownShare: x.drawdownShareIndependent, drawdownCI95: x.drawdownCI95, samples: x.independent,
    meanReturn: x.meanReturn, positiveShare: x.positiveShareIndependent }));
  const dd = e.contrasts.tests.filter((t) => t.metric.startsWith("deutlicher"));
  const ill = (x) => x && ({ cagr: round(x.strategy.cagr, 1), volatility: round(x.strategy.volatility, 1), maxDrawdown: round(x.strategy.maxDrawdown, 1),
    investedShare: round(x.investedShare, 0), from: x.from, to: x.to,
    buyAndHold: { cagr: round(x.buyAndHold.cagr, 1), maxDrawdown: round(x.buyAndHold.maxDrawdown, 1) } });
  return {
    schemaVersion: "vu-market-pulse-evidence-1.0.0",
    methodVersion: MP.METHOD_VERSION, environmentVersion: MP.ENVIRONMENT_VERSION,
    status: "RESEARCH_EVIDENCE",
    statusNote: "Eigene historische Prüfung der unveränderten Regeln; keine Prognose, keine Anlageberatung.",
    from: v.from, to: v.to,
    source: { label: "Kenneth R. French Data Library (Tuck School of Business, Dartmouth)",
              url: "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
              detail: "US-Gesamtmarkt inklusive Dividenden, täglich; eigene Auswertung von Vision Universe." },
    horizon: { days: h, label: HORIZON_LABEL[h] }, drawdownLimit: -10,
    topLevelNote: "Die Branchen-Breite der Geschichte ist nur eine Näherung. „Konstruktiv“ umfasst hier deshalb auch „Breit konstruktiv“.",
    overallDrawdownShare: e.byHorizon[h].all.drawdownShareIndependent,
    levels: lv(e.byHorizon[h]),
    byHorizon: HORIZONS.map((x) => ({ days: x, label: HORIZON_LABEL[x], levels: lv(e.byHorizon[x]) })),
    contrasts: dd.map((t) => ({ days: t.horizon, label: HORIZON_LABEL[t.horizon], lowShare: t.lowShare, lowSamples: t.lowN,
                                highShare: t.highShare, highSamples: t.highN, p: t.p, significant: t.significantAfterBH })),
    outOfSample: { to: "2000-12-31", levels: lv(v.outOfSample[h]) },
    periods: e.subperiods.map((sp) => ({ id: sp.id.replace(/ \(.*\)$/, ""), levels: sp.levels.filter((x) => x.days > 0).map((x) => ({ level: x.level, label: x.label,
      drawdownShare: x.drawdownShareIndependent, samples: x.independent })) })),
    illustration: {
      note: "Historische Modellrechnung: investiert ab der genannten Stufe, sonst Geldmarkt; Signal am Schlusskurs, wirksam einen Tag später; ohne Kosten und Steuern; US-Gesamtmarkt, nicht direkt investierbar.",
      rules: [1, 2].map((m, i) => ({ minLevel: m, minLabel: LEVELS[m], all: ill(v.illustration[i]), since2001: ill(v.recentIllustration[i]) }))
    }
  };
}
const EVIDENCE = "quant/data/market/validation/market-pulse-evidence.json";
const ev = evidence(B);

const strip = (s) => { if (!s) return s; const { _states, _bench, ...rest } = s; if (rest.variants) rest.variants = rest.variants.map(({ _states: x, ...v }) => v); return rest; };

const result = {
  schemaVersion: "vu-market-pulse-validation-1.0.0",
  methodVersion: MP.METHOD_VERSION, environmentVersion: MP.ENVIRONMENT_VERSION,
  generatedAt: new Date().toISOString(),
  status: "NOT_CERTIFIED",
  purpose: "Interne Prüfung, ob sich die Folgephasen je Einordnungsstufe unterscheiden. Keine Renditeaussage, keine Prognose, keine Produktanzeige.",
  method: {
    pointInTime: "Jeder Tag nur aus Daten bis zu diesem Tag; Volatilitätsschwellen als expandierende Perzentile (" + CFG.risk.vol20.elevatedPercentile + "./" + CFG.risk.vol20.highPercentile + ".).",
    execution: "Einstieg am Folgetag (Schlusskurs), Folgefenster " + HORIZONS.map((h) => HORIZON_LABEL[h] + " = " + h + " Handelstage").join(", ") + ".",
    outcomes: "Rendite am Ende des Fensters und schlechtester Stand gegenüber dem Einstieg innerhalb des Fensters; »deutlicher Rückgang« = schlechtester Stand ≤ −10 %.",
    independence: "Intervalle (Wilson, 95 %) und Tests nur über Tage, deren Folgefenster sich nicht überschneiden.",
    multipleTesting: "Zwei-Anteile-Tests je Horizont und Kennzahl, Benjamini-Hochberg bei 5 %.",
    parameters: "Unverändert aus quant/config/market-pulse.json – nichts wurde auf Rendite angepasst.",
    reused: ["quant/engines/multi-asset/market-pulse.js", "quant/engines/pattern-research.js (wilson, twoProportionP, benjaminiHochberg)", "quant/engines/backtest.js (computeMetrics)"]
  },
  studies: [strip(A), strip(B), ...macro]
};

if (args.has("--stdout")) console.log(JSON.stringify(result, null, 1));
else {
  mkdirSync(join(root, dirname(OUT)), { recursive: true });
  writeFileSync(join(root, OUT), JSON.stringify(result, null, 1) + "\n");
  console.log("geschrieben:", OUT);
  if (ev) {
    mkdirSync(join(root, dirname(EVIDENCE)), { recursive: true });
    writeFileSync(join(root, EVIDENCE), JSON.stringify(ev, null, 1) + "\n");
    console.log("geschrieben:", EVIDENCE);
  }
}
