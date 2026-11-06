#!/usr/bin/env node
// Holt die VEROEFFENTLICHTE Watchlist-Uebersicht und die veroeffentlichten Watchlist-Ereignisse von der Seite, damit der
// Release-Bau (scripts/vu2/build-release.mjs) die neue Uebersicht mit der zuletzt ausgelieferten vergleichen kann.
//
//   node scripts/watchlist/fetch-published.mjs --site=https://research.visionuniverse.de --out=<verzeichnis>
//
// Schreibt <out>/summary/meta.json + rows/<shard>.json und, falls vorhanden, <out>/events.json. Nur lesend, ohne Schluessel.
// Fehlt die Uebersicht (erster Lauf, Seite nicht erreichbar), bleibt <out> leer und der Lauf endet mit 0: dann entstehen in
// diesem Release keine Ereignisse (Erstbeobachtung), die Auslieferung selbst bleibt unberuehrt.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';

const SUMMARY = 'core/data/watchlist-summary-v1/', EVENTS = 'core/data/watchlist-events-v1.json';

export async function fetchPublished({site, out, fetchImpl = globalThis.fetch, concurrency = 16, timeoutMs = 20000}) {
  if (!/^https:\/\/[a-z0-9.-]+$/.test(site || '')) throw Error('SITE_INVALID');
  const get = async (rel) => {
    const r = await fetchImpl(site + '/' + rel, {cache: 'no-store', signal: AbortSignal.timeout(timeoutMs)});
    return r.ok ? r.json() : null;
  };
  const put = (rel, obj) => { const p = join(out, rel); mkdirSync(dirname(p), {recursive: true}); writeFileSync(p, JSON.stringify(obj)); };
  const meta = await get(SUMMARY + 'meta.json').catch(() => null);
  if (!meta || !Array.isArray(meta.shards)) return {summary: false, shards: 0, missing: 0, events: false};
  const keys = meta.shards.filter((k) => /^[A-Z0-9_]{1,2}$/.test(k));
  let next = 0, missing = 0;
  await Promise.all(Array.from({length: Math.min(concurrency, keys.length)}, async () => {
    while (next < keys.length) {
      const k = keys[next++];
      const part = await get(SUMMARY + 'rows/' + k + '.json').catch(() => null);
      if (part && part.shard === k) put('summary/rows/' + k + '.json', part); else missing++;
    }
  }));
  put('summary/meta.json', meta);
  const events = await get(EVENTS).catch(() => null);
  if (events && Array.isArray(events.events)) put('events.json', events);
  return {summary: true, shards: keys.length - missing, missing, events: Boolean(events && Array.isArray(events.events))};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
  if (!arg('out')) { console.error('--out=<verzeichnis> fehlt'); process.exit(2); }
  fetchPublished({site: arg('site') || 'https://research.visionuniverse.de', out: arg('out')})
    .then((r) => console.log(JSON.stringify(r)), (e) => { console.log(JSON.stringify({summary: false, error: String(e && e.message || e)})); });
}
