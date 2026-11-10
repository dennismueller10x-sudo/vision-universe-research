// PIT-, Identitäts- und Provenienzvertrag (Strang U, Teil 1). Reine Schattenprüfung mit synthetischen, gepinnten Fällen:
// keine Produktionsdaten, keine Änderung an Engines, Scores oder Golden-Hashes. Die Vertragsmatrix steht im Quant-Handover (§ PIT-Vertrag).
//
// Prüfregel in jedem Fall: Eine nur künftige Information (Filing, Restatement, Delisting, SIC-Wechsel, Ticker-Neuvergabe,
// Split) verändert keine frühere Entscheidung. Wo der Code das NICHT einhält, steht ein Befund-Test (Name beginnt mit
// "BEFUND"), der das heutige Verhalten pinnt. Er repariert nichts: eine Fachmodell-Änderung braucht einen eigenen PR mit Vorher/Nachher.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PIT = require('../engines/pit-fundamental-history.js');
const PF = require('../engines/portfolio-pit-factors.cjs');
const PB = require('../engines/portfolio-backtest.cjs');
const ID = require('../../core/identity.js');
const IC = require('../../core/industry-classification.js');

// Spalten wie im Verbraucher-Bundle: [fy, fp, end, v, filed, accn, derived].
const row = (fy, end, v, filed, accn = 'a' + fy) => [fy, 'FY', end, v, filed, accn, 0];
const bundleOf = (annual) => ({ annual });
const deepCopy = (x) => JSON.parse(JSON.stringify(x));

// Gemeinsame Basis: FY2021 und FY2022 abgelegt, FY2023 (Ende 2023-12-31) kommt später dazu.
const base = () => bundleOf({
  revenue: [row(2020, '2020-12-31', 80, '2021-02-20'), row(2021, '2021-12-31', 100, '2022-02-20'), row(2022, '2022-12-31', 120, '2023-02-20')],
  net_income: [row(2022, '2022-12-31', 12, '2023-02-20')],
  gross_profit: [row(2022, '2022-12-31', 60, '2023-02-20')],
  total_assets: [row(2022, '2022-12-31', 400, '2023-02-20')],
  stockholders_equity: [row(2022, '2022-12-31', 200, '2023-02-20')],
  shares_outstanding: [row(2022, '2022-12-31', 10, '2023-02-20')],
});

// Hilfsprüfung: `after(bundle)` bringt Information, die erst NACH dem Entscheidungstag bekannt wird. Die Entscheidung bleibt gleich.
function assertNoLookahead(decide, mutateFuture) {
  const before = decide(base());
  const mutated = base(); mutateFuture(mutated);
  assert.deepEqual(decide(mutated), before);
  return before;
}

// ---------- Fundamentaldaten: Zeitvertrag filed ----------

test('PIT-01 verspätetes Filing: ein nach dem Entscheidungstag eingereichtes Jahr bleibt unsichtbar', () => {
  // FY2023 endet 2023-12-31, wird aber erst am 2024-03-30 eingereicht (verspätet). Entscheidung am 2024-03-15.
  const decide = (b) => PIT.featuresAt(b, '2024-03-15');
  const f = assertNoLookahead(decide, (b) => {
    b.annual.revenue.push(row(2023, '2023-12-31', 999, '2024-03-30'));
    b.annual.net_income.push(row(2023, '2023-12-31', -500, '2024-03-30'));
  });
  assert.equal(f.visibleFiscalYears, 3);
  assert.equal(f.profitableLastYear, true);
});

test('PIT-02 Stichtagsgrenze: PIT inklusive Stichtag, Portfolio-Faktoren strikt davor (Variante, konservativ)', () => {
  const b = base(); b.annual.revenue.push(row(2023, '2023-12-31', 150, '2024-02-20'));
  b.annual.shares_outstanding.push(row(2023, '2023-12-31', 11, '2024-02-20'));
  // pit-fundamental-history: filed <= asOf. Am Filingtag selbst sichtbar.
  assert.equal(PIT.latest(b, 'revenue', '2024-02-20'), 150);
  assert.equal(PIT.latest(b, 'revenue', '2024-02-19'), 120);
  // portfolio-pit-factors: Stichtag t sieht nur filed < t (asOf = Vortag). Am Filingtag selbst noch das alte Jahr.
  assert.equal(PF.fundamentalFactors(b, '2024-02-20', 10).fundamentalsAsOfEnd, '2022-12-31');
  assert.equal(PF.fundamentalFactors(b, '2024-02-21', 10).fundamentalsAsOfEnd, '2023-12-31');
});

