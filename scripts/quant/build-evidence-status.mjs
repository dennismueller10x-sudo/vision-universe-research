#!/usr/bin/env node
/* =========================================================================
   Materialize the Evidence Status (evidence-status-1.0.0).

   Vier Arten historischer Evidenz, streng getrennt:

     A HISTORICAL_REPLAY   dieselbe Aktie, aehnliche Kurslagen (historical-cases)
     B PATTERN_EVIDENCE    marktweit, vorregistrierte Muster (pattern-research)
     C STRATEGY_BACKTEST   Portfolio-Regel mit Rebalancing (backtest engine)
     D SETUP_BACKTEST      Ereignisstudie der Setup-Zustaende (setup-engine)

   Je Art steht hier, ob sie Zahlen veroeffentlicht - und wenn nicht, was
   genau fehlt, GEMESSEN an den Artefakten, die es heute gibt. Kein
   "kommt spaeter": jede geschlossene Art nennt ihre Bedingung und den
   gemessenen Stand dazu. Es wird hier nichts freigeschaltet; die Gates
   bleiben, wo sie sind.

   Geschrieben wird quant/data/product/evidence-status-v1.json.
   ========================================================================= */
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const P = (...p) => join(ROOT, ...p);
const gz = (file) => JSON.parse(gunzipSync(readFileSync(file)));
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const HistoricalCases = require(P("quant/engines/historical-cases.js"));
const shardKey = (t) => (t + "_").slice(0, 2).replace(/[^A-Z0-9._-]/g, "_");

/* ---------------------------------------------------------------- A */
/* Abdeckung ueber das ganze Setup-Universum: fuer wie viele Titel gibt es
   heute Vergleichsfaelle, und fuer wie viele reicht es fuer Zahlen? */
const PATTERN_DIR = P("quant/data/product/pattern-match-v1");
const shards = {};
let vocab = null;
for (const f of readdirSync(PATTERN_DIR).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f))) {
  const s = gz(join(PATTERN_DIR, f)); shards[s.shard || f.slice(0, 2)] = s; vocab = vocab || HistoricalCases.vocabulary(s);
}
const SETUP_DIR = P("quant/data/product/setup-observations-v1");
const securityOf = {};
for (const f of readdirSync(SETUP_DIR).filter((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f))) {
  for (const [t, v] of Object.entries(gz(join(SETUP_DIR, f)).instruments || {})) securityOf[t] = v.securityId;
}
const replay = { universe: 0, covered: 0, available: 0, sufficient: { m1: 0, m3: 0, m6: 0, m12: 0 }, broad: { m6: 0 }, reasons: {} };
for (const t of Object.keys(securityOf)) {
  replay.universe += 1;
  const shard = shards[shardKey(t)], file = P("quant/data/market/discover-series-long", securityOf[t] + ".json");
  if (!shard || !shard.instruments || !shard.instruments[t] || !existsSync(file)) { replay.reasons.NOT_COVERED = (replay.reasons.NOT_COVERED || 0) + 1; continue; }
  replay.covered += 1;
  const series = json(file);
  const r = HistoricalCases.assess({ bars: series.points.map((p) => ({ date: p[0], close: p[1] })), vocabulary: vocab, holds: shard.instruments[t].holds || [] });
  if (r.state !== "AVAILABLE") { replay.reasons[r.reason] = (replay.reasons[r.reason] || 0) + 1; continue; }
  replay.available += 1;
  for (const k of Object.keys(replay.sufficient)) if (r.horizons[k] && r.horizons[k].sufficient) replay.sufficient[k] += 1;
  if (r.horizons.m6 && r.horizons.m6.evidence === "BROAD") replay.broad.m6 += 1;
}

/* ---------------------------------------------------------------- B */
const study = json(P("quant/data/product/pattern-research-v1/study.json"));
const verdicts = {};
for (const f of study.findings || []) verdicts[f.verdict] = (verdicts[f.verdict] || 0) + 1;
const anyShard = Object.values(shards)[0] || {};

/* ---------------------------------------------------------------- C */
const membershipDir = P("quant/data/market/index-membership/history");
const membershipDates = existsSync(membershipDir) ? Math.min(...readdirSync(membershipDir).map((ix) => readdirSync(join(membershipDir, ix)).filter((f) => /\.json$/.test(f)).length)) : 0;
const readiness = json(P("quant/data/fundamentals/backtest-readiness.json"));
const coverage = json(P("supertrader/data/coverage.json")).coverage || {};

