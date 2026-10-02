#!/usr/bin/env node
// Supertrader — frei zugaengliche Originalquellen lesen (Runde 8).
//
//   node scripts/supertrader/validation/fetch-sources.mjs --out DIR [--list FILE] [--crawl]
//
// Die Arbeitsumgebung der Entwicklung sperrt die Websites der Trader. Dieser
// Lauf liest sie vom GitHub-Runner aus: oeffentliche Seiten, keine Logins,
// keine Bezahlinhalte, hoeflich (1 Anfrage/Sekunde, eigener User-Agent).
// Die Texte sind urheberrechtlich geschuetzt: sie werden NICHT im oeffentlichen
// Repository abgelegt, sondern nur verschluesselt (Schluessel des Eigentuemers)
// und dienen der internen Regelpruefung. Logs zeigen nur URL, Status, Laenge.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SOURCE_LIST = path.join(root, 'scripts/supertrader/validation/sources-r8.json');

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr|section|article|blockquote)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function linksOf(html, base) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["']([^"'#]+)["']/gi)) {
    try { const u = new URL(m[1], base); if (u.hostname === new URL(base).hostname) out.add(u.href.replace(/\/$/, '/')); } catch { /* ungueltig */ }
  }
  return [...out];
}

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'VisionUniverse-Research/1.0 (method fidelity review; contact info@visionuniverse.de)' }, redirect: 'follow' });
  const type = r.headers.get('content-type') || '';
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type, finalUrl: r.url, buf };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const OUT = arg('--out', '/tmp/sources');
  fs.mkdirSync(OUT, { recursive: true });
  const list = JSON.parse(fs.readFileSync(arg('--list', SOURCE_LIST), 'utf8'));
  const crawl = argv.includes('--crawl');
  const seen = new Set();
  const pages = [];
  const queue = list.urls.map((u) => ({ url: u, depth: 0 }));
  const allow = list.crawlPrefixes || [];
  while (queue.length && pages.length < (list.maxPages || 120)) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const r = await get(url);
      let text = null, links = [];
      if (/pdf/i.test(r.type) || /\.pdf$/i.test(url)) text = `[PDF ${r.buf.length} Byte, base64]\n` + r.buf.toString('base64');
      else { const html = r.buf.toString('utf8'); text = /xml/.test(r.type) && /<urlset|<sitemapindex/.test(html) ? html : htmlToText(html); links = linksOf(html, r.finalUrl); if (/<loc>/.test(html)) links.push(...[...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())); }
      pages.push({ url, finalUrl: r.finalUrl, status: r.status, type: r.type, length: r.buf.length, text, links: links.slice(0, 400) });
      console.log(`${r.status} ${r.buf.length} ${url}`);
      if (crawl && depth < 1) for (const l of links) if (allow.some((p) => l.startsWith(p)) && !seen.has(l)) queue.push({ url: l, depth: depth + 1 });
    } catch (e) {
      pages.push({ url, status: 0, error: String(e?.message || e) });
      console.log(`ERR ${url}`);
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  const result = { schema: 'supertrader-sources-r8-1.0.0', at: new Date().toISOString(), commit: process.env.GITHUB_SHA || null, pages };
  const pem = fs.readFileSync(path.join(root, 'scripts/supertrader/validation/results-public-key.pem'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'sources-r8.sealed.json'), L.encryptForOwner(pem, Buffer.from(JSON.stringify(result))));
  console.log(`Seiten ${pages.length}, verschluesselt abgelegt`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
