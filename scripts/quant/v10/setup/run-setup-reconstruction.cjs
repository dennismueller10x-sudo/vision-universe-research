#!/usr/bin/env node
'use strict';
// V10 SETUP Pfad A, Teil 2: vorab registrierte RECONSTRUCTION-Studie der Setup-Ereignisse 2005-2025.
// Zustaende: quant/data/product/setup-replay-v1 (Produkt-Erzeuger scripts/quant/replay-setup-history.mjs, setup-engine
//            vu-setup-1.0.0, Paritaet zum Produkt im Artefakt setup-backtest-v1.json). Nur gelesen, nie neu erzeugt.
// Kurse:     Research-Frame createResearchLoader(ROOT, loaderOptions) (Wochenschluesse, split-bereinigt, PRICE_RETURN).
// Engines:   research-studies.runSetupStudy (Ereignis-Ausgaenge), research-studies.inference (Zwei-Wege-Cluster),
//            research-validation.inferTemporalBlockMean (Kalenderblock-Bootstrap) und .holm, weekly-benchmark (SPY).
// Stufen:
//   register --out <registration.json>                     Frame, Quellmanifest, Plan; KEINE Ausgaenge
//   run --registration <file> --out <results.json> [--private <dir>] [--loader-options '<json>']
// Schreibt nur die angegebenen Dateien; --private muss ausserhalb des Repositorys liegen.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const S = require(path.join(ROOT, 'quant/engines/research-studies.cjs'));
const V = require(path.join(ROOT, 'quant/engines/research-validation.cjs'));
const B = require(path.join(ROOT, 'quant/engines/weekly-benchmark.cjs'));
const Loader = require(path.join(ROOT, 'quant/engines/research-weekly-loader.cjs'));
const L = require('./setup-lib.cjs');
const { transitionType } = require('./setup-original-inventory.cjs');

const REPLAY = 'quant/data/product/setup-replay-v1';
const DEFAULT_LOADER_OPTIONS = Object.freeze({ identityEvidence: true, corporateActionEvidence: true });
const WINDOW = ['2005-01-01', '2025-12-31'];
const MIC = { NASDAQ: 'XNAS', NYSE: 'XNYS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
const ENTRY_KINDS = ['SETUP_NEW', 'SETUP_CONFIRMED'];
const ENTRY_VARIANTS = [{ id: 'NEXT_WEEK_CLOSE', delayBars: 1 }, { id: 'SECOND_WEEK_CLOSE', delayBars: 2 }];
const EXIT_VARIANTS = [{ id: 'M3_TIME', type: 'TIME_EXIT', horizonBars: 13 }, { id: 'M6_TIME', type: 'TIME_EXIT', horizonBars: 26 },
  { id: 'M6_INVALIDATION', type: 'INVALIDATION_CLOSE', horizonBars: 26 }, { id: 'M6_TARGET', type: 'TARGET_CLOSE', horizonBars: 26 }];
// Vertragskosten je Runde (setup-backtest-contract-v1 costs.scenarios) -> Engine erwartet je Seite: Runde/2.
const COSTS = { LOW: { roundTripBps: 10, feeBps: 0, slippageBps: 5 }, BASE: { roundTripBps: 30, feeBps: 7.5, slippageBps: 7.5 }, HIGH: { roundTripBps: 60, feeBps: 17.5, slippageBps: 12.5 } };
const INFERENCE = { blockLength: 52, minimumBlockLength: 26, replicates: 1999, seed: 20261028, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' };
const PRIMARY = { entry: 'NEXT_WEEK_CLOSE', exit: 'M6_TIME', field: 'benchmarkExcess' };
const CLOSE_AT = 'T21:00:00Z', AVAILABLE_AT = 'T23:59:59.999Z';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const gitHead = () => { try { return cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; } };
const weekOf = d => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - (t.getUTCDay() + 6) % 7); return t.toISOString().slice(0, 10); };
const arg = (argv, n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
function codeHashes() {
  const files = ['scripts/quant/v10/setup/run-setup-reconstruction.cjs', 'scripts/quant/v10/setup/setup-lib.cjs', 'scripts/quant/v10/setup/setup-original-inventory.cjs',
    'quant/engines/research-studies.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/research-contract.cjs', 'quant/engines/research-weekly-loader.cjs',
    'quant/engines/weekly-real-adapter.cjs', 'quant/engines/weekly-benchmark.cjs', 'quant/engines/setup-engine.js', 'quant/engines/signal-backtest.js'];
  return Object.fromEntries(files.map(f => [f, C.shaFile(path.join(ROOT, f))]));
}
function readReplay(file) { return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, REPLAY, file))).toString('utf8')); }

