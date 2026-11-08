#!/usr/bin/env node
/**
 * Supertrader: vollen Ledger-Zustand nach dem Rückbau von L2/L3 zurückholen (Owner-Entscheidung 06.11.2026, #1522).
 *
 * Zwischen #1479/#1452 und #1522 stand im Repository nur die öffentliche Sicht der Ledger
 * (Schema supertrader-ledger-public-1.0.0 bzw. Hausstrategie supertrader-house-ledger-2.0.0); der volle Zustand
 * (offene Positionen, Einstiege, Stopps, Ausstiege) lag in der History-Ablage. Der Erzeuger liest seit #1522 wieder
 * den vollen Ledger aus dem Repository. Dieses Skript holt ihn vor dem Lauf genau dann aus der Ablage, wenn im
 * Repository noch die öffentliche Sicht steht. Steht dort schon ein voller Ledger, tut es nichts (idempotent).
 * Fail closed: öffentliche Sicht im Repository, aber kein voller Ledger in der Ablage -> Abbruch.
 *
 *   node scripts/supertrader/restore-full-ledgers.mjs [--dir supertrader/data/ledger]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
export const PUBLIC_SCHEMAS = Object.freeze({ ledger: 'supertrader-ledger-public-1.0.0', house: 'supertrader-house-ledger-2.0.0' });
export const HOUSE_ID = 'VU_HOUSE_HS4_V03';
/* Ablageschlüssel wie in #1479 (private-state.mjs) und #1452 (house/live.mjs). */
export const keyFor = (id) => id === HOUSE_ID ? 'supertrader-house/VU_HOUSE_HS4_V03/ledger-private-1.json' : 'supertrader-signals/ledger-private-1/' + id + '.json';
export const isPublicView = (id, l) => !!l && (id === HOUSE_ID ? l.schema === PUBLIC_SCHEMAS.house : l.schema === PUBLIC_SCHEMAS.ledger);

/** Entscheidung je Ledger: KEEP (voll im Repository), RESTORE (Ablage voll), sonst Fehler. */
export function decide(id, repo, stored) {
  if (!isPublicView(id, repo)) return { action: 'KEEP' };
  if (!stored) throw new Error(`${id}: im Repository steht nur die öffentliche Sicht (${repo.schema}), in der Ablage fehlt der volle Ledger - fail closed`);
  if (isPublicView(id, stored)) throw new Error(`${id}: auch in der Ablage nur die öffentliche Sicht (${stored.schema}) - fail closed`);
  return { action: 'RESTORE', ledger: stored };
}

export async function restore(driver, dir, { log = console.log } = {}) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const id = f.slice(0, -5), p = path.join(dir, f), repo = JSON.parse(fs.readFileSync(p, 'utf8'));
    let stored = null;
    if (isPublicView(id, repo)) { const buf = await driver.get(keyFor(id)); stored = buf ? JSON.parse(buf.toString('utf8')) : null; }
    const d = decide(id, repo, stored);
    if (d.action === 'RESTORE') fs.writeFileSync(p, JSON.stringify(d.ledger, null, 2) + '\n');
    out[id] = d.action;
  }
  log(`[restore-full-ledgers] ${JSON.stringify(out)}`);
  return out;
}

async function main() {
  const i = process.argv.indexOf('--dir'), dir = i >= 0 ? process.argv[i + 1] : path.join(root, 'supertrader/data/ledger');
  const { createS3DriverFromEnv } = await import(path.join(root, 'scripts/market/storage/s3-driver.mjs'));
  await restore(createS3DriverFromEnv(process.env), dir);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