test('PIT-03 Restatement: spätere Korrektur desselben Geschäftsjahres wirkt nicht rückwärts', () => {
  const decide = (b) => PIT.latest(b, 'revenue', '2023-06-01');
  const v = assertNoLookahead(decide, (b) => b.annual.revenue.push(row(2022, '2022-12-31', 90, '2024-02-20', 'a2022r')));
  assert.equal(v, 120);
  // Nach der Korrektur ist der neue Wert sichtbar, davor nicht.
  const b = base(); b.annual.revenue.push(row(2022, '2022-12-31', 90, '2024-02-20', 'a2022r'));
  assert.equal(PIT.latest(b, 'revenue', '2024-02-20'), 90);
  assert.equal(PIT.latest(b, 'revenue', '2024-02-19'), 120);
});

test('PIT-04 Restatement am Stichtag: Faktoren sehen die alte Fassung, bis der Tag vorbei ist', () => {
  const b = base(); b.annual.net_income.push(row(2022, '2022-12-31', -3, '2023-09-01', 'a2022r'));
  const at = (d) => PF.fundamentalFactors(b, d, 10);
  assert.equal(at('2023-09-01').netMargin, 12 / 120);
  assert.equal(at('2023-09-02').netMargin, -3 / 120);
});

test('PIT-05 Aktienzahl: spätere Anzahl ändert die Marktkapitalisierung eines früheren Stichtags nicht', () => {
  const decide = (b) => PF.fundamentalFactors(b, '2023-06-01', 50).marketCap;
  const mc = assertNoLookahead(decide, (b) => b.annual.shares_outstanding.push(row(2023, '2023-12-31', 14, '2024-02-20')));
  assert.equal(mc, 500);
  // Frischegrenze: Aktienzahl, deren Geschäftsjahr mehr als 548 Tage zurückliegt, liefert keine Marktkapitalisierung.
  assert.equal(PF.fundamentalFactors(base(), '2024-07-15', 50).marketCap, null);
});

test('PIT-06 Split nach t: eine später skalierte Historie ändert Momentum und Risiko vor dem Split nicht', () => {
  const n = 70, adj = Array.from({ length: n }, (_, i) => 100 * Math.exp(0.004 * i + 0.03 * Math.sin(i)));
  const t = 60;
  const before = PF.priceFactors(adj, t);
  // 2:1-Split bei Index 65: die adjustierte Reihe halbiert alle Werte davor. Einträge bis t werden gleichmäßig skaliert.
  const rescaled = adj.map((x, i) => (i < 65 ? x / 2 : x));
  const after = PF.priceFactors(rescaled, t);
  assert.ok(Math.abs(after.momentum12_1 - before.momentum12_1) < 1e-12);
  assert.ok(Math.abs(after.negVol52 - before.negVol52) < 1e-12);
  // Die Marktkapitalisierung nimmt den Rohschluss (ADR-002), nie den adjustierten: die Aktienzahl ist die damals gemeldete.
  assert.equal(PF.fundamentalFactors(base(), '2023-06-01', 80).marketCap, 800);
});

test('PIT-07 unbekanntes Einreichungsdatum: eine Zeile ohne filed ist nie sichtbar', () => {
  const b = base(); b.annual.revenue.push([2023, 'FY', '2023-12-31', 999, null, 'x', 0], [2024, 'FY', '2024-12-31', 999, undefined, 'y', 0]);
  assert.equal(PIT.latest(b, 'revenue', '2030-01-01'), 120);
  assert.equal(PIT.firstFiled(b), '2021-02-20');
});

test('BEFUND PIT-F1 gleiches Einreichungsdatum, zwei Werte: die Eingabereihenfolge entscheidet (Gleichstand ohne Regel)', () => {
  // 10-K und 10-K/A am selben Tag mit verschiedenem Wert. visibleAnnual nimmt bei Gleichstand die zuerst gelistete Zeile.
  const a = row(2022, '2022-12-31', 120, '2023-02-20', 'orig'), b = row(2022, '2022-12-31', 90, '2023-02-20', 'amend');
  const x = bundleOf({ revenue: [a, b] }), y = bundleOf({ revenue: [b, a] });
  assert.equal(PIT.latest(x, 'revenue', '2023-03-01'), 120);
  assert.equal(PIT.latest(y, 'revenue', '2023-03-01'), 90);
  // Das ist eine echte Determinismus-Lücke (kein Lookahead): dieselbe Wahrheit, andere Entscheidung je nach Sortierung des Erzeugers.
});