// ---------- Frame (ergebnisfrei) ----------
function buildFrame(loaderOptions) {
  const load = Loader.createResearchLoader(ROOT, loaderOptions);
  const files = fs.readdirSync(path.join(ROOT, REPLAY)).filter(f => /^ref_.*\.json\.gz$/.test(f)).sort();
  const reasons = {}, loaded = [], docs = new Map(), replays = new Map(), excluded = {};
  const ex = (k, id) => { (excluded[k] = excluded[k] || []).push(id); };
  for (const f of files) {
    const r = readReplay(f), id = r.securityId; replays.set(id, { r, file: REPLAY + '/' + f, sha256: C.shaFile(path.join(ROOT, REPLAY, f)) });
    if (r.engine?.mapping !== 'setup-mapping-1.0.0' || r.cadence !== 'WEEKLY') { ex('REPLAY_ENGINE_OR_CADENCE_MISMATCH', id); continue; }
    try { docs.set(id, load(id)); loaded.push(id); reasons.LOADED = (reasons.LOADED || 0) + 1; }
    catch (e) { const k = String(e.code === 'ENOENT' ? 'SERIES_FILE_MISSING' : e.message).split(':')[0]; reasons[k] = (reasons[k] || 0) + 1; ex('LOADER_' + k, id); }
  }
  // Modales Datumslabel je ISO-Woche unter den geladenen Listings (Gleichstand -> spaeteres Datum), wie V9.
  const labels = new Map();
  for (const id of loaded) for (const [d] of docs.get(id).points) { const k = weekOf(d); if (!labels.has(k)) labels.set(k, new Map()); const m = labels.get(k); m.set(d, (m.get(d) || 0) + 1); }
  const modal = new Map([...labels].map(([k, m]) => [k, [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0]]));
  const calendar = [...modal.values()].sort(), frame = [];
  for (const id of loaded) {
    const d = docs.get(id), exch = d.listingId.split(':')[1];
    if (d.points.some(([x]) => modal.get(weekOf(x)) !== x)) ex('NON_MODAL_WEEK_LABEL', id);
    else if (!MIC[exch]) ex('EXCHANGE_OUTSIDE_ENGINE_PRIMARY_SET', id);
    else frame.push(id);
  }
  return { load, files, reasons, loaded, docs, replays, calendar, excluded, frame };
}
function sourceManifest(fr) {
  const files = {};
  for (const id of [...fr.replays.keys()].sort()) files[fr.replays.get(id).file] = fr.replays.get(id).sha256;
  for (const id of fr.loaded) files[fr.docs.get(id).sourcePath] = C.shaFile(path.join(ROOT, fr.docs.get(id).sourcePath));
  for (const f of ['quant/data/market/security-master/us-security-master.json', B.SOURCE, 'quant/data/market/multi-asset/instruments.json', 'quant/data/market/discover-series/ref_SPY.json',
    'quant/engines/research-identity-evidence.cjs', 'quant/engines/research-ca-evidence.cjs', 'quant/data/product/setup-backtest-v1.json']) files[f] = C.shaFile(path.join(ROOT, f));
  return { schemaVersion: 'v10-setup-reconstruction-source-manifest-1.0.0', files };
}
function registration(fr, manifestHash, registeredAt, loaderOptions) {
  return {
    id: 'V10-SETUP-RECONSTRUCTION', version: '1.0.0', registeredAt, evidenceKind: 'RECONSTRUCTION', analysisMode: 'EXPLORATORY',
    question: 'Welche M3/M6-Ausgaenge und welche effektive Stichprobengroesse liefern vertragsgemaess definierte Setup-Ereignisse (SETUP_NEW, SETUP_CONFIRMED), wenn die Zustaende mit der unveraenderten setup-engine woechentlich rekonstruiert werden (2005-2025)?',
    priorExposure: [
      'Das Produktartefakt quant/data/product/setup-backtest-v1.json (gleiche 160 Replays, Tageskurse, Gesamtrendite, Kosten 30 Bp) wurde vor dieser Registrierung gelesen: SETUP_CONFIRMED M6 n=823, Median +4.67 %, Median-Ueberschuss ggue. SPY -0.81 %, Anteil ueber SPY 48.3 %.',
      'V7-V9 haben auf derselben Kurshistorie NEW_52W_HIGH und weitere Signale untersucht; V9 fand keinen belegten Ueberschuss ggue. SPY fuer NEW_52W_HIGH.',
      'Kein Ausgang dieser Studie (Frame-Ereignisse, Wochenrenditen nach Ereignis) wurde vor dieser Registrierung berechnet.'],
    states: { source: REPLAY, producer: 'scripts/quant/replay-setup-history.mjs (Stichprobe sha256("setup-backtest-sample-1:"+Kuerzel) aus dem HEUTIGEN Setup-Universum)', engine: 'vu-setup-1.0.0 / setup-mapping-1.0.0', sourceMode: 'HISTORICAL_SIMULATION',
      pathDependentStates: 'geschlossen wie im Produkt', availability: 'Zustand gilt als nach Schluss des Stichtags verfuegbar (' + AVAILABLE_AT + '); er wurde damals NICHT veroeffentlicht' },
    events: { rule: 'Vertragsregel setup-backtest-contract-1.0.0 auf aufeinanderfolgenden Replay-Beobachtungen (woechentlich): SETUP_CONFIRMED = Wechsel nach CONFIRMED; SETUP_NEW = Wechsel nach SETUP_FORMING aus NO_SETUP/WATCH; SETUP_WEAKENED nur gezaehlt',
      entryKinds: ENTRY_KINDS, granularity: 'WEEKLY (Original: taeglich veroeffentlicht) - Wochenereignisse sind nicht identisch mit Tagesereignissen',
      inclusion: 'Signal-Datum in ' + WINDOW.join('..') + ' und als Wochenpunkt im Frame-Listing vorhanden; sonst gezaehlt ausgeschlossen (SIGNAL_DATE_NOT_ON_FRAME)' },
    population: { rule: 'Replay-Titel, die createResearchLoader(ROOT, loaderOptions) laedt, mit modalen ISO-Wochenlabels und Boerse in {NASDAQ,NYSE,AMEX}', loaderOptions,
      loaderReasons: fr.reasons, exclusions: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, { count: v.length, ids: v }])), frameCount: fr.frame.length, frameIds: fr.frame, frameIdsHash: V.hash(fr.frame),
      listingIdentity: 'listingId des Loaders (tiingo:<Boerse>:<Kuerzel>:<Start>), Identitaet = heutiger Stamm (+ SEC-belegte Bindungen bei identityEvidence)',
      listingLifecycle: 'gelesen als result.listingLifecycle ?? null; mit lastTradeDate: identity.validTo = lastTradeDate (Engine zensiert), bekannte Barabfindung -> TERMINAL_CONSIDERATION, sonst zensiert und gezaehlt mit Schranken -100 %/letzter Kurs',
      survivorship: 'Stichprobe aus dem heutigen Universum: nur Ueberlebende; Ergebnisse gelten bedingt auf Ueberleben bis 2026 und nicht fuer den historischen Markt (cohortMode CONDITIONAL_CURRENT_CLASSIFICATION)' },
    calendar: { rule: 'modale ISO-Wochenlabels der geladenen Listings', length: fr.calendar.length, first: fr.calendar[0], last: fr.calendar.at(-1), hash: V.hash(fr.calendar) },
    execution: { entryVariants: ENTRY_VARIANTS, exitVariants: EXIT_VARIANTS, closeAt: 'Balkendatum' + CLOSE_AT + ' (spaetester regulaerer US-Schluss in UTC)',
      contractMapping: { NEXT_CLOSE: 'naeherungsweise NEXT_WEEK_CLOSE (bis zu 4 Sitzungen spaeter als der Vertrag)', SIGNAL_CLOSE: 'nicht gemessen: Engine verlangt delayBars >= 1 (Schutz ENTRY_NOT_AFTER_AVAILABILITY)', invalidation: 'M6_INVALIDATION: Wochenschluss < Invalidierungsmarke des Signalstands (fest), Ausstieg naechster Wochenschluss', target1: 'M6_TARGET: Wochenschluss >= Zielmarke des Signalstands', oppositeSignal: 'nicht gemessen (Engine kennt keine Gegensignal-Ausfahrt)', priorityCombination: 'nicht gemessen (Engine wertet die Ausstiegsarten einzeln)', horizons: 'M3 = 13, M6 = 26 Wochenbalken (Vertrag 63/126 Sitzungen)' },
      levelBasis: 'SIGNAL_SERIES, wenn der Frame nach replay.to keine split-grosse Bewegung zeigt; sonst Marken-Ausstiege fuer das Listing ausgeschlossen (LEVEL_SCALE_UNPROVEN); Ereignisse ohne positive Marke fuer die jeweilige Marken-Variante INELIGIBLE (LEVEL_MISSING), gezaehlt' },
    returnBasis: 'PRICE_RETURN (Frame ohne Dividenden); TOTAL_RETURN: NOT_AVAILABLE in dieser Studie',
    costs: { primary: 'BASE', scenarios: COSTS, basis: 'PER_SIDE_NOTIONAL = Vertragsrunde/2', benchmarkCosts: 'keine' },
    benchmark: 'SPY Kursrendite zwischen denselben Ein- und Ausstiegsdaten (weekly-benchmark, exakte Daten, keine Fuellung)',
    endpoints: { primary: 'POOLED_EVENT_MEAN_BENCHMARK_EXCESS (netReturn - SPY) je Zelle Ereignisart x Einstieg x Ausstieg', primaryCell: PRIMARY, descriptive: ['Median', 'Anteil > 0', 'netReturn', 'grossReturn', 'maxDrawdown', 'Zeitraeume 2005-2014 / 2015-2025'] },
    inference: { method: 'research-validation.inferTemporalBlockMean auf dem Studienkalender (Signal-Datum), alle Titel eines Datums gemeinsam', ...INFERENCE, secondary: 'research-studies.inference (Zwei-Wege-Cluster Datum x Emittent, asymptotisch)',
      multipleTesting: 'Holm ueber die Familie 2 Ereignisarten x 2 Einstiege x 4 Ausstiege = 16 Hypothesen (H0: mittlerer SPY-Ueberschuss = 0), alpha 0.05' },
    independence: { model: 'wie scripts/quant/v9/setup-independence.py: Cov/Var = rho_ij*overlap/H; Achse = Studienkalender (Wochen), H = Horizontbalken; rho_ij=1 gleicher Titel, sonst rho',
      rho: 'mittlere paarweise Korrelation woechentlicher Log-Renditen der Frame-Listings mit vollstaendiger Abdeckung des Fensters (roh und SPY-Ueberschuss); Sensitivitaet: Maximum der Jahres-rho',
      empirical: 'bootstrap-implizites N_eff = s^2 / Var_boot(Mittelwert) aus demselben Kalenderblock-Bootstrap',
      overlap: 'nicht ueberlappende Horizontbloecke (Spanne/H+1), disjunkte Fenster (greedy), max. Ereignisse je Datum, Anteil Ereignisse mit offenem Fenster desselben Titels, mittlere Zahl gleichzeitig offener Fenster' },
    sourceManifestHash: manifestHash, certificationStatus: 'NOT_CERTIFIED', productionApproved: false,
    scope: 'Rekonstruktion auf heutigen Ueberlebenden mit Wochenraster und Kursrendite; ersetzt keine vorwaerts gesammelte veroeffentlichte Historie und ist kein Holdout.'
  };
}
function register(argv) {
  const out = arg(argv, '--out'); if (!out) throw Error('--out REQUIRED');
  const loaderOptions = argv.includes('--loader-options') ? JSON.parse(arg(argv, '--loader-options')) : { ...DEFAULT_LOADER_OPTIONS };
  const fr = buildFrame(loaderOptions), manifest = sourceManifest(fr), manifestHash = V.hash(manifest);
  const body = registration(fr, manifestHash, new Date().toISOString(), loaderOptions);
  const doc = { registration: body, registrationHash: V.hash(body), gitHeadAtRegistration: gitHead(), codeAtRegistration: codeHashes(), runtime: C.runtime(), sourceManifest: manifest };
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  console.log(JSON.stringify({ registrationHash: doc.registrationHash, frame: fr.frame.length, excluded: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, v.length])), calendar: [fr.calendar[0], fr.calendar.at(-1), fr.calendar.length] }));
}