/* ---------------------------------------------------------------- D */
const setupHistory = readdirSync(P("quant/data/product/setup-observation-history/setup-mapping-1.0.0")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
const gate = json(P("quant/data/product/setup-observations-v1/activation-gate.json"));
const technicalEvidence = existsSync(P("quant/data/technical/evidence-walkforward.json")) ? json(P("quant/data/technical/evidence-walkforward.json")) : null;
const setupMethod = json(P("quant/methodology/setup-state-v1.json"));
const days = setupHistory.length > 1 ? Math.round((Date.parse(setupHistory[setupHistory.length - 1]) - Date.parse(setupHistory[0])) / 86400000) : 0;
const firstOutcome = setupHistory.length ? new Date(Date.parse(setupHistory[0]) + 30 * 86400000).toISOString().slice(0, 10) : null;
const strategyProfiles = (json(P("quant/methodology/strategy-profiles-v1.json")).profiles || []).length;
/* Die Kaskade steht in jedem Setup-Shard; gezaehlt werden die Regeln
   ohne die Rueckfallregel ("immer"). */
const setupCascade = gz(join(SETUP_DIR, readdirSync(SETUP_DIR).find((f) => /^[A-Z0-9._-]{2}\.json\.gz$/.test(f)))).cascade || [];
const setupRules = setupCascade.filter((r) => r.always !== true).length;

/* Setup- und Signal-Backtest: aus den Studien, nicht aus eigener Rechnung. */
const setupStudy = existsSync(P("quant/data/product/setup-backtest-v1.json")) ? json(P("quant/data/product/setup-backtest-v1.json")) : null;
const signalStudy = existsSync(P("quant/data/product/signal-backtest-v1.json")) ? json(P("quant/data/product/signal-backtest-v1.json")) : null;
const setupConfirmed = setupStudy ? setupStudy.rules.find((r) => r.id === "SETUP_CONFIRMED") : null;

function check(id, label, required, measured, pass) { return { id, label, required, measured, state: pass ? "PASS" : "FAIL" }; }

const kinds = [
  { id: "HISTORICAL_REPLAY", label: "Rückblick bei dieser Aktie", question: "Was geschah früher bei dieser Aktie in derselben Kurslage?",
    state: "PUBLISHED", engine: HistoricalCases.VERSION, publishes: ["Anzahl Fälle", "Anteil im Plus", "Median", "Mittelwert", "typischer und größter Rückgang", "Chance/Risiko", "Verteilung", "1/3/6/12 Monate"],
    gate: { rule: "Zahlen erst ab " + HistoricalCases.MIN_EPISODES + " abgeschlossenen Fällen je Zeitraum; „breit“ ab " + HistoricalCases.BROAD_EPISODES + ".", minEpisodes: HistoricalCases.MIN_EPISODES, broadEpisodes: HistoricalCases.BROAD_EPISODES },
    trust: { sample: "Fälle je Zeitraum", period: "eigene Wochenreihe des Titels (MAX)", costs: "nicht abgezogen", survivorship: "Titel mit langer Historie hat überlebt (nicht korrigiert)",
      lookAhead: "Merkmale nur aus Kursen bis zur jeweiligen Woche (Leckage-Vertrag der Studie)", pointInTime: "nur Kursbedingungen; keine Fundamentaldaten je Vergangenheitswoche",
      independence: "überlappende Zeitfenster", totalReturn: false, outOfSample: "nicht anwendbar - beschreibt, prüft keine Regel" },
    coverage: replay },
  { id: "PATTERN_EVIDENCE", label: "Marktweite Muster", question: "Was geschah im gesamten Markt in ähnlichen Situationen?",
    state: "PUBLISHED", engine: study.methodologyVersion || study.schemaVersion || null, publishes: ["Trefferzahl (Support)", "Lift gegenüber Basisrate", "Median-Ausgang", "In-/Out-of-Sample", "Parameterstabilität"],
    gate: { rule: "Nur Befunde mit Urteil ROBUST (Out-of-Sample-Lift > 1, Benjamini-Hochberg, Mindest-Support) erreichen eine Aktie.", verdicts },
    trust: { sample: (study.population || {}).observations || null, period: [(study.population || {}).firstDate || null, (study.population || {}).lastDate || null],
      costs: study.frictions || null, survivorship: (study.survivorship || {}).state || null, lookAhead: "assert in observe(), gepurgte Walk-Forward-Folds",
      pointInTime: "Kurse; Fundamental-Overlay nur mit filed <= t", independence: (anyShard.caveats || {}).independence || null, totalReturn: (study.population || {}).totalReturn === true,
      outOfSample: "ja - 4 gepurgte Folds", backtest: study.backtest || null } },
  { id: "STRATEGY_BACKTEST", label: "Strategie-Backtest", question: "Wie hätte eine Anlageregel mit regelmäßiger Umschichtung abgeschnitten?",
    state: "WITHHELD", reason: "REAL_BACKTEST_GATE_NOT_VALIDATED",
    checks: [
      check("HISTORICAL_UNIVERSE", "Historische Index-Zugehörigkeit (Point-in-Time)", "mindestens 24 Stichtage", membershipDates + " Stichtage", membershipDates >= 24),
      check("SURVIVORSHIP", "Dekotierte Titel mit Kurshistorie, Überlebenden-Kontrolle", "Kontrolle aktiv", (coverage.delistedWithPriceHistory ?? "?") + " Titel mit Historie, Kontrolle " + (coverage.survivorshipControls ? "aktiv" : "nicht aktiv"), coverage.survivorshipControls === true),
      check("TOTAL_RETURN", "Gesamtrendite (mit Ausschüttungen)", "Gesamtrendite-Reihen", coverage.totalReturnSeries ? "vorhanden" : "nur splitbereinigte Kurse", coverage.totalReturnSeries === true),
      check("PIT_FUNDAMENTALS", "Fundamentaldaten zeitpunktgenau", "datierbar je Wert", readiness.BACKTEST_PIT_FUNDAMENTAL_READY + " von " + readiness.denominator.PRODUCT_TITLES + " Titeln", readiness.BACKTEST_PIT_FUNDAMENTAL_READY > 0),
      check("BENCHMARK", "Vergleichsindex als Reihe", "Indexstände", "keine Indexreihe veröffentlicht", false),
      check("EXECUTION_AUDIT", "Geprüfter, reproduzierbarer Lauf", "auditierter Lauf", "keiner", false)
    ] },
  { id: "SETUP_BACKTEST", label: "Setup-Backtest", question: "Wie entwickelten sich Aktien, nachdem dasselbe Setup entstand?",
    state: "WITHHELD", reason: "SETUP_OUTCOMES_NOT_CERTIFIED", trust: setupConfirmed ? setupConfirmed.trust : "NOT_READY",
    checks: [
      check("REPLAY_PIT", "Point-in-Time-Wiederholung, gegen veröffentlichte Stände geprüft", "alle nachgerechneten Stände gleich",
        setupStudy ? setupStudy.parity.checked + " Stände nachgerechnet, " + setupStudy.parity.mismatches + " Abweichungen" : "keine Wiederholung", !!setupStudy && setupStudy.parity.checked > 0 && setupStudy.parity.mismatches === 0),
      check("REPLAY_TITLES", "Titel in der Wiederholung", "mindestens 20 Titel",
        setupStudy ? setupStudy.source.titles.length + " Titel (" + setupStudy.source.titles.map((t) => t.ticker).slice(0, 8).join(", ") + (setupStudy.source.titles.length > 8 ? " …" : "") + ")" : "0", !!setupStudy && setupStudy.source.titles.length >= 20),
      check("EFFECTIVE_SAMPLE", "Bestätigte Setups mit 6-Monats-Ausgang", "mindestens 100 aus 20 Titeln",
        setupConfirmed ? setupConfirmed.sample.n + " aus " + setupConfirmed.sample.titles + " Titeln" : "0", !!setupConfirmed && setupConfirmed.sample.n >= 100 && setupConfirmed.sample.titles >= 20),
      check("REVERSAL", "Stabilität: Anteil bestätigter Setups, die beim nächsten Wochenschluss wieder wechseln", "unter 20 %",
        setupConfirmed && setupConfirmed.reversalNextObservation !== null ? Math.round(setupConfirmed.reversalNextObservation * 100) + " %" : "?", !!setupConfirmed && setupConfirmed.reversalNextObservation !== null && setupConfirmed.reversalNextObservation < 0.2),
      check("SURVIVORSHIP", "Überlebenden-Kontrolle", "Kontrolle aktiv", "heute gelistete Titel", false),
      check("CERTIFICATION", "Methodische Freigabe der Setup-Ausgänge", "zertifiziert", (setupMethod.requirements || {}).backtestCertification === "CERTIFIED" ? "zertifiziert" : "nicht zertifiziert", false)
    ] },
  { id: "SIGNAL_BACKTEST", label: "Signal-Backtest", question: "Was geschah marktweit, nachdem dasselbe Radar-Signal auftrat?",
    state: signalStudy && signalStudy.rules.some((r) => r.display.allowed) ? "PUBLISHED" : "WITHHELD",
    reason: signalStudy ? (signalStudy.rules.some((r) => r.display.allowed) ? null : "TRUST_NOT_READY") : "STUDY_NOT_PUBLISHED",
    engine: signalStudy ? signalStudy.engineVersion : null, returnType: signalStudy ? signalStudy.returnType : null,
    rules: signalStudy ? signalStudy.rules.map((r) => ({ id: r.id, trust: r.trust, n: r.sample.n, titles: r.sample.titles, displayAllowed: r.display.allowed, failed: r.trustReasons.map((x) => x.id) })) : [],
    gate: { rule: signalStudy ? signalStudy.trustRule.plain : null } }
];

const status = {
  schemaVersion: "evidence-status-1.0.0", generatedAt: new Date().toISOString(),
  kinds,
  measures: {
    BACKTEST_ELIGIBLE_RULES: verdicts.ROBUST || 0,
    BACKTEST_WITHHELD_RULES: (study.findings || []).length - (verdicts.ROBUST || 0) + strategyProfiles + setupRules,
    BACKTEST_WITHHELD_DETAIL: { patternFindingsNotRobust: (study.findings || []).length - (verdicts.ROBUST || 0), strategyProfiles, setupRules },
    HISTORICAL_REPLAY_COVERAGE: replay
  }
};
writeFileSync(P("quant/data/product/evidence-status-v1.json"), JSON.stringify(status, null, 1) + "\n");
console.log(JSON.stringify(status.measures, null, 1));
