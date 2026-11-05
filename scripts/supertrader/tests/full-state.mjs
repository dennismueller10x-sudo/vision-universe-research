// Voller (privater) Stand für die Integritätstests (L3, Owner-Linie 05.11.2026).
// Im Nachtlauf liegt er in SUPERTRADER_LEDGER_DIR (private-state.mjs pull, build.mjs schreibt full/signals-full.json).
// Ohne ihn (PR-CI nach der Umstellung) prüfen die Tests nur die öffentliche Sicht und überspringen die Integritätsprüfungen.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const DIR = process.env.SUPERTRADER_LEDGER_DIR || null;
const FULL_LEDGER = ['supertrader-ledger-1.0.0', 'supertrader-ledger-trend52-1.0.0'];
const readIf = (p) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

export function fullSignals() {
  const priv = DIR ? readIf(path.join(DIR, 'full', 'signals-full.json')) : null;
  if (priv) return priv;
  const repo = readIf(path.join(ROOT, 'supertrader/data/signals.json'));
  return repo && !repo.publicView ? repo : null;
}
export function fullLedger(id) {
  const priv = DIR ? readIf(path.join(DIR, `${id}.json`)) : null;
  if (priv && FULL_LEDGER.includes(priv.schema)) return priv;
  const repo = readIf(path.join(ROOT, 'supertrader/data/ledger', `${id}.json`));
  return repo && FULL_LEDGER.includes(repo.schema) ? repo : null;
}
export function fullReplay() {
  const priv = DIR ? readIf(path.join(DIR, 'full', 'replay-full.json')) : null;
  if (priv) return priv;
  const repo = readIf(path.join(ROOT, 'supertrader/data/replay.json'));
  return repo && !repo.publicView ? repo : null;
}
export const FULL = !!fullSignals();
export const SKIP_FULL = FULL ? false : 'voller Stand nur im Nachtlauf (privat, L3)';