// ---------- Lauf ----------
function listingOf(d, id, lifecycle) {
  const exch = d.listingId.split(':')[1];
  const validTo = lifecycle && lifecycle.lastTradeDate ? lifecycle.lastTradeDate : null;
  return { listingId: d.listingId, issuerId: id, securityId: id,
    identity: { mic: MIC[exch], instrumentClass: 'COMMON_STOCK', primary: true, validFrom: d.listingStart, validTo, availableAt: d.masterGeneratedAt, sourceHash: d.identityHash },
    bars: d.points.filter(([date]) => !validTo || date <= validTo).map(([date, close]) => ({ date, close, closeAt: date + CLOSE_AT })) };
}
function eventStream(replay, listing, sourceHash) {
  const onFrame = new Set(listing.bars.map(b => b.date)), rows = replay.rows, out = [], counts = { SETUP_NEW: 0, SETUP_CONFIRMED: 0, SETUP_WEAKENED: 0, SIGNAL_DATE_NOT_ON_FRAME: {}, outsideWindow: 0 };
  for (let k = 0; k < rows.length; k++) {
    const type = k ? transitionType(rows[k - 1][1], rows[k][1]) : null, d = rows[k][0];
    const inWindow = d >= WINDOW[0] && d <= WINDOW[1];
    if (type && inWindow) counts[type]++;
    if (!onFrame.has(d)) { if (type && inWindow) counts.SIGNAL_DATE_NOT_ON_FRAME[type] = (counts.SIGNAL_DATE_NOT_ON_FRAME[type] || 0) + 1; continue; }
    out.push({ listingId: listing.listingId, date: d, availableAt: d + AVAILABLE_AT, sourceHash, sourceMode: 'HISTORICAL_SIMULATION',
      state: type && inWindow ? type : type ? 'EVENT_OUTSIDE_WINDOW' : 'NO_EVENT', levelBasis: 'SIGNAL_SERIES', invalidationLevel: rows[k][2], targetLevel: rows[k][3] });
  }
  return { states: out, counts };
}
function splitAfter(doc, date) { return (doc.corporateActions?.moves || []).some(m => m.week > date) || doc.points.some(([d, p], i) => i && d > date && Math.abs(Math.log(p / doc.points[i - 1][1])) > Math.log(1.45)); }
function rhoWeekly(fr, calendarWindow, spy) {
  const ids = fr.frame.filter(id => { const m = new Map(fr.docs.get(id).points); return calendarWindow.every(d => m.has(d)); });
  const spyR = calendarWindow.slice(1).map((d, i) => Math.log(spy.get(d) / spy.get(calendarWindow[i])));
  const cols = ids.map(id => { const m = new Map(fr.docs.get(id).points); return calendarWindow.slice(1).map((d, i) => Math.log(m.get(d) / m.get(calendarWindow[i]))); });
  const years = {};
  for (const y of [...new Set(calendarWindow.map(d => d.slice(0, 4)))]) {
    const idx = calendarWindow.slice(1).map((d, i) => d.slice(0, 4) === y ? i : -1).filter(i => i >= 0); if (idx.length < 20) continue;
    years[y] = { raw: L.meanPairwiseCorr(cols.map(c => idx.map(i => c[i]))), excess: L.meanPairwiseCorr(cols.map(c => idx.map(i => c[i] - spyR[i]))) };
  }
  return { titles: ids.length, weeks: calendarWindow.length - 1, rhoRaw: L.meanPairwiseCorr(cols), rhoSpyExcess: L.meanPairwiseCorr(cols.map(c => c.map((x, i) => x - spyR[i]))), byYear: years,
    maxYearRaw: Math.max(...Object.values(years).map(y => y.raw)), maxYearExcess: Math.max(...Object.values(years).map(y => y.excess)) };
}
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const variance = a => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };

