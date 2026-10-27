#!/usr/bin/env node
'use strict';
// V9 events (workstream D): original 8-K Item 2.02 event study vs pre-registered placebo controls.
// Reuses research-studies.cjs#runEventStudy/inference and research-validation.cjs#holm/inferTemporalBlockMean unchanged.
// Usage: node run-v9-events.cjs <privateDir> <evidenceDir>
//   privateDir (outside repo) must hold population.json, sec-ledger.json, header-parity.json.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = path.resolve(__dirname, '../../../..');
const S = require(path.join(ROOT, 'quant/engines/research-studies.cjs'));
const V = require(path.join(ROOT, 'quant/engines/research-validation.cjs'));
const C = require(path.join(ROOT, 'quant/engines/research-contract.cjs'));
const T = require(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
const REG_PATH = 'docs/quant-recovery/v9/events/registration-retrospective-1.0.0.json';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const HARVEST_FROM = '2025-08-15', WINDOW_FROM_UTC = '2025-09-30T20:00:00.000Z';
const MIC = { NYSE: 'XNYS', NASDAQ: 'XNAS', AMEX: 'XASE', 'NYSE MKT': 'XASE' };
const SEC_EXCHANGE = { NYSE: 'NYSE', AMEX: 'NYSE', 'NYSE MKT': 'NYSE', NASDAQ: 'Nasdaq' };
const HORIZONS = [1, 5, 20], K = 2, CONTROL_SEED = 'V9-EVENTS-CONTROL-1', EXCL = 10;

// Two-sided normal p-value; erfc via series (|x|<2) / Lentz continued fraction (|x|>=2), ~1e-14 abs.
function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) { let sum = 0, term = x, n = 0; while (Math.abs(term) > 1e-17 * Math.abs(sum) || n < 3) { sum += term / (2 * n + 1); n++; term *= -x * x / n; if (n > 200) break; } return 1 - 2 / Math.sqrt(Math.PI) * sum; }
  let f = x, Cc = x, D = 0; const tiny = 1e-300;
  for (let i = 1; i < 500; i++) { const a = i / 2; D = x + a * D; D = Math.abs(D) < tiny ? tiny : D; Cc = x + a / Cc; Cc = Math.abs(Cc) < tiny ? tiny : Cc; D = 1 / D; const d = Cc * D; f *= d; if (Math.abs(d - 1) < 1e-16) break; }
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0; // code-unit order (locale-independent)
const pTwoSided = z => erfc(Math.abs(z) / Math.SQRT2);

// Eastern local digits -> UTC ISO (Intl, no fixed offset).
function easternToUtc(local) {
  const [d, t] = local.slice(0, 19).split('T'), base = Date.parse(d + 'T' + t + 'Z');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (const off of [4, 5]) { const u = base + off * 3600000, p = Object.fromEntries(fmt.formatToParts(new Date(u)).map(x => [x.type, x.value])); if (`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` === d + 'T' + t) return new Date(u).toISOString(); }
  throw Error('UNRESOLVABLE_EASTERN_TIME ' + local);
}
function etParts(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hms: `${p.hour}:${p.minute}:${p.second}` };
}

