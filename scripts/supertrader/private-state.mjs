#!/usr/bin/env node
/**
 * Supertrader: privater Zustand der Strategie-Ledger (L3, Owner-Linie 05.11.2026, Steuerung bestätigt).
 * Die vollen Ledger (offene Positionen, Einstiege, Stopps, Ausstiege) liegen in der History-Ablage, nicht im Repository.
 *
 *   node scripts/supertrader/private-state.mjs pull --dir DIR   vor dem Lauf: Ablage -> DIR (einmalig Übernahme aus dem
 *                                                               Repository, solange dort noch die vollen Ledger stehen)
 *   node scripts/supertrader/private-state.mjs push --dir DIR   nach Lauf und Tests, VOR dem Commit: DIR -> Ablage
 *
 * Fail closed: fehlt ein privater Ledger, obwohl im Repository schon die öffentliche Sicht steht, bricht der Lauf ab.
 * Die Hausstrategie (VU_HOUSE_HS4_V03) hat ihren eigenen privaten Ledger (house/live.mjs) und ist hier ausgenommen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FULL_LEDGER_SCHEMAS } from './public-signals.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const PRIVATE_PREFIX = 'supertrader-signals/ledger-private-1/';
export const REPO_LEDGER_DIR = path.join(root, 'supertrader/data/ledger');
export const EXCLUDED = Object.freeze(['VU_HOUSE_HS4_V03']);

export function ledgerIds(dir = REPO_LEDGER_DIR) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((id) => !EXCLUDED.includes(id)).sort() : [];
}

/** Entscheidung je Ledger: privater Stand, sonst einmalige Übernahme aus dem vollen Repository-Ledger, sonst Abbruch. */
export function resolveLedger(id, stored, repo) {
  if (stored) { if (!FULL_LEDGER_SCHEMAS.includes(stored.schema)) throw new Error(`${id}: privater Ledger mit unbekanntem Schema ${stored.schema}`); return { ledger: stored, source: 'PRIVATE' }; }
  if (repo && FULL_LEDGER_SCHEMAS.includes(repo.schema)) return { ledger: repo, source: 'MIGRATED_FROM_REPOSITORY' };
  if (repo) throw new Error(`${id}: privater Ledger fehlt, im Repository steht nur die oeffentliche Sicht (${repo.schema}) - Zustand unbekannt, fail closed`);
  return { ledger: null, source: 'NEW' };
}

export async function pull(driver, dir, { repoDir = REPO_LEDGER_DIR, log = console.log } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const id of ledgerIds(repoDir)) {
    const buf = await driver.get(PRIVATE_PREFIX + id + '.json');
    const repoFile = path.join(repoDir, id + '.json');
    const r = resolveLedger(id, buf ? JSON.parse(buf.toString('utf8')) : null, fs.existsSync(repoFile) ? JSON.parse(fs.readFileSync(repoFile, 'utf8')) : null);
    if (r.ledger) fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify(r.ledger) + '\n');
    out[id] = r.source;
  }
  log(`[private-state] pull: ${JSON.stringify(out)}`);
  return out;
}

export async function push(driver, dir, { log = console.log } = {}) {
  const ids = ledgerIds(dir);
  for (const id of ids) {
    const l = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8'));
    if (!FULL_LEDGER_SCHEMAS.includes(l.schema)) throw new Error(`${id}: kein voller Ledger in ${dir} (${l.schema}) - nicht gesichert`);
    await driver.put(PRIVATE_PREFIX + id + '.json', Buffer.from(JSON.stringify(l)), { contentType: 'application/json' });
  }
  log(`[private-state] push: ${ids.length} Ledger gesichert`);
  return ids;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const i = rest.indexOf('--dir'), dir = i >= 0 ? rest[i + 1] : null;
  if (!['pull', 'push'].includes(cmd) || !dir) { console.error('Aufruf: private-state.mjs pull|push --dir DIR'); process.exit(2); }
  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  const driver = createS3DriverFromEnv(process.env);
  await (cmd === 'pull' ? pull(driver, dir) : push(driver, dir));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
