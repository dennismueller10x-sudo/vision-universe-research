'use strict';
// Strang G Strategie-Labor: Konstanten und vollständiger Variantenkatalog nach docs/research/labor/PROTOKOLL.md.
// Forschung, nicht zertifiziert. Der Katalog ist eingefroren: 78 Varianten, keine weiteren.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '../../..');
const PROTOCOL_FILE = path.join(ROOT, 'docs/research/labor/PROTOKOLL.md');
const PROTOCOL_SHA256 = 'ddf9e9df9b2f227379727c6634db9252659724941972050991eca427409ae768';
const WINDOWS = Object.freeze({
  dev: ['2016-01-01', '2023-12-31'],
  test: ['2024-01-01', '2026-10-02'],
  holdout: ['2008-01-01', '2015-12-31'],
});
// Lernendes Ranking: frühester Trainingsstichtag je Fenster (DEV/TEST ab 2016, Holdout ab 2008).
const TRAIN_START = Object.freeze({ dev: '2016-01-01', test: '2016-01-01', holdout: '2008-01-01' });
const WALK_FORWARD_YEARS = Object.freeze([2018, 2019, 2020, 2021, 2022, 2023]);
const COSTS = Object.freeze({ feeBps: 10, slippageBps: 10, etfHalfSpreadBps: 2 });
const ENGINE_COSTS = Object.freeze({ feeBps: 1, slippageBps: 5 });
const TERMINAL = Object.freeze({ MERGER: 1, UNKNOWN: 0.7, DISTRESS: 0, SERIES_END: 1 });
const TERMINAL_HARSH = Object.freeze({ MERGER: 1, UNKNOWN: 0.3, DISTRESS: 0, SERIES_END: 1 });
const SEED = 20261106, BOOT = 9999, BLOCK = 13, TRIALS = 78;
const MAX_CANDIDATES = 5, MAX_PER_FAMILY = 2, MAX_FINALISTS = 2;

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');
function protocolGuard() {
  const h = sha256(fs.readFileSync(PROTOCOL_FILE));
  if (h !== PROTOCOL_SHA256) throw Error('PROTOCOL_CHANGED ' + h);
  return h;
}

// Aktienstandard je N: VU-Portfolio-Standard 15–30 Titel, Ziel N, 8 %/25 %, Protokollkosten.
const std = n => ({ minPositions: 15, maxPositions: 30, targetPositions: n, feeBps: COSTS.feeBps, slippageBps: COSTS.slippageBps });

function variants() {
  const out = [];
  const stock = (family, id, score, weeks, n, filter = false, extra = {}) =>
    out.push({ id, family, kind: 'stock', score, weeks, n, filter, standard: std(n), ...extra });
  for (const sig of ['M12', 'M6', 'MAVG']) for (const w of [13, 26]) for (const n of [15, 25]) stock('MOM', `MOM-${sig}-W${w}-N${n}`, sig, w, n);
  for (const w of [13, 26]) for (const n of [15, 25]) stock('HI52', `HI52-W${w}-N${n}`, 'HI52', w, n);
  for (const w of [13, 26]) for (const n of [15, 25]) stock('QUAL', `QUAL-W${w}-N${n}`, 'QUAL', w, n);
  for (const w of [13, 26]) for (const n of [15, 25]) stock('VAL', `VAL-W${w}-N${n}`, 'VAL', w, n);
  for (const w of [13, 26]) for (const n of [15, 25]) stock('LVOL', `LVOL-W${w}-N${n}`, 'LVOL', w, n);
  for (const l of [13, 26]) for (const w of [4, 13]) for (const n of [15, 25]) stock('INS', `INS-L${l}-W${w}-N${n}`, 'INS' + l, w, n);
  for (const w of [4, 13]) for (const n of [15, 25]) stock('PEAD', `PEAD-W${w}-N${n}`, 'PEAD', w, n);
  for (const k of ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']) for (const f of [false, true]) for (const w of [13, 26]) stock('KOMBI', `${k}-F${+f}-W${w}-N25`, k, w, 25, f);
  for (const lam of [0.01, 0.1]) for (const n of [15, 25]) stock('LERN', `LERN-L${lam}-N${n}`, 'LERN', 13, n, false, { lambda: lam });
  for (const e of ['E1', 'E2', 'E3', 'E4', 'R1', 'R2', 'S1', 'S2', 'S3', 'S4']) out.push({ id: 'ETF-' + e, family: 'ETF', kind: 'etf', rule: e });
  if (out.length !== TRIALS || new Set(out.map(v => v.id)).size !== TRIALS) throw Error('CATALOG_SIZE ' + out.length);
  return out;
}
// Kombinationen: Bestandteile (Signalschlüssel der Einzelsignale).
const COMBOS = Object.freeze({ K1: ['M12', 'QUAL'], K2: ['M12', 'LVOL'], K3: ['VAL', 'M12', 'QUAL'], K4: ['QUAL', 'LVOL', 'M12'], K5: ['M12', 'QUAL', 'PEAD'], K6: ['QUAL', 'INSFLAG26'] });

module.exports = { ROOT, PROTOCOL_FILE, PROTOCOL_SHA256, WINDOWS, TRAIN_START, WALK_FORWARD_YEARS, COSTS, ENGINE_COSTS, TERMINAL, TERMINAL_HARSH,
  SEED, BOOT, BLOCK, TRIALS, MAX_CANDIDATES, MAX_PER_FAMILY, MAX_FINALISTS, sha256, protocolGuard, variants, COMBOS, std };