// ---------- Branchenklassifikation: knownAt mit Uhrzeit ----------

const sicData = (obs) => ({ issuers: { '0000000001': { observations: obs, runs: [] } }, codes: { 3571: { description: 'Computers' }, 7372: { description: 'Software' } } });
const O = (knownAt, sic, flag) => [knownAt, sic, 'acc-' + knownAt, '10-K', 'H', 'S', flag || null];

test('PIT-08 Branchenwechsel: eine spätere SIC verändert keine frühere Zuordnung', () => {
  const old = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571')]));
  const next = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571'), O('2022-03-10T21:30:00Z', '7372')]));
  const a = old.getIndustryClassification('1', '2021-06-30');
  const b = next.getIndustryClassification('1', '2021-06-30');
  assert.equal(a.sic, '3571');
  assert.deepEqual({ ...b, datasetObservedThrough: null }, { ...a, datasetObservedThrough: null });
  assert.equal(next.getIndustryClassification('1', '2022-03-11').sic, '7372');
});

test('PIT-09 Handelsschluss 16:00 ET: Filing nach Schluss zählt erst ab dem nächsten Datum (Winter- und Sommerzeit)', () => {
  // 2022-03-10 liegt in EST (16:00 ET = 21:00Z), 2022-07-11 in EDT (16:00 ET = 20:00Z).
  const winter = IC.create(sicData([O('2022-03-02T14:00:00Z', '3571'), O('2022-03-10T21:30:00Z', '7372')]));
  assert.equal(winter.getIndustryClassification('1', '2022-03-10').sic, '3571');
  assert.equal(winter.getIndustryClassification('1', '2022-03-11').sic, '7372');
  const summer = IC.create(sicData([O('2022-07-01T14:00:00Z', '3571'), O('2022-07-11T19:30:00Z', '7372')]));
  assert.equal(summer.getIndustryClassification('1', '2022-07-11').sic, '7372');
  const late = IC.create(sicData([O('2022-07-01T14:00:00Z', '3571'), O('2022-07-11T20:30:00Z', '7372')]));
  assert.equal(late.getIndustryClassification('1', '2022-07-11').sic, '3571');
});

test('PIT-10 vor der ersten Beobachtung: UNKNOWN, nie die heutige SIC als Ersatz', () => {
  const m = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571')]));
  const r = m.getIndustryClassification('1', '2019-12-31');
  assert.equal(r.status, 'UNKNOWN_BEFORE_FIRST_OBSERVATION');
  assert.equal(r.sic, null);
  assert.equal(m.getIndustryClassification('2', '2021-01-01').status, 'UNKNOWN_NO_OBSERVATIONS');
});

test('PIT-11 Fortschreibung ist eine Annahme: ohne maxAgeDays und assumptionRef nicht deklariert, mit Grenze STALE', () => {
  const m = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571')]));
  const bare = m.getIndustryClassification('1', '2024-01-01');
  assert.equal(bare.carryForward.declared, false);
  assert.equal(bare.interval.kind, 'INFERRED_INTERVAL');
  assert.equal(bare.interval.validFrom, null);
  assert.equal(m.getIndustryClassification('1', '2024-01-01', { maxAgeDays: 365, assumptionRef: 'A-1' }).status, 'STALE');
  assert.equal(m.getIndustryClassification('1', '2020-06-01', { maxAgeDays: 365, assumptionRef: 'A-1' }).carryForward.declared, true);
});

test('PIT-12 Widerspruch am selben knownAt: CONFLICT ohne SIC', () => {
  const m = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571'), O('2020-03-02T14:00:00Z', '7372')]));
  const r = m.getIndustryClassification('1', '2021-01-01');
  assert.equal(r.status, 'CONFLICT'); assert.equal(r.sic, null);
});

// ---------- Identität: Ticker, CIK, Listing-Intervall ----------

