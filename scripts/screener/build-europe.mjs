#!/usr/bin/env node
// Europa-Universum des Screeners (Strang M, 08.11.2026): einfache Kursspalten aus den
// veröffentlichten Europa-Schlusskursen (discover/data/europe). Gebaut bei der Veröffentlichung
// wie universe-US_REAL.json (scripts/vu2/build-release.mjs); nichts davon wird committet.
// Rechenregel und Schwellen: screener/europe-close-metrics.js. Kein Anbieterabruf, kein Fachmodell.
// Aufruf: node scripts/screener/build-europe.mjs [--root=.] [--out=screener/data]
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Calendar = require('../../core/europe-exchange-calendar.js');
const Metrics = require('../../screener/europe-close-metrics.js');

export const SCHEMA = 'vu-screener-europe-1';
const FIELDS = ['price', 'r1m', 'r3m', 'r6m', 'r1y', 'fromHigh52w', 'vsSma50', 'coverage1y'];

async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
function shift(date, days) { return new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10); }

export async function buildEurope({ root = process.cwd() } = {}) {
  const base = join(root, 'discover/data/europe');
  const manifest = await json(join(base, 'manifest.json'));
  const catalog = await json(join(base, 'catalog.json'));
  if (manifest.publicationAllowed !== true || catalog.publicationAllowed !== true) throw Error('EUROPE_PUBLICATION_NOT_ALLOWED');
  const blocked = new Set((manifest.publication?.blocked || []).map((b) => b.securityId));
  const rows = [], reasons = {};
  for (const s of catalog.securities) {
    if (blocked.has(s.securityId)) continue;
    const l = s.listings[0];
    const long = join(base, 'series-long', s.securityId + '.json'), short = join(base, 'series', s.securityId + '.json');
    const path = existsSync(long) ? long : existsSync(short) ? short : null;
    if (!path) continue;
    const series = await json(path);
    if (series.securityId !== s.securityId || series.currency !== l.currency || (series.quoteUnit && series.quoteUnit !== l.currency)) continue;
    const points = series.points || [];
    const last = points.length ? points[points.length - 1][0] : null;
    if (!last) continue;
    const expected = Calendar.sessions(l.mic, shift(last, -420), last).map((x) => x.date);
    const m = Metrics.compute(points, expected);
    if (m.values.price === null) continue;
    Object.values(m.reasons).forEach((r) => { reasons[r] = (reasons[r] || 0) + 1; });
    const ia = l.identityAdmission || {};
    rows.push({
      securityId: s.securityId, name: s.name, ticker: s.ticker, isin: s.isin,
      country: ia.issuerCountry || l.country || null, mic: l.mic, currency: l.currency, asOf: last,
      indexes: (s.indexes || []).map((x) => x.index),
      logoKey: s.logo && s.logo.status === 'LOGO_VALID' ? s.logo.key : null,
      href: '/discover/#/s/EUROPE/' + encodeURIComponent(s.securityId),
      ...Object.fromEntries(FIELDS.map((f) => [f, m.values[f] ?? null])),
    });
  }
  const asOf = rows.map((r) => r.asOf).sort().at(-1) || null;
  const filled = Object.fromEntries(FIELDS.map((f) => [f, rows.filter((r) => r[f] !== null).length]));
  return {
    schema: SCHEMA, universeId: 'EUROPE', universeLabel: 'Europäische Aktien', asOf, count: rows.length,
    blocked: blocked.size, basis: 'RAW_UNADJUSTED', rule: Metrics.RULE, metricsVersion: Metrics.VERSION,
    catalogSha256: manifest.catalog?.sha256 || null, coverage: filled, emptyReasons: reasons, rows,
  };
}

export async function writeEurope({ root = process.cwd(), out, log = console.log } = {}) {
  const data = await buildEurope({ root });
  const target = resolve(out || join(root, 'screener/data'));
  await mkdir(target, { recursive: true });
  const bytes = Buffer.from(JSON.stringify(data));
  await writeFile(join(target, 'universe-EUROPE.json'), bytes);
  log(`geschrieben: ${join(target, 'universe-EUROPE.json')} (${data.count} Aktien, ${(bytes.length / 1024).toFixed(0)} KiB)`);
  return { count: data.count, bytes: bytes.length, asOf: data.asOf, coverage: data.coverage };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => process.argv.find((a) => a.startsWith('--' + k + '='))?.slice(k.length + 3);
  const r = await writeEurope({ root: arg('root') || process.cwd(), out: arg('out') });
  console.log(JSON.stringify(r));
}