function run(argv) {
  const regFile = arg(argv, '--registration'), out = arg(argv, '--out'), priv = arg(argv, '--private');
  if (!regFile || !out) throw Error('--registration AND --out REQUIRED');
  if (priv) { const real = path.resolve(priv); if (real === ROOT || real.startsWith(ROOT + path.sep)) throw Error('PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY'); fs.mkdirSync(real, { recursive: true }); }
  const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  if (V.hash(reg.registration) !== reg.registrationHash) throw Error('REGISTRATION_HASH_MISMATCH');
  const loaderOptions = argv.includes('--loader-options') ? JSON.parse(arg(argv, '--loader-options')) : reg.registration.population.loaderOptions;
  const t0 = Date.now(), fr = buildFrame(loaderOptions), manifest = sourceManifest(fr), manifestHash = V.hash(manifest);
  const sameAsRegistered = manifestHash === reg.registration.sourceManifestHash && JSON.stringify(loaderOptions) === JSON.stringify(reg.registration.population.loaderOptions);
  const spyBench = B.load(ROOT), calSet = new Set(fr.calendar);
  const benchmarkBars = [...spyBench.byDate].filter(([d]) => calSet.has(d)).map(([date, close]) => ({ date, close }));
  const studyCalendar = fr.calendar.filter(d => d >= WINDOW[0] && d <= WINDOW[1]);
  const regInfo = { id: reg.registration.id, version: reg.registration.version, frozenAt: reg.registration.registeredAt, analysisMode: 'EXPLORATORY' };
  const asOf = fr.calendar.at(-1);
  const base = costs => ({ asOf, sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', returnBasis: 'PRICE_RETURN', currency: 'USD', registration: regInfo,
    expectedCalendar: fr.calendar, costs: { basis: 'PER_SIDE_NOTIONAL', feeBps: costs.feeBps, slippageBps: costs.slippageBps }, benchmark: { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: benchmarkBars },
    horizonBars: 26, entryStates: ENTRY_KINDS });
  const events = [], counts = { SETUP_NEW: 0, SETUP_CONFIRMED: 0, SETUP_WEAKENED: 0, SIGNAL_DATE_NOT_ON_FRAME: {}, levelScaleUnprovenListings: [], levelExclusions: {}, lifecycle: { withLifecycle: 0, terminal: {} } };
  const costRuns = { LOW: [], HIGH: [] };
  for (const id of fr.frame) {
    const doc = fr.docs.get(id), rep = fr.replays.get(id), lifecycle = doc.listingLifecycle ?? null;
    if (lifecycle) { counts.lifecycle.withLifecycle++; const k = lifecycle.terminal?.kind || 'NONE'; counts.lifecycle.terminal[k] = (counts.lifecycle.terminal[k] || 0) + 1; }
    const listing = listingOf(doc, id, lifecycle), stream = eventStream(rep.r, listing, rep.sha256);
    for (const k of ['SETUP_NEW', 'SETUP_CONFIRMED', 'SETUP_WEAKENED']) counts[k] += stream.counts[k];
    for (const [k, v] of Object.entries(stream.counts.SIGNAL_DATE_NOT_ON_FRAME)) counts.SIGNAL_DATE_NOT_ON_FRAME[k] = (counts.SIGNAL_DATE_NOT_ON_FRAME[k] || 0) + v;
    if (!stream.states.some(s => ENTRY_KINDS.includes(s.state))) continue;
    const levelsOk = !splitAfter(doc, rep.r.to);
    if (!levelsOk) counts.levelScaleUnprovenListings.push(id);
    const timeRun = S.runSetupStudy({ ...base(COSTS.BASE), listings: [listing], setups: stream.states, entryVariants: ENTRY_VARIANTS, exitVariants: EXIT_VARIANTS.filter(v => v.type === 'TIME_EXIT') });
    for (const e of timeRun.events) events.push({ ...e, securityId: id });
    // Marken-Ausstiege: Ereignisse ohne positive Marke werden fuer diese Variante als LEVEL_MISSING gezaehlt (Engine verlangt sie).
    for (const xv of EXIT_VARIANTS.filter(v => v.type !== 'TIME_EXIT')) {
      const field = xv.type === 'INVALIDATION_CLOSE' ? 'invalidationLevel' : 'targetLevel';
      const usable = s => Number.isFinite(s[field]) && s[field] > 0;
      for (const s of stream.states) if (ENTRY_KINDS.includes(s.state) && (!levelsOk || !usable(s))) {
        const key = xv.id + '|' + s.state + '|' + (levelsOk ? 'LEVEL_MISSING' : 'LEVEL_SCALE_UNPROVEN'); counts.levelExclusions[key] = (counts.levelExclusions[key] || 0) + ENTRY_VARIANTS.length;
        for (const ev of ENTRY_VARIANTS) events.push({ setupState: s.state, entryVariant: ev.id, exitVariant: xv.id, listingId: listing.listingId, issuerId: id, signalDate: s.date, state: 'INELIGIBLE', reasons: [levelsOk ? 'LEVEL_MISSING' : 'LEVEL_SCALE_UNPROVEN'], completed: false, securityId: id });
      }
      if (!levelsOk) continue;
      const states = stream.states.map(s => ENTRY_KINDS.includes(s.state) && !usable(s) ? { ...s, state: 'EVENT_LEVEL_MISSING' } : s);
      if (!states.some(s => ENTRY_KINDS.includes(s.state))) continue;
      const r = S.runSetupStudy({ ...base(COSTS.BASE), listings: [listing], setups: states, entryVariants: ENTRY_VARIANTS, exitVariants: [xv] });
      for (const e of r.events) events.push({ ...e, securityId: id });
    }
    for (const sc of ['LOW', 'HIGH']) {
      const r2 = S.runSetupStudy({ ...base(COSTS[sc]), listings: [listing], setups: stream.states, entryVariants: ENTRY_VARIANTS.filter(v => v.id === PRIMARY.entry), exitVariants: EXIT_VARIANTS.filter(v => v.id === PRIMARY.exit) });
      for (const e of r2.events) costRuns[sc].push(e);
    }
    // Terminale Gegenleistung (nur mit listingLifecycleEvidence): bekannte Barabfindung bewertet zensierte Ausgaenge.
    if (lifecycle && lifecycle.terminal && lifecycle.terminal.kind === 'CASH_MERGER' && Number.isFinite(lifecycle.terminal.cashPerShare)) {
      for (const e of events) if (e.securityId === id && e.state === 'CENSORED' && e.entryDate) {
        const entryBar = listing.bars.find(b => b.date === e.entryDate); const side = (COSTS.BASE.feeBps + COSTS.BASE.slippageBps) / 1e4;
        e.terminalConsideration = { kind: 'TERMINAL_CONSIDERATION', cashPerShare: lifecycle.terminal.cashPerShare, netReturn: lifecycle.terminal.cashPerShare / entryBar.close * (1 - side) / (1 + side) - 1, paymentDate: lifecycle.terminal.paymentDate ?? null };
      }
    }
  }
  // Aggregation je Zelle.
  const rho = rhoWeekly(fr, studyCalendar, spyBench.byDate);
  const calIndex = new Map(fr.calendar.map((d, i) => [d, i]));
  const cells = [], pValues = [];
  for (const kind of ENTRY_KINDS) for (const ev of ENTRY_VARIANTS) for (const xv of EXIT_VARIANTS) {
    const cell = events.filter(e => e.setupState === kind && e.entryVariant === ev.id && e.exitVariant === xv.id);
    const states = cell.reduce((a, e) => (a[e.state] = (a[e.state] || 0) + 1, a), {});
    const reasons = cell.filter(e => e.state !== 'OBSERVED').reduce((a, e) => { for (const r of e.reasons || []) a[r] = (a[r] || 0) + 1; return a; }, {});
    const done = cell.filter(e => e.completed), withB = done.filter(e => e.benchmarkExcess !== null);
    const obs = withB.map((e, i) => ({ id: e.listingId + ':' + e.signalDate + ':' + i, date: e.signalDate, value: e.benchmarkExcess }));
    let block = null;
    if (obs.length >= 2) {
      try { const bt = V.inferTemporalBlockMean({ calendar: studyCalendar, ...INFERENCE }, obs); const vb = variance(bt.bootstrap);
        block = { estimate: bt.estimate, ci95: bt.ci, pValue: bt.pValue, occupiedDates: bt.occupiedDates, blockCount: bt.blockCountDiagnostic, bootstrapSE: Math.sqrt(vb), nEffBootstrap: Math.min(obs.length, variance(obs.map(o => o.value)) / vb) };
      } catch (e) { block = { error: String(e.message) }; }
    }
    const H = xv.horizonBars, pos = withB.map(e => ({ t: e.listingId, p: calIndex.get(e.entryDate) }));
    const perTitle = new Map(); for (const x of pos) { if (!perTitle.has(x.t)) perTitle.set(x.t, []); perTitle.get(x.t).push(x.p); }
    const sameTitleOpen = [...perTitle.values()].reduce((n, ps) => { ps.sort((a, b) => a - b); return n + ps.slice(1).filter((p, i) => p - ps[i] < H).length; }, 0);
    const conc = new Map(); for (const x of pos) for (let k = x.p; k < x.p + H; k++) conc.set(k, (conc.get(k) || 0) + 1);
    const byDate = withB.reduce((a, e) => (a[e.signalDate] = (a[e.signalDate] || 0) + 1, a), {});
    const twoWay = S.inference(withB, 'benchmarkExcess');
    const half = (lo, hi) => { const v = withB.filter(e => e.signalDate >= lo && e.signalDate <= hi).map(e => e.benchmarkExcess); return { n: v.length, mean: mean(v), median: med(v) }; };
    const row = { eventKind: kind, entryVariant: ev.id, exitVariant: xv.id, horizonBars: H,
      maturedOutcomes: { expected: cell.length, states, nonObservedReasons: reasons, completed: done.length, completedWithoutBenchmark: done.length - withB.length },
      performance: { n: withB.length, titles: perTitle.size, meanNet: mean(done.map(e => e.netReturn)), medianNet: med(done.map(e => e.netReturn)), meanGross: mean(done.map(e => e.grossReturn)),
        meanBenchmarkExcess: mean(withB.map(e => e.benchmarkExcess)), medianBenchmarkExcess: med(withB.map(e => e.benchmarkExcess)), shareNetPositive: done.length ? done.filter(e => e.netReturn > 0).length / done.length : null,
        shareAboveSpy: withB.length ? withB.filter(e => e.benchmarkExcess > 0).length / withB.length : null, sdBenchmarkExcess: withB.length > 1 ? Math.sqrt(variance(withB.map(e => e.benchmarkExcess))) : null,
        exitReasons: done.reduce((a, e) => (a[e.exitReason] = (a[e.exitReason] || 0) + 1, a), {}), periods: { '2005-2014': half('2005-01-01', '2014-12-31'), '2015-2025': half('2015-01-01', '2025-12-31') } },
      drawdown: { medianMaxDrawdown: med(done.map(e => e.maxDrawdown)), p10MaxDrawdown: (() => { const s = done.map(e => e.maxDrawdown).sort((a, b) => a - b); return s.length ? s[Math.floor(0.1 * (s.length - 1))] : null; })() },
      uncertainty: { calendarBlock: block, twoWayCluster: { se: twoWay.standardError, ci95: twoWay.interval95, timeClusters: twoWay.timeClusters, issuerClusters: twoWay.issuerClusters, state: twoWay.state } },
      independence: { nEffModelRaw: L.nEff(pos, rho.rhoRaw, H).nEff, nEffModelSpyExcess: L.nEff(pos, rho.rhoSpyExcess, H).nEff, nEffModelSpyExcessMaxYearRho: L.nEff(pos, rho.maxYearExcess, H).nEff,
        nEffBootstrap: block?.nEffBootstrap ?? null, nonOverlappingBlocks: L.nonOverlappingBlocks(pos.map(x => x.p), H), disjointWindows: L.disjointWindows(pos.map(x => x.p), H),
        eventDates: Object.keys(byDate).length, maxEventsOnOneDate: Math.max(0, ...Object.values(byDate)), sameTitleOpenWindowEvents: sameTitleOpen, meanConcurrentOpenWindows: conc.size ? mean([...conc.values()]) : null } };
    if (block && Number.isFinite(block.pValue)) pValues.push({ key: kind + '|' + ev.id + '|' + xv.id, p: block.pValue });
    cells.push(row);
  }
  const holmAdj = V.holm(pValues.map(x => x.p));
  pValues.forEach((x, i) => { const c = cells.find(c => c.eventKind + '|' + c.entryVariant + '|' + c.exitVariant === x.key); c.multipleTesting = { family: 16, method: 'HOLM', pRaw: x.p, pHolm: holmAdj[i], rejectAt05: holmAdj[i] <= 0.05 }; });
  const costSensitivity = Object.fromEntries(['LOW', 'HIGH'].map(sc => [sc, Object.fromEntries(ENTRY_KINDS.map(k => { const v = costRuns[sc].filter(e => e.setupState === k && e.completed && e.benchmarkExcess !== null).map(e => e.benchmarkExcess); return [k, { n: v.length, meanBenchmarkExcess: mean(v), medianBenchmarkExcess: med(v) }]; }))]));
  // Kompakte Stichprobe fuer die Python-Gegenrechnung (deterministisch ueber sha256, nicht nach Ergebnis).
  const sample = events.filter(e => e.entryVariant === PRIMARY.entry).map(e => ({ e, h: sha('v10-setup-sample|' + e.listingId + '|' + e.signalDate + '|' + e.exitVariant) }))
    .sort((a, b) => a.h < b.h ? -1 : 1).slice(0, 2000).map(({ e }) => [e.securityId, e.setupState, e.signalDate, e.exitVariant, e.state, e.entryDate, e.exitDate, e.exitReason, e.completed ? +e.grossReturn.toFixed(10) : null, e.completed && e.benchmarkReturn !== null ? +e.benchmarkReturn.toFixed(10) : null]);
  const result = {
    schemaVersion: 'quant-v10-setup-reconstruction-result-1.0.0', studyId: reg.registration.id, ruleVersion: reg.registration.version + ' / setup-mapping-1.0.0 / vu-setup-1.0.0', evidenceKind: 'RECONSTRUCTION',
    registrationHash: reg.registrationHash, registeredAt: reg.registration.registeredAt, inputsSameAsRegistered: sameAsRegistered, loaderOptions,
    dataSource: { states: REPLAY + ' (Produkt-Replay, 160 Titel)', prices: 'createResearchLoader -> quant/data/market/discover-series-long (Wochenschluesse)', benchmark: spyBench.provenance },
    listingIdentity: reg.registration.population.listingIdentity,
    population: { rule: reg.registration.population.rule, frameCount: fr.frame.length, exclusions: Object.fromEntries(Object.entries(fr.excluded).map(([k, v]) => [k, v.length])), listingsWithEntryEvents: new Set(events.map(e => e.securityId)).size, survivorship: reg.registration.population.survivorship },
    inclusions: { eventsInWindow: { SETUP_NEW: counts.SETUP_NEW, SETUP_CONFIRMED: counts.SETUP_CONFIRMED, SETUP_WEAKENED: counts.SETUP_WEAKENED }, excludedSignalDateNotOnFrame: counts.SIGNAL_DATE_NOT_ON_FRAME,
      levelScaleUnprovenListings: counts.levelScaleUnprovenListings, levelExclusions: counts.levelExclusions, listingLifecycle: counts.lifecycle },
    period: { signals: WINDOW, studyCalendar: { length: studyCalendar.length, first: studyCalendar[0], last: studyCalendar.at(-1) }, dataAsOf: asOf },
    availability: reg.registration.states.availability, returnBasis: { PRICE_RETURN: 'gemessen', TOTAL_RETURN: 'NOT_AVAILABLE (Frame ohne Dividenden)' },
    costs: { primary: 'BASE', scenarios: COSTS, sensitivityPrimaryCell: costSensitivity }, benchmark: reg.registration.benchmark,
    independenceModel: { ...reg.registration.independence, rho },
    cells, multipleTesting: { family: pValues.length, method: 'HOLM', rejectionsAt05: cells.filter(c => c.multipleTesting?.rejectAt05).length },
    verificationSample: { columns: ['securityId', 'eventKind', 'signalDate', 'exitVariant', 'state', 'entryDate', 'exitDate', 'exitReason', 'grossReturn', 'benchmarkReturn'], entryVariant: PRIMARY.entry, costsBase: COSTS.BASE, rows: sample },
    certificationStatus: 'NOT_CERTIFIED', productionApproved: false, scope: reg.registration.scope, runtime: C.runtime(), gitHead: gitHead(), code: codeHashes(), runtimeSeconds: Math.round((Date.now() - t0) / 1000) };
  result.reproHash = C.hash({ registrationHash: reg.registrationHash, manifestHash, loaderOptions, code: result.code });
  result.resultHash = C.hash(cells);
  if (priv) fs.writeFileSync(path.join(path.resolve(priv), 'events.json.gz'), zlib.gzipSync(JSON.stringify(events)));
  fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
  const p = cells.find(c => c.eventKind === 'SETUP_CONFIRMED' && c.entryVariant === PRIMARY.entry && c.exitVariant === PRIMARY.exit), q = cells.find(c => c.eventKind === 'SETUP_NEW' && c.entryVariant === PRIMARY.entry && c.exitVariant === PRIMARY.exit);
  console.log(JSON.stringify({ sameAsRegistered, frame: fr.frame.length, events: events.length, rho: [rho.rhoRaw, rho.rhoSpyExcess, rho.titles], confirmed: { n: p.performance.n, ex: p.performance.meanBenchmarkExcess, neff: p.independence }, newSetup: { n: q.performance.n, ex: q.performance.meanBenchmarkExcess, neff: q.independence }, holm: result.multipleTesting, sec: result.runtimeSeconds }));
}

if (require.main === module) {
  const [stage, ...rest] = process.argv.slice(2);
  if (stage === 'register') register(rest); else if (stage === 'run') run(rest); else { console.error('usage: register|run'); process.exit(2); }
}
module.exports = { eventStream, listingOf, ENTRY_VARIANTS, EXIT_VARIANTS, COSTS, WINDOW };