test('PIT-13 Tickerwechsel: securityId ist tickerabgeleitet und bricht, die CIK-Brücke hält (Befund-Pinning)', () => {
  // Derselbe Emittent (CIK 1) hieß bis 2021-10-27 ZZFB, danach ZZMT.
  assert.notEqual(ID.securityIdForTicker('ZZFB'), ID.securityIdForTicker('ZZMT'));
  const cands = [{ cik: '1', evidence: 'ticker-change-8K', validFrom: '2012-05-18', validTo: '2021-10-27' }, { cik: '1', evidence: 'ticker-change-8K', validFrom: '2021-10-28' }];
  const early = IC.resolveIssuer(cands, '2015-01-02'), late = IC.resolveIssuer(cands, '2023-01-02');
  assert.equal(early.issuerId, 'iss_cik_0000000001');
  assert.equal(late.issuerId, early.issuerId);
  // Konsequenz: Reihen unter securityId sind über den Wechsel nicht verbunden; Verbindung nur über issuerId/CIK.
  const m = IC.create(sicData([O('2020-03-02T14:00:00Z', '3571')]));
  assert.equal(m.getIndustryClassification(early.issuerId, '2021-01-01').sic, m.getIndustryClassification(late.issuerId, '2021-01-01').sic);
});

test('PIT-14 Ticker-Wiederverwendung: gleiche securityId für zwei Emittenten, Listing-Intervall trennt sie', () => {
  assert.equal(ID.securityIdForTicker('ZZRE'), ID.securityIdForTicker('zzre'));
  const a = { cik: '1', evidence: 'A', validTo: '2015-06-30' }, bNew = { cik: '2', evidence: 'B', validFrom: '2016-01-01' };
  // Entscheidung 2014: gleich mit und ohne die spätere Neuvergabe.
  assert.deepEqual(IC.resolveIssuer([a], '2014-05-05'), IC.resolveIssuer([a, bNew], '2014-05-05'));
  assert.equal(IC.resolveIssuer([a, bNew], '2018-05-05').cik, '0000000002');
  // Lücke zwischen den Intervallen und fehlende Intervalle: IDENTITY_HOLD, nie geraten.
  assert.equal(IC.resolveIssuer([a, bNew], '2015-09-01').reason, 'OUTSIDE_EVIDENCED_WINDOW');
  const open = [{ cik: '1', evidence: 'A' }, { cik: '2', evidence: 'B' }];
  assert.equal(IC.resolveIssuer(open, '2018-05-05').reason, 'AMBIGUOUS_CIK');
  assert.equal(IC.resolveIssuer([], '2018-05-05').reason, 'NO_CIK');
});

// ---------- Walk-forward-Entscheidung (portfolio-backtest#decide) ----------