function main(privDir, evidenceDir) {
  if (!privDir || !evidenceDir) throw Error('USAGE: run-v9-events.cjs <privateDir> <evidenceDir>');
  const priv = path.resolve(privDir); if (priv === ROOT || priv.startsWith(ROOT + path.sep)) throw Error('PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  const ev = path.resolve(evidenceDir); fs.mkdirSync(ev, { recursive: true });
  const runDir = path.join(priv, 'run'); fs.mkdirSync(runDir, { recursive: true });
  const regBytes = fs.readFileSync(path.join(ROOT, REG_PATH)), registrationDoc = JSON.parse(regBytes);
  const registration = { id: registrationDoc.id, version: registrationDoc.version, frozenAt: registrationDoc.frozenAt, analysisMode: registrationDoc.analysisMode, documentSha256: sha(regBytes) };
  const read = f => fs.readFileSync(path.join(priv, f));
  const popB = read('population.json'), ledB = read('sec-ledger.json'), hdrB = read('header-parity.json');
  const pop = JSON.parse(popB), ledger = JSON.parse(ledB), header = JSON.parse(hdrB);
  if (header.conclusion === 'INCONSISTENT' || !(header.byForm['8-K'] >= 200)) throw Error('HEADER_PARITY_NOT_SUFFICIENT ' + header.conclusion);
  ledger.filings.forEach(f => { f.cik = String(f.cik); }); ledger.listings.forEach(l => { l.cik = String(l.cik); });
  const toUtc = raw => header.conclusion === 'SUBMISSIONS_ACCEPTANCE_IS_TRUE_UTC' ? new Date(Date.parse(raw)).toISOString() : easternToUtc(raw);
  const sources = { [REG_PATH]: sha(regBytes), 'private:population.json': sha(popB), 'private:sec-ledger.json': sha(ledB), 'private:header-parity.json': sha(hdrB) };

  // ---- calendar ------------------------------------------------------------------------------
  const calPath = 'quant/config/market-calendar.json', calendarCfg = JSON.parse(fs.readFileSync(path.join(ROOT, calPath)));
  sources[calPath] = C.shaFile(path.join(ROOT, calPath)); sources['quant/engines/realtime/trading-session.js'] = C.shaFile(path.join(ROOT, 'quant/engines/realtime/trading-session.js'));
  const opt = { calendar: calendarCfg, exchange: 'XNYS' };
  const ext = []; for (let t = Date.parse('2025-07-01T00:00:00Z'); t <= Date.parse('2027-06-30T00:00:00Z'); t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); if (T.isTradingDay(d, opt)) { const s = T.sessionFor(d, opt); ext.push({ date: d, open: s.open, close: s.close, closeMs: Date.parse(s.close) }); } }
  const extIdx = new Map(ext.map((s, i) => [s.date, i]));
  const sessionAfter = iso => { const t = Date.parse(iso); let lo = 0, hi = ext.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ext[m].closeMs > t) hi = m; else lo = m + 1; } if (lo >= ext.length) throw Error('EXTENDED_CALENDAR_EXHAUSTED'); return lo; };
  const spyPath = 'quant/data/market/discover-series/ref_SPY.json', spyB = fs.readFileSync(path.join(ROOT, spyPath)), spy = JSON.parse(spyB); sources[spyPath] = sha(spyB);
  const asOf = registrationDoc.engineContract.asOf;
  if (spy.priceSeriesType !== 'SPLIT_ADJUSTED' || spy.grain !== 'daily' || spy.dataMode !== 'real' || spy.currency !== 'USD') throw Error('SPY_SCOPE');
  const calendar = spy.points.filter(([d]) => d <= asOf).map(([d]) => d);
  const expected = ext.filter(s => s.date >= calendar[0] && s.date <= asOf).map(s => s.date);
  if (JSON.stringify(expected) !== JSON.stringify(calendar)) throw Error('SPY_CALENDAR_MISMATCH');
  const calSet = new Set(calendar);
  const bench = { currency: 'USD', returnBasis: 'PRICE_RETURN', bars: spy.points.filter(([d]) => d <= asOf).map(([date, close]) => ({ date, close, closeAt: ext[extIdx.get(date)].close, availableAt: ext[extIdx.get(date)].close })) };
  const spyClose = new Map(spy.points.map(([d, c]) => [d, c]));

  // ---- listings + guards --------------------------------------------------------------------
  const popById = new Map(pop.rows.map(r => [r.securityId, r]));
  const exclusions = [], guardCounts = {};
  const excl = (row, reason) => { exclusions.push({ securityId: row.securityId, ticker: row.ticker, cik: row.cik ?? null, reason }); guardCounts[reason] = (guardCounts[reason] || 0) + 1; };
  for (const r of pop.rows) if (!r.eligible) excl(r, 'POPULATION:' + r.reasons[0].split(':')[0]);
  for (const r of ledger.excluded) excl(r, r.reason);
  const filingsByCik = new Map(); for (const f of ledger.filings) { if (!filingsByCik.has(f.cik)) filingsByCik.set(f.cik, []); filingsByCik.get(f.cik).push(f); }
  const stage = [];
  for (const L of ledger.listings) {
    const p = popById.get(L.securityId), iss = ledger.issuers[L.cik];
    const row = { ...L, listingStart: p.listingStart, mic: MIC[p.exchange] };
    if (SEC_EXCHANGE[p.exchange] !== L.secExchange) { excl(row, 'EXCHANGE_MISMATCH'); continue; }
    if (!iss || iss.state !== 'OK') { excl(row, 'SUBMISSIONS_UNAVAILABLE'); continue; }
    if ((iss.formerNamesInWindow || []).length) { excl(row, 'NAME_CHANGE_IN_WINDOW'); continue; }
    const subTickers = (iss.tickers || []).map(t => t.toUpperCase().replace('.', '-'));
    if (!subTickers.includes(L.ticker.toUpperCase().replace('.', '-'))) { excl(row, 'TICKER_NOT_IN_SUBMISSIONS'); continue; }
    if (p.dailyFrom < p.listingStart) { excl(row, 'DAILY_PRECEDES_LISTING_START'); continue; }
    const dB = fs.readFileSync(path.join(ROOT, p.dailyPath)); if (sha(dB) !== p.dailySha256) throw Error('DAILY_SOURCE_CHANGED ' + p.dailyPath);
    const d = JSON.parse(dB), pts = d.points.filter(([x]) => x <= asOf);
    if (!pts.length || pts.some(([x]) => !calSet.has(x))) { excl(row, 'DATE_OUTSIDE_STUDY_CALENDAR'); continue; }
    stage.push({ ...row, rank: subTickers.indexOf(L.ticker.toUpperCase().replace('.', '-')), pts, iss });
  }
  const byCik = new Map(); for (const s of stage) { const k = String(s.cik); if (!byCik.has(k)) byCik.set(k, []); byCik.get(k).push(s); }
  const retained = [];
  for (const [cik, group] of byCik) {
    group.sort((a, b) => a.rank - b.rank || cmp(a.ticker, b.ticker));
    group.slice(1).forEach(s => excl(s, 'SECONDARY_LISTING_SAME_CIK'));
    const s = group[0], fl = filingsByCik.get(cik) || [];
    const has202 = fl.some(f => f.form === '8-K' && f.item202 && f.acceptanceDateTimeRaw.slice(0, 10) >= HARVEST_FROM && toUtc(f.acceptanceDateTimeRaw) <= asOf + 'T23:59:59.999Z');
    if (!has202) { excl(s, 'NO_ITEM202_REPORTER'); continue; }
    retained.push(s);
  }
  retained.sort((a, b) => cmp(a.securityId, b.securityId));
  const listings = retained.map(s => ({ listingId: s.canonicalId, issuerId: 'CIK' + String(s.cik).padStart(10, '0'), securityId: s.securityId,
    identity: { mic: s.mic, instrumentClass: 'COMMON_STOCK', primary: true, validFrom: s.listingStart, availableAt: pop.masterGeneratedAt || '2026-09-11T14:43:20.305Z', sourceHash: sha(JSON.stringify([s.securityId, s.canonicalId, s.cik])) },
    bars: s.pts.map(([date, close]) => ({ date, close, closeAt: ext[extIdx.get(date)].close, availableAt: ext[extIdx.get(date)].close })) }));
  const listingById = new Map(listings.map(l => [l.listingId, l]));
  const barDates = new Map(listings.map(l => [l.listingId, new Map(l.bars.map(b => [b.date, b.close]))]));

  // ---- events ---------------------------------------------------------------------------------
  const counts = { item202OriginalHarvested: 0, item202AmendHarvested: 0, eightKAmendAnyHarvested: 0, preWindow: 0, gapAfterAsOf: 0, inWindow: 0, sameEntryDuplicate: 0, events: 0 };
  const item202Sessions = new Map(); // cik -> sorted ext indices of any Item 2.02 filing (8-K or 8-K/A)
  const events = [];
  for (const s of retained) {
    const cik = s.cik, fl = filingsByCik.get(cik) || [];
    const idx = [];
    const cand = [];
    for (const f of fl) {
      if (f.form === '8-K/A') counts.eightKAmendAnyHarvested++;
      if (!f.item202) continue;
      const utc = toUtc(f.acceptanceDateTimeRaw), si = sessionAfter(utc); idx.push(si);
      if (f.form === '8-K/A') { counts.item202AmendHarvested++; continue; }
      counts.item202OriginalHarvested++;
      if (utc <= WINDOW_FROM_UTC) { counts.preWindow++; continue; }
      if (utc > asOf + 'T23:59:59.999Z') { counts.gapAfterAsOf++; continue; }
      counts.inWindow++; cand.push({ f, utc, si });
    }
    item202Sessions.set(s.canonicalId, idx.sort((a, b) => a - b));
    cand.sort((a, b) => cmp(a.utc, b.utc) || cmp(a.f.accession, b.f.accession));
    const seen = new Set();
    for (const c of cand) {
      if (seen.has(c.si)) { counts.sameEntryDuplicate++; continue; } seen.add(c.si);
      events.push({ eventId: 'EVT|' + cik.padStart(10, '0') + '|' + c.f.accession, eventType: 'SEC_8K_ITEM_2_02_ORIGINAL', listingId: s.canonicalId,
        occurredAt: /^\d{4}-\d{2}-\d{2}$/.test(c.f.reportDate || '') ? c.f.reportDate : c.f.filingDate, publishedAt: c.utc, availableAt: c.utc,
        sourceHash: sha(JSON.stringify([s.iss.submissionsSha256, c.f.accession, c.f.acceptanceDateTimeRaw])),
        _meta: { cik: cik, ticker: s.ticker, securityId: s.securityId, accession: c.f.accession, acceptanceRaw: c.f.acceptanceDateTimeRaw, acceptanceUtc: c.utc, filingDate: c.f.filingDate, items: c.f.items, entrySession: ext[c.si].date, entryIdx: c.si } });
    }
  }
  events.sort((a, b) => cmp(a.availableAt, b.availableAt) || cmp(a.eventId, b.eventId));
  counts.events = events.length;

  // ---- controls -------------------------------------------------------------------------------
  const controls = [], controlShortfall = [];
  for (const e of events) {
    const si = e._meta.entryIdx, E = ext[si].date, P = ext[si - 1].date;
    const cands = [];
    for (const l of listings) {
      if (l.listingId === e.listingId) continue;
      const bd = barDates.get(l.listingId); if (!bd.has(E) || !bd.has(P)) continue;
      const ix = item202Sessions.get(l.listingId); if (ix.some(j => Math.abs(j - si) <= EXCL)) continue;
      cands.push({ l, r: sha(CONTROL_SEED + '|' + e.eventId + '|' + l.listingId) });
    }
    cands.sort((a, b) => cmp(a.r, b.r));
    if (cands.length < K) controlShortfall.push({ eventId: e.eventId, candidates: cands.length });
    cands.slice(0, K).forEach((c, k) => controls.push({ eventId: 'CTRL|' + e.eventId + '|' + k, eventType: 'CONTROL', listingId: c.l.listingId, occurredAt: e.occurredAt, publishedAt: e.publishedAt, availableAt: e.availableAt,
      sourceHash: sha(CONTROL_SEED + '|' + e.sourceHash + '|' + c.l.listingId), _meta: { parent: e.eventId, k, securityId: c.l.securityId, issuerId: c.l.issuerId, candidates: cands.length } }));
  }

  // ---- engine runs ----------------------------------------------------------------------------
  const strip = x => { const { _meta, ...r } = x; return r; };
  const engineRows = [...events, ...controls].map(strip);
  const results = {};
  for (const h of HORIZONS) {
    const input = { asOf, sourceMode: 'HISTORICAL_SIMULATION', cohortMode: 'CONDITIONAL_CURRENT_CLASSIFICATION', returnBasis: 'PRICE_RETURN', currency: 'USD', registration, horizonBars: h, entryDelayBars: 1,
      costs: registrationDoc.engineContract.costs, expectedCalendar: calendar, listings, events: engineRows, benchmark: bench };
    const t0 = Date.now(); const r = S.runEventStudy(input);
    fs.writeFileSync(path.join(runDir, `engine-result-h${h}.json`), JSON.stringify(r));
    results[h] = { r, ms: Date.now() - t0 };
    console.error(`h=${h} engine rows=${r.events.length} coverage=${JSON.stringify(r.coverage)} ms=${results[h].ms}`);
  }
  const notSubmittedByEngine = engineRows.length - results[1].r.events.length;

  // ---- endpoints --------------------------------------------------------------------------------
  const metaById = new Map([...events, ...controls].map(x => [x.eventId, x._meta]));
  const ctrlByParent = new Map(); for (const c of controls) { if (!ctrlByParent.has(c._meta.parent)) ctrlByParent.set(c._meta.parent, []); ctrlByParent.get(c._meta.parent).push(c.eventId); }
  const endpointRows = {}, stateCounts = {}, perHorizon = {};
  const ar = x => x && x.state === 'OBSERVED' && Number.isFinite(x.benchmarkReturn) ? x.grossReturn - x.benchmarkReturn : null;
  for (const h of HORIZONS) {
    const byId = new Map(results[h].r.events.map(x => [x.eventId, x]));
    const sc = { EVENT: {}, CONTROL: {} };
    for (const x of results[h].r.events) { const g = x.eventId.startsWith('CTRL|') ? 'CONTROL' : 'EVENT'; let st = x.state; const m = metaById.get(x.eventId);
      const entryCal = ext[(g === 'EVENT' ? m.entryIdx : metaById.get(m.parent).entryIdx)].date;
      if (st === 'OBSERVED' && x.entryDate !== entryCal) st = 'ENTRY_SESSION_GAP'; else if (st === 'OBSERVED' && !Number.isFinite(x.benchmarkReturn)) st = 'BENCHMARK_MISSING';
      x._state = st; sc[g][st] = (sc[g][st] || 0) + 1; }
    stateCounts[h] = sc;
    const rowsA = [], rowsB = [], rowsDiff = [], evAbs = [], ctAbs = [];
    for (const e of events) {
      const x = byId.get(e.eventId); if (!x || x._state !== 'OBSERVED') continue;
      const a = ar(x); evAbs.push(Math.abs(a));
      const cs = (ctrlByParent.get(e.eventId) || []).map(id => byId.get(id)).filter(c => c && c._state === 'OBSERVED');
      cs.forEach(c => ctAbs.push(Math.abs(ar(c))));
      const base = { eventId: e.eventId, timeCluster: x.entryDate, issuerId: 'CIK' + e._meta.cik.padStart(10, '0'), entryDate: x.entryDate };
      rowsB.push({ ...base, value: x.benchmarkExcess });
      if (!cs.length) continue;
      rowsA.push({ ...base, value: Math.abs(a) - cs.reduce((s, c) => s + Math.abs(ar(c)), 0) / cs.length, controls: cs.length });
      rowsDiff.push({ ...base, value: a - cs.reduce((s, c) => s + ar(c), 0) / cs.length });
    }
    endpointRows[h] = { A: rowsA, B: rowsB, diff: rowsDiff };
    const inf = rows => { const i = S.inference(rows, 'value'); const z = i.standardError ? i.mean / i.standardError : null; return { ...i, z, pValue: z === null ? null : pTwoSided(z) }; };
    const boot = rows => { const b = V.inferTemporalBlockMean({ calendar, blockLength: 20, minimumBlockLength: 20, replicates: 9999, seed: 20261027, alpha: 0.05, assumption: 'CONDITIONAL_WEAK_STATIONARITY_AND_MIXING' }, rows.map(r => ({ id: r.eventId, date: r.entryDate, value: r.value })));
      const { bootstrap, ...rest } = b; return { ...rest, bootstrapSha256: C.hash(bootstrap) }; };
    perHorizon[h] = { A: { inference: inf(rowsA), bootstrap: boot(rowsA) }, B: { inference: inf(rowsB), bootstrap: boot(rowsB) },
      eventMinusControlSignedAR: inf(rowsDiff), meanAbsAREvents: evAbs.reduce((s, v) => s + v, 0) / evAbs.length, meanAbsARControls: ctAbs.reduce((s, v) => s + v, 0) / ctAbs.length,
      nEventsObserved: evAbs.length, nControlsObserved: ctAbs.length, engineResultHash: results[h].r.resultHash, engineInputHash: results[h].r.inputHash, engineCoverage: results[h].r.coverage };
  }
  const fam = []; for (const ep of ['A', 'B']) for (const h of HORIZONS) fam.push({ endpoint: ep + h, p: perHorizon[h][ep].inference.pValue });
  const adj = V.holm(fam.map(f => f.p)); fam.forEach((f, i) => { f.holm = adj[i]; f.rejectAt05 = adj[i] < 0.05; });
  const a1 = perHorizon[1].A; const ci = a1.bootstrap.ci;
  const methodValidity = a1.inference.mean > 0 && fam[0].holm < 0.05 && ci[0] > 0 ? 'DETECTED' : 'NOT_DETECTED';

  // ---- diagnostics ------------------------------------------------------------------------------
  const pre = { PRE_OPEN: [], REGULAR: [], POST_CLOSE: [], NON_SESSION_DAY: [] }, preRows = [];
  for (const e of events) {
    const m = e._meta, et = etParts(m.acceptanceUtc), sess = extIdx.has(et.date) ? ext[extIdx.get(et.date)] : null;
    const bucket = !sess ? 'NON_SESSION_DAY' : m.acceptanceUtc < sess.open ? 'PRE_OPEN' : Date.parse(m.acceptanceUtc) < sess.closeMs ? 'REGULAR' : 'POST_CLOSE';
    m.bucket = bucket;
    const bd = barDates.get(e.listingId), E = m.entrySession, P = ext[m.entryIdx - 1].date;
    if (bd.has(E) && bd.has(P) && spyClose.has(E) && spyClose.has(P)) { const g = bd.get(E) / bd.get(P) - 1, adjm = g - (spyClose.get(E) / spyClose.get(P) - 1); m.preEntryGross = g; m.preEntryAdj = adjm; pre[bucket].push(adjm); preRows.push(adjm); }
  }
  // Post-registration diagnostic addition (declared, not an endpoint): same pre-entry window for the placebo controls.
  const preCtrl = { PRE_OPEN: [], REGULAR: [], POST_CLOSE: [], NON_SESSION_DAY: [] };
  const evById = new Map(events.map(e => [e.eventId, e]));
  for (const c of controls) { const pe = evById.get(c._meta.parent), m = pe._meta, bd = barDates.get(c.listingId), E = m.entrySession, P = ext[m.entryIdx - 1].date;
    if (bd.has(E) && bd.has(P) && spyClose.has(E) && spyClose.has(P)) preCtrl[m.bucket].push(bd.get(E) / bd.get(P) - 1 - (spyClose.get(E) / spyClose.get(P) - 1)); }
  const summ = a => { if (!a.length) return { n: 0 }; const s = [...a].sort((x, y) => x - y), mean = a.reduce((x, y) => x + y, 0) / a.length, abs = a.reduce((x, y) => x + Math.abs(y), 0) / a.length; return { n: a.length, mean, meanAbs: abs, median: s[(s.length - 1) >> 1], p10: s[Math.floor(0.1 * (s.length - 1))], p90: s[Math.floor(0.9 * (s.length - 1))] }; };
  const h1 = new Map(results[1].r.events.map(x => [x.eventId, x]));
  const absByBucket = {}; for (const b of Object.keys(pre)) absByBucket[b] = summ(events.filter(e => e._meta.bucket === b).map(e => h1.get(e.eventId)).filter(x => x && x._state === 'OBSERVED').map(x => ar(x)));
  const perDate = new Map(); events.forEach(e => perDate.set(e._meta.entrySession, (perDate.get(e._meta.entrySession) || 0) + 1));
  const dateCounts = [...perDate.values()].sort((a, b) => b - a);
  const perIssuer = new Map(); events.forEach(e => perIssuer.set(e._meta.cik, (perIssuer.get(e._meta.cik) || 0) + 1));
  const issuerHist = {}; [...perIssuer.values()].forEach(n => issuerHist[n] = (issuerHist[n] || 0) + 1);
  let overlap20 = 0; for (const [cik] of perIssuer) { const xs = events.filter(e => e._meta.cik === cik).map(e => e._meta.entryIdx).sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 20) overlap20++; }
  const byMonth = {}; events.forEach(e => { const k = e._meta.entrySession.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + 1; });
  const crossOverlap = (() => { // share of events whose 20-bar window overlaps the window of an event on a different entry date
    const xs = [...perDate.keys()].map(d => extIdx.get(d)).sort((a, b) => a - b); let n = 0; for (const e of events) { const i = e._meta.entryIdx; if (xs.some(j => j !== i && Math.abs(j - i) < 20)) n++; } return n / events.length; })();
  const clustering = { entryDates: perDate.size, eventsTop20DatesShare: dateCounts.slice(0, 20).reduce((s, v) => s + v, 0) / events.length, maxEventsOneDate: dateCounts[0], medianEventsPerDate: dateCounts[(dateCounts.length - 1) >> 1],
    issuers: perIssuer.size, eventsPerIssuerHistogram: issuerHist, sameIssuerOverlapping20BarPairs: overlap20, shareEventsWith20BarWindowOverlappingOtherEntryDates: crossOverlap, eventsByEntryMonth: byMonth,
    note: 'Earnings-season concentration: few dates carry most events; overlapping 20-bar windows across dates make the cross-date dependence material, motivating date clustering and 20-session calendar blocks.' };
  // Maturity for events with incomplete horizons
  const immature = {}; for (const h of HORIZONS) { const xs = results[h].r.events.filter(x => x.state === 'IMMATURE'); immature[h] = { n: xs.length, events: xs.filter(x => !x.eventId.startsWith('CTRL|')).length, latestExpectedMaturity: (() => { let m = null; for (const x of xs) { const meta = metaById.get(x.eventId); const ei = x.eventId.startsWith('CTRL|') ? metaById.get(meta.parent).entryIdx : meta.entryIdx; const d = ext[ei + h]?.date; if (d && (!m || d > m)) m = d; } return m; })() }; }

  // ---- outputs ----------------------------------------------------------------------------------
  const deps = Object.fromEntries(['scripts/quant/v9/events/run-v9-events.cjs', 'scripts/quant/v9/events/population.cjs', 'scripts/quant/v9/events/harvest_8k_items.py', 'scripts/quant/v9/events/verify_acceptance_headers.py', 'quant/engines/research-studies.cjs', 'quant/engines/research-validation.cjs', 'quant/engines/research-contract.cjs', 'quant/engines/weekly-real-adapter.cjs', 'quant/engines/realtime/trading-session.js', 'quant/engines/realtime/market-hours.js', 'quant/data/market/security-master/us-security-master.json'].map(p => [p, C.shaFile(path.join(ROOT, p))]));
  const dailyHashes = C.hash(Object.fromEntries(retained.map(s => [s.securityId, pop.rows.find(r => r.securityId === s.securityId).dailySha256])));
  const result = { schemaVersion: 'v9-events-results-1.0.0', registration: { path: REG_PATH, ...registration }, baseline: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), runtime: C.runtime(), generatedAt: new Date().toISOString(), asOf,
    acceptanceClock: { conclusion: header.conclusion, headerSample: header.sampled, headerStates: header.states, interpretation: header.interpretation },
    sources, dependencies: deps, retainedDailySeriesHashesDigest: dailyHashes,
    population: { dailyFiles: pop.dailyFiles, populationEligible: pop.eligible, secMappedListings: ledger.listings.length, retainedListings: listings.length, retainedIssuers: retained.length, exclusionsByReason: guardCounts,
      survivorship: registrationDoc.population.survivorship },
    eventCounts: { ...counts, ledgerEightKOriginal: ledger.counts.eightKOriginal, ledgerEightKAmend: ledger.counts.eightKAmend, ledgerItem202Original: ledger.counts.item202Original, ledgerItem202Amend: ledger.counts.item202Amend,
      controls: controls.length, controlShortfallEvents: controlShortfall.length, engineSkippedAfterAsOf: notSubmittedByEngine },
    stateCounts, immature, perHorizon, holmFamily: fam, methodValidity: { criterion: registrationDoc.inference.methodValidityCriterion, result: methodValidity },
    preEntryMoveMarketAdjusted: { all: summ(preRows), byBucket: Object.fromEntries(Object.entries(pre).map(([k, v]) => [k, summ(v)])), controlsByBucketPostRegistrationDiagnostic: Object.fromEntries(Object.entries(preCtrl).map(([k, v]) => [k, summ(v)])), oneBarARByBucket: absByBucket,
      meaning: 'Last close at/before SEC acceptance -> entry close (first close strictly after acceptance), minus SPY. Large |move| for PRE_OPEN/REGULAR acceptances shows information already priced before the entry close: next-close entry is look-ahead-free relative to acceptance but late relative to the market reaction.' },
    clustering, certification: 'NOT_CERTIFIED', productionApproved: false };
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(result, null, 1));
  fs.writeFileSync(path.join(ev, 'results-retrospective-1.0.0.json'), JSON.stringify(result, null, 1) + '\n');
  // Event ledger: accession + acceptance per event, controls, per-horizon state and AR (derived numbers only).
  const resMaps = Object.fromEntries(HORIZONS.map(h => [h, new Map(results[h].r.events.map(x => [x.eventId, x]))]));
  const ledgerOut = { schemaVersion: 'v9-events-ledger-1.0.0', registrationSha256: registration.documentSha256, resultsGeneratedAt: result.generatedAt,
    columns: ['eventId', 'cik', 'ticker', 'securityId', 'accession', 'acceptanceRaw', 'acceptanceUtc', 'bucket', 'filingDate', 'items', 'entrySession', 'state_h1', 'state_h5', 'state_h20', 'ar_h1', 'ar_h5', 'ar_h20', 'netExcess_h1', 'preEntryAdj', 'controls'],
    events: events.map(e => { const m = e._meta; const st = h => resMaps[h].get(e.eventId); const xs = HORIZONS.map(st);
      return [e.eventId, m.cik, m.ticker, m.securityId, m.accession, m.acceptanceRaw, m.acceptanceUtc, m.bucket, m.filingDate, m.items.join(','), m.entrySession, ...xs.map(x => x?._state ?? 'NOT_SUBMITTED'), ...xs.map(x => x?._state === 'OBSERVED' ? ar(x) : null), xs[0]?._state === 'OBSERVED' ? xs[0].benchmarkExcess : null, m.preEntryAdj ?? null,
        (ctrlByParent.get(e.eventId) || []).map(id => { const c = metaById.get(id); const x = resMaps[1].get(id); return [c.securityId, x?._state, x?._state === 'OBSERVED' ? ar(x) : null]; })]; }),
    exclusions };
  fs.writeFileSync(path.join(ev, 'event-ledger-1.0.0.json.gz'), zlib.gzipSync(JSON.stringify(ledgerOut), { level: 9 }));
  fs.writeFileSync(path.join(runDir, 'events-for-reference.json'), JSON.stringify({ events: events.map(e => ({ eventId: e.eventId, ...e._meta })), controls: controls.map(c => ({ eventId: c.eventId, listingId: c.listingId, ...c._meta })), listings: listings.map(l => ({ listingId: l.listingId, securityId: l.securityId, issuerId: l.issuerId })) }));
  console.log(JSON.stringify({ retainedListings: listings.length, events: events.length, controls: controls.length, stateCounts, holm: fam, methodValidity, A1: perHorizon[1].A.inference, B1: perHorizon[1].B.inference }, null, 1));
}
if (require.main === module) main(process.argv[2], process.argv[3]);
module.exports = { main, erfc, easternToUtc };
