// FUNDAMENTAL – Aktualitaet der SEC-Zahlen (Pruefung, schreibt nur nach --out).
//
// Fundamental baut seine Historie im Release aus den SEC-Verbraucherdateien
// (quant/data/sec/consumer, Erzeuger: .github/workflows/sec-consumer-fundamentals.yml,
// woechentlich). Neue 10-Q/10-K erkennt dagegen schon die taegliche SEC-Pipeline
// (.github/workflows/sec-fundamentals-daily.yml) und haelt sie je Emittent in
// quant/data/fundamentals/daily/state.json fest.
//
// Diese Pruefung vergleicht beides: Welche Unternehmen haben bei der SEC eine
// neuere Quartals- oder Jahresmeldung, als ihre Verbraucherdatei enthaelt?
// Sie rechnet nichts um und liest nur. Der Workflow
// .github/workflows/fundamental-sec-freshness.yml stoesst bei Bedarf den
// bestehenden Erzeuger an (workflow_dispatch) – kein neuer Datenweg, keine
// fremde Datei wird geschrieben.
//
// Aufruf: node scripts/fundamental/sec-freshness.mjs [--root=.] --out=<datei.json>
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = 'vu-fundamental-sec-freshness-1.0.0';
export const PERIODIC = /^(10-K|10-Q|20-F|40-F)/;
const isDate = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Neueste Meldung in einer Verbraucherdatei: {filed, accns:Set}. */
export function consumerLatest(doc) {
  let filed = '', accns = new Set();
  for (const part of ['annual', 'quarterly']) for (const rows of Object.values(doc?.[part] || {})) for (const r of rows) {
    if (Array.isArray(r) && isDate(r[4])) { if (r[4] > filed) filed = r[4]; accns.add(r[5]); }
  }
  for (const t of Object.values(doc?.ttm || {})) if (t && isDate(t.filed) && t.filed > filed) { filed = t.filed; accns.add(t.accn); }
  return { filed: filed || null, accns };
}

/** Unternehmen mit neuerer periodischer SEC-Meldung als in ihrer Verbraucherdatei. */
export function pendingIssuers(state, latestByCik) {
  const out = [];
  for (const [cik, x] of Object.entries(state?.ISSUER_LAST_PROCESSED || {})) {
    const have = latestByCik.get(cik);
    if (!have || !x || !PERIODIC.test(String(x.LATEST_FORM || '')) || !isDate(x.LATEST_FILED_AT)) continue;
    if (have.accns.has(x.LATEST_ACCESSION)) continue;
    if (!have.filed || x.LATEST_FILED_AT > have.filed) out.push({ cik, form: x.LATEST_FORM, filed: x.LATEST_FILED_AT, accession: x.LATEST_ACCESSION, consumerFiled: have.filed });
  }
  return out.sort((a, b) => a.filed.localeCompare(b.filed) || a.cik.localeCompare(b.cik));
}

export async function freshness({ root }) {
  root = resolve(root);
  const dir = join(root, 'quant/data/sec/consumer'), statePath = join(root, 'quant/data/fundamentals/daily/state.json');
  if (!existsSync(dir) || !existsSync(statePath)) throw Error('SOURCE_MISSING');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const latest = new Map();
  let consumerAsOf = null;
  for (const n of (await readdir(dir)).filter((x) => /^CIK\d{10}\.json$/.test(x))) {
    let doc; try { doc = JSON.parse(await readFile(join(dir, n), 'utf8')); } catch { continue; }
    latest.set(n.slice(3, 13), consumerLatest(doc));
    if (isDate(doc.asOf) && (!consumerAsOf || doc.asOf > consumerAsOf)) consumerAsOf = doc.asOf;
  }
  return classify(pendingIssuers(state, latest), { consumerAsOf, state, issuers: latest.size });
}

/** Neu = seit dem letzten Verbraucherlauf eingegangen (ein neuer Lauf uebernimmt sie). Aelter = ein Lauf hatte sie schon
 * und hat sie nicht uebernommen (z. B. ohne verwertbares XBRL in companyfacts) – das ist eine Deckungsluecke, kein Grund,
 * die Pipeline jeden Tag neu zu starten. */
export function classify(pending, { consumerAsOf, state, issuers }) {
  const fresh = pending.filter((x) => !consumerAsOf || x.filed >= consumerAsOf), stale = pending.filter((x) => consumerAsOf && x.filed < consumerAsOf);
  return {
    schema: SCHEMA, checkedAt: new Date().toISOString(), consumerAsOf, secLastCheck: state?.LAST_SEC_CHECK || null, secLastRun: state?.LAST_SUCCESSFUL_RUN || null,
    issuers, pending: fresh.length, oldestPending: fresh[0]?.filed || null, notAdopted: stale.length,
    decision: fresh.length ? 'REFRESH_CONSUMER' : 'CURRENT', items: fresh, notAdoptedItems: stale
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
  const out = arg('out');
  if (!out) { console.error('--out=<datei.json> fehlt'); process.exit(2); }
  const r = await freshness({ root: arg('root') || '.' });
  await writeFile(resolve(out), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ consumerAsOf: r.consumerAsOf, secLastRun: r.secLastRun, issuers: r.issuers, pending: r.pending, oldestPending: r.oldestPending, notAdopted: r.notAdopted, decision: r.decision }));
}