function panelOf({ weeks = 70, n = 12, sectorOf = (i) => 'S' + (i % 4) } = {}) {
  const cal = Array.from({ length: weeks }, (_, i) => new Date(Date.parse('2020-01-03T00:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10));
  const path = (i) => Array.from({ length: weeks }, (_, k) => 50 * (1 + 0.002 * (i + 1)) ** k * (1 + 0.02 * Math.sin(k * (i + 2))));
  const securities = Array.from({ length: n }, (_, i) => { const adj = path(i); return { id: 'S' + String(i).padStart(2, '0'), sector: sectorOf(i), mic: 'XNAS', adj, raw: adj.slice(), dv: adj.map(() => 5e7), bundle: null, terminal: null }; });
  return { calendar: cal, basis: 'TOTAL_RETURN', benchmark: { label: 'B', levels: cal.map((_, i) => 100 + i), sourceHash: 'a'.repeat(64) }, securities, provenance: {} };
}
const CFG = { profileId: 'momentum-leader', profileFamilies: ['momentum', 'risk'], riskWindowWeeks: 10, candidatePool: 90, weighting: 'EQUAL',
  standard: { minPositions: 4, maxPositions: 8, targetPositions: 8, maxPositionWeight: 0.25, maxSectorWeight: 0.5 }, rebalanceWeeks: 4, initialCapital: 1e6, foldYears: 3, terminalRecovery: { MERGER: 1 } };
const std = () => require('../engines/portfolio-construction.cjs').standardOf(CFG.standard);
const decideAt = (panel, t) => { const { built, ...rest } = PB.decide(panel, t, CFG, std()); return { ...rest, weights: built.weights, state: built.state }; };

test('PIT-15 Walk-forward: Kurse nach dem Entscheidungstag verändern die Entscheidung nicht', () => {
  const t = 60, p1 = panelOf(), p2 = panelOf();
  for (const s of p2.securities) for (let k = t + 1; k < s.adj.length; k++) { s.adj[k] *= 3; s.raw[k] *= 3; s.dv[k] = 1; }
  assert.deepEqual(decideAt(p2, t), decideAt(p1, t));
  assert.equal(decideAt(p1, t).state, 'CONSTRUCTED');
});

test('PIT-16 Delisting: ein erst nach t bekanntes Ende ändert die Entscheidung nicht, ein Ende vor t schließt aus', () => {
  const t = 60, plain = decideAt(panelOf(), t);
  const later = panelOf(); later.securities[3].terminal = { lastIdx: 66, kind: 'MERGER' };
  assert.deepEqual(decideAt(later, t), plain);
  const earlier = panelOf(); earlier.securities[3].terminal = { lastIdx: 55, kind: 'MERGER' };
  assert.equal(decideAt(earlier, t).universe, plain.universe - 1);
});

test('PIT-17 Fundamental-Lookahead im Panel: Filing nach t wirkt nicht auf Faktoren und Profilscore', () => {
  const t = 60, mk = (extra) => {
    const p = panelOf(); const date = p.calendar[t];
    p.securities.forEach((s) => { s.bundle = bundleOf({ revenue: [row(2018, '2018-12-31', 80, '2019-02-20'), row(2019, '2019-12-31', 100, '2020-02-20')], shares_outstanding: [row(2019, '2019-12-31', 10, '2020-02-20')] }); });
    if (extra) p.securities.forEach((s) => { s.bundle.annual.revenue.push(row(2020, '2020-12-31', 1, '2020-03-30')); s.bundle.annual.shares_outstanding.push(row(2020, '2020-12-31', 99, '2020-03-30')); });
    return { p, date };
  };
  // Stichtag 2020-02-14 (Wochenschluss): das FY2020-Filing vom 2020-03-30 liegt in der Zukunft.
  const a = mk(false), b = mk(true), early = PF.fundamentalFactors(a.p.securities[0].bundle, '2020-02-14', 50), early2 = PF.fundamentalFactors(b.p.securities[0].bundle, '2020-02-14', 50);
  assert.deepEqual(early2, early);
  assert.equal(early.fundamentalsAsOfEnd, '2018-12-31');
});

test('BEFUND PIT-F2 Branche im Panel ist heutig (CURRENT_SIC_CLASSIFICATION_NOT_HISTORICAL): eine spätere Umklassifizierung ändert frühere Entscheidungen', () => {
  const t = 60, p1 = panelOf(), p2 = panelOf({ sectorOf: () => 'S0' });
  // Gleiche Kurse, nur das Branchenetikett (heutiger Stand) unterscheidet sich: die Auswahl hängt davon ab (Branchengrenze).
  assert.notDeepEqual(decideAt(p2, t).weights, decideAt(p1, t).weights);
  // portfolio-backtest.cjs listet das offen: CURRENT_SIC_CLASSIFICATION_NOT_HISTORICAL. core/industry-classification.js kann es lösen, ist aber nicht angeschlossen.
});

test('BEFUND PIT-F3 Universum ist heutige Dateimenge (kein Listing-Intervall im Panel): Titel ohne Delisting-Angabe werden an der letzten Beobachtung beendet', () => {
  const p = panelOf(); p.securities[0].adj = p.securities[0].adj.map((x, i) => (i > 40 ? NaN : x)); // Reihe endet bei 40
  // decide kennt nur Kurs zu t: die Reihe ist bei t=60 leer, der Titel fällt heraus. Ein Ticker, dessen Reihe später unter anderer Identität weiterläuft, ist nicht verbunden.
  const t = 60; assert.equal(decideAt(p, t).universe, decideAt(panelOf(), t).universe - 1);
});

// ---------- Vertragsmatrix (maschinenlesbar, gepinnt) ----------

test('PIT-18 Vertragsmatrix: Versionen und Stichtagssemantik der vier Module sind gepinnt', () => {
  assert.equal(PIT.VERSION, 'pit-fundamental-history-1.0.0');
  assert.equal(PF.VERSION, 'portfolio-pit-factors-1.0.0');
  assert.equal(IC.VERSION, 'core-industry-classification-1.0.0');
  assert.equal(ID.VERSION, 'core-identity-1.0.0');
  // Stichtagssemantik: Datum -> Cutoff
  assert.equal(IC.cutoffOf('2022-03-10').cutoff, '2022-03-10T21:00:00Z');
  assert.equal(IC.cutoffOf('2022-07-11').cutoff, '2022-07-11T20:00:00Z');
  assert.equal(PF.MAX_FUNDAMENTAL_AGE_DAYS, 548);
  // Identität: nur der Ticker bestimmt die securityId; keine Zeit, keine CIK.
  assert.equal(ID.securityIdForTicker('BRK.B'), 'ref_BRK_B');
  assert.equal(ID.securityIdForTicker.length, 1);
});
