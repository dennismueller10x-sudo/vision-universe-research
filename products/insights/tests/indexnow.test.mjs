// IndexNow (products/insights/indexnow.mjs): Schlüssel, Vergleich der Sitemaps, Meldung und Einbindung ins Ausrollen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schluessel, sitemapEintraege, geaendert, nutzlast, BASIS, HOST } from '../indexnow.mjs';
import { permitted } from '../../../scripts/vu2/build-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const karte = (eintraege) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${eintraege.map(([u, d]) => `<url><loc>${BASIS}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;

test('IN-1 · genau eine Schlüsseldatei im Wurzelverzeichnis, Inhalt = Name, wird ausgeliefert', () => {
  const key = schluessel();
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(fs.readFileSync(path.join(root, key + '.txt'), 'utf8').trim(), key);
  assert.ok(permitted(key + '.txt'), 'Schlüsseldatei muss in die Pages-Auslieferung');
});

test('IN-2 · Sitemap lesen: Adresse und lastmod, fehlendes lastmod als leer', () => {
  const m = sitemapEintraege(karte([['/insights/', '2026-11-11'], ['/insights/reports/', null]]));
  assert.equal(m.get(BASIS + '/insights/'), '2026-11-11');
  assert.equal(m.get(BASIS + '/insights/reports/'), '');
  assert.equal(sitemapEintraege('').size, 0);
});

test('IN-3 · gemeldet werden nur neue Adressen und geänderte lastmod; ohne Vorstand alle', () => {
  const alt = karte([['/insights/', '2026-11-10'], ['/insights/a/', '2026-11-10'], ['/insights/reports/', null]]);
  const neu = karte([['/insights/', '2026-11-11'], ['/insights/b/', '2026-11-11'], ['/insights/a/', '2026-11-10'], ['/insights/reports/', null]]);
  assert.deepEqual(geaendert(neu, alt), [BASIS + '/insights/', BASIS + '/insights/b/']);
  assert.deepEqual(geaendert(neu, neu), []);
  assert.equal(geaendert(neu, null).length, 4);
  // fremde Hosts nie melden
  assert.deepEqual(geaendert('<url><loc>https://example.com/x/</loc></url>', null), []);
});

test('IN-4 · Nutzlast nach IndexNow-Protokoll mit Schlüssel im Wurzelverzeichnis', () => {
  const body = nutzlast('0123456789abcdef0123456789abcdef', [BASIS + '/insights/']);
  assert.deepEqual(body, { host: HOST, key: '0123456789abcdef0123456789abcdef', keyLocation: `${BASIS}/0123456789abcdef0123456789abcdef.txt`, urlList: [BASIS + '/insights/'] });
  assert.equal(HOST, 'research.visionuniverse.de');
});

test('IN-5 · pages-release meldet nach dem Ausrollen, nur lesend, ohne eigenen Zeitplan', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/pages-release.yml'), 'utf8');
  assert.doesNotMatch(wf, /^\s*schedule:/m);
  assert.match(wf, /indexnow\.mjs vergleichen --neu "\$SITE_ROOT\/insights\/sitemap\.xml"/);
  const job = wf.slice(wf.indexOf('\n  indexnow:'), wf.indexOf('\n  deploy:'));
  assert.match(job, /needs: \[package, deploy\]/);
  assert.match(job, /contents: read/);
  assert.match(job, /LISTE: \$\{\{ needs\.package\.outputs\.indexnow \}\}/);
  assert.doesNotMatch(job.split('run:')[1], /\$\{\{/, 'keine Ausdrücke im Shell-Text (ADR-005)');
  // Der Vergleich steht vor dem Hochladen der Auslieferung, also vor dem Ausrollen.
  assert.ok(wf.indexOf('indexnow.mjs vergleichen') < wf.indexOf('actions/upload-pages-artifact'));
});
